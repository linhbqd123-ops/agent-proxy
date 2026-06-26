// ─────────────────────────────────────────────────────────────────────────────
// Frontend types mirroring the proxy's types.ts
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestLog {
  id: number;
  timestamp: number;
  method: string;
  url: string;
  host: string;
  path: string;
  request_headers: string;   // JSON string
  request_body: string | object | null;
  response_status: number;
  response_headers: string;  // JSON string
  response_body: string | object | null;
  duration_ms: number;
  is_streaming: number;      // 0 | 1
  error: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  is_code_completion: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  agent: string;
}

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
  total_normal_tokens: number;
  total_normal_prompt_tokens: number;
  total_normal_completion_tokens: number;
  total_code_completion_tokens: number;
  total_cc_prompt_tokens: number;
  total_cc_completion_tokens: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket events
// ─────────────────────────────────────────────────────────────────────────────

export interface WsRequestComplete {
  type: 'request_complete';
  log: RequestLog;
}

export interface WsStatsUpdate {
  type: 'stats_update';
  stats: Stats;
}

export type WsEvent = WsRequestComplete | WsStatsUpdate;

// ─────────────────────────────────────────────────────────────────────────────
// UI filter state
// ─────────────────────────────────────────────────────────────────────────────

export interface FilterState {
  search: string;
  method: string;       // '' = all
  streaming: string;    // '' | 'true' | 'false'
  agent: string;        // '' | 'copilot' | 'kilo'
}
