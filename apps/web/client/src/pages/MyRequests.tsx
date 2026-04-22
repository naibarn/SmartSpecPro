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
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Clock3,
  FileText,
  Loader2,
  MessageSquare,
  Copy,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

export default function MyRequestsPage() {
  const { user } = useAuth();
  const { t } = useScopedTranslation("workos");
  const [, setLocation] = useLocation();

  const requestsQuery = trpc.workOs.listMyRequests.useQuery({ limit: 25 });

  useEffect(() => {
    if (!user) {
      setLocation("/login");
    }
  }, [setLocation, user]);

  const requests = requestsQuery.data ?? [];
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
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-sky-50/40">
      <div className="border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/dashboard")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Dashboard
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                <ClipboardList className="h-6 w-6 text-sky-600" />
                {t("list.title", "My Requests")}
              </h1>
              <p className="text-sm text-slate-600">
                {t(
                  "list.subtitle",
                  "Track the work you started and see what happens next."
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LocaleToggle className="shrink-0" />
            <Button
              variant="outline"
              onClick={() => setLocation("/help/work-os")}
            >
              <BookOpen className="mr-1 h-4 w-4" />
              {t("helper.guide", "Open guide")}
            </Button>
            <Button variant="outline" onClick={() => setLocation("/chat")}>
              <MessageSquare className="mr-1 h-4 w-4" />
              {t("list.openChat", "Open Chat")}
            </Button>
            <Button
              variant="outline"
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
      </div>

      <div className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 lg:px-8">
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

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
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
            {requestsQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                {t("recent.loading", "Loading requests...")}
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
                <p className="text-base font-medium text-slate-900">
                  {t("list.emptyTitle", "No requests yet")}
                </p>
                <p className="mt-1 text-sm text-slate-500">
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

                  return (
                    <DashboardCard
                      key={request.id}
                      title={request.title}
                      description={`${stateLabel(t, request.currentState)} · ${t("list.source", "Source")}: ${formatSourceLabel(request.sourceType)}`}
                      trailing={
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation("/work/request")}
                          >
                            {t("list.startWork", "Start Work")}
                          </Button>
                        </div>
                      }
                      bodyClassName="space-y-4"
                    >
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

                      {request.executionTrail ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Execution trail
                              </p>
                              <p className="text-xs text-slate-500">
                                This request has been handed off and is still
                                tracked from My Requests.
                              </p>
                            </div>
                            {request.executionTrail.teamRunStatus ? (
                              <Badge
                                variant="outline"
                                className="border-sky-200 bg-white text-sky-700"
                              >
                                Run:{" "}
                                {executionStatusLabel(
                                  request.executionTrail.teamRunStatus
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
                                {request.executionTrail.teamId ?? "n/a"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Room
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                                {request.executionTrail.roomId ?? "n/a"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Run
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                                {request.executionTrail.teamRunId ?? "n/a"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Mode
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                                {executionModeLabel(
                                  request.executionTrail.teamRunMode
                                )}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-white/90 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Work item
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                                {request.executionTrail.workItemStatus ?? "n/a"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {request.executionTrail.teamId &&
                            request.executionTrail.roomId ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setLocation(
                                    buildTeamRoomPath(
                                      request.executionTrail?.teamId ?? null,
                                      request.executionTrail?.roomId ?? null,
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

                      {request.linkedCaseId ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Start the work
                              </p>
                              <p className="text-xs text-slate-500">
                                Review the preflight bundle, then approve launch
                                to move this request into execution.
                              </p>
                            </div>
                            <Button asChild size="sm">
                              <Link href={buildWorkRequestPath(request.id)}>
                                Review and approve automation
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
                    </DashboardCard>
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
      </div>
    </div>
  );
}
