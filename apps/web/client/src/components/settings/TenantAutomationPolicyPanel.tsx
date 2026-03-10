import { Fragment, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
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
import { Bot, Loader2, Save } from "lucide-react";

interface TenantAutomationPolicyPanelProps {
  title?: string;
  description?: string;
}

export function TenantAutomationPolicyPanel({
  title = "Tenant Automation Policy",
  description = "Configure tenant baseline browser-policy and the user customization envelope.",
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
  const [visionModel, setVisionModel] = useState("gpt-4o");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [allowedVisionModels, setAllowedVisionModels] = useState("");
  const [allowPersonalDomainSubset, setAllowPersonalDomainSubset] = useState(true);
  const [allowModeCap, setAllowModeCap] = useState(true);
  const [allowTransferBlocks, setAllowTransferBlocks] = useState(true);
  const [allowApprovalTtlCap, setAllowApprovalTtlCap] = useState(true);
  const [allowActionApprovalEscalation, setAllowActionApprovalEscalation] = useState(true);
  const [allowPreferredVisionModel, setAllowPreferredVisionModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

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
      toast.success("Automation policy saved");
      policyStatusQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

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
      setAllowedVisionModels(allowedModels.join(", "));
    }
  }, [policyStatusQuery.data]);

  if (!canManageTenantPolicy) {
    return null;
  }

  const allModels = modelsData?.models ?? [];
  const filteredModels = modelSearch
    ? allModels.filter(
        (model: any) =>
          model.id.toLowerCase().includes(modelSearch.toLowerCase())
          || model.name.toLowerCase().includes(modelSearch.toLowerCase())
          || model.providerDisplayName?.toLowerCase().includes(modelSearch.toLowerCase()),
      )
    : allModels;
  const groupedModels = filteredModels.reduce(
    (acc: Record<string, typeof filteredModels>, model: any) => {
      const key = model.providerDisplayName || model.provider || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(model);
      return acc;
    },
    {} as Record<string, typeof filteredModels>,
  );

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
        allowedVisionModels: allowedVisionModels
          .split(",")
          .map((model) => model.trim())
          .filter(Boolean),
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Browser Policy Enabled</Label>
                <p className="text-xs text-slate-500">Master enable for tenant browser-policy evaluation.</p>
              </div>
              <Switch checked={policyEnabled} onCheckedChange={setPolicyEnabled} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Kill Switch</Label>
                <p className="text-xs text-slate-500">Immediately fail closed for tenant browser actions.</p>
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
            <Textarea
              value={allowedVisionModels}
              onChange={(e) => setAllowedVisionModels(e.target.value)}
              placeholder="gpt-4o, gpt-4.1, claude-sonnet-4"
              rows={4}
            />
            <p className="text-xs text-slate-500">
              Users can only pick personal overrides from this set when user-level model selection is enabled.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">User Customization Policy</h3>
            <p className="text-xs text-slate-500">
              Tenant admins define which controls users may narrow for themselves.
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

        <Button onClick={handleSave} disabled={saving || policyStatusQuery.isLoading}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Tenant Policy
        </Button>
      </CardContent>
    </Card>
  );
}
