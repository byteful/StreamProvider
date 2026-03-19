export type SflixSearchCandidate = {
    index: number;
    title: string;
    year: number | null;
    href: string;
};

export type SflixSeasonOption = {
    index: number;
    text: string;
    targetId?: string;
    anchorId?: string;
};

export type SflixEpisodeOption = {
    index: number;
    id?: string;
    number: number | null;
    title: string;
};

const MAX_YEAR_DISTANCE = 2;

function normalizeSpacing(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function normalizeTitle(value: string): string {
    return normalizeSpacing(
        value
            .toLowerCase()
            .replace(/['’`"]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
    );
}

function tokenizeTitle(value: string): Set<string> {
    const normalized = normalizeTitle(value);
    if (!normalized) return new Set();
    return new Set(normalized.split(' '));
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) {
            intersection += 1;
        }
    }
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : intersection / union;
}

function titleScore(expectedTitle: string, candidateTitle: string): number {
    const expectedNormalized = normalizeTitle(expectedTitle);
    const candidateNormalized = normalizeTitle(candidateTitle);

    if (!expectedNormalized || !candidateNormalized) return 0;
    if (expectedNormalized === candidateNormalized) return 1;

    const expectedTokens = tokenizeTitle(expectedTitle);
    const candidateTokens = tokenizeTitle(candidateTitle);
    const jaccard = jaccardScore(expectedTokens, candidateTokens);

    if (
        expectedNormalized.includes(candidateNormalized) ||
        candidateNormalized.includes(expectedNormalized)
    ) {
        return Math.max(0.85, jaccard);
    }

    return jaccard;
}

function parseSeasonNumber(text: string): number | null {
    const seasonMatch = text.match(/season\s*(\d+)/i) || text.match(/\b(\d+)\b/);
    if (!seasonMatch) return null;
    const value = Number(seasonMatch[1]);
    return Number.isFinite(value) ? value : null;
}

function compareByStableOrder<T extends { index: number }>(a: T, b: T): number {
    return a.index - b.index;
}

export function selectBestSearchCandidate(
    candidates: SflixSearchCandidate[],
    expectedTitle: string,
    expectedYear: number
): SflixSearchCandidate | null {
    const ranked = candidates
        .map((candidate) => {
            const score = titleScore(expectedTitle, candidate.title);
            const yearDistance = candidate.year === null ? Number.POSITIVE_INFINITY : Math.abs(candidate.year - expectedYear);
            return { candidate, score, yearDistance };
        })
        .filter((entry) => entry.score >= 0.6 && entry.yearDistance <= MAX_YEAR_DISTANCE)
        .sort((a, b) => {
            if (a.yearDistance !== b.yearDistance) return a.yearDistance - b.yearDistance;
            if (a.score !== b.score) return b.score - a.score;
            return compareByStableOrder(a.candidate, b.candidate);
        });

    return ranked[0]?.candidate ?? null;
}

export function selectBestSeasonOption(
    seasons: SflixSeasonOption[],
    expectedSeasonNumber: number,
    expectedSeasonName?: string
): SflixSeasonOption | null {
    const normalizedExpectedName = expectedSeasonName ? normalizeTitle(expectedSeasonName) : '';

    if (normalizedExpectedName) {
        const byName = seasons.find((entry) => normalizeTitle(entry.text) === normalizedExpectedName);
        if (byName) return byName;
    }

    const byNumber = seasons.find((entry) => parseSeasonNumber(entry.text) === expectedSeasonNumber);
    if (byNumber) return byNumber;

    const byIndex = seasons.find((entry) => entry.index === expectedSeasonNumber - 1);
    return byIndex ?? null;
}

export function selectBestEpisodeOption(
    episodes: SflixEpisodeOption[],
    expectedEpisodeNumber: number,
    expectedEpisodeName?: string
): SflixEpisodeOption | null {
    const byNumber = episodes.find((entry) => entry.number === expectedEpisodeNumber);
    if (byNumber) return byNumber;

    if (expectedEpisodeName) {
        const normalizedExpected = normalizeTitle(expectedEpisodeName);
        const ranked = episodes
            .map((entry) => ({
                entry,
                score: titleScore(normalizedExpected, entry.title)
            }))
            .filter((entry) => entry.score >= 0.6)
            .sort((a, b) => {
                if (a.score !== b.score) return b.score - a.score;
                return compareByStableOrder(a.entry, b.entry);
            });

        if (ranked[0]) {
            return ranked[0].entry;
        }
    }

    return null;
}
