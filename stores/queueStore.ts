import { create } from "zustand";
import type { Service, ServiceItem, Song, LyricSlide, ScriptureSlide, ServiceItemSettings } from "@/lib/types";

function getScriptureSlides(item: ServiceItem): ScriptureSlide[] {
  const settings = item.settings_json as ServiceItemSettings;
  return settings.scripture?.slides ?? [];
}

function getItemSlideCount(item: ServiceItem): number {
  if (item.song) return item.song.lyrics_json.length;
  const ss = getScriptureSlides(item);
  return ss.length > 0 ? ss.length : 1;
}

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

  setCurrentService: (service) => set({ currentService: service, activeItemIndex: -1, activeLyricSlideIndex: 0, isDirty: false }),

  setIsDirty: (v) => set({ isDirty: v }),

  updateCurrentServiceMeta: (updates) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, ...updates }, isDirty: false });
    }
  },

  setActiveItem: (index) => set({ activeItemIndex: index, activeLyricSlideIndex: 0 }),

  nextLyricSlide: () => {
    const { activeLyricSlideIndex, getTotalLyricSlides, currentService, activeItemIndex } = get();
    const total = getTotalLyricSlides();
    if (activeLyricSlideIndex < total - 1) {
      set({ activeLyricSlideIndex: activeLyricSlideIndex + 1 });
    } else {
      // Auto-advance to next item
      const nextIndex = activeItemIndex + 1;
      if (currentService && nextIndex < currentService.items.length) {
        set({ activeItemIndex: nextIndex, activeLyricSlideIndex: 0 });
      }
    }
  },

  prevLyricSlide: () => {
    const { activeLyricSlideIndex, activeItemIndex, currentService } = get();
    if (activeLyricSlideIndex > 0) {
      set({ activeLyricSlideIndex: activeLyricSlideIndex - 1 });
    } else if (activeItemIndex > 0) {
      const prevIndex = activeItemIndex - 1;
      const prevItem = currentService?.items[prevIndex];
      const prevSlideCount = prevItem ? getItemSlideCount(prevItem) : 1;
      set({
        activeItemIndex: prevIndex,
        activeLyricSlideIndex: Math.max(0, prevSlideCount - 1),
      });
    }
  },

  updateServiceItems: (items) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, items }, isDirty: true });
    }
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
    if (item.song) return item.song.lyrics_json[activeLyricSlideIndex] ?? null;
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
    if (!currentService) return [];
    const result: import("@/lib/types").FlatSlide[] = [];
    currentService.items.forEach((item, serviceItemIndex) => {
      if (item.song) {
        item.song.lyrics_json.forEach((slide, slideIndex) => {
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
    set({ currentService: { ...currentService, items: newItems } });
  },
}));
