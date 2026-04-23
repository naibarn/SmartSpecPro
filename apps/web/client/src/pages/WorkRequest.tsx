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
import { LocaleToggle } from "@/components/LocaleToggle";
import { parseLinkedSourceIds } from "@/lib/workRequestLinks";
import { toast } from "sonner";
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

function buildClientIdempotencyKey(prefix: string): string {
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
  if (rawMessage.includes("MISSING_TEAM") || rawMessage.includes("UNAUTHORIZED_TEAM")) {
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
  const { t } = useScopedTranslation("workos");
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
  const [ownershipMode, setOwnershipMode] = useState<OwnershipMode>("self");
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
  const detailsFileInputRef = useRef<HTMLInputElement>(null);
  const preflightReviewRef = useRef<HTMLDivElement | null>(null);

  const ownedTeamsQuery = trpc.team.list.useQuery({
    ownerOnly: true,
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
      setTitle("");
      setDetails("");
      setSourceType(launchSourceDefaults.sourceType);
      setSourceRef(launchSourceDefaults.sourceRef);
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
    setOwnershipMode("self");
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

  const createdRequest = useMemo(
    () =>
      recentRequestsQuery.data?.find(
        request => request.id === createdRequestId
      ) ?? null,
    [recentRequestsQuery.data, createdRequestId]
  );
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

    const defaultOwnerType =
      ownershipMode === "self"
        ? "human"
        : ownershipMode === "team"
          ? "queue"
          : ownershipMode === "role"
            ? "role"
            : undefined;

    const defaultOwnerId =
      ownershipMode === "self"
        ? String(user.id)
        : ownershipMode === "role"
          ? trimmedOwnerReference || undefined
          : undefined;

    if (ownershipMode === "team" && !trimmedTeamId) {
      toast.error("Please choose one of your teams.");
      return;
    }

    try {
      if (isEditingExistingRequest && requestDetail?.request) {
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
            ownershipMode === "team" ? trimmedTeamId || null : null,
        });
      } else {
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
          defaultQueueId:
            ownershipMode === "team" ? trimmedTeamId || undefined : undefined,
          linkedConversationIds:
            linkedConversationIds.length > 0 ? linkedConversationIds : undefined,
          linkedWorkpackRunIds:
            linkedWorkpackRunIds.length > 0 ? linkedWorkpackRunIds : undefined,
          linkedRoleRoutineRunIds:
            linkedRoleRoutineRunIds.length > 0
              ? linkedRoleRoutineRunIds
              : undefined,
        });
      }
    } catch (error) {
      console.error("Failed to create work request", error);
      toast.error("Failed to create work request.");
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
        idempotencyKey: buildClientIdempotencyKey("preflight-regenerate"),
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
        idempotencyKey: buildClientIdempotencyKey("preflight-approve"),
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
        idempotencyKey: buildClientIdempotencyKey("preflight-launch"),
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#f8fafc_50%,_#eef2ff_100%)]">
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-white/70 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/chat")}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Chat
              </Button>
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
                  <ClipboardList className="h-7 w-7 text-sky-600" />
                  {t("page.title", "Start Work Request")}
                </h1>
                <p className="max-w-3xl text-sm text-slate-600">
                  {t(
                    "page.subtitle",
                    "Create a tracked work request that Work OS can route, monitor, and follow through to completion."
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle className="shrink-0" />
              <Button variant="ghost" onClick={() => setLocation("/dashboard")}>
                Dashboard
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/help/work-os")}
              >
                {t("helper.guide", "Open guide")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              {requestIdFromUrl ? (
                <Button
                  variant="outline"
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
          <div className="mx-auto flex w-full max-w-none flex-col gap-6">
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
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500 xl:col-span-3">
                      Loading team readiness...
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

            {createdRequestId ? (
              <DashboardCard
                title={t("success.title", "Work request created")}
                description={t(
                  "success.body",
                  "Your request is now tracked and ready for routing or follow-up."
                )}
              >
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-medium">Request:</span>{" "}
                    {createdRequestId}
                  </p>
                  <p>
                    <span className="font-medium">Case:</span>{" "}
                    {createdCaseId ?? "n/a"}
                  </p>
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
                  <Button
                    type="button"
                    disabled={!activeCaseId}
                    onClick={scrollToPreflightReview}
                  >
                    Review automation plan
                  </Button>
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

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)] 2xl:grid-cols-[minmax(0,1.25fr)_minmax(460px,0.75fr)]">
              <DashboardCard
                title={t("page.title", "Start Work Request")}
                description={t(
                  "page.subtitle",
                  "Create a tracked work request that Work OS can route, monitor, and follow through to completion."
                )}
              >
                {requestIdFromUrl ? (
                  <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-100 text-amber-800"
                      >
                        Editing existing request
                      </Badge>
                      <p className="text-sm text-amber-900">
                        You are updating an existing request before automation
                        starts. Use New request to create a fresh one.
                      </p>
                    </div>
                    {isRequestDetailLoading ? (
                      <p className="mt-2 text-xs text-amber-800">
                        Loading existing request details...
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="work-title">
                      {t("form.title", "Title")}
                    </Label>
                    <Input
                      id="work-title"
                      value={title}
                      onChange={event => setTitle(event.target.value)}
                      placeholder={t(
                        "form.titlePlaceholder",
                        "Example: Review refund request for Order #1842"
                      )}
                      required
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
                        {t("form.details", "Details")}
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
                          onClick={() => detailsFileInputRef.current?.click()}
                        >
                          Upload spec.md
                        </Button>
                        {detailsSourceFileName ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
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
                      value={details}
                      onChange={event => setDetails(event.target.value)}
                      placeholder={t(
                        "form.detailsPlaceholder",
                        "Add context, desired outcome, blockers, or attach a spec.md so the team can act faster."
                      )}
                      rows={7}
                    />
                    <p className="text-xs text-slate-500">
                      {t(
                        "form.detailsHint",
                        "Upload a spec.md, notes, or task brief to prefill this field automatically and avoid retyping."
                      )}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        {t("form.sourceType", "How did this work come in?")}
                      </Label>
                      <Select value={sourceType} onValueChange={setSourceType}>
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
                        value={sourceRef}
                        onChange={event => setSourceRef(event.target.value)}
                        placeholder={t(
                          "form.sourceRefPlaceholder",
                          "Example: chat thread ID, webhook event ID, ticket number"
                        )}
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
                        value={businessDomain}
                        onChange={event =>
                          setBusinessDomain(event.target.value)
                        }
                        placeholder={t(
                          "form.businessDomainPlaceholder",
                          "Example: support, finance, operations"
                        )}
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
                        <Select value={riskLevel} onValueChange={setRiskLevel}>
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
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                            value={selectedTeamId}
                            onChange={event =>
                              setSelectedTeamId(event.target.value)
                            }
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

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="submit"
                      disabled={
                        createRequestMutation.isPending ||
                        updateRequestMutation.isPending ||
                        !title.trim()
                      }
                    >
                      {createRequestMutation.isPending ||
                      updateRequestMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {isEditingExistingRequest
                            ? "Saving..."
                            : t("form.creating", "Creating...")}
                        </>
                      ) : isEditingExistingRequest ? (
                        "Update Work Request"
                      ) : (
                        t("form.submit", "Create Work Request")
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
                                  ? `Team ${preflightPreview.teamResolution.teamId}`
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
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading requests...
                      </div>
                    ) : (recentRequestsQuery.data ?? []).length === 0 ? (
                      <p className="text-sm text-slate-500">
                        {t(
                          "recent.empty",
                          "You have not created any work requests yet."
                        )}
                      </p>
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
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
