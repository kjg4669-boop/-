-- Bible data tables (imported via JSON)
CREATE TABLE IF NOT EXISTS bible_versions (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,  -- e.g. "kor-niv", "kor-kkv"
  name TEXT NOT NULL           -- e.g. "개역개정", "새번역"
);

CREATE TABLE IF NOT EXISTS bible_books (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES bible_versions(id) ON DELETE CASCADE,
  book_order INTEGER NOT NULL,  -- 1-66
  abbr       TEXT NOT NULL,     -- e.g. "창", "출"
  name       TEXT NOT NULL      -- e.g. "창세기", "출애굽기"
);

CREATE TABLE IF NOT EXISTS bible_verses (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES bible_books(id) ON DELETE CASCADE,
  chapter INTEGER NOT NULL,
  verse   INTEGER NOT NULL,
  text    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bible_verses_book_ch ON bible_verses(book_id, chapter);
CREATE INDEX IF NOT EXISTS idx_bible_verses_text    ON bible_verses(text);
