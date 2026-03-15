import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  expandPresentationSlideContentForCompatibility,
  getPresentationSlideRenderableElements,
  audioTrackInputSchema,
  presentationExportStatusResultSchema,
  presentationMediaMotionSchema,
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

  it("presentationRenderSpecSchema accepts optional hasDynamicVideo flag", () => {
    const result = presentationRenderSpecSchema.safeParse({
      schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
      deckId: 1,
      format: "mp4",
      width: 1920,
      height: 1080,
      fps: 30,
      hasDynamicVideo: true,
      slides: [],
    });
    expect(result.success).toBe(true);
  });

  it("presentationMediaMotionSchema accepts directional and diagonal pan presets", () => {
    const result = presentationMediaMotionSchema.safeParse({
      preset: "pan-up-left",
      intensity: 0.5,
      easing: "linear",
      timingMode: "duration",
      durationMs: 2000,
    });

    expect(result.success).toBe(true);
  });

  it("presentationMediaMotionSchema accepts segmented intro/outro timing configuration", () => {
    const result = presentationMediaMotionSchema.safeParse({
      intro: {
        preset: "zoom-in",
        intensity: 0.5,
        easing: "linear",
        timingMode: "until-slide-end",
      },
      outro: {
        preset: "pan-down-right",
        intensity: 0.8,
        easing: "ease-in-out",
        timingMode: "duration",
        durationMs: 1500,
      },
    });

    expect(result.success).toBe(true);
  });

  it("presentationMediaMotionSchema rejects unsupported presets", () => {
    const result = presentationMediaMotionSchema.safeParse({
      preset: "spin",
      intensity: 0.5,
      easing: "linear",
    });

    expect(result.success).toBe(false);
  });

  it("presentationSlideContentSchema accepts image/video elements with media motion", () => {
    const result = presentationSlideContentSchema.safeParse({
      elements: [
        {
          id: "img-1",
          type: "image",
          x: 0,
          y: 0,
          width: 320,
          height: 180,
          src: "https://example.com/image.jpg",
          alt: "Image",
          mediaMotion: {
            intro: { preset: "zoom-in", intensity: 0.4, timingMode: "until-slide-end" },
            outro: { preset: "pan-right", intensity: 0.5, durationMs: 1200 },
          },
        },
        {
          id: "vid-1",
          type: "video",
          x: 20,
          y: 20,
          width: 480,
          height: 270,
          src: "https://example.com/video.mp4",
          mediaMotion: { preset: "pan-right", intensity: 0.7, easing: "linear" },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("presentationSlideContentSchema accepts first-class component instances with slot bindings and preview metadata", () => {
    const result = presentationSlideContentSchema.safeParse({
      elements: [],
      components: [
        {
          id: "component-1",
          componentId: "profile-summary",
          componentType: "profile_summary",
          definitionRevision: 7,
          slotBindings: [
            { slotId: "title", type: "text", text: "Adora Montminy" },
            { slotId: "avatar", type: "image", src: "https://example.com/avatar.jpg", alt: "Portrait" },
            { slotId: "highlights", type: "list", items: ["Marketing", "Digital Strategy"] },
          ],
          fallbackElements: [
            {
              id: "fallback-title",
              type: "text",
              x: 120,
              y: 140,
              width: 420,
              height: 90,
              text: "Adora Montminy",
              color: "#0f172a",
            },
          ],
          preview: {
            previewHash: "previewhash123",
            target: "library-card",
            status: "ready",
            artifactUri: "r2://presentation-previews/tenant-1/deck-1/slide-1/previewhash123/library-card.webp",
            rendererVersion: "renderer-v1",
            fontCatalogVersion: 1,
            definitionRevision: 7,
            createdAt: "2026-03-12T10:00:00.000Z",
            updatedAt: "2026-03-12T10:00:00.000Z",
            attemptCount: 1,
          },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("normalizePresentationSlideContent preserves components and fallback elements deterministically", () => {
    const input = {
      elements: [],
      components: [
        {
          id: "component-1",
          componentId: "quote-callout",
          componentType: "quote_callout",
          definitionRevision: 2,
          slotBindings: [
            { slotId: "quote", type: "text", text: "Quality comes from constraints." },
          ],
          fallbackElements: [
            {
              id: "quote-text",
              type: "text",
              x: 64,
              y: 96,
              width: 480,
              height: 120,
              text: "Quality comes from constraints.",
              color: "#111827",
              fontSize: 44,
            },
          ],
        },
      ],
    };

    const first = normalizePresentationSlideContent(input);
    const second = normalizePresentationSlideContent(input);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.components?.[0]?.fallbackElements?.[0]).toMatchObject({
      id: "quote-text",
      type: "text",
      text: "Quality comes from constraints.",
    });
  });

  it("normalizePresentationSlideContent preserves media shape and AI design metadata", () => {
    const input = {
      elements: [
        {
          id: "hero-image",
          type: "image",
          x: 0,
          y: 0,
          width: 400,
          height: 400,
          src: "https://cdn.example.com/hero.png",
          alt: "Hero",
          imageFit: "cover",
          mediaShape: "star",
          mediaCornerRadius: 42,
          imageExtraParams: { quality: "high" },
        },
      ],
      aiDesign: {
        source: "draft-with-ai",
        taskId: "task-1",
        mode: "structured_block",
        candidateModes: [
          { mode: "structured_block", score: 0.91, fitStatus: "fits", reason: "Compact slide fits the current density." },
          { mode: "long_form_block", score: 0.72, fitStatus: "cramped", reason: "Long-form is unnecessary for this copy.", blockedBy: "feature_flag" },
        ],
        modeLocked: false,
        userOverrideMode: null,
        fitScore: {
          overall: 0.91,
          density: 0.84,
          readability: 0.9,
          overflowRisk: 0.14,
          status: "fits",
        },
        compactionLevel: "balanced",
        componentRecipeId: "poster-spotlight",
        selectionMode: "heuristic",
        selectionReason: "Poster recipe best matched promo copy.",
        candidateRecipes: [
          { recipeId: "poster-spotlight", score: 9 },
          { recipeId: "framed-image-story", score: 5 },
        ],
        narrative: {
          title: "Campaign Spotlight",
          body: ["Priority support", "Premium access", "Join today"],
          notes: "Campaign launch with a clear CTA.",
          sections: [
            { heading: "Launch Week", details: ["Priority support", "Premium access"] },
          ],
          graphicCategory: "Business",
          templateId: "split_right_image",
        },
        sourceTrace: [
          { sourceId: "body-0", sourceType: "paragraph", disposition: "used", targetSlotId: "summary" },
          { sourceId: "section-0", sourceType: "section", disposition: "shortened", notes: "Condensed for compact block." },
        ],
        fallbackHistory: [
          { step: "retry_compaction", reason: "Initial draft exceeded compact summary budget.", timestamp: "2026-03-12T09:59:30.000Z" },
        ],
        mediaModeMetadata: {
          provider: "default-image-provider",
          modelId: "model-1",
          promptVersion: "presentation_full_slide_media_v1",
          visualIntent: "poster",
          thaiTextRisk: "low",
          reviewRequired: false,
          editableSourceRetained: true,
        },
        generatedAt: "2026-03-12T10:00:00.000Z",
      },
    };

    const normalized = normalizePresentationSlideContent(input);

    expect(normalized.elements[0]).toMatchObject({
      id: "hero-image",
      type: "image",
      mediaShape: "star",
      mediaCornerRadius: 42,
      imageExtraParams: { quality: "high" },
    });
    expect(normalized.aiDesign).toMatchObject({
      mode: "structured_block",
      componentRecipeId: "poster-spotlight",
      selectionMode: "heuristic",
    });
    expect(normalized.aiDesign?.candidateModes).toHaveLength(2);
    expect(normalized.aiDesign?.candidateRecipes).toHaveLength(2);
    expect(normalized.aiDesign?.sourceTrace).toHaveLength(2);
    expect(normalized.aiDesign?.fallbackHistory).toHaveLength(1);
    expect(normalized.aiDesign?.narrative).toMatchObject({
      title: "Campaign Spotlight",
      templateId: "split_right_image",
    });
  });

  it("expandPresentationSlideContentForCompatibility appends fallback elements from components", () => {
    const input = presentationSlideContentSchema.parse({
      elements: [
        {
          id: "standalone-text",
          type: "text",
          x: 10,
          y: 10,
          width: 120,
          height: 30,
          text: "Standalone",
          color: "#000000",
        },
      ],
      components: [
        {
          id: "component-1",
          componentId: "hero",
          componentType: "hero",
          definitionRevision: 3,
          slotBindings: [{ slotId: "title", type: "text", text: "Component title" }],
          fallbackElements: [
            {
              id: "component-title",
              type: "text",
              x: 40,
              y: 50,
              width: 400,
              height: 80,
              text: "Component title",
              color: "#111827",
            },
          ],
        },
      ],
    });

    const expanded = expandPresentationSlideContentForCompatibility(input);

    expect(expanded.slideContent.elements.map((element) => element.id)).toEqual([
      "component-title",
      "standalone-text",
    ]);
    expect(expanded.warnings).toEqual([]);
  });

  it("getPresentationSlideRenderableElements keeps component metadata while deriving fallback render order", () => {
    const input = presentationSlideContentSchema.parse({
      elements: [
        {
          id: "standalone-text",
          type: "text",
          x: 10,
          y: 10,
          width: 120,
          height: 30,
          text: "Standalone",
          color: "#000000",
        },
      ],
      components: [
        {
          id: "component-1",
          componentId: "hero",
          componentType: "hero",
          definitionRevision: 3,
          slotBindings: [{ slotId: "title", type: "text", text: "Component title" }],
          fallbackElements: [
            {
              id: "component-title",
              type: "text",
              x: 40,
              y: 50,
              width: 400,
              height: 80,
              text: "Component title",
              color: "#111827",
            },
          ],
        },
      ],
    });

    const renderable = getPresentationSlideRenderableElements(input);

    expect(renderable.elements.map((element) => element.id)).toEqual([
      "component-title",
      "standalone-text",
    ]);
    expect(input.components).toHaveLength(1);
    expect(input.elements.map((element) => element.id)).toEqual(["standalone-text"]);
    expect(renderable.warnings).toEqual([]);
  });

  it("uses mixed renderOrder to interleave elements and component fallback output", () => {
    const input = presentationSlideContentSchema.parse({
      elements: [
        {
          id: "headline",
          type: "text",
          x: 10,
          y: 10,
          width: 120,
          height: 30,
          text: "Headline",
          color: "#000000",
        },
      ],
      components: [
        {
          id: "component-1",
          componentId: "hero",
          componentType: "hero",
          definitionRevision: 3,
          slotBindings: [{ slotId: "title", type: "text", text: "Component title" }],
          fallbackElements: [
            {
              id: "component-title",
              type: "text",
              x: 40,
              y: 50,
              width: 400,
              height: 80,
              text: "Component title",
              color: "#111827",
            },
          ],
        },
      ],
      renderOrder: [
        "element:headline",
        "component:component-1",
      ],
    });

    const renderable = getPresentationSlideRenderableElements(input);
    const expanded = expandPresentationSlideContentForCompatibility(input);

    expect(renderable.elements.map((element) => element.id)).toEqual([
      "headline",
      "component-title",
    ]);
    expect(expanded.slideContent.renderOrder).toEqual([
      "element:headline",
      "element:component-title",
    ]);
  });

  it("applies renderOrder even when a slide has only loose elements", () => {
    const input = presentationSlideContentSchema.parse({
      elements: [
        {
          id: "first",
          type: "text",
          x: 0,
          y: 0,
          width: 100,
          height: 30,
          text: "First",
          color: "#000000",
        },
        {
          id: "second",
          type: "text",
          x: 0,
          y: 40,
          width: 100,
          height: 30,
          text: "Second",
          color: "#000000",
        },
      ],
      renderOrder: [
        "element:second",
        "element:first",
      ],
    });

    expect(getPresentationSlideRenderableElements(input).elements.map((element) => element.id)).toEqual([
      "second",
      "first",
    ]);
  });

  it("expandPresentationSlideContentForCompatibility warns when a component has no fallback elements", () => {
    const input = presentationSlideContentSchema.parse({
      elements: [],
      components: [
        {
          id: "component-1",
          componentId: "hero",
          componentType: "hero",
          definitionRevision: 3,
          slotBindings: [{ slotId: "title", type: "text", text: "Missing fallback" }],
          fallbackElements: [],
        },
      ],
    });

    const expanded = expandPresentationSlideContentForCompatibility(input);

    expect(expanded.slideContent.elements).toEqual([]);
    expect(expanded.warnings).toEqual([
      "component_fallback_missing:component-1",
    ]);
  });
});
