import Database from "@tauri-apps/plugin-sql";
import type { BackingTrack } from "./types";

interface BackingTrackRow {
  id: number;
  song_id: number;
  file_path: string;
  volume: number;
  repeat: number;       // 0 or 1 (SQLite boolean)
  start_paused: number; // 0 or 1
  created_at: string;
}

function parseTrack(row: BackingTrackRow): BackingTrack {
  return {
    id: row.id,
    song_id: row.song_id,
    file_path: row.file_path,
    volume: row.volume,
    repeat: row.repeat === 1,
    start_paused: row.start_paused === 1,
    created_at: row.created_at,
  };
}

let _db: Database | null = null;
async function getDb(): Promise<Database> {
  if (!_db) _db = await Database.load("sqlite:worship.db");
  return _db;
}

export const backingTrackDb = {
  async list(songId: number): Promise<BackingTrack[]> {
    const db = await getDb();
    const rows = await db.select<BackingTrackRow[]>(
      "SELECT * FROM backing_tracks WHERE song_id = ? ORDER BY created_at ASC",
      [songId]
    );
    return rows.map(parseTrack);
  },

  async create(
    songId: number,
    filePath: string,
    volume = 1.0,
    repeat = false,
    startPaused = false
  ): Promise<number | undefined> {
    const db = await getDb();
    const result = await db.execute(
      `INSERT INTO backing_tracks (song_id, file_path, volume, repeat, start_paused)
       VALUES (?, ?, ?, ?, ?)`,
      [songId, filePath, volume, repeat ? 1 : 0, startPaused ? 1 : 0]
    );
    return result.lastInsertId;
  },

  async update(
    id: number,
    data: Partial<Pick<BackingTrack, "volume" | "repeat" | "start_paused">>
  ): Promise<void> {
    const db = await getDb();
    const sets: string[] = [];
    const values: unknown[] = [];
    if (data.volume !== undefined) { sets.push("volume = ?"); values.push(data.volume); }
    if (data.repeat !== undefined) { sets.push("repeat = ?"); values.push(data.repeat ? 1 : 0); }
    if (data.start_paused !== undefined) { sets.push("start_paused = ?"); values.push(data.start_paused ? 1 : 0); }
    if (sets.length === 0) return;
    values.push(id);
    await db.execute(`UPDATE backing_tracks SET ${sets.join(", ")} WHERE id = ?`, values);
  },

  async delete(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM backing_tracks WHERE id = ?", [id]);
  },
};
