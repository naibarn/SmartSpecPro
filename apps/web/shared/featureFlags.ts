/**
 * Tenant-scoped feature flags for gating Claw features.
 *
 * Stored in tenants.featureFlags (JSON column).
 * All flags default to false unless specified otherwise.
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
]);

/**
 * Default values for each feature flag.
 * costDisplay and personaSystem default to true (low-risk, high-value).
 * All others default to false (opt-in for new features).
 */
export const FEATURE_FLAG_DEFAULTS: Readonly<TenantFeatureFlags> = {
  multiChannel: false,
  chatWidget: false,
  browserTool: false,
  canvas: false,
  voiceChat: false,
  webhookTriggers: false,
  costDisplay: true,
  personaSystem: true,
  crossAgency: false,
  channelRouter: false,
  automationCopilot: false,
  liveBrowser: false,
  responsesApi: false,
  taskPlannerEnabled: false,
  taskPlannerAgencyEscalation: false,
  chatBrowserSessionEntry: false,
  agencyBrowserSessionUi: false,
  workflowBrowserSessionNodes: false,
  publicApi: false,
  multimodalMemory: false,
  skillOrchestrator: false,
  orchestratorEnabled: true,
  notificationDedupEnabled: false,
  notificationPreferencesEnabled: false,
  notificationEscalationEnabled: false,
  notificationUnifiedCenter: false,
  notificationEmailDelivery: false,
  notificationWebhookDelivery: false,
  unifiedSkillExecution: false,
  agencyCustomTools: false,
  agencyGuardrails: false,
  agencyStreaming: false,
  agencyMcpBridge: false,
  agencyToolApi: false,
};
