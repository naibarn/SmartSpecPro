/**
 * MultiProviderAdmin — Admin panel tabs for multi-provider management
 *
 * Contains four tabs:
 * 1. Model Mappings — CRUD for model-to-provider mappings
 * 2. Routing Rules — CRUD for routing rules
 * 3. Provider Health — Live health status display
 * 4. Usage Stats — Aggregated usage dashboard
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "../../lib/trpc";
import { formatModelCost } from "../../lib/modelPricing";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  filterFlatModelMappings,
  filterModelMappingGroups,
} from "./multiProviderAdminModelMappings";

type Tab = "mappings" | "rules" | "health" | "usage";
const ALL_TABS: Tab[] = ["mappings", "rules", "health", "usage"];
const TAB_LABELS: Record<Tab, string> = {
  mappings: "Model Mappings",
  rules: "Routing Rules",
  health: "Provider Health",
  usage: "Usage Stats",
};

interface MultiProviderAdminProps {
  tabs?: Tab[];
  defaultTab?: Tab;
}

export function MultiProviderAdmin({ tabs = ALL_TABS, defaultTab }: MultiProviderAdminProps) {
  const resolvedTabs = tabs.length > 0 ? tabs : ALL_TABS;
  const initialTab = resolvedTabs.includes(defaultTab ?? resolvedTabs[0]!) ? (defaultTab ?? resolvedTabs[0]!) : resolvedTabs[0]!;
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (!resolvedTabs.includes(activeTab)) {
      setActiveTab(initialTab);
    }
  }, [activeTab, initialTab, resolvedTabs]);

  return (
    <div className="space-y-4">
      {resolvedTabs.length > 1 && (
        <div className="flex gap-2 border-b border-border">
          {resolvedTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      )}

      {activeTab === "mappings" && resolvedTabs.includes("mappings") && <ModelMappingsTab />}
      {activeTab === "rules" && resolvedTabs.includes("rules") && <RoutingRulesTab />}
      {activeTab === "health" && resolvedTabs.includes("health") && <ProviderHealthTab />}
      {activeTab === "usage" && resolvedTabs.includes("usage") && <UsageStatsTab />}
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
  type MappingView = "all" | "groups";

  const { data: mappings, isLoading } = trpc.multiProvider.listModelMappings.useQuery();
  const { data: providers } = trpc.llmProviders.adminList.useQuery();
  const upsertMutation = trpc.multiProvider.upsertModelMapping.useMutation();
  const deleteMutation = trpc.multiProvider.deleteModelMapping.useMutation();
  const bulkSetEnabledMutation = trpc.multiProvider.bulkSetModelMappingsEnabled.useMutation();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<MappingForm>(emptyMappingForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mappingView, setMappingView] = useState<MappingView>("all");

  const allMappingIds = useMemo(
    () => Object.values(mappings ?? {}).flatMap((rows) => rows.map((row) => row.id)),
    [mappings],
  );

  useEffect(() => {
    const validIds = new Set(allMappingIds);
    setSelectedIds((previous) => {
      const next = new Set(Array.from(previous).filter((id) => validIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [allMappingIds]);

  const filteredMappings = useMemo(
    () => filterFlatModelMappings({
      groupedMappings: mappings,
      searchQuery,
      providerFilter,
    }),
    [mappings, providerFilter, searchQuery],
  );

  const filteredGroups = useMemo(
    () => filterModelMappingGroups({
      groupedMappings: mappings,
      searchQuery,
      providerFilter,
    }),
    [mappings, providerFilter, searchQuery],
  );

  const visibleMappingIds = useMemo(() => filteredMappings.map((mapping) => mapping.id), [filteredMappings]);
  const visibleSelectedCount = useMemo(
    () => visibleMappingIds.filter((id) => selectedIds.has(id)).length,
    [selectedIds, visibleMappingIds],
  );
  const totalVisibleEnabled = useMemo(
    () => filteredMappings.filter((mapping) => mapping.isEnabled).length,
    [filteredMappings],
  );
  const allFilteredSelected = visibleMappingIds.length > 0 && visibleSelectedCount === visibleMappingIds.length;
  const someFilteredSelected = visibleSelectedCount > 0 && !allFilteredSelected;

  const resetForm = () => {
    setForm(emptyMappingForm);
    setEditId(null);
    setShowForm(false);
  };

  const invalidateMappingQueries = async () => {
    await Promise.all([
      utils.multiProvider.listModelMappings.invalidate(),
      utils.multiProvider.getAvailableModelsWithProviders.invalidate(),
      utils.llmProviders.adminList.invalidate(),
    ]);
  };

  const setSelectionForIds = (ids: number[], checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  };

  const handleEdit = (mapping: any) => {
    setForm({
      modelId: mapping.modelId ?? "",
      modelName: mapping.modelName ?? "",
      providerId: String(mapping.providerId ?? ""),
      providerModelId: mapping.providerModelId ?? "",
      pricingInput: String(mapping.pricingInput ?? 0),
      pricingOutput: String(mapping.pricingOutput ?? 0),
      isFree: !!mapping.isFree,
      contextLength: String(mapping.contextLength ?? 128000),
      isEnabled: mapping.isEnabled !== false,
      priority: String(mapping.priority ?? 0),
      apiStyle: mapping.apiStyle ?? "chat-completions",
    });
    setEditId(mapping.id);
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
    await invalidateMappingQueries();
    resetForm();
  };

  const handleSetEnabled = async (ids: number[], isEnabled: boolean) => {
    if (ids.length === 0) {
      toast.error("Select at least one model mapping first");
      return;
    }

    const uniqueIds = Array.from(new Set(ids));
    await bulkSetEnabledMutation.mutateAsync({ ids: uniqueIds, isEnabled });
    await invalidateMappingQueries();
    toast.success(
      `${isEnabled ? "Enabled" : "Disabled"} ${uniqueIds.length} model mapping${uniqueIds.length > 1 ? "s" : ""}`,
    );
    setSelectedIds((previous) => new Set(Array.from(previous).filter((id) => !uniqueIds.includes(id))));
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search model id, display name, provider, or provider model id"
              className="md:max-w-md"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
            >
              <option value="all">All providers</option>
              {providers?.map((provider: any) => (
                <option key={provider.id} value={String(provider.id)}>
                  {provider.displayName} ({provider.providerName})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
              <Checkbox
                checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => setSelectionForIds(visibleMappingIds, checked === true)}
                aria-label="Select all filtered model mappings"
              />
              <span>Select Filtered</span>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionForIds(visibleMappingIds, true)}
              disabled={visibleMappingIds.length === 0}
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionForIds(visibleMappingIds, false)}
              disabled={visibleSelectedCount === 0}
            >
              Clear Filtered
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSetEnabled(visibleMappingIds, true)}
              disabled={visibleMappingIds.length === 0 || bulkSetEnabledMutation.isPending}
            >
              {bulkSetEnabledMutation.isPending ? "Working..." : "Enable Visible"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSetEnabled(visibleMappingIds, false)}
              disabled={visibleMappingIds.length === 0 || bulkSetEnabledMutation.isPending}
            >
              {bulkSetEnabledMutation.isPending ? "Working..." : "Disable Visible"}
            </Button>
            <Button
              size="sm"
              onClick={() => handleSetEnabled(Array.from(selectedIds), true)}
              disabled={selectedIds.size === 0 || bulkSetEnabledMutation.isPending}
            >
              {bulkSetEnabledMutation.isPending ? "Working..." : "Enable Selected"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSetEnabled(Array.from(selectedIds), false)}
              disabled={selectedIds.size === 0 || bulkSetEnabledMutation.isPending}
            >
              {bulkSetEnabledMutation.isPending ? "Working..." : "Disable Selected"}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{visibleMappingIds.length} visible models</Badge>
          <Badge variant="secondary">{totalVisibleEnabled} enabled in view</Badge>
          <Badge variant="secondary">{filteredGroups.length} groups</Badge>
          <Badge variant={selectedIds.size > 0 ? "default" : "secondary"}>
            {selectedIds.size} selected
          </Badge>
        </div>
      </div>

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
        <Button onClick={() => setShowForm(true)} className="w-fit" size="sm">
          + Add Model Mapping
        </Button>
      )}

      <Tabs value={mappingView} onValueChange={(value) => setMappingView(value as MappingView)} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="all">All Models</TabsTrigger>
          <TabsTrigger value="groups">Group Controls</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3">
          {filteredMappings.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No model mappings match the current filters.</p>
          ) : (
            filteredMappings.map((mapping) => (
              <div
                key={mapping.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.has(mapping.id)}
                    onCheckedChange={(checked) => setSelectionForIds([mapping.id], checked === true)}
                    aria-label={`Select mapping ${mapping.modelId} on ${mapping.providerDisplayName ?? mapping.providerName}`}
                  />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{mapping.modelId}</span>
                      <Badge variant="secondary">{mapping.providerDisplayName ?? mapping.providerName}</Badge>
                      {mapping.modelName && mapping.modelName !== mapping.modelId && (
                        <Badge variant="outline">{mapping.modelName}</Badge>
                      )}
                      <Badge variant={mapping.isEnabled ? "default" : "outline"}>
                        {mapping.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                      {mapping.isFree && (
                        <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10">Free</Badge>
                      )}
                      {mapping.apiStyle !== "chat-completions" && (
                        <Badge variant="secondary">{mapping.apiStyle}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Provider model: <code>{mapping.providerModelId}</code>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{formatModelCost(mapping.pricingInput, mapping.pricingOutput, mapping.isFree)}</span>
                      <span>Context: {(mapping.contextLength ?? 0).toLocaleString()}</span>
                      <span>Priority: {mapping.priority}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={mapping.isEnabled ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleSetEnabled([mapping.id], !mapping.isEnabled)}
                    disabled={bulkSetEnabledMutation.isPending}
                  >
                    {mapping.isEnabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(mapping)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      await deleteMutation.mutateAsync({ id: mapping.id });
                      await invalidateMappingQueries();
                      toast.success("Model mapping deleted");
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          {filteredGroups.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No model groups match the current filters.</p>
          ) : (
            filteredGroups.map((group) => {
              const groupIds = group.models.map((mapping) => mapping.id);
              const selectedInGroup = groupIds.filter((id) => selectedIds.has(id)).length;
              const allGroupSelected = groupIds.length > 0 && selectedInGroup === groupIds.length;
              const someGroupSelected = selectedInGroup > 0 && !allGroupSelected;

              return (
                <div key={group.modelId} className="rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-3 border-b border-border/60 pb-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={allGroupSelected ? true : someGroupSelected ? "indeterminate" : false}
                        onCheckedChange={(checked) => setSelectionForIds(groupIds, checked === true)}
                        aria-label={`Select all mappings for ${group.modelId}`}
                      />
                      <div>
                        <h3 className="text-sm font-medium">{group.modelId}</h3>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="secondary">{group.models.length} mappings</Badge>
                          <Badge variant={group.enabledCount > 0 ? "default" : "secondary"}>
                            {group.enabledCount} enabled
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetEnabled(groupIds, true)}
                        disabled={bulkSetEnabledMutation.isPending}
                      >
                        Enable Group
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetEnabled(groupIds, false)}
                        disabled={bulkSetEnabledMutation.isPending}
                      >
                        Disable Group
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.models.map((mapping) => (
                      <div key={mapping.id} className="flex flex-col gap-3 rounded-md border border-border/60 p-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedIds.has(mapping.id)}
                            onCheckedChange={(checked) => setSelectionForIds([mapping.id], checked === true)}
                            aria-label={`Select mapping ${mapping.modelId} on ${mapping.providerDisplayName ?? mapping.providerName}`}
                          />
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">
                                {mapping.providerDisplayName ?? mapping.providerName}
                              </span>
                              {!mapping.isEnabled && (
                                <Badge variant="outline">Disabled</Badge>
                              )}
                              {mapping.isFree && (
                                <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10">Free</Badge>
                              )}
                              {mapping.apiStyle !== "chat-completions" && (
                                <Badge variant="secondary">{mapping.apiStyle}</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Provider model: <code>{mapping.providerModelId}</code>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span>{formatModelCost(mapping.pricingInput, mapping.pricingOutput, mapping.isFree)}</span>
                              <span>Context: {(mapping.contextLength ?? 0).toLocaleString()}</span>
                              <span>Priority: {mapping.priority}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetEnabled([mapping.id], !mapping.isEnabled)}
                            disabled={bulkSetEnabledMutation.isPending}
                          >
                            {mapping.isEnabled ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(mapping)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={async () => {
                              await deleteMutation.mutateAsync({ id: mapping.id });
                              await invalidateMappingQueries();
                              toast.success("Model mapping deleted");
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>
      </Tabs>
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
