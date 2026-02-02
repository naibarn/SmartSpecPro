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
  Music,
  Zap,
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
import { Brain, Lightbulb, Languages, Mic } from "lucide-react";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { ScheduleConfirmCard } from "./ScheduleConfirmCard";
import { toast } from "sonner";

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

const skillIconMap: Record<string, React.ElementType> = {
  "image-generation": Wand2,
  "video-generation": Video,
  "audio-generation": Music,
  "code-assistant": Code2,
  "document-analysis": FileText,
  "web-search": Search,
  "prompt-enhancement": Sparkles,
};

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
}

export function ChatView({ conversationId, onTitleUpdate }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  // Track when we last added a local message to prevent useEffect from overwriting
  const lastLocalAddTime = useRef<number>(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  // Fetch conversation details
  const { data: conversation } = trpc.chat.getConversation.useQuery(
    { id: conversationId! },
    { enabled: !!conversationId }
  );

  // Fetch messages
  const { data: messagesData, isLoading: loadingMessages } = trpc.chat.getMessages.useQuery(
    { conversationId: conversationId!, limit: 100 },
    { enabled: !!conversationId }
  );

  // Get credits balance
  const { data: credits } = trpc.credits.balance.useQuery();

  // Get available models from LLM providers
  const { data: modelsData } = trpc.llmProviders.availableModels.useQuery();

  // Current selected model (use conversation model, localStorage fallback, or first available)
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem("smartspec_lastModel") || ""
  );

  // Sync selected model with conversation model
  useEffect(() => {
    if (conversation?.model) {
      setSelectedModel(conversation.model);
    } else if (!selectedModel && modelsData?.models && modelsData.models.length > 0) {
      const defaultModel = modelsData.models.find(m => m.isDefault);
      setSelectedModel(defaultModel?.id || modelsData.models[0].id);
    }
  }, [conversation?.model, modelsData?.models]);

  // Persist selected model to localStorage
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem("smartspec_lastModel", selectedModel);
    }
  }, [selectedModel]);

  // Mutations
  const uploadMutation = trpc.ai.upload.useMutation();
  const sendMessageMutation = trpc.chat.sendMessage.useMutation();
  const updateConversationMutation = trpc.chat.updateConversation.useMutation();
  // Note: saveAssistantMutation removed - server now saves message at end of streaming
  const processMemoryMutation = trpc.memory.processMemory.useMutation();
  const detectSkillMutation = trpc.chat.detectSkill.useMutation();
  const executeSkillMutation = trpc.chat.executeSkill.useMutation();
  const addSkillCreditsMutation = trpc.chat.addSkillCreditsToConversation.useMutation();
  const buildPromptMutation = trpc.skills.buildPrompt.useMutation();

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

  // Brainstorm mode state
  const [brainstormMode, setBrainstormMode] = useState(false);
  const [brainstormPartnerModel, setBrainstormPartnerModel] = useState("");
  const [brainstormModelDialogOpen, setBrainstormModelDialogOpen] = useState(false);
  const [brainstormStreamingRole, setBrainstormStreamingRole] = useState<string | null>(null);
  const [brainstormStreamingRound, setBrainstormStreamingRound] = useState(0);

  // Media generation skills that should be executed automatically
  const mediaSkills = ["image-generation", "video-generation", "audio-generation"];

  // Handle model change
  const handleModelChange = async (modelId: string) => {
    if (!conversationId || isStreaming) return;

    setSelectedModel(modelId);

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

  // Skill detection state
  const [detectedSkill, setDetectedSkill] = useState<{
    id: string;
    name: string;
    type: string;
    confidence: number;
    suggestedPrompt: string | null;
  } | null>(null);

  // Schedule confirm card state
  const [pendingSchedule, setPendingSchedule] = useState<any>(null);

  const parseIntentMutation = trpc.scheduledMessages.parseIntent.useMutation();

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
        const result = await detectSkillMutation.mutateAsync({
          message: debouncedInput,
          conversationId,
        });

        if (result.detected && result.skill) {
          setDetectedSkill({
            id: result.skill.id,
            name: result.skill.name,
            type: result.skill.type,
            confidence: result.confidence,
            suggestedPrompt: result.suggestedPrompt,
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

  // Handle Auto Prompt enhancement
  const handleAutoPrompt = async () => {
    if (!input.trim() || isEnhancingPrompt) return;

    setIsEnhancingPrompt(true);
    try {
      // Get reference images from attachments
      const referenceImages = attachments
        .filter(a => a.fileType.startsWith("image/"))
        .map(a => a.url)
        .slice(0, 5);

      const result = await buildPromptMutation.mutateAsync({
        userInput: input,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        language: "both",
      });

      if (result.success && result.userPrompt) {
        // The userPrompt now includes the enhanced content
        // For the full prompt enhancement, we'd need to call LLM with systemPrompt + userPrompt
        // For now, prefix with instruction to enhance
        const enhanced = `Generate an image of: ${input}\n\n[PromptDepth Pro v8.9 Enhanced]`;
        setInput(enhanced);
        setEnhancedPrompt(enhanced);
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
  const streamResponse = async (userMessage: Message, skillUsed?: string) => {
    if (!conversationId) return;

    setIsStreaming(true);
    setStreamingContent("");

    // Get memory-aware context from server
    let apiMessages: Array<{ role: string; content: string }>;
    try {
      const selectedModelData = modelsData?.models?.find(m => m.id === selectedModel);
      const memoryMode = (conversation as any)?.memoryMode || "full";
      const contextData = await utils.memory.getChatContext.fetch({
        conversationId,
        modelContextLength: selectedModelData?.contextLength,
        currentMessage: userMessage.content,
        memoryMode,
      });
      apiMessages = [
        ...contextData.messages,
        { role: "user", content: userMessage.content },
      ];
    } catch (error) {
      // Fallback to simple context if memory fetch fails
      apiMessages = [
        ...(conversation?.systemPrompt
          ? [{ role: "system" as const, content: conversation.systemPrompt }]
          : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: userMessage.content },
      ];
    }

    // Include conversationId so server can save the message at end of streaming
    // Use selectedModel which reflects user's current selection
    const body = {
      model: selectedModel || conversation?.model || "gpt-4o-mini",
      messages: apiMessages,
      stream: true,
      conversationId,
      skillUsed,
    };

    try {
      const resp = await fetch("/api/llm/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok || !resp.body) {
        const txt = await resp.text().catch(() => "Stream failed");
        setStreamingContent(`[Error] ${txt}`);
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let fullContent = "";
      let savedMessageId: number | null = null;
      let creditsUsed = 0;

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
                    console.log("[Chat Client] Server saved message:", { savedMessageId, creditsUsed });
                  } else if (eventName === "save_error") {
                    console.error("[Chat Client] Server save error:", parsed.error);
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
                fullContent += delta;
                setStreamingContent(fullContent);
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
          modelUsed: selectedModel || conversation?.model || "gpt-4o-mini",
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

        // Invalidate conversation list (for title/timestamp) and credits
        utils.chat.listConversations.invalidate();
        utils.credits.balance.invalidate();

        // Process memory in background (entity extraction, summarization check)
        processMemoryMutation.mutateAsync({ conversationId }).then((result) => {
          // Show auto-compact notification
          if (result.compacted && result.compactedMessageCount > 0) {
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
        }
      } else {
        setStreamingContent("");
        setIsStreaming(false);
      }
    } catch (error) {
      console.error("Stream error:", error);
      setStreamingContent(`[Error] Failed to stream response`);
      setIsStreaming(false);
    }
  };

  // Send message
  // ─── Brainstorm streaming ─────────────────────────────────────────
  const streamBrainstorm = async (userMessage: Message) => {
    if (!conversationId) return;
    setIsStreaming(true);
    setStreamingContent("");

    try {
      // Build memory context
      const contextData = await utils.memory.getChatContext.fetch({ conversationId });
      const apiMessages = [
        ...(contextData?.messages || []),
        { role: "user", content: userMessage.content },
      ];

      const resp = await fetch("/api/llm/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: apiMessages,
          modelA: selectedModel || conversation?.model || "gpt-4o-mini",
          modelB: brainstormPartnerModel,
          conversationId,
          maxRounds: 3,
          userMessage: userMessage.content,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: { message: "Brainstorm request failed" } }));
        throw new Error(err?.error?.message || "Brainstorm failed");
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let currentContent = "";
      let currentRole = "";
      let currentRound = 0;
      let currentModel = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });

        while (true) {
          const nlIdx = buf.indexOf("\n");
          if (nlIdx < 0) break;

          const line = buf.slice(0, nlIdx).replace(/\r$/, "");
          buf = buf.slice(nlIdx + 1);

          if (line.startsWith("event:")) {
            const eventName = line.slice("event:".length).trim();

            // Read data line
            const dataIdx = buf.indexOf("\n");
            if (dataIdx < 0) continue;
            const dataLine = buf.slice(0, dataIdx).replace(/\r$/, "");
            buf = buf.slice(dataIdx + 1);

            if (!dataLine.startsWith("data:")) continue;
            const dataStr = dataLine.slice("data:".length).trim();

            try {
              const data = JSON.parse(dataStr);

              if (eventName === "brainstorm_skill") {
                toast.info(`Using ${data.skillName} expertise`);
              } else if (eventName === "brainstorm_turn") {
                if (data.status === "start") {
                  currentContent = "";
                  currentRole = data.role;
                  currentRound = data.round;
                  currentModel = data.model;
                  setBrainstormStreamingRole(data.role);
                  setBrainstormStreamingRound(data.round);
                  setStreamingContent("");
                } else if (data.status === "end" && currentContent) {
                  // Finalize this turn as a message
                  lastLocalAddTime.current = Date.now();
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: Date.now() + Math.random(),
                      role: "assistant" as const,
                      content: currentContent,
                      modelUsed: currentModel,
                      skillUsed: "brainstorm",
                      creditsUsed: undefined,
                      createdAt: new Date(),
                      // Store brainstorm metadata in a way that's accessible
                      skillArgs: { brainstormRound: currentRound, brainstormRole: currentRole } as any,
                    } as any,
                  ]);
                  setStreamingContent("");
                  setBrainstormStreamingRole(null);
                }
              } else if (eventName === "brainstorm_credits") {
                // Update the last message with credits info
                setMessages((prev) => {
                  const updated = [...prev];
                  // Find last message matching this role/round
                  for (let i = updated.length - 1; i >= 0; i--) {
                    const m = updated[i] as any;
                    if (m.skillUsed === "brainstorm" && m.skillArgs?.brainstormRole === data.role) {
                      updated[i] = { ...m, creditsUsed: String(data.credits) };
                      break;
                    }
                  }
                  return updated;
                });
              } else if (eventName === "brainstorm_chunk") {
                currentContent += data.content;
                setStreamingContent(currentContent);
              } else if (eventName === "brainstorm_done") {
                // Refresh messages from server to get proper IDs
                utils.chat.getMessages.invalidate({ conversationId });
                utils.credits.balance.invalidate();
                toast.success(`Brainstorm complete — ${data.totalCredits} credits used`);
              } else if (eventName === "brainstorm_error") {
                toast.error(data.error || "Brainstorm failed");
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Brainstorm failed");
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      setBrainstormStreamingRole(null);
      setBrainstormStreamingRound(0);
    }
  };

  const onSend = async () => {
    if (isStreaming || !conversationId) return;
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const content = buildUserContent(text, attachments);

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
    setDetectedSkill(null);
    scrollToBottom();

    // Auto-generate title for new conversations
    if (messages.length === 0 && onTitleUpdate) {
      const title = text.substring(0, 50) + (text.length > 50 ? "..." : "");
      onTitleUpdate(title);
    }

    // Capture the detected skill before clearing it
    const currentSkillId = detectedSkill?.id;
    const currentSkillType = detectedSkill?.type;
    const skillPrompt = detectedSkill?.suggestedPrompt || text;

    // Check if this is a chat-alert (scheduling) skill
    if (currentSkillId === "chat-alert" || currentSkillType === "automation") {
      try {
        const parsed = await parseIntentMutation.mutateAsync({
          message: text,
          model: selectedModel || conversation?.model || undefined,
        });
        setPendingSchedule(parsed);
        // Add assistant message about the schedule
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            conversationId: conversationId || 0,
            role: "assistant" as const,
            content: `I detected a scheduling request. Please confirm the details below.`,
            createdAt: new Date(),
            skillUsed: "chat-alert",
          },
        ]);
      } catch {
        // Fall through to normal chat if parse fails
      }
      return;
    }

    // Check if this is a media generation skill (check by type, not ID)
    if (currentSkillId && currentSkillType && mediaSkills.includes(currentSkillType)) {
      // Execute media generation skill
      setIsStreaming(true);
      setStreamingContent("Generating media...");

      // Extract image URLs from attachments for reference images (1-5 images)
      const referenceImageUrls = attachments
        .filter(a => a.fileType.startsWith("image/"))
        .map(a => a.url)
        .slice(0, 5);

      try {
        const result = await executeSkillMutation.mutateAsync({
          skillId: currentSkillId,
          prompt: skillPrompt,
          conversationId,
          referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        });

        let responseContent = "";

        // Collect image URLs for attachments
        let imageAttachments: Array<{ type: "image"; url: string; name: string }> = [];

        if (result.success) {
          if (result.type === "image" && result.resultUrls && result.resultUrls.length > 0) {
            responseContent = `Generated image${result.resultUrls.length > 1 ? 's' : ''}:\n\n${result.resultUrls.map(url => `![Generated Image](${url})`).join('\n\n')}`;
            // Store URLs as attachments for persistence
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
              imageAttachments = [{
                type: "image" as const,
                url: result.resultUrl,
                name: "generated-image.png",
              }];
            }
          } else {
            responseContent = result.message || "Media generated successfully!";
          }

          if (result.creditsUsed) {
            responseContent += `\n\n*Credits used: ${result.creditsUsed}*`;
          }

          // Update conversation credits for skill usage
          if (result.creditsUsed && result.creditsUsed > 0) {
            addSkillCreditsMutation.mutate({
              conversationId,
              creditsUsed: result.creditsUsed,
              skillUsed: currentSkillId,
            });
          }
        } else {
          responseContent = `Failed to generate media: ${result.error || "Unknown error"}`;
        }

        // Add assistant message with the result and attachments
        const newMessage = {
          id: Date.now(),
          role: "assistant" as const,
          content: responseContent,
          attachments: imageAttachments.length > 0 ? imageAttachments : undefined,
          creditsUsed: result.creditsUsed?.toString(),
          skillUsed: currentSkillId,
          createdAt: new Date(),
        };

        lastLocalAddTime.current = Date.now();
        setMessages((prev) => [...prev, newMessage]);
        setStreamingContent("");
        setIsStreaming(false);

        // Invalidate to sync with server and refresh conversation credits
        utils.chat.getMessages.invalidate({ conversationId });
        utils.chat.getConversation.invalidate({ id: conversationId });
        utils.credits.balance.invalidate();

      } catch (error) {
        console.error("Skill execution error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to execute skill";

        const errorResponse = {
          id: Date.now(),
          role: "assistant" as const,
          content: `Error: ${errorMessage}`,
          skillUsed: currentSkillId,
          createdAt: new Date(),
        };

        lastLocalAddTime.current = Date.now();
        setMessages((prev) => [...prev, errorResponse]);
        setStreamingContent("");
        setIsStreaming(false);
      }
    } else if (brainstormMode && brainstormPartnerModel) {
      // Brainstorm mode: multi-model debate
      await streamBrainstorm({
        id: userMessage.id,
        role: "user",
        content: typeof content === "string" ? content : text,
        createdAt: new Date(userMessage.createdAt),
      });
    } else {
      // Stream response for regular chat (non-media skills)
      await streamResponse({
        id: userMessage.id,
        role: "user",
        content: typeof content === "string" ? content : text,
        createdAt: new Date(userMessage.createdAt),
      }, currentSkillId);
    }
  };

  // Render user content (including images)
  const renderUserContent = (message: Message) => {
    const imageAttachments = message.attachments?.filter((a) => a.type?.startsWith("image")) || [];
    const videoAttachments = message.attachments?.filter((a) => a.type?.startsWith("video")) || [];
    const fileAttachments = message.attachments?.filter((a) => !a.type?.startsWith("image") && !a.type?.startsWith("video")) || [];

    return (
      <div className="space-y-2">
        <div className="whitespace-pre-wrap">{message.content}</div>
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
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">{conversation?.title || "Chat"}</h2>
          {/* Model Selector */}
          {modelsData?.models && modelsData.models.length > 0 ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 max-w-[280px] justify-start gap-2 text-xs font-normal"
                onClick={() => setModelDialogOpen(true)}
                disabled={isStreaming || updateConversationMutation.isPending}
              >
                <Bot className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {modelsData.models.find(m => m.id === selectedModel)?.name || selectedModel || "Select model"}
                </span>
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
                  {Object.entries(modelsByProvider).map(([provider, models]) => (
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
                          <span className="flex-1 truncate">{model.name}</span>
                          {model.isDefault && (
                            <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0">
                              Default
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </CommandDialog>
            </>
          ) : (
            <Badge variant="outline" className="text-xs">
              {selectedModel || "No model"}
            </Badge>
          )}

          {/* Brainstorm Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={brainstormMode ? "default" : "ghost"}
                  size="sm"
                  className={cn("h-8 gap-1", brainstormMode && "bg-yellow-500 hover:bg-yellow-600 text-white")}
                  onClick={() => setBrainstormMode(!brainstormMode)}
                  disabled={isStreaming}
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  {brainstormMode && <span className="text-xs">Brainstorm</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Toggle Brainstorm Mode (two models collaborate)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Model B selector (when brainstorm is ON) */}
          {brainstormMode && modelsData?.models && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 max-w-[220px] justify-start gap-2 text-xs font-normal border-purple-300"
                onClick={() => setBrainstormModelDialogOpen(true)}
                disabled={isStreaming}
              >
                <Brain className="h-3 w-3 shrink-0 text-purple-500" />
                <span className="truncate text-purple-700">
                  {modelsData.models.find(m => m.id === brainstormPartnerModel)?.name || "Select Model B"}
                </span>
              </Button>
              <CommandDialog
                open={brainstormModelDialogOpen}
                onOpenChange={setBrainstormModelDialogOpen}
                title="Select Brainstorm Partner (Model B)"
                description="Choose a second model for collaborative brainstorming"
              >
                <CommandInput placeholder="Search models..." />
                <CommandList className="max-h-[60vh]">
                  <CommandEmpty>No models found.</CommandEmpty>
                  {Object.entries(modelsByProvider).map(([provider, models]) => (
                    <CommandGroup key={provider} heading={provider}>
                      {models.map((model) => (
                        <CommandItem
                          key={model.id}
                          value={`${model.name} ${model.id} ${provider}`}
                          onSelect={() => {
                            setBrainstormPartnerModel(model.id);
                            setBrainstormModelDialogOpen(false);
                          }}
                          className="flex items-center gap-2"
                        >
                          <Check className={cn("h-3.5 w-3.5 shrink-0", brainstormPartnerModel === model.id ? "opacity-100" : "opacity-0")} />
                          <span className="flex-1 truncate">{model.name}</span>
                          {model.id === selectedModel && (
                            <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0">
                              Model A
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </CommandDialog>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Session credits (total used in this conversation) */}
          {conversation?.totalCreditsUsed && Number(conversation.totalCreditsUsed) > 0 && (
            <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              {Number(conversation.totalCreditsUsed)} session
            </Badge>
          )}
          <Badge variant="secondary" className="gap-1">
            <CreditCard className="h-3 w-3" />
            {credits?.credits || 0} credits
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
      <ScrollArea className="flex-1 min-h-0 relative">
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
            </div>
          ) : (
            <>
              {messages.map((m) => {
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
                        <SafeMarkdown
                          onImageClick={(images, index) => openImageLightbox(images, index)}
                        >
                          {stripArtifactTags(m.content)}
                        </SafeMarkdown>
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
                      </>
                    ) : (
                      renderUserContent(m)
                    )}
                    {m.role === "assistant" && (m.creditsUsed || m.skillUsed) && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        {m.skillUsed && m.skillUsed !== "brainstorm" && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            {(() => {
                              const SkillIcon = skillIconMap[m.skillUsed] || Sparkles;
                              return <SkillIcon className="h-3 w-3" />;
                            })()}
                            {m.skillUsed.replace(/-/g, " ")}
                          </Badge>
                        )}
                        {m.creditsUsed && Number(m.creditsUsed) > 0 && (
                          <span>
                            {Number(m.creditsUsed)} credit{Number(m.creditsUsed) !== 1 ? 's' : ''}
                            {m.modelUsed && m.skillUsed !== "brainstorm" && ` — ${m.modelUsed}`}
                          </span>
                        )}
                      </div>
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

              {/* Streaming message */}
              {streamingContent && (
                <div className={cn(
                  "mr-auto max-w-[85%] rounded-lg px-4 py-3",
                  brainstormStreamingRole === "model_a" ? "bg-blue-50 border-l-4 border-blue-400" :
                  brainstormStreamingRole === "model_b" ? "bg-purple-50 border-l-4 border-purple-400" :
                  brainstormStreamingRole === "summary" ? "bg-green-50 border-l-4 border-green-400" :
                  "bg-muted",
                )}>
                  {brainstormStreamingRole && (
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline" className={cn(
                        "text-[10px]",
                        brainstormStreamingRole === "model_a" && "border-blue-400 text-blue-600",
                        brainstormStreamingRole === "model_b" && "border-purple-400 text-purple-600",
                        brainstormStreamingRole === "summary" && "border-green-400 text-green-600",
                      )}>
                        {brainstormStreamingRole === "summary" ? "Summary" :
                          `${brainstormStreamingRole === "model_a" ? "Model A" : "Model B"} · Round ${brainstormStreamingRound}`}
                      </Badge>
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <SafeMarkdown
                    onImageClick={(images, index) => openImageLightbox(images, index)}
                  >
                    {stripArtifactTags(streamingContent)}
                  </SafeMarkdown>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t p-4">
        {/* Quick Actions for Generation */}
        {!isStreaming && messages.length === 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-purple-600 border-purple-200 hover:bg-purple-50 hover:border-purple-300"
              onClick={() => setInput("Generate an image of ")}
            >
              <Wand2 className="h-4 w-4" />
              Generate Image
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
              onClick={() => setInput("Create a video of ")}
            >
              <Video className="h-4 w-4" />
              Generate Video
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-green-600 border-green-200 hover:bg-green-50 hover:border-green-300"
              onClick={() => setInput("Generate audio/speech for ")}
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
            mediaSkills.includes(detectedSkill.type)
              ? "border-purple-300 bg-purple-50 dark:bg-purple-900/20"
              : "border-primary/30 bg-primary/5"
          )}>
            <Sparkles className={cn(
              "h-4 w-4",
              mediaSkills.includes(detectedSkill.type) ? "text-purple-600" : "text-primary"
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
            {mediaSkills.includes(detectedSkill.type) && (
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

        <div className="flex gap-2">
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
                  <ImagePlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Attach image or file</p>
              </TooltipContent>
            </Tooltip>

            {/* Generate Image Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setInput(input ? input + "\n\nGenerate an image: " : "Generate an image of ")}
                  disabled={isStreaming}
                  className="shrink-0 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Generate Image</p>
              </TooltipContent>
            </Tooltip>

            {/* Generate Video Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setInput(input ? input + "\n\nCreate a video: " : "Create a video of ")}
                  disabled={isStreaming}
                  className="shrink-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Video className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Generate Video</p>
              </TooltipContent>
            </Tooltip>

            {/* Auto Prompt Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAutoPrompt}
                  disabled={isStreaming || isEnhancingPrompt || !input.trim()}
                  className="shrink-0 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                >
                  {isEnhancingPrompt ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Auto Prompt (PromptDepth Pro)</p>
              </TooltipContent>
            </Tooltip>
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
                setInput(`/${slug} `);
                setShowSlashMenu(false);
              }}
              onClose={() => setShowSlashMenu(false)}
            />
            <Textarea
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
              className="min-h-[44px] resize-none"
              onKeyDown={(e) => {
                if (showSlashMenu) return; // Let SlashCommandMenu handle keys
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              disabled={isStreaming}
            />
          </div>
          <Button
            variant={isRecording ? "destructive" : "outline"}
            size="icon"
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={isRecording ? stopRecording : undefined}
            disabled={isTranscribing || isStreaming}
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
            disabled={isStreaming || uploadMutation.isPending || (!input.trim() && attachments.length === 0)}
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
    </div>
  );
}
