import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OutputScaleMode = "fit" | "fill" | "native";

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
    }),
    { name: "worship-projector-settings" }
  )
);
