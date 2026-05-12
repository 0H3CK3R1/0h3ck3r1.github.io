CREATE TABLE IF NOT EXISTS quiz_access_codes (
  code TEXT PRIMARY KEY,
  is_used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  used_by_client_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_access_codes_is_used
  ON quiz_access_codes (is_used);
