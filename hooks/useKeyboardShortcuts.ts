"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { ipc } from "@/lib/ipc";
import { useQueueStore } from "@/stores/queueStore";

export interface KeyboardShortcutsOptions {
  isLoop: boolean;
  isBlackout: boolean;
  nextLyricSlide: () => void;
  prevLyricSlide: () => void;
  handleToggleLive: () => void;
  handleToggleBlackout: () => void;
  handleToggleClear: () => void;
  handleToggleLoop: () => void;
  handleToggleFrozen: () => void;
  handleToggleAutoAdvance: () => void;
  setBlackout: (v: boolean) => void;
  setIsClear: React.Dispatch<React.SetStateAction<boolean>>;
  setShowQuickSearch: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCheatSheet: React.Dispatch<React.SetStateAction<boolean>>;
  setCtrlNotice: React.Dispatch<React.SetStateAction<{ msg: string; error?: boolean } | null>>;
  showQuickSearchRef: MutableRefObject<boolean>;
  showCheatSheetRef: MutableRefObject<boolean>;
  handleSaveRef: MutableRefObject<() => void>;
  handleUndoRef: MutableRefObject<() => void>;
  handleRedoRef: MutableRefObject<() => void>;
  openOutputRef: MutableRefObject<() => void>;
}

/**
 * 컨트롤러 창의 전역 키보드 단축키를 등록합니다.
 * optionsRef 패턴으로 마운트 시 1회만 이벤트 리스너를 등록하고
 * 항상 최신 상태값을 참조합니다.
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const o = optionsRef.current;

      // ⌘+S / Ctrl+S: 저장 (입력 중에도 항상 동작)
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        o.handleSaveRef.current();
        return;
      }

      // 입력 요소에서는 단축키 비활성화 (Cmd+Z 포함 — 브라우저 기본 텍스트 실행 취소 허용)
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement).isContentEditable
      ) return;

      // ⌘+Z: 실행 취소 (텍스트 입력 필드 밖에서만)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        o.handleUndoRef.current();
        return;
      }
      // ⌘+Shift+Z: 다시 실행 (텍스트 입력 필드 밖에서만)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        e.preventDefault();
        o.handleRedoRef.current();
        return;
      }

      // 모달 열림 중에는 Escape만 허용
      if ((o.showQuickSearchRef.current || o.showCheatSheetRef.current) && e.key !== "Escape") return;

      const { isLoop, isBlackout } = o;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            const fl = st.getFlatSlideList();
            if (fi >= fl.length - 1) st.setActiveFlatSlide(0); else o.nextLyricSlide();
          } else { o.nextLyricSlide(); }
          break;
        case "ArrowRight":
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            const fl = st.getFlatSlideList();
            if (fi >= fl.length - 1) st.setActiveFlatSlide(0); else o.nextLyricSlide();
          } else { o.nextLyricSlide(); }
          break;
        case "ArrowLeft":
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            if (fi <= 0) { const fl = st.getFlatSlideList(); st.setActiveFlatSlide(fl.length - 1); }
            else o.prevLyricSlide();
          } else { o.prevLyricSlide(); }
          break;
        case "ArrowDown":
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            const fl = st.getFlatSlideList();
            if (fi >= fl.length - 1) st.setActiveFlatSlide(0); else o.nextLyricSlide();
          } else { o.nextLyricSlide(); }
          break;
        case "ArrowUp":
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            if (fi <= 0) { const fl = st.getFlatSlideList(); st.setActiveFlatSlide(fl.length - 1); }
            else o.prevLyricSlide();
          } else { o.prevLyricSlide(); }
          break;
        case "F5":
          e.preventDefault();
          o.handleToggleLive();
          break;
        case "b": case "B": o.handleToggleBlackout(); break;
        case "c": case "C": o.handleToggleClear(); break;
        case "l": case "L": o.handleToggleLoop(); break;
        case "o": case "O": o.openOutputRef.current(); break;
        case "Home":
          e.preventDefault();
          useQueueStore.getState().setActiveFlatSlide(0);
          break;
        case "End": {
          e.preventDefault();
          const fl = useQueueStore.getState().getFlatSlideList();
          if (fl.length > 0) useQueueStore.getState().setActiveFlatSlide(fl.length - 1);
          break;
        }
        case "PageDown": {
          const st = useQueueStore.getState();
          const svc = st.currentService;
          if (svc && st.activeItemIndex < svc.items.length - 1) st.setActiveItem(st.activeItemIndex + 1);
          break;
        }
        case "PageUp": {
          const st = useQueueStore.getState();
          if (st.activeItemIndex > 0) st.setActiveItem(st.activeItemIndex - 1);
          break;
        }
        case "f": case "F": o.handleToggleFrozen(); break;
        case "t": case "T": o.handleToggleAutoAdvance(); break;
        case "/":
          e.preventDefault();
          o.setShowQuickSearch(true);
          break;
        case "?": o.setShowCheatSheet(true); break;
        case "Escape":
          if (isBlackout) { o.setBlackout(false); void ipc.sendBlackout(false); }
          o.setIsClear(false);
          o.setShowQuickSearch(false);
          o.setShowCheatSheet(false);
          o.setCtrlNotice(null);
          break;
        case "1": case "2": case "3": case "4": case "5":
        case "6": case "7": case "8": case "9": {
          const idx = parseInt(e.key) - 1;
          const svc = useQueueStore.getState().currentService;
          if (svc && idx < svc.items.length) useQueueStore.getState().setActiveItem(idx);
          break;
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // 마운트 시 1회 등록 — optionsRef로 항상 최신값 참조
}
