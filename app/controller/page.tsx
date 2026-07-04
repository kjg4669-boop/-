"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import SlideThumbnailList from "@/components/controller/SlideThumbnailList";
import SlideCanvas, { type SlideCanvasHandle } from "@/components/controller/SlideCanvas";
import QueuePanel from "@/components/controller/QueuePanel";
import LibraryPanel from "@/components/controller/LibraryPanel";
import LayerSidebar from "@/components/controller/LayerSidebar";
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { serviceDb, songDb } from "@/lib/db";
import { ipc } from "@/lib/ipc";
import {
  DEFAULT_LAYER_CONFIG,
  type LayerConfig,
  type TextBlock,
  type LyricSlide,
  type FlatSlide,
  type Service,
} from "@/lib/types";
import { deepMerge, loadGlobalDefaults, saveGlobalDefaults, newSlideId } from "@/lib/utils";
import { FONT_OPTIONS } from "@/lib/constants";
import ErrorBoundary from "@/components/ErrorBoundary";
import ServiceListModal from "@/components/controller/ServiceListModal";
import SaveServiceModal from "@/components/controller/SaveServiceModal";

type RightTab = "queue" | "songs" | "settings";

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
  const [isClear, setIsClear] = useState(false);
  const isClearRef = useRef(false);
  useEffect(() => { isClearRef.current = isClear; }, [isClear]);
  const [isLoop, setIsLoop] = useState(false);
  const [alertInput, setAlertInput] = useState("");
  const [alertActive, setAlertActive] = useState(false);
  const [clock, setClock] = useState("");
  const [showPanel, setShowPanel] = useState(true);
  const [zoom, setZoom] = useState(85);
  const [rightTab, setRightTab] = useState<RightTab>("queue");
  const [ribbonTab, setRibbonTab] = useState<"home" | "insert">("home");
  const [selectedBlock, setSelectedBlock] = useState<TextBlock | null>(null);
  const [fmtPainterOn, setFmtPainterOn] = useState(false);
  const canvasRef = useRef<SlideCanvasHandle>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openOutputRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundName, setSoundName] = useState<string | null>(null);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const pendingAddBlockRef = useRef(false);
  const [showServiceList, setShowServiceList] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  // Live clock
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    setClock(fmt());
    const id = setInterval(() => setClock(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  const { outputDisplayId, setOutputDisplayId } = useSettingsStore();
  const [displays, setDisplays] = useState<Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>>([]);
  const selectedDisplayIdx = outputDisplayId >= 0 ? outputDisplayId : 0;

  useEffect(() => {
    ipc.getDisplays().then((result) => {
      const list = result as Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>;
      if (list && list.length > 0) {
        setDisplays(list);
        if (outputDisplayId < 0 && list.length > 1) setOutputDisplayId(1);
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
    let unlisten: (() => void) | null = null;
    ipc.onOutputReady(() => {
      const { layerConfig: lc, isBlackout: bo, alertText: at, alertVisible: av } = useOutputStore.getState();
      const cleared = isClearRef.current;
      const toSend: LayerConfig = cleared
        ? { ...lc, subtitle: { ...lc.subtitle, visible: false, lines: [] }, canvas: undefined }
        : lc;
      ipc.sendSlideUpdate(toSend);
      ipc.sendBlackout(bo);
      ipc.sendAlert(at, av);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
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
    ipc.sendSlideUpdate(newConfig);
  }, [activeItemIndex, activeLyricSlideIndex, currentService?.id, isLive, isClear, setLayerConfig]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          nextLyricSlide();
          break;
        case "ArrowRight":
          nextLyricSlide();
          break;
        case "ArrowLeft":
          prevLyricSlide();
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
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try { await songDb.update(songId, { lyrics_json: lyricsSnapshot }); } catch (err) {
          console.error("Failed to save canvas:", err);
        }
      }, 600);
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
      if (updated) useQueueStore.getState().setCurrentService(updated);
    } catch (e) { console.error(e); }
  }

  async function handleInsertImage() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
      });
      if (!selected || typeof selected !== "string") return;
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const src = convertFileSrc(selected);
      handleLayerChange({ ...layerConfig, background: { ...layerConfig.background, type: "image", src, opacity: 1 } });
    } catch (e) { console.error("[handleInsertImage]", e); }
  }

  async function handleInsertVideo() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "비디오", extensions: ["mp4", "mov", "avi", "webm", "mkv"] }],
      });
      if (!selected || typeof selected !== "string") return;
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const src = convertFileSrc(selected);
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
      store.setIsDirty(false);
    } catch (e) {
      console.error("[save]", e);
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
      store.updateCurrentServiceMeta({ id: newId, name, date });
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
        ]);
      } catch (e) { console.error("[menu setup]", e); }
    }
    setup();
    return () => { unlistens.forEach((fn) => fn()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slides = useMemo(() => getFlatSlideList(), [currentService]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flatIdx = useMemo(() => getActiveFlatSlideIndex(), [currentService, activeItemIndex, activeLyricSlideIndex]);

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
        <span className="text-zinc-400 truncate max-w-[140px]">
          {currentService?.name ?? "예배 없음"}{isDirty ? " *" : ""}
        </span>
        <div className="flex-1" />

        <button onClick={() => setIsLive((v) => !v)}
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
          📺 출력창
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
        {["디자인", "전환", "애니메이션", "슬라이드 쇼", "검토", "보기"].map((t) => (
          <span key={t} className="px-3 h-full flex items-center text-zinc-600 text-xs">{t}</span>
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
            <div className="flex-1 flex items-center justify-center overflow-auto relative">
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
        <button onClick={isLoop ? undefined : prevLyricSlide} disabled={flatIdx <= 0 || isLoop}
          className="px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 text-zinc-400">←</button>
        <button onClick={isLoop ? undefined : nextLyricSlide} disabled={flatIdx >= slides.length - 1 || isLoop}
          className="px-1.5 py-0.5 rounded hover:bg-zinc-700 disabled:opacity-30 text-zinc-400">→</button>

        <div className="w-px h-4 bg-zinc-700" />

        {/* 모니터 선택 */}
        {displays.length > 1 && (
          <select value={selectedDisplayIdx} onChange={(e) => setOutputDisplayId(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0 text-zinc-400 outline-none">
            {displays.map((d, i) => (
              <option key={d.id} value={i}>{d.name || `모니터 ${i + 1}`}</option>
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
        />
      )}
      {showSaveModal && (
        <SaveServiceModal
          initialName={currentService?.name !== "새 예배" ? (currentService?.name ?? "") : ""}
          onSave={handleSaveAs}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </ErrorBoundary>
  );
}
