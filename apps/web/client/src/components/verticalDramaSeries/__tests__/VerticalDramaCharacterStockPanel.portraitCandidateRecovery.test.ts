import { describe, expect, it } from "vitest";
import {
  buildPortraitCandidateTimeoutPatch,
  mergeDurablePortraitCandidateStatus,
  removePortraitCandidateFromBatch,
  shouldAutoSoftenPortraitCandidate,
  VD_PORTRAIT_CANDIDATE_TERMINAL_STATUSES,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
import { isCharacterLockPolicyFailureMessage } from "@shared/verticalDramaSeries/characterLock";

/**
 * Coverage for Set A client fixes
 * (planning/vd-stuck-generation-and-lost-characters/plan.md, "Set A — Stuck /
 * policy-rejected character portrait candidates never clear"): the pure
 * helpers `pollPortraitCandidateTask`/`selectedPortraitCandidateBatches`/the
 * per-candidate Cancel+Retry buttons now use. A full render test of this
 * ~6700-line panel remains impractical (see
 * `VerticalDramaCharacterStockPanel.characterCrud.test.ts`'s doc comment for
 * the established precedent) — these test the extracted pure functions the
 * component wires the mutations/state around instead.
 */

function candidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    assetLinkId: "1",
    candidateId: "c1",
    index: 0,
    status: "queued",
    ...overrides,
  } as any;
}

describe("buildPortraitCandidateTimeoutPatch (Set A fix #1)", () => {
  it("returns a terminal failed status with a bilingual message, never leaving the card frozen", () => {
    const th = buildPortraitCandidateTimeoutPatch("th");
    expect(th.status).toBe("failed");
    expect(th.errorMessage).toBe("ใช้เวลานานเกินไป — กรุณาลองใหม่");

    const en = buildPortraitCandidateTimeoutPatch("en");
    expect(en.status).toBe("failed");
    expect(en.errorMessage).toBe("Taking too long — please retry.");
  });
});

describe("mergeDurablePortraitCandidateStatus (Set A fix #2 — the core bug)", () => {
  it("propagates a durable `failed` (with errorMessage) over a stale in-memory `queued`", () => {
    const inMemory = candidate({ status: "queued", errorMessage: undefined });
    const saved = candidate({
      status: "failed",
      errorMessage: "Content policy violation",
    });
    const merged = mergeDurablePortraitCandidateStatus(inMemory, saved);
    expect(merged.status).toBe("failed");
    expect(merged.errorMessage).toBe("Content policy violation");
  });

  it("propagates a durable `completed` (with imageUrl) over a stale in-memory `submitting`", () => {
    const inMemory = candidate({ status: "submitting", imageUrl: undefined });
    const saved = candidate({
      status: "completed",
      imageUrl: "https://cdn.example/candidate.png",
    });
    const merged = mergeDurablePortraitCandidateStatus(inMemory, saved);
    expect(merged.status).toBe("completed");
    expect(merged.imageUrl).toBe("https://cdn.example/candidate.png");
  });

  it("still lets a durable `selected`/`superseded` win unconditionally (pre-fix behavior preserved)", () => {
    const inMemoryCompleted = candidate({ status: "completed" });
    const savedSelected = candidate({ status: "selected" });
    expect(
      mergeDurablePortraitCandidateStatus(inMemoryCompleted, savedSelected).status
    ).toBe("selected");

    const savedSuperseded = candidate({ status: "superseded" });
    expect(
      mergeDurablePortraitCandidateStatus(inMemoryCompleted, savedSuperseded).status
    ).toBe("superseded");
  });

  it("never downgrades an already-terminal in-memory status (no flapping)", () => {
    // This tab's own poll already settled it as `completed` — a
    // differently-terminal (but stale) `failed` snapshot from `saved` must
    // not clobber it.
    const inMemoryCompleted = candidate({ status: "completed", imageUrl: "a.png" });
    const savedFailed = candidate({ status: "failed", errorMessage: "stale" });
    const merged = mergeDurablePortraitCandidateStatus(inMemoryCompleted, savedFailed);
    expect(merged.status).toBe("completed");
    expect(merged.imageUrl).toBe("a.png");
  });

  it("fills in a missing taskId/imageUrl from saved without touching status", () => {
    const inMemory = candidate({ status: "queued", taskId: undefined });
    const saved = candidate({ status: "queued", taskId: "task-123" });
    const merged = mergeDurablePortraitCandidateStatus(inMemory, saved);
    expect(merged.status).toBe("queued");
    expect(merged.taskId).toBe("task-123");
  });

  it("returns the in-memory candidate unchanged when there is no durable row yet", () => {
    const inMemory = candidate({ status: "submitting" });
    expect(mergeDurablePortraitCandidateStatus(inMemory, undefined)).toEqual(inMemory);
  });

  it("VD_PORTRAIT_CANDIDATE_TERMINAL_STATUSES matches the four final states", () => {
    expect([...VD_PORTRAIT_CANDIDATE_TERMINAL_STATUSES].sort()).toEqual(
      ["completed", "failed", "selected", "superseded"].sort()
    );
  });
});

describe("removePortraitCandidateFromBatch (Set A fix #3 — Cancel)", () => {
  it("drops only the targeted candidate, preserving the rest and batch metadata", () => {
    const batch = {
      batchId: "b1",
      characterId: "42",
      model: "some-model",
      candidates: [candidate({ assetLinkId: "1" }), candidate({ assetLinkId: "2" })],
    } as any;
    const next = removePortraitCandidateFromBatch(batch, "1");
    expect(next.candidates.map((c: any) => c.assetLinkId)).toEqual(["2"]);
    expect(next.batchId).toBe("b1");
    expect(next.model).toBe("some-model");
  });
});

describe("shouldAutoSoftenPortraitCandidate (Set A fix #4 — deferred to manual Retry)", () => {
  it("is always false today — generatePortraitCandidateBatch has no softenLevel input yet (see TODO(soften))", () => {
    expect(shouldAutoSoftenPortraitCandidate("content policy violation", 0)).toBe(false);
    expect(shouldAutoSoftenPortraitCandidate("network timeout", 0)).toBe(false);
    expect(shouldAutoSoftenPortraitCandidate("content policy violation", 1)).toBe(false);
  });

  it("the underlying classifier it would gate on still correctly detects policy failures", () => {
    // Confirms the message that reaches the failed-branch toast really is
    // policy-classified, independent of the (currently-disabled) soften
    // gate above.
    expect(isCharacterLockPolicyFailureMessage("Blocked: content policy violation")).toBe(
      true
    );
    expect(isCharacterLockPolicyFailureMessage("Network request timed out")).toBe(false);
  });
});
