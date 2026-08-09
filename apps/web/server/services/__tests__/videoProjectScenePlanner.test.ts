/**
 * Coverage for `videoProjectScenePlanner.ts` (Feature 142, section-05). TDD:
 * written before the planner's behavior is asserted against. Imports the
 * REAL `MOTION_TEMPLATE_REGISTRY` and the REAL `VideoProjectDocumentSchema`
 * (both pure and server-safe) — zero module mocks, only `ScenePlanEffects`
 * doubles (`makeEffects()`, the `videoProjectQualityLoop.test.ts:38-52`
 * convention). Every document fixture round-trips through
 * `VideoProjectDocumentSchema`.
 */
import { describe, expect, it, vi } from "vitest";

import {
  planScenes,
  MAX_RENDERABLE_LAYERS,
  SCENE_PLAN_REPORTABLE_GAP_MS,
  rehomeLayersForSceneTimingChange,
  forecastPostStageLayerCount,
  type ScenePlanEffects,
  type ScenePlanSkillOutput,
} from "../videoProjectScenePlanner";
import {
  VideoProjectDocumentSchema,
  type VideoProjectDocument,
  type Scene,
} from "@shared/videoIntelligence/projectSchemas";
import type { ResolvedCatalogFacts } from "../validateProjectClaims";
import type { BrandKit } from "@shared/videoIntelligence/brandKit";
import { compileVideoProject } from "../videoProjectCompiler";
import { MOTION_TEMPLATE_REGISTRY } from "../../remotion/templates";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function scene(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sceneId: id,
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

function buildDocument(overrides: Record<string, unknown> = {}): VideoProjectDocument {
  return VideoProjectDocumentSchema.parse({
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 10000 },
    content: { language: "en", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [scene("s1", { endMs: 5000 }), scene("s2", { startMs: 5000, endMs: 10000 })],
    audioTracks: [],
    captions: { presetId: "no_subtitle_style", burnIn: false, language: "en" },
    claims: [],
    qa: { targetScore: 7, maxLoops: 1 },
    ...overrides,
  });
}

function makeEffects(overrides: Partial<ScenePlanEffects> = {}): ScenePlanEffects {
  return {
    runPlanSkill: vi.fn(async () => ({ scenes: [], summary: "no-op" }) as ScenePlanSkillOutput),
    resolveFacts: vi.fn(async () => null),
    persistDocument: vi.fn(async () => ({ revision: 99 })),
    ...overrides,
  };
}

function twoSceneKineticOutput(overrides: Partial<ScenePlanSkillOutput> = {}): ScenePlanSkillOutput {
  return {
    scenes: [
      {
        sceneId: "s1",
        templateId: "kinetic_typography",
        templateParams: { words: ["Hello", "World"] },
        startMs: 0,
        endMs: 5000,
        rationale: "hook",
        onScreenStatements: [],
      },
      {
        sceneId: "s2",
        templateId: "kinetic_typography",
        templateParams: { words: ["Buy", "Now"] },
        startMs: 5000,
        endMs: 10000,
        rationale: "cta",
        onScreenStatements: [],
      },
    ],
    summary: "two scenes",
    ...overrides,
  };
}

function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    document: buildDocument(),
    mode: "fill_empty" as const,
    studioType: "motion",
    productIds: [] as string[],
    brandKit: null,
    effects: makeEffects(),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Happy path                                                                  */
/* -------------------------------------------------------------------------- */

describe("planScenes — happy path", () => {
  it("passes the selected motion style to the skill as brief context", async () => {
    const runPlanSkill = vi.fn(async () => twoSceneKineticOutput());
    const effects = makeEffects({ runPlanSkill });

    await planScenes(baseArgs({ effects, briefMotionStyle: "data_story" }));

    expect(runPlanSkill).toHaveBeenCalledWith(expect.objectContaining({
      brief: expect.objectContaining({ motionStyle: "data_story" }),
    }));
  });

  it("produces a document whose scenes carry real templateIds and bound params", async () => {
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => twoSceneKineticOutput()) });
    let persisted: VideoProjectDocument | undefined;
    effects.persistDocument = vi.fn(async doc => {
      persisted = doc;
      return { revision: 4 };
    });

    await planScenes(baseArgs({ effects }));

    expect(persisted).toBeDefined();
    expect(persisted!.scenes[0].visual).toEqual({
      kind: "template",
      templateId: "kinetic_typography",
      params: { words: ["Hello", "World"] },
    });
    expect(persisted!.scenes[1].visual.kind).toBe("template");
  });

  it("calls persistDocument exactly once, with reason 'scene_plan'", async () => {
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => twoSceneKineticOutput()) });

    await planScenes(baseArgs({ effects }));

    expect(effects.persistDocument).toHaveBeenCalledTimes(1);
    expect((effects.persistDocument as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("scene_plan");
  });

  it("returns the revision persistDocument reported", async () => {
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => twoSceneKineticOutput()),
      persistDocument: vi.fn(async () => ({ revision: 77 })),
    });

    const result = await planScenes(baseArgs({ effects }));

    expect(result.revision).toBe(77);
  });

  it("re-parses the merged document against VideoProjectDocumentSchema before writing", async () => {
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => twoSceneKineticOutput()) });
    let persisted: VideoProjectDocument | undefined;
    effects.persistDocument = vi.fn(async doc => {
      persisted = doc;
      return { revision: 1 };
    });

    await planScenes(baseArgs({ effects }));

    expect(() => VideoProjectDocumentSchema.parse(persisted)).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Fail-closed validation (nothing written)                                   */
/* -------------------------------------------------------------------------- */

describe("planScenes — fail-closed validation (nothing written)", () => {
  it("rejects an unknown templateId with VI_PLAN_TEMPLATE_UNKNOWN", async () => {
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "does_not_exist",
            templateParams: {},
            startMs: 0,
            endMs: 5000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    await expect(planScenes(baseArgs({ effects }))).rejects.toThrow(/VI_PLAN_TEMPLATE_UNKNOWN/);
    expect(effects.persistDocument).not.toHaveBeenCalled();
  });

  it("rejects params that fail the template's own Zod schema with VI_PLAN_PARAMS_INVALID", async () => {
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: [] }, // violates .min(1)
            startMs: 0,
            endMs: 5000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    await expect(planScenes(baseArgs({ effects }))).rejects.toThrow(/VI_PLAN_PARAMS_INVALID/);
    expect(effects.persistDocument).not.toHaveBeenCalled();
  });

  it("rejects a planned sceneId that is neither an existing plannable scene nor a new id", async () => {
    // s1/s2 both start as empty "layers" scenes (plannable). Make s2
    // preserved by giving it non-empty layers, then have the skill try to
    // plan it anyway — must be rejected, never silently merged.
    const document = buildDocument({
      scenes: [
        scene("s1", { endMs: 5000 }),
        scene("s2", {
          startMs: 5000,
          endMs: 10000,
          visual: { kind: "template", templateId: "kinetic_typography", params: { words: ["Existing"] } },
        }),
      ],
    });
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["Overwrite"] },
            startMs: 5000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    await expect(planScenes(baseArgs({ document, effects }))).rejects.toThrow(/VI_PLAN_PARAMS_INVALID/);
    expect(effects.persistDocument).not.toHaveBeenCalled();
  });

  it("leaves the document BYTE-IDENTICAL when the 3rd of 5 scenes is invalid", async () => {
    const document = buildDocument({
      scenes: [
        scene("s1", { startMs: 0, endMs: 2000 }),
        scene("s2", { startMs: 2000, endMs: 4000 }),
        scene("s3", { startMs: 4000, endMs: 6000 }),
        scene("s4", { startMs: 6000, endMs: 8000 }),
        scene("s5", { startMs: 8000, endMs: 10000 }),
      ],
    });
    const before = JSON.parse(JSON.stringify(document));

    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["A"] },
            startMs: 0,
            endMs: 2000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["B"] },
            startMs: 2000,
            endMs: 4000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s3",
            templateId: "unknown_template_id",
            templateParams: {},
            startMs: 4000,
            endMs: 6000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s4",
            templateId: "kinetic_typography",
            templateParams: { words: ["D"] },
            startMs: 6000,
            endMs: 8000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s5",
            templateId: "kinetic_typography",
            templateParams: { words: ["E"] },
            startMs: 8000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    await expect(planScenes(baseArgs({ document, effects }))).rejects.toThrow(/VI_PLAN_TEMPLATE_UNKNOWN/);
    expect(document).toEqual(before);
  });

  it("never calls persistDocument on any validation failure", async () => {
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "nope",
            templateParams: {},
            startMs: 0,
            endMs: 5000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    await expect(planScenes(baseArgs({ effects }))).rejects.toThrow();
    expect(effects.persistDocument).not.toHaveBeenCalled();
  });

  it("does not mutate the document object it was given", async () => {
    const document = buildDocument();
    const before = JSON.parse(JSON.stringify(document));
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => twoSceneKineticOutput()) });

    await planScenes(baseArgs({ document, effects }));

    expect(document).toEqual(before);
  });
});

/* -------------------------------------------------------------------------- */
/* R1 — layer budget                                                          */
/* -------------------------------------------------------------------------- */

describe("planScenes — R1 layer budget", () => {
  function manyEmptyScenes(count: number, sceneDurationMs: number): Record<string, unknown>[] {
    return Array.from({ length: count }, (_, index) =>
      scene(`s${index + 1}`, {
        startMs: index * sceneDurationMs,
        endMs: (index + 1) * sceneDurationMs,
      }),
    );
  }

  function kineticOutputForScenes(
    count: number,
    sceneDurationMs: number,
    wordsPerScene: number,
  ): ScenePlanSkillOutput {
    return {
      scenes: Array.from({ length: count }, (_, index) => ({
        sceneId: `s${index + 1}`,
        templateId: "kinetic_typography",
        templateParams: { words: Array.from({ length: wordsPerScene }, (_, w) => `w${w}`) },
        startMs: index * sceneDurationMs,
        endMs: (index + 1) * sceneDurationMs,
        rationale: "x",
        onScreenStatements: [],
      })),
      summary: "x",
    };
  }

  it("rejects a plan whose MERGED layer count exceeds 40 with VI_PLAN_LAYER_BUDGET_EXCEEDED", async () => {
    // kinetic_typography's maxItems is 8 — 6 scenes x 8 words = 48 layers.
    const document = buildDocument({
      format: { width: 1080, height: 1920, fps: 30, durationMs: 60000 },
      scenes: manyEmptyScenes(6, 10000),
    });
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => kineticOutputForScenes(6, 10000, 8)),
    });

    await expect(planScenes(baseArgs({ document, effects }))).rejects.toThrow(
      /VI_PLAN_LAYER_BUDGET_EXCEEDED/,
    );
    expect(effects.persistDocument).not.toHaveBeenCalled();
  });

  it("accepts a plan that lands exactly on the 40-layer boundary", async () => {
    // 5 scenes x 8 words = 40 layers exactly.
    const document = buildDocument({
      format: { width: 1080, height: 1920, fps: 30, durationMs: 50000 },
      scenes: manyEmptyScenes(5, 10000),
    });
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => kineticOutputForScenes(5, 10000, 8)),
    });

    const result = await planScenes(baseArgs({ document, effects }));

    expect(effects.persistDocument).toHaveBeenCalledTimes(1);
    expect(result.layerBudget.max).toBe(MAX_RENDERABLE_LAYERS);
  });

  it("counts layers already present in the document, not just newly planned ones", async () => {
    // s1 is PRESERVED (already has manual layers) and contributes to `used`;
    // s2 is the only plannable scene.
    const document = buildDocument({
      scenes: [
        scene("s1", {
          endMs: 5000,
          layers: [
            {
              id: "manual",
              type: "text",
              startFrame: 0,
              durationFrames: 30,
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 0,
              content: "manual layer",
              fontFamily: "Inter",
              fontSizePx: 20,
              color: "#fff",
              textAlign: "center",
              fontWeight: "normal",
            },
          ],
        }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    let capturedInput: unknown;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async input => {
        capturedInput = input;
        return {
          scenes: [
            {
              sceneId: "s2",
              templateId: "kinetic_typography",
              templateParams: { words: ["Hi"] },
              startMs: 5000,
              endMs: 10000,
              rationale: "x",
              onScreenStatements: [],
            },
          ],
          summary: "x",
        };
      }),
    });

    await planScenes(baseArgs({ document, effects }));

    expect((capturedInput as { layerBudget: { used: number } }).layerBudget.used).toBe(1);
  });

  it("counts caption cue layers and author-authored scene.layers, not only template layers", async () => {
    const document = buildDocument({
      captions: { presetId: "classic_box", burnIn: false, language: "en" },
      scenes: [
        scene("s1", {
          endMs: 5000,
          layers: [
            {
              id: "manual",
              type: "text",
              startFrame: 0,
              durationFrames: 30,
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 0,
              content: "manual layer",
              fontFamily: "Inter",
              fontSizePx: 20,
              color: "#fff",
              textAlign: "center",
              fontWeight: "normal",
            },
          ],
          captionCues: [
            { startMs: 0, endMs: 1000, text: "cue one" },
            { startMs: 1000, endMs: 2000, text: "cue two" },
          ],
        }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    let capturedInput: unknown;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async input => {
        capturedInput = input;
        return {
          scenes: [
            {
              sceneId: "s2",
              templateId: "kinetic_typography",
              templateParams: { words: ["Hi"] },
              startMs: 5000,
              endMs: 10000,
              rationale: "x",
              onScreenStatements: [],
            },
          ],
          summary: "x",
        };
      }),
    });

    await planScenes(baseArgs({ document, effects }));

    // 1 manual layer + 2 caption cues = 3.
    expect((capturedInput as { layerBudget: { used: number } }).layerBudget.used).toBe(3);
  });

  it("passes { max, used, remaining } into the skill input as a fact before the call", async () => {
    let capturedInput: unknown;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async input => {
        capturedInput = input;
        return twoSceneKineticOutput();
      }),
    });

    await planScenes(baseArgs({ effects }));

    const layerBudget = (capturedInput as { layerBudget: { max: number; used: number; remaining: number } })
      .layerBudget;
    expect(layerBudget).toEqual({ max: 40, used: 0, remaining: 40 });
  });
});

/* -------------------------------------------------------------------------- */
/* R2 — timeline invariants                                                   */
/* -------------------------------------------------------------------------- */

describe("planScenes — R2 timeline invariants", () => {
  it("rejects endMs <= startMs with VI_PLAN_TIMELINE_INVALID", async () => {
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["A"] },
            startMs: 1000,
            endMs: 1000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["B"] },
            startMs: 5000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    await expect(planScenes(baseArgs({ effects }))).rejects.toThrow(/VI_PLAN_TIMELINE_INVALID/);
    expect(effects.persistDocument).not.toHaveBeenCalled();
  });

  it("rejects overlapping scenes when sorted by startMs", async () => {
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["A"] },
            startMs: 0,
            endMs: 6000, // overlaps s2's 5000-10000 window
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["B"] },
            startMs: 5000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    await expect(planScenes(baseArgs({ effects }))).rejects.toThrow(/VI_PLAN_TIMELINE_INVALID/);
  });

  it("rejects max(endMs) > format.durationMs", async () => {
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["A"] },
            startMs: 0,
            endMs: 5000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["B"] },
            startMs: 5000,
            endMs: 20000, // document durationMs is 10000
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    await expect(planScenes(baseArgs({ effects }))).rejects.toThrow(/VI_PLAN_TIMELINE_INVALID/);
  });

  it("rejects a fill_empty plan that collides with an EXISTING scene's time range", async () => {
    // s1 is preserved (already templated); s2 is plannable but the skill
    // proposes a window that collides with s1's existing 0-5000 range.
    const document = buildDocument({
      scenes: [
        scene("s1", {
          endMs: 5000,
          visual: { kind: "template", templateId: "kinetic_typography", params: { words: ["Existing"] } },
        }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["Collide"] },
            startMs: 3000, // collides with preserved s1's 0-5000 window
            endMs: 8000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    await expect(planScenes(baseArgs({ document, effects }))).rejects.toThrow(/VI_PLAN_TIMELINE_INVALID/);
    expect(effects.persistDocument).not.toHaveBeenCalled();
  });

  it("permits gaps but reports them in result.gaps", async () => {
    const document = buildDocument({
      format: { width: 1080, height: 1920, fps: 30, durationMs: 20000 },
      scenes: [scene("s1", { endMs: 5000 }), scene("s2", { startMs: 5000, endMs: 10000 })],
    });
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["A"] },
            startMs: 0,
            endMs: 5000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["B"] },
            startMs: 6000, // 1000ms gap after s1
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    const result = await planScenes(baseArgs({ document, effects }));

    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps.some(gap => gap.afterSceneId === "s1" && gap.ms === 1000)).toBe(true);
  });

  it("flags hasLongGap for a gap over SCENE_PLAN_REPORTABLE_GAP_MS", async () => {
    const document = buildDocument({
      format: { width: 1080, height: 1920, fps: 30, durationMs: 20000 },
      scenes: [scene("s1", { endMs: 2000 }), scene("s2", { startMs: 2000, endMs: 4000 })],
    });
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["A"] },
            startMs: 0,
            endMs: 2000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["B"] },
            startMs: 2000 + SCENE_PLAN_REPORTABLE_GAP_MS + 500,
            endMs: 2000 + SCENE_PLAN_REPORTABLE_GAP_MS + 2500,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    const result = await planScenes(baseArgs({ document, effects }));

    expect(result.hasLongGap).toBe(true);
  });

  it("passes occupiedIntervals into the skill input so collisions are a constraint, not a rejection", async () => {
    const document = buildDocument({
      scenes: [
        scene("s1", {
          endMs: 5000,
          visual: { kind: "template", templateId: "kinetic_typography", params: { words: ["Existing"] } },
        }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    let capturedInput: unknown;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async input => {
        capturedInput = input;
        return {
          scenes: [
            {
              sceneId: "s2",
              templateId: "kinetic_typography",
              templateParams: { words: ["B"] },
              startMs: 5000,
              endMs: 10000,
              rationale: "x",
              onScreenStatements: [],
            },
          ],
          summary: "x",
        };
      }),
    });

    await planScenes(baseArgs({ document, effects }));

    expect((capturedInput as { occupiedIntervals: unknown[] }).occupiedIntervals).toEqual([
      { sceneId: "s1", startMs: 0, endMs: 5000 },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Re-run semantics                                                           */
/* -------------------------------------------------------------------------- */

describe("planScenes — re-run semantics", () => {
  it("fill_empty does not overwrite a scene that already has a template", async () => {
    const document = buildDocument({
      scenes: [
        scene("s1", {
          endMs: 5000,
          visual: { kind: "template", templateId: "kinetic_typography", params: { words: ["Existing"] } },
        }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    let persisted: VideoProjectDocument | undefined;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["New"] },
            startMs: 5000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
      persistDocument: vi.fn(async doc => {
        persisted = doc;
        return { revision: 1 };
      }),
    });

    await planScenes(baseArgs({ document, mode: "fill_empty", effects }));

    expect(persisted!.scenes[0].visual).toEqual({
      kind: "template",
      templateId: "kinetic_typography",
      params: { words: ["Existing"] },
    });
  });

  // Feature 143 §4.9.3 / D2 (P0, was silently destructive): "empty" for
  // fill_empty means NO NARRATION and NO TEMPLATE, NOT "no layers". Before
  // this fix, `scene.layers.length === 0` going false the moment a user
  // placed one hand-authored layer would silently remove that scene from
  // `fill_empty` planning FOREVER (auto-draft would never plan its visual).
  const manualTextLayer = {
    id: "manual",
    type: "text",
    startFrame: 0,
    durationFrames: 30,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 0,
    content: "manual",
    fontFamily: "Inter",
    fontSizePx: 20,
    color: "#fff",
    textAlign: "center",
    fontWeight: "normal",
  };

  it("a scene with hand-authored layers but no narration/template IS plannable in fill_empty (§4.9.3/D2)", async () => {
    const document = buildDocument({
      scenes: [
        scene("s1", { endMs: 5000, layers: [manualTextLayer] }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["New"] },
            startMs: 0,
            endMs: 5000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["New"] },
            startMs: 5000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    const result = await planScenes(baseArgs({ document, mode: "fill_empty", effects }));

    // Both scenes were plannable (s1 despite having a layer) and the skill's
    // plan for BOTH was applied.
    expect(result.skippedSceneIds).toEqual([]);
    expect(result.plannedSceneIds.sort()).toEqual(["s1", "s2"]);
  });

  it("if the skill leaves the layered-but-empty scene untouched, it is reported in skippedSceneIds — NOT silently excluded from planning forever, and its layer survives", async () => {
    const document = buildDocument({
      scenes: [
        scene("s1", { endMs: 5000, layers: [manualTextLayer] }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    let persisted: VideoProjectDocument | undefined;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["New"] },
            startMs: 5000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
      persistDocument: vi.fn(async doc => {
        persisted = doc;
        return { revision: 1 };
      }),
    });

    const result = await planScenes(baseArgs({ document, mode: "fill_empty", effects }));

    // s1 WAS offered to the skill (it is plannable) — the skill simply chose
    // not to plan it this round, which is a legitimate "skipped", never a
    // silent permanent exclusion.
    expect(result.skippedSceneIds).toEqual(["s1"]);
    expect(result.plannedSceneIds).toEqual(["s2"]);
    // The hand-authored layer survives untouched either way.
    expect(persisted!.scenes.find(s => s.sceneId === "s1")!.layers).toEqual([manualTextLayer]);
  });

  it("fill_empty reports untouched scenes in skippedSceneIds", async () => {
    const document = buildDocument({
      scenes: [scene("s1", { endMs: 5000 }), scene("s2", { startMs: 5000, endMs: 10000 })],
    });
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["A"] },
            startMs: 0,
            endMs: 5000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    const result = await planScenes(baseArgs({ document, mode: "fill_empty", effects }));

    expect(result.skippedSceneIds).toEqual(["s2"]);
    expect(result.plannedSceneIds).toEqual(["s1"]);
  });

  it("replace re-plans every scene", async () => {
    const document = buildDocument({
      scenes: [
        scene("s1", {
          endMs: 5000,
          visual: { kind: "template", templateId: "kinetic_typography", params: { words: ["Old"] } },
        }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => twoSceneKineticOutput()) });

    const result = await planScenes(baseArgs({ document, mode: "replace", effects }));

    expect(result.plannedSceneIds.sort()).toEqual(["s1", "s2"]);
    expect(result.skippedSceneIds).toEqual([]);
  });

  it("keeps existing startMs/endMs for a scene with narration audio or caption cues (timingLocked)", async () => {
    const document = buildDocument({
      scenes: [
        scene("s1", { endMs: 5000, narrationAudioAssetId: 42 }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    let persisted: VideoProjectDocument | undefined;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["A"] },
            startMs: 999, // must be ignored — s1 is timing-locked
            endMs: 4999,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["B"] },
            startMs: 5000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
      persistDocument: vi.fn(async doc => {
        persisted = doc;
        return { revision: 1 };
      }),
    });

    await planScenes(baseArgs({ document, mode: "replace", effects }));

    const s1 = persisted!.scenes.find(scene => scene.sceneId === "s1")!;
    expect(s1.startMs).toBe(0);
    expect(s1.endMs).toBe(5000);
  });

  it("never deletes a scene, and never rewrites narration, narrationAudioAssetId or captionCues", async () => {
    const document = buildDocument({
      scenes: [
        scene("s1", {
          endMs: 5000,
          narration: "Original narration",
          narrationAudioAssetId: 7,
          captionCues: [{ startMs: 0, endMs: 1000, text: "Original cue" }],
        }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });
    let persisted: VideoProjectDocument | undefined;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["B"] },
            startMs: 5000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
      persistDocument: vi.fn(async doc => {
        persisted = doc;
        return { revision: 1 };
      }),
    });

    await planScenes(baseArgs({ document, mode: "fill_empty", effects }));

    expect(persisted!.scenes).toHaveLength(2);
    const s1 = persisted!.scenes.find(scene => scene.sceneId === "s1")!;
    expect(s1.narration).toBe("Original narration");
    expect(s1.narrationAudioAssetId).toBe(7);
    expect(s1.captionCues).toEqual([{ startMs: 0, endMs: 1000, text: "Original cue" }]);
  });

  it("appends new scenes returned by the skill and lists them in appendedSceneIds", async () => {
    const document = buildDocument({
      format: { width: 1080, height: 1920, fps: 30, durationMs: 15000 },
      scenes: [scene("s1", { endMs: 5000 }), scene("s2", { startMs: 5000, endMs: 10000 })],
    });
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["A"] },
            startMs: 0,
            endMs: 5000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s2",
            templateId: "kinetic_typography",
            templateParams: { words: ["B"] },
            startMs: 5000,
            endMs: 10000,
            rationale: "x",
            onScreenStatements: [],
          },
          {
            sceneId: "s3-new",
            templateId: "luxury_end_card",
            templateParams: { ctaText: "Shop now" },
            startMs: 10000,
            endMs: 12000,
            rationale: "closing beat",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
    });

    const result = await planScenes(baseArgs({ document, effects }));

    expect(result.appendedSceneIds).toEqual(["s3-new"]);
  });

  it("persists with reason 'scene_plan' in BOTH modes", async () => {
    const document = buildDocument({
      scenes: [scene("s1", { endMs: 5000 }), scene("s2", { startMs: 5000, endMs: 10000 })],
    });

    for (const mode of ["fill_empty", "replace"] as const) {
      const effects = makeEffects({ runPlanSkill: vi.fn(async () => twoSceneKineticOutput()) });
      await planScenes(baseArgs({ document, mode, effects }));
      expect((effects.persistDocument as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("scene_plan");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Isolation                                                                   */
/* -------------------------------------------------------------------------- */

describe("planScenes — isolation", () => {
  it("calls resolveFacts only for a catalog project with productIds", async () => {
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => twoSceneKineticOutput()) });

    await planScenes(baseArgs({ studioType: "motion", productIds: [], effects }));
    expect(effects.resolveFacts).not.toHaveBeenCalled();

    const catalogFacts: ResolvedCatalogFacts = { productIds: ["p1"], claimResolutions: [] };
    const catalogEffects = makeEffects({
      runPlanSkill: vi.fn(async () => twoSceneKineticOutput()),
      resolveFacts: vi.fn(async () => catalogFacts),
    });
    await planScenes(baseArgs({ studioType: "catalog", productIds: ["p1"], effects: catalogEffects }));
    expect(catalogEffects.resolveFacts).toHaveBeenCalledWith(["p1"]);
  });

  it("passes catalogFacts through to the skill input, mapped from ResolvedCatalogFacts", async () => {
    const catalogFacts: ResolvedCatalogFacts = {
      productIds: ["p1"],
      claimResolutions: [{ claim: "Waterproof", source: "catalog", status: "approved" }],
    };
    let capturedInput: unknown;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async input => {
        capturedInput = input;
        return twoSceneKineticOutput();
      }),
      resolveFacts: vi.fn(async () => catalogFacts),
    });

    await planScenes(baseArgs({ studioType: "catalog", productIds: ["p1"], effects }));

    expect((capturedInput as { catalogFacts: unknown }).catalogFacts).toEqual({
      productIds: ["p1"],
      claims: [{
        claim: expect.stringContaining("Waterproof"),
        source: expect.stringContaining("catalog"),
        status: "approved",
      }],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* R10 self-heal — deterministically re-apply locked brand tokens             */
/* -------------------------------------------------------------------------- */

describe("planScenes — R10 self-heal (locked brand tokens)", () => {
  const brandKitLocks: BrandKit = {
    colors: { primary: "#111111" },
    fonts: { heading: "Inter", body: "Inter" },
    captionPresetId: null,
    locks: { motionIntensity: true, cta: true },
  };

  function fakeAssetResolver() {
    return { url: (id: number | string) => `https://cdn.example.com/${id}`, sha256: () => undefined };
  }

  it("forces motion.intensity to agree across the scenes this round touched when motionIntensity is locked, and the healed document does not throw at compile", async () => {
    const output: ScenePlanSkillOutput = {
      scenes: [
        {
          sceneId: "s1",
          templateId: "kinetic_typography",
          templateParams: { words: ["Hello"] },
          startMs: 0,
          endMs: 5000,
          motion: { intensity: "low", camera: "static" },
          rationale: "hook",
          onScreenStatements: [],
        },
        {
          sceneId: "s2",
          templateId: "kinetic_typography",
          templateParams: { words: ["Buy"] },
          startMs: 5000,
          endMs: 10000,
          motion: { intensity: "high", camera: "static" },
          rationale: "cta",
          onScreenStatements: [],
        },
      ],
      summary: "two scenes",
    };
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => output) });
    let persisted: VideoProjectDocument | undefined;
    effects.persistDocument = vi.fn(async doc => {
      persisted = doc;
      return { revision: 1 };
    });

    await planScenes(baseArgs({ effects, resolvedBrandKit: brandKitLocks }));

    expect(persisted!.scenes[0].motion.intensity).toBe(persisted!.scenes[1].motion.intensity);

    // The self-healed document must survive the REAL compiler's brand-lock
    // enforcement with the real brand kit — proving R10's "self-healing
    // instead of unrenderable", not just a passing test assertion.
    expect(() =>
      compileVideoProject(
        persisted!,
        { format: persisted!.format, brandKit: brandKitLocks, assetResolver: fakeAssetResolver() },
        { resolveTemplate: id => MOTION_TEMPLATE_REGISTRY[id as keyof typeof MOTION_TEMPLATE_REGISTRY] },
      ),
    ).not.toThrow();
  });

  it("forces luxury_end_card ctaText to agree across the scenes this round touched when cta is locked, and the healed document does not throw at compile", async () => {
    const output: ScenePlanSkillOutput = {
      scenes: [
        {
          sceneId: "s1",
          templateId: "luxury_end_card",
          templateParams: { ctaText: "Shop Now" },
          startMs: 0,
          endMs: 4000,
          rationale: "cta 1",
          onScreenStatements: [],
        },
        {
          sceneId: "s2",
          templateId: "luxury_end_card",
          templateParams: { ctaText: "Buy Today" },
          startMs: 4000,
          endMs: 8000,
          rationale: "cta 2",
          onScreenStatements: [],
        },
      ],
      summary: "two cta scenes",
    };
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => output) });
    let persisted: VideoProjectDocument | undefined;
    effects.persistDocument = vi.fn(async doc => {
      persisted = doc;
      return { revision: 1 };
    });

    await planScenes(
      baseArgs({
        effects,
        resolvedBrandKit: brandKitLocks,
        document: buildDocument({ format: { width: 1080, height: 1920, fps: 30, durationMs: 8000 } }),
      }),
    );

    const params0 = (persisted!.scenes[0].visual as { params: Record<string, unknown> }).params;
    const params1 = (persisted!.scenes[1].visual as { params: Record<string, unknown> }).params;
    expect(params0.ctaText).toBe(params1.ctaText);

    expect(() =>
      compileVideoProject(
        persisted!,
        { format: persisted!.format, brandKit: brandKitLocks, assetResolver: fakeAssetResolver() },
        { resolveTemplate: id => MOTION_TEMPLATE_REGISTRY[id as keyof typeof MOTION_TEMPLATE_REGISTRY] },
      ),
    ).not.toThrow();
  });

  it("never rewrites an untouched preserved scene, even if its value disagrees with the healed canonical", async () => {
    const preservedScene = scene("s1", {
      visual: { kind: "template", templateId: "kinetic_typography", params: { words: ["Existing"] } },
      motion: { intensity: "high", camera: "static" },
    });
    const doc = buildDocument({
      scenes: [preservedScene, scene("s2", { startMs: 5000, endMs: 10000 })],
    });
    const output: ScenePlanSkillOutput = {
      scenes: [
        {
          sceneId: "s2",
          templateId: "kinetic_typography",
          templateParams: { words: ["New"] },
          startMs: 5000,
          endMs: 10000,
          motion: { intensity: "low", camera: "static" },
          rationale: "cta",
          onScreenStatements: [],
        },
      ],
      summary: "one scene",
    };
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => output) });
    let persisted: VideoProjectDocument | undefined;
    effects.persistDocument = vi.fn(async d => {
      persisted = d;
      return { revision: 1 };
    });

    await planScenes(baseArgs({ document: doc, effects, resolvedBrandKit: brandKitLocks }));

    expect(persisted!.scenes.find(s => s.sceneId === "s1")!.motion.intensity).toBe("high");
  });

  it("is a no-op when resolvedBrandKit is omitted or has no relevant lock set", async () => {
    const effects = makeEffects({ runPlanSkill: vi.fn(async () => twoSceneKineticOutput()) });
    let persisted: VideoProjectDocument | undefined;
    effects.persistDocument = vi.fn(async doc => {
      persisted = doc;
      return { revision: 1 };
    });

    await planScenes(baseArgs({ effects, resolvedBrandKit: null }));

    expect(persisted!.scenes[0].motion.intensity).toBe("medium");
    expect(persisted!.scenes[1].motion.intensity).toBe("medium");
  });
});

/* -------------------------------------------------------------------------- */
/* Feature 143 §4.9.2 (AC9) — rehomeLayersForSceneTimingChange                */
/* -------------------------------------------------------------------------- */

describe("rehomeLayersForSceneTimingChange", () => {
  const fps = 30;

  function layer(id: string, startFrame: number): Scene["layers"][number] {
    return {
      id,
      type: "text",
      startFrame,
      durationFrames: 30,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      content: "x",
      fontFamily: "Inter",
      fontSizePx: 20,
      color: "#fff",
      textAlign: "center",
      fontWeight: "normal",
    };
  }

  it("recomputes startFrame so a layer's ABSOLUTE start survives a same-scene retime", () => {
    const before = [{ sceneId: "s1", startMs: 1000 }];
    // Layer at relative frame 60 (2000ms @ 30fps) -> absolute 1000+2000=3000ms.
    const after: Scene[] = [
      {
        sceneId: "s1",
        startMs: 4000,
        endMs: 12000,
        narration: null,
        narrationAudioAssetId: null,
        visual: { kind: "layers" },
        layers: [layer("l1", 60)],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [],
      },
    ];

    const result = rehomeLayersForSceneTimingChange(before, after, fps);

    // 3000ms is BEFORE the scene's new startMs (4000) -> clamped to 0, the
    // "no scene contains it, fall back to original scene, clamp >= 0" path.
    expect(result[0].layers[0].startFrame).toBe(0);
  });

  it("migrates a layer to a DIFFERENT scene when its absolute position now falls inside that scene's new span", () => {
    const before = [
      { sceneId: "s1", startMs: 0 },
      { sceneId: "s2", startMs: 1000 },
    ];
    // Layer on s2 at relative frame 240 (8000ms) -> absolute 1000+8000=9000ms.
    const after: Scene[] = [
      {
        sceneId: "s1",
        startMs: 0,
        endMs: 10000, // grew past the layer's absolute 9000ms position
        narration: null,
        narrationAudioAssetId: null,
        visual: { kind: "layers" },
        layers: [],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [],
      },
      {
        sceneId: "s2",
        startMs: 10000,
        endMs: 15000,
        narration: null,
        narrationAudioAssetId: null,
        visual: { kind: "layers" },
        layers: [layer("l1", 240)],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [],
      },
    ];

    const result = rehomeLayersForSceneTimingChange(before, after, fps);

    const s1 = result.find(s => s.sceneId === "s1")!;
    const s2 = result.find(s => s.sceneId === "s2")!;
    expect(s2.layers).toHaveLength(0);
    expect(s1.layers).toHaveLength(1);
    // 9000ms absolute, now inside s1 [0, 10000) -> relative frame = 9000ms @ 30fps = 270.
    expect(s1.layers[0].startFrame).toBe(270);
  });

  it("is a byte-identical no-op for a scene whose startMs did not change", () => {
    const before = [{ sceneId: "s1", startMs: 1000 }];
    const original = layer("l1", 15);
    const after: Scene[] = [
      {
        sceneId: "s1",
        startMs: 1000,
        endMs: 6000,
        narration: null,
        narrationAudioAssetId: null,
        visual: { kind: "layers" },
        layers: [original],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [],
      },
    ];

    const result = rehomeLayersForSceneTimingChange(before, after, fps);

    expect(result[0].layers[0]).toBe(original);
  });
});

/* -------------------------------------------------------------------------- */
/* Feature 143 §4.9.2 (AC9) — planScenes preserves absolute layer time        */
/* -------------------------------------------------------------------------- */

describe("planScenes — §4.9.2 absolute-time layer preservation (AC9)", () => {
  it("a re-plan that retimes an existing scene re-homes its hand-authored layer so its absolute time is unchanged", async () => {
    const layer1 = {
      id: "manual1",
      type: "text" as const,
      startFrame: 30, // 1000ms @ 30fps, relative to s1's OLD startMs (0) -> absolute 1000ms
      durationFrames: 30,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      content: "manual",
      fontFamily: "Inter",
      fontSizePx: 20,
      color: "#fff",
      textAlign: "center" as const,
      fontWeight: "normal" as const,
    };
    const document = buildDocument({
      scenes: [scene("s1", { endMs: 5000, layers: [layer1] })],
    });
    let persisted: VideoProjectDocument | undefined;
    const effects = makeEffects({
      runPlanSkill: vi.fn(async () => ({
        scenes: [
          {
            sceneId: "s1",
            templateId: "kinetic_typography",
            templateParams: { words: ["New"] },
            // The skill moves this scene's startMs from 0 -> 2000.
            startMs: 2000,
            endMs: 7000,
            rationale: "x",
            onScreenStatements: [],
          },
        ],
        summary: "x",
      })),
      persistDocument: vi.fn(async doc => {
        persisted = doc;
        return { revision: 1 };
      }),
    });

    await planScenes(baseArgs({ document, mode: "fill_empty", effects }));

    const persistedScene = persisted!.scenes.find(s => s.sceneId === "s1")!;
    expect(persistedScene.startMs).toBe(2000);
    // OLD absolute = 0 (old startMs) + 1000ms (30 frames @ 30fps) = 1000ms.
    // NEW relative startFrame must place it back at absolute 1000ms, i.e.
    // (1000 - 2000)ms clamped to 0 -> frame 0 (the layer's absolute position
    // is now BEFORE the retimed scene's new start, so it clamps to the
    // scene's own beginning rather than sliding to 2000+1000=3000ms, which is
    // what the pre-143 bug would have silently done via the stale
    // `startFrame: 30`).
    expect(persistedScene.layers[0].startFrame).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Feature 143 §4.9.4 — forecastPostStageLayerCount                          */
/* -------------------------------------------------------------------------- */

describe("forecastPostStageLayerCount", () => {
  it("returns currentTotal === projectedTotal for every non-scene_plan stage", () => {
    const document = buildDocument({ scenes: [scene("s1", { endMs: 5000 })] });
    for (const stage of ["narration", "captions", "content", "claims", "motion"] as const) {
      const forecast = forecastPostStageLayerCount({ document, stage });
      expect(forecast.projectedTotal).toBe(forecast.currentTotal);
      expect(forecast.max).toBe(MAX_RENDERABLE_LAYERS);
    }
  });

  it("projects additional layers for scene_plan proportional to the number of still-plannable scenes", () => {
    const document = buildDocument({
      scenes: [
        scene("s1", { endMs: 5000 }), // plannable (no narration, no template)
        scene("s2", { startMs: 5000, endMs: 10000 }), // plannable
      ],
    });

    const forecast = forecastPostStageLayerCount({ document, stage: "scene_plan", mode: "fill_empty" });

    expect(forecast.currentTotal).toBe(0);
    expect(forecast.projectedTotal).toBeGreaterThan(forecast.currentTotal);
  });
});
