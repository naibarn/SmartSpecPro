"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEATURE_FLAG_DEFAULTS = exports.ALLOWED_FEATURE_FLAGS = void 0;
exports.evaluateHermesRolloutReadiness = evaluateHermesRolloutReadiness;
exports.evaluateHermesCapabilityRolloutReadiness = evaluateHermesCapabilityRolloutReadiness;
/**
 * Server-side allowlist of valid feature flag keys.
 * Used for validation — any keys not in this set are stripped before saving.
 */
exports.ALLOWED_FEATURE_FLAGS = new Set([
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
]);
/**
 * Default values for each feature flag.
 * Most flags default to true, but rollout- or infrastructure-sensitive
 * capabilities can stay false until explicitly enabled per tenant.
 */
exports.FEATURE_FLAG_DEFAULTS = {
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
    mcpStdio: false, // Requires OpenSandbox — keep disabled by default
    mcpOAuth: false, // Requires Express callback route — keep disabled until wired
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
    hermesTaskModes: false, // Hermes task mode summaries stay off until scheduler/session persistence is complete
    hermesVisibilitySummaries: false, // Hermes progress visibility stays off until rollout and audit semantics are wired
};
function evaluateHermesRolloutReadiness(input) {
    var _a, _b;
    var parentGateEnabled = input.featureFlags.hermesAgentRuntime === true;
    var bridgeCapabilities = (_a = input.bridgeCapabilities) !== null && _a !== void 0 ? _a : {};
    var sanitizedGatewayPlatforms = Array.isArray(bridgeCapabilities.gatewayPlatforms)
        ? bridgeCapabilities.gatewayPlatforms.filter(function (value) { return typeof value === "string" && value.trim().length > 0; })
        : [];
    var registration = parentGateEnabled;
    var boundDispatch = registration
        && bridgeCapabilities.apiServerEnabled === true
        && bridgeCapabilities.supportsDelegatedHttp === true
        && bridgeCapabilities.supportsBoundConnector === true;
    var delegatedMcp = boundDispatch && bridgeCapabilities.supportsDelegatedMcp === true;
    var channelCompanion = boundDispatch
        && bridgeCapabilities.supportsCallbacks === true
        && sanitizedGatewayPlatforms.length > 0;
    var highestEnabledSurface = !registration
        ? "disabled"
        : channelCompanion
            ? "channel_companion"
            : delegatedMcp
                ? "delegated_mcp"
                : boundDispatch
                    ? "bound_dispatch"
                    : "registration";
    return {
        parentGateEnabled: parentGateEnabled,
        surfaces: {
            registration: registration,
            boundDispatch: boundDispatch,
            delegatedMcp: delegatedMcp,
            channelCompanion: channelCompanion,
        },
        highestEnabledSurface: highestEnabledSurface,
        remoteEndpointPolicy: ((_b = input.remoteEndpointPolicyExceptionId) === null || _b === void 0 ? void 0 : _b.trim())
            ? "audited_exception_granted"
            : "loopback_only",
    };
}
function evaluateHermesCapabilityRolloutReadiness(input) {
    return evaluateHermesRolloutReadiness(input);
}
