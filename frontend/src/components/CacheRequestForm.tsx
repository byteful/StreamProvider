import { useState } from 'react';
import type { RateLimitInfo } from '../types';

interface CacheRequestFormProps {
  rateLimit: RateLimitInfo | null;
  onSuccess: () => void;
}

export function CacheRequestForm({ rateLimit, onSuccess }: CacheRequestFormProps) {
  const [tmdbId, setTmdbId] = useState('');
  const [season, setSeason] = useState('');
  const [episode, setEpisode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!tmdbId.trim()) {
      setMessage({ type: 'error', text: 'TMDB ID REQUIRED' });
      return;
    }

    if ((season && !episode) || (!season && episode)) {
      setMessage({ type: 'error', text: 'SEASON & EPISODE REQUIRED TOGETHER' });
      return;
    }

    setLoading(true);

    try {
      const body: any = { tmdbId: tmdbId.trim() };
      if (season && episode) {
        body.season = parseInt(season);
        body.episode = parseInt(episode);
      }

      const res = await fetch('/api/cache/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        if (data.queued) {
          setTmdbId('');
          setSeason('');
          setEpisode('');
          onSuccess();
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'REQUEST FAILED' });
      }
    } catch {
      setMessage({ type: 'error', text: 'NETWORK ERROR' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] opacity-50" />
      
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-white mb-1">Inject Request</h2>
        <p className="text-xs text-[var(--text-secondary)]">Manually trigger cache process for specific media.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-1">TMDB Identifier</label>
          <div className="relative">
             <input
              type="text"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              placeholder="Movie ID / tt1234567"
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-white font-mono text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all placeholder:text-[var(--text-muted)]"
            />
            <div className="absolute right-3 top-3 text-[var(--text-muted)] text-xs font-mono opacity-50">ID</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
             <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-1">Season</label>
            <input
              type="number"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="01"
              min="1"
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-white font-mono text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div className="space-y-1">
             <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-1">Episode</label>
            <input
              type="number"
              value={episode}
              onChange={(e) => setEpisode(e.target.value)}
              placeholder="01"
              min="1"
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-white font-mono text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-xs font-mono border ${
            message.type === 'success' 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            <span className="mr-2">{message.type === 'success' ? '✓' : '⚠'}</span>
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] text-white rounded-lg font-bold text-sm uppercase tracking-wider hover:opacity-90 hover:shadow-[0_0_20px_var(--accent-glow)] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </span>
          ) : 'Initiate Sequence'}
        </button>
      </form>

      {rateLimit && (
        <div className="mt-6 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono border-t border-[var(--border)] pt-4">
          <span>API QUOTA</span>
          <span className="text-[var(--text-primary)]">{rateLimit.cacheRequest.remaining} REMAINING</span>
        </div>
      )}
    </div>
  );
}
