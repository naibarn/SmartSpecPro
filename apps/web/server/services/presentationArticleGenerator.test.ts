import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(),
}));
vi.mock("./skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn(),
}));
vi.mock("./skillModelFallback", () => ({
  executeSkillLlmWithFallback: vi.fn(),
}));
vi.mock("./skillExecutor", () => ({
  executeSkill: vi.fn(),
}));
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));
vi.mock("./sandbox/artifactAccess", () => ({
  getJobArtifactUrls: vi.fn(),
}));
vi.mock("../storage", () => ({
  storageReadText: vi.fn(),
}));
vi.mock("../_core/tokens", () => ({
  createInternalTokenFromAuth: vi.fn(() => "internal-token"),
}));

import {
  buildPresentationArticlePrompt,
  buildPresentationImagePromptPlanPrompt,
  buildPresentationSlideRequestPayload,
  estimatePresentationMaxPages,
  generatePresentationSlideDraft,
  normalizeGeneratedPresentationArticle,
} from "./presentationArticleGenerator";
import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { executeSkill } from "./skillExecutor";
import { getDb } from "../db";
import { getJobArtifactUrls } from "./sandbox/artifactAccess";
import { storageReadText } from "../storage";

function makeSlideSkill(overrides: Record<string, unknown> = {}) {
  return {
    id: "modern-editorial-slide",
    name: "Modern Editorial Slide",
    category: "slide_generation",
    executionMode: "sandbox-command",
    systemPrompt: "Return clean slide JSON.",
    executionPolicy: null,
    ...overrides,
  };
}

function makeSlideDraftInput() {
  return {
    tenantId: "tenant-1",
    userId: 7,
    topic: "Product Pitch",
    article: "Product Pitch\n\n1. Problem\n\n2. Solution",
    slideSkillId: "modern-editorial-slide",
    preferredLanguage: "en" as const,
    requiresThinking: false,
    targetImageCount: 8,
    canvasRatio: "16:9" as const,
    outputFormats: ["json", "pptx"] as const,
    maxPages: 4,
    imageAssets: [
      {
        id: "img-1-1",
        pageNumber: 1,
        imageIndex: 1,
        placementRole: "hero" as const,
        shortLabel: "cover hero",
        prompt: "Cover image prompt",
        url: "https://cdn.example.com/cover.png",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill() as any);
  vi.mocked(resolveSkillExecutionPolicy).mockResolvedValue({ modelId: "gpt-5.4" } as any);
  vi.mocked(executeSkill).mockResolvedValue({
    success: true,
    jobId: "job-default-slide-artifact",
  } as any);
  vi.mocked(getDb).mockResolvedValue({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ status: "completed" }],
        }),
      }),
    }),
  } as any);
  vi.mocked(getJobArtifactUrls).mockResolvedValue([
    {
      artifactId: 1,
      url: "https://cdn.example.com/layout-spec.json",
      key: "sandbox-artifacts/job-default-slide-artifact/001-layout-spec.json",
      mimeType: "application/json",
      isPrimary: false,
    },
    {
      artifactId: 2,
      url: "https://cdn.example.com/generated-deck.pptx",
      key: "sandbox-artifacts/job-default-slide-artifact/002-slides.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      isPrimary: true,
    },
  ] as any);
  vi.mocked(storageReadText).mockImplementation(async (key: string) => {
    if (key.endsWith("layout-spec.json")) {
      return JSON.stringify({
        canvas: { ratio: "16:9" },
        slides: [
          {
            elements: [
              {
                kind: "text",
                role: "title",
                text: "Sandbox Layout Slide",
                xPct: 10,
                yPct: 10,
                wPct: 50,
                hPct: 10,
              },
            ],
          },
        ],
      });
    }
    return "";
  });
  vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
    success: true,
    content: JSON.stringify({
      canvas: { ratio: "16:9" },
      slides: [
        {
          elements: [
            {
              kind: "text",
              text: "Imported slide",
            },
          ],
        },
      ],
    }),
    modelId: "gpt-5.4",
  } as any);
});

describe("presentationArticleGenerator", () => {
  it("builds a prompt that keeps the requested image count in range", () => {
    const prompt = buildPresentationArticlePrompt({
      topic: "Thai parenting nutrition guide",
      preferredLanguage: "en",
      requiresThinking: true,
      requiresWebSearch: false,
      targetImageCount: 12,
    });

    expect(prompt).toContain("Supporting image plan: 12 images");
    expect(prompt).toContain("Organize the article into 12 numbered sections");
    expect(prompt).toContain("Thinking mode: Use deeper reasoning before writing.");
    expect(prompt).toContain("Preferred language: English");
    expect(prompt).toContain("Language code: en");
    expect(prompt).toContain("Write the entire article in English.");
  });

  it("normalizes html and fenced responses into plain article text", () => {
    const normalized = normalizeGeneratedPresentationArticle(`
      \`\`\`html
      <article><h1>My Title</h1><p>Lead paragraph.</p><p>Body copy.</p></article>
      \`\`\`
    `);

    expect(normalized).toContain("My Title");
    expect(normalized).toContain("Lead paragraph.");
    expect(normalized).not.toContain("<article>");
    expect(normalized).not.toContain("```");
  });

  it("removes common markdown emphasis from generated article text", () => {
    const normalized = normalizeGeneratedPresentationArticle(`
      # Baby Sleep Guide

      1. **Create a calm room**

      Use a dark room and a steady bedtime routine.
    `);

    expect(normalized).toContain("Baby Sleep Guide");
    expect(normalized).toContain("1. Create a calm room");
    expect(normalized).not.toContain("**");
    expect(normalized).not.toContain("# Baby");
  });

  it("estimates slide pages from a structured article", () => {
    const maxPages = estimatePresentationMaxPages(`
      Healthy Baby Weight Gain

      Lead paragraph with context.

      1. Nutrition basics for newborns.

      2. Breastfeeding frequency and cues.

      3. Formula considerations and tracking.

      4. Sleep, hydration, and warning signs.
    `, "en");

    expect(maxPages).toBeGreaterThanOrEqual(5);
    expect(maxPages).toBeLessThanOrEqual(20);
  });

  it("builds image prompt planning instructions that preserve page and image targets", () => {
    const prompt = buildPresentationImagePromptPlanPrompt({
      topic: "คู่มือการดูแลทารก",
      article: "บทความตัวอย่าง",
      preferredLanguage: "th",
      maxPages: 6,
      plannedImageCount: 10,
      canvasRatio: "9:16",
      imagePromptContext: "เด็กไทย บ้านไทย",
      slideSkillName: "Modern Editorial Slide",
    });

    expect(prompt).toContain("Target max pages: 6");
    expect(prompt).toContain("Target image prompts: 10");
    expect(prompt).toContain("Canvas ratio: 9:16");
    expect(prompt).toContain("Slide skill: Modern Editorial Slide");
    expect(prompt).toContain("Language code: th");
  });

  it("builds slide skill payloads with image pool and always includes json output", () => {
    const payload = buildPresentationSlideRequestPayload({
      topic: "Product Pitch",
      article: [
        "Product Pitch",
        "",
        "Lead paragraph for the deck.",
        "",
        "1. Problem",
        "",
        "Customers lose time switching between tools.",
        "",
        "2. Solution",
        "",
        "A unified workspace keeps the workflow in one place.",
      ].join("\n"),
      preferredLanguage: "en",
      canvasRatio: "16:9",
      outputFormats: ["pptx"],
      maxPages: 6,
      imageAssets: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "Premium editorial cover image",
          url: "https://cdn.example.com/cover.png",
        },
      ],
    });

    expect(payload.request.outputFormats).toEqual(["json", "pptx"]);
    expect(payload.request.pagination.maxPages).toBe(6);
    expect(payload.request.content.pages?.[0]?.text).toContain("Lead paragraph for the deck.");
    expect(payload.request.content.pages?.[0]?.images).toHaveLength(1);
    expect(payload.request.content.pages?.[0]?.images?.[0]?.source).toBe("https://cdn.example.com/cover.png");
    expect(payload.request.content.pages?.[0]?.images?.[0]?.roleHint).toBe("hero");
    expect(payload.request.content.sharedImagePool?.images[0]?.source).toBe("https://cdn.example.com/cover.png");
  });

  it("pins generated images to their matching slide pages instead of using a global pool only", () => {
    const payload = buildPresentationSlideRequestPayload({
      topic: "คู่มือการนอนของทารก",
      article: [
        "คู่มือการนอนของทารก",
        "",
        "ย่อหน้าเกริ่นนำสำหรับภาพรวม",
        "",
        "1. สร้างสภาพแวดล้อมที่เหมาะสม",
        "",
        "ห้องนอนควรเงียบ แสงน้อย และอุณหภูมิสบาย",
        "",
        "2. จัดการการหลับกลางวัน",
        "",
        "หลีกเลี่ยงการให้นอนกลางวันมากเกินไปใกล้เวลาเข้านอน",
      ].join("\n"),
      preferredLanguage: "th",
      canvasRatio: "16:9",
      outputFormats: ["json"],
      maxPages: 3,
      imageAssets: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "1.1 hero",
          prompt: "Intro image",
          url: "https://cdn.example.com/intro.png",
        },
        {
          id: "img-2-1",
          pageNumber: 2,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "2.1 hero",
          prompt: "Sleep environment image",
          url: "https://cdn.example.com/environment.png",
        },
        {
          id: "img-3-1",
          pageNumber: 3,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "3.1 hero",
          prompt: "Nap timing image",
          url: "https://cdn.example.com/nap.png",
        },
      ],
    });

    expect(payload.request.content.pages?.map((page) => page.images?.[0]?.source)).toEqual([
      "https://cdn.example.com/intro.png",
      "https://cdn.example.com/environment.png",
      "https://cdn.example.com/nap.png",
    ]);
    expect(payload.request.content.pages?.[1]?.text).toContain("สร้างสภาพแวดล้อมที่เหมาะสม");
    expect(payload.request.content.pages?.[2]?.text).toContain("จัดการการหลับกลางวัน");
  });

  it("assigns different forced archetypes across manual pages so slide layouts do not collapse into one repeated shape", () => {
    const payload = buildPresentationSlideRequestPayload({
      topic: "คู่มือการนอนของทารก",
      article: [
        "คู่มือการนอนของทารก",
        "",
        "ย่อหน้าเกริ่นนำสำหรับภาพรวม",
        "",
        "1. สร้างสภาพแวดล้อมที่เหมาะสม",
        "",
        "ห้องนอนควรเงียบ แสงน้อย และอุณหภูมิสบาย",
        "",
        "2. กำหนดเวลานอนที่สม่ำเสมอ",
        "",
        "สร้างกิจวัตรก่อนนอน อ่านนิทาน และลดกิจกรรมที่กระตุ้นมากเกินไป",
        "",
        "3. จัดการการหลับกลางวัน",
        "",
        "หลีกเลี่ยงการให้นอนกลางวันมากเกินไปใกล้เวลาเข้านอน",
      ].join("\n"),
      preferredLanguage: "th",
      canvasRatio: "4:5",
      outputFormats: ["json"],
      maxPages: 4,
      imageAssets: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "1.1 hero",
          prompt: "Intro image",
          url: "https://cdn.example.com/intro.png",
        },
        {
          id: "img-2-1",
          pageNumber: 2,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "2.1 hero",
          prompt: "Sleep environment image",
          url: "https://cdn.example.com/environment.png",
        },
        {
          id: "img-3-1",
          pageNumber: 3,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "3.1 hero",
          prompt: "Bedtime routine image",
          url: "https://cdn.example.com/routine.png",
        },
        {
          id: "img-4-1",
          pageNumber: 4,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "4.1 hero",
          prompt: "Nap timing image",
          url: "https://cdn.example.com/nap.png",
        },
      ],
    });

    expect(payload.request.randomizeLayouts).toBe(false);
    expect(payload.request.content.pages?.map((page) => page.forceArchetype)).toEqual([
      "editorial_cover_split",
      "product_overview_report",
      "title_hero_split",
      "two_column_editorial",
    ]);
  });

  it("returns importable slide json even when PPTX artifact generation fails", async () => {
    vi.mocked(executeSkill).mockResolvedValue({
      success: false,
      error: "Slide artifact generation failed (failed)",
    } as any);

    const result = await generatePresentationSlideDraft(makeSlideDraftInput());

    expect(result.slideJson).toContain("\"slides\"");
    expect(result.artifactJobId).toBeNull();
    expect(result.artifacts).toEqual([]);
    expect(result.downloadUrl).toBeNull();
    expect(result.artifactFailureMessage).toBe("Slide artifact generation failed (failed)");
  });

  it("uses sandbox-generated layout json as the primary source for sandbox-command slide skills", async () => {
    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      outputFormats: ["json"] as const,
    });

    expect(executeSkill).toHaveBeenCalledTimes(1);
    expect(executeSkillLlmWithFallback).not.toHaveBeenCalled();
    expect(result.slideJson).toContain("Sandbox Layout Slide");
    expect(result.artifactJobId).toBeNull();
  });

  it("still throws when artifact generation fails and the returned slide json is not importable", async () => {
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: "{\"slides\":[]}",
      modelId: "gpt-5.4",
    } as any);
    vi.mocked(executeSkill).mockResolvedValue({
      success: false,
      error: "Slide artifact generation failed (failed)",
    } as any);

    await expect(generatePresentationSlideDraft(makeSlideDraftInput()))
      .rejects.toThrow("Slide artifact generation failed (failed)");
  });

  it("normalizes wrapped layoutSpec json into importable slide json", async () => {
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        normalizedContent: {
          topic: "Sleep Training",
        },
        slidePlan: [
          {
            title: "Wrapped Layout Slide",
          },
        ],
        layoutSpec: {
          canvas: { ratio: "16:9" },
          slides: [
            {
              elements: [
                {
                  kind: "text",
                  role: "title",
                  text: "Wrapped Layout Slide",
                  xPct: 10,
                  yPct: 10,
                  wPct: 50,
                  hPct: 10,
                },
              ],
            },
          ],
        },
      }),
      modelId: "gpt-5.4",
    } as any);
    vi.mocked(executeSkill).mockResolvedValue({
      success: false,
      error: "Slide artifact generation failed (failed)",
    } as any);

    const result = await generatePresentationSlideDraft(makeSlideDraftInput());

    expect(result.slideJson).toContain("\"slides\"");
    expect(result.slideJson).not.toContain("\"layoutSpec\"");
    expect(result.slideJson).toContain("Wrapped Layout Slide");
  });

  it("prefers an importable layout json artifact over manifest.json", async () => {
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: "{\"slides\":[]}",
      modelId: "gpt-5.4",
    } as any);
    vi.mocked(executeSkill).mockResolvedValue({
      success: true,
      jobId: "job-layout-artifact-1",
    } as any);
    vi.mocked(getDb).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ status: "completed" }],
          }),
        }),
      }),
    } as any);
    vi.mocked(getJobArtifactUrls).mockResolvedValue([
      {
        artifactId: 1,
        url: "https://cdn.example.com/manifest.json",
        key: "sandbox-artifacts/job-layout-artifact-1/000-manifest.json",
        mimeType: "application/json",
        isPrimary: false,
      },
      {
        artifactId: 2,
        url: "https://cdn.example.com/layout-spec.json",
        key: "sandbox-artifacts/job-layout-artifact-1/001-layout-spec.json",
        mimeType: "application/json",
        isPrimary: false,
      },
      {
        artifactId: 3,
        url: "https://cdn.example.com/generated-deck.pptx",
        key: "sandbox-artifacts/job-layout-artifact-1/002-slides.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        isPrimary: true,
      },
    ] as any);
    vi.mocked(storageReadText).mockImplementation(async (key: string) => {
      if (key.endsWith("manifest.json")) {
        return "{\"outputs\":{\"pptx\":\"slides.pptx\"}}";
      }
      if (key.endsWith("layout-spec.json")) {
        return JSON.stringify({
          canvas: { ratio: "16:9" },
          slides: [
            {
              elements: [
                {
                  kind: "text",
                  role: "title",
                  text: "Artifact Layout Slide",
                  xPct: 10,
                  yPct: 10,
                  wPct: 50,
                  hPct: 10,
                },
              ],
            },
          ],
        });
      }
      return "";
    });

    const result = await generatePresentationSlideDraft(makeSlideDraftInput());

    expect(result.slideJson).toContain("Artifact Layout Slide");
    expect(result.downloadUrl).toBe("https://cdn.example.com/generated-deck.pptx");
  });
});
