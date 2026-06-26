import Fastify from 'fastify';
import cors from '@fastify/cors';
import { attachWebSocketServer } from './websocket.js';
import { proxyHandler } from './proxy.js';
import { getLogs, getLogById, getStats, clearLogs, getDbPath } from './db.js';
import { log } from './logger.js';
import type { LogsQuery } from './types.js';

export async function buildServer() {
  const app = Fastify({
    logger: false,
    // Accept raw body buffer so proxy can forward it unchanged
    bodyLimit: 50 * 1024 * 1024, // 50 MB
  });

  // ── CORS for dashboard ──────────────────────────────────────────────────────
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  });

  // ── Parse body as raw Buffer for ALL content-types ───────────────────────
  // The '*' wildcard only fires when Fastify recognises the content-type.
  // Registering with allowUnsupportedMediaType ensures bodies are parsed
  // even when the client sends no Content-Type header at all.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => { done(null, body); },
  );

  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    (_req, body, done) => { done(null, body); },
  );

  // ── Hook: log every incoming request for visibility ────────────────────────
  app.addHook('onRequest', (req, _reply, done) => {
    // Force a default Content-Type if missing on payload-bearing methods
    const method = req.method.toUpperCase();
    if (!req.headers['content-type'] && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      req.headers['content-type'] = 'application/octet-stream';
    }
    // Skip internal API routes from verbose logging
    if (!req.url.startsWith('/api/')) {
      log('info', 'server', `→ ${req.method} ${req.url} [${req.ip}]`);
    }
    done();
  });

  // ── REST API routes (must be registered BEFORE the catch-all proxy) ───────

  // GET /api/logs?page=1&limit=50&method=POST&search=...&streaming=true
  app.get('/api/logs', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const query: LogsQuery = {
      page:      q.page      ? parseInt(q.page)   : 1,
      limit:     q.limit     ? parseInt(q.limit)  : 50,
      method:    q.method    || undefined,
      search:    q.search    || undefined,
      streaming: q.streaming !== undefined ? q.streaming === 'true' : undefined,
      from:      q.from      ? parseInt(q.from)   : undefined,
      to:        q.to        ? parseInt(q.to)      : undefined,
      agent:     q.agent     || undefined,
    };
    const result = getLogs(query);
    return reply.send(result);
  });

  // GET /api/logs/:id
  app.get('/api/logs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const logEntry = getLogById(parseInt(id));
    if (!logEntry) return reply.code(404).send({ error: 'Not found' });
    return reply.send(logEntry);
  });

  // GET /api/stats
  app.get('/api/stats', async (_req, reply) => {
    return reply.send(getStats());
  });

  // DELETE /api/logs
  app.delete('/api/logs', async (_req, reply) => {
    clearLogs();
    return reply.send({ ok: true });
  });

  // ── Debug endpoints ────────────────────────────────────────────────────────

  // GET /api/debug/status — server health + row count + ws client count
  app.get('/api/debug/status', async (_req, reply) => {
    const { total } = getStats();
    const uptimeSeconds = Math.floor(process.uptime());
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    return reply.send({
      ok: true,
      uptime_seconds: uptimeSeconds,
      heap_used_mb: memMB,
      db_total_rows: total,
      db_path: getDbPath(),          // better-sqlite3 exposes .name
      node_version: process.version,
      debug_mode: process.env.DEBUG === '1' || process.env.DEBUG === 'true',
    });
  });

  // POST /api/debug/echo — echo back method, headers, raw body (useful to verify body parsing)
  app.post('/api/debug/echo', async (req, reply) => {
    const rawBody = req.body as Buffer | null | undefined;
    const bodyText = rawBody ? rawBody.toString('utf-8') : null;
    let bodyJson: unknown = null;
    try { if (bodyText) bodyJson = JSON.parse(bodyText); } catch { /* keep as text */ }

    return reply.send({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body_size: rawBody ? rawBody.length : 0,
      body_text: bodyText,
      body_json: bodyJson,
    });
  });

  // GET /api/debug/echo — same but GET (for quick browser test)
  app.get('/api/debug/echo', async (req, reply) => {
    return reply.send({
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: req.query,
    });
  });

  // ── Catch-all proxy — matches all agent requests ────────────────────────
  // We deliberately skip OPTIONS here because @fastify/cors already registers
  // OPTIONS /* and registering it again throws a duplicate-route error.
  const PROXY_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
  for (const method of PROXY_METHODS) {
    app.route({
      method,
      url: '/*',
      config: { isProxy: true },
      handler: proxyHandler,
    });
  }

  // ── Attach WebSocket server AFTER building Fastify so we have httpServer ─
  app.addHook('onReady', () => {
    attachWebSocketServer(app.server);
    log('info', 'ws', 'WebSocket server attached on /ws');
  });

  return app;
}
