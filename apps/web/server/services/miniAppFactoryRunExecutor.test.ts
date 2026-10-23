import { describe, expect, it, vi } from "vitest";
import {
  recordCanonicalCheckpoint,
  completeDevelopmentWorkUnit,
  createDevelopmentWorkUnit,
} from "./developmentLifecycleContracts";
import { buildDevelopmentRun } from "./spec224DevelopmentRunContracts";
import { executeMiniAppFactoryStages } from "./miniAppFactoryRunExecutor";
import { recordMiniAppIndependentBrowserAcceptance } from "./miniAppFactoryRunExecutor";
import { MINI_APP_FACTORY_STATE_KEY, createMiniAppFactoryDurableState } from "./miniAppFactoryDurableState";
import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";

const pipeline: MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1",
  pipelineId: "test-pipeline",
  stages: [
    { id: "spec", dependsOn: [] },
    { id: "implement", dependsOn: ["spec"] },
  ],
};

function makeRun() {
  const sha = "a".repeat(40);
  const workUnit = createDevelopmentWorkUnit({
    workId: "factory-work-1",
    projectId: "mini-app-factory",
    repositoryId: "smartspecpro",
    source: { type: "generated", ref: "app:example" },
    objective: "Execute a Mini App Factory pipeline",
    ownership: { actor: "codex", session: "test", harness: "vitest" },
    canonicalTarget: { kind: "git", locator: "refs/heads/main" },
    baseRevision: sha,
  });
  const run = buildDevelopmentRun({
    runId: "factory-run-1",
    tenantId: "tenant-1",
    actorId: 1,
    goal: "Execute a Mini App Factory pipeline",
    repositoryRef: "repo:smartspecpro",
    baseRevision: `git:${sha}`,
    contextPackHash: "b".repeat(64),
    workspaceId: "workspace-1",
    workUnit: {
      ...workUnit,
      progress: { ...workUnit.progress, remainingScope: ["spec", "implement"] },
    },
  });
  return run;
}

describe("Mini App Factory DevelopmentRun executor", () => {
  it("records USER_TRIAL_READY only from an independent pass bound to the deployed app artifact", async () => {
    let run = makeRun();
    const artifactDigest = "c".repeat(64);
    run.workUnit!.progress.completedScope = ["deploy", "smoke"];
    run.workUnit!.artifacts = [`app-artifact-digest:${artifactDigest}`];
    run.metadata = {
      [MINI_APP_FACTORY_STATE_KEY]: createMiniAppFactoryDurableState({
        programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
        miniAppId: "app_expenses",
        profile: "PERSONAL_MINIAPP",
      }),
    };
    let event: any;
    const service = {
      get: async () => ({ run, revision: 1, events: [] }),
      recordVerificationEvent: async (input: any) => {
        event = input;
        run = { ...run, metadata: { ...run.metadata, ...input.runMetadata } };
        return { accepted: true, run, revision: 2, event: null };
      },
    };
    const evidenceHash = "d".repeat(64);

    await recordMiniAppIndependentBrowserAcceptance({
      service: service as any,
      run: { runId: run.runId, tenantId: run.tenantId, actorId: run.actorId },
      receipt: {
        verifierType: "spec208-independent",
        result: "PASS",
        verificationEvidenceRef: `verification-evidence:sha256:${evidenceHash}`,
        verificationEvidenceHash: evidenceHash,
        verifiedAt: "2026-10-23T12:00:00.000Z",
        targetUrl: "https://smartaihub.app/miniapp/app_expenses",
        appId: "app_expenses",
        artifactDigest,
      },
    });

    expect(event.payload).toMatchObject({ outcome: "USER_TRIAL_READY", appId: "app_expenses", artifactDigest });
    expect(run.metadata?.[MINI_APP_FACTORY_STATE_KEY]).toMatchObject({ deliveryMilestone: "USER_TRIAL_READY" });
  });

  it("rejects a non-pass, wrong-app, or stale-artifact browser receipt", async () => {
    const run = makeRun();
    const artifactDigest = "e".repeat(64);
    run.workUnit!.progress.completedScope = ["deploy", "smoke"];
    run.workUnit!.artifacts = [`app-artifact-digest:${artifactDigest}`];
    run.metadata = {
      [MINI_APP_FACTORY_STATE_KEY]: createMiniAppFactoryDurableState({
        programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
        miniAppId: "app_expenses",
        profile: "PERSONAL_MINIAPP",
      }),
    };
    const service = { get: async () => ({ run, revision: 1, events: [] }), recordVerificationEvent: vi.fn() };

    await expect(recordMiniAppIndependentBrowserAcceptance({
      service: service as any,
      run: { runId: run.runId, tenantId: run.tenantId, actorId: run.actorId },
      receipt: {
        verifierType: "spec208-independent",
        result: "FAIL",
        verificationEvidenceRef: `verification-evidence:sha256:${"f".repeat(64)}`,
        verificationEvidenceHash: "f".repeat(64),
        verifiedAt: "2026-10-23T12:00:00.000Z",
        targetUrl: "https://smartaihub.app/miniapp/app_expenses",
        appId: "app_expenses",
        artifactDigest,
      },
    })).rejects.toThrow("MINI_APP_INDEPENDENT_BROWSER_RECEIPT_INVALID");
    expect(service.recordVerificationEvent).not.toHaveBeenCalled();
  });

  it("persists each stage before selecting and executing its dependent stage", async () => {
    let run = makeRun();
    let revision = 0;
    const persisted: string[] = [];
    const service = {
      get: async () => ({ run, revision, events: [] }),
      recordCanonicalCheckpoint: async (input: any) => {
        run = {
          ...run,
          workUnit: recordCanonicalCheckpoint(run.workUnit!, input.checkpoint),
        };
        revision += 1;
        persisted.push(input.checkpoint.completedScope[0]);
        return { accepted: true, run, revision, event: null };
      },
      recordImplementationCompletion: async (input: any) => {
        run = {
          ...run,
          workUnit: completeDevelopmentWorkUnit(run.workUnit!, input.completion),
        };
        revision += 1;
        persisted.push(input.completion.completedScope[0]);
        return { accepted: true, run, revision, event: null };
      },
    };
    const executed: string[] = [];

    const result = await executeMiniAppFactoryStages({
      pipeline,
      service: service as any,
      run: { runId: run.runId, tenantId: run.tenantId, actorId: run.actorId },
      maxStages: 2,
      executeStage: async stageId => {
        executed.push(stageId);
        return { artifacts: [`artifact:${stageId}`] };
      },
    });

    expect(executed).toEqual(["spec", "implement"]);
    expect(persisted).toEqual(executed);
    expect(result).toEqual({
      executedStages: ["spec", "implement"],
      nextEligibleStages: [],
      state: "IMPLEMENTATION_SCOPE_COMPLETE",
    });
    expect(run.workUnit?.progress.completedScope).toEqual(["spec", "implement"]);
    expect(run.workUnit?.artifacts).toEqual(["artifact:spec", "artifact:implement"]);
  });

  it("resumes from the persisted checkpoint in a new executor invocation", async () => {
    let durableRun = makeRun();
    let revision = 0;
    const makeService = () => ({
      get: async () => ({ run: durableRun, revision, events: [] }),
      recordCanonicalCheckpoint: async (input: any) => {
        durableRun = {
          ...durableRun,
          workUnit: recordCanonicalCheckpoint(durableRun.workUnit!, input.checkpoint),
        };
        revision += 1;
        return { accepted: true, run: durableRun, revision, event: null };
      },
      recordImplementationCompletion: async (input: any) => {
        durableRun = {
          ...durableRun,
          workUnit: completeDevelopmentWorkUnit(durableRun.workUnit!, input.completion),
        };
        revision += 1;
        return { accepted: true, run: durableRun, revision, event: null };
      },
    });
    const runScope = { runId: durableRun.runId, tenantId: durableRun.tenantId, actorId: durableRun.actorId };
    const firstInvocation = await executeMiniAppFactoryStages({
      pipeline,
      service: makeService() as any,
      run: runScope,
      maxStages: 1,
      executeStage: async stageId => ({ artifacts: [`artifact:${stageId}`] }),
    });

    expect(firstInvocation).toEqual({
      executedStages: ["spec"],
      nextEligibleStages: ["implement"],
      state: "READY",
    });
    expect(durableRun.workUnit?.progress.completedScope).toEqual(["spec"]);
    expect(durableRun.workUnit?.progress.remainingScope).toEqual(["implement"]);

    // A new service/executor instance reloads the last persisted DevelopmentRun checkpoint.
    const resumedStages: string[] = [];
    const resumedInvocation = await executeMiniAppFactoryStages({
      pipeline,
      service: makeService() as any,
      run: runScope,
      executeStage: async (stageId, context) => {
        resumedStages.push(stageId);
        expect(context.completedScope).toEqual(["spec"]);
        expect(context.artifacts).toEqual(["artifact:spec"]);
        return { artifacts: [`artifact:${stageId}`] };
      },
    });

    expect(resumedStages).toEqual(["implement"]);
    expect(resumedInvocation.state).toBe("IMPLEMENTATION_SCOPE_COMPLETE");
    expect(durableRun.workUnit?.progress.completedScope).toEqual(["spec", "implement"]);
  });

  it("continues an independent stage while a dependency-blocked stage waits", async () => {
    const baseRun = makeRun();
    const baseUnit = baseRun.workUnit!;
    const unit = {
      ...baseUnit,
      progress: { ...baseUnit.progress, remainingScope: ["blocked", "independent"] },
      dependencies: [{
        dependencyId: "runtime-ready",
        consumerWorkId: baseUnit.workId,
        projectId: baseUnit.projectId,
        requirement: { type: "runner-readiness" as const, locator: "nonprod-runtime" },
        satisfaction: { predicateId: "runtime-ready", evidenceSource: "worker_job_events" },
        waitPolicy: { eventFirst: true as const, pollingFallback: true as const, timeoutIsTerminal: false as const },
        wake: { resumeWorkId: baseUnit.workId, resumeFrom: "deploy", eventTypes: ["DEVELOPMENT_EVIDENCE"] },
        fallback: { rediscoverProducer: true as const, alternateRouteAllowed: true as const, continueIndependentWork: true as const },
        blockedScope: ["blocked"],
        state: "UNSATISFIED" as const,
        watcher: { watcherId: "watch-runtime", status: "ACTIVE" as const, registeredAt: "2026-10-08T00:00:00.000Z" },
      }],
    };
    let run = { ...baseRun, workUnit: unit };
    let revision = 0;
    const waitingPipeline: MiniAppFactoryPipeline = {
      schemaVersion: "mini-app-factory-pipeline.v1",
      pipelineId: "waiting-pipeline",
      stages: [
        { id: "blocked", dependsOn: [] },
        { id: "independent", dependsOn: [] },
      ],
    };
    const service = {
      get: async () => ({ run, revision, events: [] }),
      recordCanonicalCheckpoint: async (input: any) => {
        run = { ...run, workUnit: recordCanonicalCheckpoint(run.workUnit!, input.checkpoint) };
        revision += 1;
        return { accepted: true, run, revision, event: null };
      },
    };
    const executed: string[] = [];

    const result = await executeMiniAppFactoryStages({
      pipeline: waitingPipeline,
      service: service as any,
      run: { runId: run.runId, tenantId: run.tenantId, actorId: run.actorId },
      maxStages: 1,
      executeStage: async stageId => {
        executed.push(stageId);
        return { artifacts: [`artifact:${stageId}`] };
      },
    });

    expect(executed).toEqual(["independent"]);
    expect(result).toEqual({ executedStages: ["independent"], nextEligibleStages: [], state: "WAITING_DEPENDENCY" });
    expect(run.workUnit?.progress.remainingScope).toEqual(["blocked"]);
  });
});
