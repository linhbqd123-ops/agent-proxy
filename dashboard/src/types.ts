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
}

export interface Stats {
  total: number;
  streaming: number;
  errors: number;
  avg_duration_ms: number;
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
}
