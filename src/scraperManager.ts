import { CinezoScraper } from './scrapers/Cinezo.ts';
import { HexaScraper } from './scrapers/Hexa.ts';

export const runScraper = async (tmdbId: string, season?: number, episode?: number) => {
    const providers = [
        { name: 'Hexa.su', scraper: new HexaScraper() },
        { name: 'Cinezo.net', scraper: new CinezoScraper() }
    ];

    let lastError = null;

    for (const provider of providers) {
        try {
            const data = await provider.scraper.extractStream(tmdbId, season, episode);
            const verifyRes = await fetch(data.url, { method: 'GET', headers: { 'Referer': data.referer ?? '' } });

            if (verifyRes.ok) {
                return data;
            }
        } catch (error: any) {
            lastError = error;
        }
    }

    throw new Error(lastError?.message || "All providers failed to find a stream");
};