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
    } finally {
        client.release();
    }
}

export { pool };
