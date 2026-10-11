CREATE TABLE IF NOT EXISTS scales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT '未分类',
  description TEXT DEFAULT '',
  instructions TEXT DEFAULT '',
  source TEXT DEFAULT '',
  license TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  is_template INTEGER DEFAULT 0,
  is_builtin INTEGER DEFAULT 0,
  consent_on INTEGER DEFAULT 0,
  consent_text TEXT DEFAULT '',
  anonymous INTEGER DEFAULT 1,
  definition TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  owner_id INTEGER
);

CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scale_id INTEGER NOT NULL REFERENCES scales(id),
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  anonymous INTEGER DEFAULT 1,
  max_responses INTEGER,
  closes_at TEXT,
  show_result INTEGER DEFAULT 0,
  collect_meta INTEGER DEFAULT 1,
  created_at TEXT,
  note TEXT DEFAULT '',
  study_id INTEGER,
  wave INTEGER,
  wave_label TEXT,
  subject_mode TEXT DEFAULT 'none',
  owner_id INTEGER
);

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  pid TEXT NOT NULL,
  answers TEXT NOT NULL,
  scores TEXT,
  duration_sec INTEGER,
  consent INTEGER DEFAULT 0,
  meta TEXT,
  group_tag TEXT DEFAULT '',
  started_at TEXT,
  submitted_at TEXT,
  subject_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_responses_survey ON responses(survey_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT,
  action TEXT,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS studies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  scale_id INTEGER NOT NULL REFERENCES scales(id),
  subject_mode TEXT DEFAULT 'auto',
  note TEXT DEFAULT '',
  created_at TEXT,
  owner_id INTEGER
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  org TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  created_at TEXT,
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  note TEXT DEFAULT '',
  role TEXT DEFAULT 'user',
  max_uses INTEGER DEFAULT 1,
  used INTEGER DEFAULT 0,
  expires_at TEXT DEFAULT '',
  created_by INTEGER,
  revoked INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER,
  admin INTEGER DEFAULT 0,
  ip TEXT DEFAULT '',
  created_at TEXT,
  last_seen TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  first INTEGER,
  n INTEGER
);
