import type { Job } from '../types';

interface JobsListProps {
  jobs: Job[];
}

export function JobsList({ jobs }: JobsListProps) {
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'processing');
  const recentJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed').slice(0, 15);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full max-h-[600px]">
      <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-glass)] backdrop-blur-md flex justify-between items-center sticky top-0 z-10">
        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--accent)] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse"></span>
          Job Queue
        </h2>
        <span className="text-xs text-[var(--text-muted)] font-mono">{jobs.length} TOTAL</span>
      </div>

      <div className="overflow-y-auto p-2 space-y-2 custom-scrollbar flex-1">
        {/* Active Jobs Section */}
        {activeJobs.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 px-2">Processing</h3>
            <div className="space-y-2">
              {activeJobs.map(job => (
                <JobItem key={job.id} job={job} timeAgo={timeAgo} isActive={true} />
              ))}
            </div>
          </div>
        )}

        {/* Recent Jobs Section */}
        {recentJobs.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 px-2">History</h3>
            <div className="space-y-1">
              {recentJobs.map(job => (
                <JobItem key={job.id} job={job} timeAgo={timeAgo} />
              ))}
            </div>
          </div>
        )}

        {jobs.length === 0 && (
          <div className="text-center py-12 text-[var(--text-muted)]">
            <div className="text-4xl mb-3 opacity-20">⚡</div>
            <p className="text-sm font-mono">System Idle</p>
          </div>
        )}
      </div>
    </div>
  );
}

function JobItem({ job, timeAgo, isActive = false }: { job: Job, timeAgo: (s: string) => string, isActive?: boolean }) {
  const statusColors = {
    pending: 'text-amber-400 border-amber-400/20 bg-amber-400/5',
    processing: 'text-blue-400 border-blue-400/20 bg-blue-400/5',
    completed: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5',
    failed: 'text-red-400 border-red-400/20 bg-red-400/5',
  };

  const sourceColors = {
    direct: 'text-purple-400',
    precache: 'text-cyan-400',
    manual: 'text-pink-400',
  };

  return (
    <div className={`
      relative group flex items-center justify-between p-3 rounded-lg border transition-all duration-200
      ${isActive ? 'border-[var(--accent)] bg-[var(--bg-hover)]' : 'border-transparent hover:bg-[var(--bg-glass)] hover:border-[var(--border)]'}
    `}>
      <div className="flex items-center gap-3">
        <div className={`w-1.5 h-1.5 rounded-full ${isActive && job.status === 'processing' ? 'bg-blue-400 animate-ping' : 'bg-[var(--border)]'}`} />
        
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-[var(--text-primary)]">{job.tmdbId}</span>
            {job.season !== undefined && (
              <span className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1.5 rounded">
                S{job.season} E{job.episode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
             <span className={`text-[10px] uppercase font-bold tracking-wider ${sourceColors[job.source]}`}>
              {job.source}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              {timeAgo(job.createdAt)} ago
            </span>
          </div>
        </div>
      </div>

      <div className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${statusColors[job.status]}`}>
        {job.status}
      </div>
    </div>
  );
}
