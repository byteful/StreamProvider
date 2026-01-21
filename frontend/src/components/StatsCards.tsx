import type { Stats } from '../types';

interface StatsCardsProps {
  stats: Stats | null;
  connected: boolean;
}

export function StatsCards({ stats, connected }: StatsCardsProps) {
  const statsList = [
    {
      label: "Total Cached",
      value: stats?.cache.totalCached ?? '--',
      color: "var(--accent)"
    },
    {
      label: "Cached Today",
      value: stats?.cache.cachedToday ?? '--',
      color: "var(--accent-secondary)"
    },
    {
      label: "Hit Rate",
      value: stats?.requests.hitRate ?? '--',
      color: "var(--success)"
    },
    {
      label: "Active Workers",
      value: stats?.workers.active ?? '--',
      color: "var(--warning)"
    },
    {
      label: "Pending Jobs",
      value: (stats?.queue.pending ?? 0) + (stats?.activeJobs.pending ?? 0),
      color: "var(--info)"
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      {/* Connection Status Card */}
      <div className={`glass-panel rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group border-l-4 ${connected ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
        <div className={`absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-100 transition-opacity`}>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
        </div>
        <span className="text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">System Status</span>
        <div className={`text-xl font-bold mt-1 ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          {connected ? 'OPERATIONAL' : 'OFFLINE'}
        </div>
      </div>

      {statsList.map((stat, idx) => (
        <StatCard key={idx} {...stat} index={idx} />
      ))}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  color: string;
  index: number;
}

function StatCard({ label, value, color, index }: StatCardProps) {
  return (
    <div 
      className="glass-panel glass-panel-hover rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div 
        className="absolute top-0 right-0 w-16 h-16 opacity-5 pointer-events-none"
        style={{ 
          background: `radial-gradient(circle at top right, ${color}, transparent 70%)` 
        }}
      />
      <span className="text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider z-10">{label}</span>
      <div className="text-2xl font-bold mt-2 font-mono tracking-tight z-10" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
