"use client";

import { useState } from "react";

interface Props {
  initialName?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

export default function SaveServiceModal({ initialName = "", onSave, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-zinc-800 rounded-lg w-80 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="font-semibold text-white text-sm">예배 저장</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400">예배 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="주일예배 2부"
              className="px-3 py-2 rounded bg-zinc-700 text-white text-sm border border-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!trimmed}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
