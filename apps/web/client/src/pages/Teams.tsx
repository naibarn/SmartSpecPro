/**
 * Teams — list + detail view for virtual AI assistant teams.
 *
 * Left: team list with search/filter.
 * Right: selected team's room with TeamRoomView.
 */

import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, useRoute } from "wouter";
import { TeamRoomView } from "@/components/orchestrator/TeamRoomView";
import { RunMonitorPanel } from "@/components/orchestrator/RunMonitorPanel";
import { RoomWorkflowPanel } from "@/components/orchestrator/RoomWorkflowPanel";
import { ContextEngineHealthPanel } from "@/components/orchestrator/ContextEngineHealthPanel";
import {
  TEAM_BLUEPRINTS,
  instantiateBlueprintAssistantDrafts,
  type TeamBlueprintPersonaSeed,
} from "@/components/orchestrator/teamBlueprints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { useTenantFeatureFlags } from "@/hooks/useTenantFeatureFlag";
import { PersonaEditorFields } from "@/components/settings/PersonaEditorFields";
import {
  buildPersonaMutationFields,
  createEmptyPersonaForm,
  type PersonaFormData,
} from "@/components/settings/personaForm";
import {
  UsersRound,
  Plus,
  Search,
  Loader2,
  Archive,
  MessageSquare,
  Clock3,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Menu,
  Star,
  Trash2,
  UserPlus,
  Play,
  Crown,
  Bot,
  UserRound,
  Pencil,
  StopCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildWorkpackEntrypointHref } from "@/lib/workpackNavigation";

interface CreateRoomState {
  teamId: string;
  goalPrompt: string;
  roomType: "team" | "auto_team" | "direct" | "job_review";
  language: "en" | "th";
}

type TeamMemberRole =
  | "orchestrator"
  | "researcher"
  | "reviewer"
  | "publisher"
  | "specialist";

type DraftMemberKind = "assistant" | "human" | "external_connector";

interface NewMemberEntry {
  memberKey: string;
  memberKind: DraftMemberKind;
  memberRole: TeamMemberRole;
  personaId?: string;
  blueprintId?: string;
  blueprintMemberId?: string;
  personaBlueprint?: TeamBlueprintPersonaSeed;
  reusedPersonaName?: string;
  humanUserId?: number;
  externalRef?: string;
  externalWorkerId?: string | null;
  externalConfigJson?: Record<string, unknown>;
  displayName: string;
  roleTitle?: string;
  instructions?: string;
  specialtyTags?: string[];
  isLead: boolean;
}

interface ExternalMemberDraft {
  displayName: string;
  externalRef: string;
  externalWorkerId: string;
  roleTitle: string;
  instructions: string;
}

interface MemberEditForm {
  profileId: string;
  memberKind: "assistant" | "human" | "external_connector";
  memberRole: TeamMemberRole;
  displayName: string;
  roleTitle: string;
  instructions: string;
  externalRef: string;
  externalWorkerId: string;
  humanUserId: number | null;
  currentLead: boolean;
  promoteToLead: boolean;
}

interface BindableWorkerOption {
  id: string;
  displayName: string;
  status: string;
  runtimeType: string;
  runtimeVersion: string;
  externalReference: string;
  teamId: string | null;
  lastSeenAt: string | Date | null;
  warningFlagsJson: string[];
  boundProfileCount: number;
  channelCompanionPlatforms: string[];
  remoteEndpointPolicy:
    | "loopback_only"
    | "audited_exception_granted"
    | "unknown"
    | null;
  profileName: string | null;
  profileLabel: string | null;
  profilePurpose: string | null;
  personaDisplayLabel: string;
  personaDisplayPurpose: string;
  channelStatus: "connected" | "inactive" | "revoked" | "unknown";
  channelDisplayLabel: string;
  memorySyncEnabled: boolean;
  memorySyncScope:
    | "personal"
    | "team_shared"
    | "workspace_shared"
    | "cross_channel"
    | null;
  memorySyncStatus:
    | "disabled"
    | "active"
    | "inactive"
    | "quarantined"
    | "unknown";
  memorySyncDisplayLabel: string;
  llmRoutingMode: "auto" | "pinned_provider";
  preferredProviderId: number | null;
  preferredProviderName: string | null;
  providerRoutingDisplayLabel: string;
  availableForBinding: boolean;
  bindingReason?: string | null;
}

interface WorkerBudgetWindowSummary {
  label: "hourly" | "five_hour" | "daily" | "weekly" | "monthly";
  capCredits: number | null;
  usedCredits: number;
  remainingCredits: number | null;
  blocked: boolean;
}

interface WorkerBudgetSummary {
  workerId: string;
  displayName: string;
  runtimeType: string;
  ownerUserId: number | null;
  budgets: {
    hourlyCredits?: number | null;
    fiveHourCredits?: number | null;
    dailyCredits?: number | null;
    weeklyCredits?: number | null;
    monthlyCredits?: number | null;
  };
  windows: WorkerBudgetWindowSummary[];
  blockedByBudget: boolean;
}

interface WorkerBudgetDraft {
  hourlyCredits: string;
  fiveHourCredits: string;
  dailyCredits: string;
  weeklyCredits: string;
  monthlyCredits: string;
}

const DRAFT_MEMBER_KIND_OPTIONS: DraftMemberKind[] = [
  "assistant",
  "human",
  "external_connector",
];

const TEAM_CATEGORY_OPTIONS = [
  "creative",
  "research",
  "engineering",
  "presentation",
  "operations",
  "support",
] as const;

const createEmptyExternalMemberDraft = (): ExternalMemberDraft => ({
  displayName: "",
  externalRef: "",
  externalWorkerId: "",
  roleTitle: "",
  instructions: "",
});

const ASSISTANT_MEMBER_ROLES: TeamMemberRole[] = [
  "orchestrator",
  "researcher",
  "reviewer",
  "publisher",
  "specialist",
];

const COLLABORATOR_MEMBER_ROLES: TeamMemberRole[] = [
  "researcher",
  "reviewer",
  "publisher",
  "specialist",
];

const CREATABLE_ROOM_TYPES = [
  "team",
  "auto_team",
] as const satisfies ReadonlyArray<CreateRoomState["roomType"]>;

const AUTO_TEAM_PLAN_SIDEBAR_DEFAULT_WIDTH = 440;
const AUTO_TEAM_PLAN_SIDEBAR_MIN_WIDTH = 360;
const AUTO_TEAM_PLAN_SIDEBAR_MAX_WIDTH = 760;
const AUTO_TEAM_PLAN_SIDEBAR_COLLAPSED_WIDTH = 48;

function normalizeCreatableRoomType(
  roomType: CreateRoomState["roomType"]
): (typeof CREATABLE_ROOM_TYPES)[number] {
  return roomType === "auto_team" ? "auto_team" : "team";
}

function mapRoomTypeToExecutionMode(
  roomType: CreateRoomState["roomType"]
): "team_chat" | "auto_team" {
  switch (roomType) {
    case "auto_team":
      return "auto_team";
    case "job_review":
    case "direct":
    case "team":
    default:
      return "team_chat";
  }
}

function getDefaultPanelForRoomType(
  roomType: CreateRoomState["roomType"] | string | null | undefined
): "chat" | "workflow" | "run" {
  return roomType === "auto_team" ? "workflow" : "chat";
}

function isLegacyRoomType(
  roomType: CreateRoomState["roomType"] | string | null | undefined
): boolean {
  return roomType === "direct" || roomType === "job_review";
}

function toRoomTimestamp(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatRoomCreatedAt(value: string | Date | null | undefined): string {
  if (!value) return "Unknown";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function getRoomLanguageLabel(language?: string | null): string {
  return language === "th" ? "ไทย" : "English";
}

function getRoomAutonomyLabel(
  value: string | null | undefined
): "Semi auto" | "Fully auto" {
  return value === "fully_auto" ? "Fully auto" : "Semi auto";
}

interface RoomSidebarSectionProps {
  title: string;
  subtitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  summary?: ReactNode;
}

function RoomSidebarSection({
  title,
  subtitle,
  open,
  onOpenChange,
  children,
  className,
  summary,
}: RoomSidebarSectionProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div
        className={cn(
          "rounded-2xl border bg-white shadow-sm",
          !open && "border-dashed bg-slate-50/60",
          className
        )}
      >
        <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              {summary}
            </div>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t px-4 pb-4 pt-3">
          {children}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function normalizeExternalMemberRef(externalRef: string | undefined): string {
  return externalRef?.trim().toLowerCase() ?? "";
}

function createWorkerBudgetDraft(
  summary?: WorkerBudgetSummary | null
): WorkerBudgetDraft {
  return {
    hourlyCredits:
      summary?.budgets.hourlyCredits != null
        ? String(summary.budgets.hourlyCredits)
        : "",
    fiveHourCredits:
      summary?.budgets.fiveHourCredits != null
        ? String(summary.budgets.fiveHourCredits)
        : "",
    dailyCredits:
      summary?.budgets.dailyCredits != null
        ? String(summary.budgets.dailyCredits)
        : "",
    weeklyCredits:
      summary?.budgets.weeklyCredits != null
        ? String(summary.budgets.weeklyCredits)
        : "",
    monthlyCredits:
      summary?.budgets.monthlyCredits != null
        ? String(summary.budgets.monthlyCredits)
        : "",
  };
}

function parseWorkerBudgetDraft(draft: WorkerBudgetDraft): {
  hourlyCredits: number | null;
  fiveHourCredits: number | null;
  dailyCredits: number | null;
  weeklyCredits: number | null;
  monthlyCredits: number | null;
} {
  const parseValue = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Budget values must be positive numbers or blank");
    }
    return Math.floor(parsed);
  };

  return {
    hourlyCredits: parseValue(draft.hourlyCredits),
    fiveHourCredits: parseValue(draft.fiveHourCredits),
    dailyCredits: parseValue(draft.dailyCredits),
    weeklyCredits: parseValue(draft.weeklyCredits),
    monthlyCredits: parseValue(draft.monthlyCredits),
  };
}

function workerBudgetWindowLabel(
  label: WorkerBudgetWindowSummary["label"]
): string {
  switch (label) {
    case "hourly":
      return "Hourly";
    case "five_hour":
      return "5-hour";
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
  }
}

function getDraftMemberKey(
  member: Pick<
    NewMemberEntry,
    | "memberKind"
    | "personaId"
    | "humanUserId"
    | "externalRef"
    | "externalWorkerId"
  >
): string {
  if (member.memberKind === "assistant")
    return `assistant:${member.personaId ?? ""}`;
  if (member.memberKind === "human") return `human:${member.humanUserId ?? ""}`;
  if (member.externalWorkerId?.trim())
    return `external-worker:${member.externalWorkerId.trim()}`;
  return `external:${normalizeExternalMemberRef(member.externalRef)}`;
}

function getConnectorInstructions(externalConfigJson: unknown): string {
  if (!externalConfigJson || typeof externalConfigJson !== "object") return "";
  const value = (externalConfigJson as Record<string, unknown>).instructions;
  return typeof value === "string" ? value : "";
}

function getRoleOptionsForKind(
  memberKind: "assistant" | "human" | "external_connector"
): TeamMemberRole[] {
  return memberKind === "assistant"
    ? ASSISTANT_MEMBER_ROLES
    : COLLABORATOR_MEMBER_ROLES;
}

function getDefaultRoleForKind(
  memberKind: "assistant" | "human" | "external_connector"
): TeamMemberRole {
  return memberKind === "assistant" ? "specialist" : "reviewer";
}

function formatChannelCompanionPlatform(platform: string): string {
  return platform
    .split(/[_-]+/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatHermesRemoteEndpointPolicy(
  policy: BindableWorkerOption["remoteEndpointPolicy"]
): string | null {
  switch (policy) {
    case "loopback_only":
      return "Loopback only";
    case "audited_exception_granted":
      return "Audited HTTPS exception";
    case "unknown":
      return "Policy unknown";
    default:
      return null;
  }
}

function formatBindableWorkerLabel(
  worker: BindableWorkerOption,
  rolloutFlags?: {
    hermesProfileExperience: boolean;
    hermesChannelWorkflowExpansion: boolean;
    hermesMemoryContextSync: boolean;
    hermesVisibilitySummaries: boolean;
  }
): string {
  const runtimePrefix =
    worker.runtimeType === "hermes_agent_gateway" ? "Hermes • " : "";
  const personaSummary =
    worker.runtimeType === "hermes_agent_gateway" &&
    rolloutFlags?.hermesProfileExperience
      ? ` · ${worker.personaDisplayLabel}`
      : "";
  const channelSummary =
    worker.runtimeType === "hermes_agent_gateway" &&
    rolloutFlags?.hermesChannelWorkflowExpansion
      ? ` · ${worker.channelDisplayLabel}`
      : "";
  const companionSummary =
    Boolean(worker.channelCompanionPlatforms?.length) &&
    (worker.runtimeType !== "hermes_agent_gateway" ||
      rolloutFlags?.hermesChannelWorkflowExpansion)
      ? ` - ${worker.channelCompanionPlatforms.map(formatChannelCompanionPlatform).join(", ")}`
      : "";
  const policySummary =
    worker.runtimeType === "hermes_agent_gateway" &&
    rolloutFlags?.hermesVisibilitySummaries
      ? formatHermesRemoteEndpointPolicy(worker.remoteEndpointPolicy)
      : null;
  const policySuffix = policySummary ? ` · ${policySummary}` : "";
  return `${runtimePrefix}${worker.displayName} · ${worker.status}${personaSummary}${channelSummary}${policySuffix}${companionSummary}`;
}

function renderHermesWorkerPolicyBadges(
  worker: Pick<BindableWorkerOption, "runtimeType" | "remoteEndpointPolicy">,
  showPolicyDetails: boolean
) {
  if (worker.runtimeType !== "hermes_agent_gateway" || !showPolicyDetails)
    return null;

  const policyLabel = formatHermesRemoteEndpointPolicy(
    worker.remoteEndpointPolicy
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="outline">Hermes</Badge>
      {policyLabel ? <Badge variant="secondary">{policyLabel}</Badge> : null}
    </div>
  );
}

function renderWorkerPolicyHint(
  worker:
    | Pick<BindableWorkerOption, "runtimeType" | "remoteEndpointPolicy">
    | null
    | undefined,
  showPolicyDetails: boolean
) {
  if (!worker) {
    return null;
  }

  if (worker.runtimeType === "hermes_agent_gateway" && showPolicyDetails) {
    return (
      <p className="text-xs text-muted-foreground">
        Hermes workers are tenant-gated. Remote API servers stay loopback-only
        unless an audited HTTPS exception exists.
      </p>
    );
  }

  if (worker.runtimeType === "openclaw_gateway") {
    return (
      <p className="text-xs text-muted-foreground">
        OpenClaw workers use the stable owner-bound delegated runtime path.
      </p>
    );
  }

  if (worker.runtimeType === "desktop_zeroclaw_managed") {
    return (
      <p className="text-xs text-muted-foreground">
        Desktop + ZeroClaw workers stay governed through the Desktop Host
        surface.
      </p>
    );
  }

  return null;
}

export default function Teams() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { t } = useScopedTranslation("agency");
  const hermesFlags = useTenantFeatureFlags();
  const [location, setLocation] = useLocation();
  const [, routeParams] = useRoute("/teams/:teamId");
  const locationSearch = useMemo(() => {
    const routeSearch = location.includes("?")
      ? (location.split("?")[1] ?? "")
      : "";
    const windowSearch =
      typeof window !== "undefined"
        ? window.location.search.replace(/^\?/, "")
        : "";
    return routeSearch || windowSearch;
  }, [location]);
  const locationParams = useMemo(
    () => new URLSearchParams(locationSearch),
    [locationSearch]
  );
  const requestedRoomIdFromUrl = locationParams.get("roomId");
  const requestedPanelFromUrl = locationParams.get("panel");
  const requestedMessageIdFromUrl = locationParams.get("messageId");
  const requestedWorkItemIdFromUrl = locationParams.get("workItemId");
  const composeReplyFromUrl = locationParams.get("composeReply") === "1";
  const [search, setSearch] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRoomTypeHint, setSelectedRoomTypeHint] =
    useState<CreateRoomState["roomType"] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.innerWidth >= 1024
  );
  const [isCompactViewport, setIsCompactViewport] = useState(
    () => window.innerWidth < 1280
  );
  const [activeRoomPanel, setActiveRoomPanel] = useState<
    "chat" | "workflow" | "run"
  >("chat");
  const selectedTeamIdForView = routeParams?.teamId ?? selectedTeamId;
  const selectedRoomIdForView = selectedRoomId ?? requestedRoomIdFromUrl;
  const [roomListMode, setRoomListMode] = useState(false);
  const [createRoomDialog, setCreateRoomDialog] =
    useState<CreateRoomState | null>(null);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [createTeamSectionsOpen, setCreateTeamSectionsOpen] = useState({
    presets: true,
    details: true,
    composer: false,
  });
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [newTeamCategory, setNewTeamCategory] = useState("");
  const [createTeamCategoryMode, setCreateTeamCategoryMode] = useState<
    "preset" | "custom"
  >("preset");
  const [newTeamMembers, setNewTeamMembers] = useState<NewMemberEntry[]>([]);
  const [createMemberKind, setCreateMemberKind] = useState<
    "assistant" | "human" | "external_connector"
  >("assistant");
  const [createMemberRole, setCreateMemberRole] =
    useState<TeamMemberRole>("specialist");
  const [newMemberPersonaId, setNewMemberPersonaId] = useState<
    string | undefined
  >(undefined);
  const [createHumanSearch, setCreateHumanSearch] = useState("");
  const [createHumanSearchDebounced, setCreateHumanSearchDebounced] =
    useState("");
  const [createExternalDraft, setCreateExternalDraft] =
    useState<ExternalMemberDraft>(createEmptyExternalMemberDraft());
  const [showQuickPersonaForm, setShowQuickPersonaForm] = useState(false);
  const [quickPersonaForm, setQuickPersonaForm] = useState<PersonaFormData>(
    createEmptyPersonaForm()
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string>("idle");
  const [startRunDialog, setStartRunDialog] = useState(false);
  const [startRunMode, setStartRunMode] = useState<"team_chat" | "auto_team">(
    "team_chat"
  );
  const [runObjective, setRunObjective] = useState("");
  const [startRunRequestedSubagent, setStartRunRequestedSubagent] =
    useState("auto");
  const [startRunRequestedSubagentCustom, setStartRunRequestedSubagentCustom] =
    useState("");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberKind, setAddMemberKind] = useState<
    "assistant" | "human" | "external_connector"
  >("assistant");
  const [addMemberRole, setAddMemberRole] =
    useState<TeamMemberRole>("specialist");
  const [addHumanSearch, setAddHumanSearch] = useState("");
  const [addHumanSearchDebounced, setAddHumanSearchDebounced] = useState("");
  const [addExternalDraft, setAddExternalDraft] = useState<ExternalMemberDraft>(
    createEmptyExternalMemberDraft()
  );
  const [editingMember, setEditingMember] = useState<MemberEditForm | null>(
    null
  );
  const [focusMessageRequest, setFocusMessageRequest] = useState<{
    messageId: string;
    nonce: number;
    workItemId?: string;
    composeReply?: boolean;
    messageAnchorId?: string | null;
  } | null>(null);
  const focusMessageRequestClearTimerRef = useRef<number | null>(null);
  const workflowPanelRef = useRef<HTMLDivElement | null>(null);
  const [highlightWorkflowPanel, setHighlightWorkflowPanel] = useState(false);
  const [roomSidebarSectionsOpen, setRoomSidebarSectionsOpen] = useState({
    context: true,
    contextEngine: true,
    workflow: true,
    run: true,
  });
  const [autoTeamPlanSidebarCollapsed, setAutoTeamPlanSidebarCollapsed] =
    useState(false);
  const [autoTeamPlanSidebarWidth, setAutoTeamPlanSidebarWidth] = useState(
    AUTO_TEAM_PLAN_SIDEBAR_DEFAULT_WIDTH
  );
  const [autoTeamPlanObjectiveOpen, setAutoTeamPlanObjectiveOpen] =
    useState(true);
  const autoTeamPlanSidebarResizeRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const utils = trpc.useUtils();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    const handleResize = () => {
      setIsCompactViewport(window.innerWidth < 1280);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setSidebarOpen(current => (isCompactViewport ? false : current || true));
  }, [isCompactViewport]);

  // Handle URL deep-linking: /teams/:teamId
  useEffect(() => {
    if (routeParams?.teamId && selectedTeamId !== routeParams.teamId) {
      setSelectedTeamId(routeParams.teamId);
      setSelectedRoomId(null);
      setSelectedRoomTypeHint(null);
      setActiveRunId(null);
      setRoomListMode(false);
    }
  }, [routeParams?.teamId, selectedTeamId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCreateHumanSearchDebounced(createHumanSearch.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [createHumanSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAddHumanSearchDebounced(addHumanSearch.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [addHumanSearch]);

  // Fetch teams
  const { data: teamsData, isLoading: teamsLoading } =
    trpc.team.list.useQuery();
  const teams = teamsData ?? [];

  // Fetch rooms for selected team
  const { data: teamRooms } = trpc.teamRoom.listByTeam.useQuery(
    { teamId: selectedTeamIdForView! },
    { enabled: !!selectedTeamIdForView }
  );
  const { data: selectedRoomActiveRun } = trpc.teamRoom.getActiveRun.useQuery(
    { roomId: selectedRoomIdForView! },
    {
      enabled: !!selectedRoomIdForView,
      refetchOnWindowFocus: false,
      refetchInterval: selectedRoomIdForView ? 4_000 : false,
    }
  );
  const orderedTeamRooms = useMemo(
    () =>
      [...(teamRooms ?? [])].sort(
        (left: any, right: any) =>
          toRoomTimestamp(right.createdAt) - toRoomTimestamp(left.createdAt)
      ),
    [teamRooms]
  );
  const latestTeamRoomId = orderedTeamRooms[0]?.id ?? null;
  const clearRoomSelection = () => {
    setRoomListMode(true);
    setSelectedRoomId(null);
    setSelectedRoomTypeHint(null);
    setActiveRunId(null);
    setActiveRoomPanel("chat");
    setFocusMessageRequest(null);
    if (selectedTeamIdForView) {
      setLocation(`/teams/${selectedTeamIdForView}`, {
        replace: true,
      });
    }
  };
  useEffect(() => {
    if (!selectedRoomIdForView) return;

    if (
      requestedPanelFromUrl === "workflow" ||
      requestedPanelFromUrl === "run"
    ) {
      setActiveRoomPanel(requestedPanelFromUrl);
      return;
    }

    const defaultPanel = getDefaultPanelForRoomType(
      orderedTeamRooms.find((room: any) => room.id === selectedRoomIdForView)
        ?.roomType ?? selectedRoomTypeHint
    );

    setActiveRoomPanel(defaultPanel);

    const timer = window.setTimeout(() => {
      if (defaultPanel === "workflow") {
        return;
      }
      if (workflowPanelRef.current?.scrollIntoView) {
        workflowPanelRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
      setHighlightWorkflowPanel(true);
    }, 120);

    const clearTimer = window.setTimeout(() => {
      setHighlightWorkflowPanel(false);
    }, 2600);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [
    orderedTeamRooms,
    requestedPanelFromUrl,
    selectedRoomIdForView,
    selectedRoomTypeHint,
  ]);

  const selectRoom = (roomId: string) => {
    const nextRoom = orderedTeamRooms.find((room: any) => room.id === roomId);
    const nextRoomType = normalizeCreatableRoomType(
      (nextRoom?.roomType as CreateRoomState["roomType"] | undefined) ??
        "team"
    );
    setRoomListMode(false);
    setSelectedRoomId(roomId);
    setSelectedRoomTypeHint(nextRoomType);
    setActiveRunId(null);
    setRunStatus("idle");
    setActiveRoomPanel(getDefaultPanelForRoomType(nextRoomType));
    setFocusMessageRequest(null);
    if (selectedTeamIdForView) {
      const params = new URLSearchParams();
      params.set("roomId", roomId);
      setLocation(`/teams/${selectedTeamIdForView}?${params.toString()}`, {
        replace: true,
      });
    }
  };
  const renderTeamRoomCard = (room: any) => {
    const isLatestRoom = room.id === latestTeamRoomId;
    const isSelectedRoom = room.id === selectedRoomIdForView;

    return (
      <button
        key={room.id}
        type="button"
        aria-pressed={isSelectedRoom}
        onClick={() => selectRoom(room.id)}
        data-testid={`team-room-card-${room.id}`}
        className={cn(
          "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent",
          isSelectedRoom &&
            "border-sky-300 bg-sky-50/70 shadow-sm ring-1 ring-sky-200",
          isLatestRoom && !isSelectedRoom && "border-sky-200"
        )}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {getRoomTypeLabel(room.roomType)}
          </span>
          {isLatestRoom && (
            <Badge
              variant="outline"
              className="border-sky-200 bg-sky-50 text-[11px] text-sky-700"
            >
              {t("rooms.latestBadge")}
            </Badge>
          )}
          {isSelectedRoom && (
            <Badge variant="secondary" className="text-[11px]">
              {t("rooms.selectedBadge")}
            </Badge>
          )}
          {isLegacyRoomType(room.roomType) && (
            <Badge variant="outline" className="text-[11px]">
              {t("teams.rooms.legacyType")}
            </Badge>
          )}
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-xs",
              room.status === "active"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
            )}
          >
            {getRoomStatusLabel(room.status)}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {getRoomTypeDescription(room.roomType)}
        </p>
        <p className="line-clamp-1 text-[11px] text-muted-foreground">
          {t("teams.rooms.defaultRunModeLabel")}{" "}
          {getRoomTypeDefaultModeLabel(room.roomType)}
        </p>
        <div
          className="flex items-center gap-1 text-[11px] text-muted-foreground"
          data-testid={`team-room-card-${room.id}-created-at`}
        >
          <Clock3 className="h-3 w-3" />
          <span>
            {t("rooms.createdAtLabel")} {formatRoomCreatedAt(room.createdAt)}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {room.goalPrompt ?? t("teams.rooms.noObjective")}
        </p>
      </button>
    );
  };

  useEffect(() => {
    if (
      roomListMode ||
      requestedRoomIdFromUrl ||
      selectedRoomId ||
      !selectedTeamIdForView ||
      !orderedTeamRooms.length
    ) {
      return;
    }

    setSelectedRoomId(orderedTeamRooms[0].id);
  }, [
    requestedRoomIdFromUrl,
    selectedRoomId,
    selectedTeamIdForView,
    roomListMode,
    orderedTeamRooms,
  ]);

  useEffect(() => {
    if (!selectedTeamIdForView || !teamRooms?.length) return;

    if (
      requestedRoomIdFromUrl &&
      teamRooms.some((room: any) => room.id === requestedRoomIdFromUrl)
    ) {
      setRoomListMode(false);
      setSelectedRoomId(current =>
        current === requestedRoomIdFromUrl ? current : requestedRoomIdFromUrl
      );
      return;
    }

    if (requestedMessageIdFromUrl) {
      setFocusMessageRequest(current => {
        if (
          current?.messageId === requestedMessageIdFromUrl &&
          current?.workItemId === requestedWorkItemIdFromUrl &&
          current?.composeReply === composeReplyFromUrl
        ) {
          return current;
        }

        return {
          messageId: requestedMessageIdFromUrl,
          nonce: Date.now(),
          workItemId: requestedWorkItemIdFromUrl ?? undefined,
          composeReply: composeReplyFromUrl,
        };
      });
    }
  }, [
    requestedRoomIdFromUrl,
    requestedMessageIdFromUrl,
    requestedWorkItemIdFromUrl,
    composeReplyFromUrl,
    selectedTeamIdForView,
    teamRooms,
    locationSearch,
  ]);

  useEffect(() => {
    if (!focusMessageRequest?.messageId) return;

    if (focusMessageRequestClearTimerRef.current !== null) {
      window.clearTimeout(focusMessageRequestClearTimerRef.current);
    }

    const requestNonce = focusMessageRequest.nonce;
    focusMessageRequestClearTimerRef.current = window.setTimeout(() => {
      setFocusMessageRequest(current =>
        current?.nonce === requestNonce ? null : current,
      );
      focusMessageRequestClearTimerRef.current = null;
    }, 350);

    return () => {
      if (focusMessageRequestClearTimerRef.current !== null) {
        window.clearTimeout(focusMessageRequestClearTimerRef.current);
        focusMessageRequestClearTimerRef.current = null;
      }
    };
  }, [focusMessageRequest?.messageId, focusMessageRequest?.nonce]);

  // Create room mutation
  const createRoomMutation = trpc.teamRoom.create.useMutation({
    onSuccess: data => {
      setRoomListMode(false);
      setSelectedRoomId(data.id);
      setSelectedRoomTypeHint(data.roomType);
      setCreateRoomDialog(null);
      if (selectedTeamIdForView) {
        utils.teamRoom.listByTeam.invalidate({ teamId: selectedTeamIdForView });
      }
      if (data.roomType === "auto_team") {
        setActiveRoomPanel("workflow");
        startRunMutation.mutate({
          roomId: data.id,
          executionMode: "auto_team",
          objective: data.goalPrompt ?? "",
          stopPolicy: {
            maxRounds: 20,
            maxDurationMinutes: 30,
            maxBudgetCredits: 500,
          },
          requestedSubagent: resolvedRequestedSubagent,
        });
        return;
      }
      toast.success(t("teams.toast.roomCreated"));
    },
    onError: err => toast.error(err.message),
  });

  // Archive team mutation
  const archiveMutation = trpc.team.archive.useMutation({
    onSuccess: () => {
      setSelectedTeamId(null);
      setSelectedRoomId(null);
      setRoomListMode(false);
      utils.team.list.invalidate();
    },
  });

  // Fetch selected team detail (with members)
  const { data: teamDetail } = trpc.team.get.useQuery(
    { teamId: selectedTeamIdForView! },
    { enabled: !!selectedTeamIdForView }
  );
  const { data: bindableWorkers } = trpc.team.listBindableWorkers.useQuery(
    selectedTeamId ? { teamId: selectedTeamId } : undefined,
    {
      enabled: Boolean(
        isAuthenticated && (selectedTeamId || createTeamOpen || addMemberOpen)
      ),
      staleTime: 30_000,
    }
  );
  const bindableWorkerList = (bindableWorkers ?? []) as BindableWorkerOption[];
  const bindableWorkerMap = new Map(
    bindableWorkerList.map(worker => [worker.id, worker])
  );
  const [workerBudgetDrafts, setWorkerBudgetDrafts] = useState<
    Record<string, WorkerBudgetDraft>
  >({});
  const selectedBudgetWorkerId =
    (editingMember?.memberKind === "external_connector" &&
    editingMember.externalWorkerId.trim()
      ? editingMember.externalWorkerId.trim()
      : addMemberOpen && addExternalDraft.externalWorkerId.trim()
        ? addExternalDraft.externalWorkerId.trim()
        : createTeamOpen &&
            createMemberKind === "external_connector" &&
            createExternalDraft.externalWorkerId.trim()
          ? createExternalDraft.externalWorkerId.trim()
          : "") || null;
  const ownedWorkerBudgetQuery = trpc.team.getOwnedWorkerBudget.useQuery(
    selectedBudgetWorkerId ? { workerId: selectedBudgetWorkerId } : skipToken,
    {
      enabled: Boolean(isAuthenticated && selectedBudgetWorkerId),
      staleTime: 30_000,
    }
  );
  const updateOwnedWorkerBudgetMutation =
    trpc.team.updateOwnedWorkerBudget.useMutation({
      onSuccess: async result => {
        setWorkerBudgetDrafts(prev => ({
          ...prev,
          [result.workerId]: createWorkerBudgetDraft(
            result as WorkerBudgetSummary
          ),
        }));
        await Promise.all([
          utils.team.getOwnedWorkerBudget.invalidate({
            workerId: result.workerId,
          }),
          utils.team.listBindableWorkers.invalidate(
            selectedTeamId ? { teamId: selectedTeamId } : undefined
          ),
        ]);
        toast.success("Worker budget guardrails saved");
      },
      onError: error => {
        toast.error(error.message || "Failed to save worker budget");
      },
    });

  const selectedTeam = teams.find((t: any) => t.id === selectedTeamIdForView);
  const selectedRoom =
    orderedTeamRooms?.find((room: any) => room.id === selectedRoomIdForView) ??
    null;
  const requestedRoomMissing = Boolean(
    requestedRoomIdFromUrl &&
    selectedTeamIdForView &&
    teamRooms &&
    !selectedRoom
  );
  const selectedRoomType = normalizeCreatableRoomType(
    (selectedRoom?.roomType as CreateRoomState["roomType"] | undefined) ??
      selectedRoomTypeHint ??
      "team"
  );
  const selectedRoomLanguage: "en" | "th" =
    selectedRoom?.language === "th" ? "th" : "en";
  const selectedRoomExecutionMode =
    mapRoomTypeToExecutionMode(selectedRoomType);
  const selectedRoomAutonomyLevel = (
    selectedRoom?.autonomyLevel === "fully_auto"
      ? "fully_auto"
      : selectedRoom?.autonomyLevel === "semi_auto"
        ? "semi_auto"
        : selectedRoomType === "auto_team"
          ? "fully_auto"
          : "semi_auto"
  ) as "fully_auto" | "semi_auto";
  const selectedBudgetSummary =
    (ownedWorkerBudgetQuery.data as WorkerBudgetSummary | undefined) ?? null;
  const allowManualRunStart = selectedRoomType !== "auto_team";
  const selectedBudgetDraft = selectedBudgetWorkerId
    ? (workerBudgetDrafts[selectedBudgetWorkerId] ??
      createWorkerBudgetDraft(selectedBudgetSummary))
    : null;

  useEffect(() => {
    if (!selectedBudgetSummary) return;
    setWorkerBudgetDrafts(prev =>
      prev[selectedBudgetSummary.workerId]
        ? prev
        : {
            ...prev,
            [selectedBudgetSummary.workerId]: createWorkerBudgetDraft(
              selectedBudgetSummary
            ),
          }
    );
  }, [selectedBudgetSummary]);

  useEffect(() => {
    if (selectedRoomActiveRun?.id) {
      setActiveRunId(current => current ?? selectedRoomActiveRun.id);
      return;
    }
    if (selectedRoom?.lastRunId) {
      setActiveRunId(current => current ?? selectedRoom.lastRunId);
      return;
    }
    setActiveRunId(current =>
      current && selectedRoomIdForView ? current : null
    );
  }, [
    selectedRoom?.lastRunId,
    selectedRoomActiveRun?.id,
    selectedRoomIdForView,
  ]);

  useEffect(() => {
    if (!selectedRoomIdForView) return;

    if (
      requestedPanelFromUrl === "workflow" ||
      requestedPanelFromUrl === "run"
    ) {
      setActiveRoomPanel(requestedPanelFromUrl);
      return;
    }

    setActiveRoomPanel(getDefaultPanelForRoomType(selectedRoomType));
  }, [requestedPanelFromUrl, selectedRoomIdForView, selectedRoomType]);

  const { data: activeRunDetail } = trpc.teamRun.get.useQuery(
    { runId: activeRunId! },
    {
      enabled: !!activeRunId,
      refetchOnWindowFocus: false,
      refetchInterval: activeRunId ? 4000 : false,
    }
  );

  useEffect(() => {
    if (!activeRunDetail) return;
    setRunStatus(activeRunDetail.status);
  }, [activeRunDetail?.status]);

  const activeRunRuntimeState = (activeRunDetail as any)?.runtimeState ?? null;
  const activeRunSelectedSkillId =
    (activeRunRuntimeState as { selectedSkillId?: string | null } | null)
      ?.selectedSkillId ?? null;
  const selectedRoomCurrentObjective =
    (activeRunDetail as any)?.objective?.trim() ||
    selectedRoom?.goalPrompt?.trim() ||
    t("teams.rooms.sidebar.noObjective");
  const selectedRoomCurrentPhase =
    (activeRunRuntimeState as { currentPhase?: string } | null)?.currentPhase ??
    null;
  const selectedRoomWaitingReason =
    (activeRunRuntimeState as { waitingReason?: string | null } | null)
      ?.waitingReason ?? null;
  const selectedRoomRunModeLabel =
    selectedRoomType === "auto_team"
      ? t("teams.run.mode.autoTeam")
      : t("teams.run.mode.teamChat");
  const selectedRoomAutonomyLabel = getRoomAutonomyLabel(
    selectedRoomAutonomyLevel
  );
  const { data: activeRuntimeSkillForSubagentPicker } = trpc.skills.getFromDb.useQuery(
    activeRunSelectedSkillId ? { slug: activeRunSelectedSkillId } : skipToken,
    {
      enabled: Boolean(startRunDialog && activeRunSelectedSkillId),
      staleTime: 30_000,
    }
  );
  const runtimeSubagentNames = useMemo(
    () =>
      Array.from(
        new Set(
          (activeRuntimeSkillForSubagentPicker as
            | { nativeSubagentNames?: string[] }
            | undefined
          )?.nativeSubagentNames ?? []
        )
      ),
    [activeRuntimeSkillForSubagentPicker]
  );
  const showAutoTeamPlanSidebar =
    !isCompactViewport && selectedRoomType === "auto_team";
  const useSinglePanelLayout =
    !isCompactViewport && selectedRoomType === "auto_team";
  const activeRunSectionVisible = Boolean(activeRunId);
  const contextEngineLookbackSince = useMemo(
    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    []
  );
  const contextEngineHealthInput =
    selectedRoomIdForView && selectedTeamIdForView
      ? {
          roomId: selectedRoomIdForView,
          teamId: selectedTeamIdForView,
          runId: activeRunId ?? selectedRoom?.lastRunId ?? undefined,
          limit: 8,
          since: contextEngineLookbackSince,
        }
      : skipToken;
  const contextEngineHealthQuery = trpc.teamRoom.getContextEngineHealth.useQuery(
    contextEngineHealthInput,
    {
      enabled: Boolean(selectedRoomIdForView && selectedTeamIdForView),
      refetchInterval: activeRunId ? 10_000 : 25_000,
    }
  );
  const expandAllRoomSidebarSections = () => {
    setRoomSidebarSectionsOpen({
      context: true,
      contextEngine: true,
      workflow: true,
      run: true,
    });
  };
  const collapseAllRoomSidebarSections = () => {
    setRoomSidebarSectionsOpen({
      context: false,
      contextEngine: false,
      workflow: false,
      run: false,
    });
  };

  useEffect(() => {
    if (!showAutoTeamPlanSidebar) return;
    setAutoTeamPlanObjectiveOpen(true);
  }, [selectedRoomIdForView, showAutoTeamPlanSidebar]);

  const handleAutoTeamPlanSidebarResizeMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (autoTeamPlanSidebarCollapsed) return;

    event.preventDefault();
    autoTeamPlanSidebarResizeRef.current = {
      startX: event.clientX,
      startWidth: autoTeamPlanSidebarWidth,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!autoTeamPlanSidebarResizeRef.current) return;
      const delta =
        autoTeamPlanSidebarResizeRef.current.startX - moveEvent.clientX;
      const nextWidth = Math.min(
        AUTO_TEAM_PLAN_SIDEBAR_MAX_WIDTH,
        Math.max(
          AUTO_TEAM_PLAN_SIDEBAR_MIN_WIDTH,
          autoTeamPlanSidebarResizeRef.current.startWidth + delta
        )
      );
      setAutoTeamPlanSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      autoTeamPlanSidebarResizeRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  // Run mutations
  const startRunMutation = trpc.teamRun.start.useMutation({
    onSuccess: data => {
      setActiveRunId(data.id);
      setRunStatus("running");
      setStartRunDialog(false);
      setRunObjective("");
      if (selectedTeamIdForView) {
        utils.teamRoom.listByTeam.invalidate({ teamId: selectedTeamIdForView });
      }
      toast.success(t("teams.toast.runStarted"));
    },
    onError: err => toast.error(err.message),
  });

  const stopRunMutation = trpc.teamRun.stop.useMutation({
    onSuccess: () => {
      setRunStatus("stopped");
      if (activeRunId) {
        utils.teamRun.get.invalidate({ runId: activeRunId });
      }
      if (selectedRoomId) {
        utils.teamWorkItem.listByRoom.invalidate({ roomId: selectedRoomId });
      }
      toast.success(t("teams.toast.runStopped"));
    },
    onError: err => toast.error(err.message),
  });

  const pauseRunMutation = trpc.teamRun.pause.useMutation({
    onSuccess: () => {
      setRunStatus("paused");
      if (activeRunId) {
        utils.teamRun.get.invalidate({ runId: activeRunId });
      }
      toast.success(t("teams.toast.runPaused"));
    },
    onError: err => toast.error(err.message),
  });

  const resumeRunMutation = trpc.teamRun.resume.useMutation({
    onSuccess: () => {
      setRunStatus("running");
      if (activeRunId) {
        utils.teamRun.get.invalidate({ runId: activeRunId });
      }
      if (selectedRoomId) {
        utils.teamWorkItem.listByRoom.invalidate({ roomId: selectedRoomId });
      }
      toast.success(t("teams.toast.runResumed"));
    },
    onError: err => toast.error(err.message),
  });

  const chooseExplorationCandidateMutation =
    trpc.teamRun.chooseExplorationCandidate.useMutation({
      onSuccess: () => {
        if (activeRunId) {
          utils.teamRun.get.invalidate({ runId: activeRunId });
        }
        toast.success("Exploration candidate selected");
      },
      onError: err => toast.error(err.message),
    });

  const rejectExplorationCandidatesMutation =
    trpc.teamRun.rejectExplorationCandidates.useMutation({
      onSuccess: () => {
        if (activeRunId) {
          utils.teamRun.get.invalidate({ runId: activeRunId });
        }
        toast.success("Exploration candidates rejected; replanning started");
      },
      onError: err => toast.error(err.message),
    });

  const approveFinalResultMutation =
    trpc.teamRun.approveFinalReview.useMutation({
      onSuccess: () => {
        if (activeRunId) {
          utils.teamRun.get.invalidate({ runId: activeRunId });
        }
        toast.success("Final result approved");
      },
      onError: err => toast.error(err.message),
    });

  const rejectFinalResultMutation = trpc.teamRun.rejectFinalReview.useMutation({
    onSuccess: () => {
      if (activeRunId) {
        utils.teamRun.get.invalidate({ runId: activeRunId });
      }
      toast.success("Final result rejected; replanning started");
    },
    onError: err => toast.error(err.message),
  });

  const advanceRunMutation = trpc.teamRun.advance.useMutation({
    onSuccess: (results, variables) => {
      setRunStatus("running");
      if (activeRunId) {
        utils.teamRun.get.invalidate({ runId: activeRunId });
      }
      if (selectedRoomId) {
        utils.teamWorkItem.listByRoom.invalidate({ roomId: selectedRoomId });
        utils.teamRoom.getMessages.invalidate({ roomId: selectedRoomId });
      }
      const completedTurns = results.length;
      toast.success(
        completedTurns > 0
          ? t("teams.toast.runAdvanced", { count: completedTurns })
          : t("teams.toast.runAdvanceRequested", {
              count: variables.maxTurns ?? 1,
            })
      );
    },
    onError: err => toast.error(err.message),
  });

  // Send message mutation
  const sendMessageMutation = trpc.teamRoom.sendMessage.useMutation({
    onSuccess: (data, variables) => {
      if (data?.triggeredRunId) {
        setActiveRunId(data.triggeredRunId);
        setRunStatus("running");
      }
      utils.teamRoom.getMessages.invalidate({ roomId: variables.roomId });
      utils.teamRoom.viewerState.invalidate({ roomId: variables.roomId });
      if (data?.triggeredRunId) {
        utils.teamRun.get.invalidate({ runId: data.triggeredRunId });
      }
    },
    onError: err => toast.error(err.message),
  });

  const runControlsBusy =
    pauseRunMutation.isPending ||
    resumeRunMutation.isPending ||
    stopRunMutation.isPending ||
    advanceRunMutation.isPending ||
    chooseExplorationCandidateMutation.isPending ||
    rejectExplorationCandidatesMutation.isPending ||
    approveFinalResultMutation.isPending ||
    rejectFinalResultMutation.isPending;

  const canStopAutomationRun =
    Boolean(activeRunId) &&
    (runStatus === "queued" ||
      runStatus === "running" ||
      runStatus === "paused");

  const activeRunStatusReason = (() => {
    if (activeRunRuntimeState?.waitingReason) {
      return activeRunRuntimeState.waitingReason;
    }
    if (!activeRunDetail) return null;
    if (activeRunDetail.status === "paused") {
      switch (activeRunDetail.stopReason) {
        case "awaiting_human_choice":
          return "Human choice window open for exploration candidates";
        case "awaiting_final_approval":
          return "Final approval window open";
        case "repeated_turn_detected":
          return t("run.reason.repeatedWorkDetected");
        case "user_paused":
          return t("teams.run.reason.userPaused");
        case "awaiting_human_approval":
          return t("teams.run.reason.awaitingHumanApproval");
        case "awaiting_external_member":
          return t("teams.run.reason.awaitingExternalMember");
        default:
          return activeRunDetail.stopReason
            ? t("teams.run.reason.pausedWithReason", {
                reason: activeRunDetail.stopReason,
              })
            : t("teams.run.reason.paused");
      }
    }

    if (
      activeRunDetail.status === "completed" ||
      activeRunDetail.status === "stopped" ||
      activeRunDetail.status === "failed"
    ) {
      if (
        activeRunDetail.status === "stopped" &&
        activeRunDetail.stopReason === "repeated_turn_detected"
      ) {
        return t("run.reason.repeatedWorkDetected");
      }
      if (
        activeRunDetail.status === "stopped" &&
        activeRunDetail.stopReason === "user_requested"
      ) {
        return t("teams.run.reason.userStopped");
      }
      return activeRunDetail.stopReason
        ? t("teams.run.reason.endedWithReason", {
            reason: activeRunDetail.stopReason,
          })
        : null;
    }

    return null;
  })();

  const openStartRunDialog = () => {
    setStartRunMode(selectedRoomExecutionMode);
    setStartRunRequestedSubagent("auto");
    setStartRunRequestedSubagentCustom("");
    setStartRunDialog(true);
  };

  const resolvedRequestedSubagent =
    startRunRequestedSubagent === "auto"
      ? null
      : startRunRequestedSubagent === "custom"
        ? startRunRequestedSubagentCustom.trim() || null
        : startRunRequestedSubagent.trim() || null;

  const handleChooseExplorationCandidate = (
    candidateId: string,
    comment?: string
  ) => {
    if (!activeRunId) return;
    chooseExplorationCandidateMutation.mutate({
      runId: activeRunId,
      candidateId,
      comment,
    });
  };

  const handleRejectExplorationCandidates = (reason?: string) => {
    if (!activeRunId) return;
    rejectExplorationCandidatesMutation.mutate({
      runId: activeRunId,
      reason,
    });
  };

  const handleApproveFinalResult = (comment?: string) => {
    if (!activeRunId) return;
    approveFinalResultMutation.mutate({
      runId: activeRunId,
      comment,
    });
  };

  const handleRejectFinalResult = (reason?: string) => {
    if (!activeRunId) return;
    rejectFinalResultMutation.mutate({
      runId: activeRunId,
      reason,
    });
  };

  const resetQuickPersonaForm = () => {
    setShowQuickPersonaForm(false);
    setQuickPersonaForm(createEmptyPersonaForm());
  };

  const resetCreateMemberInputs = () => {
    setCreateMemberKind("assistant");
    setCreateMemberRole("specialist");
    setNewMemberPersonaId(undefined);
    setCreateHumanSearch("");
    setCreateHumanSearchDebounced("");
    setCreateExternalDraft(createEmptyExternalMemberDraft());
  };

  const resetAddMemberInputs = () => {
    setAddMemberKind("assistant");
    setAddMemberRole("specialist");
    setAddHumanSearch("");
    setAddHumanSearchDebounced("");
    setAddExternalDraft(createEmptyExternalMemberDraft());
  };

  const existingTeamMemberKeys = new Set(
    (teamDetail?.members ?? []).map((member: any) => {
      if (member.memberKind === "human")
        return `human:${member.humanUserId ?? ""}`;
      if (member.memberKind === "external_connector") {
        return member.externalWorkerId
          ? `external-worker:${member.externalWorkerId}`
          : `external:${normalizeExternalMemberRef(member.externalRef)}`;
      }
      return `assistant:${member.personaId ?? ""}`;
    })
  );

  const addDraftMemberFromPersona = (persona: any) => {
    if (!persona) return;
    const memberKey = getDraftMemberKey({
      memberKind: "assistant",
      personaId: persona.id,
    });
    if (newTeamMembers.some(member => member.memberKey === memberKey)) return;

    setNewTeamMembers(prev => [
      ...prev,
      {
        memberKey,
        memberKind: "assistant",
        memberRole: !prev.some(
          member =>
            member.memberKind === "assistant" &&
            member.memberRole === "orchestrator"
        )
          ? "orchestrator"
          : createMemberRole,
        personaId: persona.id,
        blueprintId: undefined,
        blueprintMemberId: undefined,
        personaBlueprint: undefined,
        reusedPersonaName: undefined,
        displayName: persona.name,
        instructions:
          persona.systemPromptPrefix ?? t("teams.manage.defaultInstructions"),
        isLead: !prev.some(
          member => member.memberKind === "assistant" && member.isLead
        ),
      },
    ]);
    setNewMemberPersonaId(undefined);
  };

  // Add member to existing team
  const addMemberMutation = trpc.team.addMember.useMutation({
    onSuccess: () => {
      setAddMemberOpen(false);
      resetAddMemberInputs();
      resetQuickPersonaForm();
      utils.team.get.invalidate({ teamId: selectedTeamId! });
      utils.team.list.invalidate();
      toast.success(t("teams.toast.memberAdded"));
    },
    onError: err => toast.error(err.message),
  });

  const updateMemberMutation = trpc.team.updateMember.useMutation({
    onSuccess: () => {
      setEditingMember(null);
      utils.team.get.invalidate({ teamId: selectedTeamId! });
      utils.team.list.invalidate();
      toast.success(t("teams.toast.memberUpdated"));
    },
    onError: err => toast.error(err.message),
  });

  const createPersonaMutation = trpc.persona.create.useMutation({
    onSuccess: persona => {
      utils.persona.list.invalidate();
      resetQuickPersonaForm();

      if (addMemberOpen && selectedTeamId) {
        addMemberMutation.mutate({
          teamId: selectedTeamId,
          member: {
            memberKind: "assistant",
            memberRole: addMemberRole,
            personaId: persona.id,
            displayName: persona.name,
            instructions:
              persona.systemPromptPrefix ??
              t("teams.manage.defaultInstructions"),
            isLead: false,
          },
        });
        toast.success(t("teams.toast.personaCreated"));
        return;
      }

      addDraftMemberFromPersona(persona);
      toast.success(t("teams.toast.personaCreatedAndAdded"));
    },
    onError: err => toast.error(err.message),
  });

  const addDraftHumanMember = (user: {
    id: number;
    name?: string | null;
    email?: string | null;
  }) => {
    const memberKey = getDraftMemberKey({
      memberKind: "human",
      humanUserId: user.id,
    });
    if (newTeamMembers.some(member => member.memberKey === memberKey)) return;
    setNewTeamMembers(prev => [
      ...prev,
      {
        memberKey,
        memberKind: "human",
        memberRole: createMemberRole,
        humanUserId: user.id,
        displayName:
          user.name ||
          user.email ||
          t("teams.manage.userFallback", { id: user.id }),
        roleTitle: t("teams.manage.humanReviewer"),
        isLead: false,
      },
    ]);
    setCreateHumanSearch("");
    setCreateHumanSearchDebounced("");
  };

  const addDraftExternalMember = () => {
    const ref = createExternalDraft.externalRef.trim();
    const name = createExternalDraft.displayName.trim();
    if (!ref || !name) {
      toast.error(t("teams.error.connectorFieldsRequired"));
      return;
    }
    const selectedWorkerId =
      createExternalDraft.externalWorkerId.trim() || undefined;
    const memberKey = getDraftMemberKey({
      memberKind: "external_connector",
      externalRef: ref,
      externalWorkerId: selectedWorkerId,
    });
    if (newTeamMembers.some(member => member.memberKey === memberKey)) {
      toast.error(t("teams.error.connectorAlreadyAdded"));
      return;
    }
    setNewTeamMembers(prev => [
      ...prev,
      {
        memberKey,
        memberKind: "external_connector",
        memberRole: createMemberRole,
        externalRef: ref,
        externalWorkerId: selectedWorkerId,
        externalConfigJson: {
          instructions: createExternalDraft.instructions.trim() || undefined,
        },
        displayName: name,
        roleTitle:
          createExternalDraft.roleTitle.trim() ||
          t("teams.memberKind.external.label"),
        instructions: createExternalDraft.instructions.trim() || undefined,
        isLead: false,
      },
    ]);
    setCreateExternalDraft(createEmptyExternalMemberDraft());
  };

  // Fetch personas for member selector
  const { data: personas } = trpc.persona.list.useQuery(undefined, {
    enabled: createTeamOpen || addMemberOpen,
  });

  const { data: createHumanCandidates, isLoading: createHumanLoading } =
    trpc.groups.searchTenantUsers.useQuery(
      {
        query: createHumanSearchDebounced,
        limit: 10,
      },
      {
        enabled:
          createTeamOpen &&
          createMemberKind === "human" &&
          createHumanSearchDebounced.length >= 1,
      }
    );

  const { data: addHumanCandidates, isLoading: addHumanLoading } =
    trpc.groups.searchTenantUsers.useQuery(
      {
        query: addHumanSearchDebounced,
        limit: 10,
      },
      {
        enabled:
          addMemberOpen &&
          addMemberKind === "human" &&
          addHumanSearchDebounced.length >= 1,
      }
    );

  // Create team mutation
  const createTeamMutation = trpc.team.create.useMutation({
    onSuccess: data => {
      setCreateTeamOpen(false);
      setNewTeamName("");
      setNewTeamDescription("");
      setNewTeamCategory("");
      setCreateTeamCategoryMode("preset");
      setNewTeamMembers([]);
      resetCreateMemberInputs();
      resetQuickPersonaForm();
      setSelectedTeamId(data.teamId);
      utils.team.list.invalidate();
      utils.persona.list.invalidate();
      toast.success(t("teams.toast.teamCreated"));
    },
    onError: err => {
      toast.error(err.message);
    },
  });

  const addExistingHumanMember = (user: {
    id: number;
    name?: string | null;
    email?: string | null;
  }) => {
    if (!selectedTeamId) return;
    const memberKey = `human:${user.id}`;
    if (existingTeamMemberKeys.has(memberKey)) {
      toast.error(t("teams.error.userAlreadyInTeam"));
      return;
    }
    addMemberMutation.mutate({
      teamId: selectedTeamId,
      member: {
        memberKind: "human",
        memberRole: addMemberRole,
        humanUserId: user.id,
        displayName:
          user.name ||
          user.email ||
          t("teams.manage.userFallback", { id: user.id }),
        roleTitle: t("teams.manage.humanReviewer"),
        isLead: false,
      },
    });
  };

  const addExistingExternalMember = () => {
    if (!selectedTeamId) return;
    const ref = addExternalDraft.externalRef.trim();
    const name = addExternalDraft.displayName.trim();
    if (!ref || !name) {
      toast.error(t("teams.error.connectorFieldsRequired"));
      return;
    }
    const selectedWorkerId =
      addExternalDraft.externalWorkerId.trim() || undefined;
    const memberKey = selectedWorkerId
      ? `external-worker:${selectedWorkerId}`
      : `external:${normalizeExternalMemberRef(ref)}`;
    if (existingTeamMemberKeys.has(memberKey)) {
      toast.error(t("teams.error.connectorAlreadyInTeam"));
      return;
    }
    addMemberMutation.mutate({
      teamId: selectedTeamId,
      member: {
        memberKind: "external_connector",
        memberRole: addMemberRole,
        externalRef: ref,
        externalWorkerId: selectedWorkerId,
        externalConfigJson: {
          instructions: addExternalDraft.instructions.trim() || undefined,
        },
        displayName: name,
        roleTitle:
          addExternalDraft.roleTitle.trim() ||
          t("teams.memberKind.external.label"),
        isLead: false,
      },
    });
  };

  const openMemberEditor = (member: any) => {
    setEditingMember({
      profileId: member.id,
      memberKind: member.memberKind ?? "assistant",
      memberRole:
        member.memberRole ??
        getDefaultRoleForKind(member.memberKind ?? "assistant"),
      displayName: member.displayName ?? "",
      roleTitle: member.roleTitle ?? "",
      instructions:
        member.memberKind === "assistant"
          ? (member.instructions ?? "")
          : getConnectorInstructions(member.externalConfigJson),
      externalRef: member.externalRef ?? "",
      externalWorkerId: member.externalWorkerId ?? "",
      humanUserId: member.humanUserId ?? null,
      currentLead: member.isLead ?? false,
      promoteToLead: member.isLead ?? false,
    });
  };

  const handleSaveMemberEdits = () => {
    if (!editingMember) return;
    const displayName = editingMember.displayName.trim();
    if (!displayName) {
      toast.error(t("teams.error.displayNameRequired"));
      return;
    }

    const payload: Record<string, unknown> = {
      profileId: editingMember.profileId,
      displayName,
      roleTitle: editingMember.roleTitle.trim() || undefined,
      memberRole: editingMember.memberRole,
    };

    if (editingMember.memberKind === "assistant") {
      payload.instructions =
        editingMember.instructions.trim() ||
        t("teams.manage.defaultInstructions");
      if (editingMember.promoteToLead) {
        payload.isLead = true;
      }
    }

    if (editingMember.memberKind === "external_connector") {
      const externalRef = editingMember.externalRef.trim();
      if (!externalRef) {
        toast.error(t("teams.error.externalReferenceRequired"));
        return;
      }
      payload.externalRef = externalRef;
      payload.externalWorkerId = editingMember.externalWorkerId.trim() || null;
      payload.externalConfigJson = {
        instructions: editingMember.instructions.trim() || undefined,
      };
    }

    updateMemberMutation.mutate(payload as any);
  };

  const setSelectedWorkerBudgetField = (
    field: keyof WorkerBudgetDraft,
    value: string
  ) => {
    if (!selectedBudgetWorkerId) return;
    setWorkerBudgetDrafts(prev => ({
      ...prev,
      [selectedBudgetWorkerId]: {
        ...(prev[selectedBudgetWorkerId] ??
          createWorkerBudgetDraft(selectedBudgetSummary)),
        [field]: value,
      },
    }));
  };

  const saveSelectedWorkerBudget = () => {
    if (!selectedBudgetWorkerId || !selectedBudgetDraft) return;
    try {
      updateOwnedWorkerBudgetMutation.mutate({
        workerId: selectedBudgetWorkerId,
        ...parseWorkerBudgetDraft(selectedBudgetDraft),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid worker budget"
      );
    }
  };

  const clearSelectedWorkerBudget = () => {
    if (!selectedBudgetWorkerId) return;
    const emptyDraft = createWorkerBudgetDraft(null);
    setWorkerBudgetDrafts(prev => ({
      ...prev,
      [selectedBudgetWorkerId]: emptyDraft,
    }));
    updateOwnedWorkerBudgetMutation.mutate({
      workerId: selectedBudgetWorkerId,
      hourlyCredits: null,
      fiveHourCredits: null,
      dailyCredits: null,
      weeklyCredits: null,
      monthlyCredits: null,
    });
  };

  const renderSelectedWorkerBudgetPanel = () => {
    if (!selectedBudgetWorkerId) return null;

    const worker = bindableWorkerMap.get(selectedBudgetWorkerId);
    const draft =
      selectedBudgetDraft ?? createWorkerBudgetDraft(selectedBudgetSummary);
    const budgetFields: Array<{ key: keyof WorkerBudgetDraft; label: string }> =
      [
        { key: "hourlyCredits", label: "Hourly cap" },
        { key: "fiveHourCredits", label: "5-hour cap" },
        { key: "dailyCredits", label: "Daily cap" },
        { key: "weeklyCredits", label: "Weekly cap" },
        { key: "monthlyCredits", label: "Monthly cap" },
      ];

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Worker credit guardrails</p>
            <p className="text-xs text-muted-foreground">
              Personal safety caps for{" "}
              {worker?.displayName ?? selectedBudgetWorkerId}. Charges still
              come from your own SmartAIHub balance.
            </p>
          </div>
          {selectedBudgetSummary?.blockedByBudget ? (
            <Badge variant="destructive">Currently blocked by budget</Badge>
          ) : (
            <Badge variant="outline">Personal worker budget</Badge>
          )}
        </div>

        {ownedWorkerBudgetQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading worker budget…
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {budgetFields.map(field => (
                <div key={field.key}>
                  <Label>{field.label}</Label>
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={draft[field.key]}
                    placeholder="Unlimited"
                    onChange={event =>
                      setSelectedWorkerBudgetField(
                        field.key,
                        event.target.value
                      )
                    }
                    className="mt-1"
                  />
                </div>
              ))}
            </div>

            {selectedBudgetSummary?.windows?.length ? (
              <div className="space-y-1 rounded-md border bg-white p-3 text-xs text-slate-700">
                {selectedBudgetSummary.windows.map(window => (
                  <div
                    key={window.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>{workerBudgetWindowLabel(window.label)}</span>
                    <span
                      className={cn(
                        window.blocked
                          ? "font-medium text-red-600"
                          : "text-muted-foreground"
                      )}
                    >
                      {window.usedCredits} used
                      {window.capCredits != null
                        ? ` / ${window.capCredits} cap`
                        : " / unlimited"}
                      {window.remainingCredits != null
                        ? ` · ${window.remainingCredits} left`
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearSelectedWorkerBudget}
                disabled={updateOwnedWorkerBudgetMutation.isPending}
              >
                Clear caps
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveSelectedWorkerBudget}
                disabled={updateOwnedWorkerBudgetMutation.isPending}
              >
                {updateOwnedWorkerBudgetMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save worker budget
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSelectedWorkerBindingDetails = (
    workerId: string | null | undefined
  ) => {
    const selectedWorkerId = workerId?.trim();
    if (!selectedWorkerId) return null;

    const worker = bindableWorkerMap.get(selectedWorkerId);
    if (!worker) return null;

    const channelCompanionSummary =
      Boolean(worker.channelCompanionPlatforms?.length) &&
      (worker.runtimeType !== "hermes_agent_gateway" ||
        hermesFlags.hermesChannelWorkflowExpansion)
        ? worker.channelCompanionPlatforms
            .map(formatChannelCompanionPlatform)
            .join(", ")
        : null;
    const showHermesPolicy =
      worker.runtimeType === "hermes_agent_gateway" &&
      hermesFlags.hermesVisibilitySummaries;

    if (
      !worker.bindingReason &&
      !channelCompanionSummary &&
      !showHermesPolicy
    ) {
      return null;
    }

    return (
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        {worker.bindingReason ? <p>{worker.bindingReason}</p> : null}
        {renderHermesWorkerPolicyBadges(
          worker,
          hermesFlags.hermesVisibilitySummaries
        )}
        {worker.runtimeType === "hermes_agent_gateway" &&
        hermesFlags.hermesProfileExperience ? (
          <p>
            Persona: {worker.personaDisplayLabel}.{" "}
            {worker.personaDisplayPurpose}
          </p>
        ) : null}
        {worker.runtimeType === "hermes_agent_gateway" &&
        hermesFlags.hermesChannelWorkflowExpansion ? (
          <p>
            Channel: {worker.channelDisplayLabel}. Memory sync:{" "}
            {worker.memorySyncDisplayLabel}.
          </p>
        ) : null}
        {worker.runtimeType === "hermes_agent_gateway" &&
        hermesFlags.hermesVisibilitySummaries ? (
          <p>LLM provider routing: {worker.providerRoutingDisplayLabel}.</p>
        ) : null}
        {channelCompanionSummary ? (
          <p>
            Channel companions: {channelCompanionSummary}. Hermes keeps the live
            channel tokens and sessions; SmartAIHub only stores the companion
            metadata.
          </p>
        ) : null}
      </div>
    );
  };

  const applyTeamBlueprint = (blueprintId: string) => {
    const blueprint = TEAM_BLUEPRINTS.find(item => item.id === blueprintId);
    if (!blueprint) {
      toast.error(t("teams.error.blueprintNotFound"));
      return;
    }

    const assistantDrafts = instantiateBlueprintAssistantDrafts(
      blueprint,
      (personas ?? []) as Array<{
        id: string;
        name: string;
        sourceTemplateIds?: string[] | null;
        tone?: string | null;
      }>
    );

    setNewTeamName(blueprint.defaultTeamName);
    setNewTeamDescription(blueprint.defaultTeamDescription);
    setNewTeamCategory(blueprint.category);
    setCreateTeamCategoryMode("preset");
    setNewTeamMembers(assistantDrafts);
    setCreateMemberKind("assistant");
    setCreateMemberRole("specialist");
    setNewMemberPersonaId(undefined);
    setCreateTeamSectionsOpen({
      presets: false,
      details: true,
      composer: false,
    });
    toast.success(t("teams.toast.blueprintLoaded", { name: blueprint.name }));
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || newTeamMembers.length === 0) return;
    const hasLead = newTeamMembers.some(
      m => m.memberKind === "assistant" && m.isLead
    );
    if (!hasLead) {
      toast.error(t("teams.error.leadRequired"));
      return;
    }
    const assistantOrchestratorCount = newTeamMembers.filter(
      m => m.memberKind === "assistant" && m.memberRole === "orchestrator"
    ).length;
    if (assistantOrchestratorCount > 1) {
      toast.error(t("teams.error.orchestratorLimit"));
      return;
    }

    try {
      await createTeamMutation.mutateAsync({
        name: newTeamName.trim(),
        description: newTeamDescription.trim() || undefined,
        category: newTeamCategory.trim() || undefined,
        members: newTeamMembers.map(m => ({
          memberKind: m.memberKind,
          memberRole: m.memberRole,
          personaId: m.personaId,
          blueprintId: m.memberKind === "assistant" ? m.blueprintId : undefined,
          blueprintMemberId:
            m.memberKind === "assistant" ? m.blueprintMemberId : undefined,
          humanUserId: m.humanUserId,
          externalRef: m.externalRef,
          externalWorkerId: m.externalWorkerId ?? undefined,
          externalConfigJson: m.externalConfigJson,
          displayName: m.displayName,
          roleTitle: m.roleTitle,
          specialtyTags: m.specialtyTags,
          instructions:
            m.memberKind === "assistant"
              ? m.instructions || t("teams.manage.defaultInstructions")
              : undefined,
          isLead: m.isLead,
        })),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("teams.error.createTeamFailed")
      );
    }
  };

  const addMember = (personaId: string) => {
    const persona = personas?.find((p: any) => p.id === personaId);
    if (!persona) return;
    const memberKey = getDraftMemberKey({ memberKind: "assistant", personaId });
    if (newTeamMembers.some(m => m.memberKey === memberKey)) return;
    setNewTeamMembers(prev => [
      ...prev,
      {
        memberKey,
        memberKind: "assistant",
        memberRole: !prev.some(
          member =>
            member.memberKind === "assistant" &&
            member.memberRole === "orchestrator"
        )
          ? "orchestrator"
          : createMemberRole,
        personaId,
        blueprintId: undefined,
        blueprintMemberId: undefined,
        personaBlueprint: undefined,
        reusedPersonaName: undefined,
        displayName: persona.name,
        instructions:
          persona.systemPromptPrefix ?? t("teams.manage.defaultInstructions"),
        isLead: !prev.some(
          member => member.memberKind === "assistant" && member.isLead
        ),
      },
    ]);
    setNewMemberPersonaId(undefined);
  };

  const removeMember = (memberKey: string) => {
    setNewTeamMembers(prev => prev.filter(m => m.memberKey !== memberKey));
  };

  const toggleLead = (memberKey: string) => {
    setNewTeamMembers(prev =>
      prev.map(m => ({
        ...m,
        isLead:
          m.memberKind === "assistant"
            ? m.memberKey === memberKey
              ? !m.isLead
              : false
            : false,
      }))
    );
  };

  const filteredTeams = teams.filter((team: any) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      team.name?.toLowerCase().includes(term) ||
      team.description?.toLowerCase().includes(term) ||
      team.category?.toLowerCase().includes(term) ||
      getTeamCategoryLabel(team.category).toLowerCase().includes(term)
    );
  });
  const availablePersonas = (personas ?? []).filter(
    (p: any) =>
      !newTeamMembers.some(
        m => m.memberKind === "assistant" && m.personaId === p.id
      )
  );
  const hasAnyPersonas = (personas?.length ?? 0) > 0;
  const assistantMemberCount = newTeamMembers.filter(
    member => member.memberKind === "assistant"
  ).length;
  const humanMemberCount = newTeamMembers.filter(
    member => member.memberKind === "human"
  ).length;
  const connectorMemberCount = newTeamMembers.filter(
    member => member.memberKind === "external_connector"
  ).length;
  const leadMember =
    newTeamMembers.find(
      member => member.memberKind === "assistant" && member.isLead
    ) ?? null;
  const getTeamCategoryLabel = (value: string | null | undefined) => {
    switch (value) {
      case "creative":
        return t("teams.category.creative");
      case "research":
        return t("teams.category.research");
      case "engineering":
        return t("teams.category.engineering");
      case "presentation":
        return t("teams.category.presentation");
      case "operations":
        return t("teams.category.operations");
      case "support":
        return t("teams.category.support");
      default:
        return value?.trim() || t("teams.category.none");
    }
  };
  const getMemberKindLabel = (value: DraftMemberKind) => {
    switch (value) {
      case "assistant":
        return t("teams.memberKind.assistant.label");
      case "human":
        return t("teams.memberKind.human.label");
      case "external_connector":
        return t("teams.memberKind.external.label");
    }
  };
  const getMemberKindDescription = (value: DraftMemberKind) => {
    switch (value) {
      case "assistant":
        return t("teams.memberKind.assistant.description");
      case "human":
        return t("teams.memberKind.human.description");
      case "external_connector":
        return t("teams.memberKind.external.description");
    }
  };
  const getMemberRoleLabel = (
    value: TeamMemberRole | string | null | undefined
  ) => {
    switch (value) {
      case "orchestrator":
        return t("teams.role.orchestrator");
      case "researcher":
        return t("teams.role.researcher");
      case "reviewer":
        return t("teams.role.reviewer");
      case "publisher":
        return t("teams.role.publisher");
      case "specialist":
        return t("teams.role.specialist");
      default:
        return t("teams.role.default");
    }
  };
  const getRoomTypeLabel = (
    value: CreateRoomState["roomType"] | string | null | undefined
  ) => {
    switch (value) {
      case "team":
        return t("teams.roomType.team");
      case "auto_team":
        return t("teams.roomType.autoTeam");
      case "direct":
        return t("teams.roomType.direct");
      case "job_review":
        return t("teams.roomType.jobReview");
      default:
        return value ?? t("teams.roomType.team");
    }
  };
  const getRoomTypeDescription = (
    value: CreateRoomState["roomType"] | string | null | undefined
  ) => {
    switch (value) {
      case "auto_team":
        return t("teams.roomType.description.autoTeam");
      case "job_review":
        return t("teams.roomType.description.jobReview");
      case "direct":
        return t("teams.roomType.description.directLegacy");
      case "team":
      default:
        return t("teams.roomType.description.team");
    }
  };
  const getRoomTypeDefaultModeLabel = (
    value: CreateRoomState["roomType"] | string | null | undefined
  ) =>
    value === "auto_team"
      ? t("teams.roomType.defaultMode.autoTeam")
      : t("teams.roomType.defaultMode.team");
  const getExecutionModeLabel = (value: "team_chat" | "auto_team") =>
    value === "auto_team"
      ? t("teams.run.mode.autoTeam")
      : t("teams.run.mode.teamChat");
  const getExecutionModeDescription = (value: "team_chat" | "auto_team") =>
    value === "auto_team"
      ? t("teams.run.modeDescription.autoTeam")
      : t("teams.run.modeDescription.teamChat");
  const getRoomStatusLabel = (value: string | null | undefined) => {
    switch (value) {
      case "active":
        return t("teams.roomStatus.active");
      case "paused":
        return t("teams.roomStatus.paused");
      case "archived":
        return t("teams.roomStatus.archived");
      default:
        return value ?? t("teams.roomStatus.active");
    }
  };

  const handleQuickPersonaCreate = () => {
    if (quickPersonaForm.sourceTemplateIds.length === 0) {
      toast.error(t("teams.error.personaTemplateRequired"));
      return;
    }
    if (!quickPersonaForm.name.trim()) {
      toast.error(t("teams.error.personaNameRequired"));
      return;
    }

    createPersonaMutation.mutate({
      ...buildPersonaMutationFields(quickPersonaForm),
      scope: "user",
    });
  };

  const renderQuickPersonaBuilder = (helperText: string) => (
    <div className="rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {t("teams.create.quickPersonaTitle")}
          </p>
          <p className="text-xs text-muted-foreground">{helperText}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowQuickPersonaForm(prev => !prev)}
        >
          {showQuickPersonaForm
            ? t("teams.create.hidePersonaBuilder")
            : t("teams.create.createPersona")}
        </Button>
      </div>
      {showQuickPersonaForm && (
        <div className="mt-3 space-y-4">
          <PersonaEditorFields
            form={quickPersonaForm}
            setForm={setQuickPersonaForm}
            editorMode="create"
            analyticsSurface="teams_personas"
            defaultShowTemplates
            defaultShowAdvanced={false}
            requireTemplate
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={resetQuickPersonaForm}
            >
              {t("teams.create.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleQuickPersonaCreate}
              disabled={
                quickPersonaForm.sourceTemplateIds.length === 0 ||
                !quickPersonaForm.name.trim() ||
                createPersonaMutation.isPending
              }
            >
              {createPersonaMutation.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {t("teams.create.savePersona")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const renderMemberKindBadge = (
    memberKind: NewMemberEntry["memberKind"] | string | null | undefined
  ) => {
    if (memberKind === "human") {
      return (
        <Badge variant="secondary">{t("teams.memberKind.human.short")}</Badge>
      );
    }
    if (memberKind === "external_connector") {
      return (
        <Badge variant="outline">{t("teams.memberKind.external.short")}</Badge>
      );
    }
    return <Badge>{t("teams.memberKind.assistant.short")}</Badge>;
  };

  const renderMemberRoleBadge = (
    memberRole: TeamMemberRole | string | null | undefined
  ) => <Badge variant="outline">{getMemberRoleLabel(memberRole)}</Badge>;

  const renderMemberKindIcon = (
    memberKind: NewMemberEntry["memberKind"] | string | null | undefined
  ) => {
    if (memberKind === "human") return <UserRound className="h-4 w-4" />;
    if (memberKind === "external_connector") return <Bot className="h-4 w-4" />;
    return <UsersRound className="h-4 w-4" />;
  };

  const availableExistingPersonas = (personas ?? []).filter(
    (p: any) =>
      !teamDetail?.members?.some(
        (m: any) => m.memberKind === "assistant" && m.personaId === p.id
      )
  );

  const roomPanelTabs = [
    { id: "chat" as const, label: t("teams.page.tab.chat") },
    { id: "workflow" as const, label: t("teams.page.tab.workflow") },
    { id: "run" as const, label: t("teams.page.tab.run") },
  ];

  const handleCreateRoom = () => {
    if (!createRoomDialog || !createRoomDialog.goalPrompt.trim()) return;
    const normalizedRoomType = normalizeCreatableRoomType(
      createRoomDialog.roomType
    );
    createRoomMutation.mutate({
      teamId: createRoomDialog.teamId,
      roomType: normalizedRoomType,
      goalPrompt: createRoomDialog.goalPrompt,
      language: createRoomDialog.language,
    });
  };

  const renderRoomSidebarSections = () => (
    <>
      <RoomSidebarSection
        title={t("teams.rooms.sidebar.title")}
        subtitle={t("teams.rooms.sidebar.subtitle")}
        open={roomSidebarSectionsOpen.context}
        onOpenChange={open =>
          setRoomSidebarSectionsOpen(prev => ({
            ...prev,
            context: open,
          }))
        }
        summary={
          <Badge
            variant="outline"
            className="border-sky-200 bg-sky-50 text-[10px] text-sky-700"
          >
            {getRoomLanguageLabel(selectedRoom?.language)}
          </Badge>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-sky-200 bg-sky-50 text-[11px] text-sky-700"
          >
            {getRoomTypeLabel(selectedRoom?.roomType ?? selectedRoomType)}
          </Badge>
          <Badge variant="secondary" className="text-[11px]">
            {selectedRoomAutonomyLabel}
          </Badge>
          {selectedRoomRunModeLabel && (
            <Badge
              variant="outline"
              className="border-violet-200 bg-violet-50 text-[11px] text-violet-700"
            >
              {selectedRoomRunModeLabel}
            </Badge>
          )}
        </div>
        <div className="mt-3 grid gap-2">
          <div className="rounded-xl border bg-slate-50/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {t("teams.rooms.sidebar.roomId")}
            </div>
            <div className="mt-1 truncate text-sm font-medium text-slate-900">
              {selectedRoomIdForView}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border bg-slate-50/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {t("teams.rooms.sidebar.createdAt")}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {formatRoomCreatedAt(selectedRoom?.createdAt)}
              </div>
            </div>
            <div className="rounded-xl border bg-slate-50/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {t("teams.rooms.sidebar.language")}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {getRoomLanguageLabel(selectedRoom?.language)}
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-slate-50/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {t("teams.rooms.sidebar.currentObjective")}
            </div>
            <div className="mt-1 line-clamp-3 text-sm font-medium text-slate-900">
              {selectedRoomCurrentObjective}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border bg-slate-50/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {t("teams.rooms.sidebar.runMode")}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {selectedRoomRunModeLabel}
              </div>
            </div>
            <div className="rounded-xl border bg-slate-50/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {t("teams.rooms.sidebar.runStatus")}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {runStatus}
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-slate-50/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {t("teams.rooms.sidebar.currentPhase")}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-900">
              {selectedRoomCurrentPhase ??
                t("teams.rooms.sidebar.noCurrentPhase")}
            </div>
            {selectedRoomWaitingReason && (
              <div className="mt-1 text-xs text-slate-600">
                {selectedRoomWaitingReason}
              </div>
            )}
          </div>
        </div>
      </RoomSidebarSection>

      <RoomSidebarSection
        title="Context engine"
        subtitle="Freshness, grounding, retrieval, and token-pressure metrics for the active room"
        open={roomSidebarSectionsOpen.contextEngine}
        onOpenChange={open =>
          setRoomSidebarSectionsOpen(prev => ({
            ...prev,
            contextEngine: open,
          }))
        }
        summary={
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              contextEngineHealthQuery.data?.latest?.status === "critical"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : contextEngineHealthQuery.data?.latest?.status === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
            )}
          >
            {contextEngineHealthQuery.data?.latest?.status ?? "n/a"}
          </Badge>
        }
        className="flex min-h-0 flex-col overflow-hidden"
      >
        <ContextEngineHealthPanel
          summary={contextEngineHealthQuery.data ?? null}
          loading={contextEngineHealthQuery.isLoading}
          error={
            contextEngineHealthQuery.error?.message ??
            null
          }
          scopeLabel="Current room"
          emptyMessage="No context-engine metrics have been recorded for this room yet."
        />
      </RoomSidebarSection>

      <div
        ref={workflowPanelRef}
        className={cn(
          "min-h-0",
          highlightWorkflowPanel && "ring-2 ring-teal-300 ring-offset-2"
        )}
      >
        <RoomSidebarSection
          title={t("teams.rooms.sidebar.workflowTitle")}
          subtitle={t("teams.rooms.sidebar.workflowSubtitle")}
          open={roomSidebarSectionsOpen.workflow}
          onOpenChange={open =>
            setRoomSidebarSectionsOpen(prev => ({
              ...prev,
              workflow: open,
            }))
          }
          summary={
            <Badge variant="outline" className="text-[10px]">
              {selectedRoomCurrentPhase ??
                t("teams.rooms.sidebar.noCurrentPhase")}
            </Badge>
          }
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <RoomWorkflowPanel
            roomId={selectedRoomIdForView!}
            runId={activeRunId ?? undefined}
            roomType={selectedRoom?.roomType ?? selectedRoomType}
            roomGoal={selectedRoom?.goalPrompt}
            runtimeState={activeRunRuntimeState}
            runStatus={runStatus as any}
            runStatusReason={activeRunStatusReason}
            onResumeRun={() =>
              activeRunId && resumeRunMutation.mutate({ runId: activeRunId })
            }
            onChooseExplorationCandidate={handleChooseExplorationCandidate}
            onRejectExplorationCandidates={handleRejectExplorationCandidates}
            onApproveFinalResult={handleApproveFinalResult}
            onRejectFinalResult={handleRejectFinalResult}
            onFocusThread={(messageId, options) =>
              setFocusMessageRequest({
                messageId,
                nonce: Date.now(),
                workItemId: options?.workItemId,
                composeReply: options?.composeReply,
                messageAnchorId: options?.messageAnchorId ?? null,
              })
            }
            runControlsBusy={runControlsBusy}
            className="min-h-0 flex-1 border-l-0 border-t-0"
            teamMembers={(teamDetail?.members ?? []).map((member: any) => ({
              id: member.id,
              displayName: member.displayName,
              memberKind: member.memberKind,
              memberRole: member.memberRole,
              isLead: member.isLead,
            }))}
          />
        </RoomSidebarSection>
      </div>

      {activeRunSectionVisible && (
        <RoomSidebarSection
          title={t("teams.rooms.sidebar.runMonitorTitle")}
          subtitle={t("teams.rooms.sidebar.runMonitorSubtitle")}
          open={roomSidebarSectionsOpen.run}
          onOpenChange={open =>
            setRoomSidebarSectionsOpen(prev => ({
              ...prev,
              run: open,
            }))
          }
          summary={
            <Badge variant="outline" className="text-[10px]">
              {runStatus}
            </Badge>
          }
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <RunMonitorPanel
            runId={activeRunId!}
            teamName={selectedTeam?.name}
            runStatus={runStatus as any}
            runStatusReason={activeRunStatusReason}
            statusBridge={(activeRunDetail as any)?.statusBridge ?? null}
            agents={(teamDetail?.members ?? [])
              .filter((m: any) => m.memberKind === "assistant")
              .map((m: any) => ({
                id: m.agencyAgentId ?? m.id,
                displayName: m.displayName,
                isLead: m.isLead ?? false,
              }))}
            onStartNewRun={
              allowManualRunStart ? openStartRunDialog : undefined
            }
            onPause={() => pauseRunMutation.mutate({ runId: activeRunId! })}
            onResume={() => resumeRunMutation.mutate({ runId: activeRunId! })}
            onAdvanceRun={maxTurns =>
              advanceRunMutation.mutate({
                runId: activeRunId!,
                maxTurns,
              })
            }
            onStop={() =>
              stopRunMutation.mutate({
                runId: activeRunId!,
                reason: "user_requested",
              })
            }
            controlsBusy={runControlsBusy}
            className="border-l-0"
          />
        </RoomSidebarSection>
      )}
    </>
  );

  if (authLoading) return null;

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] min-h-0 w-full overflow-hidden bg-background">
      {isCompactViewport && sidebarOpen && (
        <button
          type="button"
          aria-label={t("teams.page.closeSidebar")}
          className="absolute inset-0 z-20 bg-slate-950/20 backdrop-blur-[1px]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "flex h-full flex-col border-r bg-background transition-all duration-200",
          isCompactViewport
            ? "absolute inset-y-0 left-0 z-30 w-[min(22rem,calc(100vw-1rem))] max-w-full shadow-2xl"
            : "relative shrink-0",
          isCompactViewport
            ? sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full"
            : sidebarOpen
              ? "w-80"
              : "w-0 overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setLocation("/dashboard")}
              title={t("teams.page.backToDashboard")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <UsersRound className="h-5 w-5" />
            <h2 className="font-semibold">{t("teams.page.title")}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarOpen(false)}
              title={t("teams.page.closeSidebar")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Open workpack discovery"
              onClick={() =>
                setLocation(
                  buildWorkpackEntrypointHref({
                    entrypoint: "teams",
                    surface: "discovery",
                  })
                )
              }
            >
              <Bot className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCreateTeamOpen(true)}
              title={t("teams.create.title")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("teams.page.searchPlaceholder")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Team list */}
        <ScrollArea className="flex-1">
          {teamsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {search
                ? t("teams.page.noTeamsFound")
                : t("teams.page.noTeamsYet")}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 px-2 py-1">
              {filteredTeams.map((team: any) => (
                <button
                  key={team.id}
                  onClick={() => {
                    setSelectedTeamId(team.id);
                    setSelectedRoomId(null);
                    if (isCompactViewport) setSidebarOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm transition-colors hover:border-slate-200 hover:bg-slate-50",
                    team.id === selectedTeamIdForView &&
                      "border-sky-200 bg-sky-50 shadow-sm hover:border-sky-200 hover:bg-sky-50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700",
                      team.id === selectedTeamIdForView &&
                        "bg-sky-100 text-sky-700"
                    )}
                  >
                    <UsersRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "truncate font-medium text-slate-900",
                          team.id === selectedTeamIdForView && "text-sky-950"
                        )}
                      >
                        {team.name}
                      </div>
                      {team.category && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 border-slate-200 bg-white text-[10px] text-slate-700",
                            team.id === selectedTeamIdForView &&
                              "border-sky-200 bg-sky-100 text-sky-800"
                          )}
                        >
                          {getTeamCategoryLabel(team.category)}
                        </Badge>
                      )}
                    </div>
                    <div
                      className={cn(
                        "truncate text-xs text-slate-500",
                        team.id === selectedTeamIdForView && "text-sky-700"
                      )}
                    >
                      {t("teams.page.teamCounts", {
                        members: team.memberCount ?? 0,
                        rooms: team.roomCount ?? 0,
                      })}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-2 border-b px-4 py-2">
          {!sidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              title={t("teams.page.openSidebar")}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          {sidebarOpen && !isCompactViewport && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              title={t("teams.page.closeSidebar")}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          {selectedTeam && (
            <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {selectedRoomIdForView && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearRoomSelection}
                    title={t("teams.rooms.backToRoomList")}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {t("teams.rooms.backToRoomList")}
                  </Button>
                )}
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{selectedTeam.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedTeam.description ?? ""}
                  </p>
                </div>
              </div>
              <div className="ml-auto flex shrink-0 gap-2">
                <LocaleToggle className="hidden sm:inline-flex" />
                {canStopAutomationRun && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100 hover:text-red-800"
                    onClick={() =>
                      activeRunId &&
                      stopRunMutation.mutate({
                        runId: activeRunId,
                        reason: "user_requested",
                      })
                    }
                    disabled={runControlsBusy}
                    title={t("teams.run.stopAutomation")}
                  >
                    <StopCircle className="mr-1 h-4 w-4" />
                    {t("teams.run.stopAutomation")}
                  </Button>
                )}
                {!selectedRoomIdForView && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCreateRoomDialog({
                        teamId: selectedTeam.id,
                        goalPrompt: "",
                        roomType: "team",
                        language: "en",
                      })
                    }
                  >
                    <MessageSquare className="mr-1 h-4 w-4" />
                    New Room
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    archiveMutation.mutate({ teamId: selectedTeam.id })
                  }
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {requestedRoomMissing ? (
            <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800 shadow-sm">
              Deep-link room was not resolved yet. Showing team view.
            </div>
          ) : null}
          {!selectedTeamIdForView ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <UsersRound className="h-12 w-12 opacity-30" />
              <p className="text-lg font-medium">
                {teams.length === 0
                  ? t("teams.page.noTeamsYet")
                  : t("teams.page.selectTeam")}
              </p>
              <p className="text-sm">
                {teams.length === 0
                  ? t("teams.page.emptyCta")
                  : t("teams.page.selectTeamHint")}
              </p>
              {teams.length === 0 && (
                <Button onClick={() => setCreateTeamOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t("teams.create.title")}
                </Button>
              )}
            </div>
          ) : selectedRoomIdForView ? (
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              <div className="border-b bg-slate-50/60 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {t("teams.rooms.title")}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t("teams.rooms.openRoomHint")}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[11px]">
                        {latestTeamRoomId === selectedRoomIdForView
                          ? t("rooms.latestBadge")
                          : t("rooms.selectedBadge")}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">
                        {getRoomTypeLabel(
                          selectedRoom?.roomType ?? selectedRoomType
                        )}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-sky-200 bg-sky-50 text-[11px] text-sky-700"
                      >
                        {getRoomLanguageLabel(selectedRoom?.language)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs sm:justify-center"
                      onClick={clearRoomSelection}
                    >
                      {t("teams.rooms.backToRoomList")}
                    </Button>
                    <Select
                      value={selectedRoomIdForView}
                      onValueChange={selectRoom}
                    >
                      <SelectTrigger className="w-full sm:w-[24rem]">
                        <SelectValue placeholder={t("teams.rooms.title")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(orderedTeamRooms ?? []).map((room: any) => (
                          <SelectItem key={room.id} value={room.id}>
                            {`${getRoomTypeLabel(room.roomType)} · ${getRoomLanguageLabel(room.language)} · ${formatRoomCreatedAt(room.createdAt)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {((isCompactViewport || useSinglePanelLayout) &&
                !showAutoTeamPlanSidebar) && (
                <div className="border-b bg-slate-50/80 px-4 py-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-slate-700">
                      {t("teams.page.tab.help")}
                    </div>
                    {isCompactViewport && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 px-2 text-xs"
                        onClick={() => setSidebarOpen(true)}
                      >
                        <Menu className="mr-1 h-4 w-4" />
                        {t("teams.page.openSidebar")}
                      </Button>
                    )}
                  </div>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {roomPanelTabs.map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveRoomPanel(tab.id)}
                        className={cn(
                          "min-w-[8.5rem] shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                          activeRoomPanel === tab.id
                            ? "border-sky-300 bg-sky-100 text-sky-950 shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                className={cn(
                  "flex min-h-0 flex-1 overflow-hidden",
                  isCompactViewport ? "flex-col" : "xl:flex-row"
                )}
              >
                {(showAutoTeamPlanSidebar ||
                  (useSinglePanelLayout
                    ? activeRoomPanel === "chat"
                    : !isCompactViewport || activeRoomPanel === "chat")) && (
                  <div className="min-h-0 flex-1">
                    <TeamRoomView
                      roomId={selectedRoomIdForView!}
                      teamId={selectedTeamIdForView}
                      runId={activeRunId ?? undefined}
                      teamName={selectedTeam?.name}
                      roomGoal={selectedRoom?.goalPrompt}
                      roomLanguage={selectedRoomLanguage}
                      roomCreatedAt={selectedRoom?.createdAt}
                      roomType={selectedRoom?.roomType ?? null}
                      roomAutonomy={selectedRoomAutonomyLabel}
                      runMode={selectedRoomRunModeLabel}
                      selectedSkillId={
                        (
                          activeRunRuntimeState as {
                            selectedSkillId?: string | null;
                          } | null
                        )?.selectedSkillId ?? null
                      }
                      routeReason={
                        (
                          activeRunRuntimeState as {
                            routeReason?: string | null;
                          } | null
                        )?.routeReason ?? null
                      }
                      runStatus={runStatus as any}
                      runStatusReason={activeRunStatusReason}
                      focusMessageRequest={focusMessageRequest}
                      actors={(teamDetail?.members ?? []).map(
                        (member: any) => ({
                          id: member.id,
                          displayName: member.displayName,
                          memberKind: member.memberKind,
                          memberRole: member.memberRole,
                          humanUserId: member.humanUserId ?? null,
                          isLead: member.isLead ?? false,
                        })
                      )}
                      onStartRun={
                        allowManualRunStart ? openStartRunDialog : undefined
                      }
                      onPauseRun={() =>
                        activeRunId &&
                        pauseRunMutation.mutate({ runId: activeRunId })
                      }
                      onResumeRun={() =>
                        activeRunId &&
                        resumeRunMutation.mutate({ runId: activeRunId })
                      }
                      onAdvanceRun={maxTurns =>
                        activeRunId &&
                        advanceRunMutation.mutate({
                          runId: activeRunId,
                          maxTurns,
                        })
                      }
                      onStopRun={() =>
                        activeRunId &&
                        stopRunMutation.mutate({
                          runId: activeRunId,
                          reason: "user_requested",
                        })
                      }
                      runControlsBusy={runControlsBusy}
                      onSendMessage={input =>
                        sendMessageMutation.mutate({
                          roomId: selectedRoomIdForView,
                          autoRespond:
                            (selectedRoom?.roomType ?? "team") !== "auto_team",
                          ...input,
                        })
                      }
                    />
                  </div>
                )}

                {(showAutoTeamPlanSidebar ||
                  (useSinglePanelLayout
                    ? activeRoomPanel === "workflow"
                    : !isCompactViewport || activeRoomPanel === "workflow")) &&
                  (showAutoTeamPlanSidebar ? (
                    <div
                      ref={workflowPanelRef}
                      data-testid="auto-team-plan-sidebar"
                      className={cn(
                        "relative flex min-h-0 shrink-0 flex-col overflow-hidden border-l bg-muted/20 transition-[width] duration-200 ease-out",
                        highlightWorkflowPanel &&
                          "ring-2 ring-teal-300 ring-offset-2"
                      )}
                      style={{
                        width: autoTeamPlanSidebarCollapsed
                          ? AUTO_TEAM_PLAN_SIDEBAR_COLLAPSED_WIDTH
                          : autoTeamPlanSidebarWidth,
                        minWidth: autoTeamPlanSidebarCollapsed
                          ? AUTO_TEAM_PLAN_SIDEBAR_COLLAPSED_WIDTH
                          : autoTeamPlanSidebarWidth,
                      }}
                    >
                      {autoTeamPlanSidebarCollapsed ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 px-2 py-4">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full border-sky-200 bg-white text-sky-700 shadow-sm"
                            onClick={() => setAutoTeamPlanSidebarCollapsed(false)}
                            title={t("teams.rooms.sidebar.expandPlanPanel")}
                            data-testid="auto-team-plan-expand-button"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <div className="select-none text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 [writing-mode:vertical-rl] rotate-180">
                            {t("teams.rooms.sidebar.planPanelCollapsed")}
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={t("teams.rooms.sidebar.resizePlanPanel")}
                            className="absolute left-0 top-0 z-20 h-full w-2 cursor-ew-resize touch-none bg-transparent hover:bg-sky-200/30"
                            onMouseDown={handleAutoTeamPlanSidebarResizeMouseDown}
                            data-testid="auto-team-plan-resize-handle"
                          />
                          <div className="border-b bg-slate-50/70 px-4 py-3 pl-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900">
                                  {t("teams.rooms.sidebar.planPanelTitle")}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {t("teams.rooms.sidebar.planPanelSubtitle")}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  onClick={collapseAllRoomSidebarSections}
                                >
                                  {t("teams.rooms.sidebar.collapseAll")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  onClick={expandAllRoomSidebarSections}
                                >
                                  {t("teams.rooms.sidebar.expandAll")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                                  onClick={() =>
                                    setAutoTeamPlanSidebarCollapsed(true)
                                  }
                                  title={t("teams.rooms.sidebar.collapsePlanPanel")}
                                  data-testid="auto-team-plan-collapse-button"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          <div className="border-b border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="border-sky-200 bg-sky-50 text-[10px] text-sky-700"
                                  >
                                    {t("teams.rooms.sidebar.pinnedObjective")}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px]">
                                    {selectedRoomCurrentPhase ??
                                      t("teams.rooms.sidebar.noCurrentPhase")}
                                  </Badge>
                                </div>
                                <div className="mt-2 text-sm font-semibold text-slate-900">
                                  {selectedRoomCurrentObjective}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {selectedRoomRunModeLabel}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 text-xs"
                                onClick={() =>
                                  setAutoTeamPlanObjectiveOpen(open => !open)
                                }
                                data-testid="auto-team-plan-objective-toggle"
                              >
                                {autoTeamPlanObjectiveOpen
                                  ? t("teams.rooms.sidebar.hideObjective")
                                  : t("teams.rooms.sidebar.openObjective")}
                                <ChevronDown
                                  className={cn(
                                    "ml-1 h-4 w-4 transition-transform",
                                    autoTeamPlanObjectiveOpen && "rotate-180"
                                  )}
                                />
                              </Button>
                            </div>

                            {autoTeamPlanObjectiveOpen && (
                              <div
                                data-testid="auto-team-plan-objective-details"
                                className="mt-3 grid gap-2 sm:grid-cols-3"
                              >
                                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                    {t("teams.rooms.sidebar.currentObjective")}
                                  </div>
                                  <div className="mt-1 line-clamp-3 text-sm font-medium text-slate-900">
                                    {selectedRoomCurrentObjective}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                    {t("teams.rooms.sidebar.currentPhase")}
                                  </div>
                                  <div className="mt-1 text-sm font-medium text-slate-900">
                                    {selectedRoomCurrentPhase ??
                                      t("teams.rooms.sidebar.noCurrentPhase")}
                                  </div>
                                  {selectedRoomWaitingReason && (
                                    <div className="mt-1 text-xs text-slate-600">
                                      {selectedRoomWaitingReason}
                                    </div>
                                  )}
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                    {t("teams.rooms.sidebar.autonomy")}
                                  </div>
                                  <div className="mt-1 text-sm font-medium text-slate-900">
                                    {selectedRoomAutonomyLabel}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-600">
                                    {selectedRoomRunModeLabel}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/30 p-3">
                            <div className="space-y-3">
                              {renderRoomSidebarSections()}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (isCompactViewport || useSinglePanelLayout ? (
                    <div
                      ref={workflowPanelRef}
                      className={cn(
                        "flex min-h-0 flex-1 flex-col overflow-hidden",
                        highlightWorkflowPanel &&
                          "ring-2 ring-teal-300 ring-offset-2"
                      )}
                    >
                      <div className="border-b bg-slate-50/70 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">
                              {t("teams.rooms.sidebar.title")}
                            </div>
                            <div className="text-xs text-slate-500">
                              {t("teams.rooms.sidebar.subtitle")}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={collapseAllRoomSidebarSections}
                            >
                              {t("teams.rooms.sidebar.collapseAll")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={expandAllRoomSidebarSections}
                            >
                              {t("teams.rooms.sidebar.expandAll")}
                            </Button>
                            <Badge
                              variant="outline"
                              className="border-sky-200 bg-sky-50 text-[11px] text-sky-700"
                            >
                              {getRoomTypeLabel(
                                selectedRoom?.roomType ?? selectedRoomType
                              )}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/30 p-3">
                        <div className="space-y-3">
                          {renderRoomSidebarSections()}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      ref={workflowPanelRef}
                      className={cn(
                        "flex min-h-0 w-[26rem] min-w-[26rem] shrink-0 flex-col overflow-hidden",
                        highlightWorkflowPanel &&
                          "ring-2 ring-teal-300 ring-offset-2"
                      )}
                    >
                      <div className="border-b bg-slate-50/70 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">
                              {t("teams.rooms.sidebar.title")}
                            </div>
                            <div className="text-xs text-slate-500">
                              {t("teams.rooms.sidebar.subtitle")}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={collapseAllRoomSidebarSections}
                            >
                              {t("teams.rooms.sidebar.collapseAll")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={expandAllRoomSidebarSections}
                            >
                              {t("teams.rooms.sidebar.expandAll")}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/30 p-3">
                        <div className="space-y-3">
                          {renderRoomSidebarSections()}
                        </div>
                      </div>
                    </div>
                  )))}

                {(isCompactViewport || useSinglePanelLayout) &&
                  activeRoomPanel === "run" &&
                  (activeRunId ? (
                    <div className="min-h-0 flex-1">
                      <RunMonitorPanel
                        runId={activeRunId}
                        teamName={selectedTeam?.name}
                        runStatus={runStatus as any}
                        runStatusReason={activeRunStatusReason}
                        statusBridge={
                          (activeRunDetail as any)?.statusBridge ?? null
                        }
                        agents={(teamDetail?.members ?? [])
                          .filter((m: any) => m.memberKind === "assistant")
                          .map((m: any) => ({
                            id: m.agencyAgentId ?? m.id,
                            displayName: m.displayName,
                            isLead: m.isLead ?? false,
                          }))}
                        onStartNewRun={
                          allowManualRunStart ? openStartRunDialog : undefined
                        }
                        onPause={() =>
                          pauseRunMutation.mutate({ runId: activeRunId })
                        }
                        onResume={() =>
                          resumeRunMutation.mutate({ runId: activeRunId })
                        }
                        onAdvanceRun={maxTurns =>
                          advanceRunMutation.mutate({
                            runId: activeRunId,
                            maxTurns,
                          })
                        }
                        onStop={() =>
                          stopRunMutation.mutate({
                            runId: activeRunId,
                            reason: "user_requested",
                          })
                        }
                        controlsBusy={runControlsBusy}
                        className="border-l-0"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-6">
                      <div className="w-full max-w-md rounded-2xl border bg-white px-6 py-8 text-center shadow-sm">
                        <p className="text-sm font-semibold text-slate-900">
                          {t("orchestrator.room.noActiveRun")}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {t("orchestrator.room.noActiveRunHelp")}
                        </p>
                        {allowManualRunStart ? (
                          <Button
                            type="button"
                            className="mt-4"
                            onClick={openStartRunDialog}
                          >
                            {t("orchestrator.common.startRun")}
                          </Button>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">
                            {t("orchestrator.room.waitingForActivity")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            /* Team detail — members + rooms */
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Members section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium">
                      {t("teams.manage.members")}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddMemberOpen(true)}
                    >
                      <UserPlus className="mr-1 h-4 w-4" />
                      {t("teams.manage.addMember")}
                    </Button>
                  </div>
                  {teamDetail?.members && teamDetail.members.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {teamDetail.members.map((member: any) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                            {renderMemberKindIcon(member.memberKind)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">
                                {member.displayName ??
                                  t("teams.manage.agentFallback")}
                              </span>
                              {member.isLead && (
                                <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                              )}
                              {renderMemberKindBadge(member.memberKind)}
                              {renderMemberRoleBadge(member.memberRole)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span>
                                {member.isLead
                                  ? t("teams.create.leadShort")
                                  : t("teams.manage.member")}
                                {member.roleTitle
                                  ? ` · ${member.roleTitle}`
                                  : ` · ${getMemberRoleLabel(member.memberRole)}`}
                              </span>
                              {member.memberKind === "human" &&
                                member.humanUserId && (
                                  <p>
                                    {t("teams.manage.linkedUserId", {
                                      id: member.humanUserId,
                                    })}
                                  </p>
                                )}
                              {member.memberKind === "external_connector" &&
                                member.externalRef && (
                                  <p className="truncate">
                                    {member.externalRef}
                                  </p>
                                )}
                              {member.memberKind === "external_connector" &&
                                member.externalWorkerId && (
                                  <div className="space-y-1">
                                    <p className="truncate">
                                      {(() => {
                                        const boundWorker =
                                          bindableWorkerMap.get(
                                            member.externalWorkerId
                                          );
                                        if (!boundWorker)
                                          return `Worker ${member.externalWorkerId}`;
                                        return formatBindableWorkerLabel(
                                          boundWorker,
                                          hermesFlags
                                        );
                                      })()}
                                    </p>
                                    {(() => {
                                      const boundWorker = bindableWorkerMap.get(
                                        member.externalWorkerId
                                      );
                                      return boundWorker
                                        ? renderHermesWorkerPolicyBadges(
                                            boundWorker,
                                            hermesFlags.hermesVisibilitySummaries
                                          )
                                        : null;
                                    })()}
                                  </div>
                                )}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() => openMemberEditor(member)}
                            title={t("teams.edit.title")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("teams.manage.noMembers")}
                    </p>
                  )}
                </div>

                {/* Rooms section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium">
                      {t("teams.rooms.title")}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCreateRoomDialog({
                          teamId: selectedTeamIdForView!,
                          goalPrompt: "",
                          roomType: "team",
                          language: "en",
                        })
                      }
                    >
                      <MessageSquare className="mr-1 h-4 w-4" />
                      {t("teams.rooms.newRoom")}
                    </Button>
                  </div>
                  {orderedTeamRooms && orderedTeamRooms.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {orderedTeamRooms.map((room: any) => {
                        const isLatestRoom = room.id === latestTeamRoomId;
                        const isSelectedRoom =
                          room.id === selectedRoomIdForView;
                        return (
                          <button
                            key={room.id}
                            type="button"
                            aria-pressed={isSelectedRoom}
                            onClick={() => selectRoom(room.id)}
                            data-testid={`team-room-card-${room.id}`}
                            className={cn(
                              "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent",
                              isSelectedRoom &&
                                "border-sky-300 bg-sky-50/70 shadow-sm",
                              isLatestRoom &&
                                !isSelectedRoom &&
                                "border-sky-200"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">
                                {getRoomTypeLabel(room.roomType)}
                              </span>
                              {isLatestRoom && (
                                <Badge
                                  variant="outline"
                                  className="border-sky-200 bg-sky-50 text-[11px] text-sky-700"
                                >
                                  {t("rooms.latestBadge")}
                                </Badge>
                              )}
                              {isSelectedRoom && (
                                <Badge
                                  variant="secondary"
                                  className="text-[11px]"
                                >
                                  {t("rooms.selectedBadge")}
                                </Badge>
                              )}
                              {isLegacyRoomType(room.roomType) && (
                                <Badge
                                  variant="outline"
                                  className="text-[11px]"
                                >
                                  {t("teams.rooms.legacyType")}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[11px]">
                                {getRoomLanguageLabel(room.language)}
                              </Badge>
                              <span
                                className={cn(
                                  "ml-auto rounded-full px-2 py-0.5 text-xs",
                                  room.status === "active"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-600"
                                )}
                              >
                                {getRoomStatusLabel(room.status)}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {getRoomTypeDescription(room.roomType)}
                            </p>
                            <p className="line-clamp-1 text-[11px] text-muted-foreground">
                              {t("teams.rooms.defaultRunModeLabel")}{" "}
                              {getRoomTypeDefaultModeLabel(room.roomType)}
                            </p>
                            <div
                              className="flex items-center gap-1 text-[11px] text-muted-foreground"
                              data-testid={`team-room-card-${room.id}-created-at`}
                            >
                              <Clock3 className="h-3 w-3" />
                              <span>
                                {t("rooms.createdAtLabel")}{" "}
                                {formatRoomCreatedAt(room.createdAt)}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {room.goalPrompt ?? t("teams.rooms.noObjective")}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                      <MessageSquare className="h-10 w-10 opacity-30" />
                      <p>{t("teams.rooms.noRooms")}</p>
                      <Button
                        onClick={() =>
                          setCreateRoomDialog({
                            teamId: selectedTeamIdForView!,
                            goalPrompt: "",
                            roomType: "team",
                            language: "en",
                          })
                        }
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        {t("teams.rooms.createFirstRoom")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Create Room Dialog */}
      <Dialog
        open={!!createRoomDialog}
        onOpenChange={open => !open && setCreateRoomDialog(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("teams.rooms.createDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("teams.rooms.roomTypeLabel")}
              </label>
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                {CREATABLE_ROOM_TYPES.map(roomType => {
                  const active =
                    normalizeCreatableRoomType(
                      createRoomDialog?.roomType ?? "team"
                    ) === roomType;
                  return (
                    <button
                      key={roomType}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setCreateRoomDialog(prev =>
                          prev ? { ...prev, roomType } : null
                        )
                      }
                      className={cn(
                        "min-h-[12rem] rounded-xl border p-4 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:bg-accent/50"
                      )}
                    >
                      <div className="flex flex-col items-start gap-2">
                        <span className="text-base font-medium leading-snug">
                          {getRoomTypeLabel(roomType)}
                        </span>
                        <Badge
                          variant={active ? "default" : "secondary"}
                          className="max-w-full whitespace-normal break-words px-2 py-1 text-[11px] leading-snug"
                        >
                          {getRoomTypeDefaultModeLabel(roomType)}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {getRoomTypeDescription(roomType)}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("teams.rooms.roomTypeHelp")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("teams.rooms.legacyTypesNote")}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("teams.rooms.languageLabel")}
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { value: "en" as const, label: "English" },
                  { value: "th" as const, label: "ไทย" },
                ].map(option => {
                  const active =
                    (createRoomDialog?.language ?? "en") === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setCreateRoomDialog(prev =>
                          prev ? { ...prev, language: option.value } : null
                        )
                      }
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:bg-accent/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {option.label}
                        </span>
                        {active && (
                          <Badge variant="secondary" className="text-[11px]">
                            {t("teams.rooms.languageActive")}
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("teams.rooms.languageHelp")}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("teams.rooms.objectiveLabel")}
              </label>
              <Textarea
                placeholder={t("teams.rooms.objectivePlaceholder")}
                value={createRoomDialog?.goalPrompt ?? ""}
                onChange={e =>
                  setCreateRoomDialog(prev =>
                    prev ? { ...prev, goalPrompt: e.target.value } : null
                  )
                }
                rows={3}
              />
            </div>
            <div>
              <Label>Subagent request</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional. For auto-team rooms, this hint is forwarded to the
                native runtime when the run starts.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={
                    startRunRequestedSubagent === "auto" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    setStartRunRequestedSubagent("auto");
                    setStartRunRequestedSubagentCustom("");
                  }}
                >
                  Auto
                </Button>
                {runtimeSubagentNames.map(name => (
                  <Button
                    key={name}
                    type="button"
                    variant={
                      startRunRequestedSubagent === name ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setStartRunRequestedSubagent(name);
                      setStartRunRequestedSubagentCustom("");
                    }}
                  >
                    {name}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={
                    startRunRequestedSubagent === "custom"
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => setStartRunRequestedSubagent("custom")}
                >
                  Custom exact name
                </Button>
              </div>
              {startRunRequestedSubagent === "custom" && (
                <Input
                  className="mt-3"
                  value={startRunRequestedSubagentCustom}
                  onChange={e =>
                    setStartRunRequestedSubagentCustom(e.target.value)
                  }
                  placeholder="researcher"
                />
              )}
              {runtimeSubagentNames.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Discovered subagents: {runtimeSubagentNames.join(", ")}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRoomDialog(null)}>
              {t("teams.create.cancel")}
            </Button>
            <Button
              onClick={handleCreateRoom}
              disabled={
                !createRoomDialog?.goalPrompt.trim() ||
                createRoomMutation.isPending
              }
            >
              {createRoomMutation.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {t("teams.rooms.createRoom")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Run Dialog */}
      <Dialog open={startRunDialog} onOpenChange={setStartRunDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("teams.run.startTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {t("teams.rooms.selectedRoomTypeLabel")}
                </span>
                <Badge>{getRoomTypeLabel(selectedRoomType)}</Badge>
                {isLegacyRoomType(selectedRoom?.roomType) && (
                  <Badge variant="outline">{t("teams.rooms.legacyType")}</Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {getRoomTypeDescription(
                  selectedRoom?.roomType ?? selectedRoomType
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("teams.rooms.defaultRunModeLabel")}{" "}
                {getRoomTypeDefaultModeLabel(
                  selectedRoom?.roomType ?? selectedRoomType
                )}
              </p>
            </div>
            <div>
              <Label>{t("teams.run.modeLabel")}</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {(["team_chat", "auto_team"] as const).map(mode => {
                  const active = startRunMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStartRunMode(mode)}
                      className={cn(
                        "min-h-[10rem] rounded-xl border p-4 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:bg-accent/50"
                      )}
                    >
                      <div className="text-base font-medium leading-snug">
                        {getExecutionModeLabel(mode)}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {getExecutionModeDescription(mode)}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("teams.run.modeHelp")}
              </p>
            </div>
            <div>
              <Label>{t("teams.run.objectiveLabel")}</Label>
              <Textarea
                placeholder={t("teams.run.objectivePlaceholder")}
                value={runObjective}
                onChange={e => setRunObjective(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Subagent request</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Leave this on Auto unless you want to direct the runtime to a
                specific specialist. The name must match the bundle manifest
                exactly.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={
                    startRunRequestedSubagent === "auto" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    setStartRunRequestedSubagent("auto");
                    setStartRunRequestedSubagentCustom("");
                  }}
                >
                  Auto
                </Button>
                {runtimeSubagentNames.map(name => (
                  <Button
                    key={name}
                    type="button"
                    variant={
                      startRunRequestedSubagent === name ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setStartRunRequestedSubagent(name);
                      setStartRunRequestedSubagentCustom("");
                    }}
                  >
                    {name}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={
                    startRunRequestedSubagent === "custom"
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => setStartRunRequestedSubagent("custom")}
                >
                  Custom exact name
                </Button>
              </div>
              {startRunRequestedSubagent === "custom" && (
                <Input
                  className="mt-3"
                  value={startRunRequestedSubagentCustom}
                  onChange={e =>
                    setStartRunRequestedSubagentCustom(e.target.value)
                  }
                  placeholder="researcher"
                />
              )}
              {runtimeSubagentNames.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Discovered subagents: {runtimeSubagentNames.join(", ")}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartRunDialog(false)}>
              {t("teams.create.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!selectedRoomId || !runObjective.trim()) return;
                startRunMutation.mutate({
                  roomId: selectedRoomId,
                  executionMode: startRunMode,
                  objective: runObjective.trim(),
                  requestedSubagent: resolvedRequestedSubagent,
                  stopPolicy: {
                    maxRounds: 20,
                    maxDurationMinutes: 30,
                    maxBudgetCredits: 500,
                  },
                });
              }}
              disabled={!runObjective.trim() || startRunMutation.isPending}
            >
              {startRunMutation.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              <Play className="mr-1 h-4 w-4" />
              {t("teams.run.start")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog
        open={!!editingMember}
        onOpenChange={open => !open && setEditingMember(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("teams.edit.title")}</DialogTitle>
          </DialogHeader>
          {editingMember && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex items-center gap-2">
                {renderMemberKindBadge(editingMember.memberKind)}
                {editingMember.currentLead && (
                  <Badge variant="secondary">
                    {t("teams.edit.currentLead")}
                  </Badge>
                )}
              </div>

              <div>
                <Label>{t("teams.edit.displayName")}</Label>
                <Input
                  value={editingMember.displayName}
                  onChange={e =>
                    setEditingMember(prev =>
                      prev ? { ...prev, displayName: e.target.value } : prev
                    )
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label>{t("teams.edit.roleTitle")}</Label>
                <Input
                  value={editingMember.roleTitle}
                  onChange={e =>
                    setEditingMember(prev =>
                      prev ? { ...prev, roleTitle: e.target.value } : prev
                    )
                  }
                  placeholder={
                    editingMember.memberKind === "human"
                      ? t("teams.edit.roleTitleHumanPlaceholder")
                      : editingMember.memberKind === "external_connector"
                        ? t("teams.edit.roleTitleExternalPlaceholder")
                        : t("teams.edit.roleTitleAssistantPlaceholder")
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label>{t("teams.edit.memberRole")}</Label>
                <Select
                  value={editingMember.memberRole}
                  onValueChange={value =>
                    setEditingMember(prev =>
                      prev
                        ? { ...prev, memberRole: value as TeamMemberRole }
                        : prev
                    )
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getRoleOptionsForKind(editingMember.memberKind).map(
                      role => (
                        <SelectItem key={role} value={role}>
                          {getMemberRoleLabel(role)}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {editingMember.memberKind === "assistant" && (
                <>
                  {!editingMember.currentLead && (
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editingMember.promoteToLead}
                        onChange={e =>
                          setEditingMember(prev =>
                            prev
                              ? {
                                  ...prev,
                                  promoteToLead: e.target.checked,
                                  memberRole: e.target.checked
                                    ? "orchestrator"
                                    : prev.memberRole,
                                }
                              : prev
                          )
                        }
                      />
                      <span>{t("teams.edit.promoteLead")}</span>
                    </label>
                  )}
                  {editingMember.currentLead && (
                    <p className="text-xs text-muted-foreground">
                      {t("teams.edit.currentLeadHelper")}
                    </p>
                  )}
                  <div>
                    <Label>{t("teams.edit.teamInstructions")}</Label>
                    <Textarea
                      value={editingMember.instructions}
                      onChange={e =>
                        setEditingMember(prev =>
                          prev
                            ? { ...prev, instructions: e.target.value }
                            : prev
                        )
                      }
                      rows={5}
                      className="mt-1"
                    />
                  </div>
                </>
              )}

              {editingMember.memberKind === "human" && (
                <div>
                  <Label>{t("teams.edit.linkedUser")}</Label>
                  <Input
                    value={
                      editingMember.humanUserId
                        ? t("teams.manage.linkedUserId", {
                            id: editingMember.humanUserId,
                          })
                        : t("teams.edit.notLinked")
                    }
                    readOnly
                    className="mt-1"
                  />
                </div>
              )}

              {editingMember.memberKind === "external_connector" && (
                <>
                  <div>
                    <Label>{t("teams.edit.externalReference")}</Label>
                    <Input
                      value={editingMember.externalRef}
                      onChange={e =>
                        setEditingMember(prev =>
                          prev ? { ...prev, externalRef: e.target.value } : prev
                        )
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Bound Worker</Label>
                    <select
                      value={editingMember.externalWorkerId}
                      onChange={e =>
                        setEditingMember(prev =>
                          prev
                            ? { ...prev, externalWorkerId: e.target.value }
                            : prev
                        )
                      }
                      className="mt-1 flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Leave unresolved</option>
                      {bindableWorkerList.map(worker => (
                        <option
                          key={worker.id}
                          value={worker.id}
                          disabled={
                            !worker.availableForBinding &&
                            worker.id !== editingMember.externalWorkerId
                          }
                        >
                          {formatBindableWorkerLabel(worker, hermesFlags)}
                        </option>
                      ))}
                    </select>
                    {renderWorkerPolicyHint(
                      bindableWorkerMap.get(
                        editingMember.externalWorkerId?.trim() ?? ""
                      ),
                      hermesFlags.hermesVisibilitySummaries
                    )}
                    {renderSelectedWorkerBindingDetails(
                      editingMember.externalWorkerId
                    )}
                  </div>
                  {renderSelectedWorkerBudgetPanel()}
                  <div>
                    <Label>{t("teams.edit.connectorInstructions")}</Label>
                    <Textarea
                      value={editingMember.instructions}
                      onChange={e =>
                        setEditingMember(prev =>
                          prev
                            ? { ...prev, instructions: e.target.value }
                            : prev
                        )
                      }
                      rows={4}
                      className="mt-1"
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              {t("teams.create.cancel")}
            </Button>
            <Button
              onClick={handleSaveMemberEdits}
              disabled={!editingMember || updateMemberMutation.isPending}
            >
              {updateMemberMutation.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {t("teams.edit.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog (for existing team) */}
      <Dialog
        open={addMemberOpen}
        onOpenChange={open => {
          setAddMemberOpen(open);
          if (!open) {
            resetAddMemberInputs();
            resetQuickPersonaForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teams.manage.addMember")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div>
              <Label>{t("teams.manage.memberType")}</Label>
              <Select
                value={addMemberKind}
                onValueChange={value => {
                  const nextKind = value as
                    | "assistant"
                    | "human"
                    | "external_connector";
                  setAddMemberKind(nextKind);
                  setAddMemberRole(getDefaultRoleForKind(nextKind));
                  resetQuickPersonaForm();
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assistant">
                    {t("teams.memberKind.assistant.label")}
                  </SelectItem>
                  <SelectItem value="human">
                    {t("teams.memberKind.human.label")}
                  </SelectItem>
                  <SelectItem value="external_connector">
                    {t("teams.memberKind.external.label")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t("teams.edit.memberRole")}</Label>
              <Select
                value={addMemberRole}
                onValueChange={value =>
                  setAddMemberRole(value as TeamMemberRole)
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getRoleOptionsForKind(addMemberKind).map(role => (
                    <SelectItem key={role} value={role}>
                      {getMemberRoleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {addMemberKind === "assistant" && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("teams.manage.selectPersonaHelper")}
                </p>
                {renderQuickPersonaBuilder(
                  t("teams.create.quickPersonaHelperExistingTeam")
                )}
                <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
                  {availableExistingPersonas.length === 0 ? (
                    <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                      {t("teams.create.personasExhausted")}
                    </p>
                  ) : (
                    availableExistingPersonas.map((p: any) => (
                      <button
                        key={p.id}
                        disabled={addMemberMutation.isPending}
                        onClick={() => {
                          if (!selectedTeamIdForView) return;
                          addMemberMutation.mutate({
                            teamId: selectedTeamIdForView,
                            member: {
                              memberKind: "assistant",
                              memberRole: addMemberRole,
                              personaId: p.id,
                              displayName: p.name,
                              instructions:
                                p.systemPromptPrefix ??
                                t("teams.manage.defaultInstructions"),
                              isLead: false,
                            },
                          });
                        }}
                        className="flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {p.name[0].toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{p.name}</span>
                          {p.description && (
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {p.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {addMemberKind === "human" && (
              <div className="space-y-3">
                <div>
                  <Label>{t("teams.manage.searchTenantUsers")}</Label>
                  <Input
                    placeholder={t("teams.manage.searchUsersPlaceholder")}
                    value={addHumanSearch}
                    onChange={e => setAddHumanSearch(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="max-h-[280px] space-y-2 overflow-y-auto rounded-md border p-2">
                  {addHumanLoading && addHumanSearchDebounced ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : addHumanSearchDebounced.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {t("teams.create.typeToSearchUsers")}
                    </p>
                  ) : (addHumanCandidates?.length ?? 0) === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {t("teams.create.noUsersFound")}
                    </p>
                  ) : (
                    (addHumanCandidates ?? []).map(user => {
                      const alreadyAdded = existingTeamMemberKeys.has(
                        `human:${user.id}`
                      );
                      return (
                        <button
                          key={user.id}
                          type="button"
                          disabled={alreadyAdded || addMemberMutation.isPending}
                          onClick={() => addExistingHumanMember(user)}
                          className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <UserRound className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {user.name ??
                                t("teams.manage.userFallback", { id: user.id })}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {user.email}
                            </p>
                          </div>
                          {alreadyAdded ? (
                            <Badge variant="secondary">
                              {t("teams.manage.inTeam")}
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              {t("teams.manage.addShort")}
                            </Badge>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {addMemberKind === "external_connector" && (
              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <Label>{t("teams.create.connectorName")}</Label>
                  <Input
                    placeholder={t("teams.manage.connectorNamePlaceholder")}
                    value={addExternalDraft.displayName}
                    onChange={e =>
                      setAddExternalDraft(prev => ({
                        ...prev,
                        displayName: e.target.value,
                      }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t("teams.edit.externalReference")}</Label>
                  <Input
                    placeholder={t("teams.manage.externalReferencePlaceholder")}
                    value={addExternalDraft.externalRef}
                    onChange={e =>
                      setAddExternalDraft(prev => ({
                        ...prev,
                        externalRef: e.target.value,
                      }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Bound Worker</Label>
                  <select
                    value={addExternalDraft.externalWorkerId}
                    onChange={e =>
                      setAddExternalDraft(prev => ({
                        ...prev,
                        externalWorkerId: e.target.value,
                      }))
                    }
                    className="mt-1 flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Leave unresolved</option>
                    {bindableWorkerList.map(worker => (
                      <option
                        key={worker.id}
                        value={worker.id}
                        disabled={!worker.availableForBinding}
                      >
                        {formatBindableWorkerLabel(worker, hermesFlags)}
                      </option>
                    ))}
                  </select>
                  {renderWorkerPolicyHint(
                    bindableWorkerMap.get(
                      addExternalDraft.externalWorkerId?.trim() ?? ""
                    ),
                    hermesFlags.hermesVisibilitySummaries
                  )}
                  {renderSelectedWorkerBindingDetails(
                    addExternalDraft.externalWorkerId
                  )}
                </div>
                {renderSelectedWorkerBudgetPanel()}
                <div>
                  <Label>{t("teams.edit.roleTitle")}</Label>
                  <Input
                    placeholder={t("teams.manage.roleTitleExternalPlaceholder")}
                    value={addExternalDraft.roleTitle}
                    onChange={e =>
                      setAddExternalDraft(prev => ({
                        ...prev,
                        roleTitle: e.target.value,
                      }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t("teams.create.instructions")}</Label>
                  <Textarea
                    placeholder={t(
                      "teams.manage.connectorInstructionsPlaceholder"
                    )}
                    value={addExternalDraft.instructions}
                    onChange={e =>
                      setAddExternalDraft(prev => ({
                        ...prev,
                        instructions: e.target.value,
                      }))
                    }
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={addExistingExternalMember}
                    disabled={
                      addMemberMutation.isPending ||
                      !addExternalDraft.displayName.trim() ||
                      !addExternalDraft.externalRef.trim()
                    }
                  >
                    {addMemberMutation.isPending && (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    )}
                    {t("teams.manage.addConnector")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Team Dialog */}
      <Dialog
        open={createTeamOpen}
        onOpenChange={open => {
          if (!open) {
            setCreateTeamOpen(false);
            setCreateTeamSectionsOpen({
              presets: true,
              details: true,
              composer: false,
            });
            setNewTeamName("");
            setNewTeamDescription("");
            setNewTeamCategory("");
            setCreateTeamCategoryMode("preset");
            setNewTeamMembers([]);
            resetCreateMemberInputs();
            resetQuickPersonaForm();
          }
        }}
      >
        <DialogContent className="flex max-h-[95dvh] w-[calc(100vw-2rem)] max-w-lg flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-3">
            <DialogTitle>{t("teams.create.title")}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-3 px-6 py-3">
              <Collapsible
                open={createTeamSectionsOpen.presets}
                onOpenChange={open =>
                  setCreateTeamSectionsOpen(prev => ({
                    ...prev,
                    presets: open,
                  }))
                }
              >
                <div className="rounded-lg border bg-muted/10">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <div>
                      <p className="text-sm font-medium">
                        {t("teams.create.presets")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("teams.create.manualDivider")}
                      </p>
                    </div>
                    {createTeamSectionsOpen.presets ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t px-4 pb-4 pt-3">
                    <div className="max-h-[220px] overflow-y-auto pr-1">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {TEAM_BLUEPRINTS.map(blueprint => (
                          <button
                            key={blueprint.id}
                            type="button"
                            onClick={() => applyTeamBlueprint(blueprint.id)}
                            className="flex flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base leading-none">
                                {blueprint.icon}
                              </span>
                              <span className="font-medium">
                                {blueprint.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="ml-auto text-[10px]"
                              >
                                {getTeamCategoryLabel(blueprint.category)}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {blueprint.description}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {t("teams.create.aiRolesCount", {
                                count: blueprint.members.length,
                              })}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              <Collapsible
                open={createTeamSectionsOpen.details}
                onOpenChange={open =>
                  setCreateTeamSectionsOpen(prev => ({
                    ...prev,
                    details: open,
                  }))
                }
              >
                <div className="rounded-lg border bg-muted/10">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {t("teams.create.step", { count: 1 })}
                      </span>
                      <p className="text-sm font-medium">
                        {t("teams.create.stepDetails")}
                      </p>
                    </div>
                    {createTeamSectionsOpen.details ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t px-4 pb-4 pt-3">
                    <div className="space-y-4">
                      <div>
                        <Label>{t("teams.create.teamName")}</Label>
                        <Input
                          placeholder={t("teams.create.teamNamePlaceholder")}
                          value={newTeamName}
                          onChange={e => setNewTeamName(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>{t("teams.create.teamCategory")}</Label>
                        <Select
                          value={
                            createTeamCategoryMode === "custom"
                              ? "__custom__"
                              : newTeamCategory || "__none__"
                          }
                          onValueChange={value => {
                            if (value === "__custom__") {
                              setCreateTeamCategoryMode("custom");
                              setNewTeamCategory("");
                              return;
                            }
                            if (value === "__none__") {
                              setCreateTeamCategoryMode("preset");
                              setNewTeamCategory("");
                              return;
                            }
                            setCreateTeamCategoryMode("preset");
                            setNewTeamCategory(value);
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue
                              placeholder={t("teams.category.placeholder")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              {t("teams.category.none")}
                            </SelectItem>
                            {TEAM_CATEGORY_OPTIONS.map(option => (
                              <SelectItem key={option} value={option}>
                                {getTeamCategoryLabel(option)}
                              </SelectItem>
                            ))}
                            <SelectItem value="__custom__">
                              {t("teams.category.custom")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {createTeamCategoryMode === "custom" && (
                          <Input
                            placeholder={t(
                              "teams.create.customCategoryPlaceholder"
                            )}
                            value={newTeamCategory}
                            onChange={e => setNewTeamCategory(e.target.value)}
                            className="mt-2"
                          />
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("teams.create.teamCategoryHelper")}
                        </p>
                      </div>
                      <div>
                        <Label>{t("teams.create.description")}</Label>
                        <Textarea
                          placeholder={t("teams.create.descriptionPlaceholder")}
                          value={newTeamDescription}
                          onChange={e => setNewTeamDescription(e.target.value)}
                          rows={2}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              <Collapsible
                open={createTeamSectionsOpen.composer}
                onOpenChange={open =>
                  setCreateTeamSectionsOpen(prev => ({
                    ...prev,
                    composer: open,
                  }))
                }
              >
                <div className="rounded-lg border bg-muted/10">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {t("teams.create.step", { count: 2 })}
                      </span>
                      <p className="text-sm font-medium">
                        {t("teams.create.addMember")}
                      </p>
                    </div>
                    {createTeamSectionsOpen.composer ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t px-4 pb-4 pt-3">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium">
                          {t("teams.create.addMember")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("teams.create.addMemberHelper")}
                        </p>
                      </div>

                      <div className="mb-3">
                        <Label>{t("teams.create.whoAreYouAdding")}</Label>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          {DRAFT_MEMBER_KIND_OPTIONS.map(option => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setCreateMemberKind(option);
                                setCreateMemberRole(
                                  getDefaultRoleForKind(option)
                                );
                                resetQuickPersonaForm();
                              }}
                              className={cn(
                                "rounded-lg border px-3 py-3 text-left transition-colors",
                                createMemberKind === option
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                  : "bg-background hover:bg-background/80"
                              )}
                            >
                              <p className="text-sm font-medium">
                                {getMemberKindLabel(option)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {getMemberKindDescription(option)}
                              </p>
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {createMemberKind === "assistant" &&
                            t("teams.create.assistantHelp")}
                          {createMemberKind === "human" &&
                            t("teams.create.humanHelp")}
                          {createMemberKind === "external_connector" &&
                            t("teams.create.externalHelp")}
                        </p>
                      </div>

                      <div className="mb-3">
                        <Label>{t("teams.create.roleInTeam")}</Label>
                        <Select
                          value={createMemberRole}
                          onValueChange={value =>
                            setCreateMemberRole(value as TeamMemberRole)
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getRoleOptionsForKind(createMemberKind).map(
                              role => (
                                <SelectItem key={role} value={role}>
                                  {getMemberRoleLabel(role)}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {createMemberKind === "assistant" && (
                        <div className="space-y-2">
                          <Select
                            onValueChange={addMember}
                            value={newMemberPersonaId}
                            disabled={
                              !hasAnyPersonas || availablePersonas.length === 0
                            }
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t(
                                  "teams.create.selectAssistantPersona"
                                )}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {availablePersonas.map((p: any) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!hasAnyPersonas && (
                            <p className="text-xs text-muted-foreground">
                              {t("teams.create.noPersonasFound")}
                            </p>
                          )}
                          {hasAnyPersonas && availablePersonas.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              {t("teams.create.personasExhausted")}
                            </p>
                          )}
                          {renderQuickPersonaBuilder(
                            t("teams.create.quickPersonaHelperDraftTeam")
                          )}
                        </div>
                      )}

                      {createMemberKind === "human" && (
                        <div className="space-y-3">
                          <Input
                            placeholder={t(
                              "teams.create.humanSearchPlaceholder"
                            )}
                            value={createHumanSearch}
                            onChange={e => setCreateHumanSearch(e.target.value)}
                          />
                          <div className="max-h-[220px] space-y-2 overflow-y-auto rounded-md border bg-background p-2">
                            {createHumanLoading &&
                            createHumanSearchDebounced ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            ) : createHumanSearchDebounced.length === 0 ? (
                              <p className="py-4 text-center text-sm text-muted-foreground">
                                {t("teams.create.typeToSearchUsers")}
                              </p>
                            ) : (createHumanCandidates?.length ?? 0) === 0 ? (
                              <p className="py-4 text-center text-sm text-muted-foreground">
                                {t("teams.create.noUsersFound")}
                              </p>
                            ) : (
                              (createHumanCandidates ?? []).map(user => {
                                const memberKey = `human:${user.id}`;
                                const alreadyAdded = newTeamMembers.some(
                                  member => member.memberKey === memberKey
                                );
                                return (
                                  <button
                                    key={user.id}
                                    type="button"
                                    disabled={alreadyAdded}
                                    onClick={() => addDraftHumanMember(user)}
                                    className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                      <UserRound className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium">
                                        {user.name ??
                                          t("teams.manage.userFallback", {
                                            id: user.id,
                                          })}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {user.email}
                                      </p>
                                    </div>
                                    {alreadyAdded ? (
                                      <Badge variant="secondary">
                                        {t("teams.manage.added")}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline">
                                        {t("teams.manage.addShort")}
                                      </Badge>
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                      {createMemberKind === "external_connector" && (
                        <div className="space-y-3 rounded-md border bg-background p-3">
                          <div>
                            <Label>{t("teams.create.connectorName")}</Label>
                            <Input
                              placeholder={t(
                                "teams.create.connectorNamePlaceholder"
                              )}
                              value={createExternalDraft.displayName}
                              onChange={e =>
                                setCreateExternalDraft(prev => ({
                                  ...prev,
                                  displayName: e.target.value,
                                }))
                              }
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label>
                              {t("teams.create.connectorReference")}
                            </Label>
                            <Input
                              placeholder={t(
                                "teams.create.connectorReferencePlaceholder"
                              )}
                              value={createExternalDraft.externalRef}
                              onChange={e =>
                                setCreateExternalDraft(prev => ({
                                  ...prev,
                                  externalRef: e.target.value,
                                }))
                              }
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label>Bound Worker</Label>
                            <select
                              value={createExternalDraft.externalWorkerId}
                              onChange={e =>
                                setCreateExternalDraft(prev => ({
                                  ...prev,
                                  externalWorkerId: e.target.value,
                                }))
                              }
                              className="mt-1 flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                              <option value="">Leave unresolved</option>
                              {bindableWorkerList.map(worker => (
                                <option
                                  key={worker.id}
                                  value={worker.id}
                                  disabled={!worker.availableForBinding}
                                >
                                  {formatBindableWorkerLabel(
                                    worker,
                                    hermesFlags
                                  )}
                                </option>
                              ))}
                            </select>
                            {renderWorkerPolicyHint(
                              bindableWorkerMap.get(
                                createExternalDraft.externalWorkerId?.trim() ??
                                  ""
                              ),
                              hermesFlags.hermesVisibilitySummaries
                            )}
                            {renderSelectedWorkerBindingDetails(
                              createExternalDraft.externalWorkerId
                            )}
                          </div>
                          {renderSelectedWorkerBudgetPanel()}
                          <div>
                            <Label>{t("teams.create.titleInTeam")}</Label>
                            <Input
                              placeholder={t(
                                "teams.create.titleInTeamPlaceholder"
                              )}
                              value={createExternalDraft.roleTitle}
                              onChange={e =>
                                setCreateExternalDraft(prev => ({
                                  ...prev,
                                  roleTitle: e.target.value,
                                }))
                              }
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label>{t("teams.create.instructions")}</Label>
                            <Textarea
                              placeholder={t(
                                "teams.create.instructionsPlaceholder"
                              )}
                              value={createExternalDraft.instructions}
                              onChange={e =>
                                setCreateExternalDraft(prev => ({
                                  ...prev,
                                  instructions: e.target.value,
                                }))
                              }
                              rows={3}
                              className="mt-1"
                            />
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              onClick={addDraftExternalMember}
                              disabled={
                                !createExternalDraft.displayName.trim() ||
                                !createExternalDraft.externalRef.trim()
                              }
                            >
                              {t("teams.create.addConnectorMember")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>

            <div className="min-h-0 flex flex-1 flex-col border-t bg-background px-6 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {t("teams.create.step", { count: 2 })}
                </span>
                <p className="text-sm font-medium">
                  {t("teams.create.stepMembers")}
                </p>
              </div>
              <Label>{t("teams.create.members")}</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                {t("teams.create.membersHelper")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {t("teams.create.assistantsCount", {
                    count: assistantMemberCount,
                  })}
                </Badge>
                <Badge variant="secondary">
                  {t("teams.create.humansCount", { count: humanMemberCount })}
                </Badge>
                <Badge variant="secondary">
                  {t("teams.create.connectorsCount", {
                    count: connectorMemberCount,
                  })}
                </Badge>
                {leadMember ? (
                  <Badge variant="secondary">
                    {t("teams.create.leadBadge", {
                      name: leadMember.displayName,
                    })}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-300 text-amber-700"
                  >
                    {t("teams.create.leadMissing")}
                  </Badge>
                )}
              </div>

              {newTeamMembers.length > 0 ? (
                <div className="mt-3 flex min-h-0 flex-1 flex-col space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>{t("teams.create.teamMembers")}</Label>
                    <span className="text-xs text-muted-foreground">
                      {t("teams.create.membersAdded", {
                        count: newTeamMembers.length,
                      })}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-background p-2 pr-1">
                    <div className="flex flex-col gap-2">
                      {newTeamMembers.map(m => (
                        <div
                          key={m.memberKey}
                          className="flex items-center gap-2 rounded-md border px-3 py-2"
                        >
                          {m.memberKind === "assistant" ? (
                            <button
                              type="button"
                              onClick={() => toggleLead(m.memberKey)}
                              title={
                                m.isLead
                                  ? t("teams.create.teamLeadTitle")
                                  : t("teams.create.setLeadTitle")
                              }
                              className={cn(
                                "shrink-0",
                                m.isLead
                                  ? "text-yellow-500"
                                  : "text-muted-foreground/40 hover:text-yellow-300"
                              )}
                            >
                              <Star
                                className="h-4 w-4"
                                fill={m.isLead ? "currentColor" : "none"}
                              />
                            </button>
                          ) : (
                            <div className="shrink-0 text-muted-foreground">
                              {renderMemberKindIcon(m.memberKind)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {m.displayName}
                              </span>
                              {renderMemberKindBadge(m.memberKind)}
                              {renderMemberRoleBadge(m.memberRole)}
                              {m.memberKind === "assistant" &&
                                m.personaId &&
                                m.personaBlueprint &&
                                m.reusedPersonaName && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    Reuses {m.reusedPersonaName}
                                  </Badge>
                                )}
                              {m.memberKind === "assistant" &&
                                !m.personaId &&
                                m.personaBlueprint && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    Persona will be created
                                  </Badge>
                                )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {m.roleTitle ||
                                (m.memberKind === "human"
                                  ? t("teams.manage.humanReviewer")
                                  : m.memberKind === "external_connector"
                                    ? m.externalRef
                                    : getMemberRoleLabel(m.memberRole))}
                            </p>
                            {m.memberKind === "external_connector" &&
                              m.externalWorkerId && (
                                <div className="space-y-1">
                                  <p className="truncate text-xs text-muted-foreground">
                                    {(() => {
                                      const boundWorker = bindableWorkerMap.get(
                                        m.externalWorkerId ?? ""
                                      );
                                      if (!boundWorker)
                                        return `Worker ${m.externalWorkerId}`;
                                      return formatBindableWorkerLabel(
                                        boundWorker,
                                        hermesFlags
                                      );
                                    })()}
                                  </p>
                                  {(() => {
                                    const boundWorker = bindableWorkerMap.get(
                                      m.externalWorkerId ?? ""
                                    );
                                    return boundWorker
                                      ? renderHermesWorkerPolicyBadges(
                                          boundWorker,
                                          hermesFlags.hermesVisibilitySummaries
                                        )
                                      : null;
                                  })()}
                                </div>
                              )}
                            {m.isLead && (
                              <Badge
                                variant="secondary"
                                className="ml-2 text-xs"
                              >
                                {t("teams.create.leadShort")}
                              </Badge>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMember(m.memberKey)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  {t("teams.create.emptyMembers")}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-3">
            <div className="flex flex-1 flex-col items-start gap-1 text-xs text-muted-foreground">
              <span>
                {newTeamMembers.length > 0
                  ? t("teams.create.readySummary", {
                      count: newTeamMembers.length,
                    })
                  : t("teams.create.readyNeedMember")}
              </span>
              <span className={cn(!leadMember && "font-medium text-amber-700")}>
                {leadMember
                  ? t("teams.create.leadAssignedFooter", {
                      name: leadMember.displayName,
                    })
                  : t("teams.create.leadRequiredFooter")}
              </span>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setCreateTeamOpen(false);
                setCreateTeamSectionsOpen({
                  presets: true,
                  details: true,
                  composer: false,
                });
                setNewTeamName("");
                setNewTeamDescription("");
                setNewTeamCategory("");
                setCreateTeamCategoryMode("preset");
                setNewTeamMembers([]);
                resetCreateMemberInputs();
                resetQuickPersonaForm();
              }}
            >
              {t("teams.create.cancel")}
            </Button>
            <Button
              onClick={handleCreateTeam}
              disabled={
                !newTeamName.trim() ||
                newTeamMembers.length === 0 ||
                !leadMember ||
                createTeamMutation.isPending
              }
            >
              {createTeamMutation.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {t("teams.create.createTeam")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
