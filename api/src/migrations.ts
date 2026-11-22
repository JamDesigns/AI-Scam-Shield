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
  {
    id: "20261030_002_atomic_scan_operations",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS scan_operations (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        input_type TEXT NOT NULL CHECK (input_type IN ('text','image','video','image_authenticity')),
        status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
        year_week TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        ai_used BOOLEAN NOT NULL,
        is_premium BOOLEAN NOT NULL,
        ordinal INT,
        lease_token TEXT NOT NULL,
        response_status INT,
        response_json JSONB,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        UNIQUE(device_id, idempotency_key)
      )`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_operations_device_processing
        ON scan_operations(device_id) WHERE status = 'processing'`);
      await client.query(`ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS input_type TEXT NOT NULL DEFAULT 'text'`);
      await client.query(`ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS operation_id TEXT REFERENCES scan_operations(id)`);
      await client.query(`ALTER TABLE scan_events ALTER COLUMN final_risk_score DROP NOT NULL, ALTER COLUMN classic_risk_score DROP NOT NULL`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_events_operation
        ON scan_events(operation_id) WHERE operation_id IS NOT NULL`);
    },
  },
  {
    id: "20261031_003_sessions_and_subscription_sync",
    up: async (client) => {
      // Legacy rows keep their history, but a caller cannot claim them using an identifier alone.
      await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS auth_token_hash TEXT,
        ADD COLUMN IF NOT EXISTS time_zone TEXT NOT NULL DEFAULT 'UTC'`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_auth_token_hash
        ON devices(auth_token_hash) WHERE auth_token_hash IS NOT NULL`);
      await client.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS environment TEXT,
        ADD COLUMN IF NOT EXISTS provider_observed_at_ms BIGINT,
        ADD COLUMN IF NOT EXISTS product_id TEXT,
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS source TEXT`);
      await client.query(`CREATE TABLE IF NOT EXISTS request_rate_limits (
        scope TEXT NOT NULL, subject_hash TEXT NOT NULL, window_start TIMESTAMPTZ NOT NULL,
        request_count INT NOT NULL CHECK(request_count > 0), expires_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY(scope, subject_hash, window_start)
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_request_rate_limits_expiry ON request_rate_limits(expires_at)`);
      await client.query(`CREATE TABLE IF NOT EXISTS revenuecat_events (
        event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL,
        environment TEXT CHECK(environment IN ('SANDBOX','PRODUCTION')),
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS revenuecat_sync_jobs (
        device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
        generation BIGINT NOT NULL DEFAULT 1 CHECK(generation > 0),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed')),
        attempts INT NOT NULL DEFAULT 0 CHECK(attempts >= 0),
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ, lease_token TEXT, lease_until TIMESTAMPTZ, last_error TEXT
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_revenuecat_sync_jobs_available
        ON revenuecat_sync_jobs(available_at) WHERE status IN ('pending','processing')`);
    },
  },
  {
    id: "20261122_004_recoverable_premium_accounts",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS premium_accounts (
        id TEXT PRIMARY KEY, identity_issuer TEXT NOT NULL, identity_subject TEXT NOT NULL,
        time_zone TEXT NOT NULL, active_device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(identity_issuer, identity_subject)
      )`);
      await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES premium_accounts(id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(account_id)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_account_active_device ON premium_accounts(active_device_id)
        WHERE active_device_id IS NOT NULL`);
      await client.query(`CREATE TABLE IF NOT EXISTS account_weekly_usage (
        account_id TEXT NOT NULL REFERENCES premium_accounts(id) ON DELETE CASCADE,
        year_week TEXT NOT NULL, scans_count INT NOT NULL DEFAULT 0 CHECK(scans_count >= 0),
        ai_scans_count INT NOT NULL DEFAULT 0 CHECK(ai_scans_count >= 0),
        PRIMARY KEY(account_id, year_week)
      )`);
      await client.query(`ALTER TABLE scan_operations ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES premium_accounts(id)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_operations_account_processing
        ON scan_operations(account_id) WHERE account_id IS NOT NULL AND status = 'processing'`);
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
