import { create } from "zustand";
import type { Service, ServiceItem, ServiceItemSettings, Song, LyricSlide, ScriptureSlide } from "@/lib/types";
import { getSlidesInOrder } from "@/lib/utils";

// Module-level cache: invalidates automatically when currentService reference changes (Zustand immutable updates)
let _flatListCache: { serviceRef: import("@/lib/types").Service | null; list: import("@/lib/types").FlatSlide[] } = { serviceRef: null, list: [] };

function getScriptureSlides(item: ServiceItem): ScriptureSlide[] {
  return item.settings_json.scripture?.slides ?? [];
}

function getItemSlideCount(item: ServiceItem): number {
  if (item.song) return getSlidesInOrder(item.song).length;
  const ss = getScriptureSlides(item);
  return ss.length > 0 ? ss.length : 1;
}

interface HistoryEntry {
  items: ServiceItem[];
  activeItemIndex: number;
}

const MAX_HISTORY = 50;

interface QueueState {
  currentService: Service | null;
  activeItemIndex: number;
  activeLyricSlideIndex: number;
  isDirty: boolean;
  setCurrentService: (service: Service | null) => void;
  setIsDirty: (v: boolean) => void;
  updateCurrentServiceMeta: (updates: Partial<Pick<Service, "id" | "name" | "date">>) => void;
  setActiveItem: (index: number) => void;
  nextLyricSlide: () => void;
  prevLyricSlide: () => void;
  updateServiceItems: (items: ServiceItem[]) => void;
  updateItemSettingsJson: (itemId: number, settings: ServiceItemSettings) => void;
  reorderItemsAndActive: (items: ServiceItem[], newActiveIndex: number) => void;
  updateCurrentServiceNotes: (notes: string) => void;
  updateItemNotesInStore: (itemId: number, notes: string) => void;
  notesVersion: number;
  updateServiceData: (service: Service) => void;
  hiddenSlideKeys: Set<string>;
  toggleHiddenSlide: (key: string) => void;

  // Undo/Redo
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  pushHistory: () => void;
  popUndo: () => HistoryEntry | null;
  popRedo: () => HistoryEntry | null;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Computed helpers
  getActiveItem: () => ServiceItem | null;
  getActiveSong: () => Song | null;
  getActiveLyricSlide: () => LyricSlide | null;
  getTotalLyricSlides: () => number;
  getFlatSlideList: () => import("@/lib/types").FlatSlide[];
  getActiveFlatSlideIndex: () => number;
  setActiveFlatSlide: (flatIndex: number) => void;
  updateSlideCanvas: (
    songId: number,
    slideId: string,
    canvas: import("@/lib/types").LyricSlide["canvas"]
  ) => void;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  currentService: null,
  activeItemIndex: -1,
  activeLyricSlideIndex: 0,
  isDirty: false,
  hiddenSlideKeys: new Set<string>(),
  undoStack: [],
  redoStack: [],
  notesVersion: 0,

  setCurrentService: (service) => set({ currentService: service, activeItemIndex: -1, activeLyricSlideIndex: 0, isDirty: false, hiddenSlideKeys: new Set(), undoStack: [], redoStack: [] }),

  pushHistory: () => {
    const { currentService, activeItemIndex, undoStack } = get();
    if (!currentService) return;
    const entry: HistoryEntry = { items: structuredClone(currentService.items), activeItemIndex };
    const next = [...undoStack, entry];
    if (next.length > MAX_HISTORY) next.shift();
    set({ undoStack: next, redoStack: [] });
  },

  popUndo: () => {
    const { undoStack, currentService, activeItemIndex, redoStack } = get();
    if (undoStack.length === 0 || !currentService) return null;
    const snapshot = undoStack[undoStack.length - 1];
    const currentEntry: HistoryEntry = { items: structuredClone(currentService.items), activeItemIndex };
    set({ undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, currentEntry] });
    return snapshot;
  },

  popRedo: () => {
    const { redoStack, currentService, activeItemIndex, undoStack } = get();
    if (redoStack.length === 0 || !currentService) return null;
    const snapshot = redoStack[redoStack.length - 1];
    const currentEntry: HistoryEntry = { items: structuredClone(currentService.items), activeItemIndex };
    set({ redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, currentEntry] });
    return snapshot;
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  toggleHiddenSlide: (key) => {
    const prev = get().hiddenSlideKeys;
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    set({ hiddenSlideKeys: next });
  },

  setIsDirty: (v) => set({ isDirty: v }),

  updateCurrentServiceMeta: (updates) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, ...updates } });
    }
  },

  setActiveItem: (index) => set({ activeItemIndex: index, activeLyricSlideIndex: 0 }),

  nextLyricSlide: () => {
    const state = get();
    const flatList = state.getFlatSlideList();
    const currentFlat = state.getActiveFlatSlideIndex();
    for (let i = currentFlat + 1; i < flatList.length; i++) {
      const entry = flatList[i];
      const key = `${entry.serviceItemIndex}-${entry.songId}-${entry.slideIndex}`;
      if (!state.hiddenSlideKeys.has(key)) {
        set({ activeItemIndex: entry.serviceItemIndex, activeLyricSlideIndex: entry.slideIndex });
        return;
      }
    }
  },

  prevLyricSlide: () => {
    const state = get();
    const flatList = state.getFlatSlideList();
    const currentFlat = state.getActiveFlatSlideIndex();
    for (let i = currentFlat - 1; i >= 0; i--) {
      const entry = flatList[i];
      const key = `${entry.serviceItemIndex}-${entry.songId}-${entry.slideIndex}`;
      if (!state.hiddenSlideKeys.has(key)) {
        set({ activeItemIndex: entry.serviceItemIndex, activeLyricSlideIndex: entry.slideIndex });
        return;
      }
    }
  },

  updateServiceItems: (items) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, items }, isDirty: true });
    }
  },

  // Update a single item's settings_json without marking the service dirty
  // (design settings are persisted directly to DB — no file-level save needed)
  updateItemSettingsJson: (itemId, settings) => {
    const { currentService } = get();
    if (!currentService) return;
    const items: ServiceItem[] = currentService.items.map((it) =>
      it.id === itemId ? { ...it, settings_json: settings } : it
    );
    set({ currentService: { ...currentService, items } });
  },

  reorderItemsAndActive: (items, newActiveIndex) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, items }, isDirty: true, activeItemIndex: newActiveIndex });
    }
  },

  updateItemNotesInStore: (itemId, notes) => {
    const { currentService, notesVersion } = get();
    if (!currentService) return;
    set({
      currentService: {
        ...currentService,
        items: currentService.items.map((it) => it.id === itemId ? { ...it, notes } : it),
      },
      notesVersion: notesVersion + 1,
    });
  },

  updateCurrentServiceNotes: (notes) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, notes }, isDirty: true });
    }
  },

  // Update service data (after DB reload) without resetting activeItemIndex/activeLyricSlideIndex
  updateServiceData: (service) => {
    set({ currentService: service, isDirty: false });
  },

  getActiveItem: () => {
    const { currentService, activeItemIndex } = get();
    return currentService?.items[activeItemIndex] ?? null;
  },

  getActiveSong: () => {
    const item = get().getActiveItem();
    return item?.song ?? null;
  },

  getActiveLyricSlide: () => {
    const { activeItemIndex, activeLyricSlideIndex, currentService } = get();
    const item = currentService?.items[activeItemIndex] ?? null;
    if (!item) return null;
    if (item.song) return getSlidesInOrder(item.song)[activeLyricSlideIndex] ?? null;
    const ss = getScriptureSlides(item);
    if (ss.length > 0) {
      const s = ss[activeLyricSlideIndex];
      if (!s) return null;
      return { id: `scripture-${activeLyricSlideIndex}`, section: "verse" as const, sectionIndex: activeLyricSlideIndex + 1, lines: s.lines };
    }
    return null;
  },

  getTotalLyricSlides: () => {
    const item = get().getActiveItem();
    return item ? getItemSlideCount(item) : 1;
  },

  getFlatSlideList: () => {
    const { currentService } = get();
    if (_flatListCache.serviceRef === currentService) return _flatListCache.list;
    if (!currentService) { _flatListCache = { serviceRef: null, list: [] }; return []; }
    const result: import("@/lib/types").FlatSlide[] = [];
    currentService.items.forEach((item, serviceItemIndex) => {
      if (item.song) {
        getSlidesInOrder(item.song).forEach((slide, slideIndex) => {
          result.push({ slide, songId: item.song!.id, songTitle: item.song!.title, serviceItemIndex, slideIndex });
        });
        return;
      }
      const ss = getScriptureSlides(item);
      if (ss.length > 0) {
        ss.forEach((s, slideIndex) => {
          result.push({
            slide: { id: `scripture-${item.id}-${slideIndex}`, section: "verse" as const, sectionIndex: slideIndex + 1, lines: s.lines },
            songId: -(item.id),
            songTitle: item.label || "성경",
            serviceItemIndex,
            slideIndex,
          });
        });
        return;
      }
      // Non-song item (announcement, blank, etc.)
      result.push({
        slide: { id: `nonsong-${item.id}`, section: "verse" as const, sectionIndex: 1, lines: [item.label || item.type] },
        songId: -(item.id),
        songTitle: item.label || item.type,
        serviceItemIndex,
        slideIndex: 0,
      });
    });
    _flatListCache = { serviceRef: currentService, list: result };
    return result;
  },

  getActiveFlatSlideIndex: () => {
    const { currentService, activeItemIndex, activeLyricSlideIndex } = get();
    if (!currentService || activeItemIndex < 0) return -1;
    let flatIdx = 0;
    for (let i = 0; i < currentService.items.length; i++) {
      if (i === activeItemIndex) return flatIdx + activeLyricSlideIndex;
      flatIdx += getItemSlideCount(currentService.items[i]);
    }
    return -1;
  },

  setActiveFlatSlide: (flatIndex: number) => {
    const list = get().getFlatSlideList();
    const entry = list[flatIndex];
    if (!entry) return;
    set({ activeItemIndex: entry.serviceItemIndex, activeLyricSlideIndex: entry.slideIndex });
  },

  updateSlideCanvas: (songId, slideId, canvas) => {
    const { currentService } = get();
    if (!currentService) return;
    const newItems = currentService.items.map((item) => {
      if (!item.song || item.song.id !== songId) return item;
      const newSlides = item.song.lyrics_json.map((s) =>
        s.id === slideId ? { ...s, canvas } : s
      );
      return { ...item, song: { ...item.song, lyrics_json: newSlides } };
    });
    set({ currentService: { ...currentService, items: newItems }, isDirty: true });
  },
}));
