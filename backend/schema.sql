-- ============================================================
-- Shine On You — Admin-Datenbank (Cloudflare D1 / SQLite)
-- Anlegen:  npm run db:init
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  -- Format: pbkdf2$<iterationen>$<salt-b64>$<hash-b64>
  password_hash TEXT NOT NULL,
  -- Base32-Geheimnis der Authenticator-App; erst nach Bestaetigung gesetzt.
  totp_secret   TEXT,
  -- Waehrend der Einrichtung, bevor der erste Code bestaetigt wurde.
  totp_pending  TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  -- Zuletzt verbrauchtes Zeitfenster: verhindert, dass derselbe Code
  -- innerhalb seiner Gueltigkeit ein zweites Mal funktioniert.
  totp_last_step INTEGER,
  role          TEXT NOT NULL DEFAULT 'editor',
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

-- Einmal-Wiederherstellungscodes, falls das Handy verloren geht.
CREATE TABLE IF NOT EXISTS recovery_codes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);

-- Sessions liegen serverseitig, damit sie jederzeit widerrufbar sind.
-- id ist der SHA-256 des Cookie-Tokens; das Token selbst wird nie gespeichert.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  -- 0 = Passwort stimmt, zweiter Faktor fehlt noch.
  mfa_done    INTEGER NOT NULL DEFAULT 0,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Bremse gegen Passwort-Raten: gezaehlt wird je E-Mail und je IP.
CREATE TABLE IF NOT EXISTS login_attempts (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  first_at      INTEGER NOT NULL,
  blocked_until INTEGER
);

-- Der aktuelle, noch nicht veroeffentlichte Stand der Seite.
CREATE TABLE IF NOT EXISTS draft (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  content     TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT
);

-- Bilder, die zum Entwurf gehoeren, aber noch nicht im Repository liegen.
-- Werden beim Veroeffentlichen mit committet.
CREATE TABLE IF NOT EXISTS pending_media (
  path        TEXT PRIMARY KEY,
  data_base64 TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL,
  uploaded_by TEXT
);

-- Wer wann was getan hat.
CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  user_id TEXT,
  email   TEXT,
  action  TEXT NOT NULL,
  detail  TEXT,
  ip      TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
