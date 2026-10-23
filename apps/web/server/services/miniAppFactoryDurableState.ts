export const MINI_APP_FACTORY_STATE_KEY = "miniAppFactoryProgramState";

export type MiniAppFactoryDurableState = {
  schemaVersion: "mini-app-factory-program-state.v1";
  programId: string;
  miniAppId: string;
  profile: "PERSONAL_MINIAPP" | "PLATFORM_SELF_DEVELOPMENT";
  deliveryMilestone: "BUILDING" | "PREVIEW_AVAILABLE" | "USER_TRIAL_READY" | "VERIFICATION_PENDING" | "BUILD_FAILED" | "USER_FEEDBACK_REQUIRED" | "USER_ACCEPTED" | "RELEASE_VERIFIED" | "PLATFORM_CERTIFIED";
  currentStage: string | null;
  completedStages: string[];
  waitingStages: string[];
  artifacts: string[];
  appSourceDigest: string | null;
  repository: { mode: "SMARTAIHUB_MANAGED" | "USER_OWNED"; owner: string; name: string; url: string; revision: string } | null;
  sourceSha: string | null;
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

function artifactList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 256 && value.every(item =>
    typeof item === "string" && /^[A-Za-z0-9_./:@#-]{1,1024}$/.test(item)
  );
}

export function createMiniAppFactoryDurableState(input: {
  programId: string;
  miniAppId: string;
  sourceSha?: string;
  profile?: MiniAppFactoryDurableState["profile"];
  initialArtifacts?: string[];
  repository?: MiniAppFactoryDurableState["repository"];
}): MiniAppFactoryDurableState {
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(input.programId)) throw new Error("FACTORY_PROGRAM_ID_INVALID");
  if (!/^app_[A-Za-z0-9_-]{1,120}$/.test(input.miniAppId)) throw new Error("FACTORY_MINI_APP_ID_INVALID");
  const profile = input.profile ?? "PERSONAL_MINIAPP";
  if (input.sourceSha !== undefined && !/^[a-f0-9]{40}$/i.test(input.sourceSha)) throw new Error("FACTORY_SOURCE_SHA_INVALID");
  if (profile === "PLATFORM_SELF_DEVELOPMENT" && !input.sourceSha) throw new Error("FACTORY_SOURCE_SHA_REQUIRED");
  const initialArtifacts = input.initialArtifacts ?? [];
  if (!artifactList(initialArtifacts)) throw new Error("FACTORY_INITIAL_ARTIFACTS_INVALID");
  const sourceDigest = initialArtifacts.find(item => item.startsWith("app-source-digest:"))?.slice("app-source-digest:".length);
  return {
    schemaVersion: "mini-app-factory-program-state.v1",
    programId: input.programId,
    miniAppId: input.miniAppId,
    profile,
    deliveryMilestone: "BUILDING",
    currentStage: null,
    completedStages: [],
    waitingStages: [],
    artifacts: [...new Set(initialArtifacts)],
    appSourceDigest: sourceDigest && /^[a-f0-9]{64}$/.test(sourceDigest) ? sourceDigest : null,
    repository: input.repository ?? null,
    sourceSha: profile === "PLATFORM_SELF_DEVELOPMENT" ? input.sourceSha!.toLowerCase() : null,
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
    !(state.profile === undefined || ["PERSONAL_MINIAPP", "PLATFORM_SELF_DEVELOPMENT"].includes(String(state.profile))) ||
    !(state.deliveryMilestone === undefined || ["BUILDING", "PREVIEW_AVAILABLE", "USER_TRIAL_READY", "VERIFICATION_PENDING", "BUILD_FAILED", "USER_FEEDBACK_REQUIRED", "USER_ACCEPTED", "RELEASE_VERIFIED", "PLATFORM_CERTIFIED"].includes(String(state.deliveryMilestone))) ||
    !(state.currentStage === null || (typeof state.currentStage === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(state.currentStage))) ||
    !stageList(state.completedStages) || !stageList(state.waitingStages) || !artifactList(state.artifacts) ||
    !(state.appSourceDigest === undefined || state.appSourceDigest === null || (typeof state.appSourceDigest === "string" && /^[a-f0-9]{64}$/.test(state.appSourceDigest))) ||
    !(state.repository === undefined || state.repository === null || (state.repository && typeof state.repository === "object" &&
      ["SMARTAIHUB_MANAGED", "USER_OWNED"].includes(String((state.repository as Record<string, unknown>).mode)) &&
      typeof (state.repository as Record<string, unknown>).owner === "string" &&
      typeof (state.repository as Record<string, unknown>).name === "string" &&
      typeof (state.repository as Record<string, unknown>).url === "string" &&
      typeof (state.repository as Record<string, unknown>).revision === "string")) ||
    !(state.sourceSha === null || /^[a-f0-9]{40}$/i.test(String(state.sourceSha))) ||
    (state.profile === "PLATFORM_SELF_DEVELOPMENT" && !/^[a-f0-9]{40}$/i.test(String(state.sourceSha))) ||
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
  return {
    ...structuredClone(state),
    profile: state.profile ?? "PERSONAL_MINIAPP",
    deliveryMilestone: state.deliveryMilestone ?? "BUILDING",
    appSourceDigest: state.appSourceDigest ?? null,
    repository: (state.repository as MiniAppFactoryDurableState["repository"] | undefined) ?? null,
    sourceSha: state.profile === "PLATFORM_SELF_DEVELOPMENT" ? String(state.sourceSha).toLowerCase() : null,
  } as unknown as MiniAppFactoryDurableState;
}

export function advanceMiniAppFactoryDurableState(
  current: MiniAppFactoryDurableState,
  input: { stageId: string; artifacts: string[]; nextEligibleStages: string[]; deliveryMilestone?: MiniAppFactoryDurableState["deliveryMilestone"] },
): MiniAppFactoryDurableState {
  const state = parseMiniAppFactoryDurableState(current);
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(input.stageId) || !artifactList(input.artifacts) || !stageList(input.nextEligibleStages)) {
    throw new Error("FACTORY_STAGE_OUTPUT_INVALID");
  }
  const artifacts = [...new Set([...state.artifacts, ...input.artifacts])];
  const packageArtifact = artifacts.find(item => item.startsWith("package-digest:"));
  const sourceDigestArtifact = [...input.artifacts].reverse().find(item => item.startsWith("app-source-digest:"))
    ?? [...artifacts].reverse().find(item => item.startsWith("app-source-digest:"));
  const sourceDigest = sourceDigestArtifact?.slice("app-source-digest:".length) ?? state.appSourceDigest;
  const repositoryArtifact = [...input.artifacts].reverse().find(item => /^app-repository:(?:managed|user):/.test(item))
    ?? [...artifacts].reverse().find(item => /^app-repository:(?:managed|user):/.test(item));
  const repositoryMatch = repositoryArtifact && /^app-repository:(managed|user):([A-Za-z0-9-]{1,39})\/([a-z0-9-]{1,100})@([a-f0-9]{40})$/i.exec(repositoryArtifact);
  const repository = repositoryMatch ? {
    mode: repositoryMatch[1] === "user" ? "USER_OWNED" as const : "SMARTAIHUB_MANAGED" as const,
    owner: repositoryMatch[2]!,
    name: repositoryMatch[3]!,
    url: `https://github.com/${repositoryMatch[2]}/${repositoryMatch[3]}`,
    revision: repositoryMatch[4]!.toLowerCase(),
  } : state.repository;
  const packageDigest = packageArtifact?.slice("package-digest:".length) ?? state.packageDigest;
  const migrationState: MiniAppFactoryDurableState["migrationState"] = ["migrate", "data_migration", "MIGRATE"].includes(input.stageId) ? "APPLIED" : state.migrationState;
  const deploymentState: MiniAppFactoryDurableState["deploymentState"] = ["deploy", "DEPLOY", "deployment"].includes(input.stageId) ? "DEPLOYED" : state.deploymentState;
  return {
    ...state,
    currentStage: input.stageId,
    deliveryMilestone: input.deliveryMilestone ?? (
      input.stageId === "deploy" && state.profile === "PERSONAL_MINIAPP" ? "PREVIEW_AVAILABLE" :
      input.stageId === "smoke" && state.profile === "PERSONAL_MINIAPP" ? "VERIFICATION_PENDING" :
      state.deliveryMilestone
    ),
    completedStages: [...new Set([...state.completedStages, input.stageId])],
    waitingStages: [],
    artifacts,
    appSourceDigest: sourceDigest,
    repository,
    packageDigest,
    migrationState,
    deploymentState,
    blockerState: { status: "NONE", code: null },
    nextEligibleStages: [...input.nextEligibleStages],
  };
}

export function failMiniAppFactoryDurableState(
  current: MiniAppFactoryDurableState,
  code: string,
): MiniAppFactoryDurableState {
  const state = parseMiniAppFactoryDurableState(current);
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(code)) throw new Error("FACTORY_FAILURE_CODE_INVALID");
  return {
    ...state,
    deliveryMilestone: state.profile === "PERSONAL_MINIAPP" && state.deliveryMilestone !== "PREVIEW_AVAILABLE" && state.deliveryMilestone !== "VERIFICATION_PENDING" && state.deliveryMilestone !== "USER_TRIAL_READY"
      ? "BUILD_FAILED"
      : state.deliveryMilestone,
    blockerState: { status: "NONE", code },
  };
}
