import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createDevelopmentWorkUnit } from "./developmentLifecycleContracts";
import { createMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY } from "./miniAppFactoryDurableState";
import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { buildDevelopmentRun } from "./spec224DevelopmentRunContracts";
import { createMiniAppFactoryRunnerStage } from "./miniAppFactoryRunnerStageAdapter";

const pipeline: MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1",
  pipelineId: "factory-adapter-test",
  stages: [{ id: "SPEC", dependsOn: [], inputs: ["requirements"], outputs: ["appSpec"], gate: "authoritative source" }],
};

function makeParent() {
  const sha = "a".repeat(40);
  const workUnit = createDevelopmentWorkUnit({
    workId: "factory-adapter-parent-work",
    projectId: "factory-project",
    repositoryId: "smartspecpro",
    source: { type: "feature", ref: "program:AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" },
    objective: "Continue the Research Notes Factory program",
    ownership: { actor: "42", session: "session-ref", harness: "development-control" },
    canonicalTarget: { kind: "git", locator: "refs/heads/main" },
    baseRevision: sha,
  });
  workUnit.progress.remainingScope = ["SPEC"];
  workUnit.progress.immediatelyRunnableScope = ["SPEC"];
  const run = buildDevelopmentRun({
    runId: "factory-parent-run",
    tenantId: "tenant-real-ref",
    actorId: 42,
    goal: "Continue Research Notes",
    repositoryRef: "repo:smartspecpro",
    baseRevision: `git:${sha}`,
    contextPackHash: "b".repeat(64),
    workspaceId: "workspace-real-ref",
    workPackageId: "work-package-real-ref",
    workUnit,
    metadata: {
      [MINI_APP_FACTORY_STATE_KEY]: createMiniAppFactoryDurableState({
        programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
        miniAppId: "app_research_notes",
        sourceSha: sha,
      }),
    },
  });
  run.workerJobId = "parent-job-id";
  return run;
}

function parentManifest() {
  return {
    taskId: "authorized-parent-task",
    tenantId: "tenant-real-ref",
    actorId: 42,
    provider: "codex",
    runtime: "local_runner",
    workspaceId: "workspace-real-ref",
    workPackageId: "work-package-real-ref",
    planId: "approved-plan-ref",
    planRevision: 7,
    skillIds: ["approved-skill-ref"],
    requestedCapabilities: ["codex"],
    spec224Execution: { sourceFingerprint: "c".repeat(64), mode: "work_package", allowedWriteSet: ["apps/web/server/services/researchNotes/**"] },
  };
}

describe("Mini App Factory trusted Runner stage adapter", () => {
  it("constructs a staged child DevelopmentRun and creates it through deferred canonical admission", async () => {
    const parent = makeParent();
    const manifest = parentManifest();
    const stageInput = vi.fn(async (files: Array<{ path: string; contentBase64: string }>) => {
      expect(files[0]?.path).toBe("mini-app-factory-stage.json");
      const content = Buffer.from(files[0]!.contentBase64, "base64").toString("utf8");
      expect(JSON.parse(content)).toMatchObject({ parentRunId: parent.runId, stageId: "SPEC", sourceSha: "a".repeat(40) });
      return { inputSourceRef: "runner-input-source:staged-stage", inputDigest: createHash("sha256").update(content).digest("hex"), totalBytes: Buffer.byteLength(content) };
    });
    const createRun = vi.fn(async (value: any) => ({ run: { ...value.run, workerJobId: "child-job-id" }, jobRef: { jobId: "child-job-id", created: true } }));
    const bindInput = vi.fn(async () => true);
    const result = await createMiniAppFactoryRunnerStage({
      pipeline,
      stage: pipeline.stages[0]!,
      run: { runId: parent.runId, tenantId: parent.tenantId, actorId: parent.actorId },
      service: { get: async () => ({ run: parent, revision: 4, events: [] }) } as any,
      controlPlane: { getContext: async () => ({ jobType: "external_agent_task", input: { manifest } }) } as any,
      stageInput: async (files, startRef, tenantId) => {
        expect(startRef).toMatch(/^factory-run-[a-f0-9]{40}$/);
        expect(tenantId).toBe(parent.tenantId);
        return stageInput(files);
      },
      createRun: createRun as any,
      bindInput: bindInput as any,
    });

    expect(result).toMatchObject({ jobId: "child-job-id", created: true, state: "PENDING_AUTHORIZATION" });
    const input = createRun.mock.calls[0]![0] as any;
    expect(input).toMatchObject({ provider: "codex", runtime: "local_runner", planId: "approved-plan-ref", planRevision: 7, requestedCapabilities: ["codex"], deferredAdmission: true });
    expect(input.run.workPackageId).toBe("work-package-real-ref");
    expect(input.run.metadata.miniAppFactoryStage).toMatchObject({ parentRunId: parent.runId, stageId: "SPEC", programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" });
    expect(input.run.metadata.spec224Input.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(input.run.metadata.spec224Execution.allowedWriteSet).toEqual(manifest.spec224Execution.allowedWriteSet);
    expect(input.policyBinding).toBeUndefined();
    expect(bindInput).toHaveBeenCalledWith(expect.objectContaining({ tenantId: parent.tenantId, workerJobId: "child-job-id" }));
  });

  it("fails closed when the existing DevelopmentRun has no work-package and write-set authority", async () => {
    const parent = makeParent();
    const manifest = { ...parentManifest(), workPackageId: undefined, spec224Execution: undefined };
    const createRun = vi.fn();
    await expect(createMiniAppFactoryRunnerStage({
      pipeline,
      stage: pipeline.stages[0]!,
      run: { runId: parent.runId, tenantId: parent.tenantId, actorId: parent.actorId },
      service: { get: async () => ({ run: parent, revision: 4, events: [] }) } as any,
      controlPlane: { getContext: async () => ({ jobType: "external_agent_task", input: { manifest } }) } as any,
      createRun: createRun as any,
    })).rejects.toThrow("FACTORY_RUNNER_PARENT_AUTHORITY_REQUIRED");
    expect(createRun).not.toHaveBeenCalled();
  });
});
