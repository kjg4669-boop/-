"use client";

import { useEffect, useState } from "react";
import { templateDb } from "@/lib/db";
import type { Template } from "@/lib/db";
import type { Service } from "@/lib/types";

interface Props {
  onCreateService: (service: Service) => void;
  onClose: () => void;
}

export default function TemplateModal({ onCreateService, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    templateDb.list().then((list) => { setTemplates(list); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleCreate(template: Template) {
    setCreatingId(template.id);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const name = `${template.name} (${today})`;
      const service = await templateDb.createServiceFrom(template.id, name, today);
      if (service) onCreateService(service);
    } catch {
      setError("예배 생성에 실패했습니다.");
    } finally {
      setCreatingId(null);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}" 템플릿을 삭제하시겠습니까?`)) return;
    setError(null);
    try {
      await templateDb.delete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (deletingId === id) setDeletingId(null);
    } catch {
      setError("삭제에 실패했습니다.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-zinc-800 rounded-lg w-96 max-h-[70vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="font-semibold text-white text-sm">예배 템플릿</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        {error && (
          <div className="px-4 py-2 bg-red-900/60 text-red-200 text-xs border-b border-red-700/50">{error}</div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-zinc-400 text-sm p-4">불러오는 중...</p>}
          {!loading && templates.length === 0 && (
            <div className="p-6 text-center space-y-1">
              <p className="text-zinc-400 text-sm">저장된 템플릿이 없습니다</p>
              <p className="text-zinc-600 text-xs">예배를 열고 큐패널의 "템플릿 저장" 버튼을 누르세요</p>
            </div>
          )}
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-700/50 border-b border-zinc-700/40"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{t.name}</p>
                <p className="text-xs text-zinc-400">{t.items.length}개 항목 · {t.created_at.slice(0, 10)}</p>
              </div>
              <button
                onClick={() => handleCreate(t)}
                disabled={creatingId === t.id}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white shrink-0"
              >
                {creatingId === t.id ? "..." : "새 예배"}
              </button>
              <button
                onClick={() => handleDelete(t.id, t.name)}
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
