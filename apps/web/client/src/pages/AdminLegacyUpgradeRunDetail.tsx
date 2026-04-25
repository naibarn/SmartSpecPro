import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Clock, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readStringField(source: Record<string, unknown> | null, key: string): string | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(source: Record<string, unknown> | null, key: string): number | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArrayField(source: Record<string, unknown> | null, key: string): string[] {
  if (!source) return [];
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function formatRefList(values: string[]): string {
  if (values.length === 0) return "—";
  return values.join(", ");
}

export default function AdminLegacyUpgradeRunDetail() {
  const { user, isLoading: authLoading } = useAuth();
  const [matched, params] = useRoute("/admin/skills/runs/:runId");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useScopedTranslation("admin");

  const runId = useMemo(() => {
    const value = matched ? Number(params?.runId) : NaN;
    return Number.isFinite(value) ? value : null;
  }, [matched, params?.runId]);

  const { data, isLoading, refetch } = trpc.skills.getLegacyUpgradeApplyRunDetail.useQuery(
    runId ? { runId } : { runId: 0 },
    { enabled: !!runId && !!user && !authLoading },
  );

  const retryMutation = trpc.skills.retryLegacyUpgradeApplyRuns.useMutation({
    onSuccess: () => {
      refetch();
      toast({
        title: t("admin.skillsPage.legacyRunDetail.retryQueuedTitle"),
        description: t("admin.skillsPage.legacyRunDetail.retryQueuedDescription"),
      });
    },
    onError: (error) => {
      toast({
        title: t("admin.skillsPage.legacyRunDetail.retryFailedTitle"),
        description: error.message || t("admin.skillsPage.legacyRunDetail.retryFailedDescription"),
        variant: "destructive",
      });
    },
  });

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!matched || !runId) {
    return (
      <div className="min-h-screen px-4 py-8">
        <p className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.notFound")}</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const latestRun = data.run;
  const queueState = latestRun.queueState;
  const canRetry = queueState === "failed" || queueState === "blocked";
  const backHref = `/admin/skills?tab=maintenance&legacyRunFilter=${queueState === "running" ? "queued" : queueState}`;
  const runLogs = latestRun.logsJson && typeof latestRun.logsJson === "object"
    ? latestRun.logsJson as Record<string, unknown>
    : null;
  const runtimeLineage = latestRun.lineage && typeof latestRun.lineage === "object"
    ? latestRun.lineage as Record<string, unknown>
    : runLogs && typeof runLogs.lineage === "object" && runLogs.lineage !== null
    ? runLogs.lineage as Record<string, unknown>
    : null;
  const lineageSource = runtimeLineage ?? runLogs;
  const getLogString = (key: string): string | null => {
    const value = runLogs?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const getLineageString = (key: string): string | null => {
    return readStringField(lineageSource, key)
      || readStringField(lineageSource, key.replace(/([A-Z])/g, "_$1").toLowerCase())
      || readStringField(runLogs, key)
      || readStringField(runLogs, key.replace(/([A-Z])/g, "_$1").toLowerCase());
  };
  const getLineageNumber = (key: string): number | null => {
    return readNumberField(lineageSource, key)
      ?? readNumberField(lineageSource, key.replace(/([A-Z])/g, "_$1").toLowerCase())
      ?? readNumberField(runLogs, key)
      ?? readNumberField(runLogs, key.replace(/([A-Z])/g, "_$1").toLowerCase());
  };
  const getLineageArray = (key: string): string[] => {
    return readStringArrayField(lineageSource, key)
      .length > 0
      ? readStringArrayField(lineageSource, key)
      : readStringArrayField(lineageSource, key.replace(/([A-Z])/g, "_$1").toLowerCase()).length > 0
        ? readStringArrayField(lineageSource, key.replace(/([A-Z])/g, "_$1").toLowerCase())
        : readStringArrayField(runLogs, key).length > 0
          ? readStringArrayField(runLogs, key)
          : readStringArrayField(runLogs, key.replace(/([A-Z])/g, "_$1").toLowerCase());
  };
  const lineageRole = getLineageString("role") || "orchestrator";
  const lineageCheckpointVersion = getLineageNumber("checkpointVersion");
  const lineageParentRunId = getLineageString("parentRunId");
  const lineageChildRunIds = getLineageArray("childRunIds");
  const lineageVerificationState = getLineageString("verificationState");
  const lineageArtifactRefs = getLineageArray("artifactRefs");
  const lineageResumeCursor = getLineageString("resumeCursor");
  const lineageFailureScope = lineageRole === "orchestrator"
    ? t("admin.skillsPage.legacyRunDetail.failureScopes.orchestrator")
    : lineageRole === "handoff"
      ? t("admin.skillsPage.legacyRunDetail.failureScopes.handoff")
      : t("admin.skillsPage.legacyRunDetail.failureScopes.child");
  const completionMode = getLogString("completionMode");
  const repoRoot = getLogString("repoRoot");
  const workspaceRoot = getLogString("workspaceRoot");
  const proposalRoot = getLogString("proposalRoot");
  const proposalCount = runLogs && typeof runLogs.proposalCount === "number" ? runLogs.proposalCount : null;
  const getQueueStateLabel = (state: typeof queueState) => {
    if (state === "queued") return t("admin.skillsPage.legacyRunQueue.status.queued");
    if (state === "running") return t("admin.skillsPage.legacyRunQueue.status.running");
    if (state === "failed") return t("admin.skillsPage.legacyRunQueue.status.failed");
    if (state === "blocked") return t("admin.skillsPage.legacyRunQueue.status.blocked");
    if (state === "completed") return t("admin.skillsPage.legacyRunQueue.status.completed");
    return t("admin.skillsPage.legacyRunQueue.status.canceled");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 py-8 sm:px-6 lg:px-8">
      <Button variant="ghost" size="sm" onClick={() => setLocation(backHref)} className="mb-4 text-gray-600">
        <ArrowLeft className="mr-1 h-4 w-4" />
        {t("admin.skillsPage.legacyRunDetail.back")}
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t("admin.skillsPage.legacyRunDetail.title")}</Badge>
            <Badge
              variant="outline"
              className={cn(
                queueState === "running" && "border-cyan-500 text-cyan-600 bg-cyan-50",
                queueState === "queued" && "border-blue-500 text-blue-600 bg-blue-50",
                queueState === "failed" && "border-orange-500 text-orange-600 bg-orange-50",
                queueState === "blocked" && "border-red-500 text-red-600 bg-red-50",
                queueState === "completed" && "border-emerald-500 text-emerald-600 bg-emerald-50",
              )}
            >
              {getQueueStateLabel(queueState)}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold">
            {data.skill?.name || `Run #${latestRun.id}`}
          </h1>
          <p className="text-muted-foreground">
            {data.skill?.slug || `run-${latestRun.id}`} · {t("admin.skillsPage.legacyRunDetail.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("admin.skillsPage.legacyRunDetail.refresh")}
          </Button>
          {canRetry && (
            <Button onClick={() => retryMutation.mutate({ runIds: [latestRun.id] })} disabled={retryMutation.isPending}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {retryMutation.isPending
                ? t("admin.skillsPage.legacyRunDetail.retrying")
                : t("admin.skillsPage.legacyRunDetail.retry")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <DashboardCard title={t("admin.skillsPage.legacyRunDetail.overview")} leading={<Clock className="h-5 w-5 text-slate-500" />}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.taskId")}</span>
              <span className="font-mono">{latestRun.taskId || t("admin.skillsPage.legacyRunQueue.noTaskId")}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.model")}</span>
              <span>{latestRun.resolvedLlmModelId || t("admin.skillsPage.legacyRunQueue.noModel")}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.sourceRun")}</span>
              <span>{latestRun.sourceRunId ? `#${latestRun.sourceRunId}` : t("admin.skillsPage.legacyRunQueue.noSourceRun")}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.retryReason")}</span>
              <span className="text-right">{latestRun.retryReason || t("admin.skillsPage.legacyRunQueue.noRetryReason")}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.startedAt")}</span>
              <span>{formatDate(latestRun.startedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.endedAt")}</span>
              <span>{formatDate(latestRun.endedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.applyStrategy")}</span>
              <span>{getLogString("applyStrategy") || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.repoRoot")}</span>
              <span className="text-right font-mono text-xs break-all">{repoRoot || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.workspaceRoot")}</span>
              <span className="text-right font-mono text-xs break-all">{workspaceRoot || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.proposalRoot")}</span>
              <span className="text-right font-mono text-xs break-all">{proposalRoot || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.proposalCount")}</span>
              <span>{proposalCount ?? "—"}</span>
            </div>
            {completionMode === "no_changes" && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.completionMode")}</span>
                <Badge variant="secondary">{t("admin.skillsPage.legacyRunDetail.noChangesRequired")}</Badge>
              </div>
            )}
          </div>
        </DashboardCard>

        <DashboardCard title={t("admin.skillsPage.legacyRunDetail.lineage")} leading={<ShieldCheck className="h-5 w-5 text-slate-500" />}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.role")}</span>
              <Badge variant={lineageRole === "orchestrator" ? "secondary" : "outline"}>
                {lineageRole === "orchestrator"
                  ? t("admin.skillsPage.legacyRunDetail.roles.orchestrator")
                  : lineageRole === "handoff"
                    ? t("admin.skillsPage.legacyRunDetail.roles.handoff")
                    : t("admin.skillsPage.legacyRunDetail.roles.child")}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.failureScope")}</span>
              <span className="text-right">{lineageFailureScope}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.parentRun")}</span>
              <span className="font-mono">{lineageParentRunId || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.childRuns")}</span>
              <span className="text-right font-mono text-xs break-all">{formatRefList(lineageChildRunIds)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.checkpointVersion")}</span>
              <span>{lineageCheckpointVersion ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.verificationState")}</span>
              <span>{lineageVerificationState || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.artifactRefs")}</span>
              <span className="text-right font-mono text-xs break-all">{formatRefList(lineageArtifactRefs)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.resumeCursor")}</span>
              <span className="text-right font-mono text-xs break-all">{lineageResumeCursor || "—"}</span>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title={t("admin.skillsPage.legacyRunDetail.result")} leading={<Loader2 className="h-5 w-5 text-slate-500" />}>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.summary")}</div>
              <div className="mt-1 font-medium">{latestRun.resultMessage || latestRun.summary || t("admin.skillsPage.legacyRunQueue.noSummary")}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.error")}</div>
              <div className={cn("mt-1 whitespace-pre-wrap rounded-lg border p-3", (latestRun.resultError || latestRun.errorMessage) ? "border-orange-200 bg-orange-50 text-orange-800" : "border-slate-200 bg-slate-50 text-slate-600")}>
                {latestRun.resultError || latestRun.errorMessage || t("admin.skillsPage.legacyRunQueue.noResultError")}
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title={t("admin.skillsPage.legacyRunDetail.metadata")} leading={<Clock className="h-5 w-5 text-slate-500" />}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.runType")}</span>
              <span>{latestRun.runType}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.status")}</span>
              <span>{latestRun.status}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.createdAt")}</span>
              <span>{formatDate(latestRun.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.updatedAt")}</span>
              <span>{formatDate(latestRun.updatedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.fields.recommendation")}</span>
              <span>{data.recommendation?.title || `#${latestRun.recommendationId ?? "—"}`}</span>
            </div>
          </div>
        </DashboardCard>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <DashboardCard title={t("admin.skillsPage.legacyRunDetail.timeline")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.skillsPage.legacyRunDetail.headers.id")}</TableHead>
                <TableHead>{t("admin.skillsPage.legacyRunDetail.headers.state")}</TableHead>
                <TableHead>{t("admin.skillsPage.legacyRunDetail.headers.task")}</TableHead>
                <TableHead>{t("admin.skillsPage.legacyRunDetail.headers.error")}</TableHead>
                <TableHead>{t("admin.skillsPage.legacyRunDetail.headers.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.relatedRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-mono">{run.id}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        run.queueState === "running" && "border-cyan-500 text-cyan-600 bg-cyan-50",
                        run.queueState === "queued" && "border-blue-500 text-blue-600 bg-blue-50",
                        run.queueState === "failed" && "border-orange-500 text-orange-600 bg-orange-50",
                        run.queueState === "blocked" && "border-red-500 text-red-600 bg-red-50",
                        run.queueState === "completed" && "border-emerald-500 text-emerald-600 bg-emerald-50",
                      )}
                    >
                      {run.queueState}
                    </Badge>
                  </TableCell>
                  <TableCell>{run.taskId || "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate">
                    {run.resultError || run.errorMessage || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/admin/skills/runs/${run.id}`)}>
                        {t("admin.skillsPage.legacyRunDetail.open")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DashboardCard>

        <DashboardCard title={t("admin.skillsPage.legacyRunDetail.snapshots")}>
          <div className="space-y-3">
            {data.snapshots.length > 0 ? data.snapshots.map((snapshot) => (
              <div key={snapshot.id} className="rounded-lg border bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="secondary">{snapshot.snapshotType}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(snapshot.capturedAt)}</span>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  <div>{snapshot.manifestPath || "—"}</div>
                  <div>{snapshot.contractHash || "—"}</div>
                  <div>{snapshot.compatibilityNotesJson && typeof snapshot.compatibilityNotesJson === "object" && "status" in snapshot.compatibilityNotesJson
                    ? String((snapshot.compatibilityNotesJson as Record<string, unknown>).status)
                    : "—"}</div>
                </div>
              </div>
            )) : (
              <div className="text-sm text-muted-foreground">{t("admin.skillsPage.legacyRunDetail.noSnapshots")}</div>
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
