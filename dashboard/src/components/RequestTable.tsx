import React, { useState, useEffect } from 'react';
import { Search, Trash2, ChevronLeft, ChevronRight, Loader2, Zap, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { RequestLog, FilterState } from '../types';

interface RequestTableProps {
  logs: RequestLog[];
  total: number;
  page: number;
  setPage: (page: number) => void;
  loading: boolean;
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  onSelect: (log: RequestLog) => void;
  selectedId: number | null;
  onClear: () => void;
}

const PAGE_SIZE = 50;

export function RequestTable({
  logs,
  total,
  page,
  setPage,
  loading,
  filters,
  setFilters,
  onSelect,
  selectedId,
  onClear,
}: RequestTableProps) {
  // Local state for search input to allow debouncing
  const [localSearch, setLocalSearch] = useState(filters.search);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== filters.search) {
        setFilters({ ...filters, search: localSearch });
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [localSearch, filters, setFilters]);

  // Keep local search in sync if filters change externally
  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  const handleMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, method: e.target.value });
  };

  const handleStreamingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ ...filters, streaming: e.target.value });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const startRange = (page - 1) * PAGE_SIZE + 1;
  const endRange = Math.min(page * PAGE_SIZE, total);

  const getStatusBadgeClass = (status: number, hasError: boolean) => {
    if (hasError || status >= 500) return 'badge-red';
    if (status >= 400) return 'badge-amber';
    if (status >= 300) return 'badge-blue';
    if (status >= 200) return 'badge-green';
    return 'badge-gray';
  };

  const getMethodBadgeClass = (method: string) => {
    const m = method.toUpperCase();
    if (m === 'GET') return 'badge-blue';
    if (m === 'POST') return 'badge-green';
    if (m === 'PUT') return 'badge-violet';
    if (m === 'DELETE') return 'badge-red';
    return 'badge-gray';
  };

  return (
    <div className="card flex flex-col h-full min-h-0 bg-white">
      {/* ── Filters Bar ─────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-50 rounded-t-xl">
        <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] md:max-w-xs">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search path, headers, body..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="input pl-9 w-full"
            />
          </div>

          {/* Method Filter */}
          <select
            value={filters.method}
            onChange={handleMethodChange}
            className="input pr-8 appearance-none bg-no-repeat bg-[right_0.5rem_center] bg-[length:1.25em_1.25em]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            }}
          >
            <option value="">All Methods</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>

          {/* Streaming Filter */}
          <select
            value={filters.streaming}
            onChange={handleStreamingChange}
            className="input pr-8 appearance-none bg-no-repeat bg-[right_0.5rem_center] bg-[length:1.25em_1.25em]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            }}
          >
            <option value="">All Types</option>
            <option value="true">SSE (Streaming)</option>
            <option value="false">Standard</option>
          </select>
        </div>

        {/* Clear Button */}
        <button
          onClick={onClear}
          className="btn-danger w-full md:w-auto justify-center"
          title="Clear all recorded requests"
        >
          <Trash2 className="w-4 h-4" />
          Clear All
        </button>
      </div>

      {/* ── Table / Grid Container ───────────────────────────────────────── */}
      <div className="flex-1 overflow-x-auto overflow-y-auto relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 backdrop-blur-[1px]">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          </div>
        )}

        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50/70 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-600 w-20">Status</th>
              <th className="px-4 py-3 font-semibold text-slate-600 w-24">Method</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Path</th>
              <th className="px-4 py-3 font-semibold text-slate-600 w-36">Host</th>
              <th className="px-4 py-3 font-semibold text-slate-600 w-24 text-right">Duration</th>
              <th className="px-4 py-3 font-semibold text-slate-600 w-20 text-center">Type</th>
              <th className="px-4 py-3 font-semibold text-slate-600 w-32 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <HelpCircle className="w-8 h-8 text-slate-300" />
                    <span>No requests found matching filters.</span>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isSelected = selectedId === log.id;
                const hasError = !!log.error;
                const isStreaming = log.is_streaming === 1;

                return (
                  <tr
                    key={log.id}
                    onClick={() => onSelect(log)}
                    className={[
                      'tr-hover group',
                      isSelected ? 'bg-brand-50/80 hover:bg-brand-50 font-medium' : '',
                    ].join(' ')}
                  >
                    {/* Status */}
                    <td className="px-4 py-3.5 align-middle">
                      <span className={getStatusBadgeClass(log.response_status, hasError)}>
                        {hasError ? 'ERR' : log.response_status || '—'}
                      </span>
                    </td>

                    {/* Method */}
                    <td className="px-4 py-3.5 align-middle">
                      <span className={getMethodBadgeClass(log.method)}>
                        {log.method}
                      </span>
                    </td>

                    {/* Path */}
                    <td className="px-4 py-3.5 align-middle font-mono text-xs text-slate-800 break-all max-w-xs md:max-w-md lg:max-w-lg">
                      <span className={isSelected ? 'text-brand-700' : 'text-slate-800'}>
                        {log.path}
                      </span>
                    </td>

                    {/* Host */}
                    <td className="px-4 py-3.5 align-middle text-slate-500 font-mono text-xs truncate max-w-[120px]">
                      {log.host}
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3.5 align-middle text-right font-mono text-xs text-slate-600">
                      {log.duration_ms.toLocaleString()} ms
                    </td>

                    {/* Streaming (Type) */}
                    <td className="px-4 py-3.5 align-middle text-center">
                      {isStreaming ? (
                        <span className="badge-violet" title="Server-Sent Events (Streaming)">
                          <Zap className="w-3 h-3 text-violet-600" /> SSE
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3.5 align-middle text-right font-mono text-xs text-slate-400 whitespace-nowrap">
                      {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination Footer ────────────────────────────────────────────── */}
      <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-b-xl text-xs text-slate-500">
        <div>
          {total > 0 ? (
            <span>
              Showing <strong className="font-semibold text-slate-700">{startRange}</strong> to{' '}
              <strong className="font-semibold text-slate-700">{endRange}</strong> of{' '}
              <strong className="font-semibold text-slate-700">{total}</strong> requests
            </span>
          ) : (
            <span>0 requests</span>
          )}
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1 || loading}
            className="btn-ghost p-1.5 disabled:opacity-40 disabled:hover:bg-transparent"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="flex items-center px-2 font-medium text-slate-700">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages || loading}
            className="btn-ghost p-1.5 disabled:opacity-40 disabled:hover:bg-transparent"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
