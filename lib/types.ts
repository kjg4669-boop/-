// Media types
export type MediaType = "video" | "image" | "color" | "camera";

export interface MediaItem {
  id: number;
  type: MediaType;
  file_path: string;
  thumbnail_path?: string;
  name: string;
  created_at: string;
}

// Song / Lyrics types
export type LyricSection = "verse" | "chorus" | "bridge" | "pre-chorus" | "outro" | "intro";

export interface TextSpan {
  text: string;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  color?: string;
  fontSize?: number;
}

export interface TextBlock {
  id: string;
  x: number;        // px within 1920×1080 virtual canvas
  y: number;
  width: number;
  height?: number;
  rotation?: number; // degrees
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textAlign?: "left" | "center" | "right";
  visible?: boolean; // undefined/true = visible, false = hidden
  spans?: TextSpan[];  // undefined이면 블록 단위 스타일 사용
}

export type ShapeType =
  | "rect"
  | "rounded-rect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "line"
  | "arrow-right"
  | "star"
  | "pentagon";

export interface ShapeBlock {
  id: string;
  x: number;           // px in 1920×1080 space
  y: number;
  width: number;
  height: number;
  rotation?: number;
  shapeType: ShapeType;
  fillEnabled: boolean;
  fillColor: string;       // e.g. "#3b82f6"
  fillOpacity: number;     // 0-100
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;     // px in 1920×1080 space
  strokeOpacity: number;   // 0-100
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  opacity?: number;    // 0-100, default 100
  visible?: boolean;
  // Text inside shape
  text?: string;
  textSpans?: TextSpan[];
  textColor?: string;
  textFontSize?: number;
  textFontFamily?: string;
  textFontWeight?: string;
  textFontStyle?: string;
  textDecoration?: "none" | "underline" | "line-through";
  textAlign?: "left" | "center" | "right";
}

export interface LyricSlide {
  id: string;
  section: LyricSection;
  sectionIndex: number;
  lines: string[];
  lines2?: string[];
  chords?: string;   // chord line for musicians e.g. "C  G  Am  F"
  canvas?: {
    textBlocks: TextBlock[];
    shapeBlocks?: ShapeBlock[];
    layerOrder?: string[]; // element IDs bottom-to-top; last = highest Z
  };
}

export interface Song {
  id: number;
  title: string;
  artist: string;
  lyrics_json: LyricSlide[];
  media_id?: number;
  ccli_number?: string;
  copyright_text?: string;
  publisher?: string;
  verse_order?: string[];
  bpm?: number;
  created_at: string;
  updated_at: string;
}

// Service / Queue types
export type ServiceItemType = "song" | "video" | "announcement" | "scripture" | "blank";

// Layer configuration (sent via IPC to output window)
export interface LayerConfig {
  transitionMs?: number;
  background: {
    type: MediaType | "none" | "transparent";
    src?: string;
    color?: string;
    loop?: boolean;
    opacity: number;
  };
  subtitle: {
    visible: boolean;
    lines: string[];
    fontSize: number;
    fontFamily: string;
    color: string;
    strokeColor: string;
    strokeWidth: number;
    shadowEnabled: boolean;
    backgroundBoxVisible: boolean;
    backgroundBoxOpacity: number;
    position: "top" | "center" | "bottom";
    opacity: number;
    fontWeight: "normal" | "bold";
    fontStyle: "normal" | "italic";
    textAlign: "left" | "center" | "right";
    textDecoration?: "none" | "underline" | "line-through";
    bilingualEnabled?: boolean;
    lines2?: string[];
    fontSize2?: number;
    color2?: string;
    fontWeight2?: "normal" | "bold";
    fontStyle2?: "normal" | "italic";
    lineHeight?: number;   // e.g. 1.3; default 1.3
    letterSpacing?: number; // in px; default 0
    textEntrance?: "none" | "fade" | "slide-up" | "slide-down" | "zoom-in";
    textEntranceIntensity?: number; // 0-100; slide: px distance, zoom: scale depth
    layout?: "full" | "left-half" | "right-half";
    showCopyright?: boolean;
    nonce?: number; // increments on every slide navigation to always trigger animation
  };
  overlay: {
    visible: boolean;
    src?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
  };
  canvas?: {
    textBlocks: TextBlock[];
    shapeBlocks?: ShapeBlock[];
    layerOrder?: string[]; // element IDs bottom-to-top; last = highest Z
    nonce?: number; // increments on every slide navigation to always trigger animation
  };
}

// Scripture types
export interface ScriptureSlide {
  lines: string[];
}

export interface ScriptureSettings {
  book: string;
  reference: string;
  slides: ScriptureSlide[];
}

// ServiceItemSettings: partial LayerConfig for per-item overrides
export interface ServiceItemSettings {
  background?: Partial<LayerConfig["background"]>;
  subtitle?: Partial<LayerConfig["subtitle"]>;
  overlay?: Partial<LayerConfig["overlay"]>;
  transitionMs?: number;
  scripture?: ScriptureSettings;
  /** Per-slide background overrides, keyed by LyricSlide.id */
  slideBackgrounds?: Record<string, Partial<LayerConfig["background"]>>;
}

export interface FlatSlide {
  slide: LyricSlide;
  songId: number;
  songTitle: string;
  serviceItemIndex: number; // index into currentService.items
  slideIndex: number;       // index into that item's song.lyrics_json
}

export interface ServiceItem {
  id: number;
  service_id: number;
  item_order: number;
  type: ServiceItemType;
  song_id?: number;
  media_id?: number;
  settings_json: ServiceItemSettings;
  label: string;
  notes?: string;
  song?: Song;
  media?: MediaItem;
}

export interface Service {
  id: number;
  date: string;
  name: string;
  notes: string;
  items: ServiceItem[];
}

export const DEFAULT_LAYER_CONFIG: LayerConfig = {
  transitionMs: 600,
  background: { type: "color", color: "#000000", loop: true, opacity: 1 },
  subtitle: {
    visible: false,
    lines: [],
    fontSize: 48,
    fontFamily: "sans-serif",
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 0,
    shadowEnabled: false,
    backgroundBoxVisible: false,
    backgroundBoxOpacity: 0.5,
    position: "center",
    opacity: 1,
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "center",
    bilingualEnabled: false,
    lines2: [],
    fontSize2: 28,
    color2: "#cccccc",
    fontWeight2: "normal",
    fontStyle2: "normal",
    textEntrance: "fade",
    textEntranceIntensity: 50,
    layout: "full",
    showCopyright: true,
    lineHeight: 1.3,
    letterSpacing: 0,
  },
  overlay: { visible: false, x: 0, y: 0, width: 320, height: 180, opacity: 1 },
};

// Display / monitor info (mirrors Rust display.rs DisplayInfo)
export interface DisplayInfo {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_primary: boolean;
}

// IPC event types
export type IpcEventName =
  | "slide:update"
  | "subtitle:next"
  | "subtitle:prev"
  | "blackout:toggle"
  | "output:ready"
  | "playback:status"
  | "countdown:update"
  | "stage:closed"
  | "alert:show"
  | "freeze:toggle"
  | "heartbeat:ping"
  | "video:control";

export interface VideoControlPayload {
  action: "play" | "pause" | "seek" | "volume" | "loop";
  value?: number; // seek: seconds, volume: 0-1, loop: 0|1
}

export interface BlackoutTogglePayload { active: boolean; }

// Stage Display metadata sent alongside each slide update
export interface SlideMeta {
  songTitle: string;
  section: string;
  slideIndex: number;   // 0-based index within the song/item
  totalSlides: number;  // total slides in this item
  itemIndex: number;    // 0-based index in service
  totalItems: number;   // total items in service
  nextLines?: string[];
  nextSection?: string;
  bpm?: number;
  chords?: string;
  notes?: string;
  copyright?: string;
}

export interface SlideUpdatePayload {
  layerConfig: LayerConfig;          // audience (하위 호환)
  profiles?: {
    audience: LayerConfig;
    livestream: LayerConfig;
  };
  meta?: SlideMeta;
}

export const DEFAULT_LIVESTREAM_LAYER_CONFIG: LayerConfig = {
  transitionMs: 300,
  background: { type: "transparent", opacity: 1 },
  subtitle: {
    visible: false,
    lines: [],
    fontSize: 36,
    fontFamily: "sans-serif",
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 2,
    shadowEnabled: true,
    backgroundBoxVisible: true,
    backgroundBoxOpacity: 0.6,
    position: "bottom",
    opacity: 1,
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "center",
    bilingualEnabled: false,
    lines2: [],
    fontSize2: 22,
    color2: "#cccccc",
    fontWeight2: "normal",
    fontStyle2: "normal",
    textEntrance: "fade",
    textEntranceIntensity: 30,
    layout: "full",
    showCopyright: false,
    lineHeight: 1.3,
    letterSpacing: 0,
  },
  overlay: { visible: false, x: 0, y: 0, width: 320, height: 180, opacity: 1 },
};
export interface OverlayTogglePayload { id: string; visible: boolean; }
export interface PlaybackStatusPayload { currentTime: number; duration: number; playing: boolean; }
export interface AlertPayload {
  text: string;
  visible: boolean;
  duration: number;        // ms; 0 = manual dismiss only
  position: "top" | "bottom" | "center";
  backgroundColor?: string;
  textColor?: string;
  yPercent?: number;   // 0–100, vertical position (overrides position preset when set)
  fontSize?: number;   // font size in 1920×1080 canvas px
}

export interface RemoteCommand {
  type: "next" | "prev" | "blackout" | "goto";
  slideIndex?: number;
}

export interface BackingTrack {
  id: number;
  song_id: number;
  file_path: string;
  volume: number;
  repeat: boolean;
  start_paused: boolean;
  created_at: string;
}

export interface AudioPlayPayload {
  filePath: string;
  volume: number;
  repeat: boolean;
}

// Countdown timer payload
export interface CountdownPayload {
  active: boolean;
  remainingMs: number;
  totalMs: number;
}

export interface Look {
  id: number;
  name: string;
  showBackground: boolean;
  showSubtitle: boolean;
  showOverlay: boolean;
  showCanvas: boolean;
  showCountdown: boolean;
  subtitleSnapshot?: Partial<LayerConfig["subtitle"]>;
  backgroundSnapshot?: Partial<LayerConfig["background"]>;
}

export interface LookApplyPayload {
  lookId: number | null;
  showBackground: boolean;
  showSubtitle: boolean;
  showOverlay: boolean;
  showCanvas: boolean;
  showCountdown: boolean;
  subtitleSnapshot?: Partial<LayerConfig["subtitle"]>;
  backgroundSnapshot?: Partial<LayerConfig["background"]>;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  duration_sec: number;
  order_num: number;
  active: boolean;
  created_at: string;
}

// Video background phase preset
export interface VideoPhase {
  id: string;
  name: string;
  background: LayerConfig["background"];
}

export interface AnnouncementShowPayload {
  visible: boolean;
  title: string;
  body: string;
  bgColor?: string;
  textColor?: string;
}

export interface StageMessagePayload {
  text: string;
  visible: boolean;
}
