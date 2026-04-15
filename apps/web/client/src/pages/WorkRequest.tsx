import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type Dispatch, type SetStateAction } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Copy,
  Loader2,
  Cpu,
  Link2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { toast } from "sonner";

type OwnershipMode = "self" | "unassigned" | "team" | "role";
type TeamReadiness = "ready" | "busy" | "backlog" | "idle" | "unavailable";

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "n/a";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleString();
}

function stateBadgeClass(state: string): string {
  switch (state) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "blocked":
    case "escalated":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "waiting_for_approval":
    case "waiting_for_input":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "in_progress":
      return "bg-sky-50 text-sky-700 border-sky-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function readinessBadgeClass(readiness: TeamReadiness): string {
  switch (readiness) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "busy":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "backlog":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "idle":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "unavailable":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function readinessIcon(readiness: TeamReadiness) {
  switch (readiness) {
    case "ready":
      return CheckCircle2;
    case "busy":
      return Activity;
    case "backlog":
      return AlertTriangle;
    case "idle":
      return Clock3;
    case "unavailable":
      return AlertTriangle;
    default:
      return Clock3;
  }
}

function resolveTeamReadiness(team: {
  status?: string | null;
  roomCount?: number;
  activeRunCount?: number;
  openWorkItemCount?: number;
  waitingWorkItemCount?: number;
}): TeamReadiness {
  if (team.status && team.status !== "active") {
    return "unavailable";
  }

  if ((team.roomCount ?? 0) <= 0) {
    return "idle";
  }

  if ((team.activeRunCount ?? 0) > 0) {
    return "busy";
  }

  if ((team.openWorkItemCount ?? 0) > 0) {
    return "backlog";
  }

  return "ready";
}

function readinessLabel(readiness: TeamReadiness): string {
  switch (readiness) {
    case "ready":
      return "Ready to take work";
    case "busy":
      return "Busy";
    case "backlog":
      return "Has backlog";
    case "idle":
      return "No active room";
    case "unavailable":
      return "Unavailable";
    default:
      return "Unknown";
  }
}

function roomTypeLabel(roomType?: string | null): string | null {
  switch (roomType) {
    case "team":
      return "Team room";
    case "auto_team":
      return "Auto team";
    case "job_review":
      return "Job review";
    case "direct":
      return "Direct room";
    default:
      return null;
  }
}

function roomTypeIcon(roomType?: string | null) {
  switch (roomType) {
    case "team":
      return Users;
    case "auto_team":
      return Cpu;
    case "job_review":
      return ClipboardCheck;
    case "direct":
      return Link2;
    default:
      return null;
  }
}

function roomTypeBadgeClass(roomType?: string | null): string {
  switch (roomType) {
    case "team":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "auto_team":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "job_review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "direct":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function roomTypeTooltipText(roomType?: string | null): string | null {
  switch (roomType) {
    case "team":
      return "A standard team room for ongoing work and collaboration.";
    case "auto_team":
      return "An auto-routed team room that starts with orchestration.";
    case "job_review":
      return "A review room used to inspect, approve, or sign off work.";
    case "direct":
      return "A direct room with a one-to-one or focused handoff.";
    default:
      return null;
  }
}

function buildWorkOsConsolePath(caseId?: string | null): string {
  const params = new URLSearchParams();
  if (caseId) {
    params.set("caseId", caseId);
  }
  params.set("timelineSource", "work_os");
  return `/admin/work-os?${params.toString()}`;
}

function buildTeamRoomPath(teamId: string, roomId?: string | null, panel?: "chat" | "workflow" | "run"): string {
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

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Could not read file"));
    };
    reader.readAsText(file);
  });
}

async function processWorkRequestDetailsFile(
  file: File | null | undefined,
  setDetails: (value: string) => void,
  setDetailsSourceFileName: (value: string | null) => void,
  setSourceType: (value: string) => void,
  setSourceRef: Dispatch<SetStateAction<string>>,
): Promise<void> {
  if (!file) {
    return;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExtensions = new Set(["md", "markdown", "txt", "json", "yaml", "yml", "csv"]);
  const isTextLike = file.type.startsWith("text/")
    || file.type === "application/json"
    || allowedExtensions.has(extension);

  if (!isTextLike) {
    toast.error("Please upload a spec.md, text, or JSON/YAML file.");
    return;
  }

  try {
    const content = await readFileAsText(file);
    if (!content.trim()) {
      toast.error("The uploaded file is empty.");
      return;
    }

    setDetails(content);
    setDetailsSourceFileName(file.name);
    setSourceType("document");
    setSourceRef((current) => (current.trim() ? current : file.name));
    toast.success(`Loaded ${file.name} into the details field`);
  } catch {
    toast.error("Could not read the uploaded file.");
  }
}

export default function WorkRequestPage() {
  const { user } = useAuth();
  const { t } = useScopedTranslation("workos");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [sourceType, setSourceType] = useState("manual");
  const [sourceRef, setSourceRef] = useState("");
  const [businessDomain, setBusinessDomain] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [ownershipMode, setOwnershipMode] = useState<OwnershipMode>("self");
  const [ownerReference, setOwnerReference] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [detailsSourceFileName, setDetailsSourceFileName] = useState<string | null>(null);
  const [detailsDragActive, setDetailsDragActive] = useState(false);
  const detailsFileInputRef = useRef<HTMLInputElement>(null);

  const ownedTeamsQuery = trpc.team.list.useQuery({ ownerOnly: true, status: "active" });
  const allTeamsQuery = trpc.team.list.useQuery({ status: "active" });
  const recentRequestsQuery = trpc.workOs.listMyRequests.useQuery({ limit: 8 });
  const createRequestMutation = trpc.workOs.createRequest.useMutation({
    onSuccess: async (result) => {
      setCreatedRequestId(result.request.id);
      setCreatedCaseId(result.case.id);
      setTitle("");
      setDetails("");
      setSourceType("manual");
      setSourceRef("");
      setBusinessDomain("");
      setUrgency("normal");
      setRiskLevel("medium");
      setOwnershipMode("self");
      setOwnerReference("");
      setSelectedTeamId("");
      toast.success(t("success.title", "Work request created"));
      await utils.workOs.listMyRequests.invalidate();
    },
  });

  const ownedTeams = ownedTeamsQuery.data ?? [];

  const sourceOptions = useMemo(() => [
    { value: "chat", label: "Chat" },
    { value: "webhook", label: "Webhook" },
    { value: "form", label: "Form" },
    { value: "api", label: "API" },
    { value: "document", label: "Document" },
    { value: "schedule", label: "Schedule" },
    { value: "manual", label: "Manual" },
    { value: "other", label: "Other" },
  ], []);

  const urgencyOptions = useMemo(() => [
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
  ], []);

  const riskOptions = useMemo(() => [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "critical", label: "Critical" },
  ], []);

  useEffect(() => {
    if (!user) {
      setLocation("/login");
    }
  }, [user, setLocation]);

  useEffect(() => {
    if (ownershipMode !== "team") {
      return;
    }
    if (selectedTeamId.trim()) {
      return;
    }
    if (ownedTeams.length === 1) {
      setSelectedTeamId(ownedTeams[0].id);
    }
  }, [ownedTeams, ownershipMode, selectedTeamId]);

  const createdRequest = useMemo(
    () => recentRequestsQuery.data?.find((request) => request.id === createdRequestId) ?? null,
    [recentRequestsQuery.data, createdRequestId],
  );
  const ownedTeamIds = useMemo(
    () => new Set(ownedTeams.map((team) => team.id)),
    [ownedTeams],
  );
  const teamReadinessCards = useMemo(() => {
    const priority: Record<TeamReadiness, number> = {
      ready: 0,
      busy: 1,
      backlog: 2,
      idle: 3,
      unavailable: 4,
    };

    return [...(allTeamsQuery.data ?? [])]
      .map((team) => {
        const roomCount = team.roomCount ?? 0;
        const activeRunCount = team.activeRunCount ?? 0;
        const openWorkItemCount = team.openWorkItemCount ?? 0;
        const waitingWorkItemCount = team.waitingWorkItemCount ?? 0;
        const readiness = resolveTeamReadiness({
          status: team.status,
          roomCount,
          activeRunCount,
          openWorkItemCount,
          waitingWorkItemCount,
        });

        return {
          ...team,
          roomCount,
          latestRoomId: team.latestRoomId ?? null,
          latestRoomType: team.latestRoomType ?? null,
          activeRunCount,
          openWorkItemCount,
          waitingWorkItemCount,
          readiness,
          readyToTakeWork: readiness === "ready",
          isOwned: ownedTeamIds.has(team.id),
        };
      })
      .sort((left, right) => {
        const readinessDelta = priority[left.readiness] - priority[right.readiness];
        if (readinessDelta !== 0) {
          return readinessDelta;
        }
        return left.name.localeCompare(right.name);
      });
  }, [allTeamsQuery.data, ownedTeamIds]);

  const teamReadinessSummary = useMemo(() => {
    return teamReadinessCards.reduce(
      (acc, team) => {
        acc.total += 1;
        if (team.readiness === "ready") acc.ready += 1;
        if (team.readiness === "busy") acc.busy += 1;
        if (team.readiness === "backlog") acc.backlog += 1;
        if (team.readiness === "idle") acc.idle += 1;
        if (team.readiness === "unavailable") acc.unavailable += 1;
        return acc;
      },
      { total: 0, ready: 0, busy: 0, backlog: 0, idle: 0, unavailable: 0 },
    );
  }, [teamReadinessCards]);

  const handleDetailsFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await processWorkRequestDetailsFile(
      file,
      setDetails,
      setDetailsSourceFileName,
      setSourceType,
      setSourceRef,
    );
  };

  const handleDetailsDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDetailsDragActive(false);
    await processWorkRequestDetailsFile(
      event.dataTransfer.files?.[0],
      setDetails,
      setDetailsSourceFileName,
      setSourceType,
      setSourceRef,
    );
  };

  const handleDetailsDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDetailsDragActive(true);
  };

  const handleDetailsDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDetailsDragActive(true);
  };

  const handleDetailsDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDetailsDragActive(false);
  };

  const clearDetailsFile = () => {
    setDetailsSourceFileName(null);
    if (detailsFileInputRef.current) {
      detailsFileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Please add a title.");
      return;
    }

    const trimmedDetails = details.trim();
    const trimmedSourceRef = sourceRef.trim();
    const trimmedBusinessDomain = businessDomain.trim();
    const trimmedOwnerReference = ownerReference.trim();
    const trimmedTeamId = selectedTeamId.trim();

    const defaultOwnerType = ownershipMode === "self"
      ? "human"
      : ownershipMode === "team"
        ? "queue"
        : ownershipMode === "role"
          ? "role"
          : undefined;

    const defaultOwnerId = ownershipMode === "self"
      ? String(user.id)
      : ownershipMode === "role"
        ? trimmedOwnerReference || undefined
        : undefined;

    if (ownershipMode === "team" && !trimmedTeamId) {
      toast.error("Please choose one of your teams.");
      return;
    }

    try {
      await createRequestMutation.mutateAsync({
        sourceType,
        sourceRef: trimmedSourceRef || undefined,
        title: trimmedTitle,
        objective: trimmedDetails || undefined,
        requesterType: "human",
        requesterId: String(user.id),
        businessDomain: trimmedBusinessDomain || undefined,
        urgency,
        riskLevel,
        defaultOwnerType,
        defaultOwnerId,
        defaultQueueId: ownershipMode === "team" ? trimmedTeamId || undefined : undefined,
      });
    } catch (error) {
      console.error("Failed to create work request", error);
      toast.error("Failed to create work request.");
    }
  };

  const isPrivileged = user?.role === "admin" || user?.role === "domain_admin";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#f8fafc_50%,_#eef2ff_100%)]">
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-white/70 bg-white/80 backdrop-blur-xl">
          <div className="flex w-full flex-col gap-4 px-4 py-4 md:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/chat")}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Chat
              </Button>
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
                  <ClipboardList className="h-7 w-7 text-sky-600" />
                  {t("page.title", "Start Work Request")}
                </h1>
                <p className="max-w-3xl text-sm text-slate-600">
                  {t("page.subtitle", "Create a tracked work request that Work OS can route, monitor, and follow through to completion.")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setLocation("/help/work-os")}>
                {t("helper.guide", "Open guide")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              {isPrivileged ? (
                <>
                  <Button onClick={() => setLocation(buildWorkOsConsolePath(createdCaseId))} disabled={!createdCaseId}>
                    <ShieldCheck className="mr-1 h-4 w-4" />
                    {t("success.openConsole", "Open in Work OS Console")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!createdCaseId}
                    onClick={() => copyWorkOsLink(buildWorkOsConsolePath(createdCaseId), "Work OS link copied")}
                  >
                    <Copy className="mr-1 h-4 w-4" />
                    Copy permalink
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 md:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-none flex-col gap-6">
            <DashboardCard
              className="overflow-hidden border-sky-200/60 bg-white/90 shadow-[0_20px_70px_rgba(14,165,233,0.08)]"
              bodyClassName="p-5 md:p-6"
              title={t("page.teamStatusTitle", "Team readiness")}
              description={t("page.teamStatusDescription", "See which teams are free, busy, or carrying backlog before you start a request.")}
            >
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
                    {t("page.teamStatusReady", "Ready to take work")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-900">{teamReadinessSummary.ready}</p>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                    {t("page.teamStatusBusy", "Busy")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-sky-900">{teamReadinessSummary.busy}</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
                    {t("page.teamStatusBacklog", "Has backlog")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-amber-900">{teamReadinessSummary.backlog}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                    {t("page.teamStatusTotal", "All teams")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{teamReadinessSummary.total}</p>
                </div>
              </div>

              <div className="mt-5 max-h-[42vh] overflow-auto pr-1">
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {allTeamsQuery.isLoading ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500 xl:col-span-3">
                      Loading team readiness...
                    </div>
                  ) : teamReadinessCards.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500 xl:col-span-3">
                      {t("page.teamStatusEmpty", "No active teams are available yet.")}
                    </div>
                  ) : (
                    teamReadinessCards.map((team) => {
                      const StatusIcon = readinessIcon(team.readiness);
                      const RoomTypeIcon = roomTypeIcon(team.latestRoomType);
                      return (
                        <div
                          key={team.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open team ${team.name}`}
                          onClick={() => setLocation(`/teams/${team.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setLocation(`/teams/${team.id}`);
                            }
                          }}
                          className={cn(
                            "rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60",
                            team.readiness === "ready"
                              ? "border-emerald-200"
                              : team.readiness === "busy"
                                ? "border-sky-200"
                                : team.readiness === "backlog"
                                  ? "border-amber-200"
                                  : team.readiness === "unavailable"
                                    ? "border-rose-200"
                                    : "border-slate-200",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-slate-950">{team.name}</p>
                              {team.isOwned ? (
                                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                                  {t("page.teamStatusOwned", "Your team")}
                                </Badge>
                              ) : null}
                              {roomTypeLabel(team.latestRoomType) ? (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        variant="outline"
                                        title={roomTypeTooltipText(team.latestRoomType) ?? undefined}
                                        className={cn("gap-1 capitalize", roomTypeBadgeClass(team.latestRoomType))}
                                      >
                                        {RoomTypeIcon ? <RoomTypeIcon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                                        {roomTypeLabel(team.latestRoomType)}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                      {roomTypeTooltipText(team.latestRoomType)}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : null}
                            </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
                                <span className="text-slate-300"> · </span>
                                {team.roomCount} {team.roomCount === 1 ? "room" : "rooms"}
                              </p>
                            </div>
                            <Badge variant="outline" className={cn("gap-1 rounded-full", readinessBadgeClass(team.readiness))}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              {readinessLabel(team.readiness)}
                            </Badge>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600">
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Runs</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{team.activeRunCount}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Open</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{team.openWorkItemCount}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Waiting</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{team.waitingWorkItemCount}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-slate-500">
                            {team.readiness === "ready"
                              ? "This team can take a new request now."
                              : team.readiness === "busy"
                                ? "This team is actively running work."
                                : team.readiness === "backlog"
                                  ? "This team has work waiting in the queue."
                                  : team.readiness === "idle"
                                    ? "This team has no active room yet."
                                    : "This team is not currently available."}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!team.latestRoomId}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!team.latestRoomId) return;
                                setLocation(buildTeamRoomPath(team.id, team.latestRoomId));
                              }}
                            >
                              Open room
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!team.latestRoomId}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!team.latestRoomId) return;
                                setLocation(buildTeamRoomPath(team.id, team.latestRoomId, "workflow"));
                              }}
                            >
                              Open queue
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </DashboardCard>

            {createdRequestId ? (
              <DashboardCard
                title={t("success.title", "Work request created")}
                description={t("success.body", "Your request is now tracked and ready for routing or follow-up.")}
              >
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">Request:</span> {createdRequestId}</p>
                  <p><span className="font-medium">Case:</span> {createdCaseId ?? "n/a"}</p>
                  {createdRequest ? (
                    <Badge variant="outline" className={cn("capitalize", stateBadgeClass(createdRequest.currentState))}>
                      {createdRequest.currentState}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setLocation("/chat")}>
                    {t("success.openChat", "Back to Chat")}
                  </Button>
                  {isPrivileged ? (
                    <>
                      <Button onClick={() => setLocation(buildWorkOsConsolePath(createdCaseId))}>
                        {t("success.openConsole", "Open in Work OS Console")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => copyWorkOsLink(buildWorkOsConsolePath(createdCaseId), "Work OS link copied")}
                      >
                        <Copy className="mr-1 h-4 w-4" />
                        Copy permalink
                      </Button>
                    </>
                  ) : null}
                </div>
              </DashboardCard>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
              <DashboardCard
                title={t("page.title", "Start Work Request")}
                description={t("page.subtitle", "Create a tracked work request that Work OS can route, monitor, and follow through to completion.")}
              >
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="work-title">{t("form.title", "Title")}</Label>
                    <Input
                      id="work-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={t("form.titlePlaceholder", "Example: Review refund request for Order #1842")}
                      required
                    />
                  </div>

                  <div
                    data-testid="details-dropzone"
                    className={cn(
                      "space-y-3 rounded-2xl border p-4 transition",
                      detailsDragActive
                        ? "border-sky-400 bg-sky-50/70 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]"
                        : "border-slate-200 bg-slate-50/60",
                    )}
                    onDragEnter={handleDetailsDragEnter}
                    onDragOver={handleDetailsDragOver}
                    onDragLeave={handleDetailsDragLeave}
                    onDrop={handleDetailsDrop}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Label htmlFor="work-details">{t("form.details", "Details")}</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {detailsSourceFileName ? (
                          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                            {detailsSourceFileName}
                          </Badge>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => detailsFileInputRef.current?.click()}
                        >
                          Upload spec.md
                        </Button>
                        {detailsSourceFileName ? (
                          <Button type="button" variant="ghost" size="sm" onClick={clearDetailsFile}>
                            Clear file
                          </Button>
                        ) : null}
                        <input
                          ref={detailsFileInputRef}
                          type="file"
                          accept=".md,.markdown,.txt,.json,.yaml,.yml,.csv,text/plain,text/markdown,application/json"
                          className="hidden"
                          aria-label={t("form.detailsUploadLabel", "Upload spec file")}
                          onChange={handleDetailsFileUpload}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {detailsDragActive
                        ? "Drop your spec.md or brief here to fill the details field."
                        : "Drag and drop a spec.md, notes, or task brief here to prefill the details field."
                      }
                    </p>
                    <Textarea
                      id="work-details"
                      value={details}
                      onChange={(event) => setDetails(event.target.value)}
                      placeholder={t(
                        "form.detailsPlaceholder",
                        "Add context, desired outcome, blockers, or attach a spec.md so the team can act faster.",
                      )}
                      rows={7}
                    />
                    <p className="text-xs text-slate-500">
                      {t(
                        "form.detailsHint",
                        "Upload a spec.md, notes, or task brief to prefill this field automatically and avoid retyping.",
                      )}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("form.sourceType", "How did this work come in?")}</Label>
                      <Select value={sourceType} onValueChange={setSourceType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="work-source-ref">{t("form.sourceRef", "Source reference")}</Label>
                      <Input
                        id="work-source-ref"
                        value={sourceRef}
                        onChange={(event) => setSourceRef(event.target.value)}
                        placeholder={t("form.sourceRefPlaceholder", "Example: chat thread ID, webhook event ID, ticket number")}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="work-domain">{t("form.businessDomain", "Business domain")}</Label>
                      <Input
                        id="work-domain"
                        value={businessDomain}
                        onChange={(event) => setBusinessDomain(event.target.value)}
                        placeholder={t("form.businessDomainPlaceholder", "Example: support, finance, operations")}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t("form.urgency", "Urgency")}</Label>
                        <Select value={urgency} onValueChange={setUrgency}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {urgencyOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("form.riskLevel", "Risk level")}</Label>
                        <Select value={riskLevel} onValueChange={setRiskLevel}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {riskOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{t("form.ownership", "Initial ownership")}</h3>
                      <p className="text-sm text-slate-600">
                        Assign it to yourself, or leave it unassigned and route it later in Work OS Console.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Button
                        type="button"
                        variant={ownershipMode === "self" ? "default" : "outline"}
                        className="justify-start"
                        onClick={() => setOwnershipMode("self")}
                      >
                        {t("form.ownershipSelf", "Assign to me")}
                      </Button>
                      <Button
                        type="button"
                        variant={ownershipMode === "team" ? "default" : "outline"}
                        className="justify-start"
                        onClick={() => setOwnershipMode("team")}
                      >
                        {t("form.ownershipTeam", "Assign to my team")}
                      </Button>
                      <Button
                        type="button"
                        variant={ownershipMode === "unassigned" ? "default" : "outline"}
                        className="justify-start"
                        onClick={() => setOwnershipMode("unassigned")}
                      >
                        {t("form.ownershipUnassigned", "Leave unassigned")}
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                      <Select value={ownershipMode} onValueChange={(value) => setOwnershipMode(value as OwnershipMode)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Ownership mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="self">Assign to me</SelectItem>
                          <SelectItem value="team">Assign to my team</SelectItem>
                          <SelectItem value="role">Assign to role</SelectItem>
                          <SelectItem value="unassigned">Leave unassigned</SelectItem>
                        </SelectContent>
                      </Select>
                      {ownershipMode === "team" ? (
                        <div className="space-y-2">
                          <Label htmlFor="team-owner-select">Team</Label>
                          <select
                            id="team-owner-select"
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                            value={selectedTeamId}
                            onChange={(event) => setSelectedTeamId(event.target.value)}
                          >
                            <option value="" disabled>
                              {ownedTeamsQuery.isLoading ? "Loading your teams..." : "Choose one of your teams"}
                            </option>
                            {(ownedTeamsQuery.data ?? []).map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <Input
                          value={ownerReference}
                          onChange={(event) => setOwnerReference(event.target.value)}
                          placeholder={t("form.ownerIdPlaceholder", "Example: support-queue, finance-review, or team queue ID")}
                          disabled={ownershipMode === "self" || ownershipMode === "unassigned"}
                        />
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Choose “Assign to my team” to route the request to one of your own teams. Work OS will keep the tenant work item, then the team orchestra can fan out to personas inside that team.
                    </p>
                    {ownershipMode === "team" ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                        {ownedTeamsQuery.isLoading ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading your teams...
                          </div>
                        ) : (ownedTeamsQuery.data ?? []).length === 0 ? (
                          <p>You do not have any active teams yet. Create a team first, then use it as the work owner.</p>
                        ) : (
                          <p>Select the team that should receive the work. The selected team remains within your tenant and can distribute the task to its personas.</p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={createRequestMutation.isPending || !title.trim()}>
                      {createRequestMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("form.creating", "Creating...")}
                        </>
                      ) : (
                        t("form.submit", "Create Work Request")
                      )}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setLocation("/chat")}>
                      {t("success.openChat", "Back to Chat")}
                    </Button>
                  </div>
                </form>
              </DashboardCard>

              <div className="space-y-6">
                <DashboardCard title={t("recent.title", "My recent requests")} description={t("recent.subtitle", "These are the requests you created most recently.")}>
                  <div className="space-y-3">
                    {recentRequestsQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading requests...
                      </div>
                    ) : (recentRequestsQuery.data ?? []).length === 0 ? (
                      <p className="text-sm text-slate-500">{t("recent.empty", "You have not created any work requests yet.")}</p>
                    ) : (
                      (recentRequestsQuery.data ?? []).map((request) => (
                        <div key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">{request.title}</p>
                              <p className="text-xs text-slate-500">{t("recent.requestId", "Request")}: {request.id}</p>
                            </div>
                            <Badge variant="outline" className={cn("capitalize", stateBadgeClass(request.currentState))}>
                              {request.currentState}
                            </Badge>
                          </div>
                          <div className="mt-3 space-y-1 text-sm text-slate-600">
                            <p>{t("recent.caseId", "Case")}: {request.linkedCaseId ?? "n/a"}</p>
                            <p>{t("recent.source", "Source")}: {request.sourceType}</p>
                            <p>{t("recent.owner", "Owner")}: {request.defaultOwnerType ?? "unassigned"}{request.defaultOwnerId ? ` / ${request.defaultOwnerId}` : ""}</p>
                            <p>{t("recent.createdAt", "Created")}: {formatDate(request.createdAt)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </DashboardCard>

                <DashboardCard
                  title={t("helper.title", "Work OS guide")}
                  description={t("helper.body", "See a short guide with bookmarkable case links, timeline source filters, and evidence slices.")}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" onClick={() => setLocation("/help/work-os")}>
                        <ArrowRight className="mr-1 h-4 w-4" />
                        {t("helper.guide", "Open guide")}
                      </Button>
                      <p className="text-xs text-slate-500">
                        Use it when you need the URL patterns for `caseId` or `timelineSource`.
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-600">
                      <p>{t("page.forUsersBody", "Use this page when you want to start a new request, ask for help, or hand a task to the operations team.")}</p>
                      <p>{t("page.forAdminsBody", "After a request is created, the Work OS Console can route it, reassign it, attach legacy tasks, and review the full case timeline.")}</p>
                    </div>
                  </div>
                </DashboardCard>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
