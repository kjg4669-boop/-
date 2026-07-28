"use client";

import { invoke } from "@tauri-apps/api/core";

export async function openHelpWindow(): Promise<void> {
  await invoke("open_help_window");
}
