"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { announcementDb } from "@/lib/announcementDb";
import { ipc } from "@/lib/ipc";
import type { Announcement } from "@/lib/types";

export default function AnnouncementPanel() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [looping, setLooping] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", body: "", duration_sec: 5, active: true });
  const [loopBgColor, setLoopBgColor] = useState("#000000");
  const [loopTextColor, setLoopTextColor] = useState("#ffffff");
  const loopBgColorRef = useRef("#000000");
  const loopTextColorRef = useRef("#ffffff");
  loopBgColorRef.current = loopBgColor;
  loopTextColorRef.current = loopTextColor;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopingRef = useRef(false);
  const activeItemsRef = useRef<Announcement[]>([]);

  useEffect(() => {
    announcementDb.list().then(setItems).catch(console.error);
  }, []);

  const activeItems = items.filter((a) => a.active);

  useEffect(() => {
    activeItemsRef.current = activeItems;
  }, [activeItems]);

  const stopLoop = useCallback(() => {
    loopingRef.current = false;
    setLooping(false);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    void ipc.sendAnnouncementShow({ visible: false, title: "", body: "" });
  }, []);

  const advanceLoop = useCallback((idx: number) => {
    if (!loopingRef.current) return;
    const active = activeItemsRef.current;
    if (active.length === 0) { stopLoop(); return; }
    const realIdx = idx % active.length;
    const item = active[realIdx];
    setCurrentIdx(realIdx);
    void ipc.sendAnnouncementShow({ visible: true, title: item.title, body: item.body, bgColor: loopBgColorRef.current, textColor: loopTextColorRef.current });
    timerRef.current = setTimeout(() => advanceLoop(realIdx + 1), Math.max(1, item.duration_sec) * 1000);
  }, [stopLoop]);

  const startLoop = useCallback(() => {
    if (activeItemsRef.current.length === 0) return;
    loopingRef.current = true;
    setLooping(true);
    advanceLoop(0);
  }, [advanceLoop]);

  useEffect(() => { return () => stopLoop(); }, [stopLoop]);

  async function reload() {
    const list = await announcementDb.list();
    setItems(list);
  }

  function beginEdit(a: Announcement) {
    setEditingId(a.id);
    setForm({ title: a.title, body: a.body, duration_sec: a.duration_sec, active: a.active });
  }

  function beginNew() {
    setEditingId(-1);
    setForm({ title: "", body: "", duration_sec: 5, active: true });
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    try {
      if (editingId === -1) {
        await announcementDb.create({ ...form, order_num: items.length });
      } else if (editingId !== null) {
        const existing = items.find((a) => a.id === editingId)!;
        await announcementDb.update({ ...existing, ...form });
      }
      await reload();
      setEditingId(null);
    } catch (e) {
      console.error("[AnnouncementPanel] save failed:", e);
    }
  }

  async function handleDelete(id: number) {
    try {
      await announcementDb.delete(id);
      await reload();
    } catch (e) {
      console.error("[AnnouncementPanel] delete failed:", e);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-zinc-200 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">공지 루프</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${looping ? "bg-green-800 text-green-300" : "bg-zinc-700 text-zinc-400"}`}>
          {looping ? `재생 중 (${currentIdx + 1}/${activeItems.length})` : "중지"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-zinc-400">배경</label>
        <input type="color" value={loopBgColor} onChange={(e) => setLoopBgColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" title="배경 색상" />
        <label className="text-zinc-400">글자</label>
        <input type="color" value={loopTextColor} onChange={(e) => setLoopTextColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" title="글자 색상" />
        <div className="ml-auto px-2 py-0.5 rounded text-xs" style={{ backgroundColor: loopBgColor, color: loopTextColor }}>미리보기</div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={looping ? stopLoop : startLoop}
          disabled={activeItems.length === 0}
          className={`flex-1 px-3 py-1.5 rounded font-medium disabled:opacity-40 disabled:cursor-not-allowed ${looping ? "bg-red-700 hover:bg-red-600" : "bg-green-700 hover:bg-green-600"}`}
        >
          {looping ? "중지" : "루프 시작"}
        </button>
        <button
          onClick={beginNew}
          className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600"
        >
          + 추가
        </button>
      </div>

      {editingId !== null && (
        <div className="border border-zinc-600 rounded p-2 space-y-1.5 bg-zinc-800">
          <input
            type="text" placeholder="제목 *" value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-700 outline-none focus:border-blue-500"
          />
          <textarea
            placeholder="내용 (선택사항)" value={form.body} rows={2}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-700 outline-none focus:border-blue-500 resize-none"
          />
          <div className="flex items-center gap-2">
            <label className="text-zinc-400 w-14">표시 시간</label>
            <input
              type="number" min={1} max={300} value={form.duration_sec}
              onChange={(e) => setForm((f) => ({ ...f, duration_sec: Number(e.target.value) }))}
              className="w-16 bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-700 outline-none"
            />
            <span className="text-zinc-500">초</span>
            <label className="ml-2 flex items-center gap-1 text-zinc-400">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              활성
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} className="flex-1 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white">저장</button>
            <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600">취소</button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {items.length === 0 && <p className="text-zinc-500 text-center py-4">공지가 없습니다</p>}
        {items.map((a) => (
          <div
            key={a.id}
            className={`flex items-center gap-2 p-2 rounded border ${looping && activeItems[currentIdx]?.id === a.id ? "border-green-600 bg-green-900/20" : "border-zinc-700 bg-zinc-800"}`}
          >
            <div className="flex-1 min-w-0">
              <p className={`font-medium truncate ${a.active ? "text-zinc-200" : "text-zinc-500"}`}>{a.title}</p>
              {a.body && <p className="text-zinc-500 truncate text-xs">{a.body}</p>}
              <p className="text-zinc-600 text-xs">{a.duration_sec}초</p>
            </div>
            <button onClick={() => beginEdit(a)} className="text-zinc-400 hover:text-white px-1">편집</button>
            <button onClick={() => handleDelete(a.id)} className="text-zinc-500 hover:text-red-400 px-1">삭제</button>
          </div>
        ))}
      </div>
    </div>
  );
}
