/**
 * MultiProviderAdmin — Admin panel tabs for multi-provider management
 *
 * Contains four tabs:
 * 1. Model Mappings — CRUD for model-to-provider mappings
 * 2. Routing Rules — CRUD for routing rules
 * 3. Provider Health — Live health status display
 * 4. Usage Stats — Aggregated usage dashboard
 */

import { useState, useMemo } from "react";
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

// ─── Model Mappings ─────────────────────────────────────────────────

interface MappingForm {
  modelId: string;
  modelName: string;
  providerId: string;
  providerModelId: string;
  pricingInput: string;
  pricingOutput: string;
  isFree: boolean;
  contextLength: string;
  isEnabled: boolean;
  priority: string;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
}

const emptyMappingForm: MappingForm = {
  modelId: "",
  modelName: "",
  providerId: "",
  providerModelId: "",
  pricingInput: "0",
  pricingOutput: "0",
  isFree: false,
  contextLength: "128000",
  isEnabled: true,
  priority: "0",
  apiStyle: "chat-completions",
};

function ModelMappingsTab() {
  const { data: mappings, isLoading } = trpc.multiProvider.listModelMappings.useQuery();
  const { data: providers } = trpc.llmProviders.adminList.useQuery();
  const upsertMutation = trpc.multiProvider.upsertModelMapping.useMutation();
  const deleteMutation = trpc.multiProvider.deleteModelMapping.useMutation();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<MappingForm>(emptyMappingForm);

  const resetForm = () => {
    setForm(emptyMappingForm);
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (m: any) => {
    setForm({
      modelId: m.modelId ?? "",
      modelName: m.modelName ?? "",
      providerId: String(m.providerId ?? ""),
      providerModelId: m.providerModelId ?? "",
      pricingInput: String(m.pricingInput ?? 0),
      pricingOutput: String(m.pricingOutput ?? 0),
      isFree: !!m.isFree,
      contextLength: String(m.contextLength ?? 128000),
      isEnabled: m.isEnabled !== false,
      priority: String(m.priority ?? 0),
      apiStyle: m.apiStyle ?? "chat-completions",
    });
    setEditId(m.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    await upsertMutation.mutateAsync({
      ...(editId ? { id: editId } : {}),
      modelId: form.modelId,
      modelName: form.modelName || form.modelId,
      providerId: Number(form.providerId),
      providerModelId: form.providerModelId || form.modelId,
      pricingInput: Number(form.pricingInput),
      pricingOutput: Number(form.pricingOutput),
      isFree: form.isFree,
      contextLength: Number(form.contextLength) || 128000,
      isEnabled: form.isEnabled,
      priority: Number(form.priority) || 0,
      apiStyle: form.apiStyle,
    });
    utils.multiProvider.listModelMappings.invalidate();
    resetForm();
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  const groups = mappings ? Object.entries(mappings) : [];

  return (
    <div className="space-y-4">
      {/* Add / Edit form */}
      {showForm ? (
        <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
          <h4 className="text-sm font-medium">{editId ? "Edit Mapping" : "Add Model Mapping"}</h4>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Model ID *</span>
              <input
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder="e.g. kimi-k2.5"
                value={form.modelId}
                onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Display Name</span>
              <input
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder="e.g. Kimi K2.5"
                value={form.modelName}
                onChange={(e) => setForm({ ...form, modelName: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Provider *</span>
              <select
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.providerId}
                onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              >
                <option value="">-- Select provider --</option>
                {providers?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.displayName} ({p.providerName})</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Provider Model ID</span>
              <input
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder="e.g. moonshotai/kimi-k2.5"
                value={form.providerModelId}
                onChange={(e) => setForm({ ...form, providerModelId: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Input Price (per 1M tokens)</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.pricingInput}
                onChange={(e) => setForm({ ...form, pricingInput: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Output Price (per 1M tokens)</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.pricingOutput}
                onChange={(e) => setForm({ ...form, pricingOutput: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Context Length</span>
              <input
                type="number"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.contextLength}
                onChange={(e) => setForm({ ...form, contextLength: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Priority (lower = higher)</span>
              <input
                type="number"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">API Style</span>
              <select
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.apiStyle}
                onChange={(e) => setForm({ ...form, apiStyle: e.target.value as MappingForm["apiStyle"] })}
              >
                <option value="chat-completions">Chat Completions (/chat/completions)</option>
                <option value="responses">Responses (/responses - GPT)</option>
                <option value="messages">Messages (/messages - Claude)</option>
                <option value="gemini">Gemini (/models/id)</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFree}
                onChange={(e) => setForm({ ...form, isFree: e.target.checked })}
              />
              Free tier
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isEnabled}
                onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
              />
              Enabled
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!form.modelId || !form.providerId || upsertMutation.isPending}
              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {upsertMutation.isPending ? "Saving..." : editId ? "Update" : "Add Mapping"}
            </button>
            <button
              onClick={resetForm}
              className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Add Model Mapping
        </button>
      )}

      {/* Existing mappings list */}
      {groups.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No model mappings configured.</p>
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
                    {m.apiStyle && m.apiStyle !== "chat-completions" && (
                      <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-500">{m.apiStyle}</span>
                    )}
                    {!m.isEnabled && (
                      <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-500">disabled</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(m)}
                      className="text-xs text-blue-500 hover:text-blue-400"
                    >
                      Edit
                    </button>
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
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Routing Rules ──────────────────────────────────────────────────

interface RuleForm {
  modelPattern: string;
  routingMode: "cost" | "quality" | "priority";
  maxFallbacks: string;
  isActive: boolean;
}

const emptyRuleForm: RuleForm = {
  modelPattern: "*",
  routingMode: "cost",
  maxFallbacks: "3",
  isActive: true,
};

function RoutingRulesTab() {
  const { data: rules, isLoading } = trpc.multiProvider.listRoutingRules.useQuery();
  const upsertMutation = trpc.multiProvider.upsertRoutingRule.useMutation();
  const deleteMutation = trpc.multiProvider.deleteRoutingRule.useMutation();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyRuleForm);

  const resetForm = () => {
    setForm(emptyRuleForm);
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (rule: any) => {
    setForm({
      modelPattern: rule.modelPattern ?? "*",
      routingMode: rule.routingMode ?? "cost",
      maxFallbacks: String(rule.maxFallbacks ?? 3),
      isActive: rule.isActive !== false,
    });
    setEditId(rule.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    await upsertMutation.mutateAsync({
      ...(editId ? { id: editId } : {}),
      modelPattern: form.modelPattern,
      routingMode: form.routingMode,
      maxFallbacks: Number(form.maxFallbacks) || 3,
      isActive: form.isActive,
    });
    utils.multiProvider.listRoutingRules.invalidate();
    resetForm();
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Add / Edit form */}
      {showForm ? (
        <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
          <h4 className="text-sm font-medium">{editId ? "Edit Rule" : "Add Routing Rule"}</h4>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Model Pattern *</span>
              <input
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder="* or gpt-* or exact-model-id"
                value={form.modelPattern}
                onChange={(e) => setForm({ ...form, modelPattern: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Routing Mode *</span>
              <select
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.routingMode}
                onChange={(e) => setForm({ ...form, routingMode: e.target.value as RuleForm["routingMode"] })}
              >
                <option value="cost">Cost (cheapest first)</option>
                <option value="quality">Quality (best rated first)</option>
                <option value="priority">Priority (manual order)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Max Fallbacks</span>
              <input
                type="number"
                min={0}
                max={10}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.maxFallbacks}
                onChange={(e) => setForm({ ...form, maxFallbacks: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm self-end pb-1">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!form.modelPattern || upsertMutation.isPending}
              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {upsertMutation.isPending ? "Saving..." : editId ? "Update" : "Add Rule"}
            </button>
            <button
              onClick={resetForm}
              className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Add Routing Rule
        </button>
      )}

      {/* Existing rules list */}
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
            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(rule)}
                className="text-xs text-blue-500 hover:text-blue-400"
              >
                Edit
              </button>
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
          </div>
        ))
      )}
    </div>
  );
}

// ─── Provider Health ────────────────────────────────────────────────

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

// ─── Usage Stats ────────────────────────────────────────────────────

function UsageStatsTab() {
  const [days, setDays] = useState(7);

  // Memoize date range to prevent infinite re-fetching
  const dateRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      startDate: start.toISOString(),
      endDate: now.toISOString(),
    };
  }, [days]);

  const { data: stats, isLoading } = trpc.multiProvider.getAdminUsageStats.useQuery(dateRange);

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
