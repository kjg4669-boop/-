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
import { backingTrackDb } from "@/lib/backingTrackDb";
import { looksDb } from "@/lib/looksDb";
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
  type Look,
  type LookApplyPayload,
} from "@/lib/types";
import { deepMerge, loadGlobalDefaults, saveGlobalDefaults, newSlideId, getSlidesInOrder } from "@/lib/utils";

import ErrorBoundary from "@/components/ErrorBoundary";
import ServiceListModal from "@/components/controller/ServiceListModal";
import SaveServiceModal from "@/components/controller/SaveServiceModal";
import QuickSearchModal from "@/components/controller/QuickSearchModal";
import ShortcutCheatSheet from "@/components/controller/ShortcutCheatSheet";
import TemplateModal from "@/components/controller/TemplateModal";
import OutputPreview from "@/components/controller/OutputPreview";
import SidebarLayerPanel from "@/components/controller/SidebarLayerPanel";
import AlertPanel from "@/components/controller/AlertPanel";
import AnnouncementPanel from "@/components/controller/AnnouncementPanel";
import LooksPanel from "@/components/controller/LooksPanel";
import { useCountdown } from "@/hooks/useCountdown";
import { useClock } from "@/hooks/useClock";
import { useOutputHeartbeat } from "@/hooks/useOutputHeartbeat";
import { useMenuEvents } from "@/hooks/useMenuEvents";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useGlobalErrorCapture } from "@/hooks/useGlobalErrorCapture";
import { useAutoSave } from "@/hooks/useAutoSave";
import ErrorToast from "@/components/ErrorToast";
import ControlBar from "@/components/controller/ControlBar";
import RibbonToolbar from "@/components/controller/RibbonToolbar";
import AboutDialog from "@/components/controller/AboutDialog";
import SettingsDialog from "@/components/controller/SettingsDialog";
import OnboardingGuide from "@/components/controller/OnboardingGuide";
import HelpOverlay from "@/components/controller/HelpOverlay";
import RemotePanel from "@/components/controller/RemotePanel";
import NdiPanel from "@/components/controller/NdiPanel";
import VideoPanel from "@/components/controller/VideoPanel";
import { useVideoStore } from "@/stores/videoStore";
import type { RemoteCommand } from "@/lib/types";

type RightTab = "queue" | "songs" | "settings" | "alert" | "looks" | "remote" | "ndi" | "announcement" | "video";
type RibbonTab = "home" | "insert" | "design" | "transition" | "animation" | "review" | "view";

function buildCopyrightString(song?: { copyright_text?: string; ccli_number?: string; publisher?: string } | null): string {
  const parts: string[] = [];
  if (song?.copyright_text) parts.push(song.copyright_text);
  if (song?.ccli_number) parts.push(`CCLI #${song.ccli_number}`);
  if (song?.publisher) parts.push(song.publisher);
  return parts.join(" | ");
}

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
  const [tabOrder, setTabOrder] = useState<RightTab[]>(["queue", "songs", "video", "alert", "settings", "announcement"]);
  const [removedTabs, setRemovedTabs] = useState<RightTab[]>(["looks", "remote", "ndi"]);
  const [draggingTab, setDraggingTab] = useState<RightTab | null>(null);
  const [dragOverTab, setDragOverTab] = useState<RightTab | null>(null);
  const tabOrderRef = useRef<RightTab[]>(tabOrder);
  const dragDroppedRef = useRef(false);
  const isHtml5DraggingRef = useRef(false);
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const [openedWindows, setOpenedWindows] = useState<Set<RightTab>>(new Set());
  const [panelFloating, setPanelFloating] = useState(false);
  const [layerPanelHeight, setLayerPanelHeight] = useState(200);
  const layerResizerRef = useRef<{ startY: number; startH: number } | null>(null);
  const [layerPanelFloating, setLayerPanelFloating] = useState(false);
  const [layerPanelPos, setLayerPanelPos] = useState({ x: 0, y: 0 });
  const [layerPanelSnapHint, setLayerPanelSnapHint] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(224); // 224px = w-56
  const leftResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const [previewDocked, setPreviewDocked] = useState(true);
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>("home");
  const [serviceNotes, setServiceNotes] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<TextBlock | null>(null);
  const [fmtPainterOn, setFmtPainterOn] = useState(false);
  const canvasRef = useRef<SlideCanvasHandle>(null);
  const openedWindowsRef = useRef<Set<RightTab>>(new Set());
  openedWindowsRef.current = openedWindows;
  const rightTabRef = useRef<RightTab>(rightTab);
  rightTabRef.current = rightTab;
  const saveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layerAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveItemRef = useRef<(itemId: number, config: LayerConfig) => Promise<void>>(async () => {});
  // Slide transition nonce: increments on every slide navigation so animation always fires
  const slideNonceRef = useRef(0);
  // Track previous item to detect item switches vs. same-item slide navigation
  const prevItemIdRef = useRef<number | null>(null);
  const openOutputRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundName, setSoundName] = useState<string | null>(null);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const pendingAddBlockRef = useRef(false);
  const [showServiceList, setShowServiceList] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem("worship-onboarding-v1")) setShowOnboarding(true);
  }, []);
  // tabOrderRef 동기화
  useEffect(() => { tabOrderRef.current = tabOrder; }, [tabOrder]);
  const outputConnected = useOutputHeartbeat();
  useGlobalErrorCapture();
  const handleAutoSaved = useCallback(() => {
    setCtrlNotice({ msg: "자동 저장됨 ✓" });
    if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
    ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 3000);
  }, []);
  useAutoSave(currentService, handleAutoSaved);
  const [isStageOpen, setIsStageOpen] = useState(false);
  const [stageMsgText, setStageMsgText] = useState("");
  const [stageMsgActive, setStageMsgActive] = useState(false);
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

  // Autosave: 30초마다 isDirty면 조용히 저장 (에러 토스트 없음, 중복 방지)
  const isSavingRef = useRef(false);
  useEffect(() => {
    const id = setInterval(async () => {
      const store = useQueueStore.getState();
      if (!store.isDirty || isSavingRef.current) return;
      const svc = store.currentService;
      if (!svc || svc.id <= 0) return;
      isSavingRef.current = true;
      try {
        await serviceDb.saveItems(svc.id, svc.items);
        const reloaded = await serviceDb.get(svc.id);
        if (reloaded) useQueueStore.getState().updateServiceData(reloaded);
        else useQueueStore.getState().setIsDirty(false);
      } catch (e) {
        console.warn("[auto-save 30s]", e);
      } finally {
        isSavingRef.current = false;
      }
    }, 30000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const { outputDisplayId, setOutputDisplayId, currentLookId, setCurrentLookId, outputScaleMode, setOutputScaleMode, uiFontScale } = useSettingsStore();

  // Apply UI font scale to root element so all rem-based sizes scale proportionally
  useEffect(() => {
    document.documentElement.style.fontSize = `${uiFontScale * 16}px`;
    return () => { document.documentElement.style.fontSize = ""; };
  }, [uiFontScale]);
  const [looks, setLooks] = useState<Look[]>([]);
  const looksRef = useRef<Look[]>([]);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const selectedDisplayIdx = outputDisplayId >= 0 ? outputDisplayId : 0;

  // Load looks from DB
  useEffect(() => {
    looksDb.list().then(setLooks).catch((e) => console.error("Failed to load looks:", e));
  }, []);
  // Keep looksRef in sync so closures (e.g. output:ready handler) see current looks
  useEffect(() => { looksRef.current = looks; }, [looks]);

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
        totalSlides: item.song ? getSlidesInOrder(item.song).length : 1,
        itemIndex: qState.activeItemIndex,
        totalItems: qState.currentService?.items.length ?? 0,
        nextLines: nextEntry?.slide.lines,
        nextSection: nextEntry?.slide.section,
        bpm: item.song?.bpm,
        chords: slide?.chords,
        notes: item.notes,
        copyright: buildCopyrightString(item?.song),
      } : undefined;
      void ipc.sendSlideUpdate(toSend, readyMeta);
      ipc.sendPreviewUpdate(lc); // push full (non-cleared) state to floating preview immediately
      void ipc.sendBlackout(bo);
      void ipc.sendAlert({ text: at, visible: av, duration: 0, position: "bottom" });
      void ipc.sendCountdown({ active: countdownActiveRef.current, remainingMs: countdownRemainingMsRef.current, totalMs: countdownTotalMsRef.current });
      void ipc.sendScaleMode(useSettingsStore.getState().outputScaleMode);
      // Re-send current look if one is active
      const currentLookIdNow = useSettingsStore.getState().currentLookId;
      if (currentLookIdNow !== null) {
        const foundLook = looksRef.current.find((l) => l.id === currentLookIdNow);
        if (foundLook) {
          void ipc.sendLookApply({
            lookId: foundLook.id,
            showBackground: foundLook.showBackground,
            showSubtitle: foundLook.showSubtitle,
            showOverlay: foundLook.showOverlay,
            showCanvas: foundLook.showCanvas,
            showCountdown: foundLook.showCountdown,
          });
        }
      }
      // Re-send audio state if current item is a song with backing tracks
      if (item?.type === "song" && item.song) {
        backingTrackDb.list(item.song.id).then((tracks) => {
          if (tracks.length > 0 && !tracks[0].start_paused) {
            void ipc.sendAudioPlay({ filePath: tracks[0].file_path, volume: tracks[0].volume, repeat: tracks[0].repeat });
          }
        }).catch(() => {});
      }
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

  // Re-dock preview panel when the preview window is closed
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    ipc.onPreviewClosed(() => setPreviewDocked(true)).then((fn) => { unlisten = fn; }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    const shouldSendIpc = isLive && !isFrozen;
    const { getActiveItem, getActiveLyricSlide } = useQueueStore.getState();
    const item = getActiveItem();
    const globalDefaults = loadGlobalDefaults(DEFAULT_LAYER_CONFIG);

    if (!item) {
      const config = deepMerge(DEFAULT_LAYER_CONFIG, globalDefaults) as LayerConfig;
      setLayerConfig(config);
      if (shouldSendIpc) ipc.sendSlideUpdate(config);
      return;
    }

    const slide = getActiveLyricSlide();
    const canvasBlocks = slide?.canvas?.textBlocks ?? [];
    const nonce = ++slideNonceRef.current;

    // Same item (slide navigation within song): preserve current style settings (textEntrance etc.)
    // Different item: reload style settings from settings_json
    const isSameItem = prevItemIdRef.current === item.id;
    prevItemIdRef.current = item.id;

    const base: LayerConfig = isSameItem
      ? useOutputStore.getState().layerConfig
      : (() => {
          const itemOverrides = item.settings_json ?? {};
          return deepMerge(
            deepMerge(DEFAULT_LAYER_CONFIG, globalDefaults),
            itemOverrides as Partial<LayerConfig>
          ) as LayerConfig;
        })();

    // Auto-apply video phase if this slide has one assigned
    const videoPhase = slide ? useVideoStore.getState().getPhaseForSlide(slide.id) : null;
    const effectiveBase: LayerConfig = videoPhase ? { ...base, background: videoPhase.background } : base;

    const newConfig: LayerConfig = {
      ...effectiveBase,
      subtitle: {
        ...effectiveBase.subtitle,
        visible: !isClear && canvasBlocks.length === 0 && !!slide,
        lines: !isClear && canvasBlocks.length === 0 ? (slide?.lines ?? []) : [],
        lines2: !isClear ? (slide?.lines2 ?? []) : [],
        nonce,
      },
      canvas: !isClear && canvasBlocks.length > 0 ? { textBlocks: canvasBlocks, nonce } : undefined,
    };
    setLayerConfig(newConfig);

    if (!shouldSendIpc) {
      ipc.sendPreviewUpdate(newConfig);
      return;
    }

    // Build SlideMeta for Stage Display
    const { getFlatSlideList, getActiveFlatSlideIndex } = useQueueStore.getState();
    const flatList = getFlatSlideList();
    const flatIdx = getActiveFlatSlideIndex();
    const nextEntry = flatIdx >= 0 && flatIdx + 1 < flatList.length ? flatList[flatIdx + 1] : null;
    const slideMeta: SlideMeta = {
      songTitle: item.song?.title ?? item.label ?? item.type,
      section: slide?.section ?? "verse",
      slideIndex: activeLyricSlideIndex,
      totalSlides: item.song ? getSlidesInOrder(item.song).length : 1,
      itemIndex: activeItemIndex,
      totalItems: currentService?.items.length ?? 0,
      nextLines: nextEntry?.slide.lines,
      nextSection: nextEntry?.slide.section,
      bpm: item.song?.bpm,
      chords: slide?.chords,
      notes: item.notes,
      copyright: buildCopyrightString(item.song),
    };

    ipc.sendSlideUpdate(newConfig, slideMeta);
    ipc.sendPreviewUpdate(newConfig); // keep floating preview in sync when isLive

    // Sync state to any connected web remote clients
    const slideText = slide?.lines.join(" ") ?? "";
    const songTitle = item.song?.title ?? item.label ?? "";
    void ipc.sendRemoteState(slideText, songTitle, activeLyricSlideIndex, item.song?.lyrics_json.length ?? 1).catch(() => {});
  // notesVersion excluded intentionally: Stage Display notes refresh on slide navigation (avoids IPC per keystroke)
  }, [activeItemIndex, activeLyricSlideIndex, currentService?.id, currentService?.items.length, isLive, isClear, isFrozen, setLayerConfig]);

  // ── Web Remote Control command listener ──────────────────────────────
  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;
    void ipc.onRemoteCommand((cmd: RemoteCommand) => {
      if (cmd.type === "next") {
        nextLyricSlide();
      } else if (cmd.type === "prev") {
        prevLyricSlide();
      } else if (cmd.type === "blackout") {
        const n = !useOutputStore.getState().isBlackout;
        useOutputStore.getState().setBlackout(n);
        void ipc.sendBlackout(n);
      } else if (cmd.type === "goto" && cmd.slideIndex !== undefined) {
        useQueueStore.getState().setActiveFlatSlide(cmd.slideIndex);
      }
    }).then((fn) => { if (mounted) unlisten = fn; else fn(); });
    return () => { mounted = false; unlisten?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextLyricSlide, prevLyricSlide]);

  // ── subtitle:next/prev from preview/output windows ───────────────────
  useEffect(() => {
    let mounted = true;
    let unNext: (() => void) | null = null;
    let unPrev: (() => void) | null = null;
    void ipc.onSubtitleNext(() => { if (mounted) nextLyricSlide(); }).then((fn) => { if (mounted) unNext = fn; else fn(); });
    void ipc.onSubtitlePrev(() => { if (mounted) prevLyricSlide(); }).then((fn) => { if (mounted) unPrev = fn; else fn(); });
    return () => { mounted = false; unNext?.(); unPrev?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextLyricSlide, prevLyricSlide]);

  // ── Playback status listener ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;
    void ipc.onPlaybackStatus((status: PlaybackStatusPayload) => setVideoStatus(status))
      .then((fn) => { if (mounted) unlisten = fn; else fn(); });
    return () => { mounted = false; unlisten?.(); };
  }, []);

  // ── Backing track auto-play ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const items = useQueueStore.getState().currentService?.items ?? [];
    const item = items[activeItemIndex];
    if (!item || item.type !== "song" || !item.song) {
      void ipc.sendAudioStop();
      return () => { cancelled = true; };
    }
    backingTrackDb.list(item.song.id).then((tracks) => {
      if (cancelled) return;
      if (tracks.length > 0) {
        if (!tracks[0].start_paused) {
          void ipc.sendAudioPlay({ filePath: tracks[0].file_path, volume: tracks[0].volume, repeat: tracks[0].repeat });
        }
      } else {
        void ipc.sendAudioStop();
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeItemIndex]);

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
    void ipc.sendAlert({ text: alertInput.trim(), visible: true, duration: 0, position: "bottom" });
  }, [alertInput, setAlert]);
  const handleClearAlert = useCallback(() => {
    setAlert("", false);
    setAlertActive(false);
    void ipc.sendAlertHide();
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
  const handleSendStageMsg = useCallback(() => {
    if (!stageMsgText.trim()) return;
    setStageMsgActive(true);
    void ipc.sendStageMessage({ text: stageMsgText.trim(), visible: true });
  }, [stageMsgText]);
  const handleClearStageMsg = useCallback(() => {
    setStageMsgActive(false);
    void ipc.sendStageMessage({ text: "", visible: false });
  }, []);
  const handleToggleLoop = useCallback(() => setIsLoop((v) => !v), []);
  const handleTogglePanel = useCallback(() => setShowPanel((v) => !v), []);

  const handleApplyLook = useCallback((look: Look | null) => {
    if (look === null) {
      setCurrentLookId(null);
      const payload: LookApplyPayload = {
        lookId: null,
        showBackground: true,
        showSubtitle: true,
        showOverlay: true,
        showCanvas: true,
        showCountdown: true,
      };
      void ipc.sendLookApply(payload);
    } else {
      setCurrentLookId(look.id);
      const payload: LookApplyPayload = {
        lookId: look.id,
        showBackground: look.showBackground,
        showSubtitle: look.showSubtitle,
        showOverlay: look.showOverlay,
        showCanvas: look.showCanvas,
        showCountdown: look.showCountdown,
        subtitleSnapshot: look.subtitleSnapshot,
        backgroundSnapshot: look.backgroundSnapshot,
      };
      void ipc.sendLookApply(payload);
    }
  }, [setCurrentLookId]);
  const handleShowCheatSheet = useCallback(() => setShowCheatSheet(true), []);
  const handleDismissNotice = useCallback(() => setCtrlNotice(null), []);

  // ── Callbacks for RibbonToolbar ───────────────────────────────────────
  const handlePasteBlock = useCallback(() => canvasRef.current?.pasteBlock(), []);
  const handleCutBlock = useCallback(() => canvasRef.current?.cutBlock(), []);
  const handleCopyBlock = useCallback(() => canvasRef.current?.copyBlock(), []);

  // Refs for keyboard shortcuts (always latest values) — C/V/X use native OS behavior
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
  const TAB_LABELS_WIN: Record<RightTab, string> = { queue: "순서", songs: "찬양", settings: "디자인", alert: "공지", looks: "룩", remote: "원격", ndi: "NDI", announcement: "공지루프", video: "동영상" };
  const openTabAsWindow = useCallback(async (tab: RightTab, screenX?: number, screenY?: number) => {
    if (openedWindowsRef.current.has(tab)) return;
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const win = new WebviewWindow(`panel-${tab}`, {
        url: `${window.location.origin}/floating-panel#${tab}`,
        title: TAB_LABELS_WIN[tab],
        width: 280,
        height: 520,
        ...(screenX !== undefined && screenY !== undefined ? { x: screenX - 140, y: screenY - 30 } : {}),
        decorations: true,
      });
      win.once("tauri://destroyed", () => {
        setOpenedWindows((prev) => { const next = new Set(prev); next.delete(tab); return next; });
        if (rightTabRef.current === tab) setRightTab(tab);
      });
      setOpenedWindows((prev) => new Set([...prev, tab]));
      if (rightTabRef.current === tab) {
        const next = tabOrderRef.current.find((t) => t !== tab && !openedWindowsRef.current.has(t));
        if (next) setRightTab(next);
      }
    } catch (err) {
      console.error("Failed to open panel window:", err);
    }
  }, []);
  const handleUndock = useCallback(async () => {
    if (panelFloating) return;
    setPanelFloating(true);
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const hash = tabOrderRef.current.join(",");
      const win = new WebviewWindow("all-panels", {
        url: `${window.location.origin}/all-panels#${hash}`,
        title: "패널",
        width: 280,
        height: 600,
        decorations: true,
      });
      win.once("tauri://destroyed", () => setPanelFloating(false));
    } catch {
      setPanelFloating(false);
    }
  }, [panelFloating]);

  const handleLayerResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    layerResizerRef.current = { startY: e.clientY, startH: layerPanelHeight };
    const handleMove = (me: MouseEvent) => {
      if (!layerResizerRef.current) return;
      const delta = layerResizerRef.current.startY - me.clientY;
      setLayerPanelHeight(Math.max(80, Math.min(500, layerResizerRef.current.startH + delta)));
    };
    const handleUp = () => {
      layerResizerRef.current = null;
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [layerPanelHeight]);

  const handleLayerPanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startPosX = layerPanelPos.x, startPosY = layerPanelPos.y;
    const handleMove = (me: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - 260, startPosX + me.clientX - startX));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, startPosY + me.clientY - startY));
      setLayerPanelPos({ x: newX, y: newY });
      setLayerPanelSnapHint(me.clientX > window.innerWidth - 80);
    };
    const handleUp = (me: MouseEvent) => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      setLayerPanelSnapHint(false);
      if (me.clientX > window.innerWidth - 80) setLayerPanelFloating(false);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [layerPanelPos.x, layerPanelPos.y]);

  const handleUndockPreview = useCallback(() => {
    setPreviewDocked(false);
    // Sync current config to localStorage BEFORE opening window so the preview
    // page can read it immediately on mount (avoids IPC round-trip delay).
    ipc.sendPreviewUpdate(useOutputStore.getState().layerConfig);
    void ipc.openPreviewWindow();
    // Also push via IPC after the window has loaded, as a safety net.
    for (const ms of [400, 1000, 2000]) {
      setTimeout(() => ipc.sendPreviewUpdate(useOutputStore.getState().layerConfig), ms);
    }
  }, []);

  const handleTabMouseDown = useCallback((e: React.MouseEvent, tab: RightTab) => {
    if (openedWindowsRef.current.has(tab)) return; // already open
    const startX = e.clientX, startY = e.clientY;
    let detached = false;
    const handleMove = (me: MouseEvent) => {
      if (!detached && (Math.abs(me.clientX - startX) > 8 || Math.abs(me.clientY - startY) > 8)) {
        detached = true;
      }
    };
    const handleUp = async (me: MouseEvent) => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      if (isHtml5DraggingRef.current) return; // HTML5 drag가 처리 중
      if (!detached) { setRightTab(tab); return; }
      await openTabAsWindow(tab, me.screenX, me.screenY);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, []);
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

  // ── 레이어 패널 OS 창 IPC ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    const unlisteners: Array<() => void> = [];
    import("@tauri-apps/api/event").then(({ listen, emit }) => {
      // 레이어 패널 창 / all-panels 창이 열리면 현재 상태 즉시 전송
      const pushCurrentState = () => {
        const lc = useOutputStore.getState().layerConfig;
        emit("slide:update", { layerConfig: lc }).catch(() => {});
      };
      listen<void>("layer-panel:ready", pushCurrentState).then((fn) => unlisteners.push(fn));
      listen<void>("all-panels:ready", pushCurrentState).then((fn) => unlisteners.push(fn));

      // all-panels 창에서 레이어 설정 변경
      listen<LayerConfig>("layer:change", (ev) => {
        handleLayerChange(ev.payload);
      }).then((fn) => unlisteners.push(fn));

      // 레이어 패널 창에서 가시성 토글 요청
      listen<{ layerId: string }>("layer:toggleVisible", (ev) => {
        const layerId = ev.payload.layerId;
        const lc = useOutputStore.getState().layerConfig;
        if (layerId === "subtitle") {
          handleLayerChange({ ...lc, subtitle: { ...lc.subtitle, visible: !lc.subtitle.visible } });
        } else if (layerId === "overlay") {
          handleLayerChange({ ...lc, overlay: { ...lc.overlay, visible: !lc.overlay.visible } });
        }
      }).then((fn) => unlisteners.push(fn));
    }).catch(() => {});
    return () => { unlisteners.forEach((fn) => fn()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
            lines2: !isClear ? (slide?.lines2 ?? []) : [],
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
          lines2: !isClear ? (slide?.lines2 ?? []) : [],
        },
        canvas: !isClear && canvasBlocks.length > 0 ? { textBlocks: canvasBlocks } : undefined,
      };
      setLayerConfig(withContent);
      if (isLive) ipc.sendSlideUpdate(withContent);
      ipc.sendPreviewUpdate(withContent);
      // Auto-save layer settings to the active item (debounced)
      if (layerAutoSaveTimerRef.current) clearTimeout(layerAutoSaveTimerRef.current);
      layerAutoSaveTimerRef.current = setTimeout(() => {
        layerAutoSaveTimerRef.current = null;
        const { currentService, activeItemIndex } = useQueueStore.getState();
        const itemId = currentService?.items[activeItemIndex]?.id ?? null;
        if (itemId !== null) {
          void handleSaveItemRef.current(itemId, config);
        } else {
          saveGlobalDefaults(config);
        }
      }, 600);
    },
    [isLive, isClear, setLayerConfig]
  );

  const handleRemoveTab = useCallback((tab: RightTab) => {
    setTabOrder((prev) => {
      const newOrder = prev.filter((t) => t !== tab);
      if (rightTabRef.current === tab && newOrder.length > 0) setRightTab(newOrder[0]);
      return newOrder;
    });
    setRemovedTabs((prev) => [...prev, tab]);
  }, []);

  const handleRestoreTab = useCallback((tab: string) => {
    const t = tab as RightTab;
    setRemovedTabs((prev) => prev.filter((x) => x !== t));
    setTabOrder((prev) => [...prev, t]);
    setRightTab(t);
  }, []);

  const handleLayerToggleVisible = useCallback((layerId: string) => {
    if (layerId === "subtitle") {
      handleLayerChange({ ...layerConfig, subtitle: { ...layerConfig.subtitle, visible: !layerConfig.subtitle.visible } });
    } else if (layerId === "overlay") {
      handleLayerChange({ ...layerConfig, overlay: { ...layerConfig.overlay, visible: !layerConfig.overlay.visible } });
    }
  }, [layerConfig, handleLayerChange]);

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
        subtitle: (({ visible: _v, lines: _l, lines2: _l2, ...rest }) => rest)(config.subtitle),
        overlay: { ...config.overlay },
        transitionMs: config.transitionMs,
      };
      try {
        await serviceDb.updateItemSettings(itemId, settings);
        useQueueStore.getState().updateItemSettingsJson(itemId, settings);
      } catch (err) {
        console.error("Failed to save item settings:", err);
      }
    },
    []
  );
  handleSaveItemRef.current = handleSaveItem;

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
    if (isSavingRef.current) return; // 중복 저장 방지
    const store = useQueueStore.getState();
    const svc = store.currentService;
    if (!svc) return;
    if (svc.id === -1) {
      setShowSaveModal(true);
      return;
    }
    isSavingRef.current = true;
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
      setCtrlNotice({ msg: "저장에 실패했습니다. 다시 시도해 주세요.", error: true });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 5000);
    } finally {
      isSavingRef.current = false;
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

  const handleBackupDb = useCallback(async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const destPath = await save({
        filters: [{ name: "데이터베이스", extensions: ["db"] }],
        defaultPath: "worship-backup.db",
      });
      if (!destPath) return;
      await ipc.backupDatabase(destPath);
      setCtrlNotice({ msg: "백업 완료 ✓" });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 2000);
    } catch (e) {
      console.error("[backup-db]", e);
      setCtrlNotice({ msg: "백업 실패", error: true });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 5000);
    }
  }, []);

  const handleRestoreDb = useCallback(async () => {
    try {
      const { ask, open } = await import("@tauri-apps/plugin-dialog");
      const yes = await ask("복원하면 현재 데이터가 교체됩니다. 계속하시겠습니까?", { title: "데이터베이스 복원", kind: "warning" });
      if (!yes) return;
      const srcPath = await open({ filters: [{ name: "데이터베이스", extensions: ["db"] }] });
      if (!srcPath || typeof srcPath !== "string") return;
      await ipc.restoreDatabase(srcPath);
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      console.error("[restore-db]", e);
      setCtrlNotice({ msg: "복원 실패", error: true });
      if (ctrlNoticeTimer.current) clearTimeout(ctrlNoticeTimer.current);
      ctrlNoticeTimer.current = setTimeout(() => setCtrlNotice(null), 5000);
    }
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
    setShowHelp,
    setShowOnboarding,
    setShowAbout,
    openPreviewWindow: () => { setPreviewDocked(true); setShowPanel(true); },
    setShowSettings,
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
        displays={displays}
        selectedDisplayIdx={selectedDisplayIdx}
        onSelectDisplay={(idx) => {
          setOutputDisplayId(idx);
          const d = displays[idx];
          if (d) void ipc.openOutputWindow(d.x, d.y, d.width, d.height);
        }}
        onOpenPreviewOnly={() => { setPreviewDocked(true); setShowPanel(true); ipc.sendPreviewUpdate(useOutputStore.getState().layerConfig); void ipc.openPreviewWindow(); }}
        outputScaleMode={outputScaleMode}
        onSetScaleMode={(mode) => { setOutputScaleMode(mode); void ipc.sendScaleMode(mode); }}
        outputConnected={outputConnected}
        onOpenOutput={openOutput}
        isStageOpen={isStageOpen}
        onToggleStage={handleToggleStage}
        stageMsgText={stageMsgText}
        onSetStageMsgText={setStageMsgText}
        stageMsgActive={stageMsgActive}
        onSendStageMsg={handleSendStageMsg}
        onClearStageMsg={handleClearStageMsg}
        countdownMin={countdownMin}
        onSetCountdownMin={setCountdownMin}
        countdownActive={countdownActive}
        countdownRemainingMs={countdownRemainingMs}
        onToggleCountdown={onToggleCountdown}
        onResetCountdown={onResetCountdown}
        showPanel={showPanel}
        onTogglePanel={handleTogglePanel}
        onShowCheatSheet={handleShowCheatSheet}
      />

      <div data-help-id="ribbon" className="flex-shrink-0">
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
        onNewService={handleNewService}
        onOpenService={() => setShowServiceList(true)}
        onSave={handleSave}
        onBackupDb={handleBackupDb}
        onRestoreDb={handleRestoreDb}
        onNewSlide={handleNewSlide}
        onDupSlide={handleDupSlide}
        onAddBlock={handleAddBlock}
        onAddSong={() => { setShowPanel(true); setRightTab("songs"); }}
        onAddScripture={() => { setShowPanel(true); setRightTab("queue"); window.dispatchEvent(new CustomEvent("worship:open-scripture-tab")); }}
        onInsertImage={handleInsertImage}
        onInsertVideo={handleInsertVideo}
        soundName={soundName}
        soundPlaying={soundPlaying}
        onToggleSound={handleToggleSound}
        onInsertSound={handleInsertSound}
        onOpenDesignPanel={handleOpenDesignPanel}
        onShowAbout={() => setShowAbout(true)}
        onOpenPreview={() => { setPreviewDocked(true); setShowPanel(true); }}
        looks={looks}
        currentLookId={currentLookId}
        onApplyLook={handleApplyLook}
        removedPanels={removedTabs}
        panelLabels={{ queue: "순서", songs: "찬양", settings: "디자인", alert: "공지", looks: "룩", remote: "원격", ndi: "NDI", announcement: "공지루프" }}
        onRestorePanel={handleRestoreTab}
      />
      </div>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Slides panel (PPT style) */}
        <div
          data-help-id="slide-list"
          className="flex-shrink-0 border-r border-zinc-700 overflow-hidden bg-[#252526] relative"
          style={{ width: leftPanelWidth }}
        >
          <SlideThumbnailList onOpenDesignPanel={() => { setShowPanel(true); setRightTab("settings"); }} />
          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors z-10"
            onMouseDown={(e) => {
              e.preventDefault();
              leftResizeRef.current = { startX: e.clientX, startW: leftPanelWidth };
              const onMove = (ev: MouseEvent) => {
                if (!leftResizeRef.current) return;
                const newW = Math.max(140, Math.min(400, leftResizeRef.current.startW + ev.clientX - leftResizeRef.current.startX));
                setLeftPanelWidth(newW);
              };
              const onUp = () => {
                leftResizeRef.current = null;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          />
        </div>

        {/* Center: Canvas with PPT-style rulers */}
        <div data-help-id="canvas" className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#1e1e1e]">
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

        {/* Right: snap hint overlay when dragging layer panel near edge */}
        {layerPanelSnapHint && (
          <div className="fixed right-0 top-0 bottom-0 w-16 bg-blue-500/20 border-l-2 border-blue-500 z-50 pointer-events-none flex items-center justify-center">
            <span className="text-blue-400 text-xs rotate-90 whitespace-nowrap">레이어 도킹</span>
          </div>
        )}

        {/* Right: Pane (PPT Format pane) */}
        {showPanel && (
          <div
            data-help-id="right-panel"
            className="w-64 flex-shrink-0 flex flex-col overflow-hidden bg-[#252526] border-l border-zinc-700"
          >
            {/* ── 출력 미리보기 (항상 도킹 — 탭 패널과 독립) ── */}
            {previewDocked ? (
              <div className="flex-shrink-0 border-b border-zinc-700 bg-zinc-900 p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[0.625rem] text-zinc-500 uppercase tracking-wider font-medium">출력 미리보기</span>
                  <button
                    onClick={handleUndockPreview}
                    title="미리보기 분리"
                    className="text-zinc-600 hover:text-zinc-200 text-xs px-1 rounded hover:bg-zinc-700"
                  >↗</button>
                </div>
                <OutputPreview layerConfig={layerConfig} isBlackout={isBlackout} isLive={isLive} />
              </div>
            ) : (
              <div className="flex-shrink-0 border-b border-zinc-700 bg-zinc-900 p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[0.625rem] text-zinc-500 uppercase tracking-wider font-medium">출력 미리보기</span>
                </div>
                <div
                  style={{ width: 232, height: 130 }}
                  className="rounded bg-black border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-600 select-none"
                >
                  <span className="text-xs">↗ 창모드로 출력 중</span>
                </div>
              </div>
            )}
            {/* ── 탭 패널 (독립 분리 가능) ── */}
            <div
              className="flex-1 flex flex-col overflow-hidden min-h-0"
            >
            {panelFloating ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-600 select-none">
                <span className="text-xs">패널 분리됨</span>
                <button onClick={() => setPanelFloating(false)} className="text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-700 px-2 py-0.5 rounded border border-zinc-700">⊟ 도킹</button>
              </div>
            ) : (() => {
              const TAB_LABELS: Record<RightTab, string> = { queue: "순서", songs: "찬양", settings: "디자인", alert: "공지", looks: "룩", remote: "원격", ndi: "NDI", announcement: "공지루프", video: "동영상" };
              return (
                <div
                  ref={tabBarRef}
                  className="flex border-b border-zinc-700 flex-shrink-0 items-stretch select-none overflow-x-auto"
                  onDragOver={(e) => e.preventDefault()}
                >
                  {tabOrder.map((tab) => {
                    const isTabFloating = openedWindows.has(tab);
                    const isDragOver = dragOverTab === tab && draggingTab !== tab;
                    return (
                      <div
                        key={tab}
                        className={`relative flex-1 flex items-stretch min-w-0 group ${isDragOver ? "border-l-2 border-blue-400" : ""}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverTab(tab); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggingTab && draggingTab !== tab) {
                            dragDroppedRef.current = true;
                            setTabOrder((prev) => {
                              const next = [...prev];
                              const fi = next.indexOf(draggingTab);
                              const ti = next.indexOf(tab);
                              next.splice(fi, 1);
                              next.splice(ti, 0, draggingTab);
                              return next;
                            });
                          }
                          setDraggingTab(null);
                          setDragOverTab(null);
                        }}
                      >
                        <button
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); dragDroppedRef.current = false; isHtml5DraggingRef.current = true; setDraggingTab(tab); }}
                          onDragEnd={(e) => {
                            // mouseup may fire after dragend on some platforms; keep flag set briefly
                            setTimeout(() => { isHtml5DraggingRef.current = false; }, 80);
                            if (!dragDroppedRef.current && tabBarRef.current) {
                              const rect = tabBarRef.current.getBoundingClientRect();
                              if (e.clientY < rect.top - 40 || e.clientY > rect.bottom + 40 || e.clientX < rect.left - 80 || e.clientX > rect.right + 80) {
                                void openTabAsWindow(tab, e.screenX, e.screenY);
                              }
                            }
                            dragDroppedRef.current = false;
                            setDraggingTab(null);
                            setDragOverTab(null);
                          }}
                          onMouseDown={(e) => { e.stopPropagation(); handleTabMouseDown(e, tab); }}
                          className={`flex-1 py-1 text-[0.625rem] font-medium transition-colors whitespace-nowrap overflow-hidden ${draggingTab === tab ? "opacity-40" : ""} ${
                            isTabFloating
                              ? "text-blue-400 border-b-2 border-blue-400 border-dashed bg-zinc-800/50"
                              : rightTab === tab
                              ? "text-white border-b-2 border-blue-500 bg-zinc-700"
                              : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                          }`}
                        >
                          {TAB_LABELS[tab]}{isTabFloating ? "↗" : ""}
                        </button>
                        {/* × 제거 버튼 */}
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); handleRemoveTab(tab); }}
                          title="탭 제거"
                          className="absolute right-0.5 top-0.5 w-3.5 h-3.5 flex items-center justify-center text-[9px] text-zinc-600 hover:text-white hover:bg-zinc-600 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        >×</button>
                      </div>
                    );
                  })}
                  {/* 현재 탭 새 창으로 분리 */}
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleUndock}
                    title="현재 탭 새 창으로 분리"
                    className="px-1.5 text-zinc-500 hover:text-white hover:bg-zinc-700 border-l border-zinc-700 flex-shrink-0 text-xs"
                  >↗</button>
                </div>
              );
            })()}
            {!panelFloating && (
              <div className="flex-1 overflow-hidden">
                {openedWindows.has(rightTab) ? (
                  <div className="h-full flex items-center justify-center text-zinc-600 text-xs select-none">
                    분리된 패널 — 탭을 클릭해 도킹
                  </div>
                ) : (
                  <>
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
                    {rightTab === "alert" && <AlertPanel />}
                    {rightTab === "looks" && (
                      <LooksPanel
                        currentLookId={currentLookId}
                        onApplyLook={handleApplyLook}
                        onLooksChanged={() => { looksDb.list().then(setLooks).catch((e) => console.error(e)); }}
                        layerConfig={layerConfig}
                      />
                    )}
                    {rightTab === "remote" && <RemotePanel />}
                    {rightTab === "ndi" && <NdiPanel />}
                    {rightTab === "announcement" && <AnnouncementPanel />}
                    {rightTab === "video" && (
                      <VideoPanel layerConfig={layerConfig} onChange={handleLayerChange} />
                    )}
                  </>
                )}
              </div>
            )}
            </div>{/* ── 탭 패널 내부 래퍼 닫기 ── */}

            {/* ── 레이어 패널 리사이저 (도킹 상태에서만) ───────────── */}
            {!layerPanelFloating && (
              <div
                onMouseDown={handleLayerResizerMouseDown}
                className="h-[5px] flex-shrink-0 cursor-row-resize bg-zinc-700 hover:bg-blue-500/60 active:bg-blue-500 transition-colors flex items-center justify-center group"
                title="드래그로 높이 조절"
              >
                <div className="w-8 h-px bg-zinc-500 group-hover:bg-blue-300 rounded transition-colors" />
              </div>
            )}

            {/* ── 레이어 패널 */}
            {layerPanelFloating ? (
              /* OS 창으로 분리됨 — 사이드바에 플레이스홀더 표시 */
              <div className="border-t border-zinc-700 flex items-center justify-between px-2 py-1.5 bg-zinc-800/40 flex-shrink-0">
                <span className="text-[10px] text-zinc-600">레이어 패널 (분리됨)</span>
                <button
                  onClick={() => setLayerPanelFloating(false)}
                  className="text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-700 px-1.5 py-0.5 rounded"
                  title="도킹"
                >⊟ 도킹</button>
              </div>
            ) : (
              <div style={{ height: layerPanelHeight, flexShrink: 0 }} className="border-t border-zinc-700 overflow-hidden">
                <SidebarLayerPanel
                  layerConfig={layerConfig}
                  activeLayerId={activeLayerId}
                  isFloating={false}
                  onFloat={async () => {
                    setLayerPanelFloating(true);
                    try {
                      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
                      const win = new WebviewWindow("layer-panel", {
                        url: `${window.location.origin}/layer-panel`,
                        title: "레이어",
                        width: 260,
                        height: 340,
                        decorations: true,
                        alwaysOnTop: true,
                      });
                      win.once("tauri://destroyed", () => setLayerPanelFloating(false));
                    } catch {
                      setLayerPanelFloating(false);
                    }
                  }}
                  onDock={() => setLayerPanelFloating(false)}
                  onDragHandleMouseDown={() => {}}
                  onSelectLayer={(id) => {
                    setActiveLayerId(id);
                    setRightTab("settings");
                    if (id.startsWith("canvas:")) {
                      canvasRef.current?.selectBlock(id.slice("canvas:".length));
                    } else if (id === "subtitle") {
                      const slide = useQueueStore.getState().getActiveLyricSlide();
                      if (slide) canvasRef.current?.selectBlock(`${slide.id}-lyric`);
                    }
                  }}
                  onToggleVisible={handleLayerToggleVisible}
                />
              </div>
            )}
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

        <div className="w-px h-4 bg-zinc-700" />

        {/* UI 가이드 */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowPanel(true); setShowHelp(true); }}
          className="w-5 h-5 rounded-full border border-zinc-600 text-zinc-500 hover:text-zinc-200 hover:border-zinc-400 flex items-center justify-center text-[11px] font-bold transition-colors"
          title="UI 가이드 보기"
        >
          ?
        </button>
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
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showTemplateModal && (
        <TemplateModal
          onCreateService={(svc) => { handleLoadService(svc); setShowTemplateModal(false); }}
          onClose={() => setShowTemplateModal(false)}
        />
      )}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      {showOnboarding && <OnboardingGuide onComplete={() => setShowOnboarding(false)} />}
      <ErrorToast />

    </ErrorBoundary>
  );
}
