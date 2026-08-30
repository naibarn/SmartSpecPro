import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";

vi.mock("./skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(),
  syncSingleSkillIfChanged: vi.fn(),
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
vi.mock("./creditService", () => ({
  deductCredits: vi.fn(),
  deductCreditsForModel: vi.fn(),
}));

import {
  buildPresentationArticlePrompt,
  buildPresentationImagePromptPlanPrompt,
  buildPresentationSlideRequestPayload,
  estimatePresentationMaxPages,
  generatePresentationArticle,
  generatePresentationSlideDraft,
  normalizeGeneratedPresentationArticle,
  preparePresentationSlideBundle,
} from "./presentationArticleGenerator";
import { getSkillByIdAsync, syncSingleSkillIfChanged } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { executeSkill } from "./skillExecutor";
import { getDb } from "../db";
import { getJobArtifactUrls } from "./sandbox/artifactAccess";
import { storageReadText } from "../storage";
import { deductCredits, deductCreditsForModel } from "./creditService";

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

function collectSchemaCombinators(node: unknown, path = "root"): string[] {
  if (!node || typeof node !== "object") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => collectSchemaCombinators(entry, `${path}[${index}]`));
  }

  const record = node as Record<string, unknown>;
  const issues: string[] = [];
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      issues.push(`${path}.${key}`);
    }
  }

  if (record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)) {
    for (const [key, value] of Object.entries(record.properties as Record<string, unknown>)) {
      issues.push(...collectSchemaCombinators(value, `${path}.properties.${key}`));
    }
  }
  if (record.items !== undefined) {
    issues.push(...collectSchemaCombinators(record.items, `${path}.items`));
  }
  if (record.$defs && typeof record.$defs === "object" && !Array.isArray(record.$defs)) {
    for (const [key, value] of Object.entries(record.$defs as Record<string, unknown>)) {
      issues.push(...collectSchemaCombinators(value, `${path}.$defs.${key}`));
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "properties" || key === "items" || key === "$defs" || key === "oneOf" || key === "anyOf" || key === "allOf") {
      continue;
    }
    if (Array.isArray(value)) {
      issues.push(...value.flatMap((entry, index) => collectSchemaCombinators(entry, `${path}.${key}[${index}]`)));
    } else if (value && typeof value === "object") {
      issues.push(...collectSchemaCombinators(value, `${path}.${key}`));
    }
  }
  return issues;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill() as any);
  vi.mocked(syncSingleSkillIfChanged).mockResolvedValue({ synced: false } as any);
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
    provider: { providerName: "OpenAI" },
    inputTokens: 1200,
    outputTokens: 800,
    rawData: { usage: { cost: 0.012 } },
  } as any);
  vi.mocked(deductCredits).mockResolvedValue({
    success: true,
    creditsUsed: 2,
    newBalance: 998,
    transactionId: 101,
  } as any);
  vi.mocked(deductCreditsForModel).mockResolvedValue({
    creditsUsed: 12,
    wasFree: false,
  } as any);
});

describe("presentationArticleGenerator", () => {
  it("builds an article prompt for semantic slide planning instead of a fixed image count", () => {
    const prompt = buildPresentationArticlePrompt({
      topic: "Thai parenting nutrition guide",
      preferredLanguage: "en",
      requiresThinking: true,
      requiresWebSearch: false,
      targetImageCount: 12,
    });

    expect(prompt).toContain("semantically split into slide pages");
    expect(prompt).toContain("do not optimize around a fixed image count");
    expect(prompt).not.toContain("Supporting image plan");
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
    expect(prompt).toContain("forbid text, letters, captions, subtitles, logos, signage, labels, watermarks, UI, and embedded typography");
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

  it("builds editorial-layout-planner payloads with the render_manifest_json contract", () => {
    const payload = buildPresentationSlideRequestPayload({
      topic: "แนวทางการฝึกทารกหกเดือนให้นอนยาว",
      article: [
        "แนวทางการฝึกทารกหกเดือนให้นอนยาว",
        "",
        "เริ่มจากความเข้าใจความต้องการของลูกน้อย และค่อยๆ สร้างกิจวัตรการนอนที่คงที่",
      ].join("\n"),
      slideSkillId: "editorial-layout-planner",
      preferredLanguage: "th",
      canvasRatio: "9:16",
      outputFormats: ["json"],
      maxPages: 6,
      imagePromptContext: "เด็กทารกไทย คุณแม่ชาวไทย บรรยากาศอบอุ่นในบ้าน",
      editorialPlannerOptions: {
        targetAudience: "healthcare",
        tonePreset: "premium_editorial",
        fitPreset: "image_forward",
        pageCountMode: "fixed",
        requestedPageCount: 6,
        imageAssets: [
          {
            asset_type: "image_prompt",
            label: "Understanding baby needs",
            page_hint: 2,
            prompt: "A close, intimate moment of a Thai mother observing her six-month-old baby's expressions.",
          },
        ],
      },
      imageAssets: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "Cover hero",
          prompt: "Thai mother holding a six-month-old baby in a warm nursery",
          url: "https://cdn.example.com/cover.png",
        },
      ],
    });

    expect(payload).toEqual(expect.objectContaining({
      article_language: "th",
      page_size_or_ratio: "1080x1920",
      page_count_mode: "fixed",
      requested_page_count: 6,
      output_format: "render_manifest_json",
    }));
    expect(payload.page_briefs).toEqual([
      expect.objectContaining({
        page_number: 1,
        page_role: "cover",
        title_hint: expect.any(String),
        text: expect.any(String),
      }),
    ]);
    expect(payload.image_assets).toEqual([
      expect.objectContaining({
        asset_type: "image_prompt",
        label: "Understanding baby needs",
        page_hint: 2,
      }),
      expect.objectContaining({
        id: "img-1-1",
        asset_type: "uploaded_image",
        label: "Page 1 · Cover hero",
        page_hint: 1,
        reference: "https://cdn.example.com/cover.png",
      }),
    ]);
  });

  it("defaults editorial-layout-planner payloads to top-level llm planner settings", () => {
    const payload = buildPresentationSlideRequestPayload({
      topic: "Baby sleep guide",
      article: "Baby sleep guide\n\nCreate a calm bedtime routine for infants.",
      slideSkillId: "editorial-layout-planner",
      preferredLanguage: "en",
      canvasRatio: "4:5",
      outputFormats: ["json"],
      maxPages: 8,
    });

    expect(payload).toEqual(expect.objectContaining({
      article_title: "Baby sleep guide",
      article_language: "en",
      page_size_or_ratio: "1080x1350",
      page_count_mode: "fixed",
      requested_page_count: 1,
      output_format: "render_manifest_json",
    }));
    expect(payload).not.toHaveProperty("request");
    expect(payload.page_briefs).toEqual([
      expect.objectContaining({
        page_number: 1,
        page_role: "cover",
        title_hint: expect.any(String),
        text: expect.any(String),
      }),
    ]);
    expect(payload.image_assets).toEqual([]);
  });

  it("routes editorial-layout-planner through its top-level llm render_manifest_json runtime", async () => {
    vi.mocked(getSkillByIdAsync).mockImplementation(async (skillId: string) => {
      if (skillId === "editorial-layout-planner") {
        return makeSlideSkill({
          id: "editorial-layout-planner",
          name: "Editorial Layout Planner",
          executionMode: "llm-only",
          skillFilePath: "apps/web/skills/editorial-layout-planner/SKILL.md",
          systemPrompt: "Return clean render_manifest_json only.",
        }) as any;
      }
      return null as any;
    });
    vi.mocked(resolveSkillExecutionPolicy).mockResolvedValue({
      modelId: "gpt-4o-mini",
      allowFreeModels: false,
      modelSource: "skill_defaultModel",
    } as any);
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        output_format: "render_manifest_json",
        canvas: {
          width_px: 1080,
          height_px: 1920,
          background: { color: "#F4EEE7" },
        },
        pages: [
          {
            page: 1,
            role: "cover",
            title: "LLM Editorial Slide",
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
                text: "LLM Editorial Slide",
              },
              {
                type: "image",
                x: 88,
                y: 244,
                w: 904,
                h: 576,
                label: "cover hero",
                radius: 0,
              },
            ],
            note: "Top-level llm planner output",
          },
          {
            page: 2,
            role: "content",
            title: "Supporting slide",
            layout: "text_panel",
            quality: { occupancy: 0.78, whitespace: 0.22, fitness: 88 },
            blocks: [
              {
                type: "title",
                x: 72,
                y: 68,
                w: 936,
                h: 120,
                size: 56,
                weight: 700,
                align: "left",
                text: "Supporting slide",
              },
            ],
            note: "Second page",
          },
        ],
      }),
      modelId: "gpt-4o-mini",
      provider: { providerName: "OpenAI" },
      inputTokens: 900,
      outputTokens: 700,
      rawData: { usage: { cost: 0.01 } },
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "editorial-layout-planner",
      canvasRatio: "9:16",
      outputFormats: ["json"],
    });

    expect(JSON.parse(result.slideJson)).toEqual(expect.objectContaining({
      slides: expect.arrayContaining([
        expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({ text: "LLM Editorial Slide" }),
            expect.objectContaining({ source: "https://cdn.example.com/cover.png" }),
          ]),
        }),
      ]),
    }));

    const llmCall = vi.mocked(executeSkillLlmWithFallback).mock.calls[0]?.[0];
    const policyCall = vi.mocked(resolveSkillExecutionPolicy).mock.calls[0]?.[0];
    expect(policyCall?.skill.executionMode).toBe("llm-only");
    expect(policyCall?.skill.executionPolicy?.requirements?.supportsStructuredOutputs).toBe(true);
    expect(llmCall?.maxModelAttempts).toBe(1);
    expect(llmCall?.maxTokens).toBe(12000);
    expect(llmCall?.extraBodyParams).toEqual(expect.objectContaining({
      response_format: expect.objectContaining({
        type: "json_schema",
      }),
    }));
    const structuredSchema = (llmCall?.extraBodyParams as Record<string, unknown> | undefined)?.response_format as Record<string, unknown> | undefined;
    const jsonSchema = structuredSchema?.json_schema as Record<string, unknown> | undefined;
    const schema = jsonSchema?.schema as Record<string, unknown> | undefined;
    const schemaDefs = (schema?.$defs as Record<string, unknown> | undefined) ?? {};
    expect((schemaDefs.layout_plan_page as Record<string, unknown> | undefined)?.required).toEqual(
      expect.arrayContaining(["initial_layout_pattern", "switch_reason"]),
    );
    expect((schemaDefs.page_fill_rules_applied as Record<string, unknown> | undefined)?.required).toEqual(
      expect.arrayContaining([
        "cover_whitespace_ceiling",
        "closing_whitespace_ceiling",
        "allow_callout_injection",
        "allow_keypoint_box_injection",
      ]),
    );
    expect((schemaDefs.render_manifest_simple_block as Record<string, unknown> | undefined)?.required).toEqual(
      expect.arrayContaining(["size", "weight", "align", "text", "label", "reference", "radius"]),
    );
    expect((schemaDefs.render_manifest_block_page as Record<string, unknown> | undefined)?.required).toEqual(
      expect.arrayContaining(["note"]),
    );
    expect(collectSchemaCombinators(schema)).toEqual([]);
    expect(llmCall?.messages[0]?.content).toContain("output must remain render_manifest_json");
    expect(llmCall?.messages[0]?.content).not.toContain("top-level object containing slides as an array");
    expect(vi.mocked(executeSkill)).not.toHaveBeenCalled();
    expect(vi.mocked(syncSingleSkillIfChanged)).toHaveBeenCalledWith("editorial-layout-planner");
    expect(result.selectedSkillId).toBe("editorial-layout-planner");
    expect(result.selectedSkillName).toBe("Editorial Layout Planner");
    expect(result.runtimeBundleSkillId).toBe("editorial-layout-planner");
    expect(result.runtimeBundleSkillName).toBe("Editorial Layout Planner");
    expect(result.runtimeAliasApplied).toBe(false);
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.debugTracePath).toMatch(/^\/tmp\/presentation-slide-debug\/.+\.json$/);
    await expect(fs.readFile(result.debugTracePath!, "utf8")).resolves.toContain("\"runtimeBundleSkillId\": \"editorial-layout-planner\"");
    await expect(fs.readFile(result.debugTracePath!, "utf8")).resolves.toContain("\"usesSandboxSkill\": false");
  });

  it("repairs editorial render manifests that under-produce the requested page count", async () => {
    const makeRenderManifest = (pageCount: number, labelPrefix: string) => ({
      output_format: "render_manifest_json",
      canvas: {
        width_px: 1080,
        height_px: 1920,
        background: { color: "#F4EEE7" },
      },
      pages: Array.from({ length: pageCount }, (_, index) => {
        const pageNumber = index + 1;
        return {
          page_number: pageNumber,
          page_role: pageNumber === 1
            ? "cover"
            : pageNumber === pageCount
              ? "closing"
              : "content",
          title: `${labelPrefix} ${pageNumber}`,
          layout: "text_panel",
          quality: { occupancy: 0.81, whitespace: 0.19, fitness: 90 },
          blocks: [
            {
              type: "title",
              x: 72,
              y: 64,
              w: 936,
              h: 138,
              text: `${labelPrefix} ${pageNumber}`,
            },
          ],
          note: `${labelPrefix} page ${pageNumber}`,
        };
      }),
      global_validation: [],
    });

    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "editorial-layout-planner",
      name: "Editorial Layout Planner",
      executionMode: "llm-only",
      skillFilePath: "apps/web/skills/editorial-layout-planner/SKILL.md",
      systemPrompt: "Return clean render_manifest_json only.",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify(makeRenderManifest(3, "Initial editorial slide")),
        modelId: "gpt-4o-mini",
        provider: { providerName: "OpenAI" },
        inputTokens: 900,
        outputTokens: 700,
        rawData: { usage: { cost: 0.01 } },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify(makeRenderManifest(9, "Repaired editorial slide")),
        modelId: "gpt-4o-mini",
        provider: { providerName: "OpenAI" },
        inputTokens: 900,
        outputTokens: 700,
        rawData: { usage: { cost: 0.01 } },
      } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      article: [
        "Product Pitch",
        "",
        "1. Problem",
        "",
        "The current workflow is slow.",
        "",
        "2. Solution",
        "",
        "A unified workspace keeps the team aligned.",
        "",
        "3. Differentiation",
        "",
        "Clear positioning helps the pitch stand out.",
        "",
        "4. Traction",
        "",
        "Early adoption proves the need.",
        "",
        "5. Market",
        "",
        "The market is large and ready.",
        "",
        "6. Pricing",
        "",
        "Flexible pricing supports adoption.",
        "",
        "7. Go to market",
        "",
        "Channels are straightforward.",
        "",
        "8. Roadmap",
        "",
        "The next steps are sequenced.",
        "",
        "9. Ask",
        "",
        "A clear ask closes the story.",
      ].join("\n"),
      slideSkillId: "editorial-layout-planner",
      outputFormats: ["json"],
      canvasRatio: "9:16",
      maxPages: 9,
    });

    const parsed = JSON.parse(result.slideJson);
    expect(parsed.slides).toHaveLength(9);
    expect(parsed.slides[0]).toEqual(expect.objectContaining({
      elements: expect.arrayContaining([
        expect.objectContaining({ text: "Repaired editorial slide 1" }),
      ]),
    }));
    expect(parsed.slides[8]).toEqual(expect.objectContaining({
      elements: expect.arrayContaining([
        expect.objectContaining({ text: "Repaired editorial slide 9" }),
      ]),
    }));
    expect(vi.mocked(executeSkillLlmWithFallback)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(executeSkillLlmWithFallback).mock.calls[0]?.[0]?.maxTokens).toBe(12000);
    expect(vi.mocked(executeSkillLlmWithFallback).mock.calls[1]?.[0]?.maxTokens).toBe(12000);
  });

  it("repairs non-importable llm slide output into importable slide json", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "llm-slide-skill",
      name: "LLM Slide Skill",
      executionMode: "llm",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          request: {
            projectTitle: "Product Pitch",
          },
        }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 1200,
        outputTokens: 400,
        rawData: { usage: { cost: 0.01 } },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          canvas: { ratio: "16:9" },
          slides: [
            {
              elements: [
                {
                  kind: "text",
                  role: "title",
                  text: "Repaired slide",
                  xPct: 10,
                  yPct: 10,
                  wPct: 60,
                  hPct: 12,
                },
              ],
            },
          ],
        }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 800,
        outputTokens: 700,
        rawData: { usage: { cost: 0.008 } },
      } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "llm-slide-skill",
      outputFormats: ["json"],
    });

    expect(JSON.parse(result.slideJson)).toEqual(expect.objectContaining({
      slides: expect.any(Array),
    }));
    expect(vi.mocked(executeSkillLlmWithFallback)).toHaveBeenCalledTimes(2);
    expect(result.debugTracePath).toMatch(/^\/tmp\/presentation-slide-debug\/.+\.json$/);
    await expect(fs.readFile(result.debugTracePath!, "utf8")).resolves.toContain("\"finalState\": \"success\"");
  });

  it("treats empty slides as non-importable and repairs them before returning", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "llm-slide-skill",
      name: "LLM Slide Skill",
      executionMode: "llm",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          slides: [
            {
              title: "Empty slide",
              elements: [],
            },
          ],
        }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 1200,
        outputTokens: 400,
        rawData: { usage: { cost: 0.01 } },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          canvas: { ratio: "16:9" },
          slides: [
            {
              elements: [
                {
                  kind: "text",
                  role: "title",
                  text: "Recovered slide",
                  xPct: 10,
                  yPct: 10,
                  wPct: 60,
                  hPct: 12,
                },
              ],
            },
          ],
        }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 800,
        outputTokens: 700,
        rawData: { usage: { cost: 0.008 } },
      } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "llm-slide-skill",
      outputFormats: ["json"],
    });

    expect(JSON.parse(result.slideJson)).toEqual(expect.objectContaining({
      slides: [
        expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({ text: "Recovered slide" }),
          ]),
        }),
      ],
    }));
    expect(vi.mocked(executeSkillLlmWithFallback)).toHaveBeenCalledTimes(2);
  });

  it("reports why slide json was not importable when both passes return empty slides", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "llm-slide-skill",
      name: "LLM Slide Skill",
      executionMode: "llm",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          slides: [
            {
              title: "Empty slide",
              elements: [],
            },
          ],
        }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 1200,
        outputTokens: 400,
        rawData: { usage: { cost: 0.01 } },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          slides: [
            {
              title: "Still empty",
              elements: [],
            },
          ],
        }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 800,
        outputTokens: 700,
        rawData: { usage: { cost: 0.008 } },
      } as any);

    await expect(generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "llm-slide-skill",
      outputFormats: ["json"],
    })).rejects.toThrow(/\[debug trace: \/tmp\/presentation-slide-debug\/.+\.json\]/);
  });

  it("prefers render_manifest_json pages over empty summary slides when both are present", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "llm-slide-skill",
      name: "LLM Slide Skill",
      executionMode: "llm",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({
        output_format: "render_manifest_json",
        canvas: {
          width_px: 1080,
          height_px: 1920,
          background: {
            color: "#F4EEE7",
          },
        },
        slides: [
          { title: "summary 1", elements: [] },
          { title: "summary 2", elements: [] },
        ],
        pages: [
          {
            page_role: "cover",
            render_notes: "Page 1",
            text_blocks: [
              {
                id: "p1_title",
                role: "title",
                content: "Imported from manifest",
                bounds: { x: 72, y: 64, w: 936, h: 138 },
                typography: { font_size_px: 62, weight: 700, align: "left" },
              },
            ],
            image_blocks: [],
          },
        ],
      }),
      modelId: "gpt-5.4",
      provider: { providerName: "OpenAI" },
      inputTokens: 1200,
      outputTokens: 400,
      rawData: { usage: { cost: 0.01 } },
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "llm-slide-skill",
      outputFormats: ["json"],
    });

    expect(JSON.parse(result.slideJson)).toEqual(expect.objectContaining({
      slides: [
        expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({ text: "Imported from manifest" }),
          ]),
        }),
      ],
    }));
    expect(vi.mocked(executeSkillLlmWithFallback)).toHaveBeenCalledTimes(1);
  });

  it("prefers nested manifest candidates over empty top-level slides", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "llm-slide-skill",
      name: "LLM Slide Skill",
      executionMode: "llm",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({
        slides: Array.from({ length: 9 }, (_, index) => ({
          title: `Summary ${index + 1}`,
          elements: [],
        })),
        result: {
          output_format: "render_manifest_json",
          canvas: {
            width_px: 1080,
            height_px: 1920,
            background: {
              color: "#F4EEE7",
            },
          },
          pages: [
            {
              page_role: "cover",
              render_notes: "Nested page 1",
              text_blocks: [
                {
                  id: "p1_title",
                  role: "title",
                  content: "Nested manifest slide",
                  bounds: { x: 72, y: 64, w: 936, h: 138 },
                  typography: { font_size_px: 62, weight: 700, align: "left" },
                },
              ],
              image_blocks: [],
            },
          ],
        },
      }),
      modelId: "gpt-5.4",
      provider: { providerName: "OpenAI" },
      inputTokens: 1200,
      outputTokens: 400,
      rawData: { usage: { cost: 0.01 } },
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "llm-slide-skill",
      outputFormats: ["json"],
    });

    expect(JSON.parse(result.slideJson)).toEqual(expect.objectContaining({
      slides: [
        expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({ text: "Nested manifest slide" }),
          ]),
        }),
      ],
    }));
    expect(vi.mocked(executeSkillLlmWithFallback)).toHaveBeenCalledTimes(1);
  });

  it("shrinks oversized Thai render_manifest_json text blocks before import", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "llm-slide-skill",
      name: "LLM Slide Skill",
      executionMode: "llm",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({
        output_format: "render_manifest_json",
        canvas: {
          width_px: 1080,
          height_px: 1920,
          background: {
            color: "#FFFFFF",
          },
        },
        pages: [
          {
            page_number: 1,
            page_role: "content",
            title: "Routine",
            layout: "image_top_text_bottom",
            blocks: [
              {
                type: "image",
                x: 60,
                y: 60,
                w: 960,
                h: 800,
                label: "cover hero",
              },
              {
                type: "headline",
                x: 60,
                y: 900,
                w: 960,
                h: 100,
                size: 60,
                weight: 600,
                align: "left",
                text: "3. กำหนดเวลานอนที่สม่ำเสมอ",
              },
              {
                type: "body",
                x: 60,
                y: 1020,
                w: 960,
                h: 700,
                size: 36,
                weight: 400,
                align: "left",
                text: "การกำหนดเวลานอนที่ชัดเจนและสม่ำเสมอช่วยให้ทารกรู้สึกปลอดภัย ควรเริ่มต้นด้วยการสร้างกิจวัตรก่อนนอน เช่น อ่านนิทาน หรือทำกิจกรรมที่สงบ",
              },
            ],
          },
        ],
      }),
      modelId: "gpt-5.4",
      provider: { providerName: "OpenAI" },
      inputTokens: 1200,
      outputTokens: 400,
      rawData: { usage: { cost: 0.01 } },
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "llm-slide-skill",
      canvasRatio: "9:16",
      outputFormats: ["json"],
    });

    const parsed = JSON.parse(result.slideJson);
    const slide = parsed.slides[0];
    const titleElement = slide.elements.find((element: any) => element.kind === "text" && element.role === "title");
    const bodyElement = slide.elements.find((element: any) => element.kind === "text" && element.role === "body");

    expect(titleElement).toEqual(expect.objectContaining({
      text: "3. กำหนดเวลานอนที่สม่ำเสมอ",
      lineHeight: 1.5,
    }));
    expect(titleElement.fontSize).toBeLessThan(60);
    expect(titleElement.fontSize).toBeGreaterThanOrEqual(24);
    expect(bodyElement).toEqual(expect.objectContaining({
      fontSize: 36,
      lineHeight: 1.5,
    }));
  });

  it("converts summary slides from editorial-layout-planner into importable slide json", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "llm-slide-skill",
      name: "LLM Slide Skill",
      executionMode: "llm",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({
        page_size_or_ratio: "1080x1920",
        slides: [
          {
            page_number: 1,
            headline: "เข้าใจความต้องการของทารก",
            body_text: "ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด",
            image: {
              reference: "https://cdn.example.com/hero.png",
            },
          },
        ],
      }),
      modelId: "gpt-5.4",
      provider: { providerName: "OpenAI" },
      inputTokens: 1200,
      outputTokens: 400,
      rawData: { usage: { cost: 0.01 } },
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "llm-slide-skill",
      outputFormats: ["json"],
    });

    expect(JSON.parse(result.slideJson)).toEqual(expect.objectContaining({
      canvas: expect.objectContaining({ ratio: "9:16" }),
      slides: [
        expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({ kind: "text", text: "เข้าใจความต้องการของทารก" }),
            expect.objectContaining({ kind: "image", source: "https://cdn.example.com/hero.png" }),
          ]),
        }),
      ],
    }));
    expect(vi.mocked(executeSkillLlmWithFallback)).toHaveBeenCalledTimes(1);
  });

  it("converts stringified render manifest pages into importable slide json", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "llm-slide-skill",
      name: "LLM Slide Skill",
      executionMode: "llm",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({
        output_format: "render_manifest_json",
        canvas: {
          width_px: 1080,
          height_px: 1920,
          background: {
            color: "#F4EEE7",
          },
        },
        pages: [
          JSON.stringify({
            page_number: 1,
            layout: "hero_cover",
            headline: "เข้าใจความต้องการของทารก",
            image_asset: "https://cdn.example.com/hero.png",
          }),
          JSON.stringify({
            page_number: 2,
            layout: "text_with_image",
            content: "กิจวัตรก่อนนอน: สร้างสัญญาณที่สม่ำเสมอให้ลูกผ่อนคลายก่อนหลับ",
            image_asset: "https://cdn.example.com/routine.png",
          }),
        ],
      }),
      modelId: "google/gemini-3.1-flash-lite-preview",
      provider: { providerName: "OpenRouter" },
      inputTokens: 1200,
      outputTokens: 400,
      rawData: { usage: { cost: 0.01 } },
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "llm-slide-skill",
      outputFormats: ["json"],
    });

    expect(JSON.parse(result.slideJson)).toEqual(expect.objectContaining({
      canvas: expect.objectContaining({ ratio: "9:16" }),
      slides: [
        expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({ kind: "text", text: "เข้าใจความต้องการของทารก" }),
            expect.objectContaining({ kind: "image", source: "https://cdn.example.com/hero.png" }),
          ]),
        }),
        expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({ kind: "text", text: "กิจวัตรก่อนนอน" }),
            expect.objectContaining({ kind: "text", text: "สร้างสัญญาณที่สม่ำเสมอให้ลูกผ่อนคลายก่อนหลับ" }),
            expect.objectContaining({ kind: "image", source: "https://cdn.example.com/routine.png" }),
          ]),
        }),
      ],
    }));
    expect(vi.mocked(executeSkillLlmWithFallback)).toHaveBeenCalledTimes(1);
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

  it("passes only page content and page-bound images into the slide skill payload", () => {
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

    expect(payload.request).not.toHaveProperty("randomizeLayouts");
    expect(payload.request.content.pages?.every((page) => !("forceArchetype" in page))).toBe(true);
    expect(payload.request.content.pages?.every((page) => !("pageIntentHint" in page))).toBe(true);
    expect(payload.request.content.pages?.map((page) => ({
      titleHint: page.titleHint,
      imageCount: page.images?.length ?? 0,
    }))).toEqual([
      { titleHint: "คู่มือการนอนของทารก", imageCount: 1 },
      { titleHint: "สร้างสภาพแวดล้อมที่เหมาะสม", imageCount: 1 },
      { titleHint: "กำหนดเวลานอนที่สม่ำเสมอ", imageCount: 1 },
      { titleHint: "จัดการการหลับกลางวัน", imageCount: 1 },
    ]);
  });

  it("applies modern-editorial-slide deck defaults and selective page presets", () => {
    const payload = buildPresentationSlideRequestPayload({
      topic: "Thai Baby Sleep Training Guide - 6 Months",
      article: [
        "Thai Baby Sleep Training Guide - 6 Months",
        "",
        "บทนำเกี่ยวกับการฝึกการนอนของทารก",
        "",
        "1. สร้างสภาพแวดล้อมที่เหมาะสม",
        "",
        "ห้องนอนควรเงียบ แสงน้อย และอุณหภูมิสบาย",
        "",
        "2. กำหนดเวลานอนที่สม่ำเสมอ",
        "",
        "Overview: การกำหนดเวลานอนที่ชัดเจนช่วยให้ลูกเรียนรู้ช่วงพักผ่อน",
        "",
        "Key Points:",
        "• สร้างกิจวัตรก่อนนอน",
        "• ลดสิ่งกระตุ้น",
        "• ทำต่อเนื่อง",
        "",
        "3. สงวนมื้อดึก",
        "",
        "Planning: เริ่มลดการให้นมกลางคืน",
        "Development: ใช้วิธีปลอบแทนการให้นม",
        "Evaluation: สังเกตว่าลูกกลับไปนอนได้เร็วขึ้น",
        "Review: ปรับวิธีตามความพร้อมของลูก",
      ].join("\n"),
      slideSkillId: "modern-editorial-slide",
      preferredLanguage: "th",
      canvasRatio: "9:16",
      outputFormats: ["json", "pptx"],
      maxPages: 4,
      imageAssets: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "Cover image prompt",
          url: "https://cdn.example.com/cover.png",
        },
      ],
    });

    expect(payload.request.designStyle).toBe("soft-wellness");
    expect(payload.request.density).toBe("balanced");
    expect(payload.request.randomizeLayouts).toBe(false);
    expect(payload.request.seed).toMatch(/thai-baby-sleep-training-guide-6-months-9x16-4/);
    expect(payload.request.pagination.allowFewerPages).toBe(true);
    expect(payload.request.theme).toEqual(expect.objectContaining({
      paletteMode: "soft-pastel",
      roundedCorners: true,
    }));
    expect(payload.request.renderOptions).toEqual(expect.objectContaining({
      pptxFileName: "thai-baby-sleep-training-guide-6-months.pptx",
      pdfEngine: "libreoffice",
    }));
    expect(payload.request.content.pages?.every((page) => typeof page.pageIntentHint === "string" && page.pageIntentHint.length > 0)).toBe(true);
    expect(payload.request.content.pages?.[0]?.forceArchetype).toBe("editorial_cover_split");
    expect((payload.request.content.pages?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect((payload.request.content.pages?.length ?? 0)).toBeLessThanOrEqual(4);
    expect(payload.request.content.pages?.some((page) => typeof page.forceArchetype === "string" && page.forceArchetype.length > 0)).toBe(true);
    expect(payload.request.content.pages?.some((page) => page.text.includes("Overview:") || page.text.includes("Context:") || page.text.includes("การกำหนดเวลานอน"))).toBe(true);
    expect(payload.request.content.pages?.some((page) => page.text.includes("•") || page.text.includes("1."))).toBe(true);
  });

  it("does not re-force modern-editorial pages that already include compiler-provided intent guidance", () => {
    const payload = buildPresentationSlideRequestPayload({
      topic: "คู่มือฝึกลูกนอน",
      article: [
        "คู่มือฝึกลูกนอน",
        "",
        "เข้าใจความต้องการของทารก",
        "",
        "ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด ขณะเดียวกันก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้",
        "",
        "สร้างสภาพแวดล้อมที่เหมาะสม",
        "",
        "สภาพแวดล้อมการนอนมีความสำคัญมาก พ่อแม่ควรจัดเตรียมห้องนอนให้เป็นที่ร่ม เงียบสงบ และมีอุณหภูมิที่เหมาะสม",
      ].join("\n"),
      slideSkillId: "modern-editorial-slide",
      preferredLanguage: "th",
      canvasRatio: "9:16",
      outputFormats: ["json"],
      maxPages: 4,
      imageAssets: [],
    });

    const pages = payload.request.content.pages ?? [];
    expect(pages[0]?.forceArchetype).toBe("editorial_cover_split");
    expect(pages.slice(1).every((page) => !page.forceArchetype)).toBe(true);
    expect(pages.slice(1).every((page) => typeof page.pageIntentHint === "string" && page.pageIntentHint.length > 0)).toBe(true);
  });

  it("uses explicit page image slot overrides when building the slide request payload", () => {
    const payload = buildPresentationSlideRequestPayload({
      topic: "คู่มือฝึกลูกนอน",
      article: [
        "คู่มือฝึกลูกนอน",
        "",
        "ย่อหน้าเกริ่นนำ",
        "",
        "1. เข้าใจความต้องการของทารก",
        "",
        "ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด",
        "",
        "2. สร้างสภาพแวดล้อมที่เหมาะสม",
        "",
        "สภาพแวดล้อมการนอนควรเงียบและแสงน้อย",
        "",
        "3. กำหนดเวลานอนที่สม่ำเสมอ",
        "",
        "ควรมีเวลานอนสม่ำเสมอและกิจวัตรก่อนนอน",
      ].join("\n"),
      preferredLanguage: "th",
      canvasRatio: "9:16",
      outputFormats: ["json"],
      maxPages: 3,
      pageImagePlanOverrides: [
        { pageNumber: 1, maxImagesOverride: 1 },
        { pageNumber: 2, maxImagesOverride: 2 },
        { pageNumber: 3, maxImagesOverride: 0 },
      ],
      imageAssets: [
        {
          id: "img-1-1",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "Cover image prompt",
          url: "https://cdn.example.com/cover.png",
        },
        {
          id: "img-2-1",
          pageNumber: 2,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "page 2 hero",
          prompt: "Page 2 hero prompt",
          url: "https://cdn.example.com/page2-hero.png",
        },
        {
          id: "img-2-2",
          pageNumber: 2,
          imageIndex: 2,
          placementRole: "supporting",
          shortLabel: "page 2 supporting",
          prompt: "Page 2 supporting prompt",
          url: "https://cdn.example.com/page2-supporting.png",
        },
        {
          id: "img-3-1",
          pageNumber: 3,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "page 3 hero",
          prompt: "Page 3 hero prompt",
          url: "https://cdn.example.com/page3-hero.png",
        },
      ],
    });

    const pages = payload.request.content.pages ?? [];
    expect(pages[0]?.maxImagesOverride).toBe(1);
    expect(pages[0]?.images?.length).toBe(1);
    expect(pages[1]?.maxImagesOverride).toBe(2);
    expect(pages[1]?.images?.length).toBe(2);
    expect(pages[2]?.maxImagesOverride).toBe(0);
    expect(pages[2]?.images?.length ?? 0).toBe(0);
  });

  it("allows slide draft generation to proceed with manual-only pages even when no image assets are attached", async () => {
    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      imageAssets: [],
      pageImagePlanOverrides: [
        { pageNumber: 1, maxImagesOverride: 1 },
        { pageNumber: 2, maxImagesOverride: 1 },
      ],
    });

    expect(executeSkill).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extraParams: expect.objectContaining({
          request: expect.objectContaining({
            content: expect.objectContaining({
              pages: expect.arrayContaining([
                expect.objectContaining({
                  imageSelectionMode: "manual-only",
                  maxImagesOverride: 1,
                  images: [],
                }),
              ]),
            }),
          }),
        }),
      }),
      7,
      "internal-token",
      "tenant-1",
    );
    expect(result.slideJson).toContain("\"slides\"");
  });

  it("allows sandbox-backed slide draft generation with pptx output when manual-only pages have no attached images", async () => {
    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      outputFormats: ["json", "pptx"],
      imageAssets: [],
      pageImagePlanOverrides: [
        { pageNumber: 1, maxImagesOverride: 1 },
        { pageNumber: 2, maxImagesOverride: 1 },
      ],
    });

    expect(executeSkill).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extraParams: expect.objectContaining({
          request: expect.objectContaining({
            outputFormats: ["json", "pptx"],
            content: expect.objectContaining({
              pages: expect.arrayContaining([
                expect.objectContaining({
                  imageSelectionMode: "manual-only",
                  maxImagesOverride: 1,
                  images: [],
                }),
              ]),
            }),
          }),
        }),
      }),
      7,
      "internal-token",
      "tenant-1",
    );
    expect(result.slideJson).toContain("\"slides\"");
    expect(result.artifacts.some((artifact) => artifact.format === "pptx")).toBe(true);
  });

  it("merges edited skill input overrides before dispatching the slide skill", async () => {
    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slidePayloadOverrideJson: JSON.stringify({
        request: {
          designStyle: "soft-wellness",
          randomizeLayouts: false,
          seed: "sleep-9-pages-20260330-v2",
          content: {
            pages: [
              {
                pageIntentHint: "editorial_cover",
                forceArchetype: "editorial_cover_split",
              },
            ],
          },
        },
      }),
    });

    expect(executeSkill).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extraParams: expect.objectContaining({
          request: expect.objectContaining({
            designStyle: "soft-wellness",
            randomizeLayouts: false,
            seed: "sleep-9-pages-20260330-v2",
            content: expect.objectContaining({
              pages: expect.arrayContaining([
                expect.objectContaining({
                  pageIntentHint: "editorial_cover",
                  forceArchetype: "editorial_cover_split",
                  images: expect.arrayContaining([
                    expect.objectContaining({
                      source: "https://cdn.example.com/cover.png",
                    }),
                  ]),
                }),
              ]),
            }),
          }),
        }),
      }),
      7,
      "internal-token",
      "tenant-1",
    );
    expect(result.slidePayloadJson).toContain("\"seed\": \"sleep-9-pages-20260330-v2\"");
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
    expect(executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "modern-editorial-slide" }),
      expect.objectContaining({ runId: expect.any(String) }),
      7,
      "internal-token",
      "tenant-1",
    );
    expect(deductCredits).not.toHaveBeenCalled();
    expect(executeSkillLlmWithFallback).not.toHaveBeenCalled();
    expect(result.slideJson).toContain("Sandbox Layout Slide");
    expect(result.artifactJobId).toBeNull();
  });

  it("falls back to llm slide json when sandbox json artifacts are not importable for json-only requests", async () => {
    vi.mocked(getJobArtifactUrls).mockResolvedValue([
      {
        artifactId: 1,
        url: "https://cdn.example.com/manifest.json",
        key: "sandbox-artifacts/job-default-slide-artifact/000-manifest.json",
        mimeType: "application/json",
        isPrimary: false,
      },
      {
        artifactId: 2,
        url: "https://cdn.example.com/generated-layout.json",
        key: "sandbox-artifacts/job-default-slide-artifact/001-generated-layout.json",
        mimeType: "application/json",
        isPrimary: false,
      },
    ] as any);
    vi.mocked(storageReadText).mockImplementation(async (key: string) => {
      if (key.endsWith("manifest.json")) {
        return JSON.stringify({
          outputs: {
            json: "generated-layout.json",
          },
        });
      }
      if (key.endsWith("generated-layout.json")) {
        return JSON.stringify({
          status: "ok",
          payload: {
            summary: "not an importable slide bundle",
          },
        });
      }
      return "";
    });
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        layoutSpec: {
          canvas: { ratio: "16:9" },
          slides: [
            {
              elements: [
                {
                  kind: "text",
                  role: "title",
                  text: "Recovered From LLM Fallback",
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

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      outputFormats: ["json"] as const,
    });

    expect(result.slideJson).toContain("Recovered From LLM Fallback");
    expect(result.artifactJobId).toBeNull();
    expect(result.artifacts).toEqual([]);
    expect(result.downloadUrl).toBeNull();
    expect(result.artifactFailureMessage)
      .toContain("Sandbox slide skill completed but did not produce importable slide JSON");
  });

  it("builds deterministic slide json from the prepared payload when sandbox and llm fallback are not importable", async () => {
    vi.mocked(getJobArtifactUrls).mockResolvedValue([
      {
        artifactId: 1,
        url: "https://cdn.example.com/empty-layout.json",
        key: "sandbox-artifacts/job-default-slide-artifact/001-empty-layout.json",
        mimeType: "application/json",
        isPrimary: false,
      },
    ] as any);
    vi.mocked(storageReadText).mockResolvedValue("{\"slides\":[]}");
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: "{\"slides\":[]}",
      modelId: "gpt-5.4",
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      outputFormats: ["json"] as const,
    });

    expect(result.slideJson).toContain("\"slides\"");
    expect(result.slideJson).toContain("Problem");
    expect(result.slideJson).toContain("https://cdn.example.com/cover.png");
    expect(result.artifactJobId).toBeNull();
    expect(result.artifactFailureMessage)
      .toContain("Sandbox slide skill completed but did not produce importable slide JSON");
  });

  it("builds deterministic slide json from editorial planner page briefs when sandbox and llm fallback are empty", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "editorial-layout-planner",
      name: "Editorial Layout Planner",
      executionMode: "sandbox-command",
      systemPrompt: "Return render manifests.",
    }) as any);
    vi.mocked(getJobArtifactUrls).mockResolvedValue([
      {
        artifactId: 1,
        url: "https://cdn.example.com/empty-layout.json",
        key: "sandbox-artifacts/job-default-slide-artifact/001-empty-layout.json",
        mimeType: "application/json",
        isPrimary: false,
      },
    ] as any);
    vi.mocked(storageReadText).mockResolvedValue("{\"slides\":[]}");
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: "{\"slides\":[]}",
      modelId: "gpt-5.4",
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "editorial-layout-planner",
      outputFormats: ["json"] as const,
      canvasRatio: "9:16",
    });

    expect(result.slideJson).toContain("\"slides\"");
    expect(result.slideJson).toContain("Problem");
    expect(result.slideJson).toContain("Solution");
    expect(result.slideJson).toContain("https://cdn.example.com/cover.png");
    expect(result.artifactJobId).toBeNull();
    expect(result.artifactFailureMessage)
      .toContain("Sandbox slide skill completed but did not produce importable slide JSON");
  });

  it("charges credits for article generation through the selected skill model", async () => {
    const result = await generatePresentationArticle({
      tenantId: "tenant-1",
      userId: 7,
      topic: "คู่มือฝึกลูกนอน",
      preferredLanguage: "th",
      executionSource: "skill",
      skillId: "modern-editorial-slide",
      requiresThinking: false,
      requiresWebSearch: false,
      targetImageCount: 8,
    });

    expect(deductCreditsForModel).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      tenantId: "tenant-1",
      skillSlug: "modern-editorial-slide",
      sourceType: "skill",
      metadata: expect.objectContaining({
        operation: "presentation.generate_article",
        service: "presentation.article_builder",
      }),
    }));
    expect(result.article.length).toBeGreaterThan(0);
  });

  it("charges credits when preparing page-bound image prompts for the slide skill", async () => {
    const result = await preparePresentationSlideBundle({
      userId: 7,
      tenantId: "tenant-1",
      topic: "คู่มือฝึกลูกนอน",
      article: "คู่มือฝึกลูกนอน\n\n1. สร้างสภาพแวดล้อมที่เหมาะสม\n\n2. กำหนดเวลานอนให้สม่ำเสมอ",
      slideSkillId: "modern-editorial-slide",
      preferredLanguage: "th",
      requiresThinking: false,
      targetImageCount: 8,
      canvasRatio: "4:5",
      outputFormats: ["json"],
      imagePromptContext: "บ้านไทย",
    });

    expect(deductCreditsForModel).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      tenantId: "tenant-1",
      skillSlug: "modern-editorial-slide",
      sourceType: "skill",
      skillRunId: expect.any(String),
      metadata: expect.objectContaining({
        operation: "presentation.prepare_slide_bundle",
      }),
    }));
    expect(result.preflightPages?.length).toBeGreaterThan(0);
    expect(result.preflightPages?.[0]).toEqual(expect.objectContaining({
      pageIntentHint: expect.any(String),
      preferredArchetype: expect.any(String),
      recommendedImageCount: expect.any(Number),
    }));
    expect(result.imagePrompts.length).toBe(result.plannedImageCount);
  });

  it("uses semantic LLM page briefs as the source plan for slide payloads", async () => {
    vi.mocked(executeSkillLlmWithFallback)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          pages: [
            {
              page_number: 1,
              title_hint: "เริ่มจากสัญญาณง่วง",
              text: "สังเกตสัญญาณง่วงและเริ่มกิจวัตรก่อนลูกเหนื่อยเกินไป",
              page_intent_hint: "cover",
              estimated_read_seconds: 7,
            },
            {
              page_number: 2,
              title_hint: "ห้องนอนต้องนิ่ง",
              text: "ลดแสง เสียง และสิ่งกระตุ้น เพื่อให้ลูกเชื่อมโยงห้องกับการพักผ่อน",
              page_intent_hint: "content",
              estimated_read_seconds: 8,
            },
          ],
        }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 800,
        outputTokens: 300,
        rawData: { usage: { cost: 0.006 } },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          prompts: [
            {
              pageNumber: 1,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "sleep cues",
              prompt: "Warm Thai nursery scene with sleepy baby, no text.",
            },
            {
              pageNumber: 2,
              imageIndex: 1,
              placementRole: "hero",
              shortLabel: "quiet room",
              prompt: "Calm dark nursery with soft light, no text.",
            },
          ],
        }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 700,
        outputTokens: 300,
        rawData: { usage: { cost: 0.005 } },
      } as any);

    const result = await preparePresentationSlideBundle({
      userId: 7,
      topic: "คู่มือฝึกลูกนอน",
      article: [
        "คู่มือฝึกลูกนอน",
        "",
        "บทความยาวเกี่ยวกับการสังเกตสัญญาณง่วง การจัดห้องนอน และการสร้างกิจวัตรที่ช่วยให้ลูกนอนง่ายขึ้น",
      ].join("\n"),
      slideSkillId: "sandbox-slide-skill",
      preferredLanguage: "th",
      requiresThinking: false,
      targetImageCount: 12,
      canvasRatio: "9:16",
      outputFormats: ["json"],
    });

    expect(result.plannedImageCount).toBe(2);
    expect(result.preflightPages?.map((page) => page.titleHint)).toEqual([
      "เริ่มจากสัญญาณง่วง",
      "ห้องนอนต้องนิ่ง",
    ]);
    expect(result.slidePayload.request.content.pages?.map((page) => page.titleHint)).toEqual([
      "เริ่มจากสัญญาณง่วง",
      "ห้องนอนต้องนิ่ง",
    ]);
    expect(result.slidePayload.request.content.pages?.[0]?.text).toContain("สังเกตสัญญาณง่วง");
  });

  it("returns the rewritten article when fixed page count planning rewrites the source", async () => {
    vi.mocked(executeSkillLlmWithFallback)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          rewritten_article: [
            "คู่มือฝึกลูกนอน",
            "",
            "1. เริ่มจากสัญญาณง่วง",
            "สังเกตสัญญาณง่วงและเริ่มกิจวัตรก่อนลูกเหนื่อยเกินไป",
            "",
            "2. ห้องนอนต้องนิ่ง",
            "ลดแสง เสียง และสิ่งกระตุ้น เพื่อให้ลูกเชื่อมโยงห้องกับการพักผ่อน",
            "",
            "3. ทำซ้ำอย่างอ่อนโยน",
            "ใช้กิจวัตรเดิมทุกคืนและปรับตามความพร้อมของลูก",
          ].join("\n"),
          pages: [
            {
              page_number: 1,
              title_hint: "เริ่มจากสัญญาณง่วง",
              text: "สังเกตสัญญาณง่วงและเริ่มกิจวัตรก่อนลูกเหนื่อยเกินไป",
              page_intent_hint: "cover",
              estimated_read_seconds: 7,
            },
            {
              page_number: 2,
              title_hint: "ห้องนอนต้องนิ่ง",
              text: "ลดแสง เสียง และสิ่งกระตุ้น เพื่อให้ลูกเชื่อมโยงห้องกับการพักผ่อน",
              page_intent_hint: "content",
              estimated_read_seconds: 8,
            },
            {
              page_number: 3,
              title_hint: "ทำซ้ำอย่างอ่อนโยน",
              text: "ใช้กิจวัตรเดิมทุกคืนและปรับตามความพร้อมของลูก",
              page_intent_hint: "closing",
              estimated_read_seconds: 7,
            },
          ],
        }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 900,
        outputTokens: 450,
        rawData: { usage: { cost: 0.007 } },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({ prompts: [] }),
        modelId: "gpt-5.4",
        provider: { providerName: "OpenAI" },
        inputTokens: 300,
        outputTokens: 80,
        rawData: { usage: { cost: 0.001 } },
      } as any);

    const result = await preparePresentationSlideBundle({
      userId: 7,
      topic: "คู่มือฝึกลูกนอน",
      article: "คู่มือฝึกลูกนอน\n\nบทความยาวมากที่ต้องจัดให้พอดีกับสามหน้า",
      slideSkillId: "editorial-layout-planner",
      preferredLanguage: "th",
      requiresThinking: false,
      targetImageCount: 8,
      canvasRatio: "9:16",
      outputFormats: ["json"],
      editorialPlannerOptions: {
        pageCountMode: "fixed",
        requestedPageCount: 3,
      },
    });

    expect(result.maxPages).toBe(3);
    expect(result.article).toContain("3. ทำซ้ำอย่างอ่อนโยน");
    expect(result.slidePayload.article_body).toContain("3. ทำซ้ำอย่างอ่อนโยน");
    expect(result.slidePayload.page_briefs).toHaveLength(3);
  });

  it("keeps the existing image slot count when replanning with reusable generated images", async () => {
    const result = await preparePresentationSlideBundle({
      userId: 7,
      topic: "คู่มือฝึกลูกนอน",
      article: [
        "คู่มือฝึกลูกนอน",
        "",
        "1. เข้าใจความต้องการของทารก",
        "",
        "ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด",
        "",
        "2. สร้างสภาพแวดล้อมที่เหมาะสม",
        "",
        "ห้องนอนควรเงียบและแสงน้อย",
        "",
        "3. กำหนดเวลานอนที่สม่ำเสมอ",
        "",
        "สร้างกิจวัตรก่อนนอนอย่างสงบ",
      ].join("\n"),
      slideSkillId: "modern-editorial-slide",
      preferredLanguage: "th",
      requiresThinking: false,
      targetImageCount: 12,
      canvasRatio: "9:16",
      outputFormats: ["json"],
      existingImageAssets: [
        {
          id: "img-1-1-existing",
          pageNumber: 1,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: "cover hero",
          prompt: "Existing cover image prompt",
          url: "https://cdn.example.com/existing-cover.png",
        },
      ],
    });

    expect(result.plannedImageCount).toBe(1);
    expect(result.imagePrompts).toEqual([
      expect.objectContaining({
        pageNumber: 1,
        imageIndex: 1,
        placementRole: "hero",
        shortLabel: "cover hero",
      }),
    ]);
  });

  it("falls back to deterministic payload slides when artifact generation fails and llm slide json is not importable", async () => {
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: "{\"slides\":[]}",
      modelId: "gpt-5.4",
    } as any);
    vi.mocked(executeSkill).mockResolvedValue({
      success: false,
      error: "Slide artifact generation failed (failed)",
    } as any);

    const result = await generatePresentationSlideDraft(makeSlideDraftInput());

    expect(result.slideJson).toContain("\"slides\"");
    expect(result.slideJson).toContain("Problem / Solution");
    expect(result.slideJson).toContain("https://cdn.example.com/cover.png");
    expect(result.artifactFailureMessage).toBe("Slide artifact generation failed (failed)");
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

  it("normalizes editorial render manifests into importable slide json", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "editorial-layout-planner",
      name: "Editorial Layout Planner",
      executionMode: "llm-only",
      systemPrompt: "Return render manifests.",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        output_format: "render_manifest_json",
        canvas: {
          width_px: 1080,
          height_px: 1350,
          background: {
            color: "#F4EEE7",
          },
        },
        pages: [
          {
            page_number: 1,
            render_notes: "Converted from render manifest",
            text_blocks: [
              {
                id: "p1_title",
                role: "title",
                content: "Editorial Planner Slide",
                bounds: { x: 72, y: 64, w: 936, h: 138 },
                typography: { font_size_px: 62, align: "left", weight: 700 },
              },
            ],
            image_blocks: [
              {
                id: "p1_image",
                reference: "https://cdn.example.com/cover.png",
                bounds: { x: 88, y: 244, w: 904, h: 576 },
                crop_mode: "cover",
                corner_radius_px: 0,
              },
            ],
          },
          {
            page_number: 2,
            render_notes: "Converted from render manifest",
            text_blocks: [
              {
                id: "p2_title",
                role: "title",
                content: "Editorial Planner Slide 2",
                bounds: { x: 72, y: 64, w: 936, h: 138 },
                typography: { font_size_px: 60, align: "left", weight: 700 },
              },
            ],
            image_blocks: [],
          },
        ],
        global_validation: [],
      }),
      modelId: "gpt-5.4",
      provider: { providerName: "OpenAI" },
      inputTokens: 600,
      outputTokens: 700,
      rawData: { usage: { cost: 0.01 } },
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "editorial-layout-planner",
      outputFormats: ["json"] as const,
      canvasRatio: "4:5",
    });

    expect(result.slideJson).toContain("\"slides\"");
    expect(result.slideJson).toContain("Editorial Planner Slide");
    expect(result.slideJson).toContain("https://cdn.example.com/cover.png");
    expect(result.slideJson).not.toContain("\"output_format\": \"render_manifest_json\"");
  });

  it("normalizes plain fallback pages into importable slide json", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSlideSkill({
      id: "editorial-layout-planner",
      name: "Editorial Layout Planner",
      executionMode: "llm-only",
      systemPrompt: "Return render manifests.",
    }) as any);
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        pages: [
          {
            page_number: 1,
            title_hint: "Fallback Planner Slide",
            text: "Fallback Planner Slide\n\nGenerated as plain pages by the repair pass.",
            images: [
              {
                reference: "https://cdn.example.com/fallback-cover.png",
              },
            ],
          },
        ],
      }),
      modelId: "gpt-5.4",
      provider: { providerName: "OpenAI" },
      inputTokens: 600,
      outputTokens: 700,
      rawData: { usage: { cost: 0.01 } },
    } as any);

    const result = await generatePresentationSlideDraft({
      ...makeSlideDraftInput(),
      slideSkillId: "editorial-layout-planner",
      outputFormats: ["json"] as const,
      maxPages: 1,
    });

    expect(result.slideJson).toContain("\"slides\"");
    expect(result.slideJson).toContain("Fallback Planner Slide");
    expect(result.slideJson).toContain("https://cdn.example.com/fallback-cover.png");
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
