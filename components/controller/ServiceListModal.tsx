"use client";

import { useEffect, useState } from "react";
import { serviceDb } from "@/lib/db";
import type { Service } from "@/lib/types";
import { FolderOpen } from "lucide-react";

interface Props {
  onLoad: (service: Service) => void;
  onClose: () => void;
  currentServiceId?: number;
  onDeleteCurrent?: () => void;
}

export default function ServiceListModal({ onLoad, onClose, currentServiceId, onDeleteCurrent }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    serviceDb.list()
      .then((list) => {
        setServices(list);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[ServiceListModal] Failed to load services:", err);
        setLoading(false);
      });
  }, []);

  async function handleLoad(id: number) {
    setLoadingId(id);
    try {
      const service = await serviceDb.get(id);
      if (service) onLoad(service);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}" 예배를 삭제하시겠습니까?`)) return;
    try {
      await serviceDb.delete(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
      if (id === currentServiceId) onDeleteCurrent?.();
    } catch (err) {
      console.error("[ServiceListModal] Failed to delete service:", err);
    }
  }

  async function handleImportFile() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const filePath = await open({
        filters: [{ name: "Worship Projector 파일", extensions: ["wpjson", "json"] }],
        title: "예배 파일 가져오기",
      });
      if (!filePath || typeof filePath !== "string") return;

      setImporting(true);
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const bytes = await readFile(filePath);
      const { isWpkgBundle, unpackService } = await import("@/lib/wpkg");
      let parsed: Service;
      if (isWpkgBundle(bytes)) {
        const bundleName = filePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "bundle";
        parsed = await unpackService(bytes, bundleName);
      } else {
        parsed = JSON.parse(new TextDecoder().decode(bytes)) as Service;
      }
      if (!parsed || !Array.isArray(parsed.items)) {
        alert("올바른 예배 파일이 아닙니다.");
        return;
      }

      const newId = await serviceDb.importFromFile(parsed);
      const reloaded = await serviceDb.get(newId);
      if (reloaded) {
        setServices((prev) => [reloaded, ...prev]);
        onLoad(reloaded);
      }
    } catch (e) {
      console.error("[importFile]", e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`파일을 불러오는 데 실패했습니다.\n\n${msg}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-zinc-800 rounded-lg w-96 max-h-[70vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="font-semibold text-white text-sm">예배 불러오기</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportFile}
              disabled={importing}
              title="파일에서 열기 (.wpjson)"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-300 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded transition-colors"
            >
              <FolderOpen size={13} />
              {importing ? "가져오는 중..." : "파일에서 열기"}
            </button>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
          </div>
        </div>
        <div className="px-4 py-2 bg-amber-900/40 border-b border-amber-700/50 text-amber-300 text-xs">
          ⚠️ 라이브 중 불러오면 출력 화면이 초기화됩니다.
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-zinc-400 text-sm p-4">불러오는 중...</p>}
          {!loading && services.length === 0 && (
            <p className="text-zinc-400 text-sm p-4 text-center">저장된 예배가 없습니다.</p>
          )}
          {services.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-700/50 border-b border-zinc-700/40"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{s.name}</p>
                <p className="text-xs text-zinc-400">{s.date}</p>
              </div>
              <button
                onClick={() => handleLoad(s.id)}
                disabled={loadingId === s.id}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white shrink-0"
              >
                {loadingId === s.id ? "..." : "불러오기"}
              </button>
              <button
                onClick={() => handleDelete(s.id, s.name)}
                className="px-2 py-1 text-xs bg-zinc-600 hover:bg-red-700 rounded text-zinc-300 shrink-0"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
