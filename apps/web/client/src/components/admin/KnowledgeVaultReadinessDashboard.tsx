import { useEffect, useState } from "react";
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  TimerReset,
} from "lucide-react";
import { toast } from "sonner";

import { DashboardCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type OverrideMode = "standard" | "break_glass";
type OverrideActionKind = "approve" | "reject" | "revoke";
type OverrideActionDialogState = {
  kind: OverrideActionKind;
  overrideId: number;
  title: string;
  description: string;
} | null;

function gateTone(status: string): string {
  if (status === "pass") {
    return "bg-emerald-600 text-white";
  }
  if (status === "insufficient_data" || status === "overridden") {
    return "bg-amber-500 text-white";
  }
  return "bg-rose-600 text-white";
}

function overrideStatusTone(status: string): string {
  if (status === "active") {
    return "bg-emerald-600 text-white";
  }
  if (status === "pending_approval") {
    return "bg-amber-500 text-white";
  }
  if (status === "rejected" || status === "revoked") {
    return "bg-rose-600 text-white";
  }
  return "bg-slate-700 text-white";
}

function overrideModeTone(mode: OverrideMode | string): string {
  if (mode === "break_glass") {
    return "bg-rose-100 text-rose-700 border border-rose-200";
  }
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function GateIcon({ status }: { status: string }) {
  if (status === "pass") {
    return <ShieldCheck className="h-4 w-4" />;
  }
  if (status === "insufficient_data" || status === "overridden") {
    return <ShieldQuestion className="h-4 w-4" />;
  }
  return <ShieldAlert className="h-4 w-4" />;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalDateTimeInputValue(value: Date): string {
  return [
    value.getFullYear(),
    padDatePart(value.getMonth() + 1),
    padDatePart(value.getDate()),
  ].join("-")
    + "T"
    + [
      padDatePart(value.getHours()),
      padDatePart(value.getMinutes()),
    ].join(":");
}

function defaultExpiryInput(mode: OverrideMode): string {
  const now = new Date();
  const next = new Date(
    now.getTime()
      + (mode === "break_glass" ? 60 : 180) * 60 * 1000,
  );
  next.setSeconds(0, 0);
  return toLocalDateTimeInputValue(next);
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) {
    return "Not recorded";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function actionLabel(kind: OverrideActionKind): string {
  if (kind === "approve") {
    return "Approve";
  }
  if (kind === "reject") {
    return "Reject";
  }
  return "Revoke";
}

export function KnowledgeVaultReadinessDashboard() {
  const utils = trpc.useUtils();
  const readinessQuery = trpc.monitoring.getKnowledgeVaultReadiness.useQuery(
    {
      phase: "production",
    },
    {
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );
  const overridesQuery = trpc.monitoring.listKnowledgeVaultReleaseGateOverrides.useQuery(
    {
      status: "all",
      limit: 12,
    },
    {
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );

  const [requestReason, setRequestReason] = useState("");
  const [requestMode, setRequestMode] = useState<OverrideMode>("standard");
  const [requestExpiresAt, setRequestExpiresAt] = useState(() =>
    defaultExpiryInput("standard"),
  );
  const [incidentRef, setIncidentRef] = useState("");
  const [actionDialog, setActionDialog] = useState<OverrideActionDialogState>(null);
  const [actionReason, setActionReason] = useState("");

  useEffect(() => {
    setRequestExpiresAt(defaultExpiryInput(requestMode));
    if (requestMode !== "break_glass") {
      setIncidentRef("");
    }
  }, [requestMode]);

  async function invalidateDashboardData(): Promise<void> {
    await Promise.all([
      utils.monitoring.getKnowledgeVaultReadiness.invalidate({
        phase: "production",
      }),
      utils.monitoring.listKnowledgeVaultReleaseGateOverrides.invalidate(),
    ]);
  }

  const requestOverrideMutation =
    trpc.monitoring.requestKnowledgeVaultReleaseGateOverride.useMutation({
      onSuccess: async (override) => {
        toast.success(
          override.mode === "break_glass"
            ? "Break-glass override request submitted"
            : "Override request submitted",
        );
        setRequestReason("");
        setIncidentRef("");
        setRequestMode("standard");
        setRequestExpiresAt(defaultExpiryInput("standard"));
        await invalidateDashboardData();
      },
      onError: (error) => toast.error(error.message),
    });

  const approveOverrideMutation =
    trpc.monitoring.approveKnowledgeVaultReleaseGateOverride.useMutation({
      onSuccess: async () => {
        toast.success("Override approved");
        setActionDialog(null);
        setActionReason("");
        await invalidateDashboardData();
      },
      onError: (error) => toast.error(error.message),
    });

  const rejectOverrideMutation =
    trpc.monitoring.rejectKnowledgeVaultReleaseGateOverride.useMutation({
      onSuccess: async () => {
        toast.success("Override rejected");
        setActionDialog(null);
        setActionReason("");
        await invalidateDashboardData();
      },
      onError: (error) => toast.error(error.message),
    });

  const revokeOverrideMutation =
    trpc.monitoring.revokeKnowledgeVaultReleaseGateOverride.useMutation({
      onSuccess: async () => {
        toast.success("Override revoked");
        setActionDialog(null);
        setActionReason("");
        await invalidateDashboardData();
      },
      onError: (error) => toast.error(error.message),
    });

  const isActionPending =
    approveOverrideMutation.isPending
    || rejectOverrideMutation.isPending
    || revokeOverrideMutation.isPending;

  const data = readinessQuery.data;
  const overrides = overridesQuery.data ?? [];
  const pendingOverrides = overrides.filter(
    (override) => override.status === "pending_approval",
  );
  const recentOverrides = overrides.filter(
    (override) => override.status !== "pending_approval",
  );

  function handleRefresh(): void {
    void readinessQuery.refetch();
    void overridesQuery.refetch();
  }

  function handleRequestSubmit(): void {
    const trimmedReason = requestReason.trim();
    const trimmedIncidentRef = incidentRef.trim();
    if (!trimmedReason) {
      toast.error("Override reason is required");
      return;
    }
    if (!requestExpiresAt.trim()) {
      toast.error("Override expiry is required");
      return;
    }
    const expiresAt = new Date(requestExpiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      toast.error("Override expiry is invalid");
      return;
    }
    if (requestMode === "break_glass" && trimmedIncidentRef.length < 4) {
      toast.error("Break-glass requests require an incident reference");
      return;
    }

    requestOverrideMutation.mutate({
      reason: trimmedReason,
      expiresAt: expiresAt.toISOString(),
      scopeType: "tenant",
      mode: requestMode,
      metadata: requestMode === "break_glass"
        ? {
            incidentRef: trimmedIncidentRef,
          }
        : undefined,
    });
  }

  function openActionDialog(
    kind: OverrideActionKind,
    override: {
      id?: number;
      reason: string;
      status?: string;
    },
  ): void {
    if (!override.id) {
      toast.error("Override id is missing");
      return;
    }

    const nextTitle =
      kind === "approve"
        ? "Approve Override Request"
        : kind === "reject"
          ? "Reject Override Request"
          : "Revoke Active Override";
    const nextDescription =
      kind === "approve"
        ? `Approve this request and unlock protected surfaces until expiry.`
        : kind === "reject"
          ? `Reject this request and keep protected surfaces locked.`
          : `Revoke this active override immediately and fail closed.`;

    setActionDialog({
      kind,
      overrideId: override.id,
      title: nextTitle,
      description: nextDescription,
    });
    setActionReason(kind === "revoke" ? "Manual rollback requested" : "");
  }

  function submitAction(): void {
    if (!actionDialog) {
      return;
    }
    const trimmedReason = actionReason.trim();
    if (trimmedReason.length < 4) {
      toast.error("Action reason is required");
      return;
    }

    if (actionDialog.kind === "approve") {
      approveOverrideMutation.mutate({
        overrideId: actionDialog.overrideId,
        reason: trimmedReason,
      });
      return;
    }

    if (actionDialog.kind === "reject") {
      rejectOverrideMutation.mutate({
        overrideId: actionDialog.overrideId,
        reason: trimmedReason,
      });
      return;
    }

    revokeOverrideMutation.mutate({
      overrideId: actionDialog.overrideId,
      reason: trimmedReason,
    });
  }

  return (
    <>
      <DashboardCard
        title="Knowledge Vault readiness"
        description="Operational view for rollout policy, release gate status, citation coverage, leakage counters, snapshot diagnostics, and override governance."
      >
        {!data ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
            Loading Knowledge Vault readiness...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={gateTone(data.gate.status)}>
                  <GateIcon status={data.gate.status} />
                  <span className="ml-2">{data.gate.status}</span>
                </Badge>
                <Badge variant="outline">
                  release gate: {data.policy.releaseGateStatus}
                </Badge>
                <Badge variant="outline">
                  broad rollout: {data.policy.broadRollout ? "yes" : "no"}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleRefresh}
              >
                <TimerReset className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Backfill coverage
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {data.metrics.readableMarkdownBackfillCoveragePercent.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Citation coverage
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {data.metrics.citationCoveragePercent.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Quick switch p95
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {Math.round(data.metrics.quickSwitchP95Ms)} ms
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Context pack p95
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {Math.round(data.metrics.contextPackResolutionP95Ms)} ms
                </div>
              </div>
            </div>

            {data.gate.override ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-amber-600 text-white">
                    override active
                  </Badge>
                  <Badge variant="outline">
                    mode: {data.gate.override.mode ?? "standard"}
                  </Badge>
                  <Badge variant="outline">
                    expires: {formatDateLabel(data.gate.override.expiresAt)}
                  </Badge>
                </div>
                <div className="mt-3 text-sm text-slate-700">
                  {data.gate.override.reason}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  requested by user #{data.gate.override.actorUserId ?? "unknown"}
                  {" • "}
                  approved by user #{data.gate.override.approvedByUserId ?? "unknown"}
                  {data.gate.override.approvedAt
                    ? ` • approved ${formatDateLabel(data.gate.override.approvedAt)}`
                    : ""}
                </div>
                {data.gate.override.approvalReason ? (
                  <div className="mt-2 text-xs text-slate-500">
                    approval note: {data.gate.override.approvalReason}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Override Request
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Submit a scoped request. Standard mode is capped at 24 hours.
                      Break-glass mode is capped at 4 hours and requires an incident ref.
                    </div>
                  </div>
                  <Badge variant="outline">
                    pending: {pendingOverrides.length}
                  </Badge>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="knowledge-vault-override-reason">
                      Reason
                    </Label>
                    <Textarea
                      id="knowledge-vault-override-reason"
                      value={requestReason}
                      onChange={(event) => setRequestReason(event.target.value)}
                      placeholder="Explain why protected surfaces need a temporary override."
                      rows={4}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="knowledge-vault-override-mode">
                        Mode
                      </Label>
                      <Select
                        value={requestMode}
                        onValueChange={(value) =>
                          setRequestMode(value as OverrideMode)
                        }
                      >
                        <SelectTrigger id="knowledge-vault-override-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">standard</SelectItem>
                          <SelectItem value="break_glass">break_glass</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="knowledge-vault-override-expiry">
                        Expires At
                      </Label>
                      <Input
                        id="knowledge-vault-override-expiry"
                        type="datetime-local"
                        value={requestExpiresAt}
                        onChange={(event) => setRequestExpiresAt(event.target.value)}
                      />
                    </div>
                  </div>

                  {requestMode === "break_glass" ? (
                    <div className="space-y-2">
                      <Label htmlFor="knowledge-vault-override-incident">
                        Incident Reference
                      </Label>
                      <Input
                        id="knowledge-vault-override-incident"
                        value={incidentRef}
                        onChange={(event) => setIncidentRef(event.target.value)}
                        placeholder="INC-2048"
                      />
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleRequestSubmit}
                      disabled={requestOverrideMutation.isPending}
                    >
                      {requestOverrideMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Submit request
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Override Queue
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Approve, reject, or revoke scoped overrides without leaving the dashboard.
                    </div>
                  </div>
                  <Badge variant="outline">
                    total: {overrides.length}
                  </Badge>
                </div>

                <div className="mt-4 space-y-3">
                  {overridesQuery.isLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-sm text-slate-500">
                      Loading override queue...
                    </div>
                  ) : overrides.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-sm text-slate-500">
                      No override requests recorded for this tenant yet.
                    </div>
                  ) : (
                    <>
                      {pendingOverrides.map((override) => (
                        <div
                          key={override.id ?? `${override.reason}-${override.createdAt}`}
                          className="rounded-xl border border-amber-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={overrideStatusTone(override.status ?? "pending_approval")}>
                              {statusLabel(override.status ?? "pending_approval")}
                            </Badge>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${overrideModeTone(override.mode ?? "standard")}`}>
                              {override.mode ?? "standard"}
                            </span>
                            <Badge variant="outline">
                              expires {formatDateLabel(override.expiresAt)}
                            </Badge>
                          </div>
                          <div className="mt-3 text-sm text-slate-900">
                            {override.reason}
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            requested by user #{override.actorUserId ?? "unknown"}
                            {" • "}
                            created {formatDateLabel(override.createdAt)}
                            {typeof override.metadata?.incidentRef === "string"
                              ? ` • incident ${override.metadata.incidentRef}`
                              : ""}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => openActionDialog("approve", override)}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openActionDialog("reject", override)}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}

                      {recentOverrides.map((override) => (
                        <div
                          key={override.id ?? `${override.reason}-${override.createdAt}`}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={overrideStatusTone(override.status ?? "expired")}>
                              {statusLabel(override.status ?? "expired")}
                            </Badge>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${overrideModeTone(override.mode ?? "standard")}`}>
                              {override.mode ?? "standard"}
                            </span>
                            <Badge variant="outline">
                              expires {formatDateLabel(override.expiresAt)}
                            </Badge>
                          </div>
                          <div className="mt-3 text-sm text-slate-900">
                            {override.reason}
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            requested by user #{override.actorUserId ?? "unknown"}
                            {override.approvedByUserId
                              ? ` • approved by user #${override.approvedByUserId}`
                              : ""}
                            {override.rejectedByUserId
                              ? ` • rejected by user #${override.rejectedByUserId}`
                              : ""}
                            {typeof override.metadata?.incidentRef === "string"
                              ? ` • incident ${override.metadata.incidentRef}`
                              : ""}
                          </div>
                          {override.approvalReason ? (
                            <div className="mt-2 text-xs text-slate-500">
                              approval note: {override.approvalReason}
                            </div>
                          ) : null}
                          {override.rejectedReason ? (
                            <div className="mt-2 text-xs text-slate-500">
                              rejection note: {override.rejectedReason}
                            </div>
                          ) : null}
                          {override.status === "active" ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openActionDialog("revoke", override)}
                              >
                                Revoke
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Policy surfaces
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(data.policy.surfaces).map(([surface, enabled]) => (
                    <Badge
                      key={surface}
                      className={
                        enabled
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-200 text-slate-700"
                      }
                    >
                      {surface}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {Object.entries(data.policy.surfaceReasons)
                    .filter(([, reasons]) => Array.isArray(reasons) && reasons.length > 0)
                    .map(([surface, reasons]) => (
                      <div
                        key={surface}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                      >
                        <div className="font-medium text-slate-900">{surface}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {reasons.join(", ")}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Safety counters and probes
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    Hidden-note leakage attempts:{" "}
                    <span className="font-semibold text-slate-900">
                      {data.metrics.hiddenNoteLeakageCount}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    Private-vault blocked:{" "}
                    <span className="font-semibold text-slate-900">
                      {data.metrics.privateVaultBlockedCount}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    Delegated unauthorized attempts:{" "}
                    <span className="font-semibold text-slate-900">
                      {data.metrics.delegatedUnauthorizedResolveCount}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    Snapshot/trusted stale packs:{" "}
                    <span className="font-semibold text-slate-900">
                      {data.contextPacks.stale}
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {(data.telemetry.leakageProbes ?? []).slice().reverse().map((probe) => (
                    <div
                      key={probe.probeId}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{probe.probeType}</Badge>
                        <Badge
                          className={
                            probe.status === "blocked"
                              ? "bg-emerald-600 text-white"
                              : probe.status === "leaked"
                                ? "bg-rose-600 text-white"
                                : "bg-slate-900 text-white"
                          }
                        >
                          {probe.status}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {probe.blockedReason ?? "No blocked reason recorded"}
                        {probe.hiddenResourceRef
                          ? ` • ${probe.hiddenResourceRef}`
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </DashboardCard>

      <Dialog
        open={Boolean(actionDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog(null);
            setActionReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{actionDialog?.title}</DialogTitle>
            <DialogDescription>
              {actionDialog?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="knowledge-vault-override-action-reason">
              {actionDialog ? `${actionLabel(actionDialog.kind)} reason` : "Reason"}
            </Label>
            <Textarea
              id="knowledge-vault-override-action-reason"
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
              placeholder="Record the decision rationale for audit history."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setActionDialog(null);
                setActionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitAction}
              disabled={isActionPending}
            >
              {isActionPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {actionDialog ? actionLabel(actionDialog.kind) : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default KnowledgeVaultReadinessDashboard;
