import {
  HYBRID_EXECUTOR_REGISTRY_VERSION,
  hybridStageExecutorDefinitionSchema,
  type HybridStageExecutorDefinition,
  type HybridStageOwner,
  type HybridStageType,
} from "@shared/orchestration/hybridOrchestration";

const DEFINITIONS: HybridStageExecutorDefinition[] = [
  {
    executorId: "sdk:intake",
    stageType: "intake",
    owner: "workflow",
    sideEffectClass: "none",
    requiresApproval: false,
    registryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
  },
  {
    executorId: "sdk:explore",
    stageType: "explore",
    owner: "swarm",
    sideEffectClass: "none",
    requiresApproval: false,
    registryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
  },
  {
    executorId: "sdk:validate",
    stageType: "validate",
    owner: "workflow",
    sideEffectClass: "none",
    requiresApproval: false,
    registryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
  },
  {
    executorId: "sdk:repair",
    stageType: "repair",
    owner: "workflow",
    sideEffectClass: "none",
    requiresApproval: false,
    registryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
  },
  {
    executorId: "human:approval",
    stageType: "approval",
    owner: "human",
    sideEffectClass: "approval_required",
    requiresApproval: true,
    registryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
  },
  {
    executorId: "executor:commit",
    stageType: "commit",
    owner: "workflow",
    sideEffectClass: "mutating",
    requiresApproval: true,
    registryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
  },
  {
    executorId: "executor:commit",
    stageType: "commit",
    owner: "executor",
    sideEffectClass: "mutating",
    requiresApproval: true,
    registryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
  },
].map((definition) => hybridStageExecutorDefinitionSchema.parse(definition));

export function listHybridExecutorDefinitions(): HybridStageExecutorDefinition[] {
  return DEFINITIONS.map((definition) => ({ ...definition }));
}

export function getHybridExecutorDefinition(input: {
  stageType: HybridStageType;
  owner: HybridStageOwner;
}): HybridStageExecutorDefinition | null {
  return DEFINITIONS.find(
    (definition) =>
      definition.stageType === input.stageType && definition.owner === input.owner
  ) ?? null;
}

export function assertHybridExecutorDefinition(input: {
  stageType: HybridStageType;
  owner: HybridStageOwner;
}): HybridStageExecutorDefinition {
  const definition = getHybridExecutorDefinition(input);
  if (!definition) {
    throw new Error(
      `hybrid_executor_not_registered:${input.owner}:${input.stageType}`
    );
  }
  return definition;
}
