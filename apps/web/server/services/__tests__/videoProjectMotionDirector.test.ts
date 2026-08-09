/**
 * Coverage for `videoProjectMotionDirector.ts` (motion stage — multi-variant
 * picker). Same convention as `videoProjectScenePlanner.test.ts`: imports the
 * REAL `MOTION_TEMPLATE_REGISTRY` + `VideoProjectDocumentSchema`, only
 * `MotionDirectorEffects` is a test double.
 */
import { describe, expect, it, vi } from "vitest";

import {
  planMotionVariants,
  type MotionDirectorEffects,
  type MotionDirectorSkillOutput,
} from "../videoProjectMotionDirector";
import {
  VideoProjectDocumentSchema,
  type VideoProjectDocument,
} from "@shared/videoIntelligence/projectSchemas";
import { motionDirectorOutputSchema } from "../videoProjectMotionDirectorAdapter";

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
    motionCandidates: [],
    selectedMotionCandidateId: null,
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

function makeEffects(overrides: Partial<MotionDirectorEffects> = {}): MotionDirectorEffects {
  return {
    runMotionDirectorSkill: vi.fn(async () => ({ scenes: [], summary: "no-op" }) as MotionDirectorSkillOutput),
    persistDocument: vi.fn(async () => ({ revision: 99 })),
    ...overrides,
  };
}

const VARIANTS = { min: 2, max: 3 };

describe("motionDirectorOutputSchema", () => {
  it("keeps the batch usable when one candidate has malformed optional-shaped fields", () => {
    const parsed = motionDirectorOutputSchema.parse({
      scenes: [
        {
          sceneId: "s1",
          candidates: [
            {
              templateId: "kinetic_typography",
              templateParams: null,
              motion: null,
              label: null,
              rationale: 42,
            },
          ],
        },
      ],
      summary: "one option",
    });

    expect(parsed.scenes[0].candidates[0]).toMatchObject({
      templateParams: {},
      motion: { intensity: "medium", camera: "static" },
      label: "Motion option",
      rationale: "",
    });
  });
});

describe("planMotionVariants", () => {
  it("persists validated candidates into scene.motionCandidates without touching visual/motion", async () => {
    const output: MotionDirectorSkillOutput = {
      scenes: [
        {
          sceneId: "s1",
          candidates: [
            {
              templateId: "kinetic_typography",
              templateParams: { words: ["Hello"] },
              motion: { intensity: "low", camera: "static" },
              label: "Calm",
              rationale: "steady",
            },
            {
              templateId: "kinetic_typography",
              templateParams: { words: ["Hello", "World"] },
              motion: { intensity: "high", camera: "pan-left" },
              label: "Punchy",
              rationale: "energetic",
            },
          ],
        },
      ],
      summary: "one scene, two takes",
    };

    let persisted: VideoProjectDocument | null = null;
    const effects = makeEffects({
      runMotionDirectorSkill: vi.fn(async () => output),
      persistDocument: vi.fn(async doc => {
        persisted = doc;
        return { revision: 5 };
      }),
    });

    const document = buildDocument();
    const result = await planMotionVariants({
      document,
      mode: "fill_empty",
      studioType: "motion",
      variantsPerScene: VARIANTS,
      brandKit: null,
      baseRevision: 1,
      effects,
    });

    expect(result.proposedSceneIds).toEqual(["s1"]);
    expect(result.rejectedSceneIds).toEqual([]);
    expect(result.revision).toBe(5);

    const savedScene1 = persisted!.scenes.find(s => s.sceneId === "s1")!;
    expect(savedScene1.motionCandidates).toHaveLength(2);
    expect(savedScene1.visual).toEqual({ kind: "layers" });
    expect(savedScene1.motion).toEqual({ intensity: "medium", camera: "static" });
    expect(savedScene1.selectedMotionCandidateId).toBeNull();

    // Candidate ids are unique and structurally valid.
    const ids = savedScene1.motionCandidates.map(c => c.candidateId);
    expect(new Set(ids).size).toBe(2);
  });

  it("drops an individual candidate that fails its template's own paramsSchema, keeping the rest", async () => {
    const output: MotionDirectorSkillOutput = {
      scenes: [
        {
          sceneId: "s1",
          candidates: [
            {
              templateId: "kinetic_typography",
              templateParams: { words: [] }, // invalid: min(1)
              motion: { intensity: "low", camera: "static" },
              label: "Bad",
              rationale: "invalid params",
            },
            {
              templateId: "kinetic_typography",
              templateParams: { words: ["OK"] },
              motion: { intensity: "medium", camera: "static" },
              label: "Good",
              rationale: "valid params",
            },
          ],
        },
      ],
      summary: "one bad, one good",
    };

    let persisted: VideoProjectDocument | null = null;
    const effects = makeEffects({
      runMotionDirectorSkill: vi.fn(async () => output),
      persistDocument: vi.fn(async doc => {
        persisted = doc;
        return { revision: 2 };
      }),
    });

    const result = await planMotionVariants({
      document: buildDocument(),
      mode: "fill_empty",
      studioType: "motion",
      variantsPerScene: VARIANTS,
      brandKit: null,
      baseRevision: 1,
      effects,
    });

    expect(result.proposedSceneIds).toEqual(["s1"]);
    expect(result.rejectedSceneIds).toEqual([]);
    const savedScene1 = persisted!.scenes.find(s => s.sceneId === "s1")!;
    expect(savedScene1.motionCandidates).toHaveLength(1);
    expect(savedScene1.motionCandidates[0].label).toBe("Good");
  });

  it("reports a scene as rejected (never fails the whole call) when EVERY candidate is invalid", async () => {
    const output: MotionDirectorSkillOutput = {
      scenes: [
        {
          sceneId: "s1",
          candidates: [
            {
              templateId: "does_not_exist",
              templateParams: {},
              motion: { intensity: "low", camera: "static" },
              label: "Bad template",
              rationale: "unknown id",
            },
          ],
        },
        {
          sceneId: "s2",
          candidates: [
            {
              templateId: "kinetic_typography",
              templateParams: { words: ["fine"] },
              motion: { intensity: "medium", camera: "static" },
              label: "Fine",
              rationale: "valid",
            },
          ],
        },
      ],
      summary: "s1 all-invalid, s2 fine",
    };

    let persisted: VideoProjectDocument | null = null;
    const effects = makeEffects({
      runMotionDirectorSkill: vi.fn(async () => output),
      persistDocument: vi.fn(async doc => {
        persisted = doc;
        return { revision: 3 };
      }),
    });

    const result = await planMotionVariants({
      document: buildDocument(),
      mode: "fill_empty",
      studioType: "motion",
      variantsPerScene: VARIANTS,
      brandKit: null,
      baseRevision: 1,
      effects,
    });

    expect(result.rejectedSceneIds).toEqual(["s1"]);
    expect(result.proposedSceneIds).toEqual(["s2"]);
    const savedScene1 = persisted!.scenes.find(s => s.sceneId === "s1")!;
    expect(savedScene1.motionCandidates).toEqual([]);
  });

  it("fill_empty mode never re-proposes for a scene the user already selected a candidate for (non-destructive)", async () => {
    const alreadyChosenDoc = buildDocument({
      scenes: [
        scene("s1", {
          motionCandidates: [
            {
              candidateId: "s1-v1",
              templateId: "kinetic_typography",
              templateParams: { words: ["Existing"] },
              motion: { intensity: "medium", camera: "static" },
              label: "Existing pick",
              rationale: "already chosen",
            },
          ],
          selectedMotionCandidateId: "s1-v1",
          visual: { kind: "template", templateId: "kinetic_typography", params: { words: ["Existing"] } },
        }),
        scene("s2", { startMs: 5000, endMs: 10000 }),
      ],
    });

    const skillFn = vi.fn(async (input: Parameters<MotionDirectorEffects["runMotionDirectorSkill"]>[0]) => ({
      scenes: input.scenes.map(s => ({
        sceneId: s.sceneId,
        candidates: [
          {
            templateId: "kinetic_typography",
            templateParams: { words: ["New"] },
            motion: { intensity: "low", camera: "static" },
            label: "New",
            rationale: "new take",
          },
        ],
      })),
      summary: "new variants",
    }));

    let persisted: VideoProjectDocument | null = null;
    const effects = makeEffects({
      runMotionDirectorSkill: skillFn,
      persistDocument: vi.fn(async doc => {
        persisted = doc;
        return { revision: 4 };
      }),
    });

    const result = await planMotionVariants({
      document: alreadyChosenDoc,
      mode: "fill_empty",
      studioType: "motion",
      variantsPerScene: VARIANTS,
      brandKit: null,
      baseRevision: 1,
      effects,
    });

    // The skill was only ever asked about s2 — s1 (already selected) was
    // never sent, so it could never come back changed.
    const sentSceneIds = skillFn.mock.calls[0]![0].scenes.map(s => s.sceneId);
    expect(sentSceneIds).toEqual(["s2"]);

    expect(result.skippedSceneIds).toEqual(["s1"]);
    expect(result.proposedSceneIds).toEqual(["s2"]);

    const savedScene1 = persisted!.scenes.find(s => s.sceneId === "s1")!;
    expect(savedScene1.motionCandidates).toHaveLength(1);
    expect(savedScene1.motionCandidates[0].candidateId).toBe("s1-v1");
    expect(savedScene1.selectedMotionCandidateId).toBe("s1-v1");
    expect(savedScene1.visual).toEqual({
      kind: "template",
      templateId: "kinetic_typography",
      params: { words: ["Existing"] },
    });
  });

  it("skips the skill call entirely and returns baseRevision when every scene is already selected", async () => {
    const doc = buildDocument({
      scenes: [
        scene("s1", { selectedMotionCandidateId: "s1-v1" }),
        scene("s2", { startMs: 5000, endMs: 10000, selectedMotionCandidateId: "s2-v1" }),
      ],
    });
    const skillFn = vi.fn(async () => ({ scenes: [], summary: "unused" }) as MotionDirectorSkillOutput);
    const persistFn = vi.fn(async () => ({ revision: 999 }));
    const effects = makeEffects({ runMotionDirectorSkill: skillFn, persistDocument: persistFn });

    const result = await planMotionVariants({
      document: doc,
      mode: "fill_empty",
      studioType: "motion",
      variantsPerScene: VARIANTS,
      brandKit: null,
      baseRevision: 42,
      effects,
    });

    expect(skillFn).not.toHaveBeenCalled();
    expect(persistFn).not.toHaveBeenCalled();
    expect(result.revision).toBe(42);
    expect(result.proposedSceneIds).toEqual([]);
    expect(result.skippedSceneIds).toEqual(["s1", "s2"]);
  });
});
