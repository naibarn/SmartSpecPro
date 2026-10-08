import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createDevelopmentWorkUnit } from "./developmentLifecycleContracts";
import { createMiniAppFactoryStageWorkerRuntime } from "./miniAppFactoryRuntime";
import { loadMiniAppFactoryPipeline, selectReadyMiniAppFactoryStages, validateMiniAppFactoryPipeline, type MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";

const pipeline = JSON.parse(readFileSync(join(process.cwd(), "../../orchestra/programs/autonomous-mini-app-factory/factory-pipeline.v1.json"), "utf8")) as MiniAppFactoryPipeline;
const workUnit = (completedScope: string[] = [], remainingScope = pipeline.stages.map(({ id }) => id).filter((id) => !completedScope.includes(id))) => ({
  ...createDevelopmentWorkUnit({
    workId: "factory-miniapp-1",
    projectId: "mini-app-factory",
    repositoryId: "smartspecpro",
    source: { type: "generated" as const, ref: "app:project-wiki-pages" },
    objective: "Build the Project Wiki Pages Mini App through the generic factory pipeline",
    ownership: { actor: "codex", session: "test", harness: "vitest" },
    canonicalTarget: { kind: "git" as const, locator: "refs/heads/main" },
    baseRevision: "a".repeat(40),
  }),
  progress: {
    ...createDevelopmentWorkUnit({
      workId: "factory-miniapp-1",
      projectId: "mini-app-factory",
      repositoryId: "smartspecpro",
      source: { type: "generated" as const, ref: "app:project-wiki-pages" },
      objective: "Build the Project Wiki Pages Mini App through the generic factory pipeline",
      ownership: { actor: "codex", session: "test", harness: "vitest" },
      canonicalTarget: { kind: "git" as const, locator: "refs/heads/main" },
      baseRevision: "a".repeat(40),
    }).progress,
    completedScope,
    remainingScope,
  },
});

describe("Mini App Factory pipeline evaluator", () => {
  it("loads the same canonical stage DAG used by the autonomous program at runtime", () => {
    expect(loadMiniAppFactoryPipeline()).toEqual({
      schemaVersion: pipeline.schemaVersion,
      pipelineId: pipeline.pipelineId,
      stages: pipeline.stages,
    });
  });

  it("production worker composition uses the trusted Runner adapter and disables synthetic execution", async () => {
    const runtime = createMiniAppFactoryStageWorkerRuntime();
    expect(runtime.pipeline.stages).toHaveLength(pipeline.stages.length);
    expect(runtime.createRunnerStage).toEqual(expect.any(Function));
    expect(runtime.allowSyntheticExecution).toBe(false);
    await expect(runtime.executeStage("SPEC", { completedScope: [], artifacts: [], canonicalRevision: "a".repeat(40), attempt: 1 })).rejects.toThrow("FACTORY_SYNTHETIC_EXECUTION_DISABLED");
  });

  it("validates the checked-in DAG and selects only dependency-ready stages", () => {
    validateMiniAppFactoryPipeline(pipeline);
    expect(selectReadyMiniAppFactoryStages(pipeline, workUnit())).toEqual(["requirements_intake"]);
    expect(selectReadyMiniAppFactoryStages(pipeline, workUnit(["requirements_intake"]))).toEqual(["spec_compile", "recovery"]);
  });

  it("rejects a missing dependency and a dependency cycle", () => {
    expect(() => validateMiniAppFactoryPipeline({ ...pipeline, stages: [{ id: "bad", dependsOn: ["missing"] }] })).toThrow("FACTORY_DEPENDENCY_MISSING");
    expect(() => validateMiniAppFactoryPipeline({ ...pipeline, stages: [{ id: "a", dependsOn: ["b"] }, { id: "b", dependsOn: ["a"] }] })).toThrow("FACTORY_PIPELINE_CYCLE");
  });

  it("keeps independently ready stages runnable when another stage is dependency-waiting", () => {
    const unit = workUnit(["requirements_intake"]);
    unit.dependencies.push({
      dependencyId: "dep-runtime",
      consumerWorkId: unit.workId,
      projectId: unit.projectId,
      requirement: { type: "runner-readiness", locator: "nonprod-runtime" },
      satisfaction: { predicateId: "runtime-ready", evidenceSource: "worker_job_events" },
      waitPolicy: { eventFirst: true, pollingFallback: true, timeoutIsTerminal: false },
      wake: { resumeWorkId: unit.workId, resumeFrom: "deploy", eventTypes: ["DEVELOPMENT_EVIDENCE"] },
      fallback: { rediscoverProducer: true, alternateRouteAllowed: true, continueIndependentWork: true },
      blockedScope: ["deploy", "migrate", "smoke", "uat", "evidence"],
      state: "UNSATISFIED",
      watcher: { watcherId: "watch-runtime", status: "ACTIVE", registeredAt: "2026-10-08T00:00:00.000Z" },
    });
    expect(selectReadyMiniAppFactoryStages(pipeline, unit)).toEqual(["spec_compile", "recovery"]);
  });
});
