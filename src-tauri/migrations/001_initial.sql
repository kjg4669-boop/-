CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT DEFAULT '',
  lyrics_json TEXT NOT NULL DEFAULT '[]',
  media_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('video', 'image', 'color')),
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '주일예배',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('song', 'video', 'announcement', 'scripture', 'blank')),
  song_id INTEGER REFERENCES songs(id),
  media_id INTEGER REFERENCES media(id),
  settings_json TEXT DEFAULT '{}',
  label TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_service_items_service ON service_items(service_id);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
