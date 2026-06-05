import type { TenantFeatureFlagKey } from "@shared/featureFlags";
import { FEATURE_FLAG_DEFAULTS } from "@shared/featureFlags.ts";

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
      { key: "voiceAgents", label: "Voice Agents", description: "ElevenLabs ElevenAgents runtime sessions" },
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
      { key: "agentRegistryEnabled", label: "Agent Registry", description: "Registered agent catalog and admin controls" },
    ],
  },
  {
    title: "OpenAI Agents Runtime",
    icon: "🧠",
    flags: [
      { key: "openAiAgentsRuntimeEnabled", label: "Runtime Enabled", description: "Enable the OpenAI Agents runtime bridge" },
      { key: "openAiAgentsRuntimeChatShadow", label: "Chat Shadow", description: "Run Chat through runtime shadow mode" },
      { key: "openAiAgentsRuntimeTeamShadow", label: "Team Shadow", description: "Run team flows through runtime shadow mode" },
      { key: "openAiAgentsRuntimeResponsesShadow", label: "Responses Shadow", description: "Run Responses paths through runtime shadow mode" },
      { key: "openAiAgentsRuntimeSkillShadow", label: "Skill Shadow", description: "Run skill paths through runtime shadow mode" },
      { key: "openAiAgentsRuntimeChatActive", label: "Chat Active", description: "Serve Chat through the runtime" },
      { key: "openAiAgentsRuntimeTeamActive", label: "Team Active", description: "Serve team flows through the runtime" },
      { key: "openAiAgentsRuntimeResponsesActive", label: "Responses Active", description: "Serve Responses paths through the runtime" },
      { key: "openAiAgentsRuntimeSkillActive", label: "Skill Active", description: "Serve skill paths through the runtime" },
      { key: "openAiAgentsRuntimeForceRollback", label: "Force Rollback", description: "Disable active runtime paths immediately" },
    ],
  },
  {
    title: "Gemini Omni",
    icon: "✨",
    flags: [
      { key: "geminiOmniSuiteEnabled", label: "Gemini Omni Suite", description: "Enable Gemini Omni suite surfaces and tenant rollout controls" },
      { key: "geminiOmniAssetCreationEnabled", label: "Asset Creation", description: "Allow Gemini Omni asset creation flows" },
      { key: "geminiOmniPromptQaEnabled", label: "Prompt QA", description: "Run Gemini Omni prompt QA before generation" },
      { key: "geminiOmniVideoQaEnabled", label: "Video QA", description: "Run Gemini Omni video QA after generation" },
      { key: "geminiOmniAutoLearningEnabled", label: "Auto Learning", description: "Allow Gemini Omni QA learning recommendations" },
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
    title: "Hermes Runtime",
    icon: "🕊️",
    flags: [
      { key: "hermesAgentRuntime", label: "Hermes Runtime", description: "Allow registered Hermes bridge workers for this tenant" },
      { key: "hermesProfileExperience", label: "Hermes Profile Experience", description: "Show Hermes persona and profile summaries in team and admin views" },
      { key: "hermesChannelWorkflowExpansion", label: "Hermes Channel Workflow", description: "Enable Hermes channel companion workflow surfaces" },
      { key: "hermesMemoryContextSync", label: "Hermes Memory Sync", description: "Enable opt-in Hermes memory and context synchronization" },
      { key: "hermesTaskModes", label: "Hermes Task Modes", description: "Show Hermes task-mode summaries and mode mapping" },
      { key: "hermesVisibilitySummaries", label: "Hermes Visibility Summaries", description: "Show Hermes progress and observability summaries" },
    ],
  },
  {
    title: "Integration & API",
    icon: "🔗",
    flags: [
      { key: "responsesApi", label: "Responses API Gateway", description: "OpenAI-compatible proxy" },
      { key: "publicApi", label: "Public API", description: "External API access" },
      { key: "openClawExternalRuntime", label: "OpenClaw External Workers", description: "Allow registered external Claw workers for this tenant" },
      { key: "documentOcrExternalProcessing", label: "Document OCR External Processing", description: "Allow outbound document OCR to external providers (ADE/gateway)" },
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
      { key: "desktopZeroClawWorker", label: "Desktop + ZeroClaw Managed Runtime", description: "Compatibility rollout for the managed Desktop + ZeroClaw runtime" },
      { key: "nemoClawSecureWorkerPool", label: "NemoClaw Secure Sandbox", description: "Admin-gated secure sandbox runtime family" },
      { key: "hiClawClusterRuntime", label: "HiClaw Collaborative Cluster", description: "Admin-gated collaborative cluster runtime family" },
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
  {
    title: "Media Production & HyperFrames",
    icon: "🎬",
    flags: [
      { key: "mediaProductionDirectorEnabled", label: "Production Director", description: "Media Studio Production/Director command center" },
      { key: "mediaProductionGoalCanvasEnabled", label: "Production Goal Canvas", description: "Visual production goal planning canvas" },
      { key: "mediaProductionStoryboardPlannerEnabled", label: "Storyboard Planner", description: "Production Storyboard Planner skill gate" },
      { key: "mediaProductionPlanVerifierEnabled", label: "Plan Verifier", description: "Production Plan Verifier skill gate" },
      { key: "mediaProductionDualOutputEnabled", label: "Dual Output Projection", description: "Storyboard Review and Video Edit output projections" },
      { key: "mediaProductionAgencyReviewersEnabled", label: "Agency Reviewers", description: "Optional Agency reviewer packs for production plans" },
      { key: "mediaProductionLangGraphBatchEnabled", label: "LangGraph Batch Runtime", description: "Optional checkpointed batch runtime for media production" },
      { key: "marketplaceHyperframesEnabled", label: "Marketplace HyperFrames", description: "Show Auto Storyboard Review HyperFrames controls on Marketplace Product Detail" },
      { key: "marketplaceHyperframesWorkerEnabled", label: "HyperFrames Worker Queue", description: "Allow this tenant to queue HyperFrames preview/render worker jobs" },
      { key: "marketplaceHyperframesLibrarySaveEnabled", label: "HyperFrames Library Save", description: "Allow completed HyperFrames renders to be saved to Library" },
      { key: "marketplaceHyperframesOperatorEnabled", label: "HyperFrames Operator Controls", description: "Allow delegated tenant operators to inspect, replay, and manage HyperFrames renders" },
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
