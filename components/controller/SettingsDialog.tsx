"use client";

import { useSettingsStore } from "@/stores/settingsStore";

interface Props {
  onClose: () => void;
}

const FONT_SCALE_OPTIONS = [
  { label: "매우 작게", value: 0.8 },
  { label: "작게", value: 0.9 },
  { label: "보통", value: 1.0 },
  { label: "크게", value: 1.1 },
  { label: "매우 크게", value: 1.2 },
];

export default function SettingsDialog({ onClose }: Props) {
  const { uiFontScale, setUiFontScale, outputScaleMode, setOutputScaleMode } = useSettingsStore();

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl w-[420px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="text-white font-semibold text-sm">설정</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-lg leading-none"
          >✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* UI 글씨 크기 */}
          <section className="space-y-3">
            <h3 className="text-zinc-300 font-medium text-xs uppercase tracking-wider border-b border-zinc-700 pb-1">
              화면 표시
            </h3>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-zinc-300 text-sm">글씨 크기</label>
                <span className="text-zinc-400 text-xs">
                  {FONT_SCALE_OPTIONS.find((o) => o.value === uiFontScale)?.label ?? "보통"}
                  {" "}({Math.round(uiFontScale * 100)}%)
                </span>
              </div>
              <div className="flex gap-1">
                {FONT_SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setUiFontScale(opt.value)}
                    className={`flex-1 py-1.5 rounded text-xs transition-colors ${
                      uiFontScale === opt.value
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-zinc-500 text-xs">앱 전체 UI 텍스트 크기를 조절합니다. 재시작 없이 즉시 적용됩니다.</p>
            </div>
          </section>

          {/* 출력 화면 */}
          <section className="space-y-3">
            <h3 className="text-zinc-300 font-medium text-xs uppercase tracking-wider border-b border-zinc-700 pb-1">
              출력 화면
            </h3>

            <div className="space-y-2">
              <label className="text-zinc-300 text-sm">출력 비율</label>
              <div className="flex gap-1">
                {(["fit", "fill", "native"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setOutputScaleMode(mode)}
                    className={`flex-1 py-1.5 rounded text-xs ${
                      outputScaleMode === mode
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                  >
                    {mode === "fit" ? "맞춤" : mode === "fill" ? "채움" : "원본"}
                  </button>
                ))}
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
