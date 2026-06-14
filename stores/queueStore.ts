import { create } from "zustand";
import type { Service, ServiceItem, Song, LyricSlide } from "@/lib/types";

interface QueueState {
  currentService: Service | null;
  activeItemIndex: number;
  activeLyricSlideIndex: number;
  setCurrentService: (service: Service | null) => void;
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

  setCurrentService: (service) => set({ currentService: service, activeItemIndex: -1, activeLyricSlideIndex: 0 }),

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
      const prevSlideCount = prevItem?.song?.lyrics_json.length ?? 1;
      set({
        activeItemIndex: prevIndex,
        activeLyricSlideIndex: Math.max(0, prevSlideCount - 1),
      });
    }
  },

  updateServiceItems: (items) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, items } });
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
    const song = get().getActiveSong();
    const { activeLyricSlideIndex } = get();
    return song?.lyrics_json[activeLyricSlideIndex] ?? null;
  },

  getTotalLyricSlides: () => {
    const song = get().getActiveSong();
    return song?.lyrics_json.length ?? 0;
  },

  getFlatSlideList: () => {
    const { currentService } = get();
    if (!currentService) return [];
    const result: import("@/lib/types").FlatSlide[] = [];
    currentService.items.forEach((item, serviceItemIndex) => {
      if (item.song) {
        item.song.lyrics_json.forEach((slide, slideIndex) => {
          result.push({
            slide,
            songId: item.song!.id,
            songTitle: item.song!.title,
            serviceItemIndex,
            slideIndex,
          });
        });
      } else {
        // Non-song item (announcement, blank, etc.) — synthetic single slide
        result.push({
          slide: {
            id: `nonsong-${item.id}`,
            section: "verse" as const,
            sectionIndex: 1,
            lines: [item.label || item.type],
          },
          songId: -(item.id),           // negative = non-song marker
          songTitle: item.label || item.type,
          serviceItemIndex,
          slideIndex: 0,
        });
      }
    });
    return result;
  },

  getActiveFlatSlideIndex: () => {
    const { currentService, activeItemIndex, activeLyricSlideIndex } = get();
    if (!currentService || activeItemIndex < 0) return -1;
    let flatIdx = 0;
    for (let i = 0; i < currentService.items.length; i++) {
      const slides = currentService.items[i].song?.lyrics_json ?? [];
      if (i === activeItemIndex) return flatIdx + activeLyricSlideIndex;
      flatIdx += slides.length;
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
