"use client";

import { useEffect, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb } from "@/lib/db";
import type { Service } from "@/lib/types";

export default function QueuePanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const { currentService, activeItemIndex, setCurrentService, setActiveItem, updateServiceItems } = useQueueStore();

  useEffect(() => {
    serviceDb.list().then(setServices).catch(console.error);
  }, []);

  async function loadService(id: number) {
    const service = await serviceDb.get(id);
    if (service) setCurrentService(service);
  }

  const items = currentService?.items ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-zinc-700">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <span className="flex-1 text-xs text-zinc-300 truncate">
              {currentService?.name ?? "예배 없음"}
            </span>
            <button
              onClick={() => setIsEditing(false)}
              className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
            >
              ✓ 완료
            </button>
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
            {currentService && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                편집
              </button>
            )}
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
