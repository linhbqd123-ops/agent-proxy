import { Activity, Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { WsStatus } from '../hooks/useWebSocket';

interface HeaderProps {
  wsStatus: WsStatus;
}

export function Header({ wsStatus }: HeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-sm">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-800 leading-none">
              Copilot Traffic Monitor
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Proxy on{' '}
              <span className="font-mono text-slate-500">localhost:4000</span>
            </p>
          </div>
        </div>

        {/* WS status */}
        <div className="flex items-center gap-2 text-xs">
          {wsStatus === 'connected' && (
            <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <Wifi className="w-3.5 h-3.5" />
              Live
            </span>
          )}
          {wsStatus === 'connecting' && (
            <span className="flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Connecting…
            </span>
          )}
          {wsStatus === 'disconnected' && (
            <span className="flex items-center gap-1.5 text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
              <WifiOff className="w-3.5 h-3.5" />
              Disconnected
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
