import { pool } from './database.ts';
import { getSeasonInfo } from './tmdbService.ts';
import { eventEmitter } from './eventEmitter.ts';
import type PQueue from 'p-queue';

const PRECACHE_THRESHOLD = 2;
const MAX_PRECACHE_EPISODES = 15;

let workerQueue: PQueue | null = null;
let runScraperFn: ((tmdbId: string, season?: number, episode?: number) => Promise<any>) | null = null;

export function initPrecacheService(
    queue: PQueue,
    scraper: (tmdbId: string, season?: number, episode?: number) => Promise<any>
): void {
    workerQueue = queue;
    runScraperFn = scraper;
}

export async function logRequest(
    ip: string,
    tmdbId: string,
    season: number | undefined,
    episode: number | undefined,
    wasCached: boolean
): Promise<void> {
    await pool.query(
        `INSERT INTO request_history (ip_address, tmdb_id, season, episode, was_cached)
         VALUES ($1, $2, $3, $4, $5)`,
        [ip, tmdbId, season ?? null, episode ?? null, wasCached]
    );

    if (season !== undefined && episode !== undefined) {
        await checkAndTriggerPrecache(ip, tmdbId, season, episode);
    }
}

async function checkAndTriggerPrecache(
    ip: string,
    tmdbId: string,
    season: number,
    currentEpisode: number
): Promise<void> {
    const result = await pool.query(
        `SELECT DISTINCT episode FROM request_history
         WHERE ip_address = $1 AND tmdb_id = $2 AND season = $3
         AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY episode`,
        [ip, tmdbId, season]
    );

    const requestedEpisodes = result.rows.map((r: { episode: number }) => r.episode);

    if (requestedEpisodes.length >= PRECACHE_THRESHOLD) {
        await queueSeasonPrecache(tmdbId, season, currentEpisode);
    }
}

async function queueSeasonPrecache(
    tmdbId: string,
    season: number,
    fromEpisode: number
): Promise<void> {
    const seasonInfo = await getSeasonInfo(tmdbId, season);
    if (!seasonInfo) {
        return;
    }

    const totalEpisodes = seasonInfo.episodeCount;
    const episodesToCache: number[] = [];

    for (let ep = fromEpisode + 1; ep <= totalEpisodes && episodesToCache.length < MAX_PRECACHE_EPISODES; ep++) {
        episodesToCache.push(ep);
    }

    if (episodesToCache.length === 0) {
        return;
    }

    for (const episode of episodesToCache) {
        const result = await pool.query(
            `INSERT INTO precache_queue (tmdb_id, season, episode, status, priority)
             VALUES ($1, $2, $3, 'pending', 1)
             ON CONFLICT (tmdb_id, season, episode) DO NOTHING
             RETURNING id`,
            [tmdbId, season, episode]
        );

        if (result.rows.length > 0) {
            eventEmitter.broadcastJobCreated({
                id: `precache_${result.rows[0].id}`,
                tmdbId,
                season,
                episode,
                source: 'precache'
            });
        }
    }

    processPrecacheQueue();
}

let isProcessing = false;

async function processPrecacheQueue(): Promise<void> {
    if (isProcessing || !workerQueue || !runScraperFn) {
        return;
    }

    isProcessing = true;

    try {
        while (true) {
            const result = await pool.query(
                `UPDATE precache_queue
                 SET status = 'processing', started_at = CURRENT_TIMESTAMP
                 WHERE id = (
                     SELECT id FROM precache_queue
                     WHERE status = 'pending'
                     ORDER BY priority DESC, created_at ASC
                     LIMIT 1
                     FOR UPDATE SKIP LOCKED
                 )
                 RETURNING id, tmdb_id, season, episode`
            );

            if (result.rows.length === 0) {
                break;
            }

            const job = result.rows[0];
            const jobId = `precache_${job.id}`;

            const alreadyCached = await pool.query(
                `SELECT 1 FROM stream_cache
                 WHERE tmdb_id = $1 AND season = $2 AND episode = $3`,
                [job.tmdb_id, job.season, job.episode]
            );

            if (alreadyCached.rows.length > 0) {
                await pool.query(
                    `UPDATE precache_queue SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [job.id]
                );
                eventEmitter.broadcastJobCompleted(jobId, false);
                continue;
            }

            eventEmitter.broadcastJobStarted(jobId);

            const scraper = runScraperFn;
            workerQueue.add(async () => {
                try {
                    await scraper(job.tmdb_id, job.season, job.episode);
                    await pool.query(
                        `UPDATE precache_queue SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                         WHERE id = $1`,
                        [job.id]
                    );
                    eventEmitter.broadcastJobCompleted(jobId, true);
                    eventEmitter.broadcastCacheUpdated(job.tmdb_id, job.season, job.episode);
                } catch (error: any) {
                    await pool.query(
                        `UPDATE precache_queue SET status = 'failed', error_message = $2
                         WHERE id = $1`,
                        [job.id, error.message]
                    );
                    eventEmitter.broadcastJobFailed(jobId, error.message);
                }
            }, { priority: 1 });
        }
    } finally {
        isProcessing = false;
    }
}

export async function getQueueStatus(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    recentJobs: Array<{
        tmdbId: string;
        season: number;
        episode: number;
        status: string;
        createdAt: Date;
    }>;
}> {
    const [counts, recent] = await Promise.all([
        pool.query(`
            SELECT status, COUNT(*) as count
            FROM precache_queue
            GROUP BY status
        `),
        pool.query(`
            SELECT tmdb_id, season, episode, status, created_at
            FROM precache_queue
            ORDER BY created_at DESC
            LIMIT 20
        `)
    ]);

    const statusCounts: Record<string, number> = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
    };

    for (const row of counts.rows) {
        statusCounts[row.status] = parseInt(row.count, 10);
    }

    return {
        ...statusCounts as { pending: number; processing: number; completed: number; failed: number },
        recentJobs: recent.rows.map((row: { tmdb_id: string; season: number; episode: number; status: string; created_at: Date }) => ({
            tmdbId: row.tmdb_id,
            season: row.season,
            episode: row.episode,
            status: row.status,
            createdAt: row.created_at
        }))
    };
}

export async function submitManualCacheRequest(
    tmdbId: string,
    season?: number,
    episode?: number
): Promise<{ queued: boolean; message: string }> {
    if (!workerQueue || !runScraperFn) {
        return { queued: false, message: 'Worker system not initialized' };
    }

    if (season !== undefined && episode !== undefined) {
        const existing = await pool.query(
            `SELECT 1 FROM stream_cache WHERE tmdb_id = $1 AND season = $2 AND episode = $3`,
            [tmdbId, season, episode]
        );

        if (existing.rows.length > 0) {
            return { queued: false, message: 'Already cached' };
        }

        await pool.query(
            `INSERT INTO precache_queue (tmdb_id, season, episode, status, priority)
             VALUES ($1, $2, $3, 'pending', 5)
             ON CONFLICT (tmdb_id, season, episode)
             DO UPDATE SET priority = GREATEST(precache_queue.priority, 5), status = 'pending'`,
            [tmdbId, season, episode]
        );

        eventEmitter.broadcastJobCreated({
            id: `manual_${tmdbId}_${season}_${episode}`,
            tmdbId,
            season,
            episode,
            source: 'manual'
        });

        processPrecacheQueue();
        return { queued: true, message: `Queued S${season}E${episode} for caching` };
    } else {
        const existing = await pool.query(
            `SELECT 1 FROM stream_cache WHERE tmdb_id = $1 AND season IS NULL AND episode IS NULL`,
            [tmdbId]
        );

        if (existing.rows.length > 0) {
            return { queued: false, message: 'Already cached' };
        }

        const scraper = runScraperFn;
        workerQueue.add(async () => {
            await scraper(tmdbId, undefined, undefined);
        }, { priority: 5 });

        return { queued: true, message: 'Queued movie for caching' };
    }
}

export async function cleanupOldHistory(): Promise<number> {
    const result = await pool.query(
        `DELETE FROM request_history WHERE created_at < NOW() - INTERVAL '7 days' RETURNING id`
    );
    return result.rowCount ?? 0;
}

export async function cleanupCompletedJobs(): Promise<number> {
    const result = await pool.query(
        `DELETE FROM precache_queue
         WHERE (status = 'completed' OR status = 'failed')
         AND completed_at < NOW() - INTERVAL '24 hours'
         RETURNING id`
    );
    return result.rowCount ?? 0;
}
