import { CinezoScraper } from './scrapers/Cinezo.ts';
import { HexaScraper } from './scrapers/Hexa.ts';
import {
    getCachedStream,
    setCachedStream,
    updateLastAccessed,
    invalidateCache
} from './cacheService.ts';
import type { ScraperResult } from './scrapers/BaseScraper.ts';

async function verifyStreamUrl(data: ScraperResult): Promise<boolean> {
    try {
        const response = await fetch(data.url, {
            method: 'GET',
            headers: { 'Referer': data.referer ?? '' }
        });
        return response.ok;
    } catch {
        return false;
    }
}

async function scrapeFromProviders(
    tmdbId: string,
    season?: number,
    episode?: number
): Promise<ScraperResult> {
    const providers = [
        { name: 'Hexa.su', scraper: new HexaScraper() },
        { name: 'Cinezo.net', scraper: new CinezoScraper() }
    ];

    let lastError = null;

    for (const provider of providers) {
        try {
            const data = await provider.scraper.extractStream(tmdbId, season, episode);

            if (await verifyStreamUrl(data)) {
                return data;
            }
        } catch (error: any) {
            lastError = error;
        }
    }

    throw new Error(lastError?.message || "All providers failed to find a stream");
}

export const runScraper = async (
    tmdbId: string,
    season?: number,
    episode?: number
): Promise<ScraperResult> => {
    const cached = await getCachedStream(tmdbId, season, episode);

    if (cached) {
        const isValid = await verifyStreamUrl(cached);

        if (isValid) {
            await updateLastAccessed(tmdbId, season, episode);
            return cached;
        }

        await invalidateCache(tmdbId, season, episode);
    }

    const freshData = await scrapeFromProviders(tmdbId, season, episode);
    await setCachedStream(tmdbId, season, episode, freshData);

    return freshData;
};
