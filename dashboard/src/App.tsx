import { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { StatBar } from './components/StatBar';
import { RequestTable } from './components/RequestTable';
import { RequestDetail } from './components/RequestDetail';
import { useWebSocket } from './hooks/useWebSocket';
import { useRequests } from './hooks/useRequests';
import type { RequestLog } from './types';

export default function App() {
  const { lastEvent, status: wsStatus } = useWebSocket();
  const {
    logs, stats, total, page, setPage,
    filters, setFilters,
    loading, clearAll,
  } = useRequests(lastEvent);

  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);

  const handleSelect  = useCallback((log: RequestLog) => {
    setSelectedLog(prev => prev?.id === log.id ? null : log);
  }, []);
  const handleClose   = useCallback(() => setSelectedLog(null), []);
  const handleClear   = useCallback(async () => {
    await clearAll();
    setSelectedLog(null);
  }, [clearAll]);

  const detailOpen = !!selectedLog;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header wsStatus={wsStatus} />

      <main className="flex-1 flex flex-col max-w-[1600px] mx-auto w-full px-6 py-6 gap-5 min-h-0">

        {/* Stat cards */}
        <StatBar stats={stats} />

        {/* Content row */}
        <div className={['flex gap-5 min-h-0 flex-1', detailOpen ? 'flex-col lg:flex-row' : ''].join(' ')}>

          {/* Table */}
          <div className={['flex-1 min-w-0', detailOpen ? 'lg:w-1/2' : ''].join(' ')}>
            <RequestTable
              logs={logs}
              total={total}
              page={page}
              setPage={setPage}
              loading={loading}
              filters={filters}
              setFilters={setFilters}
              onSelect={handleSelect}
              selectedId={selectedLog?.id ?? null}
              onClear={handleClear}
            />
          </div>

          {/* Detail panel */}
          {detailOpen && (
            <div
              className="lg:w-[480px] xl:w-[540px] shrink-0
                         card overflow-hidden flex flex-col
                         max-h-[80vh] lg:max-h-none
                         lg:sticky lg:top-[57px]
                         lg:h-[calc(100vh-57px-3rem)]"
            >
              <RequestDetail log={selectedLog} onClose={handleClose} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
