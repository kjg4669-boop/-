"use client";
import { useEffect, useState } from "react";
import QueuePanel from "@/components/controller/QueuePanel";
import LibraryPanel from "@/components/controller/LibraryPanel";
import AlertPanel from "@/components/controller/AlertPanel";
import RemotePanel from "@/components/controller/RemotePanel";
import NdiPanel from "@/components/controller/NdiPanel";
import AnnouncementPanel from "@/components/controller/AnnouncementPanel";
import { serviceDb } from "@/lib/db";
import { useQueueStore } from "@/stores/queueStore";

const TAB_LABELS: Record<string, string> = {
  queue: "순서", songs: "찬양", settings: "디자인", alert: "공지",
  looks: "룩", remote: "원격", ndi: "NDI", announcement: "공지루프",
};

export default function FloatingPanelPage() {
  const [tab, setTab] = useState("");

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    setTab(hash);
    // localStorage에서 마지막 서비스 ID 읽어 store 초기화
    const savedId = localStorage.getItem("lastServiceId");
    if (savedId) {
      serviceDb.get(parseInt(savedId)).then((svc) => {
        if (svc) useQueueStore.getState().setCurrentService(svc);
      }).catch(console.error);
    }
  }, []);

  const renderContent = () => {
    switch (tab) {
      case "queue": return <QueuePanel />;
      case "songs": return <LibraryPanel mode="songs" />;
      case "alert": return <AlertPanel />;
      case "remote": return <RemotePanel />;
      case "ndi": return <NdiPanel />;
      case "announcement": return <AnnouncementPanel />;
      default:
        return (
          <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
            {tab ? "지원되지 않는 탭입니다" : "로딩 중..."}
          </div>
        );
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#252526] text-white overflow-hidden">
      <div className="flex-shrink-0 px-3 py-1.5 bg-[#1e1e1e] border-b border-zinc-700 text-xs text-zinc-400 select-none">
        {TAB_LABELS[tab] ?? tab}
      </div>
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}
