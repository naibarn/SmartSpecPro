import type { DevelopmentWorkUnit } from "./developmentLifecycleContracts";

export type MiniAppFactoryStage = {
  id: string;
  dependsOn: string[];
  inputs?: string[];
  outputs?: string[];
  gate?: string;
};

export type MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1";
  pipelineId: string;
  stages: MiniAppFactoryStage[];
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
}

/**
 * Selects dependency-ready scopes from the durable DevelopmentWorkUnit. The
 * DevelopmentRun remains the persistence and scheduling authority; this helper
 * only evaluates its persisted completed/remaining/blocked scope projection.
 */
export function selectReadyMiniAppFactoryStages(
  pipeline: MiniAppFactoryPipeline,
  workUnit: DevelopmentWorkUnit,
): string[] {
  validateMiniAppFactoryPipeline(pipeline);
  const stageIds = new Set(pipeline.stages.map(({ id }) => id));
  const completed = new Set(workUnit.progress.completedScope.filter((scope) => stageIds.has(scope)));
  const remaining = new Set(workUnit.progress.remainingScope.filter((scope) => stageIds.has(scope)));
  const blocked = new Set(workUnit.dependencies
    .filter((dependency) => dependency.state === "UNSATISFIED")
    .flatMap((dependency) => dependency.blockedScope));

  return pipeline.stages
    .filter((stage) => remaining.has(stage.id) && !blocked.has(stage.id))
    .filter((stage) => stage.dependsOn.every((dependency) => completed.has(dependency)))
    .map(({ id }) => id);
}
