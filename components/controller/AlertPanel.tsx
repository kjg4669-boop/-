"use client";
import { useState, useEffect, useCallback } from "react";
import { ipc } from "@/lib/ipc";
import { alertDb, type AlertTemplate } from "@/lib/alertDb";
import type { AlertPayload } from "@/lib/types";
import { useOutputStore } from "@/stores/outputStore";

export default function AlertPanel() {
  const [text, setText] = useState("");
  const [duration, setDuration] = useState(5000);
  const [position, setPosition] = useState<"top" | "bottom" | "center">("bottom");
  const [bgColor, setBgColor] = useState("#000000");
  const [textColor, setTextColor] = useState("#ffffff");
  const [templates, setTemplates] = useState<AlertTemplate[]>([]);
  const alertVisible = useOutputStore((s) => s.alertVisible);

  const loadTemplates = useCallback(async () => {
    try { setTemplates(await alertDb.list()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  async function handleShow() {
    if (!text.trim()) return;
    const payload: AlertPayload = {
      text, visible: true, duration, position,
      backgroundColor: bgColor, textColor,
    };
    await ipc.sendAlert(payload);
  }

  async function handleHide() {
    await ipc.sendAlertHide(position, bgColor, textColor);
  }

  async function handleSaveTemplate() {
    if (!text.trim()) return;
    try {
      await alertDb.create({
        text: text.trim(), duration, position,
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
    setPosition(t.position as "top" | "bottom" | "center");
    setBgColor(t.background_color);
    setTextColor(t.text_color);
  }

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

        {/* Position */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10">위치</span>
          {(["top", "center", "bottom"] as const).map((pos) => (
            <button key={pos}
              onClick={() => setPosition(pos)}
              className={`flex-1 py-1 rounded text-xs ${position === pos ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}
            >{pos === "top" ? "상단" : pos === "center" ? "중앙" : "하단"}</button>
          ))}
        </div>

        {/* Duration */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10">시간</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
            className="flex-1 bg-zinc-800 text-white rounded px-1 py-1 border border-zinc-600 text-xs">
            <option value={0}>수동 닫기</option>
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
