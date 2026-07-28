// Media types
export type MediaType = "video" | "image" | "color";

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
}

export interface LyricSlide {
  id: string;
  section: LyricSection;
  sectionIndex: number;
  lines: string[];
  canvas?: {
    textBlocks: TextBlock[];
  };
}

export interface Song {
  id: number;
  title: string;
  artist: string;
  lyrics_json: LyricSlide[];
  media_id?: number;
  created_at: string;
  updated_at: string;
}

// Service / Queue types
export type ServiceItemType = "song" | "video" | "announcement" | "scripture" | "blank";

// Layer configuration (sent via IPC to output window)
export interface LayerConfig {
  transitionMs?: number;
  background: {
    type: MediaType | "none";
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
    textEntrance?: "none" | "fade" | "slide-up" | "slide-down" | "zoom-in";
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
  scripture?: ScriptureSettings;
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
  song?: Song;
  media?: MediaItem;
}

export interface Service {
  id: number;
  date: string;
  name: string;
  items: ServiceItem[];
}

export const DEFAULT_LAYER_CONFIG: LayerConfig = {
  transitionMs: 250,
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
    position: "bottom",
    opacity: 1,
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "center",
    textEntrance: "fade",
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
}

export interface SlideUpdatePayload { layerConfig: LayerConfig; meta?: SlideMeta; }
export interface OverlayTogglePayload { id: string; visible: boolean; }
export interface PlaybackStatusPayload { currentTime: number; duration: number; playing: boolean; }
export interface AlertPayload { text: string; visible: boolean; }

// Countdown timer payload
export interface CountdownPayload {
  active: boolean;
  remainingMs: number;
  totalMs: number;
}
