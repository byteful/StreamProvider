import { useState, useEffect, useCallback } from 'react';
import { useSSE } from './hooks/useSSE';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { CacheTable } from './components/CacheTable';
import { JobsList } from './components/JobsList';
import { CacheRequestForm } from './components/CacheRequestForm';
import type { Stats, Job, RateLimitInfo } from './types';

function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [cacheRefreshTrigger, setCacheRefreshTrigger] = useState(0);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      setJobs(data.jobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  }, []);

  const fetchRateLimit = useCallback(async () => {
    try {
      const res = await fetch('/api/ratelimit');
      const data = await res.json();
      setRateLimit(data);
    } catch (error) {
      console.error('Failed to fetch rate limit:', error);
    }
  }, []);

  const { connected } = useSSE({
    onStats: (data) => {
      setStats(data);
    },
    onJobCreated: (data) => {
      setJobs((prev) => {
        const exists = prev.some((j) => j.id === data.id);
        if (exists) return prev;
        const newJob: Job = {
          id: data.id,
          tmdbId: data.tmdbId,
          season: data.season,
          episode: data.episode,
          source: data.source,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        };
        return [newJob, ...prev].slice(0, 100);
      });
    },
    onJobStarted: (data) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === data.id
            ? { ...j, status: 'processing', startedAt: new Date().toISOString() }
            : j
        )
      );
    },
    onJobCompleted: (data) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === data.id
            ? { ...j, status: 'completed', completedAt: new Date().toISOString() }
            : j
        )
      );
      if (data.cached) {
        setCacheRefreshTrigger((t) => t + 1);
      }
    },
    onJobFailed: (data) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === data.id
            ? { ...j, status: 'failed', completedAt: new Date().toISOString(), error: data.error }
            : j
        )
      );
    },
    onCacheUpdated: () => {
      setCacheRefreshTrigger((t) => t + 1);
    },
    onConnected: () => {
      fetchJobs();
      fetchRateLimit();
    },
  });

  useEffect(() => {
    fetchJobs();
    fetchRateLimit();

    const interval = setInterval(fetchRateLimit, 30000);
    return () => clearInterval(interval);
  }, [fetchJobs, fetchRateLimit]);

  const handleCacheRequestSuccess = () => {
    fetchJobs();
    fetchRateLimit();
  };

  return (
    <div className="min-h-screen text-[var(--text-primary)] selection:bg-[var(--accent)] selection:text-white">
      {/* Background Ambience */}
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none z-0 mix-blend-overlay"></div>
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 blur-[120px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none z-0"></div>

      <div className="max-w-[1600px] mx-auto p-6 md:p-8 relative z-10 animate-slide-up">
        <Header
          connected={connected}
          scrapeRemaining={rateLimit?.scrape.remaining ?? 0}
        />

        <div className="space-y-6">
          <StatsCards stats={stats} connected={connected} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 xl:col-span-9 h-full">
              <CacheTable refreshTrigger={cacheRefreshTrigger} />
            </div>

            <div className="lg:col-span-4 xl:col-span-3 space-y-6 sticky top-6">
              <CacheRequestForm
                rateLimit={rateLimit}
                onSuccess={handleCacheRequestSuccess}
              />
              <JobsList jobs={jobs} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
