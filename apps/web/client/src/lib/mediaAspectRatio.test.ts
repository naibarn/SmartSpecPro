import { describe, expect, it } from "vitest";
import {
  inferMediaAspectRatio,
  parseMediaAspectRatio,
} from "./mediaAspectRatio";

describe("mediaAspectRatio", () => {
  it("classifies portrait, landscape, and square dimensions", () => {
    expect(inferMediaAspectRatio(1080, 1920)).toBe("9:16");
    expect(inferMediaAspectRatio(1920, 1080)).toBe("16:9");
    expect(inferMediaAspectRatio(1024, 1024)).toBe("1:1");
  });

  it("rejects unusable dimensions", () => {
    expect(inferMediaAspectRatio(0, 1080)).toBeNull();
    expect(inferMediaAspectRatio(Number.NaN, 1080)).toBeNull();
  });

  it("normalizes persisted ratio values", () => {
    expect(parseMediaAspectRatio(" 9 / 16 ")).toBe("9:16");
    expect(parseMediaAspectRatio("landscape")).toBe("16:9");
    expect(parseMediaAspectRatio("unknown")).toBeNull();
  });
});
