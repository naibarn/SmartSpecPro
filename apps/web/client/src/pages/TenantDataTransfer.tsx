import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESOURCE_OPTIONS = [
  ["library_item", "Library files and folders"],
  ["presentation_deck", "Presentations"],
  ["media_asset", "Uploaded media"],
  ["media_task_artifact", "Completed managed artifacts"],
  ["media_provider_asset", "Provider asset metadata"],
  ["workflow", "Workflows"],
  ["vertical_drama_series", "Vertical Drama series"],
] as const;

function newActionId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

export default function TenantDataTransfer() {
  const { user } = useAuth();
  const [sourceUserId, setSourceUserId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<string[]>(RESOURCE_OPTIONS.map(([kind]) => kind));
  const [preview, setPreview] = useState<any>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");

  const usersQuery = trpc.users.listByDomain.useQuery(
    { limit: 100, offset: 0 },
    { enabled: Boolean(user && (user.role === "domain_admin" || user.role === "admin")) },
  );
  const previewMutation = trpc.tenantDataTransfer.preview.useMutation({
    onSuccess: data => {
      setPreview(data);
      setOperationId(null);
      toast.success("Preview created. Review the result before approval.");
    },
    onError: error => toast.error(`Preview failed: ${error.message}`),
  });
  const approveMutation = trpc.tenantDataTransfer.approve.useMutation({
    onSuccess: data => {
      setOperationId(data.operationId);
      toast.success(data.created ? "Transfer approved" : "Existing transfer operation loaded");
    },
    onError: error => toast.error(`Approval failed: ${error.message}`),
  });
  const operationQuery = trpc.tenantDataTransfer.getOperation.useQuery(
    { operationId: operationId ?? "" },
    { enabled: Boolean(operationId), refetchInterval: operationId ? 4_000 : false },
  );
  const itemsQuery = trpc.tenantDataTransfer.listItems.useQuery(
    { operationId: operationId ?? "", pageSize: 100 },
    { enabled: Boolean(operationId) },
  );
  const cancelMutation = trpc.tenantDataTransfer.cancel.useMutation({
    onSuccess: () => {
      toast.success("Transfer cancelled");
      void operationQuery.refetch();
    },
    onError: error => toast.error(`Cancel failed: ${error.message}`),
  });
  const resumeMutation = trpc.tenantDataTransfer.resume.useMutation({
    onSuccess: () => {
      toast.success("Transfer resumed");
      void operationQuery.refetch();
    },
    onError: error => toast.error(`Resume failed: ${error.message}`),
  });
  const resolveItemMutation = trpc.tenantDataTransfer.resolveItem.useMutation({
    onSuccess: () => {
      toast.success("Item resolution recorded");
      void itemsQuery.refetch();
      void operationQuery.refetch();
    },
    onError: error => toast.error(`Item resolution failed: ${error.message}`),
  });

  const users = usersQuery.data?.users ?? [];
  const source = users.find(item => item.id === Number(sourceUserId));
  const target = users.find(item => item.id === Number(targetUserId));
  const canPreview = Boolean(source && target && source.id !== target.id && selectedKinds.length > 0 && !previewMutation.isPending);
  const operation = operationQuery.data;
  const unresolvedCount = useMemo(() => {
    const counts = operation?.counts ?? {};
    return (counts.conflict ?? 0) + (counts.permanent_error ?? 0) + (counts.retryable_error ?? 0);
  }, [operation]);

  const runPreview = () => {
    if (!canPreview || !source || !target) return;
    previewMutation.mutate({
      sourceUserId: source.id,
      targetUserId: target.id,
      selections: selectedKinds.map(resourceKind => ({ resourceKind, resourceIds: [] })),
      requestIdempotencyKey: newActionId("preview"),
    });
  };

  const approve = () => {
    if (!preview || confirmation.trim().toUpperCase() !== "TRANSFER") return;
    approveMutation.mutate({
      previewId: preview.previewId,
      snapshotFingerprint: preview.snapshotFingerprint,
      sourceUserId: preview.sourceUserId,
      targetUserId: preview.targetUserId,
      confirmation,
      actionId: newActionId("approve"),
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Tenant Admin / Data transfer
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Transfer data between users</h1>
        <p className="max-w-3xl text-muted-foreground">
          This is a same-tenant, preview-first operation. Job history, billing,
          credentials, sessions, active provider work, and secrets are never copied.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>1. Choose users</CardTitle>
          <CardDescription>Both users must be active members of your authenticated tenant.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="transfer-source">Source user</Label>
            <select id="transfer-source" value={sourceUserId} onChange={event => setSourceUserId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Select source</option>
              {users.map(item => <option key={item.id} value={item.id}>{item.name || item.email || `User ${item.id}`} (#{item.id})</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-target">Target user</Label>
            <select id="transfer-target" value={targetUserId} onChange={event => setTargetUserId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Select target</option>
              {users.map(item => <option key={item.id} value={item.id}>{item.name || item.email || `User ${item.id}`} (#{item.id})</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Choose resource categories</CardTitle>
          <CardDescription>Preview enumerates a bounded snapshot. Empty IDs means all eligible records in that category.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCE_OPTIONS.map(([kind, label]) => {
            const checked = selectedKinds.includes(kind);
            return (
              <label key={kind} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
                <input type="checkbox" checked={checked} onChange={() => setSelectedKinds(current => checked ? current.filter(value => value !== kind) : [...current, kind])} className="mt-1 h-4 w-4" />
                <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{kind}</span></span>
              </label>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={runPreview} disabled={!canPreview}>
          {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Preview / dry run
        </Button>
        {source && target && source.id === target.id && <span className="self-center text-sm text-destructive">Source and target must be different.</span>}
      </div>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>3. Review immutable preview</CardTitle>
            <CardDescription>Fingerprint {preview.snapshotFingerprint.slice(0, 16)}… · expires {new Date(preview.expiresAt).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(preview.counts).map(([key, count]) => <Badge key={key} variant={key === "active_work" || key === "conflict" ? "destructive" : "secondary"}>{key}: {count}</Badge>)}
            </div>
            <div className="max-h-72 overflow-auto rounded-md border">
              {preview.items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No eligible records found.</p> : preview.items.map(item => (
                <div key={`${item.resourceKind}:${item.sourceResourceId}`} className="flex items-start justify-between gap-4 border-b p-3 last:border-b-0">
                  <div><p className="text-sm font-medium">{item.resourceKind} / {item.sourceResourceId}</p><p className="text-xs text-muted-foreground">{item.reasonDetail || item.disposition || "Ready for transfer"}</p></div>
                  <Badge variant={item.classification === "transferable" ? "default" : "outline"}>{item.classification}</Badge>
                </div>
              ))}
            </div>
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Approval cancels only verified queued canonical jobs listed in this preview. Active jobs block approval; no queue flush or provider regeneration is performed.</span></div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2"><Label htmlFor="transfer-confirm">Type TRANSFER to approve</Label><Input id="transfer-confirm" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></div>
              <Button onClick={approve} disabled={confirmation.trim().toUpperCase() !== "TRANSFER" || approveMutation.isPending || Object.hasOwn(preview.counts, "active_work")}>
                {approveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Approve transfer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {operationId && operation && (
        <Card>
          <CardHeader><CardTitle>4. Operation monitor</CardTitle><CardDescription>{operation.operationId} · attempt {operation.attempt}/{operation.maxAttempts}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><Badge>{operation.transferState}</Badge><Badge variant="outline">canonical: {operation.status}</Badge>{operation.operatorReviewRequired && <Badge variant="destructive">operator review required</Badge>}</div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">{Object.entries(operation.counts).map(([key, count]) => <div key={key} className="rounded-md bg-muted p-3"><span className="block text-muted-foreground">{key}</span><span className="text-lg font-semibold">{count}</span></div>)}</div>
            {operation.operatorReviewReason && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{operation.operatorReviewReason}</p>}
            <div className="flex flex-wrap gap-2">
              {operation.transferState === "paused_on_error" && <Button variant="secondary" onClick={() => resumeMutation.mutate({ operationId, actionId: newActionId("resume") })} disabled={resumeMutation.isPending}><RefreshCw className="mr-2 h-4 w-4" /> Resume same operation</Button>}
              {!(["cancelled", "completed", "completed_with_conflicts"].includes(operation.transferState)) && <Button variant="destructive" onClick={() => cancelMutation.mutate({ operationId, actionId: newActionId("cancel") })} disabled={cancelMutation.isPending}><XCircle className="mr-2 h-4 w-4" /> Cancel</Button>}
            </div>
            {unresolvedCount > 0 && <p className="text-sm text-muted-foreground">{unresolvedCount} item(s) require resolution before completion.</p>}
            <div className="max-h-72 overflow-auto rounded-md border">
              {(itemsQuery.data?.items ?? []).map(item => {
                const needsResolution = ["conflict", "permanent_error", "retryable_error"].includes(item.classification);
                return <div key={`${item.resourceKind}:${item.sourceResourceId}`} className="flex flex-wrap items-center justify-between gap-3 border-b p-3 text-sm last:border-b-0">
                  <span><span className="font-medium">{item.resourceKind} / {item.sourceResourceId}</span>{item.reasonDetail && <span className="ml-2 text-xs text-muted-foreground">{item.reasonDetail}</span>}</span>
                  <span className="flex items-center gap-2"><Badge variant={needsResolution ? "destructive" : "outline"}>{item.classification}</Badge>{needsResolution && item.id && <><Button size="sm" variant="outline" disabled={resolveItemMutation.isPending} onClick={() => resolveItemMutation.mutate({ operationId, itemId: item.id!, resolution: "retry", actionId: newActionId("resolve-retry") })}>Retry</Button><Button size="sm" variant="ghost" disabled={resolveItemMutation.isPending} onClick={() => resolveItemMutation.mutate({ operationId, itemId: item.id!, resolution: "skip", actionId: newActionId("resolve-skip") })}>Skip</Button></>}</span>
                </div>;
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
