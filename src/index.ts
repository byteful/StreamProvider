import express, { type Request, type Response } from 'express';
import PQueue from 'p-queue';
import { runScraper } from './scraperManager.ts';
import { chromium } from 'patchright';
import { initDatabase } from './database.ts';
import { runCacheCleanup } from './cacheService.ts';
import { applyTimingShield } from './stealth.ts';
import { resolveNextTvEpisodes } from './tmdbClient.ts';
import { isQueueOverloaded, scheduleTvPrefetchJobs } from './backgroundPrefetch.ts';
import { tmpdir } from 'os';
import { join } from 'path';

const app = express();
app.use(express.json());

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

const PORT = Number(process.env.PORT || 3000);
const MAX_WORKERS = parsePositiveIntEnv(process.env.MAX_WORKERS, 2);
const MAX_QUEUE_SIZE = parsePositiveIntEnv(process.env.MAX_QUEUE_SIZE, 25);
const DIRECT_REQUEST_PRIORITY = parsePositiveIntEnv(process.env.DIRECT_REQUEST_PRIORITY, 10);
const BACKGROUND_PREFETCH_COUNT = parsePositiveIntEnv(process.env.BACKGROUND_PREFETCH_COUNT, 2);
const BACKGROUND_JOB_PRIORITY = parsePositiveIntEnv(process.env.BACKGROUND_JOB_PRIORITY, 1);
const EFFECTIVE_BACKGROUND_PRIORITY = DIRECT_REQUEST_PRIORITY > 1
    ? Math.min(BACKGROUND_JOB_PRIORITY, DIRECT_REQUEST_PRIORITY - 1)
    : 1;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CHROME_DATA_DIR = process.env.CHROME_DATA_DIR || join(tmpdir(), 'streamprovider-chrome');
const BROWSER_CHANNEL = process.env.BROWSER_CHANNEL;
const BROWSER_EXECUTABLE_PATH = process.env.BROWSER_EXECUTABLE_PATH;
const backgroundJobKeys = new Set<string>();

const queue = new PQueue({ concurrency: MAX_WORKERS });

const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless: true,
    viewport: null,
};

if (BROWSER_EXECUTABLE_PATH) {
    launchOptions.executablePath = BROWSER_EXECUTABLE_PATH;
} else if (BROWSER_CHANNEL) {
    launchOptions.channel = BROWSER_CHANNEL as 'chromium' | 'chrome' | 'msedge';
}

export const context = await chromium.launchPersistentContext(CHROME_DATA_DIR, launchOptions);

await applyTimingShield(context);

await context.addCookies([{
    name: 'show_share',
    value: 'true',
    domain: 'sflix2.to',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
}]);

await initDatabase();

setInterval(async () => {
    try {
        await runCacheCleanup();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Cache Cleanup Error] ${message}`);
    }
}, CLEANUP_INTERVAL_MS);

runCacheCleanup().catch(console.error);

app.get('/', async (req: Request, res: Response): Promise<any> => {
    const { tmdbId, season, episode } = req.query;

    if (!tmdbId) {
        return res.status(400).json({ error: "Missing tmdbId!" });
    }
    if ((season && !episode) || (!season && episode)) {
        return res.status(400).json({ error: "For TV shows, both season and episode need to be included!" });
    }

    try {
        const tmdbIdStr = String(tmdbId);
        const tmdbNumeric = Number(tmdbIdStr);

        if (!Number.isInteger(tmdbNumeric) || tmdbNumeric <= 0) {
            return res.status(400).json({ error: "tmdbId must be a positive integer." });
        }

        let seasonNum: number | undefined;
        if (season !== undefined) {
            const parsedSeason = Number(season);
            if (!Number.isInteger(parsedSeason) || parsedSeason <= 0) {
                return res.status(400).json({ error: "season must be a positive integer." });
            }
            seasonNum = parsedSeason;
        }

        let episodeNum: number | undefined;
        if (episode !== undefined) {
            const parsedEpisode = Number(episode);
            if (!Number.isInteger(parsedEpisode) || parsedEpisode <= 0) {
                return res.status(400).json({ error: "episode must be a positive integer." });
            }
            episodeNum = parsedEpisode;
        }

        if (isQueueOverloaded(queue, MAX_QUEUE_SIZE)) {
            return res.status(529).json({
                error: 'Server is currently overloaded. Please retry shortly.'
            });
        }

        const result = await queue.add(
            () => runScraper(tmdbIdStr, seasonNum, episodeNum),
            { priority: DIRECT_REQUEST_PRIORITY }
        );

        if (seasonNum !== undefined && episodeNum !== undefined) {
            void scheduleTvPrefetchJobs({
                queue,
                tmdbId: tmdbIdStr,
                season: seasonNum,
                episode: episodeNum,
                prefetchCount: BACKGROUND_PREFETCH_COUNT,
                maxQueueSize: MAX_QUEUE_SIZE,
                backgroundPriority: EFFECTIVE_BACKGROUND_PRIORITY,
                inFlightJobs: backgroundJobKeys,
                resolveNextEpisodes: resolveNextTvEpisodes,
                runScrape: runScraper
            });
        }

        return res.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error(`[Error] ${message}`);

        if (message.includes('Timeout')) {
            return res.status(408).json({ error: "Scraping timed out, no stream found." });
        }

        return res.status(500).json({ error: message });
    }
});

app.listen(PORT, () => {
    console.log(`StreamProvider running on http://localhost:${PORT}`);
});
