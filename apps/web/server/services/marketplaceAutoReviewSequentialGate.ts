/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 12 §5.8. The real-LLM gate's PURE evaluator (no I/O, no LLM) plus
 * the env-gated enablement check for the manual/CI-tagged live suite.
 *
 * The evaluator inspects a `SequentialStoryboardPack`'s OWN self-reported
 * fields and text content — it never re-verifies against images (that is
 * the live suite's job, feeding a real skill-generated pack through this
 * same evaluator). Offline-tested (T12) against recorded packs.
 */
import {
  detectSequentialPromptPriceClaims,
  SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER,
  type SequentialStoryboardPack,
  type SequentialStoryboardShot,
} from "./productReviewSequentialStoryboardSkillRunner";

export { SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER };

export type SequentialRealLlmGateExpectations = {
  fixtureId: "child_desk_chair" | "undocumented_assembly_desk";
  expectShotCount: 9;
  childSubjectPolicyActive: boolean;
  assemblyDocumented: boolean;
  /** Effective budget (section-04's `resolveSequentialImagePromptBudget`). */
  imagePromptMaxChars: number;
  videoPromptMaxChars: 2000;
  /** Section-03 §10 frozen literal — pass `SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER`. */
  globalBlockMarker: string;
};

/** Frozen failure-code set (mirrored in T12). */
export const SEQUENTIAL_REAL_LLM_GATE_FAILURE_CODES = [
  "shot_count_invalid",
  "guardian_missing_in_minor_frame",
  "assembly_content_present",
  "price_token_present",
  "global_block_missing",
  "prompt_over_budget",
  "claim_untraced",
] as const;

export type SequentialRealLlmGateFailureCode =
  (typeof SEQUENTIAL_REAL_LLM_GATE_FAILURE_CODES)[number];

export type SequentialRealLlmGateFailure = {
  code: SequentialRealLlmGateFailureCode;
  shotIds: number[];
  detail?: string;
};

export type SequentialRealLlmGateReport = {
  fixtureId: string;
  passed: boolean;
  failures: SequentialRealLlmGateFailure[];
  observed: {
    shotCount: number;
    minorShotIds: number[];
    guardianShotIds: number[];
    pivotBeats: number;
    maxImagePromptChars: number;
    maxVideoPromptChars: number;
  };
  generatedAt: string;
};

// English + Thai assembly/disassembly content tokens. Self-contained (this
// module never imports SVC's private assembly-content regex — same
// module-boundary rule as the observability module).
const ASSEMBLY_CONTENT_PATTERN =
  /assembly|disassembl|exploded[_\s-]?(?:view|part)|allen[_\s-]?key|screwdriver|\bscrews?\b|\bbolts?\b|instruction[_\s-]?manual|flat[_\s-]?pack|ประกอบ|แกะกล่อง|ขันน็อต|คู่มือประกอบ|ชิ้นส่วนกระจาย/i;

const UNTRACED_CLAIM_SUPPORT_VALUES = new Set(["", "unsupported", "conflicting"]);

const PIVOT_DEMONSTRATION_TYPES = new Set(["benefit_narration", "problem_solution"]);

function shotTextFields(shot: SequentialStoryboardShot): string[] {
  return [
    String(shot.visual_summary ?? ""),
    String(shot.start_frame_image_prompt ?? ""),
    String(shot.video_prompt ?? ""),
    String(shot.dialogue ?? ""),
  ];
}

/** PURE — no I/O, no LLM. Offline-tested against recorded packs (T12). */
export function evaluateSequentialRealLlmGate(
  pack: SequentialStoryboardPack,
  expectations: SequentialRealLlmGateExpectations
): SequentialRealLlmGateReport {
  const shots = Array.isArray(pack?.shots) ? pack.shots : [];
  const failures: SequentialRealLlmGateFailure[] = [];

  const minorShotIds = shots
    .filter(shot => shot.depicts_minor === true)
    .map(shot => shot.shot_id);
  const guardianShotIds = shots
    .filter(shot => shot.guardian_required === true)
    .map(shot => shot.shot_id);
  const pivotBeats = shots.filter(shot =>
    PIVOT_DEMONSTRATION_TYPES.has(shot.demonstration_type)
  ).length;
  const maxImagePromptChars = shots.reduce(
    (max, shot) => Math.max(max, String(shot.start_frame_image_prompt ?? "").length),
    0
  );
  const maxVideoPromptChars = shots.reduce(
    (max, shot) => Math.max(max, String(shot.video_prompt ?? "").length),
    0
  );

  if (shots.length !== expectations.expectShotCount) {
    failures.push({
      code: "shot_count_invalid",
      shotIds: shots.map(shot => shot.shot_id),
      detail: `expected ${expectations.expectShotCount} shots, observed ${shots.length}`,
    });
  }

  const guardianMissingShotIds = shots
    .filter(shot => shot.depicts_minor === true && shot.guardian_required !== true)
    .map(shot => shot.shot_id);
  if (guardianMissingShotIds.length > 0) {
    failures.push({
      code: "guardian_missing_in_minor_frame",
      shotIds: guardianMissingShotIds,
    });
  }

  if (!expectations.assemblyDocumented) {
    const assemblyShotIds = shots
      .filter(
        shot =>
          shot.demonstration_type === "assembly_demo" ||
          shotTextFields(shot).some(text => ASSEMBLY_CONTENT_PATTERN.test(text))
      )
      .map(shot => shot.shot_id);
    if (assemblyShotIds.length > 0) {
      failures.push({ code: "assembly_content_present", shotIds: assemblyShotIds });
    }
  }

  const priceShotIds = shots
    .filter(shot =>
      [shot.dialogue, shot.start_frame_image_prompt, shot.video_prompt].some(text =>
        detectSequentialPromptPriceClaims(String(text ?? ""))
      )
    )
    .map(shot => shot.shot_id);
  if (priceShotIds.length > 0) {
    failures.push({ code: "price_token_present", shotIds: priceShotIds });
  }

  const missingGlobalBlockShotIds = shots
    .filter(shot => !String(shot.video_prompt ?? "").includes(expectations.globalBlockMarker))
    .map(shot => shot.shot_id);
  if (missingGlobalBlockShotIds.length > 0) {
    failures.push({ code: "global_block_missing", shotIds: missingGlobalBlockShotIds });
  }

  const imageOverBudgetShotIds = shots
    .filter(
      shot =>
        String(shot.start_frame_image_prompt ?? "").length >
        expectations.imagePromptMaxChars
    )
    .map(shot => shot.shot_id);
  if (imageOverBudgetShotIds.length > 0) {
    failures.push({
      code: "prompt_over_budget",
      shotIds: imageOverBudgetShotIds,
      detail: "image_prompt",
    });
  }
  const videoOverBudgetShotIds = shots
    .filter(
      shot => String(shot.video_prompt ?? "").length > expectations.videoPromptMaxChars
    )
    .map(shot => shot.shot_id);
  if (videoOverBudgetShotIds.length > 0) {
    failures.push({
      code: "prompt_over_budget",
      shotIds: videoOverBudgetShotIds,
      detail: "video_prompt",
    });
  }

  const untracedClaimShotIds = shots
    .filter(shot => {
      const claims = Array.isArray(shot.claim_trace) ? shot.claim_trace : [];
      return claims.some(claim =>
        UNTRACED_CLAIM_SUPPORT_VALUES.has(String(claim?.support ?? "").trim())
      );
    })
    .map(shot => shot.shot_id);
  if (untracedClaimShotIds.length > 0) {
    failures.push({ code: "claim_untraced", shotIds: untracedClaimShotIds });
  }

  return {
    fixtureId: expectations.fixtureId,
    passed: failures.length === 0,
    failures,
    observed: {
      shotCount: shots.length,
      minorShotIds,
      guardianShotIds,
      pivotBeats,
      maxImagePromptChars,
      maxVideoPromptChars,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** env `MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE === "1"` — false by default. */
export function isSequentialRealLlmGateEnabled(): boolean {
  return process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE === "1";
}
