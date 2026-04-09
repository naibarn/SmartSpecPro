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
  desktopHostEnabled: boolean; // F50 — Unified Desktop Host control plane
  desktopAdvancedLocalMode: boolean; // F51 — Step-up desktop local power
  desktopPackageSync: boolean; // F52 — Signed desktop package sync and materialization
  desktopAgencyRuntime: boolean; // F53 — Desktop Agency Swarm runtime enablement
  desktopWorkerProjection: boolean; // F54 — Desktop Host projection into worker fabric
  agencyHybridAdk: boolean; // F55 — Hybrid Agency Runtime with Google ADK compile/runtime surfaces
  agencyHybridAdkKillSwitch: boolean; // F56 — Operational kill switch for Agency Hybrid ADK paths
  workpacksEnabled: boolean; // F57 — Autonomous workpack intake, lifecycle, and control-plane surfaces
  workpackAutonomousPilot: boolean; // F58 — Tenant rollout gate for autonomous workpack execution
  workpackOpsConsole: boolean; // F59 — Admin monitoring and readiness controls for workpacks
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
};
