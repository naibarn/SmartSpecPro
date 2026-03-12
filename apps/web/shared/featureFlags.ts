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
};
