CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_weekly_usage (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  year_week TEXT NOT NULL, -- e.g. "2026-W09"
  scans_count INT NOT NULL DEFAULT 0,
  ai_scans_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, year_week)
);

CREATE TABLE IF NOT EXISTS scan_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_preview TEXT NOT NULL,
  final_category TEXT NOT NULL,
  final_risk_score INT NOT NULL,
  classic_category TEXT NOT NULL,
  classic_risk_score INT NOT NULL,
  ai_used BOOLEAN NOT NULL DEFAULT FALSE,
  is_threat BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_scan_events_device_created_at
  ON scan_events (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scan_events_device_threat_created_at
  ON scan_events (device_id, is_threat, created_at DESC);
  