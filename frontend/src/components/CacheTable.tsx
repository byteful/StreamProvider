import { useState, useEffect, useCallback } from 'react';
import type { CacheEntry, CacheResponse } from '../types';

interface CacheTableProps {
  refreshTrigger: number;
}

export function CacheTable({ refreshTrigger }: CacheTableProps) {
  const [data, setData] = useState<CacheEntry[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchCache = useCallback(async (page: number, searchQuery: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (searchQuery) params.append('search', searchQuery);

      const res = await fetch(`/api/cache?${params}`);
      const json: CacheResponse = await res.json();
      setData(json.data);
      setPagination(json.pagination);
    } catch (error) {
      console.error('Failed to fetch cache:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCache(pagination.page, search);
  }, [refreshTrigger]);

  const handleSearch = () => {
    fetchCache(1, search);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full min-h-[500px]">
      <div className="flex flex-col md:flex-row justify-between items-center p-6 border-b border-[var(--border)] bg-[var(--bg-glass)] backdrop-blur-xl">
        <div className="mb-4 md:mb-0">
          <h2 className="text-xl font-bold tracking-tight">Cached Data Stream</h2>
          <div className="text-xs text-[var(--text-secondary)] mt-1 font-mono">
            {pagination.total.toLocaleString()} RECORDS INDEXED
          </div>
        </div>
        
        <div className="relative w-full md:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Search TMDB ID..."
            className="w-full px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full text-sm focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--text-muted)]"
          />
          <button
             onClick={handleSearch}
             className="absolute right-2 top-1.5 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-mono">
              <th className="px-6 py-4 font-normal">TMDB ID</th>
              <th className="px-6 py-4 font-normal">Type/Episode</th>
              <th className="px-6 py-4 font-normal">Stream URL</th>
              <th className="px-6 py-4 font-normal text-right">Last Access</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-24 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-24 text-center text-[var(--text-secondary)]">
                  <div className="text-2xl mb-2 opacity-30">⚡</div>
                  <p className="font-mono text-xs">No data stream found</p>
                </td>
              </tr>
            ) : (
              data.map((entry, idx) => (
                <tr 
                  key={idx} 
                  className="group border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-glass)] transition-colors"
                >
                  <td className="px-6 py-4 font-mono text-[var(--accent-secondary)] group-hover:text-[var(--accent)] transition-colors">
                    {entry.tmdbId}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${
                      entry.season !== null 
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {entry.season !== null ? `S${entry.season} E${entry.episode}` : 'MOVIE'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="max-w-[200px] lg:max-w-md truncate font-mono text-xs text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors select-all cursor-pointer" title={entry.streamUrl}>
                      {entry.streamUrl}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-xs text-[var(--text-muted)]">
                    {timeAgo(entry.lastAccessedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center p-4 border-t border-[var(--border)] bg-[var(--bg-glass)] backdrop-blur-xl">
        <button
          onClick={() => fetchCache(pagination.page - 1, search)}
          disabled={pagination.page <= 1}
          className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-white disabled:opacity-30 transition-colors"
        >
          ← Prev
        </button>
        <span className="font-mono text-xs text-[var(--text-muted)]">
          PAGE {pagination.page} / {pagination.totalPages || 1}
        </span>
        <button
          onClick={() => fetchCache(pagination.page + 1, search)}
          disabled={pagination.page >= pagination.totalPages}
          className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-white disabled:opacity-30 transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
