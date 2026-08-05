import { describe, it, expect } from "vitest";
import { deepMerge, newSlideId } from "@/lib/utils";

describe("deepMerge", () => {
  it("merges flat properties", () => {
    const base = { a: 1, b: 2 };
    const result = deepMerge(base, { b: 99 });
    expect(result).toEqual({ a: 1, b: 99 });
  });

  it("does not mutate the base object", () => {
    const base = { a: 1, b: 2 };
    deepMerge(base, { a: 99 });
    expect(base.a).toBe(1);
  });

  it("deep-merges nested plain objects (1 level)", () => {
    const base = { style: { fontSize: 48, color: "#fff" }, visible: true };
    const result = deepMerge(base, { style: { color: "#000" } });
    expect(result.style).toEqual({ fontSize: 48, color: "#000" });
    expect(result.visible).toBe(true);
  });

  it("does NOT deep-merge arrays — overrides them wholesale", () => {
    const base = { lines: ["a", "b"] };
    const result = deepMerge(base, { lines: ["c"] });
    expect(result.lines).toEqual(["c"]);
  });

  it("skips undefined override values", () => {
    const base = { x: 10, y: 20 };
    const result = deepMerge(base, { x: undefined });
    expect(result.x).toBe(10);
  });

  it("treats null override as a plain value (not deep-merged)", () => {
    const base = { nested: { a: 1 }, flag: true };
    const result = deepMerge(base, { nested: null as unknown as { a: number } });
    expect(result.nested).toBeNull();
  });
});

describe("newSlideId", () => {
  it("returns a non-empty string", () => {
    expect(typeof newSlideId()).toBe("string");
    expect(newSlideId().length).toBeGreaterThan(0);
  });

  it("starts with 'slide_'", () => {
    expect(newSlideId()).toMatch(/^slide_/);
  });

  it("generates unique IDs on successive calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newSlideId()));
    expect(ids.size).toBe(20);
  });
});
