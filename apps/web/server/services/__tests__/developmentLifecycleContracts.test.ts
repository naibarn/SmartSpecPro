import { describe, expect, it } from "vitest";

import {
  completeDevelopmentWorkUnit,
  createDevelopmentWorkUnit,
  recordCanonicalCheckpoint,
  reconcileDevelopmentResume,
} from "../developmentLifecycleContracts";

const workUnit = () =>
  createDevelopmentWorkUnit({
    workId: "work-bug-42",
    projectId: "project-atlas",
    repositoryId: "repo-atlas",
    source: { type: "bug", ref: "issue:42" },
    objective: "Fix the queue retry regression",
    ownership: { actor: "dev-7", session: "session-a", harness: "codex" },
    canonicalTarget: { kind: "git", locator: "refs/heads/trunk" },
    baseRevision: "a".repeat(40),
  });

describe("project-agnostic development lifecycle contract", () => {
  it("records a safe partial checkpoint and exact-revision obligations", () => {
    const next = recordCanonicalCheckpoint(workUnit(), {
      canonicalRevision: "b".repeat(40),
      completedScope: ["retry-policy"],
      remainingScope: ["telemetry", "recovery-test"],
      pendingValidation: [{ checkType: "integration", revision: "b".repeat(40) }],
      nextAction: "Implement the recovery event projection",
      nextOwner: "dev-8",
      handoffRef: "git:handoff-42",
      resumeFrom: "retry-policy",
    });
    expect(next.progress).toMatchObject({
      state: "PARTIAL_INTEGRATED",
      canonicalRevision: "b".repeat(40),
      completedScope: ["retry-policy"],
      remainingScope: ["telemetry", "recovery-test"],
    });
    expect(next.validation.pending[0]?.revision).toBe(next.progress.canonicalRevision);
    expect(next.handoff).toMatchObject({
      nextOwner: "dev-8",
      nextAction: "Implement the recovery event projection",
      handoffRef: "git:handoff-42",
    });
    expect(next.source.type).toBe("bug");
  });

  it("rejects partial checkpoints without handoff and validation revision drift", () => {
    expect(() =>
      recordCanonicalCheckpoint(workUnit(), {
        canonicalRevision: "b".repeat(40),
        completedScope: ["retry-policy"],
        remainingScope: ["recovery-test"],
        pendingValidation: [{ checkType: "integration", revision: "c".repeat(40) }],
        nextAction: "Continue",
        nextOwner: "dev-8",
        handoffRef: "git:handoff-42",
        resumeFrom: "retry-policy",
      })
    ).toThrow("VALIDATION_REVISION_MISMATCH");
    expect(() =>
      recordCanonicalCheckpoint(workUnit(), {
        canonicalRevision: "b".repeat(40),
        completedScope: ["retry-policy"],
        remainingScope: ["recovery-test"],
        pendingValidation: [],
        nextAction: "Continue",
        nextOwner: "dev-8",
        handoffRef: "",
        resumeFrom: "retry-policy",
      })
    ).toThrow("HANDOFF_REQUIRED");
  });

  it("resumes from durable canonical handoff instead of a stale session snapshot", () => {
    const durable = recordCanonicalCheckpoint(workUnit(), {
      canonicalRevision: "d".repeat(40),
      completedScope: ["retry-policy", "telemetry"],
      remainingScope: ["recovery-test"],
      pendingValidation: [{ checkType: "focused-test", revision: "d".repeat(40) }],
      nextAction: "Add the recovery test",
      nextOwner: "dev-9",
      handoffRef: "artifact:handoff-42",
      resumeFrom: "recovery-test",
    });
    const resumed = reconcileDevelopmentResume(durable, {
      snapshotRevision: "b".repeat(40),
      completedScope: ["retry-policy"],
      remainingScope: ["telemetry", "recovery-test"],
    });
    expect(resumed).toMatchObject({
      sourceOfTruth: "DURABLE_HANDOFF",
      canonicalRevision: "d".repeat(40),
      remainingScope: ["recovery-test"],
      nextAction: "Add the recovery test",
    });
    expect(resumed.remainingScope).not.toContain("telemetry");
  });

  it("supports non-Git canonical target kinds and non-Spec source types", () => {
    const miniApp = createDevelopmentWorkUnit({
      workId: "work-generated-miniapp-5",
      projectId: "project-miniapps",
      repositoryId: "app-registry",
      source: { type: "generated", ref: "prompt:5" },
      objective: "Generate a knowledge Mini App draft",
      ownership: { actor: "agent-1", session: "run-5", harness: "native-agent" },
      canonicalTarget: { kind: "application-version", locator: "app:5" },
      baseRevision: "version:4",
    });
    expect(miniApp.canonicalTarget.kind).toBe("application-version");
    expect(miniApp.source.type).toBe("generated");
  });

  it("keeps implementation completion separate from pending validation", () => {
    const complete = completeDevelopmentWorkUnit(workUnit(), {
      canonicalRevision: "e".repeat(40),
      completedScope: ["retry-policy", "telemetry", "recovery-test"],
      pendingValidation: [{ checkType: "full-suite", revision: "e".repeat(40), state: "NOT_RUN" }],
    });
    expect(complete.progress.state).toBe("IMPLEMENTATION_COMPLETE");
    expect(complete.progress.remainingScope).toEqual([]);
    expect(complete.validation.pending[0]?.state).toBe("NOT_RUN");
  });
});
