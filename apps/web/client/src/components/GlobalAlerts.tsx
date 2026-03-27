/**
 * Global Alert System
 * Renders urgent message alerts and notification bell across all pages.
 * Replaces per-page UrgentMessageAlert and NotificationBell from Chat.tsx.
 */

import { useEffect, useState, useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useSSEReconnect } from "@/lib/useSSEReconnect";
import { Bell, AlarmClock, X, Check, ChevronDown, Clock3 } from "lucide-react";
import { toast } from "sonner";

const BELL_STORAGE_KEY = "global-notification-bell-position";
const BELL_MARGIN = 12;
const BELL_DEFAULT_WIDTH = 60;
const BELL_DEFAULT_HEIGHT = 44;
const BELL_DRAG_THRESHOLD = 4;

type BellPosition = {
  x: number;
  y: number;
};

type BellDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  moved: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getInitialBellPosition(): BellPosition {
  if (typeof window === "undefined") {
    return { x: BELL_MARGIN, y: BELL_MARGIN };
  }

  try {
    const saved = window.localStorage.getItem(BELL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<BellPosition>;
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return clampBellPosition(parsed, window.innerWidth, window.innerHeight);
      }
    }
  } catch {
    // Ignore malformed storage and fall back to the default docked position.
  }

  return {
    x: Math.max(BELL_MARGIN, window.innerWidth - BELL_DEFAULT_WIDTH - BELL_MARGIN),
    y: BELL_MARGIN,
  };
}

function clampBellPosition(
  position: BellPosition,
  viewportWidth: number,
  viewportHeight: number,
  size: { width: number; height: number } = {
    width: BELL_DEFAULT_WIDTH,
    height: BELL_DEFAULT_HEIGHT,
  },
) {
  return {
    x: clamp(position.x, BELL_MARGIN, Math.max(BELL_MARGIN, viewportWidth - size.width - BELL_MARGIN)),
    y: clamp(position.y, BELL_MARGIN, Math.max(BELL_MARGIN, viewportHeight - size.height - BELL_MARGIN)),
  };
}

function persistBellPosition(position: BellPosition) {
  try {
    window.localStorage.setItem(BELL_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Ignore storage failures in private mode / restricted environments.
  }
}

/** Safe navigation — blocks javascript:, data:, vbscript: protocol URLs */
function safeNavigate(url: string, setLocation: (url: string) => void) {
  if (!url || typeof url !== "string") return;
  const lower = url.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:") || lower.startsWith("blob:")) {
    console.warn("[Security] Blocked unsafe actionUrl:", url.slice(0, 50));
    return;
  }
  setLocation(url);
}

export function GlobalAlerts() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <>
      <GlobalUrgentAlerts />
      <GlobalUrgentReminders />
      <GlobalNotificationBell />
    </>
  );
}

function GlobalUrgentAlerts() {
  const [, setLocation] = useLocation();
  const [shownIds, setShownIds] = useState<Set<number>>(new Set());
  const [dismissedModal, setDismissedModal] = useState<number | null>(null);
  const [modalMessage, setModalMessage] = useState<{
    id: number;
    senderId: number;
    senderName: string;
    senderEmail: string;
    content: string;
  } | null>(null);

  const { data: urgentMessages } = trpc.follows.getUrgentMessages.useQuery(
    undefined,
    {
      refetchInterval: 10000,
      // Pause polling when tab is hidden
      refetchIntervalInBackground: false,
    }
  );

  useEffect(() => {
    if (!urgentMessages?.length) return;
    const newMessages = urgentMessages.filter(
      (m: any) => !shownIds.has(m.id) && m.id !== dismissedModal
    );
    if (newMessages.length === 0) return;

    setShownIds((prev) => {
      const next = new Set(prev);
      newMessages.forEach((m: any) => next.add(m.id));
      return next;
    });

    // Show the most recent urgent message as a modal
    const latest = newMessages[newMessages.length - 1];
    setModalMessage({
      id: latest.id,
      senderId: latest.senderId,
      senderName: latest.senderName || "Unknown",
      senderEmail: latest.senderEmail || "",
      content: latest.content,
    });

    // Also fire toast for any additional messages
    if (newMessages.length > 1) {
      newMessages.slice(0, -1).forEach((m: any) => {
        const dmName = encodeURIComponent(m.senderName || m.senderEmail);
        toast.warning(
          `${m.senderName || m.senderEmail}: ${m.content.slice(0, 100)}`,
          {
            description: "Urgent message",
            duration: 10000,
            action: {
              label: "View",
              onClick: () => setLocation(`/chat?dm=${m.senderId}&dmName=${dmName}`),
            },
          }
        );
      });
    }
  }, [urgentMessages, shownIds, dismissedModal, setLocation]);

  const handleDismiss = useCallback(() => {
    if (modalMessage) {
      setDismissedModal(modalMessage.id);
    }
    setModalMessage(null);
  }, [modalMessage]);

  const handleViewChat = useCallback(() => {
    const senderId = modalMessage?.senderId;
    const name = encodeURIComponent(modalMessage?.senderName || "");
    setModalMessage(null);
    setLocation(`/chat?dm=${senderId}&dmName=${name}`);
  }, [setLocation, modalMessage]);

  const alertModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alertModalRef.current?.focus();
  }, []);

  if (!modalMessage) return null;

  return (
    <div
      ref={alertModalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="urgent-alert-title"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={handleDismiss}
      onKeyDown={(e) => { if (e.key === "Escape") handleDismiss(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--background, #1e1e1e)",
          border: "2px solid #ef4444",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "440px",
          width: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          <span
            style={{
              background: "#ef4444",
              color: "white",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Urgent
          </span>
          <span
            id="urgent-alert-title"
            style={{
              fontSize: "13px",
              color: "var(--muted-foreground, #888)",
            }}
          >
            from {modalMessage.senderName}
          </span>
        </div>

        <p
          style={{
            fontSize: "15px",
            lineHeight: 1.5,
            color: "var(--foreground, #e0e0e0)",
            marginBottom: "20px",
            wordBreak: "break-word",
          }}
        >
          {modalMessage.content}
        </p>

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={handleDismiss}
            style={{
              padding: "8px 16px",
              background: "var(--muted, #333)",
              border: "1px solid var(--border, #444)",
              borderRadius: "6px",
              color: "var(--foreground, #e0e0e0)",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Dismiss
          </button>
          <button
            onClick={handleViewChat}
            style={{
              padding: "8px 16px",
              background: "#ef4444",
              border: "none",
              borderRadius: "6px",
              color: "white",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Open Chat
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen modal for high/critical priority reminders.
 * Polls getUrgentReminders every 10s, shows the most recent unread one as a modal.
 */
function GlobalUrgentReminders() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [shownIds, setShownIds] = useState<Set<number>>(new Set());
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const [modalReminder, setModalReminder] = useState<{
    id: number;
    title: string;
    content: string;
    priority: string;
    scheduledMessageId: number | null;
    conversationId?: number | null;
  } | null>(null);

  const { data: urgentReminders } = trpc.scheduledMessages.getUrgentReminders.useQuery(
    undefined,
    {
      refetchInterval: 10000,
      refetchIntervalInBackground: false,
    }
  );

  const markRead = trpc.scheduledMessages.markRead.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.getNotificationCount.invalidate();
      utils.scheduledMessages.getUrgentReminders.invalidate();
    },
  });

  useEffect(() => {
    if (!urgentReminders?.length) return;
    const newReminders = urgentReminders.filter(
      (r: any) => !shownIds.has(r.id) && r.id !== dismissedId
    );
    if (newReminders.length === 0) return;

    setShownIds((prev) => {
      const next = new Set(prev);
      newReminders.forEach((r: any) => next.add(r.id));
      return next;
    });

    // Show the most recent as a modal
    const latest = newReminders[newReminders.length - 1];
    setModalReminder({
      id: latest.id,
      title: latest.title,
      content: latest.content || "",
      priority: latest.priority,
      scheduledMessageId: latest.scheduledMessageId,
      conversationId: latest.conversationId,
    });

    // Toast any others
    if (newReminders.length > 1) {
      newReminders.slice(0, -1).forEach((r: any) => {
        const aid = r.scheduledMessageId ? `&alertId=${r.scheduledMessageId}` : "";
        toast.warning(r.title, {
          description: (r.content || "").slice(0, 100),
          duration: 15000,
          action: {
            label: "View",
            onClick: () => setLocation(`/chat?panel=schedule${aid}`),
          },
        });
      });
    }
  }, [urgentReminders, shownIds, dismissedId, setLocation]);

  const handleDismiss = useCallback(() => {
    if (modalReminder) {
      setDismissedId(modalReminder.id);
      markRead.mutate({ id: modalReminder.id });
    }
    setModalReminder(null);
  }, [modalReminder, markRead]);

  const handleViewAlerts = useCallback(() => {
    if (modalReminder) {
      markRead.mutate({ id: modalReminder.id });
    }
    const alertId = modalReminder?.scheduledMessageId;
    const conversationId = modalReminder?.conversationId;
    setModalReminder(null);
    if (conversationId) {
      setLocation(`/chat?c=${conversationId}`);
    } else {
      setLocation(`/chat?panel=schedule${alertId ? `&alertId=${alertId}` : ""}`);
    }
  }, [setLocation, modalReminder, markRead]);

  const reminderModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    reminderModalRef.current?.focus();
  }, []);

  if (!modalReminder) return null;

  const isCritical = modalReminder.priority === "critical";
  const borderColor = isCritical ? "#ef4444" : "#f59e0b";
  const badgeColor = isCritical ? "#ef4444" : "#f59e0b";
  const badgeText = isCritical ? "Critical" : "Important";

  return (
    <div
      ref={reminderModalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="urgent-reminder-title"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: isCritical ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9998,
      }}
      onClick={handleDismiss}
      onKeyDown={(e) => { if (e.key === "Escape") handleDismiss(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--background, #1e1e1e)",
          border: `2px solid ${borderColor}`,
          borderRadius: "16px",
          padding: isCritical ? "32px" : "24px",
          maxWidth: isCritical ? "520px" : "440px",
          width: "90vw",
          boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 ${isCritical ? "40px" : "20px"} ${borderColor}40`,
          animation: isCritical ? "pulse-border 2s ease-in-out infinite" : undefined,
        }}
      >
        <style>{`
          @keyframes pulse-border {
            0%, 100% { box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px #ef444440; }
            50% { box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 60px #ef444480; }
          }
        `}</style>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <span
            style={{
              background: badgeColor,
              color: "white",
              padding: "3px 10px",
              borderRadius: "6px",
              fontSize: isCritical ? "13px" : "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <AlarmClock style={{ width: 14, height: 14 }} />
            {badgeText}
          </span>
          <span style={{ fontSize: "13px", color: "var(--muted-foreground, #888)" }}>
            Reminder
          </span>
        </div>

        <h3
          id="urgent-reminder-title"
          style={{
            fontSize: isCritical ? "18px" : "16px",
            fontWeight: 600,
            color: "var(--foreground, #e0e0e0)",
            marginBottom: "8px",
          }}
        >
          {modalReminder.title}
        </h3>

        {modalReminder.content && modalReminder.content !== modalReminder.title && (
          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.5,
              color: "var(--foreground, #e0e0e0)",
              marginBottom: "20px",
              wordBreak: "break-word",
              opacity: 0.85,
            }}
          >
            {modalReminder.content}
          </p>
        )}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button
            onClick={handleDismiss}
            style={{
              padding: "8px 16px",
              background: "var(--muted, #333)",
              border: "1px solid var(--border, #444)",
              borderRadius: "6px",
              color: "var(--foreground, #e0e0e0)",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Dismiss
          </button>
          <button
            onClick={handleViewAlerts}
            style={{
              padding: "8px 16px",
              background: badgeColor,
              border: "none",
              borderRadius: "6px",
              color: "white",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            View Alerts
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationDetailPanel({ notification: n, onBack, onNavigate }: { notification: any; onBack: () => void; onNavigate: (url: string) => void }) {
  const meta = n.metadata as any;
  const hasLegacyActions = !n.actionUrl && !n.conversationId && !n.scheduledMessageId && n.type === "alert";
  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: "#0078d4", cursor: "pointer", padding: "2px 4px", fontSize: "12px" }}
        >
          &larr; Back
        </button>
      </div>

      {/* Title + Priority */}
      <div style={{ marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
          <span style={{
            fontSize: "10px",
            padding: "1px 6px",
            borderRadius: "4px",
            fontWeight: 600,
            textTransform: "uppercase",
            background: n.priority === "critical" ? "#d32f2f" : n.priority === "high" ? "#f57c00" : n.priority === "low" ? "#666" : "#0078d4",
            color: "#fff",
          }}>
            {n.priority}
          </span>
          {n.type && (
            <span style={{ fontSize: "10px", color: "var(--muted-foreground, #888)" }}>
              {n.type.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground, #e0e0e0)", margin: 0 }}>
          {n.title}
        </h3>
        <span style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", marginTop: "2px", display: "block" }}>
          {new Date(n.createdAt).toLocaleString()}
        </span>
      </div>

      {/* Content */}
      {n.content && (
        <p style={{ fontSize: "13px", color: "var(--foreground, #ccc)", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: "8px 0", padding: "8px", background: "var(--muted, rgba(255,255,255,0.05))", borderRadius: "6px" }}>
          {n.content}
        </p>
      )}

      {/* Resource Info */}
      {n.relatedResourceType && (
        <div style={{ fontSize: "12px", color: "var(--muted-foreground, #888)", margin: "8px 0", display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ padding: "1px 6px", background: "rgba(0,120,212,0.1)", borderRadius: "4px", fontSize: "11px" }}>
            {n.relatedResourceType.replace(/_/g, " ")}
          </span>
          {n.relatedResourceId && (
            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
              ID: {n.relatedResourceId.length > 20 ? n.relatedResourceId.slice(0, 20) + "..." : n.relatedResourceId}
            </span>
          )}
        </div>
      )}

      {/* Error Details */}
      {meta?.errorDetails?.errorMessage && (
        <div style={{ margin: "8px 0", padding: "8px", background: "rgba(211,47,47,0.08)", borderRadius: "6px", borderLeft: "3px solid #d32f2f" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#d32f2f", marginBottom: "4px" }}>Error Details</div>
          {meta.errorDetails.errorCode && (
            <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>Code: {meta.errorDetails.errorCode}</div>
          )}
          <div style={{ fontSize: "12px", color: "var(--foreground, #ccc)", whiteSpace: "pre-wrap" }}>
            {meta.errorDetails.errorMessage.length > 500 ? meta.errorDetails.errorMessage.slice(0, 500) + "..." : meta.errorDetails.errorMessage}
          </div>
        </div>
      )}

      {/* Metrics */}
      {meta?.metrics && (
        <div style={{ margin: "8px 0", display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {meta.metrics.durationMs != null && (
            <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
              Duration: <strong style={{ color: "var(--foreground, #ccc)" }}>{meta.metrics.durationMs > 1000 ? `${(meta.metrics.durationMs / 1000).toFixed(1)}s` : `${meta.metrics.durationMs}ms`}</strong>
            </div>
          )}
          {meta.metrics.costUsd != null && (
            <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
              Cost: <strong style={{ color: "var(--foreground, #ccc)" }}>${meta.metrics.costUsd.toFixed(4)}</strong>
            </div>
          )}
          {meta.metrics.itemCount != null && (
            <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
              Items: <strong style={{ color: "var(--foreground, #ccc)" }}>{meta.metrics.itemCount}</strong>
            </div>
          )}
        </div>
      )}

      {/* Retry Info */}
      {meta?.retryInfo && (
        <div style={{ margin: "8px 0", padding: "6px 8px", background: "rgba(245,124,0,0.08)", borderRadius: "6px", fontSize: "12px" }}>
          Retry {meta.retryInfo.retryCount ?? 0}/{meta.retryInfo.maxRetries ?? "?"}
          {meta.retryInfo.nextRetryAt && ` — next: ${new Date(meta.retryInfo.nextRetryAt).toLocaleString()}`}
        </div>
      )}

      {/* Source */}
      {meta?.source && (
        <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", marginTop: "8px" }}>
          Source: <span style={{ fontFamily: "monospace" }}>{meta.source}</span>
        </div>
      )}

      {/* Actions */}
      {(n.actionUrl || n.conversationId || n.scheduledMessageId || hasLegacyActions) && (
        <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
          {n.actionUrl && (
            <button
              onClick={() => safeNavigate(n.actionUrl, onNavigate)}
              style={{
                padding: "8px 16px",
                background: "#0078d4",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
                width: "100%",
              }}
            >
              {n.actionLabel || "View Details"} &rarr;
            </button>
          )}
          {n.conversationId && !n.actionUrl && (
            <button
              onClick={() => safeNavigate(`/chat?conversationId=${n.conversationId}`, onNavigate)}
              style={{
                padding: "8px 16px",
                background: "#0078d4",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Open Chat &rarr;
            </button>
          )}
          {n.scheduledMessageId && !n.actionUrl && (
            <button
              onClick={() => safeNavigate(`/chat?panel=schedule&alertId=${n.scheduledMessageId}`, onNavigate)}
              style={{
                padding: "8px 16px",
                background: "#0078d4",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
                width: "100%",
              }}
            >
              View Schedule &rarr;
            </button>
          )}
          {hasLegacyActions && (
            <>
              {n.title?.includes("Media Job") && (
                <button
                  onClick={() => safeNavigate("/media-studio", onNavigate)}
                  style={{
                    padding: "8px 16px",
                    background: "#0078d4",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "13px",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Open Media Studio &rarr;
                </button>
              )}
              {(n.title?.includes("credit") || n.title?.includes("Credit")) && (
                <button
                  onClick={() => safeNavigate("/admin/settings", onNavigate)}
                  style={{
                    padding: "8px 16px",
                    background: "#0078d4",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "13px",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Admin Settings &rarr;
                </button>
              )}
              {(n.title?.includes("latency") || n.title?.includes("API error")) && (
                <button
                  onClick={() => safeNavigate("/admin/system-guardian", onNavigate)}
                  style={{
                    padding: "8px 16px",
                    background: "#0078d4",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "13px",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  System Guardian &rarr;
                </button>
              )}
              {(n.title?.includes("Feedback") || n.title?.includes("feedback")) && (
                <button
                  onClick={() => {
                    const ticketMatch = n.content?.match(/Ticket #(\d+)/);
                    safeNavigate(
                      ticketMatch?.[1] ? `/admin/feedback-hub?ticketId=${ticketMatch[1]}` : "/admin/feedback-hub",
                      onNavigate
                    );
                  }}
                  style={{
                    padding: "8px 16px",
                    background: "#0078d4",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "13px",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  View Feedback &rarr;
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GlobalNotificationBell() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [showDropdown, setShowDropdown] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailNotification, setDetailNotification] = useState<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRootRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<BellDragState | null>(null);
  const suppressNextClickRef = useRef(false);
  const [bellPosition, setBellPosition] = useState<BellPosition>(() => getInitialBellPosition());
  const [isBellDragging, setIsBellDragging] = useState(false);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (!dragState.moved) {
        if (Math.abs(deltaX) + Math.abs(deltaY) < BELL_DRAG_THRESHOLD) {
          return;
        }
        dragState.moved = true;
      }

      event.preventDefault();
      setBellPosition(
        clampBellPosition(
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
        ),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      suppressNextClickRef.current = dragState.moved;
      dragStateRef.current = null;
      setIsBellDragging(false);
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
    persistBellPosition(bellPosition);
  }, [bellPosition]);

  useEffect(() => {
    const handleResize = () => {
      setBellPosition((current) => clampBellPosition(current, window.innerWidth, window.innerHeight));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { data } = trpc.scheduledMessages.getNotificationCount.useQuery(
    undefined,
    {
      refetchInterval: 30000,
      refetchIntervalInBackground: false,
    }
  );

  const { data: notifications } = trpc.scheduledMessages.getNotifications.useQuery(
    { limit: 20 },
    { enabled: showDropdown }
  );

  const markAllRead = trpc.scheduledMessages.markAllRead.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.getNotificationCount.invalidate();
      utils.scheduledMessages.getNotifications.invalidate();
    },
  });

  const markRead = trpc.scheduledMessages.markRead.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.getNotificationCount.invalidate();
      utils.scheduledMessages.getNotifications.invalidate();
    },
  });

  const count = data?.count || 0;
  const hasUnread = count > 0;
  const recentCount = notifications?.length ?? 0;
  const hasRecentHistory = recentCount > 0;
  const statusSummary = hasUnread
    ? `${count} unread notification${count !== 1 ? "s" : ""}`
    : hasRecentHistory
      ? `No unread alerts, but ${recentCount} recent item${recentCount !== 1 ? "s" : ""} available`
      : "No notifications yet";

  // Real-time SSE for instant notification updates (with exponential backoff)
  const handleSSEMessage = useCallback(() => {
    utils.scheduledMessages.getNotificationCount.invalidate();
    if (showDropdown) {
      utils.scheduledMessages.getNotifications.invalidate();
    }
  }, [showDropdown, utils]);

  useSSEReconnect({
    url: "/api/notifications/stream",
    onMessage: handleSSEMessage,
    eventType: "notification",
    enabled: true,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  const formatTimeAgo = (date: string | Date) => {
    const now = Date.now();
    const then = new Date(date).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "#ef4444";
      case "high": return "#f59e0b";
      case "normal": return "#6b7280";
      case "low": return "#4b5563";
      default: return "#6b7280";
    }
  };

  const handleBellPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    suppressNextClickRef.current = false;
    setIsBellDragging(true);
    const rect = bellRootRef.current?.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: bellPosition.x,
      originY: bellPosition.y,
      width: rect?.width ?? BELL_DEFAULT_WIDTH,
      height: rect?.height ?? BELL_DEFAULT_HEIGHT,
      moved: false,
    };
  };

  const handleBellClick = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setShowDropdown((v) => !v);
  };

  return (
    <div
      ref={(node) => {
        dropdownRef.current = node;
        bellRootRef.current = node;
      }}
      data-testid="global-notification-bell"
      style={{
        position: "fixed",
        left: `${bellPosition.x}px`,
        top: `${bellPosition.y}px`,
        zIndex: 9990,
      }}
    >
      <button
        onClick={handleBellClick}
        onPointerDown={handleBellPointerDown}
        title={
          hasUnread
            ? statusSummary
            : "No unread notifications, recent history available. Drag to move."
        }
        aria-label={
          hasUnread
            ? statusSummary
            : "0 unread notifications, recent history available"
        }
        style={{
          background: "var(--background, #1e1e1e)",
          border: "1px solid var(--border, #333)",
          borderRadius: "8px",
          padding: "8px 10px",
          cursor: isBellDragging ? "grabbing" : "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          position: "relative",
          touchAction: "none",
        }}
      >
        <Bell style={{ width: 18, height: 18, color: "var(--foreground, #e0e0e0)" }} />
        {hasUnread ? (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              background: "#ef4444",
              color: "white",
              fontSize: "10px",
              fontWeight: 700,
              borderRadius: "9999px",
              minWidth: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "0 6px",
              height: "18px",
              borderRadius: "9999px",
              background: "rgba(148, 163, 184, 0.16)",
              color: "var(--foreground, #e0e0e0)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            <Clock3 style={{ width: 10, height: 10 }} />
            Recent
          </span>
        )}
      </button>

      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "360px",
            maxHeight: "480px",
            background: "var(--background, #1e1e1e)",
            border: "1px solid var(--border, #333)",
            borderRadius: "10px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border, #333)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground, #e0e0e0)" }}>
              Notifications {count > 0 && `(${count})`}
            </span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {count > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  title="Mark all as read"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#0078d4",
                    fontSize: "12px",
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setShowDropdown(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted-foreground, #888)",
                  cursor: "pointer",
                  padding: "2px",
                  display: "flex",
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {!hasUnread && (
            <div
              style={{
                margin: "10px 12px 0",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "rgba(148, 163, 184, 0.08)",
                color: "var(--foreground, #e0e0e0)",
                fontSize: "12px",
                lineHeight: 1.4,
              }}
            >
              {statusSummary}
            </div>
          )}

          {/* Notification Detail or List */}
          {detailNotification ? (
            <div style={{ overflowY: "auto", flex: 1, maxHeight: "400px" }}>
              <NotificationDetailPanel
                notification={detailNotification}
                onBack={() => setDetailNotification(null)}
                onNavigate={(url) => { setShowDropdown(false); setDetailNotification(null); setLocation(url); }}
              />
            </div>
          ) : (
          <div style={{ overflowY: "auto", flex: 1, maxHeight: "400px" }}>
            {notifications && notifications.length > 0 ? (
              notifications.map((n: any) => (
                <div
                  key={n.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border, #222)",
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                    background: n.isRead ? "transparent" : "rgba(0, 120, 212, 0.06)",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (!n.isRead) markRead.mutate({ id: n.id });
                    setExpandedId(null);
                    setDetailNotification(n);
                  }}
                >
                  {/* Unread dot */}
                  <div style={{ paddingTop: "4px", minWidth: "8px" }}>
                    {!n.isRead && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: getPriorityColor(n.priority),
                        }}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: n.isRead ? 400 : 600,
                          color: "var(--foreground, #e0e0e0)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.title}
                      </span>
                      {(n.occurrenceCount ?? 1) > 1 && (
                        <span style={{
                          fontSize: "10px",
                          padding: "1px 5px",
                          borderRadius: "4px",
                          background: "rgba(99, 102, 241, 0.15)",
                          color: "#818cf8",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}>
                          x{n.occurrenceCount}
                        </span>
                      )}
                      <span style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {formatTimeAgo(n.createdAt)}
                      </span>
                    </div>
                    {n.content && n.content !== n.title && (
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--muted-foreground, #888)",
                          marginTop: "2px",
                          lineHeight: 1.4,
                          ...(expandedId === n.id
                            ? { whiteSpace: "pre-wrap" }
                            : {
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical" as const,
                              }),
                        }}
                      >
                        {(n.occurrenceCount ?? 1) > 1 ? `Latest: ${n.content}` : n.content}
                      </p>
                    )}
                    {/* Action link for expanded alerts */}
                    {expandedId === n.id && (
                      <div style={{ marginTop: "6px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {/* Structured action URL (preferred) */}
                        {(n as any).actionUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDropdown(false);
                              safeNavigate((n as any).actionUrl, setLocation);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#0078d4",
                              fontSize: "12px",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {(n as any).actionLabel || "View Details"} &rarr;
                          </button>
                        )}
                        {/* Conversation link */}
                        {n.conversationId && !(n as any).actionUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDropdown(false);
                              setLocation(`/chat?conversationId=${n.conversationId}`);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#0078d4",
                              fontSize: "12px",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Open Chat &rarr;
                          </button>
                        )}
                        {/* Schedule link */}
                        {n.scheduledMessageId && !(n as any).actionUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDropdown(false);
                              setLocation(`/chat?panel=schedule&alertId=${n.scheduledMessageId}`);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#0078d4",
                              fontSize: "12px",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            View Schedule &rarr;
                          </button>
                        )}
                        {/* Metadata details badge */}
                        {(n as any).metadata?.errorDetails?.errorMessage && (
                          <span style={{ fontSize: "11px", color: "#d32f2f", background: "#ffeaea", padding: "1px 6px", borderRadius: "4px" }}>
                            Error: {(n as any).metadata.errorDetails.errorMessage.slice(0, 80)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expand indicator / Mark read */}
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    {n.content && n.content !== n.title && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(expandedId === n.id ? null : n.id);
                        }}
                        title={expandedId === n.id ? "Collapse quick actions" : "Expand quick actions"}
                        style={{
                          color: "var(--muted-foreground, #666)",
                          padding: "4px",
                          display: "flex",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          transform: expandedId === n.id ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.15s",
                        }}
                      >
                        <ChevronDown style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                    {!n.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead.mutate({ id: n.id });
                        }}
                        title="Mark as read"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--muted-foreground, #666)",
                          cursor: "pointer",
                          padding: "4px",
                          borderRadius: "4px",
                          display: "flex",
                          flexShrink: 0,
                        }}
                      >
                        <Check style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "var(--muted-foreground, #666)",
                  fontSize: "13px",
                }}
              >
                No notifications
              </div>
            )}
          </div>
          )}

          {/* Footer */}
          <div
            style={{
              padding: "8px 16px",
              borderTop: "1px solid var(--border, #333)",
              display: "flex",
              justifyContent: "center",
              gap: "16px",
            }}
          >
            <button
              onClick={() => {
                setShowDropdown(false);
                setDetailNotification(null);
                setLocation("/notifications");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#0078d4",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {hasUnread ? "View All Notifications" : "ดูย้อนหลัง"}
            </button>
            <button
              onClick={() => {
                setShowDropdown(false);
                setDetailNotification(null);
                setLocation("/chat?panel=schedule");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#0078d4",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Scheduled Alerts
            </button>
            <button
              onClick={() => {
                setShowDropdown(false);
                setDetailNotification(null);
                setLocation("/settings?tab=notifications");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#6b7280",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalAlerts;
