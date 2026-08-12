"use client";

import { useEffect, useRef, useState } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import QueuePanel from "@/components/controller/QueuePanel";
import LibraryPanel from "@/components/controller/LibraryPanel";
import AlertPanel from "@/components/controller/AlertPanel";
import RemotePanel from "@/components/controller/RemotePanel";
import NdiPanel from "@/components/controller/NdiPanel";
import AnnouncementPanel from "@/components/controller/AnnouncementPanel";
import LayerSidebar from "@/components/controller/LayerSidebar";
import { serviceDb } from "@/lib/db";
import { useQueueStore } from "@/stores/queueStore";
import type { LayerConfig, SlideUpdatePayload } from "@/lib/types";

type Tab = "queue" | "songs" | "settings" | "alert" | "looks" | "remote" | "ndi" | "announcement";
const TAB_LABELS: Record<Tab, string> = {
  queue: "순서", songs: "찬양", settings: "디자인", alert: "공지",
  looks: "룩", remote: "원격", ndi: "NDI", announcement: "공지루프",
};
const ALL_TABS: Tab[] = ["queue", "songs", "settings", "alert", "announcement", "looks", "remote", "ndi"];

export default function AllPanelsPage() {
  const [tabs, setTabs] = useState<Tab[]>(["queue", "songs", "settings", "alert", "announcement"]);
  const [activeTab, setActiveTab] = useState<Tab>("queue");
  const [layerConfig, setLayerConfig] = useState<LayerConfig | null>(null);
  const [openedWindows, setOpenedWindows] = useState<Set<Tab>>(new Set());
  const openedWindowsRef = useRef<Set<Tab>>(new Set());
  openedWindowsRef.current = openedWindows;
  const tabBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const parsed = hash.split(",").filter((t) => ALL_TABS.includes(t as Tab)) as Tab[];
      if (parsed.length > 0) { setTabs(parsed); setActiveTab(parsed[0]); }
    }
    const savedId = localStorage.getItem("lastServiceId");
    if (savedId) {
      serviceDb.get(parseInt(savedId)).then((svc) => {
        if (svc) useQueueStore.getState().setCurrentService(svc);
      }).catch(console.error);
    }
    const unlisteners: Array<() => void> = [];
    listen<SlideUpdatePayload>("slide:update", (ev) => {
      setLayerConfig(ev.payload.layerConfig);
    }).then((fn) => unlisteners.push(fn));
    emit("all-panels:ready", {}).catch(() => {});
    return () => { unlisteners.forEach((fn) => fn()); };
  }, []);

  const openTabAsWindow = async (tab: Tab, screenX?: number, screenY?: number) => {
    if (openedWindowsRef.current.has(tab)) return;
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      // Use "ap-" prefix to avoid label collision with main window's "panel-*" windows
      const label = `ap-panel-${tab}`;
      const win = new WebviewWindow(label, {
        url: `${window.location.origin}/floating-panel#${tab}`,
        title: TAB_LABELS[tab],
        width: 280, height: 520,
        ...(screenX !== undefined && screenY !== undefined ? { x: screenX - 140, y: screenY - 30 } : {}),
        decorations: true,
      });
      const revert = () => {
        setOpenedWindows((prev) => { const next = new Set(prev); next.delete(tab); return next; });
      };
      win.once("tauri://destroyed", revert);
      win.once("tauri://error", revert);
      setOpenedWindows((prev) => new Set([...prev, tab]));
      // Switch to next available tab
      const nextTab = tabs.find((t) => t !== tab && !openedWindowsRef.current.has(t));
      if (nextTab && activeTab === tab) setActiveTab(nextTab);
    } catch (err) { console.error(err); }
  };

  const handleTabMouseDown = (e: React.MouseEvent, tab: Tab) => {
    if (openedWindowsRef.current.has(tab)) return;
    const startX = e.clientX, startY = e.clientY;
    let detached = false;
    const handleMove = (me: MouseEvent) => {
      if (!detached && (Math.abs(me.clientX - startX) > 8 || Math.abs(me.clientY - startY) > 8)) detached = true;
    };
    const handleUp = async (me: MouseEvent) => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      if (!detached) { setActiveTab(tab); return; }
      await openTabAsWindow(tab, me.screenX, me.screenY);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  const handleLayerChange = (config: LayerConfig) => {
    setLayerConfig(config);
    emit("layer:change", config).catch(() => {});
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#252526] text-white overflow-hidden">
      {/* 탭 바 */}
      <div ref={tabBarRef} className="flex border-b border-zinc-700 flex-shrink-0 select-none overflow-x-auto">
        {tabs.map((tab) => {
          const isFloating = openedWindows.has(tab);
          return (
            <button
              key={tab}
              onMouseDown={(e) => handleTabMouseDown(e, tab)}
              className={`flex-1 py-1.5 text-[10px] font-medium whitespace-nowrap transition-colors ${
                isFloating
                  ? "text-blue-400 border-b-2 border-blue-400 border-dashed bg-zinc-800/50"
                  : activeTab === tab
                  ? "text-white border-b-2 border-blue-500 bg-zinc-700"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              {TAB_LABELS[tab]}{isFloating ? "↗" : ""}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-hidden">
        {openedWindows.has(activeTab) ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-xs select-none">
            분리된 패널 — 탭을 클릭해 도킹
          </div>
        ) : (
          <>
            {activeTab === "queue" && <QueuePanel />}
            {activeTab === "songs" && <LibraryPanel mode="songs" />}
            {activeTab === "settings" && (
              layerConfig ? (
                <LayerSidebar
                  layerConfig={layerConfig}
                  activeItemId={null}
                  onChange={handleLayerChange}
                  onSaveGlobal={() => emit("layer:saveGlobal", layerConfig).catch(() => {})}
                  onSaveItem={() => {}}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-600 text-xs">연결 중...</div>
              )
            )}
            {activeTab === "alert" && <AlertPanel />}
            {activeTab === "looks" && (
              <div className="h-full flex items-center justify-center text-zinc-600 text-xs">룩은 메인 창에서 사용하세요</div>
            )}
            {activeTab === "remote" && <RemotePanel />}
            {activeTab === "ndi" && <NdiPanel />}
            {activeTab === "announcement" && <AnnouncementPanel />}
          </>
        )}
      </div>
    </div>
  );
}
