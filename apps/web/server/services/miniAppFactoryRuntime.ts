import { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } from "./spec224DevelopmentRunPersistence";
import { loadMiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { createMiniAppFactoryRunnerStage } from "./miniAppFactoryRunnerStageAdapter";
import type { MiniAppFactoryStageWorkerRuntime } from "./miniAppFactoryStageWorker";

/** Production composition uses the canonical pipeline and existing Runner control plane. */
export function createMiniAppFactoryStageWorkerRuntime(): MiniAppFactoryStageWorkerRuntime {
  const service = createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter);
  return {
    pipeline: loadMiniAppFactoryPipeline(),
    service,
    createRunnerStage: input => createMiniAppFactoryRunnerStage({
      ...input,
      service,
    }),
    // This callback is intentionally unusable in production. Stage code runs
    // only in an external_agent_task dispatched by the trusted Runner.
    executeStage: async () => {
      throw new Error("FACTORY_SYNTHETIC_EXECUTION_DISABLED");
    },
    allowSyntheticExecution: false,
  };
}
