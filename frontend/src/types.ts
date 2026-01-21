export interface Stats {
  cache: {
    totalCached: number;
    cachedToday: number;
    accessedLastHour: number;
  };
  requests: {
    total: number;
    cacheHits: number;
    cacheMisses: number;
    hitRate: string;
    requestsToday: number;
  };
  queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  activeJobs: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  };
  workers: {
    active: number;
    queued: number;
    concurrency: number;
  };
}

export interface Job {
  id: string;
  tmdbId: string;
  season?: number;
  episode?: number;
  source: 'direct' | 'precache' | 'manual';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface CacheEntry {
  tmdbId: string;
  season: number | null;
  episode: number | null;
  streamUrl: string;
  referer: string | null;
  createdAt: string;
  lastAccessedAt: string;
}

export interface CacheResponse {
  data: CacheEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface RateLimitInfo {
  scrape: {
    remaining: number;
    minuteReset: number;
    hourReset: number;
  };
  cacheRequest: {
    remaining: number;
    reset: number;
  };
}
