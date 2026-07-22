/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 08 §5.3. Pure module, no mocks needed.
 */
import { describe, expect, it } from "vitest";

import {
  buildSequentialShotOverrideRejectionMessage,
  SEQUENTIAL_SHOT_BLOCKER_COPY_TH,
  sequentialShotBlockerMessageTh,
} from "../sequentialShotBlockerCopy";

// Section-04 §5.7 blocker-id vocabulary (frozen cross-section contract, spec
// §23.1), plus `prompt_empty` (G10 — folded into `sequential_prompt_set_incomplete`
// by the runner, but the copy module still carries an entry for it). Explicitly
// enumerated here (not derived from the copy module itself) so adding a new
// blocker id without adding Thai copy fails this test.
const ALL_BLOCKER_IDS = [
  "sequential_prompt_set_incomplete",
  "prompt_empty",
  "prompt_too_long_for_image_provider",
  "prompt_too_long_for_video_provider",
  "video_global_block_missing",
  "guardian_directive_missing",
  "assembly_demo_unverified",
  "price_claim_detected",
  "shot_duration_exceeds_max",
  "dialogue_exceeds_shot_duration",
  "reference_index_mapping_mismatch",
  "product_reference_model_conflict",
  "minor_safety_clothing_lock_missing",
] as const;

describe("sequentialShotBlockerCopy", () => {
  it("has a non-empty Thai entry for every section-04 §5.7 blocker id", () => {
    for (const id of ALL_BLOCKER_IDS) {
      expect(SEQUENTIAL_SHOT_BLOCKER_COPY_TH[id], `missing copy for ${id}`).toBeTypeOf(
        "string"
      );
      expect(SEQUENTIAL_SHOT_BLOCKER_COPY_TH[id].trim().length).toBeGreaterThan(0);
    }
  });

  it("sequentialShotBlockerMessageTh returns the exact copy-table entry for a known id", () => {
    for (const id of ALL_BLOCKER_IDS) {
      expect(sequentialShotBlockerMessageTh(id)).toBe(SEQUENTIAL_SHOT_BLOCKER_COPY_TH[id]);
    }
  });

  it("sequentialShotBlockerMessageTh never returns a bare id or an empty string for an unknown id", () => {
    const message = sequentialShotBlockerMessageTh("totally_unknown_id");
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toBe("totally_unknown_id");
    expect(message).toContain("totally_unknown_id");
  });

  it("sequentialShotBlockerMessageTh handles empty/whitespace input without throwing", () => {
    expect(sequentialShotBlockerMessageTh("")).toBeTruthy();
    expect(sequentialShotBlockerMessageTh("   ")).toBeTruthy();
  });

  it("buildSequentialShotOverrideRejectionMessage is deterministic, starts with the first blocker's Thai copy, and lists both ids", () => {
    const message = buildSequentialShotOverrideRejectionMessage([
      "price_claim_detected",
      "prompt_empty",
    ]);
    expect(message).toBe(buildSequentialShotOverrideRejectionMessage([
      "price_claim_detected",
      "prompt_empty",
    ]));
    expect(message.startsWith(SEQUENTIAL_SHOT_BLOCKER_COPY_TH.price_claim_detected)).toBe(
      true
    );
    expect(message).toContain("price_claim_detected");
    expect(message).toContain("prompt_empty");
  });

  it("buildSequentialShotOverrideRejectionMessage handles a single blocker and an empty list without throwing", () => {
    const single = buildSequentialShotOverrideRejectionMessage([
      "video_global_block_missing",
    ]);
    expect(single).toContain("video_global_block_missing");
    expect(single.startsWith(SEQUENTIAL_SHOT_BLOCKER_COPY_TH.video_global_block_missing)).toBe(
      true
    );

    const empty = buildSequentialShotOverrideRejectionMessage([]);
    expect(empty.length).toBeGreaterThan(0);
  });
});
