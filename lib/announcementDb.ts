"use client";

import Database from "@tauri-apps/plugin-sql";
import type { Announcement } from "./types";

interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  duration_sec: number;
  order_num: number;
  active: number;
  created_at: string;
}

function parse(row: AnnouncementRow): Announcement {
  return { ...row, active: row.active === 1 };
}

async function getDb() {
  return Database.load("sqlite:worship.db");
}

export const announcementDb = {
  async list(): Promise<Announcement[]> {
    const db = await getDb();
    const rows = await db.select<AnnouncementRow[]>(
      "SELECT id, title, body, duration_sec, order_num, active, created_at FROM announcements ORDER BY order_num, id"
    );
    return rows.map(parse);
  },

  async create(a: Omit<Announcement, "id" | "created_at">): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
      "INSERT INTO announcements (title, body, duration_sec, order_num, active) VALUES (?, ?, ?, ?, ?)",
      [a.title, a.body, a.duration_sec, a.order_num, a.active ? 1 : 0]
    );
    return result.lastInsertId ?? 0;
  },

  async update(a: Announcement): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE announcements SET title=?, body=?, duration_sec=?, order_num=?, active=? WHERE id=?",
      [a.title, a.body, a.duration_sec, a.order_num, a.active ? 1 : 0, a.id]
    );
  },

  async delete(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM announcements WHERE id=?", [id]);
  },
};
