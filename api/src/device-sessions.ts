import { createHash, randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import { validateTimeZone } from "./scan-policy.js";

const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_TOKEN = /^[0-9a-f]{64}$/i;

export type DeviceSession = {
  deviceId: string;
  accessToken: string;
  timeZone: string;
};

export function hashDeviceAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createDeviceCredentials(): {
  deviceId: string;
  accessToken: string;
  tokenHash: string;
} {
  const accessToken = randomBytes(32).toString("hex");
  return {
    deviceId: randomUUID(),
    accessToken,
    tokenHash: hashDeviceAccessToken(accessToken),
  };
}

/** Enrollment never accepts a caller-selected identifier for an existing device. */
export async function issueDeviceSession(
  pool: Pick<pg.Pool, "connect">,
  requestedTimeZone: string,
): Promise<DeviceSession> {
  if (typeof requestedTimeZone !== "string" || requestedTimeZone.length === 0 || requestedTimeZone.length > 100) {
    throw new RangeError("invalid_time_zone");
  }
  const timeZone = validateTimeZone(requestedTimeZone);
  const credentials = createDeviceCredentials();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO devices (id, auth_token_hash, time_zone)
       VALUES ($1, $2, $3)`,
      [credentials.deviceId, credentials.tokenHash, timeZone],
    );
    await client.query(
      `INSERT INTO subscriptions (device_id, is_premium) VALUES ($1, FALSE)`,
      [credentials.deviceId],
    );
    await client.query("COMMIT");
    return {
      deviceId: credentials.deviceId,
      accessToken: credentials.accessToken,
      timeZone,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Knowing a device ID is not authentication; verify its independent bearer token. */
export async function authenticateDeviceSession(
  pool: Pick<pg.Pool, "query">,
  headers: { deviceId: unknown; authorization: unknown },
): Promise<{ deviceId: string; timeZone: string } | null> {
  if (
    typeof headers.deviceId !== "string" ||
    !DEVICE_ID.test(headers.deviceId) ||
    typeof headers.authorization !== "string"
  ) {
    return null;
  }
  const bearer = /^Bearer ([^\s]+)$/i.exec(headers.authorization);
  if (!bearer || !ACCESS_TOKEN.test(bearer[1])) return null;
  const result = await pool.query<{ id: string; time_zone: string }>(
    `SELECT id, time_zone FROM devices
      WHERE id = $1 AND auth_token_hash = $2`,
    [headers.deviceId, hashDeviceAccessToken(bearer[1])],
  );
  const row = result.rows[0];
  return row ? { deviceId: row.id, timeZone: row.time_zone } : null;
}
