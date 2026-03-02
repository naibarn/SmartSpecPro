import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  audioTrackInputSchema,
  presentationExportStatusResultSchema,
  presentationRenderSpecSchema,
  presentationSlideContentSchema,
  projectAudioTrackInputSchema,
  resolvedAudioTrackSchema,
  resolvedProjectAudioTrackSchema,
} from "./contracts";
import {
  PRESENTATION_EXPORT_SCHEMA_VERSION,
  PRESENTATION_RENDER_SCHEMA_VERSION,
} from "./constants";
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

describe("audio track and export contract schemas", () => {
  it("audioTrackInputSchema parses valid input with libraryItemId", () => {
    const result = audioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 0.8, startAtMs: 0 });
    expect(result.success).toBe(true);
  });

  it("audioTrackInputSchema rejects volume > 1.0", () => {
    const result = audioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 1.5, startAtMs: 0 });
    expect(result.success).toBe(false);
  });

  it("audioTrackInputSchema rejects negative libraryItemId", () => {
    const result = audioTrackInputSchema.safeParse({ libraryItemId: -1, volume: 0.5, startAtMs: 0 });
    expect(result.success).toBe(false);
  });

  it("audioTrackInputSchema accepts null endAtMs (play to end)", () => {
    const result = audioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 0.5, startAtMs: 0, endAtMs: null });
    expect(result.success).toBe(true);
  });

  it("projectAudioTrackInputSchema parses with loop and null fadeOutMs", () => {
    const result = projectAudioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 0.5, loop: true, fadeOutMs: null });
    expect(result.success).toBe(true);
  });

  it("projectAudioTrackInputSchema accepts start/end trim values", () => {
    const result = projectAudioTrackInputSchema.safeParse({
      libraryItemId: 1,
      volume: 0.5,
      startAtMs: 1500,
      endAtMs: 7500,
      loop: false,
      fadeOutMs: null,
    });
    expect(result.success).toBe(true);
  });

  it("resolvedAudioTrackSchema accepts url field", () => {
    const result = resolvedAudioTrackSchema.safeParse({ url: "https://example.com/audio.mp3", volume: 0.8, startAtMs: 0 });
    expect(result.success).toBe(true);
  });

  it("resolvedAudioTrackSchema rejects input without url", () => {
    const result = resolvedAudioTrackSchema.safeParse({ volume: 0.8, startAtMs: 0 });
    expect(result.success).toBe(false);
  });

  it("resolvedAudioTrackSchema rejects unknown fields (strict schema)", () => {
    const result = resolvedAudioTrackSchema.safeParse({
      url: "https://example.com/audio.mp3",
      volume: 0.8,
      startAtMs: 0,
      libraryItemId: 1,
    });
    expect(result.success).toBe(false);
  });

  it("resolvedProjectAudioTrackSchema parses with url, loop, and null fadeOutMs", () => {
    const result = resolvedProjectAudioTrackSchema.safeParse({
      url: "https://cdn.example.com/bg.mp3",
      volume: 0.3,
      loop: true,
      fadeOutMs: null,
    });
    expect(result.success).toBe(true);
  });

  it("presentationExportStatusResultSchema parses exportId as number", () => {
    const result = presentationExportStatusResultSchema.safeParse({
      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
      exportId: 42,
      status: "queued",
      format: "png",
      updatedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("presentationExportStatusResultSchema rejects exportId as string", () => {
    const result = presentationExportStatusResultSchema.safeParse({
      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
      exportId: "abc",
      status: "queued",
      format: "png",
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("presentationExportStatusResultSchema accepts status cancelled", () => {
    const result = presentationExportStatusResultSchema.safeParse({
      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
      exportId: 7,
      status: "cancelled",
      format: "mp4",
      updatedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("presentationExportStatusResultSchema accepts relative downloadUrl", () => {
    const result = presentationExportStatusResultSchema.safeParse({
      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
      exportId: 8,
      status: "done",
      format: "png",
      downloadUrl: "/api/v1/presentations/export/files/12/task.zip?token=abc",
      updatedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("presentationExportStatusResultSchema rejects non-url downloadUrl", () => {
    const result = presentationExportStatusResultSchema.safeParse({
      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
      exportId: 9,
      status: "done",
      format: "pdf",
      downloadUrl: "not-a-url",
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("presentationRenderSpecSchema accepts format jpg", () => {
    const result = presentationRenderSpecSchema.safeParse({
      schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
      deckId: 1,
      format: "jpg",
      width: 1920,
      height: 1080,
      fps: 30,
      slides: [],
    });
    expect(result.success).toBe(true);
  });

  it("presentationRenderSpecSchema accepts format pdf", () => {
    const result = presentationRenderSpecSchema.safeParse({
      schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
      deckId: 1,
      format: "pdf",
      width: 1920,
      height: 1080,
      fps: 30,
      slides: [],
    });
    expect(result.success).toBe(true);
  });

  it("presentationRenderSpecSchema rejects unknown format", () => {
    const result = presentationRenderSpecSchema.safeParse({
      schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
      deckId: 1,
      format: "docx",
      width: 1920,
      height: 1080,
      fps: 30,
      slides: [],
    });
    expect(result.success).toBe(false);
  });
});
