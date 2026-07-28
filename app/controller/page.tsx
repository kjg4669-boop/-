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
import { serviceDb, songDb } from "@/lib/db";
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
} from "@/lib/types";
import { deepMerge, loadGlobalDefaults, saveGlobalDefaults, newSlideId } from "@/lib/utils";
import { FONT_OPTIONS } from "@/lib/constants";
import ErrorBoundary from "@/components/ErrorBoundary";
import ServiceListModal from "@/components/controller/ServiceListModal";
import SaveServiceModal from "@/components/controller/SaveServiceModal";
import QuickSearchModal from "@/components/controller/QuickSearchModal";
import ShortcutCheatSheet from "@/components/controller/ShortcutCheatSheet";

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
  const [clock, setClock] = useState("");
  const [showPanel, setShowPanel] = useState(true);
  const [zoom, setZoom] = useState(85);
  const [rightTab, setRightTab] = useState<RightTab>("queue");
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>("home");
  const [serviceNotes, setServiceNotes] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<TextBlock | null>(null);
  const [fmtPainterOn, setFmtPainterOn] = useState(false);
  const canvasRef = useRef<SlideCanvasHandle>(null);
  const saveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const openOutputRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundName, setSoundName] = useState<string | null>(null);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const pendingAddBlockRef = useRef(false);
  const [showServiceList, setShowServiceList] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [outputConnected, setOutputConnected] = useState(false);
  const [isStageOpen, setIsStageOpen] = useState(false);

  // Countdown timer state
  const [countdownMin, setCountdownMin] = useState(10);
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownRemainingMs, setCountdownRemainingMs] = useState(10 * 60 * 1000);
  const countdownTotalMsRef = useRef(10 * 60 * 1000);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownActiveRef = useRef(false);
  const countdownRemainingMsRef = useRef(10 * 60 * 1000);
  useEffect(() => { countdownActiveRef.current = countdownActive; }, [countdownActive]);
  useEffect(() => { countdownRemainingMsRef.current = countdownRemainingMs; }, [countdownRemainingMs]);

  useEffect(() => () => { saveTimersRef.current.forEach(clearTimeout); saveTimersRef.current.clear(); }, []);
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
      if (useQueueStore.getState().isDirty) handleSaveRef.current();
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Countdown timer tick
  useEffect(() => {
    if (!countdownActive) {
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
      return;
    }
    const startTime = Date.now();
    const startRemaining = countdownRemainingMs;
    countdownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, startRemaining - elapsed);
      setCountdownRemainingMs(remaining);
      ipc.sendCountdown({ active: true, remainingMs: remaining, totalMs: countdownTotalMsRef.current });
      if (remaining <= 0) {
        setCountdownActive(false);
        clearInterval(countdownIntervalRef.current!);
        countdownIntervalRef.current = null;
        ipc.sendCountdown({ active: false, remainingMs: 0, totalMs: countdownTotalMsRef.current });
      }
    }, 250);
    return () => { if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownActive]);

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

  // serviceNotes: load from localStorage when service changes, save on change
  useEffect(() => {
    if (!currentService) { setServiceNotes(""); return; }
    setServiceNotes(localStorage.getItem(`notes_${currentService.id}`) ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentService?.id]);

  // Live clock
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    setClock(fmt());
    const id = setInterval(() => setClock(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  // Heartbeat: detect when output window connects/disconnects
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const TIMEOUT_MS = 8000; // 2x heartbeat interval

    const resetTimer = () => {
      setOutputConnected(true);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setOutputConnected(false), TIMEOUT_MS);
    };

    let mounted = true;
    let unlisten: (() => void) | null = null;
    ipc.onHeartbeat(resetTimer).then((fn) => {
      if (mounted) unlisten = fn;
      else fn();
    });

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      unlisten?.();
    };
  }, []);

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
    ipc.onOutputReady(() => {
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
      } : undefined;
      ipc.sendSlideUpdate(toSend, readyMeta);
      ipc.sendBlackout(bo);
      ipc.sendAlert(at, av);
      ipc.sendCountdown({ active: countdownActiveRef.current, remainingMs: countdownRemainingMsRef.current, totalMs: countdownTotalMsRef.current });
    }).then((fn) => {
      if (mounted) unlisten = fn;
      else fn();
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isLive) return;
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
    };

    ipc.sendSlideUpdate(newConfig, slideMeta);
  }, [activeItemIndex, activeLyricSlideIndex, currentService?.id, isLive, isClear, setLayerConfig]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘+S / Ctrl+S: 어디서든 저장
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSaveRef.current();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || (e.target as HTMLElement).isContentEditable) return;
      // When a modal is open, only Escape should fire
      if ((showQuickSearchRef.current || showCheatSheetRef.current) && e.key !== "Escape") return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            const fl = st.getFlatSlideList();
            if (fi >= fl.length - 1) st.setActiveFlatSlide(0); else nextLyricSlide();
          } else {
            nextLyricSlide();
          }
          break;
        case "ArrowRight":
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            const fl = st.getFlatSlideList();
            if (fi >= fl.length - 1) st.setActiveFlatSlide(0); else nextLyricSlide();
          } else {
            nextLyricSlide();
          }
          break;
        case "ArrowLeft":
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            if (fi <= 0) { const fl = st.getFlatSlideList(); st.setActiveFlatSlide(fl.length - 1); }
            else prevLyricSlide();
          } else {
            prevLyricSlide();
          }
          break;
        case "ArrowDown":
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            const fl = st.getFlatSlideList();
            if (fi >= fl.length - 1) st.setActiveFlatSlide(0); else nextLyricSlide();
          } else {
            nextLyricSlide();
          }
          break;
        case "ArrowUp":
          if (isLoop) {
            const st = useQueueStore.getState();
            const fi = st.getActiveFlatSlideIndex();
            if (fi <= 0) { const fl = st.getFlatSlideList(); st.setActiveFlatSlide(fl.length - 1); }
            else prevLyricSlide();
          } else {
            prevLyricSlide();
          }
          break;
        case "F5":
          e.preventDefault();
          setIsLive((v) => !v);
          break;
        case "b":
        case "B": {
          const next = !isBlackout;
          setBlackout(next);
          ipc.sendBlackout(next);
          break;
        }
        case "c":
        case "C":
          setIsClear((prev) => !prev);
          break;
        case "l":
        case "L":
          setIsLoop((prev) => !prev);
          break;
        case "o":
        case "O":
          openOutputRef.current();
          break;
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
        case "f":
        case "F":
          setIsFrozen((prev) => {
            ipc.sendFreeze(!prev);
            if (prev) ipc.sendSlideUpdate(useOutputStore.getState().layerConfig);
            return !prev;
          });
          break;
        case "t":
        case "T":
          setAutoAdvance((v) => !v);
          break;
        case "/":
          e.preventDefault();
          setShowQuickSearch(true);
          break;
        case "?":
          setShowCheatSheet(true);
          break;
        case "Escape":
          if (isBlackout) { setBlackout(false); ipc.sendBlackout(false); }
          setIsClear(false);
          setShowQuickSearch(false);
          setShowCheatSheet(false);
          setCtrlNotice(null);
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
  }, [isBlackout, isLoop, nextLyricSlide, prevLyricSlide, setBlackout]);

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

  const setSubtitle = (patch: Partial<LayerConfig["subtitle"]>) => {
    handleLayerChange({ ...layerConfig, subtitle: { ...layerConfig.subtitle, ...patch } });
  };

  type FmtPatch = { fontFamily?: string; fontSize?: number; fontWeight?: "normal" | "bold"; fontStyle?: "normal" | "italic"; textDecoration?: "none" | "underline" | "line-through"; color?: string; textAlign?: "left" | "center" | "right" };
  function applyFormat(patch: FmtPatch) {
    if (selectedBlock && canvasRef.current) {
      canvasRef.current.updateBlock(selectedBlock.id, patch);
    } else {
      setSubtitle(patch as Partial<LayerConfig["subtitle"]>);
    }
  }
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
      const name = selected.split("/").pop() ?? "audio";
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(src);
      audioRef.current = audio;
      setSoundName(name);
      audio.play().catch(() => {});
      setSoundPlaying(true);
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
    if (d) ipc.openOutputWindow(d.x, d.y, d.width, d.height);
    else ipc.openOutputWindow(1920, 0, 1920, 1080);
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
    } catch (e) {
      console.error("[save]", e);
      setCtrlNotice({ msg: "저장에 실패했습니다. 다시 시도해 주세요." , error: true });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 5000);
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
  const handleNewServiceRef = useRef(handleNewService);
  useEffect(() => { handleNewServiceRef.current = handleNewService; });
  const handleNewSlideRef = useRef(handleNewSlide);
  useEffect(() => { handleNewSlideRef.current = handleNewSlide; });
  const handleDupSlideRef = useRef(handleDupSlide);
  useEffect(() => { handleDupSlideRef.current = handleDupSlide; });
  const handleInsertImageRef = useRef(handleInsertImage);
  useEffect(() => { handleInsertImageRef.current = handleInsertImage; });

  // Tauri native menu event listeners
  useEffect(() => {
    let unlistens: Array<() => void> = [];
    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistens = await Promise.all([
          listen("menu:open-output",      () => openOutputRef.current()),
          listen("menu:close-output",     () => ipc.closeOutputWindow().catch(() => {})),
          listen("menu:show-from-start",  () => {
            useQueueStore.getState().setActiveFlatSlide(0);
            openOutputRef.current();
          }),
          listen("menu:show-from-current", () => openOutputRef.current()),
          listen("menu:hide-slide",        () => setIsClear((v) => !v)),
          listen("menu:add-song",          () => { setShowPanel(true); setRightTab("songs"); }),
          listen("menu:new-service",       () => handleNewServiceRef.current()),
          listen("menu:open-service",      () => setShowServiceList(true)),
          listen("menu:save-service",      () => handleSaveRef.current()),
          listen("menu:save-as",           () => setShowSaveModal(true)),
          listen("menu:new-slide",         () => handleNewSlideRef.current()),
          listen("menu:dup-slide",         () => handleDupSlideRef.current()),
          listen("menu:add-media",         () => handleInsertImageRef.current()),
          listen("menu:add-scripture",     () => {
            setShowPanel(true);
            setRightTab("queue");
            window.dispatchEvent(new CustomEvent("worship:open-scripture-tab"));
          }),
          listen("menu:open-stage",        () => {
            ipc.openStageWindow().catch(console.error);
            setIsStageOpen(true);
          }),
          // Sync isStageOpen when stage window is closed via OS close button
          ipc.onStageClosed(() => setIsStageOpen(false)),
        ]);
      } catch (e) { console.error("[menu setup]", e); }
    }
    setup();
    return () => { unlistens.forEach((fn) => fn()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slides = getFlatSlideList();
  const flatIdx = getActiveFlatSlideIndex();

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

      {/* ── Ribbon Row 1: 컨트롤 바 ───────────────────────────────────── */}
      <div className="h-9 flex items-center gap-1.5 px-3 border-b border-zinc-700 bg-[#3c3c3c] flex-shrink-0 text-xs">
        <span className="font-bold text-zinc-200 tracking-wide mr-1">✝ Worship</span>
        <div className="w-px h-5 bg-zinc-600" />
        <span className="text-zinc-400 truncate max-w-[120px]">
          {currentService?.name ?? "예배 없음"}
        </span>
        {isDirty && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600 text-amber-100 font-semibold shrink-0">미저장</span>
        )}
        {ctrlNotice && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-red-800 text-red-100 font-semibold shrink-0 cursor-pointer"
            onClick={() => setCtrlNotice(null)}
            title="클릭하여 닫기"
          >
            ⚠ {ctrlNotice.msg} ✕
          </span>
        )}
        {slides.length > 0 && (
          <span className="text-[10px] text-zinc-500 shrink-0">{flatIdx + 1}/{slides.length}</span>
        )}
        {(() => {
          const next = flatIdx >= 0 && flatIdx + 1 < slides.length ? slides[flatIdx + 1] : null;
          const nextText = next ? (next.slide.lines[0] ?? "빈 슬라이드") : null;
          return nextText ? (
            <span className="text-[10px] text-zinc-500 shrink-0 max-w-[180px] truncate hidden md:inline" title={next!.slide.lines.join(" / ")}>
              다음: <span className="text-zinc-300">{nextText}</span>
            </span>
          ) : null;
        })()}
        <div className="flex-1" />

        <button onClick={() => setIsLive((v) => !v)}
          title="라이브/대기 전환 (F5)"
          className={`flex items-center gap-1 px-2 py-0.5 rounded font-semibold ${isLive ? "bg-green-700 hover:bg-green-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-400"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-green-300" : "bg-zinc-500"}`} />
          {isLive ? "라이브" : "대기"}
        </button>

        <button onClick={() => { const n = !isBlackout; setBlackout(n); ipc.sendBlackout(n); }}
          className={`px-2 py-0.5 rounded font-semibold ${isBlackout ? "bg-red-700 hover:bg-red-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}
          title="블랙아웃 (B)">
          {isBlackout ? "● 블랙" : "블랙"}
        </button>

        <button onClick={() => setIsClear((v) => !v)}
          className={`px-2 py-0.5 rounded font-semibold ${isClear ? "bg-orange-700 hover:bg-orange-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}
          title="화면 지우기 (C)">
          {isClear ? "● 지우기" : "지우기"}
        </button>

        <button
          onClick={() => setIsFrozen((prev) => { ipc.sendFreeze(!prev); if (prev) ipc.sendSlideUpdate(useOutputStore.getState().layerConfig); return !prev; })}
          className={`px-2 py-0.5 rounded font-semibold ${isFrozen ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}
          title="출력 고정 (F) - 탐색 중 화면 유지">
          {isFrozen ? "● 고정" : "고정"}
        </button>

        <div className={`flex items-center rounded overflow-hidden border ${autoAdvance ? "border-teal-600" : "border-zinc-600"}`}>
          <button
            onClick={() => setAutoAdvance((v) => !v)}
            className={`px-2 py-0.5 font-semibold relative overflow-hidden text-xs ${autoAdvance ? "bg-teal-700 hover:bg-teal-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}
            title="자동 넘기기 (T)">
            {autoAdvance ? `⏱ ${Math.max(1, Math.ceil((autoAdvanceMs * (1 - autoProgress / 100)) / 1000))}s` : "자동"}
            {autoAdvance && <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, width: `${autoProgress}%`, backgroundColor: "#2dd4bf" }} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setAutoAdvanceMs((v) => Math.max(1000, v - 1000)); }}
            className="px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs"
            title="1초 감소">−</button>
          <span className="px-1 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] min-w-[24px] text-center border-l border-zinc-600">
            {autoAdvanceMs / 1000}s
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setAutoAdvanceMs((v) => Math.min(30000, v + 1000)); }}
            className="px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs"
            title="1초 증가">+</button>
        </div>

        <div className="w-px h-5 bg-zinc-600" />

        <input type="text" placeholder="자막 경보..." value={alertInput}
          onChange={(e) => setAlertInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && alertInput.trim()) { setAlert(alertInput.trim(), true); setAlertActive(true); ipc.sendAlert(alertInput.trim(), true); }}}
          className="bg-zinc-700 border border-zinc-600 rounded px-2 py-0.5 text-white w-24 outline-none focus:border-orange-500" />
        <button onClick={() => { if (alertInput.trim()) { setAlert(alertInput.trim(), true); setAlertActive(true); ipc.sendAlert(alertInput.trim(), true); }}}
          disabled={!alertInput.trim()}
          className={`px-2 py-0.5 rounded ${alertActive ? "bg-orange-600 hover:bg-orange-700" : "bg-zinc-700 hover:bg-zinc-600"} text-white disabled:opacity-40`}>
          전송
        </button>
        {alertActive && (
          <button onClick={() => { setAlert("", false); setAlertActive(false); ipc.sendAlert("", false); }}
            className="px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400">✕</button>
        )}

        <div className="w-px h-5 bg-zinc-600" />

        <button onClick={openOutput}
          className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 rounded text-white font-medium" title="출력창 열기">
          📺 출력창 <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: outputConnected ? "#4ade80" : "#6b7280", marginLeft: 2, verticalAlign: "middle" }} title={outputConnected ? "연결됨" : "연결 안됨"} />
        </button>

        <button
          onClick={() => {
            if (isStageOpen) {
              ipc.closeStageWindow().catch(console.error);
              setIsStageOpen(false);
            } else {
              ipc.openStageWindow().catch(console.error);
              setIsStageOpen(true);
            }
          }}
          className={`px-2 py-0.5 rounded font-medium ${isStageOpen ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}
          title="Stage Display 발표자 모니터">
          🎤 Stage
        </button>

        <div className="w-px h-5 bg-zinc-600" />

        {/* Countdown Timer Control */}
        <div className={`flex items-center rounded overflow-hidden border ${countdownActive ? "border-violet-600" : "border-zinc-600"}`}>
          <button
            onClick={() => {
              if (countdownActive) {
                setCountdownActive(false);
                ipc.sendCountdown({ active: false, remainingMs: countdownRemainingMs, totalMs: countdownTotalMsRef.current });
              } else {
                const totalMs = countdownMin * 60 * 1000;
                countdownTotalMsRef.current = totalMs;
                setCountdownRemainingMs(totalMs);
                setCountdownActive(true);
                ipc.sendCountdown({ active: true, remainingMs: totalMs, totalMs });
              }
            }}
            className={`px-2 py-0.5 font-semibold text-xs ${countdownActive ? "bg-violet-700 hover:bg-violet-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}
            title="카운트다운 시작/정지">
            {countdownActive ? `⏳ ${Math.ceil(countdownRemainingMs / 60000) > 0 ? `${Math.floor(countdownRemainingMs / 60000)}:${String(Math.floor((countdownRemainingMs % 60000) / 1000)).padStart(2, "0")}` : "0:00"}` : "카운트"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (!countdownActive) setCountdownMin((v) => Math.max(1, v - 1)); }}
            disabled={countdownActive}
            className="px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs disabled:opacity-40">−</button>
          <span className="px-1 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] min-w-[24px] text-center border-l border-zinc-600">{countdownMin}m</span>
          <button
            onClick={(e) => { e.stopPropagation(); if (!countdownActive) setCountdownMin((v) => Math.min(60, v + 1)); }}
            disabled={countdownActive}
            className="px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs disabled:opacity-40">+</button>
          {(countdownActive || countdownRemainingMs < countdownMin * 60 * 1000) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCountdownActive(false);
                const totalMs = countdownMin * 60 * 1000;
                countdownTotalMsRef.current = totalMs;
                setCountdownRemainingMs(totalMs);
                ipc.sendCountdown({ active: false, remainingMs: totalMs, totalMs });
              }}
              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-white border-l border-zinc-600 text-xs"
              title="리셋">↺</button>
          )}
        </div>

        {clock && <span className="text-[11px] text-zinc-400 tabular-nums shrink-0 font-mono">{clock}</span>}

        <button onClick={() => setShowCheatSheet(true)}
          className="px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
          title="단축키 도움말 (?)">
          ?
        </button>

        <button onClick={() => setShowPanel((v) => !v)}
          className={`px-2 py-0.5 rounded ${showPanel ? "bg-zinc-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-400"}`}
          title="패널 열기/닫기">
          ☰
        </button>
      </div>

      {/* ── Ribbon Row 2: 탭 바 ──────────────────────────────────────── */}
      <div className="h-7 flex items-end px-1 bg-[#2b2b2b] flex-shrink-0 text-xs border-b border-zinc-700">
        {(["home", "insert"] as const).map((tab) => (
          <button key={tab} onClick={() => setRibbonTab(tab)}
            className={`px-3 h-full text-xs transition-colors ${
              ribbonTab === tab
                ? "text-white border-b-2 border-blue-500 bg-[#2d2d2d]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}>
            {tab === "home" ? "홈" : "삽입"}
          </button>
        ))}
        {([
          ["design", "디자인"],
          ["transition", "전환"],
          ["animation", "애니메이션"],
          ["slideshow", "슬라이드 쇼"],
          ["review", "검토"],
          ["view", "보기"],
        ] as [RibbonTab, string][]).map(([val, label]) => (
          <button key={val} onClick={() => setRibbonTab(val)}
            className={`px-3 h-full text-xs transition-colors ${
              ribbonTab === val
                ? "text-white border-b-2 border-blue-500 bg-[#2d2d2d]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Ribbon Row 3: 탭 콘텐츠 ─────────────────────────────────── */}
      <div className="h-9 flex items-center gap-0.5 px-2 border-b border-zinc-700 bg-[#2d2d2d] flex-shrink-0 text-xs">
        {ribbonTab === "home" && (<>
          {/* 클립보드 */}
          <div className="flex items-center gap-0.5 border-r border-zinc-600 pr-2 mr-1">
            <button onClick={() => canvasRef.current?.pasteBlock()}
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">📋</span>
              <span className="text-[8px] mt-0.5">붙여넣기</span>
            </button>
            <div className="flex flex-col gap-0.5">
              <button onClick={() => canvasRef.current?.cutBlock()}
                className="px-1 py-0 rounded hover:bg-zinc-700 text-zinc-400 text-[10px]">✂ 잘라내기</button>
              <button onClick={() => canvasRef.current?.copyBlock()}
                className="px-1 py-0 rounded hover:bg-zinc-700 text-zinc-400 text-[10px]">📄 복사하기</button>
              <button
                onClick={() => {
                  if (!selectedBlock) return;
                  const { fontFamily, fontSize, fontWeight, fontStyle, textDecoration, color, textAlign } = selectedBlock;
                  canvasRef.current?.activateFormatPainter({ fontFamily, fontSize, fontWeight, fontStyle, textDecoration, color, textAlign });
                  setFmtPainterOn(true);
                  setTimeout(() => setFmtPainterOn(canvasRef.current?.isFmtPainterActive() ?? false), 100);
                }}
                disabled={!selectedBlock}
                className={`px-1 py-0 rounded text-[10px] disabled:text-zinc-600 disabled:cursor-default ${fmtPainterOn ? "bg-orange-600 text-white" : "hover:bg-zinc-700 text-zinc-400"}`}
                title="선택한 블록의 서식을 다른 블록에 적용">
                🖌 서식복사
              </button>
            </div>
          </div>

          {/* 글꼴 */}
          <select value={fmt.fontFamily} onChange={(e) => applyFormat({ fontFamily: e.target.value })}
            className="bg-[#3c3c3c] border border-zinc-600 rounded px-1.5 py-0.5 text-white outline-none hover:border-zinc-400 w-28">
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input type="number" min={12} max={200} value={fmt.fontSize}
            onChange={(e) => applyFormat({ fontSize: Math.max(12, Math.min(200, Number(e.target.value))) })}
            className="w-11 bg-[#3c3c3c] border border-zinc-600 rounded px-1 py-0.5 text-white outline-none text-center hover:border-zinc-400" />

          <div className="w-px h-5 bg-zinc-600 mx-0.5" />

          <button onClick={() => applyFormat({ fontWeight: fmt.fontWeight === "bold" ? "normal" : "bold" })}
            className={`w-6 h-6 rounded font-bold ${fmt.fontWeight === "bold" ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>B</button>
          <button onClick={() => applyFormat({ fontStyle: fmt.fontStyle === "italic" ? "normal" : "italic" })}
            className={`w-6 h-6 rounded italic ${fmt.fontStyle === "italic" ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>I</button>
          <button onClick={() => applyFormat({ textDecoration: fmt.textDecoration === "underline" ? "none" : "underline" })}
            className={`w-6 h-6 rounded underline ${fmt.textDecoration === "underline" ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>U</button>
          <button onClick={() => applyFormat({ textDecoration: fmt.textDecoration === "line-through" ? "none" : "line-through" })}
            className={`w-6 h-6 rounded line-through ${fmt.textDecoration === "line-through" ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>S</button>

          <div className="w-px h-5 bg-zinc-600 mx-0.5" />

          <input type="color" value={fmt.color} onChange={(e) => applyFormat({ color: e.target.value })}
            className="w-6 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent p-0" title="글자 색상" />

          <div className="w-px h-5 bg-zinc-600 mx-0.5" />

          {(["left", "center", "right"] as const).map((align) => (
            <button key={align} onClick={() => applyFormat({ textAlign: align })}
              className={`w-6 h-6 rounded ${fmt.textAlign === align ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}
              title={align === "left" ? "왼쪽" : align === "center" ? "가운데" : "오른쪽"}>
              {align === "left" ? "⫷" : align === "center" ? "☰" : "⫸"}
            </button>
          ))}

          {!selectedBlock && (<>
            <div className="w-px h-5 bg-zinc-600 mx-0.5" />
            {(["top", "center", "bottom"] as const).map((pos) => (
              <button key={pos} onClick={() => setSubtitle({ position: pos })}
                className={`px-1.5 h-6 rounded ${layerConfig.subtitle.position === pos ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>
                {pos === "top" ? "상▲" : pos === "center" ? "중" : "하▼"}
              </button>
            ))}
          </>)}

          <div className="flex-1" />
          <button onClick={() => setIsLoop((v) => !v)}
            className={`px-2 h-6 rounded ${isLoop ? "bg-yellow-700 text-yellow-200" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-400"}`}>
            ↺ {isLoop ? "루프 ON" : "루프"}
          </button>
        </>)}

        {ribbonTab === "design" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-1">
            <span className="text-zinc-400 text-[10px] mr-1">테마</span>
            {([
              { label: "어두운", bg: "#000000", text: "#ffffff" },
              { label: "밝은",   bg: "#ffffff", text: "#000000" },
              { label: "파랑",   bg: "#001040", text: "#ffffff" },
              { label: "붉은",   bg: "#1a0000", text: "#ff9090" },
              { label: "남색",   bg: "#0a0a1e", text: "#e0e0ff" },
            ] as const).map(({ label, bg, text }) => (
              <button key={label} title={label}
                onClick={() => handleLayerChange({
                  ...layerConfig,
                  background: { ...layerConfig.background, type: "color", color: bg },
                  subtitle: { ...layerConfig.subtitle, color: text },
                })}
                className="flex flex-col items-center gap-0.5 px-1 py-0.5 rounded hover:bg-zinc-700">
                <div className="w-8 h-5 rounded border border-zinc-600 flex items-center justify-center"
                  style={{ background: bg }}>
                  <span style={{ fontSize: 7, color: text, fontWeight: "bold" }}>Aa</span>
                </div>
                <span className="text-[8px] text-zinc-400">{label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => { setShowPanel(true); setRightTab("settings"); }}
            className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
            <span className="text-base leading-none">🎨</span>
            <span className="text-[9px] mt-0.5">디자인 패널</span>
          </button>
        </>)}

        {ribbonTab === "transition" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-1">
            <span className="text-zinc-400 text-[10px] mr-1">전환 속도</span>
            {([
              { label: "없음",   ms: 0 },
              { label: "빠름",   ms: 150 },
              { label: "보통",   ms: 300 },
              { label: "느림",   ms: 600 },
            ] as const).map(({ label, ms }) => (
              <button key={ms}
                onClick={() => handleLayerChange({ ...layerConfig, transitionMs: ms })}
                className={`px-2 h-6 rounded text-[10px] ${
                  (layerConfig.transitionMs ?? 250) === ms
                    ? "bg-blue-600 text-white"
                    : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"
                }`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-zinc-500 text-[10px]">슬라이드 간 페이드 전환 속도</span>
        </>)}

        {ribbonTab === "animation" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-1">
            <span className="text-zinc-400 text-[10px] mr-1">텍스트 입장</span>
            {([
              { label: "없음",      val: "none"       as const },
              { label: "페이드인",   val: "fade"       as const },
              { label: "위로↑",     val: "slide-up"   as const },
              { label: "아래로↓",   val: "slide-down" as const },
              { label: "줌인",      val: "zoom-in"    as const },
            ]).map(({ label, val }) => (
              <button key={val}
                onClick={() => setSubtitle({ textEntrance: val })}
                className={`px-2 h-6 rounded text-[10px] ${
                  (layerConfig.subtitle.textEntrance ?? "fade") === val
                    ? "bg-blue-600 text-white"
                    : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"
                }`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-zinc-500 text-[10px]">새 슬라이드 표시 시 텍스트 효과</span>
        </>)}

        {ribbonTab === "slideshow" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-2">
            <button onClick={() => { useQueueStore.getState().setActiveFlatSlide(0); openOutput(); }}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">⏮</span>
              <span className="text-[9px] mt-0.5">처음부터</span>
            </button>
            <button onClick={openOutput}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">▶</span>
              <span className="text-[9px] mt-0.5">현재부터</span>
            </button>
            <button onClick={() => ipc.closeOutputWindow().catch(() => {})}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-400">
              <span className="text-base leading-none">⏹</span>
              <span className="text-[9px] mt-0.5">종료</span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsLoop((v) => !v)}
              className={`px-2 h-6 rounded text-[10px] ${isLoop ? "bg-yellow-700 text-yellow-200" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-400"}`}>
              ↺ 루프
            </button>
            <button onClick={() => { const n = !isBlackout; setBlackout(n); ipc.sendBlackout(n); }}
              className={`px-2 h-6 rounded text-[10px] ${isBlackout ? "bg-red-700 text-red-200" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-400"}`}>
              ● 블랙
            </button>
            <button onClick={() => setIsClear((v) => !v)}
              className={`px-2 h-6 rounded text-[10px] ${isClear ? "bg-orange-700 text-orange-200" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-400"}`}>
              지우기
            </button>
          </div>
        </>)}

        {ribbonTab === "review" && (<>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-[10px]">예배 메모</span>
            <input
              type="text"
              placeholder="운영 메모 (로컬 저장)..."
              value={serviceNotes}
              onChange={(e) => {
                setServiceNotes(e.target.value);
                if (currentService) localStorage.setItem(`notes_${currentService.id}`, e.target.value);
              }}
              className="bg-[#3c3c3c] border border-zinc-600 rounded px-2 py-0.5 text-white w-72 text-xs outline-none focus:border-blue-500"
            />
            <span className="text-zinc-600 text-[10px]">* 투사 화면에 표시되지 않음</span>
          </div>
        </>)}

        {ribbonTab === "view" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-1">
            <span className="text-zinc-400 text-[10px] mr-1">줌</span>
            <input type="range" min={25} max={200} step={5} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20 accent-zinc-400" />
            <span className="text-zinc-300 text-[10px] w-8 tabular-nums">{zoom}%</span>
            {([50, 85, 100, 150] as const).map((z) => (
              <button key={z} onClick={() => setZoom(z)}
                className={`px-1.5 h-6 rounded text-[10px] ${zoom === z ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>
                {z}%
              </button>
            ))}
          </div>
          <button onClick={() => setShowPanel((v) => !v)}
            className={`flex flex-col items-center px-2 py-0.5 rounded ${showPanel ? "bg-zinc-600 text-white" : "hover:bg-zinc-700 text-zinc-300"}`}>
            <span className="text-base leading-none">☰</span>
            <span className="text-[9px] mt-0.5">패널</span>
          </button>
        </>)}

        {ribbonTab === "insert" && (<>
          <div className="border-r border-zinc-600 pr-3 mr-1 flex flex-col items-center">
            <button onClick={handleNewSlide}
              disabled={!currentService}
              title={!currentService ? "순서 탭에서 예배를 먼저 선택하세요" : "새 슬라이드 추가"}
              className={`flex flex-col items-center px-2 py-0.5 rounded ${!currentService ? "opacity-40 cursor-not-allowed" : "hover:bg-zinc-700 text-zinc-300"}`}>
              <span className="text-base leading-none">🗒</span>
              <span className="text-[9px] mt-0.5">새 슬라이드</span>
            </button>
          </div>
          <div className="border-r border-zinc-600 pr-3 mr-1 flex flex-col items-center">
            <button onClick={() => {
              if (flatIdx < 0) {
                if (slides.length > 0) {
                  useQueueStore.getState().setActiveFlatSlide(0);
                  pendingAddBlockRef.current = true;
                }
                return;
              }
              canvasRef.current?.addBlock();
            }}
              disabled={slides.length === 0}
              title={slides.length === 0 ? "순서 탭에서 예배와 찬양을 먼저 추가하세요" : "텍스트 상자 추가"}
              className={`flex flex-col items-center px-2 py-0.5 rounded ${slides.length === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-zinc-700 text-zinc-300"}`}>
              <span className="text-base font-bold leading-none">T</span>
              <span className="text-[9px] mt-0.5">텍스트 상자</span>
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={handleInsertImage}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">🖼</span>
              <span className="text-[9px] mt-0.5">이미지</span>
            </button>
            <button onClick={handleInsertVideo}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">🎬</span>
              <span className="text-[9px] mt-0.5">비디오</span>
            </button>
            <button
              onClick={soundName ? handleToggleSound : handleInsertSound}
              className={`flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 ${soundPlaying ? "text-green-400" : "text-zinc-300"}`}
              title={soundName ? `${soundName} — 클릭하여 ${soundPlaying ? "일시정지" : "재생"}` : "오디오 파일 열기"}>
              <span className="text-base leading-none">🔊</span>
              <span className="text-[9px] mt-0.5">{soundName ? (soundPlaying ? "▶ 재생중" : "⏸ 정지") : "사운드"}</span>
            </button>
            {soundName && (
              <button onClick={handleInsertSound} className="flex flex-col items-center px-1 py-0.5 rounded hover:bg-zinc-700 text-zinc-500" title="다른 파일 열기">
                <span className="text-[9px]">📂</span>
              </button>
            )}
          </div>
        </>)}
      </div>

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
              {rightTab === "songs" && <LibraryPanel mode="songs" />}
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
    </ErrorBoundary>
  );
}
