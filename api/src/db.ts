import pg from "pg";

const { Pool } = pg;

export function createPool(databaseUrl: string): pg.Pool {
  return new Pool({ connectionString: databaseUrl });
}

export async function ensureDevice(
  pool: pg.Pool,
  deviceId: string,
): Promise<void> {
  await pool.query(
    "INSERT INTO devices(id) VALUES($1) ON CONFLICT (id) DO NOTHING",
    [deviceId],
  );

  await pool.query(
    "INSERT INTO subscriptions(device_id, is_premium) VALUES($1, FALSE) ON CONFLICT (device_id) DO NOTHING",
    [deviceId],
  );
}

export async function getPremiumStatus(
  pool: pg.Pool,
  deviceId: string,
): Promise<boolean> {
  const res = await pool.query(
    "SELECT is_premium FROM subscriptions WHERE device_id = $1",
    [deviceId],
  );

  if (res.rowCount === 0) return false;
  return Boolean(res.rows[0].is_premium);
}

export async function setPremiumStatus(
  pool: pg.Pool,
  deviceId: string,
  isPremium: boolean,
): Promise<void> {
  await ensureDevice(pool, deviceId);

  await pool.query(
    "UPDATE subscriptions SET is_premium = $2, updated_at = NOW() WHERE device_id = $1",
    [deviceId, isPremium],
  );
}

export async function getWeeklyUsage(
  pool: pg.Pool,
  deviceId: string,
  yearWeek: string,
): Promise<number> {
  const res = await pool.query(
    "SELECT scans_count FROM device_weekly_usage WHERE device_id = $1 AND year_week = $2",
    [deviceId, yearWeek],
  );

  if (res.rowCount === 0) return 0;
  return Number(res.rows[0].scans_count ?? 0);
}

export async function incrementWeeklyUsage(
  pool: pg.Pool,
  deviceId: string,
  yearWeek: string,
): Promise<number> {
  const res = await pool.query(
    `
    INSERT INTO device_weekly_usage(device_id, year_week, scans_count, ai_scans_count)
    VALUES($1, $2, 1, 0)
    ON CONFLICT (device_id, year_week)
    DO UPDATE SET
      scans_count = device_weekly_usage.scans_count + 1,
      updated_at = NOW()
    RETURNING scans_count
    `,
    [deviceId, yearWeek],
  );

  return Number(res.rows[0].scans_count ?? 0);
}

export async function getWeeklyAiUsage(
  pool: pg.Pool,
  deviceId: string,
  yearWeek: string,
): Promise<number> {
  const res = await pool.query(
    "SELECT ai_scans_count FROM device_weekly_usage WHERE device_id = $1 AND year_week = $2",
    [deviceId, yearWeek],
  );

  if (res.rowCount === 0) return 0;
  return Number(res.rows[0].ai_scans_count ?? 0);
}

export async function incrementWeeklyAiUsage(
  pool: pg.Pool,
  deviceId: string,
  yearWeek: string,
): Promise<number> {
  const res = await pool.query(
    `
    INSERT INTO device_weekly_usage(device_id, year_week, scans_count, ai_scans_count)
    VALUES($1, $2, 0, 1)
    ON CONFLICT (device_id, year_week)
    DO UPDATE SET
      ai_scans_count = device_weekly_usage.ai_scans_count + 1,
      updated_at = NOW()
    RETURNING ai_scans_count
    `,
    [deviceId, yearWeek],
  );

  return Number(res.rows[0].ai_scans_count ?? 0);
}
