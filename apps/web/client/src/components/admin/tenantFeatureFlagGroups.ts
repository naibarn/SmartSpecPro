import type { TenantFeatureFlagKey } from "@shared/featureFlags";
import { FEATURE_FLAG_DEFAULTS } from "@shared/featureFlags";

export interface TenantFlagInfo {
  key: TenantFeatureFlagKey;
  label: string;
  description: string;
}

export interface TenantFlagGroup {
  title: string;
  icon: string;
  flags: TenantFlagInfo[];
}

export const BASE_TENANT_FLAG_GROUPS: TenantFlagGroup[] = [
  {
    title: "Channels & Social",
    icon: "📡",
    flags: [
      { key: "multiChannel", label: "Multi-Channel Adapters", description: "Telegram, WhatsApp, LINE, Slack, Discord" },
      { key: "chatWidget", label: "Embeddable Chat Widget", description: "Embed chat on external websites" },
      { key: "channelRouter", label: "Channel Routing Rules", description: "Route messages based on rules" },
      { key: "META_CHANNELS_ENABLED", label: "Meta Channels", description: "Facebook/Instagram Pages — inbox, publishing, comments" },
      { key: "UPLOAD_POST_GATEWAY_ENABLED", label: "Upload-Post Gateway", description: "Universal upload-post publishing bridge" },
    ],
  },
  {
    title: "AI Tools & Browser",
    icon: "🌐",
    flags: [
      { key: "browserTool", label: "Browser Automation", description: "AI-controlled web browsing" },
      { key: "liveBrowser", label: "Live Browser", description: "Real-time shared browser sessions" },
      { key: "automationCopilot", label: "Automation Copilot", description: "LLM-driven browser task planner" },
      { key: "chatBrowserSessionEntry", label: "Chat Browser Session", description: "Browser Sessions from Chat" },
      { key: "agencyBrowserSessionUi", label: "Agency Browser Session", description: "Browser nodes in Agency" },
      { key: "workflowBrowserSessionNodes", label: "Workflow Browser Session", description: "Browser nodes in Workflow" },
      { key: "canvas", label: "Canvas / AI Artifacts", description: "Interactive artifact rendering" },
      { key: "voiceChat", label: "Voice Chat Mode", description: "Real-time voice conversation" },
      { key: "localClientLlmMode", label: "Local AI / Client LLM", description: "Gemma 4 on-device chat, voice, OCR assist, and per-session local mode" },
      { key: "personaSystem", label: "AI Persona System", description: "Custom AI personalities" },
    ],
  },
  {
    title: "Agency & Agents",
    icon: "🤖",
    flags: [
      { key: "crossAgency", label: "Cross-Agency Calls", description: "Agents calling other agencies" },
      { key: "agencyCustomTools", label: "Custom Tools", description: "Create custom agency tools" },
      { key: "agencyGuardrails", label: "Guardrails", description: "Safety rules for agent outputs" },
      { key: "agencyStreaming", label: "Streaming Responses", description: "Real-time token streaming" },
      { key: "agencyMcpBridge", label: "MCP Bridge (per-agent)", description: "Inline MCP server on agent nodes" },
      { key: "agencyToolApi", label: "Tool API", description: "Standalone tool execution API" },
      { key: "agencyAgenticModeEnabled", label: "Agentic Mode (L1)", description: "Basic agentic execution with tool use" },
      { key: "agencyReactExecutorEnabled", label: "ReAct Executor (L2)", description: "Reasoning + Acting loop" },
      { key: "agencyAutonomousAgentEnabled", label: "Autonomous Agent (L3)", description: "Self-planning autonomous agents" },
      { key: "agencyLongTermMemoryEnabled", label: "Long-Term Memory", description: "Persistent memory across runs" },
      { key: "agencyHybridAdk", label: "Hybrid ADK Runtime", description: "Compile and run hybrid Agency Swarm + ADK workflows" },
      { key: "agencyHybridAdkKillSwitch", label: "Hybrid ADK Kill Switch", description: "Operationally disable ADK compile/save/run paths" },
    ],
  },
  {
    title: "MCP Server Registry",
    icon: "🔌",
    flags: [
      { key: "mcpServerRegistry", label: "MCP Server Registry", description: "Centralized MCP tool server management" },
      { key: "mcpStdio", label: "MCP stdio Transport", description: "MCP via OpenSandbox containers" },
      { key: "mcpOAuth", label: "MCP OAuth 2.1", description: "OAuth for MCP server connections" },
    ],
  },
  {
    title: "Planner & Orchestrator",
    icon: "🎯",
    flags: [
      { key: "taskPlannerEnabled", label: "Task Planner", description: "Active model selection planner" },
      { key: "chatAutoModelSelection", label: "Chat Auto Model Selection", description: "Auto / provider-auto LLM routing in Chat" },
      { key: "taskPlannerAgencyEscalation", label: "Planner Escalation", description: "Escalate to agency for multi-step" },
      { key: "orchestratorEnabled", label: "Workflow Orchestrator", description: "Visual workflow engine" },
      { key: "skillOrchestrator", label: "Skill Orchestrator", description: "Automated skill chaining" },
      { key: "unifiedSkillExecution", label: "Unified Skill Execution", description: "Unified skill pipeline" },
    ],
  },
  {
    title: "Workpacks & Autonomy",
    icon: "🧩",
    flags: [
      { key: "workpacksEnabled", label: "Workpacks", description: "Case intake, playbooks, and reusable workpack execution units" },
      { key: "workpackAutonomousPilot", label: "Autonomous Pilot", description: "Allow evidence-backed autonomous workpack runs for this tenant" },
      { key: "workpackOpsConsole", label: "Ops Console", description: "Expose admin readiness, rollout, and incident controls for workpacks" },
    ],
  },
  {
    title: "Integration & API",
    icon: "🔗",
    flags: [
      { key: "responsesApi", label: "Responses API Gateway", description: "OpenAI-compatible proxy" },
      { key: "publicApi", label: "Public API", description: "External API access" },
      { key: "openClawExternalRuntime", label: "OpenClaw External Workers", description: "Allow registered external Claw workers for this tenant" },
      { key: "webhookTriggers", label: "Webhook Triggers", description: "Inbound webhook triggers" },
      { key: "costDisplay", label: "Cost Display", description: "Show per-response costs" },
      { key: "multimodalMemory", label: "Multimodal Memory", description: "Image/audio in memory" },
    ],
  },
  {
    title: "Desktop Host",
    icon: "💻",
    flags: [
      { key: "desktopHostEnabled", label: "Desktop Host", description: "Unified governed Desktop Host control plane" },
      { key: "desktopAdvancedLocalMode", label: "Advanced Local Mode", description: "Step-up local power with explicit tenant opt-in" },
      { key: "desktopPackageSync", label: "Desktop Package Sync", description: "Signed package sync and local materialization" },
      { key: "desktopAgencyRuntime", label: "Desktop Agency Runtime", description: "Agency Swarm runtime on managed desktop" },
      { key: "desktopWorkerProjection", label: "Desktop Worker Projection", description: "Project Desktop Host into the worker fabric" },
      { key: "desktopZeroClawWorker", label: "Desktop ZeroClaw Worker", description: "Compatibility rollout for managed desktop workers" },
      { key: "nemoClawSecureWorkerPool", label: "NemoClaw Secure Workers", description: "Secure worker pool runtime family" },
      { key: "hiClawClusterRuntime", label: "HiClaw Cluster Runtime", description: "Collaborative cluster runtime family" },
    ],
  },
  {
    title: "Notifications",
    icon: "🔔",
    flags: [
      { key: "notificationUnifiedCenter", label: "Notification Center", description: "Unified inbox" },
      { key: "notificationPreferencesEnabled", label: "Preferences", description: "User notification settings" },
      { key: "notificationDedupEnabled", label: "Dedup", description: "Suppress duplicates" },
      { key: "notificationEscalationEnabled", label: "Escalation", description: "Escalate unacknowledged" },
      { key: "notificationEmailDelivery", label: "Email Delivery", description: "Notifications via email" },
      { key: "notificationWebhookDelivery", label: "Webhook Delivery", description: "Notifications via webhook" },
    ],
  },
];

function humanizeFlagKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getUngroupedTenantFeatureFlagKeys(): TenantFeatureFlagKey[] {
  const grouped = new Set<TenantFeatureFlagKey>(
    BASE_TENANT_FLAG_GROUPS.flatMap((group) => group.flags.map((flag) => flag.key)),
  );

  return (Object.keys(FEATURE_FLAG_DEFAULTS) as TenantFeatureFlagKey[]).filter(
    (key) => !grouped.has(key),
  );
}

export function buildTenantFeatureFlagGroups(): TenantFlagGroup[] {
  const ungroupedKeys = getUngroupedTenantFeatureFlagKeys();
  if (ungroupedKeys.length === 0) {
    return BASE_TENANT_FLAG_GROUPS;
  }

  return [
    ...BASE_TENANT_FLAG_GROUPS,
    {
      title: "Additional Flags",
      icon: "⚙️",
      flags: ungroupedKeys.map((key) => ({
        key,
        label: humanizeFlagKey(key),
        description: `Feature flag: ${key}`,
      })),
    },
  ];
}
