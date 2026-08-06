"use client";

import { useState, useEffect, useCallback } from "react";
import { ipc, isTauri } from "@/lib/ipc";

export default function NdiPanel() {
  const [ndiAvailable, setNdiAvailable] = useState<boolean | null>(null);
  const [sourceName, setSourceName] = useState("Worship Projector");
  const [fps, setFps] = useState(30);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    ipc.isNdiAvailable().then(setNdiAvailable).catch(() => setNdiAvailable(false));
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;
    let unlisten: (() => void) | null = null;
    ipc.onNdiError((msg) => setError(msg)).then((fn) => {
      if (mounted) { unlisten = fn; }
      else { fn(); }
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      await ipc.startNdiOutput(sourceName, 1920, 1080, fps);
      setRunning(true);
    } catch (e) {
      setError(String(e));
    }
  }, [sourceName, fps]);

  const handleStop = useCallback(async () => {
    try {
      await ipc.stopNdiOutput();
    } catch (e) {
      console.warn("[NDI] stop failed:", e);
    }
    setRunning(false);
  }, []);

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-zinc-200">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">NDI 출력</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
          running ? "bg-green-800 text-green-300" :
          ndiAvailable === false ? "bg-yellow-900 text-yellow-400" :
          "bg-zinc-700 text-zinc-400"
        }`}>
          {running ? "전송 중" : ndiAvailable === false ? "SDK 없음" : "중지됨"}
        </span>
      </div>

      {ndiAvailable === false && (
        <div className="rounded border border-yellow-800 bg-yellow-950 p-2 text-yellow-300 text-[11px] leading-relaxed">
          <p className="font-semibold mb-1">NDI SDK가 설치되지 않았습니다.</p>
          <p>1. <span className="font-mono">ndi.video/for-developers/ndi-sdk</span> 에서 SDK 다운로드</p>
          <p>2. 라이선스 동의 후 설치</p>
          <p>3. <span className="font-mono">--features ndi</span> 옵션으로 재빌드</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="text-zinc-400 w-14 shrink-0">소스명</label>
          <input
            type="text"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            disabled={running}
            placeholder="Worship Projector"
            className="bg-[#3c3c3c] border border-zinc-600 rounded px-2 py-1 text-white flex-1 outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-zinc-400 w-14 shrink-0">FPS</label>
          <select
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            disabled={running}
            className="bg-[#3c3c3c] border border-zinc-600 rounded px-2 py-1 text-white outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value={24}>24 fps</option>
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
        </div>
        <div className="text-zinc-600 text-[10px]">해상도: 1920×1080 (Output 창 크기 기준)</div>
      </div>

      {error && <p className="text-red-400 text-[11px] break-all">{error}</p>}

      {!running ? (
        <button
          onClick={handleStart}
          disabled={!isTauri() || ndiAvailable === false}
          className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          NDI 출력 시작
        </button>
      ) : (
        <button
          onClick={handleStop}
          className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white font-medium"
        >
          NDI 출력 중지
        </button>
      )}

      <p className="text-zinc-600 text-[10px]">OBS · vMix · Wirecast에서 NDI 소스를 추가하세요.</p>
    </div>
  );
}
