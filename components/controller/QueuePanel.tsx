"use client";

import { useEffect, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb } from "@/lib/db";
import type { Service } from "@/lib/types";

export default function QueuePanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("주일예배");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);

  const { currentService, activeItemIndex, setCurrentService, setActiveItem, updateServiceItems } = useQueueStore();

  useEffect(() => {
    serviceDb.list().then(setServices).catch(console.error);
  }, []);

  async function loadService(id: number) {
    const service = await serviceDb.get(id);
    if (service) setCurrentService(service);
  }

  async function handleCreateService() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = await serviceDb.create(newName.trim(), newDate);
      const updated = await serviceDb.list();
      setServices(updated);
      const service = await serviceDb.get(id);
      if (service) setCurrentService(service);
      setShowNewForm(false);
      setNewName("주일예배");
      setNewDate(new Date().toISOString().slice(0, 10));
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  const items = currentService?.items ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-zinc-700">
        {isEditing ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNewForm((v) => !v)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                + 새 예배
              </button>
              <span className="flex-1 text-xs text-zinc-300 truncate">
                {currentService?.name ?? "예배 없음"}
              </span>
              <button
                onClick={() => { setIsEditing(false); setShowNewForm(false); }}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
              >
                ✓ 완료
              </button>
            </div>
            {showNewForm && (
              <div className="space-y-1 pt-1 border-t border-zinc-700">
                <input
                  type="text"
                  placeholder="예배 이름"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleCreateService}
                    disabled={creating || !newName.trim()}
                    className="flex-1 text-xs py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                  >
                    {creating ? "생성 중..." : "만들기"}
                  </button>
                  <button
                    onClick={() => setShowNewForm(false)}
                    className="flex-1 text-xs py-1 bg-zinc-700 hover:bg-zinc-600 rounded"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <select
              className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600"
              onChange={(e) => {
                const val = e.target.value;
                if (val) loadService(Number(val)).catch(console.error);
              }}
              value={currentService?.id ?? ""}
            >
              <option value="">-- 예배 선택 --</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.date})</option>
              ))}
            </select>
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
            >
              편집
            </button>
          </div>
        )}
      </div>

      {/* Queue items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-zinc-500 p-3">예배 순서가 없습니다</p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => !isEditing && setActiveItem(i)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 transition-colors ${
                !isEditing && i === activeItemIndex ? "bg-blue-900 border-l-2 border-l-blue-400" : ""
              }`}
            >
              <div className="font-medium text-white">
                {item.song?.title ?? item.label ?? item.type}
              </div>
              {item.song?.artist && (
                <div className="text-zinc-500">{item.song.artist}</div>
              )}
              <div className="text-zinc-600 capitalize">{item.type}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
