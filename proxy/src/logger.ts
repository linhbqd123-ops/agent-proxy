// ─────────────────────────────────────────────────────────────────────────────
// Logger — colorized, timestamped debug output
// Enable verbose debug logs:  DEBUG=1 npm run dev
// ─────────────────────────────────────────────────────────────────────────────

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

// ANSI color codes
const C = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  gray:   '\x1b[90m',
};

function ts(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${C.gray}[${hh}:${mm}:${ss}.${ms}]${C.reset}`;
}

export type LogLevel = 'info' | 'debug' | 'warn' | 'error' | 'trace';

const LEVEL_COLOR: Record<LogLevel, string> = {
  info:  C.cyan,
  debug: C.blue,
  warn:  C.yellow,
  error: C.red,
  trace: C.gray,
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  info:  'INFO ',
  debug: 'DEBUG',
  warn:  'WARN ',
  error: 'ERROR',
  trace: 'TRACE',
};

export function log(level: LogLevel, category: string, message: string, extra?: unknown): void {
  if (level === 'trace' || level === 'debug') {
    if (!DEBUG) return;
  }

  const color = LEVEL_COLOR[level];
  const label = LEVEL_LABEL[level];
  const prefix = `${ts()} ${color}${C.bold}${label}${C.reset} ${C.magenta}[${category}]${C.reset}`;

  if (extra !== undefined) {
    console.log(`${prefix} ${message}`, extra);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Specialized helpers
// ─────────────────────────────────────────────────────────────────────────────

export function logIncomingRequest(
  method: string,
  url: string,
  headers: Record<string, string | string[] | undefined>,
  bodySize: number | null,
): void {
  const ct = headers['content-type'];
  const auth = headers['authorization'];
  const authStr = auth
    ? (Array.isArray(auth) ? auth[0] : auth).slice(0, 30) + '…'
    : '(none)';

  log('info', 'proxy', `→ ${C.bold}${method} ${url}${C.reset}`);
  log('debug', 'proxy', `  Content-Type : ${ct ?? '(none)'}`);
  log('debug', 'proxy', `  Authorization: ${authStr}`);
  log('debug', 'proxy', `  Body size    : ${bodySize === null ? 'null (no body)' : `${bodySize} bytes`}`);
}

export function logUpstreamResponse(
  method: string,
  path: string,
  status: number,
  contentType: string,
  isStreaming: boolean,
  durationMs: number,
): void {
  const color = status >= 500 ? C.red : status >= 400 ? C.yellow : C.green;
  log('info', 'proxy',
    `← ${color}${C.bold}${status}${C.reset} ${method} ${path} ` +
    `${C.dim}${durationMs}ms${isStreaming ? ' [streaming]' : ''}${C.reset}`,
  );
  log('debug', 'proxy', `  Response Content-Type: ${contentType || '(none)'}`);
}

export function logBodyCapture(
  phase: 'request' | 'response',
  size: number,
  truncated: boolean,
): void {
  const label = phase === 'request' ? 'req body' : 'res body';
  log('debug', 'capture',
    `${label}: ${size} bytes${truncated ? ' (truncated for log)' : ''}`,
  );
}

export function logFinish(id: number | bigint, success: boolean, note?: string): void {
  const mark = success ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
  log('info', 'db', `${mark} Saved log id=${id}${note ? ' — ' + note : ''}`);
}

export function logError(category: string, message: string, err?: unknown): void {
  log('error', category, message);
  if (err && DEBUG) {
    console.error(err);
  }
}

export function debugEnabled(): boolean {
  return DEBUG;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pretty-print helpers (always shown, not gated by DEBUG flag)
// ─────────────────────────────────────────────────────────────────────────────

const DIVIDER = `${C.gray}${'─'.repeat(72)}${C.reset}`;

/**
 * Print any object as pretty-indented JSON with a labeled banner.
 * Always visible (INFO level), no DEBUG flag required.
 */
export function logPrettyJson(label: string, obj: unknown): void {
  const banner = `${C.bold}${C.cyan}┌── ${label} ${'─'.repeat(Math.max(0, 60 - label.length))}${C.reset}`;
  console.log(`${ts()} ${banner}`);
  try {
    const pretty = JSON.stringify(obj, null, 2);
    // Color-code the JSON lines
    for (const line of pretty.split('\n')) {
      // Keys in cyan, strings in green, numbers in yellow
      const colored = line
        .replace(/"([^"]+)":/g, `"${C.cyan}$1${C.reset}":`)
        .replace(/: "([^"]*)"/g, `: "${C.green}$1${C.reset}"`)
        .replace(/: (\d+(\.\d+)?)/g, `: ${C.yellow}$1${C.reset}`)
        .replace(/: (true|false|null)/g, `: ${C.magenta}$1${C.reset}`);
      console.log(`  ${colored}`);
    }
  } catch {
    console.log(`  ${String(obj)}`);
  }
  console.log(DIVIDER);
}

/**
 * Try to parse a Buffer as JSON and pretty-print it.
 * Falls back to raw UTF-8 string if not valid JSON.
 * Truncates very large bodies at 4 KB for readability.
 */
export function logPrettyBody(label: string, buf: Buffer): void {
  if (!buf || buf.length === 0) {
    const banner = `${C.bold}${C.yellow}┌── ${label} ${'─'.repeat(Math.max(0, 60 - label.length))}${C.reset}`;
    console.log(`${ts()} ${banner}`);
    console.log(`  ${C.gray}(empty)${C.reset}`);
    console.log(DIVIDER);
    return;
  }

  const MAX_DISPLAY = 4096;
  const raw   = buf.toString('utf-8');
  const trunc = raw.length > MAX_DISPLAY;
  const text  = trunc ? raw.slice(0, MAX_DISPLAY) + `\n… (${raw.length - MAX_DISPLAY} more bytes)` : raw;

  const banner = `${C.bold}${C.yellow}┌── ${label} ${C.gray}(${buf.length} bytes)${'─'.repeat(Math.max(0, 46 - label.length))}${C.reset}`;
  console.log(`${ts()} ${banner}`);

  // Try JSON parse
  try {
    const parsed = JSON.parse(raw);
    logPrettyJson(`${label} [JSON]`, parsed);
    return; // logPrettyJson already prints the divider
  } catch {
    // Not JSON — check if SSE stream
    if (text.startsWith('data:')) {
      // Pretty-print SSE events
      for (const line of text.split('\n').slice(0, 30)) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const evtParsed = JSON.parse(line.slice(6));
            console.log(`  ${C.gray}data:${C.reset} ${JSON.stringify(evtParsed)}`);
          } catch {
            console.log(`  ${C.gray}${line}${C.reset}`);
          }
        } else {
          console.log(`  ${C.gray}${line}${C.reset}`);
        }
      }
      if (trunc) console.log(`  ${C.gray}… truncated${C.reset}`);
    } else {
      // Plain text
      for (const line of text.split('\n')) {
        console.log(`  ${line}`);
      }
    }
  }
  console.log(DIVIDER);
}
