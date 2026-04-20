import {
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../../../shared/featureFlags";
import type {
  AgentRuntimeEngine,
  AgentRuntimeEntryPoint,
  AgentRuntimeMode,
  AgentRuntimeOriginSurface,
  AgentRuntimeSurface,
} from "../../../shared/agentRuntime/types";

export const OPENAI_AGENTS_RUNTIME_FLAG_KEYS = [
  "openAiAgentsRuntimeEnabled",
  "openAiAgentsRuntimeChatShadow",
  "openAiAgentsRuntimeTeamShadow",
  "openAiAgentsRuntimeChatActive",
  "openAiAgentsRuntimeTeamActive",
  "openAiAgentsRuntimeResponsesShadow",
  "openAiAgentsRuntimeResponsesActive",
  "openAiAgentsRuntimeSkillShadow",
  "openAiAgentsRuntimeSkillActive",
  "openAiAgentsRuntimeForceRollback",
] as const;

export type OpenAiAgentsRuntimeFlagKey =
  (typeof OPENAI_AGENTS_RUNTIME_FLAG_KEYS)[number];

export type OpenAiAgentsRuntimeFlagSnapshot = Pick<
  TenantFeatureFlags,
  OpenAiAgentsRuntimeFlagKey
>;

export interface AgentRuntimeSelection {
  engine: AgentRuntimeEngine;
  mode: AgentRuntimeMode;
  selectionReason: string;
  flagSnapshot: OpenAiAgentsRuntimeFlagSnapshot;
  frozenAtRecommendation: "request" | "run" | "already_frozen";
  rollbackReason: string | null;
  originSurface?: AgentRuntimeOriginSurface;
  entryPoint?: AgentRuntimeEntryPoint;
}

export interface AgentRuntimeSelectionInput {
  surface: AgentRuntimeSurface;
  originSurface?: AgentRuntimeOriginSurface;
  entryPoint?: AgentRuntimeEntryPoint;
  featureFlags?: Partial<OpenAiAgentsRuntimeFlagSnapshot> | null;
  frozenDecision?: AgentRuntimeSelection | null;
  roomOverride?: Partial<
    Pick<AgentRuntimeSelection, "engine" | "mode" | "selectionReason">
  > | null;
  requestedOperationMode?: AgentRuntimeMode | null;
}

export function getOpenAiAgentsRuntimeFlagSnapshot(
  featureFlags?: Partial<OpenAiAgentsRuntimeFlagSnapshot> | null
): OpenAiAgentsRuntimeFlagSnapshot {
  return {
    openAiAgentsRuntimeEnabled:
      featureFlags?.openAiAgentsRuntimeEnabled ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeEnabled,
    openAiAgentsRuntimeChatShadow:
      featureFlags?.openAiAgentsRuntimeChatShadow ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeChatShadow,
    openAiAgentsRuntimeTeamShadow:
      featureFlags?.openAiAgentsRuntimeTeamShadow ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeTeamShadow,
    openAiAgentsRuntimeChatActive:
      featureFlags?.openAiAgentsRuntimeChatActive ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeChatActive,
    openAiAgentsRuntimeTeamActive:
      featureFlags?.openAiAgentsRuntimeTeamActive ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeTeamActive,
    openAiAgentsRuntimeResponsesShadow:
      featureFlags?.openAiAgentsRuntimeResponsesShadow ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeResponsesShadow,
    openAiAgentsRuntimeResponsesActive:
      featureFlags?.openAiAgentsRuntimeResponsesActive ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeResponsesActive,
    openAiAgentsRuntimeSkillShadow:
      featureFlags?.openAiAgentsRuntimeSkillShadow ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeSkillShadow,
    openAiAgentsRuntimeSkillActive:
      featureFlags?.openAiAgentsRuntimeSkillActive ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeSkillActive,
    openAiAgentsRuntimeForceRollback:
      featureFlags?.openAiAgentsRuntimeForceRollback ??
      FEATURE_FLAG_DEFAULTS.openAiAgentsRuntimeForceRollback,
  };
}

function getModeFromFlags(
  surface: AgentRuntimeSurface,
  snapshot: OpenAiAgentsRuntimeFlagSnapshot
): AgentRuntimeMode {
  if (!snapshot.openAiAgentsRuntimeEnabled) return "legacy";

  if (surface === "chat") {
    if (snapshot.openAiAgentsRuntimeChatActive) return "active";
    if (snapshot.openAiAgentsRuntimeChatShadow) return "shadow";
    return "legacy";
  }

  if (surface === "team") {
    if (snapshot.openAiAgentsRuntimeTeamActive) return "active";
    if (snapshot.openAiAgentsRuntimeTeamShadow) return "shadow";
    return "legacy";
  }

  if (surface === "responses") {
    if (snapshot.openAiAgentsRuntimeResponsesActive) return "active";
    if (snapshot.openAiAgentsRuntimeResponsesShadow) return "shadow";
    return "legacy";
  }

  if (snapshot.openAiAgentsRuntimeSkillActive) return "active";
  if (snapshot.openAiAgentsRuntimeSkillShadow) return "shadow";
  return "legacy";
}

function buildSelection(
  mode: AgentRuntimeMode,
  selectionReason: string,
  snapshot: OpenAiAgentsRuntimeFlagSnapshot,
  input: AgentRuntimeSelectionInput,
  frozenAtRecommendation: AgentRuntimeSelection["frozenAtRecommendation"],
  rollbackReason: string | null = null
): AgentRuntimeSelection {
  return {
    engine: mode === "legacy" ? "legacy" : "openai_agents",
    mode,
    selectionReason,
    flagSnapshot: snapshot,
    frozenAtRecommendation,
    rollbackReason,
    originSurface: input.originSurface,
    entryPoint: input.entryPoint,
  };
}

export function selectAgentRuntime(
  input: AgentRuntimeSelectionInput
): AgentRuntimeSelection {
  const snapshot = getOpenAiAgentsRuntimeFlagSnapshot(input.featureFlags);
  const defaultMode = getModeFromFlags(input.surface, snapshot);

  if (input.frozenDecision) {
    return {
      ...input.frozenDecision,
      flagSnapshot: snapshot,
      frozenAtRecommendation: "already_frozen",
    };
  }

  if (snapshot.openAiAgentsRuntimeForceRollback) {
    return buildSelection(
      "legacy",
      "force_rollback_flag",
      snapshot,
      input,
      input.surface === "team" ? "run" : "request",
      "force_rollback_flag"
    );
  }

  if (input.roomOverride?.mode) {
    return buildSelection(
      input.roomOverride.mode,
      input.roomOverride.selectionReason ?? "room_override",
      snapshot,
      input,
      input.surface === "team" ? "run" : "request"
    );
  }

  const resolvedMode =
    input.requestedOperationMode && input.requestedOperationMode !== "legacy"
      ? defaultMode === input.requestedOperationMode
        ? input.requestedOperationMode
        : defaultMode
      : defaultMode;

  return buildSelection(
    resolvedMode,
    resolvedMode === "legacy"
      ? "tenant_flags_disabled"
      : `tenant_flags_${resolvedMode}`,
    snapshot,
    input,
    input.surface === "team" ? "run" : "request"
  );
}
