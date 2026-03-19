import express, { type Request, type Response } from 'express';
import PQueue from 'p-queue';
import { runScraper } from './scraperManager.ts';
import { chromium } from 'patchright';
import { initDatabase } from './database.ts';
import { runCacheCleanup } from './cacheService.ts';
import { applyTimingShield } from './stealth.ts';
import { tmpdir } from 'os';
import { join } from 'path';

const app = express();
app.use(express.json());

const PORT = 3000;
const MAX_WORKERS = Number(process.env.MAX_WORKERS || 10);
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CHROME_DATA_DIR = process.env.CHROME_DATA_DIR || join(tmpdir(), 'streamprovider-chrome');

const queue = new PQueue({ concurrency: MAX_WORKERS });

export const context = await chromium.launchPersistentContext(CHROME_DATA_DIR, {
    channel: 'chrome',
    headless: true,
    viewport: null,
});

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

        const result = await queue.add(() => runScraper(tmdbIdStr, seasonNum, episodeNum), { priority: 10 });
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
