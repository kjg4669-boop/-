"use client";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AboutDialog({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-zinc-800 border border-zinc-600 rounded-lg p-8 w-80 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-4">🎵</div>
        <h1 className="text-xl font-bold text-white mb-1">Worship Projector</h1>
        <div className="text-zinc-400 text-sm mb-5">버전 1.0.0</div>
        <p className="text-zinc-400 text-xs leading-relaxed mb-7">
          교회 예배 미디어 프로젝션 소프트웨어<br />
          찬양, 성경, 영상을 하나의 화면에서 관리합니다.
        </p>
        <button
          onClick={onClose}
          className="px-6 py-1.5 bg-zinc-600 hover:bg-zinc-500 text-white rounded text-sm transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
