"use client";

import Database from "@tauri-apps/plugin-sql";

async function getDb() {
  return Database.load("sqlite:worship.db");
}

export interface SongUsageStat {
  count: number;
  lastUsed: string | null; // ISO datetime string or null
}

export const songUsageDb = {
  async record(songId: number, serviceId?: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO song_usage (song_id, service_id) VALUES (?, ?)",
      [songId, serviceId ?? null]
    );
  },

  async getStats(): Promise<Map<number, SongUsageStat>> {
    const db = await getDb();
    const rows = await db.select<{ song_id: number; cnt: number; last_used: string | null }[]>(
      `SELECT song_id, COUNT(*) as cnt, MAX(used_at) as last_used
       FROM song_usage GROUP BY song_id`
    );
    const map = new Map<number, SongUsageStat>();
    for (const r of rows) {
      map.set(r.song_id, { count: r.cnt, lastUsed: r.last_used });
    }
    return map;
  },

  async getDetailedReport(): Promise<Array<{
    song_id: number;
    title: string;
    artist: string;
    ccli_number: string | null;
    count: number;
    last_used: string | null;
  }>> {
    const db = await getDb();
    return db.select<Array<{
      song_id: number;
      title: string;
      artist: string;
      ccli_number: string | null;
      cnt: number;
      last_used: string | null;
    }>>(
      `SELECT su.song_id, s.title, COALESCE(s.artist, '') as artist,
              s.ccli_number, COUNT(*) as cnt, MAX(su.used_at) as last_used
       FROM song_usage su
       JOIN songs s ON s.id = su.song_id
       GROUP BY su.song_id
       ORDER BY cnt DESC, s.title`
    ).then(rows => rows.map(r => ({
      song_id: r.song_id,
      title: r.title,
      artist: r.artist,
      ccli_number: r.ccli_number,
      count: r.cnt,
      last_used: r.last_used,
    })));
  },
};
