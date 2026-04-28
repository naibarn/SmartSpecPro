import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { LocaleToggle } from "@/components/LocaleToggle";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Clock3,
  FileText,
  Loader2,
  MessageSquare,
  Copy,
  RefreshCw,
  ShieldCheck,
  BookOpen,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

type WorkRequestRecord = {
  id: string;
  title: string;
  objective?: string | null;
  sourceType: string;
  currentState: string;
  requesterType?: string | null;
  businessDomain?: string | null;
  urgency?: string | null;
  riskLevel?: string | null;
  defaultOwnerType?: string | null;
  defaultOwnerId?: string | null;
  defaultQueueId?: string | null;
  linkedCaseId?: string | null;
  executionTrail?: {
    teamId: string | null;
    roomId: string | null;
    teamRunId: string | null;
    teamRunStatus: string | null;
    teamRunMode: string | null;
    workItemId: string | null;
    workItemStatus: string | null;
    mediaPipelineStatus?: string | null;
    mediaPipelineFinalVideoUrl?: string | null;
    mediaPipelineLastCheckedAt?: string | null;
    mediaPipelineErrorMessage?: string | null;
    mediaPipelinePendingImageTasks?: number;
    mediaPipelinePendingVideoTasks?: number;
  } | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
};

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "n/a";
  const parsed = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(parsed.getTime()) ? "n/a" : parsed.toLocaleString();
}

function formatSourceLabel(value: string): string {
  switch (value) {
    case "chat":
      return "Chat";
    case "webhook":
      return "Webhook";
    case "form":
      return "Form";
    case "api":
      return "API";
    case "document":
      return "Document";
    case "schedule":
      return "Schedule";
    case "manual":
      return "Manual";
    default:
      return value || "n/a";
  }
}

function stateBadgeClass(state: string): string {
  switch (state) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "blocked":
    case "escalated":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "waiting_for_approval":
    case "waiting_for_input":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "in_progress":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "triaged":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function stateLabel(
  t: (key: string, defaultValue?: string) => string,
  state: string
): string {
  const key = `list.state.${state}`;
  return t(key, state.replaceAll("_", " "));
}

function buildWorkOsConsolePath(caseId?: string | null): string {
  const params = new URLSearchParams();
  if (caseId) {
    params.set("caseId", caseId);
  }
  params.set("timelineSource", "work_os");
  return `/admin/work-os?${params.toString()}`;
}

function buildTeamRoomPath(
  teamId?: string | null,
  roomId?: string | null,
  panel?: "chat" | "workflow" | "run"
): string {
  if (!teamId) {
    return "/teams";
  }
  const params = new URLSearchParams();
  if (roomId) {
    params.set("roomId", roomId);
  }
  if (panel) {
    params.set("panel", panel);
  }
  const query = params.toString();
  return query ? `/teams/${teamId}?${query}` : `/teams/${teamId}`;
}

function buildWorkRequestPath(requestId?: string | null): string {
  const params = new URLSearchParams();
  if (requestId) {
    params.set("requestId", requestId);
  }
  return `/work/request?${params.toString()}`;
}

function buildWorkOsSourcePath(
  source: "role_routine" | "team_run" | "workpack_record",
  caseId?: string | null
): string {
  const params = new URLSearchParams();
  if (caseId) {
    params.set("caseId", caseId);
  }
  params.set("timelineSource", source);
  return `/admin/work-os?${params.toString()}`;
}

function copyWorkOsLink(path: string, successMessage: string): void {
  const url = `${window.location.origin}${path}`;
  void navigator.clipboard
    .writeText(url)
    .then(() => {
      toast.success(successMessage);
    })
    .catch(() => {
      toast.error("Could not copy the Work OS link");
    });
}

function sourceLinkLabel(
  source: "role_routine" | "team_run" | "workpack_record"
): string {
  switch (source) {
    case "role_routine":
      return "Role Routine";
    case "team_run":
      return "Team Run";
    case "workpack_record":
      return "Workpack";
  }
}

function executionStatusLabel(value: string | null | undefined): string {
  if (!value) return "n/a";
  return value.replaceAll("_", " ");
}

function executionModeLabel(value: string | null | undefined): string {
  if (!value) return "n/a";
  switch (value) {
    case "auto_team":
      return "Auto team";
    case "fully_auto":
      return "Fully auto";
    case "semi_auto":
      return "Semi auto";
    case "manual_assist":
      return "Manual assist";
    case "review":
      return "Review";
    default:
      return value.replaceAll("_", " ");
  }
}

function mediaPipelineStatusLabel(value: string | null | undefined): string {
  switch (value) {
    case "collecting_assets":
      return "Collecting media assets";
    case "waiting_for_video_tasks":
      return "Generating video clips";
    case "rendering_final_video":
      return "Composing final video";
    case "probing_final_video":
      return "Verifying final video";
    case "completed":
      return "Final video ready";
    case "failed":
      return "Media pipeline failed";
    default:
      return value ? value.replaceAll("_", " ") : "n/a";
  }
}

const pageShellClass =
  "min-h-screen bg-white text-slate-950";

const topBarClass =
  "sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl";

const softPanelClass =
  "rounded-2xl border border-slate-200 bg-white shadow-sm";

function RequestsLoadingState() {
  return (
    <div
      className="space-y-4"
      aria-label="Loading requests"
      aria-live="polite"
    >
      {[0, 1, 2].map(index => (
        <div key={index} className={cn(softPanelClass, "p-4 sm:p-5")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-5 w-2/3 max-w-sm" />
              <Skeleton className="h-4 w-full max-w-md" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-9 w-full rounded-md sm:w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MyRequestsPage() {
  const { user } = useAuth();
  const { t } = useScopedTranslation("workos");
  const [location, setLocation] = useLocation();
  const resultParams = useMemo(() => {
    const query = location.includes("?") ? location.slice(location.indexOf("?") + 1) : "";
    return new URLSearchParams(query);
  }, [location]);
  const highlightedRequestId = resultParams.get("requestId");
  const highlightedRunId = resultParams.get("runId");
  const openedFromResultNotification = resultParams.get("result") === "1";

  const requestsQuery = trpc.workOs.listMyRequests.useQuery({ limit: 25 });
  const trpcUtils = trpc.useUtils();
  const resumeRunMutation = trpc.teamRun.resume.useMutation({
    onSuccess: async () => {
      toast.success("Automation continued");
      await trpcUtils.workOs.listMyRequests.invalidate();
    },
    onError: error => {
      toast.error(error.message || "Could not continue automation");
    },
  });

  useEffect(() => {
    if (!user) {
      setLocation("/login");
    }
  }, [setLocation, user]);

  const requests = useMemo(() => {
    const data = requestsQuery.data ?? [];
    if (!highlightedRequestId) return data;
    return [...data].sort((a, b) => {
      if (a.id === highlightedRequestId) return -1;
      if (b.id === highlightedRequestId) return 1;
      return 0;
    });
  }, [highlightedRequestId, requestsQuery.data]);
  const summary = useMemo(() => {
    const total = requests.length;
    const active = requests.filter(
      request => request.currentState !== "completed"
    ).length;
    const waiting = requests.filter(
      request =>
        request.currentState === "waiting_for_approval" ||
        request.currentState === "waiting_for_input"
    ).length;
    const completed = requests.filter(
      request => request.currentState === "completed"
    ).length;

    return { total, active, waiting, completed };
  }, [requests]);

  const isAdminLike = user?.role === "admin" || user?.role === "domain_admin";

  return (
    <div className={pageShellClass}>
      <header className={topBarClass}>
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => setLocation("/dashboard")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Dashboard
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Work OS
              </p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                  <ClipboardList className="h-5 w-5 text-sky-700" />
                </span>
                <span className="truncate">{t("list.title", "My Requests")}</span>
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                {t(
                  "list.subtitle",
                  "Track the work you started and see what happens next."
                )}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <LocaleToggle className="shrink-0" />
            <Button
              variant="outline"
              className="justify-center"
              onClick={() => setLocation("/help/work-os")}
            >
              <BookOpen className="mr-1 h-4 w-4" />
              {t("helper.guide", "Open guide")}
            </Button>
            <Button
              variant="outline"
              className="justify-center"
              onClick={() => setLocation("/chat")}
            >
              <MessageSquare className="mr-1 h-4 w-4" />
              {t("list.openChat", "Open Chat")}
            </Button>
            <Button
              variant="outline"
              className="justify-center"
              onClick={() => setLocation("/work/request")}
            >
              <ArrowRight className="mr-1 h-4 w-4" />
              {t("list.startWork", "Start Work")}
            </Button>
            {isAdminLike ? (
              <>
                <Button asChild>
                  <Link href={buildWorkOsConsolePath(null)}>
                    <ShieldCheck className="mr-1 h-4 w-4" />
                    {t("list.openConsole", "Open Work OS Console")}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="justify-center"
                  onClick={() =>
                    copyWorkOsLink(
                      buildWorkOsConsolePath(null),
                      "Work OS link copied"
                    )
                  }
                >
                  <Copy className="mr-1 h-4 w-4" />
                  Copy permalink
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardStatCard
            icon={ClipboardList}
            label={t("list.summary.total", "Total requests")}
            value={summary.total}
          />
          <DashboardStatCard
            icon={Clock3}
            label={t("list.summary.active", "Active")}
            value={summary.active}
          />
          <DashboardStatCard
            icon={Loader2}
            label={t("list.summary.waiting", "Waiting")}
            value={summary.waiting}
          />
          <DashboardStatCard
            icon={FileText}
            label={t("list.summary.completed", "Completed")}
            value={summary.completed}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <DashboardCard
            title={t("list.sectionTitle", "Tracked requests")}
            description={t(
              "list.description",
              "This page helps you review requests you created, see who owns them now, and jump back into Work Request when you need to start more work."
            )}
            trailing={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/work/request")}
                >
                  {t("list.startWork", "Start Work")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/chat")}
                >
                  {t("list.openChat", "Open Chat")}
                </Button>
              </div>
            }
          >
            {openedFromResultNotification ? (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {t(
                  "list.resultNotificationOpened",
                  "The completed request is highlighted below. Open the final result or the team room from its execution trail."
                )}
              </div>
            ) : null}
            {requestsQuery.isLoading ? (
              <RequestsLoadingState />
            ) : requestsQuery.error ? (
              <div
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-rose-950 sm:px-5"
                role="alert"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                    <div>
                      <p className="font-semibold">
                        {t("list.errorTitle", "Could not load requests")}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-rose-800">
                        {requestsQuery.error.message ||
                          t(
                            "list.errorBody",
                            "Refresh the list or try again in a moment."
                          )}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-rose-200 bg-white text-rose-700 hover:bg-rose-100"
                    onClick={() => void requestsQuery.refetch()}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t("list.retry", "Retry")}
                  </Button>
                </div>
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white">
                  <ClipboardList className="h-6 w-6 text-slate-500" />
                </div>
                <p className="mt-4 text-base font-semibold text-slate-950">
                  {t("list.emptyTitle", "No requests yet")}
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
                  {t(
                    "list.emptyBody",
                    "Start a new request and it will appear here."
                  )}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setLocation("/work/request")}>
                    {t("list.startWork", "Start Work")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/help/work-os")}
                  >
                    {t("helper.guide", "Open guide")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((request: WorkRequestRecord) => {
                  const ownerLabel = request.defaultQueueId
                    ? `Team queue · ${request.defaultQueueId}`
                    : request.defaultOwnerType === "queue"
                      ? `Queue · ${request.defaultOwnerId ?? "n/a"}`
                      : request.defaultOwnerType === "role"
                        ? `Role · ${request.defaultOwnerId ?? "n/a"}`
                        : request.defaultOwnerType === "human"
                          ? t("form.ownershipSelf", "Assign to me")
                          : t("form.ownershipUnassigned", "Leave unassigned");
                  const executionTrail = request.executionTrail ?? null;
                  const canOpenExecutionRoom = Boolean(
                    executionTrail?.teamId && executionTrail?.roomId
                  );
                  const highlighted =
                    request.id === highlightedRequestId ||
                    (highlightedRunId &&
                      request.executionTrail?.teamRunId === highlightedRunId);
                  const executionNeedsAttention =
                    executionTrail?.teamRunStatus === "paused" ||
                    executionTrail?.workItemStatus === "blocked";
                  const canResumeExecution = Boolean(
                    executionTrail?.teamRunId &&
                      executionTrail?.teamRunStatus === "paused"
                  );

                  return (
	                    <article
	                      key={request.id}
	                      className={cn(
                        "rounded-2xl border bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:p-5",
                        highlighted
                          ? "border-emerald-300 ring-2 ring-emerald-100"
                          : "border-slate-200"
                      )}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-slate-950">
                            {request.title}
                          </h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {stateLabel(t, request.currentState)} ·{" "}
                            {t("list.source", "Source")}:{" "}
                            {formatSourceLabel(request.sourceType)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {canOpenExecutionRoom ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                setLocation(
                                  buildTeamRoomPath(
                                    executionTrail?.teamId ?? null,
                                    executionTrail?.roomId ?? null,
                                    "workflow"
                                  )
                                )
                              }
                            >
                              Open room
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setLocation("/work/request")}
                            >
                              {t("list.startWork", "Start Work")}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-medium",
                            stateBadgeClass(request.currentState)
                          )}
                        >
                          {stateLabel(t, request.currentState)}
                        </Badge>
                        {request.businessDomain ? (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 text-slate-700"
                          >
                            {t("list.businessDomain", "Domain")}:{" "}
                            {request.businessDomain}
                          </Badge>
                        ) : null}
                        {request.urgency ? (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 text-slate-700"
                          >
                            Urgency: {request.urgency}
                          </Badge>
                        ) : null}
                        {request.riskLevel ? (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 text-slate-700"
                          >
                            Risk: {request.riskLevel}
                          </Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-slate-50 text-slate-700"
                        >
                          Request: {request.id}
                        </Badge>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                            Created
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {formatDate(request.createdAt)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                            Owner
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {ownerLabel}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                            Case
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {request.linkedCaseId ?? "n/a"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                            Request
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900 break-all">
                            {request.id}
                          </p>
                        </div>
                      </div>

                      {executionTrail ? (
                        <div
                          className={cn(
                            "rounded-2xl border p-4",
                            executionNeedsAttention
                              ? "border-amber-200 bg-amber-50/70"
                              : "border-sky-200 bg-sky-50/60"
                          )}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Execution trail
                              </p>
                              <p className="text-xs text-slate-500">
                                {executionNeedsAttention
                                  ? "The team room exists. Open it to see the current blocker and the next automatic retry or required action."
                                  : "The request is running in the team room. Open the room to see live progress and generated artifacts."}
                              </p>
                            </div>
                            {executionTrail.teamRunStatus ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "bg-white",
                                  executionNeedsAttention
                                    ? "border-amber-200 text-amber-700"
                                    : "border-sky-200 text-sky-700"
                                )}
                              >
                                Run:{" "}
                                {executionStatusLabel(
                                  executionTrail.teamRunStatus
                                )}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <div className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Team
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                                {executionTrail.teamId ?? "n/a"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Room
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                                {executionTrail.roomId ?? "n/a"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Run
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                                {executionTrail.teamRunId ?? "n/a"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Mode
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                                {executionModeLabel(
                                  executionTrail.teamRunMode
                                )}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Work item
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                                {executionTrail.workItemStatus ?? "n/a"}
                              </p>
                            </div>
                          </div>

                          {executionTrail.mediaPipelineStatus ? (
                            <div className="mt-3 rounded-2xl border border-indigo-200 bg-white/90 p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                    Media pipeline
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-slate-900">
                                    {mediaPipelineStatusLabel(
                                      executionTrail.mediaPipelineStatus
                                    )}
                                  </p>
                                  {executionTrail.mediaPipelineLastCheckedAt ? (
                                    <p className="mt-1 text-xs text-slate-500">
                                      Last checked {formatDate(executionTrail.mediaPipelineLastCheckedAt)}
                                    </p>
                                  ) : null}
                                  {(executionTrail.mediaPipelinePendingImageTasks ?? 0) +
                                    (executionTrail.mediaPipelinePendingVideoTasks ?? 0) >
                                  0 ? (
                                    <p className="mt-1 text-xs text-slate-500">
                                      Pending assets: {executionTrail.mediaPipelinePendingImageTasks ?? 0} image,{" "}
                                      {executionTrail.mediaPipelinePendingVideoTasks ?? 0} video
                                    </p>
                                  ) : null}
                                  {executionTrail.mediaPipelineErrorMessage ? (
                                    <p className="mt-1 text-xs text-rose-700">
                                      {executionTrail.mediaPipelineErrorMessage}
                                    </p>
                                  ) : null}
                                </div>
                                {executionTrail.mediaPipelineFinalVideoUrl ? (
                                  <Button asChild variant="outline" size="sm">
                                    <a
                                      href={
                                        executionTrail.mediaPipelineFinalVideoUrl
                                      }
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Open final video
                                    </a>
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            {canResumeExecution ? (
                              <Button
                                size="sm"
                                disabled={resumeRunMutation.isPending}
                                onClick={() =>
                                  resumeRunMutation.mutate({
                                    runId: executionTrail?.teamRunId ?? "",
                                  })
                                }
                              >
                                {resumeRunMutation.isPending ? (
                                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                ) : (
                                  <Play className="mr-1 h-4 w-4" />
                                )}
                                Continue automation
                              </Button>
                            ) : null}
                            {canOpenExecutionRoom ? (
                              <Button
                                variant={
                                  canResumeExecution ? "outline" : "default"
                                }
                                size="sm"
                                onClick={() =>
                                  setLocation(
                                    buildTeamRoomPath(
                                      executionTrail?.teamId ?? null,
                                      executionTrail?.roomId ?? null,
                                      "workflow"
                                    )
                                  )
                                }
                              >
                                Open room
                              </Button>
                            ) : null}
                            {request.linkedCaseId ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setLocation(
                                    buildWorkOsSourcePath(
                                      "team_run",
                                      request.linkedCaseId ?? null
                                    )
                                  )
                                }
                              >
                                Open run history
                              </Button>
                            ) : null}
                            {request.linkedCaseId ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setLocation(
                                    buildWorkOsConsolePath(
                                      request.linkedCaseId ?? null
                                    )
                                  )
                                }
                              >
                                Open linked Work OS Console
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {request.linkedCaseId && !executionTrail ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Send to the automation team
                              </p>
                              <p className="text-xs text-slate-500">
                                Start the team room and let automation work through the plan.
                              </p>
                            </div>
                            <Button asChild size="sm">
                              <Link href={buildWorkRequestPath(request.id)}>
                                Start automation
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {isAdminLike ? (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-semibold text-slate-900">
                              Work OS shortcuts
                            </p>
                            <p className="text-xs text-slate-500">
                              Open the request's related evidence
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={buildWorkRequestPath(request.id)}>
                                Edit request
                              </Link>
                            </Button>
                            <Button asChild size="sm">
                              <Link
                                href={buildWorkOsConsolePath(
                                  request.linkedCaseId ?? null
                                )}
                              >
                                {request.linkedCaseId
                                  ? "Open linked Work OS Console"
                                  : t(
                                      "list.openConsole",
                                      "Open Work OS Console"
                                    )}
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                copyWorkOsLink(
                                  buildWorkOsConsolePath(
                                    request.linkedCaseId ?? null
                                  ),
                                  "Work OS link copied"
                                )
                              }
                            >
                              <Copy className="mr-1 h-4 w-4" />
                              Copy permalink
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setLocation(
                                  buildWorkOsSourcePath(
                                    "role_routine",
                                    request.linkedCaseId ?? null
                                  )
                                )
                              }
                            >
                              {sourceLinkLabel("role_routine")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setLocation(
                                  buildWorkOsSourcePath(
                                    "team_run",
                                    request.linkedCaseId ?? null
                                  )
                                )
                              }
                            >
                              {sourceLinkLabel("team_run")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setLocation(
                                  buildWorkOsSourcePath(
                                    "workpack_record",
                                    request.linkedCaseId ?? null
                                  )
                                )
                              }
                            >
                              {sourceLinkLabel("workpack_record")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Copy role evidence"
                              onClick={() =>
                                copyWorkOsLink(
                                  buildWorkOsSourcePath(
                                    "role_routine",
                                    request.linkedCaseId ?? null
                                  ),
                                  "Role Routine link copied"
                                )
                              }
                            >
                              <Copy className="mr-1 h-4 w-4" />
                              Copy role evidence
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Copy team evidence"
                              onClick={() =>
                                copyWorkOsLink(
                                  buildWorkOsSourcePath(
                                    "team_run",
                                    request.linkedCaseId ?? null
                                  ),
                                  "Team Run link copied"
                                )
                              }
                            >
                              <Copy className="mr-1 h-4 w-4" />
                              Copy team evidence
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Copy workpack evidence"
                              onClick={() =>
                                copyWorkOsLink(
                                  buildWorkOsSourcePath(
                                    "workpack_record",
                                    request.linkedCaseId ?? null
                                  ),
                                  "Workpack link copied"
                                )
                              }
                            >
                              <Copy className="mr-1 h-4 w-4" />
                              Copy workpack evidence
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {request.linkedCaseId ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Work OS Console
                              </p>
                              <p className="text-xs text-slate-500">
                                Open the linked case and timeline for this
                                request
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild variant="outline" size="sm">
                                <Link href={buildWorkRequestPath(request.id)}>
                                  Edit request
                                </Link>
                              </Button>
                              <Button asChild variant="outline" size="sm">
                                <Link
                                  href={buildWorkOsConsolePath(
                                    request.linkedCaseId
                                  )}
                                >
                                  Open request console
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title={t("helper.title", "What happens next")}
            description={t(
              "page.forUsersBody",
              "Use this page when you want to start a new request, ask for help, or hand a task to the operations team."
            )}
            leading={<ClipboardList className="h-5 w-5 text-sky-600" />}
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <p className="text-sm font-medium text-sky-900">
                  {t(
                    "helper.step1",
                    "A request record is created first, then a case is opened for tracking."
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-700">
                  {t(
                    "helper.step2",
                    "If a team or queue should own it, the case can be assigned after creation."
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-700">
                  {t(
                    "helper.step3",
                    "Admins can review approvals, exceptions, SLA changes, and the case timeline in Work OS Console."
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => setLocation("/work/request")}>
                  {t("list.startWork", "Start Work")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/help/work-os")}
                >
                  {t("helper.guide", "Open guide")}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Work OS links are bookmarkable. `timelineSource=work_os` opens
                the main case view, while `role_routine`, `team_run`, and
                `workpack_record` jump straight to those evidence slices.
              </p>
            </div>
          </DashboardCard>
        </div>
      </main>
    </div>
  );
}
