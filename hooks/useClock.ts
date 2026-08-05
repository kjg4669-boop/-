"use client";

import { useState, useEffect } from "react";

/** 매 분마다 갱신되는 현재 시각 문자열 (HH:MM) */
export function useClock(): string {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    setClock(fmt());
    const id = setInterval(() => setClock(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return clock;
}
