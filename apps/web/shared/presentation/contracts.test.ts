import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { presentationSlideContentSchema } from "./contracts";
import { normalizePresentationSlideContent } from "./normalizers";
import { validatePresentationSlideContent } from "./validators";

function readFixture<T = unknown>(fileName: string): T {
  const filePath = path.resolve(import.meta.dirname, "__fixtures__", fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

describe("presentation canvas v2 contracts", () => {
  it("accepts valid fixture payload for MVP object types", () => {
    const validFixture = readFixture("canvasV2-valid.json");
    const parsed = presentationSlideContentSchema.safeParse(validFixture);

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.elements : []).toHaveLength(4);
  });

  it("rejects invalid fixture payload with unsupported object type", () => {
    const invalidFixture = readFixture("canvasV2-invalid.json");
    const parsed = presentationSlideContentSchema.safeParse(invalidFixture);

    expect(parsed.success).toBe(false);
  });

  it("normalizes valid payload deterministically", () => {
    const validFixture = readFixture("canvasV2-valid.json");
    const first = normalizePresentationSlideContent(validFixture);
    const second = normalizePresentationSlideContent(validFixture);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("exposes deterministic validator result contract", () => {
    const validFixture = readFixture("canvasV2-valid.json");
    const invalidFixture = readFixture("canvasV2-invalid.json");

    const validResult = validatePresentationSlideContent(validFixture);
    const invalidResult = validatePresentationSlideContent(invalidFixture);

    expect(validResult.ok).toBe(true);
    expect(invalidResult.ok).toBe(false);
    if (!invalidResult.ok) {
      expect(invalidResult.code).toBe("PRESENTATION_SLIDE_CONTENT_INVALID");
      expect(invalidResult.issues.length).toBeGreaterThan(0);
    }
  });
});
