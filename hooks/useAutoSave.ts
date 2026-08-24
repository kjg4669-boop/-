"use client";

import { useEffect, useRef } from "react";
import type { Service } from "@/lib/types";
import { serviceDb } from "@/lib/db";
import { useQueueStore } from "@/stores/queueStore";

const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

// Silently saves service name + notes every 3 minutes (only when dirty).
// Items are saved by the 30s autosave in page.tsx, which shows "자동 저장됨" notice.
export function useAutoSave(
  currentService: Service | null,
  isDirty: boolean,
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const serviceRef = useRef<Service | null>(currentService);
  const isDirtyRef = useRef(isDirty);

  serviceRef.current = currentService;
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!currentService?.id || currentService.id <= 0) return;

    timerRef.current = setInterval(async () => {
      const svc = serviceRef.current;
      if (!svc?.id || svc.id <= 0) return;
      if (!isDirtyRef.current) return;
      try {
        await serviceDb.rename(svc.id, svc.name);
        await serviceDb.updateNotes(svc.id, svc.notes ?? "");
        useQueueStore.getState().setIsDirty(false);
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
