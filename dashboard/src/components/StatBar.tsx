import { Activity, Zap, AlertTriangle, Timer, Coins, Brain, Database, Save, Code2, MessageSquare } from 'lucide-react';
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

  const normalSum = (stats.total_normal_prompt_tokens || 0) + (stats.total_normal_completion_tokens || 0);
  const showNormal = normalSum > 0;
  const normalIn = showNormal ? Math.round((stats.total_normal_prompt_tokens / normalSum) * 100) : 0;
  const normalOut = showNormal ? Math.round((stats.total_normal_completion_tokens / normalSum) * 100) : 0;

  const ccSum = (stats.total_cc_prompt_tokens || 0) + (stats.total_cc_completion_tokens || 0);
  const showCc = ccSum > 0;
  const ccIn = showCc ? Math.round((stats.total_cc_prompt_tokens / ccSum) * 100) : 0;
  const ccOut = showCc ? Math.round((stats.total_cc_completion_tokens / ccSum) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-4">
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
      <StatCard
        icon={<MessageSquare className="w-4 h-4" />}
        label="Chat"
        value={(stats.total_normal_tokens || 0).toLocaleString()}
        sub={showNormal ? `In: ${normalIn}% · Out: ${normalOut}%` : undefined}
        iconBg="bg-sky-50"
        iconColor="text-sky-600"
        valueColor="text-sky-700"
      />
      <StatCard
        icon={<Code2 className="w-4 h-4" />}
        label="Code Completion"
        value={(stats.total_code_completion_tokens || 0).toLocaleString()}
        sub={showCc ? `In: ${ccIn}% · Out: ${ccOut}%` : undefined}
        iconBg="bg-orange-50"
        iconColor="text-orange-600"
        valueColor="text-orange-700"
      />
      <StatCard
        icon={<Database className="w-4 h-4" />}
        label="Cache Hit"
        value={(stats.total_cache_read_tokens || 0).toLocaleString()}
        sub="tokens"
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        valueColor="text-emerald-700"
      />
      <StatCard
        icon={<Save className="w-4 h-4" />}
        label="Cache Save"
        value={(stats.total_cache_write_tokens || 0).toLocaleString()}
        sub="tokens"
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        valueColor="text-blue-700"
      />
      <StatCard
        icon={<Brain className="w-4 h-4" />}
        label="Reasoning"
        value={(stats.total_reasoning_tokens || 0).toLocaleString()}
        sub="thinking tokens"
        iconBg="bg-purple-50"
        iconColor="text-purple-600"
        valueColor="text-purple-700"
      />
    </div>
  );
}
