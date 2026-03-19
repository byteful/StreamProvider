import { CinezoScraper } from './scrapers/Cinezo.ts';
import { HexaScraper } from './scrapers/Hexa.ts';
import { SflixScraper } from './scrapers/Sflix.ts';
import {
    getCachedStream,
    setCachedStream,
    updateLastAccessed,
    invalidateCache
} from './cacheService.ts';
import type { ScraperResult } from './scrapers/BaseScraper.ts';
import { isIP } from 'node:net';

const VERIFY_TIMEOUT_MS = Number(process.env.STREAM_VERIFY_TIMEOUT_MS ?? 5000);

function isPrivateIpv4(value: string): boolean {
    const parts = value.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }

    const [a, b] = parts;
    return (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    );
}

function isAllowedStreamUrl(rawUrl: string): boolean {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return false;
        }

        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
            return false;
        }

        const version = isIP(hostname);
        if (version === 4 && isPrivateIpv4(hostname)) {
            return false;
        }
        if (version === 6 && (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd'))) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

async function verifyStreamUrl(data: ScraperResult): Promise<boolean> {
    if (!isAllowedStreamUrl(data.url)) {
        return false;
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    try {
        const response = await fetch(data.url, {
            method: 'GET',
            headers: { 'Referer': data.referer ?? '' },
            signal: controller.signal
        });
        return response.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

async function scrapeFromProviders(
    tmdbId: string,
    season?: number,
    episode?: number
): Promise<ScraperResult> {
    const providers = [
        { name: 'SFlix.to', scraper: new SflixScraper() },
        { name: 'Cinezo.net', scraper: new CinezoScraper() },
        { name: 'Hexa.su', scraper: new HexaScraper() },
    ];

    let lastError: unknown = null;

    for (const provider of providers) {
        try {
            const data = await provider.scraper.extractStream(tmdbId, season, episode);

            if (await verifyStreamUrl(data)) {
                return data;
            }
        } catch (error) {
            lastError = error;
        }
    }

    const message = lastError instanceof Error ? lastError.message : 'All providers failed to find a stream';
    throw new Error(message);
}

export async function runScraper(
    tmdbId: string,
    season?: number,
    episode?: number
): Promise<ScraperResult> {
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
}
