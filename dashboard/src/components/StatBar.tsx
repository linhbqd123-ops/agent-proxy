import { Activity, Zap, AlertTriangle, Timer, Coins } from 'lucide-react';
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
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`text-2xl font-bold ${valueColor}`}>{value}</span>
        {sub && <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{sub}</span>}
      </div>
    </div>
  );
}

export function StatBar({ stats }: StatBarProps) {
  const promptPlusCompletion = (stats.total_prompt_tokens || 0) + (stats.total_completion_tokens || 0);
  const showRatio = promptPlusCompletion > 0;
  const inputPercent = showRatio ? Math.round((stats.total_prompt_tokens / promptPlusCompletion) * 100) : 0;
  const outputPercent = showRatio ? Math.round((stats.total_completion_tokens / promptPlusCompletion) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
      <StatCard
        icon={<Coins className="w-4 h-4" />}
        label="Total Tokens"
        value={(stats.total_tokens || 0).toLocaleString()}
        sub={showRatio ? `In: ${inputPercent}% · Out: ${outputPercent}%` : ''}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        valueColor="text-amber-700"
      />
    </div>
  );
}
