/**
 * TenantFeatureFlagsPanel
 *
 * Admin panel component for toggling Claw feature flags on a per-tenant basis.
 * Used within the tenant management UI.
 *
 * - Displays all 10 feature flags grouped by category
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
    title: "Channels",
    flags: [
      { key: "multiChannel", label: "Multi-Channel Adapters", description: "Telegram, WhatsApp, LINE, Slack, Discord" },
      { key: "chatWidget", label: "Embeddable Chat Widget", description: "Embed chat on external websites" },
      { key: "channelRouter", label: "Channel Routing Rules", description: "Route messages based on rules" },
    ],
  },
  {
    title: "AI Tools",
    flags: [
      { key: "browserTool", label: "Browser Automation", description: "AI-controlled web browsing" },
      { key: "automationCopilot", label: "Automation Copilot", description: "LLM-driven browser task planner and executor" },
      { key: "canvas", label: "Canvas / AI Artifacts", description: "Interactive artifact rendering" },
      { key: "voiceChat", label: "Voice Chat Mode", description: "Real-time voice conversation" },
      { key: "crossAgency", label: "Cross-Agency Communication", description: "Agents calling other agents" },
      { key: "personaSystem", label: "AI Persona System", description: "Custom AI personalities per conversation" },
    ],
  },
  {
    title: "Integration",
    flags: [
      { key: "responsesApi", label: "Responses API Gateway", description: "OpenAI-compatible Responses API proxy" },
      { key: "webhookTriggers", label: "Inbound Webhook Triggers", description: "Trigger agents via HTTP webhooks" },
      { key: "costDisplay", label: "Per-Response Cost Display", description: "Show token cost to users" },
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
