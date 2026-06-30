import { afterEach, describe, expect, it, vi } from "vitest";
import { detectGridFromDimensions, loadImage } from "./imageGridSplitter";

const originalImage = globalThis.Image;

afterEach(() => {
  globalThis.Image = originalImage;
  vi.restoreAllMocks();
});

describe("detectGridFromDimensions", () => {
  it("prefers the 3x3 storyboard default for portrait storyboard dimensions", () => {
    const detected = detectGridFromDimensions(768, 1376);

    expect(detected).toMatchObject({
      rows: 3,
      cols: 3,
    });
    expect(detected?.confidence).toBeGreaterThanOrEqual(0.66);
  });

  it("keeps non-default grids only when line evidence is strong", () => {
    const detected = detectGridFromDimensions(768, 1376, {
      "3x3": { available: true, combined: 0.05 },
      "4x2": { available: true, combined: 0.95 },
    });

    expect(detected).toMatchObject({
      rows: 4,
      cols: 2,
    });
    expect(detected?.confidence).toBeGreaterThanOrEqual(0.74);
  });

  it("returns null for weak ambiguous non-default evidence so callers can fall back to 3x3", () => {
    const detected = detectGridFromDimensions(1536, 768, {
      "2x4": { available: true, combined: 0.12 },
      "3x3": { available: true, combined: 0.08 },
    });

    expect(detected).toBeNull();
  });
});

describe("loadImage", () => {
  it("falls back to the same-origin image proxy when a remote image is blocked by CORS", async () => {
    const loadedSources: string[] = [];

    class MockImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        loadedSources.push(value);
        queueMicrotask(() => {
          if (value.startsWith("/api/media/image-proxy")) {
            this.onload?.();
          } else {
            this.onerror?.();
          }
        });
      }
    }

    globalThis.Image = MockImage as unknown as typeof Image;

    await expect(loadImage("https://cdn.example.com/reference-sheet.png")).resolves.toBeInstanceOf(MockImage);

    expect(loadedSources).toEqual([
      "https://cdn.example.com/reference-sheet.png",
      "/api/media/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Freference-sheet.png",
    ]);
  });
});
