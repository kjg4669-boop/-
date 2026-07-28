import { create } from "zustand";
import { DEFAULT_LAYER_CONFIG, type LayerConfig, type CountdownPayload } from "@/lib/types";

interface OutputState {
  layerConfig: LayerConfig;
  isBlackout: boolean;
  isOutputReady: boolean;
  alertText: string;
  alertVisible: boolean;
  countdown: CountdownPayload | null;
  setLayerConfig: (config: LayerConfig) => void;
  setBlackout: (active: boolean) => void;
  setOutputReady: (ready: boolean) => void;
  setAlert: (text: string, visible: boolean) => void;
  setCountdown: (payload: CountdownPayload | null) => void;
}

export const useOutputStore = create<OutputState>((set) => ({
  layerConfig: DEFAULT_LAYER_CONFIG,
  isBlackout: false,
  isOutputReady: false,
  alertText: "",
  alertVisible: false,
  countdown: null,
  setLayerConfig: (config) => set({ layerConfig: config }),
  setBlackout: (active) => set({ isBlackout: active }),
  setOutputReady: (ready) => set({ isOutputReady: ready }),
  setAlert: (text, visible) => set({ alertText: text, alertVisible: visible }),
  setCountdown: (payload) => set({ countdown: payload }),
}));
