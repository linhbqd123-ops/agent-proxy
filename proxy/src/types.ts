// ─────────────────────────────────────────────────────────────────────────────
// Shared types used across proxy server and REST API
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestLog {
  id: number;
  timestamp: number;          // unix ms
  method: string;
  url: string;
  host: string;
  path: string;
  request_headers: string;   // JSON stringified Record<string,string>
  request_body: string | null;
  response_status: number;
  response_headers: string;  // JSON stringified Record<string,string>
  response_body: string;     // accumulated chunks (utf-8)
  duration_ms: number;
  is_streaming: number;      // sqlite stores as 0/1
  error: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  is_code_completion: number; // 0 = chat, 1 = code completion
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  agent: string;              // agent identifier: 'copilot' | 'kilo' | ...
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket event payloads broadcast to dashboard clients
// ─────────────────────────────────────────────────────────────────────────────

export type WsEventType = 'request_complete' | 'stats_update';

export interface WsRequestComplete {
  type: 'request_complete';
  log: RequestLog;
}

export interface WsStatsUpdate {
  type: 'stats_update';
  stats: Stats;
}

export type WsEvent = WsRequestComplete | WsStatsUpdate;

export interface Stats {
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
  total_normal_tokens: number;          // is_code_completion = 0 (chat)
  total_normal_prompt_tokens: number;
  total_normal_completion_tokens: number;
  total_code_completion_tokens: number; // is_code_completion = 1
  total_cc_prompt_tokens: number;
  total_cc_completion_tokens: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// REST API query params
// ─────────────────────────────────────────────────────────────────────────────

export interface LogsQuery {
  page?: number;
  limit?: number;
  method?: string;
  search?: string;
  streaming?: boolean;
  from?: number;  // unix ms
  to?: number;    // unix ms
  agent?: string; // filter by agent identifier
}
