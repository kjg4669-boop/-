CREATE TABLE IF NOT EXISTS alert_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 5000,
  position TEXT NOT NULL DEFAULT 'bottom',
  background_color TEXT NOT NULL DEFAULT 'rgba(0,0,0,0.85)',
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
