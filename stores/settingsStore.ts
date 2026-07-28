import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  outputDisplayId: number;
  setOutputDisplayId: (id: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      outputDisplayId: -1,
      setOutputDisplayId: (id) => set({ outputDisplayId: id }),
    }),
    { name: "worship-projector-settings" }
  )
);
