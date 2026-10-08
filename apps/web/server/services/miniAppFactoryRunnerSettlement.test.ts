import { describe, expect, it, vi } from "vitest";

import { createDevelopmentWorkUnit, recordCanonicalCheckpoint } from "./developmentLifecycleContracts";
import { createMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY } from "./miniAppFactoryDurableState";
import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { buildDevelopmentRun } from "./spec224DevelopmentRunContracts";
import { settleMiniAppFactoryRunnerStage } from "./miniAppFactoryRunnerSettlement";

const pipeline: MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1",
  pipelineId: "factory-settlement-test",
  stages: [{ id: "SPEC", dependsOn: [] }, { id: "TEST", dependsOn: ["SPEC"] }],
};

describe("Mini App Factory trusted Runner settlement", () => {
  it("settles a completed receipt on the parent DevelopmentRun before selecting the next stage", async () => {
    const sha = "a".repeat(40);
    const unit = createDevelopmentWorkUnit({
      workId: "settlement-parent-work",
      projectId: "factory-project",
      repositoryId: "smartspecpro",
      source: { type: "feature", ref: "program:AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" },
      objective: "Run the Factory pipeline",
      ownership: { actor: "42", session: "session-ref", harness: "mini-app-factory" },
      canonicalTarget: { kind: "git", locator: "refs/heads/main" },
      baseRevision: sha,
    });
    unit.progress.state = "WORKING";
    unit.progress.remainingScope = ["SPEC", "TEST"];
    unit.progress.immediatelyRunnableScope = ["SPEC"];
    const parent = buildDevelopmentRun({
      runId: "factory-parent-run",
      tenantId: "tenant-real-ref",
      actorId: 42,
      goal: "Run the Factory pipeline",
      repositoryRef: "repo:smartspecpro",
      baseRevision: `git:${sha}`,
      contextPackHash: "b".repeat(64),
      workspaceId: "workspace-real-ref",
      workUnit: unit,
      metadata: { [MINI_APP_FACTORY_STATE_KEY]: createMiniAppFactoryDurableState({ programId: "factory-program", miniAppId: "app_research_notes", sourceSha: sha }) },
    });
    const child = buildDevelopmentRun({
      runId: "factory-child-run",
      tenantId: parent.tenantId,
      actorId: parent.actorId,
      goal: "Complete SPEC",
      repositoryRef: parent.repositoryRef,
      baseRevision: parent.baseRevision,
      contextPackHash: parent.contextPackHash,
      workspaceId: parent.workspaceId,
      metadata: { miniAppFactoryStage: { schemaVersion: "mini-app-factory-runner-stage.v1", parentRunId: parent.runId, pipelineId: pipeline.pipelineId, programId: "factory-program", miniAppId: "app_research_notes", stageId: "SPEC", sourceSha: sha } },
    });
    child.workerJobId = "child-job";
    let revision = 2;
    const state = new Map([[parent.runId, parent], [child.runId, child]]);
    const service = {
      get: async ({ runId }: { runId: string }) => ({ run: state.get(runId)!, revision, events: [] }),
      recordCanonicalCheckpoint: async (input: any) => {
        const current = state.get(input.runId)!;
        const next = recordCanonicalCheckpoint(current.workUnit!, input.checkpoint);
        state.set(current.runId, { ...current, workUnit: next, metadata: { ...current.metadata, ...input.checkpoint.runMetadata } });
        revision += 1;
        return { accepted: true, run: state.get(current.runId), revision };
      },
    };
    const createRunnerStage = vi.fn(async () => ({ runId: "test-child-run", jobId: "held-test-job", created: true, state: "PENDING_AUTHORIZATION" as const }));

    const result = await settleMiniAppFactoryRunnerStage({
      runId: child.runId,
      tenantId: parent.tenantId,
      actorId: parent.actorId,
      receiptEventId: "real-runner-receipt-event",
      pipeline,
      developmentRuns: service as any,
      createRunnerStage,
    });

    expect(result).toMatchObject({ stageId: "SPEC", nextStageId: "TEST", nextJobId: "held-test-job", created: true });
    expect(state.get(parent.runId)?.workUnit?.progress.completedScope).toEqual(["SPEC"]);
    expect(state.get(parent.runId)?.workUnit?.progress.remainingScope).toEqual(["TEST"]);
    expect(state.get(parent.runId)?.workUnit?.artifacts).toContain("runner-receipt:real-runner-receipt-event");
    expect(createRunnerStage).toHaveBeenCalledWith(expect.objectContaining({ stage: expect.objectContaining({ id: "TEST" }), run: expect.objectContaining({ runId: parent.runId }) }));
  });
});
