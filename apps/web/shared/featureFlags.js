const ALLOWED_FEATURE_FLAGS = /* @__PURE__ */ new Set([
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
  "hyperframesWorkerFinalComposite",
  "marketplaceHyperframesLibrarySaveEnabled",
  "marketplaceHyperframesOperatorEnabled",
  "marketplaceConnectorLabEnabled",
  "marketplaceIntelligenceImportsEnabled",
  "marketplaceKeywordDiscoveryEnabled",
  "marketplaceIntelligenceReportsEnabled",
  "marketplaceReportImageSkillsEnabled",
  "marketplaceIntelligenceShareableImageEnabled",
  "marketplaceIntelligenceWatchlistsEnabled",
  "marketplaceIntelligenceMcpWritesEnabled",
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
  "agentExperiencePageActions"
]);
const FEATURE_FLAG_DEFAULTS = {
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
  mcpStdio: false,
  // Requires OpenSandbox — keep disabled by default
  mcpOAuth: false,
  // Requires Express callback route — keep disabled until wired
  UPLOAD_POST_GATEWAY_ENABLED: false,
  // Requires Upload-Post connection + consent flow
  chatAutoModelSelection: true,
  // Enabled by default; admin can still disable per tenant if needed
  localClientLlmMode: false,
  // Rollout-gated until local runtime paths are explicitly enabled per tenant
  openClawExternalRuntime: false,
  // External worker control plane ships disabled until tenant enablement
  desktopZeroClawWorker: false,
  // Desktop worker host remains tenant-gated until runtime/profile support is ready
  nemoClawSecureWorkerPool: false,
  // Secure sandbox pools are explicitly admin-gated
  hiClawClusterRuntime: false,
  // Collaborative cluster runtime is explicitly admin-gated
  hermesAgentRuntime: false,
  // Hermes bridge-backed runtime stays disabled until rollout and policy surfaces are ready
  desktopHostEnabled: false,
  // Desktop Host control plane rollout is explicit and fail-closed
  desktopAdvancedLocalMode: false,
  // High-power local mode requires explicit tenant opt-in
  desktopPackageSync: false,
  // Signed package sync stays disabled until registry/policy is ready
  desktopAgencyRuntime: false,
  // Desktop agency runtime stays disabled until gateway enforcement lands
  desktopWorkerProjection: false,
  // Desktop Host only joins worker fabric when explicitly enabled
  agencyHybridAdk: false,
  // Hybrid Agency Runtime is explicit opt-in while ADK integration remains rollout-gated
  agencyHybridAdkKillSwitch: false,
  // Kill switch defaults open but stays available for incident response
  workpacksEnabled: true,
  // Workpack authoring ships on by default for first-party tenants
  workpackAutonomousPilot: false,
  // Autonomous execution remains rollout-gated until readiness evidence exists
  workpackOpsConsole: true,
  // Admin monitoring surfaces can render workpack readiness immediately
  documentOcrExternalProcessing: false,
  // External document OCR stays tenant-gated by default
  hermesProfileExperience: false,
  // Hermes persona/profile summaries stay rollout-gated until tenant admins opt in
  hermesChannelWorkflowExpansion: false,
  // Hermes channel workflow expansion stays off until revoke/reauthorize behavior is ready
  hermesMemoryContextSync: false,
  // Hermes memory/context sync stays off until approval and quarantine semantics are ready
  hermesTaskModes: false,
  // Hermes task mode summaries stay rollout-gated until operator surfaces are ready
  hermesVisibilitySummaries: false,
  // Hermes visibility summaries stay admin-gated until rollout evidence exists
  agentRegistryEnabled: false,
  // Governed registry rollout remains tenant opt-in until staged adoption is ready
  openAiAgentsRuntimeEnabled: false,
  // Shared OpenAI Agents SDK runtime stays disabled until replay and rollout gates pass
  openAiAgentsRuntimeChatShadow: false,
  // Chat shadow stays off until adapter and comparison traces are ready
  openAiAgentsRuntimeTeamShadow: false,
  // Team shadow stays off until plan/ledger parity is verified
  openAiAgentsRuntimeChatActive: false,
  // Chat active stays off until shadow parity is proven
  openAiAgentsRuntimeTeamActive: false,
  // Team active stays off until plan execution and review loops are verified
  openAiAgentsRuntimeResponsesShadow: false,
  // Responses shadow stays off until schema parity is verified
  openAiAgentsRuntimeResponsesActive: false,
  // Responses active stays off until structured-call parity is verified
  openAiAgentsRuntimeSkillShadow: false,
  // Shared skill shadow stays off until manifest-driven selection is ready
  openAiAgentsRuntimeSkillActive: false,
  // Shared skill active stays off until typed caller contracts are proven
  openAiAgentsRuntimeForceRollback: false,
  // Rollback remains available but disabled by default
  voiceAgents: false,
  // ElevenAgents runtime stays tenant-gated until security and rollout evidence passes
  geminiOmniSuiteEnabled: false,
  // Feature 114 ships behind explicit tenant rollout
  geminiOmniAssetCreationEnabled: false,
  // Provider asset creation stays internal/admin gated first
  geminiOmniPromptQaEnabled: false,
  // Enable after skill contract verification
  geminiOmniVideoQaEnabled: false,
  // Enable after post-generation QA loop is wired
  geminiOmniAutoLearningEnabled: false,
  // Recommendations stay off until sample thresholds exist
  mediaProductionDirectorEnabled: false,
  // Director stays off until persistence/planner/verifier gates pass
  mediaProductionGoalCanvasEnabled: false,
  // Planning preview can be enabled separately
  mediaProductionStoryboardPlannerEnabled: false,
  mediaProductionPlanVerifierEnabled: false,
  mediaProductionDualOutputEnabled: false,
  mediaProductionAgencyReviewersEnabled: false,
  mediaProductionLangGraphBatchEnabled: false,
  marketplaceHyperframesEnabled: false,
  marketplaceHyperframesWorkerEnabled: false,
  hyperframesWorkerFinalComposite: false,
  marketplaceHyperframesLibrarySaveEnabled: false,
  marketplaceHyperframesOperatorEnabled: false,
  marketplaceConnectorLabEnabled: false,
  marketplaceIntelligenceImportsEnabled: false,
  marketplaceKeywordDiscoveryEnabled: false,
  marketplaceIntelligenceReportsEnabled: false,
  marketplaceReportImageSkillsEnabled: false,
  marketplaceIntelligenceShareableImageEnabled: false,
  marketplaceIntelligenceWatchlistsEnabled: false,
  marketplaceIntelligenceMcpWritesEnabled: false,
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
  agentExperiencePageActions: false
};
function evaluateHermesRolloutReadiness(input) {
  const parentGateEnabled = input.featureFlags.hermesAgentRuntime === true;
  const bridgeCapabilities = input.bridgeCapabilities ?? {};
  const sanitizedGatewayPlatforms = Array.isArray(bridgeCapabilities.gatewayPlatforms) ? bridgeCapabilities.gatewayPlatforms.filter(
    (value) => typeof value === "string" && value.trim().length > 0
  ) : [];
  const registration = parentGateEnabled;
  const boundDispatch = registration && bridgeCapabilities.apiServerEnabled === true && bridgeCapabilities.supportsDelegatedHttp === true && bridgeCapabilities.supportsBoundConnector === true;
  const delegatedMcp = boundDispatch && bridgeCapabilities.supportsDelegatedMcp === true;
  const channelCompanion = boundDispatch && bridgeCapabilities.supportsCallbacks === true && sanitizedGatewayPlatforms.length > 0;
  const highestEnabledSurface = !registration ? "disabled" : channelCompanion ? "channel_companion" : delegatedMcp ? "delegated_mcp" : boundDispatch ? "bound_dispatch" : "registration";
  return {
    parentGateEnabled,
    surfaces: {
      registration,
      boundDispatch,
      delegatedMcp,
      channelCompanion
    },
    highestEnabledSurface,
    remoteEndpointPolicy: input.remoteEndpointPolicyExceptionId?.trim() ? "audited_exception_granted" : "loopback_only"
  };
}
function evaluateHermesCapabilityRolloutReadiness(input) {
  return {
    profileExperience: input.hermesProfileExperience === true,
    channelWorkflowExpansion: input.hermesChannelWorkflowExpansion === true,
    memoryContextSync: input.hermesMemoryContextSync === true,
    taskModes: input.hermesTaskModes === true,
    visibilitySummaries: input.hermesVisibilitySummaries === true
  };
}
export {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  evaluateHermesCapabilityRolloutReadiness,
  evaluateHermesRolloutReadiness
};
