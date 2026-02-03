/**
 * MultiProviderAdmin — Admin panel tabs for multi-provider management
 *
 * Contains three tabs:
 * 1. Model Mappings — CRUD for model-to-provider mappings
 * 2. Routing Rules — CRUD for routing rules
 * 3. Provider Health — Live health status display
 *
 * To integrate into AdminLLMProviders.tsx, render this component
 * as additional tabs alongside the existing provider management UI.
 */

import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { formatModelCost } from "../../lib/modelPricing";

type Tab = "mappings" | "rules" | "health" | "usage";

export function MultiProviderAdmin() {
  const [activeTab, setActiveTab] = useState<Tab>("mappings");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border">
        {(["mappings", "rules", "health", "usage"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "mappings" ? "Model Mappings" :
             tab === "rules" ? "Routing Rules" :
             tab === "health" ? "Provider Health" :
             "Usage Stats"}
          </button>
        ))}
      </div>

      {activeTab === "mappings" && <ModelMappingsTab />}
      {activeTab === "rules" && <RoutingRulesTab />}
      {activeTab === "health" && <ProviderHealthTab />}
      {activeTab === "usage" && <UsageStatsTab />}
    </div>
  );
}

function ModelMappingsTab() {
  const { data: mappings, isLoading } = trpc.multiProvider.listModelMappings.useQuery();
  const deleteMutation = trpc.multiProvider.deleteModelMapping.useMutation();
  const utils = trpc.useUtils();

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  const groups = mappings ? Object.entries(mappings) : [];

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No model mappings configured. Run the seed script to add initial data.</p>
      ) : (
        groups.map(([modelId, models]) => (
          <div key={modelId} className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium">{modelId}</h3>
            <div className="mt-2 space-y-2">
              {(models as any[]).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{m.providerName}</span>
                    {m.isFree && (
                      <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-500">FREE</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatModelCost(m.pricingInput, m.pricingOutput, m.isFree)}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      await deleteMutation.mutateAsync({ id: m.id });
                      utils.multiProvider.listModelMappings.invalidate();
                    }}
                    className="text-xs text-red-500 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function RoutingRulesTab() {
  const { data: rules, isLoading } = trpc.multiProvider.listRoutingRules.useQuery();
  const deleteMutation = trpc.multiProvider.deleteRoutingRule.useMutation();
  const utils = trpc.useUtils();

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-2">
      {!rules?.length ? (
        <p className="p-4 text-sm text-muted-foreground">No routing rules configured.</p>
      ) : (
        rules.map((rule: any) => (
          <div key={rule.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <code className="text-sm">{rule.modelPattern}</code>
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{rule.routingMode}</span>
              <span className="ml-2 text-xs text-muted-foreground">max {rule.maxFallbacks} fallbacks</span>
              {!rule.isActive && <span className="ml-2 text-xs text-yellow-500">inactive</span>}
            </div>
            <button
              onClick={async () => {
                await deleteMutation.mutateAsync({ id: rule.id });
                utils.multiProvider.listRoutingRules.invalidate();
              }}
              className="text-xs text-red-500 hover:text-red-400"
            >
              Delete
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function ProviderHealthTab() {
  const { data: health, isLoading } = trpc.multiProvider.getProviderHealth.useQuery();

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-2">
      {!health?.length ? (
        <p className="p-4 text-sm text-muted-foreground">No providers tracked.</p>
      ) : (
        health.map((p: any) => (
          <div key={p.providerId} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  p.status === "healthy" ? "bg-green-500" :
                  p.status === "degraded" ? "bg-yellow-500" :
                  "bg-red-500"
                }`}
              />
              <span className="text-sm font-medium">{p.providerName}</span>
              <span className="text-xs text-muted-foreground capitalize">{p.status}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {p.successCount} ok / {p.failureCount} fail
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function UsageStatsTab() {
  const [days, setDays] = useState(7);
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const { data: stats, isLoading } = trpc.multiProvider.getAdminUsageStats.useQuery({
    startDate: start.toISOString(),
    endDate: now.toISOString(),
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded px-3 py-1 text-xs ${
              days === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Total Requests</p>
            <p className="text-2xl font-bold">{stats.totalRequests.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="text-2xl font-bold">${stats.totalCostUsd.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Error Rate</p>
            <p className="text-2xl font-bold">{(stats.errorRate * 100).toFixed(1)}%</p>
          </div>
        </div>
      )}
    </div>
  );
}
