import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDeterministicPolicySafeImagePrompt,
  buildStartFrameRenderPlanUserPrompt,
  buildStartFrameShotPromptUserPrompt,
} from "../verticalDramaStartFrameGeneration";
import { buildTargetVideoModelFactBlock } from "../verticalDramaVideoMotionPromptGeneration";
import { mergeAndTrimReferenceImageUrls } from "../verticalDramaProductTieIn";

/**
 * VD P1 §14 D1 — aggregate flag-off parity.
 *
 * The default mode compares stable, captured outputs against a fixture that was
 * generated in the recorded pre-P1 worktree. Capture mode is intentionally
 * explicit and must only be run from that worktree:
 * `VD_P1_CAPTURE_FLAG_OFF_FIXTURES=1 VD_P1_FLAG_OFF_CAPTURE_SHA=<sha>`.
 */

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname,
  "../__fixtures__/vdP1FlagOff"
);

const FROZEN_CASES = {
  "sfg-batchplan": {
    episodeTitle: "Episode 1",
    durationSeconds: 10,
    storyboardShots: [
      {
        shotNumber: 1,
        description: "Hero enters the hall",
        cameraSetup: "medium, eye_level",
        characterIds: ["hero"],
        durationSeconds: 5,
      },
      {
        shotNumber: 2,
        description: "Hero waits in the hall",
        cameraSetup: "wide, eye_level",
        characterIds: [],
        durationSeconds: 5,
      },
    ],
  },
  "sfg-policysafe": {
    rewrittenSynopsis: "Hero stands in the hall.",
    characterReferenceManifest: [
      { index: 1, name: "Hero", characterKey: "hero" },
    ],
  },
  "sfg-shotprompt": {
    userId: 7,
    seriesId: 3,
    episodeId: 11,
    shotNumber: 1,
    currentPrompt: "Hero stands in the hall.",
    currentNegativePrompt: "blurry",
    characterReferenceManifest: [
      { index: 1, name: "Hero", characterId: "hero" },
    ],
  },
  "vp-factblock": {
    family: "veo" as const,
    modelId: "veo-test",
    maxReferenceImages: 4,
    frameAnalysisRequested: false,
    frameObservabilityRequested: false,
  },
  "merge-refs": {
    characterRefUrls: ["character-1", "character-2"],
    locationRefUrls: ["location"],
    productRefUrls: ["product-1", "product-2"],
    maxReferenceImages: 4,
  },
} as const;

type CaseId = keyof typeof FROZEN_CASES;

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function paramsHash(): string {
  return crypto
    .createHash("sha256")
    .update(stableJson(FROZEN_CASES))
    .digest("hex");
}

function buildOutputs(
  motionContractsEnabled?: boolean
): Record<CaseId, unknown> {
  return {
    "sfg-batchplan": buildStartFrameRenderPlanUserPrompt({
      userId: 7,
      tenantId: "tenant-1",
      seriesId: 3,
      episodeId: 11,
      ...FROZEN_CASES["sfg-batchplan"],
    }),
    "sfg-policysafe": buildDeterministicPolicySafeImagePrompt(
      FROZEN_CASES["sfg-policysafe"]
    ),
    "sfg-shotprompt": buildStartFrameShotPromptUserPrompt({
      tenantId: "tenant-1",
      ...FROZEN_CASES["sfg-shotprompt"],
    }),
    "vp-factblock": buildTargetVideoModelFactBlock({
      ...FROZEN_CASES["vp-factblock"],
      ...(motionContractsEnabled === undefined
        ? {}
        : { motionContractsEnabled }),
    }),
    "merge-refs": mergeAndTrimReferenceImageUrls(
      FROZEN_CASES["merge-refs"].characterRefUrls,
      FROZEN_CASES["merge-refs"].locationRefUrls,
      FROZEN_CASES["merge-refs"].productRefUrls,
      FROZEN_CASES["merge-refs"].maxReferenceImages
    ),
  };
}

function fixturePath(caseId: CaseId): string {
  return path.join(FIXTURE_ROOT, `${caseId}.json`);
}

function readFixture(caseId: CaseId): unknown {
  return JSON.parse(fs.readFileSync(fixturePath(caseId), "utf8"));
}

describe("VD P1 flag-off parity", () => {
  it("has a fixture manifest for every frozen case", () => {
    if (process.env.VD_P1_CAPTURE_FLAG_OFF_FIXTURES === "1") return;
    const manifest = JSON.parse(
      fs.readFileSync(path.join(FIXTURE_ROOT, "manifest.json"), "utf8")
    ) as { caseIds: string[]; paramsSha256: string };
    expect(manifest.caseIds).toEqual(Object.keys(FROZEN_CASES));
    expect(manifest.paramsSha256).toBe(paramsHash());
  });

  it("captures only with an explicit capture switch", () => {
    if (process.env.VD_P1_CAPTURE_FLAG_OFF_FIXTURES !== "1") return;
    const captureSha = process.env.VD_P1_FLAG_OFF_CAPTURE_SHA?.trim();
    if (!captureSha) {
      throw new Error(
        "VD_P1_FLAG_OFF_CAPTURE_SHA is required for fixture capture"
      );
    }
    fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
    const outputs = buildOutputs();
    for (const caseId of Object.keys(FROZEN_CASES) as CaseId[]) {
      fs.writeFileSync(fixturePath(caseId), stableJson(outputs[caseId]));
    }
    fs.writeFileSync(
      path.join(FIXTURE_ROOT, "manifest.json"),
      stableJson({
        captureSha,
        caseIds: Object.keys(FROZEN_CASES),
        paramsSha256: paramsHash(),
        node: process.version,
        exception:
          "merge-refs captures output semantics across the stable four-argument signature",
      })
    );
  });

  for (const caseId of Object.keys(FROZEN_CASES) as CaseId[]) {
    it(`${caseId} is byte-identical with flags omitted and explicitly false`, () => {
      if (process.env.VD_P1_CAPTURE_FLAG_OFF_FIXTURES === "1") return;
      const expected = readFixture(caseId);
      const omitted = buildOutputs()[caseId];
      const explicitFalse = buildOutputs(false)[caseId];
      expect(stableJson(omitted)).toBe(stableJson(expected));
      expect(stableJson(explicitFalse)).toBe(stableJson(expected));
    });
  }
});
