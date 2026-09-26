CREATE TABLE IF NOT EXISTS preview_signups (
  id TEXT PRIMARY KEY,
  method TEXT NOT NULL CHECK (method IN ('email', 'x')),
  contact TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  UNIQUE(method, contact)
);
