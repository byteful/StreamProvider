const TMDB_BASE_URL = (process.env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3').replace(/\/+$/, '');
const TMDB_TIMEOUT_MS = Number(process.env.TMDB_TIMEOUT_MS ?? 7000);
const TMDB_MAX_RETRIES = Number(process.env.TMDB_MAX_RETRIES ?? 2);

type TmdbMovieResponse = {
    id: number;
    title?: string;
    original_title?: string;
    release_date?: string;
};

type TmdbTvResponse = {
    id: number;
    name?: string;
    original_name?: string;
    first_air_date?: string;
    seasons?: Array<{ season_number: number; name?: string }>;
};

type TmdbEpisodeResponse = {
    id: number;
    episode_number: number;
    name?: string;
};

export type MovieLookupMetadata = {
    mediaType: 'movie';
    tmdbId: string;
    title: string;
    originalTitle?: string;
    releaseYear: number;
};

export type TvEpisodeLookupMetadata = {
    mediaType: 'tv';
    tmdbId: string;
    title: string;
    originalTitle?: string;
    releaseYear: number;
    seasonNumber: number;
    seasonName?: string;
    episodeNumber: number;
    episodeName?: string;
};

export type TvShowLookupMetadata = {
    mediaType: 'tv';
    tmdbId: string;
    title: string;
    originalTitle?: string;
    releaseYear: number;
};

export type LookupMetadata = MovieLookupMetadata | TvEpisodeLookupMetadata | TvShowLookupMetadata;

function getTmdbApiKey(): string {
    const key = process.env.TMDB_API_KEY?.trim();
    if (!key) {
        throw new Error('TMDB API key is missing. Set TMDB_API_KEY.');
    }
    return key;
}

function parseYear(dateValue: string | undefined): number | null {
    if (!dateValue) return null;
    const match = dateValue.match(/^(\d{4})/);
    if (!match) return null;
    const year = Number(match[1]);
    return Number.isFinite(year) ? year : null;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                accept: 'application/json'
            }
        });
    } finally {
        clearTimeout(timeoutHandle);
    }
}

async function fetchTmdb<T>(path: string): Promise<T> {
    const apiKey = getTmdbApiKey();
    const url = `${TMDB_BASE_URL}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`;

    let lastError: unknown;

    for (let attempt = 0; attempt <= TMDB_MAX_RETRIES; attempt += 1) {
        try {
            const response = await fetchWithTimeout(url, TMDB_TIMEOUT_MS);

            if (response.status === 404) {
                throw new Error('TMDB_NOT_FOUND');
            }

            if (!response.ok) {
                throw new Error(`TMDB_HTTP_${response.status}`);
            }

            return await response.json() as T;
        } catch (error) {
            lastError = error;

            if (error instanceof Error && error.message === 'TMDB_NOT_FOUND') {
                throw error;
            }

            if (attempt === TMDB_MAX_RETRIES) {
                break;
            }
        }
    }

    const message = lastError instanceof Error ? lastError.message : 'Unknown TMDB error';
    throw new Error(`TMDB_REQUEST_FAILED:${message}`);
}

async function resolveMovieMetadata(tmdbId: string): Promise<MovieLookupMetadata> {
    const movie = await fetchTmdb<TmdbMovieResponse>(`/movie/${encodeURIComponent(tmdbId)}`);
    const title = movie.title?.trim();
    const releaseYear = parseYear(movie.release_date);

    if (!title || !releaseYear) {
        throw new Error('TMDB_MOVIE_METADATA_INCOMPLETE');
    }

    return {
        mediaType: 'movie',
        tmdbId,
        title,
        originalTitle: movie.original_title?.trim() || undefined,
        releaseYear
    };
}

async function resolveTvEpisodeMetadata(
    tmdbId: string,
    seasonNumber: number,
    episodeNumber: number
): Promise<TvEpisodeLookupMetadata> {
    const [show, episode] = await Promise.all([
        fetchTmdb<TmdbTvResponse>(`/tv/${encodeURIComponent(tmdbId)}`),
        fetchTmdb<TmdbEpisodeResponse>(
            `/tv/${encodeURIComponent(tmdbId)}/season/${seasonNumber}/episode/${episodeNumber}`
        )
    ]);

    const title = show.name?.trim();
    const releaseYear = parseYear(show.first_air_date);

    if (!title || !releaseYear) {
        throw new Error('TMDB_TV_METADATA_INCOMPLETE');
    }

    return {
        mediaType: 'tv',
        tmdbId,
        title,
        originalTitle: show.original_name?.trim() || undefined,
        releaseYear,
        seasonNumber,
        seasonName: show.seasons?.find((entry) => entry.season_number === seasonNumber)?.name?.trim() || undefined,
        episodeNumber: episode.episode_number,
        episodeName: episode.name?.trim() || undefined
    };
}

async function resolveTvShowMetadata(tmdbId: string): Promise<TvShowLookupMetadata> {
    const show = await fetchTmdb<TmdbTvResponse>(`/tv/${encodeURIComponent(tmdbId)}`);
    const title = show.name?.trim();
    const releaseYear = parseYear(show.first_air_date);

    if (!title || !releaseYear) {
        throw new Error('TMDB_TV_METADATA_INCOMPLETE');
    }

    return {
        mediaType: 'tv',
        tmdbId,
        title,
        originalTitle: show.original_name?.trim() || undefined,
        releaseYear
    };
}

export async function resolveTmdbLookupMetadata(
    tmdbId: string,
    season?: number,
    episode?: number
): Promise<LookupMetadata> {
    if (season && episode) {
        return resolveTvEpisodeMetadata(tmdbId, season, episode);
    }

    try {
        return await resolveMovieMetadata(tmdbId);
    } catch (error) {
        if (!(error instanceof Error) || error.message !== 'TMDB_NOT_FOUND') {
            throw error;
        }
    }

    try {
        return await resolveTvShowMetadata(tmdbId);
    } catch (error) {
        if (!(error instanceof Error) || error.message !== 'TMDB_NOT_FOUND') {
            throw error;
        }
    }

    throw new Error('TMDB_NOT_FOUND');
}
