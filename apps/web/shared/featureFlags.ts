/**
 * Tenant-scoped feature flags for gating Claw features.
 *
 * Stored in tenants.featureFlags (JSON column).
 * All flags default to true — features are enabled by default.
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
]);

/**
 * Default values for each feature flag.
 * All flags default to true — features are enabled by default.
 * Disable individual flags per-tenant via the admin panel if needed.
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
};
