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
import { Lock, Info } from "lucide-react";
import { useScopedTranslation } from "../../i18n/useScopedTranslation";
import { trpc } from "../../lib/trpc";
import { formatModelCost } from "../../lib/modelPricing";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  canEnableAdminModelCatalogRow,
  filterAdminModelCatalogRows,
  filterModelMappingGroups,
  getAdminModelSelectionKey,
  type EnabledFilter,
} from "./multiProviderAdminModelMappings";

type Tab = "mappings" | "rules" | "health" | "usage";
const ALL_TABS: Tab[] = ["mappings", "rules", "health", "usage"];
const TAB_LABEL_KEYS: Record<Tab, string> = {
  mappings: "admin.multiProvider.tabs.mappings",
  rules: "admin.multiProvider.tabs.rules",
  health: "admin.multiProvider.tabs.health",
  usage: "admin.multiProvider.tabs.usage",
};

const CAPABILITY_FIELDS = [
  { key: "supportsVision", labelKey: "admin.capabilities.vision.label", shortKey: "admin.capabilities.vision.short" },
  { key: "supportsThinking", labelKey: "admin.capabilities.thinking.label", shortKey: "admin.capabilities.thinking.short" },
  { key: "supportsFunctionTools", labelKey: "admin.capabilities.functionTools.label", shortKey: "admin.capabilities.functionTools.short" },
  { key: "supportsStructuredOutputs", labelKey: "admin.capabilities.structuredOutputs.label", shortKey: "admin.capabilities.structuredOutputs.short" },
  { key: "supportsJsonMode", labelKey: "admin.capabilities.jsonMode.label", shortKey: "admin.capabilities.jsonMode.short" },
  { key: "supportsStrictToolSchema", labelKey: "admin.capabilities.strictToolSchema.label", shortKey: "admin.capabilities.strictToolSchema.short" },
  { key: "supportsWebSearch", labelKey: "admin.capabilities.webSearch.label", shortKey: "admin.capabilities.webSearch.short" },
  { key: "supportsComputerUse", labelKey: "admin.capabilities.computerUse.label", shortKey: "admin.capabilities.computerUse.short" },
  { key: "supportsCodeExecution", labelKey: "admin.capabilities.codeExecution.label", shortKey: "admin.capabilities.codeExecution.short" },
  { key: "supportsBackground", labelKey: "admin.capabilities.background.label", shortKey: "admin.capabilities.background.short" },
  { key: "supportsResponses", labelKey: "admin.capabilities.responses.label", shortKey: "admin.capabilities.responses.short" },
] as const;

interface MultiProviderAdminProps {
  tabs?: Tab[];
  defaultTab?: Tab;
}

export function MultiProviderAdmin({ tabs = ALL_TABS, defaultTab }: MultiProviderAdminProps) {
  const { t } = useScopedTranslation("admin");
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
              {t(TAB_LABEL_KEYS[tab])}
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
  // Model capabilities
  supportsVision: boolean;
  supportsThinking: boolean;
  supportsWebSearch: boolean;
  supportsFunctionTools: boolean;
  supportsStructuredOutputs: boolean;
  supportsJsonMode: boolean;
  supportsStrictToolSchema: boolean;
  supportsComputerUse: boolean;
  supportsCodeExecution: boolean;
  supportsBackground: boolean;
  supportsResponses: boolean;
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
  supportsVision: false,
  supportsThinking: false,
  supportsWebSearch: false,
  supportsFunctionTools: false,
  supportsStructuredOutputs: false,
  supportsJsonMode: false,
  supportsStrictToolSchema: false,
  supportsComputerUse: false,
  supportsCodeExecution: false,
  supportsBackground: false,
  supportsResponses: false,
};

function getCatalogEligibilityBadgeVariant(
  eligibility: "public-chat" | "manual-only" | "internal-only" | "deferred" | "invalid" | undefined,
): "default" | "secondary" | "outline" | "destructive" {
  switch (eligibility) {
    case "public-chat":
      return "default";
    case "manual-only":
      return "secondary";
    case "invalid":
      return "destructive";
    case "internal-only":
    case "deferred":
      return "outline";
    default:
      return "secondary";
  }
}

function PriorityInlineEditor({
  mappingId,
  priority,
  priorityLocked,
  onMutationSuccess,
}: {
  mappingId: number;
  priority: number;
  priorityLocked: boolean;
  onMutationSuccess: () => void;
}) {
  const { t } = useScopedTranslation("admin");
  const [localValue, setLocalValue] = useState(String(priority));
  const [lastSaved, setLastSaved] = useState(priority);

  useEffect(() => {
    setLocalValue(String(priority));
    setLastSaved(priority);
  }, [priority]);

  const mutation = trpc.multiProvider.updateModelPriority.useMutation({
    onError: () => {
      setLocalValue(String(lastSaved));
      toast.error(t("admin.multiProvider.priority.updateFailed"));
    },
  });

  const submitValue = () => {
    const numValue = Math.round(Number(localValue));
    if (isNaN(numValue) || numValue < 0 || numValue > 999) {
      setLocalValue(String(lastSaved));
      return;
    }
    if (numValue === lastSaved) {
      return;
    }
    setLocalValue(String(numValue));
    mutation.mutate({ mappingId, priority: numValue }, {
      onSuccess: () => {
        onMutationSuccess();
        setLastSaved(numValue);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{t("admin.multiProvider.priority.label")}</span>
      <input
        type="number"
        min={0}
        max={999}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={submitValue}
        onKeyDown={handleKeyDown}
        disabled={mutation.isPending}
        className="w-14 rounded border border-input bg-transparent px-1 py-0.5 text-xs text-center disabled:opacity-50"
        aria-label={t("admin.multiProvider.priority.ariaLabel")}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          {priorityLocked ? (
            <Lock size={14} className="text-muted-foreground" data-testid="priority-locked-icon" />
          ) : (
            <Info size={14} className="text-muted-foreground" data-testid="priority-auto-icon" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {priorityLocked
            ? t("admin.multiProvider.priority.lockedHelp")
            : t("admin.multiProvider.priority.autoHelp")}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function ModelMappingsTab() {
  type MappingView = "all" | "groups";
  const { t } = useScopedTranslation("admin");

  const { data: mappings, isLoading } = trpc.multiProvider.listModelMappings.useQuery();
  const { data: catalogRows, isLoading: isCatalogLoading } = trpc.multiProvider.listAdminModelCatalog.useQuery();
  const { data: providers } = trpc.llmProviders.adminList.useQuery();
  const upsertMutation = trpc.multiProvider.upsertModelMapping.useMutation();
  const deleteMutation = trpc.multiProvider.deleteModelMapping.useMutation();
  const bulkSetCatalogEnabledMutation = trpc.multiProvider.bulkSetAdminModelCatalogEnabled.useMutation();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<MappingForm>(emptyMappingForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [mappingView, setMappingView] = useState<MappingView>("all");

  const allSelectableKeys = useMemo(
    () => (catalogRows ?? []).map((row) => getAdminModelSelectionKey(row)),
    [catalogRows],
  );

  useEffect(() => {
    const validKeys = new Set(allSelectableKeys);
    setSelectedKeys((previous) => {
      const next = new Set(Array.from(previous).filter((key) => validKeys.has(key)));
      return next.size === previous.size ? previous : next;
    });
  }, [allSelectableKeys]);

  const filteredCatalogRows = useMemo(
    () => filterAdminModelCatalogRows(catalogRows, searchQuery, providerFilter, enabledFilter),
    [catalogRows, providerFilter, searchQuery, enabledFilter],
  );

  const filteredGroups = useMemo(
    () => filterModelMappingGroups({
      groupedMappings: mappings,
      searchQuery,
      providerFilter,
    }),
    [mappings, providerFilter, searchQuery],
  );

  const visibleSelectedCount = useMemo(
    () => filteredCatalogRows.filter((row) => selectedKeys.has(getAdminModelSelectionKey(row))).length,
    [filteredCatalogRows, selectedKeys],
  );
  const totalVisibleEnabled = useMemo(
    () => filteredCatalogRows.filter((mapping) => mapping.isEnabled).length,
    [filteredCatalogRows],
  );
  const allFilteredSelected = filteredCatalogRows.length > 0 && visibleSelectedCount === filteredCatalogRows.length;
  const someFilteredSelected = visibleSelectedCount > 0 && !allFilteredSelected;

  const resetForm = () => {
    setForm(emptyMappingForm);
    setEditId(null);
    setShowForm(false);
  };

  const invalidateMappingQueries = async () => {
    await Promise.all([
      utils.multiProvider.listModelMappings.invalidate(),
      utils.multiProvider.listAdminModelCatalog.invalidate(),
      utils.multiProvider.getAvailableModelsWithProviders.invalidate(),
      utils.llmProviders.adminList.invalidate(),
    ]);
  };

  const setSelectionForRows = (rows: Array<{ mappingId: number | null; providerId: number; providerModelId: string }>, checked: boolean) => {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      rows.forEach((row) => {
        const key = getAdminModelSelectionKey(row);
        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
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
      supportsVision: !!mapping.supportsVision,
      supportsThinking: !!mapping.supportsThinking,
      supportsWebSearch: !!mapping.supportsWebSearch,
      supportsFunctionTools: !!mapping.supportsFunctionTools,
      supportsStructuredOutputs: !!mapping.supportsStructuredOutputs,
      supportsJsonMode: !!mapping.supportsJsonMode,
      supportsStrictToolSchema: !!mapping.supportsStrictToolSchema,
      supportsComputerUse: !!mapping.supportsComputerUse,
      supportsCodeExecution: !!mapping.supportsCodeExecution,
      supportsBackground: !!mapping.supportsBackground,
      supportsResponses: !!mapping.supportsResponses,
    });
    setEditId(mapping.mappingId ?? mapping.id ?? null);
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
      supportsVision: form.supportsVision,
      supportsThinking: form.supportsThinking,
      supportsWebSearch: form.supportsWebSearch,
      supportsFunctionTools: form.supportsFunctionTools,
      supportsStructuredOutputs: form.supportsStructuredOutputs,
      supportsJsonMode: form.supportsJsonMode,
      supportsStrictToolSchema: form.supportsStrictToolSchema,
      supportsComputerUse: form.supportsComputerUse,
      supportsCodeExecution: form.supportsCodeExecution,
      supportsBackground: form.supportsBackground,
      supportsResponses: form.supportsResponses,
    });
    await invalidateMappingQueries();
    resetForm();
  };

  const handleSetEnabled = async (
    rows: Array<{
      mappingId: number | null;
      modelId: string;
      providerId: number;
      modelName: string;
      providerModelId: string;
      pricingInput: string;
      pricingOutput: string;
      isFree: boolean;
      contextLength: number | null;
      priority: number;
      apiStyle: MappingForm["apiStyle"];
      supportsVision?: boolean;
      supportsThinking?: boolean;
      supportsWebSearch?: boolean;
      supportsFunctionTools?: boolean;
      supportsStructuredOutputs?: boolean;
      supportsJsonMode?: boolean;
      supportsStrictToolSchema?: boolean;
      supportsComputerUse?: boolean;
      supportsCodeExecution?: boolean;
      supportsBackground?: boolean;
      supportsResponses?: boolean;
      catalogEligibility?: "public-chat" | "manual-only" | "internal-only" | "deferred" | "invalid";
    }>,
    isEnabled: boolean,
  ) => {
    const eligibleRows = isEnabled ? rows.filter((row) => canEnableAdminModelCatalogRow(row)) : rows;

    if (eligibleRows.length === 0) {
      toast.error(t("admin.multiProvider.mappings.selectAtLeastOne"));
      return;
    }

    const uniqueRows = Array.from(
      new Map(eligibleRows.map((row) => [getAdminModelSelectionKey(row), row])).values(),
    );
    const result = await bulkSetCatalogEnabledMutation.mutateAsync({
      items: uniqueRows.map((row) => ({
        mappingId: row.mappingId,
        modelId: row.modelId,
        providerId: row.providerId,
        modelName: row.modelName,
        providerModelId: row.providerModelId,
        pricingInput: Number(row.pricingInput),
        pricingOutput: Number(row.pricingOutput),
        isFree: row.isFree,
        contextLength: row.contextLength,
        priority: row.priority,
        apiStyle: row.apiStyle,
        supportsVision: !!row.supportsVision,
        supportsThinking: !!row.supportsThinking,
        supportsWebSearch: !!row.supportsWebSearch,
        supportsFunctionTools: !!row.supportsFunctionTools,
        supportsStructuredOutputs: !!row.supportsStructuredOutputs,
        supportsJsonMode: !!row.supportsJsonMode,
        supportsStrictToolSchema: !!row.supportsStrictToolSchema,
        supportsComputerUse: !!row.supportsComputerUse,
        supportsCodeExecution: !!row.supportsCodeExecution,
        supportsBackground: !!row.supportsBackground,
        supportsResponses: !!row.supportsResponses,
      })),
      isEnabled,
    });
    await invalidateMappingQueries();
    const changedCount = result.updatedCount + result.insertedCount;
    toast.success(
      t(
        isEnabled
          ? "admin.multiProvider.mappings.bulkEnabled"
          : "admin.multiProvider.mappings.bulkDisabled",
        { count: changedCount },
      ),
    );
    const affectedKeys = new Set(uniqueRows.map((row) => getAdminModelSelectionKey(row)));
    setSelectedKeys((previous) => new Set(Array.from(previous).filter((key) => !affectedKeys.has(key))));
  };

  if (isLoading || isCatalogLoading) return <div className="p-4 text-sm text-muted-foreground">{t("admin.multiProvider.loading")}</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("admin.multiProvider.mappings.searchPlaceholder")}
              className="md:max-w-md"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
            >
              <option value="all">{t("admin.multiProvider.mappings.filters.allProviders")}</option>
              {providers?.map((provider: any) => (
                <option key={provider.id} value={String(provider.id)}>
                  {provider.displayName} ({provider.providerName})
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={enabledFilter}
              onChange={(event) => setEnabledFilter(event.target.value as EnabledFilter)}
            >
              <option value="all">{t("admin.multiProvider.mappings.filters.allStatus")}</option>
              <option value="enabled">{t("admin.multiProvider.mappings.filters.enabledOnly")}</option>
              <option value="disabled">{t("admin.multiProvider.mappings.filters.disabledOnly")}</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
              <Checkbox
                checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => setSelectionForRows(filteredCatalogRows, checked === true)}
                aria-label={t("admin.multiProvider.mappings.selectAllFilteredAria")}
              />
              <span>{t("admin.multiProvider.mappings.selectFiltered")}</span>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionForRows(filteredCatalogRows, true)}
              disabled={filteredCatalogRows.length === 0}
            >
              {t("admin.multiProvider.mappings.selectAll")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionForRows(filteredCatalogRows, false)}
              disabled={visibleSelectedCount === 0}
            >
              {t("admin.multiProvider.mappings.clearFiltered")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSetEnabled(filteredCatalogRows, true)}
              disabled={filteredCatalogRows.length === 0 || bulkSetCatalogEnabledMutation.isPending}
            >
              {bulkSetCatalogEnabledMutation.isPending ? t("admin.multiProvider.working") : t("admin.multiProvider.mappings.enableVisible")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSetEnabled(filteredCatalogRows, false)}
              disabled={filteredCatalogRows.length === 0 || bulkSetCatalogEnabledMutation.isPending}
            >
              {bulkSetCatalogEnabledMutation.isPending ? t("admin.multiProvider.working") : t("admin.multiProvider.mappings.disableVisible")}
            </Button>
            <Button
              size="sm"
              onClick={() => handleSetEnabled(
                filteredCatalogRows.filter((row) => selectedKeys.has(getAdminModelSelectionKey(row))),
                true,
              )}
              disabled={selectedKeys.size === 0 || bulkSetCatalogEnabledMutation.isPending}
            >
              {bulkSetCatalogEnabledMutation.isPending ? t("admin.multiProvider.working") : t("admin.multiProvider.mappings.enableSelected")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSetEnabled(
                filteredCatalogRows.filter((row) => selectedKeys.has(getAdminModelSelectionKey(row))),
                false,
              )}
              disabled={selectedKeys.size === 0 || bulkSetCatalogEnabledMutation.isPending}
            >
              {bulkSetCatalogEnabledMutation.isPending ? t("admin.multiProvider.working") : t("admin.multiProvider.mappings.disableSelected")}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{t("admin.multiProvider.mappings.visibleModels", { count: filteredCatalogRows.length })}</Badge>
          <Badge variant="secondary">{t("admin.multiProvider.mappings.enabledInView", { count: totalVisibleEnabled })}</Badge>
          <Badge variant="secondary">{t("admin.multiProvider.mappings.groupsCount", { count: filteredGroups.length })}</Badge>
          <Badge variant={selectedKeys.size > 0 ? "default" : "secondary"}>
            {t("admin.multiProvider.mappings.selectedCount", { count: selectedKeys.size })}
          </Badge>
        </div>
      </div>

      <Button onClick={() => setShowForm(true)} className="w-fit" size="sm">
        {t("admin.multiProvider.mappings.addModelMapping")}
      </Button>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            resetForm();
            return;
          }
          setShowForm(true);
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? t("admin.multiProvider.mappings.editDialogTitle") : t("admin.multiProvider.mappings.addDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin.multiProvider.mappings.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.mappings.fields.modelId")}</span>
              <input
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder={t("admin.multiProvider.mappings.placeholders.modelId")}
                value={form.modelId}
                onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.mappings.fields.displayName")}</span>
              <input
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder={t("admin.multiProvider.mappings.placeholders.displayName")}
                value={form.modelName}
                onChange={(e) => setForm({ ...form, modelName: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.mappings.fields.provider")}</span>
              <select
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.providerId}
                onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              >
                <option value="">{t("admin.multiProvider.mappings.placeholders.selectProvider")}</option>
                {providers?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.displayName} ({p.providerName})</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.mappings.fields.providerModelId")}</span>
              <input
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder={t("admin.multiProvider.mappings.placeholders.providerModelId")}
                value={form.providerModelId}
                onChange={(e) => setForm({ ...form, providerModelId: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.mappings.fields.inputPrice")}</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.pricingInput}
                onChange={(e) => setForm({ ...form, pricingInput: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.mappings.fields.outputPrice")}</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.pricingOutput}
                onChange={(e) => setForm({ ...form, pricingOutput: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.mappings.fields.contextLength")}</span>
              <input
                type="number"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.contextLength}
                onChange={(e) => setForm({ ...form, contextLength: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.mappings.fields.priority")}</span>
              <input
                type="number"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.mappings.fields.apiStyle")}</span>
              <select
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.apiStyle}
                onChange={(e) => setForm({ ...form, apiStyle: e.target.value as MappingForm["apiStyle"] })}
              >
                <option value="chat-completions">{t("admin.multiProvider.mappings.apiStyles.chatCompletions")}</option>
                <option value="responses">{t("admin.multiProvider.mappings.apiStyles.responses")}</option>
                <option value="messages">{t("admin.multiProvider.mappings.apiStyles.messages")}</option>
                <option value="gemini">{t("admin.multiProvider.mappings.apiStyles.gemini")}</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFree}
                onChange={(e) => setForm({ ...form, isFree: e.target.checked })}
              />
              {t("admin.multiProvider.mappings.freeTier")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isEnabled}
                onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
              />
              {t("admin.multiProvider.status.enabled")}
            </label>
          </div>

          {/* Model Capabilities */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("admin.multiProvider.mappings.capabilities")}</p>
            <div className="flex flex-wrap items-center gap-4">
              {CAPABILITY_FIELDS.map(({ key, labelKey }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  />
                  {t(labelKey)}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetForm}>
              {t("admin.multiProvider.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.modelId || !form.providerId || upsertMutation.isPending}
            >
              {upsertMutation.isPending
                ? t("admin.multiProvider.saving")
                : editId
                  ? t("admin.multiProvider.mappings.updateMapping")
                  : t("admin.multiProvider.mappings.addMapping")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={mappingView} onValueChange={(value) => setMappingView(value as MappingView)} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="all">{t("admin.multiProvider.mappings.views.allModels")}</TabsTrigger>
          <TabsTrigger value="groups">{t("admin.multiProvider.mappings.views.groupControls")}</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3">
          {filteredCatalogRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("admin.multiProvider.mappings.noModelsMatch")}</p>
          ) : (
            filteredCatalogRows.map((mapping) => (
              <div
                key={getAdminModelSelectionKey(mapping)}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedKeys.has(getAdminModelSelectionKey(mapping))}
                    onCheckedChange={(checked) => setSelectionForRows([mapping], checked === true)}
                    aria-label={t("admin.multiProvider.mappings.selectMappingAria", {
                      modelId: mapping.modelId,
                      provider: mapping.providerDisplayName ?? mapping.providerName,
                    })}
                  />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{mapping.modelName}</span>
                      <Badge variant="secondary">{mapping.providerDisplayName ?? mapping.providerName}</Badge>
                      {mapping.modelId && mapping.modelId !== mapping.providerModelId && (
                        <Badge variant="outline">{mapping.modelId}</Badge>
                      )}
                      <Badge variant={mapping.isEnabled ? "default" : mapping.isMapped ? "outline" : "secondary"}>
                        {mapping.isEnabled
                          ? t("admin.multiProvider.status.enabled")
                          : mapping.isMapped
                            ? t("admin.multiProvider.status.disabled")
                            : t("admin.multiProvider.status.notConfigured")}
                      </Badge>
                      {mapping.isFree && (
                        <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10">{t("admin.multiProvider.status.free")}</Badge>
                      )}
                      {mapping.apiStyle !== "chat-completions" && (
                        <Badge variant="secondary">{mapping.apiStyle}</Badge>
                      )}
                      {mapping.catalogEligibility && (
                        <Badge variant={getCatalogEligibilityBadgeVariant(mapping.catalogEligibility)}>
                          {t(`admin.multiProvider.catalogEligibility.${mapping.catalogEligibility}`)}
                        </Badge>
                      )}
                      {mapping.ownedBy && (
                        <Badge variant="outline">
                          {t("admin.multiProvider.mappings.ownedBy", { owner: mapping.ownedBy })}
                        </Badge>
                      )}
                      {mapping.surface && mapping.surface !== "chat" && (
                        <Badge variant="outline">{mapping.surface}</Badge>
                      )}
                      {mapping.executionMode && mapping.executionMode !== "public" && (
                        <Badge variant="outline">{mapping.executionMode}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("admin.multiProvider.mappings.providerModel")} <code>{mapping.providerModelId}</code>
                    </div>
                    {mapping.catalogInvalidReason && (
                      <div className="text-xs text-destructive">
                        {t(`admin.multiProvider.catalogInvalidReason.${mapping.catalogInvalidReason}`)}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground items-center">
                      <span>{formatModelCost(mapping.pricingInput, mapping.pricingOutput, mapping.isFree)}</span>
                      <span>{t("admin.multiProvider.mappings.context", { count: (mapping.contextLength ?? 0).toLocaleString() })}</span>
                      {mapping.mappingId != null ? (
                        <PriorityInlineEditor
                          mappingId={mapping.mappingId}
                          priority={mapping.priority}
                          priorityLocked={mapping.priorityLocked ?? false}
                          onMutationSuccess={invalidateMappingQueries}
                        />
                      ) : (
                        <span>Priority: {mapping.priority}</span>
                      )}
                    </div>
                    {mapping.isMapped && (
                      <div className="flex flex-wrap gap-1">
                        {CAPABILITY_FIELDS.map(({ key, shortKey }) =>
                          mapping[key] ? (
                            <Badge key={key} variant="outline" className="text-[10px] px-1.5 py-0">
                              {t(shortKey)}
                            </Badge>
                          ) : null,
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={mapping.isEnabled ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleSetEnabled([mapping], !mapping.isEnabled)}
                    disabled={bulkSetCatalogEnabledMutation.isPending || (!mapping.isEnabled && !canEnableAdminModelCatalogRow(mapping))}
                  >
                    {mapping.isEnabled ? t("admin.multiProvider.disable") : t("admin.multiProvider.enable")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(mapping)}
                  >
                    {mapping.isMapped ? t("admin.multiProvider.edit") : t("admin.multiProvider.configure")}
                  </Button>
                  {mapping.mappingId != null && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        await deleteMutation.mutateAsync({ id: mapping.mappingId! });
                        await invalidateMappingQueries();
                        toast.success(t("admin.multiProvider.mappings.deleted"));
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      {t("admin.multiProvider.delete")}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          {filteredGroups.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("admin.multiProvider.mappings.noGroupsMatch")}</p>
          ) : (
            filteredGroups.map((group) => {
              const groupRows = group.models.map((mapping) => ({
                mappingId: mapping.id,
                modelId: mapping.modelId,
                providerId: mapping.providerId,
                modelName: mapping.modelName,
                providerModelId: mapping.providerModelId,
                pricingInput: mapping.pricingInput,
                pricingOutput: mapping.pricingOutput,
                isFree: mapping.isFree,
                contextLength: mapping.contextLength,
                priority: mapping.priority,
                apiStyle: mapping.apiStyle,
                catalogEligibility: mapping.catalogEligibility,
              }));
              const selectedInGroup = groupRows.filter((row) => selectedKeys.has(getAdminModelSelectionKey(row))).length;
              const allGroupSelected = groupRows.length > 0 && selectedInGroup === groupRows.length;
              const someGroupSelected = selectedInGroup > 0 && !allGroupSelected;

              return (
                <div key={group.modelId} className="rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-3 border-b border-border/60 pb-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={allGroupSelected ? true : someGroupSelected ? "indeterminate" : false}
                        onCheckedChange={(checked) => setSelectionForRows(groupRows, checked === true)}
                        aria-label={t("admin.multiProvider.mappings.selectGroupAria", { modelId: group.modelId })}
                      />
                      <div>
                        <h3 className="text-sm font-medium">{group.modelId}</h3>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="secondary">{t("admin.multiProvider.mappings.groupMappingsCount", { count: group.models.length })}</Badge>
                          <Badge variant={group.enabledCount > 0 ? "default" : "secondary"}>
                            {t("admin.multiProvider.mappings.groupEnabledCount", { count: group.enabledCount })}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetEnabled(groupRows, true)}
                        disabled={bulkSetCatalogEnabledMutation.isPending}
                      >
                        {t("admin.multiProvider.mappings.enableGroup")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetEnabled(groupRows, false)}
                        disabled={bulkSetCatalogEnabledMutation.isPending}
                      >
                        {t("admin.multiProvider.mappings.disableGroup")}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.models.map((mapping) => (
                      <div key={mapping.id} className="flex flex-col gap-3 rounded-md border border-border/60 p-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedKeys.has(getAdminModelSelectionKey({
                              mappingId: mapping.id,
                              providerId: mapping.providerId,
                              providerModelId: mapping.providerModelId,
                            }))}
                            onCheckedChange={(checked) => setSelectionForRows([{
                              mappingId: mapping.id,
                              providerId: mapping.providerId,
                              providerModelId: mapping.providerModelId,
                            }], checked === true)}
                            aria-label={t("admin.multiProvider.mappings.selectMappingAria", {
                              modelId: mapping.modelId,
                              provider: mapping.providerDisplayName ?? mapping.providerName,
                            })}
                          />
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">
                                {mapping.providerDisplayName ?? mapping.providerName}
                              </span>
                              {!mapping.isEnabled && (
                                <Badge variant="outline">{t("admin.multiProvider.status.disabled")}</Badge>
                              )}
                              {mapping.isFree && (
                                <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10">{t("admin.multiProvider.status.free")}</Badge>
                              )}
                              {mapping.apiStyle !== "chat-completions" && (
                                <Badge variant="secondary">{mapping.apiStyle}</Badge>
                              )}
                              {mapping.catalogEligibility && (
                                <Badge variant={getCatalogEligibilityBadgeVariant(mapping.catalogEligibility)}>
                                  {t(`admin.multiProvider.catalogEligibility.${mapping.catalogEligibility}`)}
                                </Badge>
                              )}
                              {mapping.ownedBy && (
                                <Badge variant="outline">
                                  {t("admin.multiProvider.mappings.ownedBy", { owner: mapping.ownedBy })}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t("admin.multiProvider.mappings.providerModel")} <code>{mapping.providerModelId}</code>
                            </div>
                            {mapping.catalogInvalidReason && (
                              <div className="text-xs text-destructive">
                                {t(`admin.multiProvider.catalogInvalidReason.${mapping.catalogInvalidReason}`)}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground items-center">
                              <span>{formatModelCost(mapping.pricingInput, mapping.pricingOutput, mapping.isFree)}</span>
                              <span>{t("admin.multiProvider.mappings.context", { count: (mapping.contextLength ?? 0).toLocaleString() })}</span>
                              <PriorityInlineEditor
                                mappingId={mapping.id}
                                priority={mapping.priority}
                                priorityLocked={mapping.priorityLocked ?? false}
                                onMutationSuccess={invalidateMappingQueries}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetEnabled([{
                              mappingId: mapping.id,
                              modelId: mapping.modelId,
                              providerId: mapping.providerId,
                              modelName: mapping.modelName,
                              providerModelId: mapping.providerModelId,
                              pricingInput: mapping.pricingInput,
                              pricingOutput: mapping.pricingOutput,
                              isFree: mapping.isFree,
                              contextLength: mapping.contextLength,
                              priority: mapping.priority,
                              apiStyle: mapping.apiStyle,
                              catalogEligibility: mapping.catalogEligibility,
                            }], !mapping.isEnabled)}
                            disabled={bulkSetCatalogEnabledMutation.isPending || (!mapping.isEnabled && !canEnableAdminModelCatalogRow(mapping))}
                          >
                            {mapping.isEnabled ? t("admin.multiProvider.disable") : t("admin.multiProvider.enable")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(mapping)}
                          >
                            {t("admin.multiProvider.edit")}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={async () => {
                              await deleteMutation.mutateAsync({ id: mapping.id });
                              await invalidateMappingQueries();
                              toast.success(t("admin.multiProvider.mappings.deleted"));
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            {t("admin.multiProvider.delete")}
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
  const { t } = useScopedTranslation("admin");
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

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">{t("admin.multiProvider.loading")}</div>;

  return (
    <div className="space-y-4">
      {/* Add / Edit form */}
      {showForm ? (
        <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
          <h4 className="text-sm font-medium">{editId ? t("admin.multiProvider.rules.editTitle") : t("admin.multiProvider.rules.addTitle")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.rules.modelPattern")}</span>
              <input
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder={t("admin.multiProvider.rules.modelPatternPlaceholder")}
                value={form.modelPattern}
                onChange={(e) => setForm({ ...form, modelPattern: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.rules.routingMode")}</span>
              <select
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.routingMode}
                onChange={(e) => setForm({ ...form, routingMode: e.target.value as RuleForm["routingMode"] })}
              >
                <option value="cost">{t("admin.multiProvider.rules.routingModes.cost")}</option>
                <option value="quality">{t("admin.multiProvider.rules.routingModes.quality")}</option>
                <option value="priority">{t("admin.multiProvider.rules.routingModes.priority")}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("admin.multiProvider.rules.maxFallbacks")}</span>
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
              {t("admin.multiProvider.rules.active")}
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!form.modelPattern || upsertMutation.isPending}
              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {upsertMutation.isPending ? t("admin.multiProvider.saving") : editId ? t("admin.multiProvider.rules.update") : t("admin.multiProvider.rules.addButton")}
            </button>
            <button
              onClick={resetForm}
              className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {t("admin.multiProvider.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("admin.multiProvider.rules.addButton")}
        </button>
      )}

      {/* Existing rules list */}
      {!rules?.length ? (
        <p className="p-4 text-sm text-muted-foreground">{t("admin.multiProvider.rules.empty")}</p>
      ) : (
        rules.map((rule: any) => (
          <div key={rule.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <code className="text-sm">{rule.modelPattern}</code>
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{rule.routingMode}</span>
              <span className="ml-2 text-xs text-muted-foreground">{t("admin.multiProvider.rules.maxFallbacksValue", { count: rule.maxFallbacks })}</span>
              {!rule.isActive && <span className="ml-2 text-xs text-yellow-500">{t("admin.multiProvider.rules.inactive")}</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(rule)}
                className="text-xs text-blue-500 hover:text-blue-400"
              >
                {t("admin.multiProvider.edit")}
              </button>
              <button
                onClick={async () => {
                  await deleteMutation.mutateAsync({ id: rule.id });
                  utils.multiProvider.listRoutingRules.invalidate();
                }}
                className="text-xs text-red-500 hover:text-red-400"
              >
                {t("admin.multiProvider.delete")}
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
  const { t } = useScopedTranslation("admin");
  const { data: health, isLoading } = trpc.multiProvider.getProviderHealth.useQuery();

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">{t("admin.multiProvider.loading")}</div>;

  return (
    <div className="space-y-2">
      {!health?.length ? (
        <p className="p-4 text-sm text-muted-foreground">{t("admin.multiProvider.health.empty")}</p>
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
              {t("admin.multiProvider.health.successFail", { ok: p.successCount, fail: p.failureCount })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Usage Stats ────────────────────────────────────────────────────

function UsageStatsTab() {
  const { t } = useScopedTranslation("admin");
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

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">{t("admin.multiProvider.loading")}</div>;

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
            {t("admin.multiProvider.usage.days", { count: d })}
          </button>
        ))}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">{t("admin.multiProvider.usage.totalRequests")}</p>
            <p className="text-2xl font-bold">{stats.totalRequests.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">{t("admin.multiProvider.usage.totalCost")}</p>
            <p className="text-2xl font-bold">${stats.totalCostUsd.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">{t("admin.multiProvider.usage.errorRate")}</p>
            <p className="text-2xl font-bold">{(stats.errorRate * 100).toFixed(1)}%</p>
          </div>
        </div>
      )}
    </div>
  );
}
