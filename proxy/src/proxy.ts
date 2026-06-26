import { request as undiciRequest } from 'undici';
import { PassThrough } from 'stream';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { insertLog, getStats } from './db.js';
import { broadcast } from './websocket.js';
import { resolveAgentHandler } from './agents/index.js';
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

// Max bytes of response body stored in DB (5 MB). Streaming SSE can be huge.
const MAX_BODY_LOG_BYTES = 5 * 1024 * 1024;

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
// Main proxy handler
// ─────────────────────────────────────────────────────────────────────────────
export async function proxyHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const startMs = Date.now();
  const timestamp = startMs;

  // ── Detect agent and get handler ──────────────────────────────────────────
  const { handler, agentName } = resolveAgentHandler(req);

  // ── Resolve target ─────────────────────────────────────────────────────────
  let targetUrl: URL;
  let isCodeCompletion = false;
  try {
    const upstream = handler.resolveUpstream(req);
    targetUrl = upstream.url;
    isCodeCompletion = upstream.isCodeCompletion;
  } catch (err) {
    logError('proxy', `[${agentName}] Could not resolve upstream URL`, err);
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

  const requestHeaders = handler.buildUpstreamHeaders(req, targetUrl);
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
  log('info', 'proxy', `[${agentName}] Processing request`);
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

      // Use agent-specific token extraction
      const tokenUsage = handler.extractTokenUsage(responseBodyStr, _isStreaming);

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
        is_code_completion: isCodeCompletion ? 1 : 0,
        cache_read_tokens: tokenUsage.cache_read_tokens,
        cache_write_tokens: tokenUsage.cache_write_tokens,
        reasoning_tokens: tokenUsage.reasoning_tokens,
        agent: agentName,
      };

      try {
        const id = insertLog(logPayload);
        logFinish(id, !_errorMessage, `agent=${agentName} reason=${reason}`);
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
    log('debug', 'proxy', `[${agentName}] Forwarding to upstream: ${urlStr}`);
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

    logError('proxy', `[${agentName}] Upstream error on ${method} ${urlStr}`, err);
    finish('upstream-error');

    if (!reply.sent) {
      return reply.code(502).send({ error: 'Upstream error', detail: errorMessage });
    }
  }
}