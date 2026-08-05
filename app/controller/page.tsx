"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SlideThumbnailList from "@/components/controller/SlideThumbnailList";
import SlideCanvas, { type SlideCanvasHandle } from "@/components/controller/SlideCanvas";
import QueuePanel from "@/components/controller/QueuePanel";
import LibraryPanel from "@/components/controller/LibraryPanel";
import LayerSidebar from "@/components/controller/LayerSidebar";
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { serviceDb, songDb, templateDb } from "@/lib/db";
import { importMediaFile } from "@/lib/media";
import { ipc } from "@/lib/ipc";
import {
  DEFAULT_LAYER_CONFIG,
  type LayerConfig,
  type TextBlock,
  type LyricSlide,
  type FlatSlide,
  type Service,
  type SlideMeta,
  type DisplayInfo,
  type Song,
  type PlaybackStatusPayload,
} from "@/lib/types";
import { deepMerge, loadGlobalDefaults, saveGlobalDefaults, newSlideId } from "@/lib/utils";

import ErrorBoundary from "@/components/ErrorBoundary";
import ServiceListModal from "@/components/controller/ServiceListModal";
import SaveServiceModal from "@/components/controller/SaveServiceModal";
import QuickSearchModal from "@/components/controller/QuickSearchModal";
import ShortcutCheatSheet from "@/components/controller/ShortcutCheatSheet";
import TemplateModal from "@/components/controller/TemplateModal";
import OutputPreview from "@/components/controller/OutputPreview";
import { useCountdown } from "@/hooks/useCountdown";
import { useClock } from "@/hooks/useClock";
import { useOutputHeartbeat } from "@/hooks/useOutputHeartbeat";
import { useMenuEvents } from "@/hooks/useMenuEvents";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useGlobalErrorCapture } from "@/hooks/useGlobalErrorCapture";
import ErrorToast from "@/components/ErrorToast";
import ControlBar from "@/components/controller/ControlBar";
import RibbonToolbar from "@/components/controller/RibbonToolbar";
import AboutDialog from "@/components/controller/AboutDialog";

type RightTab = "queue" | "songs" | "settings";
type RibbonTab = "home" | "insert" | "design" | "transition" | "animation" | "slideshow" | "review" | "view";

export default function ControllerPage() {
  const { isBlackout, setBlackout, layerConfig, setLayerConfig, setAlert } = useOutputStore();
  const {
    nextLyricSlide,
    prevLyricSlide,
    activeItemIndex,
    activeLyricSlideIndex,
    currentService,
    isDirty,
    updateSlideCanvas,
    updateServiceItems,
    getFlatSlideList,
    getActiveFlatSlideIndex,
    undoStack,
    redoStack,
  } = useQueueStore();

  const [isLive, setIsLive] = useState(true);
  const [isFrozen, setIsFrozen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [autoAdvanceMs, setAutoAdvanceMs] = useState(5000);
  const [autoProgress, setAutoProgress] = useState(0);
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [ctrlNotice, setCtrlNotice] = useState<{ msg: string; error?: boolean } | null>(null);
  const ctrlNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showQuickSearchRef = useRef(false);
  const showCheatSheetRef = useRef(false);
  const [isClear, setIsClear] = useState(false);
  const isClearRef = useRef(false);
  useEffect(() => { isClearRef.current = isClear; }, [isClear]);
  // Sync clear state to output regardless of isLive (blackout pattern)
  const isClearFirstRender = useRef(true);
  useEffect(() => {
    if (isClearFirstRender.current) { isClearFirstRender.current = false; return; }
    const { layerConfig: lc } = useOutputStore.getState();
    const toSend: LayerConfig = isClear
      ? { ...lc, subtitle: { ...lc.subtitle, visible: false, lines: [] }, canvas: undefined }
      : lc;
    ipc.sendSlideUpdate(toSend);
  }, [isClear]);
  const [isLoop, setIsLoop] = useState(false);
  const [alertInput, setAlertInput] = useState("");
  const [alertActive, setAlertActive] = useState(false);
  const [videoStatus, setVideoStatus] = useState<{ playing: boolean; currentTime: number; duration: number } | null>(null);
  const clock = useClock();
  const [showPanel, setShowPanel] = useState(true);
  const [zoom, setZoom] = useState(85);
  const [rightTab, setRightTab] = useState<RightTab>("queue");
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>("home");
  const [serviceNotes, setServiceNotes] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<TextBlock | null>(null);
  const [fmtPainterOn, setFmtPainterOn] = useState(false);
  const canvasRef = useRef<SlideCanvasHandle>(null);
  const saveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openOutputRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundName, setSoundName] = useState<string | null>(null);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const pendingAddBlockRef = useRef(false);
  const [showServiceList, setShowServiceList] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const outputConnected = useOutputHeartbeat();
  useGlobalErrorCapture();
  const [isStageOpen, setIsStageOpen] = useState(false);
  const [pendingEditSong, setPendingEditSong] = useState<Song | null>(null);

  const {
    countdownMin, setCountdownMin,
    countdownActive, countdownRemainingMs,
    countdownActiveRef, countdownRemainingMsRef, countdownTotalMsRef,
    onToggle: onToggleCountdown, onReset: onResetCountdown,
  } = useCountdown();

  useEffect(() => () => { saveTimersRef.current.forEach(clearTimeout); saveTimersRef.current.clear(); }, []);
  useEffect(() => () => { if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current); }, []);
  useEffect(() => () => { if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current); }, []);
  useEffect(() => () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } }, []);

  // beforeunload: 미저장 변경 시 경고
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useQueueStore.getState().isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Autosave: 30초마다 isDirty면 저장
  useEffect(() => {
    const id = setInterval(() => {
      if (useQueueStore.getState().isDirty) void handleSaveRef.current();
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // 세션 복원: 마지막 예배 ID를 localStorage에 저장/복원
  useEffect(() => {
    if (currentService && currentService.id > 0) {
      localStorage.setItem("lastServiceId", String(currentService.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentService?.id]);

  // Auto-advance: 슬라이드 자동 넘기기 타이머 (EasyWorship 스타일)
  useEffect(() => {
    if (!autoAdvance) { setAutoProgress(0); return; }
    const start = Date.now();
    setAutoProgress(0);
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      setAutoProgress(Math.min((elapsed / autoAdvanceMs) * 100, 100));
      if (elapsed >= autoAdvanceMs) {
        clearInterval(id);
        const st = useQueueStore.getState();
        const fi = st.getActiveFlatSlideIndex();
        const fl = st.getFlatSlideList();
        if (isLoop && fi >= fl.length - 1) { st.setActiveFlatSlide(0); } else { nextLyricSlide(); }
      }
    }, 100);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance, autoAdvanceMs, activeItemIndex, activeLyricSlideIndex, isLoop]);

  // Sync modal state to refs (so keyboard handler sees latest value without stale closure)
  useEffect(() => { showQuickSearchRef.current = showQuickSearch; }, [showQuickSearch]);
  useEffect(() => { showCheatSheetRef.current = showCheatSheet; }, [showCheatSheet]);

  // serviceNotes: load from DB record when service changes
  useEffect(() => {
    setServiceNotes(currentService?.notes ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentService?.id]);

  const { outputDisplayId, setOutputDisplayId } = useSettingsStore();
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const selectedDisplayIdx = outputDisplayId >= 0 ? outputDisplayId : 0;

  useEffect(() => {
    ipc.getDisplays().then((result) => {
      const list = result as DisplayInfo[];
      if (list && list.length > 0) {
        setDisplays(list);
        if (outputDisplayId < 0 && list.length > 1) {
          const secondaryIdx = list.findIndex((d) => !d.is_primary);
          setOutputDisplayId(secondaryIdx >= 0 ? secondaryIdx : 1);
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const defaults = loadGlobalDefaults(DEFAULT_LAYER_CONFIG);
    setLayerConfig(defaults);
    ipc.sendSlideUpdate(defaults);
  }, [setLayerConfig]);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;
    void ipc.onOutputReady(() => {
      const { layerConfig: lc, isBlackout: bo, alertText: at, alertVisible: av } = useOutputStore.getState();
      const cleared = isClearRef.current;
      const toSend: LayerConfig = cleared
        ? { ...lc, subtitle: { ...lc.subtitle, visible: false, lines: [] }, canvas: undefined }
        : lc;
      // Compute meta for Stage Display
      const qState = useQueueStore.getState();
      const item = qState.getActiveItem();
      const slide = qState.getActiveLyricSlide();
      const flatList = qState.getFlatSlideList();
      const flatIdx = qState.getActiveFlatSlideIndex();
      const nextEntry = flatIdx >= 0 && flatIdx + 1 < flatList.length ? flatList[flatIdx + 1] : null;
      const readyMeta: SlideMeta | undefined = item ? {
        songTitle: item.song?.title ?? item.label ?? item.type,
        section: slide?.section ?? "verse",
        slideIndex: qState.activeLyricSlideIndex,
        totalSlides: item.song?.lyrics_json.length ?? 1,
        itemIndex: qState.activeItemIndex,
        totalItems: qState.currentService?.items.length ?? 0,
        nextLines: nextEntry?.slide.lines,
        nextSection: nextEntry?.slide.section,
        notes: item.notes,
      } : undefined;
      void ipc.sendSlideUpdate(toSend, readyMeta);
      void ipc.sendBlackout(bo);
      void ipc.sendAlert(at, av);
      void ipc.sendCountdown({ active: countdownActiveRef.current, remainingMs: countdownRemainingMsRef.current, totalMs: countdownTotalMsRef.current });
    }).then((fn) => {
      if (mounted) unlisten = fn;
      else fn();
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLive || isFrozen) return;
    const { getActiveItem, getActiveLyricSlide } = useQueueStore.getState();
    const item = getActiveItem();
    const globalDefaults = loadGlobalDefaults(DEFAULT_LAYER_CONFIG);

    if (!item) {
      const config = deepMerge(DEFAULT_LAYER_CONFIG, globalDefaults) as LayerConfig;
      setLayerConfig(config);
      ipc.sendSlideUpdate(config);
      return;
    }

    const slide = getActiveLyricSlide();
    const itemOverrides = item.settings_json ?? {};
    const merged = deepMerge(
      deepMerge(DEFAULT_LAYER_CONFIG, globalDefaults),
      itemOverrides as Partial<LayerConfig>
    ) as LayerConfig;

    const canvasBlocks = slide?.canvas?.textBlocks ?? [];
    const newConfig: LayerConfig = {
      ...merged,
      subtitle: {
        ...merged.subtitle,
        visible: !isClear && canvasBlocks.length === 0 && !!slide,
        lines: !isClear && canvasBlocks.length === 0 ? (slide?.lines ?? []) : [],
      },
      canvas: !isClear && canvasBlocks.length > 0 ? { textBlocks: canvasBlocks } : undefined,
    };
    setLayerConfig(newConfig);

    // Build SlideMeta for Stage Display
    const { getFlatSlideList, getActiveFlatSlideIndex } = useQueueStore.getState();
    const flatList = getFlatSlideList();
    const flatIdx = getActiveFlatSlideIndex();
    const nextEntry = flatIdx >= 0 && flatIdx + 1 < flatList.length ? flatList[flatIdx + 1] : null;
    const slideMeta: SlideMeta = {
      songTitle: item.song?.title ?? item.label ?? item.type,
      section: slide?.section ?? "verse",
      slideIndex: activeLyricSlideIndex,
      totalSlides: item.song?.lyrics_json.length ?? 1,
      itemIndex: activeItemIndex,
      totalItems: currentService?.items.length ?? 0,
      nextLines: nextEntry?.slide.lines,
      nextSection: nextEntry?.slide.section,
      notes: item.notes,
    };

    ipc.sendSlideUpdate(newConfig, slideMeta);
  // notesVersion excluded intentionally: Stage Display notes refresh on slide navigation (avoids IPC per keystroke)
  }, [activeItemIndex, activeLyricSlideIndex, currentService?.id, currentService?.items.length, isLive, isClear, isFrozen, setLayerConfig]);

  // ── Playback status listener ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;
    void ipc.onPlaybackStatus((status: PlaybackStatusPayload) => setVideoStatus(status))
      .then((fn) => { if (mounted) unlisten = fn; else fn(); });
    return () => { mounted = false; unlisten?.(); };
  }, []);

  // ── Callbacks for ControlBar ──────────────────────────────────────────
  const handleToggleLive = useCallback(() => setIsLive((v) => !v), []);
  const handleToggleBlackout = useCallback(() => { const n = !isBlackout; setBlackout(n); void ipc.sendBlackout(n); }, [isBlackout, setBlackout]);
  const handleToggleClear = useCallback(() => setIsClear((v) => !v), []);
  const handleToggleFrozen = useCallback(() => {
    setIsFrozen((prev) => {
      void ipc.sendFreeze(!prev);
      // Slide update on unfreeze is handled by the slide-update effect (isFrozen in deps)
      return !prev;
    });
  }, []);
  const handleToggleAutoAdvance = useCallback(() => setAutoAdvance((v) => !v), []);
  const handleSendAlert = useCallback(() => {
    if (!alertInput.trim()) return;
    setAlert(alertInput.trim(), true);
    setAlertActive(true);
    void ipc.sendAlert(alertInput.trim(), true);
  }, [alertInput, setAlert]);
  const handleClearAlert = useCallback(() => {
    setAlert("", false);
    setAlertActive(false);
    void ipc.sendAlert("", false);
  }, [setAlert]);
  const handleToggleVideoPlay = useCallback(() => {
    if (videoStatus?.playing) {
      void ipc.sendVideoControl({ action: "pause" });
    } else {
      void ipc.sendVideoControl({ action: "play" });
    }
  }, [videoStatus?.playing]);
  const handleToggleStage = useCallback(() => {
    if (isStageOpen) { ipc.closeStageWindow().catch(console.error); setIsStageOpen(false); }
    else { ipc.openStageWindow().catch(console.error); setIsStageOpen(true); }
  }, [isStageOpen]);
  const handleToggleLoop = useCallback(() => setIsLoop((v) => !v), []);
  const handleTogglePanel = useCallback(() => setShowPanel((v) => !v), []);
  const handleShowCheatSheet = useCallback(() => setShowCheatSheet(true), []);
  const handleDismissNotice = useCallback(() => setCtrlNotice(null), []);

  // ── Callbacks for RibbonToolbar ───────────────────────────────────────
  const handlePasteBlock = useCallback(() => canvasRef.current?.pasteBlock(), []);
  const handleCutBlock = useCallback(() => canvasRef.current?.cutBlock(), []);
  const handleCopyBlock = useCallback(() => canvasRef.current?.copyBlock(), []);
  const handleActivateFmtPainter = useCallback(() => {
    if (!selectedBlock) return;
    const { fontFamily, fontSize, fontWeight, fontStyle, textDecoration, color, textAlign } = selectedBlock;
    canvasRef.current?.activateFormatPainter({ fontFamily, fontSize, fontWeight, fontStyle, textDecoration, color, textAlign });
    setFmtPainterOn(true);
    setTimeout(() => setFmtPainterOn(canvasRef.current?.isFmtPainterActive() ?? false), 100);
  }, [selectedBlock]);
  const handleAddBlock = useCallback(() => {
    const st = useQueueStore.getState();
    const fi = st.getActiveFlatSlideIndex();
    const fl = st.getFlatSlideList();
    if (fi < 0) {
      if (fl.length > 0) {
        st.setActiveFlatSlide(0);
        pendingAddBlockRef.current = true;
      }
      return;
    }
    canvasRef.current?.addBlock();
  }, []);
  const handleOpenDesignPanel = useCallback(() => { setShowPanel(true); setRightTab("settings"); }, []);
  const handleCloseOutput = useCallback(() => ipc.closeOutputWindow().catch(() => {}), []);
  const handleFromStart = useCallback(() => { useQueueStore.getState().setActiveFlatSlide(0); openOutputRef.current(); }, []);
  const handleServiceNotesChange = useCallback((notes: string) => {
    setServiceNotes(notes);
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(() => {
      const svc = useQueueStore.getState().currentService;
      if (!svc) return;
      serviceDb.updateNotes(svc.id, notes).catch(console.error);
      useQueueStore.getState().updateCurrentServiceNotes(notes);
    }, 500);
  }, []);

  // Listen for quick-search trigger from QueuePanel button
  useEffect(() => {
    const handler = () => setShowQuickSearch(true);
    window.addEventListener("worship:quick-search", handler);
    return () => window.removeEventListener("worship:quick-search", handler);
  }, []);

  // Listen for edit-song trigger from QueuePanel context menu
  useEffect(() => {
    const handler = (e: Event) => {
      const song = (e as CustomEvent<Song>).detail;
      setPendingEditSong(song);
      setShowPanel(true);
      setRightTab("songs");
    };
    window.addEventListener("worship:edit-song", handler);
    return () => window.removeEventListener("worship:edit-song", handler);
  }, []);

  const handleCanvasChange = useCallback(
    (songId: number, slideId: string, canvas: { textBlocks: TextBlock[] }) => {
      updateSlideCanvas(songId, slideId, canvas);
      if (isLive) {
        const lc = useOutputStore.getState().layerConfig;
        const slide = useQueueStore.getState().getActiveLyricSlide();
        const hasBlocks = canvas.textBlocks.length > 0;
        const config: LayerConfig = {
          ...lc,
          subtitle: {
            ...lc.subtitle,
            visible: !isClear && !hasBlocks,
            lines: !isClear && !hasBlocks ? (slide?.lines ?? []) : [],
          },
          canvas: !isClear && hasBlocks ? { textBlocks: canvas.textBlocks } : undefined,
        };
        setLayerConfig(config);
        ipc.sendSlideUpdate(config);
      }
      // Capture lyrics_json now (before debounce fires) to avoid stale service data
      const songNow = useQueueStore.getState().currentService?.items.find((i) => i.song?.id === songId)?.song;
      if (!songNow) return;
      const lyricsSnapshot = songNow.lyrics_json;
      const existingTimer = saveTimersRef.current.get(songId);
      if (existingTimer) clearTimeout(existingTimer);
      saveTimersRef.current.set(songId, setTimeout(async () => {
        saveTimersRef.current.delete(songId);
        try { await songDb.update(songId, { lyrics_json: lyricsSnapshot }); } catch (err) {
          console.error("Failed to save canvas:", err);
        }
      }, 600));
    },
    [isLive, isClear, setLayerConfig, updateSlideCanvas]
  );

  const handleLayerChange = useCallback(
    (config: LayerConfig) => {
      const { getActiveLyricSlide } = useQueueStore.getState();
      const slide = getActiveLyricSlide();
      const canvasBlocks = slide?.canvas?.textBlocks ?? [];
      const withContent: LayerConfig = {
        ...config,
        subtitle: {
          ...config.subtitle,
          visible: !isClear && canvasBlocks.length === 0 && !!slide,
          lines: !isClear && canvasBlocks.length === 0 ? (slide?.lines ?? []) : [],
        },
        canvas: !isClear && canvasBlocks.length > 0 ? { textBlocks: canvasBlocks } : undefined,
      };
      setLayerConfig(withContent);
      if (isLive) ipc.sendSlideUpdate(withContent);
    },
    [isLive, isClear, setLayerConfig]
  );

  const handleSaveGlobal = useCallback((config: LayerConfig) => {
    saveGlobalDefaults(config);
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    const svc = useQueueStore.getState().currentService;
    if (!svc || svc.items.length === 0) return;
    const name = window.prompt("템플릿 이름을 입력하세요:", svc.name);
    if (!name?.trim()) return;
    try {
      const items = svc.items.map((item) => ({
        type: item.type,
        song_id: item.song_id ?? null,
        media_id: item.media_id ?? null,
        settings_json: item.settings_json,
        label: item.label,
      }));
      await templateDb.create(name.trim(), items);
      setCtrlNotice({ msg: "템플릿 저장됨 ✓" });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 2000);
    } catch (e) {
      console.error("[template]", e);
      setCtrlNotice({ msg: "템플릿 저장 실패", error: true });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 3000);
    }
  }, []);

  const handleExportService = useCallback(async () => {
    const svc = useQueueStore.getState().currentService;
    if (!svc) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const filePath = await save({
        defaultPath: `${svc.name}.txt`,
        filters: [{ name: "텍스트", extensions: ["txt"] }],
      });
      if (!filePath) return;
      const lines: string[] = [`# ${svc.name}`, `날짜: ${svc.date}`, ""];
      for (const item of svc.items) {
        lines.push(`## ${item.label}`);
        if (item.song) {
          for (const slide of item.song.lyrics_json) {
            lines.push(`[${slide.section} ${slide.sectionIndex}]`);
            lines.push(...slide.lines);
            lines.push("");
          }
        } else {
          const scriptureSlides = (item.settings_json as import("@/lib/types").ServiceItemSettings)?.scripture?.slides;
          if (scriptureSlides && scriptureSlides.length > 0) {
            for (const slide of scriptureSlides) {
              lines.push(...slide.lines);
            }
            lines.push("");
          } else {
            lines.push("");
          }
        }
      }
      await writeTextFile(filePath, lines.join("\n"));
      setCtrlNotice({ msg: "내보내기 완료 ✓" });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 2000);
    } catch (e) {
      console.error("[export]", e);
      setCtrlNotice({ msg: "내보내기 실패", error: true });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 3000);
    }
  }, []);

  const handleSaveItem = useCallback(
    async (itemId: number, config: LayerConfig) => {
      const settings = {
        background: { ...config.background },
        subtitle: (({ visible: _v, lines: _l, ...rest }) => rest)(config.subtitle),
        overlay: { ...config.overlay },
      };
      try {
        await serviceDb.updateItemSettings(itemId, settings);
        const liveItems = useQueueStore.getState().currentService?.items ?? [];
        const updated = liveItems.map((item) =>
          item.id === itemId ? { ...item, settings_json: settings } : item
        );
        updateServiceItems(updated);
      } catch (err) {
        console.error("Failed to save item settings:", err);
      }
    },
    [updateServiceItems]
  );

  type FmtPatch = { fontFamily?: string; fontSize?: number; fontWeight?: "normal" | "bold"; fontStyle?: "normal" | "italic"; textDecoration?: "none" | "underline" | "line-through"; color?: string; textAlign?: "left" | "center" | "right" };

  const handleFormat = useCallback((patch: FmtPatch) => {
    if (selectedBlock && canvasRef.current) {
      canvasRef.current.updateBlock(selectedBlock.id, patch);
    } else {
      handleLayerChange({ ...layerConfig, subtitle: { ...layerConfig.subtitle, ...(patch as Partial<LayerConfig["subtitle"]>) } });
    }
  }, [selectedBlock, layerConfig, handleLayerChange]);

  const fmt: Required<FmtPatch> = selectedBlock ? {
    fontFamily: selectedBlock.fontFamily,
    fontSize: selectedBlock.fontSize,
    fontWeight: selectedBlock.fontWeight ?? "normal",
    fontStyle: selectedBlock.fontStyle ?? "normal",
    textDecoration: selectedBlock.textDecoration ?? "none",
    color: selectedBlock.color,
    textAlign: selectedBlock.textAlign ?? "center",
  } : {
    fontFamily: layerConfig.subtitle.fontFamily,
    fontSize: layerConfig.subtitle.fontSize,
    fontWeight: layerConfig.subtitle.fontWeight ?? "normal",
    fontStyle: layerConfig.subtitle.fontStyle ?? "normal",
    textDecoration: "none",
    color: layerConfig.subtitle.color,
    textAlign: layerConfig.subtitle.textAlign ?? "center",
  };

  const activeItemId = (() => {
    if (!currentService || activeItemIndex < 0) return null;
    return currentService.items[activeItemIndex]?.id ?? null;
  })();

  async function handleNewSlide() {
    if (!currentService) return;
    const list = getFlatSlideList();
    const idx = getActiveFlatSlideIndex();
    // 활성 슬라이드가 없으면 첫 번째 song 항목의 마지막 슬라이드 사용
    let entry: FlatSlide | undefined = idx >= 0 ? list[idx] : list[list.length - 1];
    if (!entry) {
      const firstSongItem = currentService.items.findIndex((i) => i.song);
      if (firstSongItem < 0) return;
      useQueueStore.getState().setActiveItem(firstSongItem);
      entry = list.find((e) => e.serviceItemIndex === firstSongItem);
      if (!entry) return;
    }
    const song = currentService.items[entry.serviceItemIndex]?.song;
    if (!song) {
      // 현재 항목이 song이 아니면 첫 song 항목 찾기
      const firstSongEntry = list.find((e) => currentService.items[e.serviceItemIndex]?.song);
      if (!firstSongEntry) return;
      const firstSong = currentService.items[firstSongEntry.serviceItemIndex]?.song;
      if (!firstSong) return;
      const newSlide2: LyricSlide = {
        id: newSlideId(),
        section: "verse",
        sectionIndex: firstSong.lyrics_json.length + 1,
        lines: [],
      };
      const newLyrics2 = [...firstSong.lyrics_json];
      newLyrics2.splice(firstSongEntry.slideIndex + 1, 0, newSlide2);
      try {
        await songDb.update(firstSong.id, { lyrics_json: newLyrics2 });
        const updated2 = await serviceDb.get(currentService.id);
        if (updated2) useQueueStore.getState().setCurrentService(updated2);
      } catch (e) { console.error(e); }
      return;
    }
    const newSlide: LyricSlide = {
      id: newSlideId(),
      section: "verse",
      sectionIndex: song.lyrics_json.length + 1,
      lines: [],
    };
    const newLyrics = [...song.lyrics_json];
    newLyrics.splice(entry.slideIndex + 1, 0, newSlide);
    try {
      await songDb.update(song.id, { lyrics_json: newLyrics });
      const updated = await serviceDb.get(currentService.id);
      if (updated) {
        const st = useQueueStore.getState();
        st.updateServiceData(updated);
        const fl = st.getFlatSlideList();
        const ni = fl.findIndex((f) => f.serviceItemIndex === entry.serviceItemIndex && f.slideIndex === entry.slideIndex + 1);
        if (ni >= 0) st.setActiveFlatSlide(ni);
      }
    } catch (e) { console.error(e); }
  }

  async function handleDupSlide() {
    const state = useQueueStore.getState();
    const svc = state.currentService;
    if (!svc) return;
    const list = state.getFlatSlideList();
    const idx = state.getActiveFlatSlideIndex();
    const entry = idx >= 0 ? list[idx] : null;
    if (!entry) return;
    const song = svc.items[entry.serviceItemIndex]?.song;
    if (!song) return;
    const newSlide: LyricSlide = { ...entry.slide, id: newSlideId() };
    const newLyrics = [...song.lyrics_json];
    newLyrics.splice(entry.slideIndex + 1, 0, newSlide);
    try {
      await songDb.update(song.id, { lyrics_json: newLyrics });
      const updated = await serviceDb.get(svc.id);
      if (updated) {
        state.updateServiceData(updated);
        const fl = state.getFlatSlideList();
        const ni = fl.findIndex((f) => f.serviceItemIndex === entry.serviceItemIndex && f.slideIndex === entry.slideIndex + 1);
        if (ni >= 0) state.setActiveFlatSlide(ni);
      }
    } catch (e) { console.error("[dupSlide]", e); }
  }

  async function handleInsertImage() {
    try {
      const mediaItem = await importMediaFile("image");
      if (!mediaItem) return;
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const src = convertFileSrc(mediaItem.file_path);
      handleLayerChange({ ...layerConfig, background: { ...layerConfig.background, type: "image", src, opacity: 1 } });
    } catch (e) { console.error("[handleInsertImage]", e); }
  }

  async function handleInsertVideo() {
    try {
      const mediaItem = await importMediaFile("video");
      if (!mediaItem) return;
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const src = convertFileSrc(mediaItem.file_path);
      handleLayerChange({ ...layerConfig, background: { ...layerConfig.background, type: "video", src, loop: true, opacity: 1 } });
    } catch (e) { console.error("[handleInsertVideo]", e); }
  }

  async function handleInsertSound() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "오디오", extensions: ["mp3", "wav", "m4a", "aac", "ogg", "flac"] }],
      });
      if (!selected || typeof selected !== "string") return;
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const src = convertFileSrc(selected);
      const name = selected.replace(/\\/g, "/").split("/").pop() ?? "audio";
      if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause(); }
      const audio = new Audio(src);
      audioRef.current = audio;
      setSoundName(name);
      audio.play().then(() => setSoundPlaying(true)).catch(() => setSoundPlaying(false));
      audio.onended = () => setSoundPlaying(false);
    } catch (e) { console.error("[handleInsertSound]", e); }
  }

  function handleToggleSound() {
    const audio = audioRef.current;
    if (!audio) return;
    if (soundPlaying) { audio.pause(); setSoundPlaying(false); }
    else { audio.play().catch(() => {}); setSoundPlaying(true); }
  }

  function openOutput() {
    const d = displays[selectedDisplayIdx];
    if (d) void ipc.openOutputWindow(d.x, d.y, d.width, d.height);
    else void ipc.openOutputWindow(1920, 0, 1920, 1080);
  }

  // Keep openOutputRef current so menu listeners always call latest version
  useEffect(() => { openOutputRef.current = openOutput; });

  const handleSave = useCallback(async () => {
    const store = useQueueStore.getState();
    const svc = store.currentService;
    if (!svc) return;
    if (svc.id === -1) {
      setShowSaveModal(true);
      return;
    }
    try {
      await serviceDb.saveItems(svc.id, svc.items);
      const reloaded = await serviceDb.get(svc.id);
      if (reloaded) store.updateServiceData(reloaded);
      else store.setIsDirty(false);
      setCtrlNotice({ msg: "저장됨 ✓", error: false });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 2000);
    } catch (e) {
      console.error("[save]", e);
      setCtrlNotice({ msg: "저장에 실패했습니다. 다시 시도해 주세요." , error: true });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 5000);
    }
  }, []);

  const isUndoRedoInProgressRef = useRef(false);

  const handleUndo = useCallback(async () => {
    if (isUndoRedoInProgressRef.current) return;
    const store = useQueueStore.getState();
    if (!store.canUndo()) return;
    const svc = store.currentService;
    if (!svc || svc.id <= 0) return;
    const snapshot = store.popUndo();
    if (!snapshot) return;
    isUndoRedoInProgressRef.current = true;
    try {
      await serviceDb.saveItems(svc.id, snapshot.items);
      const reloaded = await serviceDb.get(svc.id);
      if (reloaded) {
        store.updateServiceData(reloaded);
        store.setActiveItem(Math.min(snapshot.activeItemIndex, reloaded.items.length - 1));
      }
    } catch (e) {
      console.error("[undo]", e);
    } finally {
      isUndoRedoInProgressRef.current = false;
    }
  }, []);

  const handleRedo = useCallback(async () => {
    if (isUndoRedoInProgressRef.current) return;
    const store = useQueueStore.getState();
    if (!store.canRedo()) return;
    const svc = store.currentService;
    if (!svc || svc.id <= 0) return;
    const snapshot = store.popRedo();
    if (!snapshot) return;
    isUndoRedoInProgressRef.current = true;
    try {
      await serviceDb.saveItems(svc.id, snapshot.items);
      const reloaded = await serviceDb.get(svc.id);
      if (reloaded) {
        store.updateServiceData(reloaded);
        store.setActiveItem(Math.min(snapshot.activeItemIndex, reloaded.items.length - 1));
      }
    } catch (e) {
      console.error("[redo]", e);
    } finally {
      isUndoRedoInProgressRef.current = false;
    }
  }, []);

  const handleSaveAs = useCallback(async (name: string) => {
    const store = useQueueStore.getState();
    const svc = store.currentService;
    if (!svc) { setShowSaveModal(false); return; }
    const date = new Date().toISOString().slice(0, 10);
    try {
      const newId = await serviceDb.create(name, date);
      await serviceDb.saveItems(newId, svc.items);
      const reloaded = await serviceDb.get(newId);
      if (reloaded) store.updateServiceData(reloaded);
      else store.updateCurrentServiceMeta({ id: newId, name, date });
      setShowSaveModal(false);
    } catch (e) {
      console.error("[saveAs]", e);
    }
  }, []);

  const handleLoadService = useCallback((service: Service) => {
    useQueueStore.getState().setCurrentService(service);
    setShowServiceList(false);
  }, []);

  const handleNewService = useCallback(async () => {
    const store = useQueueStore.getState();
    if (store.isDirty) {
      if (!confirm("저장되지 않은 변경사항이 있습니다. 새 예배를 시작하시겠습니까?")) return;
    }
    const date = new Date().toISOString().slice(0, 10);
    try {
      const id = await serviceDb.create("새 예배", date);
      const service = await serviceDb.get(id);
      if (service) store.setCurrentService(service);
    } catch (e) { console.error("[newService]", e); }
  }, []);

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; });
  const handleUndoRef = useRef(handleUndo);
  useEffect(() => { handleUndoRef.current = handleUndo; });
  const handleRedoRef = useRef(handleRedo);
  useEffect(() => { handleRedoRef.current = handleRedo; });
  const handleNewServiceRef = useRef(handleNewService);
  useEffect(() => { handleNewServiceRef.current = handleNewService; });
  const handleNewSlideRef = useRef(handleNewSlide);
  useEffect(() => { handleNewSlideRef.current = handleNewSlide; });
  const handleDupSlideRef = useRef(handleDupSlide);
  useEffect(() => { handleDupSlideRef.current = handleDupSlide; });
  const handleInsertImageRef = useRef(handleInsertImage);
  useEffect(() => { handleInsertImageRef.current = handleInsertImage; });

  useMenuEvents({
    openOutputRef,
    handleNewServiceRef,
    handleSaveRef,
    handleNewSlideRef,
    handleDupSlideRef,
    handleInsertImageRef,
    setIsClear,
    setShowPanel,
    setRightTab,
    setShowServiceList,
    setShowSaveModal,
    setShowQuickSearch,
    setIsStageOpen,
    showNotice: (msg: string, error?: boolean) => {
      setCtrlNotice({ msg, error });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), error ? 5000 : 2000);
    },
  });

  useKeyboardShortcuts({
    isLoop,
    isBlackout,
    nextLyricSlide,
    prevLyricSlide,
    handleToggleLive,
    handleToggleBlackout,
    handleToggleClear,
    handleToggleLoop,
    handleToggleFrozen,
    handleToggleAutoAdvance,
    setBlackout,
    setIsClear,
    setShowQuickSearch,
    setShowCheatSheet,
    setCtrlNotice,
    showQuickSearchRef,
    showCheatSheetRef,
    handleSaveRef,
    handleUndoRef,
    handleRedoRef,
    openOutputRef,
  });

  const slides = getFlatSlideList();
  const flatIdx = getActiveFlatSlideIndex();

  const nextSlide = flatIdx >= 0 && flatIdx + 1 < slides.length ? slides[flatIdx + 1] : null;
  const nextSlidePreview = nextSlide ? (nextSlide.slide.lines[0] ?? "빈 슬라이드") : null;
  const nextSlideFull = nextSlide ? nextSlide.slide.lines.join(" / ") : null;

  // 슬라이드가 활성화된 후 대기 중인 addBlock 실행
  useEffect(() => {
    if (pendingAddBlockRef.current && flatIdx >= 0) {
      pendingAddBlockRef.current = false;
      canvasRef.current?.addBlock();
    }
  }, [flatIdx]);

  return (
    <ErrorBoundary>
    <div className="flex flex-col h-screen bg-zinc-900 text-white select-none overflow-hidden">

      <ControlBar
        serviceName={currentService?.name ?? null}
        isDirty={isDirty}
        ctrlNotice={ctrlNotice}
        onDismissNotice={handleDismissNotice}
        slideCount={slides.length}
        flatIdx={flatIdx}
        nextSlidePreview={nextSlidePreview}
        nextSlideFull={nextSlideFull}
        isLive={isLive}
        onToggleLive={handleToggleLive}
        isBlackout={isBlackout}
        onToggleBlackout={handleToggleBlackout}
        isClear={isClear}
        onToggleClear={handleToggleClear}
        isFrozen={isFrozen}
        onToggleFrozen={handleToggleFrozen}
        autoAdvance={autoAdvance}
        onToggleAutoAdvance={handleToggleAutoAdvance}
        autoAdvanceMs={autoAdvanceMs}
        onChangeAutoAdvanceMs={setAutoAdvanceMs}
        autoProgress={autoProgress}
        isVideoBackground={layerConfig.background.type === "video"}
        videoSrc={layerConfig.background.src ?? ""}
        videoPlaying={videoStatus?.playing ?? false}
        onToggleVideoPlay={handleToggleVideoPlay}
        alertInput={alertInput}
        onSetAlertInput={setAlertInput}
        alertActive={alertActive}
        onSendAlert={handleSendAlert}
        onClearAlert={handleClearAlert}
        outputConnected={outputConnected}
        onOpenOutput={openOutput}
        isStageOpen={isStageOpen}
        onToggleStage={handleToggleStage}
        countdownMin={countdownMin}
        onSetCountdownMin={setCountdownMin}
        countdownActive={countdownActive}
        countdownRemainingMs={countdownRemainingMs}
        onToggleCountdown={onToggleCountdown}
        onResetCountdown={onResetCountdown}
        clock={clock}
        showPanel={showPanel}
        onTogglePanel={handleTogglePanel}
        onShowCheatSheet={handleShowCheatSheet}
      />

      <RibbonToolbar
        ribbonTab={ribbonTab}
        onSetRibbonTab={setRibbonTab}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={() => handleUndoRef.current()}
        onRedo={() => handleRedoRef.current()}
        hasService={!!currentService}
        serviceItemCount={currentService?.items.length ?? 0}
        onSaveTemplate={handleSaveTemplate}
        onExportService={handleExportService}
        onOpenTemplateModal={() => setShowTemplateModal(true)}
        onPasteBlock={handlePasteBlock}
        onCutBlock={handleCutBlock}
        onCopyBlock={handleCopyBlock}
        onActivateFmtPainter={handleActivateFmtPainter}
        fmtPainterOn={fmtPainterOn}
        hasSelectedBlock={!!selectedBlock}
        fmt={fmt}
        onFormat={handleFormat}
        layerConfig={layerConfig}
        onLayerChange={handleLayerChange}
        isLoop={isLoop}
        onToggleLoop={handleToggleLoop}
        isBlackout={isBlackout}
        onToggleBlackout={handleToggleBlackout}
        isClear={isClear}
        onToggleClear={handleToggleClear}
        onOpenOutput={openOutput}
        onFromStart={handleFromStart}
        onCloseOutput={handleCloseOutput}
        serviceNotes={serviceNotes}
        onServiceNotesChange={handleServiceNotesChange}
        zoom={zoom}
        onSetZoom={setZoom}
        showPanel={showPanel}
        onTogglePanel={handleTogglePanel}
        hasSlides={slides.length > 0}
        onNewSlide={handleNewSlide}
        onAddBlock={handleAddBlock}
        onInsertImage={handleInsertImage}
        onInsertVideo={handleInsertVideo}
        soundName={soundName}
        soundPlaying={soundPlaying}
        onToggleSound={handleToggleSound}
        onInsertSound={handleInsertSound}
        onOpenDesignPanel={handleOpenDesignPanel}
        onShowAbout={() => setShowAbout(true)}
      />

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Slides panel (PPT style) */}
        <div className="w-56 flex-shrink-0 border-r border-zinc-700 overflow-hidden bg-[#252526]">
          <SlideThumbnailList onOpenDesignPanel={() => { setShowPanel(true); setRightTab("settings"); }} />
        </div>

        {/* Center: Canvas with PPT-style rulers */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#1e1e1e]">
          {/* Horizontal ruler */}
          <div className="flex flex-shrink-0 h-5 bg-[#2b2b2b] border-b border-[#1a1a1a] select-none">
            <div className="w-5 flex-shrink-0 border-r border-[#1a1a1a]" />
            <div className="flex-1 relative overflow-hidden">
              {Array.from({ length: 41 }, (_, i) => (
                <div
                  key={i}
                  style={{ position: "absolute", left: `${(i / 40) * 100}%`, bottom: 0 }}
                >
                  {i % 5 === 0 ? (
                    <>
                      <div style={{ width: 1, height: 7, backgroundColor: "#777" }} />
                      <span style={{ position: "absolute", bottom: 7, left: 2, fontSize: 7, color: "#888", whiteSpace: "nowrap" }}>
                        {(i - 20) * 2}
                      </span>
                    </>
                  ) : (
                    <div style={{ width: 1, height: 4, backgroundColor: "#555" }} />
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Canvas row with vertical ruler */}
          <div className="flex flex-1 overflow-hidden">
            {/* Vertical ruler */}
            <div className="w-5 flex-shrink-0 bg-[#2b2b2b] border-r border-[#1a1a1a] relative overflow-hidden select-none">
              {Array.from({ length: 41 }, (_, i) => (
                <div
                  key={i}
                  style={{ position: "absolute", top: `${(i / 40) * 100}%`, right: 0 }}
                >
                  {i % 5 === 0 ? (
                    <>
                      <div style={{ height: 1, width: 7, backgroundColor: "#777" }} />
                      <span style={{ position: "absolute", top: 2, right: 7, fontSize: 7, color: "#888", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                        {(i - 20) * 2}
                      </span>
                    </>
                  ) : (
                    <div style={{ height: 1, width: 4, backgroundColor: "#555" }} />
                  )}
                </div>
              ))}
            </div>
            {/* Slide canvas */}
            <div className="flex-1 flex items-center justify-center overflow-hidden relative">
              {!currentService && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1e1e] z-10 text-center gap-3">
                  <span className="text-4xl">✝</span>
                  <p className="text-zinc-300 text-sm font-medium">예배를 선택하거나 만들어주세요</p>
                  <p className="text-zinc-500 text-xs">오른쪽 <span className="text-zinc-300">순서</span> 탭 → <span className="text-zinc-300">+</span> 버튼으로 새 예배 만들기</p>
                </div>
              )}
              <div style={{ width: `${zoom}%`, minWidth: `${zoom}%`, flexShrink: 0 }} className="px-6">
                <SlideCanvas ref={canvasRef} onCanvasChange={handleCanvasChange} onSelectionChange={setSelectedBlock} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Pane (PPT Format pane) */}
        {showPanel && (
          <div className="w-64 flex-shrink-0 border-l border-zinc-700 flex flex-col overflow-hidden bg-[#252526]">
            {/* 출력 미리보기 */}
            <div className="p-1.5 border-b border-zinc-700 flex-shrink-0 flex justify-center">
              <OutputPreview layerConfig={layerConfig} isBlackout={isBlackout} />
            </div>
            <div className="flex border-b border-zinc-700 flex-shrink-0">
              {(["queue", "songs", "settings"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    rightTab === tab
                      ? "text-white border-b-2 border-blue-500 bg-zinc-700"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  {tab === "queue" ? "순서" : tab === "songs" ? "찬양" : "디자인"}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden">
              {rightTab === "queue" && <QueuePanel />}
              {rightTab === "songs" && (
                <LibraryPanel
                  mode="songs"
                  initialEditSong={pendingEditSong}
                  onEditSongConsumed={() => setPendingEditSong(null)}
                />
              )}
              {rightTab === "settings" && (
                <LayerSidebar
                  layerConfig={layerConfig}
                  activeItemId={activeItemId}
                  onChange={handleLayerChange}
                  onSaveGlobal={handleSaveGlobal}
                  onSaveItem={handleSaveItem}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Status bar (PPT style) ─────────────────────────────────── */}
      <div className="h-7 flex items-center px-3 gap-2 border-t border-[#1a1a1a] bg-[#1e1e1e] flex-shrink-0 text-xs select-none">
        {/* 슬라이드 카운터 */}
        <span className="text-zinc-400 tabular-nums">
          {slides.length > 0 ? `슬라이드 ${flatIdx >= 0 ? flatIdx + 1 : 1} / ${slides.length}` : "슬라이드 없음"}
        </span>

        {isLoop && <span className="text-yellow-500 text-[10px]">↺ 루프</span>}

        <div className="flex-1" />

        {/* 이전/다음 */}
        <button onClick={() => { if (isLoop && flatIdx <= 0) useQueueStore.getState().setActiveFlatSlide(slides.length - 1); else prevLyricSlide(); }} disabled={!isLoop && flatIdx <= 0}
          className="px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 text-zinc-400">←</button>
        <button onClick={() => { if (isLoop && flatIdx >= slides.length - 1) useQueueStore.getState().setActiveFlatSlide(0); else nextLyricSlide(); }} disabled={!isLoop && flatIdx >= slides.length - 1}
          className="px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 text-zinc-400">→</button>

        <div className="w-px h-4 bg-zinc-700" />

        {/* 모니터 선택 */}
        {displays.length > 0 && (
          <select value={selectedDisplayIdx} onChange={(e) => setOutputDisplayId(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0 text-zinc-400 outline-none">
            {displays.map((d, i) => (
              <option key={d.id} value={i}>
                {d.is_primary ? "주 모니터" : `모니터 ${i + 1}`} ({d.width}×{d.height})
              </option>
            ))}
          </select>
        )}

        {/* 출력 종료 */}
        <button onClick={() => ipc.closeOutputWindow().catch(() => {})}
          className="px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-500">
          출력 종료
        </button>

        <div className="w-px h-4 bg-zinc-700" />

        {/* 줌 */}
        <span className="text-zinc-500 w-8 text-right tabular-nums">{zoom}%</span>
        <input type="range" min={25} max={200} step={5} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-20 accent-zinc-400" title="줌" />

        <div className="w-px h-4 bg-zinc-700" />

        {/* 시계 */}
        <span className="text-zinc-500 font-mono tabular-nums">{clock}</span>
      </div>

    </div>
      {showServiceList && (
        <ServiceListModal
          onLoad={handleLoadService}
          onClose={() => setShowServiceList(false)}
          currentServiceId={currentService?.id}
          onDeleteCurrent={() => useQueueStore.getState().setCurrentService(null)}
        />
      )}
      {showSaveModal && (
        <SaveServiceModal
          initialName={currentService?.name !== "새 예배" ? (currentService?.name ?? "") : ""}
          onSave={handleSaveAs}
          onClose={() => setShowSaveModal(false)}
        />
      )}
      {showQuickSearch && (
        <QuickSearchModal
          slides={slides}
          activeIdx={flatIdx}
          onSelect={(idx) => useQueueStore.getState().setActiveFlatSlide(idx)}
          onClose={() => setShowQuickSearch(false)}
        />
      )}
      {showCheatSheet && <ShortcutCheatSheet onClose={() => setShowCheatSheet(false)} />}
      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
      {showTemplateModal && (
        <TemplateModal
          onCreateService={(svc) => { handleLoadService(svc); setShowTemplateModal(false); }}
          onClose={() => setShowTemplateModal(false)}
        />
      )}
      <ErrorToast />
    </ErrorBoundary>
  );
}
