/**
 * Global Alert System
 * Renders urgent message alerts and notification bell across all pages.
 * Replaces per-page UrgentMessageAlert and NotificationBell from Chat.tsx.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, AlarmClock, X, Check } from "lucide-react";
import { toast } from "sonner";

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
    setModalReminder(null);
    setLocation(`/chat?panel=schedule${alertId ? `&alertId=${alertId}` : ""}`);
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

function GlobalNotificationBell() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  if (count === 0 && !showDropdown) return null;

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

  return (
    <div ref={dropdownRef} style={{ position: "fixed", top: "12px", right: "12px", zIndex: 9990 }}>
      <button
        onClick={() => setShowDropdown((v) => !v)}
        title={`${count} unread notification${count !== 1 ? "s" : ""}`}
        aria-label={`${count} unread notification${count !== 1 ? "s" : ""}`}
        style={{
          background: "var(--background, #1e1e1e)",
          border: "1px solid var(--border, #333)",
          borderRadius: "8px",
          padding: "8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          position: "relative",
        }}
      >
        <Bell style={{ width: 18, height: 18, color: "var(--foreground, #e0e0e0)" }} />
        {count > 0 && (
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

          {/* Notification List */}
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
                    cursor: n.conversationId ? "pointer" : "default",
                  }}
                  onClick={() => {
                    if (n.conversationId) {
                      setShowDropdown(false);
                      setLocation(`/chat`);
                    }
                    if (!n.isRead) markRead.mutate({ id: n.id });
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
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {n.content}
                      </p>
                    )}
                  </div>

                  {/* Mark read button */}
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

          {/* Footer */}
          <div
            style={{
              padding: "8px 16px",
              borderTop: "1px solid var(--border, #333)",
              textAlign: "center",
            }}
          >
            <button
              onClick={() => {
                setShowDropdown(false);
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
              View Scheduled Alerts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalAlerts;
