-- Fix FK constraints and add updated_at trigger

-- Recreate songs with proper FK on media_id (SQLite requires table recreation)
CREATE TABLE songs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT DEFAULT '',
  lyrics_json TEXT NOT NULL DEFAULT '[]',
  media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO songs_new SELECT * FROM songs;
DROP TABLE songs;
ALTER TABLE songs_new RENAME TO songs;
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);

-- Recreate service_items with ON DELETE SET NULL for song_id and media_id
CREATE TABLE service_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('song', 'video', 'announcement', 'scripture', 'blank')),
  song_id INTEGER REFERENCES songs(id) ON DELETE SET NULL,
  media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  settings_json TEXT DEFAULT '{}',
  label TEXT DEFAULT ''
);
INSERT INTO service_items_new SELECT * FROM service_items;
DROP TABLE service_items;
ALTER TABLE service_items_new RENAME TO service_items;
CREATE INDEX IF NOT EXISTS idx_service_items_service ON service_items(service_id);

-- Auto-update updated_at on songs row changes
CREATE TRIGGER IF NOT EXISTS songs_updated_at
  AFTER UPDATE ON songs
  FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE songs SET updated_at = datetime('now') WHERE id = OLD.id;
END;
