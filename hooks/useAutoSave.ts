"use client";

import { useEffect, useRef } from "react";
import type { Service } from "@/lib/types";
import { serviceDb } from "@/lib/db";
import { useQueueStore } from "@/stores/queueStore";
import { useErrorStore } from "@/stores/errorStore";

const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes — items + meta

// Silently saves service items, name, and notes every 3 minutes (only when dirty).
// Shows "자동 저장됨" notice via the provided callback on successful item save.
export function useAutoSave(
  currentService: Service | null,
  isDirty: boolean,
  onSaved?: () => void,
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const serviceRef = useRef<Service | null>(currentService);
  const isDirtyRef = useRef(isDirty);
  const isSavingRef = useRef(false);

  serviceRef.current = currentService;
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!currentService?.id || currentService.id <= 0) return;

    timerRef.current = setInterval(async () => {
      const svc = serviceRef.current;
      if (!svc?.id || svc.id <= 0) return;
      if (!isDirtyRef.current || isSavingRef.current) return;
      isSavingRef.current = true;
      try {
        await serviceDb.saveItems(svc.id, svc.items);
        await serviceDb.rename(svc.id, svc.name);
        await serviceDb.updateNotes(svc.id, svc.notes ?? "");
        const reloaded = await serviceDb.get(svc.id);
        if (reloaded) useQueueStore.getState().updateServiceData(reloaded);
        else useQueueStore.getState().setIsDirty(false);
        onSaved?.();
      } catch (e) {
        console.warn("[AutoSave] Failed:", e);
        useErrorStore.getState().addError("자동 저장에 실패했습니다", "AutoSave");
      } finally {
        isSavingRef.current = false;
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
