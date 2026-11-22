import { describe, expect, it, vi } from "vitest";
import type pg from "pg";
import {
  authenticateDeviceSession,
  createDeviceCredentials,
  hashDeviceAccessToken,
  issueDeviceSession,
} from "./device-sessions.js";

describe("device sessions", () => {
  it("generates independent identifiers and secrets, and stores only a token hash", () => {
    const first = createDeviceCredentials();
    const second = createDeviceCredentials();
    expect(first.deviceId).not.toBe(second.deviceId);
    expect(first.accessToken).toMatch(/^[0-9a-f]{64}$/);
    expect(first.accessToken).not.toBe(second.accessToken);
    expect(first.tokenHash).toBe(hashDeviceAccessToken(first.accessToken));
    expect(first.tokenHash).not.toBe(first.accessToken);
  });

  it("does not query a user's data when an identifier is supplied without its secret", async () => {
    const query = vi.fn();
    const pool = { query } as unknown as Pick<pg.Pool, "query">;
    expect(await authenticateDeviceSession(pool, {
      deviceId: createDeviceCredentials().deviceId,
      authorization: undefined,
    })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("binds authentication to both identifier and hashed token", async () => {
    const credentials = createDeviceCredentials();
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: credentials.deviceId, time_zone: "Europe/Madrid" }],
    });
    const pool = { query } as unknown as Pick<pg.Pool, "query">;
    expect(await authenticateDeviceSession(pool, {
      deviceId: credentials.deviceId,
      authorization: `Bearer ${credentials.accessToken}`,
    })).toEqual({ deviceId: credentials.deviceId, timeZone: "Europe/Madrid" });
    expect(query.mock.calls[0][1]).toEqual([
      credentials.deviceId,
      credentials.tokenHash,
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain(credentials.accessToken);
  });

  it("does not accept a correctly formed secret for another device", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pick<pg.Pool, "query">;
    const credentials = createDeviceCredentials();
    expect(await authenticateDeviceSession(pool, {
      deviceId: createDeviceCredentials().deviceId,
      authorization: `Bearer ${credentials.accessToken}`,
    })).toBeNull();
  });

  it("creates a fresh identity and subscription in one transaction", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({ query, release });
    const result = await issueDeviceSession(
      { connect } as unknown as Pick<pg.Pool, "connect">,
      "Europe/Madrid",
    );
    expect(result.timeZone).toBe("Europe/Madrid");
    expect(query.mock.calls[0][0]).toBe("BEGIN");
    expect(query.mock.calls[1][1]).toEqual([
      result.deviceId,
      hashDeviceAccessToken(result.accessToken),
      "Europe/Madrid",
    ]);
    expect(query.mock.calls[3][0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls enrollment back if subscription creation fails", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("database unavailable"));
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({ query, release });
    await expect(issueDeviceSession(
      { connect } as unknown as Pick<pg.Pool, "connect">,
      "Europe/Madrid",
    )).rejects.toThrow("database unavailable");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(query.mock.calls.some((call) => call[0] === "COMMIT")).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects invalid time zones before connecting to the database", async () => {
    const connect = vi.fn();
    await expect(issueDeviceSession(
      { connect } as unknown as Pick<pg.Pool, "connect">,
      "not/an/iana-zone",
    )).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
});
