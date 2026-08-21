"use client";

import { useState, useEffect } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import type { LayerConfig, SlideUpdatePayload } from "@/lib/types";
import SidebarLayerPanel from "@/components/controller/SidebarLayerPanel";

export default function LayerPanelPage() {
  const [layerConfig, setLayerConfig] = useState<LayerConfig | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<SlideUpdatePayload>("slide:update", (ev) => {
      setLayerConfig(ev.payload.layerConfig);
    }).then((fn) => unlisteners.push(fn));

    // Signal to main window that this panel is ready
    emit("layer-panel:ready", {}).catch(() => {});

    return () => { unlisteners.forEach((fn) => fn()); };
  }, []);

  if (!layerConfig) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1e1e1e] text-zinc-500 text-xs select-none">
        연결 중...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] overflow-hidden">
      <SidebarLayerPanel
        layerConfig={layerConfig}
        activeLayerId={activeLayerId}
        isFloating={false}
        onFloat={() => {}}
        onDock={() => {}}
        onDragHandleMouseDown={() => {}}
        onSelectLayer={setActiveLayerId}
        onToggleVisible={(layerId) => {
          emit("layer:toggleVisible", { layerId }).catch(() => {});
        }}
        onMoveUp={(layerId) => {
          emit("layer:moveUp", { layerId }).catch(() => {});
        }}
        onMoveDown={(layerId) => {
          emit("layer:moveDown", { layerId }).catch(() => {});
        }}
      />
    </div>
  );
}
