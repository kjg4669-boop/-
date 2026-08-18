import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { VideoPhase } from "@/lib/types";

function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

interface VideoState {
  phases: VideoPhase[];
  /** slideId → phaseId */
  slidePhaseMap: Record<string, string>;
  selectedPhaseId: string | null;
  addPhase: () => void;
  removePhase: (id: string) => void;
  updatePhase: (id: string, patch: Partial<Pick<VideoPhase, "name" | "background">>) => void;
  selectPhase: (id: string | null) => void;
  assignSlidePhase: (slideId: string, phaseId: string) => void;
  unassignSlidePhase: (slideId: string) => void;
  getPhaseForSlide: (slideId: string) => VideoPhase | null;
}

const INIT_ID = "phase-default";

export const useVideoStore = create<VideoState>()(
  persist(
    (set, get) => ({
      phases: [{
        id: INIT_ID,
        name: "페이즈 1",
        background: { type: "color", color: "#000000", loop: true, opacity: 1 },
      }],
      slidePhaseMap: {},
      selectedPhaseId: INIT_ID,

      addPhase: () => {
        const id = genId();
        const n = get().phases.length + 1;
        set((s) => ({
          phases: [...s.phases, {
            id,
            name: `페이즈 ${n}`,
            background: { type: "color", color: "#000000", loop: true, opacity: 1 },
          }],
          selectedPhaseId: id,
        }));
      },

      removePhase: (id) => set((s) => {
        const phases = s.phases.filter((p) => p.id !== id);
        const selectedPhaseId = s.selectedPhaseId === id ? (phases[0]?.id ?? null) : s.selectedPhaseId;
        const slidePhaseMap = { ...s.slidePhaseMap };
        for (const [k, v] of Object.entries(slidePhaseMap)) {
          if (v === id) delete slidePhaseMap[k];
        }
        return { phases, selectedPhaseId, slidePhaseMap };
      }),

      updatePhase: (id, patch) => set((s) => ({
        phases: s.phases.map((p) => p.id === id ? { ...p, ...patch } : p),
      })),

      selectPhase: (id) => set({ selectedPhaseId: id }),

      assignSlidePhase: (slideId, phaseId) => set((s) => ({
        slidePhaseMap: { ...s.slidePhaseMap, [slideId]: phaseId },
      })),

      unassignSlidePhase: (slideId) => set((s) => {
        const m = { ...s.slidePhaseMap };
        delete m[slideId];
        return { slidePhaseMap: m };
      }),

      getPhaseForSlide: (slideId) => {
        const { phases, slidePhaseMap } = get();
        const phaseId = slidePhaseMap[slideId];
        if (!phaseId) return null;
        return phases.find((p) => p.id === phaseId) ?? null;
      },
    }),
    { name: "worship-video-phases" }
  )
);
