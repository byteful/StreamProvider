import type { Page } from 'patchright';
import { context } from '../index.ts';

export abstract class BaseScraper {
    protected page: Page | null = null;

    async initialize(): Promise<void> {
        this.page = await context.newPage();
    }

    protected requirePage(): Page {
        if (!this.page) throw new Error('Page not initialized');
        return this.page;
    }

    abstract extractStream(imdbId: string, season?: number, episode?: number): Promise<ScraperResult>;

    async waitForM3u8(timeout = 10000): Promise<ScraperResult> {
        const page = this.requirePage();

        await page.route('**/*', async (route) => {
            const toBlock = ['font', 'stylesheet', 'image', 'media'];
            
            if (toBlock.includes(route.request().resourceType())) {
                await route.abort();
            } else {
                await route.continue();
            }
        });

        try {
            const request = await page.waitForRequest(
                (req) => req.url().includes('.m3u8') || req.url().includes('.mp4'),
                { timeout }
            );

            return { url: request.url(), referer: request.headers().referer };
        } catch {
            throw new Error('Timeout: No streams detected.');
        } finally {
            await page.close();
        }
    }
}

export type ScraperResult = {
    url: string;
    referer?: string;
}
