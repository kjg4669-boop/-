"use client";

import Database from "@tauri-apps/plugin-sql";
import type { Look } from "./types";

interface LookRow {
  id: number;
  name: string;
  show_background: number;
  show_subtitle: number;
  show_overlay: number;
  show_canvas: number;
  show_countdown: number;
}

function parseLook(row: LookRow): Look {
  return {
    id: row.id,
    name: row.name,
    showBackground: row.show_background === 1,
    showSubtitle: row.show_subtitle === 1,
    showOverlay: row.show_overlay === 1,
    showCanvas: row.show_canvas === 1,
    showCountdown: row.show_countdown === 1,
  };
}

async function getDb() {
  return Database.load("sqlite:worship.db");
}

export const looksDb = {
  async list(): Promise<Look[]> {
    const db = await getDb();
    const rows = await db.select<LookRow[]>(
      "SELECT id, name, show_background, show_subtitle, show_overlay, show_canvas, show_countdown FROM looks ORDER BY id"
    );
    return rows.map(parseLook);
  },

  async create(look: Omit<Look, "id">): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
      `INSERT INTO looks (name, show_background, show_subtitle, show_overlay, show_canvas, show_countdown)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        look.name,
        look.showBackground ? 1 : 0,
        look.showSubtitle ? 1 : 0,
        look.showOverlay ? 1 : 0,
        look.showCanvas ? 1 : 0,
        look.showCountdown ? 1 : 0,
      ]
    );
    return result.lastInsertId ?? 0;
  },

  async update(look: Look): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE looks SET name=?, show_background=?, show_subtitle=?, show_overlay=?, show_canvas=?, show_countdown=? WHERE id=?`,
      [
        look.name,
        look.showBackground ? 1 : 0,
        look.showSubtitle ? 1 : 0,
        look.showOverlay ? 1 : 0,
        look.showCanvas ? 1 : 0,
        look.showCountdown ? 1 : 0,
        look.id,
      ]
    );
  },

  async delete(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM looks WHERE id=?", [id]);
  },
};
