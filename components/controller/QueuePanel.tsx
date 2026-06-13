"use client";

import { useEffect, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb } from "@/lib/db";
import type { Service } from "@/lib/types";

export default function QueuePanel() {
  const [services, setServices] = useState<Service[]>([]);
  const { currentService, activeItemIndex, setCurrentService, setActiveItem } = useQueueStore();

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
      {/* Service selector */}
      <div className="p-2 border-b border-zinc-700">
        <select
          className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600"
          onChange={(e) => loadService(Number(e.target.value))}
          value={currentService?.id ?? ""}
        >
          <option value="">-- 예배 선택 --</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.date})</option>
          ))}
        </select>
      </div>

      {/* Queue items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-zinc-500 p-3">예배 순서가 없습니다</p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setActiveItem(i)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 transition-colors ${
                i === activeItemIndex ? "bg-blue-900 border-l-2 border-l-blue-400" : ""
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
