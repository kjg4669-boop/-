CREATE TABLE IF NOT EXISTS song_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  service_id INTEGER,
  used_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_song_usage_song_id ON song_usage(song_id);
