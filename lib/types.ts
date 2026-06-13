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

export interface LyricSlide {
  id: string;
  section: LyricSection;
  sectionIndex: number;
  lines: string[];
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
}

// ServiceItemSettings: partial LayerConfig for per-item overrides
export interface ServiceItemSettings {
  background?: Partial<LayerConfig["background"]>;
  subtitle?: Partial<LayerConfig["subtitle"]>;
  overlay?: Partial<LayerConfig["overlay"]>;
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
  background: { type: "color", color: "#000000", loop: true, opacity: 1 },
  subtitle: {
    visible: false,
    lines: [],
    fontSize: 48,
    fontFamily: "sans-serif",
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 2,
    shadowEnabled: true,
    backgroundBoxVisible: false,
    backgroundBoxOpacity: 0.5,
    position: "bottom",
    opacity: 1,
  },
  overlay: { visible: false, x: 0, y: 0, width: 320, height: 180, opacity: 1 },
};

// IPC event types
export type IpcEventName =
  | "slide:update"
  | "subtitle:next"
  | "subtitle:prev"
  | "blackout:toggle"
  | "overlay:toggle"
  | "output:ready"
  | "playback:status";

export interface BlackoutTogglePayload { active: boolean; }
export interface SlideUpdatePayload { layerConfig: LayerConfig; }
export interface OverlayTogglePayload { id: string; visible: boolean; }
export interface PlaybackStatusPayload { currentTime: number; duration: number; }
