"use client";
import { useEffect, useState, useCallback } from "react";
import { looksDb } from "@/lib/looksDb";
import type { Look, LayerConfig } from "@/lib/types";

interface Props {
  currentLookId: number | null;
  onApplyLook: (look: Look | null) => void;
  onLooksChanged: () => void;
  layerConfig?: LayerConfig;
}

export default function LooksPanel({ currentLookId, onApplyLook, onLooksChanged, layerConfig }: Props) {
  const [looks, setLooks] = useState<Look[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editBg, setEditBg] = useState(true);
  const [editSub, setEditSub] = useState(true);
  const [editOverlay, setEditOverlay] = useState(true);
  const [editCanvas, setEditCanvas] = useState(false);
  const [editCountdown, setEditCountdown] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [captureSubtitle, setCaptureSubtitle] = useState(false);
  const [captureBg, setCaptureBg] = useState(false);

  const loadLooks = useCallback(async () => {
    const list = await looksDb.list();
    setLooks(list);
  }, []);

  useEffect(() => { void loadLooks(); }, [loadLooks]);

  function handleApply(look: Look) {
    onApplyLook(look);
  }

  function buildSnapshots() {
    const subtitleSnapshot = captureSubtitle && layerConfig
      ? (({ visible: _v, lines: _l, lines2: _l2, ...rest }) => rest)(layerConfig.subtitle)
      : undefined;
    const backgroundSnapshot = captureBg && layerConfig ? { ...layerConfig.background } : undefined;
    return { subtitleSnapshot, backgroundSnapshot };
  }

  function startEdit(look: Look) {
    setEditingId(look.id);
    setEditName(look.name);
    setEditBg(look.showBackground);
    setEditSub(look.showSubtitle);
    setEditOverlay(look.showOverlay);
    setEditCanvas(look.showCanvas);
    setEditCountdown(look.showCountdown);
    setCaptureSubtitle(!!look.subtitleSnapshot);
    setCaptureBg(!!look.backgroundSnapshot);
    setShowNew(false);
  }

  async function handleSaveEdit() {
    if (editingId === null) return;
    try {
      const { subtitleSnapshot, backgroundSnapshot } = buildSnapshots();
      const updated: Look = {
        id: editingId,
        name: editName,
        showBackground: editBg,
        showSubtitle: editSub,
        showOverlay: editOverlay,
        showCanvas: editCanvas,
        showCountdown: editCountdown,
        subtitleSnapshot,
        backgroundSnapshot,
      };
      await looksDb.update(updated);
      // If editing the currently-applied look, re-push updated look to output
      if (editingId === currentLookId) {
        onApplyLook(updated);
      }
      setEditingId(null);
      void loadLooks();
      onLooksChanged();
    } catch (e) {
      console.error("[LooksPanel] update failed:", e);
    }
  }

  function startNew() {
    setShowNew(true);
    setEditingId(null);
    setEditName("새 Look");
    setEditBg(true);
    setEditSub(true);
    setEditOverlay(true);
    setEditCanvas(false);
    setEditCountdown(false);
    setCaptureSubtitle(false);
    setCaptureBg(false);
  }

  async function handleSaveNew() {
    if (!editName.trim()) return;
    try {
      const { subtitleSnapshot, backgroundSnapshot } = buildSnapshots();
      await looksDb.create({
        name: editName,
        showBackground: editBg,
        showSubtitle: editSub,
        showOverlay: editOverlay,
        showCanvas: editCanvas,
        showCountdown: editCountdown,
        subtitleSnapshot,
        backgroundSnapshot,
      });
      setShowNew(false);
      void loadLooks();
      onLooksChanged();
    } catch (e) {
      console.error("[LooksPanel] create failed:", e);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("이 Look을 삭제하시겠습니까?")) return;
    try {
      await looksDb.delete(id);
      if (currentLookId === id) onApplyLook(null);
      void loadLooks();
      onLooksChanged();
    } catch (e) {
      console.error("[LooksPanel] delete failed:", e);
    }
  }

  function renderLayerCheckboxes() {
    return (
      <>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
          {([
            ["배경", editBg, setEditBg] as const,
            ["자막", editSub, setEditSub] as const,
            ["오버레이", editOverlay, setEditOverlay] as const,
            ["캔버스", editCanvas, setEditCanvas] as const,
            ["카운트다운", editCountdown, setEditCountdown] as const,
          ]).map(([label, val, setter]) => (
            <label key={label} className="flex items-center gap-1 cursor-pointer text-zinc-300">
              <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} className="accent-blue-500" />
              {label}
            </label>
          ))}
        </div>
        {layerConfig && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs border-t border-zinc-700 pt-1">
            <span className="w-full text-zinc-500">현재 스타일 저장:</span>
            <label className="flex items-center gap-1 cursor-pointer text-zinc-400">
              <input type="checkbox" checked={captureSubtitle} onChange={(e) => setCaptureSubtitle(e.target.checked)} className="accent-amber-500" />
              자막 스타일
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-zinc-400">
              <input type="checkbox" checked={captureBg} onChange={(e) => setCaptureBg(e.target.checked)} className="accent-amber-500" />
              배경
            </label>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 text-xs text-zinc-200">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">출력 Looks</span>
        <button onClick={startNew} className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs">+ 새 Look</button>
      </div>

      {/* Look list */}
      <div className="flex flex-col gap-1">
        {looks.map((look) => (
          <div key={look.id}
            className={`rounded border px-2 py-1.5 flex items-center gap-2 ${currentLookId === look.id ? "border-blue-500 bg-blue-950" : "border-zinc-700 bg-zinc-800"}`}>
            {editingId === look.id ? (
              <div className="flex-1 flex flex-col gap-1">
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="bg-zinc-700 border border-zinc-600 rounded px-1.5 py-0.5 text-white text-xs w-full outline-none focus:border-blue-500" />
                {renderLayerCheckboxes()}
                <div className="flex gap-1 mt-1">
                  <button onClick={() => void handleSaveEdit()} className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs">저장</button>
                  <button onClick={() => setEditingId(null)} className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs">취소</button>
                </div>
              </div>
            ) : (
              <>
                <button onClick={() => handleApply(look)}
                  className="flex-1 text-left flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${currentLookId === look.id ? "bg-blue-400" : "bg-zinc-600"}`} />
                  <span className="font-medium">{look.name}</span>
                  <span className="text-zinc-500 text-xs ml-1">
                    {[look.showBackground && "배경", look.showSubtitle && "자막", look.showOverlay && "오버레이", look.showCanvas && "캔버스", look.showCountdown && "타이머"]
                      .filter(Boolean).join(" · ")}
                  </span>
                </button>
                <button onClick={() => startEdit(look)} title="편집" className="text-zinc-500 hover:text-zinc-200 px-1">&#9999;</button>
                <button onClick={() => void handleDelete(look.id)} title="삭제" className="text-zinc-500 hover:text-red-400 px-1">&#x2715;</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* New look form */}
      {showNew && (
        <div className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 flex flex-col gap-1">
          <input value={editName} onChange={(e) => setEditName(e.target.value)}
            placeholder="Look 이름"
            className="bg-zinc-700 border border-zinc-600 rounded px-1.5 py-0.5 text-white text-xs w-full outline-none focus:border-blue-500" />
          {renderLayerCheckboxes()}
          <div className="flex gap-1 mt-1">
            <button onClick={() => void handleSaveNew()} className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs">저장</button>
            <button onClick={() => setShowNew(false)} className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs">취소</button>
          </div>
        </div>
      )}

      {looks.length === 0 && !showNew && (
        <p className="text-zinc-500 text-xs text-center py-2">Look이 없습니다. + 새 Look 버튼으로 추가하세요.</p>
      )}
    </div>
  );
}
