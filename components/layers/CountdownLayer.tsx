"use client";

import { useEffect, useRef, useState } from "react";
import type { CountdownPayload } from "@/lib/types";

interface Props {
  countdown: CountdownPayload | null;
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function CountdownLayer({ countdown }: Props) {
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!countdown) {
      setVisible(false);
      return;
    }

    if (countdown.active) {
      // Cancel any pending hide timer when resuming
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setVisible(true);
    } else if (countdown.remainingMs <= 0) {
      // Timer finished: show "0:00" for 3 seconds then auto-hide
      setVisible(true);
      if (!hideTimerRef.current) {
        hideTimerRef.current = setTimeout(() => {
          setVisible(false);
          hideTimerRef.current = null;
        }, 3000);
      }
    } else {
      // Manually stopped mid-way — hide immediately
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setVisible(false);
    }
  }, [countdown]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  if (!visible || !countdown) return null;

  const progress = countdown.totalMs > 0
    ? (countdown.remainingMs / countdown.totalMs)
    : 0;
  const isWarning = countdown.remainingMs <= 60000 && countdown.remainingMs > 0; // last 60s
  const isDone = countdown.remainingMs <= 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.85)",
        pointerEvents: "none",
      }}
    >
      {/* Progress ring background */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 320,
          height: 320,
        }}
      >
        {/* SVG progress ring */}
        <svg
          width="320"
          height="320"
          style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}
        >
          <circle cx="160" cy="160" r="148" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
          <circle
            cx="160" cy="160" r="148"
            fill="none"
            stroke={isDone ? "#6b7280" : isWarning ? "#f97316" : "#3b82f6"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 148}`}
            strokeDashoffset={`${2 * Math.PI * 148 * (1 - progress)}`}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
          />
        </svg>

        {/* Time display */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              fontFamily: "monospace",
              color: isDone ? "#6b7280" : isWarning ? "#fb923c" : "#ffffff",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              transition: "color 0.5s ease",
            }}
          >
            {formatTime(countdown.remainingMs)}
          </div>
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.5)",
              marginTop: 12,
              fontWeight: 500,
            }}
          >
            {isDone ? "예배 시작" : "예배 시작까지"}
          </div>
        </div>
      </div>
    </div>
  );
}
