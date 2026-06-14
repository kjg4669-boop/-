"use client";

import { useQueueStore } from "@/stores/queueStore";

export default function SlideThumbnailList() {
  const { getFlatSlideList, getActiveFlatSlideIndex, setActiveFlatSlide } = useQueueStore();
  const slides = getFlatSlideList();
  const activeIdx = getActiveFlatSlideIndex();

  if (slides.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-xs p-4 text-center">
        서비스를 선택하거나
        <br />
        곡을 추가하세요
      </div>
    );
  }

  let lastSongId = -1;

  return (
    <div className="h-full overflow-y-auto p-2 flex flex-col gap-1">
      {slides.map((entry, flatIdx) => {
        const showSongHeader = entry.songId !== lastSongId;
        lastSongId = entry.songId;
        const isActive = flatIdx === activeIdx;
        const previewLines =
          entry.slide.canvas?.textBlocks.map((b) => b.text) ?? entry.slide.lines;

        return (
          <div key={`${entry.songId}-${entry.slideIndex}`}>
            {showSongHeader && (
              <div className="text-xs text-zinc-400 font-medium px-1 pt-2 pb-1 uppercase tracking-wide truncate">
                {entry.songTitle}
              </div>
            )}
            <button
              onClick={() => setActiveFlatSlide(flatIdx)}
              className={`w-full rounded border text-left transition-colors ${
                isActive
                  ? "border-blue-500 bg-blue-950"
                  : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
              }`}
            >
              {/* 16:9 mini thumbnail */}
              <div
                style={{ aspectRatio: "16/9", position: "relative", overflow: "hidden" }}
                className="rounded-t"
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "#000",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px 6px",
                    gap: 2,
                  }}
                >
                  {previewLines.slice(0, 4).map((line, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 6,
                        color: "#fff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        maxWidth: "100%",
                        textOverflow: "ellipsis",
                        lineHeight: 1.4,
                      }}
                    >
                      {line}
                    </div>
                  ))}
                  {previewLines.length === 0 && (
                    <div style={{ fontSize: 6, color: "#555" }}>빈 슬라이드</div>
                  )}
                </div>
              </div>
              {/* Label */}
              <div className="px-1 py-0.5 text-[9px] text-zinc-400 truncate">
                {entry.slide.section} {entry.slide.sectionIndex + 1}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
