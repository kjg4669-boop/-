"use client";

import type { Song, MediaItem, Service, ServiceItem } from "./types";

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
      "SELECT * FROM songs WHERE title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' ORDER BY title ASC",
      [`%${escaped}%`, `%${escaped}%`]
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
      "INSERT INTO songs (title, artist, lyrics_json, media_id) VALUES (?, ?, ?, ?)",
      [song.title, song.artist, JSON.stringify(song.lyrics_json), song.media_id ?? null]
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
    sets.push("updated_at = datetime('now')");
    values.push(id);
    await conn.execute(`UPDATE songs SET ${sets.join(", ")} WHERE id = ?`, values);
  },

  async delete(id: number): Promise<void> {
    const conn = await getDb();
    await conn.execute("BEGIN");
    try {
      await conn.execute("DELETE FROM service_items WHERE song_id = ?", [id]);
      await conn.execute("DELETE FROM songs WHERE id = ?", [id]);
      await conn.execute("COMMIT");
    } catch (err) {
      await conn.execute("ROLLBACK");
      throw err;
    }
  },
};

function parseSong(row: SongRow): Song {
  let lyrics_json: import("./types").LyricSlide[] = [];
  try {
    lyrics_json = typeof row.lyrics_json === "string"
      ? JSON.parse(row.lyrics_json)
      : (row.lyrics_json ?? []);
  } catch {
    console.error("[db] lyrics_json 파싱 실패 (song id:", row.id, ")");
  }
  return { ...row, media_id: row.media_id ?? undefined, lyrics_json };
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
    await conn.execute("BEGIN");
    try {
      // Null out songs.media_id to avoid stale foreign key references
      await conn.execute("UPDATE songs SET media_id = NULL WHERE media_id = ?", [id]);
      await conn.execute("DELETE FROM media WHERE id = ?", [id]);
      await conn.execute("COMMIT");
    } catch (err) {
      await conn.execute("ROLLBACK");
      throw err;
    }
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
      "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [serviceId, item.item_order, item.type, item.song_id ?? null, item.media_id ?? null, JSON.stringify(item.settings_json), item.label]
    );
    const id = result.lastInsertId;
    if (id == null) throw new Error("INSERT failed: no lastInsertId (service_items)");
    return id;
  },

  async reorderItems(serviceId: number, orderedIds: number[]): Promise<void> {
    const conn = await getDb();
    await conn.execute("BEGIN");
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await conn.execute(
          "UPDATE service_items SET item_order = ? WHERE id = ? AND service_id = ?",
          [i, orderedIds[i], serviceId]
        );
      }
      await conn.execute("COMMIT");
    } catch (err) {
      await conn.execute("ROLLBACK");
      throw err;
    }
  },

  async deleteItem(itemId: number): Promise<void> {
    const conn = await getDb();
    await conn.execute("DELETE FROM service_items WHERE id = ?", [itemId]);
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
    await conn.execute("BEGIN");
    try {
      await conn.execute("DELETE FROM service_items WHERE service_id = ?", [serviceId]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await conn.execute(
          "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [serviceId, i, item.type, item.song_id ?? null, item.media_id ?? null, JSON.stringify(item.settings_json), item.label]
        );
      }
      await conn.execute("COMMIT");
    } catch (err) {
      await conn.execute("ROLLBACK");
      throw err;
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
    await conn.execute("BEGIN");
    try {
      const result = await conn.execute(
        "INSERT INTO services (name, date, notes) VALUES (?, ?, ?)",
        [`${original.name} (복사)`, original.date, original.notes ?? ""]
      );
      const newId = result.lastInsertId;
      if (newId == null) throw new Error("INSERT failed: no lastInsertId (duplicate service)");
      for (let i = 0; i < original.items.length; i++) {
        const item = original.items[i];
        await conn.execute(
          "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [newId, i, item.type, item.song_id ?? null, item.media_id ?? null, JSON.stringify(item.settings_json), item.label]
        );
      }
      await conn.execute("COMMIT");
      return newId;
    } catch (err) {
      await conn.execute("ROLLBACK");
      throw err;
    }
  },
};

function parseServiceItem(row: ServiceItemRow): ServiceItem {
  const item: ServiceItem = {
    id: row.id,
    service_id: row.service_id,
    item_order: row.item_order,
    type: row.type as ServiceItem["type"],
    song_id: row.song_id ?? undefined,
    media_id: row.media_id ?? undefined,
    settings_json: (() => { try { return typeof row.settings_json === "string" ? JSON.parse(row.settings_json) : (row.settings_json ?? {}); } catch { return {}; } })(),
    label: row.label ?? "",
  };
  if (row.song_title && row.song_id != null) {
    item.song = {
      id: row.song_id,
      title: row.song_title,
      artist: row.artist ?? "",
      lyrics_json: (() => { try { return typeof row.lyrics_json === "string" ? JSON.parse(row.lyrics_json) : []; } catch { return []; } })(),
      created_at: row.song_created_at ?? "",
      updated_at: row.song_updated_at ?? "",
    };
  }
  if (row.media_id != null && row.media_file_path) {
    item.media = {
      id: row.media_id,
      type: (row.media_type ?? "image") as import("./types").MediaType,
      file_path: row.media_file_path,
      thumbnail_path: row.media_thumbnail_path ?? undefined,
      name: row.media_name ?? "",
      created_at: "",
    };
  }
  return item;
}
