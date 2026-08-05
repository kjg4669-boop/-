"use client";

import { useState, useEffect, useRef } from "react";
import { ipc } from "@/lib/ipc";
import type { MutableRefObject } from "react";

export interface UseCountdownReturn {
  countdownMin: number;
  setCountdownMin: (n: number) => void;
  countdownActive: boolean;
  countdownRemainingMs: number;
  countdownActiveRef: MutableRefObject<boolean>;
  countdownRemainingMsRef: MutableRefObject<number>;
  countdownTotalMsRef: MutableRefObject<number>;
  onToggle: () => void;
  onReset: () => void;
}

export function useCountdown(): UseCountdownReturn {
  const [countdownMin, setCountdownMin] = useState(10);
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownRemainingMs, setCountdownRemainingMs] = useState(10 * 60 * 1000);
  const countdownTotalMsRef = useRef(10 * 60 * 1000);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownActiveRef = useRef(false);
  const countdownRemainingMsRef = useRef(10 * 60 * 1000);

  useEffect(() => { countdownActiveRef.current = countdownActive; }, [countdownActive]);
  useEffect(() => { countdownRemainingMsRef.current = countdownRemainingMs; }, [countdownRemainingMs]);

  useEffect(() => {
    if (!countdownActive) {
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
      return;
    }
    const startTime = Date.now();
    const startRemaining = countdownRemainingMs;
    countdownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, startRemaining - elapsed);
      setCountdownRemainingMs(remaining);
      void ipc.sendCountdown({ active: true, remainingMs: remaining, totalMs: countdownTotalMsRef.current });
      if (remaining <= 0) {
        setCountdownActive(false);
        clearInterval(countdownIntervalRef.current!);
        countdownIntervalRef.current = null;
        void ipc.sendCountdown({ active: false, remainingMs: 0, totalMs: countdownTotalMsRef.current });
      }
    }, 250);
    return () => {
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownActive]);

  function onToggle() {
    if (countdownActiveRef.current) {
      setCountdownActive(false);
      void ipc.sendCountdown({ active: false, remainingMs: countdownRemainingMsRef.current, totalMs: countdownTotalMsRef.current });
    } else {
      const totalMs = countdownMin * 60 * 1000;
      countdownTotalMsRef.current = totalMs;
      setCountdownRemainingMs(totalMs);
      setCountdownActive(true);
      void ipc.sendCountdown({ active: true, remainingMs: totalMs, totalMs });
    }
  }

  function onReset() {
    setCountdownActive(false);
    const totalMs = countdownMin * 60 * 1000;
    countdownTotalMsRef.current = totalMs;
    setCountdownRemainingMs(totalMs);
    void ipc.sendCountdown({ active: false, remainingMs: totalMs, totalMs });
  }

  return {
    countdownMin, setCountdownMin,
    countdownActive, countdownRemainingMs,
    countdownActiveRef, countdownRemainingMsRef, countdownTotalMsRef,
    onToggle, onReset,
  };
}
