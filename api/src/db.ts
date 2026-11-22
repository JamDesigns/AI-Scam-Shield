import pg from "pg";
import { getTimeContext } from "./scan-operations.js";
import type { StatsPeriod } from "./scan-policy.js";
import { premiumSql, subscriptionEnvironment, testAdminEnabled } from "./subscription-state.js";

const { Pool } = pg;

export function createPool(databaseUrl: string): pg.Pool {
  return new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
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
    `SELECT ${premiumSql("s", testAdminEnabled())} AS is_premium FROM subscriptions s WHERE device_id = $1`,
    [deviceId, subscriptionEnvironment()],
  );

  if (res.rowCount === 0) return false;
  return Boolean(res.rows[0].is_premium);
}

export async function setPremiumStatus(
  pool: pg.Pool,
  deviceId: string,
  isPremium: boolean,
): Promise<boolean> {
  if (!testAdminEnabled()) throw new Error("test_admin_disabled");
  const result = await pool.query(
    `UPDATE subscriptions s SET is_premium = $2, expires_at = NOW() + INTERVAL '1 hour',
      verified_at = NOW(), source = 'test_admin', environment = 'SANDBOX', updated_at = NOW()
      WHERE s.device_id = $1 AND EXISTS(SELECT 1 FROM devices d WHERE d.id = s.device_id AND d.auth_token_hash IS NOT NULL)
      RETURNING s.device_id`,
    [deviceId, isPremium],
  );
  return (result.rowCount ?? 0) > 0;
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
  finalRiskScore: number | null;
  classicCategory: string;
  classicRiskScore: number | null;
  aiUsed: boolean;
  isThreat: boolean;
};

export type ScanStats = {
  scansToday: number;
  scansWeek: number;
  scansMonth: number;
  scansYear: number;
  threatsDetected: number;
  totalScans: number;
  period: StatsPeriod;
  timeZone: string;
  startAt: string;
  endAt: string;
  riskBreakdown: { low_risk: number; medium_risk: number; high_risk: number; inconclusive: number };
  periods: Record<StatsPeriod, { totalScans: number; threatsDetected: number; startAt: string; endAt: string; riskBreakdown: { low_risk: number; medium_risk: number; high_risk: number; inconclusive: number } }>;
};

export type ScanActivityItem = {
  inputType: string;
  id: string;
  createdAt: string;
  inputPreview: string;
  finalCategory: string;
  threatType: string;
  finalRiskScore: number | null;
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
  timeZone = "UTC",
  period: StatsPeriod = "month",
): Promise<ScanStats> {
  const context = await getTimeContext(pool, timeZone);
  const res = await pool.query(`
    WITH periods(period, start_at) AS (VALUES
      ('today', $2::timestamptz), ('week', $3::timestamptz), ('month', $4::timestamptz), ('year', $5::timestamptz))
    SELECT p.period, p.start_at, COUNT(s.id)::int AS total_scans,
      COUNT(s.id) FILTER (WHERE s.is_threat)::int AS threats_detected,
      COUNT(s.id) FILTER (WHERE s.final_category = 'low_risk')::int AS low_risk,
      COUNT(s.id) FILTER (WHERE s.final_category = 'medium_risk')::int AS medium_risk,
      COUNT(s.id) FILTER (WHERE s.final_category = 'high_risk')::int AS high_risk,
      COUNT(s.id) FILTER (WHERE s.final_category NOT IN ('low_risk','medium_risk','high_risk'))::int AS inconclusive
    FROM periods p LEFT JOIN scan_events s ON s.device_id = $1 AND s.created_at >= p.start_at AND s.created_at <= $6::timestamptz
    GROUP BY p.period, p.start_at`,
    [deviceId, context.todayStartAt, context.weekStartAt, context.monthStartAt, context.yearStartAt, context.asOf]);
  const periods = Object.fromEntries(res.rows.map((row) => [String(row.period), {
    totalScans: Number(row.total_scans), threatsDetected: Number(row.threats_detected),
    startAt: new Date(row.start_at).toISOString(), endAt: context.asOf,
    riskBreakdown: { low_risk: Number(row.low_risk), medium_risk: Number(row.medium_risk), high_risk: Number(row.high_risk), inconclusive: Number(row.inconclusive) },
  }])) as ScanStats["periods"];
  return {
    scansToday: periods.today.totalScans, scansWeek: periods.week.totalScans,
    scansMonth: periods.month.totalScans, scansYear: periods.year.totalScans,
    ...periods[period], periods, period, timeZone,
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
      input_type,
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
    inputType: String(row.input_type ?? "text"),
    finalCategory: String(row.final_category),
    threatType: String(row.threat_type ?? "none"),
    finalRiskScore: row.final_risk_score === null ? null : Number(row.final_risk_score),
    aiUsed: Boolean(row.ai_used),
    isThreat: Boolean(row.is_threat),
  }));
}

export type MediaAnalysisJobStatus =
  | "submitting"
  | "processing"
  | "completed"
  | "failed";

export type CreateMediaAnalysisJobParams = {
  id: string;
  deviceId: string;
  provider: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  outputLanguage: string;
};

export type MediaAnalysisJob = {
  id: string;
  deviceId: string;
  provider: string;
  providerSubmissionId: string | null;
  status: MediaAnalysisJobStatus;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  outputLanguage: string;
  result: unknown | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export async function createMediaAnalysisJob(
  pool: pg.Pool,
  params: CreateMediaAnalysisJobParams,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO media_analysis_jobs(
      id,
      device_id,
      provider,
      status,
      filename,
      mime_type,
      size_bytes,
      output_language
    )
    VALUES($1, $2, $3, 'submitting', $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET provider = EXCLUDED.provider, status = 'submitting',
      filename = EXCLUDED.filename, mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes,
      output_language = EXCLUDED.output_language, provider_submission_id = NULL, result_json = NULL,
      error_message = NULL, updated_at = NOW(), completed_at = NULL
    WHERE media_analysis_jobs.device_id = EXCLUDED.device_id
    `,
    [
      params.id,
      params.deviceId,
      params.provider,
      params.filename,
      params.mimeType,
      params.sizeBytes,
      params.outputLanguage,
    ],
  );
}

export async function markMediaAnalysisJobProcessing(
  pool: pg.Pool,
  id: string,
  deviceId: string,
  providerSubmissionId: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE media_analysis_jobs
    SET
      provider_submission_id = $3,
      status = 'processing',
      updated_at = NOW()
    WHERE id = $1
      AND device_id = $2
    `,
    [id, deviceId, providerSubmissionId],
  );
}

export async function completeMediaAnalysisJob(
  pool: pg.Pool,
  params: {
    id: string;
    deviceId: string;
    providerSubmissionId?: string;
    result: unknown;
  },
): Promise<void> {
  await pool.query(
    `
    UPDATE media_analysis_jobs
    SET
      provider_submission_id = COALESCE($3, provider_submission_id),
      status = 'completed',
      result_json = $4::jsonb,
      error_message = NULL,
      updated_at = NOW(),
      completed_at = NOW()
    WHERE id = $1
      AND device_id = $2
    `,
    [
      params.id,
      params.deviceId,
      params.providerSubmissionId ?? null,
      JSON.stringify(params.result),
    ],
  );
}

export async function failMediaAnalysisJob(
  pool: pg.Pool,
  params: {
    id: string;
    deviceId: string;
    providerSubmissionId?: string;
    errorMessage?: string;
  },
): Promise<void> {
  await pool.query(
    `
    UPDATE media_analysis_jobs
    SET
      provider_submission_id = COALESCE($3, provider_submission_id),
      status = 'failed',
      error_message = $4,
      updated_at = NOW(),
      completed_at = NOW()
    WHERE id = $1
      AND device_id = $2
    `,
    [
      params.id,
      params.deviceId,
      params.providerSubmissionId ?? null,
      params.errorMessage ?? null,
    ],
  );
}

export async function getMediaAnalysisJob(
  pool: pg.Pool,
  id: string,
  deviceId: string,
): Promise<MediaAnalysisJob | null> {
  const res = await pool.query(
    `
    SELECT
      id,
      device_id,
      provider,
      provider_submission_id,
      status,
      filename,
      mime_type,
      size_bytes,
      output_language,
      result_json,
      error_message,
      created_at,
      updated_at,
      completed_at
    FROM media_analysis_jobs
    WHERE id = $1
      AND device_id = $2
    `,
    [id, deviceId],
  );

  const row = res.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    provider: String(row.provider),
    providerSubmissionId:
      row.provider_submission_id === null
        ? null
        : String(row.provider_submission_id),
    status: String(row.status) as MediaAnalysisJobStatus,
    filename: String(row.filename),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    outputLanguage: String(row.output_language),
    result: row.result_json ?? null,
    errorMessage:
      row.error_message === null
        ? null
        : String(row.error_message),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    completedAt:
      row.completed_at === null
        ? null
        : new Date(row.completed_at).toISOString(),
  };
}
