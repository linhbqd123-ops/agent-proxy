import { request as undiciRequest } from 'undici';
import { PassThrough } from 'stream';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { insertLog, getStats } from './db.js';
import { broadcast } from './websocket.js';
import {
  log,
  logIncomingRequest,
  logUpstreamResponse,
  logBodyCapture,
  logFinish,
  logError,
  logPrettyJson,
  logPrettyBody,
} from './logger.js';
//

// ─────────────────────────────────────────────────────────────────────────────
// When Copilot uses debug.overrideProxyUrl it replaces the API base URL,
// so requests arrive as  GET /v1/models  with  Host: localhost:4000.
// We need to know the *real* upstream host to forward to.
// Override via env:  UPSTREAM_HOST=api.githubcopilot.com
// ─────────────────────────────────────────────────────────────────────────────
const UPSTREAM_HOST = process.env.UPSTREAM_HOST ?? 'api.githubcopilot.com';

const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|::1)(:\d+)?$/;

// Max bytes of response body stored in DB (5 MB). Streaming SSE can be huge.
const MAX_BODY_LOG_BYTES = 5 * 1024 * 1024;

// Headers that must not be forwarded (hop-by-hop)
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'proxy-connection',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Parse body as JSON if possible, otherwise return as string
// ─────────────────────────────────────────────────────────────────────────────
function parseBodyContent(body: Buffer | null | string): string | object | null {
  if (!body) return null;

  const bodyStr = typeof body === 'string' ? body : body.toString('utf-8');
  if (!bodyStr || bodyStr.length === 0) return null;

  try {
    return JSON.parse(bodyStr);
  } catch {
    return bodyStr;
  }

}

// ─────────────────────────────────────────────────────────────────────────────
// Extract prompt, completion, and total tokens from response body
// ─────────────────────────────────────────────────────────────────────────────
interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
}

function extractTokenUsage(responseBody: string, isStreaming: boolean): TokenUsage {
  const result = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0 };
  if (!responseBody) return result;

  function parseTokenDetails(obj: any): void {
    if (obj.copilot_usage && Array.isArray(obj.copilot_usage.token_details)) {
      let input = 0, output = 0;
      for (const item of obj.copilot_usage.token_details) {
        const count = Number(item.token_count || 0);
        if (item.token_type === 'input') {
          input += count;
        } else if (item.token_type === 'cache_read') {
          input += count;
          result.cache_read_tokens += count;
        } else if (item.token_type === 'cache_write') {
          input += count;
          result.cache_write_tokens += count;
        } else if (item.token_type === 'output') {
          output += count;
        } else if (item.token_type === 'reasoning' || item.token_type === 'thinking') {
          result.reasoning_tokens += count;
          output += count;
        }
      }
      result.prompt_tokens = input;
      result.completion_tokens = output;
      result.total_tokens = input + output;
    } else if (obj.usage?.prompt_tokens != null) {
      result.prompt_tokens = Number(obj.usage.prompt_tokens);
      result.completion_tokens = Number(obj.usage.completion_tokens || 0);
      result.total_tokens = Number(obj.usage.total_tokens || 0);
    } else if (obj.usage?.input_tokens != null) {
      result.prompt_tokens = Number(obj.usage.input_tokens);
      result.completion_tokens = Number(obj.usage.output_tokens || 0);
      result.total_tokens = result.prompt_tokens + result.completion_tokens;
    }
  }

  if (isStreaming) {
    const lines = responseBody.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const obj = JSON.parse(jsonStr);
          if (obj && (obj.usage || obj.copilot_usage)) {
            parseTokenDetails(obj);
            break;
          }
        } catch {
          // ignore parsing error for individual lines
        }
      }
    }
  } else {
    try {
      const obj = JSON.parse(responseBody);
      if (obj && (obj.usage || obj.copilot_usage)) {
        parseTokenDetails(obj);
      }
    } catch {
      // ignore
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve the real upstream URL
// ─────────────────────────────────────────────────────────────────────────────
function resolveUpstreamUrl(req: FastifyRequest): URL {
  const rawUrl = req.raw.url ?? '/';

  // Case 1: true HTTP-proxy mode — client sends absolute URL in the request line
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    const u = new URL(rawUrl);
    u.protocol = 'https:'; // always upgrade to TLS upstream
    return u;
  }

  // Case 2: API-base-override mode — client sends a path-only URL.
  // Host header will be "localhost:4000" (the proxy itself), so we replace
  // it with the real upstream host.
  const hostHeader = (req.headers['host'] as string | undefined) ?? '';
  const isLocal = LOCALHOST_RE.test(hostHeader);
  let upstream = isLocal ? UPSTREAM_HOST : hostHeader.replace(/:\d+$/, '');

  // ── Routing logic based on copilot-integration-id ─────────────────────────
  // The presence/absence of this header tells us which upstream to use.
  const copilotIntegrationId = (() => {
    const raw = req.headers['copilot-integration-id'];
    if (!raw) return null;
    return Array.isArray(raw) ? raw[0] : raw;
  })();

  if (!copilotIntegrationId &&
    /\/completions(?:\?|$)/.test(rawUrl)) {
    // No copilot-integration-id → implicit Code Completion request.
    // Must go through proxy.individual.githubcopilot.com
    upstream = 'proxy.individual.githubcopilot.com';
  } else {
    // Chat request with explicit vscode-chat integration ID.
    // Route to the standard Copilot API endpoint.
    upstream = 'api.githubcopilot.com';
  }

  return new URL(`https://${upstream}${rawUrl}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build clean headers for the upstream request
// ─────────────────────────────────────────────────────────────────────────────
function buildUpstreamHeaders(req: FastifyRequest, targetUrl: URL): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    const lk = key.toLowerCase();
    if (HOP_BY_HOP.has(lk)) continue;
    if (lk === 'host') continue; // overwritten below
    if (value === undefined) continue;
    headers[lk] = Array.isArray(value) ? value.join(', ') : value;
  }

  headers['host'] = targetUrl.host;

  // Ensure IDE identity headers for Copilot auth are present
  const hasEditorVersion = Object.keys(headers).some(k => k.toLowerCase() === 'editor-version');
  const hasPluginVersion = Object.keys(headers).some(k => k.toLowerCase() === 'editor-plugin-version');

  if (!hasEditorVersion) {
    headers['Editor-Version'] = 'vscode/1.90.0';
  }
  if (!hasPluginVersion) {
    headers['Editor-Plugin-Version'] = 'copilot-chat/0.53.0';
  }

  // NOTE: Do NOT auto-add Copilot-Integration-Id.
  // Its absence is the routing signal for Code Completion requests
  // (see resolveUpstreamUrl). Injecting it here would break that logic.

  return headers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main proxy handler
// ─────────────────────────────────────────────────────────────────────────────
export async function proxyHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const startMs = Date.now();
  const timestamp = startMs;

  // ── Resolve target ─────────────────────────────────────────────────────────
  let targetUrl: URL;
  try {
    targetUrl = resolveUpstreamUrl(req);
  } catch (err) {
    logError('proxy', 'Could not resolve upstream URL', err);
    return reply.code(502).send({ error: 'Bad upstream URL' });
  }

  // ── Capture request body ───────────────────────────────────────────────────
  // Fastify populates req.body via the content-type parser registered in server.ts.
  // We registered '*' with parseAs:'buffer', so req.body should always be a
  // Buffer (or empty Buffer) for any request that has a body.
  const rawBody = req.body as Buffer | string | object | null | undefined;
  let requestBody: Buffer | null = null;

  if (rawBody != null && rawBody !== '') {
    if (Buffer.isBuffer(rawBody)) {
      requestBody = rawBody;
    } else if (typeof rawBody === 'object') {
      requestBody = Buffer.from(JSON.stringify(rawBody));
    } else {
      requestBody = Buffer.from(String(rawBody));
    }
    // Ignore zero-length bodies (e.g. GET requests parsed as empty buffer)
    if (requestBody.length === 0) requestBody = null;
  }

  const requestHeaders = buildUpstreamHeaders(req, targetUrl);
  if (requestBody) {
    requestHeaders['content-length'] = String(requestBody.length);
  } else {
    delete requestHeaders['content-length'];
  }
  const method = req.method.toUpperCase();
  const host = targetUrl.host;
  const path = targetUrl.pathname + targetUrl.search;
  const urlStr = targetUrl.toString();

  // ── Log full incoming request details ────────────────────────────────────
  logIncomingRequest(method, urlStr, req.headers as any, requestBody ? requestBody.length : null);
  logPrettyJson('REQUEST HEADERS', req.headers);
  if (requestBody && requestBody.length > 0) {
    logBodyCapture('request', requestBody.length, false);
    logPrettyBody('REQUEST BODY', requestBody);
  } else {
    log('info', 'req-body', '(empty — GET or no body)');
  }

  // ── Shared state written by the two code paths below ──────────────────────
  let responseStatus = 0;
  let responseHeadersRaw: Record<string, string> = {};
  let responseBodyBuf = Buffer.alloc(0);
  let isStreaming = false;
  let errorMessage: string | null = null;
  let finishCalled = false;  // guard: finish() must only run once

  // ── Helper: persist + broadcast after the response is fully sent ───────────
  // NOTE: All heavy work (DB insert, broadcast) is deferred via setImmediate()
  // so it never blocks the response stream pipeline.
  function finish(reason: string = 'end') {
    if (finishCalled) {
      log('debug', 'proxy', `finish() called again (reason=${reason}) — skipping`);
      return;
    }
    finishCalled = true;

    // Snapshot values before deferring — these won't change after this point.
    const _duration_ms = Date.now() - startMs;
    const _responseBodyBuf = responseBodyBuf;
    const _responseStatus = responseStatus;
    const _responseHeadersRaw = { ...responseHeadersRaw };
    const _isStreaming = isStreaming;
    const _errorMessage = errorMessage;

    setImmediate(() => {
      const responseBody = _responseBodyBuf.toString('utf-8');

      // Log response capture summary
      logUpstreamResponse(method, path, _responseStatus, _responseHeadersRaw['content-type'] ?? '', _isStreaming, _duration_ms);
      logPrettyJson('RESPONSE HEADERS', _responseHeadersRaw);
      logBodyCapture('response', _responseBodyBuf.length, _responseBodyBuf.length === MAX_BODY_LOG_BYTES);
      logPrettyBody('RESPONSE BODY', _responseBodyBuf);
      if (_errorMessage) {
        log('warn', 'proxy', `  error: ${_errorMessage}`);
      }

      const requestBodyStr = requestBody ? requestBody.toString('utf-8') : null;
      const responseBodyStr = _responseBodyBuf.toString('utf-8');

      // Parse bodies for better display in dashboard
      const parsedRequestBody = parseBodyContent(requestBody);
      const parsedResponseBody = parseBodyContent(_responseBodyBuf);

      const tokenUsage = extractTokenUsage(responseBodyStr, _isStreaming);
      const isCodeCompletion = host === 'proxy.individual.githubcopilot.com' ? 1 : 0;

      const logPayload = {
        timestamp,
        method,
        url: urlStr,
        host,
        path,
        request_headers: JSON.stringify(req.headers),
        request_body: requestBodyStr,
        response_status: _responseStatus,
        response_headers: JSON.stringify(_responseHeadersRaw),
        response_body: responseBodyStr,
        duration_ms: _duration_ms,
        is_streaming: _isStreaming ? 1 : 0,
        error: _errorMessage,
        prompt_tokens: tokenUsage.prompt_tokens,
        completion_tokens: tokenUsage.completion_tokens,
        total_tokens: tokenUsage.total_tokens,
        is_code_completion: isCodeCompletion,
        cache_read_tokens: tokenUsage.cache_read_tokens,
        cache_write_tokens: tokenUsage.cache_write_tokens,
        reasoning_tokens: tokenUsage.reasoning_tokens,
      };

      try {
        const id = insertLog(logPayload);
        logFinish(id, !_errorMessage, `reason=${reason}`);
        broadcast({
          type: 'request_complete',
          log: {
            ...logPayload,
            id,
            request_body: parsedRequestBody,
            response_body: parsedResponseBody,
          } as any,
        });
        broadcast({ type: 'stats_update', stats: getStats() });
      } catch (dbErr) {
        logError('db', 'Failed to insert log', dbErr);
      }
    });
  }

  // ── Forward to upstream ────────────────────────────────────────────────────
  try {
    log('debug', 'proxy', `Forwarding to upstream: ${urlStr}`);
    log('debug', 'proxy',
      `requestBody length=${requestBody?.length ?? 'null'}`
    );

    logPrettyJson(
      'FORWARDED HEADERS',
      requestHeaders
    );

    const upstreamRes = await undiciRequest(urlStr, {
      method: method as NonNullable<Parameters<typeof undiciRequest>[1]>['method'],
      headers: requestHeaders,
      body: requestBody ?? undefined,
      headersTimeout: 30_000,
      bodyTimeout: 0,       // no timeout on streaming bodies
      maxRedirections: 5,
    });

    responseStatus = upstreamRes.statusCode;

    // Collect response headers
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (value === undefined) continue;
      responseHeadersRaw[key.toLowerCase()] =
        Array.isArray(value) ? value.join(', ') : (value as string);
    }

    const contentType = responseHeadersRaw['content-type'] ?? '';
    isStreaming = contentType.includes('text/event-stream');

    log('debug', 'proxy', `Upstream responded: ${responseStatus}, content-type=${contentType}`);

    // Apply status + headers to Fastify reply
    reply.code(responseStatus);
    for (const [key, value] of Object.entries(responseHeadersRaw)) {
      // Skip headers Fastify / Node manage itself
      if (key === 'transfer-encoding') continue;
      if (key === 'content-length') continue; // let Node recompute
      try { reply.header(key, value); } catch { /* ignore invalid headers */ }
    }

    // ── Tee the body: one copy → client, one copy → DB log ─────────────────
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const pass = new PassThrough();

    // Consume the undici body async, push into PassThrough
    const drainPromise = (async () => {
      try {
        for await (const chunk of upstreamRes.body) {
          const buf = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk as Uint8Array);

          // Cap the amount stored in DB to avoid huge memory usage
          if (totalBytes < MAX_BODY_LOG_BYTES) {
            const remaining = MAX_BODY_LOG_BYTES - totalBytes;
            chunks.push(buf.length <= remaining ? buf : buf.subarray(0, remaining));
          }
          totalBytes += buf.length;

          pass.push(buf);
        }
        log('debug', 'proxy', `Body drain complete: ${totalBytes} bytes total`);
      } catch (streamErr: any) {
        // Upstream body error — surface it but don't re-throw
        errorMessage = streamErr?.message || String(streamErr);
        logError('proxy', 'Body stream error: ' + errorMessage, streamErr);
        pass.destroy(streamErr);
      } finally {
        pass.push(null); // always close the PassThrough
      }
    })();

    // 'end' fires when all data has been flushed to consumer (client)
    pass.on('end', () => {
      responseBodyBuf = Buffer.concat(chunks);
      finish('end');
    });

    // 'close' fires even when stream is destroyed (client disconnect, error, etc.)
    // This ensures finish() is always called as a fallback.
    pass.on('close', () => {
      responseBodyBuf = Buffer.concat(chunks);
      finish('close');
    });

    // Also log on error so we don't lose the record
    pass.on('error', (err) => {
      logError('proxy', 'PassThrough error', err);
      responseBodyBuf = Buffer.concat(chunks);
      finish('error');
    });

    // Hand the stream to Fastify — it pipes it to the HTTP response properly
    // and preserves keep-alive for subsequent requests on the same connection.
    await reply.send(pass);

    // Fire-and-forget: drain the upstream body in the background.
    // Errors are already caught inside drainPromise and surfaced via
    // errorMessage / pass.destroy().  Not awaiting ensures the proxy
    // handler returns immediately — zero added latency for the client.
    drainPromise.catch(() => { });

  } catch (err: any) {
    // Upstream connection error (ECONNREFUSED, DNS, etc.)
    errorMessage = err?.message
      ? err.message
      : (typeof err === 'object' ? JSON.stringify(err) : String(err));

    logError('proxy', `Upstream error on ${method} ${urlStr}`, err);
    finish('upstream-error');

    if (!reply.sent) {
      return reply.code(502).send({ error: 'Upstream error', detail: errorMessage });
    }
  }
}