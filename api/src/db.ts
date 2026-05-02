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

export type InsertScanEventParams = {
  id: string;
  deviceId: string;
  inputPreview: string;
  finalCategory: string;
  threatType: string;
  finalRiskScore: number;
  classicCategory: string;
  classicRiskScore: number;
  aiUsed: boolean;
  isThreat: boolean;
};

export type ScanStats = {
  scansToday: number;
  scansWeek: number;
  scansMonth: number;
  threatsDetected: number;
};

export type ScanActivityItem = {
  id: string;
  createdAt: string;
  inputPreview: string;
  finalCategory: string;
  threatType: string;
  finalRiskScore: number;
  aiUsed: boolean;
  isThreat: boolean;
};

export async function insertScanEvent(
  pool: pg.Pool,
  params: InsertScanEventParams,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO scan_events(
      id,
      device_id,
      input_preview,
      final_category,
      threat_type,
      final_risk_score,
      classic_category,
      classic_risk_score,
      ai_used,
      is_threat
    )
    VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      params.id,
      params.deviceId,
      params.inputPreview,
      params.finalCategory,
      params.threatType,
      params.finalRiskScore,
      params.classicCategory,
      params.classicRiskScore,
      params.aiUsed,
      params.isThreat,
    ],
  );
}

export async function getScanStats(
  pool: pg.Pool,
  deviceId: string,
): Promise<ScanStats> {
  const res = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE created_at >= date_trunc('day', NOW())
      )::int AS scans_today,
      COUNT(*) FILTER (
        WHERE created_at >= date_trunc('week', NOW())
      )::int AS scans_week,
      COUNT(*) FILTER (
        WHERE created_at >= date_trunc('month', NOW())
      )::int AS scans_month,
      COUNT(*) FILTER (
        WHERE is_threat = TRUE
      )::int AS threats_detected
    FROM scan_events
    WHERE device_id = $1
    `,
    [deviceId],
  );

  const row = res.rows[0] ?? {};

  return {
    scansToday: Number(row.scans_today ?? 0),
    scansWeek: Number(row.scans_week ?? 0),
    scansMonth: Number(row.scans_month ?? 0),
    threatsDetected: Number(row.threats_detected ?? 0),
  };
}

export async function getScanActivity(
  pool: pg.Pool,
  deviceId: string,
  page: number,
  limit: number,
): Promise<ScanActivityItem[]> {
  const offset = (page - 1) * limit;

  const res = await pool.query(
    `
    SELECT
      id,
      created_at,
      input_preview,
      final_category,
      threat_type,
      final_risk_score,
      ai_used,
      is_threat
    FROM scan_events
    WHERE device_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [deviceId, limit, offset],
  );

  return res.rows.map((row) => ({
    id: String(row.id),
    createdAt: new Date(row.created_at).toISOString(),
    inputPreview: String(row.input_preview),
    finalCategory: String(row.final_category),
    threatType: String(row.threat_type ?? "none"),
    finalRiskScore: Number(row.final_risk_score),
    aiUsed: Boolean(row.ai_used),
    isThreat: Boolean(row.is_threat),
  }));
}
