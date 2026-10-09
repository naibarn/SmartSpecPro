import { useEffect, useState, useRef, useCallback, useReducer, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChatView } from "@/components/chat/ChatView";
import { UniversalControlPlanePanel } from "@/components/chat/UniversalControlPlanePanel";
import { useConfirm } from "@/components/ui/confirm/ConfirmProvider";
import { Button } from "@smartspec/ui/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@smartspec/ui/src/components/ui/dialog";
import { Textarea } from "@smartspec/ui/src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@smartspec/ui/src/components/ui/select";
import { toast } from "sonner";
import {
  Bot,
  FileText,
  Image,
  Loader2,
  MessageSquarePlus,
  Network,
  Paperclip,
  RefreshCw,
  Siren,
  X,
} from "lucide-react";
import { Switch } from "@smartspec/ui/src/components/ui/switch";
import {
  REPORT_ERROR_EVENT,
  getDiagnosticsForFeedback,
  type DiagnosticsBundle,
  type ReportErrorEventDetail,
} from "@/lib/systemErrorMonitor";
import { EMERGENCY_MAP_CHAT_EVENT, parseEmergencyMapChatRequest } from "@/components/emergency/mapChatHandoff";
import { useTenantFeatureFlagStatus } from "@/hooks/useTenantFeatureFlag";
import { ASSISTANT_MASCOT_GLOBAL_ALLOW, isAssistantMascotEnabled } from "@/lib/assistantMascotFeatureGate";
import { AssistantMascot } from "@/components/assistant-mascot/AssistantMascot";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { loadAssistantMascotPreferences, assistantMascotStorageKey, DEFAULT_ASSISTANT_MASCOT_PREFERENCES } from "@/lib/assistantMascotPreferences";
import { ASSISTANT_MASCOT_PREFERENCES_CHANGED_EVENT, ASSISTANT_NOTIFICATION_ARRIVAL_EVENT, ASSISTANT_NOTIFICATION_BASELINE_EVENT, ASSISTANT_NOTIFICATION_BASELINE_REQUEST_EVENT, OPEN_GLOBAL_NOTIFICATION_BELL_EVENT, SHOW_ASSISTANT_MASCOT_DEMO_EVENT, type AssistantNotificationProjection } from "@/lib/assistantMascotEvents";
import { createInitialAttentionState, reduceNotificationAttention } from "@/lib/notificationAttention";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf", "md"]);
const FEEDBACK_STORAGE_KEY = "feedback-button-position";
const FEEDBACK_MARGIN = 16;
const FEEDBACK_DEFAULT_WIDTH = 170;
const FEEDBACK_DEFAULT_HEIGHT = 40;
const FEEDBACK_DRAG_THRESHOLD = 4;

type FeedbackPosition = {
  x: number;
  y: number;
};

type FeedbackPlacement =
  | { mode: "docked" }
  | ({ mode: "custom" } & FeedbackPosition);

type FeedbackDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  moved: boolean;
};

type HelpPanel = "chat" | "control-plane" | "feedback";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getDockedFeedbackPosition(
  viewportWidth: number,
  viewportHeight: number,
  size: { width: number; height: number } = {
    width: FEEDBACK_DEFAULT_WIDTH,
    height: FEEDBACK_DEFAULT_HEIGHT,
  },
): FeedbackPosition {
  return {
    x: Math.max(FEEDBACK_MARGIN, viewportWidth - size.width - FEEDBACK_MARGIN),
    y: Math.max(FEEDBACK_MARGIN, viewportHeight - size.height - FEEDBACK_MARGIN),
  };
}

function clampFeedbackPosition(
  position: FeedbackPosition,
  viewportWidth: number,
  viewportHeight: number,
  size: { width: number; height: number } = {
    width: FEEDBACK_DEFAULT_WIDTH,
    height: FEEDBACK_DEFAULT_HEIGHT,
  },
) {
  return {
    x: clamp(position.x, FEEDBACK_MARGIN, Math.max(FEEDBACK_MARGIN, viewportWidth - size.width - FEEDBACK_MARGIN)),
    y: clamp(position.y, FEEDBACK_MARGIN, Math.max(FEEDBACK_MARGIN, viewportHeight - size.height - FEEDBACK_MARGIN)),
  };
}

function getInitialFeedbackPlacement(): FeedbackPlacement {
  if (typeof window === "undefined") {
    return { mode: "docked" };
  }

  try {
    window.localStorage.removeItem(FEEDBACK_STORAGE_KEY);
  } catch {
    // Ignore storage failures and fall back to the default docked position.
  }

  return { mode: "docked" };
}

function clearPersistedFeedbackPlacement() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(FEEDBACK_STORAGE_KEY);
  } catch {
    // Ignore storage failures in private mode / restricted environments.
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return <Image className="h-4 w-4 text-blue-500 shrink-0" />;
  }
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function FeedbackButton() {
  return ASSISTANT_MASCOT_GLOBAL_ALLOW
    ? <FeedbackButtonFeatureGate />
    : <FeedbackButtonContent mascotEnabled={false} />;
}

function FeedbackButtonFeatureGate() {
  const flag = useTenantFeatureFlagStatus("livingMascotDualSurface");
  const enabled = isAssistantMascotEnabled({
    globalAllowed: ASSISTANT_MASCOT_GLOBAL_ALLOW,
    tenantEnabled: flag.enabled,
    tenantResolved: flag.isResolved,
    tenantError: flag.isError,
  });
  return <FeedbackButtonContent mascotEnabled={enabled} />;
}

function FeedbackButtonContent({ mascotEnabled }: { mascotEnabled: boolean }) {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const mascotIdentity = user?.id && user.currentTenantId ? assistantMascotStorageKey(user.id, user.currentTenantId) : null;
  const { t } = useScopedTranslation("chat");
  const { t: settingsT } = useScopedTranslation("settings");
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<HelpPanel>("chat");
  const [chatConversationId, setChatConversationId] = useState<number | null>(null);
  const [chatPromptRequest, setChatPromptRequest] = useState<{
    id: number;
    text: string;
  } | null>(null);
  const [mapContextDraft, setMapContextDraft] = useState<{ id: number; contextText: string } | null>(null);
  const [ticketType, setTicketType] = useState<string>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [isConfirmingUrgent, setIsConfirmingUrgent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [feedbackPlacement, setFeedbackPlacement] = useState<FeedbackPlacement>(() => getInitialFeedbackPlacement());
  const [isButtonDragging, setIsButtonDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth,
  );
  const [mascotPreferences, setMascotPreferences] = useState(DEFAULT_ASSISTANT_MASCOT_PREFERENCES);
  const [showMascotDemo, setShowMascotDemo] = useState(false);
  const [attention, dispatchAttention] = useReducer(
    reduceNotificationAttention,
    undefined,
    () => createInitialAttentionState({ scopeGeneration: 1, enabled: false }),
  );
  // Holds the ticket ID when ticket was created but file upload failed
  const [pendingUploadTicketId, setPendingUploadTicketId] = useState<number | null>(null);
  // Diagnostics bundle from a "แจ้งปัญหา" system-error-toast report, if this
  // dialog session was opened that way. Attached as contextJson on submit and
  // surfaced via a non-editable transparency note in the dialog.
  const [pendingDiagnostics, setPendingDiagnostics] = useState<DiagnosticsBundle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  const dragStateRef = useRef<FeedbackDragState | null>(null);
  const suppressNextClickRef = useRef(false);
  const openRef = useRef(open);
  const pasteImageCounterRef = useRef(0);
  const chatConversationPromiseRef = useRef<Promise<number> | null>(null);

  useEffect(() => {
    if (!mascotEnabled || !mascotIdentity || typeof window === "undefined") {
      setMascotPreferences(DEFAULT_ASSISTANT_MASCOT_PREFERENCES);
      return;
    }
    setMascotPreferences(loadAssistantMascotPreferences(window.localStorage, mascotIdentity));
  }, [mascotEnabled, mascotIdentity]);

  useEffect(() => {
    if (!mascotEnabled || !mascotIdentity) return;
    const syncPreferences = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; preferences?: typeof DEFAULT_ASSISTANT_MASCOT_PREFERENCES }>).detail;
      if (detail?.key !== mascotIdentity || !detail.preferences) return;
      setMascotPreferences(detail.preferences);
    };
    window.addEventListener(ASSISTANT_MASCOT_PREFERENCES_CHANGED_EVENT, syncPreferences);
    return () => window.removeEventListener(ASSISTANT_MASCOT_PREFERENCES_CHANGED_EVENT, syncPreferences);
  }, [mascotEnabled, mascotIdentity]);

  useEffect(() => {
    if (!mascotEnabled || !mascotPreferences.enabled || !mascotPreferences.notificationReminders) {
      setShowMascotDemo(false);
      return;
    }
    const showDemo = () => setShowMascotDemo(true);
    window.addEventListener(SHOW_ASSISTANT_MASCOT_DEMO_EVENT, showDemo);
    return () => window.removeEventListener(SHOW_ASSISTANT_MASCOT_DEMO_EVENT, showDemo);
  }, [mascotEnabled, mascotPreferences.enabled, mascotPreferences.notificationReminders]);

  useEffect(() => {
    dispatchAttention({ type: "SET_ENABLED", enabled: mascotEnabled && mascotPreferences.enabled && mascotPreferences.notificationReminders, now: Date.now() });
  }, [mascotEnabled, mascotPreferences.enabled, mascotPreferences.notificationReminders]);

  useEffect(() => {
    if (!mascotEnabled || !mascotPreferences.enabled || !mascotPreferences.notificationReminders || !mascotIdentity) return;
    const acceptBaseline = (event: Event) => {
      const detail = (event as CustomEvent<AssistantNotificationProjection>).detail;
      if (detail?.scopeKey !== mascotIdentity || !Array.isArray(detail.signals)) return;
      dispatchAttention({ type: "BASELINE", signals: detail.signals });
    };
    const acceptArrival = (event: Event) => {
      const detail = (event as CustomEvent<AssistantNotificationProjection>).detail;
      if (detail?.scopeKey !== mascotIdentity || !Array.isArray(detail.signals)) return;
      for (const signal of detail.signals) {
        dispatchAttention({ type: "NEW_NOTIFICATION", signal, source: "live", now: Date.now(), viewport: window.innerWidth < 768 ? "mobile" : "desktop" });
      }
    };
    window.addEventListener(ASSISTANT_NOTIFICATION_BASELINE_EVENT, acceptBaseline);
    window.addEventListener(ASSISTANT_NOTIFICATION_ARRIVAL_EVENT, acceptArrival);
    window.dispatchEvent(new Event(ASSISTANT_NOTIFICATION_BASELINE_REQUEST_EVENT));
    return () => {
      window.removeEventListener(ASSISTANT_NOTIFICATION_BASELINE_EVENT, acceptBaseline);
      window.removeEventListener(ASSISTANT_NOTIFICATION_ARRIVAL_EVENT, acceptArrival);
    };
  }, [mascotEnabled, mascotPreferences.enabled, mascotPreferences.notificationReminders, mascotIdentity]);

  useEffect(() => {
    if (!mascotEnabled || !mascotPreferences.enabled || !mascotPreferences.notificationReminders) return;
    const hidden = document.visibilityState === "hidden";
    if (open || isButtonDragging || hidden) {
      dispatchAttention({ type: "SUSPEND", now: Date.now() });
      return;
    }
    dispatchAttention({ type: "SET_VISIBLE", visible: true, now: Date.now() });
  }, [mascotEnabled, mascotPreferences.enabled, mascotPreferences.notificationReminders, open, isButtonDragging]);

  useEffect(() => {
    if (!mascotEnabled || !mascotPreferences.enabled || !mascotPreferences.notificationReminders) return;
    const syncVisibility = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden" || open || isButtonDragging) {
        dispatchAttention({ type: "SUSPEND", now });
      } else {
        dispatchAttention({ type: "SET_VISIBLE", visible: true, now });
      }
    };
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("focus", syncVisibility);
    window.addEventListener("blur", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("focus", syncVisibility);
      window.removeEventListener("blur", syncVisibility);
    };
  }, [mascotEnabled, mascotPreferences.enabled, mascotPreferences.notificationReminders, open, isButtonDragging]);

  useEffect(() => {
    if (attention.deadlineAt === null) return;
    const timer = window.setTimeout(() => dispatchAttention({ type: "ADVANCE", now: Date.now() }), Math.max(0, attention.deadlineAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [attention.deadlineAt, attention.status]);

  useEffect(() => {
    if (!showMascotDemo) return;
    const timer = window.setTimeout(() => setShowMascotDemo(false), 5000);
    return () => window.clearTimeout(timer);
  }, [showMascotDemo]);

  const createChatConversationMutation =
    trpc.chat.createConversation.useMutation({
      onSuccess: data => {
        setChatConversationId(data.id);
      },
      onError: error => {
        toast.error(error.message || "เปิด AI Chat ไม่สำเร็จ");
      },
    });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (!dragState.moved) {
        if (Math.abs(deltaX) + Math.abs(deltaY) < FEEDBACK_DRAG_THRESHOLD) {
          return;
        }
        dragState.moved = true;
      }

      event.preventDefault();
      const nextPosition = clampFeedbackPosition(
        {
          x: dragState.originX + deltaX,
          y: dragState.originY + deltaY,
        },
        window.innerWidth,
        window.innerHeight,
        {
          width: dragState.width,
          height: dragState.height,
        },
      );
      setFeedbackPlacement({
        mode: "custom",
        ...nextPosition,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      suppressNextClickRef.current = dragState.moved;
      dragStateRef.current = null;
      setIsButtonDragging(false);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    clearPersistedFeedbackPlacement();
  }, [feedbackPlacement]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      const rect = feedbackButtonRef.current?.getBoundingClientRect();
      setFeedbackPlacement((current) => {
        if (current.mode !== "custom") {
          return current;
        }

        const nextPosition = clampFeedbackPosition(
          { x: current.x, y: current.y },
          window.innerWidth,
          window.innerHeight,
          {
            width: rect?.width ?? FEEDBACK_DEFAULT_WIDTH,
            height: rect?.height ?? FEEDBACK_DEFAULT_HEIGHT,
          },
        );
        return {
          mode: "custom",
          ...nextPosition,
        };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Listen for the "แจ้งปัญหา" action dispatched by systemErrorMonitor when a
  // system-class error toast fires. Opens the dialog pre-filled with the
  // suggested title/description and stashes the error's diagnostics bundle
  // for submission — without clobbering an in-progress draft.
  useEffect(() => {
    function handleReportError(event: Event) {
      const detail = (event as CustomEvent<ReportErrorEventDetail>).detail;
      if (!detail) return;

      setPendingDiagnostics(detail.diagnostics);
      setTicketType("bug");
      setTitle((prev) => (!openRef.current || !prev.trim() ? detail.suggestedTitle : prev));
      setDescription((prev) =>
        !openRef.current || !prev.trim() ? detail.suggestedDescription : prev,
      );
      setActivePanel("feedback");
      setOpen(true);
    }

    window.addEventListener(REPORT_ERROR_EVENT, handleReportError);
    return () => window.removeEventListener(REPORT_ERROR_EVENT, handleReportError);
  }, []);

  async function uploadFiles(ticketId: number): Promise<boolean> {
    if (files.length === 0) return true;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("ticketId", String(ticketId));
      for (const file of files) {
        formData.append("files", file);
      }
      // Include CSRF token header to prevent cross-origin form submission
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf_token="))
        ?.split("=")[1] ?? "";
      const res = await fetch("/api/feedback/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        toast.error(err.error || "File upload failed");
        return false;
      }
      return true;
    } catch {
      toast.error("File upload failed — you can retry");
      return false;
    } finally {
      setUploading(false);
    }
  }

  const submitMutation = trpc.feedback.submit.useMutation({
    onSuccess: async (data) => {
      const uploadOk = await uploadFiles(data.id);
      if (!uploadOk) {
        // Keep dialog open with files for retry
        setPendingUploadTicketId(data.id);
        return;
      }
      toast.success("Feedback submitted! Thank you.");
      resetForm();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit feedback");
    },
  });

  const isSubmitting = submitMutation.isPending || uploading;

  const ensureChatConversation = useCallback(async () => {
    if (!user) {
      throw new Error("Sign in to use AI Chat");
    }
    if (chatConversationId) {
      return chatConversationId;
    }
    if (chatConversationPromiseRef.current) {
      return chatConversationPromiseRef.current;
    }

    const request = createChatConversationMutation
      .mutateAsync({ title: "AI Chat Assistant" })
      .then(result => {
        setChatConversationId(result.id);
        chatConversationPromiseRef.current = null;
        return result.id;
      })
      .catch(error => {
        chatConversationPromiseRef.current = null;
        throw error;
      });
    chatConversationPromiseRef.current = request;
    return request;
  }, [chatConversationId, createChatConversationMutation, user]);

  useEffect(() => {
    if (
      !open ||
      activePanel !== "chat" ||
      authLoading ||
      !user ||
      chatConversationId ||
      createChatConversationMutation.isPending ||
      createChatConversationMutation.error
    ) {
      return;
    }
    void ensureChatConversation().catch(() => undefined);
  }, [
    activePanel,
    authLoading,
    chatConversationId,
    createChatConversationMutation.error,
    createChatConversationMutation.isPending,
    ensureChatConversation,
    open,
    user,
  ]);

  useEffect(() => {
    if (authLoading || user) return;
    setMapContextDraft(null);
    if (activePanel === "control-plane") setActivePanel("chat");
  }, [activePanel, authLoading, user]);

  const selectHelpPanel = useCallback(
    (panel: HelpPanel) => {
      if (panel === "control-plane" && (!user || authLoading)) return;
      setActivePanel(panel);
      if (panel === "chat" && user && !authLoading) {
        void ensureChatConversation().catch(() => undefined);
      }
    },
    [authLoading, ensureChatConversation, user],
  );

  const handleOpenTaskPrompt = useCallback(
    async (prompt: string) => {
      const conversationId = await ensureChatConversation();
      setChatPromptRequest({ id: Date.now(), text: prompt });
      setActivePanel("chat");
      setOpen(true);
      return conversationId;
    },
    [ensureChatConversation],
  );

  useEffect(() => {
    function handleEmergencyMapChat(event: Event) {
      const request = parseEmergencyMapChatRequest((event as CustomEvent<unknown>).detail);
      if (!request) return;
      if (user && !authLoading) {
        const id = Date.now();
        setMapContextDraft({ id, contextText: request.prompt });
      } else {
        // Never stage map context for a guest or while session restoration is pending.
        setMapContextDraft(null);
      }
      setActivePanel("chat");
      setOpen(true);
    }
    window.addEventListener(EMERGENCY_MAP_CHAT_EVENT, handleEmergencyMapChat);
    return () => window.removeEventListener(EMERGENCY_MAP_CHAT_EVENT, handleEmergencyMapChat);
  }, [authLoading, user]);

  const resetForm = useCallback(() => {
    setOpen(false);
    setActivePanel("chat");
    setChatPromptRequest(null);
    setMapContextDraft(null);
    setTitle("");
    setDescription("");
    setIsUrgent(false);
    setIsConfirmingUrgent(false);
    setTicketType("bug");
    setFiles([]);
    setPendingUploadTicketId(null);
    setPendingDiagnostics(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || isSubmitting || isConfirmingUrgent) return;

    if (isUrgent) {
      setIsConfirmingUrgent(true);
      const confirmed = await confirm({
        title: "Send urgent feedback?",
        description:
          "This will immediately alert every eligible admin with a critical center-screen notification. Use this only for issues that need immediate attention.",
        confirmText: "Send Urgent Feedback",
        cancelText: "Go Back",
        tone: "danger",
      });
      setIsConfirmingUrgent(false);
      if (!confirmed) return;
    }

    submitMutation.mutate({
      ticketType: ticketType as any,
      title: title.trim(),
      description: description.trim() || undefined,
      priority: isUrgent ? "critical" : "normal",
      contextJson: (pendingDiagnostics ?? getDiagnosticsForFeedback()) as unknown as Record<
        string,
        unknown
      >,
    });
  }, [
    confirm,
    description,
    getDiagnosticsForFeedback,
    isConfirmingUrgent,
    isSubmitting,
    isUrgent,
    pendingDiagnostics,
    submitMutation,
    ticketType,
    title,
  ]);

  const handleRetryUpload = useCallback(async () => {
    if (!pendingUploadTicketId) return;
    const ok = await uploadFiles(pendingUploadTicketId);
    if (ok) {
      toast.success("Feedback submitted! Thank you.");
      resetForm();
    }
  }, [pendingUploadTicketId, files, resetForm]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const errors: string[] = [];

    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) {
        errors.push(`Maximum ${MAX_FILES} files allowed`);
        return prev;
      }

      const valid: File[] = [];
      for (const file of fileArray.slice(0, remaining)) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          errors.push(`${file.name}: type not allowed (jpg, png, webp, pdf, md)`);
          continue;
        }
        if (file.size === 0) {
          errors.push(`${file.name}: file is empty`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: too large (max 5 MB)`);
          continue;
        }
        valid.push(file);
      }

      if (fileArray.length > remaining) {
        const skipped = fileArray.slice(remaining).map((f) => f.name).join(", ");
        errors.push(`Skipped (limit reached): ${skipped}`);
      }

      if (errors.length > 0) {
        setTimeout(() => toast.error(errors.join("\n")), 0);
      }

      return [...prev, ...valid];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  // Clipboard screenshot paste: fires while any element inside the dialog has
  // focus. Only consumes image items so plain text paste into Title/Description
  // inputs keeps working. Accumulates across multiple sequential pastes (and
  // multiple images in one paste) — validation (size/type/count) is delegated
  // to the existing addFiles().
  const handleDialogPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const pastedImages: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const blob = item.getAsFile();
        if (!blob) continue;
        pasteImageCounterRef.current += 1;
        const ext = (item.type.split("/")[1] || "png").toLowerCase();
        const name = `screenshot-${Date.now()}-${pasteImageCounterRef.current}.${ext}`;
        pastedImages.push(new File([blob], name, { type: blob.type || item.type }));
      }

      if (pastedImages.length === 0) return; // No image in clipboard — let normal text paste through
      event.preventDefault();
      addFiles(pastedImages);
    },
    [addFiles],
  );

  const shouldDockLeftOnMobile = viewportWidth < 640;
  const feedbackButtonStyle = feedbackPlacement.mode === "custom"
    ? {
      left: `${feedbackPlacement.x}px`,
      top: `${feedbackPlacement.y}px`,
    }
    : shouldDockLeftOnMobile
      ? {
        left: `${FEEDBACK_MARGIN}px`,
        bottom: `calc(${FEEDBACK_MARGIN}px + env(safe-area-inset-bottom))`,
      }
    : {
      right: `${FEEDBACK_MARGIN}px`,
      bottom: `calc(${FEEDBACK_MARGIN}px + env(safe-area-inset-bottom))`,
    };

  const handleFeedbackPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    suppressNextClickRef.current = false;
    setIsButtonDragging(true);

    const rect = feedbackButtonRef.current?.getBoundingClientRect();
    const fallbackPosition = feedbackPlacement.mode === "custom"
      ? { x: feedbackPlacement.x, y: feedbackPlacement.y }
      : getDockedFeedbackPosition(window.innerWidth, window.innerHeight, {
        width: rect?.width ?? FEEDBACK_DEFAULT_WIDTH,
        height: rect?.height ?? FEEDBACK_DEFAULT_HEIGHT,
      });

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect?.left ?? fallbackPosition.x,
      originY: rect?.top ?? fallbackPosition.y,
      width: rect?.width ?? FEEDBACK_DEFAULT_WIDTH,
      height: rect?.height ?? FEEDBACK_DEFAULT_HEIGHT,
      moved: false,
    };
  };

  const handleFeedbackClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (suppressNextClickRef.current) {
      event.preventDefault();
      suppressNextClickRef.current = false;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen && (isSubmitting || isConfirmingUrgent)) {
          return;
        }
        if (nextOpen) {
          setOpen(true);
          setActivePanel("chat");
          return;
        }
        resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button
          ref={feedbackButtonRef}
          size="sm"
          variant="outline"
          aria-label="Open AI Chat and Feedback"
          className="z-50 h-11 w-11 rounded-full bg-white p-0 text-slate-900 shadow-lg hover:bg-slate-100 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 md:h-8 md:w-auto md:gap-2 md:px-3"
          style={{
            position: "fixed",
            touchAction: "none",
            cursor: isButtonDragging ? "grabbing" : "grab",
            ...feedbackButtonStyle,
          }}
          onPointerDown={handleFeedbackPointerDown}
          onClick={handleFeedbackClick}
        >
          {mascotEnabled && mascotPreferences.enabled
            ? <AssistantMascot style={mascotPreferences.style} size={24} />
            : <MessageSquarePlus className="h-4 w-4" />}
          <span className={mascotEnabled && !mascotPreferences.chatOnboarding ? "hidden" : "hidden md:inline"}>AI Chat &amp; Feedback</span>
        </Button>
      </DialogTrigger>
      {showMascotDemo && mascotEnabled && mascotPreferences.enabled && mascotPreferences.notificationReminders && (
        <HStack as="aside" gap={2} align="start" className="assistant-reminder-balloon" role="status" aria-live="polite">
          <Text as="p" type="body" maxLines={2}>{settingsT("assistantAppearance.reminderCopy")}</Text>
          <Button type="button" variant="link" size="sm" className="shrink-0" onClick={() => { setShowMascotDemo(false); window.dispatchEvent(new Event(OPEN_GLOBAL_NOTIFICATION_BELL_EVENT)); }}>{settingsT("assistantAppearance.viewNotifications")}</Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={settingsT("assistantAppearance.dismissReminder")} onClick={() => setShowMascotDemo(false)}>×</Button>
        </HStack>
      )}
      {attention.status === "BALLOON_VISIBLE" && mascotEnabled && mascotPreferences.enabled && mascotPreferences.notificationReminders && (
        <HStack as="aside" gap={2} align="start" className="assistant-reminder-balloon" role="status" aria-live="polite" onFocus={() => dispatchAttention({ type: "SET_FOCUS_WITHIN_BALLOON", focused: true, now: Date.now() })} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dispatchAttention({ type: "SET_FOCUS_WITHIN_BALLOON", focused: false, now: Date.now() }); }}>
          <Text as="p" type="body" maxLines={2}>{settingsT("assistantAppearance.reminderCopy")}</Text>
          <Button type="button" variant="link" size="sm" className="shrink-0" onClick={() => { dispatchAttention({ type: "DISMISS", now: Date.now() }); window.dispatchEvent(new Event(OPEN_GLOBAL_NOTIFICATION_BELL_EVENT)); }}>{settingsT("assistantAppearance.viewNotifications")}</Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={settingsT("assistantAppearance.dismissReminder")} onClick={() => dispatchAttention({ type: "DISMISS", now: Date.now() })}>×</Button>
        </HStack>
      )}
      <DialogContent
        className={
          activePanel === "chat" && (authLoading || !user)
            ? "flex max-h-[80dvh] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden p-0 sm:rounded-2xl sm:border"
            : activePanel === "chat" || activePanel === "control-plane"
            ? "flex h-dvh max-h-dvh w-full max-w-none flex-col overflow-hidden rounded-none border-0 p-0 sm:h-[min(88vh,760px)] sm:max-h-[90vh] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:rounded-2xl sm:border"
            : "max-h-[90vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto"
        }
        onPaste={handleDialogPaste}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pb-4 sm:pt-5">
          <DialogTitle className="pr-10 text-left text-base sm:text-lg">
            {user && !authLoading ? "AI Chat & Feedback" : t("chat.guest.panelTitle")}
          </DialogTitle>
        </DialogHeader>
        <nav
          aria-label="AI Chat and Feedback sections"
          role="tablist"
          className={`grid shrink-0 ${user && !authLoading ? "grid-cols-3" : "grid-cols-2"} gap-1 border-b border-border bg-muted/30 p-1.5 sm:p-2`}
        >
          <Button
            type="button"
            role="tab"
            aria-selected={activePanel === "chat"}
            variant={activePanel === "chat" ? "secondary" : "ghost"}
            className="h-10 min-w-0 gap-1 px-1 text-[11px] sm:h-11 sm:gap-2 sm:px-3 sm:text-sm"
            onClick={() => selectHelpPanel("chat")}
          >
            <Bot className="h-4 w-4" aria-hidden="true" />
            {user && !authLoading ? "AI Chat" : t("chat.guest.chatTab")}
          </Button>
          {user && !authLoading && <Button
            type="button"
            role="tab"
            aria-selected={activePanel === "control-plane"}
            variant={activePanel === "control-plane" ? "secondary" : "ghost"}
            className="h-10 min-w-0 gap-1 px-1 text-[11px] sm:h-11 sm:gap-2 sm:px-3 sm:text-sm"
            onClick={() => selectHelpPanel("control-plane")}
          >
            <Network className="h-4 w-4" aria-hidden="true" />
            Task Control
          </Button>}
          <Button
            type="button"
            role="tab"
            aria-selected={activePanel === "feedback"}
            variant={activePanel === "feedback" ? "secondary" : "ghost"}
            className="h-10 min-w-0 gap-1 px-1 text-[11px] sm:h-11 sm:gap-2 sm:px-3 sm:text-sm"
            onClick={() => selectHelpPanel("feedback")}
          >
            <Siren className="h-4 w-4" aria-hidden="true" />
            {user && !authLoading ? "Send Feedback" : t("chat.guest.feedbackTab")}
          </Button>
        </nav>

        <section hidden={activePanel !== "chat"} className="min-h-0 flex-1 overflow-hidden" aria-label="AI Chat Assistant">
          {authLoading ? (
            <section className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center" aria-live="polite">
              <p className="text-sm text-muted-foreground">{t("chat.guest.checkingSession")}</p>
            </section>
          ) : !user ? (
            <section className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center">
              <h2 className="text-lg font-semibold">{t("chat.guest.signInRequired")}</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("chat.guest.description")}
              </p>
              <Button type="button" onClick={() => window.location.assign(getLoginUrl())}>
                {t("chat.guest.signIn")}
              </Button>
            </section>
          ) : createChatConversationMutation.isPending && !chatConversationId ? (
            <section className="flex h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Starting AI Chat...
            </section>
          ) : createChatConversationMutation.error && !chatConversationId ? (
            <section className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">
                {createChatConversationMutation.error.message || "เปิด AI Chat ไม่สำเร็จ"}
              </p>
              <Button type="button" variant="outline" onClick={() => void ensureChatConversation()}>
                Try again
              </Button>
            </section>
          ) : (
            <ChatView
              conversationId={chatConversationId}
              density="compact"
              composerPrompt={chatPromptRequest}
              mapContextDraft={mapContextDraft}
              onRemoveMapContext={() => {
                setMapContextDraft(null);
                setChatPromptRequest(null);
              }}
              onUserMessageSent={() => {
                setMapContextDraft(null);
                setChatPromptRequest(null);
              }}
              showBrowserSessionEntry={false}
            />
          )}
        </section>

        {user && !authLoading && activePanel === "control-plane" && (
          <section className="min-h-0 flex-1 overflow-hidden" aria-label="Task Control Center">
            <UniversalControlPlanePanel
              conversationId={chatConversationId}
              onClose={() => selectHelpPanel("chat")}
              onOpenPrompt={prompt => {
                void handleOpenTaskPrompt(prompt);
              }}
            />
          </section>
        )}

        {activePanel === "feedback" && <div className="space-y-4 p-4 sm:p-5">
          {/* Show retry banner if ticket created but upload failed */}
          {pendingUploadTicketId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="text-amber-800 font-medium">Ticket created but file upload failed</p>
              <p className="text-amber-600 text-xs mt-1">
                You can retry uploading or skip to submit without files.
              </p>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  disabled={uploading}
                  onClick={handleRetryUpload}
                >
                  <RefreshCw className={`h-3 w-3 ${uploading ? "animate-spin" : ""}`} />
                  {uploading ? "Uploading..." : "Retry Upload"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    toast.success("Feedback submitted without attachments.");
                    resetForm();
                  }}
                >
                  Skip
                </Button>
              </div>
            </div>
          )}

          {!pendingUploadTicketId && (
            <>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug Report</SelectItem>
                  <SelectItem value="feature_request">Feature Request</SelectItem>
                  <SelectItem value="observation">Observation</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={2}
                className="min-h-16 break-words"
              />
              <Textarea
                placeholder="Describe in detail..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="break-words"
              />
              <div className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${isUrgent ? "border-red-300 bg-red-50" : "border-border bg-muted/20"}`}>
                <div className="flex items-start gap-2">
                  <Siren className={`mt-0.5 h-4 w-4 shrink-0 ${isUrgent ? "text-red-600" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <label htmlFor="feedback-urgent-switch" className="text-sm font-medium cursor-pointer">
                      Send as urgent
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isUrgent
                        ? "All eligible admins will receive a critical alert immediately."
                        : "Normal feedback is reviewed through the regular queue."}
                    </p>
                  </div>
                </div>
                <Switch
                  id="feedback-urgent-switch"
                  checked={isUrgent}
                  onCheckedChange={setIsUrgent}
                  disabled={isSubmitting || isConfirmingUrgent}
                  aria-label="Send feedback as urgent"
                />
              </div>
            </>
          )}

          {/* File Attachments */}
          <div>
            <div
              role="button"
              tabIndex={0}
              className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/50 hover:bg-muted/30"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.md"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Paperclip className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {isDragOver ? "Drop files here" : "Drag & drop or click to attach files"}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                jpg, png, webp, pdf, md — max 5 MB each — up to {MAX_FILES} files
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                วางภาพจากคลิปบอร์ดได้ (Ctrl+V) สูงสุด {MAX_FILES} ไฟล์
              </p>
            </div>

            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-start gap-2 bg-muted/50 rounded px-2 py-1 text-xs"
                  >
                    {getFileIcon(file.name)}
                    <span className="min-w-0 flex-1 break-words">{file.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      aria-label={`Remove ${file.name}`}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  {files.length}/{MAX_FILES} files
                </p>
              </div>
            )}
          </div>

          {/* Transparency note: only shown when this draft was opened via a
              system-error-toast report, so users know diagnostics are attached. */}
          {pendingDiagnostics && !pendingUploadTicketId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 break-words">
              <p className="break-words">
                ระบบจะแนบข้อมูลวินิจฉัยทางเทคนิค (รหัสติดตาม, หน้าที่เกิดปัญหา, ข้อความ error)
                ไปให้ผู้ดูแลโดยอัตโนมัติ
              </p>
              {pendingDiagnostics.primaryError?.traceId && (
                <p className="mt-1 break-all font-mono text-[10px] text-blue-600">
                  traceId: {pendingDiagnostics.primaryError.traceId}
                </p>
              )}
            </div>
          )}

          {!pendingUploadTicketId && (
            <Button
              className="w-full"
              disabled={!title.trim() || isSubmitting || isConfirmingUrgent}
              onClick={handleSubmit}
            >
              {uploading
                ? "Uploading files..."
                : isConfirmingUrgent
                  ? "Waiting for confirmation..."
                : submitMutation.isPending
                  ? "Submitting..."
                  : "Submit Feedback"}
            </Button>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-primary text-center w-full"
            onClick={() => { setMapContextDraft(null); setOpen(false); setLocation("/my-feedback"); }}
          >
            View my submitted feedback &rarr;
          </button>
          {user?.role === "admin" && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-primary text-center w-full"
              onClick={() => {
                setMapContextDraft(null);
                setOpen(false);
                setLocation("/admin/feedback-hub");
              }}
            >
              Admin Feedback Hub &rarr;
            </button>
          )}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
