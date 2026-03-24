/**
 * TenantFeatureFlagsPanel
 *
 * Admin panel component for toggling Claw feature flags on a per-tenant basis.
 * Used within the tenant management UI.
 *
 * - Displays all feature flags grouped by category (7 groups)
 * - Shows enabled/disabled state with toggle switches
 * - Calls updateFeatureFlags mutation on toggle
 * - Optimistic updates with rollback on error
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { TenantFeatureFlags, TenantFeatureFlagKey } from "@shared/featureFlags";
import { FEATURE_FLAG_DEFAULTS } from "@shared/featureFlags";

interface FlagInfo {
  key: TenantFeatureFlagKey;
  label: string;
  description: string;
}

const FLAG_GROUPS: { title: string; flags: FlagInfo[] }[] = [
  {
    title: "Channels & Social",
    flags: [
      { key: "multiChannel", label: "Multi-Channel Adapters", description: "Telegram, WhatsApp, LINE, Slack, Discord" },
      { key: "chatWidget", label: "Embeddable Chat Widget", description: "Embed chat on external websites" },
      { key: "channelRouter", label: "Channel Routing Rules", description: "Route messages based on rules" },
      { key: "META_CHANNELS_ENABLED", label: "Meta Channels", description: "Facebook/Instagram Pages — inbox, publishing, comments, automation" },
    ],
  },
  {
    title: "AI Tools & Browser",
    flags: [
      { key: "browserTool", label: "Browser Automation", description: "AI-controlled web browsing" },
      { key: "liveBrowser", label: "Live Browser", description: "Real-time shared browser sessions" },
      { key: "automationCopilot", label: "Automation Copilot", description: "LLM-driven browser task planner and executor" },
      { key: "chatBrowserSessionEntry", label: "Chat Browser Session", description: "Start and reopen Browser Session from Chat" },
      { key: "agencyBrowserSessionUi", label: "Agency Browser Session", description: "Show Browser Session nodes in Agency builder" },
      { key: "workflowBrowserSessionNodes", label: "Workflow Browser Session", description: "Browser Session nodes in Workflow editor" },
      { key: "canvas", label: "Canvas / AI Artifacts", description: "Interactive artifact rendering" },
      { key: "voiceChat", label: "Voice Chat Mode", description: "Real-time voice conversation" },
      { key: "personaSystem", label: "AI Persona System", description: "Custom AI personalities per conversation" },
    ],
  },
  {
    title: "Agency & Agents",
    flags: [
      { key: "crossAgency", label: "Cross-Agency Communication", description: "Agents calling other agencies" },
      { key: "agencyCustomTools", label: "Custom Tools", description: "Create and manage custom agency tools" },
      { key: "agencyGuardrails", label: "Guardrails", description: "Safety rules for agent outputs" },
      { key: "agencyStreaming", label: "Streaming Responses", description: "Real-time token streaming from agents" },
      { key: "agencyMcpBridge", label: "MCP Bridge (per-agent)", description: "Inline MCP server connections on agent nodes" },
      { key: "agencyToolApi", label: "Tool API", description: "Standalone tool execution API endpoints" },
      { key: "agencyAgenticModeEnabled", label: "Agentic Mode (Level 1)", description: "Basic agentic execution with tool use" },
      { key: "agencyReactExecutorEnabled", label: "ReAct Executor (Level 2)", description: "Reasoning + Acting loop executor" },
      { key: "agencyAutonomousAgentEnabled", label: "Autonomous Agent (Level 3)", description: "Self-planning, self-evaluating autonomous agents" },
      { key: "agencyLongTermMemoryEnabled", label: "Long-Term Memory", description: "Persistent memory across agent runs" },
    ],
  },
  {
    title: "MCP Server Registry",
    flags: [
      { key: "mcpServerRegistry", label: "MCP Server Registry", description: "Centralized management of external MCP tool servers" },
      { key: "mcpStdio", label: "MCP stdio Transport", description: "Run MCP servers via OpenSandbox containers (subprocess)" },
      { key: "mcpOAuth", label: "MCP OAuth 2.1", description: "OAuth authentication for MCP server connections" },
    ],
  },
  {
    title: "Planner & Orchestrator",
    flags: [
      { key: "taskPlannerEnabled", label: "Task Planner", description: "Active model selection via task execution planner" },
      { key: "taskPlannerAgencyEscalation", label: "Planner Agency Escalation", description: "Escalate to agency orchestration for multi-step tasks" },
      { key: "orchestratorEnabled", label: "Workflow Orchestrator", description: "Visual workflow execution engine" },
      { key: "skillOrchestrator", label: "Skill Orchestrator", description: "Automated skill chaining and orchestration" },
      { key: "unifiedSkillExecution", label: "Unified Skill Execution", description: "Unified execution pipeline for all skill types" },
    ],
  },
  {
    title: "Integration & API",
    flags: [
      { key: "responsesApi", label: "Responses API Gateway", description: "OpenAI-compatible Responses API proxy" },
      { key: "publicApi", label: "Public API", description: "External API access with API keys" },
      { key: "webhookTriggers", label: "Inbound Webhook Triggers", description: "Trigger agents and workflows via HTTP webhooks" },
      { key: "costDisplay", label: "Per-Response Cost Display", description: "Show token cost to users" },
      { key: "multimodalMemory", label: "Multimodal Memory", description: "Image and audio content in conversation memory" },
    ],
  },
  {
    title: "Notifications",
    flags: [
      { key: "notificationUnifiedCenter", label: "Notification Center", description: "Unified notification inbox" },
      { key: "notificationPreferencesEnabled", label: "Notification Preferences", description: "User-configurable notification settings" },
      { key: "notificationDedupEnabled", label: "Notification Dedup", description: "Suppress duplicate notifications" },
      { key: "notificationEscalationEnabled", label: "Notification Escalation", description: "Escalate unacknowledged alerts" },
      { key: "notificationEmailDelivery", label: "Email Delivery", description: "Send notifications via email" },
      { key: "notificationWebhookDelivery", label: "Webhook Delivery", description: "Send notifications to external webhooks" },
    ],
  },
];

interface TenantFeatureFlagsPanelProps {
  tenantId: string;
  /** Whether the current user can modify flags for this tenant */
  canEdit?: boolean;
}

export function TenantFeatureFlagsPanel({ tenantId, canEdit = false }: TenantFeatureFlagsPanelProps) {
  const utils = trpc.useUtils();

  const { data: flags, isLoading } = trpc.tenantFeatureFlags.getFeatureFlags.useQuery(
    { tenantId },
    { staleTime: 30_000 },
  );

  const mutation = trpc.tenantFeatureFlags.updateFeatureFlags.useMutation({
    onMutate: async ({ flags: updates, tenantId: tid }) => {
      if (!tid) return {};

      // Cancel outgoing refetches
      await utils.tenantFeatureFlags.getFeatureFlags.cancel({ tenantId: tid });

      // Snapshot current value
      const previous = utils.tenantFeatureFlags.getFeatureFlags.getData({ tenantId: tid });

      // Optimistically update
      utils.tenantFeatureFlags.getFeatureFlags.setData(
        { tenantId: tid },
        (old) => (old ? { ...old, ...updates } : { ...FEATURE_FLAG_DEFAULTS, ...updates }),
      );

      return { previous };
    },
    onError: (_err, variables, context) => {
      // Roll back on error — only if tenantId is available
      if (variables.tenantId && context?.previous) {
        utils.tenantFeatureFlags.getFeatureFlags.setData(
          { tenantId: variables.tenantId },
          context.previous,
        );
      }
    },
    onSettled: () => {
      utils.tenantFeatureFlags.getFeatureFlags.invalidate({ tenantId });
    },
  });

  const [pendingKey, setPendingKey] = useState<TenantFeatureFlagKey | null>(null);

  const handleToggle = (flag: TenantFeatureFlagKey, currentValue: boolean) => {
    if (!canEdit || mutation.isPending) return;

    setPendingKey(flag);
    mutation.mutate(
      { tenantId, flags: { [flag]: !currentValue } },
      { onSettled: () => setPendingKey(null) },
    );
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading feature flags...</div>;
  }

  const resolvedFlags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS, ...(flags ?? {}) };

  return (
    <div className="space-y-6">
      {FLAG_GROUPS.map((group) => (
        <div key={group.title}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {group.title}
          </h3>
          <div className="space-y-2">
            {group.flags.map(({ key, label, description }) => {
              const enabled = resolvedFlags[key];
              const isPending = pendingKey === key;

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500">{description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`Toggle ${label}`}
                    disabled={!canEdit || isPending}
                    onClick={() => handleToggle(key, enabled)}
                    className={[
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                      "transition-colors duration-200 ease-in-out focus:outline-none",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      enabled ? "bg-blue-600" : "bg-gray-200",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow",
                        "transform transition duration-200 ease-in-out",
                        enabled ? "translate-x-4" : "translate-x-0",
                      ].join(" ")}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {mutation.isError && (
        <p className="text-sm text-red-600">
          Failed to update feature flag. Please try again.
        </p>
      )}
    </div>
  );
}
