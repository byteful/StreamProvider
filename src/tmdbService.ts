import { pool } from './database.ts';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const METADATA_CACHE_HOURS = 24;

export interface SeasonInfo {
    seasonNumber: number;
    episodeCount: number;
    name: string;
}

export interface EpisodeInfo {
    episodeNumber: number;
    name: string;
    airDate: string | null;
}

async function getCachedSeasonInfo(tmdbId: string, season: number): Promise<SeasonInfo | null> {
    const result = await pool.query(
        `SELECT episode_count, season_name FROM tmdb_metadata
         WHERE tmdb_id = $1 AND season = $2
         AND cached_at > NOW() - INTERVAL '${METADATA_CACHE_HOURS} hours'`,
        [tmdbId, season]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return {
        seasonNumber: season,
        episodeCount: result.rows[0].episode_count,
        name: result.rows[0].season_name
    };
}

async function cacheSeasonInfo(tmdbId: string, season: number, episodeCount: number, name: string): Promise<void> {
    await pool.query(
        `INSERT INTO tmdb_metadata (tmdb_id, season, episode_count, season_name, cached_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (tmdb_id, season)
         DO UPDATE SET episode_count = $3, season_name = $4, cached_at = CURRENT_TIMESTAMP`,
        [tmdbId, season, episodeCount, name]
    );
}

export async function getSeasonInfo(tmdbId: string, season: number): Promise<SeasonInfo | null> {
    if (!TMDB_API_KEY) {
        console.error('[TMDB] API key not configured');
        return null;
    }

    const cached = await getCachedSeasonInfo(tmdbId, season);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(
            `${TMDB_BASE_URL}/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}`
        );

        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`TMDB API error: ${response.status}`);
        }

        const data = await response.json();
        const episodeCount = data.episodes?.length || 0;
        const name = data.name || `Season ${season}`;

        await cacheSeasonInfo(tmdbId, season, episodeCount, name);

        return {
            seasonNumber: season,
            episodeCount,
            name
        };
    } catch (error: any) {
        console.error(`[TMDB] Failed to fetch season info: ${error.message}`);
        return null;
    }
}

export async function getTVShowInfo(tmdbId: string): Promise<{ name: string; numberOfSeasons: number } | null> {
    if (!TMDB_API_KEY) {
        return null;
    }

    try {
        const response = await fetch(
            `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return {
            name: data.name,
            numberOfSeasons: data.number_of_seasons
        };
    } catch {
        return null;
    }
}

export async function getMovieInfo(tmdbId: string): Promise<{ title: string } | null> {
    if (!TMDB_API_KEY) {
        return null;
    }

    try {
        const response = await fetch(
            `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return {
            title: data.title
        };
    } catch {
        return null;
    }
}
