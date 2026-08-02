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
  type ScenePlanEffects,
  type ScenePlanSkillOutput,
} from "../videoProjectScenePlanner";
import {
  VideoProjectDocumentSchema,
  type VideoProjectDocument,
  type Scene,
} from "@shared/videoIntelligence/projectSchemas";
import type { ResolvedCatalogFacts } from "../validateProjectClaims";

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

  it("fill_empty does not overwrite a scene that already has author layers", async () => {
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
              content: "manual",
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
    });

    const result = await planScenes(baseArgs({ document, mode: "fill_empty", effects }));

    expect(result.skippedSceneIds).toEqual([]);
    expect(result.plannedSceneIds).toEqual(["s2"]);
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
      claims: [{ claim: "Waterproof", source: "catalog", status: "approved" }],
    });
  });
});
