import { useEffect, useState } from "react";
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
import { Loader2, Save, Shield } from "lucide-react";

export function UserAutomationPreferencesPanel() {
  const [enabled, setEnabled] = useState(true);
  const [modeCap, setModeCap] = useState<"observe" | "read_only" | "draft" | "commit" | "expanded" | "inherit">("inherit");
  const [allowedDomainsSubset, setAllowedDomainsSubset] = useState("");
  const [blockDownloads, setBlockDownloads] = useState(false);
  const [blockUploads, setBlockUploads] = useState(false);
  const [blockClipboard, setBlockClipboard] = useState(false);
  const [blockExternalSend, setBlockExternalSend] = useState(false);
  const [approveDraft, setApproveDraft] = useState(false);
  const [approveCommit, setApproveCommit] = useState(false);
  const [approveRestricted, setApproveRestricted] = useState(false);
  const [approvalTtlCap, setApprovalTtlCap] = useState("");
  const [preferredVisionModel, setPreferredVisionModel] = useState("inherit");
  const [notifyOnApprovalRequests, setNotifyOnApprovalRequests] = useState(true);
  const [notifyOnPolicyIncidents, setNotifyOnPolicyIncidents] = useState(true);

  const automationPrefsQuery = trpc.users.getAutomationPreferences.useQuery();
  const updateMutation = trpc.users.updateAutomationPreferences.useMutation({
    onSuccess: () => {
      toast.success("Automation preferences saved");
      automationPrefsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    const profile = automationPrefsQuery.data?.profile;
    if (!profile) {
      return;
    }

    setEnabled(profile.enabled);
    setModeCap(profile.modeCap ?? "inherit");
    setAllowedDomainsSubset(profile.allowedDomainsSubset.join(", "));
    setBlockDownloads(profile.blockedTransfers.includes("download"));
    setBlockUploads(profile.blockedTransfers.includes("upload"));
    setBlockClipboard(profile.blockedTransfers.includes("clipboard"));
    setBlockExternalSend(profile.blockedTransfers.includes("external_send"));
    setApproveDraft(profile.requireApprovalForActionClasses.includes("draft"));
    setApproveCommit(profile.requireApprovalForActionClasses.includes("commit"));
    setApproveRestricted(profile.requireApprovalForActionClasses.includes("restricted"));
    setApprovalTtlCap(profile.approvalTtlSecondsCap ? String(profile.approvalTtlSecondsCap) : "");
    setPreferredVisionModel(profile.preferredVisionModel ?? "inherit");
    setNotifyOnApprovalRequests(profile.notifyOnApprovalRequests);
    setNotifyOnPolicyIncidents(profile.notifyOnPolicyIncidents);
  }, [automationPrefsQuery.data]);

  const handleSave = async () => {
    const blockedTransfers = [
      blockDownloads ? "download" : null,
      blockUploads ? "upload" : null,
      blockClipboard ? "clipboard" : null,
      blockExternalSend ? "external_send" : null,
    ].filter((value): value is "download" | "upload" | "clipboard" | "external_send" => Boolean(value));
    const requireApprovalForActionClasses = [
      approveDraft ? "draft" : null,
      approveCommit ? "commit" : null,
      approveRestricted ? "restricted" : null,
    ].filter((value): value is "draft" | "commit" | "restricted" => Boolean(value));

    await updateMutation.mutateAsync({
      enabled,
      modeCap: modeCap === "inherit" ? null : modeCap,
      allowedDomainsSubset: allowedDomainsSubset
        .split(",")
        .map((domain) => domain.trim())
        .filter(Boolean),
      blockedTransfers,
      requireApprovalForActionClasses,
      approvalTtlSecondsCap: approvalTtlCap ? Number(approvalTtlCap) : null,
      preferredVisionModel: preferredVisionModel === "inherit" ? null : preferredVisionModel,
      notifyOnApprovalRequests,
      notifyOnPolicyIncidents,
    });
  };

  const customization = automationPrefsQuery.data?.customization;
  const effectiveConfig = automationPrefsQuery.data?.effectiveConfig;
  const inheritedConfig = automationPrefsQuery.data?.inheritedConfig;
  const allowedVisionModels = automationPrefsQuery.data?.allowedVisionModels ?? [];

  return (
    <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-sky-50/60 to-emerald-50/40 pb-5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-sky-600" />
          Personal Automation Preferences
        </CardTitle>
        <CardDescription>
          Narrow your own browser-policy settings without exceeding tenant safety limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Personal restrictions enabled</Label>
                <p className="text-xs text-slate-500">Turn your personal browser-policy overlay on or off.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="space-y-2">
              <Label>Effective tenant mode</Label>
              <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {inheritedConfig?.enforcementMode ?? "observe"}
              </div>
            </div>
            {customization?.allowModeCap && (
              <div className="space-y-2">
                <Label>Personal mode cap</Label>
                <Select value={modeCap} onValueChange={(value) => setModeCap(value as typeof modeCap)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Inherit tenant mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">Inherit tenant mode</SelectItem>
                    <SelectItem value="observe">Observe</SelectItem>
                    <SelectItem value="read_only">Read Only</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="commit">Commit</SelectItem>
                    <SelectItem value="expanded">Expanded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {customization?.allowApprovalTtlCap && (
              <div className="space-y-2">
                <Label>Shorter approval TTL</Label>
                <Input
                  type="number"
                  min={60}
                  max={inheritedConfig?.defaultApprovalTtlSeconds ?? 900}
                  value={approvalTtlCap}
                  onChange={(e) => setApprovalTtlCap(e.target.value)}
                  placeholder="Inherit tenant TTL"
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            {customization?.allowPersonalDomainSubset && (
              <div className="space-y-2">
                <Label>Personal allowed domain subset</Label>
                <Textarea
                  value={allowedDomainsSubset}
                  onChange={(e) => setAllowedDomainsSubset(e.target.value)}
                  placeholder="example.com, docs.example.com"
                  rows={4}
                />
              </div>
            )}
            {customization?.allowPreferredVisionModel && (
              <div className="space-y-2">
                <Label>Preferred vision model</Label>
                <Select value={preferredVisionModel} onValueChange={setPreferredVisionModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Inherit tenant model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">Inherit tenant model</SelectItem>
                    {allowedVisionModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notifications</Label>
              <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Approval requests</span>
                  <Switch checked={notifyOnApprovalRequests} onCheckedChange={setNotifyOnApprovalRequests} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Policy incidents</span>
                  <Switch checked={notifyOnPolicyIncidents} onCheckedChange={setNotifyOnPolicyIncidents} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {customization?.allowTransferBlocks && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Block risky transfer surfaces</h3>
              <p className="text-xs text-slate-500">These settings only make your policy stricter.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["Block downloads", blockDownloads, setBlockDownloads],
                ["Block uploads", blockUploads, setBlockUploads],
                ["Block clipboard access", blockClipboard, setBlockClipboard],
                ["Block external sends", blockExternalSend, setBlockExternalSend],
              ].map(([label, value, setter]) => (
                <div key={label as string} className="flex items-center justify-between rounded-lg border bg-white p-3">
                  <Label>{label as string}</Label>
                  <Switch checked={value as boolean} onCheckedChange={setter as (next: boolean) => void} />
                </div>
              ))}
            </div>
          </div>
        )}

        {customization?.allowActionApprovalEscalation && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Always require your approval for</h3>
              <p className="text-xs text-slate-500">Use this to force extra review for sensitive actions.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Draft actions", approveDraft, setApproveDraft],
                ["Commit actions", approveCommit, setApproveCommit],
                ["Restricted actions", approveRestricted, setApproveRestricted],
              ].map(([label, value, setter]) => (
                <div key={label as string} className="flex items-center justify-between rounded-lg border bg-white p-3">
                  <Label>{label as string}</Label>
                  <Switch checked={value as boolean} onCheckedChange={setter as (next: boolean) => void} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Effective mode: {effectiveConfig?.enforcementMode ?? "observe"}</Badge>
            <Badge variant="outline">Effective approval TTL: {effectiveConfig?.defaultApprovalTtlSeconds ?? 300}s</Badge>
            <Badge variant="outline">Effective model: {effectiveConfig?.visionModel ?? "gpt-4o"}</Badge>
          </div>
          <p className="text-xs text-slate-600">
            Effective domains: {(effectiveConfig?.allowedDomains ?? []).join(", ") || "none"}
          </p>
        </div>

        <Button onClick={handleSave} disabled={updateMutation.isPending || automationPrefsQuery.isLoading}>
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Personal Preferences
        </Button>
      </CardContent>
    </Card>
  );
}
