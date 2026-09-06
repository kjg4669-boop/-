import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OutputScaleMode = "fit" | "fill" | "native";
export type VideoFit = "cover" | "contain";
export type FpsLimit = 30 | 60;

interface SettingsState {
  outputDisplayId: number;
  setOutputDisplayId: (id: number) => void;
  currentLookId: number | null;
  setCurrentLookId: (id: number | null) => void;
  outputScaleMode: OutputScaleMode;
  setOutputScaleMode: (mode: OutputScaleMode) => void;
  /** UI font size scale factor (0.85 – 1.3). Applied to html root. */
  uiFontScale: number;
  setUiFontScale: (scale: number) => void;
  /** Video/camera background objectFit mode */
  videoFit: VideoFit;
  setVideoFit: (fit: VideoFit) => void;
  /** FPS limit for output rendering (30 or 60) */
  fpsLimit: FpsLimit;
  setFpsLimit: (fps: FpsLimit) => void;
  /** Horizontally flip camera output */
  cameraMirror: boolean;
  setCameraMirror: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      outputDisplayId: -1,
      setOutputDisplayId: (id) => set({ outputDisplayId: id }),
      currentLookId: null,
      setCurrentLookId: (id) => set({ currentLookId: id }),
      outputScaleMode: "fit",
      setOutputScaleMode: (mode) => set({ outputScaleMode: mode }),
      uiFontScale: 1.0,
      setUiFontScale: (scale) => set({ uiFontScale: scale }),
      videoFit: "cover",
      setVideoFit: (fit) => set({ videoFit: fit }),
      fpsLimit: 60,
      setFpsLimit: (fps) => set({ fpsLimit: fps }),
      cameraMirror: false,
      setCameraMirror: (v) => set({ cameraMirror: v }),
    }),
    { name: "worship-projector-settings" }
  )
);
