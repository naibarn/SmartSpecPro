import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { KeyboardEvent } from "react";
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
  Loader2,
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
  CalendarDays,
  Users,
  X,
  ShieldCheck,
  ArrowUpRight,
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
  latestRun?: {
    id: number;
    runType: string;
    status: string;
    summary: string | null;
    errorMessage: string | null;
    verificationJson: Record<string, unknown> | null;
    logsJson: Record<string, unknown> | null;
    lineage?: Record<string, unknown> | null;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
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
  latestAnalyzedAt: Date | string | null;
  latestUpdatedAt: Date | string | null;
}

type MaintenanceGroupStatusBadge = {
  label: string;
  variant: "secondary" | "outline" | "destructive";
};

type LegacyUpgradeNextAction = {
  label: string;
  description: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  buttonLabel: string | null;
  canRun: boolean;
};

interface LegacyUpgradeQueueItem extends Omit<MaintenanceRecommendation, "latestRun"> {
  upgradePriorityScore: number;
  upgradePriorityTier: "low" | "medium" | "high" | "urgent" | "critical";
  parallelUpgradeEligible: boolean;
  legacyUpgradeSignals: Record<string, unknown> | null;
  latestRun: {
    id: number;
    runType: string;
    status: string;
    summary: string | null;
    errorMessage: string | null;
    verificationJson: Record<string, unknown> | null;
    logsJson: Record<string, unknown> | null;
    startedAt: string | Date | null;
    endedAt: string | Date | null;
    createdAt: string | Date;
    updatedAt: string | Date;
  } | null;
}

interface LegacyUpgradeRunItem {
  id: number;
  recommendationId: number | null;
  skillId: number | null;
  queueState: "queued" | "running" | "failed" | "completed" | "blocked" | "canceled";
  runType: string;
  status: string;
  summary: string | null;
  errorMessage: string | null;
  verificationJson: Record<string, unknown> | null;
  logsJson: Record<string, unknown> | null;
  startedAt: string | Date | null;
  endedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  taskId: string | null;
  resolvedLlmModelId: string | null;
  resultMessage: string | null;
  resultError: string | null;
  diagnosticCode?: string | null;
  workspaceRootIssue?: boolean | null;
  workspaceRoot?: string | null;
  proposalRoot?: string | null;
  entrypointRoot?: string | null;
  canonicalIscRoot?: string | null;
  sourceRunId: number | null;
  retryReason: string | null;
  recommendation: {
    id: number;
    recommendationType: string | null;
    status: string | null;
    title: string | null;
    riskLevel: string | null;
    compatibilityStatus: string | null;
    qualityScore: number | null;
    currentRuntime: string | null;
    proposedRuntime: string | null;
    proposedAction: string | null;
    isAutoApplySafe: boolean | null;
    recommendationJson: Record<string, unknown> | null;
  } | null;
  skill: {
    id: number;
    slug: string;
    name: string | null;
    executionMode: string | null;
  } | null;
  latestRun?: {
    id: number;
    runType: string;
    status: string;
    summary: string | null;
    errorMessage: string | null;
    verificationJson: Record<string, unknown> | null;
    logsJson: Record<string, unknown> | null;
    lineage?: Record<string, unknown> | null;
    startedAt: string | Date | null;
    endedAt: string | Date | null;
    createdAt: string | Date;
    updatedAt: string | Date;
  } | null;
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

interface RecommendationApplyTarget {
  id: number;
  title: string | null;
  isAutoApplySafe: boolean;
  recommendationType?: string;
  recommendationJson?: Record<string, any>;
  skill?: {
    slug: string;
  } | null;
}

// Category icon mapping
const categoryIcons: Record<string, typeof Sparkles> = {
  image_generation: Image,
  image_prompt_generation: Sparkles,
  video_generation: Video,
  video_prompt_generation: Sparkles,
  image_video_generation: Video,
  audio_generation: Music,
  audio_prompt_generation: Sparkles,
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
  audio_prompt_generation: "admin.skillsPage.categoryLabels.audioPromptGeneration",
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

type NativeBundleProfile = "general" | "research" | "workflow" | "media" | "custom";

const NATIVE_BUNDLE_PROFILE_INFO: Record<
  NativeBundleProfile,
  {
    title: string;
    description: string;
    bullets: string[];
    performance: string[];
    quality: string[];
  }
> = {
  general: {
    title: "General",
    description: "Balanced starter scaffold for most skills.",
    bullets: [
      "Good default for new skills",
      "Keeps instructions and contracts explicit",
      "Easy to customize later",
    ],
    performance: [
      "Favor concise prompts and structured outputs",
      "Avoid redundant reads and writes",
      "Keep the critical path short",
    ],
    quality: [
      "Use concise instructions and explicit outputs",
      "Add a verify step for the critical path",
      "Avoid unnecessary tool calls",
    ],
  },
  research: {
    title: "Research",
    description: "Structured for source-backed reasoning and synthesis.",
    bullets: [
      "Emphasizes citations and traceability",
      "Useful for analysis and findings",
      "Biases the scaffold toward grounded outputs",
    ],
    performance: [
      "Batch source checks before summarizing",
      "Cache repeated lookups within a run",
      "Prefer structured summaries over verbose prose",
    ],
    quality: [
      "Batch source checks before summarizing",
      "Differentiate facts from recommendations",
      "Surface uncertainty explicitly",
    ],
  },
  workflow: {
    title: "Workflow",
    description: "Designed for multi-step orchestration and automation.",
    bullets: [
      "Clarifies handoff points and retries",
      "Fits tools, agents, and long-running jobs",
      "Keeps side effects tightly controlled",
    ],
    performance: [
      "Make each step idempotent",
      "Group related side effects into a single pass",
      "Cache intermediate results for repeated use",
    ],
    quality: [
      "Make each step idempotent",
      "Document rollback behavior",
      "Keep side effects within declared outputs",
    ],
  },
  media: {
    title: "Media",
    description: "Optimized for image, video, and asset generation work.",
    bullets: [
      "Calls out format and size constraints",
      "Makes model/tool dependencies visible",
      "Great for creative pipelines",
    ],
    performance: [
      "Reuse generated assets instead of regenerating them",
      "Keep image/video dimensions and durations bounded",
      "Minimize expensive model calls in loops",
    ],
    quality: [
      "Bound dimensions, durations, and file sizes",
      "Prefer reuse over regeneration",
      "Document quality thresholds",
    ],
  },
  custom: {
    title: "Custom",
    description: "Flexible starting point for specialized bundles.",
    bullets: [
      "Best when no preset fits well",
      "Encourages explicit contracts",
      "Leave room for project-specific rules",
    ],
    performance: [
      "Keep the happy path short and predictable",
      "Avoid unnecessary tool calls and retries",
      "Document expected latency or cost constraints",
    ],
    quality: [
      "Define success and failure clearly",
      "Write explicit verification steps",
      "Note likely failure modes",
    ],
  },
};

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

const DEFAULT_AUTO_LEARNING_CONFIG = {
  enabled: false,
  promptQaAfterAutoPrompt: true,
  imageQaAfterGeneration: true,
  requireAdminApproval: true,
  minPromptScoreToPass: 85,
  minImageFidelityScoreToPass: 80,
};

function getAutoLearningConfig(configJson: Record<string, unknown> | null | undefined) {
  const mediaStudio = configJson && typeof configJson === "object"
    ? (configJson as Record<string, any>).media_studio
    : null;
  const autoLearning = mediaStudio && typeof mediaStudio === "object"
    ? mediaStudio.auto_learning
    : null;

  if (!autoLearning || typeof autoLearning !== "object") {
    return DEFAULT_AUTO_LEARNING_CONFIG;
  }

  return {
    enabled: autoLearning.enabled === true,
    promptQaAfterAutoPrompt: autoLearning.prompt_qa_after_auto_prompt !== false,
    imageQaAfterGeneration: autoLearning.image_qa_after_generation !== false,
    requireAdminApproval: autoLearning.require_admin_approval !== false,
    minPromptScoreToPass: Number.isFinite(Number(autoLearning.min_prompt_score_to_pass))
      ? Number(autoLearning.min_prompt_score_to_pass)
      : DEFAULT_AUTO_LEARNING_CONFIG.minPromptScoreToPass,
    minImageFidelityScoreToPass: Number.isFinite(Number(autoLearning.min_image_fidelity_score_to_pass))
      ? Number(autoLearning.min_image_fidelity_score_to_pass)
      : DEFAULT_AUTO_LEARNING_CONFIG.minImageFidelityScoreToPass,
  };
}

function getProductionReferenceStoryboardConfig(configJson: Record<string, unknown> | null | undefined) {
  const mediaStudio = configJson && typeof configJson === "object"
    ? (configJson as Record<string, any>).media_studio
    : null;
  const productionReferenceStoryboard = mediaStudio && typeof mediaStudio === "object"
    ? mediaStudio.production_reference_storyboard
    : null;

  return {
    configured: Boolean(productionReferenceStoryboard && typeof productionReferenceStoryboard === "object"),
    enabled: Boolean(
      productionReferenceStoryboard
      && typeof productionReferenceStoryboard === "object"
      && productionReferenceStoryboard.enabled === true,
    ),
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
  const [selectedRecommendationViewMode, setSelectedRecommendationViewMode] = useState<"advice" | "reasoning">("advice");
  const [pendingMaintenanceApply, setPendingMaintenanceApply] = useState<PendingMaintenanceApply | null>(null);
  const openedSkillIdFromQueryRef = useRef<number | null>(null);
  const autoNormalizedLegacyApplySignatureRef = useRef<string | null>(null);
  const autoRetriedLegacyApplyRunIdsRef = useRef<Set<number>>(new Set());
  const autoRecoveredStaleLegacyApplyRunIdsRef = useRef<Set<number>>(new Set());
  const autoQueuedLegacyRecommendationIdsRef = useRef<Set<number>>(new Set());
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
  const [createDialogStep, setCreateDialogStep] = useState<1 | 2>(1);
  const createSlugInputRef = useRef<HTMLInputElement | null>(null);
  const createPrimaryActionRef = useRef<HTMLButtonElement | null>(null);

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
    bundleType: "native" as "native" | "legacy",
    bundleProfile: "general" as NativeBundleProfile,
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
  const maintenanceStatusFilterFromQuery = useMemo(() => {
    const params = new URLSearchParams(search);
    const value = params.get("maintenanceStatus");
    if (
      value === "pending_review"
      || value === "approved"
      || value === "applied"
      || value === "blocked"
      || value === "failed"
      || value === "dismissed"
      || value === "all"
    ) {
      return value;
    }
    return null;
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

  const createSkillBasicIssues = useMemo(() => {
    const issues: string[] = [];
    if (!newSkillData.slug.trim()) {
      issues.push("Slug is required.");
    } else if (!/^[a-z0-9-]+$/.test(newSkillData.slug.trim())) {
      issues.push("Slug may contain only lowercase letters, numbers, and dashes.");
    } else if (skills?.some((skill) => skill.slug === newSkillData.slug.trim())) {
      issues.push("A skill with this slug already exists.");
    }

    if (!newSkillData.name.trim()) {
      issues.push("Name is required.");
    }

    return issues;
  }, [newSkillData.name, newSkillData.slug, skills]);

  const createSkillValidationIssues = useMemo(() => {
    const issues = [...createSkillBasicIssues];
    if (newSkillData.bundleType === "native" && !newSkillData.skillContent.trim() && !newSkillData.systemPrompt.trim()) {
      issues.push("Native bundles work best when you provide skill instructions or a system prompt.");
    }

    return issues;
  }, [createSkillBasicIssues, newSkillData.bundleType, newSkillData.skillContent, newSkillData.systemPrompt]);

  useEffect(() => {
    if (!skills || !openSkillIdFromQuery || editingSkill || openedSkillIdFromQueryRef.current === openSkillIdFromQuery) {
      return;
    }
    const found = skills.find((skill: any) => skill.id === openSkillIdFromQuery);
    if (found) {
      openedSkillIdFromQueryRef.current = openSkillIdFromQuery;
      const autoLearning = getAutoLearningConfig((found as any).configJson ?? null);
      const productionReferenceStoryboard = getProductionReferenceStoryboardConfig((found as any).configJson ?? null);
      setEditingSkill({
        ...(found as any),
        _autoLearningEnabled: autoLearning.enabled,
        _autoLearningPromptQa: autoLearning.promptQaAfterAutoPrompt,
        _autoLearningImageQa: autoLearning.imageQaAfterGeneration,
        _autoLearningRequireAdminApproval: autoLearning.requireAdminApproval,
        _autoLearningMinPromptScore: autoLearning.minPromptScoreToPass,
        _autoLearningMinImageScore: autoLearning.minImageFidelityScoreToPass,
        _productionReferenceStoryboardConfigured: productionReferenceStoryboard.configured,
        _productionReferenceStoryboardEnabled: productionReferenceStoryboard.enabled,
      } as unknown as Skill);
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
    if (maintenanceStatusFilterFromQuery) {
      setMaintenanceStatusFilter(maintenanceStatusFilterFromQuery);
    }
  }, [maintenanceStatusFilterFromQuery]);

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
  const { data: iscProposals, isLoading: isIscProposalsLoading } = trpc.skills.listIscProposals.useQuery(undefined, {
    enabled: !!isAdmin,
    refetchInterval: activeTab === "proposals" || activeTab === "maintenance" ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const { data: proposalPreviewData, isLoading: isProposalPreviewLoading } = trpc.skills.getIscProposalContent.useQuery(
    previewProposal || { skillName: "__placeholder__", diffFile: "placeholder.diff" },
    { enabled: !!previewProposal && !!isAdmin },
  );
  const { data: maintenanceRecommendations, refetch: refetchMaintenanceRecommendations, isLoading: isMaintenanceRecommendationsLoading } =
    trpc.skills.getUpgradeRecommendations.useQuery(
      {
        skillId: maintenanceSkillFilter ?? undefined,
        status: maintenanceStatusFilter !== "all" ? maintenanceStatusFilter as any : undefined,
        includeDismissed: maintenanceStatusFilter === "all",
        limit: 200,
      },
      {
        enabled: !!isAdmin,
        refetchInterval: activeTab === "maintenance" || activeTab === "proposals" ? 5_000 : false,
        refetchIntervalInBackground: false,
      },
    );
  const { data: selectedRecommendationDetail, isLoading: isRecommendationDetailLoading } = trpc.skills.getUpgradeRecommendationDetail.useQuery(
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
    isLoading: isLegacyUpgradeQueueLoading,
  } = trpc.skills.getLegacyUpgradeQueue.useQuery(
    {
      includeApplied: legacyUpgradeIncludeApplied,
      limit: 100,
    },
    { enabled: !!isAdmin },
  );
  const [legacyApplyRunFilter, setLegacyApplyRunFilter] = useState<"all" | "queued" | "running" | "failed" | "completed" | "blocked" | "canceled">("all");
  const {
    data: legacyApplyRunsResponse,
    refetch: refetchLegacyApplyRuns,
    isFetching: isLegacyApplyRunsFetching,
    isLoading: isLegacyApplyRunsLoading,
  } = trpc.skills.getLegacyUpgradeApplyRuns.useQuery(
    {
      state: legacyApplyRunFilter,
      limit: 100,
    },
    { enabled: !!isAdmin },
  );
  const applyLegacyUpgradeRecommendationsMutation = trpc.skills.applyLegacyUpgradeRecommendations.useMutation({
    onSuccess: (result) => {
      utils.skills.getLegacyUpgradeQueue.invalidate();
      utils.skills.getLegacyUpgradeQueueSummary.invalidate();
      utils.skills.getLegacyUpgradeApplyRuns.invalidate();
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
  const retryLegacyUpgradeApplyRunsMutation = trpc.skills.retryLegacyUpgradeApplyRuns.useMutation({
    onSuccess: (result) => {
      utils.skills.getLegacyUpgradeQueue.invalidate();
      utils.skills.getLegacyUpgradeQueueSummary.invalidate();
      utils.skills.getLegacyUpgradeApplyRuns.invalidate();
      utils.skills.getUpgradeRecommendations.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      setSelectedLegacyUpgradeIds([]);
      toast({
        title: "Legacy Apply Runs Retried",
        description: `${result.appliedCount} run(s) retried, ${result.failedCount} failed.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Retry Failed",
        description: error.message || "Failed to retry selected apply runs.",
        variant: "destructive",
      });
    },
  });
  const normalizeLegacyUpgradeApplyRunsMutation = trpc.skills.normalizeLegacyUpgradeApplyRuns.useMutation({
    onSuccess: (result) => {
      utils.skills.getLegacyUpgradeQueue.invalidate();
      utils.skills.getLegacyUpgradeQueueSummary.invalidate();
      utils.skills.getLegacyUpgradeApplyRuns.invalidate();
      utils.skills.getUpgradeRecommendations.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      toast({
        title: t("admin.skillsPage.legacyRunQueue.normalizeNoChangeTitle"),
        description: t("admin.skillsPage.legacyRunQueue.normalizeNoChangeDescription", {
          count: result.normalizedCount,
          scanned: result.scannedCount,
        }),
      });
    },
    onError: (error) => {
      toast({
        title: t("admin.skillsPage.legacyRunQueue.normalizeNoChangeFailedTitle"),
        description: error.message || t("admin.skillsPage.legacyRunQueue.normalizeNoChangeFailedDescription"),
        variant: "destructive",
      });
    },
  });
  const recoverStaleLegacyUpgradeApplyRunsMutation = trpc.skills.recoverStaleLegacyUpgradeApplyRuns.useMutation({
    onSuccess: (result) => {
      utils.skills.getLegacyUpgradeQueue.invalidate();
      utils.skills.getLegacyUpgradeQueueSummary.invalidate();
      utils.skills.getLegacyUpgradeApplyRuns.invalidate();
      utils.skills.getUpgradeRecommendations.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      if (result.recoveredCount > 0 || result.retriedCount > 0) {
        toast({
          title: t("admin.skillsPage.legacyRunQueue.recoverStaleTitle"),
          description: t("admin.skillsPage.legacyRunQueue.recoverStaleDescription", {
            recovered: result.recoveredCount,
            retried: result.retriedCount,
          }),
        });
      }
    },
    onError: (error) => {
      toast({
        title: t("admin.skillsPage.legacyRunQueue.recoverStaleFailedTitle"),
        description: error.message || t("admin.skillsPage.legacyRunQueue.recoverStaleFailedDescription"),
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
  const maintenanceQueuedProposalCount = useMemo(() => (
    (maintenanceRecommendations || []).filter((item) => {
      const applyStrategy = item.latestRun?.logsJson && typeof item.latestRun.logsJson === "object"
        ? (item.latestRun.logsJson as Record<string, unknown>).applyStrategy
        : null;
      return item.latestRun?.status === "running" && applyStrategy === "proposal";
    }).length
  ), [maintenanceRecommendations]);
  const legacyApplyRunItems = legacyApplyRunsResponse?.items ?? [];
  const rawLegacyApplyRunCounts = legacyApplyRunsResponse?.counts;
  const legacyApplyRunCounts = {
    total: rawLegacyApplyRunCounts?.total ?? 0,
    queued: rawLegacyApplyRunCounts?.queued ?? 0,
    running: rawLegacyApplyRunCounts?.running ?? 0,
    failed: rawLegacyApplyRunCounts?.failed ?? 0,
    completed: rawLegacyApplyRunCounts?.completed ?? 0,
    blocked: rawLegacyApplyRunCounts?.blocked ?? 0,
    canceled: rawLegacyApplyRunCounts?.canceled ?? 0,
  };
  const retryableLegacyApplyRunIds = useMemo(
    () => legacyApplyRunItems
      .filter((item) => item.queueState === "failed" || item.queueState === "blocked")
      .map((item) => item.id),
    [legacyApplyRunItems],
  );
  const normalizableLegacyApplyRunIds = useMemo(
    () => legacyApplyRunItems
      .filter((item) => item.queueState === "failed" && isLegacyApplyRunNoChangeCandidate(item))
      .map((item) => item.id),
    [legacyApplyRunItems],
  );
  const autoRetryableLegacyApplyRunIds = useMemo(
    () => legacyApplyRunItems
      .filter((item) => (
        (item.queueState === "failed" || item.queueState === "blocked")
        && isLegacyApplyRunWorkspaceRootIssue(item)
        && !autoRetriedLegacyApplyRunIdsRef.current.has(item.id)
      ))
      .map((item) => item.id),
    [legacyApplyRunItems],
  );
  const staleLegacyApplyRunIds = useMemo(
    () => legacyApplyRunItems
      .filter((item) => {
        if (item.queueState !== "queued" && item.queueState !== "running") {
          return false;
        }
        if (autoRecoveredStaleLegacyApplyRunIdsRef.current.has(item.id)) {
          return false;
        }
        const activityAt = new Date(item.updatedAt ?? item.startedAt ?? item.createdAt).getTime();
        return Number.isFinite(activityAt) && Date.now() - activityAt >= 30 * 60 * 1000;
      })
      .map((item) => item.id),
    [legacyApplyRunItems],
  );

  useEffect(() => {
    if (activeTab !== "maintenance" || isLegacyApplyRunsLoading || isLegacyApplyRunsFetching) {
      return;
    }

    if (staleLegacyApplyRunIds.length > 0 && !recoverStaleLegacyUpgradeApplyRunsMutation.isPending) {
      for (const runId of staleLegacyApplyRunIds) {
        autoRecoveredStaleLegacyApplyRunIdsRef.current.add(runId);
      }
      recoverStaleLegacyUpgradeApplyRunsMutation.mutate({ runIds: staleLegacyApplyRunIds });
      return;
    }

    if (normalizableLegacyApplyRunIds.length > 0 && !normalizeLegacyUpgradeApplyRunsMutation.isPending) {
      const signature = normalizableLegacyApplyRunIds.join(",");
      if (autoNormalizedLegacyApplySignatureRef.current !== signature) {
        autoNormalizedLegacyApplySignatureRef.current = signature;
        normalizeLegacyUpgradeApplyRunsMutation.mutate();
        return;
      }
    }

    if (autoRetryableLegacyApplyRunIds.length > 0 && !retryLegacyUpgradeApplyRunsMutation.isPending) {
      for (const runId of autoRetryableLegacyApplyRunIds) {
        autoRetriedLegacyApplyRunIdsRef.current.add(runId);
      }
      retryLegacyUpgradeApplyRunsMutation.mutate({ runIds: autoRetryableLegacyApplyRunIds });
    }
  }, [
    activeTab,
    autoRetryableLegacyApplyRunIds,
    isLegacyApplyRunsFetching,
    isLegacyApplyRunsLoading,
    normalizableLegacyApplyRunIds,
    normalizeLegacyUpgradeApplyRunsMutation,
    recoverStaleLegacyUpgradeApplyRunsMutation,
    retryLegacyUpgradeApplyRunsMutation,
    staleLegacyApplyRunIds,
  ]);
  const renderTableLoadingRow = (colSpan: number, label: string) => (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{label}</span>
        </div>
      </TableCell>
    </TableRow>
  );

  function toValidDate(value: Date | string | number | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isDateAfter(left: Date | string | null | undefined, right: Date | string | null | undefined): boolean {
    const leftDate = toValidDate(left);
    const rightDate = toValidDate(right);
    if (!leftDate) {
      return false;
    }
    if (!rightDate) {
      return true;
    }
    return leftDate.getTime() > rightDate.getTime();
  }

  function formatMaintenanceDateTime(value: Date | string | number | null | undefined): string {
    const date = toValidDate(value);
    if (!date) {
      return t("admin.skillsPage.maintenance.timestamps.none");
    }
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatMaintenanceRelativeTime(value: Date | string | number | null | undefined): string {
    const date = toValidDate(value);
    if (!date) {
      return t("admin.skillsPage.maintenance.timestamps.unknownAge");
    }
    const diffMs = Date.now() - date.getTime();
    const absMs = Math.abs(diffMs);
    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;
    const valueAndUnit = absMs < hourMs
      ? { value: Math.max(1, Math.round(absMs / minuteMs)), unit: "minute" as const }
      : absMs < dayMs
        ? { value: Math.round(absMs / hourMs), unit: "hour" as const }
        : { value: Math.round(absMs / dayMs), unit: "day" as const };
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
      diffMs > 0 ? -valueAndUnit.value : valueAndUnit.value,
      valueAndUnit.unit,
    );
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
          latestAnalyzedAt: item.analyzedAt,
          latestUpdatedAt: item.updatedAt,
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
      if (isDateAfter(item.analyzedAt, existing.latestAnalyzedAt)) {
        existing.latestAnalyzedAt = item.analyzedAt;
      }
      if (isDateAfter(item.updatedAt, existing.latestUpdatedAt)) {
        existing.latestUpdatedAt = item.updatedAt;
      }
      if (isDateAfter(item.analyzedAt, existing.primaryRecommendation.analyzedAt)) {
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
        .filter((item) => isMaintenanceRecommendationEffectiveAutoApplySafe(item) && isMaintenanceRecommendationActionable(item))
        .map((item) => item.id)
    )),
    [maintenanceRecommendationGroups],
  );
  const maintenancePendingSkillCount = useMemo(
    () => maintenanceRecommendationGroups.filter((group) => (
      group.recommendations.some((item) => item.status === "pending_review" || item.status === "approved")
    )).length,
    [maintenanceRecommendationGroups],
  );
  const maintenanceBlockedOrFailedSkillCount = useMemo(
    () => maintenanceRecommendationGroups.filter((group) => (
      group.recommendations.some((item) => item.status === "blocked" || item.status === "failed")
    )).length,
    [maintenanceRecommendationGroups],
  );
  const maintenanceLatestActivityAt = useMemo(() => {
    const candidates = [
      ...maintenanceRecommendationGroups.flatMap((group) => [group.latestAnalyzedAt, group.latestUpdatedAt]),
      ...legacyApplyRunItems.flatMap((item) => [item.createdAt, item.updatedAt, item.startedAt, item.endedAt]),
    ].filter(Boolean) as Array<Date | string>;
    return candidates.reduce<Date | string | null>((latest, value) => (
      isDateAfter(value, latest) ? value : latest
    ), null);
  }, [legacyApplyRunItems, maintenanceRecommendationGroups]);
  const maintenanceExpandedSkillIdSet = useMemo(() => new Set(expandedMaintenanceSkillIds), [expandedMaintenanceSkillIds]);
  const legacyUpgradeQueueItems = (legacyUpgradeQueue || []) as LegacyUpgradeQueueItem[];
  const visibleLegacyUpgradeQueueItems = useMemo(
    () => legacyUpgradeIncludeApplied
      ? legacyUpgradeQueueItems
      : legacyUpgradeQueueItems.filter((item) => !isLegacyUpgradeTerminalHistory(item)),
    [legacyUpgradeIncludeApplied, legacyUpgradeQueueItems],
  );
  const legacyUpgradeFilteredItems = useMemo(() => {
    switch (legacyUpgradeQueueFilter) {
      case "critical":
        return visibleLegacyUpgradeQueueItems.filter((item) => item.upgradePriorityTier === "critical");
      case "high":
        return visibleLegacyUpgradeQueueItems.filter((item) => item.upgradePriorityTier === "high");
      case "parallel":
        return visibleLegacyUpgradeQueueItems.filter((item) => item.parallelUpgradeEligible);
      case "eligible":
        return visibleLegacyUpgradeQueueItems.filter((item) => item.status !== "applied" && item.status !== "dismissed");
      default:
        return visibleLegacyUpgradeQueueItems;
    }
  }, [legacyUpgradeQueueFilter, visibleLegacyUpgradeQueueItems]);
  const selectedLegacyUpgradeIdSet = useMemo(() => new Set(selectedLegacyUpgradeIds), [selectedLegacyUpgradeIds]);
  const expandedLegacyUpgradeIdSet = useMemo(() => new Set(expandedLegacyUpgradeIds), [expandedLegacyUpgradeIds]);
  const legacyUpgradeQueueById = useMemo(
    () => new Map(visibleLegacyUpgradeQueueItems.map((item) => [item.id, item])),
    [visibleLegacyUpgradeQueueItems],
  );
  const selectableLegacyUpgradeIds = useMemo(
    () => visibleLegacyUpgradeQueueItems
      .filter((item) => canRunLegacyUpgradeAction(item))
      .map((item) => item.id),
    [visibleLegacyUpgradeQueueItems],
  );
  const autoActionableLegacyUpgradeItems = useMemo(
    () => visibleLegacyUpgradeQueueItems
      .filter((item) => canRunLegacyUpgradeAction(item))
      .slice(0, 50),
    [visibleLegacyUpgradeQueueItems],
  );
  const autoActionableLegacyUpgradeIds = useMemo(
    () => autoActionableLegacyUpgradeItems.map((item) => item.id),
    [autoActionableLegacyUpgradeItems],
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
      .filter((item) => canRunLegacyUpgradeAction(item))
      .map((item) => item.id),
    [legacyUpgradeFilteredItems],
  );
  const legacyUpgradeCriticalCount = visibleLegacyUpgradeQueueItems.filter((item) => item.upgradePriorityTier === "critical").length;
  const legacyUpgradeHighCount = visibleLegacyUpgradeQueueItems.filter((item) => item.upgradePriorityTier === "high").length;
  const legacyUpgradeBlockedCount = visibleLegacyUpgradeQueueItems.filter((item) => item.status === "blocked").length;
  const legacyUpgradeFailedCount = visibleLegacyUpgradeQueueItems.filter((item) => item.status === "failed").length;
  const legacyUpgradeAutoBacklogCount = visibleLegacyUpgradeQueueItems.filter((item) => canRunLegacyUpgradeAction(item)).length;
  const legacyUpgradeMonitorNames = autoActionableLegacyUpgradeItems
    .slice(0, 6)
    .map((item) => item.skill?.name || item.skill?.slug || `Skill #${item.skillId}`);
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
    setExpandedLegacyUpgradeIds(visibleLegacyUpgradeQueueItems.map((item) => item.id));
  }

  function collapseAllLegacyUpgradeDetails() {
    setExpandedLegacyUpgradeIds([]);
  }

  useEffect(() => {
    const criticalIds = visibleLegacyUpgradeQueueItems
      .filter((item) => item.upgradePriorityTier === "critical")
      .map((item) => item.id);

    if (criticalIds.length === 0) {
      return;
    }

    setExpandedLegacyUpgradeIds((current) => Array.from(new Set([...current, ...criticalIds])));
  }, [visibleLegacyUpgradeQueueItems]);

  useEffect(() => {
    if (activeTab !== "maintenance") {
      return;
    }
    if (isLegacyUpgradeQueueLoading || isLegacyUpgradeQueueFetching) {
      return;
    }
    if (applyLegacyUpgradeRecommendationsMutation.isPending) {
      return;
    }
    const unqueuedIds = visibleLegacyUpgradeQueueItems
      .filter((item) => canRunLegacyUpgradeAction(item))
      .filter((item) => !autoQueuedLegacyRecommendationIdsRef.current.has(item.id))
      .slice(0, 50)
      .map((item) => item.id);

    if (unqueuedIds.length === 0) {
      return;
    }

    for (const id of unqueuedIds) {
      autoQueuedLegacyRecommendationIdsRef.current.add(id);
    }

    applyLegacyUpgradeRecommendationsMutation.mutate({
      recommendationIds: unqueuedIds,
    });
  }, [
    activeTab,
    applyLegacyUpgradeRecommendationsMutation,
    isLegacyUpgradeQueueFetching,
    isLegacyUpgradeQueueLoading,
    visibleLegacyUpgradeQueueItems,
  ]);

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

  function extractIssueMessages(payload: unknown): string[] {
    if (!payload || typeof payload !== "object") {
      return [];
    }

    const issues = (payload as { issues?: unknown }).issues;
    if (!Array.isArray(issues)) {
      return [];
    }

    return issues
      .map((issue) => {
        if (typeof issue === "string") {
          return issue.trim();
        }
        if (issue && typeof issue === "object") {
          const message = (issue as { message?: unknown }).message;
          if (typeof message === "string") {
            return message.trim();
          }
        }
        return String(issue ?? "").trim();
      })
      .filter(Boolean);
  }

  function getLegacyUpgradeReason(item: LegacyUpgradeQueueItem): string | null {
    const latestRun = item.latestRun;
    const verificationIssues = extractIssueMessages(latestRun?.verificationJson);
    const logIssues = extractIssueMessages(latestRun?.logsJson);
    const recommendationDetails = item.recommendationJson?.details && typeof item.recommendationJson.details === "object"
      ? item.recommendationJson.details as Record<string, unknown>
      : null;
    const detailReason =
      typeof recommendationDetails?.reason === "string" ? recommendationDetails.reason.trim() : null;
    const detailError =
      typeof recommendationDetails?.errorMessage === "string" ? recommendationDetails.errorMessage.trim() : null;
    const detailBlockedReason =
      typeof recommendationDetails?.blockedReason === "string" ? recommendationDetails.blockedReason.trim() : null;
    const detailFailureReason =
      typeof recommendationDetails?.failureReason === "string" ? recommendationDetails.failureReason.trim() : null;

    const runReason = [
      latestRun?.errorMessage?.trim(),
      latestRun?.summary?.trim(),
      ...verificationIssues,
      ...logIssues,
      detailReason,
      detailError,
      detailBlockedReason,
      detailFailureReason,
    ].find(Boolean);

    if (item.status === "blocked") {
      return runReason
        || t("admin.skillsPage.legacyQueue.blockedReasonFallback");
    }

    if (item.status === "failed") {
      return runReason
        || t("admin.skillsPage.legacyQueue.failedReasonFallback");
    }

    if (item.status === "applied") {
      return runReason
        || t("admin.skillsPage.legacyQueue.appliedReasonFallback");
    }

    if (item.status === "approved") {
      return runReason
        || t("admin.skillsPage.legacyQueue.approvedReasonFallback");
    }

    return runReason ?? null;
  }

  function isLegacyUpgradeNoChangeOutcome(item: LegacyUpgradeQueueItem): boolean {
    const combined = [
      item.latestRun?.summary,
      item.latestRun?.errorMessage,
      getLegacyQueueLatestRunString(item, "resultMessage"),
      getLegacyQueueLatestRunString(item, "completionMode"),
      getLegacyQueueLatestRunString(item, "resultError"),
      getLegacyUpgradeReason(item),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return combined.includes("no patches generated")
      || combined.includes("no code changes")
      || combined.includes("without code changes")
      || combined.includes("no changes required")
      || combined.includes("completionmode no_changes")
      || combined.includes("no_changes");
  }

  function isLegacyUpgradeProposalReady(item: LegacyUpgradeQueueItem): boolean {
    const applyStrategy = getLegacyQueueLatestRunString(item, "applyStrategy");
    const combined = [
      item.latestRun?.summary,
      item.latestRun?.errorMessage,
      getLegacyQueueLatestRunString(item, "resultMessage"),
      applyStrategy,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return item.latestRun?.runType === "apply"
      && item.latestRun.status === "completed"
      && (applyStrategy === "proposal" || combined.includes("proposal generated"));
  }

  function isLegacyUpgradeTerminalHistory(item: LegacyUpgradeQueueItem): boolean {
    return item.status === "applied"
      || item.status === "dismissed"
      || isLegacyUpgradeProposalReady(item)
      || isLegacyUpgradeNoChangeOutcome(item);
  }

  function canRunLegacyUpgradeAction(item: LegacyUpgradeQueueItem): boolean {
    if (item.status === "applied" || item.status === "dismissed") {
      return false;
    }
    if (item.latestRun?.status === "running" || item.latestRun?.status === "queued") {
      return false;
    }
    if (isLegacyUpgradeProposalReady(item)) {
      return false;
    }
    if (isLegacyUpgradeNoChangeOutcome(item)) {
      return false;
    }
    return true;
  }

  function isMaintenanceRecommendationActionable(item: MaintenanceRecommendation): boolean {
    if (item.status === "applied" || item.status === "dismissed") {
      return false;
    }
    if (item.latestRun?.status === "running" || item.latestRun?.status === "queued") {
      return false;
    }
    const applyStrategy = item.latestRun?.logsJson && typeof item.latestRun.logsJson === "object"
      ? (item.latestRun.logsJson as Record<string, unknown>).applyStrategy
      : null;
    const proposalOnlyCompleted = item.latestRun?.status === "completed"
      && (applyStrategy === "proposal" || String(item.latestRun.summary || "").toLowerCase().includes("proposal generated"));
    if (proposalOnlyCompleted) {
      return false;
    }
    return true;
  }

  function isMediaStudioInstructionOnlyRecommendation(item: {
    recommendationType?: string | null;
    recommendationJson?: Record<string, any> | null;
  }): boolean {
    if (item.recommendationType !== "media-studio-auto-learning") {
      return false;
    }
    const payload = item.recommendationJson ?? {};
    if (payload.source !== "media_studio_auto_learning") {
      return false;
    }
    const proposedChanges = Array.isArray(payload.proposedChanges) ? payload.proposedChanges : [];
    const targetFiles = proposedChanges
      .map((change) => String(change?.targetFile || "").trim().toLowerCase())
      .filter(Boolean);
    return targetFiles.length > 0 && targetFiles.every((file) => file === "skill.md" || file.endsWith(".md"));
  }

  function isMaintenanceRecommendationEffectiveAutoApplySafe(
    item: {
      isAutoApplySafe?: boolean | null;
      recommendationType?: string | null;
      recommendationJson?: Record<string, any> | null;
    },
  ): boolean {
    return item.isAutoApplySafe || isMediaStudioInstructionOnlyRecommendation(item);
  }

  function getMediaStudioRecommendationIssues(item: Pick<MaintenanceRecommendation, "recommendationJson">) {
    return Array.isArray(item.recommendationJson?.issues) ? item.recommendationJson.issues : [];
  }

  function getMediaStudioRecommendationChanges(item: Pick<MaintenanceRecommendation, "recommendationJson">) {
    return Array.isArray(item.recommendationJson?.proposedChanges) ? item.recommendationJson.proposedChanges : [];
  }

  function getLegacyUpgradeNextAction(item: LegacyUpgradeQueueItem): LegacyUpgradeNextAction {
    if (item.latestRun?.status === "running" || item.latestRun?.status === "queued") {
      return {
        label: t("admin.skillsPage.legacyQueue.nextAction.wait.label"),
        description: t("admin.skillsPage.legacyQueue.nextAction.wait.description"),
        tone: "info",
        buttonLabel: null,
        canRun: false,
      };
    }

    if (isLegacyUpgradeNoChangeOutcome(item)) {
      return {
        label: t("admin.skillsPage.legacyQueue.nextAction.noChange.label"),
        description: t("admin.skillsPage.legacyQueue.nextAction.noChange.description"),
        tone: "success",
        buttonLabel: null,
        canRun: false,
      };
    }

    if (isLegacyUpgradeProposalReady(item)) {
      return {
        label: t("admin.skillsPage.legacyQueue.nextAction.proposalReady.label"),
        description: t("admin.skillsPage.legacyQueue.nextAction.proposalReady.description"),
        tone: "info",
        buttonLabel: t("admin.skillsPage.legacyQueue.viewAdvice"),
        canRun: false,
      };
    }

    if (item.status === "applied") {
      return {
        label: t("admin.skillsPage.legacyQueue.nextAction.done.label"),
        description: t("admin.skillsPage.legacyQueue.nextAction.done.description"),
        tone: "success",
        buttonLabel: null,
        canRun: false,
      };
    }

    if (item.status === "blocked" || item.status === "failed") {
      return {
        label: t("admin.skillsPage.legacyQueue.nextAction.retry.label"),
        description: t("admin.skillsPage.legacyQueue.nextAction.retry.description"),
        tone: item.status === "blocked" ? "danger" : "warning",
        buttonLabel: item.isAutoApplySafe
          ? t("admin.skillsPage.legacyQueue.applyUpgrade")
          : t("admin.skillsPage.legacyQueue.generateProposal"),
        canRun: true,
      };
    }

    if (item.status === "approved") {
      return {
        label: item.isAutoApplySafe
          ? t("admin.skillsPage.legacyQueue.nextAction.apply.label")
          : t("admin.skillsPage.legacyQueue.nextAction.generate.label"),
        description: item.isAutoApplySafe
          ? t("admin.skillsPage.legacyQueue.nextAction.apply.description")
          : t("admin.skillsPage.legacyQueue.nextAction.generate.description"),
        tone: item.isAutoApplySafe ? "success" : "info",
        buttonLabel: item.isAutoApplySafe
          ? t("admin.skillsPage.legacyQueue.applyUpgrade")
          : t("admin.skillsPage.legacyQueue.generateProposal"),
        canRun: true,
      };
    }

    return {
      label: t("admin.skillsPage.legacyQueue.nextAction.review.label"),
      description: t("admin.skillsPage.legacyQueue.nextAction.review.description"),
      tone: "neutral",
      buttonLabel: t("admin.skillsPage.legacyQueue.viewAdvice"),
      canRun: false,
    };
  }

  function getLegacyUpgradeNextActionClass(tone: LegacyUpgradeNextAction["tone"]): string {
    if (tone === "success") {
      return "border-emerald-500 bg-emerald-50 text-emerald-700";
    }
    if (tone === "warning") {
      return "border-orange-500 bg-orange-50 text-orange-700";
    }
    if (tone === "danger") {
      return "border-red-500 bg-red-50 text-red-700";
    }
    if (tone === "info") {
      return "border-blue-500 bg-blue-50 text-blue-700";
    }
    return "border-slate-300 bg-slate-50 text-slate-700";
  }

  function getLegacyQueueLatestRunString(item: LegacyUpgradeQueueItem, key: string): string | null {
    const logs = item.latestRun?.logsJson;
    if (!logs || typeof logs !== "object") {
      return null;
    }
    const value = (logs as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function getLegacyQueueLatestRunNumber(item: LegacyUpgradeQueueItem, key: string): number | null {
    const logs = item.latestRun?.logsJson;
    if (!logs || typeof logs !== "object") {
      return null;
    }
    const value = (logs as Record<string, unknown>)[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function getLegacyRunLineageSource(run: { lineage?: unknown; logsJson?: unknown } | null | undefined): Record<string, unknown> | null {
    if (!run) {
      return null;
    }
    if (run.lineage && typeof run.lineage === "object" && !Array.isArray(run.lineage)) {
      return run.lineage as Record<string, unknown>;
    }
    if (run.logsJson && typeof run.logsJson === "object") {
      const logs = run.logsJson as Record<string, unknown>;
      const lineage = logs.lineage;
      if (lineage && typeof lineage === "object" && !Array.isArray(lineage)) {
        return lineage as Record<string, unknown>;
      }
    }
    return null;
  }

  function getLegacyRunLineageString(lineage: Record<string, unknown> | null, key: string): string | null {
    if (!lineage) {
      return null;
    }
    const direct = lineage[key];
    if (typeof direct === "string" && direct.trim()) {
      return direct.trim();
    }
    const fallbackKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    const fallback = lineage[fallbackKey];
    return typeof fallback === "string" && fallback.trim() ? fallback.trim() : null;
  }

  function getLegacyRunLineageNumber(lineage: Record<string, unknown> | null, key: string): number | null {
    if (!lineage) {
      return null;
    }
    const direct = lineage[key];
    if (typeof direct === "number" && Number.isFinite(direct)) {
      return direct;
    }
    const fallbackKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    const fallback = lineage[fallbackKey];
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
  }

  function getLegacyRunLineageArray(lineage: Record<string, unknown> | null, key: string): string[] {
    if (!lineage) {
      return [];
    }
    const direct = lineage[key];
    const fallbackKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    const values = Array.isArray(direct)
      ? direct
      : Array.isArray(lineage[fallbackKey])
        ? lineage[fallbackKey] as unknown[]
        : [];
    return values
      .map((value) => typeof value === "string" ? value.trim() : String(value ?? "").trim())
      .filter(Boolean);
  }

  function getLegacyRunRoleLabel(role: string | null): string {
    if (role === "child") {
      return t("admin.skillsPage.legacyRunQueue.roles.child");
    }
    if (role === "handoff") {
      return t("admin.skillsPage.legacyRunQueue.roles.handoff");
    }
    return t("admin.skillsPage.legacyRunQueue.roles.orchestrator");
  }

  function getLegacyRunFailureScopeLabel(role: string | null): string {
    if (role === "child") {
      return t("admin.skillsPage.legacyRunQueue.failureScopes.child");
    }
    if (role === "handoff") {
      return t("admin.skillsPage.legacyRunQueue.failureScopes.handoff");
    }
    return t("admin.skillsPage.legacyRunQueue.failureScopes.orchestrator");
  }

  function getLegacyApplyRunStatusLabel(status: LegacyUpgradeRunItem["queueState"]): string {
    if (status === "queued") {
      return t("admin.skillsPage.legacyRunQueue.status.queued");
    }
    if (status === "running") {
      return t("admin.skillsPage.legacyRunQueue.status.running");
    }
    if (status === "failed") {
      return t("admin.skillsPage.legacyRunQueue.status.failed");
    }
    if (status === "completed") {
      return t("admin.skillsPage.legacyRunQueue.status.completed");
    }
    if (status === "blocked") {
      return t("admin.skillsPage.legacyRunQueue.status.blocked");
    }
    return t("admin.skillsPage.legacyRunQueue.status.canceled");
  }

  function getLegacyApplyRunReason(run: LegacyUpgradeRunItem): string | null {
    const resultMessage = typeof run.resultMessage === "string" ? run.resultMessage.trim() : null;
    const resultError = typeof run.resultError === "string" ? run.resultError.trim() : null;
    const verificationIssues = extractIssueMessages(run.verificationJson);
    const logIssues = extractIssueMessages(run.logsJson);
    return [
      resultError,
      resultMessage,
      run.errorMessage?.trim(),
      run.summary?.trim(),
      ...verificationIssues,
      ...logIssues,
    ].find(Boolean) || null;
  }

  function getLegacyApplyRunLogString(run: LegacyUpgradeRunItem, key: string): string | null {
    const logs = run.logsJson;
    if (!logs || typeof logs !== "object") {
      return null;
    }
    const value = (logs as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function isLegacyApplyRunNoChangeCandidate(run: LegacyUpgradeRunItem): boolean {
    const completionMode = getLegacyApplyRunLogString(run, "completionMode");
    if (completionMode === "no_changes") {
      return true;
    }

    const combined = [
      run.summary,
      run.resultMessage,
      getLegacyApplyRunLogString(run, "resultMessage"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return [
      "no patches generated",
      "no changes required",
      "completed without code changes",
      "isc improve complete",
    ].some((signal) => combined.includes(signal));
  }

  function isLegacyApplyRunWorkspaceRootIssue(run: LegacyUpgradeRunItem): boolean {
    if (run.workspaceRootIssue || run.diagnosticCode === "isc_workspace_root_pollution") {
      return true;
    }
    const combined = [
      run.workspaceRoot,
      run.entrypointRoot,
      run.resultError,
      run.errorMessage,
      getLegacyApplyRunLogString(run, "workspaceRoot"),
      getLegacyApplyRunLogString(run, "entrypointRoot"),
      getLegacyApplyRunLogString(run, "resultError"),
      getLegacyApplyRunLogString(run, "failureCode"),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\\/g, "/")
      .toLowerCase();
    return combined.includes("isc_workspace_root_pollution")
      || (combined.includes("/runs/workspaces/") && combined.includes("/skills/intelligence-skill-creator/"));
  }

  function getLegacyApplyRunDiagnosticPaths(run: LegacyUpgradeRunItem): Array<{ label: string; value: string }> {
    return [
      {
        label: t("admin.skillsPage.legacyRunQueue.diagnostics.workspaceRoot"),
        value: run.workspaceRoot || getLegacyApplyRunLogString(run, "workspaceRoot") || "",
      },
      {
        label: t("admin.skillsPage.legacyRunQueue.diagnostics.proposalRoot"),
        value: run.proposalRoot || getLegacyApplyRunLogString(run, "proposalRoot") || "",
      },
      {
        label: t("admin.skillsPage.legacyRunQueue.diagnostics.entrypointRoot"),
        value: run.entrypointRoot || getLegacyApplyRunLogString(run, "entrypointRoot") || "",
      },
      {
        label: t("admin.skillsPage.legacyRunQueue.diagnostics.canonicalIscRoot"),
        value: run.canonicalIscRoot || getLegacyApplyRunLogString(run, "canonicalIscRoot") || "",
      },
    ].filter((item) => item.value.trim());
  }

  function getLegacyApplyRunTaskId(run: LegacyUpgradeRunItem): string {
    return run.taskId || t("admin.skillsPage.legacyRunQueue.noTaskId");
  }

  function getLegacyApplyRunStrategy(run: LegacyUpgradeRunItem): string | null {
    if (!run.logsJson || typeof run.logsJson !== "object") {
      return null;
    }
    const strategy = (run.logsJson as Record<string, unknown>).applyStrategy;
    return typeof strategy === "string" ? strategy : null;
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

  function getMaintenanceGroupStatusBadges(group: MaintenanceRecommendationGroup): MaintenanceGroupStatusBadge[] {
    const recommendationStatusCounts: Record<MaintenanceRecommendation["status"], number> = {
      pending_review: 0,
      approved: 0,
      dismissed: 0,
      applied: 0,
      blocked: 0,
      failed: 0,
    };
    const runStatusCounts = {
      queued: 0,
      running: 0,
      failed: 0,
      completed: 0,
    };

    for (const item of group.recommendations) {
      recommendationStatusCounts[item.status] += 1;
      const runStatus = item.latestRun?.status;
      if (runStatus === "queued" || runStatus === "running" || runStatus === "failed" || runStatus === "completed") {
        runStatusCounts[runStatus] += 1;
      }
    }

    const badges: MaintenanceGroupStatusBadge[] = [];
    const addBadge = (
      key:
        | "pending_review"
        | "approved"
        | "dismissed"
        | "applied"
        | "blocked"
        | "failed"
        | "queued"
        | "running"
        | "completed",
      count: number,
      variant: MaintenanceGroupStatusBadge["variant"],
    ) => {
      if (count <= 0) {
        return;
      }
      const labelMap: Record<typeof key, string> = {
        pending_review: t("admin.skillsPage.maintenance.status.pendingReview"),
        approved: t("admin.skillsPage.maintenance.status.approved"),
        dismissed: t("admin.skillsPage.maintenance.status.dismissed"),
        applied: t("admin.skillsPage.maintenance.status.applied"),
        blocked: t("admin.skillsPage.maintenance.status.blocked"),
        failed: t("admin.skillsPage.maintenance.status.failed"),
        queued: t("admin.skillsPage.maintenance.runStatus.queued"),
        running: t("admin.skillsPage.maintenance.runStatus.running"),
        completed: t("admin.skillsPage.maintenance.runStatus.completed"),
      };
      badges.push({
        label: `${labelMap[key]}${count > 1 ? ` (${count})` : ""}`,
        variant,
      });
    };

    addBadge("queued", runStatusCounts.queued, "secondary");
    addBadge("running", runStatusCounts.running, "outline");
    addBadge("blocked", recommendationStatusCounts.blocked, "destructive");
    addBadge("failed", Math.max(recommendationStatusCounts.failed, runStatusCounts.failed), "destructive");
    addBadge("applied", recommendationStatusCounts.applied, "secondary");
    addBadge("approved", recommendationStatusCounts.approved, "outline");
    addBadge("pending_review", recommendationStatusCounts.pending_review, "outline");
    addBadge("completed", runStatusCounts.completed, "secondary");
    addBadge("dismissed", recommendationStatusCounts.dismissed, "outline");

    return badges;
  }

  function requestRecommendationApply(recommendation: RecommendationApplyTarget, skillName: string) {
    const proposalReady = Boolean(
      recommendation.skill?.slug && latestProposalBySkillName.has(recommendation.skill.slug),
    );
    const effectiveAutoApplySafe = isMaintenanceRecommendationEffectiveAutoApplySafe(recommendation);

    if (effectiveAutoApplySafe) {
      applyUpgradeMutation.mutate({ recommendationId: recommendation.id });
      return;
    }

      setPendingMaintenanceApply({
        recommendationId: recommendation.id,
        skillName,
        recommendationTitle: recommendation.title || skillName,
        isAutoApplySafe: effectiveAutoApplySafe,
        hasProposalReady: proposalReady,
      });
  }

  function openRecommendationDetail(recommendationId: number, viewMode: "advice" | "reasoning" = "advice") {
    setSelectedRecommendationViewMode(viewMode);
    setSelectedRecommendationId(recommendationId);
  }

  function requestMaintenanceGroupApply(group: MaintenanceRecommendationGroup) {
    const actionableRecommendationIds = group.recommendations
      .filter(isMaintenanceRecommendationActionable)
      .map((item) => item.id);

    if (actionableRecommendationIds.length === 0) {
      toast({
        title: t("admin.skillsPage.maintenance.noActionableTitle"),
        description: t("admin.skillsPage.maintenance.noActionableDescription"),
      });
      return;
    }

    applyMaintenanceRecommendationsMutation.mutate({
      recommendationIds: actionableRecommendationIds,
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
  const { data: folders, refetch: refetchFolders, isLoading: isFoldersLoading } = trpc.skills.scanFolders.useQuery(undefined, {
    enabled: activeTab === "import",
  });

  // Create skill mutation
  const createMutation = trpc.skills.create.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      setIsCreateDialogOpen(false);
      setCreateDialogStep(1);
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
        openRecommendationDetail(data.recommendations[0].id, "advice");
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
      utils.skills.getLegacyUpgradeQueue.invalidate();
      utils.skills.getLegacyUpgradeQueueSummary.invalidate();
      utils.skills.getLegacyUpgradeApplyRuns.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      utils.skills.listFromDb.invalidate();
      utils.skills.listIscProposals.invalidate();
      setPendingMaintenanceApply(null);
      if (data.applyStrategy === "proposal") {
        setActiveTab("maintenance");
      }
      toast({
        title: data.applyStrategy === "proposal"
          ? "Proposal Generation Started"
          : data.mode === "queued"
            ? "Upgrade Started"
            : "Upgrade Applied",
        description: data.applyStrategy === "proposal"
          ? "A proposal-first upgrade task was queued. It will show in Maintenance while it is generating, then move to Proposals once a .diff file is written."
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
      utils.skills.getLegacyUpgradeApplyRuns.invalidate();
      if (selectedRecommendationId) {
        utils.skills.getUpgradeRecommendationDetail.invalidate({ recommendationId: selectedRecommendationId });
      }
      utils.skills.listFromDb.invalidate();
      utils.skills.listIscProposals.invalidate();
      setExpandedMaintenanceSkillIds([]);
      toast({
        title: t("admin.skillsPage.maintenance.startSuccessTitle"),
        description: t("admin.skillsPage.maintenance.startSuccessDescription", {
          appliedCount: result.appliedCount,
          failedCount: result.failedCount,
        }),
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
      bundleType: "native",
      bundleProfile: "general",
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
      bundleType: newSkillData.bundleType,
      bundleProfile: newSkillData.bundleProfile,
      systemPrompt: newSkillData.systemPrompt || undefined,
      skillContent: newSkillData.skillContent || undefined,
      marketplaceContent: newSkillData.marketplaceContent || undefined,
      visibility: newSkillData.visibility,
    });
  };

  const openCreateDialog = () => {
    setCreateDialogStep(1);
    setIsCreateDialogOpen(true);
  };

  const closeCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setCreateDialogStep(1);
  };

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return;
    }
    if (createDialogStep === 1) {
      createSlugInputRef.current?.focus();
      return;
    }
    createPrimaryActionRef.current?.focus();
  }, [createDialogStep, isCreateDialogOpen]);

  const handleCreateDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const isTextArea = target.tagName === "TEXTAREA";
    const isEnter = event.key === "Enter";
    const isModifierEnter = isEnter && (event.metaKey || event.ctrlKey);
    const isPlainEnter = isEnter && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

    if (event.altKey && event.key === "1") {
      event.preventDefault();
      setCreateDialogStep(1);
      return;
    }
    if (event.altKey && event.key === "2") {
      event.preventDefault();
      setCreateDialogStep(2);
      return;
    }

    if (createDialogStep === 1 && isPlainEnter && !isTextArea && createSkillBasicIssues.length === 0) {
      event.preventDefault();
      setCreateDialogStep(2);
      return;
    }

    if (createDialogStep === 2 && isModifierEnter && !isTextArea && createSkillValidationIssues.length === 0) {
      event.preventDefault();
      handleCreateSkill();
    }
  };

  const handleUpdateSkill = () => {
    if (!editingSkill) return;
    const existingConfigJson = editingSkill.configJson || {};
    const existingMediaStudioConfig = (
      existingConfigJson.media_studio
      && typeof existingConfigJson.media_studio === "object"
      && !Array.isArray(existingConfigJson.media_studio)
    )
      ? existingConfigJson.media_studio as Record<string, unknown>
      : {};
    const existingProductionReferenceStoryboard = (
      existingMediaStudioConfig.production_reference_storyboard
      && typeof existingMediaStudioConfig.production_reference_storyboard === "object"
      && !Array.isArray(existingMediaStudioConfig.production_reference_storyboard)
    )
      ? existingMediaStudioConfig.production_reference_storyboard as Record<string, unknown>
      : {};
    const shouldPersistProductionReferenceStoryboard = Boolean(
      (editingSkill as any)._productionReferenceStoryboardConfigured
      || (editingSkill as any)._productionReferenceStoryboardEnabled,
    );
    const nextConfigJson = {
      ...existingConfigJson,
      media_studio: {
        ...existingMediaStudioConfig,
        ...(shouldPersistProductionReferenceStoryboard
          ? {
              production_reference_storyboard: {
                ...existingProductionReferenceStoryboard,
                enabled: (editingSkill as any)._productionReferenceStoryboardEnabled === true,
              },
            }
          : {}),
        auto_learning: {
          enabled: (editingSkill as any)._autoLearningEnabled ?? false,
          prompt_qa_after_auto_prompt: (editingSkill as any)._autoLearningPromptQa ?? true,
          image_qa_after_generation: (editingSkill as any)._autoLearningImageQa ?? true,
          require_admin_approval: (editingSkill as any)._autoLearningRequireAdminApproval ?? true,
          min_prompt_score_to_pass: (editingSkill as any)._autoLearningMinPromptScore ?? 85,
          min_image_fidelity_score_to_pass: (editingSkill as any)._autoLearningMinImageScore ?? 80,
          max_auto_patch_risk: "medium",
        },
      },
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
          <Button onClick={openCreateDialog}>
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
            {maintenanceQueuedProposalCount > 0 && (
              <Badge className="ml-2" variant="outline">
                Proposal queued {maintenanceQueuedProposalCount}
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
            title={t("admin.skillsPage.library.title")}
            description={t("admin.skillsPage.library.description", { count: skills?.length || 0 })}
          >
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.skillsPage.library.headers.name")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.owner")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.visibility")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.category")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.autoTrigger")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.credits")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.priority")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.status")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.source")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.bundle")}</TableHead>
                      <TableHead>{t("admin.skillsPage.library.headers.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skills?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground">
                          {t("admin.skillsPage.library.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      skills?.map((skill) => {
                        const productionReferenceStoryboard = getProductionReferenceStoryboardConfig((skill as any).configJson ?? null);
                        return (
                        <TableRow key={skill.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(skill.category)}
                              <div className="min-w-0 space-y-1">
                                <div className="font-medium">{skill.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {skill.slug}
                                </div>
                                {productionReferenceStoryboard.enabled && (
                                  <Badge
                                    variant="outline"
                                    className="border-sky-500 bg-sky-50 text-sky-700"
                                    title="config.media_studio.production_reference_storyboard.enabled=true"
                                  >
                                    {t("admin.skillsPage.productionReferenceStoryboard.badge")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                              <span className="text-sm text-muted-foreground">
                              {(skill as any).ownerName || t("admin.skillsPage.library.systemOwner")}
                            </span>
                          </TableCell>
                          <TableCell>
                            {(skill as any).visibility === "private" && (
                              <Badge variant="outline" className="border-gray-400 text-gray-600">
                                <Lock className="mr-1 h-3 w-3" />
                                {t("admin.skillsPage.visibility.private")}
                              </Badge>
                            )}
                            {(skill as any).visibility === "pending_approval" && (
                              <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50">
                                <Clock className="mr-1 h-3 w-3" />
                                {t("admin.skillsPage.visibility.pendingApproval")}
                              </Badge>
                            )}
                            {(skill as any).visibility === "public" && (
                              <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                                <Globe className="mr-1 h-3 w-3" />
                                {t("admin.skillsPage.visibility.public")}
                              </Badge>
                            )}
                            {(skill as any).visibility === "rejected" && (
                              <Badge variant="outline" className="border-red-500 text-red-600 bg-red-50">
                                <XCircle className="mr-1 h-3 w-3" />
                                {t("admin.skillsPage.visibility.rejected")}
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
                                {t("admin.skillsPage.library.autoTrigger")}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">{t("admin.skillsPage.library.manualTrigger")}</span>
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
                                {t("admin.skillsPage.library.enabled")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-500 text-red-500">
                                <XCircle className="mr-1 h-3 w-3" />
                                {t("admin.skillsPage.library.disabled")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {skill.importSource || t("admin.skillsPage.library.manualSource")}
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
                                    openRecommendationDetail(latest.id, "advice");
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
                                    openRecommendationDetail(latest.id, "advice");
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
                                      const autoLearning = getAutoLearningConfig((skill as any).configJson ?? null);
                                      const productionReferenceStoryboard = getProductionReferenceStoryboardConfig((skill as any).configJson ?? null);
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
                                        _autoLearningEnabled: autoLearning.enabled,
                                        _autoLearningPromptQa: autoLearning.promptQaAfterAutoPrompt,
                                        _autoLearningImageQa: autoLearning.imageQaAfterGeneration,
                                        _autoLearningRequireAdminApproval: autoLearning.requireAdminApproval,
                                        _autoLearningMinPromptScore: autoLearning.minPromptScoreToPass,
                                        _autoLearningMinImageScore: autoLearning.minImageFidelityScoreToPass,
                                        _productionReferenceStoryboardConfigured: productionReferenceStoryboard.configured,
                                        _productionReferenceStoryboardEnabled: productionReferenceStoryboard.enabled,
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
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              )}
          </DashboardCard>
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          <DashboardCard
            title={t("admin.skillsPage.folders.title")}
            description={t("admin.skillsPage.folders.description")}
            leading={<FolderOpen className="h-5 w-5 text-slate-500" />}
          >
              <div className="flex justify-end mb-4">
                <Button variant="outline" onClick={() => refetchFolders()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("admin.skillsPage.folders.scan")}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.skillsPage.folders.headers.folder")}</TableHead>
                    <TableHead>{t("admin.skillsPage.folders.headers.name")}</TableHead>
                    <TableHead>{t("admin.skillsPage.folders.headers.hasManifest")}</TableHead>
                    <TableHead>{t("admin.skillsPage.folders.headers.hasPython")}</TableHead>
                    <TableHead>{t("admin.skillsPage.folders.headers.hasJs")}</TableHead>
                    <TableHead>{t("admin.skillsPage.folders.headers.inDatabase")}</TableHead>
                    <TableHead>{t("admin.skillsPage.folders.headers.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isFoldersLoading ? (
                    renderTableLoadingRow(7, "Loading folders...")
                  ) : (!folders || folders.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        {t("admin.skillsPage.folders.empty")}
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
                              <span className="text-xs text-muted-foreground">{folder.manifestFileName || t("admin.skillsPage.folders.manifest")}</span>
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
                              {t("admin.skillsPage.folders.imported")}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{t("admin.skillsPage.folders.notImported")}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {folder.existsInDb ? (
                            <span className="text-muted-foreground text-sm">{t("admin.skillsPage.folders.alreadyImported")}</span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => importFolderMutation.mutate({ slug: folder.slug })}
                              disabled={importFolderMutation.isPending}
                            >
                              <FolderSync className="mr-2 h-3 w-3" />
                              {t("admin.skillsPage.folders.import")}
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
            title={t("admin.skillsPage.proposals.title")}
            description={t("admin.skillsPage.proposals.description")}
            leading={<Sparkles className="h-5 w-5 text-slate-500" />}
          >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.skillsPage.proposals.headers.skill")}</TableHead>
                    <TableHead>{t("admin.skillsPage.proposals.headers.owner")}</TableHead>
                    <TableHead>{t("admin.skillsPage.proposals.headers.round")}</TableHead>
                    <TableHead>{t("admin.skillsPage.proposals.headers.created")}</TableHead>
                    <TableHead>{t("admin.skillsPage.proposals.headers.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isIscProposalsLoading ? (
                    renderTableLoadingRow(5, "Loading proposals...")
                  ) : (!iscProposals?.proposals?.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        <div className="mx-auto flex max-w-lg flex-col items-center gap-4">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{t("admin.skillsPage.proposals.empty")}</p>
                            <p className="text-sm text-muted-foreground">
                              ISC proposals will appear here after Skill Studio saves
                              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
                                runs/proposals/&lt;skill&gt;/&lt;round&gt;.diff
                              </code>
                              files.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              If you just started a proposal-first upgrade, it will stay in Maintenance until the diff file is written.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button variant="outline" onClick={() => setActiveTab("skills")}>
                              Go to Skills
                            </Button>
                            <Button variant="outline" onClick={() => openStudio("create")}>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Open Skill Studio
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    iscProposals.proposals.map((proposal) => (
                      <TableRow key={`${proposal.skillName}-${proposal.diffFile}`}>
                        <TableCell>
                          <div className="font-medium">{proposal.skillName}</div>
                          <div className="text-xs text-muted-foreground">{proposal.diffFile}</div>
                        </TableCell>
                        <TableCell>{proposal.ownerName || t("admin.skillsPage.proposals.unknownOwner")}</TableCell>
                        <TableCell>{proposal.round || "-"}</TableCell>
                        <TableCell>{proposal.createdAt}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewProposal({ skillName: proposal.skillName, diffFile: proposal.diffFile })}
                            >
                              {t("admin.skillsPage.proposals.preview")}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => applyProposalMutation.mutate({ skillName: proposal.skillName, diffFile: proposal.diffFile })}
                              disabled={applyProposalMutation.isPending}
                            >
                              {t("admin.skillsPage.proposals.apply")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ))}
                </TableBody>
              </Table>
          </DashboardCard>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-6">
          <DashboardCard
            title={t("admin.skillsPage.maintenance.title")}
            description={t("admin.skillsPage.maintenance.description")}
            leading={<ShieldCheck className="h-5 w-5 text-slate-500" />}
          >
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("admin.skillsPage.maintenance.overview.pendingSkills")}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">{maintenancePendingSkillCount}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("admin.skillsPage.maintenance.overview.pendingSkillsHelp")}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("admin.skillsPage.maintenance.overview.pendingRecommendations")}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">{maintenanceEligibleRecommendationIds.length}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("admin.skillsPage.maintenance.overview.eligibleHelp")}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("admin.skillsPage.maintenance.overview.runningApply")}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">{legacyApplyRunCounts.queued + legacyApplyRunCounts.running}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("admin.skillsPage.maintenance.overview.runningApplyHelp")}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("admin.skillsPage.maintenance.overview.needsAttention")}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">{maintenanceBlockedOrFailedSkillCount + legacyApplyRunCounts.failed + legacyApplyRunCounts.blocked}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("admin.skillsPage.maintenance.overview.needsAttentionHelp")}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("admin.skillsPage.maintenance.overview.latestActivity")}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{formatMaintenanceDateTime(maintenanceLatestActivityAt)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatMaintenanceRelativeTime(maintenanceLatestActivityAt)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.maintenance.filters.statusLabel")}</Label>
                  <Select value={maintenanceStatusFilter} onValueChange={setMaintenanceStatusFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending_review">{t("admin.skillsPage.maintenance.status.pendingReview")}</SelectItem>
                      <SelectItem value="approved">{t("admin.skillsPage.maintenance.status.approved")}</SelectItem>
                      <SelectItem value="applied">{t("admin.skillsPage.maintenance.status.applied")}</SelectItem>
                      <SelectItem value="blocked">{t("admin.skillsPage.maintenance.status.blocked")}</SelectItem>
                      <SelectItem value="failed">{t("admin.skillsPage.maintenance.status.failed")}</SelectItem>
                      <SelectItem value="dismissed">{t("admin.skillsPage.maintenance.status.dismissed")}</SelectItem>
                      <SelectItem value="all">{t("admin.skillsPage.maintenance.status.all")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.maintenance.filters.skillLabel")}</Label>
                  <Select
                    value={maintenanceSkillFilter ? String(maintenanceSkillFilter) : "__all__"}
                    onValueChange={(value) => setMaintenanceSkillFilter(value === "__all__" ? null : Number(value))}
                  >
                    <SelectTrigger className="w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("admin.skillsPage.maintenance.filters.allSkills")}</SelectItem>
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
                  {runMaintenanceSweepMutation.isPending ? t("admin.skillsPage.maintenance.sweeping") : t("admin.skillsPage.maintenance.sweepSkills")}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => refetchMaintenanceRecommendations()}
                >
                  {t("admin.skillsPage.maintenance.refreshQueue")}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAllMaintenanceSkillDetails(true)}
                  disabled={maintenanceRecommendationGroups.length === 0}
                >
                  {t("admin.skillsPage.maintenance.expandAllGroups")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedMaintenanceSkillIds([])}
                  disabled={expandedMaintenanceSkillIds.length === 0}
                >
                  {t("admin.skillsPage.maintenance.collapseAllGroups")}
                </Button>
                <Badge variant="outline" className="rounded-full">
                  {t("admin.skillsPage.maintenance.skillGroupsCount", { count: maintenanceRecommendationGroups.length })}
                </Badge>
                <Button
                  size="sm"
                  onClick={requestEligibleMaintenanceApplyForView}
                  disabled={maintenanceEligibleRecommendationIds.length === 0 || applyMaintenanceRecommendationsMutation.isPending}
                >
                  {t("admin.skillsPage.maintenance.applyEligibleAcrossView", { count: maintenanceEligibleRecommendationIds.length })}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.skillsPage.maintenance.headers.skill")}</TableHead>
                    <TableHead>{t("admin.skillsPage.maintenance.headers.advice")}</TableHead>
                    <TableHead>{t("admin.skillsPage.maintenance.headers.status")}</TableHead>
                    <TableHead>{t("admin.skillsPage.maintenance.headers.risk")}</TableHead>
                    <TableHead>{t("admin.skillsPage.maintenance.headers.compatibility")}</TableHead>
                    <TableHead>{t("admin.skillsPage.maintenance.headers.quality")}</TableHead>
                    <TableHead>{t("admin.skillsPage.maintenance.headers.runtime")}</TableHead>
                    <TableHead>{t("admin.skillsPage.maintenance.headers.updated")}</TableHead>
                    <TableHead>{t("admin.skillsPage.maintenance.headers.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isMaintenanceRecommendationsLoading ? (
                    renderTableLoadingRow(9, "Loading maintenance recommendations...")
                  ) : (!maintenanceRecommendationGroups.length ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        {t("admin.skillsPage.maintenance.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    maintenanceRecommendationGroups.map((group) => {
                      const isExpanded = maintenanceExpandedSkillIdSet.has(group.skillId);
                      const recommendationCount = group.recommendations.length;
                      const actionableRecommendationCount = group.recommendations
                        .filter(isMaintenanceRecommendationActionable)
                        .length;
                      const statusBadges = getMaintenanceGroupStatusBadges(group);

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
                                  {t("admin.skillsPage.maintenance.highestPriority")}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {group.primaryRecommendation.recommendationType}
                                {recommendationCount > 1 ? t("admin.skillsPage.maintenance.recommendationsCount", { count: recommendationCount }) : ""}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {statusBadges.length > 0 ? (
                                  statusBadges.map((badge) => (
                                    <Badge
                                      key={`${group.skillId}-${badge.label}`}
                                      variant={badge.variant}
                                      className="rounded-full"
                                    >
                                      {badge.label}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge variant="outline" className="rounded-full">
                                    {t("admin.skillsPage.maintenance.status.unknown")}
                                  </Badge>
                                )}
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
                              {group.recommendations.some((item) => {
                                const applyStrategy = item.latestRun?.logsJson && typeof item.latestRun.logsJson === "object"
                                  ? (item.latestRun.logsJson as Record<string, unknown>).applyStrategy
                                  : null;
                                return item.latestRun?.status === "running" && applyStrategy === "proposal";
                              }) && (
                                <Badge variant="secondary" className="mt-1">
                                  Proposal queued
                                </Badge>
                              )}
                              {group.recommendations.some((item) => item.isGenjsCandidate) && (
                                <Badge variant="secondary" className="mt-1">{t("admin.skillsPage.maintenance.genjsCandidate")}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-2 font-medium">
                                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                  {formatMaintenanceDateTime(group.latestAnalyzedAt)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {t("admin.skillsPage.maintenance.timestamps.updated")}: {formatMaintenanceRelativeTime(group.latestUpdatedAt)}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openRecommendationDetail(group.primaryRecommendation.id, "advice")}
                                >
                                  {t("admin.skillsPage.maintenance.viewAdvice")}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => requestMaintenanceGroupApply(group)}
                                  disabled={applyMaintenanceRecommendationsMutation.isPending || actionableRecommendationCount === 0}
                                >
                                  {t("admin.skillsPage.maintenance.applyAll", { count: actionableRecommendationCount })}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleMaintenanceSkillDetails(group.skillId, !isExpanded)}
                                >
                                  {isExpanded ? t("admin.skillsPage.maintenance.hideDetails") : t("admin.skillsPage.maintenance.details")}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={9} className="bg-muted/20">
                                <div className="space-y-3 p-3">
                                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    {t("admin.skillsPage.maintenance.recommendations")}
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
                                                  {t("admin.skillsPage.maintenance.highestPriority")}
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {item.recommendationType} · {t(`admin.skillsPage.maintenance.status.${item.status}`) || item.status}
                                            </div>
                                            {item.recommendationType === "media-studio-auto-learning" && (
                                              <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                                                <Badge variant="secondary" className="rounded-full">
                                                  {t("admin.skillsPage.maintenance.mediaStudioIssueCount", {
                                                    count: getMediaStudioRecommendationIssues(item).length,
                                                  })}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full">
                                                  {t("admin.skillsPage.maintenance.mediaStudioChangeCount", {
                                                    count: getMediaStudioRecommendationChanges(item).length,
                                                  })}
                                                </Badge>
                                              </div>
                                            )}
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
                                onClick={() => openRecommendationDetail(item.id, "advice")}
                              >
                                {t("admin.skillsPage.maintenance.viewAdvice")}
                              </Button>
                                            <Button
                                              size="sm"
                                              onClick={() => requestRecommendationApply(item, group.skill?.name || `Skill #${group.skillId}`)}
                                              disabled={item.status === "applied" || applyUpgradeMutation.isPending}
                                            >
                                              {isMaintenanceRecommendationEffectiveAutoApplySafe(item) ? t("admin.skillsPage.maintenance.applyUpgrade") : t("admin.skillsPage.maintenance.generateProposal")}
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
                  ))}
                </TableBody>
              </Table>
            </div>
          </DashboardCard>

          <DashboardCard
            title={t("admin.skillsPage.legacyRunQueue.title")}
            description={t("admin.skillsPage.legacyRunQueue.description")}
            leading={<Clock className="h-5 w-5 text-slate-500" />}
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-sm text-blue-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <Zap className="h-4 w-4 text-blue-700" />
                      {t("admin.skillsPage.legacyRunQueue.autopilot.title")}
                    </div>
                    <p className="text-xs leading-5 text-blue-800">
                      {t("admin.skillsPage.legacyRunQueue.autopilot.description")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-blue-300 bg-white/70 text-blue-800">
                      {t("admin.skillsPage.legacyRunQueue.autopilot.normalizeCount", { count: normalizableLegacyApplyRunIds.length })}
                    </Badge>
                    <Badge variant="outline" className="border-blue-300 bg-white/70 text-blue-800">
                      {t("admin.skillsPage.legacyRunQueue.autopilot.retryCount", { count: autoRetryableLegacyApplyRunIds.length })}
                    </Badge>
                    <Badge variant="outline" className="border-blue-300 bg-white/70 text-blue-800">
                      {t("admin.skillsPage.legacyRunQueue.autopilot.staleCount", { count: staleLegacyApplyRunIds.length })}
                    </Badge>
                    {(normalizeLegacyUpgradeApplyRunsMutation.isPending || retryLegacyUpgradeApplyRunsMutation.isPending || recoverStaleLegacyUpgradeApplyRunsMutation.isPending) && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        {t("admin.skillsPage.legacyRunQueue.autopilot.running")}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { key: "all", label: t("admin.skillsPage.legacyRunQueue.filters.all"), count: legacyApplyRunCounts.total },
                    { key: "queued", label: t("admin.skillsPage.legacyRunQueue.filters.queued"), count: legacyApplyRunCounts.queued },
                    { key: "running", label: t("admin.skillsPage.legacyRunQueue.filters.running"), count: legacyApplyRunCounts.running },
                    { key: "failed", label: t("admin.skillsPage.legacyRunQueue.filters.failed"), count: legacyApplyRunCounts.failed },
                    { key: "blocked", label: t("admin.skillsPage.legacyRunQueue.filters.blocked"), count: legacyApplyRunCounts.blocked },
                    { key: "completed", label: t("admin.skillsPage.legacyRunQueue.filters.completed"), count: legacyApplyRunCounts.completed },
                    { key: "canceled", label: t("admin.skillsPage.legacyRunQueue.filters.canceled"), count: legacyApplyRunCounts.canceled },
                  ].map((filter) => (
                    <Button
                      key={filter.key}
                      variant={legacyApplyRunFilter === filter.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLegacyApplyRunFilter(filter.key as typeof legacyApplyRunFilter)}
                      className="rounded-full"
                    >
                      {filter.label}
                      <Badge variant={legacyApplyRunFilter === filter.key ? "secondary" : "outline"} className="ml-2 rounded-full px-2 text-[11px]">
                        {filter.count}
                      </Badge>
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => recoverStaleLegacyUpgradeApplyRunsMutation.mutate({ runIds: staleLegacyApplyRunIds })}
                    disabled={staleLegacyApplyRunIds.length === 0 || recoverStaleLegacyUpgradeApplyRunsMutation.isPending}
                  >
                    {recoverStaleLegacyUpgradeApplyRunsMutation.isPending
                      ? t("admin.skillsPage.legacyRunQueue.recoverStalePending")
                      : t("admin.skillsPage.legacyRunQueue.recoverStale", { count: staleLegacyApplyRunIds.length })}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => normalizeLegacyUpgradeApplyRunsMutation.mutate()}
                    disabled={normalizableLegacyApplyRunIds.length === 0 || normalizeLegacyUpgradeApplyRunsMutation.isPending}
                  >
                    {normalizeLegacyUpgradeApplyRunsMutation.isPending
                      ? t("admin.skillsPage.legacyRunQueue.normalizeNoChangePending")
                      : t("admin.skillsPage.legacyRunQueue.normalizeNoChange")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => retryLegacyUpgradeApplyRunsMutation.mutate({ runIds: retryableLegacyApplyRunIds })}
                    disabled={retryableLegacyApplyRunIds.length === 0 || retryLegacyUpgradeApplyRunsMutation.isPending}
                  >
                    {retryLegacyUpgradeApplyRunsMutation.isPending
                      ? t("admin.skillsPage.legacyRunQueue.retrying")
                      : t("admin.skillsPage.legacyRunQueue.retryFailed", { count: retryableLegacyApplyRunIds.length })}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => refetchLegacyApplyRuns()}
                    disabled={isLegacyApplyRunsFetching}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {isLegacyApplyRunsFetching ? t("admin.skillsPage.legacyRunQueue.refreshing") : t("admin.skillsPage.legacyRunQueue.refresh")}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyRunQueue.summary.total")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyApplyRunCounts.total}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyRunQueue.summary.queued")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyApplyRunCounts.queued}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyRunQueue.summary.running")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyApplyRunCounts.running}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyRunQueue.summary.failed")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyApplyRunCounts.failed}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyRunQueue.summary.blocked")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyApplyRunCounts.blocked}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyRunQueue.summary.completed")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyApplyRunCounts.completed}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyRunQueue.summary.canceled")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyApplyRunCounts.canceled}</div>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/10 px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-full">
                    {t("admin.skillsPage.legacyRunQueue.summary.visible", { count: legacyApplyRunItems.length })}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full">
                    {t("admin.skillsPage.legacyRunQueue.summary.taskIds", { count: legacyApplyRunItems.filter((item) => !!item.taskId).length })}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full">
                    {t("admin.skillsPage.legacyRunQueue.summary.withError", { count: legacyApplyRunItems.filter((item) => !!item.errorMessage).length })}
                  </Badge>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.skillsPage.legacyRunQueue.headers.skill")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyRunQueue.headers.time")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyRunQueue.headers.task")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyRunQueue.headers.status")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyRunQueue.headers.result")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyRunQueue.headers.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLegacyApplyRunsLoading ? (
                    renderTableLoadingRow(6, t("admin.skillsPage.legacyRunQueue.loading"))
                  ) : legacyApplyRunItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {legacyApplyRunFilter === "queued" || legacyApplyRunFilter === "running"
                          ? t("admin.skillsPage.legacyRunQueue.emptyQueued")
                          : t("admin.skillsPage.legacyRunQueue.empty")}
                      </TableCell>
                    </TableRow>
                ) : (
                  legacyApplyRunItems.map((item) => {
                    const strategy = getLegacyApplyRunStrategy(item);
                    const reason = getLegacyApplyRunReason(item);
                    const workspaceRootIssue = isLegacyApplyRunWorkspaceRootIssue(item);
                    const diagnosticPaths = getLegacyApplyRunDiagnosticPaths(item);
                    const latestRunLineage = getLegacyRunLineageSource(item.latestRun);
                    const lineageRole = getLegacyRunLineageString(latestRunLineage, "role") || "orchestrator";
                    const lineageCheckpointVersion = getLegacyRunLineageNumber(latestRunLineage, "checkpointVersion");
                    const lineageVerificationState = getLegacyRunLineageString(latestRunLineage, "verificationState");
                    return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{item.skill?.name || `Skill #${item.skillId}`}</div>
                              <div className="text-xs text-muted-foreground">{item.skill?.slug || item.skillId}</div>
                              {item.recommendation?.title && (
                                <div className="text-xs text-slate-600">{item.recommendation.title}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              <div className="flex items-center gap-2 font-medium">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                {formatMaintenanceDateTime(item.createdAt)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t("admin.skillsPage.legacyRunQueue.time.updated")}: {formatMaintenanceDateTime(item.updatedAt)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatMaintenanceRelativeTime(item.updatedAt)}
                              </div>
                              {item.startedAt && (
                                <div className="text-xs text-muted-foreground">
                                  {t("admin.skillsPage.legacyRunQueue.time.started")}: {formatMaintenanceDateTime(item.startedAt)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="rounded-full font-mono text-[11px]">
                                  {item.taskId || t("admin.skillsPage.legacyRunQueue.noTaskId")}
                                </Badge>
                                {strategy && (
                                  <Badge variant="secondary" className="rounded-full text-[11px]">
                                    {t("admin.skillsPage.legacyRunQueue.applyStrategy", { strategy })}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t("admin.skillsPage.legacyRunQueue.latestRun")} #{item.latestRun.id} · {item.latestRun.runType}
                              </div>
                              {(item.resolvedLlmModelId || item.sourceRunId || item.retryReason) && (
                                <div className="space-y-1 text-xs text-slate-500">
                                  {item.resolvedLlmModelId && (
                                    <div>
                                      {t("admin.skillsPage.legacyRunQueue.resolvedModel")}: {item.resolvedLlmModelId}
                                    </div>
                                  )}
                                  {item.sourceRunId && (
                                    <div>
                                      {t("admin.skillsPage.legacyRunQueue.sourceRun")}: #{item.sourceRunId}
                                    </div>
                                  )}
                                  {item.retryReason && (
                                    <div>
                                      {t("admin.skillsPage.legacyRunQueue.retryReason")}: {item.retryReason}
                                    </div>
                                  )}
                                </div>
                              )}
                              {workspaceRootIssue && (
                                <Badge variant="outline" className="w-fit rounded-full border-amber-500 bg-amber-50 text-[11px] text-amber-700">
                                  {t("admin.skillsPage.legacyRunQueue.diagnostics.workspaceRootIssue")}
                                </Badge>
                              )}
                              {latestRunLineage && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="rounded-full text-[11px]">
                                    {t("admin.skillsPage.legacyRunQueue.lineage.role")}: {getLegacyRunRoleLabel(lineageRole)}
                                  </Badge>
                                  <Badge variant="outline" className="rounded-full text-[11px]">
                                    {t("admin.skillsPage.legacyRunQueue.lineage.failureScope")}: {getLegacyRunFailureScopeLabel(lineageRole)}
                                  </Badge>
                                  {lineageCheckpointVersion !== null && (
                                    <Badge variant="outline" className="rounded-full text-[11px]">
                                      {t("admin.skillsPage.legacyRunQueue.lineage.checkpoint")}: v{lineageCheckpointVersion}
                                    </Badge>
                                  )}
                                  {lineageVerificationState && (
                                    <Badge variant="outline" className="rounded-full text-[11px]">
                                      {t("admin.skillsPage.legacyRunQueue.lineage.verification")}: {lineageVerificationState}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  item.queueState === "queued" && "border-blue-500 text-blue-600 bg-blue-50",
                                  item.queueState === "running" && "border-cyan-500 text-cyan-600 bg-cyan-50",
                                  item.queueState === "failed" && "border-orange-500 text-orange-600 bg-orange-50",
                                  item.queueState === "completed" && "border-emerald-500 text-emerald-600 bg-emerald-50",
                                  item.queueState === "blocked" && "border-red-500 text-red-600 bg-red-50",
                                  item.queueState === "canceled" && "border-slate-400 text-slate-600 bg-slate-50",
                                )}
                              >
                                {getLegacyApplyRunStatusLabel(item.queueState)}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                {item.latestRun.status}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm font-medium">
                                {item.resultMessage || item.latestRun.summary || t("admin.skillsPage.legacyRunQueue.noSummary")}
                              </div>
                              {(item.resultError || item.latestRun.errorMessage) && (
                                <div className={cn(
                                  "text-xs leading-5",
                                  item.queueState === "failed" && "text-orange-700",
                                  item.queueState === "blocked" && "text-red-700",
                                  item.queueState === "queued" && "text-slate-600",
                                )}>
                                  <span className="font-semibold">{t("admin.skillsPage.legacyRunQueue.errorMessageLabel")}{":"}</span>{" "}
                                  {item.resultError || item.latestRun.errorMessage}
                                </div>
                              )}
                              {reason && !(item.resultError || item.latestRun.errorMessage) && (
                                <div className="text-xs leading-5 text-slate-600">
                                  {reason}
                                </div>
                              )}
                              {workspaceRootIssue && (
                                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-900">
                                  <div className="font-semibold">
                                    {t("admin.skillsPage.legacyRunQueue.diagnostics.workspaceRootIssue")}
                                  </div>
                                  <div className="mt-1 text-amber-800">
                                    {t("admin.skillsPage.legacyRunQueue.diagnostics.workspaceRootIssueDescription")}
                                  </div>
                                  {diagnosticPaths.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {diagnosticPaths.map((diagnostic) => (
                                        <div key={`${item.id}-${diagnostic.label}`} className="grid gap-1">
                                          <span className="font-semibold">{diagnostic.label}</span>
                                          <span className="min-w-0 break-all font-mono text-[11px] leading-4">
                                            {diagnostic.value}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              {(item.queueState === "failed" || item.queueState === "blocked") && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => retryLegacyUpgradeApplyRunsMutation.mutate({ runIds: [item.id] })}
                                  disabled={retryLegacyUpgradeApplyRunsMutation.isPending}
                                >
                                  {t("admin.skillsPage.legacyRunQueue.retry")}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLocation(`/admin/skills/runs/${item.id}`)}
                              >
                                <ArrowUpRight className="mr-2 h-4 w-4" />
                                {t("admin.skillsPage.legacyRunQueue.openDetail")}
                              </Button>
                              {item.recommendation && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openRecommendationDetail(item.recommendation!.id, "advice")}
                                  >
                                    {t("admin.skillsPage.legacyRunQueue.viewAdvice")}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openRecommendationDetail(item.recommendation!.id, "reasoning")}
                                  >
                                    {t("admin.skillsPage.legacyRunQueue.viewReasoning")}
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </DashboardCard>

          <DashboardCard
            title={t("admin.skillsPage.legacyQueue.title")}
            description={t("admin.skillsPage.legacyQueue.description")}
            leading={<FolderSync className="h-5 w-5 text-slate-500" />}
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-4 text-sky-950">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-sky-100 p-2">
                      {applyLegacyUpgradeRecommendationsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin text-sky-700" />
                      ) : (
                        <Zap className="h-4 w-4 text-sky-700" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold">
                        {t("admin.skillsPage.legacyQueue.autopilot.title")}
                      </div>
                      <div className="mt-1 max-w-4xl text-sm leading-6 text-sky-800">
                        {t("admin.skillsPage.legacyQueue.autopilot.description")}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="rounded-full bg-white text-sky-800">
                      {t("admin.skillsPage.legacyQueue.autopilot.backlogCount", { count: legacyUpgradeAutoBacklogCount })}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full bg-white text-sky-800">
                      {applyLegacyUpgradeRecommendationsMutation.isPending
                        ? t("admin.skillsPage.legacyQueue.autopilot.running")
                        : t("admin.skillsPage.legacyQueue.autopilot.ready")}
                    </Badge>
                  </div>
                </div>
                {legacyUpgradeMonitorNames.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {legacyUpgradeMonitorNames.map((name) => (
                      <Badge key={name} variant="outline" className="rounded-full border-sky-300 bg-white text-sky-800">
                        {name}
                      </Badge>
                    ))}
                    {legacyUpgradeAutoBacklogCount > legacyUpgradeMonitorNames.length && (
                      <Badge variant="outline" className="rounded-full border-sky-300 bg-white text-sky-800">
                        {t("admin.skillsPage.legacyQueue.autopilot.more", {
                          count: legacyUpgradeAutoBacklogCount - legacyUpgradeMonitorNames.length,
                        })}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-sky-800">
                    {t("admin.skillsPage.legacyQueue.autopilot.empty")}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="legacy-upgrade-include-applied"
                      checked={legacyUpgradeIncludeApplied}
                      onCheckedChange={(checked) => setLegacyUpgradeIncludeApplied(Boolean(checked))}
                    />
                    <Label htmlFor="legacy-upgrade-include-applied" className="cursor-pointer">
                      {t("admin.skillsPage.legacyQueue.includeApplied")}
                    </Label>
                  </div>

                  <div className="flex items-center gap-3">
                  <Checkbox
                    id="legacy-upgrade-select-all"
                    checked={someVisibleLegacySelected ? "indeterminate" : allVisibleLegacySelected}
                    onCheckedChange={(checked) => toggleAllVisibleLegacyUpgrades(Boolean(checked))}
                  />
                    <Label htmlFor="legacy-upgrade-select-all" className="cursor-pointer">
                      {t("admin.skillsPage.legacyQueue.selectVisible")}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {t("admin.skillsPage.legacyQueue.selectedCount", { count: selectedLegacyUpgradeIds.length })}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="legacy-upgrade-expand-all"
                      checked={allExpandedLegacySelected}
                      onCheckedChange={(checked) => toggleAllLegacyUpgradeDetails(Boolean(checked))}
                    />
                    <Label htmlFor="legacy-upgrade-expand-all" className="cursor-pointer">
                      {t("admin.skillsPage.legacyQueue.expandAll")}
                    </Label>
                    <Button variant="ghost" size="sm" onClick={collapseAllLegacyUpgradeDetails} disabled={expandedLegacyUpgradeIds.length === 0}>
                      {t("admin.skillsPage.legacyQueue.collapseAll")}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedLegacyUpgradeIds([])}
                    disabled={selectedLegacyUpgradeIds.length === 0}
                  >
                    {t("admin.skillsPage.legacyQueue.clearSelection")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => applyLegacyUpgradeRecommendationsMutation.mutate({
                      recommendationIds: selectedEligibleLegacyUpgradeIds,
                    })}
                    disabled={selectedEligibleLegacyUpgradeIds.length === 0 || applyLegacyUpgradeRecommendationsMutation.isPending}
                  >
                    {applyLegacyUpgradeRecommendationsMutation.isPending
                      ? t("admin.skillsPage.legacyQueue.queueEligiblePending")
                      : t("admin.skillsPage.legacyQueue.queueOnlyEligible", { count: selectedEligibleLegacyUpgradeIds.length })}
                  </Button>
                  <Button
                    onClick={() => applyLegacyUpgradeRecommendationsMutation.mutate({
                      recommendationIds: selectedSelectableLegacyUpgradeIds,
                    })}
                    disabled={selectedSelectableLegacyUpgradeIds.length === 0 || applyLegacyUpgradeRecommendationsMutation.isPending}
                  >
                    {applyLegacyUpgradeRecommendationsMutation.isPending
                      ? t("admin.skillsPage.legacyQueue.queueSelectedPending")
                      : t("admin.skillsPage.legacyQueue.queueAllSelected", { count: selectedSelectableLegacyUpgradeIds.length })}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => applyLegacyUpgradeRecommendationsMutation.mutate({
                      recommendationIds: selectedCriticalHighLegacyUpgradeIds,
                    })}
                    disabled={selectedCriticalHighLegacyUpgradeIds.length === 0 || applyLegacyUpgradeRecommendationsMutation.isPending}
                  >
                    {applyLegacyUpgradeRecommendationsMutation.isPending
                      ? t("admin.skillsPage.legacyQueue.queuePriorityPending")
                      : t("admin.skillsPage.legacyQueue.queueCriticalHigh", { count: selectedCriticalHighLegacyUpgradeIds.length })}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => refetchLegacyUpgradeQueue()}
                    disabled={isLegacyUpgradeQueueFetching}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {isLegacyUpgradeQueueFetching ? t("admin.skillsPage.legacyQueue.refreshing") : t("admin.skillsPage.legacyQueue.refresh")}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("admin.skillsPage.legacyQueue.filterView")}
                </span>
                {legacyUpgradeQueueFilterRestoredFromStorage && (
                  <Badge variant="outline" className="rounded-full border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
                    {t("admin.skillsPage.legacyQueue.loadedFromPreference")}
                  </Badge>
                )}
                {[
                  { key: "all", label: t("admin.skillsPage.legacyQueue.filters.all"), count: visibleLegacyUpgradeQueueItems.length },
                  { key: "critical", label: t("admin.skillsPage.legacyQueue.filters.critical"), count: legacyUpgradeCriticalCount },
                  { key: "high", label: t("admin.skillsPage.legacyQueue.filters.high"), count: legacyUpgradeHighCount },
                  { key: "parallel", label: t("admin.skillsPage.legacyQueue.filters.parallel"), count: visibleLegacyUpgradeQueueItems.filter((item) => item.parallelUpgradeEligible).length },
                  { key: "eligible", label: t("admin.skillsPage.legacyQueue.filters.eligible"), count: visibleLegacyUpgradeQueueItems.filter((item) => item.status !== "applied" && item.status !== "dismissed").length },
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

              <div className="grid gap-3 md:grid-cols-6">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyQueue.stats.queued")}</div>
                  <div className="mt-1 text-2xl font-semibold">{visibleLegacyUpgradeQueueItems.length}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyQueue.stats.parallelEligible")}</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {visibleLegacyUpgradeQueueItems.filter((item) => item.parallelUpgradeEligible).length}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyQueue.stats.critical")}</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {legacyUpgradeCriticalCount}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyQueue.stats.high")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyUpgradeHighCount}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyQueue.stats.blocked")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyUpgradeBlockedCount}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.legacyQueue.stats.failed")}</div>
                  <div className="mt-1 text-2xl font-semibold">{legacyUpgradeFailedCount}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 md:col-span-6">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="rounded-full">
                      {t("admin.skillsPage.legacyQueue.summary.total", { count: visibleLegacyUpgradeQueueItems.length })}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {t("admin.skillsPage.legacyQueue.summary.parallelEligible", { count: visibleLegacyUpgradeQueueItems.filter((item) => item.parallelUpgradeEligible).length })}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {t("admin.skillsPage.legacyQueue.summary.critical", { count: legacyUpgradeCriticalCount })}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {t("admin.skillsPage.legacyQueue.summary.high", { count: legacyUpgradeHighCount })}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {t("admin.skillsPage.legacyQueue.summary.blocked", { count: legacyUpgradeBlockedCount })}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {t("admin.skillsPage.legacyQueue.summary.failed", { count: legacyUpgradeFailedCount })}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {t("admin.skillsPage.legacyQueue.summary.selected", { count: selectedLegacyUpgradeIds.length })}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {legacyUpgradeIncludeApplied ? t("admin.skillsPage.legacyQueue.summary.appliedIncluded") : t("admin.skillsPage.legacyQueue.summary.appliedHidden")}
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
                        aria-label={t("admin.skillsPage.legacyQueue.selectAllVisibleAria")}
                      />
                    </TableHead>
                    <TableHead>{t("admin.skillsPage.legacyQueue.headers.skill")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyQueue.headers.priority")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyQueue.headers.signals")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyQueue.headers.runtime")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyQueue.headers.status")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyQueue.headers.nextAction")}</TableHead>
                    <TableHead>{t("admin.skillsPage.legacyQueue.headers.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLegacyUpgradeQueueLoading ? (
                    renderTableLoadingRow(8, "Loading legacy upgrade queue...")
                  ) : (!visibleLegacyUpgradeQueueItems.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        {t("admin.skillsPage.legacyQueue.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    legacyUpgradeFilteredItems.map((item, index) => {
                      const nextAction = getLegacyUpgradeNextAction(item);
                      return (
                      <Fragment key={item.id}>
                        <TableRow>
                          <TableCell>
                            <Checkbox
                              checked={selectedLegacyUpgradeIdSet.has(item.id)}
                              onCheckedChange={(checked) => toggleLegacyUpgradeSelection(item.id, Boolean(checked))}
                              disabled={!canRunLegacyUpgradeAction(item)}
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
                            <div className="space-y-2">
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
                              {(item.status === "blocked" || item.status === "failed") && getLegacyUpgradeReason(item) && (
                                <div className={cn(
                                  "text-xs leading-5",
                                  item.status === "blocked" ? "text-red-700" : "text-orange-700",
                                )}>
                                  <span className="font-semibold">
                                    {item.status === "blocked"
                                      ? t("admin.skillsPage.legacyQueue.blockedReasonLabel")
                                      : t("admin.skillsPage.legacyQueue.failedReasonLabel")}
                                    {":"}
                                  </span>{" "}
                                  {getLegacyUpgradeReason(item)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={cn(
                              "max-w-[260px] rounded-md border px-3 py-2 text-xs leading-5",
                              getLegacyUpgradeNextActionClass(nextAction.tone),
                            )}>
                              <div className="font-semibold">{nextAction.label}</div>
                              <div className="mt-1 opacity-90">{nextAction.description}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openRecommendationDetail(item.id, "advice")}
                              >
                                {t("admin.skillsPage.legacyQueue.viewAdvice")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openRecommendationDetail(item.id, "reasoning")}
                              >
                                {t("admin.skillsPage.legacyQueue.viewReasoning")}
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => requestRecommendationApply(item, item.skill?.name || `Skill #${item.skillId}`)}
                                disabled={!nextAction.canRun || applyUpgradeMutation.isPending}
                              >
                                {nextAction.buttonLabel || t("admin.skillsPage.legacyQueue.noActionNeeded")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleLegacyUpgradeDetails(item.id, !expandedLegacyUpgradeIdSet.has(item.id))}
                              >
                                {expandedLegacyUpgradeIdSet.has(item.id) ? t("admin.skillsPage.legacyQueue.hideDetails") : t("admin.skillsPage.legacyQueue.details")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleLegacyUpgradeSelection(item.id, !selectedLegacyUpgradeIdSet.has(item.id))}
                              >
                                {selectedLegacyUpgradeIdSet.has(item.id) ? t("admin.skillsPage.legacyQueue.unselect") : t("admin.skillsPage.legacyQueue.select")}
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
                                      {t("admin.skillsPage.legacyQueue.prioritySnapshot")}
                                    </div>
                                    <div className="space-y-2 text-sm text-slate-700">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">{t("admin.skillsPage.legacyQueue.priorityScore")}</span>
                                        <span className="font-medium">{item.upgradePriorityScore.toFixed(1)}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">{t("admin.skillsPage.legacyQueue.priorityTier")}</span>
                                        <span className="font-medium">{item.upgradePriorityTier}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">{t("admin.skillsPage.legacyQueue.parallelEligible")}</span>
                                        <span className="font-medium">{item.parallelUpgradeEligible ? t("common.yes") : t("common.no")}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">{t("admin.skillsPage.legacyQueue.currentRuntime")}</span>
                                        <span className="font-medium">{item.currentRuntime || "unknown"}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">{t("admin.skillsPage.legacyQueue.proposedRuntime")}</span>
                                        <span className="font-medium">{item.proposedRuntime || "unchanged"}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {(item.status === "blocked" || item.status === "failed" || item.status === "applied" || item.status === "approved") && (
                                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
                                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                        {t("admin.skillsPage.legacyQueue.outcomeSummary")}
                                      </div>
                                      <div className={cn(
                                        "rounded-lg border p-3 text-sm",
                                        item.status === "blocked" && "border-red-200 bg-red-50 text-red-800",
                                        item.status === "failed" && "border-orange-200 bg-orange-50 text-orange-800",
                                        item.status === "applied" && "border-emerald-200 bg-emerald-50 text-emerald-800",
                                        item.status === "approved" && "border-slate-200 bg-slate-50 text-slate-700",
                                      )}>
                                        <div className="font-medium">
                                          {item.status === "blocked" && t("admin.skillsPage.legacyQueue.blockedStatus")}
                                          {item.status === "failed" && t("admin.skillsPage.legacyQueue.failedStatus")}
                                          {item.status === "applied" && t("admin.skillsPage.legacyQueue.appliedStatus")}
                                          {item.status === "approved" && t("admin.skillsPage.legacyQueue.approvedStatus")}
                                        </div>
                                      <div className="mt-1 text-sm leading-6">
                                        {getLegacyUpgradeReason(item) || t("admin.skillsPage.legacyQueue.noReason")}
                                      </div>
                                      {item.latestRun && (
                                        <div className="mt-2 text-xs text-slate-500">
                                          {t("admin.skillsPage.legacyQueue.latestRun")} #{item.latestRun.id} · {item.latestRun.runType} · {item.latestRun.status}
                                        </div>
                                      )}
                                      {(getLegacyQueueLatestRunString(item, "taskId")
                                        || getLegacyQueueLatestRunString(item, "resolvedLlmModelId")
                                        || getLegacyQueueLatestRunString(item, "retryReason")
                                        || getLegacyQueueLatestRunString(item, "resultMessage")
                                        || getLegacyQueueLatestRunString(item, "resultError")
                                        || getLegacyQueueLatestRunNumber(item, "sourceRunId") !== null) && (
                                        <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-white/80 p-3 text-xs text-slate-700 md:grid-cols-2">
                                          <div className="space-y-1">
                                            <div className="font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.task")}</div>
                                            <div className="font-mono break-all">{getLegacyQueueLatestRunString(item, "taskId") || t("admin.skillsPage.legacyRunQueue.noTaskId")}</div>
                                          </div>
                                          <div className="space-y-1">
                                            <div className="font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.resolvedModel")}</div>
                                            <div className="break-all">{getLegacyQueueLatestRunString(item, "resolvedLlmModelId") || t("admin.skillsPage.legacyRunQueue.noModel")}</div>
                                          </div>
                                          <div className="space-y-1">
                                            <div className="font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.resultMessage")}</div>
                                            <div className="break-words">{getLegacyQueueLatestRunString(item, "resultMessage") || item.latestRun?.summary || t("admin.skillsPage.legacyRunQueue.noSummary")}</div>
                                          </div>
                                          <div className="space-y-1">
                                            <div className="font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.resultError")}</div>
                                            <div className={cn("break-words", (getLegacyQueueLatestRunString(item, "resultError") || item.latestRun?.errorMessage) ? "text-orange-700" : "text-slate-500")}>
                                              {getLegacyQueueLatestRunString(item, "resultError") || item.latestRun?.errorMessage || t("admin.skillsPage.legacyRunQueue.noResultError")}
                                            </div>
                                          </div>
                                          <div className="space-y-1">
                                            <div className="font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.sourceRun")}</div>
                                            <div>{getLegacyQueueLatestRunNumber(item, "sourceRunId") !== null
                                              ? `#${getLegacyQueueLatestRunNumber(item, "sourceRunId")}`
                                              : t("admin.skillsPage.legacyRunQueue.noSourceRun")}</div>
                                          </div>
                                          <div className="space-y-1">
                                            <div className="font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.retryReason")}</div>
                                            <div className="break-words">{getLegacyQueueLatestRunString(item, "retryReason") || t("admin.skillsPage.legacyRunQueue.noRetryReason")}</div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {getLegacyRunLineageSource(item.latestRun) && (
                                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                      {t("admin.skillsPage.legacyQueue.lineageTitle")}
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.lineage.role")}</div>
                                        <div className="font-medium">{getLegacyRunRoleLabel(getLegacyRunLineageString(getLegacyRunLineageSource(item.latestRun), "role") || "orchestrator")}</div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.lineage.failureScope")}</div>
                                        <div className="font-medium">{getLegacyRunFailureScopeLabel(getLegacyRunLineageString(getLegacyRunLineageSource(item.latestRun), "role") || "orchestrator")}</div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.lineage.parentRun")}</div>
                                        <div className="font-mono text-xs break-all">{getLegacyRunLineageString(getLegacyRunLineageSource(item.latestRun), "parentRunId") || "—"}</div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.lineage.childRuns")}</div>
                                        <div className="font-mono text-xs break-all">{getLegacyRunLineageArray(getLegacyRunLineageSource(item.latestRun), "childRunIds").join(", ") || "—"}</div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.lineage.checkpoint")}</div>
                                        <div>{getLegacyRunLineageNumber(getLegacyRunLineageSource(item.latestRun), "checkpointVersion") !== null ? `v${getLegacyRunLineageNumber(getLegacyRunLineageSource(item.latestRun), "checkpointVersion")}` : "—"}</div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.lineage.verification")}</div>
                                        <div>{getLegacyRunLineageString(getLegacyRunLineageSource(item.latestRun), "verificationState") || "—"}</div>
                                      </div>
                                      <div className="space-y-1 md:col-span-2">
                                        <div className="text-xs font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.lineage.artifactRefs")}</div>
                                        <div className="font-mono text-xs break-all">{getLegacyRunLineageArray(getLegacyRunLineageSource(item.latestRun), "artifactRefs").join(", ") || "—"}</div>
                                      </div>
                                      <div className="space-y-1 md:col-span-2">
                                        <div className="text-xs font-semibold text-slate-500">{t("admin.skillsPage.legacyRunQueue.lineage.resumeCursor")}</div>
                                        <div className="font-mono text-xs break-all">{getLegacyRunLineageString(getLegacyRunLineageSource(item.latestRun), "resumeCursor") || "—"}</div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                      {t("admin.skillsPage.legacyQueue.signalBreakdown")}
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
                                                {value ? t("admin.skillsPage.legacyQueue.signalPresent") : t("admin.skillsPage.legacyQueue.signalMissing")}
                                              </Badge>
                                            </div>
                                            <div className="mt-2 text-xs text-slate-600">
                                              {describeLegacyUpgradeSignal(key, value)}
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600 md:col-span-2">
                                          {t("admin.skillsPage.legacyQueue.noSignals")}
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
                      );
                    })
                  ))}
                </TableBody>
              </Table>
            </div>
          </DashboardCard>

          <DashboardCard
            title={t("admin.skillsPage.schedules.title")}
            description={t("admin.skillsPage.schedules.description")}
            leading={<Clock className="h-5 w-5 text-slate-500" />}
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.schedules.fields.name")}</Label>
                  <Input
                    value={scheduleDraft.name}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, name: e.target.value })}
                    placeholder={t("admin.skillsPage.schedules.placeholders.name")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.schedules.fields.cron")}</Label>
                  <Input
                    value={scheduleDraft.cronExpression}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, cronExpression: e.target.value })}
                    placeholder={t("admin.skillsPage.schedules.placeholders.cron")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.schedules.fields.timezone")}</Label>
                  <Input
                    value={scheduleDraft.timezone}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, timezone: e.target.value })}
                    placeholder={t("admin.skillsPage.schedules.placeholders.timezone")}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={saveMaintenanceSchedule}
                    disabled={!scheduleDraft.name || createMaintenanceScheduleMutation.isPending || updateMaintenanceScheduleMutation.isPending}
                  >
                    {scheduleDraft.id ? t("admin.skillsPage.schedules.update") : t("admin.skillsPage.schedules.save")}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.schedules.fields.status")}</Label>
                  <Select
                    value={scheduleDraft.status}
                    onValueChange={(value) => setScheduleDraft({ ...scheduleDraft, status: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t("admin.skillsPage.schedules.status.active")}</SelectItem>
                      <SelectItem value="paused">{t("admin.skillsPage.schedules.status.paused")}</SelectItem>
                      <SelectItem value="disabled">{t("admin.skillsPage.schedules.status.disabled")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.schedules.fields.scopeType")}</Label>
                  <Select
                    value={scheduleDraft.scopeType}
                    onValueChange={(value) => setScheduleDraft({ ...scheduleDraft, scopeType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_skills">{t("admin.skillsPage.schedules.scope.allSkills")}</SelectItem>
                      <SelectItem value="category">{t("admin.skillsPage.schedules.scope.category")}</SelectItem>
                      <SelectItem value="execution_mode">{t("admin.skillsPage.schedules.scope.executionMode")}</SelectItem>
                      <SelectItem value="genjs_candidates">{t("admin.skillsPage.schedules.scope.genjsCandidates")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.schedules.fields.categoryFilter")}</Label>
                  <Input
                    value={scheduleDraft.scopeCategory}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, scopeCategory: e.target.value })}
                    placeholder={t("admin.skillsPage.schedules.placeholders.categoryFilter")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.schedules.fields.executionModeFilter")}</Label>
                  <Input
                    value={scheduleDraft.scopeExecutionMode}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, scopeExecutionMode: e.target.value })}
                    placeholder={t("admin.skillsPage.schedules.placeholders.executionModeFilter")}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.schedules.fields.limit")}</Label>
                  <Input
                    value={scheduleDraft.limit}
                    onChange={(e) => setScheduleDraft({ ...scheduleDraft, limit: e.target.value })}
                    placeholder={t("admin.skillsPage.schedules.placeholders.limit")}
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center justify-between rounded-lg border bg-white/60 px-3 py-2 w-full">
                    <div>
                      <Label className="text-xs font-medium">{t("admin.skillsPage.schedules.genjsOnly.label")}</Label>
                      <p className="text-[10px] text-muted-foreground">
                        {t("admin.skillsPage.schedules.genjsOnly.help")}
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
                      {t("admin.skillsPage.schedules.new")}
                    </Button>
                  )}
                </div>
              </div>

              <Textarea
                value={scheduleDraft.description}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, description: e.target.value })}
                rows={2}
                placeholder={t("admin.skillsPage.schedules.placeholders.description")}
              />

              <Textarea
                value={scheduleDraft.policyJsonText}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, policyJsonText: e.target.value })}
                rows={4}
                className="font-mono text-xs"
                placeholder={t("admin.skillsPage.schedules.placeholders.policy")}
              />

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.skillsPage.schedules.headers.name")}</TableHead>
                    <TableHead>{t("admin.skillsPage.schedules.headers.status")}</TableHead>
                    <TableHead>{t("admin.skillsPage.schedules.headers.cron")}</TableHead>
                    <TableHead>{t("admin.skillsPage.schedules.headers.scope")}</TableHead>
                    <TableHead>{t("admin.skillsPage.schedules.headers.timezone")}</TableHead>
                    <TableHead>{t("admin.skillsPage.schedules.headers.nextRun")}</TableHead>
                    <TableHead>{t("admin.skillsPage.schedules.headers.updated")}</TableHead>
                    <TableHead>{t("admin.skillsPage.schedules.headers.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!maintenanceSchedules?.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        {t("admin.skillsPage.schedules.empty")}
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
                              {t("admin.skillsPage.schedules.edit")}
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
                              {schedule.status === "active" ? t("admin.skillsPage.schedules.pause") : t("admin.skillsPage.schedules.activate")}
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
              title={t("admin.skillsPage.pending.title")}
              description={t("admin.skillsPage.pending.description")}
              leading={<Clock className="h-5 w-5 text-slate-500" />}
            >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.skillsPage.pending.headers.name")}</TableHead>
                      <TableHead>{t("admin.skillsPage.pending.headers.owner")}</TableHead>
                      <TableHead>{t("admin.skillsPage.pending.headers.category")}</TableHead>
                      <TableHead>{t("admin.skillsPage.pending.headers.created")}</TableHead>
                      <TableHead>{t("admin.skillsPage.pending.headers.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!pendingSkills || pendingSkills.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          {t("admin.skillsPage.pending.empty")}
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
                              {skill.ownerName || t("admin.skillsPage.pending.unknownOwner")}
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
                                {t("admin.skillsPage.pending.approve")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 border-red-300 hover:bg-red-50"
                                onClick={() => setRejectingSkill(skill)}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                {t("admin.skillsPage.pending.reject")}
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
            <DialogTitle>{t("admin.skillsPage.rejectDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.skillsPage.rejectDialog.description", { name: rejectingSkill?.name || "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-reason">{t("admin.skillsPage.rejectDialog.reasonLabel")}</Label>
              <Textarea
                id="reject-reason"
                placeholder={t("admin.skillsPage.rejectDialog.reasonPlaceholder")}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectingSkill(null); setRejectReason(""); }}>
              {t("common.cancel")}
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
              {rejectMutation.isPending ? t("admin.skillsPage.rejectDialog.rejecting") : t("admin.skillsPage.rejectDialog.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewProposal} onOpenChange={() => setPreviewProposal(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("admin.skillsPage.proposalPreview.title")}</DialogTitle>
            <DialogDescription>
              {previewProposal?.skillName} / {previewProposal?.diffFile}
            </DialogDescription>
          </DialogHeader>
          {isProposalPreviewLoading ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-lg border bg-muted/20" role="status" aria-live="polite" aria-busy="true">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("admin.skillsPage.proposalPreview.loading")}
              </div>
            </div>
          ) : (
            <Textarea
              value={proposalPreviewData?.content || ""}
              readOnly
              rows={20}
              className="font-mono text-xs"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewProposal(null)}>
              {t("common.close")}
            </Button>
            {previewProposal && (
              <Button
                onClick={() => applyProposalMutation.mutate(previewProposal)}
                disabled={applyProposalMutation.isPending}
              >
                {t("admin.skillsPage.proposalPreview.apply")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingMaintenanceApply} onOpenChange={() => setPendingMaintenanceApply(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {pendingMaintenanceApply?.isAutoApplySafe ? t("admin.skillsPage.maintenanceApply.applyUpgrade") : t("admin.skillsPage.maintenanceApply.generateProposal")}
            </DialogTitle>
            <DialogDescription>
              {pendingMaintenanceApply?.skillName} • {pendingMaintenanceApply?.recommendationTitle}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            {pendingMaintenanceApply?.isAutoApplySafe ? (
              <p>{t("admin.skillsPage.maintenanceApply.safeDescription")}</p>
            ) : (
              <>
                <p>
                  {t("admin.skillsPage.maintenanceApply.unsafeDescription")}
                </p>
                {pendingMaintenanceApply?.hasProposalReady && (
                  <p>
                    {t("admin.skillsPage.maintenanceApply.hasProposal")}
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMaintenanceApply(null)}>
              {t("common.cancel")}
            </Button>
            {pendingMaintenanceApply?.hasProposalReady && !pendingMaintenanceApply?.isAutoApplySafe && (
              <Button
                variant="outline"
                onClick={() => {
                  setPendingMaintenanceApply(null);
                  setActiveTab("proposals");
                }}
              >
                {t("admin.skillsPage.maintenanceApply.openProposals")}
              </Button>
            )}
            {pendingMaintenanceApply && (
              <Button
                onClick={() => applyUpgradeMutation.mutate({ recommendationId: pendingMaintenanceApply.recommendationId })}
                disabled={applyUpgradeMutation.isPending}
              >
                {pendingMaintenanceApply.isAutoApplySafe ? t("admin.skillsPage.maintenanceApply.applyNow") : t("admin.skillsPage.maintenanceApply.generateProposal")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedRecommendationId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRecommendationId(null);
            setSelectedRecommendationViewMode("advice");
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedRecommendationViewMode === "reasoning"
                ? t("admin.skillsPage.legacyQueue.reasoningTitle")
                : t("admin.skillsPage.advice.title")}
            </DialogTitle>
            <DialogDescription>
              {selectedRecommendationDetail?.skill?.name || t("admin.skillsPage.advice.selectedSkill")}
              {selectedRecommendationDetail?.recommendation?.recommendationType
                ? `• ${selectedRecommendationDetail.recommendation.recommendationType}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {isRecommendationDetailLoading ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border bg-muted/20" role="status" aria-live="polite" aria-busy="true">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("admin.skillsPage.advice.loading")}
              </div>
            </div>
          ) : selectedRecommendationDetail?.recommendation ? (
            <div className="space-y-4">
              {selectedRecommendationViewMode === "reasoning" && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t("admin.skillsPage.legacyQueue.reasoningFocus")}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {getLegacyUpgradeReason({
                      ...selectedRecommendationDetail.recommendation,
                      latestRun: selectedRecommendationDetail.runs?.[0]
                        ? {
                            id: selectedRecommendationDetail.runs[0].id,
                            runType: selectedRecommendationDetail.runs[0].runType,
                            status: selectedRecommendationDetail.runs[0].status,
                            summary: selectedRecommendationDetail.runs[0].summary,
                            errorMessage: selectedRecommendationDetail.runs[0].errorMessage,
                            verificationJson: (selectedRecommendationDetail.runs[0].verificationJson as Record<string, unknown> | null) ?? null,
                            logsJson: (selectedRecommendationDetail.runs[0].logsJson as Record<string, unknown> | null) ?? null,
                            startedAt: selectedRecommendationDetail.runs[0].startedAt ? new Date(selectedRecommendationDetail.runs[0].startedAt).toISOString() : null,
                            endedAt: selectedRecommendationDetail.runs[0].endedAt ? new Date(selectedRecommendationDetail.runs[0].endedAt).toISOString() : null,
                            createdAt: new Date(selectedRecommendationDetail.runs[0].createdAt).toISOString(),
                            updatedAt: new Date(selectedRecommendationDetail.runs[0].updatedAt).toISOString(),
                          }
                        : null,
                    } as unknown as LegacyUpgradeQueueItem) || t("admin.skillsPage.legacyQueue.noReason")}
                  </div>
                </div>
              )}

              {selectedRecommendationDetail.skill?.slug && latestProposalBySkillName.has(selectedRecommendationDetail.skill.slug) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-sm">
                  {t("admin.skillsPage.advice.proposalAvailable")}
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
                      {t("admin.skillsPage.advice.previewProposal")}
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
                      {t("admin.skillsPage.advice.applyProposal")}
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{t("admin.skillsPage.advice.risk")}</div>
                  <div className="font-medium">{selectedRecommendationDetail.recommendation.riskLevel}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{t("admin.skillsPage.advice.compatibility")}</div>
                  <div className="font-medium">{selectedRecommendationDetail.recommendation.compatibilityStatus}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{t("admin.skillsPage.advice.qualityScore")}</div>
                  <div className="font-medium">{selectedRecommendationDetail.recommendation.qualityScore ?? "-"}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{t("admin.skillsPage.advice.currentRuntime")}</div>
                  <div className="font-medium">{selectedRecommendationDetail.recommendation.currentRuntime || "-"}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("admin.skillsPage.advice.summary")}</Label>
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  {selectedRecommendationDetail.recommendation.summary || t("admin.skillsPage.advice.noSummary")}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("admin.skillsPage.advice.affectedFiles")}</Label>
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  {Array.isArray(selectedRecommendationDetail.recommendation.recommendationJson?.affectedFiles)
                    ? selectedRecommendationDetail.recommendation.recommendationJson.affectedFiles.join(", ")
                    : t("admin.skillsPage.advice.noFileInventory")}
                </div>
              </div>

              {selectedRecommendationDetail.recommendation.recommendationType === "media-studio-auto-learning" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>
                      {t("admin.skillsPage.maintenance.mediaStudioIssues")}
                    </Label>
                    <div className="space-y-2 rounded-lg border bg-sky-50/40 p-3">
                      {getMediaStudioRecommendationIssues(selectedRecommendationDetail.recommendation as MaintenanceRecommendation).map((issue: any, index: number) => (
                        <div key={issue?.id || index} className="rounded-md border bg-white p-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{issue?.severity || "-"}</Badge>
                            <span className="font-medium">{issue?.title || "-"}</span>
                          </div>
                          {issue?.recommendation && (
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {issue.recommendation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {t("admin.skillsPage.maintenance.mediaStudioChanges")}
                    </Label>
                    <div className="space-y-2 rounded-lg border bg-emerald-50/40 p-3">
                      {getMediaStudioRecommendationChanges(selectedRecommendationDetail.recommendation as MaintenanceRecommendation).map((change: any, index: number) => (
                        <div key={`${change?.title || "change"}-${index}`} className="rounded-md border bg-white p-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{change?.risk || "-"}</Badge>
                            <span className="font-medium">{change?.title || "-"}</span>
                          </div>
                          {change?.reason && (
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {change.reason}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-slate-500">
                            {change?.targetFile || "-"}{change?.targetSection ? ` / ${change.targetSection}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("admin.skillsPage.advice.snapshotVerification")}</Label>
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
            <div className="text-sm text-muted-foreground">{t("admin.skillsPage.advice.loading")}</div>
          )}
          <DialogFooter>
            {selectedRecommendationDetail?.recommendation && (
              <>
                <Button
                  variant="outline"
                  onClick={() => dismissRecommendationMutation.mutate({ recommendationId: selectedRecommendationDetail.recommendation.id })}
                  disabled={dismissRecommendationMutation.isPending}
                >
                  {t("common.dismiss")}
                </Button>
                <Button
                  onClick={() => requestRecommendationApply(
                    selectedRecommendationDetail.recommendation as MaintenanceRecommendation,
                    selectedRecommendationDetail.skill?.name || t("admin.skillsPage.advice.selectedSkill"),
                  )}
                  disabled={selectedRecommendationDetail.recommendation.status === "applied" || applyUpgradeMutation.isPending}
                >
                  {isMaintenanceRecommendationEffectiveAutoApplySafe(selectedRecommendationDetail.recommendation as MaintenanceRecommendation) ? t("admin.skillsPage.maintenanceApply.applyUpgrade") : t("admin.skillsPage.maintenanceApply.generateProposal")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Skill Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        setIsCreateDialogOpen(open);
        if (!open) {
          setCreateDialogStep(1);
        }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" onKeyDown={handleCreateDialogKeyDown}>
          <DialogHeader>
            <DialogTitle>{t("admin.skillsPage.createDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.skillsPage.createDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="flex items-center gap-2 rounded-2xl border bg-muted/20 p-2 text-xs shadow-sm">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-xl px-4 py-2 transition-colors",
                  createDialogStep === 1 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
                onClick={() => setCreateDialogStep(1)}
              >
                1. Basic Info
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-xl px-4 py-2 transition-colors",
                  createDialogStep === 2 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
                onClick={() => setCreateDialogStep(2)}
              >
                2. Preview & Advanced
              </button>
              <div className="ml-auto px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t("admin.skillsPage.createDialog.stepIndicator", { current: createDialogStep, total: 2 })}
              </div>
            </div>

            {createDialogStep === 1 && (
              <div className="space-y-5 rounded-2xl border bg-background/80 p-5 shadow-sm">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="slug">{t("admin.skillsPage.fields.slug")}</Label>
                    <Input
                      id="slug"
                      placeholder={t("admin.skillsPage.createDialog.slugPlaceholder")}
                      value={newSkillData.slug}
                      ref={createSlugInputRef}
                      onChange={(e) => {
                        const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                        setNewSkillData({ ...newSkillData, slug });
                      }}
                    />
                    <p className={cn(
                      "text-xs",
                      createSkillBasicIssues.some((issue) => issue.startsWith("Slug")) ? "text-amber-700" : "text-muted-foreground",
                    )}>
                      {createSkillBasicIssues.find((issue) => issue.startsWith("Slug")) || t("admin.skillsPage.createDialog.slugHelp")}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("admin.skillsPage.fields.name")}</Label>
                    <Input
                      id="name"
                      placeholder={t("admin.skillsPage.createDialog.namePlaceholder")}
                      value={newSkillData.name}
                      onChange={(e) =>
                        setNewSkillData({ ...newSkillData, name: e.target.value })
                      }
                    />
                    <p className={cn(
                      "text-xs",
                      createSkillBasicIssues.some((issue) => issue.startsWith("Name")) ? "text-amber-700" : "text-muted-foreground",
                    )}>
                      {createSkillBasicIssues.find((issue) => issue.startsWith("Name")) || "This becomes the display name shown in the registry."}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description">{t("admin.skillsPage.fields.description")}</Label>
                  <Input
                    id="description"
                    placeholder={t("admin.skillsPage.createDialog.descriptionPlaceholder")}
                    value={newSkillData.description}
                    onChange={(e) =>
                      setNewSkillData({ ...newSkillData, description: e.target.value })
                    }
                  />
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label>{t("admin.skillsPage.createDialog.bundleTypeLabel")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("admin.skillsPage.createDialog.nativeDefaultHelp")}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Default
                    </Badge>
                  </div>
                  <Select
                    value={newSkillData.bundleType}
                    onValueChange={(value) => setNewSkillData({ ...newSkillData, bundleType: value as "native" | "legacy" })}
                  >
                    <SelectTrigger className="w-full max-w-xs min-w-0 overflow-hidden">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="native">Native bundle (recommended)</SelectItem>
                      <SelectItem value="legacy">Legacy DB-only skill</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="rounded-xl bg-background/80 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{t("admin.skillsPage.createDialog.nativeScaffoldHelp")}</p>
                    <p className="mt-1">{t("admin.skillsPage.createDialog.enterContinueHelp")}</p>
                  </div>
                </div>
              </div>
            )}

            {createDialogStep === 2 && (
              <div className="space-y-5">
                <div className="rounded-2xl border bg-background/80 p-5 space-y-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label className="text-base font-semibold">{t("admin.skillsPage.createDialog.stepTwoTitle")}</Label>
                      <p className="text-sm text-muted-foreground">
                        Review the scaffold and tune advanced settings before creating the skill.
                      </p>
                    </div>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Ready
                    </Badge>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-4">
                    <div className="space-y-2 xl:col-span-2">
                      <Label>{t("admin.skillsPage.fields.category")}</Label>
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
                        <SelectTrigger className="w-full min-w-0 overflow-hidden">
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
                      <p className="text-xs text-muted-foreground">
                        This changes the allowed runtime modes and default sandbox settings.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>{t("admin.skillsPage.fields.executionMode")}</Label>
                      <Select
                        value={newSkillData.executionMode}
                        onValueChange={(value) =>
                          setNewSkillData(applySandboxDefaultsToNewSkill(newSkillData, value as SkillExecutionMode))
                        }
                      >
                        <SelectTrigger className="w-full min-w-0 overflow-hidden">
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

                    <div className="space-y-2">
                      <Label htmlFor="priority">{t("admin.skillsPage.fields.priority")}</Label>
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

                    <div className="space-y-2">
                      <Label htmlFor="creditMultiplier">{t("admin.skillsPage.fields.creditMultiplier")}</Label>
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

                  {newSkillData.bundleType === "native" ? (
                    <div className="space-y-4 rounded-2xl border bg-muted/10 p-4">
                      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.skillsPage.createDialog.nativeProfile")}</Label>
                          <Select
                            value={newSkillData.bundleProfile}
                            onValueChange={(value) => setNewSkillData({ ...newSkillData, bundleProfile: value as NativeBundleProfile })}
                          >
                            <SelectTrigger className="mt-1 w-full min-w-0 overflow-hidden">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="general">General</SelectItem>
                              <SelectItem value="research">Research</SelectItem>
                              <SelectItem value="workflow">Workflow</SelectItem>
                              <SelectItem value="media">Media</SelectItem>
                              <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="rounded-xl border border-dashed bg-background/70 p-4 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">
                            {NATIVE_BUNDLE_PROFILE_INFO[newSkillData.bundleProfile].title}
                          </p>
                          <p className="mt-1">{NATIVE_BUNDLE_PROFILE_INFO[newSkillData.bundleProfile].description}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                            {t("admin.skillsPage.createDialog.iscAlignedBundleContract")}
                          </p>
                          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                            {NATIVE_BUNDLE_PROFILE_INFO[newSkillData.bundleProfile].bullets.map((bullet) => (
                              <li key={bullet}>• {bullet}</li>
                            ))}
                          </ul>
                          <div className="mt-3 grid gap-2 lg:grid-cols-2">
                            <div className="rounded-xl bg-background/60 p-3">
                              <p className="font-medium text-foreground">{t("admin.skillsPage.createDialog.performanceFocus")}</p>
                              <ul className="mt-1 grid gap-1">
                                {NATIVE_BUNDLE_PROFILE_INFO[newSkillData.bundleProfile].performance.map((bullet) => (
                                  <li key={bullet}>• {bullet}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="rounded-xl bg-background/60 p-3">
                              <p className="font-medium text-foreground">{t("admin.skillsPage.createDialog.qualityFocus")}</p>
                              <ul className="mt-1 grid gap-1">
                                {NATIVE_BUNDLE_PROFILE_INFO[newSkillData.bundleProfile].quality.map((bullet) => (
                                  <li key={bullet}>• {bullet}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-xl border bg-background/80 p-4 text-xs text-muted-foreground space-y-1.5">
                          <p className="font-medium text-foreground">{t("admin.skillsPage.createDialog.requiredFiles")}</p>
                          <ul className="grid gap-1">
                            <li>• `SKILL.md` + `skill.md`</li>
                            <li>• `skill.lock.json`</li>
                            <li>• `scripts/run.sh`</li>
                            <li>• `scripts/verify.sh`</li>
                          </ul>
                        </div>
                        <div className="rounded-xl border bg-background/80 p-4 text-xs text-muted-foreground space-y-1.5">
                          <p className="font-medium text-foreground">{t("admin.skillsPage.createDialog.optionalDocs")}</p>
                          <ul className="grid gap-1">
                            <li>• `references/input_contract.md`</li>
                            <li>• `references/output_contract.md`</li>
                            <li>• `references/maintenance.md`</li>
                            <li>• `references/performance.md`</li>
                            <li>• `references/quality.md`</li>
                            <li>• `references/failure_modes.md`</li>
                            <li>• `MODEL_COMPATIBILITY.md`</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-background/80 p-4 text-xs text-muted-foreground space-y-1.5">
                      <p className="font-medium text-foreground">{t("admin.skillsPage.createDialog.legacyDbOnlySkill")}</p>
                      <p>{t("admin.skillsPage.createDialog.legacyDbOnlySkillHelp")}</p>
                    </div>
                  )}
                </div>

                {createSkillValidationIssues.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1.5">
                    <p className="font-medium">{t("admin.skillsPage.createDialog.reviewBeforeCreating")}</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {createSkillValidationIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-4 rounded-2xl border bg-background/80 p-5 shadow-sm">
                  <div>
                    <Label>{t("admin.skillsPage.sandbox.runtime.title")}</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("admin.skillsPage.sandbox.runtime.help")}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("admin.skillsPage.sandbox.profile")}</Label>
                      <Select
                        value={newSkillData.sandboxProfileSlug || getDefaultSandboxSettings(newSkillData.category, newSkillData.executionMode).sandboxProfileSlug || "browser-default"}
                        onValueChange={(value) => setNewSkillData({ ...newSkillData, sandboxProfileSlug: value })}
                      >
                        <SelectTrigger className="w-full min-w-0 overflow-hidden">
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
                      <Label htmlFor="new-maxRuntimeSeconds">{t("admin.skillsPage.sandbox.maxRuntime")}</Label>
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
                      <Label htmlFor="new-maxInputMb">{t("admin.skillsPage.sandbox.maxInput")}</Label>
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
                        <Label className="text-sm">{t("admin.skillsPage.sandbox.requiresNetwork.label")}</Label>
                        <p className="text-xs text-muted-foreground">{t("admin.skillsPage.sandbox.requiresNetwork.help")}</p>
                      </div>
                      <Switch
                        checked={newSkillData.requiresNetwork ?? !!getDefaultSandboxSettings(newSkillData.category, newSkillData.executionMode).requiresNetwork}
                        onCheckedChange={(checked) => setNewSkillData({ ...newSkillData, requiresNetwork: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div>
                        <Label className="text-sm">{t("admin.skillsPage.sandbox.requiresBrowser.label")}</Label>
                        <p className="text-xs text-muted-foreground">{t("admin.skillsPage.sandbox.requiresBrowser.help")}</p>
                      </div>
                      <Switch
                        checked={newSkillData.requiresBrowser ?? !!getDefaultSandboxSettings(newSkillData.category, newSkillData.executionMode).requiresBrowser}
                        onCheckedChange={(checked) => setNewSkillData({ ...newSkillData, requiresBrowser: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("admin.skillsPage.fields.visibility")}</Label>
                  <Select
                    value={newSkillData.visibility || "private"}
                    onValueChange={(v) =>
                      setNewSkillData({ ...newSkillData, visibility: v as "private" | "public" })
                    }
                  >
                    <SelectTrigger className="w-full min-w-0 overflow-hidden">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">{t("admin.skillsPage.visibility.privateOption")}</SelectItem>
                      <SelectItem value="public">{t("admin.skillsPage.visibility.publicOption")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {newSkillData.visibility === "public" && !isAdmin && (
                    <p className="text-xs text-muted-foreground">
                      {t("admin.skillsPage.visibility.publicApprovalHelp")}
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
                    <Label>{t("admin.skillsPage.createDialog.autoTrigger")}</Label>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={newSkillData.isEnabled}
                        onCheckedChange={(checked) =>
                          setNewSkillData({ ...newSkillData, isEnabled: checked })
                        }
                      />
                      <Label>{t("admin.skillsPage.createDialog.enabled")}</Label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-11">{t("admin.skillsPage.createDialog.enabledHelp")}</p>
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
                      <Label>{t("admin.skillsPage.createDialog.visibleByDefault")}</Label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-11">{t("admin.skillsPage.createDialog.visibleByDefaultHelp")}</p>
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
                      <Label className={!newSkillData.visibleByDefault ? "text-muted-foreground" : ""}>{t("admin.skillsPage.createDialog.enabledByDefault")}</Label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-11">{t("admin.skillsPage.createDialog.enabledByDefaultHelp")}</p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="systemPrompt">{t("admin.skillsPage.fields.systemPrompt")}</Label>
                  <Textarea
                    id="systemPrompt"
                    placeholder={t("admin.skillsPage.createDialog.systemPromptPlaceholder")}
                    value={newSkillData.systemPrompt}
                    onChange={(e) =>
                      setNewSkillData({ ...newSkillData, systemPrompt: e.target.value })
                    }
                    rows={4}
                    className="font-mono text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="skillContent">{t("admin.skillsPage.fields.skillContent")}</Label>
                  <Textarea
                    id="skillContent"
                    placeholder={t("admin.skillsPage.createDialog.skillContentPlaceholder")}
                    value={newSkillData.skillContent}
                    onChange={(e) =>
                      setNewSkillData({ ...newSkillData, skillContent: e.target.value })
                    }
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="marketplaceContent">{t("admin.skillsPage.fields.marketplaceContent")}</Label>
                  <p className="text-xs text-muted-foreground mb-1">{t("admin.skillsPage.marketplace.help")}</p>
                  <Textarea
                    id="marketplaceContent"
                    placeholder={t("admin.skillsPage.marketplace.placeholder")}
                    value={newSkillData.marketplaceContent}
                    onChange={(e) =>
                      setNewSkillData({ ...newSkillData, marketplaceContent: e.target.value })
                    }
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateDialog}>
              {t("common.cancel")}
            </Button>
            {createDialogStep === 1 ? (
              <Button
                onClick={() => setCreateDialogStep(2)}
                disabled={createSkillBasicIssues.length > 0}
              >
                {createSkillBasicIssues.length > 0 ? "Fix required fields" : "Review Preview"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateDialogStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={handleCreateSkill}
                  disabled={createSkillValidationIssues.length > 0 || createMutation.isPending}
                  ref={createPrimaryActionRef}
                >
                  {createMutation.isPending ? t("admin.skillsPage.createDialog.creating") : t("admin.skillsPage.createDialog.create")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Skill Dialog */}
      {editingSkill && (
        <Dialog open={!!editingSkill} onOpenChange={() => setEditingSkill(null)}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
              <DialogTitle>{t("admin.skillsPage.editDialog.title")}</DialogTitle>
              <DialogDescription>
                {t("admin.skillsPage.editDialog.description", { slug: editingSkill.slug })}
              </DialogDescription>
            </DialogHeader>
            {selectedSkillExportSource?.sourceAgencyId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="space-y-0.5">
                  <p className="font-medium">{t("admin.skillsPage.editDialog.exportedFromAgencyBuilder")}</p>
                  <p className="text-xs text-emerald-800">
                    {selectedSkillExportSource.sourceAgencyName
                      ? t("admin.skillsPage.editDialog.sourceAgency", { name: selectedSkillExportSource.sourceAgencyName })
                      : t("admin.skillsPage.editDialog.fromGraphExport")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                  onClick={() => setLocation(`/agencies/${selectedSkillExportSource.sourceAgencyId}/edit`)}
                >
                  {t("admin.skillsPage.editDialog.openSourceGraph")}
                </Button>
                {sourceGraphDuplicateLocation && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                      onClick={() => setLocation(sourceGraphDuplicateLocation)}
                    >
                      {t("admin.skillsPage.editDialog.duplicateFromSourceGraph")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                      onClick={handleCopySourceGraphDuplicateLocation}
                    >
                      {t("admin.skillsPage.editDialog.copyDuplicateLink")}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>{t("admin.skillsPage.fields.slug")}</Label>
                  <Input value={editingSkill.slug} disabled className="bg-muted" />
                </div>
                <div>
                  <Label htmlFor="edit-name">{t("admin.skillsPage.fields.name")}</Label>
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
                <Label htmlFor="edit-description">{t("admin.skillsPage.fields.description")}</Label>
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
                <Label>{t("admin.skillsPage.fields.visibility")}</Label>
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
                    <SelectItem value="private">{t("admin.skillsPage.visibility.privateOption")}</SelectItem>
                    <SelectItem value="public">{t("admin.skillsPage.visibility.publicOption")}</SelectItem>
                  </SelectContent>
                </Select>
                {editingSkill.visibility === "public" && !isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    {t("admin.skillsPage.visibility.publicApprovalHelp")}
                  </p>
                )}
                {editingSkill.visibility === "pending_approval" && (
                  <p className="text-xs text-amber-600">
                    {t("admin.skillsPage.visibility.pendingApprovalHelp")}
                  </p>
                )}
              </div>

              {/* Rejection Reason */}
              {editingSkill.visibility === "rejected" && editingSkill.rejectionReason && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                  <strong>{t("admin.skillsPage.editDialog.rejectionReason")}</strong> {editingSkill.rejectionReason}
                </div>
              )}

              {/* Group Sharing Section — only shown for private skills */}
              {editingSkill.visibility === "private" && (
                <div className="space-y-3 border rounded-lg p-4">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t("admin.skillsPage.editDialog.sharedWithGroups")}
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
                            {t("admin.skillsPage.editDialog.groupMembers", { count: group.memberCount })}
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
                        {t("admin.skillsPage.editDialog.noSharedGroups")}
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
                          <SelectValue placeholder={t("admin.skillsPage.editDialog.addGroupPlaceholder")} />
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
                <Label>{t("admin.skillsPage.fields.category")}</Label>
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
                <Label>{t("admin.skillsPage.fields.executionMode")}</Label>
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
                    <Label>{t("admin.skillsPage.sandbox.runtime.title")}</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("admin.skillsPage.sandbox.runtime.help")} {t("admin.skillsPage.sandbox.runtime.customHint")}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("admin.skillsPage.sandbox.profile")}</Label>
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
                      <Label htmlFor="edit-maxRuntimeSeconds">{t("admin.skillsPage.sandbox.maxRuntime")}</Label>
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
                      <Label htmlFor="edit-maxInputMb">{t("admin.skillsPage.sandbox.maxInput")}</Label>
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
                        <Label className="text-sm">{t("admin.skillsPage.sandbox.requiresNetwork.label")}</Label>
                        <p className="text-xs text-muted-foreground">{t("admin.skillsPage.sandbox.requiresNetwork.help")}</p>
                      </div>
                      <Switch
                        checked={editingSkill.requiresNetwork ?? !!getDefaultSandboxSettings(editingSkill.category, editingSkill.executionMode).requiresNetwork}
                        onCheckedChange={(checked) => setEditingSkill({ ...editingSkill, requiresNetwork: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div>
                        <Label className="text-sm">{t("admin.skillsPage.sandbox.requiresBrowser.label")}</Label>
                        <p className="text-xs text-muted-foreground">{t("admin.skillsPage.sandbox.requiresBrowser.help")}</p>
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
                      {t("admin.skillsPage.modelSelection.defaultMediaModel")}
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
                            : <span className="text-muted-foreground">{t("admin.skillsPage.modelSelection.autoHighestPriority")}</span>}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[450px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t("admin.skillsPage.modelSelection.searchMediaModels")} />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty>{t("admin.skillsPage.modelSelection.noModelFound")}</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__auto__"
                                onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: null })}
                              >
                                <Check className={`mr-2 h-4 w-4 ${!editingSkill.defaultModel ? "opacity-100" : "opacity-0"}`} />
                                <span className="text-muted-foreground">{t("admin.skillsPage.modelSelection.autoHighestPriority")}</span>
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
                      {t("admin.skillsPage.modelSelection.mediaModelHelp")}
                    </p>
                  </>
                ) : isSandboxExecutionMode(editingSkill.executionMode) || editingSkill.executionMode === "python" ? (
                  <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                    {editingSkill.executionMode === "sandbox-command"
                      ? t("admin.skillsPage.modelSelection.sandboxCommandNoPicker")
                      : t("admin.skillsPage.modelSelection.noPicker")}
                  </div>
                ) : (
                  <>
                    <Label className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      {t("admin.skillsPage.modelSelection.defaultLlmModel")}
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
                          <CommandInput placeholder={t("admin.skillsPage.modelSelection.searchLlmModels")} />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty>{t("admin.skillsPage.modelSelection.noModelFound")}</CommandEmpty>
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
                                    <Badge variant="secondary" className="ml-1 text-[10px] h-4">{t("admin.skillsPage.modelSelection.defaultBadge")}</Badge>
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      {t("admin.skillsPage.modelSelection.autoModeHelp")}
                    </p>

                    <div className="mt-3 space-y-2 rounded-md border p-3">
                      <Label>{t("admin.skillsPage.modelSelection.preferredProvider")}</Label>
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
                          <SelectValue placeholder={t("admin.skillsPage.modelSelection.autoRoutePlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">{t("admin.skillsPage.modelSelection.autoRoutePlaceholder")}</SelectItem>
                          {(llmProvidersData || []).map((provider: { id: number; displayName: string; providerName: string }) => (
                            <SelectItem key={provider.id} value={String(provider.id)}>
                              {provider.displayName} ({provider.providerName})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <Label className="text-sm">{t("admin.skillsPage.modelSelection.strictProviderPin")}</Label>
                          <p className="text-xs text-muted-foreground">
                            {t("admin.skillsPage.modelSelection.strictProviderPinHelp")}
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
                    <Label className="text-sm font-medium">{t("admin.skillsPage.createDialog.autoTrigger")}</Label>
                    <p className="text-xs text-muted-foreground">{t("admin.skillsPage.createDialog.autoTriggerHelp")}</p>
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
                    <Label className="text-sm font-medium">{t("admin.skillsPage.createDialog.enabled")}</Label>
                    <p className="text-xs text-muted-foreground">{t("admin.skillsPage.createDialog.enabledShortHelp")}</p>
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
                    <Label className="text-sm font-medium">{t("admin.skillsPage.createDialog.visibleByDefault")}</Label>
                    <p className="text-xs text-muted-foreground">{t("admin.skillsPage.createDialog.visibleByDefaultShortHelp")}</p>
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
                    <Label className={`text-sm font-medium ${!editingSkill.visibleByDefault ? "text-muted-foreground" : ""}`}>{t("admin.skillsPage.createDialog.enabledByDefault")}</Label>
                    <p className="text-xs text-muted-foreground">{t("admin.skillsPage.createDialog.enabledByDefaultShortHelp")}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Image className="mt-0.5 h-4 w-4 text-sky-700" />
                    <div>
                      <Label className="text-sm font-semibold text-sky-900">
                        {t("admin.skillsPage.productionReferenceStoryboard.title")}
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("admin.skillsPage.productionReferenceStoryboard.description")}
                      </p>
                      <code className="mt-2 inline-flex rounded bg-white/80 px-2 py-1 text-[11px] text-sky-900">
                        config.media_studio.production_reference_storyboard.enabled=
                        {String((editingSkill as any)._productionReferenceStoryboardEnabled === true)}
                      </code>
                    </div>
                  </div>
                  <Switch
                    checked={(editingSkill as any)._productionReferenceStoryboardEnabled === true}
                    onCheckedChange={(checked) =>
                      setEditingSkill({
                        ...editingSkill,
                        _productionReferenceStoryboardConfigured: true,
                        _productionReferenceStoryboardEnabled: checked,
                      } as any)
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.skillsPage.productionReferenceStoryboard.enabledHelp")}
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 text-sky-700" />
                    <div>
                      <Label className="text-sm font-semibold text-sky-900">
                        {t("admin.skillsPage.autoLearning.title")}
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("admin.skillsPage.autoLearning.description")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={(editingSkill as any)._autoLearningEnabled ?? false}
                    onCheckedChange={(checked) =>
                      setEditingSkill({ ...editingSkill, _autoLearningEnabled: checked } as any)
                    }
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={(editingSkill as any)._autoLearningPromptQa ?? true}
                      onCheckedChange={(checked) =>
                        setEditingSkill({ ...editingSkill, _autoLearningPromptQa: checked } as any)
                      }
                      disabled={!((editingSkill as any)._autoLearningEnabled ?? false)}
                    />
                    <div>
                      <Label className="text-xs font-medium">{t("admin.skillsPage.autoLearning.promptQa")}</Label>
                      <p className="text-[10px] text-muted-foreground">{t("admin.skillsPage.autoLearning.promptQaHelp")}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch
                      checked={(editingSkill as any)._autoLearningImageQa ?? true}
                      onCheckedChange={(checked) =>
                        setEditingSkill({ ...editingSkill, _autoLearningImageQa: checked } as any)
                      }
                      disabled={!((editingSkill as any)._autoLearningEnabled ?? false)}
                    />
                    <div>
                      <Label className="text-xs font-medium">{t("admin.skillsPage.autoLearning.imageQa")}</Label>
                      <p className="text-[10px] text-muted-foreground">{t("admin.skillsPage.autoLearning.imageQaHelp")}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch
                      checked={(editingSkill as any)._autoLearningRequireAdminApproval ?? true}
                      onCheckedChange={(checked) =>
                        setEditingSkill({ ...editingSkill, _autoLearningRequireAdminApproval: checked } as any)
                      }
                      disabled={!((editingSkill as any)._autoLearningEnabled ?? false)}
                    />
                    <div>
                      <Label className="text-xs font-medium">{t("admin.skillsPage.autoLearning.adminApproval")}</Label>
                      <p className="text-[10px] text-muted-foreground">{t("admin.skillsPage.autoLearning.adminApprovalHelp")}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{t("admin.skillsPage.autoLearning.promptScore")}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={(editingSkill as any)._autoLearningMinPromptScore ?? 85}
                        onChange={(event) =>
                          setEditingSkill({
                            ...editingSkill,
                            _autoLearningMinPromptScore: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                          } as any)
                        }
                        disabled={!((editingSkill as any)._autoLearningEnabled ?? false)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{t("admin.skillsPage.autoLearning.imageScore")}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={(editingSkill as any)._autoLearningMinImageScore ?? 80}
                        onChange={(event) =>
                          setEditingSkill({
                            ...editingSkill,
                            _autoLearningMinImageScore: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                          } as any)
                        }
                        disabled={!((editingSkill as any)._autoLearningEnabled ?? false)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Content Quality & Execution Policy — Spec 038 */}
              <div className="space-y-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  <Label className="text-sm font-semibold text-blue-700 dark:text-blue-400">{t("admin.skillsPage.contentPolicy.title")}</Label>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  {t("admin.skillsPage.contentPolicy.description")}
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                  {/* Thinking Level */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("admin.skillsPage.contentPolicy.thinkingLevel.label")}</Label>
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
                        <SelectItem value="auto">{t("admin.skillsPage.contentPolicy.thinkingLevel.options.auto")}</SelectItem>
                        <SelectItem value="low">{t("admin.skillsPage.contentPolicy.thinkingLevel.options.low")}</SelectItem>
                        <SelectItem value="medium">{t("admin.skillsPage.contentPolicy.thinkingLevel.options.medium")}</SelectItem>
                        <SelectItem value="high">{t("admin.skillsPage.contentPolicy.thinkingLevel.options.high")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      {t("admin.skillsPage.contentPolicy.thinkingLevel.help")}
                    </p>
                  </div>

                  {/* Response Mode */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("admin.skillsPage.contentPolicy.responseMode.label")}</Label>
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
                        <SelectItem value="markdown">{t("admin.skillsPage.contentPolicy.responseMode.options.markdown")}</SelectItem>
                        <SelectItem value="cms_json">{t("admin.skillsPage.contentPolicy.responseMode.options.cmsJson")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      {t("admin.skillsPage.contentPolicy.responseMode.help")}
                    </p>
                  </div>

                  {/* Min Citation Coverage */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">
                      {t("admin.skillsPage.contentPolicy.minCitationCoverage.label", { percent: Math.round(((editingSkill as any)._minCitationCoverage ?? 0) * 100) })}
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
                      {t("admin.skillsPage.contentPolicy.minCitationCoverage.help")}
                    </p>
                  </div>

                  {/* Refresh Cadence */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("admin.skillsPage.contentPolicy.refreshCadence.label")}</Label>
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
                      {t("admin.skillsPage.contentPolicy.refreshCadence.help")}
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
                    <Label className="text-xs font-medium">{t("admin.skillsPage.orchestration.mode")}</Label>
                    <Select
                      value={(editingSkill as any)._orchestrationMode ?? "local"}
                      onValueChange={(value) => setEditingSkill({ ...editingSkill, _orchestrationMode: value } as any)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">{t("admin.skillsPage.orchestration.modes.local")}</SelectItem>
                        <SelectItem value="skill-handoff">{t("admin.skillsPage.orchestration.modes.skillHandoff")}</SelectItem>
                        <SelectItem value="agency-swarm">{t("admin.skillsPage.orchestration.modes.agencySwarm")}</SelectItem>
                        <SelectItem value="hybrid">{t("admin.skillsPage.orchestration.modes.hybrid")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("admin.skillsPage.orchestration.executionEndpoint")}</Label>
                    <Input
                      value={(editingSkill as any)._orchestrationEndpoint ?? ""}
                      onChange={(e) => setEditingSkill({ ...editingSkill, _orchestrationEndpoint: e.target.value } as any)}
                      placeholder={t("admin.skillsPage.orchestration.executionEndpointPlaceholder")}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs font-medium">{t("admin.skillsPage.orchestration.skillTargets")}</Label>
                    <Input
                      value={(editingSkill as any)._orchestrationSkillTargets ?? ""}
                      onChange={(e) => setEditingSkill({ ...editingSkill, _orchestrationSkillTargets: e.target.value } as any)}
                      placeholder={t("admin.skillsPage.orchestration.skillTargetsPlaceholder")}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t("admin.skillsPage.orchestration.skillTargetsHelp")}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("admin.skillsPage.orchestration.fallback")}</Label>
                    <Select
                      value={(editingSkill as any)._orchestrationFallback ?? "local"}
                      onValueChange={(value) => setEditingSkill({ ...editingSkill, _orchestrationFallback: value } as any)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">{t("admin.skillsPage.orchestration.fallbackOptions.local")}</SelectItem>
                        <SelectItem value="fail">{t("admin.skillsPage.orchestration.fallbackOptions.fail")}</SelectItem>
                        <SelectItem value="queue">{t("admin.skillsPage.orchestration.fallbackOptions.queue")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-white/60 px-3 py-2">
                    <div>
                      <Label className="text-xs font-medium">{t("admin.skillsPage.orchestration.parallelDispatch")}</Label>
                      <p className="text-[10px] text-muted-foreground">
                        {t("admin.skillsPage.orchestration.parallelDispatchHelp")}
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
                  <Label>{t("admin.skillsPage.triggerPatterns.title")}</Label>
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
                    {t("admin.skillsPage.triggerPatterns.addPattern")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.skillsPage.triggerPatterns.helpPrefix")} <code className="bg-muted px-1 rounded">|</code> {t("admin.skillsPage.triggerPatterns.helpSuffix")}
                  e.g. <code className="bg-muted px-1 rounded">สร้างพรอมต์|enhance prompt|image prompt</code>
                </p>
                {editingSkill.triggerPatterns.length === 0 && (
                  <p className="text-xs text-muted-foreground italic py-2">{t("admin.skillsPage.triggerPatterns.empty")}</p>
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
                        placeholder={t("admin.skillsPage.triggerPatterns.placeholder")}
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
                <Label htmlFor="edit-systemPrompt">{t("admin.skillsPage.fields.systemPrompt")}</Label>
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
                <Label htmlFor="edit-skillContent">{t("admin.skillsPage.fields.skillContent")}</Label>
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
                  <Label htmlFor="edit-marketplaceContent">{t("admin.skillsPage.fields.marketplaceContent")}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="dark:border-muted-foreground/40 dark:text-foreground"
                    onClick={() => editingSkill && regenerateMarketplaceMutation.mutate({ id: editingSkill.id })}
                    disabled={regenerateMarketplaceMutation.isPending}
                  >
                    {regenerateMarketplaceMutation.isPending ? t("admin.skillsPage.marketplace.generating") : t("admin.skillsPage.marketplace.regenerate")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{t("admin.skillsPage.marketplace.help")}</p>
                <Textarea
                  id="edit-marketplaceContent"
                  placeholder={t("admin.skillsPage.marketplace.placeholder")}
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
                  <Label>{t("admin.skillsPage.fields.knowledgebase")}</Label>
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
                  <Label>{t("admin.skillsPage.fields.folderPath")}</Label>
                  <Input value={editingSkill.folderPath} disabled className="bg-muted" />
                </div>
              )}
            </div>
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setEditingSkill(null)} className="dark:border-muted-foreground/40 dark:text-foreground dark:hover:bg-muted">
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleUpdateSkill}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? t("admin.skillsPage.editDialog.saving") : t("admin.skillsPage.editDialog.saveChanges")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Import ZIP Dialog */}
      <Dialog open={isZipDialogOpen} onOpenChange={setIsZipDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.skillsPage.importZip.title")}</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">{t("admin.skillsPage.importZip.supports")}</span>
              <span className="block text-xs">
                <strong>{t("admin.skillsPage.importZip.format1Label")}</strong> {t("admin.skillsPage.importZip.format1Description")}
              </span>
              <span className="block text-xs">
                <strong>{t("admin.skillsPage.importZip.format2Label")}</strong> {t("admin.skillsPage.importZip.format2Description")}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="zipSlug">{t("admin.skillsPage.importZip.slug")}</Label>
              <Input
                id="zipSlug"
                placeholder={t("admin.skillsPage.importZip.slugPlaceholder")}
                value={zipSlug}
                onChange={(e) => {
                  const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                  setZipSlug(slug);
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin.skillsPage.importZip.slugHelp")}
              </p>
            </div>

            <div>
              <Label>{t("admin.skillsPage.importZip.file")}</Label>
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
                  {zipFile ? zipFile.name : t("admin.skillsPage.importZip.selectFile")}
                </Button>
              </div>
            </div>

            {zipFile && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm">
                  <span className="font-medium">{t("admin.skillsPage.importZip.fileLabel")}</span> {zipFile.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t("admin.skillsPage.importZip.sizeLabel")}</span> {(zipFile.size / 1024).toFixed(1)} KB
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
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleZipUpload}
              disabled={!zipFile || !zipSlug || importZipMutation.isPending}
            >
              {importZipMutation.isPending ? t("admin.skillsPage.importZip.importing") : t("admin.skillsPage.importZip.import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
