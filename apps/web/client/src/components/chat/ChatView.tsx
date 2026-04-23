import { useEffect, useRef, useState, useCallback, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useLocation } from "wouter";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Check,
  Loader2,
  MonitorPlay,
  Paperclip,
  Send,
  X,
  Settings,
  CreditCard,
  RefreshCw,
  Wand2,
  Video,
  Code2,
  FileText,
  ClipboardList,
  ArrowRight,
  Search,
  Sparkles,
  Bot,
  ImagePlus,
  Palette,
  Music,
  Zap,
  Cpu,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  GripVertical,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { pickEnabledModelId } from "@/lib/enabledModelSelection";
import { ImageLightbox } from "./media/ImageLightbox";
import { SafeMarkdown } from "./SafeMarkdown";
import {
  LLMArtifactViewer,
  parseArtifacts,
  stripArtifactTags,
  type LLMArtifact,
} from "./artifacts/LLMArtifactViewer";
import {
  SaveMemoryDialog,
  type SaveMemoryInitialData,
} from "./SaveMemoryDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Brain, Languages, Mic } from "lucide-react";
import {
  transcribeWithLegacySpeechToText,
  usePushToTalk,
} from "@/hooks/usePushToTalk";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { useAuth } from "@/contexts/AuthContext";
import { resolveLocalAiSyncedPreferences } from "@/features/local-ai/state/localAiSettingsStore";
import type { MessageRuntimeMetadata } from "@/features/local-ai/types/capability";
import {
  applyConversationLocalAiOverride,
  resolveExplicitChatSessionLocalAiMode,
} from "@smartspec/local-ai-core";
import { isBrowserLocalRuntimeAbortError } from "@/features/local-ai/adapters/browserLocalRuntime";
import { useLocalAiCapability } from "@/features/local-ai/hooks/useLocalAiCapability";
import { compactMessagesForProviderSubmission } from "@/features/local-ai/chat/localTextCompaction";
import {
  buildHybridAttachmentAssist,
  type AttachmentAssistAttachment,
  looksLikeDocumentAttachment,
} from "@/features/local-ai/chat/localAttachmentAssist";
import {
  EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER,
  readConfiguredExternalLocalTextBackend,
  readConfiguredExternalLocalTextBackendReason,
  resolveExternalLocalTextBackendReason,
} from "@/features/local-ai/adapters/externalLocalTextBackend";
import {
  generateTauriLocalGeneralReply,
  isExternalLocalTextBackendAbortError,
  isLocalTextRuntimeError,
  isTauriLocalRuntimeAbortError,
  shouldBlockCloudForLocalOnlyMode,
} from "@/features/local-ai/chat/localTextReply";
import {
  LOCAL_AI_DEVICE_STATE_UPDATED_EVENT,
  readLocalAiDeviceState,
} from "@/features/local-ai/state/localAiDeviceStateStorage";
import { resolveChatMicProvider } from "@/features/local-ai/voice/chatMicProvider";
import {
  getLocalVoiceRuntimeAvailability,
  transcribeWithLocalVoiceRuntime,
} from "@/features/local-ai/voice/localVoiceRuntime";
import {
  speakLocalVoiceReadback,
  stopLocalVoiceReadback,
  type LocalVoiceReadbackPriority,
} from "@/features/local-ai/voice/localVoiceReadback";
import {
  routeVoiceCommand,
  type ClientVoiceCommandResult,
} from "@/features/local-ai/voice/voiceCommandRouter";
import { useTauriLocalSkillRuntimeStatus } from "@/features/local-ai/skills/useTauriLocalSkillRuntimeStatus";
import {
  useChatSkillForm,
  SkillCommandButton,
  SkillFormErrorBoundary,
} from "@/components/chat/skill";
import { useSkillExecution } from "@/components/chat/skill/hooks/useSkillExecution";
import { TelegramBindingButton } from "./TelegramBindingButton";
import { ScheduleConfirmCard } from "./ScheduleConfirmCard";
import { MediaPromptPreview } from "./MediaPromptPreview";
import { AgencyEscalationCard } from "./AgencyEscalationCard";
import { HybridOrchestrationCard } from "./HybridOrchestrationCard";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FallbackConsent } from "./FallbackConsent";
import { MessageCostBadge } from "./MessageCostBadge";
import { ConversationScopeBadge } from "./ConversationScopeBadge";
import {
  formatModelCost,
  getCheapestProvider,
  type AvailableModel,
  type ModelProvider,
} from "@/lib/modelPricing";
import {
  AUTO_MODEL,
  buildAutoProviderValue,
  getSelectionDisplaySummary,
  isAutoProviderValue,
  parsePickerSelectionValue,
  selectionToPickerValue,
  type StoredChatModelSelectionState,
} from "@/lib/chatModelSelection";
import { BrowserSessionSummaryCard } from "@/components/browser-session/BrowserSessionSummaryCard";
import { BrowserSessionLaunchSuggestionCard } from "@/components/browser-session/BrowserSessionLaunchSuggestionCard";
import {
  mergeClientConversationSkillSettings,
  readClientConversationSkillSettings,
} from "@shared/localAiConversationSettings";
import { HelpButton } from "@/components/help";
import { ComparisonPreviewCard } from "@/components/comparison/ComparisonPreviewCard";
import { FinanceActivityCard } from "@/components/finance/FinanceActivityCard";
import { PersonaSelector } from "./PersonaSelector";
import type { BrowserSessionLaunchSuggestion } from "@/lib/browserSessionInvocation";
import type { LocalAiDeviceStateScope } from "@/features/local-ai/types/deviceState";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  appendLibraryContextToMessage,
  extractRetrievalQueryText,
  isChatLibrarySourcePickerEnabled,
  toAttachableLibrarySources,
  toggleLibrarySourceSelection,
  type ChatLibraryAttachPayload,
  type ChatLibrarySearchResultLike,
} from "@/lib/chatLibrary";
import { buildBrowserSessionPath } from "@/lib/browserSessionRouting";
import { type BrowserSessionArtifact } from "@shared/browserSession";
import {
  extractBrowserSessionArtifacts,
  extractComparisonPreviews,
} from "@/lib/chatArtifactPresentation";
import {
  extractTeamRoomActionLinks,
  stripStandaloneTeamRoomActionLinks,
} from "@/lib/teamRoomActionLinks";
import type { HybridOrchestrationPlan } from "@shared/orchestration/hybridOrchestration";
import { shouldPreserveLocalMessages } from "@/lib/chatMessageSync";
import { buildWorkRequestLaunchPath } from "@/lib/workRequestLinks";
import {
  resolveChatLocalRuntimeReadiness,
  looksLikeSkillRequest,
  resolveDetectedSkillForSend,
  shouldAutoRunDetectedSkill,
  shouldBlockPendingCloudKeepInChat,
} from "./chatLocalRouting";

// Debounce hook for skill detection
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function summarizeNotificationsForVoiceReadback(
  notifications: Array<{
    title?: string | null;
    content?: string | null;
    priority?: string | null;
    isRead?: boolean | null;
  }>
): string {
  if (notifications.length === 0) {
    return "You do not have any recent notifications right now.";
  }

  const unreadNotifications = notifications.filter(
    notification => notification.isRead !== true
  );
  const baseList =
    unreadNotifications.length > 0 ? unreadNotifications : notifications;
  const urgentNotifications = baseList.filter(notification =>
    ["high", "critical"].includes(
      String(notification.priority ?? "").toLowerCase()
    )
  );
  const highlightSource =
    urgentNotifications.length > 0 ? urgentNotifications : baseList;
  const highlights = highlightSource
    .slice(0, 3)
    .map((notification, index) => {
      const candidate =
        notification.title?.trim() ||
        notification.content?.trim() ||
        `Notification ${index + 1}`;
      return candidate.replace(/\s+/g, " ");
    })
    .filter(Boolean);

  if (highlights.length === 0) {
    return "You have recent notifications, but they do not include readable titles right now.";
  }

  const unreadCount = unreadNotifications.length;
  const urgentCount = urgentNotifications.length;
  const scopePrefix =
    unreadCount > 0
      ? `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
      : `You have ${notifications.length} recent notification${notifications.length === 1 ? "" : "s"}`;
  const urgentPrefix =
    urgentCount > 0
      ? `, including ${urgentCount} urgent item${urgentCount === 1 ? "" : "s"}`
      : "";
  return `${scopePrefix}${urgentPrefix}. Top ${Math.min(highlights.length, 3)}: ${highlights.join(". ")}.`;
}

function normalizeVoiceLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildVoiceActionConfirmationCopy(
  action: ClientVoiceCommandResult
): string {
  if (action.type === "mark_notifications_read") {
    return "Mark all notifications as read?";
  }
  if (action.type === "draft_message") {
    return action.targetLabel
      ? `Draft a message for ${action.targetLabel}?`
      : "Draft this message in the composer?";
  }
  if (action.type === "submit_chat") {
    if (action.useLocation) {
      return "Use your current location with this search before sending it to chat?";
    }
    return `Send this ${action.actionLabel.toLowerCase()} now?`;
  }
  return "Continue with this voice action?";
}

function normalizeWakePhrase(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeVoiceLookup(value);
  return normalized.length > 0 ? normalized : null;
}

type WorkStartCardPosition = {
  x: number;
  y: number;
};

type WorkStartDragState = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

function getTeamRoomActionIcon(
  kind: "approval" | "reply" | "workflow" | "open"
) {
  if (kind === "approval") return Check;
  if (kind === "reply") return RefreshCw;
  if (kind === "workflow") return Bot;
  return ChevronDown;
}

function getTeamRoomActionClasses(
  kind: "approval" | "reply" | "workflow" | "open"
): string {
  if (kind === "approval") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (kind === "reply") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (kind === "workflow") {
    return "border-violet-200 bg-violet-50 text-violet-800";
  }
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function getRuntimeBadgeCopy(
  runtimeMetadata: MessageRuntimeMetadata | null | undefined
): { label: "Cloud" | "Hybrid" | "Local"; description: string } | null {
  if (!runtimeMetadata) {
    return null;
  }

  const looksLikeExplicitLocalReply =
    runtimeMetadata.source === "hybrid" &&
    (runtimeMetadata.provider === EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER ||
      typeof runtimeMetadata.profileId === "string");

  if (looksLikeExplicitLocalReply) {
    return {
      label: "Local",
      description: "The response was generated by Local AI on this device.",
    };
  }

  if (runtimeMetadata.source === "hybrid") {
    return {
      label: "Hybrid",
      description:
        "Local preprocessing or compaction was used before the cloud response.",
    };
  }

  return {
    label: "Cloud",
    description: "The response used the existing server/cloud runtime path.",
  };
}

function buildLocalRuntimeFailureMessage(error: unknown): string {
  if (!isLocalTextRuntimeError(error)) {
    return "Local-only mode is enabled, but no local text runtime is ready on this device. Prepare a Gemma 4 model or configure a local API backend in Settings, or switch back to auto / prefer_local.";
  }

  const detail = error.message?.trim() || "";
  if (error.code === "browser_no_installed_model") {
    return "Local-only mode is enabled, but no prepared browser Gemma 4 model is ready for this device. Open Settings > Local AI > Models and prepare/cache a browser model, or configure a Local AI URL backend in Settings.";
  }
  if (error.code === "tauri_local_text_runtime_not_installed") {
    return "Local-only mode is enabled, but no prepared desktop Gemma 4 model is ready for this device. Open Settings > Local AI > Models and prepare/repair a desktop model, or configure a Local AI URL backend in Settings.";
  }
  if (error.code === "browser_device_scope_unavailable") {
    return "Local-only mode is enabled, but this browser session could not access the Local AI device state for your account. Reload the page and try again, or configure a Local AI URL backend in Settings.";
  }
  if (error.code === "external_local_text_backend_failed") {
    if (detail.includes("external_local_backend_private_network_blocked")) {
      return "Local-only mode is enabled, but this browser page is running on HTTPS while the Local AI URL backend is plain HTTP on your private network, so the browser blocked the request. If you are using LM Studio, enable local-network access/CORS in Server Settings and use an HTTPS endpoint for the backend if available. Otherwise use desktop/Tauri for this device, or switch the device back to On-device Gemma / Auto.";
    }
    if (detail.includes("external_local_backend_unreachable")) {
      return "Local-only mode is enabled, but the Local AI URL backend could not be reached from this device. Check that the backend is running, the Base URL is correct, and the local backend allows requests from SmartAIHub.";
    }
    return `Local-only mode is enabled, but the Local AI URL backend failed (${detail || "unknown error"}). Check the Base URL, token, and local backend process in Settings > Local AI, or switch back to auto / prefer_local.`;
  }
  if (error.code === "external_local_text_backend_not_configured") {
    if (detail.includes("missing_base_url")) {
      return "Local-only mode is enabled, but this device is pinned to the Local AI URL backend and its Base URL is still empty. Open Settings > Local AI > URL backend and fill in the Base URL, or switch the device back to On-device Gemma / Auto.";
    }
    if (detail.includes("invalid_loopback_url")) {
      return "Local-only mode is enabled, but this device is pinned to the Local AI URL backend and its Base URL must use localhost or a private LAN IP such as 127.0.0.1, ::1, 10.x.x.x, 172.16-31.x.x, or 192.168.x.x. Open Settings > Local AI > URL backend and correct the URL, or switch the device back to On-device Gemma / Auto.";
    }
    if (detail.includes("missing_model")) {
      return "Local-only mode is enabled, but this device is pinned to the Local AI URL backend and its model name is still empty. Open Settings > Local AI > URL backend and enter the model name, or switch the device back to On-device Gemma / Auto.";
    }
    return "Local-only mode is enabled, but this device is pinned to the Local AI URL backend and its URL/model are not configured yet. Open Settings > Local AI and finish the URL backend setup, or switch the device back to On-device Gemma / Auto.";
  }
  if (detail === "browser_model_not_cached") {
    return "Local-only mode is enabled, but the cached browser model is missing on this device. Open Settings > Local AI > Models and prepare/cache the model again, or switch back to auto / prefer_local.";
  }
  if (detail === "browser_runtime_config_missing") {
    return "Local-only mode is enabled, but the selected browser profile is incomplete. Choose another local profile or configure a Local AI URL backend in Settings.";
  }
  if (detail.includes("browser_runtime_bundle_load_failed")) {
    if (
      detail.includes("blob:") ||
      detail.includes("cdn.jsdelivr.net") ||
      detail.toLowerCase().includes("content security policy") ||
      detail.toLowerCase().includes("refused to load")
    ) {
      return `Local-only mode is enabled, but the browser blocked the Local AI runtime bundle (${detail}). Reload the page so it can pick up the latest Local AI runtime policy, then try again. If your browser or corporate policy still blocks the bundle, use a localhost text backend in Settings or switch back to auto / prefer_local.`;
    }
    return `Local-only mode is enabled, but the browser runtime bundle could not be loaded (${detail}). Reload the page and try again. If the browser keeps blocking the local bundle loader, configure a localhost text backend in Settings or switch back to auto / prefer_local.`;
  }
  if (detail.includes("runtime_asset_fetch_failed:429")) {
    return "Local-only mode is enabled, but the browser runtime asset download is currently rate-limited. Wait a moment and try again, or configure a localhost text backend in Settings.";
  }
  if (
    detail.includes("requestDevice") ||
    detail.includes("webgpu") ||
    detail.includes("browser_runtime")
  ) {
    return `Local-only mode is enabled, but the browser local runtime failed to start (${detail}). Try another local profile, a localhost text backend, or switch back to auto / prefer_local.`;
  }
  if (error.code === "tauri_local_text_runtime_failed") {
    return `Local-only mode is enabled, but the desktop local runtime failed (${detail || "unknown error"}). Verify or repair the model in Settings > Local AI, or switch back to auto / prefer_local.`;
  }
  return `Local-only mode is enabled, but the local text runtime failed (${detail || error.code}). Prepare a compatible model, configure a localhost text backend, or switch back to auto / prefer_local.`;
}

/**
 * Parse LLM error response and extract user-friendly message
 * Backend returns: { error: { message, userMessage, errorType, suggestedAction, provider } }
 */
function parseErrorResponse(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText);
    const error = parsed?.error;
    if (error?.userMessage) {
      // Use the backend's user-friendly message
      return error.userMessage;
    }
    if (error?.message) {
      return error.message;
    }
    // Fallback: return the raw text without JSON wrapper
    return errorText;
  } catch {
    // Not JSON, check for common error patterns
    const lowerText = errorText.toLowerCase();

    if (
      lowerText.includes("rate_limit") ||
      lowerText.includes("too_many_requests") ||
      lowerText.includes("1302")
    ) {
      return "The service is handling many requests. Please wait a moment and try again.";
    }
    if (lowerText.includes("overload") || lowerText.includes("deadline")) {
      return "The service is currently overloaded. Try using a different model or provider.";
    }
    if (lowerText.includes("invalid") && lowerText.includes("model")) {
      return "This model may be temporarily unavailable. Please try a different model.";
    }
    if (lowerText.includes("unauthorized") || lowerText.includes("api key")) {
      return "Authentication failed. Please contact support.";
    }

    // Return original text for unknown errors
    return errorText;
  }
}

const skillIconMap: Record<string, React.ElementType> = {
  "image-generation": Wand2,
  "video-generation": Video,
  "audio-generation": Music,
  "code-assistant": Code2,
  "document-analysis": FileText,
  "web-search": Search,
  "prompt-enhancement": Sparkles,
};

type MediaModelOption = {
  id: string;
  type: "image" | "video" | "audio";
  name: string;
  description: string | null;
  provider: string;
  creditCost: number;
  supportsAspectRatios: string[] | null;
  supportsSizes: string[] | null;
  supportsDurations: number[] | null;
};

function hasParsedScheduleTiming(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const cronExpression =
    typeof candidate.cronExpression === "string"
      ? candidate.cronExpression.trim()
      : "";
  const scheduledAt =
    typeof candidate.scheduledAt === "string"
      ? candidate.scheduledAt.trim()
      : "";
  return cronExpression.length > 0 || scheduledAt.length > 0;
}

function looksLikeScheduleIntent(text: string): boolean {
  return /(?:ทุกวัน|ทุก\s*(?:วัน(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)?|สัปดาห์|เดือน)|ตี\s*\d|ตอน(?:เช้า|บ่าย|เย็น|ดึก|เที่ยง|เช้ามืด)|ทุก\s*\d+\s*(?:นาที|ชั่วโมง)|เตือน(?:ฉัน)?|แจ้ง(?:ฉัน)?|schedule|scheduled|cron|remind(?:er| me)?|every\s+(?:day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|night)|daily|weekly|monthly|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i.test(
    text
  );
}

function getOcrRoutingShortLabel(providerLabel: string): "Typhoon" | "Google AI" | "LandingAI" | "Native" {
  const normalized = providerLabel.toLowerCase();
  if (normalized.includes("typhoon")) {
    return "Typhoon";
  }
  if (normalized.includes("google")) {
    return "Google AI";
  }
  if (normalized.includes("landingai")) {
    return "LandingAI";
  }
  return "Native";
}

const TYPHOON_OCR_RATE_LIMIT_PER_MINUTE = 20;

function toMediaModelOption(value: unknown): MediaModelOption | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;

  const type = candidate.type;
  if (type !== "image" && type !== "video" && type !== "audio") {
    return null;
  }
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.provider !== "string" ||
    typeof candidate.creditCost !== "number"
  ) {
    return null;
  }

  const normalizeStringArray = (raw: unknown): string[] | null =>
    Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === "string")
      : null;
  const normalizeNumberArray = (raw: unknown): number[] | null =>
    Array.isArray(raw)
      ? raw.filter((v): v is number => typeof v === "number")
      : null;

  return {
    id: candidate.id,
    type,
    name: candidate.name,
    description:
      typeof candidate.description === "string" ? candidate.description : null,
    provider: candidate.provider,
    creditCost: candidate.creditCost,
    supportsAspectRatios: normalizeStringArray(candidate.supportsAspectRatios),
    supportsSizes: normalizeStringArray(candidate.supportsSizes),
    supportsDurations: normalizeNumberArray(candidate.supportsDurations),
  };
}

type MessageRole = "user" | "assistant" | "system";

interface Message {
  id: number;
  role: MessageRole;
  content: string;
  attachments?: Array<{
    type: string;
    url: string;
    name?: string;
  }>;
  artifacts?: Array<{
    id: string;
    type: string;
    title?: string;
    content: string | string[];
    language?: string;
    metadata?: Record<string, unknown>;
  }>;
  inputTokens?: number;
  outputTokens?: number;
  creditsUsed?: string;
  modelUsed?: string;
  skillUsed?: string;
  skillArgs?: { brainstormRound?: number; brainstormRole?: string };
  runtimeMetadata?: MessageRuntimeMetadata | null;
  createdAt: Date;
}

interface Attachment {
  key: string;
  url: string;
  fileType: string;
  fileName: string;
}

interface ChatViewProps {
  conversationId: number | null;
  onTitleUpdate?: (title: string) => void;
  browserSessionSuggestion?: BrowserSessionLaunchSuggestion | null;
  showBrowserSessionEntry?: boolean;
  onStartBrowserSession?: () => void;
  browserSessionEntryPending?: boolean;
  onUserMessageSent?: (message: string) => void;
  onConfirmBrowserSessionSuggestion?: (
    suggestion: BrowserSessionLaunchSuggestion
  ) => void;
  onDismissBrowserSessionSuggestion?: (suggestionId: string) => void;
  onRunAgency?: () => void;
  onOpenFinancePanel?: () => void;
}

type LibraryRecentDaysFilter = "all" | 1 | 3 | 7 | 15 | 30;

export function ChatView({
  conversationId,
  onTitleUpdate,
  browserSessionSuggestion,
  showBrowserSessionEntry = false,
  onStartBrowserSession,
  browserSessionEntryPending = false,
  onUserMessageSent,
  onConfirmBrowserSessionSuggestion,
  onDismissBrowserSessionSuggestion,
  onOpenFinancePanel,
}: ChatViewProps) {
  const [, navigate] = useLocation();
  const { t } = useScopedTranslation("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [debouncedLibrarySearchQuery, setDebouncedLibrarySearchQuery] =
    useState("");
  const [librarySearchRecentDays, setLibrarySearchRecentDays] =
    useState<LibraryRecentDaysFilter>(7);
  const [selectedLibrarySources, setSelectedLibrarySources] = useState<
    ChatLibraryAttachPayload[]
  >([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [activeLocalReplyKind, setActiveLocalReplyKind] = useState<
    "browser" | "tauri" | null
  >(null);
  const [pendingVoiceAction, setPendingVoiceAction] =
    useState<ClientVoiceCommandResult | null>(null);
  const [handsFreeListening, setHandsFreeListening] = useState(false);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [ocrOnlyMode, setOcrOnlyMode] = useState(false);
  const [workStartDismissed, setWorkStartDismissed] = useState(false);
  const [workStartPosition, setWorkStartPosition] = useState<WorkStartCardPosition>({ x: 0, y: 0 });
  const [isWorkStartDragging, setIsWorkStartDragging] = useState(false);
  // Track when we last added a local message to prevent useEffect from overwriting
  const lastLocalAddTime = useRef<number>(0);
  const lastLocalAddConversationId = useRef<number | null>(conversationId);
  const voiceAutoFallbackNoticeShown = useRef(false);
  const voiceLocalRuntimeFallbackNoticeShown = useRef(false);
  const activeLocalReplyAbortControllerRef = useRef<AbortController | null>(
    null
  );
  const handsFreeAwaitingCommandUntilRef = useRef<number>(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const workStartDragStateRef = useRef<WorkStartDragState | null>(null);
  const workStartStorageKey = useMemo(() => {
    const tenantId = user?.currentTenantId != null ? String(user.currentTenantId) : "unknown";
    const userId = user?.id != null ? String(user.id) : "anonymous";
    return `smartspec_chat_workstart_hidden:${tenantId}:${userId}`;
  }, [user?.currentTenantId, user?.id]);
  const workStartPositionStorageKey = useMemo(() => {
    const tenantId = user?.currentTenantId != null ? String(user.currentTenantId) : "unknown";
    const userId = user?.id != null ? String(user.id) : "anonymous";
    return `smartspec_chat_workstart_position:${tenantId}:${userId}`;
  }, [user?.currentTenantId, user?.id]);
  const ocrOnlyModeStorageKey = useMemo(() => {
    const tenantId = user?.currentTenantId != null ? String(user.currentTenantId) : "unknown";
    const userId = user?.id != null ? String(user.id) : "anonymous";
    return `smartspec_chat_ocr_only_mode:${tenantId}:${userId}`;
  }, [user?.currentTenantId, user?.id]);

  useEffect(() => {
    return () => {
      activeLocalReplyAbortControllerRef.current?.abort();
      activeLocalReplyAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(workStartStorageKey);
    setWorkStartDismissed(stored === "1");
  }, [workStartStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(workStartStorageKey, workStartDismissed ? "1" : "0");
  }, [workStartDismissed, workStartStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(workStartPositionStorageKey);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored) as Partial<WorkStartCardPosition>;
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        setWorkStartPosition({ x: parsed.x, y: parsed.y });
      }
    } catch {
      // Ignore malformed storage and keep the default position.
    }
  }, [workStartPositionStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(workStartPositionStorageKey, JSON.stringify(workStartPosition));
    } catch {
      // Ignore storage failures.
    }
  }, [workStartPosition, workStartPositionStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(ocrOnlyModeStorageKey);
    setOcrOnlyMode(stored === "1");
  }, [ocrOnlyModeStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(ocrOnlyModeStorageKey, ocrOnlyMode ? "1" : "0");
  }, [ocrOnlyMode, ocrOnlyModeStorageKey]);

  useEffect(() => {
    if (!isWorkStartDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = workStartDragStateRef.current;
      if (!dragState) {
        return;
      }
      setWorkStartPosition({
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      });
    };

    const handleMouseUp = () => {
      workStartDragStateRef.current = null;
      setIsWorkStartDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isWorkStartDragging]);

  const handleWorkStartDragStart = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      workStartDragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: workStartPosition.x,
        originY: workStartPosition.y,
      };
      setIsWorkStartDragging(true);
      event.preventDefault();
    },
    [workStartPosition.x, workStartPosition.y],
  );

  const utils = trpc.useUtils();
  const librarySourcePickerEnabled = isChatLibrarySourcePickerEnabled(
    import.meta.env.VITE_LIBRARY_CHAT_SOURCE_PICKER_ENABLED
  );

  // Fetch conversation details
  const { data: conversation } = trpc.chat.getConversation.useQuery(
    { id: conversationId! },
    { enabled: !!conversationId }
  );
  const conversationProjectId = (conversation as any)?.projectId ?? null;
  const isPersonalConversation = conversationProjectId === "personal";
  const handleOpenBrowserSession = useCallback(
    (artifact: BrowserSessionArtifact) => {
      const path = buildBrowserSessionPath(
        artifact.sessionId,
        artifact.launchContext ?? {
          originSurface: "chat",
          originLabel: "Chat",
          sourceId: conversationId ? String(conversationId) : undefined,
          returnContext: conversationId
            ? {
                path: `/chat?c=${conversationId}&browserSessionId=${encodeURIComponent(artifact.sessionId)}`,
                label: "Return to Chat",
              }
            : undefined,
        }
      );
      window.location.href = path;
    },
    [conversationId]
  );

  const markLocalAdd = useCallback(
    (targetConversationId: number | null | undefined = conversationId) => {
      lastLocalAddTime.current = Date.now();
      lastLocalAddConversationId.current = targetConversationId ?? null;
    },
    [conversationId]
  );

  const cancelActiveLocalReply = useCallback(() => {
    const controller = activeLocalReplyAbortControllerRef.current;
    if (!controller) {
      return;
    }
    controller.abort();
    activeLocalReplyAbortControllerRef.current = null;
    setActiveLocalReplyKind(null);
    setStreamingContent("");
    setIsStreaming(false);
    toast.info("Local reply cancelled");
  }, []);

  useEffect(() => {
    activeLocalReplyAbortControllerRef.current?.abort();
    activeLocalReplyAbortControllerRef.current = null;
    lastLocalAddTime.current = 0;
    lastLocalAddConversationId.current = null;
    setMessages([]);
    setStreamingContent("");
    setIsStreaming(false);
    setActiveLocalReplyKind(null);
  }, [conversationId]);

  // Fetch messages
  const { data: messagesData, isLoading: loadingMessages } =
    trpc.chat.getMessages.useQuery(
      { conversationId: conversationId!, limit: 100 },
      { enabled: !!conversationId }
    );
  const chatAutoModelSelectionEnabled = useTenantFeatureFlag(
    "chatAutoModelSelection"
  );
  const localClientLlmModeEnabled = useTenantFeatureFlag("localClientLlmMode");
  const localAiRuntimePlatform =
    typeof window !== "undefined" && (window as any).__TAURI__ != null
      ? "tauri"
      : "web";

  // Get credits balance
  const { data: credits } = trpc.credits.balance.useQuery();
  const localAiPreferencesQuery = trpc.users.getPreferences.useQuery();
  const localAiCatalogQuery = trpc.localAi.getPolicyAndCatalog.useQuery(
    { platform: localAiRuntimePlatform },
    { enabled: localClientLlmModeEnabled }
  );
  const { data: documentOcrPreview } = trpc.localAi.getDocumentOcrPreview.useQuery(
    undefined,
    { enabled: !!user },
  );
  const analyzeAttachmentAssistMutation =
    trpc.localAi.analyzeAttachmentAssist.useMutation();

  // Load the model catalog only when the user actually opens the selector.
  // This keeps the chat shell resilient if the catalog endpoint is unhealthy.
  const { data: modelsData, isLoading: modelsLoading, error: modelsError, refetch: refetchModels } =
    trpc.llmProviders.availableModels.useQuery(undefined, {
      enabled: modelDialogOpen,
      retry: false,
      staleTime: 300_000,
    });

  // Get media generation models (image/video/audio)
  const { data: allMediaModelsData } = trpc.media.getModels.useQuery(
    undefined,
    { staleTime: 300_000 }
  );

  // Get multi-provider models (with provider info, pricing, FREE badges)
  const { data: multiProviderModels } =
    trpc.multiProvider.getAvailableModelsWithProviders.useQuery(undefined, {
      staleTime: 60_000,
    });
  const {
    data: librarySearchData,
    isLoading: isLibrarySearchLoading,
    error: librarySearchError,
  } = trpc.library.search.useQuery(
    {
      query: debouncedLibrarySearchQuery || undefined,
      limit: 50,
      filters:
        librarySearchRecentDays === "all"
          ? undefined
          : { recentDays: librarySearchRecentDays },
    },
    {
      enabled:
        librarySourcePickerEnabled &&
        libraryPickerOpen &&
        (debouncedLibrarySearchQuery.trim().length > 0 ||
          librarySearchRecentDays !== "all"),
    }
  );
  const attachableLibrarySources = useMemo(
    () =>
      toAttachableLibrarySources(
        (librarySearchData?.results || []) as ChatLibrarySearchResultLike[]
      ),
    [librarySearchData?.results]
  );

  const conversationModelSelection = useMemo(
    () =>
      ((conversation as any)?.modelSelection ??
        (conversation?.skillSettings as any)?.llmSelection ??
        null) as StoredChatModelSelectionState | null,
    [conversation]
  );
  const localAiPreferencesData = (
    localAiPreferencesQuery.data as { localAi?: unknown } | undefined
  )?.localAi;
  const localAiPreferences = useMemo(
    () => resolveLocalAiSyncedPreferences(localAiPreferencesData),
    [localAiPreferencesData]
  );
  const conversationSkillSettings = useMemo(
    () => readClientConversationSkillSettings(conversation?.skillSettings),
    [conversation?.skillSettings],
  );
  const conversationLocalAiOverride =
    conversationSkillSettings.localAiConversation ?? null;
  const conversationForcesLocalOnly =
    conversationLocalAiOverride?.disableForConversation !== true &&
    conversationLocalAiOverride?.mode === "local_only";
  const effectiveLocalAiPreferences = useMemo(
    () => {
      const merged = applyConversationLocalAiOverride(
        localAiPreferences,
        conversationLocalAiOverride,
      );
      return {
        ...merged,
        useForGeneralChat:
          merged.useForGeneralChat || conversationForcesLocalOnly,
      };
    },
    [conversationForcesLocalOnly, conversationLocalAiOverride, localAiPreferences],
  );

  const attachmentOcrBadges = useMemo(() => {
    if (!documentOcrPreview || attachments.length === 0) {
      return [] as Array<{
        key: string;
        shortLabel: string;
        detailLabel: string;
        className: string;
      }>;
    }

    const hasImageAttachments = attachments.some((attachment) =>
      attachment.fileType.toLowerCase().startsWith("image/"),
    );
    const hasPdfAttachments = attachments.some((attachment) =>
      attachment.fileType.toLowerCase() === "application/pdf",
    );
    const badges: Array<{
      key: string;
      shortLabel: string;
      detailLabel: string;
      className: string;
    }> = [];

    if (hasImageAttachments) {
      badges.push({
        key: "image",
        shortLabel: getOcrRoutingShortLabel(documentOcrPreview.image.providerLabel),
        detailLabel: `Image OCR · ${documentOcrPreview.image.providerLabel}`,
        className: documentOcrPreview.image.ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
      });
    }

    if (hasPdfAttachments) {
      badges.push({
        key: "pdf",
        shortLabel: getOcrRoutingShortLabel(documentOcrPreview.pdf.providerLabel),
        detailLabel: `PDF OCR · ${documentOcrPreview.pdf.providerLabel}`,
        className: documentOcrPreview.pdf.ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
      });
    }

    return badges;
  }, [attachments, documentOcrPreview]);
  const attachmentOcrRateLimitNote = attachmentOcrBadges.some(
    (badge) => badge.shortLabel === "Typhoon",
  )
    ? `Typhoon OCR is capped at ${TYPHOON_OCR_RATE_LIMIT_PER_MINUTE} requests per minute across the system.`
    : null;
  const localAiCapability = useLocalAiCapability({
    catalog: localAiCatalogQuery.data?.catalog ?? [],
  });
  const tauriRuntimeStatus = useTauriLocalSkillRuntimeStatus();
  const localAiForceCloudOnly =
    localAiCatalogQuery.data?.policy.forceCloudOnly === true;
  const explicitSessionRuntimeMode = useMemo<
    "account_default" | "local_only" | "cloud_only"
  >(() => {
    if (conversationLocalAiOverride?.disableForConversation) {
      return "cloud_only";
    }
    if (conversationLocalAiOverride?.mode === "local_only") {
      return "local_only";
    }
    if (conversationLocalAiOverride?.mode === "cloud_only") {
      return "cloud_only";
    }
    return "account_default";
  }, [conversationLocalAiOverride]);
  const effectiveChatSessionLocalAiMode = useMemo(
    () => resolveExplicitChatSessionLocalAiMode(conversationLocalAiOverride),
    [conversationLocalAiOverride],
  );
  const sessionUsesExplicitLocalAi =
    effectiveChatSessionLocalAiMode === "local_only" &&
    localClientLlmModeEnabled &&
    localAiPreferences.enabled &&
    !localAiForceCloudOnly;
  const chatSessionLocalAiPreferences = useMemo(
    () => ({
      ...effectiveLocalAiPreferences,
      enabled: sessionUsesExplicitLocalAi,
      mode: effectiveChatSessionLocalAiMode as typeof effectiveLocalAiPreferences.mode,
      useForGeneralChat: sessionUsesExplicitLocalAi,
    }),
    [
      effectiveChatSessionLocalAiMode,
      effectiveLocalAiPreferences,
      sessionUsesExplicitLocalAi,
    ],
  );
  const sessionLocalOnlyEnabled = sessionUsesExplicitLocalAi;
  const localAiDeviceScope = useMemo<LocalAiDeviceStateScope | null>(() => {
    if (!user) {
      return null;
    }
    return {
      tenantId: user.currentTenantId ?? null,
      userId: user.id,
      runtimeNamespace: localAiRuntimePlatform,
    };
  }, [localAiRuntimePlatform, user]);
  const [localAiDeviceStateNonce, setLocalAiDeviceStateNonce] = useState(0);
  useEffect(() => {
    if (!localAiDeviceScope || typeof window === "undefined") {
      return;
    }

    const handleLocalAiDeviceStateUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        scope?: LocalAiDeviceStateScope;
      }>).detail;
      const eventScope = detail?.scope;
      if (!eventScope) {
        setLocalAiDeviceStateNonce((current) => current + 1);
        return;
      }
      if (
        eventScope.runtimeNamespace === localAiDeviceScope.runtimeNamespace &&
        (eventScope.tenantId ?? null) === (localAiDeviceScope.tenantId ?? null) &&
        (eventScope.userId ?? null) === (localAiDeviceScope.userId ?? null)
      ) {
        setLocalAiDeviceStateNonce((current) => current + 1);
      }
    };

    window.addEventListener(
      LOCAL_AI_DEVICE_STATE_UPDATED_EVENT,
      handleLocalAiDeviceStateUpdated as EventListener,
    );
    return () => {
      window.removeEventListener(
        LOCAL_AI_DEVICE_STATE_UPDATED_EVENT,
        handleLocalAiDeviceStateUpdated as EventListener,
      );
    };
  }, [localAiDeviceScope]);
  const localAiDeviceState = useMemo(
    () =>
      localAiDeviceScope ? readLocalAiDeviceState(localAiDeviceScope) : null,
    [localAiDeviceScope, localAiDeviceStateNonce],
  );
  const configuredExternalLocalTextBackend = useMemo(
    () =>
      localAiDeviceScope
        ? readConfiguredExternalLocalTextBackend(localAiDeviceScope)
        : null,
    [localAiDeviceScope, localAiDeviceStateNonce, localAiDeviceState?.externalTextBackend],
  );
  const externalLocalTextBackendReason = useMemo(
    () =>
      localAiDeviceScope
        ? readConfiguredExternalLocalTextBackendReason(localAiDeviceScope)
        : resolveExternalLocalTextBackendReason(
            localAiDeviceState?.externalTextBackend,
          ),
    [localAiDeviceScope, localAiDeviceState?.externalTextBackend, localAiDeviceStateNonce],
  );
  const browserReadyOnDeviceProfileIds = useMemo(() => {
    if (localAiRuntimePlatform !== "web") {
      return [] as string[];
    }
    const installedProfileIdSet = new Set(
      localAiDeviceState?.installedModelIds ?? [],
    );
    const eligibleProfileIdSet =
      localAiCapability.eligibleProfiles.length > 0
        ? new Set(localAiCapability.eligibleProfiles)
        : null;
    return (localAiCatalogQuery.data?.catalog ?? [])
      .filter((entry) => {
        if (
          entry.status !== "allowed" ||
          !entry.supportedPlatforms.includes("web") ||
          !installedProfileIdSet.has(entry.id)
        ) {
          return false;
        }
        if (!eligibleProfileIdSet) {
          return true;
        }
        return eligibleProfileIdSet.has(entry.id);
      })
      .map((entry) => entry.id);
  }, [
    localAiCapability.eligibleProfiles,
    localAiCatalogQuery.data?.catalog,
    localAiDeviceState?.installedModelIds,
    localAiRuntimePlatform,
  ]);
  const tauriReadyOnDeviceProfileIds = useMemo(() => {
    if (localAiRuntimePlatform !== "tauri") {
      return [] as string[];
    }
    if (!tauriRuntimeStatus.supportsGemma4Text) {
      return [] as string[];
    }
    const installedProfileIdSet = new Set(
      tauriRuntimeStatus.installedGemmaProfileIds ?? [],
    );
    return (localAiCatalogQuery.data?.catalog ?? [])
      .filter(
        (entry) =>
          entry.status === "allowed" &&
          entry.supportedPlatforms.includes("tauri") &&
          installedProfileIdSet.has(entry.id),
      )
      .map((entry) => entry.id);
  }, [
    localAiCatalogQuery.data?.catalog,
    localAiRuntimePlatform,
    tauriRuntimeStatus.installedGemmaProfileIds,
    tauriRuntimeStatus.supportsGemma4Text,
  ]);
  const chatLocalRuntimeReadiness = useMemo(
    () =>
      resolveChatLocalRuntimeReadiness({
        localAiEnabled: localAiPreferences.enabled,
        forceCloudOnly: localAiForceCloudOnly,
        runtimePlatform: localAiRuntimePlatform,
        enginePreference:
          localAiDeviceState?.localEnginePreference ?? "auto",
        hasPreparedOnDeviceRuntime:
          localAiRuntimePlatform === "tauri"
            ? tauriReadyOnDeviceProfileIds.length > 0
            : browserReadyOnDeviceProfileIds.length > 0,
        hasConfiguredLocalhostBackend:
          configuredExternalLocalTextBackend != null,
        localhostBackendReason: externalLocalTextBackendReason,
        localhostBackendDisplay: configuredExternalLocalTextBackend
          ? `${configuredExternalLocalTextBackend.baseUrl} · ${configuredExternalLocalTextBackend.model}`
          : null,
      }),
    [
      browserReadyOnDeviceProfileIds.length,
      configuredExternalLocalTextBackend,
      externalLocalTextBackendReason,
      localAiDeviceState?.localEnginePreference,
      localAiForceCloudOnly,
      localAiPreferences.enabled,
      localAiRuntimePlatform,
      tauriReadyOnDeviceProfileIds.length,
    ],
  );
  const sessionLocalOnlySelectionDisabledReason = useMemo(() => {
    if (localAiForceCloudOnly) {
      return "This workspace is currently locked to cloud execution.";
    }
    if (!localAiPreferences.enabled) {
      return "Enable Local AI in Settings > Local AI before forcing this chat to local.";
    }
    if (!chatLocalRuntimeReadiness.canUseLocalForChat) {
      return (
        chatLocalRuntimeReadiness.reason ?? chatLocalRuntimeReadiness.summary
      );
    }
    return null;
  }, [
    chatLocalRuntimeReadiness.canUseLocalForChat,
    chatLocalRuntimeReadiness.reason,
    chatLocalRuntimeReadiness.summary,
    localAiForceCloudOnly,
    localAiPreferences.enabled,
  ]);
  const sessionRuntimeButtonLabel = useMemo(() => {
    if (explicitSessionRuntimeMode === "local_only") {
      return "Chat Local AI";
    }
    if (explicitSessionRuntimeMode === "cloud_only") {
      return "Chat Cloud";
    }
    return "Chat Default";
  }, [explicitSessionRuntimeMode]);
  const sessionRuntimeSummary = useMemo(() => {
    if (localAiForceCloudOnly) {
      return "This workspace is locked to cloud execution.";
    }
    if (explicitSessionRuntimeMode === "local_only") {
      if (sessionLocalOnlySelectionDisabledReason) {
        return sessionLocalOnlySelectionDisabledReason;
      }
      return `This chat session is pinned to Local AI. ${chatLocalRuntimeReadiness.summary}`;
    }
    if (explicitSessionRuntimeMode === "cloud_only") {
      return "This chat session is pinned to the cloud/API path.";
    }
    return "This chat stays on the cloud/API path unless you explicitly switch this conversation to Local AI.";
  }, [
    chatLocalRuntimeReadiness.summary,
    explicitSessionRuntimeMode,
    localAiForceCloudOnly,
    sessionLocalOnlySelectionDisabledReason,
  ]);
  const preferredVoiceInputMode =
    localClientLlmModeEnabled &&
    effectiveLocalAiPreferences.enabled &&
    !localAiForceCloudOnly
      ? effectiveLocalAiPreferences.voiceInputMode
      : "legacy_stt";
  const localVoiceAvailability = useMemo(
    () =>
      getLocalVoiceRuntimeAvailability({
        platform: localAiRuntimePlatform,
        catalog: localAiCatalogQuery.data?.catalog ?? [],
        capability: localAiCapability,
        deviceScope: localAiDeviceScope,
        tauriRuntimeStatus,
      }),
    [
      localAiCapability,
      localAiCatalogQuery.data?.catalog,
      localAiRuntimePlatform,
      localAiDeviceScope,
      tauriRuntimeStatus,
    ]
  );
  const chatMicProvider = useMemo(
    () =>
      resolveChatMicProvider({
        preferredMode: preferredVoiceInputMode,
        localVoiceSupported: localVoiceAvailability.ready,
      }),
    [localVoiceAvailability.ready, preferredVoiceInputMode]
  );
  const handsFreeFeatureReady =
    localAiRuntimePlatform === "tauri" &&
    localClientLlmModeEnabled &&
    localAiPreferences.enabled &&
    localAiPreferences.handsFreeMode === "wake_phrase" &&
    chatMicProvider.effectiveMode === "gemma4_local" &&
    localVoiceAvailability.ready;

  // Current selected model (use conversation model, localStorage fallback, or first available)
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem("smartspec_lastModel") || ""
  );
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(
    null
  );

  // Media model selection for image/video generation in the detection bar
  const [selectedMediaModel, setSelectedMediaModel] = useState<string>("");
  const [mediaModelSearch, setMediaModelSearch] = useState<string>("");
  const [mediaModelOpen, setMediaModelOpen] = useState(false);

  // Fallback consent state (for handling free→paid tier transitions)
  interface FallbackRequestData {
    from: { providerName: string; modelName: string };
    to: { providerName: string; modelName: string; providerId: number };
    estimatedCredits: number;
    originalMessages: Array<{ role: string; content: string }>;
  }
  const [fallbackRequest, setFallbackRequest] =
    useState<FallbackRequestData | null>(null);
  const enabledModelIds = useMemo(
    () => (modelsData?.models ?? []).map(model => model.id),
    [modelsData?.models]
  );
  const defaultEnabledModelId = useMemo(() => {
    const defaultModel = modelsData?.models?.find(model => model.isDefault);
    return defaultModel?.id || modelsData?.models?.[0]?.id || "";
  }, [modelsData?.models]);

  // Sync selected model with the conversation only when the stored model is still enabled.
  useEffect(() => {
    if (
      !modelsData?.models ||
      !conversationId ||
      enabledModelIds.length === 0
    ) {
      return;
    }

    const preferredSelectionValue = selectionToPickerValue(
      conversationModelSelection,
      conversation?.model ?? undefined
    );
    if (
      !chatAutoModelSelectionEnabled &&
      (preferredSelectionValue === AUTO_MODEL ||
        isAutoProviderValue(preferredSelectionValue))
    ) {
      const fallbackModelId = pickEnabledModelId({
        preferredId:
          conversationModelSelection?.lastResolvedModelId ??
          conversation?.model ??
          undefined,
        allowedIds: enabledModelIds,
        fallbackIds: [defaultEnabledModelId],
      });
      if (fallbackModelId && fallbackModelId !== selectedModel) {
        setSelectedModel(fallbackModelId);
      }
      setSelectedProviderId(
        conversationModelSelection?.lastResolvedProviderId ?? null
      );
      return;
    }

    if (
      preferredSelectionValue === AUTO_MODEL ||
      isAutoProviderValue(preferredSelectionValue)
    ) {
      if (preferredSelectionValue !== selectedModel) {
        setSelectedModel(preferredSelectionValue);
      }
      if (
        conversationModelSelection?.mode === "auto-provider" &&
        conversationModelSelection.providerId
      ) {
        setSelectedProviderId(conversationModelSelection.providerId);
      }
      return;
    }

    if (conversationModelSelection?.mode === "explicit") {
      setSelectedProviderId(conversationModelSelection.providerId ?? null);
    }

    const nextModelId = pickEnabledModelId({
      preferredId: preferredSelectionValue,
      allowedIds: enabledModelIds,
      fallbackIds: [defaultEnabledModelId],
    });

    if (nextModelId && nextModelId !== selectedModel) {
      setSelectedModel(nextModelId);
    }
  }, [
    chatAutoModelSelectionEnabled,
    conversationId,
    conversation?.model,
    conversationModelSelection,
    defaultEnabledModelId,
    enabledModelIds,
    modelsData?.models,
    selectedModel,
  ]);

  // Sanitize stale localStorage state when the enabled model catalog changes.
  useEffect(() => {
    if (!modelsData?.models) {
      return;
    }

    if (enabledModelIds.length === 0) {
      if (
        selectedModel &&
        selectedModel !== AUTO_MODEL &&
        !isAutoProviderValue(selectedModel)
      ) {
        setSelectedModel("");
        localStorage.removeItem("smartspec_lastModel");
      }
      return;
    }

    if (
      (selectedModel === AUTO_MODEL || isAutoProviderValue(selectedModel)) &&
      chatAutoModelSelectionEnabled
    ) {
      return;
    }

    const nextModelId = pickEnabledModelId({
      preferredId: selectedModel,
      allowedIds: enabledModelIds,
      fallbackIds: [conversation?.model, defaultEnabledModelId],
    });

    if (nextModelId !== selectedModel) {
      setSelectedModel(nextModelId);
    }
  }, [
    chatAutoModelSelectionEnabled,
    conversation?.model,
    defaultEnabledModelId,
    enabledModelIds,
    modelsData?.models,
    selectedModel,
  ]);

  // Persist selected model to localStorage
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem("smartspec_lastModel", selectedModel);
      return;
    }

    localStorage.removeItem("smartspec_lastModel");
  }, [selectedModel]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedLibrarySearchQuery(librarySearchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [librarySearchQuery]);

  // Mutations
  const uploadMutation = trpc.ai.upload.useMutation();
  const sendMessageMutation = trpc.chat.sendMessage.useMutation();
  const updateConversationMutation = trpc.chat.updateConversation.useMutation();
  const sessionRuntimeControlDisabled =
    isStreaming || updateConversationMutation.isPending || !!fallbackRequest;
  // saveAssistantMessage for non-streaming flows (presentation, scheduling, etc.)
  const saveAssistantMessageMutation =
    trpc.chat.saveAssistantMessage.useMutation();
  const processMemoryMutation = trpc.memory.processMemory.useMutation();
  const markAllNotificationsReadMutation =
    trpc.scheduledMessages.markAllRead.useMutation({
      onSuccess: async () => {
        await Promise.all([
          utils.scheduledMessages.getNotificationCount.invalidate(),
          utils.scheduledMessages.getNotifications.invalidate(),
        ]);
      },
    });
  const detectSkillMutation = trpc.chat.detectSkill.useMutation();
  const analyzeIntentMutation = trpc.chat.analyzeIntent.useMutation();
  const addSkillCreditsMutation =
    trpc.chat.addSkillCreditsToConversation.useMutation();
  const enhancePromptMutation = trpc.skills.enhancePrompt.useMutation();

  // Memory auto-save state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [suggestedMemory, setSuggestedMemory] =
    useState<SaveMemoryInitialData | null>(null);
  const autoSaveCooldownRef = useRef(0); // message count since last suggestion
  const submitVoiceCommandRef = useRef<(text: string) => Promise<void>>(
    async () => undefined
  );

  // Auto Prompt state
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);

  // Translation state
  const [translatedMessages, setTranslatedMessages] = useState<
    Record<number, string>
  >({});
  const [translatingMsgId, setTranslatingMsgId] = useState<number | null>(null);
  const translateMutation = trpc.translation.translate.useMutation({
    onSuccess: (data, variables) => {
      // variables won't have msgId, use translatingMsgId from closure
      setTranslatedMessages(prev => ({
        ...prev,
        [translatingMsgId!]: data.translatedText,
      }));
      setTranslatingMsgId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Translation failed");
      setTranslatingMsgId(null);
    },
  });

  const appendTranscriptionToComposer = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setInput(prev => (prev ? `${prev} ${trimmed}` : trimmed));
  }, []);

  const speakVoiceReadback = useCallback(
    async (
      text: string,
      priority: LocalVoiceReadbackPriority = "important",
      source: "general" | "voice_command" = "general"
    ) => {
      if (
        !localClientLlmModeEnabled ||
        !localAiPreferences.enabled ||
        localAiPreferences.voiceReadbackMode === "off"
      ) {
        return;
      }
      if (
        localAiPreferences.voiceReadbackOnlyForVoiceCommands &&
        source !== "voice_command"
      ) {
        return;
      }
      await speakLocalVoiceReadback({
        text,
        mode: localAiPreferences.voiceReadbackMode,
        priority,
        lang: localAiPreferences.voiceReadbackLanguage ?? undefined,
        rate: localAiPreferences.voiceReadbackRate,
      }).catch(() => undefined);
    },
    [
      localAiPreferences.enabled,
      localAiPreferences.voiceReadbackLanguage,
      localAiPreferences.voiceReadbackMode,
      localAiPreferences.voiceReadbackOnlyForVoiceCommands,
      localAiPreferences.voiceReadbackRate,
      localClientLlmModeEnabled,
    ]
  );

  const buildVoiceSearchTextWithLocation = useCallback(
    async (text: string) => {
      if (
        !localAiPreferences.voiceSearchUsesLocation ||
        typeof navigator === "undefined" ||
        !("geolocation" in navigator)
      ) {
        return text;
      }

      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 6_000,
              maximumAge: 5 * 60 * 1000,
            });
          }
        );
        const latitude = position.coords.latitude.toFixed(5);
        const longitude = position.coords.longitude.toFixed(5);
        return `${text}\n\nUser location context: latitude ${latitude}, longitude ${longitude}. Prioritize nearby results around this location.`;
      } catch {
        return text;
      }
    },
    [localAiPreferences.voiceSearchUsesLocation]
  );

  const openSpecificTeamRoomFromVoice = useCallback(
    async (
      command: Extract<ClientVoiceCommandResult, { type: "open_team_room" }>
    ) => {
      const teams = await utils.team.list.fetch();
      if (!Array.isArray(teams) || teams.length === 0) {
        toast.error("No teams are available right now.");
        return false;
      }

      const normalizedTeamQuery = normalizeVoiceLookup(command.teamQuery ?? "");
      const normalizedRoomQuery = normalizeVoiceLookup(command.roomQuery ?? "");

      const candidateTeams = normalizedTeamQuery
        ? teams.filter((team: any) =>
            [team.name, team.description]
              .filter((value): value is string => typeof value === "string")
              .some(value =>
                normalizeVoiceLookup(value).includes(normalizedTeamQuery)
              )
          )
        : teams;

      for (const team of candidateTeams) {
        const rooms = await utils.teamRoom.listByTeam.fetch({
          teamId: team.id,
        });
        const matchedRoom = Array.isArray(rooms)
          ? rooms.find((room: any) =>
              [room.title, room.goalPrompt]
                .filter((value): value is string => typeof value === "string")
                .some(value =>
                  normalizeVoiceLookup(value).includes(normalizedRoomQuery)
                )
            )
          : null;
        if (matchedRoom) {
          navigate(`/teams/${team.id}?roomId=${matchedRoom.id}`);
          toast.success(`Opening ${matchedRoom.title ?? "team room"}`);
          void speakVoiceReadback(
            `Opening ${matchedRoom.title ?? "team room"}.`,
            "important",
            "voice_command"
          );
          return true;
        }
      }

      if (command.teamQuery) {
        const teamOnly = teams.find((team: any) =>
          normalizeVoiceLookup(String(team.name ?? "")).includes(
            normalizedTeamQuery
          )
        );
        if (teamOnly) {
          navigate(`/teams/${teamOnly.id}`);
          toast.success(`Opening ${teamOnly.name}`);
          void speakVoiceReadback(
            `Opening ${teamOnly.name}.`,
            "important",
            "voice_command"
          );
          return true;
        }
      }

      toast.error("I couldn't find that team room.");
      void speakVoiceReadback(
        "I couldn't find that team room.",
        "important",
        "voice_command"
      );
      return false;
    },
    [navigate, speakVoiceReadback, utils.team.list, utils.teamRoom.listByTeam]
  );

  const executeVoiceCommand = useCallback(
    async (routedCommand: ClientVoiceCommandResult) => {
      if (routedCommand.type === "navigate") {
        if (window.location.pathname !== routedCommand.path) {
          navigate(routedCommand.path);
        }
        toast.success(
          `Opening ${routedCommand.path.replace("/", "") || "chat"}`
        );
        void speakVoiceReadback(
          `Opening ${routedCommand.path.replace("/", "") || "chat"}.`,
          "important",
          "voice_command"
        );
        return;
      }

      if (routedCommand.type === "open_team_room") {
        await openSpecificTeamRoomFromVoice(routedCommand);
        return;
      }

      if (routedCommand.type === "read_notifications") {
        void utils.scheduledMessages.getNotificationHistory
          .fetch({
            limit: 10,
            offset: 0,
            readState: routedCommand.unreadOnly ? "unread" : "all",
            priority: routedCommand.urgentOnly ? "high" : undefined,
            showDismissed: false,
          })
          .then(history => {
            const summary = summarizeNotificationsForVoiceReadback(
              history.items ?? []
            );
            toast.success(summary);
            void speakVoiceReadback(summary, "important", "voice_command");
          })
          .catch(error => {
            const message =
              error instanceof Error
                ? error.message
                : "Could not load notifications right now.";
            toast.error(message);
          });
        return;
      }

      if (routedCommand.type === "mark_notifications_read") {
        if (routedCommand.requiresConfirmation) {
          setPendingVoiceAction(routedCommand);
          const prompt = buildVoiceActionConfirmationCopy(routedCommand);
          toast.info(prompt);
          void speakVoiceReadback(prompt, "important", "voice_command");
          return;
        }

        void markAllNotificationsReadMutation
          .mutateAsync()
          .then(() => {
            const confirmation = "Marked your notifications as read.";
            toast.success(confirmation);
            void speakVoiceReadback(confirmation, "important", "voice_command");
          })
          .catch(error => {
            toast.error(error.message);
          });
        return;
      }

      if (routedCommand.type === "draft_message") {
        if (routedCommand.requiresConfirmation) {
          setPendingVoiceAction(routedCommand);
          const prompt = buildVoiceActionConfirmationCopy(routedCommand);
          toast.info(prompt);
          void speakVoiceReadback(prompt, "important", "voice_command");
          return;
        }
        appendTranscriptionToComposer(routedCommand.text);
        toast.success("Drafted the message in the composer.");
        void speakVoiceReadback(
          "Drafted the message in the composer.",
          "response",
          "voice_command"
        );
        return;
      }

      if (routedCommand.type === "submit_chat") {
        if (routedCommand.requiresConfirmation) {
          setPendingVoiceAction(routedCommand);
          const prompt = buildVoiceActionConfirmationCopy(routedCommand);
          toast.info(prompt);
          void speakVoiceReadback(prompt, "important", "voice_command");
          return;
        }

        if (
          isStreaming ||
          !conversationId ||
          attachments.length > 0 ||
          selectedLibrarySources.length > 0
        ) {
          appendTranscriptionToComposer(routedCommand.text);
          void speakVoiceReadback(
            "Added the voice request to the composer because this chat already has active context.",
            "response",
            "voice_command"
          );
          return;
        }

        const resolvedText = routedCommand.useLocation
          ? await buildVoiceSearchTextWithLocation(routedCommand.text)
          : routedCommand.text;
        void speakVoiceReadback(
          "Sending your voice request now.",
          "response",
          "voice_command"
        );
        await submitVoiceCommandRef.current(resolvedText);
        return;
      }
    },
    [
      appendTranscriptionToComposer,
      attachments.length,
      buildVoiceSearchTextWithLocation,
      conversationId,
      isStreaming,
      markAllNotificationsReadMutation,
      navigate,
      openSpecificTeamRoomFromVoice,
      selectedLibrarySources.length,
      speakVoiceReadback,
      utils.scheduledMessages.getNotificationHistory,
    ]
  );

  const handleVoiceTranscription = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      const wakePhrase = normalizeWakePhrase(localAiPreferences.wakePhrase);
      if (handsFreeListening) {
        const normalizedTranscript = normalizeVoiceLookup(trimmed);
        const withinFollowUpWindow =
          handsFreeAwaitingCommandUntilRef.current > Date.now();

        if (wakePhrase && normalizedTranscript.startsWith(wakePhrase)) {
          const stripped = trimmed.slice(wakePhrase.length).trim();
          if (!stripped) {
            handsFreeAwaitingCommandUntilRef.current = Date.now() + 15_000;
            void speakVoiceReadback(
              "I'm listening.",
              "important",
              "voice_command"
            );
            return;
          }
          void executeVoiceCommand(routeVoiceCommand(stripped));
          return;
        }

        if (!withinFollowUpWindow) {
          return;
        }
        handsFreeAwaitingCommandUntilRef.current = 0;
      }

      if (localClientLlmModeEnabled && localAiPreferences.enableVoiceCommands) {
        void executeVoiceCommand(routeVoiceCommand(trimmed));
        return;
      }

      appendTranscriptionToComposer(trimmed);
      void speakVoiceReadback(
        "Added your dictation to the composer.",
        "response"
      );
    },
    [
      appendTranscriptionToComposer,
      localAiPreferences.enableVoiceCommands,
      localAiPreferences.wakePhrase,
      localClientLlmModeEnabled,
      executeVoiceCommand,
      handsFreeListening,
      speakVoiceReadback,
    ]
  );

  const transcribeRecordedAudio = useCallback(
    async (input: {
      audioBase64: string;
      mimeType: string;
      signal: AbortSignal;
    }) => {
      if (chatMicProvider.effectiveMode !== "gemma4_local") {
        return transcribeWithLegacySpeechToText(input);
      }

      try {
        return await transcribeWithLocalVoiceRuntime({
          platform: localAiRuntimePlatform,
          catalog: localAiCatalogQuery.data?.catalog ?? [],
          preferredProfileId: effectiveLocalAiPreferences.defaultModelId,
          audioBase64: input.audioBase64,
          mimeType: input.mimeType,
          signal: input.signal,
          deviceScope: localAiDeviceScope,
          tauriRuntimeStatus,
        });
      } catch (error) {
        if (preferredVoiceInputMode === "auto") {
          if (!voiceLocalRuntimeFallbackNoticeShown.current) {
            voiceLocalRuntimeFallbackNoticeShown.current = true;
            toast.info(
              "Local voice transcription was unavailable for this recording. Falling back to the legacy speech-to-text path."
            );
          }
          return transcribeWithLegacySpeechToText(input);
        }
        throw error;
      }
    },
    [
      chatMicProvider.effectiveMode,
      localAiCatalogQuery.data?.catalog,
      effectiveLocalAiPreferences.defaultModelId,
      localAiDeviceScope,
      localAiRuntimePlatform,
      preferredVoiceInputMode,
      tauriRuntimeStatus,
    ]
  );

  // Push-to-talk
  const { isRecording, isTranscribing, startRecording, stopRecording } =
    usePushToTalk({
      onTranscription: handleVoiceTranscription,
      onError: err => {
        if (handsFreeListening) {
          setHandsFreeListening(false);
          handsFreeAwaitingCommandUntilRef.current = 0;
        }
        toast.error(err);
      },
      transcribe: transcribeRecordedAudio,
      maxRecordingMs:
        chatMicProvider.effectiveMode === "gemma4_local" ? 30_000 : undefined,
    });

  const handleMicPointerDown = useCallback(() => {
    if (chatMicProvider.effectiveMode === "legacy_stt") {
      if (
        chatMicProvider.fallbackApplied &&
        !voiceAutoFallbackNoticeShown.current
      ) {
        voiceAutoFallbackNoticeShown.current = true;
        toast.info(
          "Local voice input is not available on this surface right now. Falling back to the legacy speech-to-text path."
        );
      }
      void startRecording();
      return;
    }

    if (!localVoiceAvailability.ready) {
      toast.error(
        localVoiceAvailability.reason === "tauri_voice_model_not_installed" ||
          localVoiceAvailability.reason === "browser_voice_model_not_installed"
          ? "Prepare a Gemma 4 model in Local AI settings before using local microphone transcription."
          : "Local microphone transcription is not available on this surface yet. Switch Voice input mode to legacy_stt or auto."
      );
      return;
    }

    void startRecording();
  }, [chatMicProvider, localVoiceAvailability, startRecording]);

  const handleMicPointerUp = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
  }, [isRecording, stopRecording]);

  const confirmPendingVoiceAction = useCallback(async () => {
    if (!pendingVoiceAction) {
      return;
    }

    const action = pendingVoiceAction;
    setPendingVoiceAction(null);

    if (action.type === "mark_notifications_read") {
      try {
        await markAllNotificationsReadMutation.mutateAsync();
        const confirmation = "Marked your notifications as read.";
        toast.success(confirmation);
        void speakVoiceReadback(confirmation, "important", "voice_command");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not mark notifications as read."
        );
      }
      return;
    }

    if (action.type === "draft_message") {
      appendTranscriptionToComposer(action.text);
      toast.success("Drafted the message in the composer.");
      void speakVoiceReadback(
        "Drafted the message in the composer.",
        "response",
        "voice_command"
      );
      return;
    }

    if (action.type === "submit_chat") {
      const resolvedText = action.useLocation
        ? await buildVoiceSearchTextWithLocation(action.text)
        : action.text;
      if (
        isStreaming ||
        !conversationId ||
        attachments.length > 0 ||
        selectedLibrarySources.length > 0
      ) {
        appendTranscriptionToComposer(resolvedText);
        void speakVoiceReadback(
          "Added the confirmed voice request to the composer.",
          "response",
          "voice_command"
        );
        return;
      }
      await submitVoiceCommandRef.current(resolvedText);
      void speakVoiceReadback(
        "Sending the confirmed voice request now.",
        "response",
        "voice_command"
      );
    }
  }, [
    appendTranscriptionToComposer,
    attachments.length,
    buildVoiceSearchTextWithLocation,
    conversationId,
    isStreaming,
    markAllNotificationsReadMutation,
    pendingVoiceAction,
    selectedLibrarySources.length,
    speakVoiceReadback,
  ]);

  const cancelPendingVoiceAction = useCallback(() => {
    if (!pendingVoiceAction) {
      return;
    }
    setPendingVoiceAction(null);
    void speakVoiceReadback(
      "Cancelled the pending voice action.",
      "response",
      "voice_command"
    );
  }, [pendingVoiceAction, speakVoiceReadback]);

  useEffect(() => {
    if (!handsFreeFeatureReady && handsFreeListening) {
      setHandsFreeListening(false);
      handsFreeAwaitingCommandUntilRef.current = 0;
    }
  }, [handsFreeFeatureReady, handsFreeListening]);

  useEffect(() => {
    if (
      !handsFreeListening ||
      !handsFreeFeatureReady ||
      isRecording ||
      isTranscribing ||
      isStreaming ||
      !!fallbackRequest
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void startRecording();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    fallbackRequest,
    handsFreeFeatureReady,
    handsFreeListening,
    isRecording,
    isStreaming,
    isTranscribing,
    startRecording,
  ]);

  // Dynamic Skill Form integration
  const isSkillFormEnabled = useFeatureFlag("chat.dynamicSkillForm");
  const skillForm = useChatSkillForm(conversationId ?? 0, undefined, {
    featureEnabled: localClientLlmModeEnabled,
    forceCloudOnly: localAiCatalogQuery.data?.policy.forceCloudOnly === true,
    localAiEnabled: chatSessionLocalAiPreferences.enabled,
    executionMode: chatSessionLocalAiPreferences.mode,
    preferredLocalProfileId: chatSessionLocalAiPreferences.defaultModelId,
    platform: localAiRuntimePlatform,
  });
  const preferredSkillExecution = useSkillExecution({
    conversationId:
      typeof conversationId === "number" ? conversationId : undefined,
    platform: localAiRuntimePlatform,
    origin: "chat",
    localAiEnabled:
      localClientLlmModeEnabled && chatSessionLocalAiPreferences.enabled,
    localAiExecutionMode: chatSessionLocalAiPreferences.mode,
    forceCloudOnly: localAiCatalogQuery.data?.policy.forceCloudOnly === true,
    preferredLocalProfileId: chatSessionLocalAiPreferences.defaultModelId,
  });

  // Auto-open skill form when navigated from another page with prefill data
  useEffect(() => {
    const raw = sessionStorage.getItem("isc_skill_prefill");
    if (!raw) return;
    sessionStorage.removeItem("isc_skill_prefill");
    try {
      const { skillId, values: prefillValues } = JSON.parse(raw) as {
        skillId: string;
        values: Record<string, any>;
      };
      // Small delay so the chat view finishes mounting before opening the form
      const timer = setTimeout(() => {
        skillForm.openSkillForm(skillId, prefillValues);
      }, 400);
      return () => clearTimeout(timer);
    } catch {
      // ignore malformed data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // Ctrl+K to open Skill Selector
  useEffect(() => {
    return () => {
      stopLocalVoiceReadback();
    };
  }, []);

  useEffect(() => {
    if (!isSkillFormEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        skillForm.setShowSkillSelector(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSkillFormEnabled, skillForm.setShowSkillSelector]);

  // Listen for open-skill-selector event from SchedulePanel
  useEffect(() => {
    if (!isSkillFormEnabled) return;
    const handleOpenSkillSelector = () => {
      skillForm.setShowSkillSelector(true);
    };
    window.addEventListener("open-skill-selector", handleOpenSkillSelector);
    return () =>
      window.removeEventListener(
        "open-skill-selector",
        handleOpenSkillSelector
      );
  }, [isSkillFormEnabled, skillForm.setShowSkillSelector]);

  // Handle model change
  const handleModelChange = async (
    modelId: string,
    providerId?: number,
    providerName?: string
  ) => {
    if (!conversationId || isStreaming) return;

    const parsedSelection = parsePickerSelectionValue({
      value: modelId,
      explicitProviderId: providerId ?? null,
      explicitProviderName: providerName ?? null,
    });

    if (
      !chatAutoModelSelectionEnabled &&
      parsedSelection &&
      parsedSelection.mode !== "explicit"
    ) {
      toast.error("Auto model selection is not enabled for this workspace");
      return;
    }

    setSelectedModel(modelId);

    if (parsedSelection?.mode === "explicit") {
      if (providerId !== undefined) {
        setSelectedProviderId(providerId);
      } else {
        const multiModel = multiProviderModels?.find(
          (m: AvailableModel) => m.modelId === modelId
        );
        if (multiModel?.providers?.length) {
          const cheapest = getCheapestProvider(multiModel.providers);
          setSelectedProviderId(cheapest?.providerId ?? null);
        } else {
          setSelectedProviderId(null);
        }
      }
    } else if (parsedSelection?.mode === "auto-provider") {
      setSelectedProviderId(parsedSelection.providerId);
    } else {
      setSelectedProviderId(null);
    }

    // Update conversation in database
    try {
      await updateConversationMutation.mutateAsync({
        id: conversationId,
        model: parsedSelection?.mode === "explicit" ? modelId : null,
        modelSelection: parsedSelection,
      });
      // Invalidate to refresh conversation data
      utils.chat.getConversation.invalidate({ id: conversationId });
    } catch (error) {
      console.error("Failed to update model:", error);
      // Revert on error
      setSelectedModel(
        selectionToPickerValue(
          conversationModelSelection,
          conversation?.model ?? undefined
        )
      );
      setSelectedProviderId(conversationModelSelection?.providerId ?? null);
    }
  };

  const handlePersonaChange = async (personaId: string | null) => {
    if (!conversationId || isStreaming) return;

    try {
      await updateConversationMutation.mutateAsync({
        id: conversationId,
        personaId,
      });
      await utils.chat.getConversation.invalidate({ id: conversationId });
      toast.success(
        personaId ? "Persona updated for this chat" : "Using default persona"
      );
    } catch (error) {
      console.error("Failed to update persona:", error);
      toast.error("Failed to update persona");
    }
  };

  const updateConversationLocalAiOverride = useCallback(
    async (
      nextMode: "account_default" | "local_only" | "cloud_only",
    ) => {
      if (!conversationId || isStreaming) {
        return;
      }

      const localAiConversation =
        nextMode === "account_default"
          ? null
          : {
              mode:
                (nextMode === "local_only"
                  ? "local_only"
                  : "cloud_only") as "local_only" | "cloud_only",
              disableForConversation: nextMode === "cloud_only",
              updatedAt: new Date().toISOString(),
              preferredProfileId:
                effectiveLocalAiPreferences.defaultModelId ?? undefined,
            };

      await updateConversationMutation.mutateAsync({
        id: conversationId,
        skillSettings: mergeClientConversationSkillSettings(
          conversation?.skillSettings,
          {
            localAiConversation,
          },
        ),
      });
      await utils.chat.getConversation.invalidate({ id: conversationId });
    },
    [
      conversation?.skillSettings,
      conversationId,
      effectiveLocalAiPreferences.defaultModelId,
      isStreaming,
      updateConversationMutation,
      utils.chat.getConversation,
    ],
  );

  const handleSessionRuntimeModeSelection = useCallback(
    async (nextMode: "account_default" | "local_only" | "cloud_only") => {
      if (!conversationId || sessionRuntimeControlDisabled) {
        return;
      }

      if (nextMode === "local_only") {
        if (sessionLocalOnlySelectionDisabledReason) {
          toast.info(sessionLocalOnlySelectionDisabledReason);
          return;
        }
      }

      try {
        await updateConversationLocalAiOverride(nextMode);
        toast.success(
          nextMode === "local_only"
            ? "This chat session now uses Local AI for supported text replies and local-safe text skills."
            : nextMode === "cloud_only"
              ? "This chat session now stays on the cloud/API path."
              : "This chat session is back on the account default runtime mode.",
        );
      } catch {
        toast.error("Failed to update the chat runtime mode");
      }
    },
    [
      conversationId,
      sessionRuntimeControlDisabled,
      sessionLocalOnlySelectionDisabledReason,
      updateConversationLocalAiOverride,
    ],
  );

  // Group models by provider for display
  const modelsByProvider = useMemo(() => {
    if (!modelsData?.models) return {};

    const grouped: Record<string, typeof modelsData.models> = {};
    for (const model of modelsData.models) {
      const provider = model.providerDisplayName || model.provider;
      if (!grouped[provider]) {
        grouped[provider] = [];
      }
      grouped[provider].push(model);
    }
    return grouped;
  }, [modelsData?.models]);

  // Helper to format model display name with provider prefix for OpenCode Zen
  // This helps distinguish OpenCode models from OpenRouter models
  const formatModelDisplayName = (
    modelName: string,
    providerName?: string
  ): string => {
    if (
      providerName?.toLowerCase().includes("opencode") ||
      providerName?.toLowerCase().includes("zen")
    ) {
      return `OpenCode/${modelName}`;
    }
    return modelName;
  };

  const selectedModelDisplay = useMemo(() => {
    const modelData = modelsData?.models.find(m => m.id === selectedModel);
    const multiModel = multiProviderModels?.find(
      (m: AvailableModel) => m.modelId === selectedModel
    );
    const provider =
      multiModel?.providers?.find(
        (p: ModelProvider) => p.providerId === selectedProviderId
      ) ||
      (multiModel?.providers?.length
        ? getCheapestProvider(multiModel.providers)
        : null);
    const providerDisplayName =
      provider?.providerDisplayName || provider?.providerName || null;
    const selectedProviderDisplayName =
      multiProviderModels
        ?.flatMap(model => model.providers || [])
        .find(candidate => candidate.providerId === selectedProviderId)
        ?.providerDisplayName ||
      multiProviderModels
        ?.flatMap(model => model.providers || [])
        .find(candidate => candidate.providerId === selectedProviderId)
        ?.providerName ||
      conversationModelSelection?.providerName ||
      null;

    if (selectedModel === AUTO_MODEL || isAutoProviderValue(selectedModel)) {
      return getSelectionDisplaySummary({
        pickerValue: selectedModel,
        explicitProviderName: selectedProviderDisplayName,
        storedSelection: conversationModelSelection,
      });
    }

    const displayName = formatModelDisplayName(
      modelData?.name ||
        conversationModelSelection?.lastResolvedModelId ||
        conversation?.model ||
        selectedModel ||
        "Select model",
      providerDisplayName ?? undefined
    );

    return getSelectionDisplaySummary({
      pickerValue: selectedModel || "Select model",
      explicitLabel: displayName,
      explicitProviderName: providerDisplayName,
      storedSelection: conversationModelSelection,
    });
  }, [
    conversationModelSelection,
    conversation?.model,
    modelsData?.models,
    multiProviderModels,
    selectedModel,
    selectedProviderId,
  ]);

  const renderModelDialogContent = () => {
    if (modelsLoading) {
      return (
        <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading model catalog...
        </div>
      );
    }

    if (modelsError) {
      return (
        <div className="space-y-3 px-3 py-6 text-sm">
          <p className="font-medium text-destructive">
            Unable to load the model catalog right now.
          </p>
          <p className="text-muted-foreground">
            The chat will keep using the last selected model.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void refetchModels()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      );
    }

    if (!multiProviderModels || multiProviderModels.length === 0) {
      return (
        <>
          <CommandEmpty>No models found.</CommandEmpty>
          {Object.entries(modelsByProvider).map(([provider, models]) => (
            <CommandGroup key={provider} heading={provider}>
              {models.map(model => (
                <CommandItem
                  key={model.id}
                  value={`${model.name} ${model.id} ${provider}`}
                  onSelect={() => {
                    handleModelChange(model.id);
                    setModelDialogOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      selectedModel === model.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">
                    {formatModelDisplayName(model.name, model.provider)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </>
      );
    }

    const grouped: Record<
      string,
      Array<{ model: AvailableModel; provider: ModelProvider }>
    > = {};

    for (const model of multiProviderModels) {
      if (!model.providers || model.providers.length === 0) {
        continue;
      }

      const bestProvider = getCheapestProvider(model.providers);
      if (!bestProvider) {
        continue;
      }

      const providerKey =
        bestProvider.providerDisplayName || bestProvider.providerName;
      if (!grouped[providerKey]) {
        grouped[providerKey] = [];
      }
      grouped[providerKey].push({
        model,
        provider: bestProvider,
      });
    }

    const providerAutoEntries = Object.entries(grouped)
      .map(([providerName, items]) => ({
        providerName,
        providerId: items[0]?.provider.providerId ?? null,
      }))
      .filter(
        (
          entry
        ): entry is {
          providerName: string;
          providerId: number;
        } => typeof entry.providerId === "number"
      );

    return (
      <>
        {chatAutoModelSelectionEnabled ? (
          <CommandGroup heading="Recommended">
            <CommandItem
              value="Auto best overall"
              onSelect={() => {
                handleModelChange(AUTO_MODEL);
                setModelDialogOpen(false);
              }}
              className="flex items-center gap-2"
            >
              <Check
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  selectedModel === AUTO_MODEL ? "opacity-100" : "opacity-0"
                )}
              />
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="flex-1 truncate">Auto (best overall)</span>
              {conversationModelSelection?.lastResolvedProviderName ? (
                <Badge
                  variant="secondary"
                  className="h-4 max-w-[92px] shrink-0 px-1 text-[10px]"
                >
                  <span className="truncate">
                    {conversationModelSelection.lastResolvedProviderName}
                  </span>
                </Badge>
              ) : null}
            </CommandItem>
            {providerAutoEntries.map(entry => {
              const autoValue = buildAutoProviderValue(entry.providerId);
              return (
                <CommandItem
                  key={autoValue}
                  value={`${entry.providerName} auto model`}
                  onSelect={() => {
                    handleModelChange(
                      autoValue,
                      entry.providerId,
                      entry.providerName
                    );
                    setModelDialogOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      selectedModel === autoValue ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="flex-1 truncate">Auto Model</span>
                  <Badge
                    variant="secondary"
                    className="h-4 max-w-[92px] shrink-0 px-1 text-[10px]"
                  >
                    <span className="truncate">{entry.providerName}</span>
                  </Badge>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {Object.entries(grouped).map(([providerName, items]) => (
          <CommandGroup key={providerName} heading={providerName}>
            {items.map(({ model, provider }) => (
              <CommandItem
                key={`${model.modelId}-${provider.providerId}`}
                value={`${model.modelName} ${model.modelId} ${providerName}`}
                onSelect={() => {
                  handleModelChange(
                    model.modelId,
                    provider.providerId,
                    provider.providerDisplayName || provider.providerName
                  );
                  setModelDialogOpen(false);
                }}
                className="flex items-center gap-2"
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    selectedModel === model.modelId ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="flex-1 truncate">
                  {formatModelDisplayName(model.modelName, providerName)}
                </span>
                <Badge
                  variant="secondary"
                  className="h-4 max-w-[92px] shrink-0 px-1 text-[10px]"
                >
                  <span className="truncate">{providerName}</span>
                </Badge>
                {provider.isFree ? (
                  <Badge
                    variant="secondary"
                    className="h-4 px-1 text-[10px] shrink-0 bg-green-500/10 text-green-600"
                  >
                    FREE
                  </Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatModelCost(
                      provider.pricingInput,
                      provider.pricingOutput,
                      false
                    )}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </>
    );
  };

  // Skill detection state
  const [skillIntentEnabled, setSkillIntentEnabled] = useState(false);
  const [detectedSkill, setDetectedSkill] = useState<{
    id: string;
    name: string;
    type: string;
    confidence: number;
    suggestedPrompt: string | null;
    executionMode: string;
    chainTo: string | null;
    /** Per-pattern chainTo from matched trigger pattern */
    patternChainTo: string | null;
  } | null>(null);

  useEffect(() => {
    setSkillIntentEnabled(false);
    setDetectedSkill(null);
  }, [conversationId]);

  // Filter media models by detected skill type (image / video)
  const filteredMediaModels = useMemo<MediaModelOption[]>(() => {
    if (!allMediaModelsData?.models || !detectedSkill) return [];
    const type = detectedSkill.type === "video-generation" ? "video" : "image";
    const normalized: MediaModelOption[] = [];
    for (const model of allMediaModelsData.models) {
      const option = toMediaModelOption(model);
      if (option && option.type === type) {
        normalized.push(option);
      }
    }
    return normalized;
  }, [allMediaModelsData?.models, detectedSkill]);

  // Auto-select default media model when skill type changes (reads localStorage first)
  useEffect(() => {
    if (!detectedSkill || detectedSkill.executionMode !== "media-generate") {
      setSelectedMediaModel("");
      return;
    }
    if (filteredMediaModels.length === 0) return;
    const isVideo = detectedSkill.type === "video-generation";
    const storageKey = isVideo
      ? "smartspec_lastVideoModel"
      : "smartspec_lastImageModel";
    const savedModel = localStorage.getItem(storageKey);
    setSelectedMediaModel(prev => {
      // Keep current in-session selection if still valid for this type
      if (prev && filteredMediaModels.some(m => m.id === prev)) return prev;
      // Restore from localStorage (user's previous choice for this type)
      if (savedModel && filteredMediaModels.some(m => m.id === savedModel))
        return savedModel;
      // Fall back to API default, then first in list
      const defaultId = isVideo
        ? allMediaModelsData?.defaults?.video
        : allMediaModelsData?.defaults?.image;
      const preferred = defaultId
        ? filteredMediaModels.find(m => m.id === defaultId)
        : undefined;
      return (preferred?.id ?? filteredMediaModels[0]?.id) || "";
    });
  }, [filteredMediaModels, detectedSkill, allMediaModelsData?.defaults]);

  // Schedule confirm card state
  const [pendingSchedule, setPendingSchedule] = useState<any>(null);

  // ── Intent-driven media prompt preview state ──────────────────
  const [pendingMediaPrompt, setPendingMediaPrompt] = useState<{
    prompt: string;
    skillId: string;
    skillName: string;
    skillCategory: string;
    mediaParams: Record<string, unknown>;
    conversationId: number;
  } | null>(null);

  // ── Intent-driven agency escalation state ─────────────────────
  const [pendingAgencyEscalation, setPendingAgencyEscalation] = useState<{
    message: string;
    reason: string;
    modalities: string[];
    complexity: string;
  } | null>(null);
  const [pendingHybridOrchestration, setPendingHybridOrchestration] = useState<{
    message: string;
    reason: string;
    plan: HybridOrchestrationPlan;
    fallbackUserMessage: Message;
    retrievalQueryText: string;
  } | null>(null);

  const parseIntentMutation = trpc.scheduledMessages.parseIntent.useMutation();
  const autoGeneratePresentationMutation =
    trpc.presentation.ai.autoGenerateDraft.useMutation();

  // ── Presentation auto-draft completion polling ────────────
  const [pendingPresentationTask, setPendingPresentationTask] = useState<{
    taskId: string;
    editorUrl: string;
    topic: string;
    numSlides: number;
  } | null>(null);

  useEffect(() => {
    if (!sessionLocalOnlyEnabled) return;
    setDetectedSkill(null);
    setPendingAgencyEscalation(null);
    setPendingHybridOrchestration(null);
  }, [sessionLocalOnlyEnabled]);

  const presentationProgressQuery =
    trpc.presentation.ai.getDraftProgress.useQuery(
      { taskId: pendingPresentationTask?.taskId ?? "" },
      {
        enabled: pendingPresentationTask !== null,
        refetchInterval: 3000,
      }
    );

  useEffect(() => {
    if (!pendingPresentationTask) return;
    const progress = presentationProgressQuery.data;
    if (!progress) return;

    if (progress.completed) {
      const task = pendingPresentationTask;
      setPendingPresentationTask(null);

      const hasError = !!progress.error;
      const slidesAdded = progress.result?.slidesAdded ?? task.numSlides;

      const completionContent = hasError
        ? [
            `Presentation generation failed`,
            ``,
            `**Topic:** ${task.topic}`,
            `**Error:** ${progress.error?.message ?? "Unknown error"}`,
            ``,
            `[Open Presentation Editor](${task.editorUrl})`,
          ].join("\n")
        : [
            `Presentation is ready!`,
            ``,
            `**Topic:** ${task.topic}`,
            `**Slides created:** ${slidesAdded}`,
            ``,
            `[Open Presentation Editor](${task.editorUrl})`,
          ].join("\n");

      // Save to database so it persists across page reloads
      if (conversationId) {
        saveAssistantMessageMutation
          .mutateAsync({
            conversationId,
            content: completionContent,
            skillUsed: "auto-draft-presentation",
          })
          .then(saved => {
            markLocalAdd();
            setMessages(prev => [
              ...prev,
              {
                id: saved?.id ?? Date.now(),
                role: "assistant" as const,
                content: completionContent,
                runtimeMetadata: saved?.runtimeMetadata ?? null,
                createdAt: new Date(),
              },
            ]);
          })
          .catch(err => {
            console.error("[ChatView] Failed to save completion message:", err);
            markLocalAdd();
            setMessages(prev => [
              ...prev,
              {
                id: Date.now(),
                role: "assistant" as const,
                content: completionContent,
                createdAt: new Date(),
              },
            ]);
          });
      } else {
        markLocalAdd();
        setMessages(prev => [
          ...prev,
          {
            id: Date.now(),
            role: "assistant" as const,
            content: completionContent,
            createdAt: new Date(),
          },
        ]);
      }
    }
  }, [
    presentationProgressQuery.data,
    pendingPresentationTask,
    conversationId,
    saveAssistantMessageMutation,
  ]);

  // Lightbox state for viewing images
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<
    Array<{ src: string; alt?: string }>
  >([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Open image in lightbox
  const openImageLightbox = (
    images: Array<{ src: string; alt?: string }>,
    index: number = 0
  ) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // LLM Artifact viewer state
  const [selectedLLMArtifact, setSelectedLLMArtifact] =
    useState<LLMArtifact | null>(null);

  // Debounce input for skill detection
  const debouncedInput = useDebounce(input, 800);

  // Detect skills when input changes
  useEffect(() => {
    const detectSkills = async () => {
      const trimmedInput = debouncedInput.trim();
      const isSlashCommand = trimmedInput.startsWith("/");
      if (
        !conversationId ||
        sessionLocalOnlyEnabled ||
        !trimmedInput ||
        trimmedInput.length < 3 ||
        (!skillIntentEnabled && !isSlashCommand) ||
        !looksLikeSkillRequest(trimmedInput)
      ) {
        setDetectedSkill(null);
        return;
      }

      try {
        // Skill triggers always appear at the start — truncate to first 500 chars
        // to avoid hitting the server 5000-char limit on very long prompts
        const detectionMessage = trimmedInput.slice(0, 500);
        const result = await detectSkillMutation.mutateAsync({
          message: detectionMessage,
          conversationId,
        });

        if (result.detected && result.skill) {
          setDetectedSkill({
            id: result.skill.id,
            name: result.skill.name,
            type: result.skill.type,
            confidence: result.confidence,
            suggestedPrompt: result.suggestedPrompt,
            executionMode: result.skill.executionMode || "llm-only",
            chainTo: result.skill.chainTo || null,
            // Per-pattern chainTo takes precedence over skill-level chainTo
            patternChainTo: result.patternChainTo || null,
          });
        } else {
          setDetectedSkill(null);
        }
      } catch (error) {
        // Silently fail skill detection
        setDetectedSkill(null);
      }
    };

    detectSkills();
  }, [
    debouncedInput,
    conversationId,
    sessionLocalOnlyEnabled,
    skillIntentEnabled,
  ]);

  // Parse language/aspectRatio intent from natural language and return cleaned input
  const parseEnhanceIntent = (
    text: string
  ): {
    cleanInput: string;
    language: "en" | "th";
    aspectRatio?: string;
  } => {
    let clean = text;
    let language: "en" | "th" = "en"; // default English

    // Thai language requested
    if (/ภาษาไทย|prompt\s*ไทย|เป็นไทย|ขอไทย/i.test(clean)) {
      language = "th";
      clean = clean.replace(
        /(?:ขอ\s*)?(?:prompt\s*)?(?:เป็น\s*)?ภาษาไทย|prompt\s*ไทย|เป็นไทย|ขอไทย/gi,
        ""
      );
      // English explicitly requested
    } else if (
      /ภาษาอังกฤษ|prompt\s*อังกฤษ|เป็นอังกฤษ|ขออังกฤษ|in\s*english/i.test(clean)
    ) {
      language = "en";
      clean = clean.replace(
        /(?:ขอ\s*)?(?:prompt\s*)?(?:เป็น\s*)?ภาษาอังกฤษ|prompt\s*อังกฤษ|เป็นอังกฤษ|ขออังกฤษ|in\s*english/gi,
        ""
      );
    }

    // Detect aspect ratio (e.g. "ขนาด 9:16", "9:16", "16:9", "1:1")
    const ratioMatch = clean.match(/(?:ขนาด\s*)?(\d+:\d+)/);
    const aspectRatio = ratioMatch ? ratioMatch[1] : undefined;
    if (ratioMatch) {
      clean = clean.replace(/(?:ขนาด\s*)?\d+:\d+/g, "");
    }

    clean = clean.replace(/\s+/g, " ").trim();
    return { cleanInput: clean || text, language, aspectRatio };
  };

  // Handle Auto Prompt enhancement
  const handleAutoPrompt = async () => {
    if (!input.trim() || isEnhancingPrompt) return;

    setIsEnhancingPrompt(true);
    try {
      const referenceImages = attachments
        .filter(a => a.fileType.startsWith("image/"))
        .map(a => a.url)
        .slice(0, 5);

      const { cleanInput, language, aspectRatio } = parseEnhanceIntent(input);

      const result = await enhancePromptMutation.mutateAsync({
        userInput: cleanInput,
        referenceImages:
          referenceImages.length > 0 ? referenceImages : undefined,
        language,
        ...(aspectRatio && { aspectRatio }),
      });

      if (result.success) {
        const promptText =
          language === "th" ? result.promptTh : result.promptEn;
        if (promptText) {
          const enhanced = `create image: ${promptText}`;
          setInput(enhanced);
          setEnhancedPrompt(enhanced);
        }
      }
    } catch (error) {
      console.error("Auto prompt enhancement failed:", error);
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  // Update messages when data changes
  useEffect(() => {
    console.log("[ChatView] useEffect triggered", {
      hasMessagesData: !!messagesData,
      messagesDataLength: messagesData?.length,
      currentMessagesLength: messages.length,
      lastLocalAddTime: lastLocalAddTime.current,
      lastLocalAddConversationId: lastLocalAddConversationId.current,
      conversationId,
    });
    if (messagesData) {
      // If we just added a local message (within last 3 seconds), don't overwrite
      // This prevents race condition where server data doesn't have the new message yet
      const timeSinceLocalAdd = Date.now() - lastLocalAddTime.current;
      const shouldPreserveCurrentConversation = shouldPreserveLocalMessages({
        currentConversationId: conversationId,
        lastLocalAddConversationId: lastLocalAddConversationId.current,
        lastLocalAddAt: lastLocalAddTime.current,
      });
      if (shouldPreserveCurrentConversation) {
        console.log("[ChatView] Skipping sync - recently added local message", {
          timeSinceLocalAdd,
          messagesDataLength: messagesData.length,
          conversationId,
        });
        return;
      }
      console.log("[ChatView] Syncing from server data", {
        serverLength: messagesData.length,
      });
      setMessages(messagesData as Message[]);
    }
  }, [conversationId, messagesData]);

  // Debug: Log when messages state changes
  useEffect(() => {
    console.log("[ChatView] messages state changed:", {
      length: messages.length,
      lastMessage:
        messages.length > 0
          ? {
              id: messages[messages.length - 1].id,
              role: messages[messages.length - 1].role,
              contentPreview: messages[messages.length - 1].content?.substring(
                0,
                50
              ),
            }
          : null,
    });
  }, [messages]);

  // Scroll helpers
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  const scrollToTop = useCallback(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // Auto-resize textarea when input changes (e.g. after prompt enhancement)
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }
  }, [input]);

  // File handling
  const handlePickFile = () => fileRef.current?.click();

  // File upload constants
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images
  const MAX_VIDEO_SIZE = 20 * 1024 * 1024; // 20MB for videos
  const ALLOWED_FILE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // File size validation
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const maxSize = isImage
      ? MAX_IMAGE_SIZE
      : isVideo
        ? MAX_VIDEO_SIZE
        : MAX_FILE_SIZE;

    if (file.size > maxSize) {
      const sizeMB = (maxSize / (1024 * 1024)).toFixed(0);
      const typeLabel = isImage ? "images" : isVideo ? "videos" : "files";
      alert(`File too large. Maximum size is ${sizeMB}MB for ${typeLabel}.`);
      return;
    }

    // File type validation
    if (
      !ALLOWED_FILE_TYPES.includes(file.type) &&
      !file.type.startsWith("image/")
    ) {
      alert(
        "File type not allowed. Supported types: images, PDF, text, JSON, Word documents."
      );
      return;
    }

    // Additional security: check file extension matches MIME type
    const ext = file.name.split(".").pop()?.toLowerCase();
    const mimeToExt: Record<string, string[]> = {
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
      "image/gif": ["gif"],
      "image/webp": ["webp"],
      "video/mp4": ["mp4"],
      "video/webm": ["webm"],
      "video/quicktime": ["mov"],
      "application/pdf": ["pdf"],
      "text/plain": ["txt"],
      "text/csv": ["csv"],
      "text/markdown": ["md", "markdown"],
      "application/json": ["json"],
    };

    const expectedExts = mimeToExt[file.type];
    if (expectedExts && ext && !expectedExts.includes(ext)) {
      alert(
        "File extension does not match file type. This may be a security issue."
      );
      return;
    }

    const toBase64 = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

    const fileBase64 = await toBase64(file);
    const res = await uploadMutation.mutateAsync({
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileBase64,
    });

    setAttachments(prev => [
      ...prev,
      {
        key: res.key,
        url: res.url,
        fileType: res.fileType,
        fileName: file.name,
      },
    ]);
  };

  const removeAttachment = (key: string) => {
    setAttachments(prev => prev.filter(a => a.key !== key));
  };

  const toggleLibrarySource = (item: ChatLibraryAttachPayload) => {
    setSelectedLibrarySources(prev => toggleLibrarySourceSelection(prev, item));
  };

  // Extract text from content that may be JSON multipart array
  const extractTextContent = (content: string): string => {
    if (!content.startsWith("[")) return content;
    try {
      const parts = JSON.parse(content);
      if (Array.isArray(parts)) {
        return parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n");
      }
    } catch {}
    return content;
  };

  // Parse content for API (history) — strip images, keep only text for old messages
  const parseContentForHistory = (content: string): string => {
    if (!content.startsWith("[")) return content;
    try {
      const parts = JSON.parse(content);
      if (Array.isArray(parts)) {
        const text = parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n");
        return text || content;
      }
    } catch {}
    return content;
  };

  // Parse content for API — returns proper multipart array with absolute image URLs (current message only)
  const parseContentForApi = (content: string): string | any[] => {
    if (!content.startsWith("[")) return content;
    try {
      const parts = JSON.parse(content);
      if (Array.isArray(parts)) {
        return parts.map((p: any) => {
          if (p.type === "image_url" && p.image_url?.url?.startsWith("/")) {
            return {
              ...p,
              image_url: {
                ...p.image_url,
                url: `${window.location.origin}${p.image_url.url}`,
              },
            };
          }
          return p;
        });
      }
    } catch {}
    return content;
  };

  const buildRecentLocalReplyContext = useCallback(
    (currentUserText: string) => {
      const history = messages
        .slice(-8)
        .map(message => ({
          role: message.role,
          content: extractTextContent(
            parseContentForHistory(message.content)
          ).trim(),
        }))
        .filter(message => message.content.length > 0);

      return [
        ...history,
        {
          role: "user" as const,
          content: currentUserText.trim(),
        },
      ];
    },
    [messages]
  );

  // Build user content for multi-modal
  const buildUserContent = (text: string, atts: Attachment[]) => {
    const parts: any[] = [];
    if (text.trim().length > 0) parts.push({ type: "text", text });

    for (const a of atts) {
      if (a.fileType.startsWith("image/")) {
        parts.push({ type: "image_url", image_url: { url: a.url } });
      } else if (a.fileType.startsWith("video/")) {
        parts.push({
          type: "file_url",
          file_url: { url: a.url, name: a.fileName, mime_type: a.fileType },
        });
      } else {
        parts.push({
          type: "file_url",
          file_url: { url: a.url, name: a.fileName, mime_type: a.fileType },
        });
      }
    }
    return parts.length === 1 && parts[0].type === "text"
      ? parts[0].text
      : parts;
  };

  const mergeRuntimeMetadataHints = (
    baseHint: Partial<MessageRuntimeMetadata> | null,
    overrideHint: Partial<MessageRuntimeMetadata> | null,
  ): Partial<MessageRuntimeMetadata> | null => {
    if (!baseHint && !overrideHint) {
      return null;
    }
    return {
      ...(baseHint ?? {}),
      ...(overrideHint ?? {}),
    };
  };

  // Stream response from LLM with memory-aware context
  // Server saves the assistant message at the end of streaming and sends message_saved event
  const streamResponse = async (
    userMessage: Message,
    skillUsed?: string,
    retrievalQueryText?: string,
    options?: {
      runtimeMetadataHint?: Partial<MessageRuntimeMetadata> | null;
    },
  ): Promise<string> => {
    if (!conversationId) return "";

    const streamStartedAt = performance.now();
    const timingSummary: Record<string, number | null> = {
      contextFetchMs: null,
      streamOpenMs: null,
      firstChunkMs: null,
      messageSavedMs: null,
      totalMs: null,
    };
    const logTiming = (stage: string, extra: Record<string, unknown> = {}) => {
      console.info("[ChatTiming]", {
        stage,
        conversationId,
        selectedModel,
        selectedProviderId,
        skillUsed: skillUsed || null,
        elapsedMs: Math.round(performance.now() - streamStartedAt),
        ...timingSummary,
        ...extra,
      });
    };

    setIsStreaming(true);
    setStreamingContent("");
    logTiming("start");

    // Get memory-aware context from server
    let apiMessages: Array<{ role: string; content: string | any[] }>;
    const userContent = parseContentForApi(userMessage.content);
    const contextFetchStartedAt = performance.now();
    try {
      const selectedModelData = modelsData?.models?.find(
        m => m.id === selectedModel
      );
      const memoryMode = (conversation as any)?.memoryMode || "full";
      const currentMessageForRetrieval = extractRetrievalQueryText(
        retrievalQueryText ?? "",
        typeof userContent === "string"
          ? userContent
          : extractTextContent(userMessage.content)
      );
      const contextData = await utils.memory.getChatContext.fetch({
        conversationId,
        modelContextLength: selectedModelData?.contextLength,
        currentMessage: currentMessageForRetrieval,
        memoryMode,
      });
      void utils.chat.getConversation.invalidate({ id: conversationId });
      apiMessages = [
        ...contextData.messages.map(m => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? parseContentForHistory(m.content)
              : m.content,
        })),
        { role: "user", content: userContent },
      ];
      timingSummary.contextFetchMs = Math.round(
        performance.now() - contextFetchStartedAt
      );
      logTiming("context_ready", {
        memoryMode,
        messageCount: apiMessages.length,
      });
    } catch (error) {
      // Fallback to simple context if memory fetch fails
      apiMessages = [
        ...(conversation?.systemPrompt
          ? [{ role: "system" as const, content: conversation.systemPrompt }]
          : []),
        ...messages.map(m => ({
          role: m.role,
          content: parseContentForHistory(m.content),
        })),
        { role: "user" as const, content: userContent },
      ];
      timingSummary.contextFetchMs = Math.round(
        performance.now() - contextFetchStartedAt
      );
      logTiming("context_fallback", {
        error: error instanceof Error ? error.message : String(error),
        messageCount: apiMessages.length,
      });
    }

    let runtimeMetadataHint = mergeRuntimeMetadataHints(
      null,
      options?.runtimeMetadataHint ?? null,
    );
    try {
      const compactionResult = await compactMessagesForProviderSubmission({
        platform: localAiRuntimePlatform,
        tenantFeatureEnabled: localClientLlmModeEnabled,
        forceCloudOnly:
          localAiCatalogQuery.data?.policy.forceCloudOnly === true,
        preferences: chatSessionLocalAiPreferences,
        catalog: localAiCatalogQuery.data?.catalog ?? [],
        capability: localAiCapability,
        scope: localAiDeviceScope,
        messages: apiMessages,
      });
      if (compactionResult.compacted) {
        apiMessages = compactionResult.messages;
        runtimeMetadataHint = mergeRuntimeMetadataHints(
          compactionResult.runtimeMetadataHint,
          runtimeMetadataHint,
        );
        logTiming("context_compacted_locally", {
          compactedMessageCount: compactionResult.compactedMessageCount,
          tokenSavedEstimate: compactionResult.tokenSavedEstimate,
          compactedMessagePayloadCount: apiMessages.length,
        });
      }
    } catch (error) {
      logTiming("context_compaction_skipped", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Include conversationId so server can save the message at end of streaming
    // Use selectedModel which reflects user's current selection
    const parsedSelection = parsePickerSelectionValue({
      value:
        selectedModel ||
        selectionToPickerValue(
          conversationModelSelection,
          conversation?.model ?? undefined
        ),
      explicitProviderId:
        !selectedModel ||
        selectedModel === AUTO_MODEL ||
        isAutoProviderValue(selectedModel)
          ? null
          : selectedProviderId,
    });
    const effectiveModel =
      parsedSelection?.mode === "explicit"
        ? parsedSelection.modelId
        : undefined;
    const body: Record<string, any> = {
      ...(effectiveModel ? { model: effectiveModel } : {}),
      messages: apiMessages,
      stream: true,
      conversationId,
      skillUsed,
    };
    if (parsedSelection) {
      body.modelSelection = parsedSelection;
    }
    if (runtimeMetadataHint) {
      body.runtimeMetadataHint = runtimeMetadataHint;
    }
    // Include preferredProvider only for explicit model selection
    if (parsedSelection?.mode === "explicit" && selectedProviderId) {
      body.preferredProvider = selectedProviderId;
    }

    try {
      const streamOpenStartedAt = performance.now();
      logTiming("stream_request_sent", {
        bodyModel: effectiveModel || parsedSelection?.mode || null,
        messageCount: apiMessages.length,
      });
      const resp = await fetch("/api/llm/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      timingSummary.streamOpenMs = Math.round(
        performance.now() - streamOpenStartedAt
      );

      if (!resp.ok || !resp.body) {
        const txt = await resp.text().catch(() => "Stream failed");
        const friendlyError = parseErrorResponse(txt);
        timingSummary.totalMs = Math.round(performance.now() - streamStartedAt);
        logTiming("stream_open_failed", {
          httpOk: resp.ok,
          status: resp.status,
          friendlyError,
        });
        setStreamingContent(`[Error] ${friendlyError}`);
        setIsStreaming(false);
        return "";
      }

      logTiming("stream_opened", {
        status: resp.status,
      });

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let fullContent = "";
      let savedMessageId: number | null = null;
      let creditsUsed = 0;
      let resolvedModelUsed: string | null = null;
      let savedRuntimeMetadata: MessageRuntimeMetadata | null = null;
      let streamErrorMessage: string | null = null;
      let sawFirstChunk = false;
      let lastStreamingUiFlushAt = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buf.indexOf("\n");
          if (idx < 0) break;
          const line = buf.slice(0, idx).replace(/\r$/, "");
          buf = buf.slice(idx + 1);

          // Handle custom events (message_saved, save_error)
          if (line.startsWith("event:")) {
            const eventName = line.slice("event:".length).trim();
            // Read the next data line for this event
            const dataIdx = buf.indexOf("\n");
            if (dataIdx >= 0) {
              const dataLine = buf.slice(0, dataIdx).replace(/\r$/, "");
              buf = buf.slice(dataIdx + 1);
              if (dataLine.startsWith("data:")) {
                const eventData = dataLine.slice("data:".length).trim();
                try {
                  const parsed = JSON.parse(eventData);
                  if (eventName === "message_saved") {
                    savedMessageId = parsed.id;
                    creditsUsed = parsed.creditsUsed || 0;
                    resolvedModelUsed =
                      parsed.resolvedModelId || resolvedModelUsed;
                    savedRuntimeMetadata =
                      parsed?.runtimeMetadata &&
                      typeof parsed.runtimeMetadata === "object"
                        ? (parsed.runtimeMetadata as MessageRuntimeMetadata)
                        : null;
                    timingSummary.messageSavedMs = Math.round(
                      performance.now() - streamStartedAt
                    );
                    console.log("[Chat Client] Server saved message:", {
                      savedMessageId,
                      creditsUsed,
                    });
                    logTiming("message_saved", { savedMessageId, creditsUsed });
                  } else if (eventName === "message_complete") {
                    resolvedModelUsed =
                      parsed.resolvedModelId || resolvedModelUsed;
                    if (
                      typeof parsed?.content === "string" &&
                      parsed.content &&
                      !fullContent
                    ) {
                      fullContent = parsed.content;
                      setStreamingContent(fullContent);
                      logTiming("message_complete_content_fallback", {
                        contentLength: fullContent.length,
                      });
                    }
                  } else if (eventName === "save_error") {
                    console.error(
                      "[Chat Client] Server save error:",
                      parsed.error
                    );
                    logTiming("save_error", {
                      error: parsed.error,
                    });
                  } else if (eventName === "fallback_required") {
                    // Free provider failed, paid fallback available
                    console.log("[Chat Client] Fallback required:", parsed);
                    timingSummary.totalMs = Math.round(
                      performance.now() - streamStartedAt
                    );
                    logTiming("fallback_required", parsed);
                    setFallbackRequest({
                      from: parsed.from,
                      to: parsed.to,
                      estimatedCredits: parsed.estimatedCredits || 0,
                      originalMessages: messages.map(m => ({
                        role: m.role,
                        content: m.content,
                      })),
                    });
                    setIsStreaming(false);
                    reader.releaseLock();
                    return ""; // Stop processing, user must decide
                  } else if (eventName === "error") {
                    streamErrorMessage =
                      parsed?.error ||
                      parsed?.message ||
                      "Failed to resolve a valid model for this chat request";
                    logTiming("stream_error_event", {
                      error: streamErrorMessage,
                      statusCode: parsed?.statusCode ?? null,
                    });
                  }
                } catch {
                  // Ignore parse errors for event data
                }
              }
            }
            continue;
          }

          if (line.startsWith("data:")) {
            const data = line.slice("data:".length).trim();
            if (data === "[DONE]") break;

            try {
              const j = JSON.parse(data);
              const delta = j?.choices?.[0]?.delta?.content;
              if (typeof delta === "string") {
                if (!sawFirstChunk) {
                  sawFirstChunk = true;
                  timingSummary.firstChunkMs = Math.round(
                    performance.now() - streamStartedAt
                  );
                  logTiming("first_chunk", {
                    chunkLength: delta.length,
                  });
                }
                fullContent += delta;
                const now = performance.now();
                if (now - lastStreamingUiFlushAt >= 50) {
                  lastStreamingUiFlushAt = now;
                  setStreamingContent(fullContent);
                }
              }
            } catch {
              // Non-JSON data line, ignore
            }
          }
        }
      }

      reader.releaseLock();

      if (streamErrorMessage) {
        const errorContent = `[Error] ${streamErrorMessage}`;
        markLocalAdd();
        setMessages(prev => [
          ...prev,
          {
            id: Date.now(),
            role: "assistant" as const,
            content: errorContent,
            createdAt: new Date(),
          },
        ]);
        setStreamingContent("");
        setIsStreaming(false);
        toast.error(streamErrorMessage);
        timingSummary.totalMs = Math.round(performance.now() - streamStartedAt);
        logTiming("stream_complete_error", {
          error: streamErrorMessage,
        });
        return "";
      }

      // Message was saved by server - add to local state
      if (fullContent) {
        // Set timestamp BEFORE adding message to prevent useEffect from overwriting
        markLocalAdd();
        console.log(
          "[ChatView] Adding message to local state, timestamp:",
          lastLocalAddTime.current
        );

        // Parse inline artifacts from LLM response
        const inlineArtifacts = parseArtifacts(fullContent);

        // Add assistant message to local state
        const newMessage = {
          id: savedMessageId || Date.now(), // Use server ID if available
          role: "assistant" as const,
          content: fullContent,
          creditsUsed: creditsUsed.toString(),
          modelUsed:
            resolvedModelUsed ||
            selectedModel ||
            conversation?.model ||
            undefined,
          skillUsed: skillUsed,
          runtimeMetadata: savedRuntimeMetadata,
          artifacts:
            inlineArtifacts.length > 0
              ? inlineArtifacts.map(a => ({
                  id: a.identifier,
                  type: a.type as any,
                  title: a.title,
                  content: a.content,
                }))
              : undefined,
          createdAt: new Date(),
        };
        console.log("[ChatView] New message object:", newMessage);

        setMessages(prev => {
          console.log(
            "[ChatView] setMessages called, prev length:",
            prev.length
          );
          const updated = [...prev, newMessage];
          console.log("[ChatView] Updated messages length:", updated.length);
          return updated;
        });

        // Clear streaming content AFTER adding to messages
        console.log("[ChatView] Clearing streamingContent");
        setStreamingContent("");
        setIsStreaming(false);
        timingSummary.totalMs = Math.round(performance.now() - streamStartedAt);
        logTiming("stream_complete", {
          savedMessageId,
          creditsUsed,
          contentLength: fullContent.length,
        });

        // Invalidate conversation list (for title/timestamp) and credits
        utils.chat.listConversations.invalidate();
        utils.chat.getConversation.invalidate({ id: conversationId });
        utils.credits.balance.invalidate();

        // Process memory in background (entity extraction, summarization check)
        processMemoryMutation
          .mutateAsync({ conversationId })
          .then(result => {
            // Show auto-compact / consolidation notification
            if (result.consolidated) {
              toast.info(
                "Context consolidated: old summaries merged to optimize memory"
              );
            } else if (result.compacted && result.compactedMessageCount > 0) {
              toast.info(
                `Auto-compacted: ${result.compactedMessageCount} messages summarized to save context`
              );
            }

            autoSaveCooldownRef.current++;
            if (
              result.suggestedMemories?.length > 0 &&
              autoSaveCooldownRef.current >= 3 // cooldown: at least 3 messages between suggestions
            ) {
              const suggested = result.suggestedMemories[0];
              setSuggestedMemory({
                content: suggested.fact,
                type: suggested.type,
                name: suggested.name,
                importance: suggested.importance,
                source: "suggested",
              });
              setSaveDialogOpen(true);
              autoSaveCooldownRef.current = 0;
            }
          })
          .catch(() => {
            /* non-fatal */
          });

        if (!savedMessageId) {
          console.warn(
            "[ChatView] Message displayed but may not be saved - no message_saved event received"
          );
          logTiming("message_save_missing", {
            contentLength: fullContent.length,
          });
        }
        return fullContent;
      } else {
        setStreamingContent("");
        setIsStreaming(false);
        timingSummary.totalMs = Math.round(performance.now() - streamStartedAt);
        logTiming("stream_complete_empty");
        return "";
      }
    } catch (error) {
      console.error("Stream error:", error);
      timingSummary.totalMs = Math.round(performance.now() - streamStartedAt);
      logTiming("stream_exception", {
        error: error instanceof Error ? error.message : String(error),
      });
      setStreamingContent(`[Error] Failed to stream response`);
      setIsStreaming(false);
      return "";
    }
  };

  const onSend = async (
    overrideText?: string,
    options?: { ignoreComposerContext?: boolean }
  ) => {
    if (isStreaming || !conversationId) return;
    const useComposerContext = !options?.ignoreComposerContext;
    const composerAttachments: Attachment[] = attachments;
    const composerSelectedLibrarySources: ChatLibraryAttachPayload[] =
      selectedLibrarySources;
    const messageAttachments: Attachment[] = useComposerContext
      ? composerAttachments
      : [];
    const messageSelectedLibrarySources: ChatLibraryAttachPayload[] =
      useComposerContext ? composerSelectedLibrarySources : [];
    const text = (overrideText ?? input).trim();
    if (
      !text &&
      messageAttachments.length === 0 &&
      messageSelectedLibrarySources.length === 0
    ) {
      return;
    }

    const textWithLibraryContext = appendLibraryContextToMessage(
      text,
      messageSelectedLibrarySources
    );
    const content = buildUserContent(
      textWithLibraryContext,
      messageAttachments
    );

    // Save user message
    const userMessage = await sendMessageMutation.mutateAsync({
      conversationId,
      content: typeof content === "string" ? content : JSON.stringify(content),
      attachments: messageAttachments.map(attachment => ({
        type: attachment.fileType.startsWith("image/")
          ? ("image" as const)
          : ("file" as const),
        url: attachment.url,
        name: attachment.fileName,
      })),
    });

    // Add to local state immediately
    setMessages(prev => [
      ...prev,
      {
        id: userMessage.id,
        role: "user" as const,
        content: typeof content === "string" ? content : text,
        attachments: messageAttachments.map(attachment => ({
          type: attachment.fileType,
          url: attachment.url,
          name: attachment.fileName,
        })),
        createdAt: new Date(userMessage.createdAt),
      },
    ]);

    if (useComposerContext) {
      setInput("");
      setAttachments([]);
      setSelectedLibrarySources([]);
    }
    setDetectedSkill(null);
    scrollToBottom();
    onUserMessageSent?.(text);

    // Auto-generate title for new conversations
    if (messages.length === 0 && onTitleUpdate && text) {
      const title = text.substring(0, 50) + (text.length > 50 ? "..." : "");
      onTitleUpdate(title);
    }

    // Capture the detected skill before clearing it
    // If message starts with "/" and debounced detection hasn't fired yet,
    // do an immediate detection so explicit slash commands always work.
    const isSlashCommand = text.trim().startsWith("/");
    const isExplicitSkillRequest =
      skillIntentEnabled && looksLikeSkillRequest(text);
    const shouldAutoRunSkill = isSlashCommand
      ? shouldAutoRunDetectedSkill({
          text,
          detectedSkill,
        })
      : skillIntentEnabled &&
        shouldAutoRunDetectedSkill({
          text,
          detectedSkill,
        });
    let resolvedSkill = resolveDetectedSkillForSend({
      sessionLocalOnlyEnabled,
      detectedSkill: shouldAutoRunSkill ? detectedSkill : null,
    });
    if (
      !resolvedSkill &&
      sessionLocalOnlyEnabled &&
      isSlashCommand &&
      conversationId
    ) {
      const slashMatch = text.trim().match(/^\/([a-zA-Z0-9-_]+)/);
      if (slashMatch?.[1]) {
        try {
          const skill = await utils.skills.get.fetch({
            id: slashMatch[1],
            platform: localAiRuntimePlatform,
            origin: "chat",
            conversationId,
          });
          resolvedSkill = {
            id: skill.id,
            name: skill.name,
            type: skill.type,
            confidence: 1,
            suggestedPrompt:
              text
                .trim()
                .replace(new RegExp(`^/${slashMatch[1]}\\s*`), "") || text,
            executionMode: skill.executionMode || "llm-only",
            chainTo: skill.chainTo || null,
            patternChainTo: null,
          };
        } catch {
          resolvedSkill = null;
        }
      }
    }
    if (
      !resolvedSkill &&
      !sessionLocalOnlyEnabled &&
      isSlashCommand &&
      conversationId
    ) {
      try {
        const result = await detectSkillMutation.mutateAsync({
          message: text,
          conversationId,
        });
        if (result.detected && result.skill) {
          resolvedSkill = {
            id: result.skill.id,
            name: result.skill.name,
            type: result.skill.type,
            confidence: result.confidence,
            suggestedPrompt: result.suggestedPrompt,
            executionMode: result.skill.executionMode || "llm-only",
            chainTo: result.skill.chainTo || null,
            patternChainTo: result.patternChainTo || null,
          };
        }
      } catch {
        // Skill detection failed — continue with normal LLM flow
      }
    }

    // ── Intent-based routing (shared logic with Teams via routeRoomIntent) ────
    // Use analyzeIntent for routing decisions UNLESS we already have an explicit
    // slash command. This ensures Chat and Teams use the same routing pipeline.
    if (
      !resolvedSkill &&
      !sessionLocalOnlyEnabled &&
      isExplicitSkillRequest &&
      !isSlashCommand
    ) {
      try {
        const intent = await analyzeIntentMutation.mutateAsync({
          message: text,
          conversationId,
          hasImages: messageAttachments.some(attachment =>
            attachment.fileType.startsWith("image/")
          ),
        });

        // Agency escalation — complex multi-step request (e.g., "สร้างภาพ และ ข้อความ")
        if (intent.route === "agency" && intent.agencyEscalation) {
          const assistantContent =
            "This request requires multiple coordinated steps. Let me check if an AI Agency can handle this.";
          const saved = await saveAssistantMessageMutation
            .mutateAsync({
              conversationId: conversationId!,
              content: assistantContent,
            })
            .catch(() => null);
          markLocalAdd();
          setMessages(prev => [
            ...prev,
            {
              id: saved?.id ?? Date.now(),
              role: "assistant" as const,
              content: assistantContent,
              runtimeMetadata: saved?.runtimeMetadata ?? null,
              createdAt: new Date(),
            },
          ]);
          setPendingAgencyEscalation({
            message: text,
            reason: intent.reason,
            modalities: intent.taskProfile?.modalities ?? [],
            complexity: intent.taskProfile?.complexity ?? "single",
          });
          return; // Exit — wait for user action on the escalation card
        }

        if (intent.route === "hybrid" && intent.hybridPlan) {
          const assistantContent =
            "I found a possible hybrid workflow for this request. Please confirm whether you want to open the hybrid flow, or keep this as a normal chat question.";
          markLocalAdd();
          setMessages(prev => [
            ...prev,
            {
              id: Date.now(),
              role: "assistant" as const,
              content: assistantContent,
              createdAt: new Date(),
            },
          ]);
          setPendingHybridOrchestration({
            message: text,
            reason: intent.reason,
            plan: intent.hybridPlan,
            fallbackUserMessage: {
              id: userMessage.id,
              role: "user" as const,
              content: typeof content === "string" ? content : text,
              createdAt: new Date(userMessage.createdAt),
            },
            retrievalQueryText: text,
          });
          return;
        }

        // Skill detected by intent router — enrich resolvedSkill from server decision
        if (
          intent.route === "skill" &&
          intent.selectedSkillId &&
          intent.skillMeta
        ) {
          resolvedSkill = {
            id: intent.selectedSkillId,
            name: intent.skillMeta.name,
            type: intent.skillMeta.type,
            confidence: intent.confidence,
            suggestedPrompt: null,
            executionMode: intent.skillMeta.executionMode || "llm-only",
            chainTo: intent.skillMeta.chainTo || null,
            patternChainTo: null,
          };
        }
      } catch {
        // Intent analysis failed — fall through to existing detection/flow
      }
    }

    const currentSkillId = resolvedSkill?.id;
    const currentSkillType = resolvedSkill?.type;
    const skillPrompt = resolvedSkill?.suggestedPrompt || text;
    const currentChainTo = resolvedSkill?.chainTo;
    // Per-pattern chainTo takes precedence over skill-level chainTo
    const currentPatternChainTo = resolvedSkill?.patternChainTo;

    // Detect image reference patterns — image edit OR video-from-image requests
    const imageReferencePattern =
      /(?:แก้ไขภาพนี้|ช่วยแก้ไขภาพ|แก้ไขภาพ|ด้วยรูปนี้|ด้วยภาพนี้|จากรูปนี้|จากภาพนี้|ตามรูปนี้|ตามภาพนี้|ด้วยรูป|ด้วยภาพ|ตามรูป|ตามภาพ|รูปอ้างอิง|ภาพอ้างอิง|ภาพ\s*ref(?:erence)?|รูป\s*ref(?:erence)?|edit\s*(?:this\s*)?image|modify\s*(?:this\s*)?image|change\s*(?:this\s*)?image|with\s+this\s+image|from\s+this\s+image|using\s+this\s+image|based\s+on\s+this\s+image|image\s+ref(?:erence)?|ref(?:erence)?\s+image|img\s+ref(?:erence)?|use\s+(?:the\s+)?(?:above|previous|last)\s+image)/i;
    const isImageEditRequest = imageReferencePattern.test(text);

    // Find reference image for image-to-image or image-to-video generation
    let referenceImageUrl: string | null = null;
    if (isImageEditRequest) {
      const userImageAttachment = messageAttachments.find(attachment =>
        attachment.fileType.startsWith("image/")
      );
      if (userImageAttachment) {
        referenceImageUrl = userImageAttachment.url;
      } else {
        const messagesReversed = [...messages].reverse();
        for (const msg of messagesReversed) {
          const imageAttachment = msg.attachments?.find(
            a =>
              a.type?.startsWith("image") ||
              a.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
          );
          if (imageAttachment) {
            referenceImageUrl = imageAttachment.url;
            break;
          }
        }
      }
    }

    // Context-aware prompt extraction: detect "use this prompt" / "ด้วยพรอมต์นี้" patterns
    const useThisPromptPattern =
      /(?:ด้วยพรอมต์นี้|ใช้พรอมต์นี้|with\s+this\s+prompt|use\s+this\s+prompt|ตามพรอมต์ที่แล้ว|from\s+previous|พรอมต์ข้างบน|พรอมต์ด้านบน)/i;
    const isUseThisPromptRequest = useThisPromptPattern.test(text);

    // Also detect "สร้างภาพ" without specific description (implying use previous prompt)
    const isImageRequestWithoutDetails =
      /^(?:สร้างภาพ|generate\s+image|create\s+image)\s*(?:ด้วย|with|ใช้|from|ตาม)?/i.test(
        text
      ) && text.length < 50;

    if (
      (isUseThisPromptRequest || isImageRequestWithoutDetails) &&
      (currentSkillType === "image-generation" || !currentSkillId)
    ) {
      // Find the last assistant message to extract prompt
      const lastAssistantMessage = [...messages]
        .reverse()
        .find(m => m.role === "assistant");

      if (lastAssistantMessage) {
        const msgContent =
          typeof lastAssistantMessage.content === "string"
            ? lastAssistantMessage.content
            : JSON.stringify(lastAssistantMessage.content);

        // Try to extract prompt and media parameters from various formats
        let extractedPrompt: string | null = null;
        let extractedParams: Record<string, any> = {};

        // Try JSON format first (to get all parameters)
        try {
          const jsonMatch = msgContent.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1].trim());
            if (parsed.prompt) {
              extractedPrompt = parsed.prompt;
              // Extract all media parameters
              if (parsed.aspectRatio)
                extractedParams.aspectRatio = parsed.aspectRatio;
              if (parsed.style) extractedParams.style = parsed.style;
              if (parsed.numImages)
                extractedParams.numImages = parsed.numImages;
              if (parsed.quality) extractedParams.quality = parsed.quality;
              if (parsed.model) extractedParams.model = parsed.model;
            }
          }
        } catch {
          // Not JSON
        }

        // Simple fallback: Send entire previous message content to image-creator
        // Let the LLM/skill extract the prompt intelligently
        if (!extractedPrompt && msgContent.length > 10) {
          // Prefix with context so image-creator knows to extract prompt from this content
          extractedPrompt = `สร้างภาพจากพรอมต์ในข้อความนี้:\n\n${msgContent}`;
        }

        if (extractedPrompt && extractedPrompt.length > 10) {
          // Execute image-creator directly with extracted prompt and parameters
          setIsStreaming(true);
          const paramsInfo =
            Object.keys(extractedParams).length > 0
              ? ` (${Object.entries(extractedParams)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")})`
              : "";
          setStreamingContent(
            `Using prompt from previous message to create image...${paramsInfo}`
          );

          try {
            const result = await preferredSkillExecution.execute({
              skillId: "image-creator",
              prompt: extractedPrompt,
              dynamicParams: extractedParams,
              mutationInput: {
                ...(referenceImageUrl
                  ? { referenceImageUrls: [referenceImageUrl] }
                  : {}),
              },
            });

            if (!result) {
              throw new Error("Skill execution returned no result");
            }

            let responseContent = "";
            let imageAttachments: Array<{
              type: "image";
              url: string;
              name: string;
            }> = [];

            if (result.success) {
              if (
                result.type === "image" &&
                result.resultUrls &&
                result.resultUrls.length > 0
              ) {
                responseContent = `Generated image using prompt:\n> ${extractedPrompt.substring(0, 100)}${extractedPrompt.length > 100 ? "..." : ""}\n\n${result.resultUrls.map(url => `![Generated Image](${url})`).join("\n\n")}`;
                imageAttachments = result.resultUrls.map((url, i) => ({
                  type: "image" as const,
                  url,
                  name: `generated-image-${i + 1}.png`,
                }));
              } else if (result.resultUrl) {
                responseContent = `Generated image using prompt:\n> ${extractedPrompt.substring(0, 100)}${extractedPrompt.length > 100 ? "..." : ""}\n\n![Generated Image](${result.resultUrl})`;
                imageAttachments = [
                  {
                    type: "image" as const,
                    url: result.resultUrl,
                    name: "generated-image.png",
                  },
                ];
              } else {
                responseContent =
                  result.message || "Image generated successfully!";
              }
              if (result.creditsUsed) {
                responseContent += `\n\n*Credits used: ${result.creditsUsed}*`;
              }
              if (result.creditsUsed && result.creditsUsed > 0) {
                addSkillCreditsMutation.mutate({
                  conversationId,
                  creditsUsed: result.creditsUsed,
                  skillUsed: "image-creator",
                });
              }
            } else {
              responseContent = `Failed to generate image: ${result.error || "Unknown error"}`;
            }

            markLocalAdd();
            setMessages(prev => [
              ...prev,
              {
                id: Date.now(),
                role: "assistant" as const,
                content: responseContent,
                attachments:
                  imageAttachments.length > 0 ? imageAttachments : undefined,
                creditsUsed: result.creditsUsed?.toString(),
                skillUsed: "image-creator",
                createdAt: new Date(),
              },
            ]);
            setStreamingContent("");
            setIsStreaming(false);
            utils.chat.getMessages.invalidate({ conversationId });
            utils.credits.balance.invalidate();
          } catch (error) {
            console.error("Context-aware image generation error:", error);
            markLocalAdd();
            setMessages(prev => [
              ...prev,
              {
                id: Date.now(),
                role: "assistant" as const,
                content: `Could not generate image: ${error instanceof Error ? error.message : "Unknown error"}\n\nExtracted prompt was: "${extractedPrompt}"`,
                skillUsed: "image-creator",
                createdAt: new Date(),
              },
            ]);
            setStreamingContent("");
            setIsStreaming(false);
          }
          return; // Exit early - don't continue with normal flow
        } else {
          // Could not extract prompt - inform user
          markLocalAdd();
          setMessages(prev => [
            ...prev,
            {
              id: Date.now(),
              role: "assistant" as const,
              content:
                "ไม่พบพรอมต์ในข้อความก่อนหน้า กรุณาสร้างพรอมต์ก่อน หรือพิมพ์คำอธิบายภาพที่ต้องการสร้างโดยตรง\n\n(Could not find a prompt in the previous message. Please generate a prompt first, or type the image description directly.)",
              createdAt: new Date(),
            },
          ]);
          return; // Exit early
        }
      }
    }

    // ── Presentation auto-creation from chat ───────────────────
    // Thai patterns: สร้าง/ทำ/ช่วยทำ + presentation/สไลด์/งานนำเสนอ/ppt
    // English patterns: make/create/generate/build/prepare + presentation/slides/ppt/deck
    const presentationIntentPattern =
      /(?:(?:ช่วย)?(?:สร้าง|ทำ)\s*(?:presentation|เพรเซนเทชัน|สไลด์|slide|พรีเซนเทชั่น|ppt|งานนำเสนอ)|(?:make|create|generate|build|prepare)\s+(?:a\s+)?(?:presentation|slides?|ppt|deck)(?:\s+(?:about|on|for|เกี่ยวกับ|เรื่อง))?|I\s+want\s+(?:a\s+)?(?:presentation|slides?)\s+(?:about|on|for))/i;
    const isPresentationRequest = presentationIntentPattern.test(text);

    if (isPresentationRequest) {
      // ── Check if this is a SCHEDULED presentation request ────────
      // Thai: ทุกวัน, ทุกวันจันทร์, ตี1, ตอนเช้า, ทุกสัปดาห์, กำหนดเวลา
      // English: every day, every Monday, daily, weekly, at 1am, schedule, cron
      const schedulePattern =
        /(?:ทุกวัน|ทุก\s*(?:วัน(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)?|สัปดาห์|เดือน)|ตี\s*\d|ตอน(?:เช้า|บ่าย|เย็น|ดึก|เที่ยง|เช้ามืด)|every\s+(?:day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|night)|daily|weekly|monthly|at\s+\d{1,2}\s*(?:am|pm|:)|schedule|cron)/i;
      const isScheduledPresentation = schedulePattern.test(text);

      if (isScheduledPresentation) {
        // Route to schedule flow — let parseIntent handle the cron expression
        let scheduledPresentationHandled = false;
        try {
          // Extract topic + slide count for dynamicParams
          const scMatch = text.match(
            /จำนวน\s*(\d+)|(\d+)\s*(?:slides?|สไลด์|แผ่น|หน้า)/i
          );
          const scSlides = scMatch
            ? parseInt(scMatch[1] || scMatch[2] || "5", 10)
            : 5;
          const scTopicClean = text
            .replace(
              /(?:(?:ช่วย)?(?:สร้าง|ทำ)\s*(?:presentation|เพรเซนเทชัน|สไลด์|slide|พรีเซนเทชั่น|ppt|งานนำเสนอ)|(?:make|create|generate|build|prepare)\s+(?:a\s+)?(?:presentation|slides?|ppt|deck))\s*(?:about|on|for|เกี่ยวกับ|เรื่อง)?\s*/i,
              ""
            )
            .replace(
              /\s*(?:จำนวน\s*\d+\s*(?:สไลด์|slide|แผ่น|หน้า)?|\d+\s*(?:slides?|สไลด์|แผ่น|หน้า))\s*/gi,
              ""
            )
            .replace(
              /\s*(?:เสร็จแล้วแจ้ง|แจ้งเมื่อเสร็จ|notify\s+(?:me\s+)?when\s+done)\s*/gi,
              ""
            )
            .replace(
              /\s*(?:ทุกวัน|ทุก\s*(?:วัน(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)?|สัปดาห์|เดือน)|ตี\s*\d+|ตอน(?:เช้า|บ่าย|เย็น|ดึก|เที่ยง|เช้ามืด))\s*/gi,
              ""
            )
            .replace(
              /\s*(?:every\s+(?:day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|night)|daily|weekly|monthly|at\s+\d{1,2}\s*(?:am|pm|:\d{2}))\s*/gi,
              ""
            )
            .trim();

          const parsed = await parseIntentMutation.mutateAsync({
            message: text,
            model: selectedModel || conversation?.model || undefined,
            sourceType: "chat",
          });

          // Override parsed result to use auto-draft-presentation skill
          const scheduleParsed = {
            ...parsed,
            prompt: `Auto Draft Presentation: ${scTopicClean || "General Topic"}`,
            description: `Scheduled Presentation: ${scTopicClean || "General Topic"} (${scSlides} slides)`,
            skillId: "auto-draft-presentation",
            dynamicParams: {
              topic: scTopicClean || "General Topic",
              numSlides: Math.min(Math.max(scSlides, 1), 30),
            },
          };

          if (hasParsedScheduleTiming(scheduleParsed)) {
            scheduledPresentationHandled = true;
            setPendingSchedule(scheduleParsed);
            const schedContent = `I detected a scheduled presentation request. Please confirm the schedule below.`;
            const schedSaved = conversationId
              ? await saveAssistantMessageMutation
                  .mutateAsync({
                    conversationId,
                    content: schedContent,
                    skillUsed: "chat-alert",
                  })
                  .catch(() => null)
              : null;
            markLocalAdd();
            setMessages(prev => [
              ...prev,
              {
                id: schedSaved?.id ?? Date.now(),
                role: "assistant" as const,
                content: schedContent,
                createdAt: new Date(),
                skillUsed: "chat-alert",
                runtimeMetadata: schedSaved?.runtimeMetadata ?? null,
              },
            ]);
          }
        } catch (err) {
          console.warn("[ChatView] Scheduled presentation parse failed:", err);
          // Fall through to immediate generation
        }
        if (scheduledPresentationHandled) {
          return;
        }
      }

      // ── Immediate presentation generation (no schedule) ─────────
      // Extract slide count: "จำนวน 10 สไลด์", "10 slides", "3 หน้า"
      const slideCountMatch = text.match(
        /จำนวน\s*(\d+)|(\d+)\s*(?:slides?|สไลด์|แผ่น|หน้า)/i
      );
      const numSlides = slideCountMatch
        ? parseInt(slideCountMatch[1] || slideCountMatch[2] || "5", 10)
        : 5;

      // Extract aspect ratio: "16:9", "9:16", "แนวนอน", "แนวตั้ง", "landscape", "portrait"
      const aspectRatioMatch = text.match(
        /(?:ขนาด\s*)?(?:16\s*:\s*9|9\s*:\s*16)|(?:แนวนอน|แนวตั้ง|landscape|portrait)/i
      );
      let canvasWidth: number | undefined;
      let canvasHeight: number | undefined;
      if (aspectRatioMatch) {
        const matched = aspectRatioMatch[0].toLowerCase().replace(/\s/g, "");
        if (
          matched.includes("9:16") ||
          matched.includes("แนวตั้ง") ||
          matched === "portrait"
        ) {
          canvasWidth = 720;
          canvasHeight = 1280;
        } else {
          canvasWidth = 1280;
          canvasHeight = 720;
        }
      }

      // Extract language: "ภาษาไทย", "ภาษาอังกฤษ", "in Thai", "in English"
      const langMatch = text.match(
        /(?:ภาษา\s*(?:ไทย|อังกฤษ|english|thai))|(?:(?:in|ใน)\s*(?:Thai|English|ไทย|อังกฤษ))/i
      );
      let language: "auto" | "en" | "th" | undefined;
      if (langMatch) {
        const langStr = langMatch[0].toLowerCase();
        if (langStr.includes("ไทย") || langStr.includes("thai")) {
          language = "th";
        } else if (langStr.includes("อังกฤษ") || langStr.includes("english")) {
          language = "en";
        }
      }

      // Extract topic: remove trigger phrase, slide count, aspect ratio, and language
      const topicClean = text
        .replace(
          /(?:(?:ช่วย)?(?:สร้าง|ทำ)\s*(?:presentation|เพรเซนเทชัน|สไลด์|slide|พรีเซนเทชั่น|ppt|งานนำเสนอ)|(?:make|create|generate|build|prepare)\s+(?:a\s+)?(?:presentation|slides?|ppt|deck))\s*(?:about|on|for|เกี่ยวกับ|เรื่อง)?\s*/i,
          ""
        )
        .replace(
          /\s*(?:จำนวน\s*\d+\s*(?:สไลด์|slide|แผ่น|หน้า)?|\d+\s*(?:slides?|สไลด์|แผ่น|หน้า))\s*/gi,
          ""
        )
        .replace(
          /\s*(?:เสร็จแล้วแจ้ง|แจ้งเมื่อเสร็จ|notify\s+(?:me\s+)?when\s+done)\s*/gi,
          ""
        )
        .replace(/\s*(?:ขนาด\s*)?(?:16\s*:\s*9|9\s*:\s*16)\s*/gi, "")
        .replace(/\s*(?:แนวนอน|แนวตั้ง|landscape|portrait)\s*/gi, "")
        .replace(
          /\s*(?:ภาษา\s*(?:ไทย|อังกฤษ|english|thai)|(?:in|ใน)\s*(?:Thai|English|ไทย|อังกฤษ))\s*/gi,
          ""
        )
        .trim();

      if (topicClean.length < 3) {
        // User provided trigger phrase but no meaningful topic
        const promptContent =
          'Please provide a topic for your presentation.\n\nExamples:\n- "สร้าง presentation เรื่อง Digital Marketing จำนวน 5 สไลด์"\n- "สร้าง presentation เรื่อง AI 10 slides ขนาด 16:9 ภาษาอังกฤษ"\n- "create presentation about AI in Healthcare 9:16 portrait"';
        const saved = await saveAssistantMessageMutation
          .mutateAsync({
            conversationId: conversationId!,
            content: promptContent,
          })
          .catch(() => null);
        markLocalAdd();
        setMessages(prev => [
          ...prev,
          {
            id: saved?.id ?? Date.now(),
            role: "assistant" as const,
            content: promptContent,
            runtimeMetadata: saved?.runtimeMetadata ?? null,
            createdAt: new Date(),
          },
        ]);
        return;
      }

      setIsStreaming(true);
      setStreamingContent("Auto-generating presentation...");

      try {
        const result = await autoGeneratePresentationMutation.mutateAsync({
          topic: topicClean,
          numSlides: Math.min(Math.max(numSlides, 1), 30),
          ...(canvasWidth ? { canvasWidth } : {}),
          ...(canvasHeight ? { canvasHeight } : {}),
          ...(language ? { language } : {}),
        });

        const aspectLabel =
          canvasWidth && canvasHeight
            ? canvasWidth > canvasHeight
              ? "16:9"
              : "9:16"
            : "16:9";
        const langLabel =
          language === "th"
            ? "Thai"
            : language === "en"
              ? "English"
              : undefined;
        const editorUrl =
          result.editorUrl || `/presentation/${result.libraryItemId}`;
        const responseContent = [
          `Presentation created`,
          ``,
          `**Topic:** ${topicClean}`,
          `**Slides:** ${numSlides}`,
          `**Size:** ${aspectLabel}`,
          ...(langLabel ? [`**Language:** ${langLabel}`] : []),
          ``,
          `[Open Presentation Editor](${editorUrl})`,
          ``,
          `_AI is generating content in the background — I'll notify you when it's ready._`,
        ].join("\n");

        // Save to database so it persists across page reloads
        const saved = await saveAssistantMessageMutation
          .mutateAsync({
            conversationId: conversationId!,
            content: responseContent,
            skillUsed: "auto-draft-presentation",
          })
          .catch(err => {
            console.error(
              "[ChatView] Failed to save presentation message:",
              err
            );
            return null;
          });

        markLocalAdd();
        setMessages(prev => [
          ...prev,
          {
            id: saved?.id ?? Date.now(),
            role: "assistant" as const,
            content: responseContent,
            runtimeMetadata: saved?.runtimeMetadata ?? null,
            createdAt: new Date(),
          },
        ]);

        // Start polling for completion
        if (!result.alreadyInProgress) {
          setPendingPresentationTask({
            taskId: result.taskId,
            editorUrl,
            topic: topicClean,
            numSlides,
          });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        const isRateLimit =
          errMsg.toLowerCase().includes("rate") ||
          errMsg.toLowerCase().includes("too many");
        const errorContent = isRateLimit
          ? "Too many presentation requests. Please wait a minute and try again."
          : `Could not create presentation: ${errMsg}`;

        // Save error message to database too
        const saved = await saveAssistantMessageMutation
          .mutateAsync({
            conversationId: conversationId!,
            content: errorContent,
            error: errMsg,
          })
          .catch(() => null);

        markLocalAdd();
        setMessages(prev => [
          ...prev,
          {
            id: saved?.id ?? Date.now(),
            role: "assistant" as const,
            content: errorContent,
            runtimeMetadata: saved?.runtimeMetadata ?? null,
            createdAt: new Date(),
          },
        ]);
      } finally {
        setStreamingContent("");
        setIsStreaming(false);
      }
      return; // Exit early — don't continue to normal LLM flow
    }

    // Check if this is a chat-alert (scheduling) skill
    if (
      (currentSkillId === "chat-alert" || currentSkillType === "automation") &&
      looksLikeScheduleIntent(text)
    ) {
      let scheduleIntentHandled = false;
      try {
        const parsed = await parseIntentMutation.mutateAsync({
          message: text,
          model: selectedModel || conversation?.model || undefined,
          sourceType: "chat",
        });
        if (hasParsedScheduleTiming(parsed)) {
          scheduleIntentHandled = true;
          setPendingSchedule(parsed);
          // Add assistant message about the schedule and persist it
          const alertContent = `I detected a scheduling request. Please confirm the details below.`;
          const alertSaved = conversationId
            ? await saveAssistantMessageMutation
                .mutateAsync({
                  conversationId,
                  content: alertContent,
                  skillUsed: "chat-alert",
                })
                .catch(() => null)
            : null;
          markLocalAdd();
          setMessages(prev => [
            ...prev,
            {
              id: alertSaved?.id ?? Date.now(),
              conversationId: conversationId || 0,
              role: "assistant" as const,
              content: alertContent,
              createdAt: new Date(),
              skillUsed: "chat-alert",
              runtimeMetadata: alertSaved?.runtimeMetadata ?? null,
            },
          ]);
        }
      } catch {
        // Fall through to normal chat if parse fails
      }
      if (scheduleIntentHandled) {
        return;
      }
    }

    // Execution mode determines skill behavior (from DB, no hardcoded patterns)
    const executionMode = resolvedSkill?.executionMode || "llm-only";
    const shouldForceOcrAssist = messageAttachments.some((attachment) =>
      looksLikeDocumentAttachment({
        attachment: {
          url: attachment.url,
          fileType: attachment.fileType,
          fileName: attachment.fileName,
        },
        userText: text,
      }),
    ) || (ocrOnlyMode && messageAttachments.length > 0);
    let attachmentAssistContext:
      | Awaited<ReturnType<typeof buildHybridAttachmentAssist>>
      | null = null;
    if (
      messageAttachments.length > 0 &&
      (shouldForceOcrAssist || (executionMode === "llm-only" && !currentSkillId)) &&
      messageAttachments.length > 0
    ) {
      try {
        attachmentAssistContext = await buildHybridAttachmentAssist({
          platform: localAiRuntimePlatform,
          preferences: chatSessionLocalAiPreferences,
          forceCloudOnly:
            localAiCatalogQuery.data?.policy.forceCloudOnly === true,
          preferRawDocumentOcr: shouldForceOcrAssist,
          forceDocumentOcr: ocrOnlyMode,
          catalog: localAiCatalogQuery.data?.catalog ?? [],
          capability: localAiCapability,
          scope: localAiDeviceScope,
          tauriRuntimeStatus,
          attachments: messageAttachments.map(
            (attachment): AttachmentAssistAttachment => ({
              url: attachment.url,
              fileType: attachment.fileType,
              fileName: attachment.fileName,
            }),
          ),
          userText: text,
          analyzeAttachmentAssist: payload =>
            analyzeAttachmentAssistMutation.mutateAsync(payload),
        });
      } catch {
        attachmentAssistContext = null;
      }
    }

    if (shouldForceOcrAssist) {
      const ocrText = attachmentAssistContext?.ocrResult?.extractedText?.trim() || "";
      const ocrCaption = attachmentAssistContext?.ocrResult?.caption?.trim() || "";
      const ocrWarning = attachmentAssistContext?.ocrResult?.warning?.trim() || "";
      const ocrFileName = messageAttachments[0]?.fileName || "attachment";
      const ocrContent = ocrText
        ? [
            `OCR result for ${ocrFileName}`,
            ocrCaption ? `Caption: ${ocrCaption}` : null,
            `Extracted text:\n${ocrText}`,
            ocrWarning ? `Warning: ${ocrWarning}` : null,
          ]
            .filter(Boolean)
            .join("\n\n")
        : [
            `OCR result for ${ocrFileName}`,
            ocrWarning || "Could not extract readable text from this attachment.",
          ]
            .filter(Boolean)
            .join("\n\n");

      const saved = await saveAssistantMessageMutation
        .mutateAsync({
          conversationId: conversationId!,
          content: ocrContent,
          runtimeMetadata: {
            source: "hybrid",
            taskClass: "document_ocr",
            profileId: attachmentAssistContext?.runtimeMetadataHint?.profileId ?? undefined,
          },
        })
        .catch(() => null);

      markLocalAdd();
      setMessages(prev => [
        ...prev,
        {
          id: saved?.id ?? Date.now(),
          role: "assistant" as const,
          content: ocrContent,
          runtimeMetadata: saved?.runtimeMetadata ?? {
            source: "hybrid",
            taskClass: "document_ocr",
            profileId: attachmentAssistContext?.runtimeMetadataHint?.profileId ?? undefined,
          },
          createdAt: new Date(),
        },
      ]);
      setStreamingContent("");
      setIsStreaming(false);
      utils.chat.getMessages.invalidate({ conversationId });
      utils.chat.listConversations.invalidate();
      utils.chat.getConversation.invalidate({ id: conversationId });
      void processMemoryMutation
        .mutateAsync({ conversationId })
        .catch(() => {});
      return;
    }

    const providerSideUserText =
      attachmentAssistContext?.providerContext &&
      attachmentAssistContext.providerContext.trim().length > 0
        ? `${textWithLibraryContext}\n\n${attachmentAssistContext.providerContext}`
        : textWithLibraryContext;
    const localReplyUserText =
      attachmentAssistContext?.localReplyContext &&
      attachmentAssistContext.localReplyContext.trim().length > 0
        ? `${text}\n\n${attachmentAssistContext.localReplyContext}`
        : text;

    const canAttemptLocalGeneralReply =
      sessionLocalOnlyEnabled &&
      (localAiRuntimePlatform === "tauri" ||
        localAiRuntimePlatform === "web") &&
      !currentSkillId &&
      executionMode === "llm-only" &&
      (messageAttachments.length === 0 ||
        attachmentAssistContext?.localOnlyCompatible === true) &&
      messageSelectedLibrarySources.length === 0;
    const shouldFailClosedForGeneralLocalOnly =
      !currentSkillId &&
      executionMode === "llm-only" &&
      shouldBlockCloudForLocalOnlyMode(
        chatSessionLocalAiPreferences.mode,
        localClientLlmModeEnabled && chatSessionLocalAiPreferences.enabled,
        localAiCatalogQuery.data?.policy.forceCloudOnly === true
      );

    if (shouldFailClosedForGeneralLocalOnly && !canAttemptLocalGeneralReply) {
      const localOnlyMessage =
        "Local-only mode is enabled for chat, but this request cannot run through the current local text path. Remove attachments/library context, prepare a compatible local model, configure a local API backend, or switch back to auto / prefer_local.";
      const saved = await saveAssistantMessageMutation
        .mutateAsync({
          conversationId: conversationId!,
          content: localOnlyMessage,
          error: "local_only_general_chat_blocked",
          runtimeMetadata: {
            source: "hybrid",
            taskClass: "general_chat",
          },
        })
        .catch(() => null);
      markLocalAdd();
      setMessages(prev => [
        ...prev,
        {
          id: saved?.id ?? Date.now(),
          role: "assistant" as const,
          content: localOnlyMessage,
          runtimeMetadata: saved?.runtimeMetadata ?? {
            source: "hybrid",
            taskClass: "general_chat",
            fallbackReason: "local_only_request_not_supported",
          },
          createdAt: new Date(),
        },
      ]);
      return;
    }

    if (canAttemptLocalGeneralReply) {
      setIsStreaming(true);
      setStreamingContent("Thinking locally...");
      const localReplyAbortController = new AbortController();
      activeLocalReplyAbortControllerRef.current = localReplyAbortController;
      setActiveLocalReplyKind(
        localAiRuntimePlatform === "web" ? "browser" : "tauri"
      );

      let localReply = null;
      let localReplyFailure: unknown = null;
      try {
        localReply = await generateTauriLocalGeneralReply({
          platform: localAiRuntimePlatform,
          preferences: chatSessionLocalAiPreferences,
          forceCloudOnly:
            localAiCatalogQuery.data?.policy.forceCloudOnly === true,
          catalog: localAiCatalogQuery.data?.catalog ?? [],
          capability: localAiCapability,
          scope: localAiDeviceScope,
          recentMessages: buildRecentLocalReplyContext(
            localReplyUserText
          ),
          userText: localReplyUserText,
          onPartialText: partialText => {
            setStreamingContent(
              partialText.trim().length > 0
                ? partialText
                : "Thinking locally..."
            );
          },
          abortSignal: localReplyAbortController.signal,
        });
      } catch (error) {
        if (
          isBrowserLocalRuntimeAbortError(error) ||
          isExternalLocalTextBackendAbortError(error) ||
          isTauriLocalRuntimeAbortError(error)
        ) {
          setStreamingContent("");
          setIsStreaming(false);
          return;
        }
        localReplyFailure = error;
      } finally {
        if (
          activeLocalReplyAbortControllerRef.current ===
          localReplyAbortController
        ) {
          activeLocalReplyAbortControllerRef.current = null;
        }
        setActiveLocalReplyKind(null);
      }

      if (localReply) {
        const saved = await saveAssistantMessageMutation
          .mutateAsync({
            conversationId: conversationId!,
            content: localReply.text,
            modelUsed: localReply.profileId,
            runtimeMetadata: {
              source: "hybrid",
              taskClass:
                attachmentAssistContext?.runtimeMetadataHint?.taskClass ??
                "general_chat",
              profileId: localReply.profileId,
              provider: localReply.provider ?? undefined,
              model: localReply.model ?? localReply.profileId,
            },
          })
          .catch(() => null);

        markLocalAdd();
        setMessages(prev => [
          ...prev,
          {
            id: saved?.id ?? Date.now(),
            role: "assistant" as const,
            content: localReply.text,
            modelUsed: localReply.profileId,
            runtimeMetadata: saved?.runtimeMetadata ?? {
              source: "hybrid",
              taskClass:
                attachmentAssistContext?.runtimeMetadataHint?.taskClass ??
                "general_chat",
              profileId: localReply.profileId,
              provider: localReply.provider ?? undefined,
              model: localReply.model ?? localReply.profileId,
            },
            createdAt: new Date(),
          },
        ]);
        setStreamingContent("");
        setIsStreaming(false);
        utils.chat.getMessages.invalidate({ conversationId });
        utils.chat.listConversations.invalidate();
        utils.chat.getConversation.invalidate({ id: conversationId });
        void processMemoryMutation
          .mutateAsync({ conversationId })
          .catch(() => {});
        return;
      }

      if (shouldFailClosedForGeneralLocalOnly) {
        const localOnlyMessage =
          buildLocalRuntimeFailureMessage(localReplyFailure);
        const saved = await saveAssistantMessageMutation
          .mutateAsync({
            conversationId: conversationId!,
            content: localOnlyMessage,
            error: "local_gemma4_general_reply_unavailable",
            runtimeMetadata: {
              source: "hybrid",
              taskClass: "general_chat",
              fallbackReason:
                localReplyFailure instanceof Error
                  ? localReplyFailure.message
                  : "local_only_unavailable",
            },
          })
          .catch(() => null);
        markLocalAdd();
        setMessages(prev => [
          ...prev,
          {
            id: saved?.id ?? Date.now(),
            role: "assistant" as const,
            content: localOnlyMessage,
            runtimeMetadata: saved?.runtimeMetadata ?? {
              source: "hybrid",
              taskClass: "general_chat",
              fallbackReason: "local_only_unavailable",
            },
            createdAt: new Date(),
          },
        ]);
        setStreamingContent("");
        setIsStreaming(false);
        return;
      }

      setStreamingContent("");
      setIsStreaming(false);
    }

    if (executionMode === "media-generate" && currentSkillId) {
      // media-generate: LLM generates structured prompt+params, then auto-call media API
      const generatedContent = await streamResponse(
        {
          id: userMessage.id,
          role: "user",
          content:
            typeof content === "string" ? content : textWithLibraryContext,
          createdAt: new Date(userMessage.createdAt),
        },
        currentSkillId,
        text,
        {
          runtimeMetadataHint: attachmentAssistContext?.runtimeMetadataHint,
        },
      );

      if (generatedContent) {
        // Parse structured JSON from LLM response
        let mediaPrompt = generatedContent;
        let mediaParams: Record<string, any> = {};

        try {
          // Try direct JSON parse
          let jsonContent = generatedContent.trim();
          // Strip markdown code fences if present
          const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) jsonContent = jsonMatch[1].trim();

          const parsed = JSON.parse(jsonContent);
          if (parsed.prompt) {
            mediaPrompt = parsed.prompt;
            // Image creator format
            if (parsed.aspectRatio)
              mediaParams.aspectRatio = parsed.aspectRatio;
            if (parsed.style) mediaParams.style = parsed.style;
            if (parsed.numImages) mediaParams.numImages = parsed.numImages;
            if (parsed.quality) mediaParams.quality = parsed.quality;
            if (parsed.model) mediaParams.model = parsed.model;
            if (parsed.duration) mediaParams.duration = parsed.duration;
            // Video prompt engineer format: params nested under metadata
            if (parsed.metadata?.aspect_ratio)
              mediaParams.aspectRatio = parsed.metadata.aspect_ratio;
            if (parsed.metadata?.duration)
              mediaParams.duration = parsed.metadata.duration;
          }
        } catch {
          // LLM didn't return valid JSON — use raw text as prompt
        }

        // Show prompt preview for user confirmation instead of auto-executing.
        // The user can edit the prompt, then confirm to trigger media generation.
        setPendingMediaPrompt({
          prompt: mediaPrompt,
          skillId: currentSkillId,
          skillName: resolvedSkill?.name || currentSkillId,
          skillCategory: resolvedSkill?.type || "",
          mediaParams: {
            ...mediaParams,
            ...(selectedMediaModel ? { model: selectedMediaModel } : {}),
            ...(referenceImageUrl
              ? { referenceImageUrls: [referenceImageUrl] }
              : {}),
          },
          conversationId: conversationId!,
        });
        // Exit — wait for user confirmation via MediaPromptPreview
      }
    } else {
      // Stream response for regular chat (non-media skills)
      const generatedContent = await streamResponse(
        {
          id: userMessage.id,
          role: "user",
          content: providerSideUserText,
          createdAt: new Date(userMessage.createdAt),
        },
        currentSkillId,
        text,
        {
          runtimeMetadataHint: attachmentAssistContext?.runtimeMetadataHint,
        },
      );

      // Handle skill chaining:
      // Priority: 1. Per-pattern chainTo (from matched trigger pattern)
      //           2. Skill-level chainTo
      const effectiveChainTo = currentPatternChainTo || currentChainTo;

      if (generatedContent && effectiveChainTo && currentSkillId) {
        // Extract prompt and parameters from generated content
        let chainedPrompt = generatedContent;
        let chainedParams: Record<string, any> = {};

        // Try JSON extraction first (to get all parameters)
        try {
          const jsonMatch = generatedContent.match(
            /```(?:json)?\s*([\s\S]*?)```/
          );
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1].trim());
            if (parsed.prompt) {
              chainedPrompt = parsed.prompt;
              // Extract all media parameters
              if (parsed.aspectRatio)
                chainedParams.aspectRatio = parsed.aspectRatio;
              if (parsed.style) chainedParams.style = parsed.style;
              if (parsed.numImages) chainedParams.numImages = parsed.numImages;
              if (parsed.quality) chainedParams.quality = parsed.quality;
              if (parsed.model) chainedParams.model = parsed.model;
            }
          }
        } catch {
          // Not JSON - try text patterns
          // First try: prompt with any quotes - "พรอมต์: \"...\""
          // Quote types: straight " ' and curly "" ''
          let promptMatch = generatedContent.match(
            /(?:พรอมต์|Prompt|prompt)\s*[:：]\s*["'""'']([^"'""'']+)["'""'']/i
          );
          if (promptMatch) {
            chainedPrompt = promptMatch[1].trim();
          } else {
            // Second try: prompt without quotes but with colon - "พรอมต์: ..."
            promptMatch = generatedContent.match(
              /(?:พรอมต์|Prompt|prompt)\s*[:：]\s*([^\n]+?)(?:\n|$)/i
            );
            if (promptMatch) {
              // Remove surrounding quotes of all types
              chainedPrompt = promptMatch[1]
                .trim()
                .replace(/^["'""'']|["'""'']$/g, "");
            }
          }
        }

        // Small delay to show the prompt first
        await new Promise(r => setTimeout(r, 800));

        // Now trigger the chained skill (e.g., image-creator)
        setIsStreaming(true);
        const paramsInfo =
          Object.keys(chainedParams).length > 0
            ? ` (${Object.entries(chainedParams)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")})`
            : "";
        setStreamingContent(
          `Using generated prompt to create image...${paramsInfo}`
        );

        try {
          const result = await preferredSkillExecution.execute({
            skillId: effectiveChainTo,
            prompt: chainedPrompt,
            dynamicParams: chainedParams,
            mutationInput: {
              ...(referenceImageUrl
                ? { referenceImageUrls: [referenceImageUrl] }
                : {}),
            },
          });

          if (!result) {
            throw new Error("Skill execution returned no result");
          }

          let responseContent = "";
          let imageAttachments: Array<{
            type: "image";
            url: string;
            name: string;
          }> = [];

          if (result.success) {
            if (
              result.type === "image" &&
              result.resultUrls &&
              result.resultUrls.length > 0
            ) {
              responseContent = `Generated image:\n\n${result.resultUrls.map(url => `![Generated Image](${url})`).join("\n\n")}`;
              imageAttachments = result.resultUrls.map((url, i) => ({
                type: "image" as const,
                url,
                name: `generated-image-${i + 1}.png`,
              }));
            } else if (result.resultUrl) {
              responseContent = `Generated image:\n\n![Generated Image](${result.resultUrl})`;
              if (result.type === "image") {
                imageAttachments = [
                  {
                    type: "image" as const,
                    url: result.resultUrl,
                    name: "generated-image.png",
                  },
                ];
              }
            } else {
              responseContent =
                result.message || "Image generated successfully!";
            }
            if (result.creditsUsed) {
              responseContent += `\n\n*Credits used: ${result.creditsUsed}*`;
            }
            if (result.creditsUsed && result.creditsUsed > 0) {
              addSkillCreditsMutation.mutate({
                conversationId,
                creditsUsed: result.creditsUsed,
                skillUsed: effectiveChainTo,
              });
            }
          } else {
            responseContent = `Failed to generate image: ${result.error || "Unknown error"}`;
          }

          markLocalAdd();
          setMessages(prev => [
            ...prev,
            {
              id: Date.now(),
              role: "assistant" as const,
              content: responseContent,
              attachments:
                imageAttachments.length > 0 ? imageAttachments : undefined,
              creditsUsed: result.creditsUsed?.toString(),
              skillUsed: effectiveChainTo,
              createdAt: new Date(),
            },
          ]);
          setStreamingContent("");
          setIsStreaming(false);
          utils.chat.getMessages.invalidate({ conversationId });
          utils.credits.balance.invalidate();
        } catch (error) {
          console.error("Chained skill execution error:", error);
          markLocalAdd();
          setMessages(prev => [
            ...prev,
            {
              id: Date.now(),
              role: "assistant" as const,
              content: `Prompt generated above. Image generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
              skillUsed: effectiveChainTo,
              createdAt: new Date(),
            },
          ]);
          setStreamingContent("");
          setIsStreaming(false);
        }
      }
    }
  };

  submitVoiceCommandRef.current = async (text: string) => {
    await onSend(text, { ignoreComposerContext: true });
  };

  // ── Handler: user confirms generated prompt → execute media skill ─────────
  const handleMediaPromptConfirm = async (
    editedPrompt: string,
    params: Record<string, unknown>
  ) => {
    if (!pendingMediaPrompt) return;
    const { skillId, conversationId: convId } = pendingMediaPrompt;

    setIsStreaming(true);
    setStreamingContent("Generating media from confirmed prompt...");
    setPendingMediaPrompt(null);

    try {
      const result = await preferredSkillExecution.execute({
        skillId,
        prompt: editedPrompt,
        dynamicParams: params,
        mutationInput:
          typeof convId === "number" && convId > 0
            ? { conversationId: convId }
            : undefined,
      });

      if (!result) {
        throw new Error("Skill execution returned no result");
      }

      let responseContent = "";
      let imageAttachments: Array<{
        type: "image";
        url: string;
        name: string;
      }> = [];

      if (result.success) {
        if (
          result.type === "image" &&
          result.resultUrls &&
          result.resultUrls.length > 0
        ) {
          responseContent = `Generated image${result.resultUrls.length > 1 ? "s" : ""}:\n\n${result.resultUrls.map(url => `![Generated Image](${url})`).join("\n\n")}`;
          imageAttachments = result.resultUrls.map((url, i) => ({
            type: "image" as const,
            url,
            name: `generated-image-${i + 1}.png`,
          }));
        } else if (result.type === "video" && result.isAsync) {
          responseContent = `Video generation started. ${result.message}\n\nYou can check the progress in the Media History page.`;
        } else if (result.resultUrl) {
          responseContent = `Generated ${result.type}:\n\n${result.type === "image" ? `![Generated Image](${result.resultUrl})` : `[View ${result.type}](${result.resultUrl})`}`;
          if (result.type === "image") {
            imageAttachments = [
              {
                type: "image" as const,
                url: result.resultUrl,
                name: "generated-image.png",
              },
            ];
          }
        } else {
          responseContent = result.message || "Media generated successfully!";
        }
        if (result.creditsUsed) {
          responseContent += `\n\n*Credits used: ${result.creditsUsed}*`;
        }
        if (result.creditsUsed && result.creditsUsed > 0) {
          addSkillCreditsMutation.mutate({
            conversationId: convId,
            creditsUsed: result.creditsUsed,
            skillUsed: skillId,
          });
        }
      } else {
        responseContent = `Failed to generate media: ${result.error || "Unknown error"}`;
      }

      markLocalAdd(convId);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant" as const,
          content: responseContent,
          attachments:
            imageAttachments.length > 0 ? imageAttachments : undefined,
          creditsUsed: result.creditsUsed?.toString(),
          skillUsed: skillId,
          createdAt: new Date(),
        },
      ]);
      utils.chat.getMessages.invalidate({ conversationId: convId });
      utils.credits.balance.invalidate();
    } catch (error) {
      console.error("Media generation from confirmed prompt error:", error);
      markLocalAdd(convId);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant" as const,
          content: `Media generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          skillUsed: skillId,
          createdAt: new Date(),
        },
      ]);
    } finally {
      setStreamingContent("");
      setIsStreaming(false);
    }
  };

  // ── Handler: user cancels media prompt preview ──────────────────────────
  const handleMediaPromptCancel = () => {
    setPendingMediaPrompt(null);
  };

  // ── Handler: user delegates to agency ───────────────────────────────────
  const handleAgencyDelegation = (agencyId: string) => {
    setPendingAgencyEscalation(null);
    // Navigate to agency chat with the original message
    window.location.href = `/agency/${agencyId}`;
  };

  // ── Handler: user keeps complex request in chat ─────────────────────────
  const handleKeepInChat = () => {
    setPendingAgencyEscalation(null);
    // The message was already sent — LLM will respond via normal stream
  };

  const handleKeepHybridInChat = () => {
    if (shouldBlockPendingCloudKeepInChat(sessionLocalOnlyEnabled)) {
      setPendingHybridOrchestration(null);
      toast.info(
        "This chat is pinned to Local AI. Switch it back to account default or cloud/API before using a hybrid plan in chat.",
      );
      return;
    }
    const pending = pendingHybridOrchestration;
    setPendingHybridOrchestration(null);
    if (!pending || isStreaming) return;
    void streamResponse(
      pending.fallbackUserMessage,
      undefined,
      pending.retrievalQueryText
    );
  };

  // Render user content (including images)
  const renderUserContent = (message: Message) => {
    const imageAttachments =
      message.attachments?.filter(a => a.type?.startsWith("image")) || [];
    const videoAttachments =
      message.attachments?.filter(a => a.type?.startsWith("video")) || [];
    const fileAttachments =
      message.attachments?.filter(
        a => !a.type?.startsWith("image") && !a.type?.startsWith("video")
      ) || [];

    return (
      <div className="space-y-2">
        <div className="whitespace-pre-wrap">
          {extractTextContent(message.content)}
        </div>
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {imageAttachments.map((a, i) => (
              <img
                key={i}
                src={a.url}
                alt={a.name || "attachment"}
                className="max-h-48 rounded-md border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() =>
                  openImageLightbox(
                    imageAttachments.map(img => ({
                      src: img.url,
                      alt: img.name,
                    })),
                    i
                  )
                }
              />
            ))}
          </div>
        )}
        {videoAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {videoAttachments.map((a, i) => (
              <video
                key={i}
                src={a.url}
                controls
                className="max-h-48 rounded-md border"
              />
            ))}
          </div>
        )}
        {fileAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fileAttachments.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs bg-background/50 border rounded-md px-2.5 py-1.5 hover:bg-background transition-colors"
              >
                <Paperclip className="h-3 w-3" />
                {a.name || "File"}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-medium">No conversation selected</h3>
          <p className="text-sm text-muted-foreground">
            Select a conversation from the sidebar or start a new chat
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-1.5 gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <h2 className="font-semibold truncate text-sm shrink min-w-0">
            {conversation?.title || "Chat"}
          </h2>
          <ConversationScopeBadge
            projectId={conversationProjectId}
            className={isPersonalConversation ? "bg-amber-500/10 text-amber-700" : undefined}
          />
          {/* Model Selector */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 max-w-[220px] sm:max-w-[340px] justify-start gap-1.5 text-xs font-normal shrink-0"
            onClick={() => setModelDialogOpen(true)}
            disabled={
              isStreaming ||
              updateConversationMutation.isPending ||
              !!fallbackRequest
            }
            title={selectedModelDisplay.tooltipLabel}
          >
            <Bot className="h-3 w-3 shrink-0" />
            {selectedModelDisplay.providerLabel ? (
              <Badge
                variant="secondary"
                className="h-4 max-w-[92px] shrink-0 px-1.5 text-[10px] font-medium"
              >
                <span className="truncate">
                  {selectedModelDisplay.providerLabel}
                </span>
              </Badge>
            ) : null}
            <span className="truncate">
              {selectedModelDisplay.primaryLabel}
            </span>
            {/* FREE badge in header */}
            {(() => {
              const multiModel = multiProviderModels?.find(
                (m: AvailableModel) => m.modelId === selectedModel
              );
              const provider =
                multiModel?.providers?.find(
                  (p: ModelProvider) => p.providerId === selectedProviderId
                ) ||
                (multiModel?.providers?.length
                  ? getCheapestProvider(multiModel.providers)
                  : null);
              return provider?.isFree ? (
                <Badge
                  variant="secondary"
                  className="h-4 px-1 text-[10px] shrink-0 bg-green-500/10 text-green-600 ml-1"
                >
                  FREE
                </Badge>
              ) : null;
            })()}
          </Button>
          <CommandDialog
            open={modelDialogOpen}
            onOpenChange={setModelDialogOpen}
            title="Select Model"
            description="Search and select an LLM model"
          >
            <CommandInput placeholder="Search models..." />
            <CommandList className="max-h-[60vh]">
              {renderModelDialogContent()}
            </CommandList>
          </CommandDialog>

          {localClientLlmModeEnabled ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={
                    explicitSessionRuntimeMode === "local_only" ||
                    sessionLocalOnlyEnabled
                      ? "default"
                      : explicitSessionRuntimeMode === "cloud_only"
                        ? "secondary"
                        : "outline"
                  }
                  size="sm"
                  className="h-8 gap-1.5 text-xs shrink-0"
                  disabled={sessionRuntimeControlDisabled}
                  title={sessionRuntimeSummary}
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>{sessionRuntimeButtonLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">Chat Local AI</div>
                      <HelpButton
                        page="/chat"
                        topic="local-ai"
                        variant="ghost"
                        size="sm"
                        label="Help"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose how this conversation routes supported text replies
                      and local-safe text skills.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="rounded-md border bg-muted/30 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          Current device Local AI engine
                        </span>
                        <Badge variant="outline" className="shrink-0">
                          {chatLocalRuntimeReadiness.engineLabel}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {chatLocalRuntimeReadiness.summary}
                      </p>
                      {chatLocalRuntimeReadiness.reason ? (
                        <p className="mt-2 text-amber-700">
                          {chatLocalRuntimeReadiness.reason}
                        </p>
                      ) : null}
                      {!chatLocalRuntimeReadiness.canUseLocalForChat ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => navigate("/settings?tab=localAi")}
                        >
                          Open Local AI settings
                        </Button>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      variant={
                        explicitSessionRuntimeMode === "account_default"
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => {
                        void handleSessionRuntimeModeSelection(
                          "account_default",
                        );
                      }}
                      disabled={sessionRuntimeControlDisabled}
                    >
                      <span>Use account default</span>
                      {explicitSessionRuntimeMode === "account_default" ? (
                        <Check className="h-4 w-4" />
                      ) : null}
                    </Button>
                    <Button
                      type="button"
                      variant={
                        explicitSessionRuntimeMode === "local_only"
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => {
                        void handleSessionRuntimeModeSelection("local_only");
                      }}
                      disabled={
                        sessionRuntimeControlDisabled ||
                        !!sessionLocalOnlySelectionDisabledReason
                      }
                      title={sessionLocalOnlySelectionDisabledReason ?? undefined}
                    >
                      <span>Use Local AI for this chat</span>
                      {explicitSessionRuntimeMode === "local_only" ? (
                        <Check className="h-4 w-4" />
                      ) : null}
                    </Button>
                    <Button
                      type="button"
                      variant={
                        explicitSessionRuntimeMode === "cloud_only"
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => {
                        void handleSessionRuntimeModeSelection("cloud_only");
                      }}
                      disabled={sessionRuntimeControlDisabled}
                    >
                      <span>Use cloud/API for this chat</span>
                      {explicitSessionRuntimeMode === "cloud_only" ? (
                        <Check className="h-4 w-4" />
                      ) : null}
                    </Button>
                  </div>

                  <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                    {sessionRuntimeSummary}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Media, image, and video generation stay on their existing
                    route.
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}

          {conversationId ? (
            <PersonaSelector
              conversationId={conversationId}
              currentPersonaId={(conversation as any)?.personaId || null}
              onSelect={handlePersonaChange}
            />
          ) : null}

          {/* Telegram Bridge Toggle */}
          {conversationId && (
            <TelegramBindingButton
              conversationId={String(conversationId)}
              conversationType="chat"
              compact
            />
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Session credits (total used in this conversation) */}
          {conversation?.totalCreditsUsed &&
            Number(conversation.totalCreditsUsed) > 0 && (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] text-muted-foreground hidden sm:flex"
              >
                <Sparkles className="h-3 w-3" />
                {Number(conversation.totalCreditsUsed)}
              </Badge>
            )}
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <CreditCard className="h-3 w-3" />
            {credits?.credits || 0}
          </Badge>
          {isStreaming && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Streaming
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto relative">
        {/* Floating scroll buttons */}
        {messages.length > 3 && (
          <div className="sticky top-2 right-2 z-10 flex flex-col gap-1 float-right mr-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-full bg-background/80 backdrop-blur-sm shadow-sm"
              onClick={scrollToTop}
              title="Scroll to top"
            >
              <ChevronsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-full bg-background/80 backdrop-blur-sm shadow-sm"
              onClick={scrollToBottom}
              title="Scroll to bottom"
            >
              <ChevronsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-4 p-4">
          <div ref={topRef} />
          {loadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 && !streamingContent ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="text-lg font-medium">Start a conversation</h3>
              <p className="text-sm text-muted-foreground">
                Type a message below to begin
              </p>
              {showBrowserSessionEntry ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={onStartBrowserSession}
                    disabled={browserSessionEntryPending}
                  >
                    {browserSessionEntryPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MonitorPlay className="h-4 w-4" />
                    )}
                    Start Browser Session
                  </Button>
                  <HelpButton
                    page="/chat"
                    topic="browser-session"
                    variant="ghost"
                    size="sm"
                  />
                </div>
              ) : null}
              {!workStartDismissed ? (
                <div
                  className={cn(
                    "mt-4 w-full max-w-xl rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-left shadow-sm select-none",
                    isWorkStartDragging ? "cursor-grabbing" : "cursor-grab",
                  )}
                  style={
                    {
                      transform: `translate(${workStartPosition.x}px, ${workStartPosition.y}px)`,
                      transition: isWorkStartDragging ? "none" : "transform 180ms ease",
                      zIndex: isWorkStartDragging ? 30 : 1,
                      position: "relative",
                    } as CSSProperties
                  }
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div
                          className="flex flex-wrap items-center gap-2"
                          onMouseDown={handleWorkStartDragStart}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 rounded-full text-sky-600 hover:bg-white"
                            onMouseDown={handleWorkStartDragStart}
                            aria-label={t("workStart.move")}
                            title={t("workStart.move")}
                          >
                            <GripVertical className="h-4 w-4" />
                          </Button>
                          <h4 className="font-semibold text-slate-900">
                            {t("workStart.title")}
                          </h4>
                          <Badge variant="outline" className="text-[10px]">
                            {t("workStart.badge")}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 rounded-full text-slate-500 hover:bg-white hover:text-slate-900"
                          onClick={() => setWorkStartDismissed(true)}
                          aria-label={t("workStart.hide")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {t("workStart.body")}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {t("workStart.userBody")}
                      </p>
                      {user?.role === "admin" || user?.role === "domain_admin" ? (
                        <p className="mt-2 text-sm text-slate-600">
                          {t("workStart.adminBody")}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            navigate(
                              buildWorkRequestLaunchPath({
                                sourceType:
                                  conversationId !== null
                                    ? "chat"
                                    : null,
                                sourceRef:
                                  conversationId !== null
                                    ? String(conversationId)
                                    : null,
                                linkedConversationIds:
                                  conversationId !== null
                                    ? [String(conversationId)]
                                    : [],
                              }),
                            )
                          }
                        >
                          {t("workStart.openRequest")}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => navigate("/work/requests")}
                        >
                          <ClipboardList className="h-4 w-4" />
                          {t("workStart.openRequests")}
                        </Button>
                        {(user?.role === "admin" || user?.role === "domain_admin") ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => navigate("/admin/work-os")}
                          >
                            <ClipboardList className="h-4 w-4" />
                            {t("workStart.openConsole")}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => navigate("/help/work-os")}
                        >
                          {t("workStart.openGuide")}
                        </Button>
                      </div>
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-xs text-slate-600">
                        <p className="font-medium text-slate-800">Permalink tips</p>
                        <p className="mt-1">
                          Use <code>caseId</code> to reopen the same case later. Use{" "}
                          <code>timelineSource</code> to jump to a specific evidence slice such as{" "}
                          <code>work_os</code>, <code>role_routine</code>, <code>team_run</code>, or{" "}
                          <code>workpack_record</code>.
                        </p>
                        <p className="mt-1">
                          If you need the guide, the button above opens `/help/work-os`.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex w-full max-w-xl items-center justify-between rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-left shadow-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {t("workStart.hiddenTitle")}
                    </p>
                    <p className="text-sm text-slate-600">
                      {t("workStart.hiddenBody")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setWorkStartDismissed(false)}
                  >
                    {t("workStart.show")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.map(m => {
                const browserSessionArtifacts = extractBrowserSessionArtifacts(
                  m.artifacts
                );
                const comparisonPreviews = extractComparisonPreviews(
                  m.artifacts
                );
                const teamRoomActions =
                  m.role === "assistant"
                    ? extractTeamRoomActionLinks(m.content)
                    : [];
                const cleanedAssistantContent =
                  m.role === "assistant"
                    ? stripStandaloneTeamRoomActionLinks(
                        stripArtifactTags(m.content)
                      )
                    : m.content;
                const messageBubble = (
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-4 py-3",
                      m.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : m.skillUsed === "brainstorm" &&
                            m.skillArgs?.brainstormRole === "model_a"
                          ? "mr-auto bg-blue-50 border-l-4 border-blue-400"
                          : m.skillUsed === "brainstorm" &&
                              m.skillArgs?.brainstormRole === "model_b"
                            ? "mr-auto bg-purple-50 border-l-4 border-purple-400"
                            : m.skillUsed === "brainstorm" &&
                                m.skillArgs?.brainstormRole === "summary"
                              ? "mr-auto bg-green-50 border-l-4 border-green-400"
                              : "mr-auto bg-muted"
                    )}
                  >
                    {/* Brainstorm badge */}
                    {m.skillUsed === "brainstorm" &&
                      m.skillArgs?.brainstormRole && (
                        <div className="mb-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              m.skillArgs.brainstormRole === "model_a" &&
                                "border-blue-400 text-blue-600",
                              m.skillArgs.brainstormRole === "model_b" &&
                                "border-purple-400 text-purple-600",
                              m.skillArgs.brainstormRole === "summary" &&
                                "border-green-400 text-green-600"
                            )}
                          >
                            {m.skillArgs.brainstormRole === "summary"
                              ? `Brainstorm Summary · ${m.modelUsed || ""}`
                              : `${m.skillArgs.brainstormRole === "model_a" ? "Model A" : "Model B"} · Round ${m.skillArgs.brainstormRound || "?"} · ${m.modelUsed || ""}`}
                          </Badge>
                        </div>
                      )}
                    {m.role === "assistant" ? (
                      <>
                        {teamRoomActions.length > 0 ? (
                          <div className="mb-3 grid gap-2">
                            {teamRoomActions.map(action => {
                              const ActionIcon = getTeamRoomActionIcon(
                                action.kind
                              );
                              return (
                                <a
                                  key={`${action.label}-${action.href}`}
                                  href={action.href}
                                  className={cn(
                                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:brightness-[0.98]",
                                    getTeamRoomActionClasses(action.kind)
                                  )}
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <ActionIcon className="h-4 w-4 shrink-0" />
                                    <span className="truncate font-medium">
                                      {action.label}
                                    </span>
                                  </div>
                                  <span className="shrink-0 rounded-md bg-white/80 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm">
                                    Open
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                        ) : null}
                        {cleanedAssistantContent ? (
                          <SafeMarkdown
                            onImageClick={(images, index) =>
                              openImageLightbox(images, index)
                            }
                          >
                            {cleanedAssistantContent}
                          </SafeMarkdown>
                        ) : null}
                        {/* Inline artifact cards */}
                        {(() => {
                          const inlineArtifacts = parseArtifacts(m.content);
                          if (inlineArtifacts.length === 0) return null;
                          return (
                            <div className="mt-3 grid gap-2">
                              {inlineArtifacts.map((artifact, i) => (
                                <button
                                  key={i}
                                  onClick={() =>
                                    setSelectedLLMArtifact(artifact)
                                  }
                                  className="flex items-center gap-3 rounded-lg border bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 px-4 py-3 text-left transition-all hover:shadow-md hover:-translate-y-0.5"
                                >
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-800">
                                    <Code2 className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-sm truncate">
                                      {artifact.title}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {artifact.type} — Click to preview
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        {browserSessionArtifacts.map(artifact => (
                          <BrowserSessionSummaryCard
                            key={`${artifact.sessionId}-${artifact.updatedAt ?? "latest"}`}
                            artifact={artifact}
                            onOpen={handleOpenBrowserSession}
                          />
                        ))}
                        {comparisonPreviews.map((preview, index) => (
                          <ComparisonPreviewCard
                            key={`${preview.data.title}-${index}`}
                            preview={preview}
                          />
                        ))}
                        {(m.artifacts ?? [])
                          .filter((artifact) => Boolean(artifact?.metadata?.finance))
                          .map((artifact) => (
                            <FinanceActivityCard
                              key={`finance-${artifact.id}`}
                              title={artifact.title}
                              content={artifact.content}
                              metadata={artifact.metadata as any}
                              onOpenFinancePanel={onOpenFinancePanel}
                            />
                          ))}
                      </>
                    ) : (
                      renderUserContent(m)
                    )}
                    {m.role === "assistant" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {(() => {
                          const runtimeBadge = getRuntimeBadgeCopy(
                            m.runtimeMetadata
                          );
                          if (!runtimeBadge) {
                            return null;
                          }
                          return (
                            <Badge
                              title={runtimeBadge.description}
                              variant="outline"
                              className="gap-1 text-[11px]"
                            >
                              {runtimeBadge.label}
                            </Badge>
                          );
                        })()}
                        {m.skillUsed && m.skillUsed !== "brainstorm" && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            {(() => {
                              const SkillIcon =
                                skillIconMap[m.skillUsed] || Sparkles;
                              return <SkillIcon className="h-3 w-3" />;
                            })()}
                            {m.skillUsed.replace(/-/g, " ")}
                          </Badge>
                        )}
                      </div>
                    )}
                    {m.role === "assistant" && (
                      <MessageCostBadge
                        messageId={m.id}
                        model={m.modelUsed}
                        inputTokens={m.inputTokens ?? 0}
                        outputTokens={m.outputTokens ?? 0}
                        creditsUsed={m.creditsUsed}
                      />
                    )}
                  </div>
                );

                if (m.role === "assistant") {
                  return (
                    <div key={m.id}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          {messageBubble}
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onSelect={() => {
                              const selected = window
                                .getSelection()
                                ?.toString();
                              const content =
                                selected && selected.length > 10
                                  ? selected
                                  : m.content.substring(0, 500);
                              setSuggestedMemory({
                                content,
                                importance: 7,
                                source: "manual",
                              });
                              setSaveDialogOpen(true);
                            }}
                          >
                            <Brain className="mr-2 h-4 w-4" />
                            Save to Memory
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() => {
                              const selected = window
                                .getSelection()
                                ?.toString();
                              const text =
                                selected && selected.length > 5
                                  ? selected
                                  : m.content.substring(0, 2000);
                              setTranslatingMsgId(m.id);
                              translateMutation.mutate({ text });
                            }}
                            disabled={translatingMsgId === m.id}
                          >
                            <Languages className="mr-2 h-4 w-4" />
                            {translatingMsgId === m.id
                              ? "Translating..."
                              : "Translate"}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                      {translatedMessages[m.id] && (
                        <div className="mt-1 mr-auto max-w-[85%] bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-blue-600 flex items-center gap-1">
                              <Languages className="h-3 w-3" /> Translation
                            </span>
                            <button
                              onClick={() =>
                                setTranslatedMessages(prev => {
                                  const next = { ...prev };
                                  delete next[m.id];
                                  return next;
                                })
                              }
                              className="text-blue-400 hover:text-blue-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="text-sm text-blue-900 whitespace-pre-wrap">
                            {translatedMessages[m.id]}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }

                return <div key={m.id}>{messageBubble}</div>;
              })}

              {/* Schedule Confirm Card */}
              {pendingSchedule && (
                <div className="mr-auto max-w-[85%]">
                  <ScheduleConfirmCard
                    parsed={pendingSchedule}
                    conversationId={conversationId || undefined}
                    model={selectedModel || conversation?.model || undefined}
                    onConfirmed={() => {
                      setPendingSchedule(null);
                      setMessages(prev => [
                        ...prev,
                        {
                          id: Date.now(),
                          conversationId: conversationId || 0,
                          role: "assistant" as const,
                          content: `Schedule created successfully! You can manage it in the Alerts panel.`,
                          createdAt: new Date(),
                          skillUsed: "chat-alert",
                        },
                      ]);
                    }}
                    onCancel={() => setPendingSchedule(null)}
                  />
                </div>
              )}

              {/* Media prompt preview — confirm before generating */}
              {pendingMediaPrompt && (
                <div className="mr-auto max-w-[85%]">
                  <MediaPromptPreview
                    prompt={pendingMediaPrompt.prompt}
                    skillName={pendingMediaPrompt.skillName}
                    skillCategory={pendingMediaPrompt.skillCategory}
                    mediaParams={pendingMediaPrompt.mediaParams}
                    isExecuting={isStreaming}
                    onConfirm={handleMediaPromptConfirm}
                    onCancel={handleMediaPromptCancel}
                  />
                </div>
              )}

              {/* Agency escalation — complex multi-step request */}
              {pendingAgencyEscalation && (
                <div className="mr-auto max-w-[85%]">
                  <AgencyEscalationCard
                    message={pendingAgencyEscalation.message}
                    reason={pendingAgencyEscalation.reason}
                    modalities={pendingAgencyEscalation.modalities}
                    complexity={pendingAgencyEscalation.complexity}
                    onDelegateToAgency={handleAgencyDelegation}
                    onKeepInChat={handleKeepInChat}
                  />
                </div>
              )}

              {pendingHybridOrchestration && (
                <div className="mr-auto max-w-[85%]">
                  <HybridOrchestrationCard
                    message={pendingHybridOrchestration.message}
                    reason={pendingHybridOrchestration.reason}
                    plan={pendingHybridOrchestration.plan}
                    onKeepInChat={handleKeepHybridInChat}
                  />
                </div>
              )}

              {browserSessionSuggestion ? (
                <div className="mr-auto max-w-[85%]">
                  <BrowserSessionLaunchSuggestionCard
                    suggestion={browserSessionSuggestion}
                    onConfirm={suggestion =>
                      onConfirmBrowserSessionSuggestion?.(suggestion)
                    }
                    onDismiss={suggestionId =>
                      onDismissBrowserSessionSuggestion?.(suggestionId)
                    }
                  />
                </div>
              ) : null}

              {/* Streaming message */}
              {streamingContent && (
                <div className="mr-auto max-w-[85%] rounded-lg px-4 py-3 bg-muted">
                  <SafeMarkdown
                    onImageClick={(images, index) =>
                      openImageLightbox(images, index)
                    }
                  >
                    {stripArtifactTags(streamingContent)}
                  </SafeMarkdown>
                </div>
              )}

              {/* Fallback Consent Banner */}
              {fallbackRequest && (
                <FallbackConsent
                  fromProvider={fallbackRequest.from.providerName}
                  toProvider={fallbackRequest.to.providerName}
                  toProviderId={fallbackRequest.to.providerId}
                  estimatedCredits={fallbackRequest.estimatedCredits}
                  onAccept={async providerId => {
                    setFallbackRequest(null);
                    setSelectedProviderId(providerId);
                    // Re-send with preferred provider
                    const lastUserMsg = messages
                      .filter(m => m.role === "user")
                      .pop();
                    if (lastUserMsg) {
                      // Trigger re-send by simulating submit with preferredProvider
                      const parsedSelection = parsePickerSelectionValue({
                        value:
                          selectedModel ||
                          selectionToPickerValue(
                            conversationModelSelection,
                            conversation?.model ?? undefined
                          ),
                        explicitProviderId: providerId,
                      });
                      const effectiveModel =
                        parsedSelection?.mode === "explicit"
                          ? parsedSelection.modelId
                          : undefined;
                      const body: Record<string, any> = {
                        ...(effectiveModel ? { model: effectiveModel } : {}),
                        messages: fallbackRequest.originalMessages,
                        stream: true,
                        conversationId,
                        preferredProvider: providerId,
                      };
                      if (parsedSelection) {
                        body.modelSelection = parsedSelection;
                      }
                      setIsStreaming(true);
                      try {
                        const resp = await fetch("/api/llm/stream", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(body),
                        });
                        if (resp.ok && resp.body) {
                          const reader = resp.body.getReader();
                          const decoder = new TextDecoder("utf-8");
                          let buf = "";
                          let fullContent = "";
                          let streamErrorMessage: string | null = null;
                          while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buf += decoder.decode(value, { stream: true });
                            while (true) {
                              const idx = buf.indexOf("\n");
                              if (idx < 0) break;
                              const line = buf.slice(0, idx).replace(/\r$/, "");
                              buf = buf.slice(idx + 1);
                              if (line.startsWith("event:")) {
                                const eventName = line
                                  .slice("event:".length)
                                  .trim();
                                const dataIdx = buf.indexOf("\n");
                                if (dataIdx >= 0) {
                                  const dataLine = buf
                                    .slice(0, dataIdx)
                                    .replace(/\r$/, "");
                                  buf = buf.slice(dataIdx + 1);
                                  if (dataLine.startsWith("data:")) {
                                    try {
                                      const parsed = JSON.parse(
                                        dataLine.slice("data:".length).trim()
                                      );
                                      if (eventName === "error") {
                                        streamErrorMessage =
                                          parsed?.error ||
                                          parsed?.message ||
                                          "Failed to resolve a valid model for this chat request";
                                      } else if (
                                        eventName === "message_complete"
                                      ) {
                                        if (
                                          typeof parsed?.content === "string" &&
                                          parsed.content &&
                                          !fullContent
                                        ) {
                                          fullContent = parsed.content;
                                          setStreamingContent(fullContent);
                                        }
                                      }
                                    } catch {
                                      // Ignore malformed event payloads
                                    }
                                  }
                                }
                                continue;
                              }
                              if (line.startsWith("data:")) {
                                const data = line.slice("data:".length).trim();
                                if (data === "[DONE]") break;
                                try {
                                  const j = JSON.parse(data);
                                  const delta = j?.choices?.[0]?.delta?.content;
                                  if (typeof delta === "string") {
                                    fullContent += delta;
                                    setStreamingContent(fullContent);
                                  }
                                } catch {}
                              }
                            }
                          }
                          reader.releaseLock();
                          if (streamErrorMessage) {
                            setMessages(prev => [
                              ...prev,
                              {
                                id: Date.now(),
                                role: "assistant" as const,
                                content: `[Error] ${streamErrorMessage}`,
                                createdAt: new Date(),
                              },
                            ]);
                            toast.error(streamErrorMessage);
                            setStreamingContent("");
                            setIsStreaming(false);
                            return;
                          }
                          if (fullContent) {
                            setMessages(prev => [
                              ...prev,
                              {
                                id: Date.now(),
                                role: "assistant" as const,
                                content: fullContent,
                                createdAt: new Date(),
                              },
                            ]);
                            setStreamingContent("");
                          }
                        }
                      } catch (err) {
                        console.error("Fallback request failed:", err);
                        toast.error(
                          "Failed to send request with fallback provider"
                        );
                      }
                      setIsStreaming(false);
                    }
                  }}
                  onReject={() => {
                    setFallbackRequest(null);
                    // Show error message in chat
                    setMessages(prev => [
                      ...prev,
                      {
                        id: Date.now(),
                        role: "assistant" as const,
                        content: `Request cancelled. ${fallbackRequest.from.modelName} via ${fallbackRequest.from.providerName} is temporarily unavailable. You can try again later or select a different model.`,
                        createdAt: new Date(),
                      },
                    ]);
                  }}
                />
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Quick Actions for Generation */}
        {!isStreaming && messages.length === 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-purple-600 border-purple-200 hover:bg-purple-50 hover:border-purple-300"
              onClick={() => setInput("create image: ")}
            >
              <Wand2 className="h-4 w-4" />
              Generate Image
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
              onClick={() => setInput("create video: ")}
            >
              <Video className="h-4 w-4" />
              Generate Video
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-green-600 border-green-200 hover:bg-green-50 hover:border-green-300"
              onClick={() => setInput("generate audio: ")}
            >
              <Music className="h-4 w-4" />
              Generate Audio
            </Button>
          </div>
        )}

        {/* Detected Skill Indicator */}
        {detectedSkill && (
          <div
            className={cn(
              "mb-3 flex items-center gap-2 rounded-lg border px-3 py-2",
              detectedSkill.executionMode === "media-generate"
                ? "border-purple-300 bg-purple-50 dark:bg-purple-900/20"
                : "border-primary/30 bg-primary/5"
            )}
          >
            <Sparkles
              className={cn(
                "h-4 w-4",
                detectedSkill.executionMode === "media-generate"
                  ? "text-purple-600"
                  : "text-primary"
              )}
            />
            <Badge variant="secondary" className="gap-1">
              {(() => {
                const SkillIcon = skillIconMap[detectedSkill.type] || Wand2;
                return <SkillIcon className="h-3 w-3" />;
              })()}
              {detectedSkill.name}
            </Badge>
            <span className="text-xs text-muted-foreground">
              ({Math.round(detectedSkill.confidence * 100)}%)
            </span>
            {detectedSkill.executionMode === "media-generate" &&
              filteredMediaModels.length > 0 && (
                <Popover open={mediaModelOpen} onOpenChange={setMediaModelOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1 rounded-md border border-purple-200 bg-white px-2 py-0.5 text-xs text-purple-700 hover:bg-purple-50 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-300">
                      {filteredMediaModels.find(
                        m => m.id === selectedMediaModel
                      )?.name ?? "Select model"}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start" side="top">
                    <div className="border-b px-2 py-1.5">
                      <input
                        autoFocus
                        placeholder="Search models..."
                        className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                        value={mediaModelSearch}
                        onChange={e => setMediaModelSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      {filteredMediaModels
                        .filter(m =>
                          m.name
                            .toLowerCase()
                            .includes(mediaModelSearch.toLowerCase())
                        )
                        .map(m => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setSelectedMediaModel(m.id);
                              setMediaModelOpen(false);
                              setMediaModelSearch("");
                              const storageKey =
                                detectedSkill?.type === "video-generation"
                                  ? "smartspec_lastVideoModel"
                                  : "smartspec_lastImageModel";
                              localStorage.setItem(storageKey, m.id);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent",
                              selectedMediaModel === m.id &&
                                "bg-purple-50 text-purple-700 dark:bg-purple-900/40"
                            )}
                          >
                            <span className="font-medium">{m.name}</span>
                            <span className="text-muted-foreground">
                              {m.creditCost}cr
                            </span>
                          </button>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            {detectedSkill.executionMode === "media-generate" && (
              <span className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 font-medium">
                <Zap className="h-3 w-3" />
                Press Enter to generate
              </span>
            )}
            <button
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => setDetectedSkill(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Dynamic Skill Form & Chip */}
        {isSkillFormEnabled && (
          <SkillFormErrorBoundary onReset={() => skillForm.closeSkillForm()}>
            {skillForm.renderSkillForm()}
            {skillForm.renderSkillChip()}
          </SkillFormErrorBoundary>
        )}

        {/* Attachment Previews */}
        {selectedLibrarySources.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedLibrarySources.map(item => (
              <Badge
                key={item.item_id}
                variant="secondary"
                className="gap-2 pr-1"
              >
                <Search className="h-3 w-3" />
                {item.title}
                <button
                  className="rounded-full p-0.5 hover:bg-black/10"
                  onClick={() => toggleLibrarySource(item)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Attachment Previews */}
        {selectedLibrarySources.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedLibrarySources.map(item => (
              <Badge
                key={item.item_id}
                variant="secondary"
                className="gap-2 pr-1"
              >
                <Search className="h-3 w-3" />
                {item.title}
                <button
                  className="rounded-full p-0.5 hover:bg-black/10"
                  onClick={() => toggleLibrarySource(item)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="mb-3 space-y-2">
            {attachmentOcrBadges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachmentOcrBadges.map((badge) => (
                  <div
                    key={badge.key}
                    className={cn(
                      "rounded-2xl border px-3 py-2 text-xs shadow-sm",
                      badge.className,
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <FileText className="h-3.5 w-3.5" />
                      {badge.shortLabel}
                    </div>
                    <div className="mt-1 text-[11px] opacity-80">
                      {badge.detailLabel}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {attachmentOcrRateLimitNote && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{attachmentOcrRateLimitNote}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {attachments.map(a => (
                <div key={a.key} className="relative">
                  {a.fileType.startsWith("image/") ? (
                    <img
                      src={a.url}
                      alt={a.fileName}
                      className="h-16 w-16 rounded-md border object-cover"
                    />
                  ) : a.fileType.startsWith("video/") ? (
                    <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center">
                      <Video className="h-6 w-6 text-muted-foreground" />
                    </div>
                  ) : (
                    <Badge variant="secondary" className="gap-2 pr-6">
                      {a.fileName}
                    </Badge>
                  )}
                  <button
                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-1 text-destructive-foreground"
                    onClick={() => removeAttachment(a.key)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingVoiceAction ? (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium">Confirm voice action</div>
            <div className="mt-1 text-xs text-amber-800">
              {buildVoiceActionConfirmationCopy(pendingVoiceAction)}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  void confirmPendingVoiceAction();
                }}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={cancelPendingVoiceAction}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 items-center">
          <TooltipProvider>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={ocrOnlyMode ? "default" : "outline"}
                      size="icon"
                      disabled={uploadMutation.isPending || isStreaming}
                      className={cn(
                        "shrink-0",
                        ocrOnlyMode
                          ? "bg-amber-500 text-white hover:bg-amber-600"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <ImagePlus className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {ocrOnlyMode
                      ? "Attach files. OCR only is enabled."
                      : "Attach image or file"}
                  </p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onSelect={() => handlePickFile()}>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Attach image or file
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={ocrOnlyMode}
                  onCheckedChange={checked => setOcrOnlyMode(Boolean(checked))}
                >
                  OCR only
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {librarySourcePickerEnabled && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setLibraryPickerOpen(true)}
                      disabled={isStreaming}
                      className="shrink-0 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Search Library Source</p>
                  </TooltipContent>
                </Tooltip>

                <CommandDialog
                  open={libraryPickerOpen}
                  onOpenChange={setLibraryPickerOpen}
                  title="Search Library Sources"
                  description="Attach ready library items as chat context"
                >
                  <CommandInput
                    value={librarySearchQuery}
                    onValueChange={setLibrarySearchQuery}
                    placeholder="Search library..."
                  />
                  <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Updated in:
                    </span>
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={String(librarySearchRecentDays)}
                      onChange={event => {
                        const next = event.target.value;
                        if (next === "all") {
                          setLibrarySearchRecentDays("all");
                          return;
                        }
                        setLibrarySearchRecentDays(
                          Number(next) as Exclude<
                            LibraryRecentDaysFilter,
                            "all"
                          >
                        );
                      }}
                    >
                      <option value="1">1 day</option>
                      <option value="3">3 days</option>
                      <option value="7">7 days</option>
                      <option value="15">15 days</option>
                      <option value="30">1 month</option>
                      <option value="all">All time</option>
                    </select>
                  </div>
                  <CommandList className="max-h-[60vh]">
                    {librarySearchError ? (
                      <div className="px-3 py-2 text-sm text-red-600">
                        Library search unavailable. Chat can continue without
                        it.
                      </div>
                    ) : debouncedLibrarySearchQuery.trim().length === 0 &&
                      librarySearchRecentDays === "all" ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Pick a timeframe or type to search ready library items.
                      </div>
                    ) : isLibrarySearchLoading ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching...
                      </div>
                    ) : attachableLibrarySources.length === 0 ? (
                      <CommandEmpty>No ready library items found.</CommandEmpty>
                    ) : (
                      <>
                        <CommandGroup heading="Ready Library Items">
                          {attachableLibrarySources.map(item => {
                            const isSelected = selectedLibrarySources.some(
                              selected => selected.item_id === item.item_id
                            );
                            return (
                              <CommandItem
                                key={item.item_id}
                                value={`${item.title} ${item.item_type} ${item.source}`}
                                onSelect={() => toggleLibrarySource(item)}
                                className="flex items-center gap-2"
                              >
                                <Check
                                  className={cn(
                                    "h-3.5 w-3.5 shrink-0",
                                    isSelected ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="flex-1 truncate">
                                  {item.title}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {item.item_type}
                                </Badge>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                        {librarySearchData?.has_more && (
                          <div className="mx-2 mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Showing up to 50 results. There may be more items.
                            Add more filters or keywords.
                          </div>
                        )}
                      </>
                    )}
                  </CommandList>
                </CommandDialog>
              </>
            )}

            {/* Generate Image Button - hidden on mobile */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setInput(
                      input ? input + "\n\ncreate image: " : "create image: "
                    )
                  }
                  disabled={isStreaming}
                  className="shrink-0 text-purple-600 hover:bg-purple-50 hover:text-purple-700 hidden sm:inline-flex"
                >
                  <Palette className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Generate Image</p>
              </TooltipContent>
            </Tooltip>

            {/* Generate Video Button - hidden on mobile */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setInput(
                      input ? input + "\n\ncreate video: " : "create video: "
                    )
                  }
                  disabled={isStreaming}
                  className="shrink-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700 hidden sm:inline-flex"
                >
                  <Video className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Generate Video</p>
              </TooltipContent>
            </Tooltip>

            {/* Auto Prompt Button - hidden on mobile */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAutoPrompt}
                  disabled={isStreaming || isEnhancingPrompt || !input.trim()}
                  className="shrink-0 text-amber-600 hover:bg-amber-50 hover:text-amber-700 hidden sm:inline-flex"
                >
                  {isEnhancingPrompt ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Zap className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Enhance Image Prompt (AI)</p>
              </TooltipContent>
            </Tooltip>

            {/* Skill Form Button (Ctrl+K) */}
            {isSkillFormEnabled && (
              <SkillCommandButton
                onClick={() => skillForm.setShowSkillSelector(true)}
                disabled={isStreaming || skillForm.isFormOpen}
              />
            )}
          </TooltipProvider>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime,.pdf,.txt,.csv,.md,.json,.doc,.docx"
            className="hidden"
            onChange={e => onFiles(e.target.files)}
          />
          <div className="relative flex-1">
            <SlashCommandMenu
              filter={slashFilter}
              visible={showSlashMenu}
              onSelect={slug => {
                setShowSlashMenu(false);
                if (isSkillFormEnabled) {
                  // Try to open dynamic form for this skill
                  skillForm.openSkillForm(slug).catch(() => {
                    // Fallback: insert slash command as text
                    setInput(`/${slug} `);
                  });
                } else {
                  setInput(`/${slug} `);
                }
              }}
              onClose={() => setShowSlashMenu(false)}
            />
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                const val = e.target.value;
                setInput(val);
                if (val.startsWith("/") && !val.includes(" ")) {
                  setShowSlashMenu(true);
                  setSlashFilter(val.slice(1));
                } else {
                  setShowSlashMenu(false);
                }
              }}
              placeholder="Type a message or / for skills..."
              className="!min-h-[36px] max-h-[240px] resize-none !py-2 text-sm overflow-y-auto"
              onKeyDown={e => {
                if (showSlashMenu) return; // Let SlashCommandMenu handle keys
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              disabled={isStreaming || !!fallbackRequest}
            />
          </div>
          <Button
            variant={isRecording ? "destructive" : "outline"}
            size="icon"
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            onPointerLeave={isRecording ? handleMicPointerUp : undefined}
            disabled={isTranscribing || isStreaming || !!fallbackRequest}
            title={
              chatMicProvider.effectiveMode === "legacy_stt"
                ? chatMicProvider.fallbackApplied
                  ? "Hold to record. Auto mode fell back to legacy STT because local microphone transcription is not available on this surface right now."
                  : "Hold to record"
                : localVoiceAvailability.ready
                  ? "Hold to record locally with Gemma 4"
                  : localVoiceAvailability.reason ===
                        "tauri_voice_model_not_installed" ||
                      localVoiceAvailability.reason ===
                        "browser_voice_model_not_installed"
                    ? "Prepare a Gemma 4 model in Local AI settings before using local microphone transcription."
                    : "Local microphone transcription is not available on this surface yet."
            }
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic
                className={cn(
                  "h-4 w-4",
                  isRecording && "animate-pulse text-white"
                )}
              />
            )}
          </Button>
          {handsFreeFeatureReady ? (
            <Button
              variant={handsFreeListening ? "default" : "outline"}
              size="icon"
              onClick={() => {
                setHandsFreeListening(current => {
                  const next = !current;
                  if (!next) {
                    handsFreeAwaitingCommandUntilRef.current = 0;
                    if (isRecording) {
                      stopRecording();
                    }
                  }
                  return next;
                });
              }}
              disabled={isTranscribing || isStreaming || !!fallbackRequest}
              title={
                handsFreeListening
                  ? "Stop hands-free wake phrase listening"
                  : `Start hands-free listening${localAiPreferences.wakePhrase ? ` (${localAiPreferences.wakePhrase})` : ""}`
              }
            >
              <Bot
                className={cn("h-4 w-4", handsFreeListening && "animate-pulse")}
              />
            </Button>
          ) : null}
          <Button
            onClick={() => {
              isStreaming && activeLocalReplyKind
                ? cancelActiveLocalReply()
                : void onSend();
            }}
            disabled={
              (isStreaming && !activeLocalReplyKind) ||
              uploadMutation.isPending ||
              (!isStreaming &&
                !input.trim() &&
                attachments.length === 0 &&
                selectedLibrarySources.length === 0) ||
              !!fallbackRequest
            }
            title={
              isStreaming && activeLocalReplyKind
                ? "Cancel local reply"
                : undefined
            }
          >
            {isStreaming && activeLocalReplyKind ? (
              <X className="h-4 w-4" />
            ) : isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {uploadMutation.isPending && (
          <div className="mt-2 text-sm text-muted-foreground">Uploading...</div>
        )}
      </div>

      {/* Image Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      {/* LLM Artifact Viewer */}
      {selectedLLMArtifact && (
        <LLMArtifactViewer
          artifact={selectedLLMArtifact}
          onClose={() => setSelectedLLMArtifact(null)}
        />
      )}

      {/* Save Memory Dialog (auto-save suggestions + manual right-click) */}
      <SaveMemoryDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        initialData={suggestedMemory || undefined}
        conversationId={conversationId}
      />

      {/* Skill Selector Dialog */}
      {isSkillFormEnabled &&
        skillForm.renderSkillSelector({
          skillIntentEnabled,
          onToggleSkillIntent: () => {
            setSkillIntentEnabled(current => {
              const next = !current;
              if (!next) {
                setDetectedSkill(null);
              }
              return next;
            });
          },
        })}
    </div>
  );
}
