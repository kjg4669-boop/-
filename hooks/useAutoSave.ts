"use client";

import { useEffect, useRef } from "react";
import type { Service } from "@/lib/types";
import { serviceDb } from "@/lib/db";

const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

export function useAutoSave(
  currentService: Service | null,
  onAutoSaved: () => void
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const serviceRef = useRef<Service | null>(currentService);
  const onAutoSavedRef = useRef(onAutoSaved);

  serviceRef.current = currentService;
  onAutoSavedRef.current = onAutoSaved;

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!currentService?.id || currentService.id <= 0) return;

    timerRef.current = setInterval(async () => {
      const svc = serviceRef.current;
      if (!svc?.id || svc.id <= 0) return;
      try {
        await serviceDb.rename(svc.id, svc.name);
        await serviceDb.updateNotes(svc.id, svc.notes ?? "");
        onAutoSavedRef.current();
      } catch (e) {
        console.warn("[AutoSave] Failed:", e);
      }
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentService?.id]);
}
