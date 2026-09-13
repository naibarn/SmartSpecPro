import { describe, expect, it } from "vitest";
import {
  getPreviewCanvasProfile,
  normalizePreviewAspectRatio,
} from "../../src/types/nleProject";

describe("preview canvas profile", () => {
  it.each([
    ["9:16", "9:16", 1080, 1920],
    ["16:9", "16:9", 1920, 1080],
    ["1:1", "1:1", 1080, 1080],
    ["4:5", "4:5", 1080, 1350],
    ["21:9", "21:9", 2560, 1080],
  ])("keeps the %s export boundary visible", (value, ratio, width, height) => {
    const profile = getPreviewCanvasProfile(value);
    expect(profile).toMatchObject({ aspectRatio: ratio, width, height });
    expect(profile.label).toContain(ratio);
  });

  it("falls back safely for unsupported persisted canvas values", () => {
    expect(normalizePreviewAspectRatio("custom", "source")).toBe("custom");
    expect(normalizePreviewAspectRatio(undefined, "16:9")).toBe("16:9");
    expect(getPreviewCanvasProfile("unsupported").aspectRatio).toBe("9:16");
  });
});
