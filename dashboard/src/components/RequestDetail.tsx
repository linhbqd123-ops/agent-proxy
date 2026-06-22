import { useState } from 'react';
import { X, Copy, Check, Zap, AlertTriangle, Clock, Globe, ArrowUpRight, ExternalLink, Coins } from 'lucide-react';
import { format } from 'date-fns';
import { StreamViewer } from './StreamViewer';
import type { RequestLog } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ExtractedUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  output_tokens?: number;
}

function parseTokenUsageFromLog(log: RequestLog): ExtractedUsage | null {
  const result: ExtractedUsage = {
    prompt_tokens: log.prompt_tokens || 0,
    completion_tokens: log.completion_tokens || 0,
    total_tokens: log.total_tokens || 0,
  };

  let bodyObj: any = null;

  if (typeof log.response_body === 'object' && log.response_body !== null) {
    bodyObj = log.response_body;
  } else if (typeof log.response_body === 'string') {
    if (log.is_streaming === 1) {
      const lines = log.response_body.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const obj = JSON.parse(jsonStr);
            if (obj && (obj.usage || obj.copilot_usage)) {
              bodyObj = obj;
              break;
            }
          } catch {
            // ignore
          }
        }
      }
    } else {
      try {
        bodyObj = JSON.parse(log.response_body);
      } catch {
        // ignore
      }
    }
  }

  if (bodyObj) {
    if (bodyObj.usage) {
      result.prompt_tokens = bodyObj.usage.prompt_tokens || result.prompt_tokens;
      result.completion_tokens = bodyObj.usage.completion_tokens || result.completion_tokens;
      result.total_tokens = bodyObj.usage.total_tokens || result.total_tokens;
    }
    if (bodyObj.copilot_usage && Array.isArray(bodyObj.copilot_usage.token_details)) {
      for (const item of bodyObj.copilot_usage.token_details) {
        if (item.token_type === 'input') result.input_tokens = item.token_count;
        if (item.token_type === 'cache_read') result.cache_read_tokens = item.token_count;
        if (item.token_type === 'cache_write') result.cache_write_tokens = item.token_count;
        if (item.token_type === 'output') result.output_tokens = item.token_count;
      }
    }
  }

  if (result.total_tokens > 0 || result.prompt_tokens > 0 || result.completion_tokens > 0) {
    return result;
  }
  return null;
}

function bodyToString(body: string | object | null | undefined): string {
  if (!body) return '';
  if (typeof body === 'string') return body;
  return JSON.stringify(body, null, 2);
}

function CopyButton({ text, label = '' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="btn-ghost text-xs px-2 py-1"
      title={label ? `Copy ${label}` : 'Copy'}
    >
      {copied
        ? <><Check className="w-3 h-3 text-emerald-500" /> Copied</>
        : <><Copy className="w-3 h-3" /> Copy</>}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
      {children}
    </p>
  );
}

function HeadersTable({ raw }: { raw: string }) {
  let parsed: Record<string, string> = {};
  try { parsed = JSON.parse(raw); } catch { /* keep empty */ }
  const entries = Object.entries(parsed);

  if (entries.length === 0)
    return <p className="text-xs text-slate-400 italic">No headers</p>;

  return (
    <div className="card-inset overflow-hidden">
      <table className="w-full text-xs font-mono">
        <tbody className="divide-y divide-slate-100">
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td className="px-3 py-1.5 text-slate-400 w-2/5 align-top break-all font-medium">{k}</td>
              <td className="px-3 py-1.5 text-slate-600 break-all">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'request' | 'response';

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

interface RequestDetailProps {
  log: RequestLog | null;
  onClose: () => void;
}

export function RequestDetail({ log, onClose }: RequestDetailProps) {
  const [tab, setTab] = useState<Tab>('request');

  if (!log) return null;

  const isStreaming = log.is_streaming === 1;
  const hasError    = !!log.error;
  const statusColor =
    hasError || log.response_status >= 500  ? 'text-red-600'
    : log.response_status >= 400            ? 'text-amber-600'
    : log.response_status >= 200            ? 'text-emerald-600'
    :                                         'text-slate-400';

  const usage = parseTokenUsageFromLog(log);

  return (
    <div className="flex flex-col h-full bg-white animate-slide-in">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold bg-slate-200 text-slate-600 rounded px-1.5 py-0.5 font-mono">
              {log.method}
            </span>
            <span className={`text-sm font-bold ${statusColor}`}>
              {log.response_status || (hasError ? 'ERR' : '—')}
            </span>
            {isStreaming && (
              <span className="badge-violet flex items-center gap-1">
                <Zap className="w-3 h-3" /> SSE
              </span>
            )}
            {hasError && (
              <span className="badge-red flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Error
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-slate-500 mt-1.5 break-all leading-relaxed">
            {log.path}
          </p>
        </div>
        <button id="btn-close-detail" onClick={onClose} className="btn-ghost p-1.5 shrink-0 -mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Meta strip ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 py-2.5 border-b border-slate-200 text-xs text-slate-500 bg-white">
        <span className="flex items-center gap-1.5">
          <Globe className="w-3 h-3 text-slate-400" />
          {log.host}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-slate-400" />
          {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
        </span>
        <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
          <Clock className="w-3 h-3" />
          {log.duration_ms.toLocaleString()} ms
        </span>
        <a
          href={log.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-brand-500 hover:text-brand-700 ml-auto transition-colors"
        >
          Full URL <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* ── Token Usage Visualizer ────────────────────────────────────────── */}
      {usage && (
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs uppercase tracking-wider">
              <Coins className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              Token Usage
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Total: <strong className="text-slate-800 font-bold">{usage.total_tokens.toLocaleString()}</strong> tokens
            </div>
          </div>

          {/* Breakdown progress bar */}
          <div className="flex h-2 w-full rounded-full overflow-hidden bg-slate-100 mb-3">
            {usage.input_tokens !== undefined || usage.cache_read_tokens !== undefined || usage.cache_write_tokens !== undefined ? (
              <>
                {/* Input tokens */}
                <div
                  style={{ width: `${((usage.input_tokens || 0) / usage.total_tokens) * 100}%` }}
                  className="bg-brand-500 transition-all duration-300"
                  title={`Input: ${usage.input_tokens}`}
                />
                {/* Cache read (hit) */}
                <div
                  style={{ width: `${((usage.cache_read_tokens || 0) / usage.total_tokens) * 100}%` }}
                  className="bg-emerald-500 transition-all duration-300"
                  title={`Cache Read (Hit): ${usage.cache_read_tokens}`}
                />
                {/* Cache write (saved) */}
                <div
                  style={{ width: `${((usage.cache_write_tokens || 0) / usage.total_tokens) * 100}%` }}
                  className="bg-blue-400 transition-all duration-300"
                  title={`Cache Write: ${usage.cache_write_tokens}`}
                />
                {/* Output tokens */}
                <div
                  style={{ width: `${((usage.output_tokens || 0) / usage.total_tokens) * 100}%` }}
                  className="bg-violet-500 transition-all duration-300"
                  title={`Output: ${usage.output_tokens}`}
                />
              </>
            ) : (
              <>
                {/* Prompt tokens */}
                <div
                  style={{ width: `${(usage.prompt_tokens / usage.total_tokens) * 100}%` }}
                  className="bg-brand-500 transition-all duration-300"
                  title={`Prompt: ${usage.prompt_tokens}`}
                />
                {/* Completion tokens */}
                <div
                  style={{ width: `${(usage.completion_tokens / usage.total_tokens) * 100}%` }}
                  className="bg-violet-500 transition-all duration-300"
                  title={`Completion: ${usage.completion_tokens}`}
                />
              </>
            )}
          </div>

          {/* Detailed numbers grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
            {usage.input_tokens !== undefined || usage.cache_read_tokens !== undefined || usage.cache_write_tokens !== undefined ? (
              <>
                <div className="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200">
                  <span className="text-slate-400">Input</span>
                  <strong className="text-slate-700">{(usage.input_tokens || 0).toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-emerald-50/50 border border-emerald-100/50">
                  <span className="text-emerald-600 font-medium">Cache Hit</span>
                  <strong className="text-emerald-700">{(usage.cache_read_tokens || 0).toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-blue-50/50 border border-blue-100/50">
                  <span className="text-blue-600 font-medium">Cache Save</span>
                  <strong className="text-blue-700">{(usage.cache_write_tokens || 0).toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-violet-50/50 border border-violet-100/50">
                  <span className="text-violet-600 font-medium">Output</span>
                  <strong className="text-violet-700">{(usage.output_tokens || 0).toLocaleString()}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200 col-span-2">
                  <span className="text-slate-400">Prompt (Input)</span>
                  <strong className="text-slate-700">{usage.prompt_tokens.toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-violet-50/50 border border-violet-100/50 col-span-2">
                  <span className="text-violet-600 font-medium">Completion (Output)</span>
                  <strong className="text-violet-700">{usage.completion_tokens.toLocaleString()}</strong>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 px-5 bg-white">
        {(['request', 'response'] as Tab[]).map(t => (
          <button
            key={t}
            id={`tab-${t}`}
            onClick={() => setTab(t)}
            className={[
              'px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors',
              tab === t
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-400 hover:text-slate-600',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 bg-slate-50">

        {tab === 'request' && (
          <>
            {/* Request headers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>Request Headers</SectionTitle>
                <CopyButton text={log.request_headers} label="headers" />
              </div>
              <HeadersTable raw={log.request_headers} />
            </div>

            {/* Request body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>Request Body</SectionTitle>
                {log.request_body && <CopyButton text={bodyToString(log.request_body)} label="body" />}
              </div>
              {log.request_body
                ? <div className="card-inset p-3"><StreamViewer body={log.request_body} isStreaming={false} /></div>
                : <p className="text-xs text-slate-400 italic">Empty body</p>}
            </div>
          </>
        )}

        {tab === 'response' && (
          <>
            {/* Error banner */}
            {log.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Upstream Error
                </p>
                <p className="font-mono text-xs text-red-500 break-all">{log.error}</p>
              </div>
            )}

            {/* Response headers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>Response Headers</SectionTitle>
                <CopyButton text={log.response_headers} label="headers" />
              </div>
              <HeadersTable raw={log.response_headers} />
            </div>

            {/* Response body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>
                  Response Body
                  {isStreaming && (
                    <span className="ml-2 text-violet-500 normal-case font-normal">(SSE stream)</span>
                  )}
                </SectionTitle>
                {log.response_body && <CopyButton text={bodyToString(log.response_body)} label="body" />}
              </div>
              <div className="card-inset p-3">
                <StreamViewer body={log.response_body} isStreaming={isStreaming} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
