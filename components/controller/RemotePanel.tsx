"use client";

import { useState, useCallback } from "react";
import { ipc, isTauri } from "@/lib/ipc";
import { QRCodeSVG } from "qrcode.react";

export default function RemotePanel() {
  const [port, setPort] = useState(4316);
  const [running, setRunning] = useState(false);
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    setError(null);
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      setError("포트는 1024~65535 사이여야 합니다.");
      return;
    }
    try {
      const ip = await ipc.getLocalIp();
      setLocalIp(ip);
      await ipc.startRemoteServer(port);
      setRunning(true);
    } catch (e) {
      setError(String(e));
    }
  }, [port]);

  const handleStop = useCallback(async () => {
    try {
      await ipc.stopRemoteServer();
    } catch (e) {
      console.warn("[Remote] stop failed:", e);
    }
    setRunning(false);
  }, []);

  const url = localIp ? `http://${localIp}:${port}` : null;

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-zinc-200">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">웹 원격 제어</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${running ? "bg-green-800 text-green-300" : "bg-zinc-700 text-zinc-400"}`}>
          {running ? "실행 중" : "중지됨"}
        </span>
      </div>

      {!running ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="text-zinc-400 w-8">포트</label>
            <input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="bg-[#3c3c3c] border border-zinc-600 rounded px-2 py-1 text-white w-24 outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleStart}
            disabled={!isTauri()}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            서버 시작
          </button>
          {error && <p className="text-red-400 text-[11px]">{error}</p>}
          <p className="text-zinc-500 text-[11px]">스마트폰과 같은 Wi-Fi에서 접속해야 합니다.</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {url && (
            <>
              <div className="bg-white rounded p-2">
                <QRCodeSVG value={url} size={160} />
              </div>
              <p className="text-zinc-300 text-center font-mono text-sm">{url}</p>
              <p className="text-zinc-500 text-[11px] text-center">스마트폰으로 QR 코드를 스캔하거나 위 주소를 입력하세요.</p>
            </>
          )}
          <button
            onClick={handleStop}
            className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white font-medium w-full"
          >
            서버 중지
          </button>
        </div>
      )}
    </div>
  );
}
