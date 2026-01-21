import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import PQueue from 'p-queue';
import { runScraper } from './scraperManager.ts';
import { chromium } from 'playwright';
import { initDatabase, pool } from './database.ts';
import { runCacheCleanup, getCachedStream } from './cacheService.ts';
import { checkScrapeRateLimit, checkCacheRequestRateLimit, getRateLimitInfo } from './rateLimiter.ts';
import {
    initPrecacheService,
    logRequest,
    getQueueStatus,
    submitManualCacheRequest,
    cleanupOldHistory,
    cleanupCompletedJobs
} from './precacheService.ts';
import { eventEmitter } from './eventEmitter.ts';
import { jobTracker } from './jobTracker.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 3000;
const MAX_WORKERS = Number(process.env.MAX_WORKERS || 10);
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const STATS_BROADCAST_INTERVAL_MS = 5000;

const queue = new PQueue({ concurrency: MAX_WORKERS });

const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu']
});
export const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
});

await initDatabase();
initPrecacheService(queue, runScraper);

setInterval(async () => {
    try {
        await runCacheCleanup();
        await cleanupOldHistory();
        await cleanupCompletedJobs();
    } catch (error: any) {
        console.error(`[Cache Cleanup Error] ${error.message}`);
    }
}, CLEANUP_INTERVAL_MS);

runCacheCleanup().catch(console.error);

async function broadcastStats(): Promise<void> {
    try {
        const [cacheStats, requestStats, queueStatus] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*) as total_cached,
                    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as cached_today,
                    COUNT(CASE WHEN last_accessed_at > NOW() - INTERVAL '1 hour' THEN 1 END) as accessed_last_hour
                FROM stream_cache
            `),
            pool.query(`
                SELECT
                    COUNT(*) as total_requests,
                    COUNT(CASE WHEN was_cached THEN 1 END) as cache_hits,
                    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as requests_today
                FROM request_history
            `),
            getQueueStatus()
        ]);

        const cache = cacheStats.rows[0];
        const requests = requestStats.rows[0];
        const jobStats = jobTracker.getStats();

        const totalRequests = parseInt(requests.total_requests, 10);
        const cacheHits = parseInt(requests.cache_hits, 10);
        const hitRate = totalRequests > 0 ? ((cacheHits / totalRequests) * 100).toFixed(1) : '0';

        eventEmitter.broadcastStats({
            cache: {
                totalCached: parseInt(cache.total_cached, 10),
                cachedToday: parseInt(cache.cached_today, 10),
                accessedLastHour: parseInt(cache.accessed_last_hour, 10)
            },
            requests: {
                total: totalRequests,
                cacheHits,
                cacheMisses: totalRequests - cacheHits,
                hitRate: `${hitRate}%`,
                requestsToday: parseInt(requests.requests_today, 10)
            },
            queue: queueStatus,
            activeJobs: jobStats,
            workers: {
                active: queue.pending,
                queued: queue.size,
                concurrency: MAX_WORKERS
            }
        });
    } catch (error: any) {
        console.error(`[Stats Broadcast Error] ${error.message}`);
    }
}

setInterval(broadcastStats, STATS_BROADCAST_INTERVAL_MS);

function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}

app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist'), { index: false }));

app.get('/api/events', (req: Request, res: Response): void => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    eventEmitter.addClient(res);

    broadcastStats();

    req.on('close', () => {
        eventEmitter.removeClient(res);
    });
});

async function handleStreamRequest(req: Request, res: Response): Promise<any> {
    const { tmdbId, season, episode } = req.query;
    const ip = getClientIp(req);

    if (!tmdbId) {
        return res.status(400).json({ error: "Missing tmdbId!" });
    }
    if ((season && !episode) || (!season && episode)) {
        return res.status(400).json({ error: "For TV shows, both season and episode need to be included!" });
    }

    const seasonNum = season ? Number(season) : undefined;
    const episodeNum = episode ? Number(episode) : undefined;

    try {
        const cached = await getCachedStream(tmdbId.toString(), seasonNum, episodeNum);

        if (cached) {
            await logRequest(ip, tmdbId.toString(), seasonNum, episodeNum, true);
            return res.json(cached);
        }

        const rateLimit = checkScrapeRateLimit(ip);
        if (!rateLimit.allowed) {
            res.set('Retry-After', String(rateLimit.retryAfter));
            return res.status(429).json({
                error: "Rate limit exceeded. This content is not cached.",
                retryAfter: rateLimit.retryAfter,
                cached: false
            });
        }

        const jobId = jobTracker.createJob(
            tmdbId.toString(),
            'direct',
            seasonNum,
            episodeNum,
            ip
        );

        const result = await queue.add(async () => {
            jobTracker.startJob(jobId);
            try {
                const data = await runScraper(tmdbId.toString(), seasonNum, episodeNum);
                jobTracker.completeJob(jobId);
                return data;
            } catch (error: any) {
                jobTracker.failJob(jobId, error.message);
                throw error;
            }
        }, {
            priority: 10
        });

        await logRequest(ip, tmdbId.toString(), seasonNum, episodeNum, false);

        return res.json(result);

    } catch (error: any) {
        console.error(`[Error] ${error.message}`);

        if (error.message.includes('Timeout')) {
            return res.status(408).json({ error: "Scraping timed out, no stream found." });
        }

        return res.status(500).json({ error: error.message || "Internal Server Error" });
    }
}

app.get('/', async (req: Request, res: Response): Promise<any> => {
    if (req.query.tmdbId) {
        return handleStreamRequest(req, res);
    }
    res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

app.get('/api/stream', handleStreamRequest);

app.get('/api/cache', async (req: Request, res: Response): Promise<any> => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    try {
        let query = `
            SELECT tmdb_id, season, episode, stream_url, referer, created_at, last_accessed_at
            FROM stream_cache
        `;
        const params: any[] = [];

        if (search) {
            query += ` WHERE tmdb_id ILIKE $1`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY last_accessed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const [dataResult, countResult] = await Promise.all([
            pool.query(query, params),
            pool.query(
                search
                    ? `SELECT COUNT(*) as total FROM stream_cache WHERE tmdb_id ILIKE $1`
                    : `SELECT COUNT(*) as total FROM stream_cache`,
                search ? [`%${search}%`] : []
            )
        ]);

        const total = parseInt(countResult.rows[0].total, 10);

        return res.json({
            data: dataResult.rows.map((row: any) => ({
                tmdbId: row.tmdb_id,
                season: row.season,
                episode: row.episode,
                streamUrl: row.stream_url,
                referer: row.referer,
                createdAt: row.created_at,
                lastAccessedAt: row.last_accessed_at
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/stats', async (_req: Request, res: Response): Promise<any> => {
    try {
        const [cacheStats, requestStats, queueStatus] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*) as total_cached,
                    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as cached_today,
                    COUNT(CASE WHEN last_accessed_at > NOW() - INTERVAL '1 hour' THEN 1 END) as accessed_last_hour
                FROM stream_cache
            `),
            pool.query(`
                SELECT
                    COUNT(*) as total_requests,
                    COUNT(CASE WHEN was_cached THEN 1 END) as cache_hits,
                    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as requests_today
                FROM request_history
            `),
            getQueueStatus()
        ]);

        const cache = cacheStats.rows[0];
        const requests = requestStats.rows[0];
        const jobStats = jobTracker.getStats();

        const totalRequests = parseInt(requests.total_requests, 10);
        const cacheHits = parseInt(requests.cache_hits, 10);
        const hitRate = totalRequests > 0 ? ((cacheHits / totalRequests) * 100).toFixed(1) : '0';

        return res.json({
            cache: {
                totalCached: parseInt(cache.total_cached, 10),
                cachedToday: parseInt(cache.cached_today, 10),
                accessedLastHour: parseInt(cache.accessed_last_hour, 10)
            },
            requests: {
                total: totalRequests,
                cacheHits,
                cacheMisses: totalRequests - cacheHits,
                hitRate: `${hitRate}%`,
                requestsToday: parseInt(requests.requests_today, 10)
            },
            queue: queueStatus,
            activeJobs: jobStats,
            workers: {
                active: queue.pending,
                queued: queue.size,
                concurrency: MAX_WORKERS
            }
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/jobs', async (_req: Request, res: Response): Promise<any> => {
    try {
        const inMemoryJobs = jobTracker.getRecentJobs(50);

        const queuedJobs = await pool.query(`
            SELECT id, tmdb_id, season, episode, status, priority, created_at, started_at, completed_at, error_message
            FROM precache_queue
            ORDER BY 
                CASE status 
                    WHEN 'processing' THEN 0 
                    WHEN 'pending' THEN 1 
                    WHEN 'failed' THEN 2 
                    ELSE 3 
                END,
                created_at DESC
            LIMIT 50
        `);

        const allJobs = [
            ...inMemoryJobs.map(job => ({
                id: job.id,
                tmdbId: job.tmdbId,
                season: job.season,
                episode: job.episode,
                source: job.source,
                status: job.status,
                createdAt: new Date(job.createdAt).toISOString(),
                startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
                completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
                error: job.error
            })),
            ...queuedJobs.rows.map((row: any) => ({
                id: `precache_${row.id}`,
                tmdbId: row.tmdb_id,
                season: row.season,
                episode: row.episode,
                source: row.priority >= 5 ? 'manual' : 'precache',
                status: row.status,
                createdAt: row.created_at,
                startedAt: row.started_at,
                completedAt: row.completed_at,
                error: row.error_message
            }))
        ];

        const uniqueJobs = Array.from(
            new Map(allJobs.map(job => [job.id, job])).values()
        ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return res.json({
            jobs: uniqueJobs.slice(0, 100),
            stats: jobTracker.getStats()
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/cache/request', async (req: Request, res: Response): Promise<any> => {
    const ip = getClientIp(req);
    const { tmdbId, season, episode } = req.body;

    if (!tmdbId) {
        return res.status(400).json({ error: "Missing tmdbId" });
    }

    if ((season !== undefined && episode === undefined) || (season === undefined && episode !== undefined)) {
        return res.status(400).json({ error: "For TV shows, both season and episode are required" });
    }

    const rateLimit = checkCacheRequestRateLimit(ip);
    if (!rateLimit.allowed) {
        res.set('Retry-After', String(rateLimit.retryAfter));
        return res.status(429).json({
            error: "Rate limit exceeded for cache requests",
            retryAfter: rateLimit.retryAfter
        });
    }

    try {
        const result = await submitManualCacheRequest(
            tmdbId.toString(),
            season !== undefined ? Number(season) : undefined,
            episode !== undefined ? Number(episode) : undefined
        );

        return res.json(result);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/queue', async (_req: Request, res: Response): Promise<any> => {
    try {
        const status = await getQueueStatus();
        return res.json(status);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/ratelimit', async (req: Request, res: Response): Promise<any> => {
    const ip = getClientIp(req);
    const info = getRateLimitInfo(ip);
    return res.json(info);
});

app.get('/{*splat}', (_req: Request, res: Response): void => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`StreamProvider running on http://localhost:${PORT}`);
});
