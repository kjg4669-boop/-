import { create } from "zustand";
import { DEFAULT_LAYER_CONFIG, type LayerConfig, type CountdownPayload } from "@/lib/types";

interface OutputState {
  layerConfig: LayerConfig;
  isBlackout: boolean;
  isOutputReady: boolean;
  alertText: string;
  alertVisible: boolean;
  alertDuration: number;
  alertPosition: "top" | "bottom" | "center";
  alertBgColor: string;
  alertTextColor: string;
  countdown: CountdownPayload | null;
  setLayerConfig: (config: LayerConfig) => void;
  patchLayerConfig: (subtitle?: Partial<LayerConfig["subtitle"]>, background?: Partial<LayerConfig["background"]>) => void;
  setBlackout: (active: boolean) => void;
  setOutputReady: (ready: boolean) => void;
  setAlert: (
    text: string,
    visible: boolean,
    duration?: number,
    position?: "top" | "bottom" | "center",
    bgColor?: string,
    textColor?: string
  ) => void;
  setCountdown: (payload: CountdownPayload | null) => void;
}

export const useOutputStore = create<OutputState>((set) => ({
  layerConfig: DEFAULT_LAYER_CONFIG,
  isBlackout: false,
  isOutputReady: false,
  alertText: "",
  alertVisible: false,
  alertDuration: 0,
  alertPosition: "bottom",
  alertBgColor: "rgba(0,0,0,0.85)",
  alertTextColor: "#ffffff",
  countdown: null,
  setLayerConfig: (config) => set({ layerConfig: config }),
  patchLayerConfig: (subtitle, background) =>
    set((state) => ({
      layerConfig: {
        ...state.layerConfig,
        ...(background ? { background: { ...state.layerConfig.background, ...background } } : {}),
        ...(subtitle ? { subtitle: { ...state.layerConfig.subtitle, ...subtitle } } : {}),
      },
    })),
  setBlackout: (active) => set({ isBlackout: active }),
  setOutputReady: (ready) => set({ isOutputReady: ready }),
  setAlert: (text, visible, duration = 0, position = "bottom", bgColor = "rgba(0,0,0,0.85)", textColor = "#ffffff") =>
    set({
      alertText: text,
      alertVisible: visible,
      alertDuration: duration,
      alertPosition: position,
      alertBgColor: bgColor,
      alertTextColor: textColor,
    }),
  setCountdown: (payload) => set({ countdown: payload }),
}));
