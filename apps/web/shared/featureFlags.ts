/**
 * Tenant-scoped feature flags for gating Claw features.
 *
 * Stored in tenants.featureFlags (JSON column).
 * Most flags default to true — features are enabled by default unless
 * explicitly gated off for rollout or safety.
 */
export interface TenantFeatureFlags {
  multiChannel: boolean; // F01 — Multi-channel adapters
  chatWidget: boolean; // F02 — Embeddable chat widget
  browserTool: boolean; // F03 — Browser automation tool
  canvas: boolean; // F04 — Canvas / AI artifacts
  voiceChat: boolean; // F05 — Voice chat mode
  webhookTriggers: boolean; // F06 — Inbound webhook triggers
  costDisplay: boolean; // F07 — Per-response cost display
  personaSystem: boolean; // F08 — AI persona system
  crossAgency: boolean; // F09 — Cross-agency communication
  channelRouter: boolean; // F10 — Channel routing rules
  automationCopilot: boolean; // F11 — Automation Copilot (LLM-driven browser tasks)
  liveBrowser: boolean; // F12 — Live Browser workspace and gateway
  responsesApi: boolean; // F13 — Responses API gateway (OpenAI-compatible)
  taskPlannerEnabled: boolean; // F14 — Task Planner (active model selection via task execution planner)
  taskPlannerAgencyEscalation: boolean; // F15 — Agency escalation via planner
  chatBrowserSessionEntry: boolean; // F16 — Chat Browser Session entrypoints and reopen flows
  agencyBrowserSessionUi: boolean; // F17 — Agency Builder and Agency Chat Browser Session UI
  workflowBrowserSessionNodes: boolean; // F18 — Workflow collaborative Browser Session nodes
  publicApi: boolean; // F19 — Public API & External Agent Gateway
  multimodalMemory: boolean; // F20 — Multimodal chat memory (image analysis, embedding, retrieval)
  skillOrchestrator: boolean; // F21 — Hybrid Skill Orchestrator (multi-skill routing)
  orchestratorEnabled: boolean; // F22 — Virtual AI Office Orchestrator (team rooms, runs, scoped memory)
  notificationDedupEnabled: boolean; // F23 — Notification deduplication with grouping
  notificationPreferencesEnabled: boolean; // F24 — Per-category notification preferences
  notificationEscalationEnabled: boolean; // F25 — Escalation policies for critical notifications
  notificationUnifiedCenter: boolean; // F26 — Unified notification center admin dashboard
  notificationEmailDelivery: boolean; // F27 — Email delivery channel for notifications
  notificationWebhookDelivery: boolean; // F28 — Webhook delivery channel for notifications
  unifiedSkillExecution: boolean; // F29 — Unified skill execution pipeline (routes chat + team room through single orchestrator)
  agencyCustomTools: boolean; // F30 — Agency custom tool creation & OpenAPI import
  agencyGuardrails: boolean; // F31 — Agency guardrail system
  agencyStreaming: boolean; // F32 — Agency SSE streaming
  agencyMcpBridge: boolean; // F33 — Agency MCP bridge integration
  agencyToolApi: boolean; // F34 — Agency standalone tool API
  agencyAgenticModeEnabled: boolean; // F35 — Agency agentic execution mode (Level 1)
  agencyReactExecutorEnabled: boolean; // F36 — Agency ReAct executor (Level 2)
  agencyAutonomousAgentEnabled: boolean; // F37 — Agency autonomous agent (Level 3)
  agencyLongTermMemoryEnabled: boolean; // F38 — Agency long-term memory (Level 3)
  META_CHANNELS_ENABLED: boolean; // F39 — Meta Channels feature set
  mcpServerRegistry: boolean; // F40 — MCP Server Registry (centralized management)
  mcpStdio: boolean; // F41 — MCP stdio transport (subprocess-based servers)
  mcpOAuth: boolean; // F42 — MCP OAuth 2.1 authentication
  UPLOAD_POST_GATEWAY_ENABLED: boolean; // F43 — Upload-Post Universal Gateway
  chatAutoModelSelection: boolean; // F44 — Chat Auto/Provider-Auto model selection
  localClientLlmMode: boolean; // F45 — Local / Client LLM mode
  openClawExternalRuntime: boolean; // F46 — OpenClaw external worker runtime control plane
  desktopZeroClawWorker: boolean; // F47 — Desktop + ZeroClaw managed worker runtime
  nemoClawSecureWorkerPool: boolean; // F48 — NemoClaw secure worker pools
  hiClawClusterRuntime: boolean; // F49 — HiClaw collaborative cluster runtime
  hermesAgentRuntime: boolean; // F50 — Hermes bridge-backed external runtime foundation
  desktopHostEnabled: boolean; // F51 — Unified Desktop Host control plane
  desktopAdvancedLocalMode: boolean; // F52 — Step-up desktop local power
  desktopPackageSync: boolean; // F53 — Signed desktop package sync and materialization
  desktopAgencyRuntime: boolean; // F54 — Desktop Agency Swarm runtime enablement
  desktopWorkerProjection: boolean; // F55 — Desktop Host projection into worker fabric
  agencyHybridAdk: boolean; // F56 — Hybrid Agency Runtime with Google ADK compile/runtime surfaces
  agencyHybridAdkKillSwitch: boolean; // F57 — Operational kill switch for Agency Hybrid ADK paths
  workpacksEnabled: boolean; // F58 — Autonomous workpack intake, lifecycle, and control-plane surfaces
  workpackAutonomousPilot: boolean; // F59 — Tenant rollout gate for autonomous workpack execution
  workpackOpsConsole: boolean; // F60 — Admin monitoring and readiness controls for workpacks
  documentOcrExternalProcessing: boolean; // F61 — Allow outbound document OCR processing (ADE / gateway)
  hermesProfileExperience: boolean; // F62 — Hermes persona/profile summaries in teams and admin views
  hermesChannelWorkflowExpansion: boolean; // F63 — Hermes channel companion workflow surfaces
  hermesMemoryContextSync: boolean; // F64 — Hermes opt-in memory/context sync surfaces
  hermesTaskModes: boolean; // F65 — Hermes task mode summaries and work-mode mapping
  hermesVisibilitySummaries: boolean; // F66 — Hermes progress and observability summaries
  agentRegistryEnabled: boolean; // F67 — Governed agent registry surface and rollout gates
  openAiAgentsRuntimeEnabled: boolean; // F68 — Shared OpenAI Agents SDK runtime master gate
  openAiAgentsRuntimeChatShadow: boolean; // F69 — Chat shadow runtime via OpenAI Agents adapter
  openAiAgentsRuntimeTeamShadow: boolean; // F70 — Team shadow runtime via OpenAI Agents adapter
  openAiAgentsRuntimeChatActive: boolean; // F71 — Chat active runtime via OpenAI Agents adapter
  openAiAgentsRuntimeTeamActive: boolean; // F72 — Team active runtime via OpenAI Agents adapter
  openAiAgentsRuntimeResponsesShadow: boolean; // F73 — Responses shadow runtime via OpenAI Agents adapter
  openAiAgentsRuntimeResponsesActive: boolean; // F74 — Responses active runtime via OpenAI Agents adapter
  openAiAgentsRuntimeSkillShadow: boolean; // F75 — Shared skill shadow runtime via OpenAI Agents adapter
  openAiAgentsRuntimeSkillActive: boolean; // F76 — Shared skill active runtime via OpenAI Agents adapter
  openAiAgentsRuntimeForceRollback: boolean; // F77 — Force new runtime selections back to legacy
  voiceAgents: boolean; // F78 — ElevenLabs ElevenAgents Chat runtime and admin surface
  geminiOmniSuiteEnabled: boolean; // F79 — Gemini Omni suite UX and validation
  geminiOmniAssetCreationEnabled: boolean; // F80 — Gemini Omni Character/Audio provider asset creation
  geminiOmniPromptQaEnabled: boolean; // F81 — Gemini Omni pre-generation prompt QA
  geminiOmniVideoQaEnabled: boolean; // F82 — Gemini Omni post-generation video QA
  geminiOmniAutoLearningEnabled: boolean; // F83 — Gemini Omni QA learning recommendations
  mediaProductionDirectorEnabled: boolean; // F84 — Media Studio Production/Director command center
  mediaProductionGoalCanvasEnabled: boolean; // F85 — Visual ProductionGoal planning canvas
  mediaProductionStoryboardPlannerEnabled: boolean; // F86 — Production Storyboard Planner skill gate
  mediaProductionPlanVerifierEnabled: boolean; // F87 — Production Plan Verifier skill gate
  mediaProductionDualOutputEnabled: boolean; // F88 — Storyboard Review and Video Edit output projections
  mediaProductionAgencyReviewersEnabled: boolean; // F89 — Optional Agency reviewer packs
  mediaProductionLangGraphBatchEnabled: boolean; // F90 — Optional LangGraph checkpointed batch runtime
  marketplaceHyperframesEnabled: boolean; // F91 — Marketplace Capture Auto Storyboard Review HyperFrames adapter
  marketplaceHyperframesWorkerEnabled: boolean; // F92 — Tenant-scoped HyperFrames worker queueing
  marketplaceHyperframesLibrarySaveEnabled: boolean; // F93 — Save completed HyperFrames renders to Library
  marketplaceHyperframesOperatorEnabled: boolean; // F94 — Delegated HyperFrames operator controls
  mcpConnectEnabled: boolean; // F95 — MCP Connect master rollout gate
  mcpConnectMagnificEnabled: boolean; // F96 — Magnific MCP provider rollout gate
  mcpConnectHiggsfieldEnabled: boolean; // F97 — Higgsfield MCP provider rollout gate
  mcpConnectGroupSharingEnabled: boolean; // F98 — MCP Connect group sharing rollout gate
  mcpMediaStudioEnabled: boolean; // F99 — Media Studio MCP transport surface gate
  mcpAutoStoryboardReviewEnabled: boolean; // F100 — Auto Storyboard Review MCP transport surface gate
  mcpMarketplaceCaptureEnabled: boolean; // F101 — Marketplace Capture MCP transport surface gate
  mcpStoryboardReviewEnabled: boolean; // F102 — Storyboard Review MCP transport surface gate
  mcpMediaImageEnabled: boolean; // F103 — MCP image generation asset gate
  mcpMediaVideoEnabled: boolean; // F104 — MCP video generation asset gate
  mcpToolSchemaCacheEnabled: boolean; // F105 — MCP tools/list schema cache gate
  mcpAutoFallbackToGatewayApiEnabled: boolean; // F106 — Explicit MCP to Gateway API fallback gate
  mcpProviderCreditsTrackedEnabled: boolean; // F107 — MCP provider-credit usage tracking gate
  videoSegmentPlannerShadow: boolean; // F108 — Video segment planner shadow metadata
  videoSegmentPlannerPerShot: boolean; // F109 — Per-shot segment planner handoff
  videoSegmentPlannerPreview: boolean; // F110 — Backend video segment preview summaries
  videoSegmentPlannerMultiShotBeta: boolean; // F111 — Tenant/model gated multi-shot video segments
  agentExperienceLayer: boolean; // F112 — Agent Experience canonical protocol and adapter layer
  agentExperienceShadowMode: boolean; // F113 — Observe Agent Experience adapters without visible UI changes
  agentExperienceAgencyPreview: boolean; // F114 — Fixture/live-gated Agency Agent Experience preview
  agentExperienceTeamPreview: boolean; // F115 — Fixture/live-gated Team Agent Experience preview
  agentExperienceChatPreview: boolean; // F116 — Fixture/live-gated Chat Agent Experience preview
  agentExperienceRuntypeRenderer: boolean; // F117 — Optional Runtype renderer bridge after dependency gate
  agentExperienceDebugInspector: boolean; // F118 — Permission-gated Agent Experience debug inspector
  agentExperienceForceRollback: boolean; // F119 — Force-disable all Agent Experience behavior
  agentExperienceWebsiteWidget: boolean; // F120 — Future customer website widget gate
  agentExperiencePageActions: boolean; // F121 — Future customer page action tools gate
}

export type TenantFeatureFlagKey = keyof TenantFeatureFlags;

/**
 * Server-side allowlist of valid feature flag keys.
 * Used for validation — any keys not in this set are stripped before saving.
 */
export const ALLOWED_FEATURE_FLAGS: ReadonlySet<string> = new Set<TenantFeatureFlagKey>([
  "multiChannel",
  "chatWidget",
  "browserTool",
  "canvas",
  "voiceChat",
  "webhookTriggers",
  "costDisplay",
  "personaSystem",
  "crossAgency",
  "channelRouter",
  "automationCopilot",
  "liveBrowser",
  "responsesApi",
  "taskPlannerEnabled",
  "taskPlannerAgencyEscalation",
  "chatBrowserSessionEntry",
  "agencyBrowserSessionUi",
  "workflowBrowserSessionNodes",
  "publicApi",
  "multimodalMemory",
  "skillOrchestrator",
  "orchestratorEnabled",
  "notificationDedupEnabled",
  "notificationPreferencesEnabled",
  "notificationEscalationEnabled",
  "notificationUnifiedCenter",
  "notificationEmailDelivery",
  "notificationWebhookDelivery",
  "unifiedSkillExecution",
  "agencyCustomTools",
  "agencyGuardrails",
  "agencyStreaming",
  "agencyMcpBridge",
  "agencyToolApi",
  "agencyAgenticModeEnabled",
  "agencyReactExecutorEnabled",
  "agencyAutonomousAgentEnabled",
  "agencyLongTermMemoryEnabled",
  "META_CHANNELS_ENABLED",
  "mcpServerRegistry",
  "mcpStdio",
  "mcpOAuth",
  "UPLOAD_POST_GATEWAY_ENABLED",
  "chatAutoModelSelection",
  "localClientLlmMode",
  "openClawExternalRuntime",
  "desktopZeroClawWorker",
  "nemoClawSecureWorkerPool",
  "hiClawClusterRuntime",
  "hermesAgentRuntime",
  "desktopHostEnabled",
  "desktopAdvancedLocalMode",
  "desktopPackageSync",
  "desktopAgencyRuntime",
  "desktopWorkerProjection",
  "agencyHybridAdk",
  "agencyHybridAdkKillSwitch",
  "workpacksEnabled",
  "workpackAutonomousPilot",
  "workpackOpsConsole",
  "documentOcrExternalProcessing",
  "hermesProfileExperience",
  "hermesChannelWorkflowExpansion",
  "hermesMemoryContextSync",
  "hermesTaskModes",
  "hermesVisibilitySummaries",
  "agentRegistryEnabled",
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
  "voiceAgents",
  "geminiOmniSuiteEnabled",
  "geminiOmniAssetCreationEnabled",
  "geminiOmniPromptQaEnabled",
  "geminiOmniVideoQaEnabled",
  "geminiOmniAutoLearningEnabled",
  "mediaProductionDirectorEnabled",
  "mediaProductionGoalCanvasEnabled",
  "mediaProductionStoryboardPlannerEnabled",
  "mediaProductionPlanVerifierEnabled",
  "mediaProductionDualOutputEnabled",
  "mediaProductionAgencyReviewersEnabled",
  "mediaProductionLangGraphBatchEnabled",
  "marketplaceHyperframesEnabled",
  "marketplaceHyperframesWorkerEnabled",
  "marketplaceHyperframesLibrarySaveEnabled",
  "marketplaceHyperframesOperatorEnabled",
  "mcpConnectEnabled",
  "mcpConnectMagnificEnabled",
  "mcpConnectHiggsfieldEnabled",
  "mcpConnectGroupSharingEnabled",
  "mcpMediaStudioEnabled",
  "mcpAutoStoryboardReviewEnabled",
  "mcpMarketplaceCaptureEnabled",
  "mcpStoryboardReviewEnabled",
  "mcpMediaImageEnabled",
  "mcpMediaVideoEnabled",
  "mcpToolSchemaCacheEnabled",
  "mcpAutoFallbackToGatewayApiEnabled",
  "mcpProviderCreditsTrackedEnabled",
  "videoSegmentPlannerShadow",
  "videoSegmentPlannerPerShot",
  "videoSegmentPlannerPreview",
  "videoSegmentPlannerMultiShotBeta",
  "agentExperienceLayer",
  "agentExperienceShadowMode",
  "agentExperienceAgencyPreview",
  "agentExperienceTeamPreview",
  "agentExperienceChatPreview",
  "agentExperienceRuntypeRenderer",
  "agentExperienceDebugInspector",
  "agentExperienceForceRollback",
  "agentExperienceWebsiteWidget",
  "agentExperiencePageActions",
]);

/**
 * Default values for each feature flag.
 * Most flags default to true, but rollout- or infrastructure-sensitive
 * capabilities can stay false until explicitly enabled per tenant.
 */
export const FEATURE_FLAG_DEFAULTS: Readonly<TenantFeatureFlags> = {
  multiChannel: true,
  chatWidget: true,
  browserTool: true,
  canvas: true,
  voiceChat: true,
  webhookTriggers: true,
  costDisplay: true,
  personaSystem: true,
  crossAgency: true,
  channelRouter: true,
  automationCopilot: true,
  liveBrowser: true,
  responsesApi: true,
  taskPlannerEnabled: true,
  taskPlannerAgencyEscalation: true,
  chatBrowserSessionEntry: true,
  agencyBrowserSessionUi: true,
  workflowBrowserSessionNodes: true,
  publicApi: true,
  multimodalMemory: true,
  skillOrchestrator: true,
  orchestratorEnabled: true,
  notificationDedupEnabled: true,
  notificationPreferencesEnabled: true,
  notificationEscalationEnabled: true,
  notificationUnifiedCenter: true,
  notificationEmailDelivery: true,
  notificationWebhookDelivery: true,
  unifiedSkillExecution: true,
  agencyCustomTools: true,
  agencyGuardrails: true,
  agencyStreaming: true,
  agencyMcpBridge: true,
  agencyToolApi: true,
  agencyAgenticModeEnabled: true,
  agencyReactExecutorEnabled: true,
  agencyAutonomousAgentEnabled: true,
  agencyLongTermMemoryEnabled: true,
  META_CHANNELS_ENABLED: true,
  mcpServerRegistry: true,
  mcpStdio: false,  // Requires OpenSandbox — keep disabled by default
  mcpOAuth: false,  // Requires Express callback route — keep disabled until wired
  UPLOAD_POST_GATEWAY_ENABLED: false, // Requires Upload-Post connection + consent flow
  chatAutoModelSelection: true, // Enabled by default; admin can still disable per tenant if needed
  localClientLlmMode: false, // Rollout-gated until local runtime paths are explicitly enabled per tenant
  openClawExternalRuntime: false, // External worker control plane ships disabled until tenant enablement
  desktopZeroClawWorker: false, // Desktop worker host remains tenant-gated until runtime/profile support is ready
  nemoClawSecureWorkerPool: false, // Secure sandbox pools are explicitly admin-gated
  hiClawClusterRuntime: false, // Collaborative cluster runtime is explicitly admin-gated
  hermesAgentRuntime: false, // Hermes bridge-backed runtime stays disabled until rollout and policy surfaces are ready
  desktopHostEnabled: false, // Desktop Host control plane rollout is explicit and fail-closed
  desktopAdvancedLocalMode: false, // High-power local mode requires explicit tenant opt-in
  desktopPackageSync: false, // Signed package sync stays disabled until registry/policy is ready
  desktopAgencyRuntime: false, // Desktop agency runtime stays disabled until gateway enforcement lands
  desktopWorkerProjection: false, // Desktop Host only joins worker fabric when explicitly enabled
  agencyHybridAdk: false, // Hybrid Agency Runtime is explicit opt-in while ADK integration remains rollout-gated
  agencyHybridAdkKillSwitch: false, // Kill switch defaults open but stays available for incident response
  workpacksEnabled: true, // Workpack authoring ships on by default for first-party tenants
  workpackAutonomousPilot: false, // Autonomous execution remains rollout-gated until readiness evidence exists
  workpackOpsConsole: true, // Admin monitoring surfaces can render workpack readiness immediately
  documentOcrExternalProcessing: false, // External document OCR stays tenant-gated by default
  hermesProfileExperience: false, // Hermes persona/profile summaries stay rollout-gated until tenant admins opt in
  hermesChannelWorkflowExpansion: false, // Hermes channel workflow expansion stays off until revoke/reauthorize behavior is ready
  hermesMemoryContextSync: false, // Hermes memory/context sync stays off until approval and quarantine semantics are ready
  hermesTaskModes: false, // Hermes task mode summaries stay rollout-gated until operator surfaces are ready
  hermesVisibilitySummaries: false, // Hermes visibility summaries stay admin-gated until rollout evidence exists
  agentRegistryEnabled: false, // Governed registry rollout remains tenant opt-in until staged adoption is ready
  openAiAgentsRuntimeEnabled: false, // Shared OpenAI Agents SDK runtime stays disabled until replay and rollout gates pass
  openAiAgentsRuntimeChatShadow: false, // Chat shadow stays off until adapter and comparison traces are ready
  openAiAgentsRuntimeTeamShadow: false, // Team shadow stays off until plan/ledger parity is verified
  openAiAgentsRuntimeChatActive: false, // Chat active stays off until shadow parity is proven
  openAiAgentsRuntimeTeamActive: false, // Team active stays off until plan execution and review loops are verified
  openAiAgentsRuntimeResponsesShadow: false, // Responses shadow stays off until schema parity is verified
  openAiAgentsRuntimeResponsesActive: false, // Responses active stays off until structured-call parity is verified
  openAiAgentsRuntimeSkillShadow: false, // Shared skill shadow stays off until manifest-driven selection is ready
  openAiAgentsRuntimeSkillActive: false, // Shared skill active stays off until typed caller contracts are proven
  openAiAgentsRuntimeForceRollback: false, // Rollback remains available but disabled by default
  voiceAgents: false, // ElevenAgents runtime stays tenant-gated until security and rollout evidence passes
  geminiOmniSuiteEnabled: false, // Feature 114 ships behind explicit tenant rollout
  geminiOmniAssetCreationEnabled: false, // Provider asset creation stays internal/admin gated first
  geminiOmniPromptQaEnabled: false, // Enable after skill contract verification
  geminiOmniVideoQaEnabled: false, // Enable after post-generation QA loop is wired
  geminiOmniAutoLearningEnabled: false, // Recommendations stay off until sample thresholds exist
  mediaProductionDirectorEnabled: false, // Director stays off until persistence/planner/verifier gates pass
  mediaProductionGoalCanvasEnabled: false, // Planning preview can be enabled separately
  mediaProductionStoryboardPlannerEnabled: false,
  mediaProductionPlanVerifierEnabled: false,
  mediaProductionDualOutputEnabled: false,
  mediaProductionAgencyReviewersEnabled: false,
  mediaProductionLangGraphBatchEnabled: false,
  marketplaceHyperframesEnabled: false,
  marketplaceHyperframesWorkerEnabled: false,
  marketplaceHyperframesLibrarySaveEnabled: false,
  marketplaceHyperframesOperatorEnabled: false,
  mcpConnectEnabled: false,
  mcpConnectMagnificEnabled: false,
  mcpConnectHiggsfieldEnabled: false,
  mcpConnectGroupSharingEnabled: false,
  mcpMediaStudioEnabled: false,
  mcpAutoStoryboardReviewEnabled: false,
  mcpMarketplaceCaptureEnabled: false,
  mcpStoryboardReviewEnabled: false,
  mcpMediaImageEnabled: false,
  mcpMediaVideoEnabled: false,
  mcpToolSchemaCacheEnabled: false,
  mcpAutoFallbackToGatewayApiEnabled: false,
  mcpProviderCreditsTrackedEnabled: false,
  videoSegmentPlannerShadow: true,
  videoSegmentPlannerPerShot: true,
  videoSegmentPlannerPreview: false,
  videoSegmentPlannerMultiShotBeta: false,
  agentExperienceLayer: false,
  agentExperienceShadowMode: false,
  agentExperienceAgencyPreview: false,
  agentExperienceTeamPreview: false,
  agentExperienceChatPreview: false,
  agentExperienceRuntypeRenderer: false,
  agentExperienceDebugInspector: false,
  agentExperienceForceRollback: false,
  agentExperienceWebsiteWidget: false,
  agentExperiencePageActions: false,
};

export type HermesRolloutSurface =
  | "disabled"
  | "registration"
  | "bound_dispatch"
  | "delegated_mcp"
  | "channel_companion";

export interface HermesRolloutReadinessInput {
  featureFlags: Pick<TenantFeatureFlags, "hermesAgentRuntime">;
  bridgeCapabilities?: {
    apiServerEnabled?: boolean | null;
    supportsDelegatedHttp?: boolean | null;
    supportsDelegatedMcp?: boolean | null;
    supportsBoundConnector?: boolean | null;
    supportsCallbacks?: boolean | null;
    gatewayPlatforms?: string[] | null;
  };
  remoteEndpointPolicyExceptionId?: string | null;
}

export interface HermesRolloutReadiness {
  parentGateEnabled: boolean;
  surfaces: {
    registration: boolean;
    boundDispatch: boolean;
    delegatedMcp: boolean;
    channelCompanion: boolean;
  };
  highestEnabledSurface: HermesRolloutSurface;
  remoteEndpointPolicy: "loopback_only" | "audited_exception_granted";
}

export function evaluateHermesRolloutReadiness(
  input: HermesRolloutReadinessInput,
): HermesRolloutReadiness {
  const parentGateEnabled = input.featureFlags.hermesAgentRuntime === true;
  const bridgeCapabilities = input.bridgeCapabilities ?? {};
  const sanitizedGatewayPlatforms = Array.isArray(bridgeCapabilities.gatewayPlatforms)
    ? bridgeCapabilities.gatewayPlatforms.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    )
    : [];

  const registration = parentGateEnabled;
  const boundDispatch = registration
    && bridgeCapabilities.apiServerEnabled === true
    && bridgeCapabilities.supportsDelegatedHttp === true
    && bridgeCapabilities.supportsBoundConnector === true;
  const delegatedMcp = boundDispatch && bridgeCapabilities.supportsDelegatedMcp === true;
  const channelCompanion = boundDispatch
    && bridgeCapabilities.supportsCallbacks === true
    && sanitizedGatewayPlatforms.length > 0;

  const highestEnabledSurface: HermesRolloutSurface = !registration
    ? "disabled"
    : channelCompanion
      ? "channel_companion"
      : delegatedMcp
        ? "delegated_mcp"
        : boundDispatch
          ? "bound_dispatch"
          : "registration";

  return {
    parentGateEnabled,
    surfaces: {
      registration,
      boundDispatch,
      delegatedMcp,
      channelCompanion,
    },
    highestEnabledSurface,
    remoteEndpointPolicy: input.remoteEndpointPolicyExceptionId?.trim()
      ? "audited_exception_granted"
      : "loopback_only",
  };
}

export interface HermesCapabilityRolloutReadiness {
  profileExperience: boolean;
  channelWorkflowExpansion: boolean;
  memoryContextSync: boolean;
  taskModes: boolean;
  visibilitySummaries: boolean;
}

export function evaluateHermesCapabilityRolloutReadiness(
  input: Pick<
    TenantFeatureFlags,
    | "hermesProfileExperience"
    | "hermesChannelWorkflowExpansion"
    | "hermesMemoryContextSync"
    | "hermesTaskModes"
    | "hermesVisibilitySummaries"
  >,
): HermesCapabilityRolloutReadiness {
  return {
    profileExperience: input.hermesProfileExperience === true,
    channelWorkflowExpansion: input.hermesChannelWorkflowExpansion === true,
    memoryContextSync: input.hermesMemoryContextSync === true,
    taskModes: input.hermesTaskModes === true,
    visibilitySummaries: input.hermesVisibilitySummaries === true,
  };
}
