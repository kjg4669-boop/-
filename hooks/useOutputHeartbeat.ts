"use client";

import { useState, useEffect } from "react";
import { ipc } from "@/lib/ipc";

/** 출력창 heartbeat 수신 여부. 8초간 수신 없으면 false로 전환 */
const HEARTBEAT_TIMEOUT_MS = 8000;

export function useOutputHeartbeat(): boolean {
  const [outputConnected, setOutputConnected] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;
    let unlisten: (() => void) | null = null;

    const resetTimer = () => {
      setOutputConnected(true);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setOutputConnected(false), HEARTBEAT_TIMEOUT_MS);
    };

    void ipc.onHeartbeat(resetTimer).then((fn) => {
      if (mounted) unlisten = fn;
      else fn();
    });

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      unlisten?.();
    };
  }, []);

  return outputConnected;
}
