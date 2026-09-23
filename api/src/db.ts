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
