import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { RequestLog, Stats, LogsQuery } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'traffic.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS request_logs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp        INTEGER NOT NULL,
    method           TEXT    NOT NULL,
    url              TEXT    NOT NULL,
    host             TEXT    NOT NULL,
    path             TEXT    NOT NULL,
    request_headers  TEXT    NOT NULL DEFAULT '{}',
    request_body     TEXT,
    response_status  INTEGER NOT NULL DEFAULT 0,
    response_headers TEXT    NOT NULL DEFAULT '{}',
    response_body    TEXT    NOT NULL DEFAULT '',
    duration_ms      INTEGER NOT NULL DEFAULT 0,
    is_streaming     INTEGER NOT NULL DEFAULT 0,
    error            TEXT,
    prompt_tokens    INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens     INTEGER NOT NULL DEFAULT 0,
    is_code_completion INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens    INTEGER NOT NULL DEFAULT 0,
    agent            TEXT    NOT NULL DEFAULT 'copilot'
  );

  CREATE INDEX IF NOT EXISTS idx_timestamp   ON request_logs(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_method      ON request_logs(method);
  CREATE INDEX IF NOT EXISTS idx_is_streaming ON request_logs(is_streaming);
  CREATE INDEX IF NOT EXISTS idx_status      ON request_logs(response_status);
  CREATE INDEX IF NOT EXISTS idx_agent       ON request_logs(agent);
`);

// ── Run migrations for existing DB ──────────────────────────────────────────
try { db.exec(`ALTER TABLE request_logs ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
try { db.exec(`ALTER TABLE request_logs ADD COLUMN completion_tokens INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
try { db.exec(`ALTER TABLE request_logs ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
try { db.exec(`ALTER TABLE request_logs ADD COLUMN is_code_completion INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
try { db.exec(`ALTER TABLE request_logs ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
try { db.exec(`ALTER TABLE request_logs ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
try { db.exec(`ALTER TABLE request_logs ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
try { db.exec(`ALTER TABLE request_logs ADD COLUMN agent TEXT NOT NULL DEFAULT 'copilot';`); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_agent ON request_logs(agent);`); } catch (_) {}

// ─────────────────────────────────────────────────────────────────────────────
// Prepared statements
// ─────────────────────────────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT INTO request_logs
    (timestamp, method, url, host, path, request_headers, request_body,
     response_status, response_headers, response_body, duration_ms, is_streaming, error,
     prompt_tokens, completion_tokens, total_tokens,
     is_code_completion, cache_read_tokens, cache_write_tokens, reasoning_tokens, agent)
  VALUES
    (@timestamp, @method, @url, @host, @path, @request_headers, @request_body,
     @response_status, @response_headers, @response_body, @duration_ms, @is_streaming, @error,
     @prompt_tokens, @completion_tokens, @total_tokens,
     @is_code_completion, @cache_read_tokens, @cache_write_tokens, @reasoning_tokens, @agent)
`);

const stmtGetById = db.prepare<[number]>(`
  SELECT * FROM request_logs WHERE id = ?
`);

const stmtStats = db.prepare(`
  SELECT
    COUNT(*)                                       AS total,
    SUM(is_streaming)                              AS streaming,
    SUM(CASE WHEN response_status >= 400 OR error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
    CAST(AVG(duration_ms) AS INTEGER)              AS avg_duration_ms,
    SUM(prompt_tokens)                             AS total_prompt_tokens,
    SUM(completion_tokens)                         AS total_completion_tokens,
    SUM(total_tokens)                              AS total_tokens,
    SUM(cache_read_tokens)                         AS total_cache_read_tokens,
    SUM(cache_write_tokens)                        AS total_cache_write_tokens,
    SUM(reasoning_tokens)                          AS total_reasoning_tokens,
    SUM(CASE WHEN is_code_completion = 0 THEN total_tokens ELSE 0 END) AS total_normal_tokens,
    SUM(CASE WHEN is_code_completion = 0 THEN prompt_tokens ELSE 0 END) AS total_normal_prompt_tokens,
    SUM(CASE WHEN is_code_completion = 0 THEN completion_tokens ELSE 0 END) AS total_normal_completion_tokens,
    SUM(CASE WHEN is_code_completion = 1 THEN total_tokens ELSE 0 END) AS total_code_completion_tokens,
    SUM(CASE WHEN is_code_completion = 1 THEN prompt_tokens ELSE 0 END) AS total_cc_prompt_tokens,
    SUM(CASE WHEN is_code_completion = 1 THEN completion_tokens ELSE 0 END) AS total_cc_completion_tokens
  FROM request_logs
`);

const stmtClear = db.prepare(`DELETE FROM request_logs`);

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type InsertPayload = Omit<RequestLog, 'id'>;

export function insertLog(log: InsertPayload): number {
  const result = stmtInsert.run(log);
  return result.lastInsertRowid as number;
}

export function getLogById(id: number): RequestLog | undefined {
  return stmtGetById.get(id) as RequestLog | undefined;
}

export function getLogs(query: LogsQuery): { data: RequestLog[]; total: number } {
  const page  = Math.max(1, query.page  ?? 1);
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.method) {
    conditions.push(`method = ?`);
    params.push(query.method.toUpperCase());
  }
  if (query.streaming !== undefined) {
    conditions.push(`is_streaming = ?`);
    params.push(query.streaming ? 1 : 0);
  }
  if (query.from) {
    conditions.push(`timestamp >= ?`);
    params.push(query.from);
  }
  if (query.to) {
    conditions.push(`timestamp <= ?`);
    params.push(query.to);
  }
  if (query.search) {
    conditions.push(`(url LIKE ? OR path LIKE ?)`);
    const like = `%${query.search}%`;
    params.push(like, like);
  }
  if (query.agent) {
    conditions.push(`agent = ?`);
    params.push(query.agent);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countStmt = db.prepare<(string | number)[]>(`
    SELECT COUNT(*) AS n FROM request_logs ${where}
  `);
  const { n } = countStmt.get(...params) as { n: number };

  const dataStmt = db.prepare<(string | number)[]>(`
    SELECT * FROM request_logs ${where}
    ORDER BY timestamp DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  const data = dataStmt.all(...params) as RequestLog[];

  return { data, total: n };
}

export function getStats(): Stats {
  const row = stmtStats.get() as {
    total: number;
    streaming: number;
    errors: number;
    avg_duration_ms: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_cache_read_tokens: number;
    total_cache_write_tokens: number;
    total_reasoning_tokens: number;
    total_normal_tokens: number;
    total_normal_prompt_tokens: number;
    total_normal_completion_tokens: number;
    total_code_completion_tokens: number;
    total_cc_prompt_tokens: number;
    total_cc_completion_tokens: number;
  };
  return {
    total:           row.total           ?? 0,
    streaming:       row.streaming       ?? 0,
    errors:          row.errors          ?? 0,
    avg_duration_ms: row.avg_duration_ms ?? 0,
    total_prompt_tokens: row.total_prompt_tokens ?? 0,
    total_completion_tokens: row.total_completion_tokens ?? 0,
    total_tokens:    row.total_tokens    ?? 0,
    total_cache_read_tokens: row.total_cache_read_tokens ?? 0,
    total_cache_write_tokens: row.total_cache_write_tokens ?? 0,
    total_reasoning_tokens: row.total_reasoning_tokens ?? 0,
    total_normal_tokens: row.total_normal_tokens ?? 0,
    total_normal_prompt_tokens: row.total_normal_prompt_tokens ?? 0,
    total_normal_completion_tokens: row.total_normal_completion_tokens ?? 0,
    total_code_completion_tokens: row.total_code_completion_tokens ?? 0,
    total_cc_prompt_tokens: row.total_cc_prompt_tokens ?? 0,
    total_cc_completion_tokens: row.total_cc_completion_tokens ?? 0,
  };
}

export function clearLogs(): void {
  stmtClear.run();
}

export function getDbPath(): string {
  return db.name;
}
