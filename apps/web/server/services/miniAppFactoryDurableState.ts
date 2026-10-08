export const MINI_APP_FACTORY_STATE_KEY = "miniAppFactoryProgramState";

export type MiniAppFactoryDurableState = {
  schemaVersion: "mini-app-factory-program-state.v1";
  programId: string;
  miniAppId: string;
  currentStage: string | null;
  completedStages: string[];
  waitingStages: string[];
  artifacts: string[];
  sourceSha: string;
  packageDigest: string | null;
  migrationState: "NOT_STARTED" | "PENDING" | "APPLIED" | "FAILED";
  deploymentState: "NOT_STARTED" | "PREPARED" | "DEPLOYED" | "FAILED";
  retryState: { status: "READY" | "RETRY_SCHEDULED" | "EXHAUSTED"; attempt: number };
  blockerState: { status: "NONE" | "WAITING_EXTERNAL_RETRYABLE" | "BLOCKED_TRUE"; code: string | null };
  nextEligibleStages: string[];
};

function stageList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 128 && value.every(item =>
    typeof item === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(item)
  );
}

export function createMiniAppFactoryDurableState(input: {
  programId: string;
  miniAppId: string;
  sourceSha: string;
}): MiniAppFactoryDurableState {
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(input.programId)) throw new Error("FACTORY_PROGRAM_ID_INVALID");
  if (!/^app_[A-Za-z0-9_-]{1,120}$/.test(input.miniAppId)) throw new Error("FACTORY_MINI_APP_ID_INVALID");
  if (!/^[a-f0-9]{40}$/i.test(input.sourceSha)) throw new Error("FACTORY_SOURCE_SHA_INVALID");
  return {
    schemaVersion: "mini-app-factory-program-state.v1",
    programId: input.programId,
    miniAppId: input.miniAppId,
    currentStage: null,
    completedStages: [],
    waitingStages: [],
    artifacts: [],
    sourceSha: input.sourceSha.toLowerCase(),
    packageDigest: null,
    migrationState: "NOT_STARTED",
    deploymentState: "NOT_STARTED",
    retryState: { status: "READY", attempt: 0 },
    blockerState: { status: "NONE", code: null },
    nextEligibleStages: [],
  };
}

export function parseMiniAppFactoryDurableState(value: unknown): MiniAppFactoryDurableState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("FACTORY_DURABLE_STATE_INVALID");
  const state = value as Record<string, unknown>;
  if (
    state.schemaVersion !== "mini-app-factory-program-state.v1" ||
    typeof state.programId !== "string" || !/^[A-Za-z0-9_.:-]{1,160}$/.test(state.programId) ||
    typeof state.miniAppId !== "string" || !/^app_[A-Za-z0-9_-]{1,120}$/.test(state.miniAppId) ||
    !(state.currentStage === null || (typeof state.currentStage === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(state.currentStage))) ||
    !stageList(state.completedStages) || !stageList(state.waitingStages) || !stageList(state.artifacts) ||
    !/^[a-f0-9]{40}$/i.test(String(state.sourceSha)) ||
    !(state.packageDigest === null || (typeof state.packageDigest === "string" && /^spaas-package-v1:sha256:[a-f0-9]{64}$/.test(state.packageDigest))) ||
    !["NOT_STARTED", "PENDING", "APPLIED", "FAILED"].includes(String(state.migrationState)) ||
    !["NOT_STARTED", "PREPARED", "DEPLOYED", "FAILED"].includes(String(state.deploymentState)) ||
    !state.retryState || typeof state.retryState !== "object" ||
    !["READY", "RETRY_SCHEDULED", "EXHAUSTED"].includes(String((state.retryState as Record<string, unknown>).status)) ||
    !Number.isSafeInteger((state.retryState as Record<string, unknown>).attempt) || Number((state.retryState as Record<string, unknown>).attempt) < 0 ||
    !state.blockerState || typeof state.blockerState !== "object" ||
    !["NONE", "WAITING_EXTERNAL_RETRYABLE", "BLOCKED_TRUE"].includes(String((state.blockerState as Record<string, unknown>).status)) ||
    !((state.blockerState as Record<string, unknown>).code === null || typeof (state.blockerState as Record<string, unknown>).code === "string") ||
    !stageList(state.nextEligibleStages)
  ) throw new Error("FACTORY_DURABLE_STATE_INVALID");
  return structuredClone(state) as unknown as MiniAppFactoryDurableState;
}

export function advanceMiniAppFactoryDurableState(
  current: MiniAppFactoryDurableState,
  input: { stageId: string; artifacts: string[]; nextEligibleStages: string[] },
): MiniAppFactoryDurableState {
  const state = parseMiniAppFactoryDurableState(current);
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(input.stageId) || !stageList(input.artifacts) || !stageList(input.nextEligibleStages)) {
    throw new Error("FACTORY_STAGE_OUTPUT_INVALID");
  }
  const artifacts = [...new Set([...state.artifacts, ...input.artifacts])];
  const packageArtifact = artifacts.find(item => item.startsWith("package-digest:"));
  const packageDigest = packageArtifact?.slice("package-digest:".length) ?? state.packageDigest;
  const migrationState: MiniAppFactoryDurableState["migrationState"] = ["migrate", "data_migration", "MIGRATE"].includes(input.stageId) ? "APPLIED" : state.migrationState;
  const deploymentState: MiniAppFactoryDurableState["deploymentState"] = ["deploy", "DEPLOY", "deployment"].includes(input.stageId) ? "DEPLOYED" : state.deploymentState;
  return {
    ...state,
    currentStage: input.stageId,
    completedStages: [...new Set([...state.completedStages, input.stageId])],
    waitingStages: [],
    artifacts,
    packageDigest,
    migrationState,
    deploymentState,
    blockerState: { status: "NONE", code: null },
    nextEligibleStages: [...input.nextEligibleStages],
  };
}
