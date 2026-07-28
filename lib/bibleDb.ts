"use client";

import Database from "@tauri-apps/plugin-sql";

// Promise-based singleton prevents race condition on concurrent first calls
let _dbPromise: Promise<Database> | null = null;
async function getDb(): Promise<Database> {
  if (!_dbPromise) {
    _dbPromise = Database.load("sqlite:worship.db")
      .then(async (db) => {
        await db.execute("PRAGMA foreign_keys = ON");
        return db;
      })
      .catch((err) => {
        _dbPromise = null;
        throw err;
      });
  }
  return _dbPromise;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface BibleVersion {
  id: number;
  code: string;
  name: string;
}

export interface BibleBook {
  id: number;
  version_id: number;
  book_order: number;
  abbr: string;
  name: string;
}

export interface BibleVerse {
  id: number;
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleVerseResult extends BibleVerse {
  book_name: string;
  book_abbr: string;
  version_name: string;
}

// ── Version ────────────────────────────────────────────────────────────────

export async function getBibleVersions(): Promise<BibleVersion[]> {
  const db = await getDb();
  return db.select<BibleVersion[]>("SELECT id, code, name FROM bible_versions ORDER BY id");
}

// ── Books ──────────────────────────────────────────────────────────────────

export async function getBibleBooks(versionId: number): Promise<BibleBook[]> {
  const db = await getDb();
  return db.select<BibleBook[]>(
    "SELECT id, version_id, book_order, abbr, name FROM bible_books WHERE version_id = ? ORDER BY book_order",
    [versionId]
  );
}

// ── Chapters ───────────────────────────────────────────────────────────────

export async function getChapterCount(bookId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ cnt: number }[]>(
    "SELECT MAX(chapter) AS cnt FROM bible_verses WHERE book_id = ?",
    [bookId]
  );
  return rows[0]?.cnt ?? 0;
}

// ── Verses ─────────────────────────────────────────────────────────────────

export async function getVerses(bookId: number, chapter: number): Promise<BibleVerse[]> {
  const db = await getDb();
  return db.select<BibleVerse[]>(
    "SELECT id, book_id, chapter, verse, text FROM bible_verses WHERE book_id = ? AND chapter = ? ORDER BY verse",
    [bookId, chapter]
  );
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function searchBible(
  versionId: number,
  query: string,
  limit = 50
): Promise<BibleVerseResult[]> {
  const db = await getDb();
  const escaped = query.replace(/[%_\\]/g, "\\$&");
  return db.select<BibleVerseResult[]>(
    `SELECT v.id, v.book_id, v.chapter, v.verse, v.text,
            b.name AS book_name, b.abbr AS book_abbr,
            bv.name AS version_name
     FROM bible_verses v
     JOIN bible_books b  ON b.id = v.book_id
     JOIN bible_versions bv ON bv.id = b.version_id
     WHERE b.version_id = ? AND v.text LIKE ? ESCAPE '\\'
     ORDER BY b.book_order, v.chapter, v.verse
     LIMIT ?`,
    [versionId, `%${escaped}%`, limit]
  );
}

// ── Import ─────────────────────────────────────────────────────────────────

/**
 * Import a Bible JSON file.
 *
 * Expected format:
 * {
 *   "version": { "code": "kor-kkv", "name": "개역개정" },
 *   "books": [
 *     {
 *       "order": 1, "abbr": "창", "name": "창세기",
 *       "chapters": [
 *         [verse1_text, verse2_text, ...],  // chapter 1
 *         ...
 *       ]
 *     },
 *     ...
 *   ]
 * }
 */
export async function importBibleJson(json: BibleImportJson): Promise<void> {
  const db = await getDb();

  await db.execute("BEGIN");
  try {
    // Upsert version
    await db.execute(
      "INSERT OR IGNORE INTO bible_versions (code, name) VALUES (?, ?)",
      [json.version.code, json.version.name]
    );
    const versionRows = await db.select<{ id: number }[]>(
      "SELECT id FROM bible_versions WHERE code = ?",
      [json.version.code]
    );
    const versionId = versionRows[0]?.id;
    if (versionId === undefined) throw new Error("Failed to get version ID after insert");

    // Remove existing books (cascades to verses via FK)
    await db.execute("DELETE FROM bible_books WHERE version_id = ?", [versionId]);

    for (const book of json.books) {
      await db.execute(
        "INSERT INTO bible_books (version_id, book_order, abbr, name) VALUES (?, ?, ?, ?)",
        [versionId, book.order, book.abbr, book.name]
      );
      const bookRows = await db.select<{ id: number }[]>(
        "SELECT id FROM bible_books WHERE version_id = ? AND book_order = ?",
        [versionId, book.order]
      );
      const bookId = bookRows[0]?.id;
      if (bookId === undefined) throw new Error(`Failed to get book ID for order ${book.order}`);

      // Collect all verse rows for this book, then batch-insert 200 at a time.
      // SQLite limits bound variables to 999; 200 rows × 4 cols = 800 — safely under the limit.
      // This replaces individual per-verse IPC calls (~30s for 31,000 verses) with ~160 calls.
      const BATCH = 200;
      const verseRows: [number, number, number, string][] = [];
      for (let chIdx = 0; chIdx < book.chapters.length; chIdx++) {
        const chapter = chIdx + 1;
        book.chapters[chIdx].forEach((text, vIdx) => {
          verseRows.push([bookId, chapter, vIdx + 1, text]);
        });
      }
      for (let i = 0; i < verseRows.length; i += BATCH) {
        const batch = verseRows.slice(i, i + BATCH);
        const placeholders = batch.map(() => "(?,?,?,?)").join(",");
        await db.execute(
          `INSERT INTO bible_verses (book_id, chapter, verse, text) VALUES ${placeholders}`,
          batch.flat()
        );
      }
    }

    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK").catch(() => {});
    throw e;
  }
}

export interface BibleImportJson {
  version: { code: string; name: string };
  books: Array<{
    order: number;
    abbr: string;
    name: string;
    chapters: string[][];
  }>;
}
