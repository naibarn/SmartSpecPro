import { Fragment, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { pickEnabledModelId } from "@/lib/enabledModelSelection";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Loader2, Plus, Save, X } from "lucide-react";

interface TenantAutomationPolicyPanelProps {
  title?: string;
  description?: string;
}

interface AvailableVisionModel {
  id: string;
  name?: string;
  provider?: string;
  providerDisplayName?: string;
}

function normalizeModelSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s./:_-]+/g, "");
}

export function TenantAutomationPolicyPanel({
  title = "Tenant Baseline Policy",
  description = "Configure the tenant-wide browser-policy baseline and define which personal restrictions users may apply for themselves.",
}: TenantAutomationPolicyPanelProps) {
  const { user } = useAuth();
  const canManageTenantPolicy = user?.role === "admin" || user?.role === "domain_admin";
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [policyMode, setPolicyMode] = useState<
    "observe" | "read_only" | "draft" | "commit" | "expanded"
  >("observe");
  const [approvalTtlSeconds, setApprovalTtlSeconds] = useState(300);
  const [reviewCadenceDays, setReviewCadenceDays] = useState(90);
  const [evidenceRetentionDays, setEvidenceRetentionDays] = useState(365);
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(false);
  const [requireTamperEvidence, setRequireTamperEvidence] = useState(true);
  const [visionModel, setVisionModel] = useState("");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [allowedVisionModels, setAllowedVisionModels] = useState<string[]>([]);
  const [allowPersonalDomainSubset, setAllowPersonalDomainSubset] = useState(true);
  const [allowModeCap, setAllowModeCap] = useState(true);
  const [allowTransferBlocks, setAllowTransferBlocks] = useState(true);
  const [allowApprovalTtlCap, setAllowApprovalTtlCap] = useState(true);
  const [allowActionApprovalEscalation, setAllowActionApprovalEscalation] = useState(true);
  const [allowPreferredVisionModel, setAllowPreferredVisionModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [allowlistSearch, setAllowlistSearch] = useState("");

  const policyStatusQuery = trpc.systemSettings.getTenantAutomationPolicyStatus.useQuery(undefined, {
    enabled: canManageTenantPolicy,
  });
  const { data: modelsData, isLoading: modelsLoading } =
    trpc.llmProviders.availableModels.useQuery(undefined, {
      enabled: canManageTenantPolicy,
      staleTime: 60_000,
    });
  const updateMutation = trpc.systemSettings.updateTenantAutomationPolicySettings.useMutation({
    onSuccess: () => {
      toast.success("Tenant baseline policy saved");
      policyStatusQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const tenantStorageUnavailable = policyStatusQuery.data?.storageStatus === "schema_missing";
  const tenantPolicyStatusUnavailable =
    policyStatusQuery.isError || !policyStatusQuery.data || tenantStorageUnavailable;

  useEffect(() => {
    const config = policyStatusQuery.data?.policyConfig;
    if (config) {
      setPolicyEnabled(config.enabled);
      setPolicyMode(config.enforcementMode);
      setApprovalTtlSeconds(config.defaultApprovalTtlSeconds);
      setReviewCadenceDays(config.reviewCadenceDays);
      setKillSwitchEnabled(config.killSwitchEnabled);
      setRequireTamperEvidence(config.requireTamperEvidence);
      setEvidenceRetentionDays(config.evidenceRetentionDays);
      setVisionModel(config.visionModel);
      setAllowedDomains(config.allowedDomains.join(", "));
    }
    const customization = policyStatusQuery.data?.userCustomization;
    if (customization) {
      setAllowPersonalDomainSubset(customization.allowPersonalDomainSubset);
      setAllowModeCap(customization.allowModeCap);
      setAllowTransferBlocks(customization.allowTransferBlocks);
      setAllowApprovalTtlCap(customization.allowApprovalTtlCap);
      setAllowActionApprovalEscalation(customization.allowActionApprovalEscalation);
      setAllowPreferredVisionModel(customization.allowPreferredVisionModel);
    }
    const allowedModels = policyStatusQuery.data?.allowedVisionModels;
    if (allowedModels) {
      setAllowedVisionModels(allowedModels);
    }
  }, [policyStatusQuery.data]);

  if (!canManageTenantPolicy) {
    return null;
  }

  const allModels = (modelsData?.models ?? []) as AvailableVisionModel[];
  const matchesModelSearch = (model: AvailableVisionModel, search: string) => {
    const normalizedSearch = normalizeModelSearchText(search);
    if (!normalizedSearch) {
      return true;
    }

    return [
      model.id,
      model.name,
      model.providerDisplayName,
      model.provider,
    ].some((value) => normalizeModelSearchText(value).includes(normalizedSearch));
  };
  const filteredModels = modelSearch
    ? allModels.filter(
        (model) => matchesModelSearch(model, modelSearch),
      )
    : allModels;
  const groupedModels = filteredModels.reduce(
    (acc: Record<string, typeof filteredModels>, model) => {
      const key = model.providerDisplayName || model.provider || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(model);
      return acc;
    },
    {} as Record<string, typeof filteredModels>,
  );
  const allowlistResults = allModels
    .filter((model) => !allowedVisionModels.includes(model.id))
    .filter((model) => matchesModelSearch(model, allowlistSearch))
    .slice(0, allowlistSearch.trim() ? 12 : 8);
  const selectedAllowlistModels = allowedVisionModels.map((modelId) => ({
    id: modelId,
    details: allModels.find((model) => model.id === modelId) ?? null,
  }));

  useEffect(() => {
    if (!modelsData?.models) {
      return;
    }

    const availableModelIds = allModels.map((model) => model.id);
    const nextVisionModel = pickEnabledModelId({
      preferredId: visionModel,
      allowedIds: availableModelIds,
      fallbackIds: [availableModelIds[0]],
    });
    const nextAllowedVisionModels = allowedVisionModels.filter((modelId) => availableModelIds.includes(modelId));

    if (nextVisionModel !== visionModel) {
      setVisionModel(nextVisionModel);
    }
    if (nextAllowedVisionModels.length !== allowedVisionModels.length) {
      setAllowedVisionModels(nextAllowedVisionModels);
    }
  }, [allModels, allowedVisionModels, modelsData?.models, visionModel]);

  const addAllowedVisionModel = (modelId: string) => {
    setAllowedVisionModels((current) =>
      current.includes(modelId) ? current : [...current, modelId],
    );
    setAllowlistSearch("");
  };

  const removeAllowedVisionModel = (modelId: string) => {
    setAllowedVisionModels((current) => current.filter((value) => value !== modelId));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        enabled: policyEnabled,
        enforcementMode: policyMode,
        defaultApprovalTtlSeconds: approvalTtlSeconds,
        reviewCadenceDays,
        killSwitchEnabled,
        requireTamperEvidence,
        evidenceRetentionDays,
        allowedDomains: allowedDomains
          .split(",")
          .map((domain) => domain.trim())
          .filter(Boolean),
        visionModel,
        allowedVisionModels,
        userCustomization: {
          allowPersonalDomainSubset,
          allowModeCap,
          allowTransferBlocks,
          allowApprovalTtlCap,
          allowActionApprovalEscalation,
          allowPreferredVisionModel,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-purple-500" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {policyStatusQuery.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            Tenant-wide policy status could not be loaded. Saving stays disabled until browser-policy storage is available.
          </div>
        )}

        {tenantStorageUnavailable && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Tenant baseline storage is not ready in this environment yet. Personal user preferences still work, but tenant-wide baseline saves stay disabled until the browser-policy migration is applied.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Tenant Baseline Enabled</Label>
                <p className="text-xs text-slate-500">Master enable for tenant-wide browser-policy evaluation.</p>
              </div>
              <Switch checked={policyEnabled} onCheckedChange={setPolicyEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Kill Switch</Label>
                <p className="text-xs text-slate-500">Immediately fail closed for all browser actions in this tenant.</p>
              </div>
              <Switch checked={killSwitchEnabled} onCheckedChange={setKillSwitchEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Tamper-Evident Audit</Label>
                <p className="text-xs text-slate-500">Require audit persistence before execution continues.</p>
              </div>
              <Switch checked={requireTamperEvidence} onCheckedChange={setRequireTamperEvidence} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="space-y-2">
              <Label>Enforcement Mode</Label>
              <Select value={policyMode} onValueChange={(value) => setPolicyMode(value as typeof policyMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select enforcement mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="observe">Observe</SelectItem>
                  <SelectItem value="read_only">Read Only</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="commit">Commit</SelectItem>
                  <SelectItem value="expanded">Expanded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Approval TTL</Label>
                <Input
                  type="number"
                  min={policyStatusQuery.data?.platformGuardrails.minApprovalTtlSeconds ?? 60}
                  max={policyStatusQuery.data?.platformGuardrails.maxApprovalTtlSeconds ?? 900}
                  value={approvalTtlSeconds}
                  onChange={(e) => setApprovalTtlSeconds(Number(e.target.value) || 300)}
                />
              </div>
              <div className="space-y-2">
                <Label>Review Cadence</Label>
                <Input
                  type="number"
                  min={1}
                  value={reviewCadenceDays}
                  onChange={(e) => setReviewCadenceDays(Number(e.target.value) || 90)}
                />
              </div>
              <div className="space-y-2">
                <Label>Evidence Retention</Label>
                <Input
                  type="number"
                  min={1}
                  value={evidenceRetentionDays}
                  onChange={(e) => setEvidenceRetentionDays(Number(e.target.value) || 365)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Default Vision Model</Label>
          <Select value={visionModel} onValueChange={setVisionModel}>
            <SelectTrigger>
              <SelectValue placeholder="Select vision model" />
            </SelectTrigger>
            <SelectContent className="max-h-[min(300px,var(--radix-select-content-available-height))]">
              <div className="sticky top-0 z-10 bg-popover px-2 pb-1.5 pt-1">
                <Input
                  placeholder="Search models..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              {modelsLoading && (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading models...
                </div>
              )}
              {Object.entries(groupedModels).map(([providerName, models]) => (
                <Fragment key={providerName}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {providerName}
                  </div>
                  {models.map((model: any) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name || model.id}
                    </SelectItem>
                  ))}
                </Fragment>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Allowed Domains</Label>
            <Textarea
              value={allowedDomains}
              onChange={(e) => setAllowedDomains(e.target.value)}
              placeholder="example.com, app.example.com"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label>Vision Model Allowlist</Label>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-3">
              <Input
                value={allowlistSearch}
                onChange={(e) => setAllowlistSearch(e.target.value)}
                placeholder="Search system models to add..."
              />
              <div className="flex flex-wrap gap-2">
                {selectedAllowlistModels.length > 0 ? selectedAllowlistModels.map(({ id, details }) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="flex items-center gap-2 rounded-full px-3 py-1"
                  >
                    <span>{details?.name || id}</span>
                    <button
                      type="button"
                      onClick={() => removeAllowedVisionModel(id)}
                      className="rounded-full p-0.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                      aria-label={`Remove ${id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )) : (
                  <p className="text-sm text-slate-500">No allowlist models selected yet.</p>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {modelsLoading ? (
                  <div className="flex items-center justify-center py-6 text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading models...
                  </div>
                ) : allowlistResults.length > 0 ? (
                  allowlistResults.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => addAllowedVisionModel(model.id)}
                      className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left transition hover:bg-slate-50 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {model.name || model.id}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {model.providerDisplayName || model.provider || "Other"} · {model.id}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700">
                        <Plus className="h-3 w-3" />
                        Add
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-6 text-sm text-slate-500">
                    No matching models found in the system registry.
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Users can only pick personal overrides from this set when user-level model selection is enabled.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">User Customization Policy</h3>
            <p className="text-xs text-slate-500">
              Define which personal restrictions users are allowed to add on top of the tenant baseline.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Allow personal domain subset", allowPersonalDomainSubset, setAllowPersonalDomainSubset],
              ["Allow personal mode cap", allowModeCap, setAllowModeCap],
              ["Allow transfer blocks", allowTransferBlocks, setAllowTransferBlocks],
              ["Allow shorter approval TTL", allowApprovalTtlCap, setAllowApprovalTtlCap],
              ["Allow extra approval escalation", allowActionApprovalEscalation, setAllowActionApprovalEscalation],
              ["Allow preferred vision model", allowPreferredVisionModel, setAllowPreferredVisionModel],
            ].map(([label, value, setter]) => (
              <div key={label as string} className="flex items-center justify-between rounded-lg border bg-white p-3">
                <Label>{label as string}</Label>
                <Switch checked={value as boolean} onCheckedChange={setter as (next: boolean) => void} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={policyStatusQuery.data?.legacyUiConnected ? "secondary" : "destructive"}>
              {policyStatusQuery.data?.legacyUiConnected ? "Legacy UI Connected" : "Legacy UI Drift"}
            </Badge>
            <Badge variant="outline">
              Platform ceiling: {policyStatusQuery.data?.platformGuardrails.maxEnforcementMode ?? "expanded"}
            </Badge>
            <Badge variant={policyStatusQuery.data?.policyConfig.requireTamperEvidence ? "secondary" : "outline"}>
              {policyStatusQuery.data?.policyConfig.requireTamperEvidence
                ? "Audit Fail-Closed"
                : "Audit Best-Effort"}
            </Badge>
          </div>
          <p className="text-xs text-slate-600">
            Effective source: <strong>{policyStatusQuery.data?.policyConfig.source ?? "seeded"}</strong>
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || policyStatusQuery.isLoading || tenantPolicyStatusUnavailable}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Tenant Baseline
        </Button>
      </CardContent>
    </Card>
  );
}
