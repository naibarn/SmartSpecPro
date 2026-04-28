import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { skipToken } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
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
  AlertCircle,
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
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { LocaleToggle } from "@/components/LocaleToggle";
import { parseLinkedSourceIds } from "@/lib/workRequestLinks";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ApprovalSourceSnapshot,
  CapabilityCatalogEntry,
  CapabilityPlan,
  ExecutionBudgetEnvelope,
  PreflightRevisionFingerprint,
  PreflightSourceRef,
  TeamExecutionPlan,
  TeamResolutionDecision,
  WorkOrchestratorSurface,
} from "../../../shared/workOrchestrator";

type OwnershipMode = "self" | "unassigned" | "team" | "role";
type TeamReadiness = "ready" | "busy" | "backlog" | "idle" | "unavailable";
type PreflightPreviewMode = "requester_safe" | "admin_diagnostic";

type PreflightReviewRecord = {
  access?: {
    allowed?: boolean;
    redacted?: boolean;
    view?: PreflightPreviewMode;
  };
  caseId: string;
  requestId: string | null;
  preflightBundleId: string;
  state: string;
  previewView: PreflightPreviewMode;
  brief: {
    title: string;
    objective: string | null;
    summary: string;
    sourceRefs: PreflightSourceRef[];
    generatedAt: string;
  };
  capabilityCatalog: CapabilityCatalogEntry[];
  capabilityPlan?: CapabilityPlan | null;
  executionPlan?: TeamExecutionPlan | null;
  teamResolution?: TeamResolutionDecision | null;
  preflightRevision: PreflightRevisionFingerprint;
  budget?: ExecutionBudgetEnvelope | null;
  approvalSnapshotStatus: {
    requiredCount: number;
    capturedCount: number;
  };
  launchReadiness: {
    ready: boolean;
    primaryReasonCode: string | null;
    blockedReasonCodes: string[];
  };
  approvalSnapshots: ApprovalSourceSnapshot[];
  diagnostics: Record<string, unknown>;
};

const workRequestPageShellClass = "min-h-screen bg-white text-slate-950";
const workRequestTopBarClass =
  "sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl";
const workRequestPanelClass =
  "rounded-2xl border border-slate-200 bg-white shadow-sm";
const workRequestFieldClass =
  "transition focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

function InlineErrorState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950" role="alert">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-sm leading-6 text-rose-800">{message}</p>
          </div>
        </div>
        {actionLabel && onAction ? (
          <Button
            type="button"
            variant="outline"
            className="border-rose-200 bg-white text-rose-700 hover:bg-rose-100"
            onClick={onAction}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RecentRequestsLoadingState() {
  return (
    <div className="space-y-3" aria-label="Loading recent requests" aria-live="polite">
      {[0, 1, 2].map(index => (
        <div key={index} className={cn(workRequestPanelClass, "p-4")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

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

function preflightStateBadgeClass(state: string): string {
  switch (state) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "launched":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "launching":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "stale":
    case "launch_blocked":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "cancelled":
    case "superseded":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "previewed":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function preflightStateLabel(state: string): string {
  switch (state) {
    case "previewed":
      return "Preview ready";
    case "approved":
      return "Approved";
    case "stale":
      return "Needs refresh";
    case "launch_blocked":
      return "Launch blocked";
    case "launching":
      return "Launching";
    case "launched":
      return "Launched";
    case "cancelled":
      return "Cancelled";
    case "superseded":
      return "Superseded";
    default:
      return state;
  }
}

function surfaceLabel(surface: WorkOrchestratorSurface): string {
  switch (surface) {
    case "work_os":
      return "Work OS";
    case "document_management":
      return "Document management";
    case "media_studio":
      return "Media Studio";
    case "video_editor":
      return "Video Editor";
    case "skill_studio":
      return "Skill Studio";
    default:
      return surface.replace(/_/g, " ");
  }
}

function buildClientIdempotencyKey(
  prefix: string,
  stableParts: Array<string | number | null | undefined> = []
): string {
  const stableSegment = stableParts
    .map(part => String(part ?? "").trim())
    .filter(Boolean)
    .map(part => part.replace(/[^a-zA-Z0-9._:-]/g, "_"))
    .join(":")
    .slice(0, 150);
  if (stableSegment) {
    return `${prefix}:${stableSegment}`;
  }
  const randomId =
    typeof window !== "undefined" &&
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomId}`;
}

function readReasonCodes(value: Record<string, unknown> | null | undefined): string[] {
  const raw = value?.visibleReasonCodes;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );
}

function mapPreflightErrorMessage(error: unknown, fallback: string): string {
  const rawMessage =
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  if (rawMessage.includes("PREVIEW_STALE")) {
    return "This automation preview is stale. Refresh it and review again.";
  }
  if (rawMessage.includes("APPROVAL_SOURCE_DRIFT")) {
    return "A linked source changed after preview generation. Refresh the preview before approving.";
  }
  if (rawMessage.includes("AUTOMATION_ROOM_NOT_FOUND")) {
    return "Work OS found an existing automation record, but the team room is missing. Start again or ask an admin to recover the automation run.";
  }
  if (
    rawMessage.includes("MISSING_TEAM") ||
    rawMessage.includes("UNAUTHORIZED_TEAM") ||
    rawMessage.includes("AUTOMATION_TEAM_NOT_AVAILABLE")
  ) {
    return "Work OS could not resolve an eligible team for this launch.";
  }
  if (
    rawMessage.includes("SURFACE_CONTRACT_NOT_MIGRATED") ||
    rawMessage.includes("SURFACE_AUTHORITY_MISSING")
  ) {
    return "One of the planned execution surfaces is not currently launchable.";
  }
  return fallback;
}

function mapWorkRequestSubmitErrorMessage(
  error: unknown,
  fallback: string
): string {
  const rawMessage =
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message.trim()
      : "";

  return rawMessage || fallback;
}

function deriveRequestTitle(details: string): string {
  const firstMeaningfulLine =
    details
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean) ?? "";
  const withoutMarkdownHeading = firstMeaningfulLine.replace(/^#+\s*/, "");
  const compact = withoutMarkdownHeading || "Personal automation request";

  return compact.length > 90 ? `${compact.slice(0, 87).trim()}...` : compact;
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

function buildWorkRequestPath(requestId?: string | null): string {
  if (!requestId) return "/work/request";
  return `/work/request?requestId=${encodeURIComponent(requestId)}`;
}

function normalizeLinkedSourceIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(entry => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
    )
  );
}

function buildTeamRoomPath(
  teamId: string,
  roomId?: string | null,
  panel?: "chat" | "workflow" | "run"
): string {
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
  setSourceRef: Dispatch<SetStateAction<string>>
): Promise<void> {
  if (!file) {
    return;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExtensions = new Set([
    "md",
    "markdown",
    "txt",
    "json",
    "yaml",
    "yml",
    "csv",
  ]);
  const isTextLike =
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    allowedExtensions.has(extension);

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
    setSourceRef(current => (current.trim() ? current : file.name));
    toast.success(`Loaded ${file.name} into the details field`);
  } catch {
    toast.error("Could not read the uploaded file.");
  }
}

export default function WorkRequestPage() {
  const { user } = useAuth();
  const { t, locale } = useScopedTranslation("workos");
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const browserSearch =
    typeof window !== "undefined" ? window.location.search : "";
  const queryParams = useMemo(() => {
    const multiValueKeys = new Set([
      "linkedConversationIds",
      "linkedWorkpackRunIds",
      "linkedRoleRoutineRunIds",
    ]);
    const mergedSearch = new URLSearchParams();
    const locationSearch = location.includes("?")
      ? (location.split("?")[1] ?? "")
      : "";
    for (const part of [locationSearch, browserSearch.slice(1)]) {
      if (!part) continue;
      const params = new URLSearchParams(part);
      params.forEach((value, key) => {
        if (multiValueKeys.has(key)) {
          mergedSearch.append(key, value);
          return;
        }
        mergedSearch.set(key, value);
      });
    }
    return mergedSearch;
  }, [browserSearch, location]);
  const requestIdFromUrl = queryParams.get("requestId");
  const launchSourceDefaults = useMemo(
    () => {
      const linkedConversationIds = parseLinkedSourceIds(
        queryParams,
        "linkedConversationIds"
      );
      const linkedWorkpackRunIds = parseLinkedSourceIds(
        queryParams,
        "linkedWorkpackRunIds"
      );
      const linkedRoleRoutineRunIds = parseLinkedSourceIds(
        queryParams,
        "linkedRoleRoutineRunIds"
      );
      const sourceType = queryParams.get("sourceType")?.trim();
      const sourceRef = queryParams.get("sourceRef")?.trim();

      return {
        sourceType:
          sourceType ||
          (linkedConversationIds.length > 0 ? "chat" : "manual"),
        sourceRef: sourceRef || linkedConversationIds[0] || "",
        linkedConversationIds,
        linkedWorkpackRunIds,
        linkedRoleRoutineRunIds,
      };
    },
    [queryParams]
  );

  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [sourceType, setSourceType] = useState(
    launchSourceDefaults.sourceType
  );
  const [sourceRef, setSourceRef] = useState(launchSourceDefaults.sourceRef);
  const [businessDomain, setBusinessDomain] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [ownershipMode, setOwnershipMode] = useState<OwnershipMode>("team");
  const [ownerReference, setOwnerReference] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [detailsSourceFileName, setDetailsSourceFileName] = useState<
    string | null
  >(null);
  const [detailsDragActive, setDetailsDragActive] = useState(false);
  const [preflightPreviewState, setPreflightPreviewState] =
    useState<PreflightReviewRecord | null>(null);
  const [autoStartCaseId, setAutoStartCaseId] = useState<string | null>(null);
  const [autoStartError, setAutoStartError] = useState<string | null>(null);
  const [launchTarget, setLaunchTarget] = useState<{
    teamId: string;
    roomId: string;
    teamRunId?: string | null;
    workItemId?: string | null;
  } | null>(null);
  const detailsFileInputRef = useRef<HTMLInputElement>(null);
  const preflightReviewRef = useRef<HTMLDivElement | null>(null);
  const autoStartRequestedRef = useRef(false);
  const autoStartOperationRef = useRef<string | null>(null);

  const ownedTeamsQuery = trpc.team.list.useQuery({
    status: "active",
    assignableOnly: true,
  });
  const allTeamsQuery = trpc.team.list.useQuery({ status: "active" });
  const recentRequestsQuery = trpc.workOs.listMyRequests.useQuery({ limit: 8 });
  const requestDetailQuery = trpc.workOs.getRequest.useQuery(
    requestIdFromUrl ? { requestId: requestIdFromUrl } : skipToken,
    { enabled: !!requestIdFromUrl }
  );
  const requestDetail = requestDetailQuery.data ?? null;
  const isRequestDetailLoading =
    !!requestIdFromUrl && requestDetailQuery.isLoading;
  const activeCaseId = createdCaseId ?? requestDetail?.case?.id ?? null;
  const createRequestMutation = trpc.workOs.createRequest.useMutation({
    onSuccess: async result => {
      setCreatedRequestId(result.request.id);
      setCreatedCaseId(result.case.id);
      setPreflightPreviewState(null);
      if (autoStartRequestedRef.current) {
        setAutoStartCaseId(result.case.id);
        await utils.workOs.listMyRequests.invalidate();
        return;
      }
      setTitle("");
      setDetails("");
      setSourceType(launchSourceDefaults.sourceType);
      setSourceRef(launchSourceDefaults.sourceRef);
      setBusinessDomain("");
      setUrgency("normal");
      setRiskLevel("medium");
      setOwnershipMode("team");
      setOwnerReference("");
      setSelectedTeamId("");
      toast.success(t("success.title", "Work request created"));
      await utils.workOs.listMyRequests.invalidate();
    },
  });
  const createAndLaunchRequestMutation =
    trpc.workOs.createAndLaunchRequest.useMutation({
      onSuccess: async (result: any) => {
        setCreatedRequestId(result.request.id);
        setCreatedCaseId(result.case.id);
        setPreflightPreviewState(null);
        autoStartRequestedRef.current = false;
        setAutoStartCaseId(null);
        const automation = result.automation ?? null;
        if (automation?.state === "launched") {
          const kickoffTeamId = automation?.teamId ?? null;
          const kickoffRoomId = automation?.roomId ?? null;
          if (kickoffTeamId && kickoffRoomId) {
            setLaunchTarget({
              teamId: kickoffTeamId,
              roomId: kickoffRoomId,
              teamRunId: automation?.teamRunId ?? null,
              workItemId: automation?.workItemId ?? null,
            });
            await (utils as any).teamRoom?.listByTeam?.invalidate?.({
              teamId: kickoffTeamId,
            });
            setLocation(
              buildTeamRoomPath(kickoffTeamId, kickoffRoomId, "workflow"),
              { replace: true },
            );
          } else {
            setLocation(buildWorkOsConsolePath(result.case.id), {
              replace: true,
            });
          }
          toast.success("Automation launched");
        } else {
          setAutoStartError(
            automation?.errorCode
              ? mapPreflightErrorMessage(
                  { message: automation.errorCode },
                  "Work request was created, but automation could not launch."
                )
              : "Work request was created, but automation could not launch."
          );
          toast.error("Work request was created, but automation could not launch.");
        }
        await utils.workOs.listMyRequests.invalidate();
      },
    });
  const updateRequestMutation = trpc.workOs.updateRequest.useMutation({
    onSuccess: async result => {
      setCreatedRequestId(result.request.id);
      setCreatedCaseId(result.case?.id ?? null);
      setPreflightPreviewState(null);
      toast.success(t("success.title", "Work request updated"));
      await utils.workOs.listMyRequests.invalidate();
    },
  });
  const preflightPreviewQuery = trpc.workOs.resolvePreflightPreview.useQuery(
    activeCaseId ? { caseId: activeCaseId } : skipToken,
    {
      enabled: Boolean(activeCaseId),
      retry: false,
    }
  );
  const regeneratePreflightPreviewMutation =
    trpc.workOs.regeneratePreflightPreview.useMutation({
      onSuccess: async (result) => {
        const { supersededBundleIds: _ignored, ...nextPreview } = result;
        setPreflightPreviewState(nextPreview as PreflightReviewRecord);
        toast.success("Automation preview refreshed");
      },
    });
  const approvePreflightBundleMutation =
    trpc.workOs.approvePreflightBundle.useMutation({
      onSuccess: async result => {
        setPreflightPreviewState(current =>
          current
            ? {
                ...current,
                state: result.state,
                preflightRevision: result.preflightRevision,
                approvalSnapshots: result.approvalSnapshots ?? [],
                approvalSnapshotStatus: {
                  ...current.approvalSnapshotStatus,
                  capturedCount:
                    current.approvalSnapshotStatus.requiredCount,
                },
                launchReadiness: result.launchReadiness,
              }
            : current
        );
        toast.success("Automation preview approved");
      },
    });
  const launchApprovedAutomationMutation =
    trpc.workOs.launchApprovedAutomation.useMutation({
      onSuccess: async (result: any) => {
        setPreflightPreviewState(current =>
          current
            ? {
                ...current,
                state: result.state,
              }
            : current
        );
        const kickoffTeamId = result?.teamId ?? null;
        const kickoffRoomId = result?.roomId ?? null;
        if (kickoffTeamId && kickoffRoomId) {
          setLaunchTarget({
            teamId: kickoffTeamId,
            roomId: kickoffRoomId,
            teamRunId: result?.teamRunId ?? null,
            workItemId: result?.workItemId ?? null,
          });
          await (utils as any).teamRoom?.listByTeam?.invalidate?.({
            teamId: kickoffTeamId,
          });
          setLocation(
            buildTeamRoomPath(kickoffTeamId, kickoffRoomId, "workflow"),
            {
              replace: true,
            }
          );
        } else if (activeCaseId) {
          setLocation(buildWorkOsConsolePath(activeCaseId), {
            replace: true,
          });
        }
        toast.success("Approved automation launched");
        await utils.workOs.listMyRequests.invalidate();
      },
    });

  const ownedTeams = ownedTeamsQuery.data ?? [];
  const activeOwnedTeams = useMemo(
    () => ownedTeams.filter(team => !team.status || team.status === "active"),
    [ownedTeams]
  );
  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of [...ownedTeams, ...(allTeamsQuery.data ?? [])]) {
      map.set(team.id, team.name);
    }
    return map;
  }, [allTeamsQuery.data, ownedTeams]);

  const sourceOptions = useMemo(
    () => [
      { value: "chat", label: "Chat" },
      { value: "webhook", label: "Webhook" },
      { value: "form", label: "Form" },
      { value: "api", label: "API" },
      { value: "document", label: "Document" },
      { value: "schedule", label: "Schedule" },
      { value: "manual", label: "Manual" },
      { value: "other", label: "Other" },
    ],
    []
  );

  const urgencyOptions = useMemo(
    () => [
      { value: "low", label: "Low" },
      { value: "normal", label: "Normal" },
      { value: "high", label: "High" },
      { value: "urgent", label: "Urgent" },
    ],
    []
  );

  const riskOptions = useMemo(
    () => [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "critical", label: "Critical" },
    ],
    []
  );
  const isPrivileged = user?.role === "admin" || user?.role === "domain_admin";
  const isEditingExistingRequest = Boolean(
    requestIdFromUrl && requestDetail?.request
  );
  const isExistingRequestLocked =
    isEditingExistingRequest && requestDetail?.editable === false;

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
    if (activeOwnedTeams.length === 1) {
      setSelectedTeamId(activeOwnedTeams[0].id);
    }
  }, [activeOwnedTeams, ownershipMode, selectedTeamId]);

  useEffect(() => {
    if (!requestDetail?.request) return;
    setTitle(requestDetail.request.title ?? "");
    setDetails(requestDetail.request.objective ?? "");
    setSourceType(
      requestDetail.request.sourceType ?? launchSourceDefaults.sourceType
    );
    setSourceRef(
      requestDetail.request.sourceRef ?? launchSourceDefaults.sourceRef
    );
    setBusinessDomain(requestDetail.request.businessDomain ?? "");
    setUrgency(requestDetail.request.urgency ?? "normal");
    setRiskLevel(requestDetail.request.riskLevel ?? "medium");
    setOwnershipMode(
      requestDetail.request.defaultOwnerType === "queue"
        ? "team"
        : requestDetail.request.defaultOwnerType === "role"
          ? "role"
          : requestDetail.request.defaultOwnerType === "hybrid"
            ? "role"
            : requestDetail.request.defaultOwnerType === "human"
              ? "self"
              : "unassigned"
    );
    setOwnerReference(requestDetail.request.defaultOwnerId ?? "");
    setSelectedTeamId(requestDetail.request.defaultQueueId ?? "");
    setCreatedRequestId(requestDetail.request.id);
    setCreatedCaseId(requestDetail.case?.id ?? null);
  }, [launchSourceDefaults.sourceRef, launchSourceDefaults.sourceType, requestDetail]);

  useEffect(() => {
    if (requestIdFromUrl) return;
    setCreatedRequestId(null);
    setCreatedCaseId(null);
    setTitle("");
    setDetails("");
    setSourceType(launchSourceDefaults.sourceType);
    setSourceRef(launchSourceDefaults.sourceRef);
    setBusinessDomain("");
    setUrgency("normal");
    setRiskLevel("medium");
    setOwnershipMode("team");
    setOwnerReference("");
    setSelectedTeamId("");
    setDetailsSourceFileName(null);
    setPreflightPreviewState(null);
  }, [launchSourceDefaults.sourceRef, launchSourceDefaults.sourceType, requestIdFromUrl]);

  useEffect(() => {
    setPreflightPreviewState(null);
  }, [activeCaseId]);

  useEffect(() => {
    if (preflightPreviewQuery.data) {
      setPreflightPreviewState(
        preflightPreviewQuery.data as PreflightReviewRecord
      );
    }
  }, [preflightPreviewQuery.data]);

  const requestRecord =
    (requestDetail?.request as Record<string, unknown> | null) ?? null;
  const linkedConversationIds = useMemo(
    () =>
      normalizeLinkedSourceIds(
        requestRecord?.linkedConversationIdsJson ??
          requestRecord?.linkedConversationIds ??
          launchSourceDefaults.linkedConversationIds
      ),
    [launchSourceDefaults.linkedConversationIds, requestRecord]
  );
  const linkedWorkpackRunIds = useMemo(
    () =>
      normalizeLinkedSourceIds(
        requestRecord?.linkedWorkpackRunIdsJson ??
          requestRecord?.linkedWorkpackRunIds ??
          launchSourceDefaults.linkedWorkpackRunIds
      ),
    [launchSourceDefaults.linkedWorkpackRunIds, requestRecord]
  );
  const linkedRoleRoutineRunIds = useMemo(
    () =>
      normalizeLinkedSourceIds(
        requestRecord?.linkedRoleRoutineRunIdsJson ??
          requestRecord?.linkedRoleRoutineRunIds ??
          launchSourceDefaults.linkedRoleRoutineRunIds
      ),
    [launchSourceDefaults.linkedRoleRoutineRunIds, requestRecord]
  );
  const hasLinkedSources =
    linkedConversationIds.length > 0 ||
    linkedWorkpackRunIds.length > 0 ||
    linkedRoleRoutineRunIds.length > 0;
  const preflightPreview =
    preflightPreviewState ??
    ((preflightPreviewQuery.data as PreflightReviewRecord | undefined) ?? null);
  const isAutoStarting =
    createRequestMutation.isPending ||
    createAndLaunchRequestMutation.isPending ||
    approvePreflightBundleMutation.isPending ||
    launchApprovedAutomationMutation.isPending ||
    Boolean(autoStartCaseId);
  const showAutomationDiagnostics = Boolean(
    activeCaseId && (autoStartError || (requestIdFromUrl && isPrivileged))
  );
  const showTeamReadinessPanel = Boolean(requestIdFromUrl && isPrivileged);
  const preflightVisibleReasonCodes = useMemo(
    () =>
      Array.from(
        new Set([
          ...(preflightPreview?.launchReadiness.blockedReasonCodes ?? []),
          ...readReasonCodes(preflightPreview?.diagnostics),
        ])
      ),
    [preflightPreview]
  );

  useEffect(() => {
    if (autoStartCaseId && preflightPreviewQuery.error) {
      setAutoStartError(
        mapPreflightErrorMessage(
          preflightPreviewQuery.error,
          "Work OS could not prepare the automation start. Open diagnostics or try again."
        )
      );
      setAutoStartCaseId(null);
      autoStartRequestedRef.current = false;
      return;
    }

    if (!autoStartCaseId || !activeCaseId || activeCaseId !== autoStartCaseId) {
      return;
    }
    if (!preflightPreview || preflightPreviewQuery.isLoading) {
      return;
    }
    if (
      approvePreflightBundleMutation.isPending ||
      launchApprovedAutomationMutation.isPending
    ) {
      return;
    }

    const operationKey = `${preflightPreview.preflightBundleId}:${preflightPreview.state}`;
    if (autoStartOperationRef.current === operationKey) {
      return;
    }
    autoStartOperationRef.current = operationKey;

    let cancelled = false;
    const runAutoStart = async () => {
      try {
        if (preflightPreview.state === "previewed") {
          const approved = await approvePreflightBundleMutation.mutateAsync({
            caseId: activeCaseId,
            preflightBundleId: preflightPreview.preflightBundleId,
            approvedRevisionHash: preflightPreview.preflightRevision.fingerprint,
            selectedSourceIds:
              preflightPreview.preflightRevision.inputs.selectedSourceIds,
            approvalDecision: "approve",
            idempotencyKey: buildClientIdempotencyKey(
              "preflight-auto-approve",
              [
                activeCaseId,
                preflightPreview.preflightBundleId,
                preflightPreview.preflightRevision.fingerprint,
              ],
            ),
          });
          if (cancelled) return;

          if (!approved.launchReadiness.ready) {
            setAutoStartError(
              "Automation is not ready to start yet. Open the diagnostics below to see what is blocking launch."
            );
            setAutoStartCaseId(null);
            return;
          }

          await launchApprovedAutomationMutation.mutateAsync({
            caseId: activeCaseId,
            preflightBundleId: approved.preflightBundleId,
            approvedRevisionHash: approved.preflightRevision.fingerprint,
            idempotencyKey: buildClientIdempotencyKey(
              "preflight-auto-launch",
              [
                activeCaseId,
                approved.preflightBundleId,
                approved.preflightRevision.fingerprint,
              ],
            ),
          });
          if (!cancelled) {
            setAutoStartCaseId(null);
          }
          return;
        }

        if (
          preflightPreview.state === "approved" &&
          preflightPreview.launchReadiness.ready
        ) {
          await launchApprovedAutomationMutation.mutateAsync({
            caseId: activeCaseId,
            preflightBundleId: preflightPreview.preflightBundleId,
            approvedRevisionHash: preflightPreview.preflightRevision.fingerprint,
            idempotencyKey: buildClientIdempotencyKey(
              "preflight-auto-launch",
              [
                activeCaseId,
                preflightPreview.preflightBundleId,
                preflightPreview.preflightRevision.fingerprint,
              ],
            ),
          });
          if (!cancelled) {
            setAutoStartCaseId(null);
          }
          return;
        }

        if (
          preflightPreview.state === "launch_blocked" ||
          preflightPreview.state === "stale" ||
          !preflightPreview.launchReadiness.ready
        ) {
          setAutoStartError(
            "Automation is not ready to start yet. Open the diagnostics below to see what is blocking launch."
          );
          setAutoStartCaseId(null);
        }
      } catch (error) {
        if (cancelled) return;
        setAutoStartError(
          mapPreflightErrorMessage(
            error,
            "Could not start automation. Open the diagnostics below to retry or inspect the blocker."
          )
        );
        setAutoStartCaseId(null);
      } finally {
        if (!cancelled) {
          autoStartRequestedRef.current = false;
        }
      }
    };

    void runAutoStart();

    return () => {
      cancelled = true;
    };
  }, [
    activeCaseId,
    autoStartCaseId,
    preflightPreview,
    preflightPreviewQuery.error,
    preflightPreviewQuery.isLoading,
    approvePreflightBundleMutation,
    launchApprovedAutomationMutation,
  ]);

  const createdRequest = useMemo(
    () =>
      recentRequestsQuery.data?.find(
        request => request.id === createdRequestId
      ) ?? null,
    [recentRequestsQuery.data, createdRequestId]
  );
  const requesterSafeAutomationStatus = useMemo(() => {
    if (!activeCaseId || showAutomationDiagnostics) return null;
    const caseRecord =
      (requestDetail?.case as Record<string, unknown> | null | undefined) ?? null;
    const safeRequestRecord =
      (createdRequest as Record<string, unknown> | null | undefined) ??
      ((requestDetail?.request as Record<string, unknown> | null | undefined) ?? null);
    const state =
      typeof safeRequestRecord?.currentState === "string"
        ? safeRequestRecord.currentState
        : typeof caseRecord?.currentState === "string"
          ? caseRecord.currentState
          : null;
    const automationDisposition =
      typeof caseRecord?.automationDisposition === "string"
        ? caseRecord.automationDisposition
        : null;
    const automationSummary =
      typeof caseRecord?.automationSummary === "string" &&
      caseRecord.automationSummary.trim().length > 0
        ? caseRecord.automationSummary.trim()
        : null;
    const normalizedAutomationState = [
      state,
      automationDisposition,
      automationSummary,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const hasAutomation =
      typeof caseRecord?.automationRunId === "string" &&
      caseRecord.automationRunId.length > 0;
    if (
      /failed|blocked|missing|unresolved|cannot continue/.test(
        normalizedAutomationState,
      )
    ) {
      return (
        automationSummary ||
        "Automation needs attention before it can continue. Open the Work OS console for the safe checkpoint details."
      );
    }
    if (/completed|done|finished/.test(normalizedAutomationState)) {
      return automationSummary || "Automation is completed.";
    }
    if (/waiting|paused|approval|checkpoint/.test(normalizedAutomationState)) {
      return (
        automationSummary ||
        "Automation is waiting on a safe checkpoint before it can continue."
      );
    }
    if (hasAutomation) {
      return (
        automationSummary ||
        "Automation has been sent to the team. You can follow progress from this page or open the Work OS console."
      );
    }
    return "Work OS is tracking this request and will show progress here when automation starts.";
  }, [
    activeCaseId,
    createdRequest,
    requestDetail?.case,
    requestDetail?.request,
    showAutomationDiagnostics,
  ]);
  const ownedTeamIds = useMemo(
    () => new Set(ownedTeams.map(team => team.id)),
    [ownedTeams]
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
      .map(team => {
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
        const readinessDelta =
          priority[left.readiness] - priority[right.readiness];
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
      { total: 0, ready: 0, busy: 0, backlog: 0, idle: 0, unavailable: 0 }
    );
  }, [teamReadinessCards]);

  const handleDetailsFileUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await processWorkRequestDetailsFile(
      file,
      setDetails,
      setDetailsSourceFileName,
      setSourceType,
      setSourceRef
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
      setSourceRef
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

    const trimmedDetails = details.trim();
    const trimmedTitle = title.trim() || deriveRequestTitle(trimmedDetails);
    if (!trimmedTitle || !trimmedDetails) {
      toast.error("Tell Work OS what you want done before starting.");
      return;
    }

    const trimmedSourceRef = sourceRef.trim();
    const trimmedBusinessDomain = businessDomain.trim();
    const trimmedOwnerReference = ownerReference.trim();
    const selectedAutomationTeamId =
      ownershipMode === "team"
        ? selectedTeamId.trim() || (activeOwnedTeams[0]?.id ?? "")
        : "";
    const trimmedTeamId = selectedAutomationTeamId.trim();
    const effectiveOwnershipMode = ownershipMode;

    const defaultOwnerType =
      effectiveOwnershipMode === "self"
        ? "human"
        : effectiveOwnershipMode === "team"
          ? "queue"
          : effectiveOwnershipMode === "role"
            ? "role"
            : undefined;

    const defaultOwnerId =
      effectiveOwnershipMode === "self"
        ? String(user.id)
        : effectiveOwnershipMode === "role"
          ? trimmedOwnerReference || undefined
          : undefined;

    if (effectiveOwnershipMode === "team" && !trimmedTeamId) {
      toast.error("Please choose an active automation team.");
      return;
    }

    try {
      if (isEditingExistingRequest && requestDetail?.request) {
        if (isExistingRequestLocked) {
          toast.error(
            "This work request already has an active automation run and can no longer be edited here."
          );
          return;
        }

        await updateRequestMutation.mutateAsync({
          requestId: requestDetail.request.id,
          title: trimmedTitle,
          objective: trimmedDetails || null,
          sourceType,
          sourceRef: trimmedSourceRef || null,
          businessDomain: trimmedBusinessDomain || null,
          urgency,
          riskLevel,
          defaultOwnerType,
          defaultOwnerId,
          defaultQueueId:
            effectiveOwnershipMode === "team" ? trimmedTeamId || null : null,
        });
      } else {
        autoStartRequestedRef.current = false;
        autoStartOperationRef.current = null;
        setAutoStartError(null);
        await createAndLaunchRequestMutation.mutateAsync({
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
          defaultQueueId:
            effectiveOwnershipMode === "team" ? trimmedTeamId || undefined : undefined,
          linkedConversationIds:
            linkedConversationIds.length > 0 ? linkedConversationIds : undefined,
          linkedWorkpackRunIds:
            linkedWorkpackRunIds.length > 0 ? linkedWorkpackRunIds : undefined,
          linkedRoleRoutineRunIds:
            linkedRoleRoutineRunIds.length > 0
              ? linkedRoleRoutineRunIds
              : undefined,
          mode: "fully_auto",
          roomLanguage: locale === "th" ? "th" : "en",
          idempotencyKey: buildClientIdempotencyKey("create-launch", [
            String(user.id),
            sourceType,
            trimmedSourceRef,
            trimmedTitle,
            trimmedDetails,
            effectiveOwnershipMode === "team" ? trimmedTeamId : "",
          ]),
        });
      }
    } catch (error) {
      const fallback = isEditingExistingRequest
        ? "Failed to update work request."
        : "Failed to create work request.";
      console.error(fallback, error);
      toast.error(mapWorkRequestSubmitErrorMessage(error, fallback));
    }
  };

  const scrollToPreflightReview = () => {
    preflightReviewRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleRegeneratePreflight = async () => {
    if (!activeCaseId || !preflightPreview) {
      toast.error("Create or load a work request before refreshing automation review.");
      return;
    }

    try {
      await regeneratePreflightPreviewMutation.mutateAsync({
        caseId: activeCaseId,
        previousPreflightBundleId: preflightPreview.preflightBundleId,
        idempotencyKey: buildClientIdempotencyKey("preflight-regenerate", [
          activeCaseId,
          preflightPreview.preflightBundleId,
          preflightPreview.preflightRevision.fingerprint,
        ]),
      });
    } catch (error) {
      toast.error(
        mapPreflightErrorMessage(
          error,
          "Could not refresh the automation preview."
        )
      );
    }
  };

  const handleApprovePreflight = async () => {
    if (!activeCaseId || !preflightPreview) {
      toast.error("Generate an automation preview before approving it.");
      return;
    }

    try {
      await approvePreflightBundleMutation.mutateAsync({
        caseId: activeCaseId,
        preflightBundleId: preflightPreview.preflightBundleId,
        approvedRevisionHash: preflightPreview.preflightRevision.fingerprint,
        selectedSourceIds:
          preflightPreview.preflightRevision.inputs.selectedSourceIds,
        approvalDecision: "approve",
        idempotencyKey: buildClientIdempotencyKey("preflight-approve", [
          activeCaseId,
          preflightPreview.preflightBundleId,
          preflightPreview.preflightRevision.fingerprint,
        ]),
      });
    } catch (error) {
      toast.error(
        mapPreflightErrorMessage(error, "Could not approve the automation preview.")
      );
    }
  };

  const handleLaunchApprovedAutomation = async () => {
    if (!activeCaseId || !preflightPreview) {
      toast.error("Approve the automation preview before launch.");
      return;
    }

    try {
      await launchApprovedAutomationMutation.mutateAsync({
        caseId: activeCaseId,
        preflightBundleId: preflightPreview.preflightBundleId,
        approvedRevisionHash: preflightPreview.preflightRevision.fingerprint,
        idempotencyKey: buildClientIdempotencyKey("preflight-launch", [
          activeCaseId,
          preflightPreview.preflightBundleId,
          preflightPreview.preflightRevision.fingerprint,
        ]),
      });
    } catch (error) {
      toast.error(
        mapPreflightErrorMessage(
          error,
          "Could not launch the approved automation."
        )
      );
    }
  };

  return (
    <div className={workRequestPageShellClass}>
      <div className="flex min-h-screen w-full flex-col">
        <header className={workRequestTopBarClass}>
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-col gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => setLocation("/chat")}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Chat
              </Button>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Work OS intake
                </p>
                <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                    <ClipboardList className="h-5 w-5 text-sky-700" />
                  </span>
                  <span className="truncate">
                    {t("page.title", "Start Work Request")}
                  </span>
                </h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  {t(
                    "page.subtitle",
                    "Create a tracked work request that Work OS can route, monitor, and follow through to completion."
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <LocaleToggle className="shrink-0" />
              <Button
                variant="ghost"
                className="justify-center"
                onClick={() => setLocation("/dashboard")}
              >
                Dashboard
              </Button>
              <Button
                variant="outline"
                className="justify-center"
                onClick={() => setLocation("/help/work-os")}
              >
                {t("helper.guide", "Open guide")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              {requestIdFromUrl ? (
                <Button
                  variant="outline"
                  className="justify-center"
                  onClick={() => setLocation(buildWorkRequestPath())}
                >
                  New request
                </Button>
              ) : null}
              {isPrivileged ? (
                <>
                  <Button asChild disabled={!activeCaseId}>
                    <Link href={buildWorkOsConsolePath(activeCaseId)}>
                      <ShieldCheck className="mr-1 h-4 w-4" />
                      {t("success.openConsole", "Open in Work OS Console")}
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-center"
                    disabled={!activeCaseId}
                    onClick={() =>
                      copyWorkOsLink(
                        buildWorkOsConsolePath(activeCaseId),
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

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6">
            {showTeamReadinessPanel ? (
            <DashboardCard
              className="overflow-hidden border-sky-200/60 bg-white/90 shadow-[0_20px_70px_rgba(14,165,233,0.08)]"
              bodyClassName="p-5 md:p-6"
              title={t("page.teamStatusTitle", "Team readiness")}
              description={t(
                "page.teamStatusDescription",
                "See which teams are free, busy, or carrying backlog before you start a request."
              )}
            >
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
                    {t("page.teamStatusReady", "Ready to take work")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-900">
                    {teamReadinessSummary.ready}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                    {t("page.teamStatusBusy", "Busy")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-sky-900">
                    {teamReadinessSummary.busy}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
                    {t("page.teamStatusBacklog", "Has backlog")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-amber-900">
                    {teamReadinessSummary.backlog}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                    {t("page.teamStatusTotal", "All teams")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {teamReadinessSummary.total}
                  </p>
                </div>
              </div>

              <div className="mt-5 max-h-[42vh] overflow-auto pr-1">
                <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {allTeamsQuery.isLoading ? (
                    <div
                      className="grid gap-3 xl:col-span-3 lg:grid-cols-2 2xl:grid-cols-3"
                      aria-label="Loading team readiness"
                      aria-live="polite"
                    >
                      {[0, 1, 2].map(index => (
                        <div key={index} className={cn(workRequestPanelClass, "p-4")}>
                          <Skeleton className="h-5 w-2/3" />
                          <Skeleton className="mt-3 h-4 w-1/2" />
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <Skeleton className="h-12 rounded-xl" />
                            <Skeleton className="h-12 rounded-xl" />
                            <Skeleton className="h-12 rounded-xl" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : allTeamsQuery.error ? (
                    <div className="xl:col-span-3">
                      <InlineErrorState
                        title="Could not load team readiness"
                        message={
                          allTeamsQuery.error.message ||
                          "Refresh team readiness before routing work to a team."
                        }
                        actionLabel="Retry"
                        onAction={() => void allTeamsQuery.refetch()}
                      />
                    </div>
                  ) : teamReadinessCards.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500 xl:col-span-3">
                      {t(
                        "page.teamStatusEmpty",
                        "No active teams are available yet."
                      )}
                    </div>
                  ) : (
                    teamReadinessCards.map(team => {
                      const StatusIcon = readinessIcon(team.readiness);
                      const RoomTypeIcon = roomTypeIcon(team.latestRoomType);
                      return (
                        <div
                          key={team.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open team ${team.name}`}
                          onClick={() => setLocation(`/teams/${team.id}`)}
                          onKeyDown={event => {
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
                                    : "border-slate-200"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-slate-950">
                                  {team.name}
                                </p>
                                {team.isOwned ? (
                                  <Badge
                                    variant="outline"
                                    className="border-slate-200 bg-slate-50 text-slate-700"
                                  >
                                    {t("page.teamStatusOwned", "Your team")}
                                  </Badge>
                                ) : null}
                                {roomTypeLabel(team.latestRoomType) ? (
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          variant="outline"
                                          title={
                                            roomTypeTooltipText(
                                              team.latestRoomType
                                            ) ?? undefined
                                          }
                                          className={cn(
                                            "gap-1 capitalize",
                                            roomTypeBadgeClass(
                                              team.latestRoomType
                                            )
                                          )}
                                        >
                                          {RoomTypeIcon ? (
                                            <RoomTypeIcon
                                              className="h-3.5 w-3.5"
                                              aria-hidden="true"
                                            />
                                          ) : null}
                                          {roomTypeLabel(team.latestRoomType)}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                        {roomTypeTooltipText(
                                          team.latestRoomType
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {team.memberCount}{" "}
                                {team.memberCount === 1 ? "member" : "members"}
                                <span className="text-slate-300"> · </span>
                                {team.roomCount}{" "}
                                {team.roomCount === 1 ? "room" : "rooms"}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "gap-1 rounded-full",
                                readinessBadgeClass(team.readiness)
                              )}
                            >
                              <StatusIcon className="h-3.5 w-3.5" />
                              {readinessLabel(team.readiness)}
                            </Badge>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600">
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                Runs
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {team.activeRunCount}
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                Open
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {team.openWorkItemCount}
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                Waiting
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {team.waitingWorkItemCount}
                              </p>
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
                              onClick={event => {
                                event.stopPropagation();
                                if (!team.latestRoomId) return;
                                setLocation(
                                  buildTeamRoomPath(team.id, team.latestRoomId)
                                );
                              }}
                            >
                              Open room
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!team.latestRoomId}
                              onClick={event => {
                                event.stopPropagation();
                                if (!team.latestRoomId) return;
                                setLocation(
                                  buildTeamRoomPath(
                                    team.id,
                                    team.latestRoomId,
                                    "workflow"
                                  )
                                );
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
            ) : null}

            {createdRequestId ? (
              <DashboardCard
                title={
                  isAutoStarting
                    ? "Starting automation"
                    : t("success.title", "Work request created")
                }
                description={
                  isAutoStarting
                    ? "Work OS is sending this request to the automation team."
                    : autoStartError
                      ? autoStartError
                      : t(
                          "success.body",
                          "Your request is now tracked and ready for routing or follow-up."
                        )
                }
              >
                <div className="space-y-2 text-sm">
                  {isAutoStarting ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50/80 p-3 text-sky-900">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating the request, approving the plan, and launching it now.
                    </div>
                  ) : null}
                  {autoStartError ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-amber-900">
                      {autoStartError}
                    </div>
                  ) : null}
                  {requesterSafeAutomationStatus ? (
                    <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-3 text-sky-900">
                      {requesterSafeAutomationStatus}
                    </div>
                  ) : null}
                  <p>
                    <span className="font-medium">Request:</span>{" "}
                    {createdRequestId}
                  </p>
                  <p>
                    <span className="font-medium">Case:</span>{" "}
                    {createdCaseId ?? "n/a"}
                  </p>
                  {launchTarget ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-emerald-900">
                      <p className="font-medium">
                        Automation room created in{" "}
                        {teamNameById.get(launchTarget.teamId) ??
                          launchTarget.teamId}
                      </p>
                      <p className="mt-1 text-xs">
                        Room: {launchTarget.roomId}
                        {launchTarget.teamRunId
                          ? ` · Run: ${launchTarget.teamRunId}`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                  {createdRequest ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        stateBadgeClass(createdRequest.currentState)
                      )}
                    >
                      {createdRequest.currentState}
                    </Badge>
                  ) : null}
                  {preflightPreview ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        preflightStateBadgeClass(preflightPreview.state)
                      )}
                    >
                      {preflightStateLabel(preflightPreview.state)}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {showAutomationDiagnostics ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!activeCaseId}
                      onClick={scrollToPreflightReview}
                    >
                      Open diagnostics
                    </Button>
                  ) : null}
                  {launchTarget ? (
                    <Button asChild>
                      <Link
                        href={buildTeamRoomPath(
                          launchTarget.teamId,
                          launchTarget.roomId,
                          "workflow"
                        )}
                      >
                        Open launched room
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/chat")}
                  >
                    {t("success.openChat", "Back to Chat")}
                  </Button>
                  {isPrivileged ? (
                    <>
                      <Button asChild>
                        <Link href={buildWorkOsConsolePath(activeCaseId)}>
                          {t("success.openConsole", "Open in Work OS Console")}
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          copyWorkOsLink(
                            buildWorkOsConsolePath(activeCaseId),
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
              </DashboardCard>
            ) : null}

            <div
              className={cn(
                "grid gap-6",
                showAutomationDiagnostics
                  ? "xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)] 2xl:grid-cols-[minmax(0,1.25fr)_minmax(460px,0.75fr)]"
                  : "mx-auto w-full max-w-3xl"
              )}
            >
              <DashboardCard
                title="Tell Work OS what you want"
                description="Write the request, review it here, then press Start. Work OS will send it to the automation team."
              >
                {requestIdFromUrl ? (
                  <div
                    className={cn(
                      "mb-5 rounded-2xl border p-4",
                      isExistingRequestLocked
                        ? "border-rose-200 bg-rose-50/80"
                        : "border-amber-200 bg-amber-50/80"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          isExistingRequestLocked
                            ? "border-rose-200 bg-rose-100 text-rose-800"
                            : "border-amber-200 bg-amber-100 text-amber-800"
                        )}
                      >
                        {isExistingRequestLocked
                          ? "Request locked"
                          : "Editing existing request"}
                      </Badge>
                      <p
                        className={cn(
                          "text-sm",
                          isExistingRequestLocked
                            ? "text-rose-900"
                            : "text-amber-900"
                        )}
                      >
                        {isExistingRequestLocked
                          ? "Automation has already started for this request, so the intake details can no longer be edited here. Use New request to create a fresh one."
                          : "You are updating an existing request before automation starts. Use New request to create a fresh one."}
                      </p>
                    </div>
                    {isRequestDetailLoading ? (
                      <p
                        className={cn(
                          "mt-2 text-xs",
                          isExistingRequestLocked
                            ? "text-rose-800"
                            : "text-amber-800"
                        )}
                      >
                        Loading existing request details...
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="work-title">
                      {t("form.title", "Title")}{" "}
                      <span className="font-normal text-slate-500">
                        (optional)
                      </span>
                    </Label>
                    <Input
                      id="work-title"
                      aria-label={t("form.title", "Title")}
                      className={workRequestFieldClass}
                      value={title}
                      onChange={event => setTitle(event.target.value)}
                      placeholder={t(
                        "form.titlePlaceholder",
                        "Example: Review refund request for Order #1842"
                      )}
                      disabled={isAutoStarting || isExistingRequestLocked}
                    />
                  </div>

                  <div
                    data-testid="details-dropzone"
                    className={cn(
                      "space-y-3 rounded-2xl border p-4 transition",
                      detailsDragActive
                        ? "border-sky-400 bg-sky-50/70 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]"
                        : "border-slate-200 bg-slate-50/60"
                    )}
                    onDragEnter={handleDetailsDragEnter}
                    onDragOver={handleDetailsDragOver}
                    onDragLeave={handleDetailsDragLeave}
                    onDrop={handleDetailsDrop}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Label htmlFor="work-details">
                        What do you want done?
                      </Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {detailsSourceFileName ? (
                          <Badge
                            variant="outline"
                            className="border-sky-200 bg-sky-50 text-sky-700"
                          >
                            {detailsSourceFileName}
                          </Badge>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isAutoStarting || isExistingRequestLocked}
                          onClick={() => detailsFileInputRef.current?.click()}
                        >
                          Upload spec.md
                        </Button>
                        {detailsSourceFileName ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isAutoStarting || isExistingRequestLocked}
                            onClick={clearDetailsFile}
                          >
                            Clear file
                          </Button>
                        ) : null}
                        <input
                          ref={detailsFileInputRef}
                          type="file"
                          accept=".md,.markdown,.txt,.json,.yaml,.yml,.csv,text/plain,text/markdown,application/json"
                          className="hidden"
                          aria-label={t(
                            "form.detailsUploadLabel",
                            "Upload spec file"
                          )}
                          onChange={handleDetailsFileUpload}
                          disabled={isAutoStarting || isExistingRequestLocked}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {detailsDragActive
                        ? "Drop your spec.md or brief here to fill the details field."
                        : "Drag and drop a spec.md, notes, or task brief here to prefill the details field."}
                    </p>
                    <Textarea
                      id="work-details"
                      aria-label={t("form.details", "Details")}
                      className={cn(workRequestFieldClass, "min-h-[180px]")}
                      value={details}
                      onChange={event => setDetails(event.target.value)}
                      placeholder={t(
                        "form.detailsPlaceholder",
                        "Example: Create a 24-30 second Songkran video for 2026 using VEO 3.1. Include the tone, target audience, output format, and anything you do not want."
                      )}
                      rows={7}
                      required
                      disabled={isAutoStarting || isExistingRequestLocked}
                    />
                    <p className="text-xs text-slate-500">
                      Read this once before you start. If it says what you want,
                      Work OS can begin.
                    </p>
                  </div>

                  {!showAutomationDiagnostics ? (
                    <div className="space-y-2">
                      <Label htmlFor="automation-team-select">
                        Automation team
                      </Label>
                      <select
                        id="automation-team-select"
                        className={cn(
                          "h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500",
                          workRequestFieldClass
                        )}
                        value={selectedTeamId}
                        onChange={event => setSelectedTeamId(event.target.value)}
                        disabled={
                          ownedTeamsQuery.isLoading ||
                          isAutoStarting ||
                          isExistingRequestLocked
                        }
                      >
                        <option value="">
                          {ownedTeamsQuery.isLoading
                            ? "Loading teams..."
                            : activeOwnedTeams.length > 0
                              ? `Auto select (${activeOwnedTeams[0].name})`
                              : "No automation teams available"}
                        </option>
                        {activeOwnedTeams.map(team => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500">
                        Leave this on Auto for Work OS to choose the first
                        available team, or choose the team that should receive
                        this work.
                      </p>
                    </div>
                  ) : null}

                  {!showAutomationDiagnostics && hasLinkedSources ? (
                    <div
                      className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3"
                      data-testid="linked-sources-panel"
                    >
                      <div className="flex flex-wrap gap-2">
                        {linkedConversationIds.map(sourceId => (
                          <Badge
                            key={`conversation-${sourceId}`}
                            variant="outline"
                            className="border-sky-200 bg-white text-sky-700"
                          >
                            Conversation {sourceId}
                          </Badge>
                        ))}
                        {linkedWorkpackRunIds.map(sourceId => (
                          <Badge
                            key={`workpack-${sourceId}`}
                            variant="outline"
                            className="border-sky-200 bg-white text-sky-700"
                          >
                            Workpack {sourceId}
                          </Badge>
                        ))}
                        {linkedRoleRoutineRunIds.map(sourceId => (
                          <Badge
                            key={`role-routine-${sourceId}`}
                            variant="outline"
                            className="border-sky-200 bg-white text-sky-700"
                          >
                            Routine {sourceId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {showAutomationDiagnostics ? (
                    <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        {t("form.sourceType", "How did this work come in?")}
                      </Label>
                      <Select
                        value={sourceType}
                        onValueChange={setSourceType}
                        disabled={isAutoStarting || isExistingRequestLocked}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="work-source-ref">
                        {t("form.sourceRef", "Source reference")}
                      </Label>
                      <Input
                        id="work-source-ref"
                        className={workRequestFieldClass}
                        value={sourceRef}
                        onChange={event => setSourceRef(event.target.value)}
                        placeholder={t(
                          "form.sourceRefPlaceholder",
                          "Example: chat thread ID, webhook event ID, ticket number"
                        )}
                        disabled={isAutoStarting || isExistingRequestLocked}
                      />
                    </div>

                    {hasLinkedSources ? (
                      <div
                        className="space-y-3 rounded-3xl border border-sky-100 bg-sky-50/70 p-4 md:col-span-2"
                        data-testid="linked-sources-panel"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {t("linkedSources.title", "Linked sources")}
                          </p>
                          <p className="text-xs text-slate-600">
                            {t(
                              "linkedSources.description",
                              "These upstream references stay attached so review and automation can trace where the request came from."
                            )}
                          </p>
                        </div>

                        {linkedConversationIds.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                              {t(
                                "linkedSources.conversations",
                                "Conversations"
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {linkedConversationIds.map(sourceId => (
                                <Badge
                                  key={`conversation-${sourceId}`}
                                  variant="outline"
                                  className="border-sky-200 bg-white text-sky-700"
                                >
                                  Conversation {sourceId}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {linkedWorkpackRunIds.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                              {t("linkedSources.workpacks", "Workpack runs")}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {linkedWorkpackRunIds.map(sourceId => (
                                <Badge
                                  key={`workpack-${sourceId}`}
                                  variant="outline"
                                  className="border-sky-200 bg-white text-sky-700"
                                >
                                  Workpack {sourceId}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {linkedRoleRoutineRunIds.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                              {t(
                                "linkedSources.roleRoutines",
                                "Role routine runs"
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {linkedRoleRoutineRunIds.map(sourceId => (
                                <Badge
                                  key={`role-routine-${sourceId}`}
                                  variant="outline"
                                  className="border-sky-200 bg-white text-sky-700"
                                >
                                  Routine {sourceId}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="work-domain">
                        {t("form.businessDomain", "Business domain")}
                      </Label>
                      <Input
                        id="work-domain"
                        className={workRequestFieldClass}
                        value={businessDomain}
                        onChange={event =>
                          setBusinessDomain(event.target.value)
                        }
                        placeholder={t(
                          "form.businessDomainPlaceholder",
                          "Example: support, finance, operations"
                        )}
                        disabled={isAutoStarting || isExistingRequestLocked}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t("form.urgency", "Urgency")}</Label>
                        <Select
                          value={urgency}
                          onValueChange={setUrgency}
                          disabled={isAutoStarting || isExistingRequestLocked}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {urgencyOptions.map(option => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("form.riskLevel", "Risk level")}</Label>
                        <Select
                          value={riskLevel}
                          onValueChange={setRiskLevel}
                          disabled={isAutoStarting || isExistingRequestLocked}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {riskOptions.map(option => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
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
                      <h3 className="text-sm font-semibold text-slate-900">
                        {t("form.ownership", "Initial ownership")}
                      </h3>
                      <p className="text-sm text-slate-600">
                        Assign it to yourself, or leave it unassigned and route
                        it later in Work OS Console.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Button
                        type="button"
                        variant={
                          ownershipMode === "self" ? "default" : "outline"
                        }
                        className="justify-start"
                        onClick={() => setOwnershipMode("self")}
                        disabled={isAutoStarting || isExistingRequestLocked}
                      >
                        {t("form.ownershipSelf", "Assign to me")}
                      </Button>
                      <Button
                        type="button"
                        variant={
                          ownershipMode === "team" ? "default" : "outline"
                        }
                        className="justify-start"
                        onClick={() => setOwnershipMode("team")}
                        disabled={isAutoStarting || isExistingRequestLocked}
                      >
                        {t("form.ownershipTeam", "Assign to my team")}
                      </Button>
                      <Button
                        type="button"
                        variant={
                          ownershipMode === "unassigned" ? "default" : "outline"
                        }
                        className="justify-start"
                        onClick={() => setOwnershipMode("unassigned")}
                        disabled={isAutoStarting || isExistingRequestLocked}
                      >
                        {t("form.ownershipUnassigned", "Leave unassigned")}
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                      <Select
                        value={ownershipMode}
                        onValueChange={value =>
                          setOwnershipMode(value as OwnershipMode)
                        }
                        disabled={isAutoStarting || isExistingRequestLocked}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Ownership mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="self">Assign to me</SelectItem>
                          <SelectItem value="team">
                            Assign to my team
                          </SelectItem>
                          <SelectItem value="role">Assign to role</SelectItem>
                          <SelectItem value="unassigned">
                            Leave unassigned
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {ownershipMode === "team" ? (
                        <div className="space-y-2">
                          <Label htmlFor="team-owner-select">Team</Label>
                          <select
                            id="team-owner-select"
                            className={cn(
                              "h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500",
                              workRequestFieldClass
                            )}
                            value={selectedTeamId}
                            onChange={event =>
                              setSelectedTeamId(event.target.value)
                            }
                            disabled={isAutoStarting || isExistingRequestLocked}
                          >
                            <option value="" disabled>
                              {ownedTeamsQuery.isLoading
                                ? "Loading your teams..."
                                : "Choose one of your teams"}
                            </option>
                            {(ownedTeamsQuery.data ?? []).map(team => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                                {team.status && team.status !== "active"
                                  ? ` (${team.status})`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                      <Input
                          className={workRequestFieldClass}
                          value={ownerReference}
                          onChange={event =>
                            setOwnerReference(event.target.value)
                          }
                          placeholder={t(
                            "form.ownerIdPlaceholder",
                            "Example: support-queue, finance-review, or team queue ID"
                          )}
                          disabled={
                            ownershipMode === "self" ||
                            ownershipMode === "unassigned"
                          }
                        />
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Choose “Assign to my team” to route the request to one of
                      your own teams. Work OS will keep the tenant work item,
                      then the team orchestra can fan out to personas inside
                      that team.
                    </p>
                    {ownershipMode === "team" ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                        {ownedTeamsQuery.isLoading ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading your teams...
                          </div>
                        ) : (ownedTeamsQuery.data ?? []).length === 0 ? (
                          <p>
                            You do not have any teams yet. Create a team first,
                            then use it as the work owner.
                          </p>
                        ) : (
                          <p>
                            Select the team that should receive the work. The
                            selected team remains within your tenant and can
                            distribute the task to its personas. Draft teams are
                            available too while they are being prepared.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                    </>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="submit"
                      disabled={
                        isAutoStarting ||
                        isExistingRequestLocked ||
                        !details.trim()
                      }
                    >
                      {isAutoStarting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {isEditingExistingRequest
                            ? "Saving..."
                            : "Starting..."}
                        </>
                      ) : isEditingExistingRequest ? (
                        isExistingRequestLocked ? (
                          "Request locked"
                        ) : (
                          "Update Work Request"
                        )
                      ) : (
                        "Start automation"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLocation("/chat")}
                    >
                      {t("success.openChat", "Back to Chat")}
                    </Button>
                  </div>
                </form>
              </DashboardCard>

              {showAutomationDiagnostics ? (
              <div className="space-y-6">
                {activeCaseId ? (
                  <div ref={preflightReviewRef} data-testid="preflight-review-card">
                    <DashboardCard
                      title="Automation review"
                      description="Review the compiled brief, planned surfaces, and launch blockers before automation starts."
                    >
                      {preflightPreviewQuery.isLoading && !preflightPreview ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Preparing automation review...
                        </div>
                      ) : preflightPreviewQuery.error && !preflightPreview ? (
                        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                          <p className="text-sm text-amber-900">
                            {mapPreflightErrorMessage(
                              preflightPreviewQuery.error,
                              "Work OS could not prepare the automation review."
                            )}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void preflightPreviewQuery.refetch()}
                          >
                            Retry review
                          </Button>
                        </div>
                      ) : preflightPreview ? (
                        <div className="space-y-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full",
                                preflightStateBadgeClass(preflightPreview.state)
                              )}
                            >
                              {preflightStateLabel(preflightPreview.state)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-slate-200 bg-slate-50 text-slate-700"
                            >
                              {preflightPreview.previewView === "admin_diagnostic"
                                ? "Admin diagnostics"
                                : "Requester-safe view"}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-slate-200 bg-slate-50 text-slate-700"
                            >
                              {preflightPreview.approvalSnapshotStatus.capturedCount}/
                              {preflightPreview.approvalSnapshotStatus.requiredCount} snapshots
                            </Badge>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                              Compiled brief
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {preflightPreview.brief.title}
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600">
                              {preflightPreview.brief.summary ||
                                preflightPreview.brief.objective ||
                                "Work OS will use the linked sources and request details to build the first execution plan."}
                            </p>
                            <p className="mt-3 text-xs text-slate-500">
                              Generated {formatDate(preflightPreview.brief.generatedAt)}
                            </p>
                          </div>

                          {preflightPreview.brief.sourceRefs.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                                Included sources
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {preflightPreview.brief.sourceRefs.map(source => (
                                  <Badge
                                    key={`${source.sourceType}:${source.sourceId}`}
                                    variant="outline"
                                    className="border-sky-200 bg-sky-50 text-sky-700"
                                  >
                                    {source.label} · {source.trust} · {source.freshness}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {preflightPreview.capabilityPlan?.steps.length ? (
                            <div className="space-y-3">
                              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                                Planned steps
                              </p>
                              <div className="space-y-3">
                                {preflightPreview.capabilityPlan.steps.map(step => (
                                  <div
                                    key={step.stepId}
                                    className="rounded-2xl border border-slate-200 bg-white p-4"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-sm font-semibold text-slate-900">
                                        {step.title}
                                      </p>
                                      <Badge
                                        variant="outline"
                                        className="border-slate-200 bg-slate-50 text-slate-700"
                                      >
                                        {surfaceLabel(step.selectedSurface)}
                                      </Badge>
                                    </div>
                                    {step.blockedReasonCodes.length > 0 ? (
                                      <p className="mt-2 text-xs text-amber-700">
                                        Blocked by: {step.blockedReasonCodes.join(", ")}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                                Team resolution
                              </p>
                              <p className="mt-2 text-sm font-semibold text-slate-900">
                                {preflightPreview.teamResolution?.teamId
                                  ? (teamNameById.get(
                                      preflightPreview.teamResolution.teamId
                                    ) ??
                                    `Team ${preflightPreview.teamResolution.teamId}`)
                                  : "No team resolved"}
                              </p>
                              <p className="mt-2 text-sm text-slate-600">
                                {preflightPreview.teamResolution?.reason ??
                                  "Work OS will resolve a team before launch."}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                                Budget envelope
                              </p>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                                <div className="rounded-xl bg-slate-50 px-3 py-2">
                                  <p className="uppercase tracking-[0.16em] text-slate-500">
                                    Rounds
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900">
                                    {preflightPreview.budget?.maxRounds ?? "n/a"}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-3 py-2">
                                  <p className="uppercase tracking-[0.16em] text-slate-500">
                                    Tokens
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900">
                                    {preflightPreview.budget?.maxTokens ?? "n/a"}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-3 py-2">
                                  <p className="uppercase tracking-[0.16em] text-slate-500">
                                    Credits
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900">
                                    {preflightPreview.budget?.maxBudgetCredits ?? "n/a"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {!preflightPreview.launchReadiness.ready ||
                          preflightVisibleReasonCodes.length > 0 ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                              <p className="text-sm font-semibold text-amber-900">
                                Launch blockers
                              </p>
                              <p className="mt-2 text-sm text-amber-900">
                                {preflightPreview.launchReadiness.ready
                                  ? "Review the remaining reason codes before launch."
                                  : "Launch is still blocked until this preview is approved and all gating checks pass."}
                              </p>
                              {preflightVisibleReasonCodes.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {preflightVisibleReasonCodes.map(reasonCode => (
                                    <Badge
                                      key={reasonCode}
                                      variant="outline"
                                      className="border-amber-200 bg-white text-amber-700"
                                    >
                                      {reasonCode}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleRegeneratePreflight}
                              disabled={regeneratePreflightPreviewMutation.isPending}
                            >
                              {regeneratePreflightPreviewMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Refreshing...
                                </>
                              ) : preflightPreview.state === "stale" ||
                                preflightPreview.state === "launch_blocked" ? (
                                "Refresh preview"
                              ) : (
                                "Regenerate preview"
                              )}
                            </Button>

                            {preflightPreview.state === "previewed" ? (
                              <Button
                                type="button"
                                onClick={handleApprovePreflight}
                                disabled={approvePreflightBundleMutation.isPending}
                              >
                                {approvePreflightBundleMutation.isPending ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Approving...
                                  </>
                                ) : (
                                  "Approve preview"
                                )}
                              </Button>
                            ) : null}

                            <Button
                              type="button"
                              onClick={handleLaunchApprovedAutomation}
                              disabled={
                                preflightPreview.state !== "approved" ||
                                !preflightPreview.launchReadiness.ready ||
                                launchApprovedAutomationMutation.isPending
                              }
                            >
                              {launchApprovedAutomationMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Launching...
                                </>
                              ) : preflightPreview.state === "launched" ? (
                                "Automation launched"
                              ) : (
                                "Launch approved automation"
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">
                          Create or load a work request to see the automation review.
                        </p>
                      )}
                    </DashboardCard>
                  </div>
                ) : null}

                <DashboardCard
                  title={t("recent.title", "My recent requests")}
                  description={t(
                    "recent.subtitle",
                    "These are the requests you created most recently."
                  )}
                >
                  <div className="space-y-3">
                    {recentRequestsQuery.isLoading ? (
                      <RecentRequestsLoadingState />
                    ) : recentRequestsQuery.error ? (
                      <InlineErrorState
                        title="Could not load recent requests"
                        message={
                          recentRequestsQuery.error.message ||
                          "Refresh the list or keep drafting this request."
                        }
                        actionLabel="Retry"
                        onAction={() => void recentRequestsQuery.refetch()}
                      />
                    ) : (recentRequestsQuery.data ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center">
                        <ClipboardList className="mx-auto h-6 w-6 text-slate-500" />
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {t(
                            "recent.empty",
                            "You have not created any work requests yet."
                          )}
                        </p>
                      </div>
                    ) : (
                      (recentRequestsQuery.data ?? []).map(request => (
                        <div
                          key={request.id}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {request.title}
                              </p>
                              <p className="text-xs text-slate-500">
                                {t("recent.requestId", "Request")}: {request.id}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize",
                                stateBadgeClass(request.currentState)
                              )}
                            >
                              {request.currentState}
                            </Badge>
                          </div>
                          <div className="mt-3 space-y-1 text-sm text-slate-600">
                            <p>
                              {t("recent.caseId", "Case")}:{" "}
                              {request.linkedCaseId ?? "n/a"}
                            </p>
                            <p>
                              {t("recent.source", "Source")}:{" "}
                              {request.sourceType}
                            </p>
                            <p>
                              {t("recent.owner", "Owner")}:{" "}
                              {request.defaultOwnerType ?? "unassigned"}
                              {request.defaultOwnerId
                                ? ` / ${request.defaultOwnerId}`
                                : ""}
                            </p>
                            <p>
                              {t("recent.createdAt", "Created")}:{" "}
                              {formatDate(request.createdAt)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </DashboardCard>

                <DashboardCard
                  title={t("helper.title", "Work OS guide")}
                  description={t(
                    "helper.body",
                    "See a short guide with bookmarkable case links, timeline source filters, and evidence slices."
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setLocation("/help/work-os")}
                      >
                        <ArrowRight className="mr-1 h-4 w-4" />
                        {t("helper.guide", "Open guide")}
                      </Button>
                      <p className="text-xs text-slate-500">
                        Use it when you need the URL patterns for `caseId` or
                        `timelineSource`.
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-600">
                      <p>
                        {t(
                          "page.forUsersBody",
                          "Use this page when you want to start a new request, ask for help, or hand a task to the operations team."
                        )}
                      </p>
                      <p>
                        {t(
                          "page.forAdminsBody",
                          "After a request is created, the Work OS Console can route it, reassign it, attach legacy tasks, and review the full case timeline."
                        )}
                      </p>
                    </div>
                  </div>
                </DashboardCard>
              </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
