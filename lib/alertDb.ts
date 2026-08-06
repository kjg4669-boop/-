import Database from "@tauri-apps/plugin-sql";

export interface AlertTemplate {
  id: number;
  text: string;
  duration: number;
  position: "top" | "bottom" | "center";
  background_color: string;
  text_color: string;
  sort_order: number;
  created_at: string;
}

let _db: Database | null = null;
async function getDb(): Promise<Database> {
  if (!_db) _db = await Database.load("sqlite:worship.db");
  return _db;
}

export const alertDb = {
  async list(): Promise<AlertTemplate[]> {
    const db = await getDb();
    return db.select<AlertTemplate[]>(
      "SELECT * FROM alert_templates ORDER BY sort_order ASC, created_at ASC"
    );
  },

  async create(t: Omit<AlertTemplate, "id" | "created_at">): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
      `INSERT INTO alert_templates (text, duration, position, background_color, text_color, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [t.text, t.duration, t.position, t.background_color, t.text_color, t.sort_order]
    );
    return result.lastInsertId ?? 0;
  },

  async delete(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM alert_templates WHERE id = ?", [id]);
  },
};
