import { describe, it, expect } from "vitest";
import {
  parseLyricSlide,
  parseLyricSlides,
  parseServiceItemType,
  parseMediaType,
  parseServiceItemSettings,
  safeJsonParse,
} from "@/lib/validators";

describe("parseLyricSlide", () => {
  it("returns valid slide unchanged", () => {
    const input = { id: "s1", section: "chorus", sectionIndex: 2, lines: ["line1", "line2"] };
    expect(parseLyricSlide(input)).toEqual(input);
  });

  it("returns null for non-object", () => {
    expect(parseLyricSlide(null)).toBeNull();
    expect(parseLyricSlide("string")).toBeNull();
    expect(parseLyricSlide(42)).toBeNull();
  });

  it("returns null when id is missing or empty", () => {
    expect(parseLyricSlide({ section: "verse", lines: [] })).toBeNull();
    expect(parseLyricSlide({ id: "", section: "verse", lines: [] })).toBeNull();
    expect(parseLyricSlide({ id: 123, section: "verse", lines: [] })).toBeNull();
  });

  it("falls back to 'verse' for invalid section", () => {
    const result = parseLyricSlide({ id: "s1", section: "unknown", lines: [] });
    expect(result?.section).toBe("verse");
  });

  it("accepts all valid section values", () => {
    const sections = ["verse", "chorus", "bridge", "pre-chorus", "outro", "intro"] as const;
    for (const section of sections) {
      expect(parseLyricSlide({ id: "s1", section, lines: [] })?.section).toBe(section);
    }
  });

  it("filters non-string values from lines", () => {
    const result = parseLyricSlide({ id: "s1", section: "verse", lines: ["ok", 42, null, "also ok"] });
    expect(result?.lines).toEqual(["ok", "also ok"]);
  });

  it("defaults lines to [] when not an array", () => {
    const result = parseLyricSlide({ id: "s1", section: "verse", lines: "bad" });
    expect(result?.lines).toEqual([]);
  });

  it("defaults sectionIndex to 1 when missing", () => {
    const result = parseLyricSlide({ id: "s1", section: "verse", lines: [] });
    expect(result?.sectionIndex).toBe(1);
  });
});

describe("parseLyricSlides", () => {
  it("returns empty array for non-array", () => {
    expect(parseLyricSlides(null)).toEqual([]);
    expect(parseLyricSlides({})).toEqual([]);
  });

  it("skips invalid items and keeps valid ones", () => {
    const input = [
      { id: "s1", section: "verse", lines: ["hello"] },
      null,
      { section: "verse", lines: [] }, // missing id — invalid
      { id: "s2", section: "chorus", lines: [] },
    ];
    const result = parseLyricSlides(input);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("s1");
    expect(result[1].id).toBe("s2");
  });
});

describe("parseServiceItemType", () => {
  it("accepts all valid types", () => {
    const valid = ["song", "video", "announcement", "scripture", "blank"] as const;
    for (const t of valid) {
      expect(parseServiceItemType(t)).toBe(t);
    }
  });

  it("falls back to 'blank' for unknown values", () => {
    expect(parseServiceItemType("unknown")).toBe("blank");
    expect(parseServiceItemType(null)).toBe("blank");
    expect(parseServiceItemType(undefined)).toBe("blank");
  });
});

describe("parseMediaType", () => {
  it("accepts all valid media types", () => {
    expect(parseMediaType("video")).toBe("video");
    expect(parseMediaType("image")).toBe("image");
    expect(parseMediaType("color")).toBe("color");
  });

  it("falls back to 'image' for unknown values", () => {
    expect(parseMediaType("gif")).toBe("image");
    expect(parseMediaType(null)).toBe("image");
  });
});

describe("parseServiceItemSettings", () => {
  it("returns the object as-is when it is an object", () => {
    const obj = { background: { type: "color" }, subtitle: {} };
    expect(parseServiceItemSettings(obj)).toBe(obj);
  });

  it("returns empty object for non-object values", () => {
    expect(parseServiceItemSettings(null)).toEqual({});
    expect(parseServiceItemSettings("string")).toEqual({});
    expect(parseServiceItemSettings(42)).toEqual({});
    expect(parseServiceItemSettings([])).toEqual({});
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON strings", () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    expect(safeJsonParse("[1,2,3]", [])).toEqual([1, 2, 3]);
  });

  it("returns fallback for invalid JSON", () => {
    expect(safeJsonParse("not json", [])).toEqual([]);
  });

  it("returns the value directly when not a string", () => {
    const obj = { already: "parsed" };
    expect(safeJsonParse(obj, {})).toBe(obj);
  });

  it("returns fallback when value is null/undefined", () => {
    expect(safeJsonParse(null, "fallback")).toBe("fallback");
    expect(safeJsonParse(undefined, 42)).toBe(42);
  });
});
