export interface AgentExperienceFeatureFlags {
  agentExperienceLayer?: boolean;
  agentExperienceShadowMode?: boolean;
  agentExperienceAgencyPreview?: boolean;
  agentExperienceTeamPreview?: boolean;
  agentExperienceChatPreview?: boolean;
  agentExperienceRuntypeRenderer?: boolean;
  agentExperienceDebugInspector?: boolean;
  agentExperienceForceRollback?: boolean;
  agentExperienceWebsiteWidget?: boolean;
  agentExperiencePageActions?: boolean;
}

export type AgentExperiencePreviewSurface = "agency" | "team" | "chat";

export interface AgentExperienceFlagEvaluationInput {
  flags: AgentExperienceFeatureFlags;
  surface?: AgentExperiencePreviewSurface;
  dependencyGatePassed?: boolean;
  debugPermissionGranted?: boolean;
  redactionGatePassed?: boolean;
}

export interface AgentExperienceFlagEvaluation {
  layerEnabled: boolean;
  shadowModeEnabled: boolean;
  previewEnabled: boolean;
  externalRendererEnabled: boolean;
  debugInspectorEnabled: boolean;
  websiteWidgetEnabled: boolean;
  pageActionsEnabled: boolean;
  forceRollback: boolean;
  reason: "force_rollback" | "layer_disabled" | "enabled";
}

export function evaluateAgentExperienceFlags(
  input: AgentExperienceFlagEvaluationInput,
): AgentExperienceFlagEvaluation {
  const flags = input.flags;
  const forceRollback = flags.agentExperienceForceRollback === true;
  const layerEnabled = flags.agentExperienceLayer === true && !forceRollback;

  if (forceRollback) {
    return {
      layerEnabled: false,
      shadowModeEnabled: false,
      previewEnabled: false,
      externalRendererEnabled: false,
      debugInspectorEnabled: false,
      websiteWidgetEnabled: false,
      pageActionsEnabled: false,
      forceRollback: true,
      reason: "force_rollback",
    };
  }

  if (!layerEnabled) {
    return {
      layerEnabled: false,
      shadowModeEnabled: false,
      previewEnabled: false,
      externalRendererEnabled: false,
      debugInspectorEnabled: false,
      websiteWidgetEnabled: false,
      pageActionsEnabled: false,
      forceRollback: false,
      reason: "layer_disabled",
    };
  }

  const surfacePreview = input.surface === "agency"
    ? flags.agentExperienceAgencyPreview === true
    : input.surface === "team"
      ? flags.agentExperienceTeamPreview === true
      : input.surface === "chat"
        ? flags.agentExperienceChatPreview === true
        : false;

  return {
    layerEnabled,
    shadowModeEnabled: flags.agentExperienceShadowMode === true,
    previewEnabled: surfacePreview,
    externalRendererEnabled:
      flags.agentExperienceRuntypeRenderer === true && input.dependencyGatePassed === true,
    debugInspectorEnabled:
      flags.agentExperienceDebugInspector === true
      && input.debugPermissionGranted === true
      && input.redactionGatePassed === true,
    websiteWidgetEnabled: false,
    pageActionsEnabled: false,
    forceRollback: false,
    reason: "enabled",
  };
}
