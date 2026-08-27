"use client";

import { useState, useEffect } from "react";
import { Music } from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

interface Props {
  open: boolean;
  onClose: () => void;
}

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "latest" }
  | { status: "available"; version: string; update: Awaited<ReturnType<typeof check>> }
  | { status: "downloading" }
  | { status: "error"; message: string };

export default function AboutDialog({ open, onClose }: Props) {
  const [version, setVersion] = useState("...");
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    if (open) {
      getVersion().then(setVersion).catch(() => setVersion("1.0.0"));
      setUpdateState({ status: "idle" });
    }
  }, [open]);

  async function handleCheckUpdate() {
    setUpdateState({ status: "checking" });
    try {
      const update = await check();
      if (update?.available) {
        setUpdateState({ status: "available", version: update.version, update });
      } else {
        setUpdateState({ status: "latest" });
      }
    } catch (e) {
      setUpdateState({ status: "error", message: String(e) });
    }
  }

  async function handleInstallUpdate() {
    if (updateState.status !== "available") return;
    setUpdateState({ status: "downloading" });
    try {
      await updateState.update!.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setUpdateState({ status: "error", message: String(e) });
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-zinc-800 border border-zinc-600 rounded-lg p-8 w-80 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4 text-zinc-300">
          <Music size={40} />
        </div>
        <h1 className="text-xl font-bold text-white mb-1">Worship Projector</h1>
        <div className="text-zinc-400 text-sm mb-5">버전 {version}</div>
        <p className="text-zinc-400 text-xs leading-relaxed mb-5">
          교회 예배 미디어 프로젝션 소프트웨어<br />
          찬양, 성경, 영상을 하나의 화면에서 관리합니다.
        </p>

        <div className="mb-5 text-xs min-h-[20px]">
          {updateState.status === "checking" && (
            <span className="text-zinc-400">업데이트 확인 중...</span>
          )}
          {updateState.status === "latest" && (
            <span className="text-green-400">최신 버전입니다.</span>
          )}
          {updateState.status === "available" && (
            <span className="text-yellow-400">새 버전 {updateState.version} 사용 가능</span>
          )}
          {updateState.status === "downloading" && (
            <span className="text-zinc-400">다운로드 및 설치 중...</span>
          )}
          {updateState.status === "error" && (
            <span className="text-red-400">오류: {updateState.message}</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {updateState.status === "available" ? (
            <button
              onClick={handleInstallUpdate}
              className="px-6 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
            >
              지금 업데이트
            </button>
          ) : (
            <button
              onClick={handleCheckUpdate}
              disabled={updateState.status === "checking" || updateState.status === "downloading"}
              className="px-6 py-1.5 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
            >
              업데이트 확인
            </button>
          )}
          <button
            onClick={onClose}
            className="px-6 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
