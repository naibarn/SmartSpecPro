import postgres from "postgres";

import { closeDb } from "../server/db";
import { createDevelopmentWorkUnit } from "../server/services/developmentLifecycleContracts";
import { executeMiniAppFactoryStages } from "../server/services/miniAppFactoryRunExecutor";
import type { MiniAppFactoryPipeline } from "../server/services/miniAppFactoryPipeline";
import {
  createDevelopmentRunService,
  defaultDevelopmentRunPersistenceAdapter,
} from "../server/services/spec224DevelopmentRunPersistence";
import { bindWorkerJob, buildDevelopmentRun } from "../server/services/spec224DevelopmentRunContracts";
import { createMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "../server/services/miniAppFactoryDurableState";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");

const runId = "mini-app-factory-cross-process-resume";
const tenantId = "miniapp-factory-resume-tenant";
const actorId = 1;
const sourceSha = process.env.MINI_APP_FACTORY_SOURCE_SHA;
if (!sourceSha || !/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("CANONICAL_SOURCE_SHA_REQUIRED");
const canonicalRevision = `git:${sourceSha}`;
const scope = { runId, tenantId, actorId };
const pipeline: MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1",
  pipelineId: "cross-process-resume-regression",
  stages: [
    { id: "SPEC", dependsOn: [] },
    { id: "SCAFFOLD", dependsOn: ["SPEC"] },
    { id: "IMPLEMENT", dependsOn: ["SCAFFOLD"] },
    { id: "TEST", dependsOn: ["IMPLEMENT"] },
  ],
};

const service = createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter);
const mode = process.argv[2];

try {
  if (mode === "start") {
    const sql = postgres(DATABASE_URL, { max: 1 });
    try {
      const [job] = await sql<{ id: string }[]>`
        INSERT INTO worker_jobs (
          "tenantId", "requestedByUserId", "runtimeType", "jobType", "inputJson"
        ) VALUES (
          ${tenantId}, ${actorId}, 'node_job_worker', 'mini_app.factory.resume.probe',
          ${sql.json({ spec224Run: { runId } })}
        ) RETURNING id
      `;
      const workUnit = createDevelopmentWorkUnit({
        workId: "work:mini-app-factory-cross-process-resume",
        projectId: "project:mini-app-factory-resume",
        repositoryId: "repo:smartspecpro",
        source: { type: "feature", ref: "program:AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" },
        objective: "Prove durable Factory resume across process termination.",
        ownership: { actor: String(actorId), session: "process-a", harness: "codex" },
        canonicalTarget: { kind: "git", locator: "refs/remotes/origin/main" },
        baseRevision: canonicalRevision,
      });
      workUnit.progress.remainingScope = pipeline.stages.map(stage => stage.id);
      const run = bindWorkerJob(buildDevelopmentRun({
        runId,
        tenantId,
        actorId,
        goal: "Prove durable Mini App Factory cross-process resume.",
        repositoryRef: "repo:smartspecpro",
        baseRevision: canonicalRevision,
        contextPackHash: "b".repeat(64),
        workspaceId: "workspace:mini-app-factory-resume",
        workUnit,
        metadata: {
          [MINI_APP_FACTORY_STATE_KEY]: createMiniAppFactoryDurableState({
            programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
            miniAppId: "app_research_notes",
            sourceSha,
          }),
        },
      }), job.id);
      await service.initialize({
        run,
        eventIdempotencyKey: `run-created:${runId}`,
        scope: { tenantId, actorId },
      });
      const result = await executeMiniAppFactoryStages({
        pipeline,
        service,
        run: scope,
        factoryIdentity: { programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM", miniAppId: "app_research_notes" },
        maxStages: 3,
        executeStage: async stageId => ({ artifacts: [`factory-evidence:${stageId.toLowerCase()}`] }),
      });
      if (result.executedStages.join(",") !== "SPEC,SCAFFOLD,IMPLEMENT" || result.nextEligibleStages.join(",") !== "TEST") {
        throw new Error("CROSS_PROCESS_CHECKPOINT_NOT_PERSISTED");
      }
      console.log(JSON.stringify({ process: "start", runId, completed: result.executedStages, nextEligible: result.nextEligibleStages }));
    } finally {
      await sql.end();
    }
  } else if (mode === "resume") {
    const restored = await service.get(scope);
    const unit = restored.run.workUnit;
    if (!unit || restored.run.baseRevision !== canonicalRevision) throw new Error("DURABLE_RUN_IDENTITY_MISMATCH");
    const durableFactoryState = parseMiniAppFactoryDurableState(restored.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
    if (durableFactoryState.programId !== "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" || durableFactoryState.miniAppId !== "app_research_notes" || durableFactoryState.sourceSha !== sourceSha) {
      throw new Error("DURABLE_FACTORY_IDENTITY_MISMATCH");
    }
    if (unit.progress.completedScope.join(",") !== "SPEC,SCAFFOLD,IMPLEMENT") throw new Error("DURABLE_COMPLETED_SCOPE_MISMATCH");
    if (unit.artifacts.join(",") !== "factory-evidence:spec,factory-evidence:scaffold,factory-evidence:implement") throw new Error("DURABLE_ARTIFACTS_MISMATCH");
    if (durableFactoryState.completedStages.join(",") !== "SPEC,SCAFFOLD,IMPLEMENT" || durableFactoryState.nextEligibleStages.join(",") !== "TEST") {
      throw new Error("DURABLE_FACTORY_STAGE_STATE_MISMATCH");
    }
    const result = await executeMiniAppFactoryStages({
      pipeline,
      service,
      run: scope,
      maxStages: 1,
      executeStage: async stageId => ({ artifacts: [`factory-evidence:${stageId.toLowerCase()}`] }),
    });
    if (result.executedStages.join(",") !== "TEST" || result.state !== "IMPLEMENTATION_SCOPE_COMPLETE") {
      throw new Error("CROSS_PROCESS_NEXT_STAGE_NOT_SELECTED");
    }
    const final = await service.get(scope);
    if (final.run.workUnit?.progress.completedScope.join(",") !== "SPEC,SCAFFOLD,IMPLEMENT,TEST") {
      throw new Error("CROSS_PROCESS_FINAL_STATE_MISMATCH");
    }
    const finalFactoryState = parseMiniAppFactoryDurableState(final.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
    if (finalFactoryState.completedStages.join(",") !== "SPEC,SCAFFOLD,IMPLEMENT,TEST" || finalFactoryState.nextEligibleStages.length !== 0) {
      throw new Error("CROSS_PROCESS_FACTORY_STATE_NOT_COMPLETED");
    }
    console.log(JSON.stringify({ process: "resume", runId, restoredRevision: restored.revision, continued: result.executedStages, finalState: result.state, programId: finalFactoryState.programId, miniAppId: finalFactoryState.miniAppId }));
  } else {
    throw new Error("MODE_MUST_BE_START_OR_RESUME");
  }
} finally {
  await closeDb();
}
