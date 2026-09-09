"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { ipc } from "@/lib/ipc";
import { alertDb, type AlertTemplate } from "@/lib/alertDb";
import type { AlertPayload } from "@/lib/types";
import { useOutputStore } from "@/stores/outputStore";

// Derive position label from yPercent
function positionFromY(y: number): "top" | "center" | "bottom" {
  return y < 33 ? "top" : y > 67 ? "bottom" : "center";
}

export default function AlertPanel() {
  const [text, setText] = useState("");
  const [duration, setDuration] = useState(5000);
  const [yPercent, setYPercent] = useState(90);
  const [fontSize, setFontSize] = useState(48);
  const [bgColor, setBgColor] = useState("#1a1a1a");
  const [textColor, setTextColor] = useState("#ffffff");
  const [templates, setTemplates] = useState<AlertTemplate[]>([]);
  const alertVisible = useOutputStore((s) => s.alertVisible);

  const minimapRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const loadTemplates = useCallback(async () => {
    try { setTemplates(await alertDb.list()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  // Minimap drag logic
  function calcYFromEvent(e: MouseEvent | React.MouseEvent) {
    if (!minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;
    setYPercent(Math.max(5, Math.min(95, Math.round(rawY))));
  }

  useEffect(() => {
    if (!isDraggingRef.current) return;
    const onMove = (e: MouseEvent) => { if (isDraggingRef.current) calcYFromEvent(e); };
    const onUp = () => { isDraggingRef.current = false; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  });

  async function handleShow() {
    if (!text.trim()) return;
    const payload: AlertPayload = {
      text,
      visible: true,
      duration,
      position: positionFromY(yPercent),
      backgroundColor: bgColor,
      textColor,
      yPercent,
      fontSize,
    };
    await ipc.sendAlert(payload);
  }

  async function handleHide() {
    await ipc.sendAlertHide(positionFromY(yPercent), bgColor, textColor);
  }

  async function handleSaveTemplate() {
    if (!text.trim()) return;
    try {
      await alertDb.create({
        text: text.trim(), duration, position: positionFromY(yPercent),
        background_color: bgColor, text_color: textColor, sort_order: 0,
      });
      await loadTemplates();
    } catch (e) {
      console.error("[AlertPanel] template save failed:", e);
    }
  }

  async function handleDeleteTemplate(id: number) {
    try {
      await alertDb.delete(id);
      await loadTemplates();
    } catch (e) {
      console.error("[AlertPanel] template delete failed:", e);
    }
  }

  function loadTemplate(t: AlertTemplate) {
    setText(t.text);
    setDuration(t.duration);
    setBgColor(t.background_color);
    setTextColor(t.text_color);
  }

  // Minimap bar height as fraction of the 9-unit canvas height
  const barHeightPct = Math.min(20, Math.max(8, fontSize / 6));

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs text-white">
      <div className="p-3 space-y-2 flex-1 overflow-y-auto">
        <p className="text-zinc-400 text-xs uppercase tracking-wider">공지 텍스트</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="공지 내용을 입력하세요..."
          className="w-full bg-zinc-800 text-white rounded px-2 py-1.5 border border-zinc-600 text-xs resize-none"
        />

        {/* Position minimap */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">위치</span>
            <div className="flex gap-1">
              {([["상단", 5], ["중앙", 50], ["하단", 90]] as const).map(([label, y]) => (
                <button key={label}
                  onClick={() => setYPercent(y)}
                  className={`px-2 py-0.5 rounded text-xs ${Math.abs(yPercent - y) < 15 ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Minimap: 16:9 canvas where user clicks/drags to position the alert bar */}
          <div
            ref={minimapRef}
            onMouseDown={(e) => { isDraggingRef.current = true; calcYFromEvent(e); }}
            style={{
              width: "100%",
              aspectRatio: "16/9",
              background: "#111",
              borderRadius: 4,
              border: "1px solid #3f3f46",
              position: "relative",
              cursor: "crosshair",
              userSelect: "none",
            }}
          >
            {/* Simulated subtitle lines */}
            <div style={{ position: "absolute", top: "55%", left: "20%", right: "20%", height: 2, background: "#ffffff22", borderRadius: 1 }} />
            <div style={{ position: "absolute", top: "62%", left: "30%", right: "30%", height: 2, background: "#ffffff22", borderRadius: 1 }} />
            {/* Alert bar indicator */}
            <div
              style={{
                position: "absolute",
                left: 0, right: 0,
                height: `${barHeightPct}%`,
                top: `${yPercent}%`,
                transform: "translateY(-50%)",
                background: bgColor === "#1a1a1a" || bgColor === "#000000" ? "rgba(100,100,100,0.7)" : bgColor,
                borderTop: yPercent > 70 ? "2px solid #f97316" : undefined,
                borderBottom: yPercent < 30 ? "2px solid #f97316" : undefined,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 6,
                color: textColor,
                fontWeight: 600,
                opacity: 0.9,
              }}
            >
              {text ? (text.length > 20 ? text.slice(0, 20) + "…" : text) : "경보 텍스트"}
            </div>
          </div>
        </div>

        {/* Font size */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 w-14 shrink-0">글자 크기</span>
          <input type="range" min={24} max={96} step={4} value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-orange-500" />
          <span className="text-zinc-300 w-8 text-right">{fontSize}</span>
        </div>

        {/* Duration */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10">시간</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
            className="flex-1 bg-zinc-800 text-white rounded px-1 py-1 border border-zinc-600 text-xs">
            <option value={0}>고정</option>
            <option value={3000}>3초</option>
            <option value={5000}>5초</option>
            <option value={10000}>10초</option>
            <option value={30000}>30초</option>
          </select>
        </div>

        {/* Colors */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 w-10">배경</span>
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
            className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent" />
          <span className="text-zinc-400 flex-1">글자</span>
          <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)}
            className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent" />
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 pt-1">
          <button onClick={() => void handleShow()}
            className={`flex-1 py-1.5 rounded font-medium text-xs ${alertVisible ? "bg-orange-700 hover:bg-orange-600" : "bg-orange-600 hover:bg-orange-500"} text-white`}>
            즉시 표시
          </button>
          <button onClick={() => void handleHide()}
            className="flex-1 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs">
            숨기기
          </button>
        </div>
        <button onClick={() => void handleSaveTemplate()}
          className="w-full py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 text-xs">
          현재 공지 템플릿으로 저장
        </button>

        {/* Template list */}
        {templates.length > 0 && (
          <>
            <p className="text-zinc-400 text-xs uppercase tracking-wider pt-2">저장된 템플릿</p>
            <div className="space-y-1">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center gap-1 bg-zinc-800 rounded px-2 py-1">
                  <button onClick={() => loadTemplate(t)}
                    className="flex-1 text-left text-zinc-300 hover:text-white text-xs truncate">
                    {t.text}
                  </button>
                  <button onClick={() => void handleDeleteTemplate(t.id)}
                    className="text-zinc-600 hover:text-red-400 text-xs px-1">✕</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
