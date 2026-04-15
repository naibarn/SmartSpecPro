import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Loader2, Plus, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
  financeSlipMappingPresetCollectionSchema,
  type FinanceCounterpartySuggestion,
  type FinanceSlipMappingPreset,
} from "../../../../shared/finance";

type FinanceSettingsRow = {
  key: string;
  value?: string | null;
  valueJson?: unknown | null;
};

function getSetting(settings: FinanceSettingsRow[] | undefined, key: string): FinanceSettingsRow | undefined {
  return settings?.find((row) => row.key === key);
}

function parseSlipMappingPresetsRow(row?: FinanceSettingsRow | undefined): FinanceSlipMappingPreset[] {
  const raw = typeof row?.value === "string" ? row.value.trim() : "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const collection = financeSlipMappingPresetCollectionSchema.safeParse(parsed);
      if (collection.success && collection.data.presets.length > 0) {
        return collection.data.presets;
      }
    } catch {
      // fall back to defaults below
    }
  }

  if (row?.valueJson && typeof row.valueJson === "object") {
    const collection = financeSlipMappingPresetCollectionSchema.safeParse(row.valueJson);
    if (collection.success && collection.data.presets.length > 0) {
      return collection.data.presets;
    }
  }

  return DEFAULT_FINANCE_SLIP_MAPPING_PRESETS;
}

function parsePinnedMerchantPresetsRow(row?: FinanceSettingsRow | undefined): FinanceSlipMappingPreset[] {
  const raw = typeof row?.value === "string" ? row.value.trim() : "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const collection = financeSlipMappingPresetCollectionSchema.safeParse(parsed);
      if (collection.success) {
        return collection.data.presets;
      }
    } catch {
      // fall back to empty below
    }
  }

  if (row?.valueJson && typeof row.valueJson === "object") {
    const collection = financeSlipMappingPresetCollectionSchema.safeParse(row.valueJson);
    if (collection.success) {
      return collection.data.presets;
    }
  }

  return [];
}

function normalizePresetRow(preset: FinanceSlipMappingPreset, index: number): FinanceSlipMappingPreset {
  return {
    ...preset,
    id: preset.id.trim() || `preset-${index + 1}`,
    label: preset.label.trim() || `Preset ${index + 1}`,
    matchText: preset.matchText.trim(),
    categoryCode: preset.categoryCode.trim() || "other.misc",
    counterpartyName: preset.counterpartyName?.trim() || null,
    merchantName: preset.merchantName?.trim() || null,
    note: preset.note?.trim() || null,
    priority: Number.isFinite(preset.priority) ? Math.max(0, Math.floor(preset.priority)) : 0,
    enabled: Boolean(preset.enabled),
    transactionType: preset.transactionType,
  };
}

function normalizePinnedMerchantPresetRow(preset: FinanceSlipMappingPreset, index: number): FinanceSlipMappingPreset {
  const merchantName = preset.merchantName?.trim() || preset.counterpartyName?.trim() || preset.label.trim() || `Merchant ${index + 1}`;
  const matchText = preset.matchText.trim() || merchantName || preset.label.trim() || `Merchant ${index + 1}`;
  return {
    ...preset,
    id: preset.id.trim() || `merchant-pin-${index + 1}`,
    label: preset.label.trim() || merchantName,
    matchText,
    transactionType: preset.transactionType,
    categoryCode: preset.categoryCode.trim() || "other.misc",
    counterpartyName: preset.counterpartyName?.trim() || null,
    merchantName,
    note: preset.note?.trim() || null,
    priority: Number.isFinite(preset.priority) ? Math.max(0, Math.floor(preset.priority)) : 0,
    enabled: Boolean(preset.enabled),
  };
}

function buildMerchantPinDefaults(candidate: FinanceCounterpartySuggestion): FinanceSlipMappingPreset {
  const aliases = Array.from(new Set([candidate.displayName, ...candidate.aliases].filter((value) => value.trim().length > 0)));
  return {
    id: `merchant-pin-${candidate.id}`,
    enabled: true,
    label: candidate.displayName,
    matchText: aliases.join("|"),
    transactionType: "expense",
    categoryCode: "other.misc",
    counterpartyName: candidate.displayName,
    merchantName: candidate.displayName,
    note: `Pinned from merchant search · used ${candidate.usageCount} times`,
    priority: candidate.usageCount > 0 ? candidate.usageCount * 10 : 10,
  };
}

function normalizeSearchKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreMerchantCandidate(candidate: FinanceCounterpartySuggestion, queryKey: string): number {
  if (!queryKey) {
    return candidate.usageCount * 10 + candidate.aliases.length;
  }

  const tokens = queryKey.split(" ").filter(Boolean);
  const normalizedDisplay = normalizeSearchKey(candidate.displayName);
  const normalizedAliases = candidate.aliases.map((alias) => normalizeSearchKey(alias));

  let score = 0;
  if (normalizedDisplay === queryKey) score += 1000;
  if (normalizedDisplay.startsWith(queryKey)) score += 500;
  if (normalizedDisplay.includes(queryKey)) score += 250;
  if (normalizedAliases.some((alias) => alias === queryKey)) score += 400;
  if (normalizedAliases.some((alias) => alias.startsWith(queryKey))) score += 200;
  if (normalizedAliases.some((alias) => alias.includes(queryKey))) score += 120;

  tokens.forEach((token) => {
    if (normalizedDisplay.includes(token)) score += 24;
    if (normalizedAliases.some((alias) => alias.includes(token))) score += 16;
  });

  return score + Math.max(0, candidate.usageCount);
}

function highlightSearchText(text: string, query: string): ReactNode {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return text;
  }

  const normalizedText = text.toLowerCase();
  const normalizedQuery = cleanQuery.toLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  if (matchIndex < 0) {
    return text;
  }

  const matchEnd = matchIndex + cleanQuery.length;
  return (
    <>
      {text.slice(0, matchIndex)}
      <span className="rounded bg-amber-100 px-0.5 font-medium text-slate-900">{text.slice(matchIndex, matchEnd)}</span>
      {text.slice(matchEnd)}
    </>
  );
}

function isPinnedMerchantCandidate(
  candidate: FinanceCounterpartySuggestion,
  pinnedMerchantPresets: FinanceSlipMappingPreset[],
): boolean {
  const candidateKeys = new Set(
    [candidate.displayName, ...candidate.aliases]
      .map((value) => normalizeSearchKey(value))
      .filter((value) => value.length > 0),
  );

  return pinnedMerchantPresets.some((preset) => {
    const presetKeys = [preset.merchantName, preset.counterpartyName, preset.label]
      .map((value) => normalizeSearchKey(value ?? ""))
      .filter((value) => value.length > 0);
    return presetKeys.some((key) => candidateKeys.has(key));
  });
}

export default function FinanceSlipRulesPanel() {
  const { user } = useAuth();
  const financeEnabled = !!user && user.role === "admin";
  const [slipMappingPresets, setSlipMappingPresets] = useState<FinanceSlipMappingPreset[]>(DEFAULT_FINANCE_SLIP_MAPPING_PRESETS);
  const [pinnedMerchantPresets, setPinnedMerchantPresets] = useState<FinanceSlipMappingPreset[]>([]);
  const [merchantPinSearch, setMerchantPinSearch] = useState("");
  const [merchantQuickFilter, setMerchantQuickFilter] = useState<"all" | "pinned" | "recent">("all");
  const [showSlipPresets, setShowSlipPresets] = useState(false);
  const [showPinnedMerchantDrawer, setShowPinnedMerchantDrawer] = useState(true);
  const [savingSettingKey, setSavingSettingKey] = useState<string | null>(null);
  const lastAutoPinnedFilterQueryRef = useRef<string | null>(null);
  const { data: financeSettings, refetch: refetchFinanceSettings } = trpc.systemSettings.getSettingsByCategory.useQuery(
    { category: "finance" as any },
    { enabled: financeEnabled },
  );
  const { data: merchantCandidates, isLoading: merchantCandidatesLoading } = trpc.finance.listMerchantPinCandidates.useQuery(
    { query: merchantPinSearch.trim().length > 0 ? merchantPinSearch.trim() : null, limit: 10 },
    { enabled: financeEnabled },
  );
  const updateSettingMutation = trpc.systemSettings.updateSetting.useMutation({
    onError: (err: any) => toast.error(err.message),
  });

  useEffect(() => {
    if (!financeSettings) return;
    const slipRow = getSetting(financeSettings, "slip_mapping_presets");
    const pinRow = getSetting(financeSettings, "pinned_merchant_presets");
    setSlipMappingPresets(parseSlipMappingPresetsRow(slipRow));
    setPinnedMerchantPresets(parsePinnedMerchantPresetsRow(pinRow));
  }, [financeSettings]);

  const isSaving = (key: string) => savingSettingKey === key;
  const normalizedMerchantPinQuery = useMemo(() => normalizeSearchKey(merchantPinSearch), [merchantPinSearch]);
  const rankedMerchantCandidates = useMemo(() => {
    const rows = merchantCandidates ?? [];
    const filtered = rows.filter((candidate) => {
      if (merchantQuickFilter === "pinned") {
        return isPinnedMerchantCandidate(candidate, pinnedMerchantPresets);
      }
      if (merchantQuickFilter === "recent") {
        if (!candidate.lastSeenAt) return false;
        const lastSeenAt = new Date(candidate.lastSeenAt).getTime();
        return Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt <= 1000 * 60 * 60 * 24 * 30;
      }
      return true;
    });

    if (!normalizedMerchantPinQuery) {
      return filtered;
    }
    return [...filtered].sort((left, right) => (
      scoreMerchantCandidate(right, normalizedMerchantPinQuery) - scoreMerchantCandidate(left, normalizedMerchantPinQuery)
      || right.usageCount - left.usageCount
      || left.displayName.localeCompare(right.displayName)
    ));
  }, [merchantCandidates, merchantQuickFilter, normalizedMerchantPinQuery, pinnedMerchantPresets]);
  const pinnedMerchantSummary = useMemo(() => (
    [...pinnedMerchantPresets]
      .filter((preset) => preset.enabled)
      .sort((left, right) => right.priority - left.priority || left.label.localeCompare(right.label))
      .slice(0, 3)
  ), [pinnedMerchantPresets]);
  const enabledPinnedMerchantCount = useMemo(
    () => pinnedMerchantPresets.filter((preset) => preset.enabled).length,
    [pinnedMerchantPresets],
  );
  const nextPinnedMerchantPriority = useMemo(() => (
    pinnedMerchantPresets.length > 0
      ? Math.max(...pinnedMerchantPresets.map((preset) => preset.priority)) + 10
      : 10
  ), [pinnedMerchantPresets]);

  useEffect(() => {
    if (!normalizedMerchantPinQuery || normalizedMerchantPinQuery.length < 3) {
      return;
    }
    if (merchantQuickFilter !== "all") {
      return;
    }
    if (lastAutoPinnedFilterQueryRef.current === normalizedMerchantPinQuery) {
      return;
    }
    if (!rankedMerchantCandidates.some((candidate) => isPinnedMerchantCandidate(candidate, pinnedMerchantPresets))) {
      return;
    }

    lastAutoPinnedFilterQueryRef.current = normalizedMerchantPinQuery;
    setMerchantQuickFilter("pinned");
  }, [merchantQuickFilter, normalizedMerchantPinQuery, pinnedMerchantPresets, rankedMerchantCandidates]);

  const updateSlipPreset = <K extends keyof FinanceSlipMappingPreset>(
    index: number,
    key: K,
    value: FinanceSlipMappingPreset[K],
  ) => {
    setSlipMappingPresets((current) => current.map((preset, presetIndex) => (
      presetIndex === index
        ? { ...preset, [key]: value }
        : preset
    )));
  };

  const updatePinnedMerchantPreset = <K extends keyof FinanceSlipMappingPreset>(
    index: number,
    key: K,
    value: FinanceSlipMappingPreset[K],
  ) => {
    setPinnedMerchantPresets((current) => current.map((preset, presetIndex) => (
      presetIndex === index
        ? { ...preset, [key]: value }
        : preset
    )));
  };

  const addSlipPreset = () => {
    setSlipMappingPresets((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        enabled: true,
        label: "Custom preset",
        matchText: "",
        transactionType: "expense",
        categoryCode: "other.misc",
        counterpartyName: null,
        merchantName: null,
        note: null,
        priority: current.length > 0 ? Math.max(...current.map((preset) => preset.priority)) + 10 : 0,
      },
    ]);
  };

  const addPinnedMerchantPreset = () => {
    setPinnedMerchantPresets((current) => [
      ...current,
      {
        id: `merchant-pin-${Date.now()}`,
        enabled: true,
        label: "Pinned merchant",
        matchText: "",
        transactionType: "expense",
        categoryCode: "other.misc",
        counterpartyName: null,
        merchantName: "",
        note: null,
        priority: current.length > 0 ? Math.max(...current.map((preset) => preset.priority)) + 10 : 10,
      },
    ]);
  };

  const addMerchantPinFromCandidate = (candidate: FinanceCounterpartySuggestion) => {
    const preset = buildMerchantPinDefaults(candidate);
    setPinnedMerchantPresets((current) => {
      const normalizedName = normalizeSearchKey(candidate.displayName);
      const existingIndex = current.findIndex((item) => (
        normalizeSearchKey(item.merchantName ?? item.counterpartyName ?? item.label) === normalizedName
      ));
      if (existingIndex >= 0) {
        return current.map((item, index) => (
          index === existingIndex
            ? {
                ...item,
                enabled: true,
                label: item.label || preset.label,
                matchText: item.matchText || preset.matchText,
                counterpartyName: item.counterpartyName ?? preset.counterpartyName,
                merchantName: item.merchantName || preset.merchantName,
                note: item.note || preset.note,
                categoryCode: item.categoryCode || preset.categoryCode,
                priority: Math.max(item.priority, preset.priority),
              }
            : item
        ));
      }
      return [...current, { ...preset, priority: Math.max(nextPinnedMerchantPriority, preset.priority) }];
    });
    toast.success(`Prepared merchant pin for ${candidate.displayName}`);
  };

  const removeSlipPreset = (index: number) => {
    setSlipMappingPresets((current) => current.filter((_, presetIndex) => presetIndex !== index));
  };

  const removePinnedMerchantPreset = (index: number) => {
    setPinnedMerchantPresets((current) => current.filter((_, presetIndex) => presetIndex !== index));
  };

  const resetSlipPresets = () => {
    setSlipMappingPresets(DEFAULT_FINANCE_SLIP_MAPPING_PRESETS);
  };

  const resetPinnedMerchantPresets = () => {
    setPinnedMerchantPresets([]);
  };

  async function saveSlipMappingPresets() {
    setSavingSettingKey("slip_mapping_presets");
    try {
      const normalized = slipMappingPresets
        .map((preset, index) => normalizePresetRow(preset, index))
        .filter((preset) => preset.label.trim().length > 0 && preset.matchText.trim().length > 0);

      await updateSettingMutation.mutateAsync({
        category: "finance" as any,
        key: "slip_mapping_presets",
        value: JSON.stringify({
          version: 1,
          presets: normalized,
        }),
        description: "Finance slip mapping presets for common income and expense categories",
      });
      await refetchFinanceSettings();
      toast.success("Finance slip presets saved");
    } finally {
      setSavingSettingKey((current) => (current === "slip_mapping_presets" ? null : current));
    }
  }

  async function savePinnedMerchantPresets() {
    setSavingSettingKey("pinned_merchant_presets");
    try {
      const normalized = pinnedMerchantPresets
        .map((preset, index) => normalizePinnedMerchantPresetRow(preset, index))
        .filter((preset) => preset.label.trim().length > 0 && preset.merchantName.trim().length > 0);

      await updateSettingMutation.mutateAsync({
        category: "finance" as any,
        key: "pinned_merchant_presets",
        value: JSON.stringify({
          version: 1,
          presets: normalized,
        }),
        description: "Pinned merchant presets for frequent merchants",
      });
      await refetchFinanceSettings();
      toast.success("Pinned merchant presets saved");
    } finally {
      setSavingSettingKey((current) => (current === "pinned_merchant_presets" ? null : current));
    }
  }

  return (
    <DashboardCard
      className="overflow-hidden"
      leading={<Check className="w-5 h-5 text-blue-600" />}
      title="Finance Rules"
      description="Separate slip mapping and merchant pin rules from OCR routing so admins can manage parsing behavior without mixing it with provider credentials."
      bodyClassName="space-y-8 p-6"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <div className="font-medium text-slate-900">How this works</div>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          OCR or the unified LLM slip parser reads the file first. These rules are applied after parsing to normalize merchant names, categories, and common labels.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Merchant pins</div>
          <div className="text-xs text-muted-foreground">
            Search merchants that already exist in the system, then pin the important ones so Finance suggests them first.
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="xl:sticky xl:top-4 xl:z-20 xl:rounded-2xl xl:border xl:border-slate-200 xl:bg-white/95 xl:p-4 xl:shadow-sm xl:backdrop-blur">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-1">
                <Label htmlFor="merchant-pin-search">Search existing merchants</Label>
                <div className="relative">
                  <Input
                    id="merchant-pin-search"
                    value={merchantPinSearch}
                    onChange={(event) => setMerchantPinSearch(event.target.value)}
                    placeholder="Search merchant name or alias"
                    className="pr-10"
                  />
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={addPinnedMerchantPreset} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add manual pin
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">Search from existing Finance merchants</Badge>
              <Badge variant="outline">{enabledPinnedMerchantCount} pin{enabledPinnedMerchantCount === 1 ? "" : "s"}</Badge>
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                Suggested before generic presets
              </Badge>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="md:hidden h-8 max-w-full justify-between gap-2 px-3"
                  onClick={() => setShowPinnedMerchantDrawer((current) => !current)}
                >
                  <span className="truncate font-medium">Pinned now</span>
                  <Badge variant="secondary" className="h-5 border-slate-200 bg-white px-1.5 text-[11px]">
                    {enabledPinnedMerchantCount}
                  </Badge>
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showPinnedMerchantDrawer ? "rotate-180" : ""}`} />
                </Button>
                <div className="hidden min-w-0 items-center gap-2 md:flex">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Pinned now</div>
                  <Badge variant="outline">{enabledPinnedMerchantCount}</Badge>
                  <span className="hidden text-xs text-slate-500 md:inline">Pin drawer</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden h-8 px-2 text-slate-500 md:inline-flex"
                  onClick={() => setShowPinnedMerchantDrawer((current) => !current)}
                >
                  {showPinnedMerchantDrawer ? "Hide" : "Show"}
                </Button>
              </div>
              {showPinnedMerchantDrawer ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                  <div className="flex flex-wrap gap-2">
                    {pinnedMerchantSummary.length > 0 ? (
                      <>
                        {pinnedMerchantSummary.map((preset) => (
                          <Badge key={preset.id} variant="secondary" className="max-w-full truncate">
                            {preset.merchantName || preset.label}
                          </Badge>
                        ))}
                        {enabledPinnedMerchantCount > pinnedMerchantSummary.length ? (
                          <Badge variant="outline">
                            +{enabledPinnedMerchantCount - pinnedMerchantSummary.length} more
                          </Badge>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-sm text-slate-500">No merchant pins yet. Search a merchant and pin the important ones first.</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-500">
                  Pinned merchants collapsed. Show it when you need a quick reminder.
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant={merchantQuickFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setMerchantQuickFilter("all")}
              >
                All merchants
              </Button>
              <Button
                type="button"
                variant={merchantQuickFilter === "pinned" ? "default" : "outline"}
                size="sm"
                onClick={() => setMerchantQuickFilter("pinned")}
              >
                Pinned only
              </Button>
              <Button
                type="button"
                variant={merchantQuickFilter === "recent" ? "default" : "outline"}
                size="sm"
                onClick={() => setMerchantQuickFilter("recent")}
              >
                Recently seen
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Quick filters narrow the list without forcing another search.</span>
              {merchantQuickFilter !== "all" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-slate-500"
                  onClick={() => setMerchantQuickFilter("all")}
                >
                  Clear filter
                </Button>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={resetPinnedMerchantPresets} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Reset pins
              </Button>
              <Button
                type="button"
                onClick={savePinnedMerchantPresets}
                disabled={updateSettingMutation.isPending || !!savingSettingKey}
                className="gap-2"
              >
                {isSaving("pinned_merchant_presets") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save merchant pins
              </Button>
            </div>
          </div>
          {merchantCandidatesLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-500">
              Loading merchant candidates...
            </div>
          ) : rankedMerchantCandidates.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rankedMerchantCandidates.map((candidate) => (
                <div key={`${candidate.normalizedName}-${candidate.id}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">{highlightSearchText(candidate.displayName, merchantPinSearch)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Used {candidate.usageCount} times
                        {candidate.lastSeenAt ? ` · last seen ${new Date(candidate.lastSeenAt).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline">{candidate.aliases.length} alias{candidate.aliases.length === 1 ? "" : "es"}</Badge>
                  </div>
                  {candidate.aliases.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {candidate.aliases.slice(0, 4).map((alias) => (
                        <Badge key={`${candidate.id}-${alias}`} variant="secondary" className="max-w-full truncate">
                          {highlightSearchText(alias, merchantPinSearch)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 w-full justify-between"
                    onClick={() => addMerchantPinFromCandidate(candidate)}
                  >
                    <span>Pin merchant</span>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-500">
              No merchant candidates found. Try a different search term, switch the quick filter, or add a manual pin.
            </div>
          )}
          <div className="space-y-4">
            {pinnedMerchantPresets.map((preset, index) => (
              <div key={preset.id || `${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Pinned merchant {index + 1}</div>
                    <Input
                      value={preset.label}
                      onChange={(event) => updatePinnedMerchantPreset(index, "label", event.target.value)}
                      placeholder="Pinned merchant label"
                      className="max-w-xl"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={preset.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}
                    >
                      {preset.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-slate-500"
                      onClick={() => updatePinnedMerchantPreset(index, "enabled", !preset.enabled)}
                    >
                      {preset.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-slate-500"
                      onClick={() => removePinnedMerchantPreset(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Merchant name</Label>
                    <Input
                      value={preset.merchantName ?? ""}
                      onChange={(event) => updatePinnedMerchantPreset(index, "merchantName", event.target.value || null)}
                      placeholder="SCB / Starbucks / 7-Eleven"
                    />
                    <p className="text-xs text-muted-foreground">This is the merchant name Finance tries to match first.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Match text / aliases</Label>
                    <Input
                      value={preset.matchText}
                      onChange={(event) => updatePinnedMerchantPreset(index, "matchText", event.target.value)}
                      placeholder="aliases, store codes, or slip keywords"
                    />
                    <p className="text-xs text-muted-foreground">Use pipes, commas, or line breaks to separate aliases.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Transaction type</Label>
                    <Select
                      value={preset.transactionType}
                      onValueChange={(value) => updatePinnedMerchantPreset(
                        index,
                        "transactionType",
                        value === "income" || value === "transfer" ? value : "expense",
                      )}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Category code</Label>
                    <Input
                      value={preset.categoryCode}
                      onChange={(event) => updatePinnedMerchantPreset(index, "categoryCode", event.target.value)}
                      placeholder="food / transport / income.freelance"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Priority</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={preset.priority}
                      onChange={(event) => updatePinnedMerchantPreset(index, "priority", Number.parseInt(event.target.value, 10) || 0)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Counterparty name</Label>
                    <Input
                      value={preset.counterpartyName ?? ""}
                      onChange={(event) => updatePinnedMerchantPreset(index, "counterpartyName", event.target.value || null)}
                      placeholder="Optional display name"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Note</Label>
                    <Input
                      value={preset.note ?? ""}
                      onChange={(event) => updatePinnedMerchantPreset(index, "note", event.target.value || null)}
                      placeholder="Why this merchant is pinned"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Slip mapping presets</div>
            <div className="text-xs text-muted-foreground">
              Match parsed slip text against reusable rules so common merchants, income sources, and expense categories are filled in automatically.
              These rules run after OCR or LLM parsing, so they stay separate from provider routing and credential settings.
            </div>
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={() => setShowSlipPresets((current) => !current)}>
            {showSlipPresets ? "Hide presets" : "Show presets"}
          </Button>
        </div>
        {showSlipPresets ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Matched after OCR / LLM parsing</Badge>
            <Badge variant="outline">
              {slipMappingPresets.length} preset{slipMappingPresets.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
              Applies to income, expense, and transfer slips
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={addSlipPreset} className="gap-2">
              <Plus className="h-4 w-4" />
              Add preset
            </Button>
            <Button type="button" variant="outline" onClick={resetSlipPresets} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset to defaults
            </Button>
            <Button
              type="button"
              onClick={saveSlipMappingPresets}
              disabled={updateSettingMutation.isPending || !!savingSettingKey}
              className="gap-2"
            >
              {isSaving("slip_mapping_presets") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save slip presets
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            {slipMappingPresets.map((preset, index) => (
              <div key={preset.id || `${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Preset {index + 1}</div>
                    <Input
                      value={preset.label}
                      onChange={(event) => updateSlipPreset(index, "label", event.target.value)}
                      placeholder="Preset label"
                      className="max-w-xl"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={preset.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}
                    >
                      {preset.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-slate-500"
                      onClick={() => updateSlipPreset(index, "enabled", !preset.enabled)}
                    >
                      {preset.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-slate-500"
                      onClick={() => removeSlipPreset(index)}
                      disabled={slipMappingPresets.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Match text / aliases</Label>
                    <Input
                      value={preset.matchText}
                      onChange={(event) => updateSlipPreset(index, "matchText", event.target.value)}
                      placeholder="grab | bolt | taxi"
                    />
                    <p className="text-xs text-muted-foreground">Separate aliases with pipes, commas, or line breaks.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Transaction type</Label>
                    <Select
                      value={preset.transactionType}
                      onValueChange={(value) => updateSlipPreset(
                        index,
                        "transactionType",
                        value === "income" || value === "transfer" ? value : "expense",
                      )}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Category code</Label>
                    <Input
                      value={preset.categoryCode}
                      onChange={(event) => updateSlipPreset(index, "categoryCode", event.target.value)}
                      placeholder="transport / food / income.salary"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Priority</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={preset.priority}
                      onChange={(event) => updateSlipPreset(index, "priority", Number.parseInt(event.target.value, 10) || 0)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Counterparty name</Label>
                    <Input
                      value={preset.counterpartyName ?? ""}
                      onChange={(event) => updateSlipPreset(index, "counterpartyName", event.target.value || null)}
                      placeholder="Employer / Merchant / Cafe name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Merchant name</Label>
                    <Input
                      value={preset.merchantName ?? ""}
                      onChange={(event) => updateSlipPreset(index, "merchantName", event.target.value || null)}
                      placeholder="Optional merchant name"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Note</Label>
                    <Input
                      value={preset.note ?? ""}
                      onChange={(event) => updateSlipPreset(index, "note", event.target.value || null)}
                      placeholder="Short note to attach to the draft"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-xs text-slate-600">
            <div className="font-medium text-slate-800">How it works</div>
            <ul className="mt-2 space-y-1">
              <li>• OCR or the LLM slip parser reads the slip first.</li>
              <li>• These presets then normalize the transaction type, category, and common merchant labels.</li>
              <li>• Higher priority rules win when multiple presets match the same slip text.</li>
            </ul>
          </div>
        </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-600">
            Slip mapping presets are collapsed by default to keep merchant pinning fast. Open them only when you need to tune income, expense, or transfer mapping rules.
          </div>
        )}
      </section>
    </DashboardCard>
  );
}
