import type { DevelopmentWorkUnit } from "./developmentLifecycleContracts";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type MiniAppFactoryStage = {
  id: string;
  dependsOn: string[];
  inputs?: string[];
  outputs?: string[];
  gate?: string;
  profileDependsOn?: Partial<Record<MiniAppFactoryProfile, string[]>>;
};

export type MiniAppFactoryProfile = "PERSONAL_MINIAPP" | "PLATFORM_SELF_DEVELOPMENT";

/** Loads the canonical Factory pipeline contract used by the autonomous program. */
export function loadMiniAppFactoryPipeline(path = process.env.SMARTSPEC_MINI_APP_FACTORY_PIPELINE_PATH): MiniAppFactoryPipeline {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const filePath = path ?? resolve(repositoryRoot, "orchestra/programs/autonomous-mini-app-factory/factory-pipeline.v1.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("FACTORY_PIPELINE_SOURCE_UNAVAILABLE");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("FACTORY_PIPELINE_INVALID");
  const value = raw as Record<string, unknown>;
  const pipeline = {
    schemaVersion: value.schemaVersion,
    pipelineId: value.pipelineId,
    stages: value.stages,
    profiles: value.profiles,
  } as MiniAppFactoryPipeline;
  validateMiniAppFactoryPipeline(pipeline);
  return pipeline;
}

export type MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1";
  pipelineId: string;
  stages: MiniAppFactoryStage[];
  profiles?: Partial<Record<MiniAppFactoryProfile, { stages: string[]; trialReadyStage?: string }>>;
};

export type MiniAppFactoryStageState =
  | "READY"
  | "RUNNING"
  | "PASS"
  | "FAIL_RETRYABLE"
  | "WAITING_EXTERNAL_RETRYABLE"
  | "BLOCKED_TRUE"
  | "SKIPPED_NOT_APPLICABLE";

export function validateMiniAppFactoryPipeline(pipeline: MiniAppFactoryPipeline): void {
  if (!pipeline || pipeline.schemaVersion !== "mini-app-factory-pipeline.v1" || !pipeline.pipelineId || !Array.isArray(pipeline.stages)) {
    throw new Error("FACTORY_PIPELINE_INVALID");
  }
  const stages = new Map<string, MiniAppFactoryStage>();
  for (const stage of pipeline.stages) {
    if (!stage.id || stages.has(stage.id) || !Array.isArray(stage.dependsOn)) throw new Error("FACTORY_STAGE_INVALID");
    stages.set(stage.id, stage);
  }
  for (const stage of pipeline.stages) {
    for (const dependency of stage.dependsOn) {
      if (!stages.has(dependency)) throw new Error(`FACTORY_DEPENDENCY_MISSING:${stage.id}:${dependency}`);
    }
    for (const dependencies of Object.values(stage.profileDependsOn ?? {})) {
      for (const dependency of dependencies ?? []) {
        if (!stages.has(dependency)) throw new Error(`FACTORY_DEPENDENCY_MISSING:${stage.id}:${dependency}`);
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`FACTORY_PIPELINE_CYCLE:${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of stages.get(id)!.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const stage of pipeline.stages) visit(stage.id);
  for (const [profile, contract] of Object.entries(pipeline.profiles ?? {})) {
    if (!contract || !Array.isArray(contract.stages) || contract.stages.some(id => !stages.has(id))) {
      throw new Error(`FACTORY_PROFILE_INVALID:${profile}`);
    }
    if (contract.trialReadyStage && !contract.stages.includes(contract.trialReadyStage)) {
      throw new Error(`FACTORY_PROFILE_TRIAL_STAGE_INVALID:${profile}`);
    }
  }
}

export function getMiniAppFactoryProfileStages(
  pipeline: MiniAppFactoryPipeline,
  profile: MiniAppFactoryProfile = "PERSONAL_MINIAPP",
): MiniAppFactoryStage[] {
  validateMiniAppFactoryPipeline(pipeline);
  const ids = new Set(pipeline.profiles?.[profile]?.stages ?? pipeline.stages.map(({ id }) => id));
  return pipeline.stages.filter(({ id }) => ids.has(id));
}

/**
 * Selects dependency-ready scopes from the durable DevelopmentWorkUnit. The
 * DevelopmentRun remains the persistence and scheduling authority; this helper
 * only evaluates its persisted completed/remaining/blocked scope projection.
 */
export function selectReadyMiniAppFactoryStages(
  pipeline: MiniAppFactoryPipeline,
  workUnit: DevelopmentWorkUnit,
  profile: MiniAppFactoryProfile = "PERSONAL_MINIAPP",
): string[] {
  validateMiniAppFactoryPipeline(pipeline);
  const profileContract = pipeline.profiles?.[profile];
  const eligibleIds = new Set(profileContract?.stages ?? pipeline.stages.map(({ id }) => id));
  const selectedStages = pipeline.stages.filter(({ id }) => eligibleIds.has(id));
  const stageIds = new Set(selectedStages.map(({ id }) => id));
  const completed = new Set(workUnit.progress.completedScope.filter((scope) => stageIds.has(scope)));
  const remaining = new Set(workUnit.progress.remainingScope.filter((scope) => stageIds.has(scope)));
  const blocked = new Set(workUnit.dependencies
    .filter((dependency) => dependency.state === "UNSATISFIED")
    .flatMap((dependency) => dependency.blockedScope));

  return selectedStages
    .filter((stage) => remaining.has(stage.id) && !completed.has(stage.id) && !blocked.has(stage.id))
    .filter((stage) => (stage.profileDependsOn?.[profile] ?? stage.dependsOn).every((dependency) => completed.has(dependency)))
    .map(({ id }) => id);
}
