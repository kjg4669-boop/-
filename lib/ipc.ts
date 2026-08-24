"use client";

import type {
  LayerConfig,
  BlackoutTogglePayload,
  SlideUpdatePayload,
  PlaybackStatusPayload,
  AlertPayload,
  CountdownPayload,
  SlideMeta,
  VideoControlPayload,
  AudioPlayPayload,
  LookApplyPayload,
  RemoteCommand,
  AnnouncementShowPayload,
  StageMessagePayload,
} from "./types";

// Check if running inside Tauri
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Dynamically import Tauri APIs to avoid SSR issues
async function getTauriEvent() {
  if (!isTauri()) return null;
  return import("@tauri-apps/api/event");
}

async function getTauriCore() {
  if (!isTauri()) return null;
  return import("@tauri-apps/api/core");
}

// Emit an event to all windows
export async function emitEvent<T>(event: string, payload: T): Promise<void> {
  const tauriEvent = await getTauriEvent();
  if (!tauriEvent) {
    console.warn("[IPC] Not in Tauri, skipping emit:", event, payload);
    return;
  }
  await tauriEvent.emit(event, payload);
}

// Emit an event to a specific target window (silently ignores if window not open)
export async function emitToTarget<T>(target: string, event: string, payload: T): Promise<void> {
  const tauriEvent = await getTauriEvent();
  if (!tauriEvent) return;
  try {
    await tauriEvent.emitTo(target, event, payload);
  } catch {
    // Target window not open — ignore
  }
}

// Listen to an event
export async function listenEvent<T>(
  event: string,
  callback: (payload: T) => void
): Promise<() => void> {
  const tauriEvent = await getTauriEvent();
  if (!tauriEvent) {
    console.warn("[IPC] Not in Tauri, skipping listen:", event);
    return () => {};
  }
  const unlisten = await tauriEvent.listen<T>(event, (e) => callback(e.payload));
  return unlisten;
}

// Invoke a Tauri command
export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const tauriCore = await getTauriCore();
  if (!tauriCore) {
    throw new Error("[IPC] Not in Tauri environment");
  }
  return tauriCore.invoke<T>(command, args);
}

// Debounce: coalesce rapid slide updates to prevent subtitle flickering
let _pendingSlideConfig: LayerConfig | null = null;
let _pendingMeta: SlideMeta | undefined = undefined;
let _slideDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// High-level IPC helpers
export const ipc = {
  sendSlideUpdate: (layerConfig: LayerConfig, meta?: SlideMeta): void => {
    _pendingSlideConfig = layerConfig;
    _pendingMeta = meta;
    if (_slideDebounceTimer) clearTimeout(_slideDebounceTimer);
    _slideDebounceTimer = setTimeout(() => {
      _slideDebounceTimer = null;
      if (_pendingSlideConfig) {
        void emitEvent<SlideUpdatePayload>("slide:update", { layerConfig: _pendingSlideConfig, meta: _pendingMeta });
        _pendingSlideConfig = null;
        _pendingMeta = undefined;
      }
    }, 30);
  },

  sendSubtitleNext: () => emitEvent("subtitle:next", {}),

  sendSubtitlePrev: () => emitEvent("subtitle:prev", {}),

  sendBlackout: (active: boolean) =>
    emitEvent<BlackoutTogglePayload>("blackout:toggle", { active }),

  onSlideUpdate: (cb: (config: LayerConfig) => void) =>
    listenEvent<SlideUpdatePayload>("slide:update", (p) => cb(p.layerConfig)),

  onSubtitleNext: (cb: () => void) => listenEvent("subtitle:next", cb),

  onSubtitlePrev: (cb: () => void) => listenEvent("subtitle:prev", cb),

  onBlackout: (cb: (active: boolean) => void) =>
    listenEvent<BlackoutTogglePayload>("blackout:toggle", (p) => cb(p.active)),

  onOutputReady: (cb: () => void) => listenEvent("output:ready", cb),

  onPlaybackStatus: (cb: (status: PlaybackStatusPayload) => void) =>
    listenEvent<PlaybackStatusPayload>("playback:status", cb),

  sendAlert: (payload: AlertPayload) =>
    emitEvent<AlertPayload>("alert:show", payload),

  sendAlertHide: (position: AlertPayload["position"] = "bottom", backgroundColor?: string, textColor?: string) =>
    emitEvent<AlertPayload>("alert:show", { text: "", visible: false, duration: 0, position, backgroundColor, textColor }),

  onAlert: (cb: (payload: AlertPayload) => void) =>
    listenEvent<AlertPayload>("alert:show", (p) => cb(p)),

  sendFreeze: (active: boolean) =>
    emitEvent<{ active: boolean }>("freeze:toggle", { active }),

  onFreeze: (cb: (active: boolean) => void) =>
    listenEvent<{ active: boolean }>("freeze:toggle", (p) => cb(p.active)),

  sendOutputReady: () => emitEvent("output:ready", {}),

  sendHeartbeat: () => emitEvent("heartbeat:ping", {}),

  onHeartbeat: (cb: () => void) => listenEvent("heartbeat:ping", cb),

  openOutputWindow: (x: number, y: number, width: number, height: number) =>
    invokeCommand("open_output_window", { x, y, width, height }),

  closeOutputWindow: () => invokeCommand("close_output_window"),

  getDisplays: () => invokeCommand("get_displays"),

  // Stage Display
  openStageWindow: () => invokeCommand("open_stage_display"),
  closeStageWindow: () => invokeCommand("close_stage_display"),

  // Countdown Timer
  sendCountdown: (payload: CountdownPayload) =>
    emitEvent<CountdownPayload>("countdown:update", payload),

  onCountdown: (cb: (payload: CountdownPayload) => void) =>
    listenEvent<CountdownPayload>("countdown:update", cb),

  // Stage slide update — always sent regardless of isLive/isClear (output window does NOT listen to this)
  sendStageSlideUpdate: (layerConfig: LayerConfig, meta?: SlideMeta): void => {
    void emitEvent<SlideUpdatePayload>("stage:slide-update", { layerConfig, meta });
  },
  // Stage: listen to dedicated stage:slide-update (always fired, never gated on isLive)
  onSlideUpdateWithMeta: (cb: (layerConfig: LayerConfig, meta?: SlideMeta) => void) =>
    listenEvent<SlideUpdatePayload>("stage:slide-update", (p) => cb(p.layerConfig, p.meta)),

  // Preview-only update (always sent, even when !isLive — output window does NOT listen to this)
  // Global emit: no other window listens to "preview:update", so this is safe.
  // Also persists to Rust app-state via set_preview_config so the preview window can invoke
  // get_preview_config on mount and get the current config WITHOUT an IPC round-trip.
  sendPreviewUpdate: (layerConfig: LayerConfig): void => {
    const json = JSON.stringify(layerConfig);
    void invokeCommand<void>("set_preview_config", { config: json });
    void emitEvent<SlideUpdatePayload>("preview:update", { layerConfig });
  },
  onPreviewUpdate: (cb: (layerConfig: LayerConfig) => void) =>
    listenEvent<SlideUpdatePayload>("preview:update", (p) => cb(p.layerConfig)),

  // Called by preview window on mount to immediately get the latest config (no round-trip).
  getPreviewConfig: () => invokeCommand<string | null>("get_preview_config"),

  // Stage closed notification (emitted from stage page on beforeunload)
  onStageClosed: (cb: () => void) => listenEvent("stage:closed", cb),

  // Video playback control
  sendVideoControl: (payload: VideoControlPayload) =>
    emitEvent<VideoControlPayload>("video:control", payload),

  onVideoControl: (cb: (payload: VideoControlPayload) => void) =>
    listenEvent<VideoControlPayload>("video:control", cb),

  // Database backup / restore
  backupDatabase: (destPath: string) =>
    invokeCommand<void>("backup_database", { dest_path: destPath }),

  restoreDatabase: (srcPath: string) =>
    invokeCommand<void>("restore_database", { src_path: srcPath }),

  // Backing track audio
  sendAudioPlay: (payload: AudioPlayPayload) =>
    emitEvent<AudioPlayPayload>("audio:play", payload),

  sendAudioStop: () =>
    emitEvent("audio:stop", {}),

  onAudioPlay: (cb: (payload: AudioPlayPayload) => void) =>
    listenEvent<AudioPlayPayload>("audio:play", cb),

  onAudioStop: (cb: () => void) =>
    listenEvent("audio:stop", cb),

  // Looks presets
  sendLookApply: (payload: LookApplyPayload) =>
    emitEvent<LookApplyPayload>("look:apply", payload),

  onLookApply: (cb: (payload: LookApplyPayload) => void) =>
    listenEvent<LookApplyPayload>("look:apply", cb),

  // Web Remote Control
  // Returns the generated PIN on success.
  startRemoteServer: (port: number) =>
    invokeCommand<string>("start_remote_server", { port }),
  stopRemoteServer: () =>
    invokeCommand<void>("stop_remote_server"),
  getLocalIp: () =>
    invokeCommand<string>("get_local_ip"),
  sendRemoteState: (slideText: string, songTitle: string, slideIndex: number, totalSlides: number) =>
    invokeCommand<void>("send_remote_state", {
      payload: JSON.stringify({ type: "state", slideText, songTitle, slideIndex, totalSlides }),
    }),
  onRemoteCommand: (cb: (cmd: RemoteCommand) => void) =>
    listenEvent<RemoteCommand>("remote:command", cb),

  // Output Preview window
  openPreviewWindow: () =>
    invokeCommand<void>("open_preview_window"),
  closePreviewWindow: () =>
    invokeCommand<void>("close_preview_window"),
  onPreviewClosed: (cb: () => void) =>
    listenEvent("preview:closed", cb),

  // NDI Output
  isNdiAvailable: () =>
    invokeCommand<boolean>("is_ndi_available"),
  startNdiOutput: (sourceName: string, width?: number, height?: number, fps?: number) =>
    invokeCommand<void>("start_ndi_output", { source_name: sourceName, width, height, fps }),
  stopNdiOutput: () =>
    invokeCommand<void>("stop_ndi_output"),
  onNdiError: (cb: (msg: string) => void) =>
    listenEvent<string>("ndi:error", cb),

  // Announcement loop
  sendAnnouncementShow: (payload: AnnouncementShowPayload) =>
    emitEvent<AnnouncementShowPayload>("announcement:show", payload),
  onAnnouncementShow: (cb: (payload: AnnouncementShowPayload) => void) =>
    listenEvent<AnnouncementShowPayload>("announcement:show", cb),

  // Output scale mode
  sendScaleMode: (mode: "fit" | "fill" | "native") =>
    emitEvent<{ mode: "fit" | "fill" | "native" }>("output:scale-mode", { mode }),
  onScaleMode: (cb: (mode: "fit" | "fill" | "native") => void) =>
    listenEvent<{ mode: "fit" | "fill" | "native" }>("output:scale-mode", (p) => cb(p.mode)),

  // Stage private messages (visible only on stage display)
  sendStageMessage: (payload: StageMessagePayload) =>
    emitEvent<StageMessagePayload>("stage:message", payload),
  onStageMessage: (cb: (payload: StageMessagePayload) => void) =>
    listenEvent<StageMessagePayload>("stage:message", cb),
};
