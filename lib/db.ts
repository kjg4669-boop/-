"use client";

import type { Song, MediaItem, Service, ServiceItem } from "./types";

let db: Awaited<ReturnType<typeof openDb>> | null = null;

async function openDb() {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  return Database.load("sqlite:worship.db");
}

async function getDb() {
  if (!db) {
    db = await openDb();
  }
  return db;
}

// ─── Songs ──────────────────────────────────────────────────────────────────

export const songDb = {
  async list(): Promise<Song[]> {
    const conn = await getDb();
    const rows = await conn.select<any[]>(
      "SELECT * FROM songs ORDER BY title ASC"
    );
    return rows.map(parseSong);
  },

  async search(query: string): Promise<Song[]> {
    const conn = await getDb();
    const rows = await conn.select<any[]>(
      "SELECT * FROM songs WHERE title LIKE ? OR artist LIKE ? ORDER BY title ASC",
      [`%${query}%`, `%${query}%`]
    );
    return rows.map(parseSong);
  },

  async get(id: number): Promise<Song | null> {
    const conn = await getDb();
    const rows = await conn.select<any[]>("SELECT * FROM songs WHERE id = ?", [id]);
    return rows[0] ? parseSong(rows[0]) : null;
  },

  async create(song: Omit<Song, "id" | "created_at" | "updated_at">): Promise<number> {
    const conn = await getDb();
    const result = await conn.execute(
      "INSERT INTO songs (title, artist, lyrics_json, media_id) VALUES (?, ?, ?, ?)",
      [song.title, song.artist, JSON.stringify(song.lyrics_json), song.media_id ?? null]
    );
    return result.lastInsertId!;
  },

  async update(id: number, song: Partial<Omit<Song, "id" | "created_at">>): Promise<void> {
    const conn = await getDb();
    const sets: string[] = [];
    const values: any[] = [];
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
    await conn.execute("DELETE FROM songs WHERE id = ?", [id]);
  },
};

function parseSong(row: any): Song {
  return {
    ...row,
    lyrics_json: typeof row.lyrics_json === "string"
      ? JSON.parse(row.lyrics_json)
      : row.lyrics_json ?? [],
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
    return result.lastInsertId!;
  },

  async delete(id: number): Promise<void> {
    const conn = await getDb();
    await conn.execute("DELETE FROM media WHERE id = ?", [id]);
  },
};

// ─── Services ───────────────────────────────────────────────────────────────

export const serviceDb = {
  async list(): Promise<Service[]> {
    const conn = await getDb();
    const services = await conn.select<any[]>("SELECT * FROM services ORDER BY date DESC");
    return services.map((s) => ({ ...s, items: [] }));
  },

  async get(id: number): Promise<Service | null> {
    const conn = await getDb();
    const services = await conn.select<any[]>("SELECT * FROM services WHERE id = ?", [id]);
    if (!services[0]) return null;
    const items = await conn.select<any[]>(
      `SELECT si.*, s.title as song_title, s.artist, s.lyrics_json
       FROM service_items si
       LEFT JOIN songs s ON si.song_id = s.id
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
    return result.lastInsertId!;
  },

  async addItem(serviceId: number, item: Omit<ServiceItem, "id">): Promise<number> {
    const conn = await getDb();
    const result = await conn.execute(
      "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [serviceId, item.item_order, item.type, item.song_id ?? null, item.media_id ?? null, JSON.stringify(item.settings_json), item.label]
    );
    return result.lastInsertId!;
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

  async updateItemSettings(itemId: number, settings: import("./types").ServiceItemSettings): Promise<void> {
    const conn = await getDb();
    await conn.execute(
      "UPDATE service_items SET settings_json = ? WHERE id = ?",
      [JSON.stringify(settings), itemId]
    );
  },
};

function parseServiceItem(row: any): ServiceItem {
  const item: ServiceItem = {
    id: row.id,
    service_id: row.service_id,
    item_order: row.item_order,
    type: row.type,
    song_id: row.song_id,
    media_id: row.media_id,
    settings_json: typeof row.settings_json === "string"
      ? JSON.parse(row.settings_json)
      : row.settings_json ?? {},
    label: row.label ?? "",
  };
  if (row.song_title) {
    item.song = {
      id: row.song_id,
      title: row.song_title,
      artist: row.artist ?? "",
      lyrics_json: typeof row.lyrics_json === "string" ? JSON.parse(row.lyrics_json) : [],
      created_at: "",
      updated_at: "",
    };
  }
  return item;
}
