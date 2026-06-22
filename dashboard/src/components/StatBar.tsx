import { Activity, Zap, AlertTriangle, Timer } from 'lucide-react';
import type { Stats } from '../types';

interface StatBarProps { stats: Stats; }

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
}

function StatCard({ icon, label, value, sub, iconBg, iconColor, valueColor = 'text-slate-800' }: StatCardProps) {
  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <span className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center ${iconColor}`}>
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold ${valueColor}`}>{value}</span>
        {sub && <span className="text-sm text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

export function StatBar({ stats }: StatBarProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={<Activity className="w-4 h-4" />}
        label="Total Requests"
        value={stats.total.toLocaleString()}
        iconBg="bg-brand-50"
        iconColor="text-brand-600"
      />
      <StatCard
        icon={<Zap className="w-4 h-4" />}
        label="Streaming (SSE)"
        value={stats.streaming.toLocaleString()}
        sub={stats.total > 0 ? `${Math.round((stats.streaming / stats.total) * 100)}%` : ''}
        iconBg="bg-violet-50"
        iconColor="text-violet-600"
      />
      <StatCard
        icon={<AlertTriangle className="w-4 h-4" />}
        label="Errors"
        value={stats.errors.toLocaleString()}
        sub={stats.total > 0 ? `${Math.round((stats.errors / stats.total) * 100)}%` : ''}
        iconBg={stats.errors > 0 ? 'bg-red-50' : 'bg-slate-50'}
        iconColor={stats.errors > 0 ? 'text-red-500' : 'text-slate-400'}
        valueColor={stats.errors > 0 ? 'text-red-600' : 'text-slate-800'}
      />
      <StatCard
        icon={<Timer className="w-4 h-4" />}
        label="Avg Duration"
        value={stats.avg_duration_ms.toLocaleString()}
        sub="ms"
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
      />
    </div>
  );
}
