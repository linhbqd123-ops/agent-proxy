import { Activity, Zap, AlertTriangle, Timer, Coins, Brain, Database, Save, Code2, MessageSquare } from 'lucide-react';
import type { Stats } from '../types';

interface StatBarProps { stats: Stats; }

function CompactCard({ icon, label, value, sub, iconBg, iconColor, valueColor = 'text-slate-800' }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
}) {
  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <span className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center ${iconColor}`}>
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`text-xl font-bold ${valueColor}`}>{value}</span>
        {sub && <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{sub}</span>}
      </div>
    </div>
  );
}

function TokenDetailCard({ icon, label, value, stats, iconBg, iconColor, valueColor = 'text-slate-800' }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  stats: { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number };
  iconBg: string;
  iconColor: string;
  valueColor?: string;
}) {
  const total = stats.input + stats.output;
  const show = total > 0;
  const pIn = show ? (stats.input / total) * 100 : 0;
  const pOut = show ? (stats.output / total) * 100 : 0;

  return (
    <div className="card p-4 animate-fade-in flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <span className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center ${iconColor}`}>
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-xl font-bold ${valueColor}`}>{value}</span>
        <span className="text-xs text-slate-400 font-medium">tokens</span>
      </div>
      {show && (
        <>
          <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-slate-100">
            <div style={{ width: `${pIn}%` }} className="bg-brand-500 transition-all duration-300" title={`Input: ${stats.input.toLocaleString()}`} />
            <div style={{ width: `${pOut}%` }} className="bg-violet-500 transition-all duration-300" title={`Output: ${stats.output.toLocaleString()}`} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
            <div className="flex items-center justify-between">
              <span className="text-brand-600 font-medium">In</span>
              <span className="text-slate-600">{stats.input.toLocaleString()}</span>
              <span className="text-slate-400 w-[3ch] text-right">{Math.round(pIn)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-violet-600 font-medium">Out</span>
              <span className="text-slate-600">{stats.output.toLocaleString()}</span>
              <span className="text-slate-400 w-[3ch] text-right">{Math.round(pOut)}%</span>
            </div>
            {stats.cacheRead > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-emerald-600 font-medium">Cache Hit</span>
                <span className="text-slate-600">{stats.cacheRead.toLocaleString()}</span>
              </div>
            )}
            {stats.cacheWrite > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-blue-600 font-medium">Cache Save</span>
                <span className="text-slate-600">{stats.cacheWrite.toLocaleString()}</span>
              </div>
            )}
            {stats.reasoning > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-purple-600 font-medium">Reasoning</span>
                <span className="text-slate-600">{stats.reasoning.toLocaleString()}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function StatBar({ stats }: StatBarProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: compact stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <CompactCard
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Requests"
          value={stats.total.toLocaleString()}
          iconBg="bg-brand-50"
          iconColor="text-brand-600"
        />
        <CompactCard
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Streaming"
          value={stats.streaming.toLocaleString()}
          sub={stats.total > 0 ? `${Math.round((stats.streaming / stats.total) * 100)}%` : ''}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <CompactCard
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label="Errors"
          value={stats.errors.toLocaleString()}
          sub={stats.total > 0 ? `${Math.round((stats.errors / stats.total) * 100)}%` : ''}
          iconBg={stats.errors > 0 ? 'bg-red-50' : 'bg-slate-50'}
          iconColor={stats.errors > 0 ? 'text-red-500' : 'text-slate-400'}
          valueColor={stats.errors > 0 ? 'text-red-600' : 'text-slate-800'}
        />
        <CompactCard
          icon={<Timer className="w-3.5 h-3.5" />}
          label="Avg Duration"
          value={stats.avg_duration_ms.toLocaleString()}
          sub="ms"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <CompactCard
          icon={<Database className="w-3.5 h-3.5" />}
          label="Cache Hit"
          value={(stats.total_cache_read_tokens || 0).toLocaleString()}
          sub="tokens"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          valueColor="text-emerald-700"
        />
        <CompactCard
          icon={<Save className="w-3.5 h-3.5" />}
          label="Cache Save"
          value={(stats.total_cache_write_tokens || 0).toLocaleString()}
          sub="tokens"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          valueColor="text-blue-700"
        />
        <CompactCard
          icon={<Brain className="w-3.5 h-3.5" />}
          label="Reasoning"
          value={(stats.total_reasoning_tokens || 0).toLocaleString()}
          sub="tokens"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          valueColor="text-purple-700"
        />
      </div>

      {/* Row 2: token detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TokenDetailCard
          icon={<Coins className="w-3.5 h-3.5" />}
          label="Total Tokens"
          value={(stats.total_tokens || 0).toLocaleString()}
          stats={{
            input: stats.total_prompt_tokens || 0,
            output: stats.total_completion_tokens || 0,
            cacheRead: stats.total_cache_read_tokens || 0,
            cacheWrite: stats.total_cache_write_tokens || 0,
            reasoning: stats.total_reasoning_tokens || 0,
          }}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          valueColor="text-amber-700"
        />
        <TokenDetailCard
          icon={<MessageSquare className="w-3.5 h-3.5" />}
          label="Chat"
          value={(stats.total_normal_tokens || 0).toLocaleString()}
          stats={{
            input: stats.total_normal_prompt_tokens || 0,
            output: stats.total_normal_completion_tokens || 0,
            cacheRead: 0,
            cacheWrite: 0,
            reasoning: 0,
          }}
          iconBg="bg-sky-50"
          iconColor="text-sky-600"
          valueColor="text-sky-700"
        />
        <TokenDetailCard
          icon={<Code2 className="w-3.5 h-3.5" />}
          label="Code Completion"
          value={(stats.total_code_completion_tokens || 0).toLocaleString()}
          stats={{
            input: stats.total_cc_prompt_tokens || 0,
            output: stats.total_cc_completion_tokens || 0,
            cacheRead: 0,
            cacheWrite: 0,
            reasoning: 0,
          }}
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          valueColor="text-orange-700"
        />
      </div>
    </div>
  );
}
