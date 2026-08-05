"use client";

import { useEffect, useState, useCallback } from "react";

// ── Spot definitions (ordered) ───────────────────────────────────────────────

interface SpotMeta {
  label: string;
  description: string;
  color: string; // hex
}

const SPOT_ORDER = ["controlbar", "ribbon", "slide-list", "canvas", "right-panel"] as const;
type SpotId = (typeof SPOT_ORDER)[number];

const SPOT_META: Record<SpotId, SpotMeta> = {
  "controlbar":  { label: "컨트롤 바",      description: "출력 열기 · 블랙아웃 · 카운트다운 · 모니터 선택", color: "#60a5fa" },
  "ribbon":      { label: "리본 툴바",       description: "글꼴 · 색상 · 배경 · 삽입 · 전환 효과",         color: "#a78bfa" },
  "slide-list":  { label: "슬라이드 목록",   description: "썸네일 탐색 · 클릭으로 이동 · 드래그 순서 변경", color: "#34d399" },
  "canvas":      { label: "편집 캔버스",     description: "텍스트 블록 추가 · 위치·크기 조정 · 실시간 미리보기", color: "#fbbf24" },
  "right-panel": { label: "라이브러리 패널", description: "예배 순서 · 찬양 검색 · 성경 · 디자인 설정",    color: "#fb923c" },
};

interface SpotInfo extends SpotMeta {
  id: SpotId;
  rect: DOMRect;
}

const PAD = 5;
const GAP = 14;

// ── Main overlay ─────────────────────────────────────────────────────────────

export default function HelpOverlay({ onClose }: { onClose: () => void }) {
  const [spots, setSpots] = useState<SpotInfo[]>([]);
  const [vw, setVw] = useState(1280);
  const [vh, setVh] = useState(800);

  useEffect(() => {
    setVw(window.innerWidth);
    setVh(window.innerHeight);

    const results: SpotInfo[] = [];
    for (const id of SPOT_ORDER) {
      const el = document.querySelector(`[data-help-id="${id}"]`);
      if (!el) continue;
      results.push({ id, ...SPOT_META[id], rect: el.getBoundingClientRect() });
    }
    setSpots(results);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-[55]" onClick={onClose}>

      {/* Dark overlay with transparent cutout holes (SVG mask) */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={vw}
        height={vh}
        style={{ display: "block" }}
      >
        <defs>
          <mask id="help-mask">
            <rect width={vw} height={vh} fill="white" />
            {spots.map((s) => (
              <rect
                key={s.id}
                x={s.rect.left - PAD}
                y={s.rect.top - PAD}
                width={s.rect.width + PAD * 2}
                height={s.rect.height + PAD * 2}
                rx={6}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect width={vw} height={vh} fill="rgba(0,0,0,0.82)" mask="url(#help-mask)" />
      </svg>

      {/* Per-spot: glow border + number badge + callout label */}
      {spots.map((s, i) => (
        <SpotHighlight key={s.id} spot={s} index={i + 1} vw={vw} />
      ))}

      {/* Dismiss hint */}
      <div
        className="fixed bottom-5 left-1/2 -translate-x-1/2 text-xs text-zinc-400 bg-zinc-900/90 border border-zinc-700 px-4 py-2 rounded-full whitespace-nowrap"
        style={{ pointerEvents: "none" }}
      >
        아무 곳이나 클릭하거나{" "}
        <kbd className="bg-zinc-800 border border-zinc-600 px-1.5 py-0.5 rounded">Esc</kbd>
        {" "}로 닫기
      </div>
    </div>
  );
}

// ── Per-spot highlight ────────────────────────────────────────────────────────

function SpotHighlight({ spot, index, vw }: { spot: SpotInfo; index: number; vw: number }) {
  const { rect, color, label, description, id } = spot;

  // Glowing border ring
  const ringStyle: React.CSSProperties = {
    position: "fixed",
    left: rect.left - PAD,
    top: rect.top - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
    border: `2px solid ${color}`,
    borderRadius: 6,
    boxShadow: `0 0 18px ${color}55, inset 0 0 10px ${color}11`,
    pointerEvents: "none",
  };

  // Numbered badge (top-left corner of ring)
  const badgeStyle: React.CSSProperties = {
    position: "fixed",
    left: rect.left - PAD - 10,
    top: rect.top - PAD - 10,
    width: 20,
    height: 20,
    borderRadius: "50%",
    backgroundColor: color,
    color: "#111",
    fontWeight: 800,
    fontSize: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  };

  // Callout label position (different per area to avoid overlap)
  let calloutStyle: React.CSSProperties = {
    position: "fixed",
    maxWidth: 240,
    pointerEvents: "none",
    background: "rgba(20,20,23,0.97)",
    border: `1px solid ${color}55`,
    borderLeft: `3px solid ${color}`,
    borderRadius: 8,
    padding: "8px 12px",
  };

  switch (id) {
    case "controlbar":
      // Full-width top bar → callout appears bottom-right
      calloutStyle = { ...calloutStyle, right: 16, top: rect.bottom + GAP };
      break;
    case "ribbon":
      // Full-width ribbon → callout appears bottom-left
      calloutStyle = { ...calloutStyle, left: 16, top: rect.bottom + GAP };
      break;
    case "slide-list":
      // Left panel → callout appears to the right
      calloutStyle = { ...calloutStyle, left: rect.right + GAP, top: rect.top + 16, maxWidth: 220 };
      break;
    case "canvas":
      // Large center area → callout floats inside top-left
      calloutStyle = { ...calloutStyle, left: rect.left + 16, top: rect.top + 16 };
      break;
    case "right-panel":
      // Right panel → callout appears to the left
      calloutStyle = { ...calloutStyle, right: vw - rect.left + GAP, top: rect.top + 16, maxWidth: 220 };
      break;
  }

  return (
    <>
      <div style={ringStyle} />
      <div style={badgeStyle}>{index}</div>
      <div style={calloutStyle}>
        <div style={{ color, fontWeight: 700, fontSize: 12, marginBottom: 3 }}>{label}</div>
        <div style={{ color: "#a1a1aa", fontSize: 11, lineHeight: 1.55 }}>{description}</div>
      </div>
    </>
  );
}
