CREATE TABLE IF NOT EXISTS login_flows (state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY CHECK(id = 1), checked_at TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pageviews (event_id TEXT PRIMARY KEY, day TEXT NOT NULL, page TEXT NOT NULL, visitor_hash TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS pageviews_day ON pageviews(day);
CREATE INDEX IF NOT EXISTS pageviews_visitor ON pageviews(visitor_hash, created);
