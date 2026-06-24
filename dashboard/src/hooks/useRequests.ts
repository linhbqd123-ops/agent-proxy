import { useState, useEffect, useCallback, useRef } from 'react';
import type { RequestLog, Stats, WsEvent, FilterState } from '../types';

const API = '/api';

export interface UseRequestsReturn {
  logs: RequestLog[];
  stats: Stats;
  total: number;
  page: number;
  setPage: (p: number) => void;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  loading: boolean;
  refresh: () => void;
  clearAll: () => Promise<void>;
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
const PAGE_SIZE = 50;

export function useRequests(lastEvent: WsEvent | null): UseRequestsReturn {
  const [logs,    setLogs]    = useState<RequestLog[]>([]);
  const [stats,   setStats]   = useState<Stats>(DEFAULT_STATS);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFiltersRaw] = useState<FilterState>({
    search: '', method: '', streaming: '',
  });

  // Track whether the component is still mounted
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // ── Fetch logs from REST API ─────────────────────────────────────────────
  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page:  String(page),
        limit: String(PAGE_SIZE),
      });
      if (filters.method)    params.set('method',    filters.method);
      if (filters.search)    params.set('search',    filters.search);
      if (filters.streaming) params.set('streaming', filters.streaming);

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
  }, [page, filters]);

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
    if (!lastEvent) return;
    if (lastEvent.type === 'stats_update') {
      setStats(lastEvent.stats);
    }
    if (lastEvent.type === 'request_complete') {
      // Prepend new log at the top of page 1 (if on page 1, no active filters)
      if (page === 1 && !filters.search && !filters.method && !filters.streaming) {
        setLogs(prev => {
          const next = [lastEvent.log, ...prev];
          return next.slice(0, PAGE_SIZE);
        });
        setTotal(prev => prev + 1);
      } else {
        // Silently refresh to keep counts accurate
        fetchLogs(true);
      }
    }
  }, [lastEvent, page, filters, fetchLogs]);

  // ── Initial load + re-fetch on filter/page change ───────────────────────
  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Reset to page 1 when filters change
  const setFilters = useCallback((f: FilterState) => {
    setFiltersRaw(f);
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

  return { logs, stats, total, page, setPage, filters, setFilters, loading, refresh, clearAll };
}
