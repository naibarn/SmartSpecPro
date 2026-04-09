/**
 * TenantFeatureFlagsPanel
 *
 * Admin panel for toggling feature flags on a per-tenant basis.
 * Used within the tenant edit dialog in AdminTenants.
 *
 * - 44 flags organized in 7 collapsible groups
 * - Search filter to quickly find flags
 * - Shows "X/Y enabled" summary per group
 * - Optimistic updates with rollback on error
 * - Scrollable layout for overflow
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { TenantFeatureFlags, TenantFeatureFlagKey } from "@shared/featureFlags";
import { FEATURE_FLAG_DEFAULTS } from "@shared/featureFlags";
import { buildTenantFeatureFlagGroups } from "./tenantFeatureFlagGroups";

interface TenantFeatureFlagsPanelProps {
  tenantId: string;
  canEdit?: boolean;
}

export function TenantFeatureFlagsPanel({ tenantId, canEdit = false }: TenantFeatureFlagsPanelProps) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const allFlagGroups = useMemo(() => buildTenantFeatureFlagGroups(), []);

  const { data: flags, isLoading } = trpc.tenantFeatureFlags.getFeatureFlags.useQuery(
    { tenantId },
    { staleTime: 30_000 },
  );
  const { data: rolloutState } = trpc.tenantFeatureFlags.getWorkpackRolloutState.useQuery(
    { tenantId },
    { staleTime: 30_000 },
  );

  const mutation = trpc.tenantFeatureFlags.updateFeatureFlags.useMutation({
    onMutate: async ({ flags: updates, tenantId: tid }) => {
      if (!tid) return {};
      await utils.tenantFeatureFlags.getFeatureFlags.cancel({ tenantId: tid });
      const previous = utils.tenantFeatureFlags.getFeatureFlags.getData({ tenantId: tid });
      utils.tenantFeatureFlags.getFeatureFlags.setData(
        { tenantId: tid },
        (old) => (old ? { ...old, ...updates } : { ...FEATURE_FLAG_DEFAULTS, ...updates }),
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
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

  const toggleGroup = (title: string) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const resolvedFlags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS, ...(flags ?? {}) };

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return allFlagGroups;
    const q = search.toLowerCase();
    return allFlagGroups.map((g) => ({
      ...g,
      flags: g.flags.filter(
        (f) =>
          f.label.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.key.toLowerCase().includes(q),
      ),
    })).filter((g) => g.flags.length > 0);
  }, [allFlagGroups, search]);

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading feature flags...</div>;
  }

  const totalFlags = allFlagGroups.reduce((n, g) => n + g.flags.length, 0);
  const enabledCount = allFlagGroups.reduce(
    (n, g) => n + g.flags.filter((f) => resolvedFlags[f.key]).length,
    0,
  );

  return (
    <div className="space-y-3">
      {/* Summary + Search */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search flags..."
          className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          {enabledCount}/{totalFlags} on
        </span>
        {rolloutState ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            Workpacks: {rolloutState.rolloutPhase}
          </span>
        ) : null}
      </div>

      {rolloutState ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          Tenant rollout posture:
          {" "}
          {rolloutState.workpacksEnabled ? "workpacks enabled" : "draft only"}
          {" • "}
          {rolloutState.workpackAutonomousPilot ? "autonomous pilot on" : "autonomous pilot off"}
          {" • "}
          {rolloutState.workpackOpsConsole ? "ops console visible" : "ops console hidden"}
        </div>
      ) : null}

      {/* Groups */}
      <div className="space-y-1">
        {filteredGroups.map((group) => {
          const isCollapsed = !!collapsed[group.title];
          const groupEnabled = group.flags.filter((f) => resolvedFlags[f.key]).length;

          return (
            <div key={group.title} className="rounded-lg border border-gray-200 overflow-hidden">
              {/* Group header — clickable to collapse/expand */}
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                className="flex w-full items-center justify-between bg-gray-50 px-3 py-2 text-left hover:bg-gray-100 transition-colors"
              >
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <span>{group.icon}</span>
                  {group.title}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">
                    {groupEnabled}/{group.flags.length}
                  </span>
                  <svg
                    className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>

              {/* Flag rows */}
              {!isCollapsed && (
                <div className="divide-y divide-gray-100">
                  {group.flags.map(({ key, label, description }) => {
                    const enabled = resolvedFlags[key];
                    const isPending = pendingKey === key;

                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50/50"
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
                          <p className="text-[11px] text-gray-400 truncate">{description}</p>
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
                            "transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1",
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
              )}
            </div>
          );
        })}
      </div>

      {filteredGroups.length === 0 && (
        <p className="py-4 text-center text-xs text-gray-400">No flags match "{search}"</p>
      )}

      {mutation.isError && (
        <p className="text-sm text-red-600">
          Failed to update feature flag. Please try again.
        </p>
      )}
    </div>
  );
}
