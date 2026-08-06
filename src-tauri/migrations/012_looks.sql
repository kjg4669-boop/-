CREATE TABLE IF NOT EXISTS looks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  show_background INTEGER NOT NULL DEFAULT 1,
  show_subtitle INTEGER NOT NULL DEFAULT 1,
  show_overlay INTEGER NOT NULL DEFAULT 1,
  show_canvas INTEGER NOT NULL DEFAULT 1,
  show_countdown INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO looks (name, show_background, show_subtitle, show_overlay, show_canvas, show_countdown)
VALUES
  ('기본', 1, 1, 1, 0, 0),
  ('말씀 모드', 0, 1, 0, 0, 0),
  ('영상 모드', 1, 0, 0, 0, 0);
