import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
  Search,
  Sparkles,
  Bot,
  ImagePlus,
  Palette,
  Music,
  Zap,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
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
import { LLMArtifactViewer, parseArtifacts, stripArtifactTags, type LLMArtifact } from "./artifacts/LLMArtifactViewer";
import { SaveMemoryDialog, type SaveMemoryInitialData } from "./SaveMemoryDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Brain, Languages, Mic } from "lucide-react";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useChatSkillForm, SkillCommandButton, SkillFormErrorBoundary } from "@/components/chat/skill";
import { TelegramBindingButton } from "./TelegramBindingButton";
import { ScheduleConfirmCard } from "./ScheduleConfirmCard";
import { MediaPromptPreview } from "./MediaPromptPreview";
import { AgencyEscalationCard } from "./AgencyEscalationCard";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FallbackConsent } from "./FallbackConsent";
import { MessageCostBadge } from "./MessageCostBadge";
import { formatModelCost, getCheapestProvider, type AvailableModel, type ModelProvider } from "@/lib/modelPricing";
import { BrowserSessionSummaryCard } from "@/components/browser-session/BrowserSessionSummaryCard";
import { BrowserSessionLaunchSuggestionCard } from "@/components/browser-session/BrowserSessionLaunchSuggestionCard";
import { HelpButton } from "@/components/help";
import { ComparisonPreviewCard } from "@/components/comparison/ComparisonPreviewCard";
import { PersonaSelector } from "./PersonaSelector";
import type { BrowserSessionLaunchSuggestion } from "@/lib/browserSessionInvocation";
import {
  appendLibraryContextToMessage,
  isChatLibrarySourcePickerEnabled,
  toAttachableLibrarySources,
  toggleLibrarySourceSelection,
  type ChatLibraryAttachPayload,
  type ChatLibrarySearchResultLike,
} from "@/lib/chatLibrary";
import {
  buildBrowserSessionPath,
} from "@/lib/browserSessionRouting";
import {
  type BrowserSessionArtifact,
} from "@shared/browserSession";
import {
  extractBrowserSessionArtifacts,
  extractComparisonPreviews,
} from "@/lib/chatArtifactPresentation";
import {
  extractTeamRoomActionLinks,
  stripStandaloneTeamRoomActionLinks,
} from "@/lib/teamRoomActionLinks";

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

function getTeamRoomActionIcon(kind: "approval" | "reply" | "workflow" | "open") {
  if (kind === "approval") return Check;
  if (kind === "reply") return RefreshCw;
  if (kind === "workflow") return Bot;
  return ChevronDown;
}

function getTeamRoomActionClasses(kind: "approval" | "reply" | "workflow" | "open"): string {
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

    if (lowerText.includes('rate_limit') || lowerText.includes('too_many_requests') || lowerText.includes('1302')) {
      return 'The service is handling many requests. Please wait a moment and try again.';
    }
    if (lowerText.includes('overload') || lowerText.includes('deadline')) {
      return 'The service is currently overloaded. Try using a different model or provider.';
    }
    if (lowerText.includes('invalid') && lowerText.includes('model')) {
      return 'This model may be temporarily unavailable. Please try a different model.';
    }
    if (lowerText.includes('unauthorized') || lowerText.includes('api key')) {
      return 'Authentication failed. Please contact support.';
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
    Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : null;
  const normalizeNumberArray = (raw: unknown): number[] | null =>
    Array.isArray(raw) ? raw.filter((v): v is number => typeof v === "number") : null;

  return {
    id: candidate.id,
    type,
    name: candidate.name,
    description: typeof candidate.description === "string" ? candidate.description : null,
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
  onConfirmBrowserSessionSuggestion?: (suggestion: BrowserSessionLaunchSuggestion) => void;
  onDismissBrowserSessionSuggestion?: (suggestionId: string) => void;
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
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [debouncedLibrarySearchQuery, setDebouncedLibrarySearchQuery] = useState("");
  const [librarySearchRecentDays, setLibrarySearchRecentDays] = useState<LibraryRecentDaysFilter>(7);
  const [selectedLibrarySources, setSelectedLibrarySources] = useState<ChatLibraryAttachPayload[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  // Track when we last added a local message to prevent useEffect from overwriting
  const lastLocalAddTime = useRef<number>(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const librarySourcePickerEnabled = isChatLibrarySourcePickerEnabled(
    import.meta.env.VITE_LIBRARY_CHAT_SOURCE_PICKER_ENABLED,
  );

  // Fetch conversation details
  const { data: conversation } = trpc.chat.getConversation.useQuery(
    { id: conversationId! },
    { enabled: !!conversationId }
  );
  const handleOpenBrowserSession = useCallback((artifact: BrowserSessionArtifact) => {
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
      },
    );
    window.location.href = path;
  }, [conversationId]);

  // Fetch messages
  const { data: messagesData, isLoading: loadingMessages } = trpc.chat.getMessages.useQuery(
    { conversationId: conversationId!, limit: 100 },
    { enabled: !!conversationId }
  );

  // Get credits balance
  const { data: credits } = trpc.credits.balance.useQuery();

  // Get available models from LLM providers
  const { data: modelsData } = trpc.llmProviders.availableModels.useQuery();

  // Get media generation models (image/video/audio)
  const { data: allMediaModelsData } = trpc.media.getModels.useQuery(undefined, { staleTime: 300_000 });

  // Get multi-provider models (with provider info, pricing, FREE badges)
  const { data: multiProviderModels } = trpc.multiProvider.getAvailableModelsWithProviders.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const {
    data: librarySearchData,
    isLoading: isLibrarySearchLoading,
    error: librarySearchError,
  } = trpc.library.search.useQuery(
    {
      query: debouncedLibrarySearchQuery || undefined,
      limit: 50,
      filters: librarySearchRecentDays === "all" ? undefined : { recentDays: librarySearchRecentDays },
    },
    {
      enabled:
        librarySourcePickerEnabled &&
        libraryPickerOpen &&
        (debouncedLibrarySearchQuery.trim().length > 0 || librarySearchRecentDays !== "all"),
    },
  );
  const attachableLibrarySources = useMemo(
    () =>
      toAttachableLibrarySources(
        (librarySearchData?.results || []) as ChatLibrarySearchResultLike[],
      ),
    [librarySearchData?.results],
  );

  // Current selected model (use conversation model, localStorage fallback, or first available)
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem("smartspec_lastModel") || ""
  );
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);

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
  const [fallbackRequest, setFallbackRequest] = useState<FallbackRequestData | null>(null);
  const enabledModelIds = useMemo(
    () => (modelsData?.models ?? []).map((model) => model.id),
    [modelsData?.models],
  );
  const defaultEnabledModelId = useMemo(() => {
    const defaultModel = modelsData?.models?.find((model) => model.isDefault);
    return defaultModel?.id || modelsData?.models?.[0]?.id || "";
  }, [modelsData?.models]);

  // Sync selected model with the conversation only when the stored model is still enabled.
  useEffect(() => {
    if (!modelsData?.models || !conversationId || enabledModelIds.length === 0) {
      return;
    }

    const nextModelId = pickEnabledModelId({
      preferredId: conversation?.model,
      allowedIds: enabledModelIds,
      fallbackIds: [defaultEnabledModelId],
    });

    if (nextModelId && nextModelId !== selectedModel) {
      setSelectedModel(nextModelId);
    }
  }, [conversationId, conversation?.model, defaultEnabledModelId, enabledModelIds, modelsData?.models, selectedModel]);

  // Sanitize stale localStorage state when the enabled model catalog changes.
  useEffect(() => {
    if (!modelsData?.models) {
      return;
    }

    if (enabledModelIds.length === 0) {
      if (selectedModel) {
        setSelectedModel("");
        localStorage.removeItem("smartspec_lastModel");
      }
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
  }, [conversation?.model, defaultEnabledModelId, enabledModelIds, modelsData?.models, selectedModel]);

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
  // saveAssistantMessage for non-streaming flows (presentation, scheduling, etc.)
  const saveAssistantMessageMutation = trpc.chat.saveAssistantMessage.useMutation();
  const processMemoryMutation = trpc.memory.processMemory.useMutation();
  const detectSkillMutation = trpc.chat.detectSkill.useMutation();
  const analyzeIntentMutation = trpc.chat.analyzeIntent.useMutation();
  const executeSkillMutation = trpc.chat.executeSkill.useMutation();
  const addSkillCreditsMutation = trpc.chat.addSkillCreditsToConversation.useMutation();
  const enhancePromptMutation = trpc.skills.enhancePrompt.useMutation();

  // Memory auto-save state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [suggestedMemory, setSuggestedMemory] = useState<SaveMemoryInitialData | null>(null);
  const autoSaveCooldownRef = useRef(0); // message count since last suggestion

  // Auto Prompt state
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);

  // Translation state
  const [translatedMessages, setTranslatedMessages] = useState<Record<number, string>>({});
  const [translatingMsgId, setTranslatingMsgId] = useState<number | null>(null);
  const translateMutation = trpc.translation.translate.useMutation({
    onSuccess: (data, variables) => {
      // variables won't have msgId, use translatingMsgId from closure
      setTranslatedMessages((prev) => ({ ...prev, [translatingMsgId!]: data.translatedText }));
      setTranslatingMsgId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Translation failed');
      setTranslatingMsgId(null);
    },
  });

  // Push-to-talk
  const { isRecording, isTranscribing, startRecording, stopRecording } = usePushToTalk({
    onTranscription: (text) => setInput((prev) => prev ? `${prev} ${text}` : text),
    onError: (err) => toast.error(err),
  });

  // Dynamic Skill Form integration
  const isSkillFormEnabled = useFeatureFlag('chat.dynamicSkillForm');
  const skillForm = useChatSkillForm(conversationId ?? 0);

  // Auto-open skill form when navigated from another page with prefill data
  useEffect(() => {
    const raw = sessionStorage.getItem('isc_skill_prefill');
    if (!raw) return;
    sessionStorage.removeItem('isc_skill_prefill');
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
    if (!isSkillFormEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        skillForm.setShowSkillSelector(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSkillFormEnabled, skillForm.setShowSkillSelector]);

  // Listen for open-skill-selector event from SchedulePanel
  useEffect(() => {
    if (!isSkillFormEnabled) return;
    const handleOpenSkillSelector = () => {
      skillForm.setShowSkillSelector(true);
    };
    window.addEventListener('open-skill-selector', handleOpenSkillSelector);
    return () => window.removeEventListener('open-skill-selector', handleOpenSkillSelector);
  }, [isSkillFormEnabled, skillForm.setShowSkillSelector]);

  // Handle model change
  const handleModelChange = async (modelId: string, providerId?: number) => {
    if (!conversationId || isStreaming) return;

    setSelectedModel(modelId);

    // Auto-select cheapest provider if not specified
    if (providerId !== undefined) {
      setSelectedProviderId(providerId);
    } else {
      // Find the model in multiProviderModels and select cheapest provider
      const multiModel = multiProviderModels?.find((m: AvailableModel) => m.modelId === modelId);
      if (multiModel?.providers?.length) {
        const cheapest = getCheapestProvider(multiModel.providers);
        setSelectedProviderId(cheapest?.providerId ?? null);
      } else {
        setSelectedProviderId(null);
      }
    }

    // Update conversation in database
    try {
      await updateConversationMutation.mutateAsync({
        id: conversationId,
        model: modelId,
      });
      // Invalidate to refresh conversation data
      utils.chat.getConversation.invalidate({ id: conversationId });
    } catch (error) {
      console.error("Failed to update model:", error);
      // Revert on error
      if (conversation?.model) {
        setSelectedModel(conversation.model);
      }
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
      toast.success(personaId ? "Persona updated for this chat" : "Using default persona");
    } catch (error) {
      console.error("Failed to update persona:", error);
      toast.error("Failed to update persona");
    }
  };

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
  const formatModelDisplayName = (modelName: string, providerName?: string): string => {
    if (providerName?.toLowerCase().includes('opencode') || providerName?.toLowerCase().includes('zen')) {
      return `OpenCode/${modelName}`;
    }
    return modelName;
  };

  // Skill detection state
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
    const storageKey = isVideo ? "smartspec_lastVideoModel" : "smartspec_lastImageModel";
    const savedModel = localStorage.getItem(storageKey);
    setSelectedMediaModel(prev => {
      // Keep current in-session selection if still valid for this type
      if (prev && filteredMediaModels.some(m => m.id === prev)) return prev;
      // Restore from localStorage (user's previous choice for this type)
      if (savedModel && filteredMediaModels.some(m => m.id === savedModel)) return savedModel;
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

  const parseIntentMutation = trpc.scheduledMessages.parseIntent.useMutation();
  const autoGeneratePresentationMutation = trpc.presentation.ai.autoGenerateDraft.useMutation();

  // ── Presentation auto-draft completion polling ────────────
  const [pendingPresentationTask, setPendingPresentationTask] = useState<{
    taskId: string;
    editorUrl: string;
    topic: string;
    numSlides: number;
  } | null>(null);

  const presentationProgressQuery = trpc.presentation.ai.getDraftProgress.useQuery(
    { taskId: pendingPresentationTask?.taskId ?? "" },
    {
      enabled: pendingPresentationTask !== null,
      refetchInterval: 3000,
    },
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
        saveAssistantMessageMutation.mutateAsync({
          conversationId,
          content: completionContent,
          skillUsed: "auto-draft-presentation",
        }).then((saved) => {
          lastLocalAddTime.current = Date.now();
          setMessages((prev) => [...prev, {
            id: saved?.id ?? Date.now(),
            role: "assistant" as const,
            content: completionContent,
            createdAt: new Date(),
          }]);
        }).catch((err) => {
          console.error("[ChatView] Failed to save completion message:", err);
          lastLocalAddTime.current = Date.now();
          setMessages((prev) => [...prev, {
            id: Date.now(),
            role: "assistant" as const,
            content: completionContent,
            createdAt: new Date(),
          }]);
        });
      } else {
        lastLocalAddTime.current = Date.now();
        setMessages((prev) => [...prev, {
          id: Date.now(),
          role: "assistant" as const,
          content: completionContent,
          createdAt: new Date(),
        }]);
      }
    }
  }, [presentationProgressQuery.data, pendingPresentationTask, conversationId, saveAssistantMessageMutation]);

  // Lightbox state for viewing images
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<Array<{ src: string; alt?: string }>>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Open image in lightbox
  const openImageLightbox = (images: Array<{ src: string; alt?: string }>, index: number = 0) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // LLM Artifact viewer state
  const [selectedLLMArtifact, setSelectedLLMArtifact] = useState<LLMArtifact | null>(null);

  // Debounce input for skill detection
  const debouncedInput = useDebounce(input, 800);

  // Detect skills when input changes
  useEffect(() => {
    const detectSkills = async () => {
      if (!conversationId || !debouncedInput.trim() || debouncedInput.length < 3) {
        setDetectedSkill(null);
        return;
      }

      try {
        // Skill triggers always appear at the start — truncate to first 500 chars
        // to avoid hitting the server 5000-char limit on very long prompts
        const detectionMessage = debouncedInput.slice(0, 500);
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
  }, [debouncedInput, conversationId]);

  // Parse language/aspectRatio intent from natural language and return cleaned input
  const parseEnhanceIntent = (text: string): {
    cleanInput: string;
    language: "en" | "th";
    aspectRatio?: string;
  } => {
    let clean = text;
    let language: "en" | "th" = "en"; // default English

    // Thai language requested
    if (/ภาษาไทย|prompt\s*ไทย|เป็นไทย|ขอไทย/i.test(clean)) {
      language = "th";
      clean = clean.replace(/(?:ขอ\s*)?(?:prompt\s*)?(?:เป็น\s*)?ภาษาไทย|prompt\s*ไทย|เป็นไทย|ขอไทย/gi, "");
      // English explicitly requested
    } else if (/ภาษาอังกฤษ|prompt\s*อังกฤษ|เป็นอังกฤษ|ขออังกฤษ|in\s*english/i.test(clean)) {
      language = "en";
      clean = clean.replace(/(?:ขอ\s*)?(?:prompt\s*)?(?:เป็น\s*)?ภาษาอังกฤษ|prompt\s*อังกฤษ|เป็นอังกฤษ|ขออังกฤษ|in\s*english/gi, "");
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
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        language,
        ...(aspectRatio && { aspectRatio }),
      });

      if (result.success) {
        const promptText = language === "th" ? result.promptTh : result.promptEn;
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
    });
    if (messagesData) {
      // If we just added a local message (within last 3 seconds), don't overwrite
      // This prevents race condition where server data doesn't have the new message yet
      const timeSinceLocalAdd = Date.now() - lastLocalAddTime.current;
      if (timeSinceLocalAdd < 3000) {
        console.log("[ChatView] Skipping sync - recently added local message", { timeSinceLocalAdd, messagesDataLength: messagesData.length });
        return;
      }
      console.log("[ChatView] Syncing from server data", { serverLength: messagesData.length });
      setMessages(messagesData as Message[]);
    }
  }, [messagesData]);

  // Debug: Log when messages state changes
  useEffect(() => {
    console.log("[ChatView] messages state changed:", {
      length: messages.length,
      lastMessage: messages.length > 0 ? {
        id: messages[messages.length - 1].id,
        role: messages[messages.length - 1].role,
        contentPreview: messages[messages.length - 1].content?.substring(0, 50),
      } : null,
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
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm", "video/quicktime",
    "application/pdf",
    "text/plain", "text/csv", "text/markdown",
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
    const maxSize = isImage ? MAX_IMAGE_SIZE : isVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;

    if (file.size > maxSize) {
      const sizeMB = (maxSize / (1024 * 1024)).toFixed(0);
      const typeLabel = isImage ? "images" : isVideo ? "videos" : "files";
      alert(`File too large. Maximum size is ${sizeMB}MB for ${typeLabel}.`);
      return;
    }

    // File type validation
    if (!ALLOWED_FILE_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
      alert("File type not allowed. Supported types: images, PDF, text, JSON, Word documents.");
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
      alert("File extension does not match file type. This may be a security issue.");
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

    setAttachments((prev) => [
      ...prev,
      { key: res.key, url: res.url, fileType: res.fileType, fileName: file.name },
    ]);
  };

  const removeAttachment = (key: string) => {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  };

  const toggleLibrarySource = (item: ChatLibraryAttachPayload) => {
    setSelectedLibrarySources((prev) => toggleLibrarySourceSelection(prev, item));
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
    } catch { }
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
    } catch { }
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
              image_url: { ...p.image_url, url: `${window.location.origin}${p.image_url.url}` },
            };
          }
          return p;
        });
      }
    } catch { }
    return content;
  };

  // Build user content for multi-modal
  const buildUserContent = (text: string, atts: Attachment[]) => {
    const parts: any[] = [];
    if (text.trim().length > 0) parts.push({ type: "text", text });

    for (const a of atts) {
      if (a.fileType.startsWith("image/")) {
        parts.push({ type: "image_url", image_url: { url: a.url } });
      } else if (a.fileType.startsWith("video/")) {
        parts.push({ type: "file_url", file_url: { url: a.url, name: a.fileName, mime_type: a.fileType } });
      } else {
        parts.push({ type: "file_url", file_url: { url: a.url, name: a.fileName, mime_type: a.fileType } });
      }
    }
    return parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
  };

  // Stream response from LLM with memory-aware context
  // Server saves the assistant message at the end of streaming and sends message_saved event
  const streamResponse = async (userMessage: Message, skillUsed?: string): Promise<string> => {
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
      const selectedModelData = modelsData?.models?.find(m => m.id === selectedModel);
      const memoryMode = (conversation as any)?.memoryMode || "full";
      const contextData = await utils.memory.getChatContext.fetch({
        conversationId,
        modelContextLength: selectedModelData?.contextLength,
        currentMessage: typeof userContent === "string" ? userContent : extractTextContent(userMessage.content),
        memoryMode,
      });
      void utils.chat.getConversation.invalidate({ id: conversationId });
      apiMessages = [
        ...contextData.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? parseContentForHistory(m.content) : m.content,
        })),
        { role: "user", content: userContent },
      ];
      timingSummary.contextFetchMs = Math.round(performance.now() - contextFetchStartedAt);
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
        ...messages.map((m) => ({ role: m.role, content: parseContentForHistory(m.content) })),
        { role: "user" as const, content: userContent },
      ];
      timingSummary.contextFetchMs = Math.round(performance.now() - contextFetchStartedAt);
      logTiming("context_fallback", {
        error: error instanceof Error ? error.message : String(error),
        messageCount: apiMessages.length,
      });
    }

    // Include conversationId so server can save the message at end of streaming
    // Use selectedModel which reflects user's current selection
    const effectiveModel = selectedModel || conversation?.model || undefined;
    const body: Record<string, any> = {
      ...(effectiveModel ? { model: effectiveModel } : {}),
      messages: apiMessages,
      stream: true,
      conversationId,
      skillUsed,
    };
    // Include preferredProvider if user explicitly selected one
    if (selectedProviderId) {
      body.preferredProvider = selectedProviderId;
    }

    try {
      const streamOpenStartedAt = performance.now();
      logTiming("stream_request_sent", {
        bodyModel: effectiveModel || null,
        messageCount: apiMessages.length,
      });
      const resp = await fetch("/api/llm/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      timingSummary.streamOpenMs = Math.round(performance.now() - streamOpenStartedAt);

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
                    timingSummary.messageSavedMs = Math.round(performance.now() - streamStartedAt);
                    console.log("[Chat Client] Server saved message:", { savedMessageId, creditsUsed });
                    logTiming("message_saved", { savedMessageId, creditsUsed });
                  } else if (eventName === "save_error") {
                    console.error("[Chat Client] Server save error:", parsed.error);
                    logTiming("save_error", {
                      error: parsed.error,
                    });
                  } else if (eventName === "fallback_required") {
                    // Free provider failed, paid fallback available
                    console.log("[Chat Client] Fallback required:", parsed);
                    timingSummary.totalMs = Math.round(performance.now() - streamStartedAt);
                    logTiming("fallback_required", parsed);
                    setFallbackRequest({
                      from: parsed.from,
                      to: parsed.to,
                      estimatedCredits: parsed.estimatedCredits || 0,
                      originalMessages: messages.map(m => ({ role: m.role, content: m.content })),
                    });
                    setIsStreaming(false);
                    reader.releaseLock();
                    return ""; // Stop processing, user must decide
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
                  timingSummary.firstChunkMs = Math.round(performance.now() - streamStartedAt);
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

      // Message was saved by server - add to local state
      if (fullContent) {
        // Set timestamp BEFORE adding message to prevent useEffect from overwriting
        lastLocalAddTime.current = Date.now();
        console.log("[ChatView] Adding message to local state, timestamp:", lastLocalAddTime.current);

        // Parse inline artifacts from LLM response
        const inlineArtifacts = parseArtifacts(fullContent);

        // Add assistant message to local state
        const newMessage = {
          id: savedMessageId || Date.now(), // Use server ID if available
          role: "assistant" as const,
          content: fullContent,
          creditsUsed: creditsUsed.toString(),
          modelUsed: selectedModel || conversation?.model || undefined,
          skillUsed: skillUsed,
          artifacts: inlineArtifacts.length > 0
            ? inlineArtifacts.map((a) => ({ id: a.identifier, type: a.type as any, title: a.title, content: a.content }))
            : undefined,
          createdAt: new Date(),
        };
        console.log("[ChatView] New message object:", newMessage);

        setMessages((prev) => {
          console.log("[ChatView] setMessages called, prev length:", prev.length);
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
        utils.credits.balance.invalidate();

        // Process memory in background (entity extraction, summarization check)
        processMemoryMutation.mutateAsync({ conversationId }).then((result) => {
          // Show auto-compact / consolidation notification
          if (result.consolidated) {
            toast.info("Context consolidated: old summaries merged to optimize memory");
          } else if (result.compacted && result.compactedMessageCount > 0) {
            toast.info(`Auto-compacted: ${result.compactedMessageCount} messages summarized to save context`);
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
        }).catch(() => { /* non-fatal */ });

        if (!savedMessageId) {
          console.warn("[ChatView] Message displayed but may not be saved - no message_saved event received");
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

  const onSend = async () => {
    if (isStreaming || !conversationId) return;
    const text = input.trim();
    if (!text && attachments.length === 0 && selectedLibrarySources.length === 0) return;

    const textWithLibraryContext = appendLibraryContextToMessage(
      text,
      selectedLibrarySources,
    );
    const content = buildUserContent(textWithLibraryContext, attachments);

    // Save user message
    const userMessage = await sendMessageMutation.mutateAsync({
      conversationId,
      content: typeof content === "string" ? content : JSON.stringify(content),
      attachments: attachments.map((a) => ({
        type: a.fileType.startsWith("image/") ? "image" as const : "file" as const,
        url: a.url,
        name: a.fileName,
      })),
    });

    // Add to local state immediately
    setMessages((prev) => [
      ...prev,
      {
        id: userMessage.id,
        role: "user" as const,
        content: typeof content === "string" ? content : text,
        attachments: attachments.map((a) => ({
          type: a.fileType,
          url: a.url,
          name: a.fileName,
        })),
        createdAt: new Date(userMessage.createdAt),
      },
    ]);

    setInput("");
    setAttachments([]);
    setSelectedLibrarySources([]);
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
    let resolvedSkill = detectedSkill;
    if (!resolvedSkill && text.startsWith("/") && conversationId) {
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
    if (!resolvedSkill && !text.startsWith("/")) {
      try {
        const intent = await analyzeIntentMutation.mutateAsync({
          message: text,
          conversationId,
          hasImages: attachments.some((a) => a.fileType.startsWith("image/")),
        });

        // Agency escalation — complex multi-step request (e.g., "สร้างภาพ และ ข้อความ")
        if (intent.route === "agency" && intent.agencyEscalation) {
          const assistantContent = "This request requires multiple coordinated steps. Let me check if an AI Agency can handle this.";
          const saved = await saveAssistantMessageMutation.mutateAsync({
            conversationId: conversationId!,
            content: assistantContent,
          }).catch(() => null);
          lastLocalAddTime.current = Date.now();
          setMessages((prev) => [...prev, {
            id: saved?.id ?? Date.now(),
            role: "assistant" as const,
            content: assistantContent,
            createdAt: new Date(),
          }]);
          setPendingAgencyEscalation({
            message: text,
            reason: intent.reason,
            modalities: intent.taskProfile?.modalities ?? [],
            complexity: intent.taskProfile?.complexity ?? "single",
          });
          return; // Exit — wait for user action on the escalation card
        }

        // Skill detected by intent router — enrich resolvedSkill from server decision
        if (intent.route === "skill" && intent.selectedSkillId && intent.skillMeta) {
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
    const imageReferencePattern = /(?:แก้ไขภาพนี้|ช่วยแก้ไขภาพ|แก้ไขภาพ|ด้วยรูปนี้|ด้วยภาพนี้|จากรูปนี้|จากภาพนี้|ตามรูปนี้|ตามภาพนี้|ด้วยรูป|ด้วยภาพ|ตามรูป|ตามภาพ|รูปอ้างอิง|ภาพอ้างอิง|ภาพ\s*ref(?:erence)?|รูป\s*ref(?:erence)?|edit\s*(?:this\s*)?image|modify\s*(?:this\s*)?image|change\s*(?:this\s*)?image|with\s+this\s+image|from\s+this\s+image|using\s+this\s+image|based\s+on\s+this\s+image|image\s+ref(?:erence)?|ref(?:erence)?\s+image|img\s+ref(?:erence)?|use\s+(?:the\s+)?(?:above|previous|last)\s+image)/i;
    const isImageEditRequest = imageReferencePattern.test(text);

    // Find reference image for image-to-image or image-to-video generation
    let referenceImageUrl: string | null = null;
    if (isImageEditRequest) {
      const userImageAttachment = attachments.find(a => a.fileType.startsWith("image/"));
      if (userImageAttachment) {
        referenceImageUrl = userImageAttachment.url;
      } else {
        const messagesReversed = [...messages].reverse();
        for (const msg of messagesReversed) {
          const imageAttachment = msg.attachments?.find(a =>
            a.type?.startsWith("image") || a.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
          );
          if (imageAttachment) {
            referenceImageUrl = imageAttachment.url;
            break;
          }
        }
      }
    }

    // Context-aware prompt extraction: detect "use this prompt" / "ด้วยพรอมต์นี้" patterns
    const useThisPromptPattern = /(?:ด้วยพรอมต์นี้|ใช้พรอมต์นี้|with\s+this\s+prompt|use\s+this\s+prompt|ตามพรอมต์ที่แล้ว|from\s+previous|พรอมต์ข้างบน|พรอมต์ด้านบน)/i;
    const isUseThisPromptRequest = useThisPromptPattern.test(text);

    // Also detect "สร้างภาพ" without specific description (implying use previous prompt)
    const isImageRequestWithoutDetails = /^(?:สร้างภาพ|generate\s+image|create\s+image)\s*(?:ด้วย|with|ใช้|from|ตาม)?/i.test(text) && text.length < 50;

    if ((isUseThisPromptRequest || isImageRequestWithoutDetails) &&
      (currentSkillType === "image-generation" || !currentSkillId)) {
      // Find the last assistant message to extract prompt
      const lastAssistantMessage = [...messages].reverse().find(m => m.role === "assistant");

      if (lastAssistantMessage) {
        const msgContent = typeof lastAssistantMessage.content === "string"
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
              if (parsed.aspectRatio) extractedParams.aspectRatio = parsed.aspectRatio;
              if (parsed.style) extractedParams.style = parsed.style;
              if (parsed.numImages) extractedParams.numImages = parsed.numImages;
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
          const paramsInfo = Object.keys(extractedParams).length > 0
            ? ` (${Object.entries(extractedParams).map(([k, v]) => `${k}: ${v}`).join(', ')})`
            : '';
          setStreamingContent(`Using prompt from previous message to create image...${paramsInfo}`);

          try {
            const result = await executeSkillMutation.mutateAsync({
              skillId: "image-creator",
              prompt: extractedPrompt,
              conversationId,
              ...extractedParams, // Pass aspectRatio, style, quality, numImages, etc.
              // Pass reference image if this is an image edit request
              ...(referenceImageUrl ? { referenceImageUrls: [referenceImageUrl] } : {}),
            });

            let responseContent = "";
            let imageAttachments: Array<{ type: "image"; url: string; name: string }> = [];

            if (result.success) {
              if (result.type === "image" && result.resultUrls && result.resultUrls.length > 0) {
                responseContent = `Generated image using prompt:\n> ${extractedPrompt.substring(0, 100)}${extractedPrompt.length > 100 ? "..." : ""}\n\n${result.resultUrls.map(url => `![Generated Image](${url})`).join('\n\n')}`;
                imageAttachments = result.resultUrls.map((url, i) => ({
                  type: "image" as const, url, name: `generated-image-${i + 1}.png`,
                }));
              } else if (result.resultUrl) {
                responseContent = `Generated image using prompt:\n> ${extractedPrompt.substring(0, 100)}${extractedPrompt.length > 100 ? "..." : ""}\n\n![Generated Image](${result.resultUrl})`;
                imageAttachments = [{ type: "image" as const, url: result.resultUrl, name: "generated-image.png" }];
              } else {
                responseContent = result.message || "Image generated successfully!";
              }
              if (result.creditsUsed) {
                responseContent += `\n\n*Credits used: ${result.creditsUsed}*`;
              }
              if (result.creditsUsed && result.creditsUsed > 0) {
                addSkillCreditsMutation.mutate({ conversationId, creditsUsed: result.creditsUsed, skillUsed: "image-creator" });
              }
            } else {
              responseContent = `Failed to generate image: ${result.error || "Unknown error"}`;
            }

            lastLocalAddTime.current = Date.now();
            setMessages((prev) => [...prev, {
              id: Date.now(), role: "assistant" as const, content: responseContent,
              attachments: imageAttachments.length > 0 ? imageAttachments : undefined,
              creditsUsed: result.creditsUsed?.toString(), skillUsed: "image-creator", createdAt: new Date(),
            }]);
            setStreamingContent("");
            setIsStreaming(false);
            utils.chat.getMessages.invalidate({ conversationId });
            utils.credits.balance.invalidate();
          } catch (error) {
            console.error("Context-aware image generation error:", error);
            lastLocalAddTime.current = Date.now();
            setMessages((prev) => [...prev, {
              id: Date.now(), role: "assistant" as const,
              content: `Could not generate image: ${error instanceof Error ? error.message : "Unknown error"}\n\nExtracted prompt was: "${extractedPrompt}"`,
              skillUsed: "image-creator", createdAt: new Date(),
            }]);
            setStreamingContent("");
            setIsStreaming(false);
          }
          return; // Exit early - don't continue with normal flow
        } else {
          // Could not extract prompt - inform user
          lastLocalAddTime.current = Date.now();
          setMessages((prev) => [...prev, {
            id: Date.now(), role: "assistant" as const,
            content: "ไม่พบพรอมต์ในข้อความก่อนหน้า กรุณาสร้างพรอมต์ก่อน หรือพิมพ์คำอธิบายภาพที่ต้องการสร้างโดยตรง\n\n(Could not find a prompt in the previous message. Please generate a prompt first, or type the image description directly.)",
            createdAt: new Date(),
          }]);
          return; // Exit early
        }
      }
    }

    // ── Presentation auto-creation from chat ───────────────────
    // Thai patterns: สร้าง/ทำ/ช่วยทำ + presentation/สไลด์/งานนำเสนอ/ppt
    // English patterns: make/create/generate/build/prepare + presentation/slides/ppt/deck
    const presentationIntentPattern = /(?:(?:ช่วย)?(?:สร้าง|ทำ)\s*(?:presentation|เพรเซนเทชัน|สไลด์|slide|พรีเซนเทชั่น|ppt|งานนำเสนอ)|(?:make|create|generate|build|prepare)\s+(?:a\s+)?(?:presentation|slides?|ppt|deck)(?:\s+(?:about|on|for|เกี่ยวกับ|เรื่อง))?|I\s+want\s+(?:a\s+)?(?:presentation|slides?)\s+(?:about|on|for))/i;
    const isPresentationRequest = presentationIntentPattern.test(text);

    if (isPresentationRequest) {
      // ── Check if this is a SCHEDULED presentation request ────────
      // Thai: ทุกวัน, ทุกวันจันทร์, ตี1, ตอนเช้า, ทุกสัปดาห์, กำหนดเวลา
      // English: every day, every Monday, daily, weekly, at 1am, schedule, cron
      const schedulePattern = /(?:ทุกวัน|ทุก\s*(?:วัน(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)?|สัปดาห์|เดือน)|ตี\s*\d|ตอน(?:เช้า|บ่าย|เย็น|ดึก|เที่ยง|เช้ามืด)|every\s+(?:day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|night)|daily|weekly|monthly|at\s+\d{1,2}\s*(?:am|pm|:)|schedule|cron)/i;
      const isScheduledPresentation = schedulePattern.test(text);

      if (isScheduledPresentation) {
        // Route to schedule flow — let parseIntent handle the cron expression
        try {
          // Extract topic + slide count for dynamicParams
          const scMatch = text.match(/จำนวน\s*(\d+)|(\d+)\s*(?:slides?|สไลด์|แผ่น|หน้า)/i);
          const scSlides = scMatch ? parseInt(scMatch[1] || scMatch[2] || "5", 10) : 5;
          const scTopicClean = text
            .replace(/(?:(?:ช่วย)?(?:สร้าง|ทำ)\s*(?:presentation|เพรเซนเทชัน|สไลด์|slide|พรีเซนเทชั่น|ppt|งานนำเสนอ)|(?:make|create|generate|build|prepare)\s+(?:a\s+)?(?:presentation|slides?|ppt|deck))\s*(?:about|on|for|เกี่ยวกับ|เรื่อง)?\s*/i, "")
            .replace(/\s*(?:จำนวน\s*\d+\s*(?:สไลด์|slide|แผ่น|หน้า)?|\d+\s*(?:slides?|สไลด์|แผ่น|หน้า))\s*/gi, "")
            .replace(/\s*(?:เสร็จแล้วแจ้ง|แจ้งเมื่อเสร็จ|notify\s+(?:me\s+)?when\s+done)\s*/gi, "")
            .replace(/\s*(?:ทุกวัน|ทุก\s*(?:วัน(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)?|สัปดาห์|เดือน)|ตี\s*\d+|ตอน(?:เช้า|บ่าย|เย็น|ดึก|เที่ยง|เช้ามืด))\s*/gi, "")
            .replace(/\s*(?:every\s+(?:day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|night)|daily|weekly|monthly|at\s+\d{1,2}\s*(?:am|pm|:\d{2}))\s*/gi, "")
            .trim();

          const parsed = await parseIntentMutation.mutateAsync({
            message: text,
            model: selectedModel || conversation?.model || undefined,
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

          setPendingSchedule(scheduleParsed);
          const schedContent = `I detected a scheduled presentation request. Please confirm the schedule below.`;
          const schedSaved = conversationId ? await saveAssistantMessageMutation.mutateAsync({
            conversationId,
            content: schedContent,
            skillUsed: "chat-alert",
          }).catch(() => null) : null;
          lastLocalAddTime.current = Date.now();
          setMessages((prev) => [...prev, {
            id: schedSaved?.id ?? Date.now(),
            role: "assistant" as const,
            content: schedContent,
            createdAt: new Date(),
            skillUsed: "chat-alert",
          }]);
        } catch (err) {
          console.warn("[ChatView] Scheduled presentation parse failed:", err);
          // Fall through to immediate generation
        }
        return;
      }

      // ── Immediate presentation generation (no schedule) ─────────
      // Extract slide count: "จำนวน 10 สไลด์", "10 slides", "3 หน้า"
      const slideCountMatch = text.match(/จำนวน\s*(\d+)|(\d+)\s*(?:slides?|สไลด์|แผ่น|หน้า)/i);
      const numSlides = slideCountMatch
        ? parseInt(slideCountMatch[1] || slideCountMatch[2] || "5", 10)
        : 5;

      // Extract aspect ratio: "16:9", "9:16", "แนวนอน", "แนวตั้ง", "landscape", "portrait"
      const aspectRatioMatch = text.match(/(?:ขนาด\s*)?(?:16\s*:\s*9|9\s*:\s*16)|(?:แนวนอน|แนวตั้ง|landscape|portrait)/i);
      let canvasWidth: number | undefined;
      let canvasHeight: number | undefined;
      if (aspectRatioMatch) {
        const matched = aspectRatioMatch[0].toLowerCase().replace(/\s/g, "");
        if (matched.includes("9:16") || matched.includes("แนวตั้ง") || matched === "portrait") {
          canvasWidth = 720;
          canvasHeight = 1280;
        } else {
          canvasWidth = 1280;
          canvasHeight = 720;
        }
      }

      // Extract language: "ภาษาไทย", "ภาษาอังกฤษ", "in Thai", "in English"
      const langMatch = text.match(/(?:ภาษา\s*(?:ไทย|อังกฤษ|english|thai))|(?:(?:in|ใน)\s*(?:Thai|English|ไทย|อังกฤษ))/i);
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
        .replace(/(?:(?:ช่วย)?(?:สร้าง|ทำ)\s*(?:presentation|เพรเซนเทชัน|สไลด์|slide|พรีเซนเทชั่น|ppt|งานนำเสนอ)|(?:make|create|generate|build|prepare)\s+(?:a\s+)?(?:presentation|slides?|ppt|deck))\s*(?:about|on|for|เกี่ยวกับ|เรื่อง)?\s*/i, "")
        .replace(/\s*(?:จำนวน\s*\d+\s*(?:สไลด์|slide|แผ่น|หน้า)?|\d+\s*(?:slides?|สไลด์|แผ่น|หน้า))\s*/gi, "")
        .replace(/\s*(?:เสร็จแล้วแจ้ง|แจ้งเมื่อเสร็จ|notify\s+(?:me\s+)?when\s+done)\s*/gi, "")
        .replace(/\s*(?:ขนาด\s*)?(?:16\s*:\s*9|9\s*:\s*16)\s*/gi, "")
        .replace(/\s*(?:แนวนอน|แนวตั้ง|landscape|portrait)\s*/gi, "")
        .replace(/\s*(?:ภาษา\s*(?:ไทย|อังกฤษ|english|thai)|(?:in|ใน)\s*(?:Thai|English|ไทย|อังกฤษ))\s*/gi, "")
        .trim();

      if (topicClean.length < 3) {
        // User provided trigger phrase but no meaningful topic
        const promptContent = "Please provide a topic for your presentation.\n\nExamples:\n- \"สร้าง presentation เรื่อง Digital Marketing จำนวน 5 สไลด์\"\n- \"สร้าง presentation เรื่อง AI 10 slides ขนาด 16:9 ภาษาอังกฤษ\"\n- \"create presentation about AI in Healthcare 9:16 portrait\"";
        const saved = await saveAssistantMessageMutation.mutateAsync({
          conversationId: conversationId!,
          content: promptContent,
        }).catch(() => null);
        lastLocalAddTime.current = Date.now();
        setMessages((prev) => [...prev, {
          id: saved?.id ?? Date.now(),
          role: "assistant" as const,
          content: promptContent,
          createdAt: new Date(),
        }]);
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

        const aspectLabel = canvasWidth && canvasHeight
          ? (canvasWidth > canvasHeight ? "16:9" : "9:16")
          : "16:9";
        const langLabel = language === "th" ? "Thai" : language === "en" ? "English" : undefined;
        const editorUrl = result.editorUrl || `/presentation/${result.libraryItemId}`;
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
        const saved = await saveAssistantMessageMutation.mutateAsync({
          conversationId: conversationId!,
          content: responseContent,
          skillUsed: "auto-draft-presentation",
        }).catch((err) => {
          console.error("[ChatView] Failed to save presentation message:", err);
          return null;
        });

        lastLocalAddTime.current = Date.now();
        setMessages((prev) => [...prev, {
          id: saved?.id ?? Date.now(),
          role: "assistant" as const,
          content: responseContent,
          createdAt: new Date(),
        }]);

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
        const isRateLimit = errMsg.toLowerCase().includes("rate") || errMsg.toLowerCase().includes("too many");
        const errorContent = isRateLimit
          ? "Too many presentation requests. Please wait a minute and try again."
          : `Could not create presentation: ${errMsg}`;

        // Save error message to database too
        const saved = await saveAssistantMessageMutation.mutateAsync({
          conversationId: conversationId!,
          content: errorContent,
          error: errMsg,
        }).catch(() => null);

        lastLocalAddTime.current = Date.now();
        setMessages((prev) => [...prev, {
          id: saved?.id ?? Date.now(),
          role: "assistant" as const,
          content: errorContent,
          createdAt: new Date(),
        }]);
      } finally {
        setStreamingContent("");
        setIsStreaming(false);
      }
      return; // Exit early — don't continue to normal LLM flow
    }

    // Check if this is a chat-alert (scheduling) skill
    if (currentSkillId === "chat-alert" || currentSkillType === "automation") {
      try {
        const parsed = await parseIntentMutation.mutateAsync({
          message: text,
          model: selectedModel || conversation?.model || undefined,
        });
        setPendingSchedule(parsed);
        // Add assistant message about the schedule and persist it
        const alertContent = `I detected a scheduling request. Please confirm the details below.`;
        const alertSaved = conversationId ? await saveAssistantMessageMutation.mutateAsync({
          conversationId,
          content: alertContent,
          skillUsed: "chat-alert",
        }).catch(() => null) : null;
        lastLocalAddTime.current = Date.now();
        setMessages((prev) => [
          ...prev,
          {
            id: alertSaved?.id ?? Date.now(),
            conversationId: conversationId || 0,
            role: "assistant" as const,
            content: alertContent,
            createdAt: new Date(),
            skillUsed: "chat-alert",
          },
        ]);
      } catch {
        // Fall through to normal chat if parse fails
      }
      return;
    }

    // Execution mode determines skill behavior (from DB, no hardcoded patterns)
    const executionMode = resolvedSkill?.executionMode || "llm-only";

    if (executionMode === "media-generate" && currentSkillId) {
      // media-generate: LLM generates structured prompt+params, then auto-call media API
      const generatedContent = await streamResponse({
        id: userMessage.id,
        role: "user",
        content: typeof content === "string" ? content : textWithLibraryContext,
        createdAt: new Date(userMessage.createdAt),
      }, currentSkillId);

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
            if (parsed.aspectRatio) mediaParams.aspectRatio = parsed.aspectRatio;
            if (parsed.style) mediaParams.style = parsed.style;
            if (parsed.numImages) mediaParams.numImages = parsed.numImages;
            if (parsed.quality) mediaParams.quality = parsed.quality;
            if (parsed.model) mediaParams.model = parsed.model;
            if (parsed.duration) mediaParams.duration = parsed.duration;
            // Video prompt engineer format: params nested under metadata
            if (parsed.metadata?.aspect_ratio) mediaParams.aspectRatio = parsed.metadata.aspect_ratio;
            if (parsed.metadata?.duration) mediaParams.duration = parsed.metadata.duration;
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
            ...(referenceImageUrl ? { referenceImageUrls: [referenceImageUrl] } : {}),
          },
          conversationId: conversationId!,
        });
        // Exit — wait for user confirmation via MediaPromptPreview
      }
    } else {
      // Stream response for regular chat (non-media skills)
      const generatedContent = await streamResponse({
        id: userMessage.id,
        role: "user",
        content: typeof content === "string" ? content : text,
        createdAt: new Date(userMessage.createdAt),
      }, currentSkillId);

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
          const jsonMatch = generatedContent.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1].trim());
            if (parsed.prompt) {
              chainedPrompt = parsed.prompt;
              // Extract all media parameters
              if (parsed.aspectRatio) chainedParams.aspectRatio = parsed.aspectRatio;
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
          let promptMatch = generatedContent.match(/(?:พรอมต์|Prompt|prompt)\s*[:：]\s*["'""'']([^"'""'']+)["'""'']/i);
          if (promptMatch) {
            chainedPrompt = promptMatch[1].trim();
          } else {
            // Second try: prompt without quotes but with colon - "พรอมต์: ..."
            promptMatch = generatedContent.match(/(?:พรอมต์|Prompt|prompt)\s*[:：]\s*([^\n]+?)(?:\n|$)/i);
            if (promptMatch) {
              // Remove surrounding quotes of all types
              chainedPrompt = promptMatch[1].trim().replace(/^["'""'']|["'""'']$/g, "");
            }
          }
        }

        // Small delay to show the prompt first
        await new Promise(r => setTimeout(r, 800));

        // Now trigger the chained skill (e.g., image-creator)
        setIsStreaming(true);
        const paramsInfo = Object.keys(chainedParams).length > 0
          ? ` (${Object.entries(chainedParams).map(([k, v]) => `${k}: ${v}`).join(', ')})`
          : '';
        setStreamingContent(`Using generated prompt to create image...${paramsInfo}`);

        try {
          const result = await executeSkillMutation.mutateAsync({
            skillId: effectiveChainTo,
            prompt: chainedPrompt,
            conversationId,
            ...chainedParams, // Pass aspectRatio, style, quality, numImages, etc.
            // Pass reference image if this is an image edit request
            ...(referenceImageUrl ? { referenceImageUrls: [referenceImageUrl] } : {}),
          });

          let responseContent = "";
          let imageAttachments: Array<{ type: "image"; url: string; name: string }> = [];

          if (result.success) {
            if (result.type === "image" && result.resultUrls && result.resultUrls.length > 0) {
              responseContent = `Generated image:\n\n${result.resultUrls.map(url => `![Generated Image](${url})`).join('\n\n')}`;
              imageAttachments = result.resultUrls.map((url, i) => ({
                type: "image" as const, url, name: `generated-image-${i + 1}.png`,
              }));
            } else if (result.resultUrl) {
              responseContent = `Generated image:\n\n![Generated Image](${result.resultUrl})`;
              if (result.type === "image") {
                imageAttachments = [{ type: "image" as const, url: result.resultUrl, name: "generated-image.png" }];
              }
            } else {
              responseContent = result.message || "Image generated successfully!";
            }
            if (result.creditsUsed) {
              responseContent += `\n\n*Credits used: ${result.creditsUsed}*`;
            }
            if (result.creditsUsed && result.creditsUsed > 0) {
              addSkillCreditsMutation.mutate({ conversationId, creditsUsed: result.creditsUsed, skillUsed: effectiveChainTo });
            }
          } else {
            responseContent = `Failed to generate image: ${result.error || "Unknown error"}`;
          }

          lastLocalAddTime.current = Date.now();
          setMessages((prev) => [...prev, {
            id: Date.now(), role: "assistant" as const, content: responseContent,
            attachments: imageAttachments.length > 0 ? imageAttachments : undefined,
            creditsUsed: result.creditsUsed?.toString(), skillUsed: effectiveChainTo, createdAt: new Date(),
          }]);
          setStreamingContent("");
          setIsStreaming(false);
          utils.chat.getMessages.invalidate({ conversationId });
          utils.credits.balance.invalidate();
        } catch (error) {
          console.error("Chained skill execution error:", error);
          lastLocalAddTime.current = Date.now();
          setMessages((prev) => [...prev, {
            id: Date.now(), role: "assistant" as const,
            content: `Prompt generated above. Image generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            skillUsed: effectiveChainTo, createdAt: new Date(),
          }]);
          setStreamingContent("");
          setIsStreaming(false);
        }
      }
    }
  };

  // ── Handler: user confirms generated prompt → execute media skill ─────────
  const handleMediaPromptConfirm = async (editedPrompt: string, params: Record<string, unknown>) => {
    if (!pendingMediaPrompt) return;
    const { skillId, conversationId: convId } = pendingMediaPrompt;

    setIsStreaming(true);
    setStreamingContent("Generating media from confirmed prompt...");
    setPendingMediaPrompt(null);

    try {
      const result = await executeSkillMutation.mutateAsync({
        skillId,
        prompt: editedPrompt,
        conversationId: convId,
        ...params,
      });

      let responseContent = "";
      let imageAttachments: Array<{ type: "image"; url: string; name: string }> = [];

      if (result.success) {
        if (result.type === "image" && result.resultUrls && result.resultUrls.length > 0) {
          responseContent = `Generated image${result.resultUrls.length > 1 ? "s" : ""}:\n\n${result.resultUrls.map((url) => `![Generated Image](${url})`).join("\n\n")}`;
          imageAttachments = result.resultUrls.map((url, i) => ({
            type: "image" as const, url, name: `generated-image-${i + 1}.png`,
          }));
        } else if (result.type === "video" && result.isAsync) {
          responseContent = `Video generation started. ${result.message}\n\nYou can check the progress in the Media History page.`;
        } else if (result.resultUrl) {
          responseContent = `Generated ${result.type}:\n\n${result.type === "image" ? `![Generated Image](${result.resultUrl})` : `[View ${result.type}](${result.resultUrl})`}`;
          if (result.type === "image") {
            imageAttachments = [{ type: "image" as const, url: result.resultUrl, name: "generated-image.png" }];
          }
        } else {
          responseContent = result.message || "Media generated successfully!";
        }
        if (result.creditsUsed) {
          responseContent += `\n\n*Credits used: ${result.creditsUsed}*`;
        }
        if (result.creditsUsed && result.creditsUsed > 0) {
          addSkillCreditsMutation.mutate({ conversationId: convId, creditsUsed: result.creditsUsed, skillUsed: skillId });
        }
      } else {
        responseContent = `Failed to generate media: ${result.error || "Unknown error"}`;
      }

      lastLocalAddTime.current = Date.now();
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant" as const, content: responseContent,
        attachments: imageAttachments.length > 0 ? imageAttachments : undefined,
        creditsUsed: result.creditsUsed?.toString(), skillUsed: skillId, createdAt: new Date(),
      }]);
      utils.chat.getMessages.invalidate({ conversationId: convId });
      utils.credits.balance.invalidate();
    } catch (error) {
      console.error("Media generation from confirmed prompt error:", error);
      lastLocalAddTime.current = Date.now();
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant" as const,
        content: `Media generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        skillUsed: skillId, createdAt: new Date(),
      }]);
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

  // Render user content (including images)
  const renderUserContent = (message: Message) => {
    const imageAttachments = message.attachments?.filter((a) => a.type?.startsWith("image")) || [];
    const videoAttachments = message.attachments?.filter((a) => a.type?.startsWith("video")) || [];
    const fileAttachments = message.attachments?.filter((a) => !a.type?.startsWith("image") && !a.type?.startsWith("video")) || [];

    return (
      <div className="space-y-2">
        <div className="whitespace-pre-wrap">{extractTextContent(message.content)}</div>
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {imageAttachments.map((a, i) => (
              <img
                key={i}
                src={a.url}
                alt={a.name || "attachment"}
                className="max-h-48 rounded-md border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => openImageLightbox(
                  imageAttachments.map((img) => ({ src: img.url, alt: img.name })),
                  i
                )}
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
          <h2 className="font-semibold truncate text-sm shrink min-w-0">{conversation?.title || "Chat"}</h2>
          {/* Model Selector */}
          {modelsData?.models && modelsData.models.length > 0 ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 max-w-[180px] sm:max-w-[280px] justify-start gap-1.5 text-xs font-normal shrink-0"
                onClick={() => setModelDialogOpen(true)}
                disabled={isStreaming || updateConversationMutation.isPending || !!fallbackRequest}
              >
                <Bot className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {(() => {
                    const modelData = modelsData.models.find(m => m.id === selectedModel);
                    const multiModel = multiProviderModels?.find((m: AvailableModel) => m.modelId === selectedModel);
                    const provider = multiModel?.providers?.find((p: ModelProvider) => p.providerId === selectedProviderId)
                      || (multiModel?.providers?.length ? getCheapestProvider(multiModel.providers) : null);
                    const displayName = modelData?.name || selectedModel || "Select model";
                    return formatModelDisplayName(displayName, provider?.providerName);
                  })()}
                </span>
                {/* FREE badge in header */}
                {(() => {
                  const multiModel = multiProviderModels?.find((m: AvailableModel) => m.modelId === selectedModel);
                  const provider = multiModel?.providers?.find((p: ModelProvider) => p.providerId === selectedProviderId)
                    || (multiModel?.providers?.length ? getCheapestProvider(multiModel.providers) : null);
                  return provider?.isFree ? (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0 bg-green-500/10 text-green-600 ml-1">
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
                  <CommandEmpty>No models found.</CommandEmpty>
                  {/* Use multi-provider models grouped by provider */}
                  {(() => {
                    if (!multiProviderModels || multiProviderModels.length === 0) {
                      return Object.entries(modelsByProvider).map(([provider, models]) => (
                        <CommandGroup key={provider} heading={provider}>
                          {models.map((model) => (
                            <CommandItem
                              key={model.id}
                              value={`${model.name} ${model.id} ${provider}`}
                              onSelect={() => {
                                handleModelChange(model.id);
                                setModelDialogOpen(false);
                              }}
                              className="flex items-center gap-2"
                            >
                              <Check className={cn("h-3.5 w-3.5 shrink-0", selectedModel === model.id ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1 truncate">{formatModelDisplayName(model.name, model.provider)}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ));
                    }

                    // Group multi-provider models by their best provider
                    const grouped: Record<string, Array<{ model: AvailableModel; provider: ModelProvider }>> = {};
                    for (const model of multiProviderModels) {
                      if (!model.providers || model.providers.length === 0) continue;
                      const bestProvider = getCheapestProvider(model.providers);
                      if (!bestProvider) continue;
                      const providerKey = bestProvider.providerName;
                      if (!grouped[providerKey]) {
                        grouped[providerKey] = [];
                      }
                      grouped[providerKey].push({ model, provider: bestProvider });
                    }

                    return Object.entries(grouped).map(([providerName, items]) => (
                      <CommandGroup key={providerName} heading={providerName}>
                        {items.map(({ model, provider }) => (
                          <CommandItem
                            key={`${model.modelId}-${provider.providerId}`}
                            value={`${model.modelName} ${model.modelId} ${providerName}`}
                            onSelect={() => {
                              handleModelChange(model.modelId, provider.providerId);
                              setModelDialogOpen(false);
                            }}
                            className="flex items-center gap-2"
                          >
                            <Check className={cn("h-3.5 w-3.5 shrink-0", selectedModel === model.modelId ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1 truncate">{formatModelDisplayName(model.modelName, providerName)}</span>
                            {provider.isFree ? (
                              <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0 bg-green-500/10 text-green-600">
                                FREE
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {formatModelCost(provider.pricingInput, provider.pricingOutput, false)}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ));
                  })()}
                </CommandList>
              </CommandDialog>
            </>
          ) : (
            <Badge variant="outline" className="text-xs">
              {selectedModel || "No model"}
            </Badge>
          )}

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
          {conversation?.totalCreditsUsed && Number(conversation.totalCreditsUsed) > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground hidden sm:flex">
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
                  <HelpButton page="/chat" topic="browser-session" variant="ghost" size="sm" />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {messages.map((m) => {
                const browserSessionArtifacts = extractBrowserSessionArtifacts(m.artifacts);
                const comparisonPreviews = extractComparisonPreviews(m.artifacts);
                const teamRoomActions = m.role === "assistant"
                  ? extractTeamRoomActionLinks(m.content)
                  : [];
                const cleanedAssistantContent = m.role === "assistant"
                  ? stripStandaloneTeamRoomActionLinks(stripArtifactTags(m.content))
                  : m.content;
                const messageBubble = (
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-4 py-3",
                      m.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : m.skillUsed === "brainstorm" && m.skillArgs?.brainstormRole === "model_a"
                          ? "mr-auto bg-blue-50 border-l-4 border-blue-400"
                          : m.skillUsed === "brainstorm" && m.skillArgs?.brainstormRole === "model_b"
                            ? "mr-auto bg-purple-50 border-l-4 border-purple-400"
                            : m.skillUsed === "brainstorm" && m.skillArgs?.brainstormRole === "summary"
                              ? "mr-auto bg-green-50 border-l-4 border-green-400"
                              : "mr-auto bg-muted"
                    )}
                  >
                    {/* Brainstorm badge */}
                    {m.skillUsed === "brainstorm" && m.skillArgs?.brainstormRole && (
                      <div className="mb-2">
                        <Badge variant="outline" className={cn(
                          "text-[10px]",
                          m.skillArgs.brainstormRole === "model_a" && "border-blue-400 text-blue-600",
                          m.skillArgs.brainstormRole === "model_b" && "border-purple-400 text-purple-600",
                          m.skillArgs.brainstormRole === "summary" && "border-green-400 text-green-600",
                        )}>
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
                            {teamRoomActions.map((action) => {
                              const ActionIcon = getTeamRoomActionIcon(action.kind);
                              return (
                                <a
                                  key={`${action.label}-${action.href}`}
                                  href={action.href}
                                  className={cn(
                                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:brightness-[0.98]",
                                    getTeamRoomActionClasses(action.kind),
                                  )}
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <ActionIcon className="h-4 w-4 shrink-0" />
                                    <span className="truncate font-medium">{action.label}</span>
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
                            onImageClick={(images, index) => openImageLightbox(images, index)}
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
                                  onClick={() => setSelectedLLMArtifact(artifact)}
                                  className="flex items-center gap-3 rounded-lg border bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 px-4 py-3 text-left transition-all hover:shadow-md hover:-translate-y-0.5"
                                >
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-800">
                                    <Code2 className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-sm truncate">{artifact.title}</div>
                                    <div className="text-xs text-muted-foreground">{artifact.type} — Click to preview</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        {browserSessionArtifacts.map((artifact) => (
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
                      </>
                    ) : (
                      renderUserContent(m)
                    )}
                    {m.role === "assistant" && m.skillUsed && m.skillUsed !== "brainstorm" && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="gap-1 text-xs">
                          {(() => {
                            const SkillIcon = skillIconMap[m.skillUsed] || Sparkles;
                            return <SkillIcon className="h-3 w-3" />;
                          })()}
                          {m.skillUsed.replace(/-/g, " ")}
                        </Badge>
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
                              const selected = window.getSelection()?.toString();
                              const content = selected && selected.length > 10
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
                              const selected = window.getSelection()?.toString();
                              const text = selected && selected.length > 5
                                ? selected
                                : m.content.substring(0, 2000);
                              setTranslatingMsgId(m.id);
                              translateMutation.mutate({ text });
                            }}
                            disabled={translatingMsgId === m.id}
                          >
                            <Languages className="mr-2 h-4 w-4" />
                            {translatingMsgId === m.id ? 'Translating...' : 'Translate'}
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
                              onClick={() => setTranslatedMessages((prev) => {
                                const next = { ...prev };
                                delete next[m.id];
                                return next;
                              })}
                              className="text-blue-400 hover:text-blue-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="text-sm text-blue-900 whitespace-pre-wrap">{translatedMessages[m.id]}</p>
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
                      setMessages((prev) => [
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

              {browserSessionSuggestion ? (
                <div className="mr-auto max-w-[85%]">
                  <BrowserSessionLaunchSuggestionCard
                    suggestion={browserSessionSuggestion}
                    onConfirm={(suggestion) => onConfirmBrowserSessionSuggestion?.(suggestion)}
                    onDismiss={(suggestionId) => onDismissBrowserSessionSuggestion?.(suggestionId)}
                  />
                </div>
              ) : null}

              {/* Streaming message */}
              {streamingContent && (
                <div className="mr-auto max-w-[85%] rounded-lg px-4 py-3 bg-muted">

                  <SafeMarkdown
                    onImageClick={(images, index) => openImageLightbox(images, index)}
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
                  onAccept={async (providerId) => {
                    setFallbackRequest(null);
                    setSelectedProviderId(providerId);
                    // Re-send with preferred provider
                    const lastUserMsg = messages.filter(m => m.role === "user").pop();
                    if (lastUserMsg) {
                      // Trigger re-send by simulating submit with preferredProvider
                      const effectiveModel = selectedModel || conversation?.model || undefined;
                      const body: Record<string, any> = {
                        ...(effectiveModel ? { model: effectiveModel } : {}),
                        messages: fallbackRequest.originalMessages,
                        stream: true,
                        conversationId,
                        preferredProvider: providerId,
                      };
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
                          while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buf += decoder.decode(value, { stream: true });
                            while (true) {
                              const idx = buf.indexOf("\n");
                              if (idx < 0) break;
                              const line = buf.slice(0, idx).replace(/\r$/, "");
                              buf = buf.slice(idx + 1);
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
                                } catch { }
                              }
                            }
                          }
                          reader.releaseLock();
                          if (fullContent) {
                            setMessages((prev) => [...prev, {
                              id: Date.now(),
                              role: "assistant" as const,
                              content: fullContent,
                              createdAt: new Date(),
                            }]);
                            setStreamingContent("");
                          }
                        }
                      } catch (err) {
                        console.error("Fallback request failed:", err);
                        toast.error("Failed to send request with fallback provider");
                      }
                      setIsStreaming(false);
                    }
                  }}
                  onReject={() => {
                    setFallbackRequest(null);
                    // Show error message in chat
                    setMessages((prev) => [...prev, {
                      id: Date.now(),
                      role: "assistant" as const,
                      content: `Request cancelled. ${fallbackRequest.from.modelName} via ${fallbackRequest.from.providerName} is temporarily unavailable. You can try again later or select a different model.`,
                      createdAt: new Date(),
                    }]);
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
          <div className={cn(
            "mb-3 flex items-center gap-2 rounded-lg border px-3 py-2",
            detectedSkill.executionMode === "media-generate"
              ? "border-purple-300 bg-purple-50 dark:bg-purple-900/20"
              : "border-primary/30 bg-primary/5"
          )}>
            <Sparkles className={cn(
              "h-4 w-4",
              detectedSkill.executionMode === "media-generate" ? "text-purple-600" : "text-primary"
            )} />
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
            {detectedSkill.executionMode === "media-generate" && filteredMediaModels.length > 0 && (
              <Popover open={mediaModelOpen} onOpenChange={setMediaModelOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 rounded-md border border-purple-200 bg-white px-2 py-0.5 text-xs text-purple-700 hover:bg-purple-50 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-300">
                    {filteredMediaModels.find(m => m.id === selectedMediaModel)?.name ?? "Select model"}
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
                      .filter(m => m.name.toLowerCase().includes(mediaModelSearch.toLowerCase()))
                      .map(m => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedMediaModel(m.id);
                            setMediaModelOpen(false);
                            setMediaModelSearch("");
                            const storageKey = detectedSkill?.type === "video-generation"
                              ? "smartspec_lastVideoModel"
                              : "smartspec_lastImageModel";
                            localStorage.setItem(storageKey, m.id);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent",
                            selectedMediaModel === m.id && "bg-purple-50 text-purple-700 dark:bg-purple-900/40"
                          )}
                        >
                          <span className="font-medium">{m.name}</span>
                          <span className="text-muted-foreground">{m.creditCost}cr</span>
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
            {selectedLibrarySources.map((item) => (
              <Badge key={item.item_id} variant="secondary" className="gap-2 pr-1">
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
            {selectedLibrarySources.map((item) => (
              <Badge key={item.item_id} variant="secondary" className="gap-2 pr-1">
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
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((a) => (
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
        )}

        <div className="flex gap-2 items-center">
          <TooltipProvider>
            {/* Attach File Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePickFile}
                  disabled={uploadMutation.isPending || isStreaming}
                  className="shrink-0"
                >
                  <ImagePlus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Attach image or file</p>
              </TooltipContent>
            </Tooltip>

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
                    <span className="text-xs text-muted-foreground">Updated in:</span>
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={String(librarySearchRecentDays)}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (next === "all") {
                          setLibrarySearchRecentDays("all");
                          return;
                        }
                        setLibrarySearchRecentDays(Number(next) as Exclude<LibraryRecentDaysFilter, "all">);
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
                        Library search unavailable. Chat can continue without it.
                      </div>
                    ) : debouncedLibrarySearchQuery.trim().length === 0 && librarySearchRecentDays === "all" ? (
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
                          {attachableLibrarySources.map((item) => {
                            const isSelected = selectedLibrarySources.some(
                              (selected) => selected.item_id === item.item_id,
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
                                    isSelected ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <span className="flex-1 truncate">{item.title}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {item.item_type}
                                </Badge>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                        {librarySearchData?.has_more && (
                          <div className="mx-2 mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Showing up to 50 results. There may be more items. Add more filters or keywords.
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
                  onClick={() => setInput(input ? input + "\n\ncreate image: " : "create image: ")}
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
                  onClick={() => setInput(input ? input + "\n\ncreate video: " : "create video: ")}
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
            onChange={(e) => onFiles(e.target.files)}
          />
          <div className="relative flex-1">
            <SlashCommandMenu
              filter={slashFilter}
              visible={showSlashMenu}
              onSelect={(slug) => {
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
              onChange={(e) => {
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
              onKeyDown={(e) => {
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
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={isRecording ? stopRecording : undefined}
            disabled={isTranscribing || isStreaming || !!fallbackRequest}
            title="Hold to record"
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className={cn("h-4 w-4", isRecording && "animate-pulse text-white")} />
            )}
          </Button>
          <Button
            onClick={onSend}
            disabled={isStreaming || uploadMutation.isPending || (!input.trim() && attachments.length === 0 && selectedLibrarySources.length === 0) || !!fallbackRequest}
          >
            {isStreaming ? (
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
      {isSkillFormEnabled && skillForm.renderSkillSelector()}
    </div>
  );
}
