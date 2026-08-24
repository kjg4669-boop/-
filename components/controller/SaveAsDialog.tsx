"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronUp, Home, Monitor, Download, FileText,
  Folder, File, X, Save, ChevronDown,
} from "lucide-react";
import { readDir } from "@tauri-apps/plugin-fs";

const EXT_OPTIONS = [
  { label: "Worship Projector 파일 (*.wpjson)", ext: "wpjson" },
  { label: "JSON 파일 (*.json)", ext: "json" },
  { label: "PowerPoint 파일 (*.pptx)", ext: "pptx" },
  { label: "텍스트 파일 (*.txt)", ext: "txt" },
];

interface SaveAsDialogProps {
  defaultName?: string;
  onConfirm: (filePath: string) => void;
  onClose: () => void;
}

interface Entry {
  name: string;
  isDirectory: boolean;
}

interface Bookmark {
  label: string;
  path: string;
  icon: "home" | "desktop" | "download" | "document";
}

function joinPaths(base: string, name: string): string {
  return base.replace(/\/$/, "") + "/" + name;
}

function parentPath(p: string): string {
  const trimmed = p.replace(/\/$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

function BookmarkIcon({ icon }: { icon: Bookmark["icon"] }) {
  const size = 14;
  if (icon === "home") return <Home size={size} />;
  if (icon === "desktop") return <Monitor size={size} />;
  if (icon === "download") return <Download size={size} />;
  return <FileText size={size} />;
}

export default function SaveAsDialog({ defaultName = "새 예배", onConfirm, onClose }: SaveAsDialogProps) {
  const [currentPath, setCurrentPath] = useState("");
  const currentPathRef = useRef("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fileName, setFileName] = useState(() => defaultName.replace(/\.[^/.]+$/, ""));
  const [selectedExt, setSelectedExt] = useState("wpjson");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(async (path: string, pushCurrent = true) => {
    setLoading(true);
    setSelected(null);
    try {
      const raw = await readDir(path);
      const sorted = (raw as { name?: string; isDirectory: boolean }[])
        .filter((e) => e.name && !e.name.startsWith("."))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return (a.name ?? "").localeCompare(b.name ?? "", "ko");
        })
        .map((e) => ({ name: e.name!, isDirectory: e.isDirectory }));

      if (pushCurrent && currentPathRef.current) {
        setHistory((h) => [...h, currentPathRef.current]);
      }
      currentPathRef.current = path;
      setCurrentPath(path);
      setEntries(sorted);
    } catch {
      /* permission denied — stay in current dir */
    }
    setLoading(false);
  }, []);

  // Init: resolve known dirs then navigate to desktop
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { homeDir, desktopDir, downloadDir, documentDir } = await import("@tauri-apps/api/path");
        const [home, desktop, downloads, documents] = await Promise.all([
          homeDir(), desktopDir(), downloadDir(), documentDir(),
        ]);
        if (cancelled) return;
        setBookmarks([
          { label: "홈", path: home, icon: "home" },
          { label: "바탕화면", path: desktop, icon: "desktop" },
          { label: "다운로드", path: downloads, icon: "download" },
          { label: "문서", path: documents, icon: "document" },
        ]);
        await loadDir(desktop, false);
      } catch {
        /* fallback: stay empty */
      }
    })();
    return () => { cancelled = true; };
  }, [loadDir]);

  // Focus filename on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const handleBack = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      const next = h.slice(0, -1);
      loadDir(prev, false);
      return next;
    });
  }, [loadDir]);

  const handleUp = useCallback(() => {
    const parent = parentPath(currentPath);
    if (parent !== currentPath) loadDir(parent);
  }, [currentPath, loadDir]);

  const handleEntryClick = useCallback((entry: Entry) => {
    setSelected(entry.name);
    if (!entry.isDirectory) {
      setFileName(entry.name.replace(/\.[^/.]+$/, ""));
    }
  }, []);

  const handleEntryDoubleClick = useCallback((entry: Entry) => {
    if (entry.isDirectory) {
      loadDir(joinPaths(currentPath, entry.name));
    }
  }, [currentPath, loadDir]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const parts = currentPath.replace(/\/$/, "").split("/").filter(Boolean);
    const target = "/" + parts.slice(0, index + 1).join("/");
    loadDir(target);
  }, [currentPath, loadDir]);

  const handleConfirm = useCallback(() => {
    if (!currentPath) return;
    const name = fileName.trim() || "새 예배";
    const filePath = joinPaths(currentPath, `${name}.${selectedExt}`);
    onConfirm(filePath);
  }, [currentPath, fileName, selectedExt, onConfirm]);

  // Breadcrumb parts
  const pathParts = currentPath.replace(/\/$/, "").split("/").filter(Boolean);

  const extLabel = EXT_OPTIONS.find((o) => o.ext === selectedExt)?.ext ?? selectedExt;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col w-[760px] h-[520px] bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800 border-b border-zinc-700 flex-shrink-0">
          <span className="text-sm font-semibold text-zinc-100">다른 이름으로 저장</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Navigation bar */}
        <div className="flex items-center gap-1 px-2 py-1.5 bg-zinc-800/50 border-b border-zinc-700/60 flex-shrink-0">
          <button
            onClick={handleBack}
            disabled={history.length === 0}
            title="뒤로"
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={handleUp}
            disabled={!currentPath || currentPath === "/"}
            title="위로"
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronUp size={14} />
          </button>

          {/* Breadcrumb */}
          <div className="flex-1 flex items-center gap-0.5 mx-1 px-2.5 py-1 bg-zinc-900 rounded border border-zinc-700 min-w-0 overflow-hidden h-7">
            {pathParts.length === 0 ? (
              <span className="text-xs text-zinc-600">—</span>
            ) : (
              pathParts.map((part, i) => (
                <span key={i} className="flex items-center gap-0.5 min-w-0 flex-shrink-0">
                  {i > 0 && <span className="text-zinc-700 mx-0.5 flex-shrink-0">/</span>}
                  <button
                    onClick={() => handleBreadcrumbClick(i)}
                    className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors truncate max-w-[160px]"
                  >
                    {part}
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* Left sidebar — Bookmarks */}
          <div className="w-[148px] flex-shrink-0 border-r border-zinc-700/60 bg-zinc-800/30 py-2 overflow-y-auto">
            <p className="px-3 mb-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">즐겨찾기</p>
            {bookmarks.map((bm) => (
              <button
                key={bm.path}
                onClick={() => loadDir(bm.path)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  currentPath === bm.path
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40"
                }`}
              >
                <span className={currentPath === bm.path ? "text-blue-400" : "text-zinc-500"}>
                  <BookmarkIcon icon={bm.icon} />
                </span>
                <span className="truncate">{bm.label}</span>
              </button>
            ))}
          </div>

          {/* File list */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Column header */}
            <div className="flex items-center px-3 py-1 border-b border-zinc-700/50 bg-zinc-800/20 flex-shrink-0">
              <span className="flex-1 text-[11px] font-medium text-zinc-600">이름</span>
              <span className="w-24 text-[11px] font-medium text-zinc-600 text-right pr-1">종류</span>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-xs text-zinc-600">불러오는 중...</span>
                </div>
              ) : entries.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-xs text-zinc-600">항목 없음</span>
                </div>
              ) : (
                entries.map((entry) => {
                  const isFile = !entry.isDirectory;
                  const isSelected = selected === entry.name;
                  return (
                    <div
                      key={entry.name}
                      onClick={() => handleEntryClick(entry)}
                      onDoubleClick={() => handleEntryDoubleClick(entry)}
                      className={[
                        "flex items-center gap-2 px-3 py-[5px] select-none transition-all",
                        entry.isDirectory ? "cursor-pointer" : "cursor-default",
                        isFile && !isSelected ? "opacity-45" : "opacity-100",
                        isSelected
                          ? "bg-blue-600/25 text-zinc-100"
                          : "hover:bg-zinc-700/35 text-zinc-300",
                      ].join(" ")}
                    >
                      <span className={entry.isDirectory ? "text-yellow-400/80" : "text-zinc-500"}>
                        {entry.isDirectory ? <Folder size={14} /> : <File size={14} />}
                      </span>
                      <span className="flex-1 text-xs truncate">{entry.name}</span>
                      <span className="w-24 text-[11px] text-zinc-600 text-right pr-1 flex-shrink-0">
                        {entry.isDirectory
                          ? "폴더"
                          : (entry.name.split(".").pop()?.toUpperCase() ?? "파일")}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-700 bg-zinc-800/50 px-5 py-3 space-y-2 flex-shrink-0">
          {/* File name */}
          <div className="flex items-center gap-3">
            <label className="w-20 text-xs text-zinc-500 text-right flex-shrink-0">파일 이름:</label>
            <input
              ref={inputRef}
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
                if (e.key === "Escape") onClose();
              }}
              className="flex-1 px-2.5 py-1 text-xs bg-zinc-900 border border-zinc-600 rounded text-zinc-200 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="파일 이름 입력"
            />
          </div>

          {/* Extension */}
          <div className="flex items-center gap-3">
            <label className="w-20 text-xs text-zinc-500 text-right flex-shrink-0">파일 형식:</label>
            <div className="relative flex-1">
              <select
                value={selectedExt}
                onChange={(e) => setSelectedExt(e.target.value)}
                className="w-full px-2.5 py-1 text-xs bg-zinc-900 border border-zinc-600 rounded text-zinc-200 focus:outline-none focus:border-blue-500 appearance-none cursor-pointer pr-7 transition-colors"
              >
                {EXT_OPTIONS.map((opt) => (
                  <option key={opt.ext} value={opt.ext}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end items-center gap-2 pt-0.5">
            <span className="text-[11px] text-zinc-600 mr-auto">
              {currentPath ? `저장 위치: .../${pathParts[pathParts.length - 1] ?? ""}` : ""}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-zinc-300 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={!currentPath || !fileName.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
            >
              <Save size={12} />
              저장 (.{extLabel})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
