import { describe, expect, it } from "vitest";
import MediaHistory from "./MediaHistory";

describe("MediaHistory module", () => {
  it("imports successfully", () => {
    expect(typeof MediaHistory).toBe("function");
  });
});
