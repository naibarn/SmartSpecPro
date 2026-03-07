import { describe, expect, it } from "vitest";

import {
  buildPresentationDraftImportSegments,
  findPrimaryVisualElement,
  resolvePresentationSegmentDurationSeconds,
  type PresentationDraftImportSlide,
} from "../presentationDraftImport";
import type {
  PresentationPlayDeckPayload,
  PresentationSlideContent,
} from "@shared/presentation/contracts";

function createSlideContent(
  overrides: Partial<PresentationSlideContent> = {},
): PresentationSlideContent {
  return {
    elements: [],
    ...overrides,
  };
}

function createPlayDeck(
  overrides: Partial<PresentationPlayDeckPayload> = {},
): PresentationPlayDeckPayload {
  return {
    schemaVersion: "presentation_slideshow_v1",
    deckId: 99,
    generatedAt: new Date("2026-03-06T00:00:00.000Z"),
    slides: [],
    ...overrides,
  };
}

describe("presentationDraftImport", () => {
  it("prefers video elements over image elements", () => {
    const visual = findPrimaryVisualElement(
      createSlideContent({
        elements: [
          {
            id: "img-1",
            type: "image",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            src: "/images/cover.png",
            alt: "cover",
          },
          {
            id: "vid-1",
            type: "video",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            src: "/videos/scene.mp4",
          },
        ],
      }),
    );

    expect(visual?.type).toBe("video");
    expect(visual?.src).toBe("/videos/scene.mp4");
  });

  it("resolves duration from play deck before slide content", () => {
    const duration = resolvePresentationSegmentDurationSeconds(
      createSlideContent({ durationMs: 8_000 }),
      { durationMs: 12_500 },
    );

    expect(duration).toBe(8);
  });

  it("falls back to default 3 seconds when slide content has no explicit duration", () => {
    const duration = resolvePresentationSegmentDurationSeconds(
      createSlideContent(),
      { durationMs: 12_500 },
    );

    expect(duration).toBe(3);
  });

  it("builds sequential timeline segments and skips empty slides", () => {
    const slides: PresentationDraftImportSlide[] = [
      {
        id: 1,
        orderIndex: 0,
        title: "Blank",
        slideContent: createSlideContent(),
      },
      {
        id: 2,
        orderIndex: 1,
        title: "Intro",
        slideContent: createSlideContent({
          durationMs: 7_000,
          elements: [
            {
              id: "img-2",
              type: "image",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              src: "/images/intro.png",
              alt: "intro",
              imagePrompt: "thai market",
              imageModelId: "model-image",
              imageReferenceUrls: ["/refs/a.png"],
            },
          ],
        }),
      },
      {
        id: 3,
        orderIndex: 2,
        title: "Narration only",
        slideContent: createSlideContent(),
      },
    ];
    const playDeck = createPlayDeck({
      slides: [
        {
          slideId: 1,
          orderIndex: 0,
          title: "Blank",
          durationMs: 3_000,
          transition: "cut",
        },
        {
          slideId: 2,
          orderIndex: 1,
          title: "Intro",
          durationMs: 7_000,
          transition: "cut",
        },
        {
          slideId: 3,
          orderIndex: 2,
          title: "Narration only",
          durationMs: 4_000,
          transition: "cut",
          audioTrack: {
            url: "https://cdn.example.com/audio.mp3",
            volume: 1,
            startAtMs: 0,
          },
        },
      ],
    });

    const segments = buildPresentationDraftImportSegments({
      slides,
      playDeck,
      startTime: 10,
    });

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      slideId: 2,
      startTime: 10,
      duration: 7,
      hasExplicitDuration: true,
      visual: {
        type: "image",
        src: "/images/intro.png",
        prompt: "thai market",
        modelId: "model-image",
        referenceUrls: ["/refs/a.png"],
      },
      audio: null,
    });
    expect(segments[1]).toMatchObject({
      slideId: 3,
      startTime: 17,
      duration: 3,
      hasExplicitDuration: false,
      visual: null,
      audio: {
        url: "https://cdn.example.com/audio.mp3",
      },
    });
  });
});
