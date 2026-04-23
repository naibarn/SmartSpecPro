import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { pickEnabledModelId } from "@/lib/enabledModelSelection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardCard } from "@/components/dashboard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Brain,
  Plus,
  Trash2,
  RefreshCw,
  FolderOpen,
  Upload,
  Search,
  Edit,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Sparkles,
  Image,
  Video,
  Music,
  Code,
  FileText,
  Globe,
  Bot,
  Zap,
  Star,
  FolderSync,
  Check,
  ChevronsUpDown,
  Lock,
  Clock,
  Users,
  X,
  ShieldCheck,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { SkillStudioDialog } from "@/components/skills/SkillStudioDialog";
import { SkillModelPreviewPanel } from "@/components/chat/settings/SkillModelPreviewPanel";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";
import {
  getAllowedExecutionModesForSkillCategory,
  getMediaModelTypeForSkillCategory,
  getRecommendedExecutionModeForSkillCategory,
  isExecutionModeCompatibleWithSkillCategory,
  type SkillExecutionMode,
} from "@shared/skills/skillCategoryMetadata";

// Skill interface matching database schema
interface Skill {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  version: string | null;
  author: string | null;
  icon: string | null;
  tags: string[];
  folderPath: string | null;
  isAutoTrigger: boolean;
  triggerPatterns: string[];
  isEnabled: boolean;
  enabledByDefault: boolean;
  visibleByDefault: boolean;
  creditMultiplier: number;
  priority: number;
  availableModels: string[] | null;
  defaultModel: string | null;
  llmModelId: string | null;
  preferredProviderId: number | null;
  strictProviderPin: boolean;
  systemPrompt: string | null;
  skillContent: string | null;
  knowledgebase: string | null;
  configJson: Record<string, unknown> | null;
  executionMode: SkillExecutionMode | null;
  sandboxProfileSlug: string | null;
  requiresNetwork: boolean | null;
  requiresBrowser: boolean | null;
  maxRuntimeSeconds: number | null;
  maxInputMb: number | null;
  marketplaceContent?: string | null;
  importSource: string | null;
  importedFromZip: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  visibility: "private" | "pending_approval" | "public" | "rejected";
  tenantId: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  ownerName?: string | null;
  hasLocalFolder?: boolean;
  nativeBundleReady?: boolean;
  nativeBundleFiles?: string[];
  nativeBundlePath?: string | null;
  nativeBundleLockPath?: string | null;
}

interface FolderInfo {
  slug: string;
  hasSkillMd: boolean;
  manifestFileName?: string;
  hasPython: boolean;
  hasJs: boolean;
  metadata?: {
    name?: string;
    description?: string;
    category?: string;
    version?: string;
  };
  existsInDb: boolean;
}

interface MaintenanceRecommendation {
  id: number;
  skillId: number;
  recommendationType: string;
  title: string;
  summary: string | null;
  status: "pending_review" | "approved" | "dismissed" | "applied" | "blocked" | "failed";
  riskLevel: "low" | "medium" | "high" | "critical";
  compatibilityStatus: "unknown" | "compatible" | "warning" | "blocked";
  qualityScore: number | null;
  currentRuntime: string | null;
  proposedRuntime: string | null;
  proposedAction: string | null;
  isAutoApplySafe: boolean;
  isGenjsCandidate: boolean;
  recommendationJson: Record<string, any>;
  analyzedAt: Date;
  updatedAt: Date;
  skill?: {
    id: number;
    slug: string;
    name: string;
    category: string;
    executionMode: string | null;
    sandboxProfileSlug: string | null;
  } | null;
}

interface MaintenanceRecommendationGroup {
  skillId: number;
  skill: MaintenanceRecommendation["skill"] | null;
  recommendations: MaintenanceRecommendation[];
  primaryRecommendation: MaintenanceRecommendation;
  highestRiskLevel: MaintenanceRecommendation["riskLevel"];
  worstCompatibilityStatus: MaintenanceRecommendation["compatibilityStatus"];
  highestQualityScore: number | null;
  currentRuntime: string | null;
}

interface LegacyUpgradeQueueItem extends MaintenanceRecommendation {
  upgradePriorityScore: number;
  upgradePriorityTier: "low" | "medium" | "high" | "urgent" | "critical";
  parallelUpgradeEligible: boolean;
  legacyUpgradeSignals: Record<string, unknown> | null;
}

interface MaintenanceSchedule {
  id: number;
  name: string;
  description: string | null;
  status: "active" | "paused" | "disabled";
  cronExpression: string | null;
  timezone: string;
  scopeType: string;
  scopeJson?: Record<string, any>;
  policyJson?: Record<string, any>;
  nextRunAt?: Date | null;
  runningAt?: Date | null;
  lockExpiresAt?: Date | null;
  updatedAt: Date;
}

interface PendingMaintenanceApply {
  recommendationId: number;
  skillName: string;
  recommendationTitle: string;
  isAutoApplySafe: boolean;
  hasProposalReady: boolean;
}

// Category icon mapping
const categoryIcons: Record<string, typeof Sparkles> = {
  image_generation: Image,
  image_prompt_generation: Sparkles,
  video_generation: Video,
  video_prompt_generation: Sparkles,
  image_video_generation: Video,
  audio_generation: Music,
  article_generation: FileText,
  slide_generation: FileText,
  product_review: Star,
  sound_effects: Music,
  prompt_enhancement: Sparkles,
  code_assistant: Code,
  document_analysis: FileText,
  web_search: Globe,
  chat_assistant: Bot,
  automation: Zap,
  other: Brain,
};

// Category label keys
const categoryLabelKeys: Record<string, string> = {
  image_generation: "admin.skillsPage.categoryLabels.imageGeneration",
  image_prompt_generation: "admin.skillsPage.categoryLabels.imagePromptGeneration",
  video_generation: "admin.skillsPage.categoryLabels.videoGeneration",
  video_prompt_generation: "admin.skillsPage.categoryLabels.videoPromptGeneration",
  image_video_generation: "admin.skillsPage.categoryLabels.imageVideoGeneration",
  audio_generation: "admin.skillsPage.categoryLabels.audioGeneration",
  article_generation: "admin.skillsPage.categoryLabels.articleGeneration",
  slide_generation: "admin.skillsPage.categoryLabels.slideGeneration",
  product_review: "admin.skillsPage.categoryLabels.productReview",
  sound_effects: "admin.skillsPage.categoryLabels.soundEffects",
  prompt_enhancement: "admin.skillsPage.categoryLabels.promptEnhancement",
  code_assistant: "admin.skillsPage.categoryLabels.codeAssistant",
  document_analysis: "admin.skillsPage.categoryLabels.documentAnalysis",
  web_search: "admin.skillsPage.categoryLabels.webSearch",
  data_analysis: "admin.skillsPage.categoryLabels.dataAnalysis",
  translation: "admin.skillsPage.categoryLabels.translation",
  summarization: "admin.skillsPage.categoryLabels.summarization",
  chat_assistant: "admin.skillsPage.categoryLabels.chatAssistant",
  automation: "admin.skillsPage.categoryLabels.automation",
  other: "admin.skillsPage.categoryLabels.other",
};

const executionModeLabelKeys: Record<
  SkillExecutionMode,
  string
> = {
  "llm-only": "admin.skillsPage.executionModes.llmOnly",
  "enhance-prompt": "admin.skillsPage.executionModes.enhancePrompt",
  "media-generate": "admin.skillsPage.executionModes.mediaGenerate",
  python: "admin.skillsPage.executionModes.python",
  "sandbox-code": "admin.skillsPage.executionModes.sandboxCode",
  "sandbox-command": "admin.skillsPage.executionModes.sandboxCommand",
  "sandbox-browser": "admin.skillsPage.executionModes.sandboxBrowser",
  "sandbox-file": "admin.skillsPage.executionModes.sandboxFile",
  "sandbox-media": "admin.skillsPage.executionModes.sandboxMedia",
};

function isSandboxExecutionMode(
  executionMode: SkillExecutionMode | null | undefined,
): executionMode is Extract<SkillExecutionMode, `sandbox-${string}`> {
  return typeof executionMode === "string" && executionMode.startsWith("sandbox-");
}

function getDefaultSandboxSettings(
  category: string,
  executionMode: SkillExecutionMode | null | undefined,
): Pick<Skill, "sandboxProfileSlug" | "requiresNetwork" | "requiresBrowser" | "maxRuntimeSeconds" | "maxInputMb"> {
  if (executionMode === "sandbox-browser") {
    return {
      sandboxProfileSlug: "browser-default",
      requiresNetwork: true,
      requiresBrowser: true,
      maxRuntimeSeconds: 600,
      maxInputMb: 50,
    };
  }
  if (executionMode === "sandbox-file") {
    return {
      sandboxProfileSlug: "file-parser",
      requiresNetwork: false,
      requiresBrowser: false,
      maxRuntimeSeconds: 300,
      maxInputMb: 100,
    };
  }
  if (executionMode === "sandbox-media") {
    return {
      sandboxProfileSlug: "media-processing",
      requiresNetwork: false,
      requiresBrowser: false,
      maxRuntimeSeconds: 1800,
      maxInputMb: 500,
    };
  }
  if (executionMode === "sandbox-command") {
    return {
      sandboxProfileSlug: "browser-default",
      requiresNetwork: category === "slide_generation",
      requiresBrowser: false,
      maxRuntimeSeconds: category === "slide_generation" ? 600 : 300,
      maxInputMb: category === "slide_generation" ? 50 : 25,
    };
  }
  if (executionMode === "sandbox-code") {
    return {
      sandboxProfileSlug: "code-default",
      requiresNetwork: false,
      requiresBrowser: false,
      maxRuntimeSeconds: 300,
      maxInputMb: 25,
    };
  }
  return {
    sandboxProfileSlug: null,
    requiresNetwork: null,
    requiresBrowser: null,
    maxRuntimeSeconds: null,
    maxInputMb: null,
  };
}

function applySandboxDefaults(skill: Skill, executionMode: SkillExecutionMode | null | undefined): Skill {
  if (!isSandboxExecutionMode(executionMode)) {
    return {
      ...skill,
      executionMode: executionMode ?? null,
      sandboxProfileSlug: null,
      requiresNetwork: null,
      requiresBrowser: null,
      maxRuntimeSeconds: null,
      maxInputMb: null,
    };
  }
  const defaults = getDefaultSandboxSettings(skill.category, executionMode);
  const executionModeChanged = skill.executionMode !== executionMode;
  return {
    ...skill,
    executionMode: executionMode ?? null,
    sandboxProfileSlug: executionModeChanged ? defaults.sandboxProfileSlug : (skill.sandboxProfileSlug ?? defaults.sandboxProfileSlug),
    requiresNetwork: executionModeChanged ? defaults.requiresNetwork : (skill.requiresNetwork ?? defaults.requiresNetwork),
    requiresBrowser: executionModeChanged ? defaults.requiresBrowser : (skill.requiresBrowser ?? defaults.requiresBrowser),
    maxRuntimeSeconds: executionModeChanged ? defaults.maxRuntimeSeconds : (skill.maxRuntimeSeconds ?? defaults.maxRuntimeSeconds),
    maxInputMb: executionModeChanged ? defaults.maxInputMb : (skill.maxInputMb ?? defaults.maxInputMb),
  };
}

function applySandboxDefaultsToNewSkill<
  T extends {
    category: string;
    executionMode: SkillExecutionMode;
    sandboxProfileSlug: string | null;
    requiresNetwork: boolean | null;
    requiresBrowser: boolean | null;
    maxRuntimeSeconds: number | null;
    maxInputMb: number | null;
  },
>(draft: T, executionMode: SkillExecutionMode): T {
  if (!isSandboxExecutionMode(executionMode)) {
    return {
      ...draft,
      executionMode,
      sandboxProfileSlug: null,
      requiresNetwork: null,
      requiresBrowser: null,
      maxRuntimeSeconds: null,
      maxInputMb: null,
    };
  }
  const defaults = getDefaultSandboxSettings(draft.category, executionMode);
  const executionModeChanged = draft.executionMode !== executionMode;
  return {
    ...draft,
    executionMode,
    sandboxProfileSlug: executionModeChanged ? defaults.sandboxProfileSlug : (draft.sandboxProfileSlug ?? defaults.sandboxProfileSlug),
    requiresNetwork: executionModeChanged ? defaults.requiresNetwork : (draft.requiresNetwork ?? defaults.requiresNetwork),
    requiresBrowser: executionModeChanged ? defaults.requiresBrowser : (draft.requiresBrowser ?? defaults.requiresBrowser),
    maxRuntimeSeconds: executionModeChanged ? defaults.maxRuntimeSeconds : (draft.maxRuntimeSeconds ?? defaults.maxRuntimeSeconds),
    maxInputMb: executionModeChanged ? defaults.maxInputMb : (draft.maxInputMb ?? defaults.maxInputMb),
  };
}

function getExecutionModeHelperText(
  t: (key: string, params?: string | Record<string, string | number>) => string,
  category: string,
  executionMode: SkillExecutionMode | null | undefined,
): string {
  if (category === "slide_generation" && executionMode === "sandbox-command") {
    return t("admin.skillsPage.executionModeHelp.slideSandboxCommand");
  }
  if (category === "slide_generation" && executionMode === "llm-only") {
    return t("admin.skillsPage.executionModeHelp.slideLlmOnly");
  }
  if (executionMode === "media-generate") {
    const mediaType = getMediaModelTypeForSkillCategory(category);
    if (mediaType === "audio") {
      return t("admin.skillsPage.executionModeHelp.mediaGenerateAudio");
    }
    if (mediaType === "video") {
      return t("admin.skillsPage.executionModeHelp.mediaGenerateVideo");
    }
    return t("admin.skillsPage.executionModeHelp.mediaGenerateDefault");
  }
  if (executionMode === "enhance-prompt") {
    return t("admin.skillsPage.executionModeHelp.enhancePrompt");
  }
  if (executionMode === "python") {
    return t("admin.skillsPage.executionModeHelp.python");
  }
  if (executionMode === "sandbox-command") {
    return t("admin.skillsPage.executionModeHelp.sandboxCommand");
  }
  if (executionMode === "sandbox-code") {
    return t("admin.skillsPage.executionModeHelp.sandboxCode");
  }
  if (executionMode === "sandbox-browser") {
    return t("admin.skillsPage.executionModeHelp.sandboxBrowser");
  }
  if (executionMode === "sandbox-file") {
    return t("admin.skillsPage.executionModeHelp.sandboxFile");
  }
  if (executionMode === "sandbox-media") {
    return t("admin.skillsPage.executionModeHelp.sandboxMedia");
  }
  return t("admin.skillsPage.executionModeHelp.llmOnly");
}

function getNativeBundleLabel(
  t: (key: string, params?: string | Record<string, string | number>) => string,
  skill: Pick<Skill, "hasLocalFolder" | "nativeBundleReady">,
): string {
  if (skill.nativeBundleReady) {
    return t("admin.skillsPage.nativeBundleLabels.native");
  }
  if (skill.hasLocalFolder) {
    return t("admin.skillsPage.nativeBundleLabels.legacy");
  }
  return t("admin.skillsPage.nativeBundleLabels.missing");
}

function getMediaModelsForCategory(
  category: string,
  imageModels?: { models?: any[] },
  videoModels?: { models?: any[] },
  audioModels?: { models?: any[] },
): any[] {
  const mediaType = getMediaModelTypeForSkillCategory(category);
  if (mediaType === "image") return imageModels?.models || [];
  if (mediaType === "video") return videoModels?.models || [];
  if (mediaType === "audio") return audioModels?.models || [];
  if (mediaType === "image-video") {
    return [...(imageModels?.models || []), ...(videoModels?.models || [])];
  }
  return [];
}

function getOrchestrationConfig(configJson: Record<string, unknown> | null | undefined) {
  const orchestration = configJson && typeof configJson === "object"
    ? (configJson as Record<string, any>).orchestration
    : null;
  if (!orchestration || typeof orchestration !== "object") {
    return {
      mode: "local",
      endpoint: "",
      skillTargets: "",
      parallel: false,
      fallback: "local",
    };
  }

  return {
    mode: typeof orchestration.mode === "string" ? orchestration.mode : "local",
    endpoint: typeof orchestration.endpoint === "string" ? orchestration.endpoint : "",
    skillTargets: Array.isArray(orchestration.skillTargets)
      ? orchestration.skillTargets.filter((value: unknown): value is string => typeof value === "string").join(", ")
      : "",
    parallel: orchestration.parallel === true,
    fallback: typeof orchestration.fallback === "string" ? orchestration.fallback : "local",
  };
}

function buildScheduleScopeJson(draft: {
  scopeCategory: string;
  scopeExecutionMode: string;
  genjsCandidatesOnly: boolean;
  limit: string;
}) {
  const scopeJson: Record<string, unknown> = {};
  const parsedLimit = Number.parseInt(draft.limit, 10);
  if (Number.isFinite(parsedLimit)) {
    scopeJson.limit = parsedLimit;
  }
  if (draft.scopeCategory.trim()) {
    scopeJson.category = draft.scopeCategory.trim();
  }
  if (draft.scopeExecutionMode.trim()) {
    scopeJson.executionMode = draft.scopeExecutionMode.trim();
  }
  if (draft.genjsCandidatesOnly) {
    scopeJson.genjsCandidatesOnly = true;
  }
  return scopeJson;
}

function buildScheduleDraftFromExisting(schedule: MaintenanceSchedule) {
  const scopeJson = (schedule.scopeJson ?? {}) as Record<string, unknown>;
  return {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description ?? "",
    cronExpression: schedule.cronExpression ?? "0 9 * * 1",
    timezone: schedule.timezone || "Asia/Bangkok",
    status: schedule.status,
    scopeType: schedule.scopeType || "all_skills",
    scopeCategory: typeof scopeJson.category === "string" ? scopeJson.category : "",
    scopeExecutionMode: typeof scopeJson.executionMode === "string" ? scopeJson.executionMode : "",
    genjsCandidatesOnly: scopeJson.genjsCandidatesOnly === true || schedule.scopeType === "genjs_candidates",
    limit: typeof scopeJson.limit === "number" ? String(scopeJson.limit) : "100",
    policyJsonText: JSON.stringify(schedule.policyJson ?? {}, null, 2),
  };
}

export default function AdminSkills() {
  const { user, isLoading: authLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useScopedTranslation("admin");
  const utils = trpc.useUtils();
  const zipInputRef = useRef<HTMLInputElement>(null);
  const legacyUpgradeQueueFilterStorageKey = "admin.skills.legacyQueueFilter";
  const categoryLabels = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(categoryLabelKeys).map(([key, translationKey]) => [key, t(translationKey)]),
      ) as Record<string, string>,
    [t],
  );
  const executionModeLabels = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(executionModeLabelKeys).map(([key, translationKey]) => [key, t(translationKey)]),
      ) as Record<SkillExecutionMode, string>,
    [t],
  );

  // UI state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isZipDialogOpen, setIsZipDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("skills");
  const [rejectingSkill, setRejectingSkill] = useState<Skill | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isStudioDialogOpen, setIsStudioDialogOpen] = useState(false);
  const [studioMode, setStudioMode] = useState<"create" | "improve">("create");
  const [studioTargetSkillId, setStudioTargetSkillId] = useState<number | null>(null);
  const [previewProposal, setPreviewProposal] = useState<{ skillName: string; diffFile: string; recommendationId?: number } | null>(null);
  const [maintenanceSkillFilter, setMaintenanceSkillFilter] = useState<number | null>(null);
  const [maintenanceStatusFilter, setMaintenanceStatusFilter] = useState<string>("pending_review");
  const [expandedMaintenanceSkillIds, setExpandedMaintenanceSkillIds] = useState<number[]>([]);
  const [legacyUpgradeIncludeApplied, setLegacyUpgradeIncludeApplied] = useState(false);
  const [legacyUpgradeQueueFilter, setLegacyUpgradeQueueFilter] = useState<"all" | "critical" | "high" | "parallel" | "eligible">("all");
  const [selectedLegacyUpgradeIds, setSelectedLegacyUpgradeIds] = useState<number[]>([]);
  const [expandedLegacyUpgradeIds, setExpandedLegacyUpgradeIds] = useState<number[]>([]);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<number | null>(null);
  const [pendingMaintenanceApply, setPendingMaintenanceApply] = useState<PendingMaintenanceApply | null>(null);
  const openedSkillIdFromQueryRef = useRef<number | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState({
    id: null as number | null,
    name: "",
    description: "",
    cronExpression: "0 9 * * 1",
    timezone: "Asia/Bangkok",
    status: "active" as "active" | "paused" | "disabled",
    scopeType: "all_skills",
    scopeCategory: "",
    scopeExecutionMode: "",
    genjsCandidatesOnly: false,
    limit: "100",
    policyJsonText: "{}",
  });

  // ZIP import state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipSlug, setZipSlug] = useState("");

  // New skill form state
  const [newSkillData, setNewSkillData] = useState({
    slug: "",
    name: "",
    description: "",
    category: "other",
    version: "1.0.0",
    author: "",
    icon: "sparkles",
    tags: [] as string[],
    isAutoTrigger: false,
    triggerPatterns: [] as string[],
    isEnabled: true,
    enabledByDefault: true,
    visibleByDefault: true,
    creditMultiplier: 1.0,
    priority: 50,
    executionMode: "llm-only" as SkillExecutionMode,
    sandboxProfileSlug: null as string | null,
    requiresNetwork: null as boolean | null,
    requiresBrowser: null as boolean | null,
    maxRuntimeSeconds: null as number | null,
    maxInputMb: null as number | null,
    systemPrompt: "",
    skillContent: "",
    marketplaceContent: "",
    visibility: "private" as "private" | "public",
  });

  // Check auth — any authenticated user can access, not just admins
  const isAdmin = user?.role === "admin";
  const search = useSearch();
  const openTabFromQuery = useMemo(() => {
    const params = new URLSearchParams(search);
    const value = params.get("tab");
    if (value === "skills" || value === "import" || value === "iscProposals" || value === "maintenance" || value === "pendingApproval") {
      return value;
    }
    return null;
  }, [search]);
  const openSkillIdFromQuery = useMemo(() => {
    const params = new URLSearchParams(search);
    const value = params.get("skillId");
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, [search]);
  const legacyUpgradeQueueFilterFromQuery = useMemo<"all" | "critical" | "high" | "parallel" | "eligible" | null>(() => {
    const params = new URLSearchParams(search);
    const value = params.get("legacyQueueFilter");
    if (value === "all" || value === "critical" || value === "high" || value === "parallel" || value === "eligible") {
      return value;
    }
    return null;
  }, [search]);
  const legacyUpgradeQueueFilterFromStorage = useMemo<"all" | "critical" | "high" | "parallel" | "eligible" | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const value = window.localStorage.getItem(legacyUpgradeQueueFilterStorageKey);
    if (value === "all" || value === "critical" || value === "high" || value === "parallel" || value === "eligible") {
      return value;
    }
    return null;
  }, []);
  const [legacyUpgradeQueueFilterRestoredFromStorage] = useState(() => (
    !legacyUpgradeQueueFilterFromQuery && !!legacyUpgradeQueueFilterFromStorage
  ));

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      setLocation("/settings/skills");
    }
  }, [authLoading, isAdmin, setLocation, user]);

  // Fetch skills from database
  const { data: skills, isLoading } = trpc.skills.listFromDb.useQuery({
    category: filterCategory !== "all" ? filterCategory : undefined,
    search: searchQuery || undefined,
    enabledOnly: showEnabledOnly || undefined,
  });

  useEffect(() => {
    if (!skills || !openSkillIdFromQuery || editingSkill || openedSkillIdFromQueryRef.current === openSkillIdFromQuery) {
      return;
    }
    const found = skills.find((skill: any) => skill.id === openSkillIdFromQuery);
    if (found) {
      openedSkillIdFromQueryRef.current = openSkillIdFromQuery;
      setEditingSkill(found as unknown as Skill);
    }
  }, [editingSkill, openSkillIdFromQuery, skills]);

  // Fetch categories
  const { data: categories } = trpc.skills.getCategories.useQuery();

  // Fetch vision-capable LLM models for default model selection
  const { data: visionModels } = trpc.skills.getVisionModels.useQuery();
  const { data: llmProvidersData } = trpc.llmProviders.list.useQuery();
  const systemDefaultLlmModel = visionModels?.models?.find((model) => model.isDefault) || visionModels?.models?.[0];
  const systemDefaultLlmLabel = systemDefaultLlmModel
    ? t("admin.skillsPage.modelSelection.autoLabelWithFallback", {
        model: systemDefaultLlmModel.id.split("/").pop() ?? systemDefaultLlmModel.id,
      })
    : t("admin.skillsPage.modelSelection.autoLabel");

  // Fetch media models (image/video/audio) for media-generate skills
  const { data: imageModels } = trpc.mediaModels.list.useQuery({ type: "image" });
  const { data: videoModels } = trpc.mediaModels.list.useQuery({ type: "video" });
  const { data: audioModels } = trpc.mediaModels.list.useQuery({ type: "audio" });
  const { data: sandboxProfiles } = trpc.sandbox.getProfiles.useQuery();

  useEffect(() => {
    if (!editingSkill) {
      return;
    }

    if (editingSkill.executionMode === "media-generate") {
      const mediaType = getMediaModelTypeForSkillCategory(editingSkill.category);
      if (mediaType === "image" && !imageModels) return;
      if (mediaType === "video" && !videoModels) return;
      if (mediaType === "audio" && !audioModels) return;
      if (mediaType === "image-video" && (!imageModels || !videoModels)) return;

      const mediaModelIds = getMediaModelsForCategory(
        editingSkill.category,
        imageModels,
        videoModels,
        audioModels,
      ).map((model: any) => model.modelId);
      const nextDefaultModel = pickEnabledModelId({
        preferredId: editingSkill.defaultModel,
        allowedIds: mediaModelIds,
      });

      if ((nextDefaultModel || null) !== editingSkill.defaultModel) {
        setEditingSkill({
          ...editingSkill,
          defaultModel: nextDefaultModel || null,
        });
      }
      return;
    }

    if (!visionModels?.models) {
      return;
    }

    const llmModelIds = (visionModels?.models ?? []).map((model) => model.id);
    const nextLlmModelId = pickEnabledModelId({
      preferredId: editingSkill.llmModelId || editingSkill.defaultModel,
      allowedIds: llmModelIds,
    });

    if ((nextLlmModelId || null) !== (editingSkill.llmModelId || editingSkill.defaultModel || null)) {
      setEditingSkill({
        ...editingSkill,
        defaultModel: nextLlmModelId || null,
        llmModelId: nextLlmModelId || null,
      });
    }
  }, [audioModels, editingSkill, imageModels, videoModels, visionModels?.models]);

  useEffect(() => {
    if (openTabFromQuery) {
      setActiveTab(openTabFromQuery);
    }
  }, [openTabFromQuery]);

  useEffect(() => {
    if (!legacyUpgradeQueueFilterFromQuery && !legacyUpgradeQueueFilterFromStorage) {
      return;
    }
    const nextFilter = legacyUpgradeQueueFilterFromQuery || legacyUpgradeQueueFilterFromStorage;
    if (!nextFilter) {
      return;
    }
    setLegacyUpgradeQueueFilter((current) => (current === nextFilter ? current : nextFilter));
  }, [legacyUpgradeQueueFilterFromQuery, legacyUpgradeQueueFilterFromStorage]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(legacyUpgradeQueueFilterStorageKey, legacyUpgradeQueueFilter);
    }

    const params = new URLSearchParams(search);
    if (legacyUpgradeQueueFilter !== "all") {
      params.set("legacyQueueFilter", legacyUpgradeQueueFilter);
    } else {
      params.delete("legacyQueueFilter");
    }

    const nextSearch = params.toString();
    const nextLocation = nextSearch ? `${location.split("?")[0]}?${nextSearch}` : location.split("?")[0];
    if (nextLocation !== location) {
      setLocation(nextLocation);
    }
  }, [legacyUpgradeQueueFilter, location, search, setLocation]);

  // Fetch pending skills for admin approval tab
  const { data: pendingSkills } = trpc.skills.listPending.useQuery(undefined, {
    enabled: !!isAdmin,
  });
  const { data: iscProposals } = trpc.skills.listIscProposals.useQuery(undefined, {
    enabled: !!isAdmin,
  });
  const { data: proposalPreviewData } = trpc.skills.getIscProposalContent.useQuery(
    previewProposal || { skillName: "__placeholder__", diffFile: "placeholder.diff" },
    { enabled: !!previewProposal && !!isAdmin },
  );
  const { data: maintenanceRecommendations, refetch: refetchMaintenanceRecommendations } =
    trpc.skills.getUpgradeRecommendations.useQuery(
      {
        skillId: maintenanceSkillFilter ?? undefined,
        status: maintenanceStatusFilter !== "all" ? maintenanceStatusFilter as any : undefined,
        includeDismissed: maintenanceStatusFilter === "all",
        limit: 200,
      },
      { enabled: !!isAdmin },
    );
  const { data: selectedRecommendationDetail } = trpc.skills.getUpgradeRecommendationDetail.useQuery(
    selectedRecommendationId ? { recommendationId: selectedRecommendationId } : { recommendationId: 0 },
    { enabled: !!selectedRecommendationId && !!isAdmin },
  );
  const { data: maintenanceSchedules } = trpc.skills.listMaintenanceSchedules.useQuery(undefined, {
    enabled: !!isAdmin,
  });
  const {
    data: legacyUpgradeQueue,
    refetch: refetchLegacyUpgradeQueue,
    isFetching: isLegacyUpgradeQueueFetching,
  } = trpc.skills.getLegacyUpgradeQueue.useQuery(
    {
      includeApplied: legacyUpgradeIncludeApplied,
      limit: 100,
    },
    { enabled: !!isAdmin },
  );
  const applyLegacyUpgradeRecommendationsMutation = trpc.skills.applyLegacyUpgradeRecommendations.useMutation({
    onSuccess: (result) => {
      utils.skills.getLegacyUpgradeQueue.invalidate();
      utils.skills.getUpgradeRecommendations.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      setSelectedLegacyUpgradeIds([]);
      toast({
        title: "Legacy Upgrade Batch Queued",
        description: `${result.appliedCount} upgrade(s) queued, ${result.failedCount} failed.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Bulk Apply Failed",
        description: error.message || "Failed to apply selected upgrades.",
        variant: "destructive",
      });
    },
  });
  const latestProposalBySkillName = new Map<string, { skillName: string; diffFile: string; createdAt: string }>();
  for (const proposal of (iscProposals?.proposals || [])) {
    if (!latestProposalBySkillName.has(proposal.skillName)) {
      latestProposalBySkillName.set(proposal.skillName, {
        skillName: proposal.skillName,
        diffFile: proposal.diffFile,
        createdAt: proposal.createdAt,
      });
    }
  }
  const latestRecommendationBySkillId = new Map<number, MaintenanceRecommendation>();
  for (const item of ((maintenanceRecommendations || []) as MaintenanceRecommendation[])) {
    if (!latestRecommendationBySkillId.has(item.skillId)) {
      latestRecommendationBySkillId.set(item.skillId, item);
    }
  }
  const maintenanceRecommendationGroups = useMemo<MaintenanceRecommendationGroup[]>(() => {
    const groups = new Map<number, MaintenanceRecommendationGroup>();

    for (const item of sortMaintenanceRecommendationsForDisplay((maintenanceRecommendations || []) as MaintenanceRecommendation[])) {
      const existing = groups.get(item.skillId);
      if (!existing) {
        groups.set(item.skillId, {
          skillId: item.skillId,
          skill: item.skill ?? null,
          recommendations: [item],
          primaryRecommendation: item,
          highestRiskLevel: item.riskLevel,
          worstCompatibilityStatus: item.compatibilityStatus,
          highestQualityScore: item.qualityScore,
          currentRuntime: item.currentRuntime,
        });
        continue;
      }

      existing.recommendations = sortMaintenanceRecommendationsForDisplay([...existing.recommendations, item]);
      existing.highestRiskLevel = getMaintenanceWorstRiskLevel(existing.highestRiskLevel, item.riskLevel);
      existing.worstCompatibilityStatus = getMaintenanceWorstCompatibilityStatus(
        existing.worstCompatibilityStatus,
        item.compatibilityStatus,
      );
      if (typeof item.qualityScore === "number") {
        existing.highestQualityScore = existing.highestQualityScore === null
          ? item.qualityScore
          : Math.max(existing.highestQualityScore, item.qualityScore);
      }
      if (!existing.currentRuntime && item.currentRuntime) {
        existing.currentRuntime = item.currentRuntime;
      }
      if (item.analyzedAt > existing.primaryRecommendation.analyzedAt) {
        existing.primaryRecommendation = existing.recommendations[0] || item;
        existing.skill = item.skill ?? existing.skill;
      }
    }

    for (const group of groups.values()) {
      group.primaryRecommendation = group.recommendations[0] || group.primaryRecommendation;
    }

    return Array.from(groups.values());
  }, [maintenanceRecommendations]);
  const maintenanceEligibleRecommendationIds = useMemo(
    () => maintenanceRecommendationGroups.flatMap((group) => (
      group.recommendations
        .filter((item) => item.isAutoApplySafe && item.status !== "applied" && item.status !== "dismissed")
        .map((item) => item.id)
    )),
    [maintenanceRecommendationGroups],
  );
  const maintenanceExpandedSkillIdSet = useMemo(() => new Set(expandedMaintenanceSkillIds), [expandedMaintenanceSkillIds]);
  const legacyUpgradeQueueItems = (legacyUpgradeQueue || []) as LegacyUpgradeQueueItem[];
  const legacyUpgradeFilteredItems = useMemo(() => {
    switch (legacyUpgradeQueueFilter) {
      case "critical":
        return legacyUpgradeQueueItems.filter((item) => item.upgradePriorityTier === "critical");
      case "high":
        return legacyUpgradeQueueItems.filter((item) => item.upgradePriorityTier === "high");
      case "parallel":
        return legacyUpgradeQueueItems.filter((item) => item.parallelUpgradeEligible);
      case "eligible":
        return legacyUpgradeQueueItems.filter((item) => item.status !== "applied" && item.status !== "dismissed");
      default:
        return legacyUpgradeQueueItems;
    }
  }, [legacyUpgradeQueueFilter, legacyUpgradeQueueItems]);
  const selectedLegacyUpgradeIdSet = useMemo(() => new Set(selectedLegacyUpgradeIds), [selectedLegacyUpgradeIds]);
  const expandedLegacyUpgradeIdSet = useMemo(() => new Set(expandedLegacyUpgradeIds), [expandedLegacyUpgradeIds]);
  const legacyUpgradeQueueById = useMemo(
    () => new Map(legacyUpgradeQueueItems.map((item) => [item.id, item])),
    [legacyUpgradeQueueItems],
  );
  const selectableLegacyUpgradeIds = useMemo(
    () => legacyUpgradeQueueItems
      .filter((item) => item.status !== "applied" && item.status !== "dismissed")
      .map((item) => item.id),
    [legacyUpgradeQueueItems],
  );
  const selectedSelectableLegacyUpgradeIds = useMemo(
    () => selectedLegacyUpgradeIds.filter((id) => selectableLegacyUpgradeIds.includes(id)),
    [selectedLegacyUpgradeIds, selectableLegacyUpgradeIds],
  );
  const selectedEligibleLegacyUpgradeIds = useMemo(
    () => selectedSelectableLegacyUpgradeIds.filter((id) => legacyUpgradeQueueById.get(id)?.parallelUpgradeEligible),
    [legacyUpgradeQueueById, selectedSelectableLegacyUpgradeIds],
  );
  const selectedCriticalHighLegacyUpgradeIds = useMemo(
    () => selectedSelectableLegacyUpgradeIds.filter((id) => {
      const tier = legacyUpgradeQueueById.get(id)?.upgradePriorityTier;
      return tier === "critical" || tier === "high";
    }),
    [legacyUpgradeQueueById, selectedSelectableLegacyUpgradeIds],
  );
  const visibleSelectableLegacyUpgradeIds = useMemo(
    () => legacyUpgradeFilteredItems
      .filter((item) => item.status !== "applied" && item.status !== "dismissed")
      .map((item) => item.id),
    [legacyUpgradeFilteredItems],
  );
  const legacyUpgradeCriticalCount = legacyUpgradeQueueItems.filter((item) => item.upgradePriorityTier === "critical").length;
  const legacyUpgradeHighCount = legacyUpgradeQueueItems.filter((item) => item.upgradePriorityTier === "high").length;
  const allVisibleLegacySelected = visibleSelectableLegacyUpgradeIds.length > 0
    && visibleSelectableLegacyUpgradeIds.every((id) => selectedLegacyUpgradeIdSet.has(id));
  const someVisibleLegacySelected = visibleSelectableLegacyUpgradeIds.some((id) => selectedLegacyUpgradeIdSet.has(id));
  const visibleLegacyIds = legacyUpgradeFilteredItems.map((item) => item.id);
  const allExpandedLegacySelected = visibleLegacyIds.length > 0
    && visibleLegacyIds.every((id) => expandedLegacyUpgradeIdSet.has(id));

  function toggleLegacyUpgradeSelection(recommendationId: number, checked: boolean) {
    setSelectedLegacyUpgradeIds((current) => {
      if (checked) {
        return current.includes(recommendationId) ? current : [...current, recommendationId];
      }
      return current.filter((id) => id !== recommendationId);
    });
  }

  function toggleAllVisibleLegacyUpgrades(checked: boolean) {
    if (!checked) {
      setSelectedLegacyUpgradeIds((current) => current.filter((id) => !visibleSelectableLegacyUpgradeIds.includes(id)));
      return;
    }
    setSelectedLegacyUpgradeIds((current) => Array.from(new Set([...current, ...visibleSelectableLegacyUpgradeIds])));
  }

  function toggleLegacyUpgradeDetails(recommendationId: number, checked: boolean) {
    setExpandedLegacyUpgradeIds((current) => {
      if (checked) {
        return current.includes(recommendationId) ? current : [...current, recommendationId];
      }
      return current.filter((id) => id !== recommendationId);
    });
  }

  function toggleAllLegacyUpgradeDetails(checked: boolean) {
    if (!checked) {
      setExpandedLegacyUpgradeIds([]);
      return;
    }
    setExpandedLegacyUpgradeIds(legacyUpgradeQueueItems.map((item) => item.id));
  }

  function collapseAllLegacyUpgradeDetails() {
    setExpandedLegacyUpgradeIds([]);
  }

  useEffect(() => {
    const criticalIds = legacyUpgradeQueueItems
      .filter((item) => item.upgradePriorityTier === "critical")
      .map((item) => item.id);

    if (criticalIds.length === 0) {
      return;
    }

    setExpandedLegacyUpgradeIds((current) => Array.from(new Set([...current, ...criticalIds])));
  }, [legacyUpgradeQueueItems]);

  function describeLegacyUpgradeSignal(key: string, value: unknown): string {
    const friendlyKeyMap: Record<string, string> = {
      hasRunScript: "run.sh",
      hasVerifyScript: "verify.sh",
      hasModelCompatibilityDoc: "MODEL_COMPATIBILITY.md",
      hasSkillLock: "skill.lock.json",
      hasCompatibilityMirror: "mirror docs",
      hasSchemas: "schemas",
      hasTests: "tests",
      hasFixtures: "fixtures",
      hasNativeBundleSurface: "native surface",
    };

    const label = friendlyKeyMap[key] || key;
    return `${label}: ${value ? "yes" : "no"}`;
  }

  function getMaintenanceWorstRiskLevel(
    current: MaintenanceRecommendation["riskLevel"],
    next: MaintenanceRecommendation["riskLevel"],
  ): MaintenanceRecommendation["riskLevel"] {
    const order: Record<MaintenanceRecommendation["riskLevel"], number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return order[next] > order[current] ? next : current;
  }

  function getMaintenanceWorstCompatibilityStatus(
    current: MaintenanceRecommendation["compatibilityStatus"],
    next: MaintenanceRecommendation["compatibilityStatus"],
  ): MaintenanceRecommendation["compatibilityStatus"] {
    const order: Record<MaintenanceRecommendation["compatibilityStatus"], number> = {
      compatible: 1,
      unknown: 2,
      warning: 3,
      blocked: 4,
    };
    return order[next] > order[current] ? next : current;
  }

  function getMaintenanceRiskRank(riskLevel: MaintenanceRecommendation["riskLevel"]): number {
    const order: Record<MaintenanceRecommendation["riskLevel"], number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return order[riskLevel];
  }

  function getMaintenanceCompatibilityRank(status: MaintenanceRecommendation["compatibilityStatus"]): number {
    const order: Record<MaintenanceRecommendation["compatibilityStatus"], number> = {
      compatible: 1,
      unknown: 2,
      warning: 3,
      blocked: 4,
    };
    return order[status];
  }

  function sortMaintenanceRecommendationsForDisplay(items: MaintenanceRecommendation[]): MaintenanceRecommendation[] {
    return [...items].sort((left, right) => {
      const riskDelta = getMaintenanceRiskRank(right.riskLevel) - getMaintenanceRiskRank(left.riskLevel);
      if (riskDelta !== 0) return riskDelta;

      const compatibilityDelta = getMaintenanceCompatibilityRank(right.compatibilityStatus) - getMaintenanceCompatibilityRank(left.compatibilityStatus);
      if (compatibilityDelta !== 0) return compatibilityDelta;

      if ((right.qualityScore ?? -1) !== (left.qualityScore ?? -1)) {
        return (right.qualityScore ?? -1) - (left.qualityScore ?? -1);
      }

      return new Date(right.analyzedAt).getTime() - new Date(left.analyzedAt).getTime();
    });
  }

  function requestRecommendationApply(recommendation: MaintenanceRecommendation, skillName: string) {
    const proposalReady = Boolean(
      recommendation.skill?.slug && latestProposalBySkillName.has(recommendation.skill.slug),
    );

    if (recommendation.isAutoApplySafe) {
      applyUpgradeMutation.mutate({ recommendationId: recommendation.id });
      return;
    }

    setPendingMaintenanceApply({
      recommendationId: recommendation.id,
      skillName,
      recommendationTitle: recommendation.title,
      isAutoApplySafe: false,
      hasProposalReady: proposalReady,
    });
  }

  function requestMaintenanceGroupApply(group: MaintenanceRecommendationGroup) {
    applyMaintenanceRecommendationsMutation.mutate({
      recommendationIds: group.recommendations.map((item) => item.id),
    });
  }

  function requestEligibleMaintenanceGroupApply(group: MaintenanceRecommendationGroup) {
    applyMaintenanceRecommendationsMutation.mutate({
      recommendationIds: group.recommendations
        .filter((item) => item.isAutoApplySafe && item.status !== "applied" && item.status !== "dismissed")
        .map((item) => item.id),
    });
  }

  function requestEligibleMaintenanceApplyForView() {
    applyMaintenanceRecommendationsMutation.mutate({
      recommendationIds: maintenanceEligibleRecommendationIds,
    });
  }

  function toggleMaintenanceSkillDetails(skillId: number, checked: boolean) {
    setExpandedMaintenanceSkillIds((current) => {
      if (checked) {
        return current.includes(skillId) ? current : [...current, skillId];
      }
      return current.filter((id) => id !== skillId);
    });
  }

  function toggleAllMaintenanceSkillDetails(checked: boolean) {
    if (!checked) {
      setExpandedMaintenanceSkillIds([]);
      return;
    }
    setExpandedMaintenanceSkillIds(maintenanceRecommendationGroups.map((group) => group.skillId));
  }

  function saveMaintenanceSchedule() {
    let policyJson: Record<string, unknown>;
    try {
      policyJson = JSON.parse(scheduleDraft.policyJsonText || "{}");
    } catch {
      toast({
        title: "Invalid Policy JSON",
        description: "Policy JSON must be valid JSON before saving the schedule.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: scheduleDraft.name,
      description: scheduleDraft.description || undefined,
      cronExpression: scheduleDraft.cronExpression,
      timezone: scheduleDraft.timezone,
      status: scheduleDraft.status,
      scopeType: scheduleDraft.scopeType,
      scopeJson: buildScheduleScopeJson(scheduleDraft),
      policyJson,
    };

    if (scheduleDraft.id) {
      updateMaintenanceScheduleMutation.mutate({
        id: scheduleDraft.id,
        ...payload,
      });
      return;
    }

    createMaintenanceScheduleMutation.mutate(payload);
  }

  // Fetch groups for sharing (used in edit dialog)
  const { data: userGroups } = trpc.groups.list.useQuery(
    { scope: "my_groups" } as any,
    { enabled: !!editingSkill }
  );

  // Fetch shared groups for the currently editing skill
  const { data: sharedGroups } = trpc.skills.getSkillGroups.useQuery(
    { skillId: editingSkill?.id ?? 0 },
    { enabled: !!editingSkill && editingSkill.visibility === "private" }
  );

  // Scan folders
  const { data: folders, refetch: refetchFolders } = trpc.skills.scanFolders.useQuery(undefined, {
    enabled: activeTab === "import",
  });

  // Create skill mutation
  const createMutation = trpc.skills.create.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      setIsCreateDialogOpen(false);
      resetNewSkillForm();
      toast({
        title: "Skill Created",
        description: "The skill has been created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create skill",
        variant: "destructive",
      });
    },
  });

  // Update skill mutation
  const updateMutation = trpc.skills.update.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      setEditingSkill(null);
      toast({
        title: "Skill Updated",
        description: "The skill has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update skill",
        variant: "destructive",
      });
    },
  });

  // Delete skill mutation
  const deleteMutation = trpc.skills.delete.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      toast({
        title: "Skill Deleted",
        description: "The skill has been permanently deleted",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete skill",
        variant: "destructive",
      });
    },
  });

  // Regenerate marketplace content mutation
  const regenerateMarketplaceMutation = trpc.skills.regenerateMarketplaceContent.useMutation({
    onSuccess: (data) => {
      if (editingSkill && data.marketplaceContent) {
        setEditingSkill({ ...editingSkill, marketplaceContent: data.marketplaceContent });
      }
      toast({
        title: "Marketplace Content Regenerated",
        description: "Content has been generated from skill file.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to regenerate",
        variant: "destructive",
      });
    },
  });

  // Import folder mutation
  const importFolderMutation = trpc.skills.importFolder.useMutation({
    onSuccess: (data) => {
      utils.skills.listFromDb.invalidate();
      refetchFolders();
      toast({
        title: "Skill Imported",
        description: `Successfully imported "${data.name}" from folder`,
      });
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import skill from folder",
        variant: "destructive",
      });
    },
  });

  // Import ZIP mutation
  const importZipMutation = trpc.skills.importZip.useMutation({
    onSuccess: (data: any) => {
      utils.skills.listFromDb.invalidate();
      refetchFolders();
      setIsZipDialogOpen(false);
      setZipFile(null);
      setZipSlug("");
      const formatLabel = data.importFormat === "shared-skill" ? "Shared Skill Bundle" : "Custom GPT";
      const extras = [];
      if (data.hasPython) extras.push("Python");
      if (data.hasJs) extras.push("JavaScript");
      if (data.knowledgeFilesCount > 0) extras.push(`${data.knowledgeFilesCount} knowledge files`);
      toast({
        title: `${formatLabel} Imported`,
        description: `Successfully imported "${data.name}"${extras.length > 0 ? ` with ${extras.join(", ")}` : ""}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import from ZIP",
        variant: "destructive",
      });
    },
  });

  // Approve skill mutation (admin only)
  const approveMutation = trpc.skills.approveSkill.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      utils.skills.listPending.invalidate();
      toast({
        title: "Skill Approved",
        description: "The skill is now publicly visible to all users.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve skill",
        variant: "destructive",
      });
    },
  });

  // Reject skill mutation (admin only)
  const rejectMutation = trpc.skills.rejectSkill.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      utils.skills.listPending.invalidate();
      setRejectingSkill(null);
      setRejectReason("");
      toast({
        title: "Skill Rejected",
        description: "The skill owner has been notified.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject skill",
        variant: "destructive",
      });
    },
  });

  const applyProposalMutation = trpc.skills.applyIscProposal.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      utils.skills.listIscProposals.invalidate();
      utils.skills.getUpgradeRecommendations.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      toast({
        title: "Proposal Applied",
        description: "The ISC proposal has been applied and synced.",
      });
      setPreviewProposal(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to apply proposal",
        variant: "destructive",
      });
    },
  });

  const analyzeUpgradeMutation = trpc.skills.analyzeUpgrade.useMutation({
    onSuccess: (data) => {
      utils.skills.getUpgradeRecommendations.invalidate();
      if (data.recommendations?.length > 0) {
        setSelectedRecommendationId(data.recommendations[0].id);
        setMaintenanceSkillFilter(data.skillId);
      }
      setActiveTab("maintenance");
      toast({
        title: "Skill Analysis Complete",
        description: `${data.skillSlug} analyzed with ${data.recommendations.length} recommendation(s).`,
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze skill",
        variant: "destructive",
      });
    },
  });

  const dismissRecommendationMutation = trpc.skills.dismissUpgradeRecommendation.useMutation({
    onSuccess: () => {
      utils.skills.getUpgradeRecommendations.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      toast({
        title: "Recommendation Dismissed",
        description: "The recommendation has been removed from the default queue.",
      });
    },
    onError: (error) => {
      toast({
        title: "Dismiss Failed",
        description: error.message || "Failed to dismiss recommendation",
        variant: "destructive",
      });
    },
  });

  const applyUpgradeMutation = trpc.skills.applyUpgradeRecommendation.useMutation({
    onSuccess: (data) => {
      utils.skills.getUpgradeRecommendations.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      utils.skills.listFromDb.invalidate();
      utils.skills.listIscProposals.invalidate();
      setPendingMaintenanceApply(null);
      if (data.applyStrategy === "proposal") {
        setActiveTab("proposals");
      }
      toast({
        title: data.applyStrategy === "proposal"
          ? "Proposal Generation Started"
          : data.mode === "queued"
            ? "Upgrade Started"
            : "Upgrade Applied",
        description: data.applyStrategy === "proposal"
          ? "A proposal-first upgrade task was queued. Review the generated diff in the Proposals tab before applying it."
          : data.mode === "queued"
            ? "The maintenance upgrade task was queued and will update this recommendation when it finishes."
            : "The recommendation was applied successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Apply Failed",
        description: error.message || "Failed to apply recommendation",
        variant: "destructive",
      });
    },
  });

  const applyMaintenanceRecommendationsMutation = trpc.skills.applyMaintenanceRecommendations.useMutation({
    onSuccess: (result) => {
      utils.skills.getUpgradeRecommendations.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      utils.skills.listFromDb.invalidate();
      utils.skills.listIscProposals.invalidate();
      setExpandedMaintenanceSkillIds([]);
      toast({
        title: "Maintenance Recommendations Queued",
        description: `${result.appliedCount} recommendation(s) queued, ${result.failedCount} failed.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Bulk Apply Failed",
        description: error.message || "Failed to apply selected maintenance recommendations.",
        variant: "destructive",
      });
    },
  });

  const runMaintenanceSweepMutation = trpc.skills.runMaintenanceSweep.useMutation({
    onSuccess: (data) => {
      utils.skills.getUpgradeRecommendations.invalidate();
      toast({
        title: "Maintenance Sweep Complete",
        description: `Analyzed ${data.analyzedCount} skill(s).`,
      });
      setActiveTab("maintenance");
    },
    onError: (error) => {
      toast({
        title: "Sweep Failed",
        description: error.message || "Failed to run maintenance sweep",
        variant: "destructive",
      });
    },
  });

  const createMaintenanceScheduleMutation = trpc.skills.createMaintenanceSchedule.useMutation({
    onSuccess: () => {
      utils.skills.listMaintenanceSchedules.invalidate();
      setScheduleDraft({
        id: null,
        name: "",
        description: "",
        cronExpression: "0 9 * * 1",
        timezone: "Asia/Bangkok",
        status: "active",
        scopeType: "all_skills",
        scopeCategory: "",
        scopeExecutionMode: "",
        genjsCandidatesOnly: false,
        limit: "100",
        policyJsonText: "{}",
      });
      toast({
        title: "Schedule Saved",
        description: "The maintenance schedule has been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save maintenance schedule",
        variant: "destructive",
      });
    },
  });

  const updateMaintenanceScheduleMutation = trpc.skills.updateMaintenanceSchedule.useMutation({
    onSuccess: () => {
      utils.skills.listMaintenanceSchedules.invalidate();
      toast({
        title: "Schedule Updated",
        description: "The maintenance schedule has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update maintenance schedule",
        variant: "destructive",
      });
    },
  });

  // Share with groups mutation
  const shareWithGroupsMutation = trpc.skills.shareWithGroups.useMutation({
    onSuccess: () => {
      if (editingSkill) {
        utils.skills.getSkillGroups.invalidate({ skillId: editingSkill.id });
      }
      toast({
        title: "Group Added",
        description: "The skill is now shared with the selected group.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to share with group",
        variant: "destructive",
      });
    },
  });

  // Unshare group mutation
  const unshareGroupMutation = trpc.skills.unshareGroup.useMutation({
    onSuccess: () => {
      if (editingSkill) {
        utils.skills.getSkillGroups.invalidate({ skillId: editingSkill.id });
      }
      toast({
        title: "Group Removed",
        description: "The group no longer has access to this skill.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove group sharing",
        variant: "destructive",
      });
    },
  });

  const resetNewSkillForm = () => {
    setNewSkillData({
      slug: "",
      name: "",
      description: "",
      category: "other",
      version: "1.0.0",
      author: "",
      icon: "sparkles",
      tags: [],
      isAutoTrigger: false,
      triggerPatterns: [],
      isEnabled: true,
      enabledByDefault: true,
      visibleByDefault: true,
      creditMultiplier: 1.0,
      priority: 50,
      executionMode: "llm-only" as SkillExecutionMode,
      sandboxProfileSlug: null,
      requiresNetwork: null,
      requiresBrowser: null,
      maxRuntimeSeconds: null,
      maxInputMb: null,
      systemPrompt: "",
      skillContent: "",
      marketplaceContent: "",
      visibility: "private",
    });
  };

  const handleCreateSkill = () => {
    createMutation.mutate({
      ...newSkillData,
      description: newSkillData.description || undefined,
      author: newSkillData.author || undefined,
      executionMode: newSkillData.executionMode,
      sandboxProfileSlug: newSkillData.sandboxProfileSlug,
      requiresNetwork: newSkillData.requiresNetwork,
      requiresBrowser: newSkillData.requiresBrowser,
      maxRuntimeSeconds: newSkillData.maxRuntimeSeconds,
      maxInputMb: newSkillData.maxInputMb,
      systemPrompt: newSkillData.systemPrompt || undefined,
      skillContent: newSkillData.skillContent || undefined,
      marketplaceContent: newSkillData.marketplaceContent || undefined,
      visibility: newSkillData.visibility,
    });
  };

  const handleUpdateSkill = () => {
    if (!editingSkill) return;
    const nextConfigJson = {
      ...(editingSkill.configJson || {}),
      orchestration: {
        mode: (editingSkill as any)._orchestrationMode || "local",
        endpoint: ((editingSkill as any)._orchestrationEndpoint || "").trim() || null,
        skillTargets: ((editingSkill as any)._orchestrationSkillTargets || "")
          .split(",")
          .map((value: string) => value.trim())
          .filter(Boolean),
        parallel: (editingSkill as any)._orchestrationParallel ?? false,
        fallback: (editingSkill as any)._orchestrationFallback || "local",
      },
    };
    updateMutation.mutate({
      id: editingSkill.id,
      name: editingSkill.name,
      description: editingSkill.description || undefined,
      category: editingSkill.category,
      version: editingSkill.version || undefined,
      author: editingSkill.author || undefined,
      icon: editingSkill.icon || undefined,
      tags: editingSkill.tags,
      isAutoTrigger: editingSkill.isAutoTrigger,
      triggerPatterns: (editingSkill.triggerPatterns || []).map((pattern) => (
        pattern
      )),
      isEnabled: editingSkill.isEnabled,
      enabledByDefault: editingSkill.enabledByDefault,
      visibleByDefault: editingSkill.visibleByDefault,
      creditMultiplier: editingSkill.creditMultiplier,
      priority: editingSkill.priority,
      defaultModel: editingSkill.defaultModel,
      llmModelId: editingSkill.llmModelId ?? editingSkill.defaultModel,
      preferredProviderId: editingSkill.preferredProviderId ?? null,
      strictProviderPin: editingSkill.strictProviderPin ?? false,
      executionMode: editingSkill.executionMode || "llm-only",
      sandboxProfileSlug: editingSkill.sandboxProfileSlug,
      requiresNetwork: editingSkill.requiresNetwork,
      requiresBrowser: editingSkill.requiresBrowser,
      maxRuntimeSeconds: editingSkill.maxRuntimeSeconds,
      maxInputMb: editingSkill.maxInputMb,
      systemPrompt: editingSkill.systemPrompt,
      skillContent: editingSkill.skillContent,
      marketplaceContent: editingSkill.marketplaceContent,
      knowledgebase: editingSkill.knowledgebase,
      configJson: nextConfigJson,
      visibility: (editingSkill.visibility === "rejected" || editingSkill.visibility === "private")
        ? "private"
        : "public" as "private" | "public",
      executionPolicy: {
        // Spec 038 fields
        thinking_level_hint: (editingSkill as any)._thinkingLevel === "auto" ? null : (editingSkill as any)._thinkingLevel,
        requires_web_search: (editingSkill as any)._requiresWebSearch ?? false,
        min_citation_coverage: (editingSkill as any)._minCitationCoverage ?? 0,
        refresh_cadence_days: (editingSkill as any)._refreshCadenceDays ?? 30,
        disclosure_required: (editingSkill as any)._disclosureRequired ?? false,
        response_mode: (editingSkill as any)._responseMode ?? "markdown",
        // Feature 041 fields
        mode: (editingSkill as any)._execMode === "auto" ? undefined : (editingSkill as any)._execMode,
        allowConversationOverride: (editingSkill as any)._allowConvOverride ?? true,
        allowFreeModels: (editingSkill as any)._allowFreeModels ?? false,
        requirements: (() => {
          const r: Record<string, boolean | number | undefined> = {
            supportsVision: (editingSkill as any)._reqVision || undefined,
            supportsThinking: (editingSkill as any)._reqThinking || undefined,
            supportsFunctionTools: (editingSkill as any)._reqFunctionTools || undefined,
            supportsStructuredOutputs: (editingSkill as any)._reqStructuredOutputs || undefined,
            supportsJsonMode: (editingSkill as any)._reqJsonMode || undefined,
            supportsStrictToolSchema: (editingSkill as any)._reqStrictToolSchema || undefined,
            supportsWebSearch: (editingSkill as any)._reqWebSearch || undefined,
            supportsCodeExecution: (editingSkill as any)._reqCodeExecution || undefined,
            supportsComputerUse: (editingSkill as any)._reqComputerUse || undefined,
            supportsBackground: (editingSkill as any)._reqBackground || undefined,
            supportsResponses: (editingSkill as any)._reqResponses || undefined,
            contextLength: (editingSkill as any)._reqContextLength || undefined,
          };
          // Only send requirements if at least one capability is set
          return Object.values(r).some(Boolean) ? r : undefined;
        })(),
      },
    });
  };

  const handleZipUpload = async () => {
    if (!zipFile || !zipSlug) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string)?.split(",")[1];
      if (base64) {
        importZipMutation.mutate({
          fileName: zipFile.name,
          base64Content: base64,
          slug: zipSlug,
        });
      }
    };
    reader.readAsDataURL(zipFile);
  };

  const getCategoryIcon = (category: string) => {
    const Icon = categoryIcons[category] || Brain;
    return <Icon className="h-4 w-4" />;
  };

  const openStudio = (nextMode: "create" | "improve", skillId?: number) => {
    setStudioMode(nextMode);
    setStudioTargetSkillId(skillId ?? null);
    setIsStudioDialogOpen(true);
  };

  const selectedSkillExportSource = useMemo(() => {
    const configJson = (editingSkill?.configJson ?? null) as Record<string, any> | null;
    if (!configJson || configJson.source !== "agency_export") return null;
    const sourceAgencyId = typeof configJson.sourceAgencyId === "string" ? configJson.sourceAgencyId : null;
    const sourceAgencyName = typeof configJson.sourceAgencyName === "string" ? configJson.sourceAgencyName : null;
    return {
      sourceAgencyId,
      sourceAgencyName,
    };
  }, [editingSkill?.configJson]);

  const sourceGraphDuplicateLocation = useMemo(() => {
    if (!selectedSkillExportSource?.sourceAgencyId || !editingSkill) return null;
    const params = new URLSearchParams({
      autoExport: "1",
      duplicateSkillName: editingSkill.name,
      duplicateSkillDescription: editingSkill.description || "",
      duplicateSkillCategory: editingSkill.category || "chat_assistant",
    });
    return `/agencies/${selectedSkillExportSource.sourceAgencyId}/edit?${params.toString()}`;
  }, [editingSkill, selectedSkillExportSource?.sourceAgencyId]);

  const handleCopySourceGraphDuplicateLocation = useCallback(async () => {
    if (!sourceGraphDuplicateLocation) return;
    const url = `${window.location.origin}${sourceGraphDuplicateLocation}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Copied permalink",
        description: "The duplicate link has been copied to your clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Unable to copy the duplicate link right now.",
        variant: "destructive",
      });
    }
  }, [sourceGraphDuplicateLocation, toast]);

  if (authLoading || !user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation("/dashboard")}
        className="text-gray-600 mb-4"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        {t("admin.skillsPage.backToDashboard")}
      </Button>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("admin.skillsPage.title")}</h1>
          <p className="text-muted-foreground">
            {t("admin.skillsPage.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LocaleToggle className="shrink-0" />
          <Button variant="outline" onClick={() => openStudio("create")}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t("admin.skillsPage.actions.skillStudio")}
          </Button>
          <Button variant="outline" onClick={() => setIsZipDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t("admin.skillsPage.actions.importZip")}
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("admin.skillsPage.actions.createSkill")}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="skills">
            <Brain className="mr-2 h-4 w-4" />
            {t("admin.skillsPage.tabs.skills", { count: skills?.length || 0 })}
          </TabsTrigger>
          <TabsTrigger value="import">
            <FolderSync className="mr-2 h-4 w-4" />
            {t("admin.skillsPage.tabs.importFolders")}
          </TabsTrigger>
          <TabsTrigger value="proposals">
            <Sparkles className="mr-2 h-4 w-4" />
            {t("admin.skillsPage.tabs.iscProposals")}
            {iscProposals?.proposals && iscProposals.proposals.length > 0 && (
              <Badge className="ml-2" variant="secondary">
                {iscProposals.proposals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="maintenance">
            <ShieldCheck className="mr-2 h-4 w-4" />
            {t("admin.skillsPage.tabs.maintenance")}
            {!!maintenanceRecommendations?.length && (
              <Badge className="ml-2" variant="secondary">
                {maintenanceRecommendations.length}
              </Badge>
            )}
            {legacyUpgradeCriticalCount > 0 && (
              <Badge className="ml-2" variant="destructive">
                Critical {legacyUpgradeCriticalCount}
              </Badge>
            )}
            {legacyUpgradeHighCount > 0 && (
              <Badge className="ml-2" variant="outline">
                High {legacyUpgradeHighCount}
              </Badge>
            )}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="pending">
              <Clock className="mr-2 h-4 w-4" />
              {t("admin.skillsPage.tabs.pendingApproval")}
              {pendingSkills && pendingSkills.length > 0 && (
                <Badge className="ml-2" variant="destructive">
                  {pendingSkills.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="skills" className="space-y-6">
          {/* Filters */}
          <DashboardCard title={t("admin.skillsPage.filters.title")} leading={<Search className="h-5 w-5 text-slate-500" />}>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="search">{t("admin.skillsPage.filters.searchLabel")}</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder={t("admin.skillsPage.filters.searchPlaceholder")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">{t("admin.skillsPage.filters.categoryLabel")}</Label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("admin.skillsPage.filters.allCategories")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("admin.skillsPage.filters.allCategories")}</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name} ({cat.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.filters.statusLabel")}</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Switch
                      checked={showEnabledOnly}
                      onCheckedChange={setShowEnabledOnly}
                    />
                    <span className="text-sm">{t("admin.skillsPage.filters.enabledOnly")}</span>
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setFilterCategory("all");
                      setShowEnabledOnly(false);
                    }}
                  >
                    {t("admin.skillsPage.filters.reset")}
                  </Button>
                </div>
              </div>
            </div>
          </DashboardCard>

          {/* Skills List */}
          <DashboardCard
            title="Skills Library"
            description={`${skills?.length || 0} skill(s) in database`}
          >
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Visibility</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Auto-Trigger</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Bundle</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skills?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground">
                          No skills found. Create one or import from folders.
                        </TableCell>
                      </TableRow>
                    ) : (
                      skills?.map((skill) => (
                        <TableRow key={skill.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(skill.category)}
                              <div>
                                <div className="font-medium">{skill.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {skill.slug}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {(skill as any).ownerName || "System"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {(skill as any).visibility === "private" && (
                              <Badge variant="outline" className="border-gray-400 text-gray-600">
                                <Lock className="mr-1 h-3 w-3" />
                                Private
                              </Badge>
                            )}
                            {(skill as any).visibility === "pending_approval" && (
                              <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50">
                                <Clock className="mr-1 h-3 w-3" />
                                Pending Approval
                              </Badge>
                            )}
                            {(skill as any).visibility === "public" && (
                              <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                                <Globe className="mr-1 h-3 w-3" />
                                Public
                              </Badge>
                            )}
                            {(skill as any).visibility === "rejected" && (
                              <Badge variant="outline" className="border-red-500 text-red-600 bg-red-50">
                                <XCircle className="mr-1 h-3 w-3" />
                                Rejected
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {categoryLabels[skill.category] || skill.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {skill.isAutoTrigger ? (
                              <Badge className="bg-purple-100 text-purple-800">
                                <Zap className="mr-1 h-3 w-3" />
                                Auto
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">Manual</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={skill.creditMultiplier > 1 ? "text-orange-600 font-medium" : ""}>
                              {skill.creditMultiplier}x
                            </span>
                          </TableCell>
                          <TableCell>{skill.priority}</TableCell>
                          <TableCell>
                            {skill.isEnabled ? (
                              <Badge variant="outline" className="border-green-500 text-green-500">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Enabled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-500 text-red-500">
                                <XCircle className="mr-1 h-3 w-3" />
                                Disabled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {skill.importSource || "manual"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "border",
                                  skill.nativeBundleReady
                                    ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                                    : skill.hasLocalFolder
                                      ? "border-amber-500 text-amber-700 bg-amber-50"
                                      : "border-slate-300 text-slate-500 bg-slate-50",
                                )}
                                title={
                                  skill.nativeBundleFiles?.length
                                    ? skill.nativeBundleFiles.join(", ")
                                    : skill.nativeBundlePath || skill.folderPath || undefined
                                }
                              >
                              {getNativeBundleLabel(t, skill)}
                              </Badge>
                              {skill.nativeBundleFiles?.length ? (
                                <span className="text-xs text-muted-foreground">
                                  {skill.nativeBundleFiles.length} files
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => analyzeUpgradeMutation.mutate({ skillId: skill.id })}
                                disabled={analyzeUpgradeMutation.isPending}
                              >
                                <ShieldCheck className="h-3 w-3 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const latest = latestRecommendationBySkillId.get(skill.id);
                                  setMaintenanceSkillFilter(skill.id);
                                  setActiveTab("maintenance");
                                  if (latest) {
                                    setSelectedRecommendationId(latest.id);
                                  }
                                }}
                              >
                                <Clock className="h-3 w-3 text-slate-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const latest = latestRecommendationBySkillId.get(skill.id);
                                  if (latest && latest.status !== "applied") {
                                    requestRecommendationApply(latest, skill.name);
                                    return;
                                  }
                                  setMaintenanceSkillFilter(skill.id);
                                  setActiveTab("maintenance");
                                  if (latest) {
                                    setSelectedRecommendationId(latest.id);
                                  }
                                }}
                                disabled={applyUpgradeMutation.isPending}
                              >
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              </Button>
                              {(isAdmin || skill.createdBy === Number(user?.id)) && skill.hasLocalFolder && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openStudio("improve", skill.id)}
                                >
                                  <Sparkles className="h-3 w-3 text-amber-600" />
                                </Button>
                              )}
                              {(isAdmin || skill.createdBy === Number(user?.id)) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setEditingSkill((() => {
                                      const normalizedExecutionMode = isExecutionModeCompatibleWithSkillCategory(
                                        skill.category,
                                        (skill as any).executionMode ?? "llm-only",
                                      )
                                        ? ((skill as any).executionMode ?? "llm-only")
                                        : (getRecommendedExecutionModeForSkillCategory(skill.category) || "llm-only");
                                      const ep = (skill as any).executionPolicyJson ?? {};
                                      const orchestration = getOrchestrationConfig((skill as any).configJson ?? null);
                                      return applySandboxDefaults({
                                        ...(skill as any),
                                        triggerPatterns: ((skill as any).triggerPatterns || []).map((pattern: any) =>
                                          typeof pattern === "string" ? pattern : pattern?.pattern || ""
                                        ),
                                        executionMode: normalizedExecutionMode,
                                        marketplaceContent: (skill as any).marketplaceContent ?? null,
                                        _thinkingLevel: ep.thinking_level_hint ?? "auto",
                                        _responseMode: ep.response_mode ?? "markdown",
                                        _minCitationCoverage: ep.min_citation_coverage ?? 0,
                                        _refreshCadenceDays: ep.refresh_cadence_days ?? 30,
                                        _requiresWebSearch: ep.requires_web_search ?? false,
                                        _disclosureRequired: ep.disclosure_required ?? false,
                                        // Feature 041 fields
                                        _execMode: ep.mode ?? "auto",
                                        _allowConvOverride: ep.allowConversationOverride ?? true,
                                        _allowFreeModels: ep.allowFreeModels ?? false,
                                        _reqVision: ep.requirements?.supportsVision ?? false,
                                        _reqThinking: ep.requirements?.supportsThinking ?? false,
                                        _reqFunctionTools: ep.requirements?.supportsFunctionTools ?? false,
                                        _reqStructuredOutputs: ep.requirements?.supportsStructuredOutputs ?? false,
                                        _reqJsonMode: ep.requirements?.supportsJsonMode ?? false,
                                        _reqStrictToolSchema: ep.requirements?.supportsStrictToolSchema ?? false,
                                        _reqWebSearch: ep.requirements?.supportsWebSearch ?? false,
                                        _reqCodeExecution: ep.requirements?.supportsCodeExecution ?? false,
                                        _reqComputerUse: ep.requirements?.supportsComputerUse ?? false,
                                        _reqBackground: ep.requirements?.supportsBackground ?? false,
                                        _reqResponses: ep.requirements?.supportsResponses ?? false,
                                        _reqContextLength: ep.requirements?.contextLength ?? null,
                                        _orchestrationMode: orchestration.mode,
                                        _orchestrationEndpoint: orchestration.endpoint,
                                        _orchestrationSkillTargets: orchestration.skillTargets,
                                        _orchestrationParallel: orchestration.parallel,
                                        _orchestrationFallback: orchestration.fallback,
                                      } as Skill, normalizedExecutionMode);
                                    })())
                                  }
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              )}
                              {(isAdmin || skill.createdBy === Number(user?.id)) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteMutation.mutate({ id: skill.id })}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
          </DashboardCard>
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          <DashboardCard
            title="Skill Folders"
            description="Skill folders found in /skills directory. Import them into the database."
            leading={<FolderOpen className="h-5 w-5 text-slate-500" />}
          >
              <div className="flex justify-end mb-4">
                <Button variant="outline" onClick={() => refetchFolders()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Scan Folders
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folder</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Has Manifest</TableHead>
                    <TableHead>Has Python</TableHead>
                    <TableHead>Has JS</TableHead>
                    <TableHead>In Database</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!folders || folders.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No skill folders found. Create folders in /skills directory.
                      </TableCell>
                    </TableRow>
                  ) : (
                    folders.map((folder) => (
                      <TableRow key={folder.slug}>
                        <TableCell className="font-mono">{folder.slug}</TableCell>
                        <TableCell>
                          {folder.metadata?.name || folder.slug}
                        </TableCell>
                        <TableCell>
                          {folder.hasSkillMd ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span className="text-xs text-muted-foreground">{folder.manifestFileName || "manifest"}</span>
                            </div>
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {folder.hasPython ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {folder.hasJs ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {folder.existsInDb ? (
                            <Badge variant="outline" className="border-green-500 text-green-500">
                              Imported
                            </Badge>
                          ) : (
                            <Badge variant="outline">Not imported</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {folder.existsInDb ? (
                            <span className="text-muted-foreground text-sm">Already imported</span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => importFolderMutation.mutate({ slug: folder.slug })}
                              disabled={importFolderMutation.isPending}
                            >
                              <FolderSync className="mr-2 h-3 w-3" />
                              Import
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
          </DashboardCard>
        </TabsContent>

        <TabsContent value="proposals" className="space-y-6">
          <DashboardCard
            title="ISC Proposal Queue"
            description="Review and apply improvement proposals generated by Skill Studio."
            leading={<Sparkles className="h-5 w-5 text-slate-500" />}
          >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Skill</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Round</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!iscProposals?.proposals?.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No pending ISC proposals.
                      </TableCell>
                    </TableRow>
                  ) : (
                    iscProposals.proposals.map((proposal) => (
                      <TableRow key={`${proposal.skillName}-${proposal.diffFile}`}>
                        <TableCell>
                          <div className="font-medium">{proposal.skillName}</div>
                          <div className="text-xs text-muted-foreground">{proposal.diffFile}</div>
                        </TableCell>
                        <TableCell>{proposal.ownerName || "Unknown"}</TableCell>
                        <TableCell>{proposal.round || "-"}</TableCell>
                        <TableCell>{proposal.createdAt}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewProposal({ skillName: proposal.skillName, diffFile: proposal.diffFile })}
                            >
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => applyProposalMutation.mutate({ skillName: proposal.skillName, diffFile: proposal.diffFile })}
                              disabled={applyProposalMutation.isPending}
                            >
                              Apply
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
          </DashboardCard>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-6">
          <DashboardCard
            title="Maintenance Queue"
            description="Analyze skills, review upgrade advice, and apply only safe, non-breaking improvements."
            leading={<ShieldCheck className="h-5 w-5 text-slate-500" />}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Status Filter</Label>
                  <Select value={maintenanceStatusFilter} onValueChange={setMaintenanceStatusFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending_review">Pending Review</SelectItem>
                      <SelectItem value="applied">Applied</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Skill Filter</Label>
                  <Select
                    value={maintenanceSkillFilter ? String(maintenanceSkillFilter) : "__all__"}
                    onValueChange={(value) => setMaintenanceSkillFilter(value === "__all__" ? null : Number(value))}
                  >
                    <SelectTrigger className="w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Skills</SelectItem>
                      {(skills || []).map((skill) => (
                        <SelectItem key={skill.id} value={String(skill.id)}>
                          {skill.name} ({skill.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  onClick={() => runMaintenanceSweepMutation.mutate({ limit: 100 })}
                  disabled={runMaintenanceSweepMutation.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {runMaintenanceSweepMutation.isPending ? "Sweeping..." : "Sweep Skills"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => refetchMaintenanceRecommendations()}
                >
                  Refresh Queue
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAllMaintenanceSkillDetails(true)}
                  disabled={maintenanceRecommendationGroups.length === 0}
                >
                  Expand all groups
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedMaintenanceSkillIds([])}
                  disabled={expandedMaintenanceSkillIds.length === 0}
                >
                  Collapse all groups
                </Button>
                <Badge variant="outline" className="rounded-full">
                  {maintenanceRecommendationGroups.length} skill groups
                </Badge>
                <Button
                  size="sm"
                  onClick={requestEligibleMaintenanceApplyForView}
                  disabled={maintenanceEligibleRecommendationIds.length === 0 || applyMaintenanceRecommendationsMutation.isPending}
                >
                  Apply Eligible Across View ({maintenanceEligibleRecommendationIds.length})
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Skill</TableHead>
                    <TableHead>Advice</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Compatibility</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Runtime</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!maintenanceRecommendationGroups.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No maintenance recommendations in this view yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    maintenanceRecommendationGroups.map((group) => {
                      const isExpanded = maintenanceExpandedSkillIdSet.has(group.skillId);
                      const recommendationCount = group.recommendations.length;

                      return (
                        <Fragment key={group.skillId}>
                          <TableRow>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="font-medium">{group.skill?.name || `Skill #${group.skillId}`}</div>
                                  <div className="text-xs text-muted-foreground">{group.skill?.slug || group.skillId}</div>
                                </div>
                                <Badge variant="secondary" className="rounded-full">
                                  {recommendationCount}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium">{group.primaryRecommendation.title}</div>
                                <Badge variant="secondary" className="rounded-full">
                                  Highest priority
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {group.primaryRecommendation.recommendationType}
                                {recommendationCount > 1 ? ` · ${recommendationCount} recommendations` : ""}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  group.highestRiskLevel === "critical" ? "border-red-500 text-red-600" :
                                  group.highestRiskLevel === "high" ? "border-orange-500 text-orange-600" :
                                  group.highestRiskLevel === "medium" ? "border-amber-500 text-amber-600" :
                                  "border-green-500 text-green-600"
                                }
                              >
                                {group.highestRiskLevel}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  group.worstCompatibilityStatus === "blocked" ? "border-red-500 text-red-600" :
                                  group.worstCompatibilityStatus === "warning" ? "border-amber-500 text-amber-600" :
                                  group.worstCompatibilityStatus === "compatible" ? "border-green-500 text-green-600" :
                                  ""
                                }
                              >
                                {group.worstCompatibilityStatus}
                              </Badge>
                            </TableCell>
                            <TableCell>{group.highestQualityScore ?? "-"}</TableCell>
                            <TableCell>
                              <div className="text-sm">{group.currentRuntime || "unknown"}</div>
                              {group.recommendations.some((item) => item.isGenjsCandidate) && (
                                <Badge variant="secondary" className="mt-1">GenJS Candidate</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedRecommendationId(group.primaryRecommendation.id)}
                                >
                                  View Advice
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => requestMaintenanceGroupApply(group)}
                                  disabled={applyMaintenanceRecommendationsMutation.isPending}
                                >
                                  Apply All ({recommendationCount})
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => requestEligibleMaintenanceGroupApply(group)}
                                  disabled={
                                    applyMaintenanceRecommendationsMutation.isPending
                                    || group.recommendations.filter((item) => item.isAutoApplySafe && item.status !== "applied" && item.status !== "dismissed").length === 0
                                  }
                                >
                                  Apply Eligible ({group.recommendations.filter((item) => item.isAutoApplySafe && item.status !== "applied" && item.status !== "dismissed").length})
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleMaintenanceSkillDetails(group.skillId, !isExpanded)}
                                >
                                  {isExpanded ? "Hide Details" : "Details"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={7} className="bg-muted/20">
                                <div className="space-y-3 p-3">
                                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Recommendations
                                  </div>
                                  <div className="space-y-3">
                                    {group.recommendations.map((item) => (
                                      <div key={item.id} className="rounded-lg border bg-background p-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <div className="font-medium">{item.title}</div>
                                              {item.id === group.primaryRecommendation.id && (
                                                <Badge variant="secondary" className="rounded-full">
                                                  Highest priority
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {item.recommendationType} · {item.status}
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge
                                              variant="outline"
                                              className={
                                                item.riskLevel === "critical" ? "border-red-500 text-red-600" :
                                                item.riskLevel === "high" ? "border-orange-500 text-orange-600" :
                                                item.riskLevel === "medium" ? "border-amber-500 text-amber-600" :
                                                "border-green-500 text-green-600"
                                              }
                                            >
                                              {item.riskLevel}
                                            </Badge>
                                            <Badge
                                              variant="outline"
                                              className={
                                                item.compatibilityStatus === "blocked" ? "border-red-500 text-red-600" :
                                                item.compatibilityStatus === "warning" ? "border-amber-500 text-amber-600" :
                                                item.compatibilityStatus === "compatible" ? "border-green-500 text-green-600" :
                                                ""
                                              }
                                            >
                                              {item.compatibilityStatus}
                                            </Badge>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => setSelectedRecommendationId(item.id)}
                                            >
                                              View Advice
                                            </Button>
                                            <Button
                                              size="sm"
                                              onClick={() => requestRecommendationApply(item, group.skill?.name || `Skill #${group.skillId}`)}
                                              disabled={item.status === "applied" || applyUpgradeMutation.isPending}
                                            >
                                              {item.isAutoApplySafe ? "Apply Upgrade" : "Generate Proposal"}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => dismissRecommendationMutation.mutate({ recommendationId: item.id })}
                                              disabled={dismissRecommendationMutation.isPending}
                                            >
                                              Dismiss
                                            </Button>
                                          </div>
                                        </div>
                                        {Array.isArray(item.recommendationJson?.affectedFiles) && item.recommendationJson.affectedFiles.length > 0 && (
                                          <div className="mt-2 text-xs text-muted-foreground">
                                            Affects: {item.recommendationJson.affectedFiles.join(", ")}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Legacy Upgrade Queue"
            description="Prioritized legacy skill upgrades that can move to the native bundle contract in parallel."
            leading={<FolderSync className="h-5 w-5 text-slate-500" />}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="legacy-upgrade-include-applied"
                      checked={legacyUpgradeIncludeApplied}
                      onCheckedChange={(checked) => setLegacyUpgradeIncludeApplied(Boolean(checked))}
                    />
                    <Label htmlFor="legacy-upgrade-include-applied" className="cursor-pointer">
                      Include applied items
                    </Label>
                  </div>

                  <div className="flex items-center gap-3">
                  <Checkbox
                    id="legacy-upgrade-select-all"
                    checked={someVisibleLegacySelected ? "indeterminate" : allVisibleLegacySelected}
                    onCheckedChange={(checked) => toggleAllVisibleLegacyUpgrades(Boolean(checked))}
                  />
                    <Label htmlFor="legacy-upgrade-select-all" className="cursor-pointer">
                      Select visible
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {selectedLegacyUpgradeIds.length} selected
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="legacy-upgrade-expand-all"
                      checked={allExpandedLegacySelected}
                      onCheckedChange={(checked) => toggleAllLegacyUpgradeDetails(Boolean(checked))}
                    />
                    <Label htmlFor="legacy-upgrade-expand-all" className="cursor-pointer">
                      Expand all
                    </Label>
                    <Button variant="ghost" size="sm" onClick={collapseAllLegacyUpgradeDetails} disabled={expandedLegacyUpgradeIds.length === 0}>
                      Collapse all
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedLegacyUpgradeIds([])}
                    disabled={selectedLegacyUpgradeIds.length === 0}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => applyLegacyUpgradeRecommendationsMutation.mutate({
                      recommendationIds: selectedEligibleLegacyUpgradeIds,
                    })}
                    disabled={selectedEligibleLegacyUpgradeIds.length === 0 || applyLegacyUpgradeRecommendationsMutation.isPending}
                  >
                    {applyLegacyUpgradeRecommendationsMutation.isPending
                      ? "Queuing eligible..."
                      : `Queue only eligible (${selectedEligibleLegacyUpgradeIds.length})`}
                  </Button>
                  <Button
                    onClick={() => applyLegacyUpgradeRecommendationsMutation.mutate({
                      recommendationIds: selectedSelectableLegacyUpgradeIds,
                    })}
                    disabled={selectedSelectableLegacyUpgradeIds.length === 0 || applyLegacyUpgradeRecommendationsMutation.isPending}
                  >
                    {applyLegacyUpgradeRecommendationsMutation.isPending
                      ? "Queuing..."
                      : `Queue all selected (${selectedSelectableLegacyUpgradeIds.length})`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => applyLegacyUpgradeRecommendationsMutation.mutate({
                      recommendationIds: selectedCriticalHighLegacyUpgradeIds,
                    })}
                    disabled={selectedCriticalHighLegacyUpgradeIds.length === 0 || applyLegacyUpgradeRecommendationsMutation.isPending}
                  >
                    {applyLegacyUpgradeRecommendationsMutation.isPending
                      ? "Queuing priority..."
                      : `Queue critical/high (${selectedCriticalHighLegacyUpgradeIds.length})`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => refetchLegacyUpgradeQueue()}
                    disabled={isLegacyUpgradeQueueFetching}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {isLegacyUpgradeQueueFetching ? "Refreshing..." : "Refresh Upgrade Queue"}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Filter View
                </span>
                {legacyUpgradeQueueFilterRestoredFromStorage && (
                  <Badge variant="outline" className="rounded-full border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
                    Loaded from saved preference
                  </Badge>
                )}
                {[
                  { key: "all", label: "All", count: legacyUpgradeQueueItems.length },
                  { key: "critical", label: "Critical", count: legacyUpgradeCriticalCount },
                  { key: "high", label: "High", count: legacyUpgradeHighCount },
                  { key: "parallel", label: "Parallel", count: legacyUpgradeQueueItems.filter((item) => item.parallelUpgradeEligible).length },
                  { key: "eligible", label: "Eligible", count: legacyUpgradeQueueItems.filter((item) => item.status !== "applied" && item.status !== "dismissed").length },
                ].map((filter) => (
                  <Button
                    key={filter.key}
                    variant={legacyUpgradeQueueFilter === filter.key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLegacyUpgradeQueueFilter(filter.key as typeof legacyUpgradeQueueFilter)}
                    className="rounded-full"
                  >
                    {filter.label}
                    <Badge variant={legacyUpgradeQueueFilter === filter.key ? "secondary" : "outline"} className="ml-2 rounded-full px-2 text-[11px]">
                      {filter.count}
                    </Badge>
                  </Button>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Queued</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyUpgradeQueueItems.length}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Parallel Eligible</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {legacyUpgradeQueueItems.filter((item) => item.parallelUpgradeEligible).length}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Critical</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {legacyUpgradeCriticalCount}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">High</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyUpgradeHighCount}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 md:col-span-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="rounded-full">
                      {legacyUpgradeQueueItems.length} total
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {legacyUpgradeQueueItems.filter((item) => item.parallelUpgradeEligible).length} parallel eligible
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {legacyUpgradeCriticalCount} critical
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {legacyUpgradeHighCount} high
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {selectedLegacyUpgradeIds.length} selected
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {legacyUpgradeIncludeApplied ? "applied included" : "applied hidden"}
                    </Badge>
                  </div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allVisibleLegacySelected}
                        onCheckedChange={(checked) => toggleAllVisibleLegacyUpgrades(Boolean(checked))}
                        aria-label="Select all visible legacy upgrades"
                      />
                    </TableHead>
                    <TableHead>Skill</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Signals</TableHead>
                    <TableHead>Runtime</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!legacyUpgradeQueueItems.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No legacy upgrade recommendations in this view yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    legacyUpgradeFilteredItems.map((item, index) => (
                      <Fragment key={item.id}>
                        <TableRow>
                          <TableCell>
                            <Checkbox
                              checked={selectedLegacyUpgradeIdSet.has(item.id)}
                              onCheckedChange={(checked) => toggleLegacyUpgradeSelection(item.id, Boolean(checked))}
                              disabled={item.status === "applied" || item.status === "dismissed"}
                              aria-label={`Select ${item.skill?.name || `Skill #${item.skillId}`}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                #{index + 1}
                              </div>
                              <div>
                                <div className="font-medium">{item.skill?.name || `Skill #${item.skillId}`}</div>
                                <div className="text-xs text-muted-foreground">{item.skill?.slug || item.skillId}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  item.upgradePriorityTier === "urgent" && "border-red-500 text-red-600 bg-red-50",
                                  item.upgradePriorityTier === "high" && "border-orange-500 text-orange-600 bg-orange-50",
                                  item.upgradePriorityTier === "medium" && "border-amber-500 text-amber-600 bg-amber-50",
                                  item.upgradePriorityTier === "low" && "border-slate-400 text-slate-600 bg-slate-50",
                                )}
                              >
                                {item.upgradePriorityTier}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                Score {item.upgradePriorityScore.toFixed(1)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {item.parallelUpgradeEligible && (
                                <Badge variant="secondary">Parallel</Badge>
                              )}
                              {item.isGenjsCandidate && (
                                <Badge variant="secondary">GenJS Candidate</Badge>
                              )}
                              <Badge variant="outline">{item.recommendationType}</Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {Object.entries(item.legacyUpgradeSignals || {}).map(([key, value]) => (
                                <Badge
                                  key={key}
                                  variant="outline"
                                  className={cn(
                                    value ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "border-slate-300 text-slate-500 bg-slate-50",
                                  )}
                                >
                                  {describeLegacyUpgradeSignal(key, value)}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{item.currentRuntime || "unknown"}</div>
                            {item.proposedRuntime && (
                              <div className="text-xs text-muted-foreground">→ {item.proposedRuntime}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                item.status === "applied" && "border-green-500 text-green-600 bg-green-50",
                                item.status === "blocked" && "border-red-500 text-red-600 bg-red-50",
                                item.status === "failed" && "border-orange-500 text-orange-600 bg-orange-50",
                                item.status === "pending_review" && "border-slate-400 text-slate-600 bg-slate-50",
                              )}
                            >
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedRecommendationId(item.id)}
                              >
                                View Advice
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => requestRecommendationApply(item, item.skill?.name || `Skill #${item.skillId}`)}
                                disabled={item.status === "applied" || applyUpgradeMutation.isPending}
                              >
                                {item.isAutoApplySafe ? "Apply Upgrade" : "Generate Proposal"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleLegacyUpgradeDetails(item.id, !expandedLegacyUpgradeIdSet.has(item.id))}
                              >
                                {expandedLegacyUpgradeIdSet.has(item.id) ? "Hide Details" : "Details"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleLegacyUpgradeSelection(item.id, !selectedLegacyUpgradeIdSet.has(item.id))}
                              >
                                {selectedLegacyUpgradeIdSet.has(item.id) ? "Unselect" : "Select"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedLegacyUpgradeIdSet.has(item.id) && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-slate-50/70 p-0">
                              <div className="border-t border-slate-200 px-4 py-4">
                                <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                      Priority Snapshot
                                    </div>
                                    <div className="space-y-2 text-sm text-slate-700">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">Priority score</span>
                                        <span className="font-medium">{item.upgradePriorityScore.toFixed(1)}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">Priority tier</span>
                                        <span className="font-medium">{item.upgradePriorityTier}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">Parallel eligible</span>
                                        <span className="font-medium">{item.parallelUpgradeEligible ? "Yes" : "No"}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">Current runtime</span>
                                        <span className="font-medium">{item.currentRuntime || "unknown"}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">Proposed runtime</span>
                                        <span className="font-medium">{item.proposedRuntime || "unchanged"}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                      Signal Breakdown
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {Object.entries(item.legacyUpgradeSignals || {}).length > 0 ? (
                                        Object.entries(item.legacyUpgradeSignals || {}).map(([key, value]) => (
                                          <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="text-sm font-medium text-slate-800">
                                                {key}
                                              </div>
                                              <Badge
                                                variant="outline"
                                                className={cn(
                                                  value ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "border-slate-300 text-slate-500 bg-slate-50",
                                                )}
                                              >
                                                {value ? "present" : "missing"}
                                              </Badge>
                                            </div>
                                            <div className="mt-2 text-xs text-slate-600">
                                              {describeLegacyUpgradeSignal(key, value)}
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600 md:col-span-2">
                                          No legacy upgrade signals were recorded for this recommendation.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Maintenance Schedules"
            description="Store recurring review policies so admins can revisit the queue later."
            leading={<Clock className="h-5 w-5 text-slate-500" />}
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={scheduleDraft.name}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, name: e.target.value })}
                    placeholder="Weekly skill review"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cron</Label>
                  <Input
                    value={scheduleDraft.cronExpression}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, cronExpression: e.target.value })}
                    placeholder="0 9 * * 1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input
                    value={scheduleDraft.timezone}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, timezone: e.target.value })}
                    placeholder="Asia/Bangkok"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={saveMaintenanceSchedule}
                    disabled={!scheduleDraft.name || createMaintenanceScheduleMutation.isPending || updateMaintenanceScheduleMutation.isPending}
                  >
                    {scheduleDraft.id ? "Update Schedule" : "Save Schedule"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={scheduleDraft.status}
                    onValueChange={(value) => setScheduleDraft({ ...scheduleDraft, status: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Scope Type</Label>
                  <Select
                    value={scheduleDraft.scopeType}
                    onValueChange={(value) => setScheduleDraft({ ...scheduleDraft, scopeType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_skills">All skills</SelectItem>
                      <SelectItem value="category">By category</SelectItem>
                      <SelectItem value="execution_mode">By execution mode</SelectItem>
                      <SelectItem value="genjs_candidates">GenJS candidates</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category Filter</Label>
                  <Input
                    value={scheduleDraft.scopeCategory}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, scopeCategory: e.target.value })}
                    placeholder="slide_generation"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Execution Mode Filter</Label>
                  <Input
                    value={scheduleDraft.scopeExecutionMode}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, scopeExecutionMode: e.target.value })}
                    placeholder="sandbox-command"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Limit</Label>
                  <Input
                    value={scheduleDraft.limit}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, limit: e.target.value })}
                    placeholder="100"
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center justify-between rounded-lg border bg-white/60 px-3 py-2 w-full">
                    <div>
                      <Label className="text-xs font-medium">GenJS candidates only</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Skip skills that do not meet the current GenJS heuristics.
                      </p>
                    </div>
                    <Switch
                      checked={scheduleDraft.genjsCandidatesOnly}
                      onCheckedChange={(checked) => setScheduleDraft({ ...scheduleDraft, genjsCandidatesOnly: checked })}
                    />
                  </div>
                </div>
                <div className="flex items-end justify-end">
                  {scheduleDraft.id && (
                    <Button
                      variant="outline"
                      onClick={() => setScheduleDraft({
                        id: null,
                        name: "",
                        description: "",
                        cronExpression: "0 9 * * 1",
                        timezone: "Asia/Bangkok",
                        status: "active",
                        scopeType: "all_skills",
                        scopeCategory: "",
                        scopeExecutionMode: "",
                        genjsCandidatesOnly: false,
                        limit: "100",
                        policyJsonText: "{}",
                      })}
                    >
                      New Schedule
                    </Button>
                  )}
                </div>
              </div>

              <Textarea
                value={scheduleDraft.description}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, description: e.target.value })}
                rows={2}
                placeholder="Optional description for admins reviewing this schedule later"
              />

              <Textarea
                value={scheduleDraft.policyJsonText}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, policyJsonText: e.target.value })}
                rows={4}
                className="font-mono text-xs"
                placeholder='{"notifyAdmins": true}'
              />

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cron</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Timezone</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!maintenanceSchedules?.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No maintenance schedules saved yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ((maintenanceSchedules || []) as any[]).map((schedule: MaintenanceSchedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell>
                          <div className="font-medium">{schedule.name}</div>
                          {schedule.description && (
                            <div className="text-xs text-muted-foreground">{schedule.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{schedule.status}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{schedule.cronExpression || "-"}</TableCell>
                        <TableCell>{schedule.scopeType}</TableCell>
                        <TableCell>{schedule.timezone}</TableCell>
                        <TableCell>{schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "-"}</TableCell>
                        <TableCell>{new Date(schedule.updatedAt).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setScheduleDraft(buildScheduleDraftFromExisting(schedule))}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateMaintenanceScheduleMutation.mutate({
                                id: schedule.id,
                                status: schedule.status === "active" ? "paused" : "active",
                              })}
                              disabled={updateMaintenanceScheduleMutation.isPending}
                            >
                              {schedule.status === "active" ? "Pause" : "Activate"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </DashboardCard>
        </TabsContent>

        {/* Pending Approval Tab — Admin Only */}
        {isAdmin && (
          <TabsContent value="pending" className="space-y-6">
            <DashboardCard
              title="Skills Pending Approval"
              description="Review and approve or reject user-submitted public skills."
              leading={<Clock className="h-5 w-5 text-slate-500" />}
            >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!pendingSkills || pendingSkills.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No skills pending approval.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingSkills.map((skill: any) => (
                        <TableRow key={skill.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(skill.category)}
                              <div>
                                <div className="font-medium">{skill.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {skill.slug}
                                </div>
                                {skill.description && (
                                  <div className="text-xs text-muted-foreground mt-0.5 max-w-[300px] truncate">
                                    {skill.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {skill.ownerName || "Unknown"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {categoryLabels[skill.category] || skill.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {new Date(skill.createdAt).toLocaleDateString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 border-green-300 hover:bg-green-50"
                                onClick={() => approveMutation.mutate({ skillId: skill.id })}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 border-red-300 hover:bg-red-50"
                                onClick={() => setRejectingSkill(skill)}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
            </DashboardCard>
          </TabsContent>
        )}
      </Tabs>

      <SkillStudioDialog
        open={isStudioDialogOpen}
        onOpenChange={setIsStudioDialogOpen}
        scope="admin"
        initialMode={studioMode}
        initialTargetSkillId={studioTargetSkillId}
        availableSkills={(skills || []).map((skill: any) => ({
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          description: skill.description,
          visibility: skill.visibility,
          isOwner: skill.createdBy === Number(user?.id),
          hasLocalFolder: skill.hasLocalFolder,
        }))}
        onCompleted={() => {
          utils.skills.listFromDb.invalidate();
          utils.skills.listPending.invalidate();
          utils.skills.listIscProposals.invalidate();
        }}
      />

      {/* Reject Skill Dialog */}
      <Dialog open={!!rejectingSkill} onOpenChange={() => { setRejectingSkill(null); setRejectReason(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Skill</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting "{rejectingSkill?.name}". The skill owner will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-reason">Rejection Reason *</Label>
              <Textarea
                id="reject-reason"
                placeholder="Please provide a reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectingSkill(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectingSkill && rejectReason.trim()) {
                  rejectMutation.mutate({
                    skillId: rejectingSkill.id,
                    reason: rejectReason.trim(),
                  });
                }
              }}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject Skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewProposal} onOpenChange={() => setPreviewProposal(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Proposal Preview</DialogTitle>
            <DialogDescription>
              {previewProposal?.skillName} / {previewProposal?.diffFile}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={proposalPreviewData?.content || ""}
            readOnly
            rows={20}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewProposal(null)}>
              Close
            </Button>
            {previewProposal && (
              <Button
                onClick={() => applyProposalMutation.mutate(previewProposal)}
                disabled={applyProposalMutation.isPending}
              >
                Apply Proposal
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingMaintenanceApply} onOpenChange={() => setPendingMaintenanceApply(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {pendingMaintenanceApply?.isAutoApplySafe ? "Apply Upgrade" : "Generate Proposal"}
            </DialogTitle>
            <DialogDescription>
              {pendingMaintenanceApply?.skillName} • {pendingMaintenanceApply?.recommendationTitle}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            {pendingMaintenanceApply?.isAutoApplySafe ? (
              <p>This upgrade can be applied directly through the maintenance pipeline.</p>
            ) : (
              <>
                <p>
                  This recommendation is not marked auto-safe. The system will generate an ISC proposal first so admin can review the diff before changing the live skill.
                </p>
                {pendingMaintenanceApply?.hasProposalReady && (
                  <p>
                    A proposal already exists for this skill. You can review that proposal in the Proposals tab instead of generating a new one.
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMaintenanceApply(null)}>
              Cancel
            </Button>
            {pendingMaintenanceApply?.hasProposalReady && !pendingMaintenanceApply?.isAutoApplySafe && (
              <Button
                variant="outline"
                onClick={() => {
                  setPendingMaintenanceApply(null);
                  setActiveTab("proposals");
                }}
              >
                Open Proposals
              </Button>
            )}
            {pendingMaintenanceApply && (
              <Button
                onClick={() => applyUpgradeMutation.mutate({ recommendationId: pendingMaintenanceApply.recommendationId })}
                disabled={applyUpgradeMutation.isPending}
              >
                {pendingMaintenanceApply.isAutoApplySafe ? "Apply Now" : "Generate Proposal"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedRecommendationId} onOpenChange={() => setSelectedRecommendationId(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Maintenance Advice</DialogTitle>
            <DialogDescription>
              {selectedRecommendationDetail?.skill?.name || "Selected skill"}{" "}
              {selectedRecommendationDetail?.recommendation?.recommendationType
                ? `• ${selectedRecommendationDetail.recommendation.recommendationType}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedRecommendationDetail?.recommendation ? (
            <div className="space-y-4">
              {selectedRecommendationDetail.skill?.slug && latestProposalBySkillName.has(selectedRecommendationDetail.skill.slug) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-sm">
                  A proposal is already available for this skill in the ISC proposal queue.
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const proposal = latestProposalBySkillName.get(selectedRecommendationDetail.skill!.slug)!;
                        setPreviewProposal({
                          skillName: proposal.skillName,
                          diffFile: proposal.diffFile,
                          recommendationId: selectedRecommendationDetail.recommendation.id,
                        });
                      }}
                    >
                      Preview Proposal
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        const proposal = latestProposalBySkillName.get(selectedRecommendationDetail.skill!.slug)!;
                        applyProposalMutation.mutate({
                          skillName: proposal.skillName,
                          diffFile: proposal.diffFile,
                          recommendationId: selectedRecommendationDetail.recommendation.id,
                        });
                      }}
                      disabled={applyProposalMutation.isPending}
                    >
                      Apply Proposal
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Risk</div>
                  <div className="font-medium">{selectedRecommendationDetail.recommendation.riskLevel}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Compatibility</div>
                  <div className="font-medium">{selectedRecommendationDetail.recommendation.compatibilityStatus}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Quality Score</div>
                  <div className="font-medium">{selectedRecommendationDetail.recommendation.qualityScore ?? "-"}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Current Runtime</div>
                  <div className="font-medium">{selectedRecommendationDetail.recommendation.currentRuntime || "-"}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Summary</Label>
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  {selectedRecommendationDetail.recommendation.summary || "No summary"}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Affected Files</Label>
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  {Array.isArray(selectedRecommendationDetail.recommendation.recommendationJson?.affectedFiles)
                    ? selectedRecommendationDetail.recommendation.recommendationJson.affectedFiles.join(", ")
                    : "No file inventory"}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Snapshot & Verification</Label>
                <Textarea
                  value={JSON.stringify({
                    recommendation: selectedRecommendationDetail.recommendation,
                    latestSnapshot: selectedRecommendationDetail.snapshots?.[0] || null,
                    recentRuns: selectedRecommendationDetail.runs || [],
                  }, null, 2)}
                  readOnly
                  rows={16}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading recommendation details...</div>
          )}
          <DialogFooter>
            {selectedRecommendationDetail?.recommendation && (
              <>
                <Button
                  variant="outline"
                  onClick={() => dismissRecommendationMutation.mutate({ recommendationId: selectedRecommendationDetail.recommendation.id })}
                  disabled={dismissRecommendationMutation.isPending}
                >
                  Dismiss
                </Button>
                <Button
                  onClick={() => requestRecommendationApply(
                    selectedRecommendationDetail.recommendation as MaintenanceRecommendation,
                    selectedRecommendationDetail.skill?.name || "Selected skill",
                  )}
                  disabled={selectedRecommendationDetail.recommendation.status === "applied" || applyUpgradeMutation.isPending}
                >
                  {selectedRecommendationDetail.recommendation.isAutoApplySafe ? "Apply Upgrade" : "Generate Proposal"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Skill Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Skill</DialogTitle>
            <DialogDescription>
              Add a new AI agent skill to the database
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  placeholder="my-skill"
                  value={newSkillData.slug}
                  onChange={(e) => {
                    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                    setNewSkillData({ ...newSkillData, slug });
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lowercase letters, numbers, and dashes only
                </p>
              </div>
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="My Skill"
                  value={newSkillData.name}
                  onChange={(e) =>
                    setNewSkillData({ ...newSkillData, name: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Brief description of what this skill does"
                value={newSkillData.description}
                onChange={(e) =>
                  setNewSkillData({ ...newSkillData, description: e.target.value })
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Category</Label>
                <Select
                  value={newSkillData.category}
                  onValueChange={(value) => {
                    const nextExecutionMode = isExecutionModeCompatibleWithSkillCategory(
                      value,
                      newSkillData.executionMode,
                    )
                      ? newSkillData.executionMode
                      : (getRecommendedExecutionModeForSkillCategory(value) || "llm-only");
                    setNewSkillData(applySandboxDefaultsToNewSkill({
                      ...newSkillData,
                      category: value,
                    }, nextExecutionMode));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Execution Mode</Label>
                <Select
                  value={newSkillData.executionMode}
                  onValueChange={(value) =>
                    setNewSkillData(applySandboxDefaultsToNewSkill(newSkillData, value as SkillExecutionMode))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAllowedExecutionModesForSkillCategory(newSkillData.category).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {executionModeLabels[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {getExecutionModeHelperText(t, newSkillData.category, newSkillData.executionMode)}
                </p>
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  min={0}
                  max={100}
                  value={newSkillData.priority}
                  onChange={(e) =>
                    setNewSkillData({ ...newSkillData, priority: parseInt(e.target.value) || 50 })
                  }
                />
              </div>

              <div>
                <Label htmlFor="creditMultiplier">Credit Multiplier</Label>
                <Input
                  id="creditMultiplier"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={newSkillData.creditMultiplier}
                  onChange={(e) =>
                    setNewSkillData({ ...newSkillData, creditMultiplier: parseFloat(e.target.value) || 1 })
                  }
                />
              </div>
            </div>

            {isSandboxExecutionMode(newSkillData.executionMode) && (
              <div className="space-y-4 rounded-xl border p-4">
                <div>
                  <Label>Sandbox Runtime</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure the isolated runtime profile used for this skill.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Sandbox Profile</Label>
                    <Select
                      value={newSkillData.sandboxProfileSlug || getDefaultSandboxSettings(newSkillData.category, newSkillData.executionMode).sandboxProfileSlug || "browser-default"}
                      onValueChange={(value) => setNewSkillData({ ...newSkillData, sandboxProfileSlug: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(sandboxProfiles && sandboxProfiles.length > 0 ? sandboxProfiles : [
                          { slug: "code-default", name: "Code Execution (Default)" },
                          { slug: "browser-default", name: "Browser Automation (Default)" },
                          { slug: "file-parser", name: "File Parser" },
                          { slug: "media-processing", name: "Media Processing" },
                        ]).map((profile: any) => (
                          <SelectItem key={profile.slug} value={profile.slug}>
                            {profile.name} ({profile.slug})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-maxRuntimeSeconds">Max Runtime (seconds)</Label>
                    <Input
                      id="new-maxRuntimeSeconds"
                      type="number"
                      min={1}
                      max={3600}
                      value={newSkillData.maxRuntimeSeconds ?? getDefaultSandboxSettings(newSkillData.category, newSkillData.executionMode).maxRuntimeSeconds ?? 300}
                      onChange={(e) => setNewSkillData({
                        ...newSkillData,
                        maxRuntimeSeconds: parseInt(e.target.value, 10) || null,
                      })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-maxInputMb">Max Input (MB)</Label>
                    <Input
                      id="new-maxInputMb"
                      type="number"
                      min={1}
                      max={2048}
                      value={newSkillData.maxInputMb ?? getDefaultSandboxSettings(newSkillData.category, newSkillData.executionMode).maxInputMb ?? 25}
                      onChange={(e) => setNewSkillData({
                        ...newSkillData,
                        maxInputMb: parseInt(e.target.value, 10) || null,
                      })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <Label className="text-sm">Requires Network</Label>
                      <p className="text-xs text-muted-foreground">Needed when the sandbox must install packages or call external endpoints.</p>
                    </div>
                    <Switch
                      checked={newSkillData.requiresNetwork ?? !!getDefaultSandboxSettings(newSkillData.category, newSkillData.executionMode).requiresNetwork}
                      onCheckedChange={(checked) => setNewSkillData({ ...newSkillData, requiresNetwork: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <Label className="text-sm">Requires Browser</Label>
                      <p className="text-xs text-muted-foreground">Enable only for browser-automation flows that truly need Playwright/browser access.</p>
                    </div>
                    <Switch
                      checked={newSkillData.requiresBrowser ?? !!getDefaultSandboxSettings(newSkillData.category, newSkillData.executionMode).requiresBrowser}
                      onCheckedChange={(checked) => setNewSkillData({ ...newSkillData, requiresBrowser: checked })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={newSkillData.visibility || "private"}
                onValueChange={(v) =>
                  setNewSkillData({ ...newSkillData, visibility: v as "private" | "public" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (only you and shared groups)</SelectItem>
                  <SelectItem value="public">Public (requires admin approval)</SelectItem>
                </SelectContent>
              </Select>
              {newSkillData.visibility === "public" && !isAdmin && (
                <p className="text-xs text-muted-foreground">
                  Public skills require admin approval before becoming visible to all users.
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={newSkillData.isAutoTrigger}
                  onCheckedChange={(checked) =>
                    setNewSkillData({ ...newSkillData, isAutoTrigger: checked })
                  }
                />
                <Label>Auto-Trigger</Label>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newSkillData.isEnabled}
                    onCheckedChange={(checked) =>
                      setNewSkillData({ ...newSkillData, isEnabled: checked })
                    }
                  />
                  <Label>Enabled</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-11">Enable or disable this skill globally. When off, no user can see or use it.</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newSkillData.visibleByDefault}
                    onCheckedChange={(checked) =>
                      setNewSkillData({
                        ...newSkillData,
                        visibleByDefault: checked,
                        ...(!checked && { enabledByDefault: false }),
                      })
                    }
                  />
                  <Label>Visible by Default</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-11">New users will see this skill in their list automatically.</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newSkillData.enabledByDefault}
                    onCheckedChange={(checked) =>
                      setNewSkillData({ ...newSkillData, enabledByDefault: checked })
                    }
                    disabled={!newSkillData.visibleByDefault}
                  />
                  <Label className={!newSkillData.visibleByDefault ? "text-muted-foreground" : ""}>Enabled by Default</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-11">Auto-trigger in new conversations. Requires Visible by Default.</p>
              </div>
            </div>

            <div>
              <Label htmlFor="systemPrompt">System Prompt</Label>
              <Textarea
                id="systemPrompt"
                placeholder="The system prompt for this skill..."
                value={newSkillData.systemPrompt}
                onChange={(e) =>
                  setNewSkillData({ ...newSkillData, systemPrompt: e.target.value })
                }
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <Label htmlFor="skillContent">Skill Content (Markdown)</Label>
              <Textarea
                id="skillContent"
                placeholder="# Skill Instructions&#10;&#10;..."
                value={newSkillData.skillContent}
                onChange={(e) =>
                  setNewSkillData({ ...newSkillData, skillContent: e.target.value })
                }
                rows={6}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <Label htmlFor="marketplaceContent">Marketplace Content (Public)</Label>
              <p className="text-xs text-muted-foreground mb-1">Curated documentation shown on the Marketplace page. Does not expose internal skill details.</p>
              <Textarea
                id="marketplaceContent"
                placeholder={"## Overview\nBrief description of what this skill does.\n\n### Key Features\n- Feature 1\n- Feature 2\n\n## Quick Start\nHow to use this skill.\n\n## Input\nWhat the skill expects.\n\n## Output\nWhat the skill produces."}
                value={newSkillData.marketplaceContent}
                onChange={(e) =>
                  setNewSkillData({ ...newSkillData, marketplaceContent: e.target.value })
                }
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSkill}
              disabled={!newSkillData.slug || !newSkillData.name || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Skill Dialog */}
      {editingSkill && (
        <Dialog open={!!editingSkill} onOpenChange={() => setEditingSkill(null)}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Skill</DialogTitle>
              <DialogDescription>
                Update skill configuration for "{editingSkill.slug}"
              </DialogDescription>
            </DialogHeader>
            {selectedSkillExportSource?.sourceAgencyId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="space-y-0.5">
                  <p className="font-medium">Exported from Agency Builder</p>
                  <p className="text-xs text-emerald-800">
                    {selectedSkillExportSource.sourceAgencyName
                      ? `Source agency: ${selectedSkillExportSource.sourceAgencyName}`
                      : "This skill was created from an agency graph export."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                  onClick={() => setLocation(`/agencies/${selectedSkillExportSource.sourceAgencyId}/edit`)}
                >
                  Open source graph
                </Button>
                {sourceGraphDuplicateLocation && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                      onClick={() => setLocation(sourceGraphDuplicateLocation)}
                    >
                      Duplicate from source graph
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                      onClick={handleCopySourceGraphDuplicateLocation}
                    >
                      Copy duplicate link
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Slug</Label>
                  <Input value={editingSkill.slug} disabled className="bg-muted" />
                </div>
                <div>
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editingSkill.name}
                    onChange={(e) =>
                      setEditingSkill({ ...editingSkill, name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={editingSkill.description || ""}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, description: e.target.value })
                  }
                />
              </div>

              {/* Visibility Selector */}
              <div className="space-y-2">
                <Label>Visibility</Label>
                <Select
                  value={editingSkill.visibility === "pending_approval" ? "public" : editingSkill.visibility === "rejected" ? "private" : editingSkill.visibility}
                  onValueChange={(v) =>
                    setEditingSkill({ ...editingSkill, visibility: v as any })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private (only you and shared groups)</SelectItem>
                    <SelectItem value="public">Public (requires admin approval)</SelectItem>
                  </SelectContent>
                </Select>
                {editingSkill.visibility === "public" && !isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Public skills require admin approval before becoming visible to all users.
                  </p>
                )}
                {editingSkill.visibility === "pending_approval" && (
                  <p className="text-xs text-amber-600">
                    This skill is currently awaiting admin approval.
                  </p>
                )}
              </div>

              {/* Rejection Reason */}
              {editingSkill.visibility === "rejected" && editingSkill.rejectionReason && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                  <strong>Rejection reason:</strong> {editingSkill.rejectionReason}
                </div>
              )}

              {/* Group Sharing Section — only shown for private skills */}
              {editingSkill.visibility === "private" && (
                <div className="space-y-3 border rounded-lg p-4">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Shared with Groups
                  </Label>
                  {/* Currently shared groups */}
                  <div className="flex flex-wrap gap-2">
                    {sharedGroups && sharedGroups.length > 0 ? (
                      sharedGroups.map((group: any) => (
                        <Badge
                          key={group.id}
                          variant="secondary"
                          className="flex items-center gap-1 pl-3 pr-1 py-1"
                        >
                          <span>{group.name}</span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({group.memberCount} members)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 ml-1 hover:bg-destructive/20 rounded-full"
                            onClick={() =>
                              unshareGroupMutation.mutate({
                                skillId: editingSkill.id,
                                groupId: group.id,
                              })
                            }
                            disabled={unshareGroupMutation.isPending}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        Not shared with any groups yet.
                      </p>
                    )}
                  </div>
                  {/* Add group selector */}
                  {userGroups && userGroups.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Select
                        onValueChange={(groupId) => {
                          shareWithGroupsMutation.mutate({
                            skillId: editingSkill.id,
                            groupIds: [parseInt(groupId)],
                          });
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Add a group..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(userGroups as any[])
                            .filter(
                              (g: any) =>
                                !sharedGroups?.some(
                                  (sg: any) => sg.id === g.id
                                )
                            )
                            .map((group: any) => (
                              <SelectItem
                                key={group.id}
                                value={String(group.id)}
                              >
                                {group.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Category</Label>
                <Select
                  value={editingSkill.category}
                  onValueChange={(value) => {
                    const nextExecutionMode = isExecutionModeCompatibleWithSkillCategory(
                      value,
                      editingSkill.executionMode,
                    )
                      ? (editingSkill.executionMode || getRecommendedExecutionModeForSkillCategory(value) || "llm-only")
                      : (getRecommendedExecutionModeForSkillCategory(value) || "llm-only");
                    setEditingSkill(applySandboxDefaults({
                      ...editingSkill,
                      category: value,
                      executionMode: nextExecutionMode,
                      defaultModel: null,
                      llmModelId: null,
                      preferredProviderId: null,
                      strictProviderPin: false,
                    }, nextExecutionMode));
                  }}
                >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoryLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="edit-priority">Priority</Label>
                  <Input
                    id="edit-priority"
                    type="number"
                    min={0}
                    max={100}
                    value={editingSkill.priority}
                    onChange={(e) =>
                      setEditingSkill({ ...editingSkill, priority: parseInt(e.target.value) || 50 })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="edit-creditMultiplier">Credit Multiplier</Label>
                  <Input
                    id="edit-creditMultiplier"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={editingSkill.creditMultiplier}
                    onChange={(e) =>
                      setEditingSkill({ ...editingSkill, creditMultiplier: parseFloat(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>

              {/* Execution Mode */}
              <div className="space-y-2">
                <Label>Execution Mode</Label>
                <Select
                  value={editingSkill.executionMode || "llm-only"}
                  onValueChange={(value) =>
                    setEditingSkill(applySandboxDefaults({
                      ...editingSkill,
                      executionMode: value as SkillExecutionMode,
                      defaultModel: null,
                      llmModelId: null,
                      preferredProviderId: null,
                      strictProviderPin: false,
                    }, value as SkillExecutionMode))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAllowedExecutionModesForSkillCategory(editingSkill.category).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {executionModeLabels[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {getExecutionModeHelperText(t, editingSkill.category, editingSkill.executionMode)}
                </p>
              </div>

              {isSandboxExecutionMode(editingSkill.executionMode) && (
                <div className="space-y-4 rounded-xl border p-4">
                  <div>
                    <Label>Sandbox Runtime</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure the isolated runtime profile used for this skill. For `modern-editorial-slide`, use `sandbox-command` with `browser-default` so Node/npm are available for the bundled `src/*.mjs` renderer.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Sandbox Profile</Label>
                      <Select
                        value={editingSkill.sandboxProfileSlug || getDefaultSandboxSettings(editingSkill.category, editingSkill.executionMode).sandboxProfileSlug || "browser-default"}
                        onValueChange={(value) => setEditingSkill({ ...editingSkill, sandboxProfileSlug: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(sandboxProfiles && sandboxProfiles.length > 0 ? sandboxProfiles : [
                            { slug: "code-default", name: "Code Execution (Default)" },
                            { slug: "browser-default", name: "Browser Automation (Default)" },
                            { slug: "file-parser", name: "File Parser" },
                            { slug: "media-processing", name: "Media Processing" },
                          ]).map((profile: any) => (
                            <SelectItem key={profile.slug} value={profile.slug}>
                              {profile.name} ({profile.slug})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-maxRuntimeSeconds">Max Runtime (seconds)</Label>
                      <Input
                        id="edit-maxRuntimeSeconds"
                        type="number"
                        min={1}
                        max={3600}
                        value={editingSkill.maxRuntimeSeconds ?? getDefaultSandboxSettings(editingSkill.category, editingSkill.executionMode).maxRuntimeSeconds ?? 300}
                        onChange={(e) => setEditingSkill({
                          ...editingSkill,
                          maxRuntimeSeconds: parseInt(e.target.value, 10) || null,
                        })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-maxInputMb">Max Input (MB)</Label>
                      <Input
                        id="edit-maxInputMb"
                        type="number"
                        min={1}
                        max={2048}
                        value={editingSkill.maxInputMb ?? getDefaultSandboxSettings(editingSkill.category, editingSkill.executionMode).maxInputMb ?? 25}
                        onChange={(e) => setEditingSkill({
                          ...editingSkill,
                          maxInputMb: parseInt(e.target.value, 10) || null,
                        })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div>
                        <Label className="text-sm">Requires Network</Label>
                        <p className="text-xs text-muted-foreground">Needed when the sandbox must install packages or call external endpoints.</p>
                      </div>
                      <Switch
                        checked={editingSkill.requiresNetwork ?? !!getDefaultSandboxSettings(editingSkill.category, editingSkill.executionMode).requiresNetwork}
                        onCheckedChange={(checked) => setEditingSkill({ ...editingSkill, requiresNetwork: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div>
                        <Label className="text-sm">Requires Browser</Label>
                        <p className="text-xs text-muted-foreground">Enable only for browser-automation flows that truly need Playwright/browser access.</p>
                      </div>
                      <Switch
                        checked={editingSkill.requiresBrowser ?? !!getDefaultSandboxSettings(editingSkill.category, editingSkill.executionMode).requiresBrowser}
                        onCheckedChange={(checked) => setEditingSkill({ ...editingSkill, requiresBrowser: checked })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Default Model — show media models for media-generate, LLM models for llm-only */}
              <div className="space-y-2 pt-2 border-t">
                {editingSkill.executionMode === "media-generate" ? (
                  <>
                    <Label className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-orange-500" />
                      Default Media Model
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                          {editingSkill.defaultModel
                            ? (() => {
                                const models = getMediaModelsForCategory(
                                  editingSkill.category,
                                  imageModels,
                                  videoModels,
                                  audioModels,
                                );
                                const found = models?.find((m: any) => m.modelId === editingSkill.defaultModel);
                                return found ? `${found.name} (${found.provider})` : editingSkill.defaultModel;
                              })()
                            : <span className="text-muted-foreground">Auto (highest priority model)</span>}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[450px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search media models..." />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty>No model found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__auto__"
                                onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: null })}
                              >
                                <Check className={`mr-2 h-4 w-4 ${!editingSkill.defaultModel ? "opacity-100" : "opacity-0"}`} />
                                <span className="text-muted-foreground">Auto (highest priority model)</span>
                              </CommandItem>
                              {getMediaModelsForCategory(
                                editingSkill.category,
                                imageModels,
                                videoModels,
                                audioModels,
                              )?.map((model: any) => (
                                <CommandItem
                                  key={model.modelId}
                                  value={`${model.name} ${model.modelId} ${model.provider}`}
                                  onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: model.modelId })}
                                >
                                  <Check className={`mr-2 h-4 w-4 ${editingSkill.defaultModel === model.modelId ? "opacity-100" : "opacity-0"}`} />
                                  <span>{model.name}</span>
                                  <span className="ml-1 text-xs text-muted-foreground">({model.provider})</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      The media generation model used when this skill creates media output.
                    </p>
                  </>
                ) : isSandboxExecutionMode(editingSkill.executionMode) || editingSkill.executionMode === "python" ? (
                  <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                    {editingSkill.executionMode === "sandbox-command"
                      ? "This skill executes through the sandbox runtime, so it does not use the LLM default-model picker."
                      : "This execution mode does not use the LLM default-model picker."}
                  </div>
                ) : (
                  <>
                    <Label className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      Default LLM Model (Auto Prompt)
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                          {(editingSkill.llmModelId || editingSkill.defaultModel)
                            ? (() => {
                                const selectedModel = editingSkill.llmModelId || editingSkill.defaultModel;
                                const found = visionModels?.models?.find((m) => m.id === selectedModel);
                                return found ? `${found.name} (${found.providerDisplayName})` : selectedModel;
                              })()
                            : <span className="text-muted-foreground">{systemDefaultLlmLabel}</span>}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[450px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search LLM models..." />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty>No model found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__system_default__"
                                onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: null, llmModelId: null })}
                              >
                                <Check className={`mr-2 h-4 w-4 ${!(editingSkill.llmModelId || editingSkill.defaultModel) ? "opacity-100" : "opacity-0"}`} />
                                <span className="text-muted-foreground">{systemDefaultLlmLabel}</span>
                              </CommandItem>
                              {visionModels?.models?.map((model) => (
                                <CommandItem
                                  key={model.id}
                                  value={`${model.name} ${model.id} ${model.providerDisplayName}`}
                                  onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: model.id, llmModelId: model.id })}
                                >
                                  <Check className={`mr-2 h-4 w-4 ${(editingSkill.llmModelId || editingSkill.defaultModel) === model.id ? "opacity-100" : "opacity-0"}`} />
                                  <span>{model.name}</span>
                                  <span className="ml-1 text-xs text-muted-foreground">({model.providerDisplayName})</span>
                                  {model.isDefault && (
                                    <Badge variant="secondary" className="ml-1 text-[10px] h-4">default</Badge>
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      Auto mode selects the best model based on skill requirements (model_requirements in skill.md). Users can override in Media Studio Advanced Mode.
                    </p>

                    <div className="mt-3 space-y-2 rounded-md border p-3">
                      <Label>Preferred LLM Provider (optional)</Label>
                      <Select
                        value={editingSkill.preferredProviderId ? String(editingSkill.preferredProviderId) : "__auto__"}
                        onValueChange={(value) =>
                          setEditingSkill({
                            ...editingSkill,
                            preferredProviderId: value === "__auto__" ? null : Number(value),
                            ...(value === "__auto__" ? { strictProviderPin: false } : {}),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Auto route (no provider pin)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">Auto route (no provider pin)</SelectItem>
                          {(llmProvidersData || []).map((provider: { id: number; displayName: string; providerName: string }) => (
                            <SelectItem key={provider.id} value={String(provider.id)}>
                              {provider.displayName} ({provider.providerName})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <Label className="text-sm">Strict Provider Pin</Label>
                          <p className="text-xs text-muted-foreground">
                            If enabled, this skill will fail instead of falling back to another provider.
                          </p>
                        </div>
                        <Switch
                          checked={editingSkill.strictProviderPin}
                          onCheckedChange={(checked) =>
                            setEditingSkill({ ...editingSkill, strictProviderPin: checked })
                          }
                          disabled={!editingSkill.preferredProviderId}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 rounded-lg border border-border/80 dark:border-border bg-muted/30 dark:bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingSkill.isAutoTrigger}
                    onCheckedChange={(checked) =>
                      setEditingSkill({ ...editingSkill, isAutoTrigger: checked })
                    }
                  />
                  <div>
                    <Label className="text-sm font-medium">Auto-Trigger</Label>
                    <p className="text-xs text-muted-foreground">Automatically activate on matching messages.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingSkill.isEnabled}
                    onCheckedChange={(checked) =>
                      setEditingSkill({ ...editingSkill, isEnabled: checked })
                    }
                  />
                  <div>
                    <Label className="text-sm font-medium">Enabled</Label>
                    <p className="text-xs text-muted-foreground">Enable or disable this skill globally.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingSkill.visibleByDefault}
                    onCheckedChange={(checked) =>
                      setEditingSkill({
                        ...editingSkill,
                        visibleByDefault: checked,
                        ...(!checked && { enabledByDefault: false }),
                      })
                    }
                  />
                  <div>
                    <Label className="text-sm font-medium">Visible by Default</Label>
                    <p className="text-xs text-muted-foreground">New users see this skill automatically.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingSkill.enabledByDefault}
                    onCheckedChange={(checked) =>
                      setEditingSkill({ ...editingSkill, enabledByDefault: checked })
                    }
                    disabled={!editingSkill.visibleByDefault}
                  />
                  <div>
                    <Label className={`text-sm font-medium ${!editingSkill.visibleByDefault ? "text-muted-foreground" : ""}`}>Enabled by Default</Label>
                    <p className="text-xs text-muted-foreground">Auto-trigger in new conversations. Requires Visible.</p>
                  </div>
                </div>
              </div>

              {/* Content Quality & Execution Policy — Spec 038 */}
              <div className="space-y-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  <Label className="text-sm font-semibold text-blue-700 dark:text-blue-400">Content Quality & Execution Policy</Label>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Controls how AI generates and verifies content for this skill. These settings affect model reasoning depth, web search usage, and citation requirements.
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                  {/* Thinking Level */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Thinking Level</Label>
                    <Select
                      value={(editingSkill as any)._thinkingLevel ?? "auto"}
                      onValueChange={(val) =>
                        setEditingSkill({ ...editingSkill, _thinkingLevel: val } as any)
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (based on complexity)</SelectItem>
                        <SelectItem value="low">Low - Fast, simple tasks</SelectItem>
                        <SelectItem value="medium">Medium - Balanced</SelectItem>
                        <SelectItem value="high">High - Deep reasoning</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      How deeply the AI should reason. High = better for analysis/comparison, Low = faster for simple content.
                    </p>
                  </div>

                  {/* Response Mode */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Response Mode</Label>
                    <Select
                      value={(editingSkill as any)._responseMode ?? "markdown"}
                      onValueChange={(val) =>
                        setEditingSkill({ ...editingSkill, _responseMode: val } as any)
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="markdown">Markdown (default)</SelectItem>
                        <SelectItem value="cms_json">CMS JSON (structured)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      CMS JSON = structured output with claims, citations, SEO metadata. Markdown = plain text.
                    </p>
                  </div>

                  {/* Min Citation Coverage */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">
                      Min Citation Coverage: {Math.round(((editingSkill as any)._minCitationCoverage ?? 0) * 100)}%
                    </Label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={Math.round(((editingSkill as any)._minCitationCoverage ?? 0) * 100)}
                      onChange={(e) =>
                        setEditingSkill({
                          ...editingSkill,
                          _minCitationCoverage: parseInt(e.target.value) / 100,
                        } as any)
                      }
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Minimum % of claims that must have citations. 0% = no requirement, 80%+ recommended for factual content.
                    </p>
                  </div>

                  {/* Refresh Cadence */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Refresh Cadence (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={(editingSkill as any)._refreshCadenceDays ?? 30}
                      onChange={(e) =>
                        setEditingSkill({
                          ...editingSkill,
                          _refreshCadenceDays: parseInt(e.target.value) || 30,
                        } as any)
                      }
                      className="h-8 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Days before generated content is marked stale. 7 = news/trends, 30 = products, 90 = evergreen.
                    </p>
                  </div>
                </div>

                {/* Toggle row */}
                <div className="grid gap-3 md:grid-cols-2 pt-1">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={(editingSkill as any)._requiresWebSearch ?? false}
                      onCheckedChange={(checked) =>
                        setEditingSkill({ ...editingSkill, _requiresWebSearch: checked } as any)
                      }
                    />
                    <div>
                      <Label className="text-xs font-medium">{t("admin.skillsPage.quality.webSearchGrounding.label")}</Label>
                      <p className="text-[10px] text-muted-foreground">
                        {t("admin.skillsPage.quality.webSearchGrounding.help")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch
                      checked={(editingSkill as any)._disclosureRequired ?? false}
                      onCheckedChange={(checked) =>
                        setEditingSkill({ ...editingSkill, _disclosureRequired: checked } as any)
                      }
                    />
                    <div>
                      <Label className="text-xs font-medium">{t("admin.skillsPage.quality.disclosureRequired.label")}</Label>
                      <p className="text-[10px] text-muted-foreground">
                        {t("admin.skillsPage.quality.disclosureRequired.help")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Intelligent Model Selection — Feature 041 */}
              <div className="space-y-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/20 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-purple-600" />
                  <Label className="text-sm font-semibold text-purple-700 dark:text-purple-400">{t("admin.skillsPage.modelSelection.title")}</Label>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  {t("admin.skillsPage.modelSelection.description")}
                </p>

                {/* Execution Mode */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("admin.skillsPage.modelSelection.selectionModeLabel")}</Label>
                  <Select
                    value={(editingSkill as any)._execMode ?? "auto"}
                    onValueChange={(val) =>
                      setEditingSkill({ ...editingSkill, _execMode: val } as any)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t("admin.skillsPage.modelSelection.modes.auto")}</SelectItem>
                      <SelectItem value="requirements">{t("admin.skillsPage.modelSelection.modes.requirements")}</SelectItem>
                      <SelectItem value="fixed">{t("admin.skillsPage.modelSelection.modes.fixed")}</SelectItem>
                      <SelectItem value="hybrid">{t("admin.skillsPage.modelSelection.modes.hybrid")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Capability Requirements */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">{t("admin.skillsPage.modelSelection.requiredCapabilitiesLabel")}</Label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {([
                      { key: "_reqWebSearch", label: t("admin.capabilities.webSearch.label"), desc: t("admin.capabilities.webSearch.description") },
                      { key: "_reqThinking", label: t("admin.capabilities.thinking.label"), desc: t("admin.capabilities.thinking.description") },
                      { key: "_reqStructuredOutputs", label: t("admin.capabilities.structuredOutputs.label"), desc: t("admin.capabilities.structuredOutputs.description") },
                      { key: "_reqJsonMode", label: t("admin.capabilities.jsonMode.label"), desc: t("admin.capabilities.jsonMode.description") },
                      { key: "_reqStrictToolSchema", label: t("admin.capabilities.strictToolSchema.label"), desc: t("admin.capabilities.strictToolSchema.description") },
                      { key: "_reqFunctionTools", label: t("admin.capabilities.functionTools.label"), desc: t("admin.capabilities.functionTools.description") },
                      { key: "_reqVision", label: t("admin.capabilities.vision.label"), desc: t("admin.capabilities.vision.description") },
                      { key: "_reqCodeExecution", label: t("admin.capabilities.codeExecution.label"), desc: t("admin.capabilities.codeExecution.description") },
                      { key: "_reqResponses", label: t("admin.capabilities.responses.label"), desc: t("admin.capabilities.responses.description") },
                      { key: "_reqComputerUse", label: t("admin.capabilities.computerUse.label"), desc: t("admin.capabilities.computerUse.description") },
                      { key: "_reqBackground", label: t("admin.capabilities.background.label"), desc: t("admin.capabilities.background.description") },
                    ] as const).map((cap) => (
                      <div key={cap.key} className="flex items-center gap-2">
                        <Switch
                          checked={(editingSkill as any)[cap.key] ?? false}
                          onCheckedChange={(checked) =>
                            setEditingSkill({ ...editingSkill, [cap.key]: checked } as any)
                          }
                          className="scale-75"
                        />
                        <div>
                          <Label className="text-xs font-medium">{cap.label}</Label>
                          <p className="text-[10px] text-muted-foreground leading-tight">{cap.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Context Length + Policy Toggles */}
                <div className="grid gap-3 md:grid-cols-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("admin.skillsPage.modelSelection.minContextLengthLabel")}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={2000000}
                      step={1000}
                      placeholder={t("admin.skillsPage.modelSelection.minContextLengthPlaceholder")}
                      value={(editingSkill as any)._reqContextLength ?? ""}
                      onChange={(e) =>
                        setEditingSkill({
                          ...editingSkill,
                          _reqContextLength: e.target.value ? parseInt(e.target.value) || null : null,
                        } as any)
                      }
                      className="h-8 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t("admin.skillsPage.modelSelection.minContextLengthHelp")}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <Switch
                      checked={(editingSkill as any)._allowConvOverride ?? true}
                      onCheckedChange={(checked) =>
                        setEditingSkill({ ...editingSkill, _allowConvOverride: checked } as any)
                      }
                    />
                    <div>
                      <Label className="text-xs font-medium">{t("admin.skillsPage.modelSelection.allowConversationOverride.label")}</Label>
                      <p className="text-[10px] text-muted-foreground">
                        {t("admin.skillsPage.modelSelection.allowConversationOverride.help")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <Switch
                      checked={(editingSkill as any)._allowFreeModels ?? false}
                      onCheckedChange={(checked) =>
                        setEditingSkill({ ...editingSkill, _allowFreeModels: checked } as any)
                      }
                    />
                    <div>
                      <Label className="text-xs font-medium">{t("admin.skillsPage.modelSelection.allowFreeModels.label")}</Label>
                      <p className="text-[10px] text-muted-foreground">
                        {t("admin.skillsPage.modelSelection.allowFreeModels.help")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Model Resolution Preview — Spec 041 */}
              {editingSkill.id && (
                <SkillModelPreviewPanel skillId={editingSkill.id} />
              )}

              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-700" />
                  <Label className="text-sm font-semibold text-emerald-800">{t("admin.skillsPage.orchestration.title")}</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.skillsPage.orchestration.description")}
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Mode</Label>
                    <Select
                      value={(editingSkill as any)._orchestrationMode ?? "local"}
                      onValueChange={(value) => setEditingSkill({ ...editingSkill, _orchestrationMode: value } as any)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local only</SelectItem>
                        <SelectItem value="skill-handoff">Skill handoff</SelectItem>
                        <SelectItem value="agency-swarm">Agency swarm</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Execution Endpoint</Label>
                    <Input
                      value={(editingSkill as any)._orchestrationEndpoint ?? ""}
                      onChange={(e) => setEditingSkill({ ...editingSkill, _orchestrationEndpoint: e.target.value } as any)}
                      placeholder="/api/internal/skills/execute"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs font-medium">Skill Targets</Label>
                    <Input
                      value={(editingSkill as any)._orchestrationSkillTargets ?? ""}
                      onChange={(e) => setEditingSkill({ ...editingSkill, _orchestrationSkillTargets: e.target.value } as any)}
                      placeholder="slide-planner, storyboard-writer, analysis-reporter"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Comma-separated downstream skill targets used for handoff or hybrid flows.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Fallback</Label>
                    <Select
                      value={(editingSkill as any)._orchestrationFallback ?? "local"}
                      onValueChange={(value) => setEditingSkill({ ...editingSkill, _orchestrationFallback: value } as any)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Fallback to local</SelectItem>
                        <SelectItem value="fail">Fail closed</SelectItem>
                        <SelectItem value="queue">Queue for review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-white/60 px-3 py-2">
                    <div>
                      <Label className="text-xs font-medium">Parallel Dispatch</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Enable only when downstream work can safely run side-by-side.
                      </p>
                    </div>
                    <Switch
                      checked={(editingSkill as any)._orchestrationParallel ?? false}
                      onCheckedChange={(checked) => setEditingSkill({ ...editingSkill, _orchestrationParallel: checked } as any)}
                    />
                  </div>
                </div>
              </div>

              {/* Trigger Patterns */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Trigger Patterns (Regex)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs dark:border-muted-foreground/40 dark:text-foreground"
                    onClick={() =>
                      setEditingSkill({
                        ...editingSkill,
                        triggerPatterns: [...editingSkill.triggerPatterns, ""],
                      })
                    }
                  >
                    + Add Pattern
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Each pattern is a case-insensitive regex. Use <code className="bg-muted px-1 rounded">|</code> for alternatives.
                  e.g. <code className="bg-muted px-1 rounded">สร้างพรอมต์|enhance prompt|image prompt</code>
                </p>
                {editingSkill.triggerPatterns.length === 0 && (
                  <p className="text-xs text-muted-foreground italic py-2">No trigger patterns defined. Add patterns for auto-trigger to work.</p>
                )}
                <div className="space-y-2">
                  {editingSkill.triggerPatterns.map((pattern, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={pattern}
                        onChange={(e) => {
                          const updated = [...editingSkill.triggerPatterns];
                          updated[idx] = e.target.value;
                          setEditingSkill({ ...editingSkill, triggerPatterns: updated });
                        }}
                        placeholder="regex pattern, e.g. สร้างพรอมต์|enhance prompt"
                        className="font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          const updated = editingSkill.triggerPatterns.filter((_, i) => i !== idx);
                          setEditingSkill({ ...editingSkill, triggerPatterns: updated });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="edit-systemPrompt">System Prompt</Label>
                <Textarea
                  id="edit-systemPrompt"
                  value={editingSkill.systemPrompt || ""}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, systemPrompt: e.target.value })
                  }
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor="edit-skillContent">Skill Content (Markdown)</Label>
                <Textarea
                  id="edit-skillContent"
                  value={editingSkill.skillContent || ""}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, skillContent: e.target.value })
                  }
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-marketplaceContent">Marketplace Content (Public)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="dark:border-muted-foreground/40 dark:text-foreground"
                    onClick={() => editingSkill && regenerateMarketplaceMutation.mutate({ id: editingSkill.id })}
                    disabled={regenerateMarketplaceMutation.isPending}
                  >
                    {regenerateMarketplaceMutation.isPending ? "Generating..." : "Regenerate from Skill Content"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-1">Curated documentation shown on the Marketplace page. Does not expose internal skill details.</p>
                <Textarea
                  id="edit-marketplaceContent"
                  placeholder={"## Overview\nBrief description of what this skill does.\n\n### Key Features\n- Feature 1\n- Feature 2\n\n## Quick Start\nHow to use this skill.\n\n## Input\nWhat the skill expects.\n\n## Output\nWhat the skill produces."}
                  value={editingSkill.marketplaceContent || ""}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, marketplaceContent: e.target.value })
                  }
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>

              {editingSkill.knowledgebase && (
                <div>
                  <Label>Knowledgebase</Label>
                  <Textarea
                    value={editingSkill.knowledgebase}
                    onChange={(e) =>
                      setEditingSkill({ ...editingSkill, knowledgebase: e.target.value })
                    }
                    rows={4}
                    className="font-mono text-sm"
                  />
                </div>
              )}

              {editingSkill.folderPath && (
                <div>
                  <Label>Folder Path</Label>
                  <Input value={editingSkill.folderPath} disabled className="bg-muted" />
                </div>
              )}
            </div>
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setEditingSkill(null)} className="dark:border-muted-foreground/40 dark:text-foreground dark:hover:bg-muted">
                Cancel
              </Button>
              <Button
                onClick={handleUpdateSkill}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Import ZIP Dialog */}
      <Dialog open={isZipDialogOpen} onOpenChange={setIsZipDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Skill from ZIP</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">Supports two formats:</span>
              <span className="block text-xs">
                <strong>1. Shared Skill Bundle:</strong> ZIP with `skill.md` or `SKILL.md`, plus optional python/, js/, CLAUDE.md, CODEX.md
              </span>
              <span className="block text-xs">
                <strong>2. Custom GPT:</strong> ZIP with system prompt + knowledge files
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="zipSlug">Skill Slug *</Label>
              <Input
                id="zipSlug"
                placeholder="my-custom-gpt"
                value={zipSlug}
                onChange={(e) => {
                  const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                  setZipSlug(slug);
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Unique identifier for this skill
              </p>
            </div>

            <div>
              <Label>ZIP File *</Label>
              <div className="mt-2">
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setZipFile(file);
                  }}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => zipInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {zipFile ? zipFile.name : "Select ZIP file"}
                </Button>
              </div>
            </div>

            {zipFile && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm">
                  <span className="font-medium">File:</span> {zipFile.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Size:</span> {(zipFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsZipDialogOpen(false);
              setZipFile(null);
              setZipSlug("");
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleZipUpload}
              disabled={!zipFile || !zipSlug || importZipMutation.isPending}
            >
              {importZipMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
