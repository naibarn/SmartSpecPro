/**
 * Coverage for `videoProjectReviewAdapter.ts` (Feature 142, section-03). This
 * file wires the already-shipped `video-project-quality-review` skill to the
 * QA loop's `runReview` effect (`videoProjectQualityLoop.ts`). TDD: written
 * before the adapter exists.
 *
 * Mock graph (section-03 §4.1) — only two modules are mocked, everything
 * else (`videoProjectQualityLoop`, `validateProjectClaims`,
 * `@shared/videoIntelligence/projectSchemas`) is real:
 *
 * - `../callLLMStructured` — spread `importOriginal()` so
 *   `LLMStructuredOutputError` stays the REAL class (its `instanceof` branch
 *   must actually fire, not pass vacuously).
 * - `../videoIntelligenceModelResolver` — mirrors section-02's real export
 *   list.
 *
 * `mockResolvedValue` / `mockRejectedValue` only, never `...Once` (recorded
 * `Once`-queue leak failure class, `memory/project_vitest_leak`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

vi.mock("../callLLMStructured", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../callLLMStructured")>()),
  callLLMStructured: vi.fn(),
}));
vi.mock("../videoIntelligenceModelResolver", () => ({
  resolveStructuredStageModel: vi.fn(),
  reportStructuredOutputViolation: vi.fn(),
}));

import { callLLMStructured, LLMStructuredOutputError } from "../callLLMStructured";
import { reportStructuredOutputViolation } from "../videoIntelligenceModelResolver";
import {
  buildDocumentSummary,
  makeRunReview,
  VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING,
  videoProjectReviewSchema,
} from "../videoProjectReviewAdapter";
import { VideoProjectDocumentSchema } from "@shared/videoIntelligence/projectSchemas";
import type { ClaimValidationResult } from "../validateProjectClaims";
import type { VideoProjectQualityMetrics } from "../videoProjectQualityMetrics";
import type { VideoProjectReview } from "../videoProjectQualityLoop";

const ADAPTER_SOURCE_PATH = path.resolve(__dirname, "../videoProjectReviewAdapter.ts");

const mockedCallLLMStructured = callLLMStructured as unknown as ReturnType<typeof vi.fn>;
const mockedReportStructuredOutputViolation =
  reportStructuredOutputViolation as unknown as ReturnType<typeof vi.fn>;

/* -------------------------------------------------------------------------- */
/* Fixtures — every VideoProjectDocument fixture round-trips through the real */
/* VideoProjectDocumentSchema (§4.1 convention).                              */
/* -------------------------------------------------------------------------- */

function baseImageLayer(overrides: Record<string, unknown> = {}) {
  return {
    id: "layer_image",
    type: "image",
    startFrame: 0,
    durationFrames: 60,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 0,
    src: "https://cdn.example.com/should-not-leak.png",
    fit: "cover",
    ...overrides,
  };
}

function textLayer(overrides: Record<string, unknown> = {}) {
  return {
    id: "layer_text",
    type: "text",
    startFrame: 0,
    durationFrames: 60,
    x: 10,
    y: 10,
    width: 50,
    height: 20,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 1,
    content: "on-screen text",
    fontFamily: "Inter",
    fontSizePx: 48,
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "normal",
    ...overrides,
  };
}

function buildScene(overrides: Record<string, unknown> = {}) {
  return {
    sceneId: "SC-001",
    startMs: 0,
    endMs: 5000,
    narration: null,
    narrationAudioAssetId: null,
    visual: { kind: "layers" },
    layers: [],
    motion: { intensity: "medium", camera: "static" },
    captionCues: [],
    ...overrides,
  };
}

function buildDocument(overrides: Record<string, unknown> = {}) {
  return VideoProjectDocumentSchema.parse({
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 },
    content: { language: "en", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [buildScene()],
    audioTracks: [],
    captions: { presetId: "classic_box", burnIn: false, language: "en" },
    claims: [],
    qa: { targetScore: 8, maxLoops: 5 },
    ...overrides,
  });
}

function metrics(): VideoProjectQualityMetrics {
  return {
    sceneDurations: [],
    captionCps: [],
    layerCounts: { perScene: [], total: 0, maxLayersPerScene: 0 },
    safeAreaViolations: [],
    claimCoverage: { coverage: 1, mappedCount: 0, unmappedCount: 0, prohibitedCount: 0 },
    renderCost: { score: 0, cls: "low", recommendPreRender: false },
  };
}

function claimValidation(): ClaimValidationResult {
  return {
    mappedClaims: [],
    unmappedStatements: [],
    prohibitedClaims: [],
    coverage: 1,
    blocksFinalRender: false,
  };
}

function review(overrides: Partial<VideoProjectReview> = {}): VideoProjectReview {
  return {
    score: 8,
    scorecard: { content_accuracy_flow: 8 },
    issues: [],
    ...overrides,
  };
}

function successResult(overrides: Partial<{ data: VideoProjectReview; creditsUsed: number; modelId: string | null }> = {}) {
  return {
    data: review(),
    tokensUsed: 100,
    creditsUsed: 5,
    providerName: "openrouter",
    modelId: "gpt-5",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* buildDocumentSummary                                                       */
/* -------------------------------------------------------------------------- */

describe("buildDocumentSummary", () => {
  it("projects topic/audience/language/platformPreset/brandKitId/format from the document", () => {
    const document = buildDocument({
      content: {
        topic: "Skincare routine",
        audience: "Gen Z",
        language: "en",
        platformPreset: "reels_9_16",
      },
      brandKitId: "bk_123",
      format: { width: 1080, height: 1920, fps: 24, durationMs: 15000 },
    });

    const summary = buildDocumentSummary(document);

    expect(summary.topic).toBe("Skincare routine");
    expect(summary.audience).toBe("Gen Z");
    expect(summary.language).toBe("en");
    expect(summary.platformPreset).toBe("reels_9_16");
    expect(summary.brandKitId).toBe("bk_123");
    expect(summary.format).toEqual({ width: 1080, height: 1920, fps: 24, durationMs: 15000 });
  });

  it("summarizes each scene: id, timing, narration, caption cue texts, visual kind + templateId, motion, layer count and distinct layer types", () => {
    const document = buildDocument({
      scenes: [
        buildScene({
          sceneId: "SC-007",
          startMs: 1000,
          endMs: 6000,
          narration: "Hello world",
          visual: { kind: "template", templateId: "tmpl_hook", params: {} },
          motion: { intensity: "high", camera: "push-in" },
          captionCues: [
            { startMs: 1000, endMs: 3000, text: "first cue" },
            { startMs: 3000, endMs: 6000, text: "second cue" },
          ],
          layers: [
            baseImageLayer({ id: "l1" }),
            baseImageLayer({ id: "l2" }),
            textLayer({ id: "l3" }),
          ],
        }),
      ],
    });

    const summary = buildDocumentSummary(document);

    expect(summary.sceneCount).toBe(1);
    const [scene] = summary.scenes;
    expect(scene.sceneId).toBe("SC-007");
    expect(scene.startMs).toBe(1000);
    expect(scene.endMs).toBe(6000);
    expect(scene.narration).toBe("Hello world");
    expect(scene.captionText).toEqual(["first cue", "second cue"]);
    expect(scene.visual).toEqual({ kind: "template", templateId: "tmpl_hook" });
    expect(scene.motion).toEqual({ intensity: "high", camera: "push-in" });
    expect(scene.layerCount).toBe(3);
    expect(scene.layerTypes).toEqual(["image", "text"]);
  });

  it("never emits raw layer geometry or asset URLs — the payload is a summary, not the document", () => {
    const document = buildDocument({
      scenes: [
        buildScene({
          layers: [
            baseImageLayer({
              id: "leak_check",
              x: 12,
              y: 34,
              width: 56,
              height: 78,
              src: "https://cdn.example.com/should-not-leak.png",
            }),
          ],
        }),
      ],
    });

    const summary = buildDocumentSummary(document);
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toContain("should-not-leak");
    expect(serialized).not.toContain("rotationDeg");
    expect(serialized).not.toContain("zIndex");
    expect(summary.scenes[0]).not.toHaveProperty("layers");
  });

  it("truncates over-long narration with a visible marker instead of silently cutting a sentence", () => {
    const longNarration = "a".repeat(1000);
    const document = buildDocument({
      scenes: [buildScene({ narration: longNarration })],
    });

    const summary = buildDocumentSummary(document);
    const narration = summary.scenes[0].narration as string;

    expect(narration.length).toBeLessThan(longNarration.length);
    expect(narration).toMatch(/TRUNCAT/i);
  });

  it("is deterministic — the same document produces a byte-identical JSON.stringify", () => {
    const document = buildDocument({
      scenes: [
        buildScene({
          narration: "consistent narration",
          captionCues: [{ startMs: 0, endMs: 1000, text: "cue" }],
          layers: [baseImageLayer({ id: "l1" })],
        }),
      ],
    });

    const first = JSON.stringify(buildDocumentSummary(document));
    const second = JSON.stringify(buildDocumentSummary(document));

    expect(first).toBe(second);
  });
});

/* -------------------------------------------------------------------------- */
/* videoProjectReviewSchema                                                   */
/* -------------------------------------------------------------------------- */

describe("videoProjectReviewSchema", () => {
  it("accepts the exact example object from skill.md's Output format block", () => {
    const example = {
      score: 6,
      scorecard: {
        content_accuracy_flow: 7,
        hook_cta_clarity: 6,
        length_fit: 5,
        natural_spoken_language: 7,
        product_claim_compliance: 3,
        product_fidelity: 7,
        visual_narration_match: 7,
        scene_variety: 6,
        motion_clutter: 8,
        text_overflow_readability: 6,
        safe_area_compliance: 9,
        technical: 8,
      },
      issues: [
        {
          dimension: "product_claim_compliance",
          severity: "high",
          message:
            "Scene SC-002's narration states 'clears acne in 3 days,' which claimValidation.prohibitedClaims flags as a medical-results claim with no substantiation.",
          repairStage: "claims",
        },
        {
          dimension: "text_overflow_readability",
          severity: "medium",
          message:
            "Scene SC-003's caption cue reads at a flagged chars-per-second rate (metrics.captionCps) — too fast for a viewer to comprehend.",
        },
      ],
      repairInstructions: [
        {
          stage: "claims",
          instruction:
            "Remove or rewrite scene SC-002's narration to drop the unsubstantiated 'clears acne in 3 days' claim; replace with language backed by an approved claim record.",
        },
      ],
    };

    expect(videoProjectReviewSchema.safeParse(example).success).toBe(true);
  });

  it("accepts a Motion Studio review that omits product_claim_compliance and product_fidelity", () => {
    const motionStudioReview = {
      score: 8,
      scorecard: {
        content_accuracy_flow: 8,
        hook_cta_clarity: 8,
        length_fit: 8,
        natural_spoken_language: 8,
        visual_narration_match: 8,
        scene_variety: 8,
        motion_clutter: 8,
        text_overflow_readability: 8,
        safe_area_compliance: 8,
        technical: 8,
      },
      issues: [],
    };

    expect(videoProjectReviewSchema.safeParse(motionStudioReview).success).toBe(true);
  });

  it("rejects a score above 10, a missing issues array, and an unknown severity", () => {
    expect(
      videoProjectReviewSchema.safeParse({ score: 11, scorecard: {}, issues: [] }).success,
    ).toBe(false);
    expect(videoProjectReviewSchema.safeParse({ score: 5, scorecard: {} }).success).toBe(false);
    expect(
      videoProjectReviewSchema.safeParse({
        score: 5,
        scorecard: {},
        issues: [{ dimension: "content", severity: "extreme", message: "x" }],
      }).success,
    ).toBe(false);
  });

  it("drops an unknown top-level key rather than failing the whole review", () => {
    const result = videoProjectReviewSchema.safeParse({
      score: 7,
      scorecard: { content: 7 },
      issues: [],
      someFutureField: "should be stripped, not fatal",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("someFutureField");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING                                        */
/* -------------------------------------------------------------------------- */

describe("VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING", () => {
  it("stays thin — no dimension key names, thresholds, or scoring instructions", () => {
    expect(VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING.length).toBeLessThan(600);

    const forbiddenTerms = [
      "content_accuracy_flow",
      "hook_cta_clarity",
      "product_claim_compliance",
      "product_fidelity",
      "scene_variety",
      "motion_clutter",
      "safe_area_compliance",
      "prohibited",
      "medical",
      "warranty",
      "0-10",
      "0..10",
    ];
    const lower = VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING.toLowerCase();
    for (const term of forbiddenTerms) {
      expect(lower).not.toContain(term.toLowerCase());
    }
  });
});

/* -------------------------------------------------------------------------- */
/* makeRunReview                                                              */
/* -------------------------------------------------------------------------- */

describe("makeRunReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeDeps(overrides: Partial<Parameters<typeof makeRunReview>[0]> = {}) {
    const onUsage = vi.fn();
    return {
      deps: {
        tenantId: "tenant-1",
        userId: 42,
        traceId: "trace-abc",
        modelId: "gpt-5",
        documentSummary: buildDocumentSummary(buildDocument()),
        claimValidation: claimValidation(),
        onUsage,
        ...overrides,
      },
      onUsage,
    };
  }

  it("passes documentSummary, metrics and claimValidation as FACTS in userMessage and lets the skill own judgment", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const m = metrics();
    const runReview = makeRunReview(deps);
    await runReview({ projectId: "proj-1", metrics: m });

    expect(mockedCallLLMStructured).toHaveBeenCalledTimes(1);
    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(JSON.parse(call.userMessage)).toEqual({
      documentSummary: deps.documentSummary,
      metrics: m,
      claimValidation: deps.claimValidation,
    });
  });

  it("invokes callLLMStructured with runtimeOptions.skillSlugs = ['video-project-quality-review']", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runReview = makeRunReview(deps);
    await runReview({ projectId: "proj-1", metrics: metrics() });

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.runtimeOptions.skillSlugs).toEqual(["video-project-quality-review"]);
  });

  it("passes the dispatch-resolved modelId as `model` and leaves preferredProviderId unset", async () => {
    const { deps } = makeDeps({ modelId: "claude-opus" });
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runReview = makeRunReview(deps);
    await runReview({ projectId: "proj-1", metrics: metrics() });

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.model).toBe("claude-opus");
    expect(call.preferredProviderId).toBeUndefined();
  });

  it("sets maxRetries to 2 for bounded schema retry", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runReview = makeRunReview(deps);
    await runReview({ projectId: "proj-1", metrics: metrics() });

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.maxRetries).toBe(2);
  });

  it("uses zodSchema (not schema) and systemPrompt + userMessage (not a generic input object)", async () => {
    const { deps } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runReview = makeRunReview(deps);
    await runReview({ projectId: "proj-1", metrics: metrics() });

    const call = mockedCallLLMStructured.mock.calls[0][0];
    expect(call.zodSchema).toBe(videoProjectReviewSchema);
    expect(call.schema).toBeUndefined();
    expect(typeof call.systemPrompt).toBe("string");
    expect(typeof call.userMessage).toBe("string");
    expect(call.input).toBeUndefined();
  });

  it("returns result.data unchanged — the adapter adds no judgment of its own", async () => {
    const { deps } = makeDeps();
    const expected = review({ score: 3, issues: [{ dimension: "claims", severity: "high", message: "bad" }] });
    mockedCallLLMStructured.mockResolvedValue(successResult({ data: expected }));

    const runReview = makeRunReview(deps);
    const result = await runReview({ projectId: "proj-1", metrics: metrics() });

    expect(result).toBe(expected);
  });

  it("reports creditsUsed and the served modelId through onUsage", async () => {
    const { deps, onUsage } = makeDeps();
    mockedCallLLMStructured.mockResolvedValue(successResult({ creditsUsed: 12, modelId: "served-model" }));

    const runReview = makeRunReview(deps);
    await runReview({ projectId: "proj-1", metrics: metrics() });

    expect(onUsage).toHaveBeenCalledWith({ creditsUsed: 12, modelId: "served-model" });
  });

  it("does NOT call deductCredits", () => {
    const source = fs.readFileSync(ADAPTER_SOURCE_PATH, "utf-8");
    expect(source).not.toContain("deductCredits");
    expect(source).not.toContain("deductCreditsForModel");
  });

  it("records a contract_violation strike on LLMStructuredOutputError, then rethrows as VI_REVIEW_OUTPUT_INVALID", async () => {
    const { deps } = makeDeps({ modelId: "served-model" });
    const zodError = z.object({ score: z.number() }).safeParse({}).error as z.ZodError;
    const structuredError = new LLMStructuredOutputError(
      "schema validation failed",
      "{}",
      zodError,
      50,
      7,
    );
    mockedCallLLMStructured.mockRejectedValue(structuredError);

    const runReview = makeRunReview(deps);
    await expect(runReview({ projectId: "proj-1", metrics: metrics() })).rejects.toThrow(
      /^VI_REVIEW_OUTPUT_INVALID:/,
    );

    expect(mockedReportStructuredOutputViolation).toHaveBeenCalledTimes(1);
    const strikeArgs = mockedReportStructuredOutputViolation.mock.calls[0][0];
    expect(strikeArgs.modelId).toBe("served-model");
    expect(strikeArgs.traceId).toBe("trace-abc");
    expect(Array.isArray(strikeArgs.zodIssuePaths)).toBe(true);
    expect(strikeArgs.zodIssuePaths).toContain("score");
  });

  it("still reports the error's creditsUsed through onUsage before rethrowing", async () => {
    const { deps, onUsage } = makeDeps({ modelId: "served-model" });
    const zodError = z.object({ score: z.number() }).safeParse({}).error as z.ZodError;
    const structuredError = new LLMStructuredOutputError("bad", "{}", zodError, 50, 9);
    mockedCallLLMStructured.mockRejectedValue(structuredError);

    const runReview = makeRunReview(deps);
    await expect(runReview({ projectId: "proj-1", metrics: metrics() })).rejects.toThrow();

    expect(onUsage).toHaveBeenCalledWith({ creditsUsed: 9, modelId: "served-model" });
  });

  it("does NOT strike on a transport/provider error, and rethrows it unchanged", async () => {
    const { deps, onUsage } = makeDeps();
    const transportError = new Error("Insufficient credits");
    mockedCallLLMStructured.mockRejectedValue(transportError);

    const runReview = makeRunReview(deps);
    await expect(runReview({ projectId: "proj-1", metrics: metrics() })).rejects.toBe(transportError);

    expect(mockedReportStructuredOutputViolation).not.toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("never throws out of onUsage's own failure — reporting must not break the loop", async () => {
    const onUsage = vi.fn(() => {
      throw new Error("onUsage exploded");
    });
    const deps = {
      tenantId: "tenant-1",
      userId: 42,
      traceId: "trace-abc",
      modelId: "gpt-5",
      documentSummary: buildDocumentSummary(buildDocument()),
      claimValidation: claimValidation(),
      onUsage,
    };
    mockedCallLLMStructured.mockResolvedValue(successResult());

    const runReview = makeRunReview(deps);
    await expect(runReview({ projectId: "proj-1", metrics: metrics() })).resolves.toEqual(review());
    expect(onUsage).toHaveBeenCalledTimes(1);
  });
});
