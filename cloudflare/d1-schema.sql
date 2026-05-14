CREATE TABLE IF NOT EXISTS quiz_access_codes (
  code TEXT PRIMARY KEY,
  is_used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  used_by_client_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_access_codes_is_used
  ON quiz_access_codes (is_used);

-- New tables to store quiz attempts and answers
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  client_id TEXT,
  user_name TEXT,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_code
  ON quiz_attempts (code);

-- Composite index to quickly fetch top results (high score, low duration)
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_score_duration
  ON quiz_attempts (score DESC, duration_ms ASC);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  chosen TEXT,
  is_correct INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempt_answers_attempt_id
  ON quiz_attempt_answers (attempt_id);
