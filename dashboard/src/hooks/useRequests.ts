import { useState, useEffect, useCallback, useRef } from 'react';
import type { RequestLog, Stats, WsEvent, FilterState } from '../types';

const API = '/api';

export interface UseRequestsReturn {
  logs: RequestLog[];
  stats: Stats;
  total: number;
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (s: number) => void;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  loading: boolean;
  refresh: () => void;
  clearAll: () => Promise<void>;
  clearFilters: () => void;
}

const LS_KEY_FILTERS = 'proxy-dashboard-filters';
const LS_KEY_PAGE_SIZE = 'proxy-dashboard-page-size';

function loadFilters(): FilterState {
  try {
    const raw = localStorage.getItem(LS_KEY_FILTERS);
    if (raw) return JSON.parse(raw) as FilterState;
  } catch { /* ignore */ }
  return { search: '', method: '', streaming: '', agent: '' };
}

function loadPageSize(): number {
  try {
    const raw = localStorage.getItem(LS_KEY_PAGE_SIZE);
    if (raw) return parseInt(raw, 10) || 50;
  } catch { /* ignore */ }
  return 50;
}

const DEFAULT_STATS: Stats = {
  total: 0,
  streaming: 0,
  errors: 0,
  avg_duration_ms: 0,
  total_prompt_tokens: 0,
  total_completion_tokens: 0,
  total_tokens: 0,
  total_cache_read_tokens: 0,
  total_cache_write_tokens: 0,
  total_reasoning_tokens: 0,
  total_normal_tokens: 0,
  total_normal_prompt_tokens: 0,
  total_normal_completion_tokens: 0,
  total_code_completion_tokens: 0,
  total_cc_prompt_tokens: 0,
  total_cc_completion_tokens: 0,
};

export function useRequests(onEvent: (cb: (evt: WsEvent) => void) => void): UseRequestsReturn {
  const [logs,    setLogs]    = useState<RequestLog[]>([]);
  const [stats,   setStats]   = useState<Stats>(DEFAULT_STATS);
  const [total,   setTotal]   = useState(0);
  const [page,     setPage]    = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);
  const [loading,  setLoading] = useState(false);
  const [filters,  setFiltersRaw] = useState<FilterState>(loadFilters);

  // Track whether the component is still mounted
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Keep mutable refs so fetchLogs always reads latest values without recreating the callback
  const pageRef = useRef(page);
  const pageSizeRef = useRef(pageSize);
  const filtersRef = useRef(filters);
  pageRef.current = page;
  pageSizeRef.current = pageSize;
  filtersRef.current = filters;

  // ── Fetch logs from REST API ─────────────────────────────────────────────
  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page:  String(pageRef.current),
        limit: String(pageSizeRef.current),
      });
      if (filtersRef.current.method)    params.set('method',    filtersRef.current.method);
      if (filtersRef.current.search)    params.set('search',    filtersRef.current.search);
      if (filtersRef.current.streaming) params.set('streaming', filtersRef.current.streaming);
      if (filtersRef.current.agent)     params.set('agent',     filtersRef.current.agent);

      const res = await fetch(`${API}/logs?${params}`);
      if (!res.ok) return;
      const data = await res.json() as { data: RequestLog[]; total: number };
      if (mountedRef.current) {
        setLogs(data.data);
        setTotal(data.total);
      }
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, []);

  // ── Fetch stats ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      if (!res.ok) return;
      const data = await res.json() as Stats;
      if (mountedRef.current) setStats(data);
    } catch { /* ignore */ }
  }, []);

  // ── React to WebSocket events ────────────────────────────────────────────
  useEffect(() => {
    onEvent((evt) => {
      if (evt.type === 'stats_update') {
        setStats(evt.stats);
        setTotal(evt.stats.total);
      }
      if (evt.type === 'request_complete') {
        if (pageRef.current === 1 && !filtersRef.current.search && !filtersRef.current.method && !filtersRef.current.streaming && !filtersRef.current.agent) {
          setLogs(prev => {
            if (prev.some(l => l.id === evt.log.id)) return prev;
            return [evt.log, ...prev].slice(0, pageSizeRef.current);
          });
        } else {
          fetchLogs(true);
        }
      }
    });
  }, [onEvent, fetchLogs]);

  // ── Initial load + re-fetch on filter/page change ───────────────────────
  useEffect(() => { fetchLogs(); }, [fetchLogs, page, pageSize, filters]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem(LS_KEY_FILTERS, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    localStorage.setItem(LS_KEY_PAGE_SIZE, String(pageSize));
  }, [pageSize]);

  // Reset to page 1 when filters change
  const setFilters = useCallback((f: FilterState) => {
    setFiltersRaw(f);
    setPage(1);
  }, []);

  const handleSetPageSize = useCallback((s: number) => {
    setPageSize(s);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersRaw({ search: '', method: '', streaming: '', agent: '' });
    setPage(1);
  }, []);

  const refresh = useCallback(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  // ── Clear all logs ───────────────────────────────────────────────────────
  const clearAll = useCallback(async () => {
    await fetch(`${API}/logs`, { method: 'DELETE' });
    setLogs([]);
    setTotal(0);
    setStats(DEFAULT_STATS);
    setPage(1);
  }, []);

  return { logs, stats, total, page, setPage, pageSize, setPageSize: handleSetPageSize, filters, setFilters, loading, refresh, clearAll, clearFilters };
}
