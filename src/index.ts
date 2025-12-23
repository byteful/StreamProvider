import express, { type Request, type Response } from 'express';
import PQueue from 'p-queue';
import { runScraper } from './scraperManager.ts';
import { chromium } from 'playwright';

const app = express();
app.use(express.json());

// CONFIGURATION
const PORT = 3000;
const MAX_WORKERS = 3;

const queue = new PQueue({ concurrency: MAX_WORKERS });

const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu']
});
export const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
});

app.get('/', async (req: Request, res: Response): Promise<any> => {
    const { tmdbId, season, episode } = req.query;

    if (!tmdbId) {
        return res.status(400).json({ error: "Missing tmdbId!" });
    }
    if ((season && !episode) || (!season && episode)) {
        return res.status(400).json({ error: "For TV shows, both season and episode need to be included!" });
    }

    try {
        const result = await queue.add(async () => {
            return await runScraper(tmdbId.toString(), Number(season), Number(episode));
        }, { 
            priority: 10 // higher priority than background auto tasks so it gets done quicker 
        });

        return res.json(result);

    } catch (error: any) {
        console.error(`[Error] ${error.message}`);
        
        if (error.message.includes('Timeout')) {
            return res.status(408).json({ error: "Scraping timed out, no stream found." });
        }

        return res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

app.listen(PORT, () => {
    console.log(`StreamProvider running on http://localhost:${PORT}`);
});