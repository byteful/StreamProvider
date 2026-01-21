interface RateLimitEntry {
    count: number;
    resetAt: number;
}

interface RateLimitStore {
    [key: string]: RateLimitEntry;
}

const SCRAPE_LIMIT_PER_MINUTE = 5;
const SCRAPE_LIMIT_PER_HOUR = 50;
const CACHE_REQUEST_LIMIT_PER_MINUTE = 3;

const scrapeMinuteStore: RateLimitStore = {};
const scrapeHourStore: RateLimitStore = {};
const cacheRequestStore: RateLimitStore = {};

function cleanupStore(store: RateLimitStore): void {
    const now = Date.now();
    for (const key in store) {
        if (store[key].resetAt < now) {
            delete store[key];
        }
    }
}

setInterval(() => cleanupStore(scrapeMinuteStore), 60000);
setInterval(() => cleanupStore(scrapeHourStore), 300000);
setInterval(() => cleanupStore(cacheRequestStore), 60000);

function checkLimit(
    store: RateLimitStore,
    key: string,
    limit: number,
    windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = store[key];

    if (!entry || entry.resetAt < now) {
        store[key] = {
            count: 1,
            resetAt: now + windowMs
        };
        return { allowed: true, remaining: limit - 1, resetAt: store[key].resetAt };
    }

    if (entry.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
}

export function checkScrapeRateLimit(ip: string): RateLimitResult {
    const minuteCheck = checkLimit(
        scrapeMinuteStore,
        `scrape:minute:${ip}`,
        SCRAPE_LIMIT_PER_MINUTE,
        60000
    );

    if (!minuteCheck.allowed) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: minuteCheck.resetAt,
            retryAfter: Math.ceil((minuteCheck.resetAt - Date.now()) / 1000)
        };
    }

    const hourCheck = checkLimit(
        scrapeHourStore,
        `scrape:hour:${ip}`,
        SCRAPE_LIMIT_PER_HOUR,
        3600000
    );

    if (!hourCheck.allowed) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: hourCheck.resetAt,
            retryAfter: Math.ceil((hourCheck.resetAt - Date.now()) / 1000)
        };
    }

    return {
        allowed: true,
        remaining: Math.min(minuteCheck.remaining, hourCheck.remaining),
        resetAt: Math.min(minuteCheck.resetAt, hourCheck.resetAt)
    };
}

export function checkCacheRequestRateLimit(ip: string): RateLimitResult {
    const check = checkLimit(
        cacheRequestStore,
        `cache:${ip}`,
        CACHE_REQUEST_LIMIT_PER_MINUTE,
        60000
    );

    if (!check.allowed) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: check.resetAt,
            retryAfter: Math.ceil((check.resetAt - Date.now()) / 1000)
        };
    }

    return {
        allowed: true,
        remaining: check.remaining,
        resetAt: check.resetAt
    };
}

export function getRateLimitInfo(ip: string): {
    scrape: { remaining: number; minuteReset: number; hourReset: number };
    cacheRequest: { remaining: number; reset: number };
} {
    const now = Date.now();

    const minuteEntry = scrapeMinuteStore[`scrape:minute:${ip}`];
    const hourEntry = scrapeHourStore[`scrape:hour:${ip}`];
    const cacheEntry = cacheRequestStore[`cache:${ip}`];

    const minuteRemaining = minuteEntry && minuteEntry.resetAt > now
        ? SCRAPE_LIMIT_PER_MINUTE - minuteEntry.count
        : SCRAPE_LIMIT_PER_MINUTE;

    const hourRemaining = hourEntry && hourEntry.resetAt > now
        ? SCRAPE_LIMIT_PER_HOUR - hourEntry.count
        : SCRAPE_LIMIT_PER_HOUR;

    const cacheRemaining = cacheEntry && cacheEntry.resetAt > now
        ? CACHE_REQUEST_LIMIT_PER_MINUTE - cacheEntry.count
        : CACHE_REQUEST_LIMIT_PER_MINUTE;

    return {
        scrape: {
            remaining: Math.min(minuteRemaining, hourRemaining),
            minuteReset: minuteEntry?.resetAt ?? now + 60000,
            hourReset: hourEntry?.resetAt ?? now + 3600000
        },
        cacheRequest: {
            remaining: cacheRemaining,
            reset: cacheEntry?.resetAt ?? now + 60000
        }
    };
}
