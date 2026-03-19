type QueueTaskOptions = {
    priority?: number;
};

type QueueLike = {
    size: number;
    pending: number;
    add<T>(task: () => Promise<T>, options?: QueueTaskOptions): Promise<T>;
};

export type TvEpisodeTarget = {
    season: number;
    episode: number;
};

type LoggerLike = Pick<Console, 'error' | 'warn'>;

type ResolveNextEpisodes = (
    tmdbId: string,
    season: number,
    episode: number,
    count: number
) => Promise<TvEpisodeTarget[]>;

type RunScrape = (tmdbId: string, season: number, episode: number) => Promise<unknown>;

export function getQueueLoad(queue: Pick<QueueLike, 'size' | 'pending'>): number {
    return queue.size + queue.pending;
}

export function isQueueOverloaded(queue: Pick<QueueLike, 'size' | 'pending'>, maxQueueSize: number): boolean {
    return getQueueLoad(queue) >= maxQueueSize;
}

function createEpisodeJobKey(tmdbId: string, season: number, episode: number): string {
    return `${tmdbId}:${season}:${episode}`;
}

type ScheduleTvPrefetchJobsParams = {
    queue: QueueLike;
    tmdbId: string;
    season: number;
    episode: number;
    prefetchCount: number;
    maxQueueSize: number;
    backgroundPriority: number;
    inFlightJobs: Set<string>;
    resolveNextEpisodes: ResolveNextEpisodes;
    runScrape: RunScrape;
    logger?: LoggerLike;
};

export async function scheduleTvPrefetchJobs({
    queue,
    tmdbId,
    season,
    episode,
    prefetchCount,
    maxQueueSize,
    backgroundPriority,
    inFlightJobs,
    resolveNextEpisodes,
    runScrape,
    logger = console
}: ScheduleTvPrefetchJobsParams): Promise<void> {
    if (prefetchCount <= 0) {
        return;
    }

    try {
        const nextEpisodes = await resolveNextEpisodes(tmdbId, season, episode, prefetchCount);
        for (const target of nextEpisodes) {
            const jobKey = createEpisodeJobKey(tmdbId, target.season, target.episode);
            if (inFlightJobs.has(jobKey)) {
                continue;
            }

            if (isQueueOverloaded(queue, maxQueueSize)) {
                logger.warn(`[Background Prefetch] Skipped due to queue pressure for tmdbId=${tmdbId}`);
                break;
            }

            inFlightJobs.add(jobKey);
            try {
                const jobPromise = queue.add(
                    async () => {
                        await runScrape(tmdbId, target.season, target.episode);
                    },
                    { priority: backgroundPriority }
                );

                jobPromise.catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.error(`[Background Prefetch Error] ${message}`);
                }).finally(() => {
                    inFlightJobs.delete(jobKey);
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.error(`[Background Prefetch Queue Error] ${message}`);
                inFlightJobs.delete(jobKey);
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[Background Prefetch Scheduling Error] ${message}`);
    }
}
