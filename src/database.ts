import 'dotenv/config'
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export async function initDatabase(): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS stream_cache (
                id SERIAL PRIMARY KEY,
                tmdb_id VARCHAR(50) NOT NULL,
                season INTEGER,
                episode INTEGER,
                stream_url TEXT NOT NULL,
                referer TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tmdb_id, season, episode)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_cache_lookup
            ON stream_cache(tmdb_id, season, episode)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_last_accessed
            ON stream_cache(last_accessed_at)
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS request_history (
                id SERIAL PRIMARY KEY,
                ip_address VARCHAR(45) NOT NULL,
                tmdb_id VARCHAR(50) NOT NULL,
                season INTEGER,
                episode INTEGER,
                was_cached BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_request_history_ip_tmdb
            ON request_history(ip_address, tmdb_id, season)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_request_history_created
            ON request_history(created_at)
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS precache_queue (
                id SERIAL PRIMARY KEY,
                tmdb_id VARCHAR(50) NOT NULL,
                season INTEGER NOT NULL,
                episode INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                priority INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                error_message TEXT,
                UNIQUE(tmdb_id, season, episode)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_precache_queue_status
            ON precache_queue(status, priority DESC)
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS tmdb_metadata (
                id SERIAL PRIMARY KEY,
                tmdb_id VARCHAR(50) NOT NULL,
                season INTEGER NOT NULL,
                episode_count INTEGER NOT NULL,
                season_name TEXT,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tmdb_id, season)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tmdb_metadata_lookup
            ON tmdb_metadata(tmdb_id, season)
        `);
    } finally {
        client.release();
    }
}

export { pool };
