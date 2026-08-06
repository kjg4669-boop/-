import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  outputDisplayId: number;
  setOutputDisplayId: (id: number) => void;
  currentLookId: number | null;
  setCurrentLookId: (id: number | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      outputDisplayId: -1,
      setOutputDisplayId: (id) => set({ outputDisplayId: id }),
      currentLookId: null,
      setCurrentLookId: (id) => set({ currentLookId: id }),
    }),
    { name: "worship-projector-settings" }
  )
);
