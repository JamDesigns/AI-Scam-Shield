import type pg from "pg";

export type Migration = {
  id: string;
  up: (client: pg.PoolClient) => Promise<void>;
};

const migrations: Migration[] = [
  {
    id: "20260921_000_initial_schema",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS subscriptions (
          device_id TEXT PRIMARY KEY
            REFERENCES devices(id) ON DELETE CASCADE,
          is_premium BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS device_weekly_usage (
          device_id TEXT NOT NULL
            REFERENCES devices(id) ON DELETE CASCADE,
          year_week TEXT NOT NULL,
          scans_count INT NOT NULL DEFAULT 0,
          ai_scans_count INT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (device_id, year_week)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS scan_events (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL
            REFERENCES devices(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          input_preview TEXT NOT NULL,
          final_category TEXT NOT NULL,
          threat_type TEXT NOT NULL DEFAULT 'none',
          final_risk_score INT NOT NULL,
          classic_category TEXT NOT NULL,
          classic_risk_score INT NOT NULL,
          ai_used BOOLEAN NOT NULL DEFAULT FALSE,
          is_threat BOOLEAN NOT NULL DEFAULT FALSE
        )
      `);

      await client.query(`
        ALTER TABLE scan_events
          ADD COLUMN IF NOT EXISTS threat_type
            TEXT NOT NULL DEFAULT 'none'
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scan_events_device_created_at
          ON scan_events (device_id, created_at DESC)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scan_events_device_threat_created_at
          ON scan_events (device_id, is_threat, created_at DESC)
      `);
    },
  },
  {
    id: "20260921_001_create_media_analysis_jobs",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS media_analysis_jobs (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL
            REFERENCES devices(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          provider_submission_id TEXT,
          status TEXT NOT NULL CHECK (
            status IN (
              'submitting',
              'processing',
              'completed',
              'failed'
            )
          ),
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
          output_language TEXT NOT NULL,
          result_json JSONB,
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_media_analysis_jobs_device_created_at
          ON media_analysis_jobs (device_id, created_at DESC)
      `);

      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_media_analysis_jobs_provider_submission
          ON media_analysis_jobs (provider, provider_submission_id)
          WHERE provider_submission_id IS NOT NULL
      `);
    },
  },
];

const MIGRATION_LOCK_ID = 741932817;

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query(
      "SELECT pg_advisory_lock($1)",
      [MIGRATION_LOCK_ID],
    );
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE id = $1",
        [migration.id],
      );

      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      await client.query("BEGIN");

      try {
        await migration.up(client);

        await client.query(
          "INSERT INTO schema_migrations(id) VALUES($1)",
          [migration.id],
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      if (lockAcquired) {
        await client.query(
          "SELECT pg_advisory_unlock($1)",
          [MIGRATION_LOCK_ID],
        );
      }
    } finally {
      client.release();
    }
  }
}
