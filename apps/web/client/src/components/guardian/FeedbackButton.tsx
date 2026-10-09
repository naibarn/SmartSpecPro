import { useEffect, useLayoutEffect, useState, useRef, useCallback, useReducer, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
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

export function isAssistantBalloonEligible(input: {
  dialogOpen: boolean;
  dragging: boolean;
  documentVisible: boolean;
  keyboardOpen: boolean;
  editableControlFocused: boolean;
  criticalOverlayOpen: boolean;
  routeSuppressed: boolean;
}) {
  return !input.dialogOpen
    && !input.dragging
    && input.documentVisible
    && !input.keyboardOpen
    && !input.editableControlFocused
    && !input.criticalOverlayOpen
    && !input.routeSuppressed;
}

export function isAssistantBalloonSuppressedRoute(location: string) {
  const pathname = location.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  return pathname === "/video-studio"
    || pathname.startsWith("/video-studio/")
    || pathname === "/video-editor"
    || /^\/presentation-editor\/[^/]+$/.test(pathname)
    || /^\/presentation\/[^/]+\/play$/.test(pathname)
    || pathname === "/disaster/map";
}

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
  const [location, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const mascotIdentity = user?.id && user.currentTenantId ? assistantMascotStorageKey(user.id, user.currentTenantId) : null;
  const conversationIdentity = user?.id
    ? `${encodeURIComponent(String(user.id))}:${user.currentTenantId == null ? "no-tenant" : encodeURIComponent(String(user.currentTenantId))}`
    : null;
  const conversationIdentityRef = useRef(conversationIdentity);
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
  const [loadedMascotPreferences, setLoadedMascotPreferences] = useState<{
    identity: string | null;
    preferences: typeof DEFAULT_ASSISTANT_MASCOT_PREFERENCES;
  }>({ identity: null, preferences: DEFAULT_ASSISTANT_MASCOT_PREFERENCES });
  const mascotPreferences = loadedMascotPreferences.identity === mascotIdentity
    ? loadedMascotPreferences.preferences
    : DEFAULT_ASSISTANT_MASCOT_PREFERENCES;
  const [showMascotDemo, setShowMascotDemo] = useState(false);
  const [showChatOnboardingHint, setShowChatOnboardingHint] = useState(false);
  const [balloonSurfaceBlocked, setBalloonSurfaceBlocked] = useState(false);
  const [assistantHintStyle, setAssistantHintStyle] = useState<CSSProperties | null>(null);
  const [attention, dispatchAttention] = useReducer(
    reduceNotificationAttention,
    undefined,
    () => createInitialAttentionState({ scopeGeneration: 1, enabled: false }),
  );
  const attentionScopeKeyRef = useRef(mascotIdentity);
  const attentionScopeGenerationRef = useRef(1);
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
  const chatConversationScopeGenerationRef = useRef(0);
  const previousLocationRef = useRef(location);
  const routeSuppressesBalloon = isAssistantBalloonSuppressedRoute(location);

  useEffect(() => {
    const updateSurfaceEligibility = () => {
      const activeElement = document.activeElement;
      const editableControlFocused = activeElement instanceof HTMLElement && activeElement.matches(
        'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]), textarea, select, [contenteditable="true"], [role="textbox"]',
      );
      const viewport = window.visualViewport;
      const keyboardOpen = Boolean(viewport && window.innerHeight - viewport.height > 120);
      const criticalOverlayOpen = Boolean(document.querySelector(
        '[role="alertdialog"], [aria-modal="true"]:not([data-state="closed"])',
      ));
      setBalloonSurfaceBlocked(!isAssistantBalloonEligible({
        dialogOpen: open,
        dragging: isButtonDragging,
        documentVisible: document.visibilityState !== "hidden",
        keyboardOpen,
        editableControlFocused,
        criticalOverlayOpen,
        routeSuppressed: routeSuppressesBalloon,
      }));
    };
    updateSurfaceEligibility();
    document.addEventListener("focusin", updateSurfaceEligibility);
    document.addEventListener("focusout", updateSurfaceEligibility);
    document.addEventListener("visibilitychange", updateSurfaceEligibility);
    window.addEventListener("resize", updateSurfaceEligibility);
    window.visualViewport?.addEventListener("resize", updateSurfaceEligibility);
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(updateSurfaceEligibility);
    observer?.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["role", "aria-modal", "data-state"] });
    return () => {
      document.removeEventListener("focusin", updateSurfaceEligibility);
      document.removeEventListener("focusout", updateSurfaceEligibility);
      document.removeEventListener("visibilitychange", updateSurfaceEligibility);
      window.removeEventListener("resize", updateSurfaceEligibility);
      window.visualViewport?.removeEventListener("resize", updateSurfaceEligibility);
      observer?.disconnect();
    };
  }, [open, isButtonDragging, routeSuppressesBalloon]);

  useEffect(() => {
    if (previousLocationRef.current === location) return;
    previousLocationRef.current = location;
    dispatchAttention({ type: "DISMISS", now: Date.now() });
    setShowChatOnboardingHint(false);
  }, [location]);

  useEffect(() => {
    if (!mascotEnabled || !mascotIdentity || typeof window === "undefined") {
      setLoadedMascotPreferences({ identity: null, preferences: DEFAULT_ASSISTANT_MASCOT_PREFERENCES });
      return;
    }
    setLoadedMascotPreferences({
      identity: mascotIdentity,
      preferences: loadAssistantMascotPreferences(window.localStorage, mascotIdentity),
    });
  }, [mascotEnabled, mascotIdentity]);

  useLayoutEffect(() => {
    if (conversationIdentityRef.current === conversationIdentity) return;
    conversationIdentityRef.current = conversationIdentity;
    chatConversationScopeGenerationRef.current += 1;
    chatConversationPromiseRef.current = null;
    setChatConversationId(null);
    setChatPromptRequest(null);
    setMapContextDraft(null);
    setOpen(false);
    setActivePanel("chat");
    setTicketType("bug");
    setTitle("");
    setDescription("");
    setIsUrgent(false);
    setIsConfirmingUrgent(false);
    setFiles([]);
    setPendingUploadTicketId(null);
    setPendingDiagnostics(null);
  }, [conversationIdentity]);

  useLayoutEffect(() => {
    if (attentionScopeKeyRef.current === mascotIdentity) return;
    attentionScopeKeyRef.current = mascotIdentity;
    const scopeGeneration = attentionScopeGenerationRef.current + 1;
    attentionScopeGenerationRef.current = scopeGeneration;
    dispatchAttention({ type: "SET_SCOPE", scopeGeneration, now: Date.now() });
    setShowMascotDemo(false);
    setShowChatOnboardingHint(false);
  }, [mascotIdentity]);

  useEffect(() => {
    if (!mascotEnabled || !mascotIdentity) return;
    const syncPreferences = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; preferences?: typeof DEFAULT_ASSISTANT_MASCOT_PREFERENCES }>).detail;
      if (detail?.key !== mascotIdentity || !detail.preferences) return;
      setLoadedMascotPreferences({ identity: mascotIdentity, preferences: detail.preferences });
    };
    window.addEventListener(ASSISTANT_MASCOT_PREFERENCES_CHANGED_EVENT, syncPreferences);
    return () => window.removeEventListener(ASSISTANT_MASCOT_PREFERENCES_CHANGED_EVENT, syncPreferences);
  }, [mascotEnabled, mascotIdentity]);

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    if (!mascotEnabled || !mascotPreferences.enabled || !mascotPreferences.notificationReminders || !mascotIdentity) return;
    const acceptBaseline = (event: Event) => {
      const detail = (event as CustomEvent<AssistantNotificationProjection>).detail;
      if (detail?.scopeKey !== mascotIdentity || !Array.isArray(detail.signals)) return;
      dispatchAttention({
        type: "BASELINE",
        signals: detail.signals.map((signal) => ({
          ...signal,
          scopeGeneration: attentionScopeGenerationRef.current,
        })),
      });
    };
    const acceptArrival = (event: Event) => {
      const detail = (event as CustomEvent<AssistantNotificationProjection>).detail;
      if (detail?.scopeKey !== mascotIdentity || !Array.isArray(detail.signals)) return;
      for (const signal of detail.signals) {
        dispatchAttention({
          type: "NEW_NOTIFICATION",
          signal: { ...signal, scopeGeneration: attentionScopeGenerationRef.current },
          source: "live",
          now: Date.now(),
          viewport: window.innerWidth < 768 ? "mobile" : "desktop",
        });
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
    if (open || isButtonDragging || hidden || balloonSurfaceBlocked || routeSuppressesBalloon) {
      dispatchAttention({ type: "SUSPEND", now: Date.now() });
      return;
    }
    dispatchAttention({ type: "SET_VISIBLE", visible: true, now: Date.now() });
  }, [mascotEnabled, mascotPreferences.enabled, mascotPreferences.notificationReminders, open, isButtonDragging, balloonSurfaceBlocked, routeSuppressesBalloon]);

  useEffect(() => {
    if (!mascotEnabled || !mascotPreferences.enabled || !mascotPreferences.notificationReminders) return;
    const syncVisibility = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden" || open || isButtonDragging || balloonSurfaceBlocked || routeSuppressesBalloon) {
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
  }, [mascotEnabled, mascotPreferences.enabled, mascotPreferences.notificationReminders, open, isButtonDragging, balloonSurfaceBlocked, routeSuppressesBalloon]);

  useEffect(() => {
    if (attention.deadlineAt === null) return;
    const timer = window.setTimeout(() => dispatchAttention({ type: "ADVANCE", now: Date.now() }), Math.max(0, attention.deadlineAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [attention.deadlineAt, attention.status]);

  useEffect(() => {
    if (!showMascotDemo) return;
    const timer = window.setTimeout(() => setShowMascotDemo(false), window.innerWidth < 768 ? 3_000 : 5_000);
    return () => window.clearTimeout(timer);
  }, [showMascotDemo]);

  useEffect(() => {
    if (attention.status === "COALESCING" || attention.status === "BALLOON_VISIBLE") {
      setShowMascotDemo(false);
    }
  }, [attention.status]);

  const chatHintSessionKey = `assistant-mascot:chat-hint:v1:${mascotIdentity ?? "guest"}`;
  const dismissChatOnboardingHint = useCallback(() => {
    try {
      window.sessionStorage.setItem(chatHintSessionKey, "dismissed");
    } catch {
      // Session storage is optional; the in-memory dismissal still applies.
    }
    setShowChatOnboardingHint(false);
  }, [chatHintSessionKey]);

  useEffect(() => {
    if (!mascotEnabled || !mascotPreferences.enabled || !mascotPreferences.chatOnboarding || viewportWidth >= 768) {
      setShowChatOnboardingHint(false);
      return;
    }
    if (open || showMascotDemo || attention.status === "BALLOON_VISIBLE") {
      dismissChatOnboardingHint();
      return;
    }
    if (isButtonDragging || document.visibilityState === "hidden") {
      setShowChatOnboardingHint(false);
      return;
    }
    try {
      setShowChatOnboardingHint(window.sessionStorage.getItem(chatHintSessionKey) !== "dismissed");
    } catch {
      setShowChatOnboardingHint(true);
    }
  }, [
    attention.status,
    chatHintSessionKey,
    dismissChatOnboardingHint,
    isButtonDragging,
    mascotEnabled,
    mascotPreferences.chatOnboarding,
    mascotPreferences.enabled,
    open,
    showMascotDemo,
    viewportWidth,
  ]);

  const createChatConversationMutation =
    trpc.chat.createConversation.useMutation({
      onError: error => {
        toast.error(error.message || t("conversation.startFailed"));
      },
    });
  useEffect(() => {
    createChatConversationMutation.reset();
  }, [conversationIdentity, createChatConversationMutation.reset]);

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
        toast.error(err.error || t("feedback.uploadFailed"));
        return false;
      }
      return true;
    } catch {
      toast.error(t("feedback.uploadFailedRetry"));
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
      toast.success(t("feedback.submitted"));
      resetForm();
    },
    onError: (err) => {
      toast.error(err.message || t("feedback.submitFailed"));
    },
  });

  const isSubmitting = submitMutation.isPending || uploading;

  const ensureChatConversation = useCallback(async () => {
    if (!user) {
      throw new Error(t("guest.signInRequired"));
    }
    if (chatConversationId) {
      return chatConversationId;
    }
    if (chatConversationPromiseRef.current) {
      return chatConversationPromiseRef.current;
    }

    const requestScopeGeneration = chatConversationScopeGenerationRef.current;
    const requestIdentity = conversationIdentity;
    let request: Promise<number>;
    request = createChatConversationMutation
      .mutateAsync({ title: t("feedback.conversationTitle") })
      .then(result => {
        if (
          requestScopeGeneration !== chatConversationScopeGenerationRef.current ||
          requestIdentity !== conversationIdentityRef.current
        ) {
          if (chatConversationPromiseRef.current === request) chatConversationPromiseRef.current = null;
          return result.id;
        }
        setChatConversationId(result.id);
        if (chatConversationPromiseRef.current === request) chatConversationPromiseRef.current = null;
        return result.id;
      })
      .catch(error => {
        if (chatConversationPromiseRef.current === request) chatConversationPromiseRef.current = null;
        throw error;
      });
    chatConversationPromiseRef.current = request;
    return request;
  }, [chatConversationId, createChatConversationMutation, conversationIdentity, t, user]);

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
      const requestScopeGeneration = chatConversationScopeGenerationRef.current;
      const requestIdentity = conversationIdentity;
      const conversationId = await ensureChatConversation();
      if (
        requestScopeGeneration !== chatConversationScopeGenerationRef.current ||
        requestIdentity !== conversationIdentityRef.current
      ) {
        throw new Error("Conversation scope changed while opening Task Control");
      }
      setChatPromptRequest({ id: Date.now(), text: prompt });
      setActivePanel("chat");
      setOpen(true);
      return conversationId;
    },
    [ensureChatConversation, conversationIdentity],
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
    const submitScopeGeneration = chatConversationScopeGenerationRef.current;
    const submitIdentity = conversationIdentity;

    if (isUrgent) {
      setIsConfirmingUrgent(true);
      const confirmed = await confirm({
        title: t("feedback.urgentConfirmTitle"),
        description: t("feedback.urgentConfirmDescription"),
        confirmText: t("feedback.urgentConfirmSend"),
        cancelText: t("feedback.urgentConfirmCancel"),
        tone: "danger",
      });
      setIsConfirmingUrgent(false);
      if (!confirmed) return;
    }
    if (
      submitScopeGeneration !== chatConversationScopeGenerationRef.current ||
      submitIdentity !== conversationIdentityRef.current
    ) {
      return;
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
    conversationIdentity,
    pendingDiagnostics,
    submitMutation,
    ticketType,
    t,
    title,
  ]);

  const handleRetryUpload = useCallback(async () => {
    if (!pendingUploadTicketId) return;
    const ok = await uploadFiles(pendingUploadTicketId);
    if (ok) {
      toast.success(t("feedback.submitted"));
      resetForm();
    }
  }, [pendingUploadTicketId, files, resetForm, t]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const errors: string[] = [];

    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) {
        errors.push(t("feedback.maxFilesAllowed", { count: MAX_FILES }));
        return prev;
      }

      const valid: File[] = [];
      for (const file of fileArray.slice(0, remaining)) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          errors.push(t("feedback.fileTypeNotAllowed", { name: file.name }));
          continue;
        }
        if (file.size === 0) {
          errors.push(t("feedback.fileEmpty", { name: file.name }));
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(t("feedback.fileTooLarge", { name: file.name }));
          continue;
        }
        valid.push(file);
      }

      if (fileArray.length > remaining) {
        const skipped = fileArray.slice(remaining).map((f) => f.name).join(", ");
        errors.push(t("feedback.filesSkipped", { names: skipped }));
      }

      if (errors.length > 0) {
        setTimeout(() => toast.error(errors.join("\n")), 0);
      }

      return [...prev, ...valid];
    });
  }, [t]);

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
  const canShowDecorativeBalloon = !balloonSurfaceBlocked && !routeSuppressesBalloon && !open && !isButtonDragging;
  const attentionScopeCurrent = attention.scopeGeneration === attentionScopeGenerationRef.current;
  const hasVisibleNotificationBalloon = attentionScopeCurrent && attention.status === "BALLOON_VISIBLE" && mascotEnabled && mascotPreferences.enabled && mascotPreferences.notificationReminders;
  const notificationAttentionPending = attentionScopeCurrent && (attention.status === "COALESCING" || attention.status === "BALLOON_VISIBLE");
  const hasVisibleDemoBalloon = showMascotDemo && !notificationAttentionPending && mascotEnabled && mascotPreferences.enabled && mascotPreferences.notificationReminders;
  const hasVisibleOnboardingHint = showChatOnboardingHint && !showMascotDemo && !notificationAttentionPending && mascotEnabled && mascotPreferences.enabled && mascotPreferences.chatOnboarding;
  const assistantHintPositionStyle = assistantHintStyle ?? { visibility: "hidden" as const };

  useLayoutEffect(() => {
    if (!canShowDecorativeBalloon || (!hasVisibleNotificationBalloon && !hasVisibleDemoBalloon && !hasVisibleOnboardingHint)) return;
    const updateHintPosition = () => {
      const anchor = feedbackButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const hint = document.querySelector<HTMLElement>(".assistant-reminder-balloon, .assistant-chat-onboarding-hint");
      const bounds = hint?.getBoundingClientRect();
      const hintWidth = bounds?.width ?? Math.min(window.innerWidth < 768 ? 216 : 360, window.innerWidth - 32);
      const hintHeight = bounds?.height ?? 132;
      const left = Math.max(16, Math.min(
        window.innerWidth - hintWidth - 16,
        anchor.left + anchor.width / 2 - hintWidth / 2,
      ));
      let top = anchor.top - hintHeight - 8;
      if (top < 16) top = anchor.bottom + 8;
      top = Math.max(16, Math.min(top, window.innerHeight - hintHeight - 16));
      setAssistantHintStyle({ left: `${left}px`, top: `${top}px` });
    };
    updateHintPosition();
    // Re-measure after the launcher/balloon have completed this layout pass.
    // This is needed after a drag, when the hint is intentionally unmounted
    // during movement and its first measurement can still reflect the old spot.
    const positionFrame = window.requestAnimationFrame(updateHintPosition);
    window.addEventListener("resize", updateHintPosition);
    window.addEventListener("scroll", updateHintPosition, true);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateHintPosition);
    if (feedbackButtonRef.current) resizeObserver?.observe(feedbackButtonRef.current);
    const hint = document.querySelector(".assistant-reminder-balloon, .assistant-chat-onboarding-hint");
    if (hint) resizeObserver?.observe(hint);
    window.visualViewport?.addEventListener("resize", updateHintPosition);
    return () => {
      window.cancelAnimationFrame(positionFrame);
      window.removeEventListener("resize", updateHintPosition);
      window.removeEventListener("scroll", updateHintPosition, true);
      window.visualViewport?.removeEventListener("resize", updateHintPosition);
      resizeObserver?.disconnect();
    };
  }, [canShowDecorativeBalloon, feedbackPlacement, hasVisibleDemoBalloon, hasVisibleNotificationBalloon, hasVisibleOnboardingHint]);

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
          aria-label={settingsT("assistantAppearance.launcherAriaLabel")}
          className="z-50 h-11 min-h-11 w-11 min-w-11 rounded-full bg-white p-0 text-slate-900 shadow-lg hover:bg-slate-100 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 md:h-11 md:w-auto md:min-w-11 md:gap-2 md:px-3"
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
            ? <AssistantMascot
              style={mascotPreferences.style}
              size={24}
              className={attention.status === "BALLOON_VISIBLE" && mascotPreferences.motion !== "off" ? `assistant-mascot-greeting-${mascotPreferences.motion}` : undefined}
            />
            : <MessageSquarePlus className="h-4 w-4" />}
          <span className="hidden md:inline">{settingsT("assistantAppearance.launcherLabel")}</span>
        </Button>
      </DialogTrigger>
      {canShowDecorativeBalloon && (hasVisibleDemoBalloon || hasVisibleNotificationBalloon) && (
        <HStack as="aside" gap={2} align="start" className={`assistant-reminder-balloon flex-wrap${mascotPreferences.motion === "off" ? " assistant-motion-off" : ""}`} style={assistantHintPositionStyle} role="status" aria-live="polite" onFocus={() => { if (hasVisibleNotificationBalloon) dispatchAttention({ type: "SET_FOCUS_WITHIN_BALLOON", focused: true, now: Date.now() }); }} onBlur={(event) => { if (hasVisibleNotificationBalloon && !event.currentTarget.contains(event.relatedTarget as Node | null)) dispatchAttention({ type: "SET_FOCUS_WITHIN_BALLOON", focused: false, now: Date.now() }); }}>
          <Text as="p" type="body" maxLines={2}>{settingsT("assistantAppearance.reminderCopy")}</Text>
          <Button type="button" variant="link" size="sm" className="shrink-0" onClick={() => { setShowMascotDemo(false); if (hasVisibleNotificationBalloon) dispatchAttention({ type: "DISMISS", now: Date.now() }); window.dispatchEvent(new Event(OPEN_GLOBAL_NOTIFICATION_BELL_EVENT)); }}>{settingsT("assistantAppearance.viewNotifications")}</Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={settingsT("assistantAppearance.dismissReminder")} onClick={() => { setShowMascotDemo(false); if (hasVisibleNotificationBalloon) dispatchAttention({ type: "DISMISS", now: Date.now() }); }}>×</Button>
        </HStack>
      )}
      {canShowDecorativeBalloon && hasVisibleOnboardingHint && (
        <HStack as="aside" gap={2} align="start" className={`assistant-chat-onboarding-hint flex-wrap${mascotPreferences.motion === "off" ? " assistant-motion-off" : ""}`} style={assistantHintPositionStyle} role="note">
          <Text as="p" type="body" maxLines={2}>{settingsT("assistantAppearance.chatHintCopy")}</Text>
          <Button type="button" variant="link" size="sm" className="shrink-0" onClick={() => { dismissChatOnboardingHint(); setActivePanel("chat"); setOpen(true); }}>{settingsT("assistantAppearance.openChat")}</Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={settingsT("assistantAppearance.dismissChatHint")} onClick={dismissChatOnboardingHint}>×</Button>
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
            {user && !authLoading ? t("feedback.panelTitle") : t("chat.guest.panelTitle")}
          </DialogTitle>
        </DialogHeader>
        <nav
          aria-label={t("feedback.sections")}
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
            {user && !authLoading ? t("feedback.chatTab") : t("chat.guest.chatTab")}
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
            {t("feedback.taskControlTab")}
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
            {user && !authLoading ? t("feedback.feedbackTab") : t("chat.guest.feedbackTab")}
          </Button>
        </nav>

        <section hidden={activePanel !== "chat"} className="min-h-0 flex-1 overflow-hidden" aria-label={t("feedback.chatSection")}>
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
              {t("conversation.starting")}
            </section>
          ) : createChatConversationMutation.error && !chatConversationId ? (
            <section className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">
                {createChatConversationMutation.error.message || t("conversation.startFailed")}
              </p>
              <Button type="button" variant="outline" onClick={() => void ensureChatConversation()}>
                {t("conversation.retry")}
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
          <section className="min-h-0 flex-1 overflow-hidden" aria-label={t("feedback.taskControlSection")}>
            <UniversalControlPlanePanel
              conversationId={chatConversationId}
              onClose={() => selectHelpPanel("chat")}
              onOpenPrompt={prompt => {
                void handleOpenTaskPrompt(prompt).catch(() => undefined);
              }}
            />
          </section>
        )}

        {activePanel === "feedback" && <div className="space-y-4 p-4 sm:p-5">
          {/* Show retry banner if ticket created but upload failed */}
          {pendingUploadTicketId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="text-amber-800 font-medium">{t("feedback.ticketCreatedUploadFailed")}</p>
              <p className="text-amber-600 text-xs mt-1">
                {t("feedback.uploadRetryOrSkip")}
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
                  {uploading ? t("feedback.uploading") : t("feedback.retryUpload")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    toast.success(t("feedback.submittedWithoutAttachments"));
                    resetForm();
                  }}
                >
                  {t("feedback.skipAttachments")}
                </Button>
              </div>
            </div>
          )}

          {!pendingUploadTicketId && (
            <>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger>
                  <SelectValue placeholder={t("feedback.typePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">{t("feedback.types.bug")}</SelectItem>
                  <SelectItem value="feature_request">{t("feedback.types.featureRequest")}</SelectItem>
                  <SelectItem value="observation">{t("feedback.types.observation")}</SelectItem>
                  <SelectItem value="question">{t("feedback.types.question")}</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder={t("feedback.titlePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={2}
                className="min-h-16 break-words"
              />
              <Textarea
                placeholder={t("feedback.descriptionPlaceholder")}
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
                      {t("feedback.sendAsUrgent")}
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isUrgent
                        ? t("feedback.urgentDescription")
                        : t("feedback.normalDescription")}
                    </p>
                  </div>
                </div>
                <Switch
                  id="feedback-urgent-switch"
                  checked={isUrgent}
                  onCheckedChange={setIsUrgent}
                  disabled={isSubmitting || isConfirmingUrgent}
                  aria-label={t("feedback.sendAsUrgent")}
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
                {isDragOver ? t("feedback.dropFiles") : t("feedback.attachFiles")}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {t("feedback.fileLimits", { count: MAX_FILES })}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {t("feedback.pasteImagesHint", { count: MAX_FILES })}
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
                      aria-label={t("feedback.removeFile", { name: file.name })}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  {t("feedback.fileCount", { count: files.length, max: MAX_FILES })}
                </p>
              </div>
            )}
          </div>

          {/* Transparency note: only shown when this draft was opened via a
              system-error-toast report, so users know diagnostics are attached. */}
          {pendingDiagnostics && !pendingUploadTicketId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 break-words">
              <p className="break-words">
                {t("feedback.diagnosticsNotice")}
              </p>
              {pendingDiagnostics.primaryError?.traceId && (
                <p className="mt-1 break-all font-mono text-[10px] text-blue-600">
                  {t("feedback.traceIdLabel")}: {pendingDiagnostics.primaryError.traceId}
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
                ? t("feedback.uploadingFiles")
                : isConfirmingUrgent
                  ? t("feedback.waitingForConfirmation")
                : submitMutation.isPending
                  ? t("feedback.submitting")
                  : t("feedback.submit")}
            </Button>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-primary text-center w-full"
            onClick={() => { setMapContextDraft(null); setOpen(false); setLocation("/my-feedback"); }}
          >
            {t("feedback.viewSubmitted")}
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
