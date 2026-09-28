/**
 * Feature 137/138 P1 — pure real-LLM gate evaluator.
 *
 * The evaluator has no I/O, LLM, credit, or database dependency. The live
 * suite records a JSON-round-trippable sample and the normal offline suite
 * replays that sample through this same function.
 */
import {
  deriveMotionRiskFloor,
  parseMotionProfile,
  type VdIdentityRisk,
} from "@shared/verticalDramaSeries/motionProfile";

export function isVerticalDramaP1RealLlmGateEnabled(): boolean {
  return process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE === "1";
}

export const VD_P1_REAL_LLM_GATE_FAILURE_CODES = [
  "motion_profile_missing",
  "motion_profile_enum_invalid",
  "effective_risk_not_raised",
  "frame_observability_missing",
  "motion_contract_absent",
  "scene_state_missing",
  "scene_state_incomplete",
  "scene_member_shots_mismatch",
  "scene_lock_absent_from_prompt",
  "scene_lock_text_diverged",
  "prompt_over_budget",
  "batch_lighting_diverged",
] as const;

export type VdP1RealLlmGateFailureCode =
  (typeof VD_P1_REAL_LLM_GATE_FAILURE_CODES)[number];

export type VdP1RealLlmGateFailure = {
  code: VdP1RealLlmGateFailureCode;
  shotIds: number[];
  detail?: string;
};

export type VdP1RealLlmGateExpectations = {
  fixtureId: string;
  expectMotionProfile: boolean;
  expectSceneVisualState: boolean;
  expectedSceneMemberShots: Record<string, number[]>;
  imagePromptMaxChars: number;
  videoPromptMaxChars: number;
  sceneLockHeader: string;
  motionSectionName: string;
};

export type VdP1RealLlmGateShot = {
  shotId: number;
  sceneKey?: string;
  motionProfile?: unknown;
  effectiveRisk?: VdIdentityRisk;
  frameObservability?: unknown[];
  motionContractText?: string;
  sceneVisualState?: Record<string, unknown> | null;
  sceneLockText?: string;
  imagePrompt?: string;
  videoPrompt?: string;
};

export type VdP1RealLlmGateSample = {
  fixtureId: string;
  shots: VdP1RealLlmGateShot[];
  /** Batch-output proof for one call that covers multiple shots in a scene. */
  batchLightingByScene?: Record<string, string[]>;
  generatedAt?: string;
};

export type VdP1RealLlmGateReport = {
  fixtureId: string;
  passed: boolean;
  failures: VdP1RealLlmGateFailure[];
  observed: {
    shotIds: number[];
    maxImagePromptChars: number;
    maxVideoPromptChars: number;
    motionProfileShotIds: number[];
    sceneStateShotIds: number[];
    sceneKeys: string[];
  };
  generatedAt: string;
};

const RISK_RANK: Record<VdIdentityRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function uniqueSorted(values: readonly number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stateIsComplete(state: Record<string, unknown>): boolean {
  const requiredStrings = [
    "locationKey",
    "membershipHash",
    "lightingState",
    "spatialLayout",
    "stagingAxis",
    "paletteMood",
    "plannedAt",
  ];
  if (!requiredStrings.every(key => isNonEmptyString(state[key]))) return false;
  if (typeof state.timeJumpSuspected !== "boolean") return false;
  if (!Array.isArray(state.fixedElements)) return false;
  if (!Array.isArray(state.wardrobeInScene)) return false;
  if (!Array.isArray(state.activeProps)) return false;
  if (!Array.isArray(state.coverageGaps)) return false;
  if (!Array.isArray(state.memberShotNumbers)) return false;
  return state.memberShotNumbers.every(
    value => Number.isInteger(value) && Number(value) > 0
  );
}

function pushFailure(
  failures: VdP1RealLlmGateFailure[],
  code: VdP1RealLlmGateFailureCode,
  shotIds: readonly number[],
  detail?: string
) {
  failures.push({
    code,
    shotIds: uniqueSorted(shotIds),
    ...(detail ? { detail } : {}),
  });
}

/** PURE — no I/O, no LLM. */
export function evaluateVerticalDramaP1RealLlmGate(
  sample: VdP1RealLlmGateSample,
  expectations: VdP1RealLlmGateExpectations
): VdP1RealLlmGateReport {
  const shots = Array.isArray(sample?.shots) ? sample.shots : [];
  const failures: VdP1RealLlmGateFailure[] = [];
  const motionProfileShotIds: number[] = [];
  const sceneStateShotIds: number[] = [];
  const sceneKeys = Array.from(
    new Set(shots.map(shot => shot.sceneKey).filter(isNonEmptyString))
  ).sort();

  for (const shot of shots) {
    if (expectations.expectMotionProfile) {
      const parsed = parseMotionProfile(shot.motionProfile);
      if (parsed.status === "missing") {
        pushFailure(failures, "motion_profile_missing", [shot.shotId]);
      } else if (parsed.status !== "emitted") {
        pushFailure(failures, "motion_profile_enum_invalid", [shot.shotId]);
      } else {
        motionProfileShotIds.push(shot.shotId);
        const effectiveRisk = shot.effectiveRisk;
        if (
          !effectiveRisk ||
          !Object.hasOwn(RISK_RANK, effectiveRisk) ||
          RISK_RANK[effectiveRisk] < RISK_RANK[parsed.effectiveRisk]
        ) {
          pushFailure(
            failures,
            "effective_risk_not_raised",
            [shot.shotId],
            `declared floor=${parsed.effectiveRisk}, effective=${effectiveRisk ?? "missing"}`
          );
        }
        if (
          parsed.effectiveRisk !== "low" &&
          !isNonEmptyString(shot.motionContractText)
        ) {
          pushFailure(failures, "motion_contract_absent", [shot.shotId]);
        }
        const expectedPeople = parsed.profile.characters.length;
        if (
          !Array.isArray(shot.frameObservability) ||
          shot.frameObservability.length < expectedPeople
        ) {
          pushFailure(failures, "frame_observability_missing", [shot.shotId]);
        }
      }
    }

    if (expectations.expectSceneVisualState) {
      const state = shot.sceneVisualState;
      if (!state) {
        pushFailure(failures, "scene_state_missing", [shot.shotId]);
      } else {
        sceneStateShotIds.push(shot.shotId);
        if (!stateIsComplete(state)) {
          pushFailure(failures, "scene_state_incomplete", [shot.shotId]);
        }
        const expectedMembers = shot.sceneKey
          ? expectations.expectedSceneMemberShots[shot.sceneKey]
          : undefined;
        const actualMembers = Array.isArray(state.memberShotNumbers)
          ? state.memberShotNumbers.filter(
              value => Number.isInteger(value) && Number(value) > 0
            )
          : [];
        if (
          expectedMembers &&
          JSON.stringify(uniqueSorted(actualMembers)) !==
            JSON.stringify(uniqueSorted(expectedMembers))
        ) {
          pushFailure(failures, "scene_member_shots_mismatch", [shot.shotId]);
        }
        if (
          !isNonEmptyString(shot.sceneLockText) ||
          !shot.sceneLockText.includes(expectations.sceneLockHeader)
        ) {
          pushFailure(failures, "scene_lock_absent_from_prompt", [shot.shotId]);
        }
      }
    }

    const imagePromptLength = String(shot.imagePrompt ?? "").length;
    if (imagePromptLength > expectations.imagePromptMaxChars) {
      pushFailure(
        failures,
        "prompt_over_budget",
        [shot.shotId],
        "image_prompt"
      );
    }
    const videoPromptLength = String(shot.videoPrompt ?? "").length;
    if (videoPromptLength > expectations.videoPromptMaxChars) {
      pushFailure(
        failures,
        "prompt_over_budget",
        [shot.shotId],
        "video_prompt"
      );
    }
  }

  for (const sceneKey of sceneKeys) {
    const sceneShots = shots.filter(shot => shot.sceneKey === sceneKey);
    const lockTexts = sceneShots
      .map(shot => shot.sceneLockText)
      .filter(isNonEmptyString);
    if (new Set(lockTexts).size > 1) {
      pushFailure(
        failures,
        "scene_lock_text_diverged",
        sceneShots.map(shot => shot.shotId)
      );
    }
  }

  for (const [sceneKey, lightingValues] of Object.entries(
    sample.batchLightingByScene ?? {}
  )) {
    const uniqueLighting = new Set(
      lightingValues.filter(isNonEmptyString).map(value => value.trim())
    );
    if (uniqueLighting.size > 1) {
      pushFailure(
        failures,
        "batch_lighting_diverged",
        shots
          .filter(shot => shot.sceneKey === sceneKey)
          .map(shot => shot.shotId),
        sceneKey
      );
    }
  }

  return {
    fixtureId: expectations.fixtureId,
    passed: failures.length === 0,
    failures,
    observed: {
      shotIds: shots.map(shot => shot.shotId),
      maxImagePromptChars: shots.reduce(
        (max, shot) => Math.max(max, String(shot.imagePrompt ?? "").length),
        0
      ),
      maxVideoPromptChars: shots.reduce(
        (max, shot) => Math.max(max, String(shot.videoPrompt ?? "").length),
        0
      ),
      motionProfileShotIds,
      sceneStateShotIds,
      sceneKeys,
    },
    generatedAt: new Date().toISOString(),
  };
}
