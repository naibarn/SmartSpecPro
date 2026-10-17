import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadCompletedAutonomousPilotFixture } from "./fixtures/completedAutonomousPilot";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const pilotPath = path.join(
  repositoryRoot,
  "specs/feature/268-smartaihub-unified-memory-r2-5-work-context-evidence-alignment/handoff/evidence/backlog-pilot-20261016.json",
);
const usagePath = path.join(
  repositoryRoot,
  "specs/feature/268-smartaihub-unified-memory-r2-5-work-context-evidence-alignment/handoff/evidence/pilot-canonical-model-usage-20261016.jsonl",
);
const digest = (filePath: string) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");

describe("completed autonomous pilot evidence fixture", () => {
  it("projects bounded completion without claiming whole-spec completion", () => {
    const fixture = loadCompletedAutonomousPilotFixture(repositoryRoot);

    expect(fixture.boundedPilotGoal).toMatchObject({
      status: "COMPLETE",
      wholeSpecsComplete: false,
      originalSourceSha: "f3a533fdf782ef0af140fda9420178083f399cd2",
      finalSourceSha: "3190569a5d27584131b39e3933d4b9f4aa72a08d",
    });
    expect(fixture.verification).toMatchObject({
      status: "PASS_SCOPED",
      testsPassed: 295,
      testFiles: 26,
      sourceSha: fixture.boundedPilotGoal.finalSourceSha,
      r5: {
        status: "PASS_SCOPED",
        tests: 5,
        runtime: expect.stringContaining("native PostgreSQL"),
        limitations: expect.stringContaining("No deployed trusted-ingress"),
      },
    });
    expect(fixture.workUnits).toHaveLength(6);
    expect(fixture.workUnits.map(unit => unit.workunit)).toEqual([
      "SPEC161_STORY_WORKER_OUTCOME",
      "SPEC161_DEEP_DRAFT_FAILURE_CHAIN",
      "SPEC161_STORY_WORKER_FINAL_QC",
      "SPEC161_LINEAGE_MODEL_PASSTHROUGH",
      "SPEC161_MODEL_POLICY_READ_FAILURE_FAIL_CLOSED",
      "SPEC268_CHAT_ENTITY_MEMORY_SCOPE_GUARDS",
    ]);
    expect(fixture.workUnits.every(unit => typeof unit.merge_sha === "string" && typeof unit.pr === "number")).toBe(true);
    expect(fixture.nativeJobRunEvidence).toHaveLength(10);
    expect(fixture.nativeJobRunEvidence[0]).toMatchObject({
      jobId: "spec161-9a184890-7821-49f8-a",
      runId: 1,
      attemptId: null,
      attemptCount: 1,
    });
    expect(fixture.nativeJobRunEvidence.find(item => item.sourceRecord.evidence === "SPEC161_STORY_OUTCOME_SUCCESS"))
      .toMatchObject({ attemptId: null, attemptCount: 1 });
  });

  it("binds published model accounting to all 74 raw receipts and keeps unknown usage separate", () => {
    const fixture = loadCompletedAutonomousPilotFixture(repositoryRoot);
    const { modelUsage } = fixture;

    expect(modelUsage).toMatchObject({
      receiptCount: 74,
      knownReleasedCount: 74,
      inputTokens: 5749862,
      cachedInputTokens: 5179136,
      outputTokens: 21506,
      actualTotalTokens: 5771368,
      cachedInputIsSubsetOfInput: true,
      effectiveModel: "UNKNOWN",
      billingSettlement: "UNKNOWN",
      assistantAndConductorUsage: "UNKNOWN",
    });
    expect(modelUsage.cachedInputTokens).toBeLessThan(modelUsage.inputTokens);
    expect(modelUsage.rawReceipts).toHaveLength(modelUsage.receiptCount);
    expect(new Set(modelUsage.rawReceipts.map(receipt => receipt.modelCallId)).size).toBe(74);
    expect(modelUsage.rawReceipts.every(receipt => receipt.requestedModel === "gpt-6-luna")).toBe(true);
    expect(modelUsage.rawReceipts.every(receipt => receipt.effectiveModel === null)).toBe(true);
    expect(modelUsage.rawReceipts.every(receipt => receipt.reservationStatus === "released")).toBe(true);
    expect(modelUsage.rawReceipts.every(receipt => Boolean(receipt.jobId && receipt.role && receipt.observedAt))).toBe(true);
    expect(fixture.conversationSnapshotObservation).toMatchObject({
      displayedTokens: 160516,
      elapsedSeconds: 224,
      classification: "stale display; excluded from SDK call totals",
    });
  });

  it("reads and digest-verifies retained evidence without changing either artifact", () => {
    const beforePilot = digest(pilotPath);
    const beforeUsage = digest(usagePath);
    const fixture = loadCompletedAutonomousPilotFixture(repositoryRoot);

    expect(fixture.evidence).toMatchObject({
      pilotArtifactSha256: beforePilot,
      usageArtifactSha256: beforeUsage,
    });
    expect(digest(pilotPath)).toBe(beforePilot);
    expect(digest(usagePath)).toBe(beforeUsage);
  });
});
