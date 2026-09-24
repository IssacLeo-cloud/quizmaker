-- Migration number: 0002 	 2026-09-24T12:25:40.820Z

CREATE TABLE mcqs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_mcqs_created_by ON mcqs (created_by);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY,
  mcq_id TEXT NOT NULL REFERENCES mcqs (id) ON DELETE CASCADE,
  choice_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);
CREATE UNIQUE INDEX idx_mcq_choices_mcq_id_position ON mcq_choices (mcq_id, position);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY,
  mcq_id TEXT NOT NULL REFERENCES mcqs (id) ON DELETE CASCADE,
  choice_id TEXT NOT NULL REFERENCES mcq_choices (id) ON DELETE CASCADE,
  attempted_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
CREATE INDEX idx_mcq_attempts_attempted_by ON mcq_attempts (attempted_by);
