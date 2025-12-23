import { Page } from 'playwright';
import { context } from '../index.ts';

export abstract class BaseScraper {
    protected page: Page | null = null;

    async initialize() {
        this.page = await context.newPage();
    }

    abstract extractStream(imdbId: string, season?: number, episode?: number): Promise<ScraperResult>;

    async waitForM3u8(timeout = 10000): Promise<ScraperResult> {
        if (!this.page) throw new Error("Page not initialized");

        await this.page.route('**/*', async (route) => {
            const toBlock = ['font', 'stylesheet', 'image', 'media'];
            
            if (toBlock.includes(route.request().resourceType())) {
                await route.abort();
            } else {
                await route.continue();
            }
        });

        try {
            const request = await this.page.waitForRequest(req => 
                req.url().includes('.m3u8') || req.url().includes('.mp4')
            , { timeout });
            
            return { url: request.url(), referer: request.headers()['referer'] };
        } catch (e) {
            throw new Error("Timeout: No streams detected.");
        } finally {
            this.page.close();
        }
    }
}

export type ScraperResult = {
    url: string;
    referer?: string;
}