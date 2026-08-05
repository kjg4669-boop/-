"use client";

import { useEffect } from "react";
import { useErrorStore, type ErrorEntry } from "@/stores/errorStore";

const AUTO_DISMISS_MS = 8000;

function ErrorItem({ entry }: { entry: ErrorEntry }) {
  const dismiss = useErrorStore((s) => s.dismiss);

  useEffect(() => {
    const id = setTimeout(() => dismiss(entry.id), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [entry.id, dismiss]);

  return (
    <div className="flex items-start gap-2 bg-red-950 border border-red-700 rounded px-3 py-2 text-xs text-red-200 max-w-xs shadow-lg">
      <span className="flex-1 min-w-0">
        {entry.source && (
          <span className="text-red-400 font-mono mr-1">[{entry.source}]</span>
        )}
        <span className="break-words">{entry.message}</span>
      </span>
      <button
        onClick={() => dismiss(entry.id)}
        className="text-red-400 hover:text-white flex-shrink-0 leading-none mt-0.5"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  );
}

/** 컨트롤러 창 우하단에 표시되는 에러 토스트 목록 */
export default function ErrorToast() {
  const errors = useErrorStore((s) => s.errors);
  if (errors.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-[200] pointer-events-auto">
      {errors.map((e) => (
        <ErrorItem key={e.id} entry={e} />
      ))}
    </div>
  );
}
