"use client";

import type { Song, MediaItem, Service, ServiceItem, ServiceItemSettings } from "./types";
import { parseLyricSlides, parseServiceItemType, parseMediaType, parseServiceItemSettings, safeJsonParse } from "./validators";

let dbPromise: ReturnType<typeof openDb> | null = null;

async function openDb() {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const conn = await Database.load("sqlite:worship.db");
  await conn.execute("PRAGMA foreign_keys = ON");
  return conn;
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}


// ─── Internal DB row types ───────────────────────────────────────────────────

interface SongRow {
  id: number;
  title: string;
  artist: string;
  lyrics_json: string;
  media_id: number | null;
  ccli_number: string | null;
  copyright_text: string | null;
  publisher: string | null;
  verse_order: string | null;
  bpm: number | null;
  created_at: string;
  updated_at: string;
}

interface ServiceRow {
  id: number;
  name: string;
  date: string;
  notes: string;
  created_at: string;
}

interface ServiceItemRow {
  id: number;
  service_id: number;
  item_order: number;
  type: string;
  song_id: number | null;
  media_id: number | null;
  settings_json: string;
  label: string;
  // joined from songs via LEFT JOIN
  song_title: string | null;
  artist: string | null;
  lyrics_json: string | null;
  song_created_at: string | null;
  song_updated_at: string | null;
  // joined from media via LEFT JOIN
  media_type: string | null;
  media_file_path: string | null;
  media_name: string | null;
  media_thumbnail_path: string | null;
  notes: string;
}

// ─── Songs ──────────────────────────────────────────────────────────────────

export const songDb = {
  async list(): Promise<Song[]> {
    const conn = await getDb();
    const rows = await conn.select<SongRow[]>(
      "SELECT * FROM songs ORDER BY title ASC"
    );
    return rows.map(parseSong);
  },

  async search(query: string): Promise<Song[]> {
    const conn = await getDb();
    const escaped = query.replace(/[%_\\]/g, "\\$&");
    const rows = await conn.select<SongRow[]>(
      "SELECT * FROM songs WHERE title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR lyrics_json LIKE ? ESCAPE '\\' ORDER BY title ASC",
      [`%${escaped}%`, `%${escaped}%`, `%${escaped}%`]
    );
    return rows.map(parseSong);
  },

  async get(id: number): Promise<Song | null> {
    const conn = await getDb();
    const rows = await conn.select<SongRow[]>("SELECT * FROM songs WHERE id = ?", [id]);
    return rows[0] ? parseSong(rows[0]) : null;
  },

  async create(song: Omit<Song, "id" | "created_at" | "updated_at">): Promise<number> {
    const conn = await getDb();
    const result = await conn.execute(
      "INSERT INTO songs (title, artist, lyrics_json, media_id, ccli_number, copyright_text, publisher, verse_order, bpm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [song.title, song.artist, JSON.stringify(song.lyrics_json), song.media_id ?? null, song.ccli_number ?? null, song.copyright_text ?? null, song.publisher ?? null, song.verse_order ? JSON.stringify(song.verse_order) : null, song.bpm ?? null]
    );
    const id = result.lastInsertId;
    if (id == null) throw new Error("INSERT failed: no lastInsertId (songs)");
    return id;
  },

  async update(id: number, song: Partial<Omit<Song, "id" | "created_at">>): Promise<void> {
    const conn = await getDb();
    const sets: string[] = [];
    const values: unknown[] = [];
    if (song.title !== undefined) { sets.push("title = ?"); values.push(song.title); }
    if (song.artist !== undefined) { sets.push("artist = ?"); values.push(song.artist); }
    if (song.lyrics_json !== undefined) { sets.push("lyrics_json = ?"); values.push(JSON.stringify(song.lyrics_json)); }
    if (song.media_id !== undefined) { sets.push("media_id = ?"); values.push(song.media_id); }
    if (song.ccli_number !== undefined) { sets.push("ccli_number = ?"); values.push(song.ccli_number || null); }
    if (song.copyright_text !== undefined) { sets.push("copyright_text = ?"); values.push(song.copyright_text || null); }
    if (song.publisher !== undefined) { sets.push("publisher = ?"); values.push(song.publisher || null); }
    if (song.verse_order !== undefined) { sets.push("verse_order = ?"); values.push(song.verse_order ? JSON.stringify(song.verse_order) : null); }
    if (song.bpm !== undefined) { sets.push("bpm = ?"); values.push(song.bpm ?? null); }
    sets.push("updated_at = datetime('now')");
    values.push(id);
    await conn.execute(`UPDATE songs SET ${sets.join(", ")} WHERE id = ?`, values);
  },

  async duplicate(id: number): Promise<Song> {
    const original = await this.get(id);
    if (!original) throw new Error("Song not found");
    const newId = await this.create({
      title: `${original.title} (복사)`,
      artist: original.artist,
      lyrics_json: original.lyrics_json,
      media_id: undefined,
      ccli_number: original.ccli_number,
      copyright_text: original.copyright_text,
      publisher: original.publisher,
      verse_order: original.verse_order,
      bpm: original.bpm,
    });
    const newSong = await this.get(newId);
    if (!newSong) throw new Error("Duplicate failed");
    return newSong;
  },

  async delete(id: number): Promise<void> {
    const conn = await getDb();
    await conn.execute("DELETE FROM service_items WHERE song_id = ?", [id]);
    await conn.execute("DELETE FROM songs WHERE id = ?", [id]);
  },
};

function parseSong(row: SongRow): Song {
  const raw = safeJsonParse(row.lyrics_json, [] as unknown[]);
  const lyrics_json = parseLyricSlides(raw);
  return {
    ...row,
    media_id: row.media_id ?? undefined,
    ccli_number: row.ccli_number ?? undefined,
    copyright_text: row.copyright_text ?? undefined,
    publisher: row.publisher ?? undefined,
    verse_order: row.verse_order ? safeJsonParse<string[]>(row.verse_order, []) : undefined,
    bpm: row.bpm ?? undefined,
    lyrics_json,
  };
}

// ─── Media ──────────────────────────────────────────────────────────────────

export const mediaDb = {
  async list(): Promise<MediaItem[]> {
    const conn = await getDb();
    return conn.select<MediaItem[]>("SELECT * FROM media ORDER BY name ASC");
  },

  async get(id: number): Promise<MediaItem | null> {
    const conn = await getDb();
    const rows = await conn.select<MediaItem[]>("SELECT * FROM media WHERE id = ?", [id]);
    return rows[0] ?? null;
  },

  async create(item: Omit<MediaItem, "id" | "created_at">): Promise<number> {
    const conn = await getDb();
    const result = await conn.execute(
      "INSERT INTO media (type, file_path, thumbnail_path, name) VALUES (?, ?, ?, ?)",
      [item.type, item.file_path, item.thumbnail_path ?? null, item.name]
    );
    const id = result.lastInsertId;
    if (id == null) throw new Error("INSERT failed: no lastInsertId (media)");
    return id;
  },

  async delete(id: number): Promise<void> {
    const conn = await getDb();
    // Null out songs.media_id to avoid stale foreign key references
    await conn.execute("UPDATE songs SET media_id = NULL WHERE media_id = ?", [id]);
    await conn.execute("DELETE FROM media WHERE id = ?", [id]);
  },
};

// ─── Services ───────────────────────────────────────────────────────────────

export const serviceDb = {
  async list(): Promise<Service[]> {
    const conn = await getDb();
    const services = await conn.select<ServiceRow[]>("SELECT * FROM services ORDER BY date DESC");
    return services.map((s) => ({ ...s, items: [] }));
  },

  async listWithCounts(): Promise<Array<{ id: number; name: string; date: string; count: number }>> {
    const conn = await getDb();
    return conn.select<Array<{ id: number; name: string; date: string; count: number }>>(
      `SELECT s.id, s.name, s.date, COUNT(si.id) as count
       FROM services s
       LEFT JOIN service_items si ON si.service_id = s.id
       GROUP BY s.id
       ORDER BY s.date DESC`
    );
  },

  async get(id: number): Promise<Service | null> {
    const conn = await getDb();
    const services = await conn.select<ServiceRow[]>("SELECT * FROM services WHERE id = ?", [id]);
    if (!services[0]) return null;
    const items = await conn.select<ServiceItemRow[]>(
      `SELECT si.*,
         s.title as song_title, s.artist, s.lyrics_json,
         s.created_at as song_created_at, s.updated_at as song_updated_at,
         m.type as media_type, m.file_path as media_file_path,
         m.name as media_name, m.thumbnail_path as media_thumbnail_path
       FROM service_items si
       LEFT JOIN songs s ON si.song_id = s.id
       LEFT JOIN media m ON si.media_id = m.id
       WHERE si.service_id = ?
       ORDER BY si.item_order ASC`,
      [id]
    );
    return {
      ...services[0],
      items: items.map(parseServiceItem),
    };
  },

  async create(name: string, date: string): Promise<number> {
    const conn = await getDb();
    const result = await conn.execute(
      "INSERT INTO services (name, date) VALUES (?, ?)",
      [name, date]
    );
    const id = result.lastInsertId;
    if (id == null) throw new Error("INSERT failed: no lastInsertId (services)");
    return id;
  },

  async addItem(serviceId: number, item: Omit<ServiceItem, "id">): Promise<number> {
    const conn = await getDb();
    const result = await conn.execute(
      "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [serviceId, item.item_order, item.type, item.song_id ?? null, item.media_id ?? null, JSON.stringify(item.settings_json), item.label, item.notes ?? ""]
    );
    const id = result.lastInsertId;
    if (id == null) throw new Error("INSERT failed: no lastInsertId (service_items)");
    return id;
  },

  async reorderItems(serviceId: number, orderedIds: number[]): Promise<void> {
    const conn = await getDb();
    for (let i = 0; i < orderedIds.length; i++) {
      await conn.execute(
        "UPDATE service_items SET item_order = ? WHERE id = ? AND service_id = ?",
        [i, orderedIds[i], serviceId]
      );
    }
  },

  async deleteItem(itemId: number): Promise<void> {
    const conn = await getDb();
    await conn.execute("DELETE FROM service_items WHERE id = ?", [itemId]);
  },

  async updateItemNotes(itemId: number, notes: string): Promise<void> {
    const conn = await getDb();
    await conn.execute("UPDATE service_items SET notes = ? WHERE id = ?", [notes, itemId]);
  },

  async updateItemSettings(itemId: number, settings: import("./types").ServiceItemSettings): Promise<void> {
    const conn = await getDb();
    await conn.execute(
      "UPDATE service_items SET settings_json = ? WHERE id = ?",
      [JSON.stringify(settings), itemId]
    );
  },

  async saveItems(serviceId: number, items: ServiceItem[]): Promise<void> {
    const conn = await getDb();
    await conn.execute("DELETE FROM service_items WHERE service_id = ?", [serviceId]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await conn.execute(
        "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [serviceId, i, item.type, item.song_id ?? null, item.media_id ?? null, JSON.stringify(item.settings_json), item.label, item.notes ?? ""]
      );
    }
  },

  async updateNotes(id: number, notes: string): Promise<void> {
    const conn = await getDb();
    await conn.execute("UPDATE services SET notes = ? WHERE id = ?", [notes, id]);
  },

  async rename(id: number, name: string): Promise<void> {
    const conn = await getDb();
    await conn.execute("UPDATE services SET name = ? WHERE id = ?", [name, id]);
  },

  async delete(id: number): Promise<void> {
    const conn = await getDb();
    // service_items are removed automatically via ON DELETE CASCADE
    await conn.execute("DELETE FROM services WHERE id = ?", [id]);
  },

  async duplicate(id: number): Promise<number> {
    const original = await serviceDb.get(id);
    if (!original) throw new Error("Service not found");
    const conn = await getDb();
    const result = await conn.execute(
      "INSERT INTO services (name, date, notes) VALUES (?, ?, ?)",
      [`${original.name} (복사)`, original.date, original.notes ?? ""]
    );
    const newId = result.lastInsertId;
    if (newId == null) throw new Error("INSERT failed: no lastInsertId (duplicate service)");
    for (let i = 0; i < original.items.length; i++) {
      const item = original.items[i];
      await conn.execute(
        "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [newId, i, item.type, item.song_id ?? null, item.media_id ?? null, JSON.stringify(item.settings_json), item.label, item.notes ?? ""]
      );
    }
    return newId;
  },

  /** Import a full Service (with embedded song data) from a .wpjson file.
   *  Uses sequential individual INSERTs (no explicit transaction) to avoid
   *  sqlx connection-pool locking issues. */
  async importFromFile(service: Service): Promise<number> {
    const conn = await getDb();

    const svcResult = await conn.execute(
      "INSERT INTO services (name, date, notes) VALUES (?, ?, ?)",
      [service.name, service.date ?? new Date().toISOString().slice(0, 10), service.notes ?? ""]
    );
    const newServiceId = svcResult.lastInsertId as number;

    for (let i = 0; i < service.items.length; i++) {
      const item = service.items[i];
      let songId: number | null = null;

      if (item.type === "song" && item.song) {
        const s = item.song;
        const songResult = await conn.execute(
          "INSERT INTO songs (title, artist, lyrics_json, media_id, ccli_number, copyright_text, publisher, verse_order, bpm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [s.title, s.artist, JSON.stringify(s.lyrics_json), null, s.ccli_number ?? null, s.copyright_text ?? null, s.publisher ?? null, s.verse_order ? JSON.stringify(s.verse_order) : null, s.bpm ?? null]
        );
        songId = songResult.lastInsertId as number;
      }

      await conn.execute(
        "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [newServiceId, i, item.type, songId, null, JSON.stringify(item.settings_json ?? {}), item.label, item.notes ?? ""]
      );
    }

    return newServiceId;
  },
};

function parseServiceItem(row: ServiceItemRow): ServiceItem {
  const item: ServiceItem = {
    id: row.id,
    service_id: row.service_id,
    item_order: row.item_order,
    type: parseServiceItemType(row.type),
    song_id: row.song_id ?? undefined,
    media_id: row.media_id ?? undefined,
    settings_json: parseServiceItemSettings(safeJsonParse(row.settings_json, {})),
    label: row.label ?? "",
    notes: row.notes ?? "",
  };
  if (row.song_title && row.song_id != null) {
    item.song = {
      id: row.song_id,
      title: row.song_title,
      artist: row.artist ?? "",
      lyrics_json: parseLyricSlides(safeJsonParse(row.lyrics_json, [])),
      created_at: row.song_created_at ?? "",
      updated_at: row.song_updated_at ?? "",
    };
  }
  if (row.media_id != null && row.media_file_path) {
    item.media = {
      id: row.media_id,
      type: parseMediaType(row.media_type),
      file_path: row.media_file_path,
      thumbnail_path: row.media_thumbnail_path ?? undefined,
      name: row.media_name ?? "",
      created_at: "",
    };
  }
  return item;
}

// ─── Templates ──────────────────────────────────────────────────────────────

export interface TemplateItem {
  type: string;
  song_id: number | null;
  media_id: number | null;
  settings_json: ServiceItemSettings;
  label: string;
}

export interface Template {
  id: number;
  name: string;
  items: TemplateItem[];
  created_at: string;
}

interface TemplateRow {
  id: number;
  name: string;
  items_json: string;
  created_at: string;
}

function parseTemplate(row: TemplateRow): Template {
  const items = safeJsonParse<TemplateItem[]>(row.items_json, []);
  return { id: row.id, name: row.name, items: Array.isArray(items) ? items : [], created_at: row.created_at };
}

export const templateDb = {
  async list(): Promise<Template[]> {
    const conn = await getDb();
    const rows = await conn.select<TemplateRow[]>("SELECT * FROM templates ORDER BY created_at DESC");
    return rows.map(parseTemplate);
  },

  async create(name: string, items: TemplateItem[]): Promise<number> {
    const conn = await getDb();
    const result = await conn.execute(
      "INSERT INTO templates (name, items_json) VALUES (?, ?)",
      [name, JSON.stringify(items)]
    );
    const id = result.lastInsertId;
    if (id == null) throw new Error("INSERT failed: no lastInsertId (templates)");
    return id;
  },

  async delete(id: number): Promise<void> {
    const conn = await getDb();
    await conn.execute("DELETE FROM templates WHERE id = ?", [id]);
  },

  async createServiceFrom(templateId: number, name: string, date: string): Promise<Service | null> {
    const conn = await getDb();
    const rows = await conn.select<TemplateRow[]>("SELECT * FROM templates WHERE id = ?", [templateId]);
    if (!rows[0]) return null;
    const template = parseTemplate(rows[0]);

    const result = await conn.execute(
      "INSERT INTO services (name, date) VALUES (?, ?)",
      [name, date]
    );
    const serviceId = result.lastInsertId;
    if (serviceId == null) throw new Error("INSERT failed (service from template)");
    for (let i = 0; i < template.items.length; i++) {
      const item = template.items[i];
      await conn.execute(
        "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [serviceId, i, item.type, item.song_id ?? null, item.media_id ?? null, JSON.stringify(item.settings_json), item.label]
      );
    }
    return serviceDb.get(serviceId);
  },
};

// ─── Tags ────────────────────────────────────────────────────────────────────

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export const tagDb = {
  async list(): Promise<Tag[]> {
    const conn = await getDb();
    return conn.select<Tag[]>("SELECT * FROM tags ORDER BY name ASC");
  },

  async create(name: string, color: string): Promise<number> {
    const conn = await getDb();
    const result = await conn.execute(
      "INSERT INTO tags (name, color) VALUES (?, ?)",
      [name, color]
    );
    const id = result.lastInsertId;
    if (id == null) throw new Error("INSERT failed: no lastInsertId (tags)");
    return id;
  },

  async delete(id: number): Promise<void> {
    const conn = await getDb();
    await conn.execute("DELETE FROM tags WHERE id = ?", [id]);
  },

  async getForSong(songId: number): Promise<Tag[]> {
    const conn = await getDb();
    return conn.select<Tag[]>(
      "SELECT t.* FROM tags t JOIN song_tags st ON t.id = st.tag_id WHERE st.song_id = ? ORDER BY t.name ASC",
      [songId]
    );
  },

  async setSongTag(songId: number, tagId: number, add: boolean): Promise<void> {
    const conn = await getDb();
    if (add) {
      await conn.execute(
        "INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)",
        [songId, tagId]
      );
    } else {
      await conn.execute(
        "DELETE FROM song_tags WHERE song_id = ? AND tag_id = ?",
        [songId, tagId]
      );
    }
  },

  async getSongIdsForTag(tagId: number): Promise<number[]> {
    const conn = await getDb();
    const rows = await conn.select<{ song_id: number }[]>(
      "SELECT song_id FROM song_tags WHERE tag_id = ?",
      [tagId]
    );
    return rows.map((r) => r.song_id);
  },

  async getAllSongTagMap(): Promise<Record<number, Tag[]>> {
    const conn = await getDb();
    const rows = await conn.select<{ song_id: number; id: number; name: string; color: string }[]>(
      "SELECT st.song_id, t.id, t.name, t.color FROM song_tags st JOIN tags t ON t.id = st.tag_id ORDER BY t.name ASC"
    );
    const map: Record<number, Tag[]> = {};
    for (const row of rows) {
      if (!map[row.song_id]) map[row.song_id] = [];
      map[row.song_id].push({ id: row.id, name: row.name, color: row.color });
    }
    return map;
  },
};
