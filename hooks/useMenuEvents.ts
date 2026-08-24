"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { ipc } from "@/lib/ipc";
import { useQueueStore } from "@/stores/queueStore";

type RightTab = "queue" | "songs" | "settings" | "alert" | "looks" | "remote" | "ndi" | "announcement" | "video";

export interface MenuEventsOptions {
  openOutputRef: MutableRefObject<() => void>;
  handleNewServiceRef: MutableRefObject<() => void>;
  handleSaveRef: MutableRefObject<() => void>;
  handleNewSlideRef: MutableRefObject<() => unknown>;
  handleDupSlideRef: MutableRefObject<() => unknown>;
  handleInsertImageRef: MutableRefObject<() => unknown>;
  setIsClear: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setRightTab: React.Dispatch<React.SetStateAction<RightTab>>;
  setShowServiceList: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSaveModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSaveAsDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowQuickSearch: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStageOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showNotice: (msg: string, error?: boolean) => void;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAbout: React.Dispatch<React.SetStateAction<boolean>>;
  openPreviewWindow: () => void;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Tauri 네이티브 메뉴 이벤트 리스너를 등록합니다.
 * 모든 옵션이 안정적인 ref/dispatcher이므로 마운트 시 1회만 실행됩니다.
 */
export function useMenuEvents(options: MenuEventsOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let unlistens: Array<() => void> = [];

    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const o = optionsRef.current;
        unlistens = await Promise.all([
          listen("menu:open-output",       () => optionsRef.current.openOutputRef.current()),
          listen("menu:close-output",      () => ipc.closeOutputWindow().catch(() => {})),
          listen("menu:show-from-start",   () => {
            useQueueStore.getState().setActiveFlatSlide(0);
            optionsRef.current.openOutputRef.current();
          }),
          listen("menu:show-from-current", () => optionsRef.current.openOutputRef.current()),
          listen("menu:hide-slide",        () => optionsRef.current.setIsClear((v) => !v)),
          listen("menu:add-song",          () => {
            optionsRef.current.setShowPanel(true);
            optionsRef.current.setRightTab("songs");
          }),
          listen("menu:new-service",       () => optionsRef.current.handleNewServiceRef.current()),
          listen("menu:open-service",      () => optionsRef.current.setShowServiceList(true)),
          listen("menu:save-service",      () => optionsRef.current.handleSaveRef.current()),
          listen("menu:save-as",           () => {
            if (!useQueueStore.getState().currentService) return;
            optionsRef.current.setShowSaveAsDialog(true);
          }),
          listen("menu:new-slide",         () => optionsRef.current.handleNewSlideRef.current()),
          listen("menu:dup-slide",         () => optionsRef.current.handleDupSlideRef.current()),
          listen("menu:add-media",         () => optionsRef.current.handleInsertImageRef.current()),
          listen("menu:add-scripture",     () => {
            optionsRef.current.setShowPanel(true);
            optionsRef.current.setRightTab("queue");
            window.dispatchEvent(new CustomEvent("worship:open-scripture-tab"));
          }),
          listen("menu:quick-search",      () => optionsRef.current.setShowQuickSearch(true)),
          listen("menu:open-stage",        () => {
            ipc.openStageWindow().catch(console.error);
            optionsRef.current.setIsStageOpen(true);
          }),
          ipc.onStageClosed(() => optionsRef.current.setIsStageOpen(false)),
          listen("menu:backup-db", async () => {
            try {
              const { save } = await import("@tauri-apps/plugin-dialog");
              const destPath = await save({
                filters: [{ name: "데이터베이스", extensions: ["db"] }],
                defaultPath: "worship-backup.db",
              });
              if (!destPath) return;
              await ipc.backupDatabase(destPath);
              optionsRef.current.showNotice("백업 완료 ✓");
            } catch (e) {
              console.error("[backup-db]", e);
              optionsRef.current.showNotice("백업 실패", true);
            }
          }),
          listen("menu:show-help",        () => { optionsRef.current.setShowPanel(true); optionsRef.current.setShowHelp(true); }),
          listen("menu:reset-onboarding", () => {
            localStorage.removeItem("worship-onboarding-v1");
            optionsRef.current.setShowOnboarding(true);
          }),
          listen("menu:about",            () => optionsRef.current.setShowAbout(true)),
          listen("menu:open-preview",     () => optionsRef.current.openPreviewWindow()),
          listen("menu:open-settings",    () => optionsRef.current.setShowSettings(true)),
          listen("menu:restore-db", async () => {
            try {
              const { ask, open } = await import("@tauri-apps/plugin-dialog");
              const yes = await ask(
                "복원하면 현재 데이터가 교체됩니다. 계속하시겠습니까?",
                { title: "데이터베이스 복원", kind: "warning" }
              );
              if (!yes) return;
              const srcPath = await open({
                filters: [{ name: "데이터베이스", extensions: ["db"] }],
              });
              if (!srcPath || typeof srcPath !== "string") return;
              await ipc.restoreDatabase(srcPath);
              const { relaunch } = await import("@tauri-apps/plugin-process");
              await relaunch();
            } catch (e) {
              console.error("[restore-db]", e);
              optionsRef.current.showNotice("복원 실패", true);
            }
          }),
        ]);
        void o; // suppress unused variable warning
      } catch (e) {
        console.error("[menu setup]", e);
      }
    }

    let mounted = true;
    void setup().then(() => { if (!mounted) unlistens.forEach((fn) => fn()); });
    return () => { mounted = false; unlistens.forEach((fn) => fn()); };
  }, []); // 마운트 시 1회 실행 — optionsRef로 최신값 참조
}
