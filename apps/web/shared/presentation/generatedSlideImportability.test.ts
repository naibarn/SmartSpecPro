import { describe, expect, it } from "vitest";

import {
  inspectGeneratedSlideImportability,
  countImportableGeneratedSlides,
  hasImportableGeneratedSlides,
} from "./generatedSlideImportability";

describe("generatedSlideImportability", () => {
  it("treats wrapped layoutSpec json with real elements as importable", () => {
    const raw = JSON.stringify({
      layoutSpec: {
        slides: [
          {
            elements: [
              { kind: "text", text: "Hello" },
            ],
          },
        ],
      },
    });

    expect(hasImportableGeneratedSlides(raw)).toBe(true);
    expect(countImportableGeneratedSlides(raw)).toBe(1);
  });

  it("treats image-only full-slide decks as importable", () => {
    const raw = JSON.stringify({
      canvas: { ratio: "9:16" },
      slides: [
        {
          title: "Full-slide image",
          elements: [
            {
              kind: "image",
              source: "https://cdn.example.com/full-slide.png",
              xPct: 0,
              yPct: 0,
              wPct: 100,
              hPct: 100,
              fit: "cover",
            },
          ],
        },
      ],
    });

    expect(hasImportableGeneratedSlides(raw)).toBe(true);
    expect(countImportableGeneratedSlides(raw)).toBe(1);
  });

  it("rejects slide json when slides exist but every slide is empty", () => {
    const raw = JSON.stringify({
      slides: [
        { title: "Empty 1", elements: [] },
        { title: "Empty 2", elements: [] },
      ],
    });

    expect(hasImportableGeneratedSlides(raw)).toBe(false);
    expect(countImportableGeneratedSlides(raw)).toBe(0);
  });

  it("reports malformed and missing-slides states for debug traces", () => {
    expect(inspectGeneratedSlideImportability("not json")).toEqual({
      status: "malformed",
      totalSlides: 0,
      importableSlides: 0,
    });

    expect(inspectGeneratedSlideImportability(JSON.stringify({
      request: { projectTitle: "Deck" },
    }))).toEqual({
      status: "missing-slides",
      totalSlides: 0,
      importableSlides: 0,
    });
  });

  it("prefers render_manifest_json pages over empty summary slides when both exist", () => {
    const raw = JSON.stringify({
      output_format: "render_manifest_json",
      slides: [
        { title: "summary-only", elements: [] },
        { title: "summary-only-2", elements: [] },
      ],
      pages: [
        {
          text_blocks: [
            {
              id: "p1_title",
              content: "Hello",
            },
          ],
          image_blocks: [],
        },
        {
          text_blocks: [],
          image_blocks: [
            {
              id: "p2_image",
              reference: "Hero",
            },
          ],
        },
      ],
    });

    expect(inspectGeneratedSlideImportability(raw)).toEqual({
      status: "importable",
      totalSlides: 2,
      importableSlides: 2,
    });
  });

  it("prefers nested manifest candidates over empty top-level slides", () => {
    const raw = JSON.stringify({
      slides: [
        { title: "summary-only", elements: [] },
        { title: "summary-only-2", elements: [] },
      ],
      result: {
        output_format: "render_manifest_json",
        pages: [
          {
            text_blocks: [{ id: "p1_title", content: "Nested page" }],
            image_blocks: [],
          },
        ],
      },
    });

    expect(inspectGeneratedSlideImportability(raw)).toEqual({
      status: "importable",
      totalSlides: 1,
      importableSlides: 1,
    });
  });

  it("treats render_manifest_json pages with legacy blocks arrays as importable", () => {
    const raw = JSON.stringify({
      output_format: "render_manifest_json",
      pages: [
        {
          page: 1,
          role: "cover",
          title: "Legacy block page",
          layout: "hero_text_stack",
          quality: { occupancy: 0.81, whitespace: 0.19, fitness: 90 },
          blocks: [
            {
              type: "title",
              x: 72,
              y: 68,
              w: 936,
              h: 140,
              size: 62,
              weight: 700,
              align: "center",
              text: "Legacy block page",
            },
            {
              type: "image",
              x: 88,
              y: 244,
              w: 904,
              h: 576,
              label: "Cover hero image",
              radius: 0,
            },
          ],
        },
      ],
    });

    expect(inspectGeneratedSlideImportability(raw)).toEqual({
      status: "importable",
      totalSlides: 1,
      importableSlides: 1,
    });
  });

  it("treats summary slides with headline/body_text/image as importable after conversion", () => {
    const raw = JSON.stringify({
      page_size_or_ratio: "1080x1920",
      slides: [
        {
          page_number: 1,
          headline: "Summary headline",
          body_text: "Summary body",
          image: {
            reference: "https://cdn.example.com/hero.png",
          },
        },
      ],
    });

    expect(inspectGeneratedSlideImportability(raw)).toEqual({
      status: "importable",
      totalSlides: 1,
      importableSlides: 1,
    });
  });

  it("treats fallback pages with title hints, text, and images as importable", () => {
    const raw = JSON.stringify({
      pages: [
        {
          page_number: 1,
          title_hint: "Fallback page",
          text: "Fallback page\n\nGenerated as plain pages by the repair pass.",
          images: [
            {
              reference: "https://cdn.example.com/fallback.png",
            },
          ],
        },
      ],
    });

    expect(inspectGeneratedSlideImportability(raw)).toEqual({
      status: "importable",
      totalSlides: 1,
      importableSlides: 1,
    });
  });
});
