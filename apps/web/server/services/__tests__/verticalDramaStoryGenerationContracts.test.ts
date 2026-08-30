import { describe, expect, it } from "vitest";
import {
  assertStoryGenerationTransition,
  buildStoryContractHash,
  canonicalStoryValue,
  createStorySourceSnapshot,
  deriveLegacyBeatId,
  effectiveStoryCreditCeiling,
  summarizeStoryGenerationRun,
  type StoryGenerationBudget,
  type StoryGenerationPolicy,
} from "../verticalDramaStoryGenerationContracts";

describe("vertical drama story generation contracts", () => {
  it("canonicalizes equivalent input and changes the fingerprint when source changes", () => {
    expect(canonicalStoryValue({ b: 2, a: 1 })).toBe(canonicalStoryValue({ a: 1, b: 2 }));
    const first = createStorySourceSnapshot("draft", "r1", { title: "A" });
    const second = createStorySourceSnapshot("draft", "r1", { title: "B" });
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it("derives stable IDs for legacy plan beats", () => {
    expect(deriveLegacyBeatId(2, 4, "  meet at the station ")).toBe(
      deriveLegacyBeatId(2, 4, "meet at the station"),
    );
  });

  it("rejects invalid state transitions", () => {
    expect(() => assertStoryGenerationTransition("queued", "succeeded")).toThrow(
      "Invalid story generation transition",
    );
    expect(() => assertStoryGenerationTransition("validating", "succeeded")).not.toThrow();
  });

  it("uses the lower of estimated credits and side-effect spend", () => {
    const budget: StoryGenerationBudget = {
      maxTurns: 10, maxToolCalls: 10, maxParallelAgents: 2, maxEpisodes: 10,
      maxLlmCalls: 10, maxRepairAttempts: 2, maxWallClockMs: 1000,
      maxContextBytes: 1000, maxOutputBytes: 1000, maxEstimatedCredits: 50,
      onExhaustion: "partial",
    };
    const policy: StoryGenerationPolicy = {
      mode: "standard", requireApprovalForStructuralRepair: true,
      allowedSideEffects: ["artifact_write", "credit_mutation"], maxSpendCredits: 30,
      allowRetryAfterPartialSuccess: true,
    };
    expect(effectiveStoryCreditCeiling(budget, policy)).toBe(30);
  });

  it("does not report transport completion for a pending run", () => {
    const summary = summarizeStoryGenerationRun({
      runId: "run-1", seriesId: 1, status: "partial", stage: "generation",
      checkpoint: { episode: 2 }, report: null, approvalRequired: false,
      approvalReason: null, eventCursor: 4, estimatedCredits: 2, errorCode: null,
    });
    expect(summary.transportOutcome).toBe("resumable");
    expect(summary.resumable).toBe(true);
  });

  it("hashes a contract without relying on object insertion order", () => {
    const base = { runId: "r", sourceFingerprint: "s", policyHash: "p" } as never;
    expect(buildStoryContractHash(base)).toBe(buildStoryContractHash({ policyHash: "p", sourceFingerprint: "s", runId: "r" } as never));
  });
});
