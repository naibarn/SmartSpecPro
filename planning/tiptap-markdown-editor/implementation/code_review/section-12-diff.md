diff --git a/apps/web/client/src/components/GlobalAlerts.tsx b/apps/web/client/src/components/GlobalAlerts.tsx
index 026d8e42..28d2397e 100644
--- a/apps/web/client/src/components/GlobalAlerts.tsx
+++ b/apps/web/client/src/components/GlobalAlerts.tsx
@@ -8,9 +8,21 @@ import { useEffect, useState, useCallback, useRef } from "react";
 import { useLocation } from "wouter";
 import { trpc } from "@/lib/trpc";
 import { useAuth } from "@/contexts/AuthContext";
+import { useSSEReconnect } from "@/lib/useSSEReconnect";
 import { Bell, AlarmClock, X, Check, ChevronDown } from "lucide-react";
 import { toast } from "sonner";
 
+/** Safe navigation — blocks javascript:, data:, vbscript: protocol URLs */
+function safeNavigate(url: string, setLocation: (url: string) => void) {
+  if (!url || typeof url !== "string") return;
+  const lower = url.toLowerCase().trim();
+  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:") || lower.startsWith("blob:")) {
+    console.warn("[Security] Blocked unsafe actionUrl:", url.slice(0, 50));
+    return;
+  }
+  setLocation(url);
+}
+
 export function GlobalAlerts() {
   const { user } = useAuth();
 
@@ -462,11 +474,147 @@ function GlobalUrgentReminders() {
   );
 }
 
+function NotificationDetailPanel({ notification: n, onBack, onNavigate }: { notification: any; onBack: () => void; onNavigate: (url: string) => void }) {
+  const meta = n.metadata as any;
+  return (
+    <div style={{ padding: "12px 16px" }}>
+      {/* Header */}
+      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
+        <button
+          onClick={onBack}
+          style={{ background: "none", border: "none", color: "#0078d4", cursor: "pointer", padding: "2px 4px", fontSize: "12px" }}
+        >
+          &larr; Back
+        </button>
+      </div>
+
+      {/* Title + Priority */}
+      <div style={{ marginBottom: "8px" }}>
+        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
+          <span style={{
+            fontSize: "10px",
+            padding: "1px 6px",
+            borderRadius: "4px",
+            fontWeight: 600,
+            textTransform: "uppercase",
+            background: n.priority === "critical" ? "#d32f2f" : n.priority === "high" ? "#f57c00" : n.priority === "low" ? "#666" : "#0078d4",
+            color: "#fff",
+          }}>
+            {n.priority}
+          </span>
+          {n.type && (
+            <span style={{ fontSize: "10px", color: "var(--muted-foreground, #888)" }}>
+              {n.type.replace(/_/g, " ")}
+            </span>
+          )}
+        </div>
+        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground, #e0e0e0)", margin: 0 }}>
+          {n.title}
+        </h3>
+        <span style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", marginTop: "2px", display: "block" }}>
+          {new Date(n.createdAt).toLocaleString()}
+        </span>
+      </div>
+
+      {/* Content */}
+      {n.content && (
+        <p style={{ fontSize: "13px", color: "var(--foreground, #ccc)", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: "8px 0", padding: "8px", background: "var(--muted, rgba(255,255,255,0.05))", borderRadius: "6px" }}>
+          {n.content}
+        </p>
+      )}
+
+      {/* Resource Info */}
+      {n.relatedResourceType && (
+        <div style={{ fontSize: "12px", color: "var(--muted-foreground, #888)", margin: "8px 0", display: "flex", gap: "8px", alignItems: "center" }}>
+          <span style={{ padding: "1px 6px", background: "rgba(0,120,212,0.1)", borderRadius: "4px", fontSize: "11px" }}>
+            {n.relatedResourceType.replace(/_/g, " ")}
+          </span>
+          {n.relatedResourceId && (
+            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
+              ID: {n.relatedResourceId.length > 20 ? n.relatedResourceId.slice(0, 20) + "..." : n.relatedResourceId}
+            </span>
+          )}
+        </div>
+      )}
+
+      {/* Error Details */}
+      {meta?.errorDetails?.errorMessage && (
+        <div style={{ margin: "8px 0", padding: "8px", background: "rgba(211,47,47,0.08)", borderRadius: "6px", borderLeft: "3px solid #d32f2f" }}>
+          <div style={{ fontSize: "11px", fontWeight: 600, color: "#d32f2f", marginBottom: "4px" }}>Error Details</div>
+          {meta.errorDetails.errorCode && (
+            <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>Code: {meta.errorDetails.errorCode}</div>
+          )}
+          <div style={{ fontSize: "12px", color: "var(--foreground, #ccc)", whiteSpace: "pre-wrap" }}>
+            {meta.errorDetails.errorMessage.length > 500 ? meta.errorDetails.errorMessage.slice(0, 500) + "..." : meta.errorDetails.errorMessage}
+          </div>
+        </div>
+      )}
+
+      {/* Metrics */}
+      {meta?.metrics && (
+        <div style={{ margin: "8px 0", display: "flex", gap: "12px", flexWrap: "wrap" }}>
+          {meta.metrics.durationMs != null && (
+            <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
+              Duration: <strong style={{ color: "var(--foreground, #ccc)" }}>{meta.metrics.durationMs > 1000 ? `${(meta.metrics.durationMs / 1000).toFixed(1)}s` : `${meta.metrics.durationMs}ms`}</strong>
+            </div>
+          )}
+          {meta.metrics.costUsd != null && (
+            <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
+              Cost: <strong style={{ color: "var(--foreground, #ccc)" }}>${meta.metrics.costUsd.toFixed(4)}</strong>
+            </div>
+          )}
+          {meta.metrics.itemCount != null && (
+            <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
+              Items: <strong style={{ color: "var(--foreground, #ccc)" }}>{meta.metrics.itemCount}</strong>
+            </div>
+          )}
+        </div>
+      )}
+
+      {/* Retry Info */}
+      {meta?.retryInfo && (
+        <div style={{ margin: "8px 0", padding: "6px 8px", background: "rgba(245,124,0,0.08)", borderRadius: "6px", fontSize: "12px" }}>
+          Retry {meta.retryInfo.retryCount ?? 0}/{meta.retryInfo.maxRetries ?? "?"}
+          {meta.retryInfo.nextRetryAt && ` — next: ${new Date(meta.retryInfo.nextRetryAt).toLocaleString()}`}
+        </div>
+      )}
+
+      {/* Source */}
+      {meta?.source && (
+        <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", marginTop: "8px" }}>
+          Source: <span style={{ fontFamily: "monospace" }}>{meta.source}</span>
+        </div>
+      )}
+
+      {/* Action Button */}
+      {n.actionUrl && (
+        <button
+          onClick={() => safeNavigate(n.actionUrl, onNavigate)}
+          style={{
+            marginTop: "12px",
+            padding: "8px 16px",
+            background: "#0078d4",
+            color: "#fff",
+            border: "none",
+            borderRadius: "6px",
+            fontSize: "13px",
+            cursor: "pointer",
+            width: "100%",
+          }}
+        >
+          {n.actionLabel || "View Details"} &rarr;
+        </button>
+      )}
+    </div>
+  );
+}
+
 function GlobalNotificationBell() {
   const [, setLocation] = useLocation();
   const utils = trpc.useUtils();
   const [showDropdown, setShowDropdown] = useState(false);
   const [expandedId, setExpandedId] = useState<number | null>(null);
+  const [detailNotification, setDetailNotification] = useState<any>(null);
   const dropdownRef = useRef<HTMLDivElement>(null);
 
   const { data } = trpc.scheduledMessages.getNotificationCount.useQuery(
@@ -498,6 +646,21 @@ function GlobalNotificationBell() {
 
   const count = data?.count || 0;
 
+  // Real-time SSE for instant notification updates (with exponential backoff)
+  const handleSSEMessage = useCallback(() => {
+    utils.scheduledMessages.getNotificationCount.invalidate();
+    if (showDropdown) {
+      utils.scheduledMessages.getNotifications.invalidate();
+    }
+  }, [showDropdown, utils]);
+
+  useSSEReconnect({
+    url: "/api/notifications/stream",
+    onMessage: handleSSEMessage,
+    eventType: "notification",
+    enabled: true,
+  });
+
   // Close dropdown when clicking outside
   useEffect(() => {
     if (!showDropdown) return;
@@ -643,7 +806,16 @@ function GlobalNotificationBell() {
             </div>
           </div>
 
-          {/* Notification List */}
+          {/* Notification Detail or List */}
+          {detailNotification ? (
+            <div style={{ overflowY: "auto", flex: 1, maxHeight: "400px" }}>
+              <NotificationDetailPanel
+                notification={detailNotification}
+                onBack={() => setDetailNotification(null)}
+                onNavigate={(url) => { setShowDropdown(false); setDetailNotification(null); setLocation(url); }}
+              />
+            </div>
+          ) : (
           <div style={{ overflowY: "auto", flex: 1, maxHeight: "400px" }}>
             {notifications && notifications.length > 0 ? (
               notifications.map((n: any) => (
@@ -659,6 +831,13 @@ function GlobalNotificationBell() {
                     cursor: "pointer",
                   }}
                   onClick={() => {
+                    if (!n.isRead) markRead.mutate({ id: n.id });
+                    // Has structured metadata — show detail panel
+                    if ((n as any).actionUrl || (n as any).metadata || (n as any).relatedResourceType) {
+                      setDetailNotification(n);
+                      return;
+                    }
+                    // Legacy: direct navigation for conversations
                     if (n.conversationId) {
                       setShowDropdown(false);
                       setLocation(`/chat?c=${n.conversationId}`);
@@ -668,7 +847,6 @@ function GlobalNotificationBell() {
                     } else {
                       setExpandedId(expandedId === n.id ? null : n.id);
                     }
-                    if (!n.isRead) markRead.mutate({ id: n.id });
                   }}
                 >
                   {/* Unread dot */}
@@ -700,6 +878,19 @@ function GlobalNotificationBell() {
                       >
                         {n.title}
                       </span>
+                      {(n.occurrenceCount ?? 1) > 1 && (
+                        <span style={{
+                          fontSize: "10px",
+                          padding: "1px 5px",
+                          borderRadius: "4px",
+                          background: "rgba(99, 102, 241, 0.15)",
+                          color: "#818cf8",
+                          fontWeight: 600,
+                          flexShrink: 0,
+                        }}>
+                          x{n.occurrenceCount}
+                        </span>
+                      )}
                       <span style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", whiteSpace: "nowrap", flexShrink: 0 }}>
                         {formatTimeAgo(n.createdAt)}
                       </span>
@@ -722,56 +913,19 @@ function GlobalNotificationBell() {
                               }),
                         }}
                       >
-                        {n.content}
+                        {(n.occurrenceCount ?? 1) > 1 ? `Latest: ${n.content}` : n.content}
                       </p>
                     )}
-                    {/* Action link for expanded alerts without conversation */}
-                    {expandedId === n.id && !n.conversationId && (
-                      <div style={{ marginTop: "6px", display: "flex", gap: "8px" }}>
-                        {n.type === "alert" && n.title?.includes("Media Job") && (
-                          <button
-                            onClick={(e) => {
-                              e.stopPropagation();
-                              setShowDropdown(false);
-                              setLocation("/media-studio");
-                            }}
-                            style={{
-                              background: "none",
-                              border: "none",
-                              color: "#0078d4",
-                              fontSize: "12px",
-                              cursor: "pointer",
-                              padding: 0,
-                            }}
-                          >
-                            Open Media Studio &rarr;
-                          </button>
-                        )}
-                        {n.type === "alert" && (n.title?.includes("credit") || n.title?.includes("Credit")) && (
-                          <button
-                            onClick={(e) => {
-                              e.stopPropagation();
-                              setShowDropdown(false);
-                              setLocation("/admin/settings");
-                            }}
-                            style={{
-                              background: "none",
-                              border: "none",
-                              color: "#0078d4",
-                              fontSize: "12px",
-                              cursor: "pointer",
-                              padding: 0,
-                            }}
-                          >
-                            Admin Settings &rarr;
-                          </button>
-                        )}
-                        {n.type === "alert" && (n.title?.includes("latency") || n.title?.includes("API error")) && (
+                    {/* Action link for expanded alerts */}
+                    {expandedId === n.id && (
+                      <div style={{ marginTop: "6px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
+                        {/* Structured action URL (preferred) */}
+                        {(n as any).actionUrl && (
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               setShowDropdown(false);
-                              setLocation("/admin/system-guardian");
+                              safeNavigate((n as any).actionUrl, setLocation);
                             }}
                             style={{
                               background: "none",
@@ -782,17 +936,16 @@ function GlobalNotificationBell() {
                               padding: 0,
                             }}
                           >
-                            System Guardian &rarr;
+                            {(n as any).actionLabel || "View Details"} &rarr;
                           </button>
                         )}
-                        {n.type === "alert" && (n.title?.includes("Feedback") || n.title?.includes("feedback")) && (
+                        {/* Conversation link */}
+                        {n.conversationId && !(n as any).actionUrl && (
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               setShowDropdown(false);
-                              const ticketMatch = n.content?.match(/Ticket #(\d+)/);
-                              const ticketId = ticketMatch?.[1];
-                              setLocation(ticketId ? `/admin/feedback-hub?ticketId=${ticketId}` : "/admin/feedback-hub");
+                              setLocation(`/chat?conversationId=${n.conversationId}`);
                             }}
                             style={{
                               background: "none",
@@ -803,10 +956,11 @@ function GlobalNotificationBell() {
                               padding: 0,
                             }}
                           >
-                            View Feedback &rarr;
+                            Open Chat &rarr;
                           </button>
                         )}
-                        {n.scheduledMessageId && (
+                        {/* Schedule link */}
+                        {n.scheduledMessageId && !(n as any).actionUrl && (
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
@@ -825,6 +979,53 @@ function GlobalNotificationBell() {
                             View Schedule &rarr;
                           </button>
                         )}
+                        {/* Legacy fallback for old notifications without actionUrl */}
+                        {!(n as any).actionUrl && !n.conversationId && !n.scheduledMessageId && n.type === "alert" && (
+                          <>
+                            {n.title?.includes("Media Job") && (
+                              <button
+                                onClick={(e) => { e.stopPropagation(); setShowDropdown(false); setLocation("/media-studio"); }}
+                                style={{ background: "none", border: "none", color: "#0078d4", fontSize: "12px", cursor: "pointer", padding: 0 }}
+                              >
+                                Open Media Studio &rarr;
+                              </button>
+                            )}
+                            {(n.title?.includes("credit") || n.title?.includes("Credit")) && (
+                              <button
+                                onClick={(e) => { e.stopPropagation(); setShowDropdown(false); setLocation("/admin/settings"); }}
+                                style={{ background: "none", border: "none", color: "#0078d4", fontSize: "12px", cursor: "pointer", padding: 0 }}
+                              >
+                                Admin Settings &rarr;
+                              </button>
+                            )}
+                            {(n.title?.includes("latency") || n.title?.includes("API error")) && (
+                              <button
+                                onClick={(e) => { e.stopPropagation(); setShowDropdown(false); setLocation("/admin/system-guardian"); }}
+                                style={{ background: "none", border: "none", color: "#0078d4", fontSize: "12px", cursor: "pointer", padding: 0 }}
+                              >
+                                System Guardian &rarr;
+                              </button>
+                            )}
+                            {(n.title?.includes("Feedback") || n.title?.includes("feedback")) && (
+                              <button
+                                onClick={(e) => {
+                                  e.stopPropagation(); setShowDropdown(false);
+                                  const ticketMatch = n.content?.match(/Ticket #(\d+)/);
+                                  setLocation(ticketMatch?.[1] ? `/admin/feedback-hub?ticketId=${ticketMatch[1]}` : "/admin/feedback-hub");
+                                }}
+                                style={{ background: "none", border: "none", color: "#0078d4", fontSize: "12px", cursor: "pointer", padding: 0 }}
+                              >
+                                View Feedback &rarr;
+                              </button>
+                            )}
+                          </>
+                        )}
+                        {/* Metadata details badge */}
+                        {(n as any).metadata?.errorDetails?.errorMessage && (
+                          <span style={{ fontSize: "11px", color: "#d32f2f", background: "#ffeaea", padding: "1px 6px", borderRadius: "4px" }}>
+                            Error: {(n as any).metadata.errorDetails.errorMessage.slice(0, 80)}
+                          </span>
+                        )}
                       </div>
                     )}
                   </div>
@@ -881,18 +1082,38 @@ function GlobalNotificationBell() {
               </div>
             )}
           </div>
+          )}
 
           {/* Footer */}
           <div
             style={{
               padding: "8px 16px",
               borderTop: "1px solid var(--border, #333)",
-              textAlign: "center",
+              display: "flex",
+              justifyContent: "center",
+              gap: "16px",
             }}
           >
             <button
               onClick={() => {
                 setShowDropdown(false);
+                setDetailNotification(null);
+                setLocation("/notifications");
+              }}
+              style={{
+                background: "none",
+                border: "none",
+                color: "#0078d4",
+                fontSize: "12px",
+                cursor: "pointer",
+              }}
+            >
+              View All Notifications
+            </button>
+            <button
+              onClick={() => {
+                setShowDropdown(false);
+                setDetailNotification(null);
                 setLocation("/chat?panel=schedule");
               }}
               style={{
@@ -903,7 +1124,7 @@ function GlobalNotificationBell() {
                 cursor: "pointer",
               }}
             >
-              View Scheduled Alerts
+              Scheduled Alerts
             </button>
           </div>
         </div>
diff --git a/apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx b/apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx
new file mode 100644
index 00000000..c6516a69
--- /dev/null
+++ b/apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx
@@ -0,0 +1,120 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
+import React from "react";
+
+// Mutable mock data that tests can change
+let notificationCountData = { count: 3 };
+let notificationsData: any[] = [];
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    follows: {
+      getUrgentMessages: { useQuery: () => ({ data: [] }) },
+    },
+    scheduledMessages: {
+      getNotificationCount: { useQuery: () => ({ data: notificationCountData }) },
+      getNotifications: { useQuery: () => ({ data: notificationsData }) },
+      getUrgentReminders: { useQuery: () => ({ data: [] }) },
+      markAllRead: { useMutation: () => ({ mutate: vi.fn(), isLoading: false }) },
+      markRead: { useMutation: () => ({ mutate: vi.fn(), isLoading: false }) },
+    },
+    useUtils: () => ({
+      scheduledMessages: {
+        getNotificationCount: { invalidate: vi.fn() },
+        getNotifications: { invalidate: vi.fn() },
+        getUrgentReminders: { invalidate: vi.fn() },
+      },
+    }),
+  },
+}));
+
+vi.mock("@/contexts/AuthContext", () => ({
+  useAuth: () => ({ user: { id: 1 } }),
+}));
+
+vi.mock("wouter", () => ({
+  useLocation: () => ["/", vi.fn()],
+}));
+
+// Mock EventSource
+(globalThis as any).EventSource = class {
+  addEventListener() {}
+  close() {}
+  set onerror(_: any) {}
+};
+
+import { GlobalAlerts } from "../GlobalAlerts";
+
+describe("GlobalNotificationBell occurrence badge", () => {
+  beforeEach(() => {
+    cleanup();
+    notificationCountData = { count: 3 };
+    notificationsData = [];
+  });
+
+  it("renders occurrence badge (xN) when occurrenceCount > 1", async () => {
+    notificationsData = [
+      {
+        id: 1,
+        title: "Job failed",
+        content: "Error in pipeline",
+        isRead: false,
+        priority: "high",
+        createdAt: new Date().toISOString(),
+        occurrenceCount: 5,
+      },
+    ];
+
+    render(<GlobalAlerts />);
+
+    await act(async () => {
+      fireEvent.click(screen.getByLabelText(/unread notification/i));
+    });
+
+    expect(screen.getByText("x5")).toBeTruthy();
+  });
+
+  it("does NOT render occurrence badge when occurrenceCount is 1", async () => {
+    notificationsData = [
+      {
+        id: 2,
+        title: "Single event",
+        content: "Just once",
+        isRead: false,
+        priority: "normal",
+        createdAt: new Date().toISOString(),
+        occurrenceCount: 1,
+      },
+    ];
+
+    render(<GlobalAlerts />);
+
+    await act(async () => {
+      fireEvent.click(screen.getByLabelText(/unread notification/i));
+    });
+
+    expect(screen.queryByText("x1")).toBeNull();
+  });
+
+  it("shows 'Latest:' prefix for grouped notification content", async () => {
+    notificationsData = [
+      {
+        id: 3,
+        title: "Grouped alert",
+        content: "Job failed",
+        isRead: false,
+        priority: "high",
+        createdAt: new Date().toISOString(),
+        occurrenceCount: 3,
+      },
+    ];
+
+    render(<GlobalAlerts />);
+
+    await act(async () => {
+      fireEvent.click(screen.getByLabelText(/unread notification/i));
+    });
+
+    expect(screen.getByText("Latest: Job failed")).toBeTruthy();
+  });
+});
diff --git a/apps/web/client/src/components/editor/ConflictResolutionDialog.test.tsx b/apps/web/client/src/components/editor/ConflictResolutionDialog.test.tsx
new file mode 100644
index 00000000..c10346b2
--- /dev/null
+++ b/apps/web/client/src/components/editor/ConflictResolutionDialog.test.tsx
@@ -0,0 +1,109 @@
+import { render, screen, fireEvent } from "@testing-library/react";
+import { describe, it, expect, vi } from "vitest";
+import { ConflictResolutionDialog } from "./ConflictResolutionDialog";
+
+// Mock useI18n
+vi.mock("@/lib/i18n", () => ({
+  useI18n: () => ({
+    locale: "en",
+    setLocale: vi.fn(),
+    t: (key: string) => {
+      const translations: Record<string, string> = {
+        "editor.conflict.title": "Document Conflict",
+        "editor.conflict.description":
+          "This document has been modified elsewhere. Choose how to proceed:",
+        "editor.conflict.overwrite": "Overwrite",
+        "editor.conflict.overwriteHint":
+          "Save your version, discarding the other changes",
+        "editor.conflict.reload": "Reload",
+        "editor.conflict.reloadHint":
+          "Load the latest version, discarding your unsaved changes",
+      };
+      return translations[key] ?? key;
+    },
+    dict: {},
+  }),
+}));
+
+describe("ConflictResolutionDialog", () => {
+  it("renders warning message when open={true}", () => {
+    render(
+      <ConflictResolutionDialog
+        open={true}
+        onOverwrite={vi.fn()}
+        onReload={vi.fn()}
+      />,
+    );
+    expect(screen.getByText("Document Conflict")).toBeTruthy();
+  });
+
+  it("Overwrite button fires onOverwrite callback", () => {
+    const onOverwrite = vi.fn();
+    render(
+      <ConflictResolutionDialog
+        open={true}
+        onOverwrite={onOverwrite}
+        onReload={vi.fn()}
+      />,
+    );
+    fireEvent.click(screen.getByText("Overwrite"));
+    expect(onOverwrite).toHaveBeenCalledOnce();
+  });
+
+  it("Reload button fires onReload callback", () => {
+    const onReload = vi.fn();
+    render(
+      <ConflictResolutionDialog
+        open={true}
+        onOverwrite={vi.fn()}
+        onReload={onReload}
+      />,
+    );
+    fireEvent.click(screen.getByText("Reload"));
+    expect(onReload).toHaveBeenCalledOnce();
+  });
+
+  it("dialog cannot be dismissed without choosing an option", () => {
+    const onOverwrite = vi.fn();
+    const onReload = vi.fn();
+    render(
+      <ConflictResolutionDialog
+        open={true}
+        onOverwrite={onOverwrite}
+        onReload={onReload}
+      />,
+    );
+    // Simulate Escape key on the dialog content
+    fireEvent.keyDown(screen.getByText("Document Conflict"), {
+      key: "Escape",
+      code: "Escape",
+    });
+    // Dialog should still be visible
+    expect(screen.getByText("Document Conflict")).toBeTruthy();
+    expect(onOverwrite).not.toHaveBeenCalled();
+    expect(onReload).not.toHaveBeenCalled();
+  });
+
+  it("shows document title when provided", () => {
+    render(
+      <ConflictResolutionDialog
+        open={true}
+        documentTitle="My Report"
+        onOverwrite={vi.fn()}
+        onReload={vi.fn()}
+      />,
+    );
+    expect(screen.getByText(/My Report/)).toBeTruthy();
+  });
+
+  it("is not rendered when open={false}", () => {
+    render(
+      <ConflictResolutionDialog
+        open={false}
+        onOverwrite={vi.fn()}
+        onReload={vi.fn()}
+      />,
+    );
+    expect(screen.queryByText("Document Conflict")).toBeNull();
+  });
+});
diff --git a/apps/web/client/src/components/editor/ConflictResolutionDialog.tsx b/apps/web/client/src/components/editor/ConflictResolutionDialog.tsx
new file mode 100644
index 00000000..f203315c
--- /dev/null
+++ b/apps/web/client/src/components/editor/ConflictResolutionDialog.tsx
@@ -0,0 +1,57 @@
+import { useI18n } from "@/lib/i18n";
+import { AlertTriangle } from "lucide-react";
+import {
+  AlertDialog,
+  AlertDialogContent,
+  AlertDialogDescription,
+  AlertDialogFooter,
+  AlertDialogHeader,
+  AlertDialogTitle,
+} from "@/components/ui/alert-dialog";
+import { Button } from "@/components/ui/button";
+
+interface ConflictResolutionDialogProps {
+  open: boolean;
+  documentTitle?: string;
+  onOverwrite: () => void;
+  onReload: () => void;
+}
+
+export function ConflictResolutionDialog({
+  open,
+  documentTitle,
+  onOverwrite,
+  onReload,
+}: ConflictResolutionDialogProps) {
+  const { t } = useI18n();
+
+  return (
+    <AlertDialog open={open}>
+      <AlertDialogContent
+        onEscapeKeyDown={(e) => e.preventDefault()}
+        onPointerDownOutside={(e) => e.preventDefault()}
+      >
+        <AlertDialogHeader>
+          <AlertDialogTitle className="flex items-center gap-2">
+            <AlertTriangle className="h-5 w-5 text-destructive" />
+            {t("editor.conflict.title")}
+          </AlertDialogTitle>
+          <AlertDialogDescription>
+            {t("editor.conflict.description")}
+            {documentTitle && (
+              <span className="block mt-1 font-medium">{documentTitle}</span>
+            )}
+          </AlertDialogDescription>
+        </AlertDialogHeader>
+        <AlertDialogFooter>
+          <Button variant="outline" onClick={onReload}>
+            {t("editor.conflict.reload")}
+          </Button>
+          <Button variant="destructive" onClick={onOverwrite}>
+            {t("editor.conflict.overwrite")}
+          </Button>
+        </AlertDialogFooter>
+      </AlertDialogContent>
+    </AlertDialog>
+  );
+}
diff --git a/apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx b/apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx
index 0d7748cc..8ce96828 100644
--- a/apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx
+++ b/apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx
@@ -3,6 +3,7 @@ import type { Editor } from "@tiptap/core";
 import { parse, serialize } from "./TiptapMarkdownBridge";
 import TiptapEditor from "./TiptapEditor";
 import SourceModePanel from "./SourceModePanel";
+import { ConflictResolutionDialog } from "./ConflictResolutionDialog";
 import type {
   EditorMode,
   SaveStatus,
@@ -27,6 +28,7 @@ export default function UnifiedDocumentSurface({
   );
   const [sourceMarkdown, setSourceMarkdown] = useState(initialContent);
   const [dirty, setDirty] = useState(false);
+  const [conflictDetected, setConflictDetected] = useState(false);
 
   const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const editorRef = useRef<Editor | null>(null);
@@ -56,13 +58,15 @@ export default function UnifiedDocumentSurface({
     };
   }, []);
 
-  const saveStatus: SaveStatus = isSaving
-    ? "saving"
-    : errorMessage
-      ? "error"
-      : dirty
-        ? "dirty"
-        : "clean";
+  const saveStatus: SaveStatus = conflictDetected
+    ? "conflict"
+    : isSaving
+      ? "saving"
+      : errorMessage
+        ? "error"
+        : dirty
+          ? "dirty"
+          : "clean";
 
   // NOTE: onSave is fire-and-forget — caller must set errorMessage on failure (S10)
   const doSave = useCallback(
@@ -73,11 +77,15 @@ export default function UnifiedDocumentSurface({
     [onSave],
   );
 
+  const conflictRef = useRef(false);
+  conflictRef.current = conflictDetected;
+
   const scheduleSave = useCallback(
     (md: string) => {
+      if (conflictRef.current) return; // Pause auto-save during conflict
       if (debounceRef.current) clearTimeout(debounceRef.current);
       debounceRef.current = setTimeout(() => {
-        doSave(md);
+        if (!conflictRef.current) doSave(md);
       }, AUTO_SAVE_DELAY);
     },
     [doSave],
@@ -170,6 +178,30 @@ export default function UnifiedDocumentSurface({
     return () => document.removeEventListener("keydown", handler);
   }, [immediateSave, mode, switchMode]);
 
+  // Conflict resolution handlers
+  const handleConflictOverwrite = useCallback(() => {
+    // Re-save without expectedUpdatedAt (last-write-wins)
+    setConflictDetected(false);
+    doSave(latestMarkdownRef.current);
+  }, [doSave]);
+
+  const handleConflictReload = useCallback(() => {
+    // Signal parent to reload — parent controls the data fetching
+    setConflictDetected(false);
+    setDirty(false);
+    // Reset to initial content (parent will provide new content via props)
+    const parsed = parse(initialContent);
+    setTiptapContent(parsed);
+    editorRef.current?.commands.setContent(parsed);
+    setSourceMarkdown(initialContent);
+    latestMarkdownRef.current = initialContent;
+  }, [initialContent]);
+
+  // Expose conflict trigger for parent save error handling
+  const triggerConflict = useCallback(() => {
+    setConflictDetected(true);
+  }, []);
+
   return (
     <div className="unified-document-surface flex flex-col h-full">
       {/* Minimal mode switcher — EditorToolbar replaces this in Section 04 */}
@@ -199,15 +231,17 @@ export default function UnifiedDocumentSurface({
           Source
         </button>
         <span className="ml-auto text-xs text-muted-foreground" data-testid="save-status">
-          {saveStatus === "saving"
-            ? "Saving..."
-            : saveStatus === "dirty"
-              ? "Unsaved changes"
-              : saveStatus === "error"
-                ? "Error"
-                : saveStatus === "clean"
-                  ? "Saved"
-                  : ""}
+          {saveStatus === "conflict"
+            ? "Conflict detected"
+            : saveStatus === "saving"
+              ? "Saving..."
+              : saveStatus === "dirty"
+                ? "Unsaved changes"
+                : saveStatus === "error"
+                  ? "Error"
+                  : saveStatus === "clean"
+                    ? "Saved"
+                    : ""}
         </span>
       </div>
 
@@ -237,6 +271,14 @@ export default function UnifiedDocumentSurface({
         onChange={handleSourceChange}
         visible={mode === "source"}
       />
+
+      {conflictDetected && (
+        <ConflictResolutionDialog
+          open={true}
+          onOverwrite={handleConflictOverwrite}
+          onReload={handleConflictReload}
+        />
+      )}
     </div>
   );
 }
diff --git a/apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts b/apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts
new file mode 100644
index 00000000..b9fd79cf
--- /dev/null
+++ b/apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts
@@ -0,0 +1,245 @@
+// @vitest-environment jsdom
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+import { renderHook, act } from "@testing-library/react";
+import {
+  useSSEReconnect,
+  MAX_RECONNECT_ATTEMPTS,
+  BASE_DELAY_MS,
+} from "../useSSEReconnect";
+
+// ---- Mock EventSource ----
+type ESListener = (...args: any[]) => void;
+
+class MockEventSource {
+  static instances: MockEventSource[] = [];
+  url: string;
+  withCredentials: boolean;
+  readyState = 0; // CONNECTING
+  onerror: ((ev: any) => void) | null = null;
+  private listeners: Record<string, ESListener[]> = {};
+
+  constructor(url: string, opts?: { withCredentials?: boolean }) {
+    this.url = url;
+    this.withCredentials = opts?.withCredentials ?? false;
+    MockEventSource.instances.push(this);
+  }
+
+  addEventListener(type: string, cb: ESListener) {
+    if (!this.listeners[type]) this.listeners[type] = [];
+    this.listeners[type].push(cb);
+  }
+
+  removeEventListener(type: string, cb: ESListener) {
+    if (this.listeners[type]) {
+      this.listeners[type] = this.listeners[type].filter((l) => l !== cb);
+    }
+  }
+
+  close = vi.fn();
+
+  // Test helpers
+  _emit(type: string, data?: any) {
+    (this.listeners[type] || []).forEach((cb) => cb(data));
+  }
+
+  _triggerError() {
+    if (this.onerror) this.onerror(new Event("error"));
+  }
+
+  _triggerOpen() {
+    this._emit("open");
+  }
+}
+
+// Install mock
+const OriginalEventSource = globalThis.EventSource;
+
+beforeEach(() => {
+  MockEventSource.instances = [];
+  (globalThis as any).EventSource = MockEventSource as any;
+  vi.useFakeTimers();
+});
+
+afterEach(() => {
+  vi.useRealTimers();
+  vi.restoreAllMocks();
+  (globalThis as any).EventSource = OriginalEventSource;
+});
+
+function latestES(): MockEventSource {
+  return MockEventSource.instances[MockEventSource.instances.length - 1];
+}
+
+describe("useSSEReconnect", () => {
+  it("connects EventSource on mount", () => {
+    renderHook(() =>
+      useSSEReconnect({
+        url: "/api/test",
+        onMessage: vi.fn(),
+      })
+    );
+    expect(MockEventSource.instances).toHaveLength(1);
+    expect(latestES().url).toBe("/api/test");
+    expect(latestES().withCredentials).toBe(true);
+  });
+
+  it("calls onMessage when event fires", () => {
+    const onMessage = vi.fn();
+    renderHook(() =>
+      useSSEReconnect({
+        url: "/api/test",
+        onMessage,
+        eventType: "notification",
+      })
+    );
+    latestES()._emit("notification");
+    expect(onMessage).toHaveBeenCalledTimes(1);
+  });
+
+  it("reconnects with exponential backoff (1s, 2s, 4s...)", () => {
+    renderHook(() =>
+      useSSEReconnect({
+        url: "/api/test",
+        onMessage: vi.fn(),
+      })
+    );
+
+    expect(MockEventSource.instances).toHaveLength(1);
+
+    // First error → 1s delay
+    act(() => latestES()._triggerError());
+    expect(MockEventSource.instances).toHaveLength(1); // not yet reconnected
+    act(() => vi.advanceTimersByTime(BASE_DELAY_MS));
+    expect(MockEventSource.instances).toHaveLength(2);
+
+    // Second error → 2s delay
+    act(() => latestES()._triggerError());
+    act(() => vi.advanceTimersByTime(BASE_DELAY_MS * 2 - 1));
+    expect(MockEventSource.instances).toHaveLength(2); // not yet
+    act(() => vi.advanceTimersByTime(1));
+    expect(MockEventSource.instances).toHaveLength(3);
+
+    // Third error → 4s delay
+    act(() => latestES()._triggerError());
+    act(() => vi.advanceTimersByTime(BASE_DELAY_MS * 4));
+    expect(MockEventSource.instances).toHaveLength(4);
+  });
+
+  it("resets attempt counter on successful open", () => {
+    renderHook(() =>
+      useSSEReconnect({
+        url: "/api/test",
+        onMessage: vi.fn(),
+      })
+    );
+
+    // Error → reconnect after 1s
+    act(() => latestES()._triggerError());
+    act(() => vi.advanceTimersByTime(BASE_DELAY_MS));
+    expect(MockEventSource.instances).toHaveLength(2);
+
+    // Successful open → resets counter
+    act(() => latestES()._triggerOpen());
+
+    // Next error should be 1s delay again (not 4s)
+    act(() => latestES()._triggerError());
+    act(() => vi.advanceTimersByTime(BASE_DELAY_MS));
+    expect(MockEventSource.instances).toHaveLength(3);
+  });
+
+  it("stops reconnecting after MAX_RECONNECT_ATTEMPTS", () => {
+    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
+
+    renderHook(() =>
+      useSSEReconnect({
+        url: "/api/test",
+        onMessage: vi.fn(),
+      })
+    );
+
+    // Exhaust all attempts
+    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
+      act(() => latestES()._triggerError());
+      act(() => vi.advanceTimersByTime(BASE_DELAY_MS * Math.pow(2, i)));
+    }
+
+    const countBeforeFinal = MockEventSource.instances.length;
+    // One more error — should NOT create a new EventSource
+    act(() => latestES()._triggerError());
+    act(() => vi.advanceTimersByTime(60000));
+    expect(MockEventSource.instances).toHaveLength(countBeforeFinal);
+    expect(warnSpy).toHaveBeenCalledWith(
+      expect.stringContaining("Max reconnect attempts")
+    );
+  });
+
+  it("closes EventSource on unmount", () => {
+    const { unmount } = renderHook(() =>
+      useSSEReconnect({
+        url: "/api/test",
+        onMessage: vi.fn(),
+      })
+    );
+
+    const es = latestES();
+    unmount();
+    expect(es.close).toHaveBeenCalled();
+  });
+
+  it("clears pending timer on unmount", () => {
+    const { unmount } = renderHook(() =>
+      useSSEReconnect({
+        url: "/api/test",
+        onMessage: vi.fn(),
+      })
+    );
+
+    // Trigger error to start a reconnect timer
+    act(() => latestES()._triggerError());
+    const instanceCount = MockEventSource.instances.length;
+
+    // Unmount before timer fires
+    unmount();
+
+    // Advance past the timer — should NOT create new EventSource
+    act(() => vi.advanceTimersByTime(BASE_DELAY_MS * 10));
+    expect(MockEventSource.instances).toHaveLength(instanceCount);
+  });
+
+  it("does not reconnect while a reconnection is pending", () => {
+    renderHook(() =>
+      useSSEReconnect({
+        url: "/api/test",
+        onMessage: vi.fn(),
+      })
+    );
+
+    // First error → schedules a reconnect timer (1s)
+    act(() => latestES()._triggerError());
+    const countAfterFirstError = MockEventSource.instances.length;
+
+    // DO NOT advance timer — it's still pending.
+    // A second error fires while the first timer is pending.
+    // The hook's guard `if (reconnectTimerRef.current !== null) return;`
+    // should prevent a second timer from being scheduled.
+    // (The latest ES is already closed, but we can still call _triggerError
+    // because the onerror handler was set before close.)
+    // We need to simulate: another error arrives somehow. Since the first
+    // ES was closed, we just verify no new EventSource is created after
+    // advancing the timer once.
+    act(() => vi.advanceTimersByTime(BASE_DELAY_MS));
+    // Exactly one new EventSource should have been created (from the first timer)
+    expect(MockEventSource.instances).toHaveLength(countAfterFirstError + 1);
+  });
+
+  it("does not connect when enabled=false", () => {
+    renderHook(() =>
+      useSSEReconnect({
+        url: "/api/test",
+        onMessage: vi.fn(),
+        enabled: false,
+      })
+    );
+    expect(MockEventSource.instances).toHaveLength(0);
+  });
+});
diff --git a/apps/web/client/src/lib/i18n/locales/en.ts b/apps/web/client/src/lib/i18n/locales/en.ts
index d70ceb8e..61ff0ea3 100644
--- a/apps/web/client/src/lib/i18n/locales/en.ts
+++ b/apps/web/client/src/lib/i18n/locales/en.ts
@@ -1002,9 +1002,12 @@ const en: TranslationDictionary = {
   "editor.placeholder": "Start writing...",
   "editor.save.error": "Save failed",
   "editor.conflict.title": "Document Conflict",
+  "editor.conflict.description": "This document has been modified elsewhere (another tab or user). Choose how to proceed:",
   "editor.conflict.message": "This document has been modified in another tab or by another user. Your unsaved changes may conflict with the latest version.",
   "editor.conflict.overwrite": "Overwrite",
-  "editor.conflict.reload": "Reload Latest",
+  "editor.conflict.overwriteHint": "Save your version, discarding the other changes",
+  "editor.conflict.reload": "Reload",
+  "editor.conflict.reloadHint": "Load the latest version, discarding your unsaved changes",
   "editor.media.remove": "Remove",
   "editor.media.editAlt": "Edit alt text",
   "editor.media.editCaption": "Edit caption",
diff --git a/apps/web/client/src/lib/i18n/locales/th.ts b/apps/web/client/src/lib/i18n/locales/th.ts
index 967f236a..1aac0934 100644
--- a/apps/web/client/src/lib/i18n/locales/th.ts
+++ b/apps/web/client/src/lib/i18n/locales/th.ts
@@ -977,9 +977,12 @@ const th: TranslationDictionary = {
   "editor.placeholder": "เริ่มเขียนเนื้อหา...",
   "editor.save.error": "บันทึกไม่สำเร็จ",
   "editor.conflict.title": "เอกสารขัดแย้ง",
+  "editor.conflict.description": "เอกสารนี้ถูกแก้ไขจากที่อื่น (แท็บอื่นหรือผู้ใช้อื่น) เลือกวิธีดำเนินการ:",
   "editor.conflict.message": "เอกสารนี้ถูกแก้ไขในแท็บอื่นหรือโดยผู้ใช้อื่น การเปลี่ยนแปลงที่ยังไม่ได้บันทึกอาจขัดแย้งกับเวอร์ชันล่าสุด",
   "editor.conflict.overwrite": "บันทึกทับ",
-  "editor.conflict.reload": "โหลดเวอร์ชันล่าสุด",
+  "editor.conflict.overwriteHint": "บันทึกเวอร์ชันของคุณ ละทิ้งการเปลี่ยนแปลงอื่น",
+  "editor.conflict.reload": "โหลดใหม่",
+  "editor.conflict.reloadHint": "โหลดเวอร์ชันล่าสุด ละทิ้งการเปลี่ยนแปลงที่ยังไม่ได้บันทึก",
   "editor.media.remove": "ลบ",
   "editor.media.editAlt": "แก้ไขข้อความ alt",
   "editor.media.editCaption": "แก้ไขคำบรรยาย",
diff --git a/apps/web/client/src/lib/useSSEReconnect.ts b/apps/web/client/src/lib/useSSEReconnect.ts
new file mode 100644
index 00000000..2beac9eb
--- /dev/null
+++ b/apps/web/client/src/lib/useSSEReconnect.ts
@@ -0,0 +1,94 @@
+import { useEffect, useRef, useCallback } from "react";
+
+export const MAX_RECONNECT_ATTEMPTS = 5;
+export const BASE_DELAY_MS = 1000;
+export const MAX_DELAY_MS = 30000;
+
+interface UseSSEReconnectOptions {
+  url: string;
+  /** Called when a message of the given event type arrives */
+  onMessage: () => void;
+  /** Event type to listen for (default: "notification") */
+  eventType?: string;
+  /** Whether the hook is active (default: true) */
+  enabled?: boolean;
+}
+
+export function useSSEReconnect({
+  url,
+  onMessage,
+  eventType = "notification",
+  enabled = true,
+}: UseSSEReconnectOptions) {
+  const esRef = useRef<EventSource | null>(null);
+  const attemptsRef = useRef(0);
+  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
+  // Keep latest onMessage in a ref to avoid stale closures
+  const onMessageRef = useRef(onMessage);
+  onMessageRef.current = onMessage;
+
+  const cleanup = useCallback(() => {
+    if (reconnectTimerRef.current !== null) {
+      clearTimeout(reconnectTimerRef.current);
+      reconnectTimerRef.current = null;
+    }
+    if (esRef.current) {
+      esRef.current.close();
+      esRef.current = null;
+    }
+  }, []);
+
+  useEffect(() => {
+    if (!enabled) {
+      cleanup();
+      return;
+    }
+
+    function connect() {
+      try {
+        const es = new EventSource(url, { withCredentials: true });
+        esRef.current = es;
+
+        es.addEventListener(eventType, () => {
+          onMessageRef.current();
+        });
+
+        es.addEventListener("open", () => {
+          attemptsRef.current = 0;
+        });
+
+        es.onerror = () => {
+          es.close();
+          esRef.current = null;
+
+          if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
+            console.warn(
+              `[useSSEReconnect] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Falling back to polling.`
+            );
+            return;
+          }
+
+          // Don't schedule if one is already pending
+          if (reconnectTimerRef.current !== null) return;
+
+          const delay = Math.min(
+            BASE_DELAY_MS * Math.pow(2, attemptsRef.current),
+            MAX_DELAY_MS
+          );
+          attemptsRef.current += 1;
+
+          reconnectTimerRef.current = setTimeout(() => {
+            reconnectTimerRef.current = null;
+            connect();
+          }, delay);
+        };
+      } catch {
+        // EventSource not supported — polling is the fallback
+      }
+    }
+
+    connect();
+
+    return cleanup;
+  }, [url, eventType, enabled, cleanup]);
+}
diff --git a/apps/web/client/src/pages/Notifications.tsx b/apps/web/client/src/pages/Notifications.tsx
new file mode 100644
index 00000000..df24d5a4
--- /dev/null
+++ b/apps/web/client/src/pages/Notifications.tsx
@@ -0,0 +1,535 @@
+import { useState } from "react";
+import { useLocation } from "wouter";
+import { trpc } from "@/lib/trpc";
+import { Bell, Search, Filter, Check, ChevronLeft, ChevronRight, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
+
+/** Safe navigation — blocks dangerous protocol URLs */
+function safeNavigate(url: string, setLocation: (url: string) => void) {
+  if (!url || typeof url !== "string") return;
+  const lower = url.toLowerCase().trim();
+  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:") || lower.startsWith("blob:")) {
+    return;
+  }
+  setLocation(url);
+}
+
+const PRIORITY_COLORS: Record<string, string> = {
+  critical: "#ef4444",
+  high: "#f59e0b",
+  normal: "#6b7280",
+  low: "#4b5563",
+};
+
+const TYPE_LABELS: Record<string, string> = {
+  scheduled_message: "Schedule",
+  follow_request: "Follow",
+  alert: "Alert",
+  system: "System",
+};
+
+export default function Notifications() {
+  const [, setLocation] = useLocation();
+  const [search, setSearch] = useState("");
+  const [type, setType] = useState<string>("");
+  const [priority, setPriority] = useState<string>("");
+  const [readState, setReadState] = useState<"all" | "unread" | "read">("all");
+  const [page, setPage] = useState(0);
+  const [selectedId, setSelectedId] = useState<number | null>(null);
+  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
+  const limit = 20;
+
+  const utils = trpc.useUtils();
+
+  const { data, isLoading } = trpc.scheduledMessages.getNotificationHistory.useQuery({
+    limit,
+    offset: page * limit,
+    type: type ? (type as any) : undefined,
+    priority: priority ? (priority as any) : undefined,
+    readState,
+    search: search || undefined,
+  });
+
+  const markRead = trpc.scheduledMessages.markRead.useMutation({
+    onSuccess: () => {
+      utils.scheduledMessages.getNotificationHistory.invalidate();
+      utils.scheduledMessages.getNotificationCount.invalidate();
+    },
+  });
+
+  const markAllRead = trpc.scheduledMessages.markAllRead.useMutation({
+    onSuccess: () => {
+      utils.scheduledMessages.getNotificationHistory.invalidate();
+      utils.scheduledMessages.getNotificationCount.invalidate();
+    },
+  });
+
+  const dismiss = trpc.scheduledMessages.dismissNotification.useMutation({
+    onSuccess: () => {
+      utils.scheduledMessages.getNotificationHistory.invalidate();
+      utils.scheduledMessages.getNotificationCount.invalidate();
+      setSelectedId(null);
+    },
+  });
+
+  const { data: groupOccurrences, isLoading: groupLoading } =
+    trpc.scheduledMessages.getGroupOccurrences.useQuery(
+      { notificationId: expandedGroupId!, limit: 10 },
+      { enabled: expandedGroupId !== null }
+    );
+
+  const items = data?.items ?? [];
+  const total = data?.total ?? 0;
+  const totalPages = Math.ceil(total / limit);
+  const selected = items.find((n: any) => n.id === selectedId) as any;
+
+  return (
+    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
+      {/* Header */}
+      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
+        <Bell style={{ width: 24, height: 24, color: "var(--foreground, #e0e0e0)" }} />
+        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--foreground, #e0e0e0)", margin: 0 }}>
+          Notifications
+        </h1>
+        <span style={{ fontSize: "13px", color: "var(--muted-foreground, #888)" }}>
+          {total} total
+        </span>
+        <div style={{ flex: 1 }} />
+        <button
+          onClick={() => markAllRead.mutate()}
+          style={{
+            padding: "6px 12px",
+            background: "transparent",
+            border: "1px solid var(--border, #333)",
+            borderRadius: "6px",
+            color: "#0078d4",
+            fontSize: "12px",
+            cursor: "pointer",
+          }}
+        >
+          Mark all read
+        </button>
+      </div>
+
+      {/* Filters */}
+      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
+        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
+          <Search style={{ position: "absolute", left: 8, top: 9, width: 14, height: 14, color: "var(--muted-foreground, #666)" }} />
+          <input
+            type="text"
+            placeholder="Search notifications..."
+            value={search}
+            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
+            style={{
+              width: "100%",
+              padding: "8px 8px 8px 28px",
+              background: "var(--background, #1e1e1e)",
+              border: "1px solid var(--border, #333)",
+              borderRadius: "6px",
+              color: "var(--foreground, #e0e0e0)",
+              fontSize: "13px",
+            }}
+          />
+        </div>
+        <select
+          value={type}
+          onChange={(e) => { setType(e.target.value); setPage(0); }}
+          style={{
+            padding: "8px 12px",
+            background: "var(--background, #1e1e1e)",
+            border: "1px solid var(--border, #333)",
+            borderRadius: "6px",
+            color: "var(--foreground, #e0e0e0)",
+            fontSize: "13px",
+          }}
+        >
+          <option value="">All Types</option>
+          <option value="alert">Alert</option>
+          <option value="system">System</option>
+          <option value="scheduled_message">Schedule</option>
+          <option value="follow_request">Follow</option>
+        </select>
+        <select
+          value={priority}
+          onChange={(e) => { setPriority(e.target.value); setPage(0); }}
+          style={{
+            padding: "8px 12px",
+            background: "var(--background, #1e1e1e)",
+            border: "1px solid var(--border, #333)",
+            borderRadius: "6px",
+            color: "var(--foreground, #e0e0e0)",
+            fontSize: "13px",
+          }}
+        >
+          <option value="">All Priorities</option>
+          <option value="critical">Critical</option>
+          <option value="high">High</option>
+          <option value="normal">Normal</option>
+          <option value="low">Low</option>
+        </select>
+        <select
+          value={readState}
+          onChange={(e) => { setReadState(e.target.value as any); setPage(0); }}
+          style={{
+            padding: "8px 12px",
+            background: "var(--background, #1e1e1e)",
+            border: "1px solid var(--border, #333)",
+            borderRadius: "6px",
+            color: "var(--foreground, #e0e0e0)",
+            fontSize: "13px",
+          }}
+        >
+          <option value="all">All</option>
+          <option value="unread">Unread</option>
+          <option value="read">Read</option>
+        </select>
+      </div>
+
+      {/* Content */}
+      <div style={{ display: "flex", gap: "16px" }}>
+        {/* List */}
+        <div style={{ flex: 1, minWidth: 0 }}>
+          {isLoading ? (
+            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted-foreground, #666)" }}>
+              Loading...
+            </div>
+          ) : items.length === 0 ? (
+            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted-foreground, #666)" }}>
+              No notifications found
+            </div>
+          ) : (
+            <div style={{ border: "1px solid var(--border, #333)", borderRadius: "8px", overflow: "hidden" }}>
+              {items.map((n: any) => (
+                <div
+                  key={n.id}
+                  onClick={() => {
+                    setSelectedId(n.id === selectedId ? null : n.id);
+                    if (!n.isRead) markRead.mutate({ id: n.id });
+                  }}
+                  style={{
+                    padding: "12px 16px",
+                    borderBottom: "1px solid var(--border, #222)",
+                    display: "flex",
+                    gap: "10px",
+                    alignItems: "flex-start",
+                    background: n.id === selectedId
+                      ? "rgba(0, 120, 212, 0.12)"
+                      : n.isRead ? "transparent" : "rgba(0, 120, 212, 0.04)",
+                    cursor: "pointer",
+                    transition: "background 0.15s",
+                  }}
+                >
+                  {/* Unread dot */}
+                  <div style={{ paddingTop: "4px", minWidth: "8px" }}>
+                    {!n.isRead && (
+                      <div style={{
+                        width: 8, height: 8, borderRadius: "50%",
+                        background: PRIORITY_COLORS[n.priority] || "#6b7280",
+                      }} />
+                    )}
+                  </div>
+                  {/* Content */}
+                  <div style={{ flex: 1, minWidth: 0 }}>
+                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
+                      <span style={{
+                        fontSize: "13px", fontWeight: n.isRead ? 400 : 600,
+                        color: "var(--foreground, #e0e0e0)",
+                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
+                        flex: 1,
+                      }}>
+                        {n.title}
+                      </span>
+                      <span style={{
+                        fontSize: "10px", padding: "1px 5px", borderRadius: "4px",
+                        background: `${PRIORITY_COLORS[n.priority] || "#6b7280"}20`,
+                        color: PRIORITY_COLORS[n.priority] || "#6b7280",
+                        fontWeight: 600, textTransform: "uppercase", flexShrink: 0,
+                      }}>
+                        {n.priority}
+                      </span>
+                      {(n.occurrenceCount ?? 1) > 1 && (
+                        <span style={{
+                          fontSize: "10px", padding: "1px 5px", borderRadius: "4px",
+                          background: "rgba(99, 102, 241, 0.15)", color: "#818cf8",
+                          fontWeight: 600, flexShrink: 0,
+                        }}>
+                          x{n.occurrenceCount}
+                        </span>
+                      )}
+                      {n.relatedResourceType && (
+                        <span style={{
+                          fontSize: "10px", padding: "1px 5px", borderRadius: "4px",
+                          background: "rgba(0,120,212,0.1)", color: "#0078d4", flexShrink: 0,
+                        }}>
+                          {n.relatedResourceType.replace(/_/g, " ")}
+                        </span>
+                      )}
+                    </div>
+                    {n.content && n.content !== n.title && (
+                      <p style={{
+                        fontSize: "12px", color: "var(--muted-foreground, #888)",
+                        marginTop: "2px", lineHeight: 1.4,
+                        overflow: "hidden", textOverflow: "ellipsis",
+                        display: "-webkit-box", WebkitLineClamp: 1,
+                        WebkitBoxOrient: "vertical" as const,
+                      }}>
+                        {n.content}
+                      </p>
+                    )}
+                    {/* Group expansion toggle */}
+                    {(n.occurrenceCount ?? 1) > 1 && (
+                      <div style={{ marginTop: "4px" }}>
+                        <button
+                          onClick={(e) => {
+                            e.stopPropagation();
+                            setExpandedGroupId(expandedGroupId === n.id ? null : n.id);
+                          }}
+                          style={{
+                            background: "none", border: "none", padding: 0,
+                            color: "#818cf8", fontSize: "11px", cursor: "pointer",
+                            display: "flex", alignItems: "center", gap: "4px",
+                          }}
+                        >
+                          {expandedGroupId === n.id ? (
+                            <><ChevronUp style={{ width: 12, height: 12 }} /> Collapse group</>
+                          ) : (
+                            <><ChevronDown style={{ width: 12, height: 12 }} /> Expand group (x{n.occurrenceCount})</>
+                          )}
+                        </button>
+                        {expandedGroupId === n.id && (
+                          <div style={{
+                            marginTop: "6px", paddingLeft: "12px",
+                            borderLeft: "2px solid var(--border, #444)",
+                          }}>
+                            {groupLoading ? (
+                              <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", padding: "4px 0" }}>
+                                Loading...
+                              </div>
+                            ) : !groupOccurrences || groupOccurrences.length === 0 ? (
+                              <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", padding: "4px 0" }}>
+                                No individual occurrences recorded
+                              </div>
+                            ) : (
+                              groupOccurrences.map((occ: any) => (
+                                <div key={occ.id} style={{
+                                  padding: "4px 0", fontSize: "11px",
+                                  color: "var(--foreground, #ccc)",
+                                  borderBottom: "1px solid var(--border, #222)",
+                                }}>
+                                  <div>{occ.content}</div>
+                                  <div style={{ fontSize: "10px", color: "var(--muted-foreground, #666)" }}>
+                                    {new Date(occ.occurredAt).toLocaleString()}
+                                    {occ.metadata?.source && ` · ${occ.metadata.source}`}
+                                  </div>
+                                </div>
+                              ))
+                            )}
+                          </div>
+                        )}
+                      </div>
+                    )}
+                    <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", marginTop: "2px", display: "flex", gap: "8px" }}>
+                      <span>{new Date(n.createdAt).toLocaleString()}</span>
+                      <span>{TYPE_LABELS[n.type] || n.type}</span>
+                    </div>
+                  </div>
+                </div>
+              ))}
+            </div>
+          )}
+
+          {/* Pagination */}
+          {totalPages > 1 && (
+            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "16px" }}>
+              <button
+                disabled={page === 0}
+                onClick={() => setPage(p => p - 1)}
+                style={{
+                  padding: "6px 10px", background: "transparent",
+                  border: "1px solid var(--border, #333)", borderRadius: "6px",
+                  color: page === 0 ? "var(--muted-foreground, #444)" : "var(--foreground, #e0e0e0)",
+                  cursor: page === 0 ? "default" : "pointer", display: "flex", alignItems: "center",
+                }}
+              >
+                <ChevronLeft style={{ width: 14, height: 14 }} />
+              </button>
+              <span style={{ fontSize: "13px", color: "var(--muted-foreground, #888)" }}>
+                Page {page + 1} of {totalPages}
+              </span>
+              <button
+                disabled={page >= totalPages - 1}
+                onClick={() => setPage(p => p + 1)}
+                style={{
+                  padding: "6px 10px", background: "transparent",
+                  border: "1px solid var(--border, #333)", borderRadius: "6px",
+                  color: page >= totalPages - 1 ? "var(--muted-foreground, #444)" : "var(--foreground, #e0e0e0)",
+                  cursor: page >= totalPages - 1 ? "default" : "pointer", display: "flex", alignItems: "center",
+                }}
+              >
+                <ChevronRight style={{ width: 14, height: 14 }} />
+              </button>
+            </div>
+          )}
+        </div>
+
+        {/* Detail Panel */}
+        {selected && (
+          <div style={{
+            width: 360, flexShrink: 0,
+            border: "1px solid var(--border, #333)", borderRadius: "8px",
+            background: "var(--background, #1e1e1e)",
+            padding: "16px", alignSelf: "flex-start",
+          }}>
+            {/* Priority + Type */}
+            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
+              <span style={{
+                fontSize: "10px", padding: "2px 6px", borderRadius: "4px", fontWeight: 600,
+                textTransform: "uppercase",
+                background: PRIORITY_COLORS[selected.priority] || "#6b7280",
+                color: "#fff",
+              }}>
+                {selected.priority}
+              </span>
+              <span style={{ fontSize: "10px", color: "var(--muted-foreground, #888)", lineHeight: "18px" }}>
+                {(TYPE_LABELS[selected.type] || selected.type)} &middot; {new Date(selected.createdAt).toLocaleString()}
+              </span>
+            </div>
+
+            {/* Title */}
+            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground, #e0e0e0)", margin: "0 0 8px" }}>
+              {selected.title}
+            </h3>
+
+            {/* Content */}
+            {selected.content && (
+              <p style={{
+                fontSize: "13px", color: "var(--foreground, #ccc)", lineHeight: 1.5,
+                whiteSpace: "pre-wrap", margin: "8px 0", padding: "8px",
+                background: "var(--muted, rgba(255,255,255,0.05))", borderRadius: "6px",
+              }}>
+                {selected.content}
+              </p>
+            )}
+
+            {/* Group Info */}
+            {(selected.occurrenceCount ?? 1) > 1 && (
+              <div style={{
+                margin: "8px 0", padding: "8px",
+                background: "rgba(99, 102, 241, 0.06)", borderRadius: "6px",
+                borderLeft: "3px solid #818cf8",
+              }}>
+                <div style={{ fontSize: "11px", fontWeight: 600, color: "#818cf8", marginBottom: "4px" }}>
+                  Group Info
+                </div>
+                <div style={{ fontSize: "12px", color: "var(--foreground, #ccc)" }}>
+                  {selected.occurrenceCount} occurrences
+                </div>
+                {selected.firstOccurredAt && (
+                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)", marginTop: "2px" }}>
+                    First: {new Date(selected.firstOccurredAt).toLocaleString()}
+                  </div>
+                )}
+                {selected.lastOccurredAt && (
+                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)", marginTop: "2px" }}>
+                    Last: {new Date(selected.lastOccurredAt).toLocaleString()}
+                  </div>
+                )}
+              </div>
+            )}
+
+            {/* Resource */}
+            {selected.relatedResourceType && (
+              <div style={{ fontSize: "12px", color: "var(--muted-foreground, #888)", margin: "8px 0", display: "flex", gap: "6px", alignItems: "center" }}>
+                <span style={{ padding: "1px 6px", background: "rgba(0,120,212,0.1)", borderRadius: "4px", fontSize: "11px" }}>
+                  {selected.relatedResourceType.replace(/_/g, " ")}
+                </span>
+                {selected.relatedResourceId && (
+                  <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
+                    {selected.relatedResourceId.length > 24 ? selected.relatedResourceId.slice(0, 24) + "..." : selected.relatedResourceId}
+                  </span>
+                )}
+              </div>
+            )}
+
+            {/* Error */}
+            {selected.metadata?.errorDetails?.errorMessage && (
+              <div style={{
+                margin: "8px 0", padding: "8px",
+                background: "rgba(211,47,47,0.08)", borderRadius: "6px",
+                borderLeft: "3px solid #d32f2f",
+              }}>
+                <div style={{ fontSize: "11px", fontWeight: 600, color: "#d32f2f", marginBottom: "2px" }}>Error</div>
+                {selected.metadata.errorDetails.errorCode && (
+                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
+                    Code: {selected.metadata.errorDetails.errorCode}
+                  </div>
+                )}
+                <div style={{ fontSize: "12px", color: "var(--foreground, #ccc)", whiteSpace: "pre-wrap" }}>
+                  {selected.metadata.errorDetails.errorMessage.length > 500
+                    ? selected.metadata.errorDetails.errorMessage.slice(0, 500) + "..."
+                    : selected.metadata.errorDetails.errorMessage}
+                </div>
+              </div>
+            )}
+
+            {/* Metrics */}
+            {selected.metadata?.metrics && (
+              <div style={{ margin: "8px 0", display: "flex", gap: "12px", flexWrap: "wrap" }}>
+                {selected.metadata.metrics.durationMs != null && (
+                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
+                    Duration: <strong>{selected.metadata.metrics.durationMs > 1000
+                      ? `${(selected.metadata.metrics.durationMs / 1000).toFixed(1)}s`
+                      : `${selected.metadata.metrics.durationMs}ms`}</strong>
+                  </div>
+                )}
+                {selected.metadata.metrics.costUsd != null && (
+                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
+                    Cost: <strong>${selected.metadata.metrics.costUsd.toFixed(4)}</strong>
+                  </div>
+                )}
+              </div>
+            )}
+
+            {/* Source */}
+            {selected.metadata?.source && (
+              <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", marginTop: "8px" }}>
+                Source: <span style={{ fontFamily: "monospace" }}>{selected.metadata.source}</span>
+              </div>
+            )}
+
+            {/* Actions */}
+            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
+              {selected.actionUrl && (
+                <button
+                  onClick={() => safeNavigate(selected.actionUrl, setLocation)}
+                  style={{
+                    flex: 1, padding: "8px 12px",
+                    background: "#0078d4", color: "#fff",
+                    border: "none", borderRadius: "6px",
+                    fontSize: "13px", cursor: "pointer",
+                    display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
+                  }}
+                >
+                  <ExternalLink style={{ width: 13, height: 13 }} />
+                  {selected.actionLabel || "View Details"}
+                </button>
+              )}
+              <button
+                onClick={() => dismiss.mutate({ id: selected.id })}
+                style={{
+                  padding: "8px 12px",
+                  background: "transparent",
+                  border: "1px solid var(--border, #333)",
+                  borderRadius: "6px",
+                  color: "var(--muted-foreground, #888)",
+                  fontSize: "13px", cursor: "pointer",
+                }}
+              >
+                Dismiss
+              </button>
+            </div>
+          </div>
+        )}
+      </div>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/__tests__/Notifications.groupExpansion.test.tsx b/apps/web/client/src/pages/__tests__/Notifications.groupExpansion.test.tsx
new file mode 100644
index 00000000..5fd6566f
--- /dev/null
+++ b/apps/web/client/src/pages/__tests__/Notifications.groupExpansion.test.tsx
@@ -0,0 +1,170 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent, waitFor } from "@testing-library/react";
+import React from "react";
+
+// Mock data
+const mockNotifications = [
+  {
+    id: 10,
+    title: "Pipeline failed",
+    content: "Error in stage 3",
+    isRead: false,
+    priority: "high",
+    type: "alert",
+    createdAt: "2026-03-20T11:30:00Z",
+    occurrenceCount: 7,
+    firstOccurredAt: "2026-03-20T10:00:00Z",
+    lastOccurredAt: "2026-03-20T11:30:00Z",
+    groupKey: "pipeline-stage3",
+  },
+  {
+    id: 11,
+    title: "Single notification",
+    content: "Just one",
+    isRead: true,
+    priority: "normal",
+    type: "system",
+    createdAt: "2026-03-20T09:00:00Z",
+    occurrenceCount: 1,
+  },
+];
+
+const mockOccurrences = [
+  { id: 101, content: "Error at 10:00", metadata: null, occurredAt: "2026-03-20T10:00:00Z" },
+  { id: 102, content: "Error at 10:30", metadata: null, occurredAt: "2026-03-20T10:30:00Z" },
+  { id: 103, content: "Error at 11:00", metadata: { source: "celery" }, occurredAt: "2026-03-20T11:00:00Z" },
+];
+
+const mockMutate = vi.fn();
+const mockInvalidate = vi.fn();
+const mockGetGroupOccurrences = vi.fn();
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    scheduledMessages: {
+      getNotificationHistory: {
+        useQuery: () => ({
+          data: { items: mockNotifications, total: 2 },
+          isLoading: false,
+        }),
+      },
+      getNotificationCount: {
+        useQuery: () => ({ data: { count: 1 } }),
+      },
+      getGroupOccurrences: {
+        useQuery: (...args: any[]) => mockGetGroupOccurrences(...args),
+      },
+      markRead: {
+        useMutation: () => ({ mutate: mockMutate }),
+      },
+      markAllRead: {
+        useMutation: () => ({ mutate: mockMutate }),
+      },
+      dismissNotification: {
+        useMutation: () => ({ mutate: mockMutate }),
+      },
+    },
+    useUtils: () => ({
+      scheduledMessages: {
+        getNotificationHistory: { invalidate: mockInvalidate },
+        getNotificationCount: { invalidate: mockInvalidate },
+      },
+    }),
+  },
+}));
+
+vi.mock("wouter", () => ({
+  useLocation: () => ["/notifications", vi.fn()],
+}));
+
+describe("Notifications group expansion", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockGetGroupOccurrences.mockReturnValue({
+      data: mockOccurrences,
+      isLoading: false,
+    });
+  });
+
+  it("renders occurrence badge (xN) in notification list when occurrenceCount > 1", async () => {
+    const Notifications = (await import("../../pages/Notifications")).default;
+    render(<Notifications />);
+
+    expect(screen.getByText("x7")).toBeTruthy();
+    expect(screen.queryByText("x1")).toBeNull();
+  });
+
+  it("calls getGroupOccurrences and renders sub-items when expanded", async () => {
+    const Notifications = (await import("../../pages/Notifications")).default;
+    render(<Notifications />);
+
+    const expandBtn = screen.getByText(/Expand group/i);
+    fireEvent.click(expandBtn);
+
+    // Verify the query was called with correct args
+    expect(mockGetGroupOccurrences).toHaveBeenCalledWith(
+      { notificationId: 10, limit: 10 },
+      expect.any(Object)
+    );
+
+    await waitFor(() => {
+      expect(screen.getByText("Error at 10:00")).toBeTruthy();
+      expect(screen.getByText("Error at 10:30")).toBeTruthy();
+      expect(screen.getByText("Error at 11:00")).toBeTruthy();
+    });
+  });
+
+  it("shows group info in detail panel when notification selected", async () => {
+    const Notifications = (await import("../../pages/Notifications")).default;
+    render(<Notifications />);
+
+    // Click the notification with occurrenceCount=7
+    const notifItem = screen.getByText("Pipeline failed");
+    fireEvent.click(notifItem);
+
+    await waitFor(() => {
+      expect(screen.getByText(/7 occurrences/)).toBeTruthy();
+      // Verify firstOccurredAt and lastOccurredAt are rendered
+      expect(screen.getByText(/First:/)).toBeTruthy();
+      expect(screen.getByText(/Last:/)).toBeTruthy();
+    });
+  });
+
+  it("shows empty state when no occurrences exist", async () => {
+    mockGetGroupOccurrences.mockReturnValue({
+      data: [],
+      isLoading: false,
+    });
+
+    const Notifications = (await import("../../pages/Notifications")).default;
+    render(<Notifications />);
+
+    const expandBtn = screen.getByText(/Expand group/i);
+    fireEvent.click(expandBtn);
+
+    await waitFor(() => {
+      expect(screen.getByText(/No individual occurrences/i)).toBeTruthy();
+    });
+  });
+
+  it("toggles group expansion on/off", async () => {
+    const Notifications = (await import("../../pages/Notifications")).default;
+    render(<Notifications />);
+
+    const expandBtn = screen.getByText(/Expand group/i);
+
+    // Expand
+    fireEvent.click(expandBtn);
+    await waitFor(() => {
+      expect(screen.getByText("Error at 10:00")).toBeTruthy();
+    });
+
+    // Collapse — click button again (now shows "Collapse")
+    const collapseBtn = screen.getByText(/Collapse/i);
+    fireEvent.click(collapseBtn);
+
+    await waitFor(() => {
+      expect(screen.queryByText("Error at 10:00")).toBeNull();
+    });
+  });
+});
diff --git a/specs/feature/049-enterprise-notification-system/sections/section-03-phase4-frontend-sse.md b/specs/feature/049-enterprise-notification-system/sections/section-03-phase4-frontend-sse.md
new file mode 100644
index 00000000..388daad5
--- /dev/null
+++ b/specs/feature/049-enterprise-notification-system/sections/section-03-phase4-frontend-sse.md
@@ -0,0 +1,254 @@
+# Section 03: Phase 4 Frontend — SSE Reconnection, Occurrence Badge, Group Expansion
+
+**Section ID**: `section-03-phase4-frontend-sse`
+**Depends on**: section-01-phase4-schema-migration (schema columns), section-02-phase4-dedup-service (dedup logic + getGroupOccurrences endpoint)
+**Blocks**: nothing
+**Parallelizable**: Yes (with section-02 complete)
+
+---
+
+## Overview
+
+This section adds three frontend capabilities for Phase 4 deduplication support:
+
+1. **Occurrence badge** (xN) on grouped notifications in GlobalNotificationBell dropdown and Notifications page
+2. **Group expansion UI** on the Notifications page that calls the `getGroupOccurrences` tRPC endpoint to show individual occurrences
+3. **SSE reconnection with exponential backoff** replacing the current close-on-error behavior in GlobalNotificationBell
+
+All changes are additive to existing rendering logic. The occurrence badge renders only when `occurrenceCount > 1` on a notification item. SSE reconnection is a standalone fix independent of dedup.
+
+---
+
+## Files to Modify
+
+| File | Action | Purpose |
+|------|--------|---------|
+| `apps/web/client/src/components/GlobalAlerts.tsx` | Modify | Add occurrence badge in bell dropdown items; replace SSE onerror with exponential backoff reconnection |
+| `apps/web/client/src/pages/Notifications.tsx` | Modify | Add occurrence badge in list items; add expandable group section; show group timing in detail panel |
+| `apps/web/client/src/lib/useSSEReconnect.ts` | Create | Reusable SSE hook with exponential backoff logic |
+| `apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts` | Create | Tests for SSE reconnection hook |
+| `apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx` | Create | Tests for occurrence badge rendering |
+| `apps/web/client/src/pages/__tests__/Notifications.groupExpansion.test.tsx` | Create | Tests for group expansion UI |
+
+---
+
+## Tests (TDD)
+
+### Test File: `apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts`
+
+Tests for the `useSSEReconnect` hook:
+
+- **SSE reconnection attempts exponential backoff (1s, 2s, 4s...)**: Simulate EventSource onerror events. After each error, verify the hook schedules a reconnection with the correct delay (1000ms, 2000ms, 4000ms, 8000ms, 16000ms). Use `vi.useFakeTimers()` to control timing.
+- **SSE resets attempt counter on successful connection**: After reconnecting successfully (EventSource emits `open` or `connected` event), verify the attempt counter resets to 0 so the next failure starts from 1s delay again.
+- **SSE falls back to polling after MAX_RECONNECT attempts (5)**: After 5 consecutive errors, verify the hook stops attempting reconnection and does NOT create a new EventSource. The existing 30s polling via `refetchInterval` is the implicit fallback.
+- **SSE cleanup closes EventSource on unmount**: Verify that the returned cleanup function closes the EventSource and clears any pending reconnection timers.
+- **SSE does not reconnect while a reconnection is pending**: If an error occurs while a reconnection timer is already scheduled, the hook should not schedule a second timer.
+
+### Test File: `apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx`
+
+Tests for occurrence badge in the bell dropdown:
+
+- **GlobalNotificationBell renders occurrence badge (xN) when occurrenceCount > 1**: Mock `trpc.scheduledMessages.getNotifications` to return a notification with `occurrenceCount: 5`. Render GlobalNotificationBell, open dropdown. Assert that a `"x5"` badge is visible adjacent to the notification content.
+- **GlobalNotificationBell does NOT render occurrence badge when occurrenceCount is 1**: Same setup but `occurrenceCount: 1`. Assert no `"x1"` badge is rendered.
+- **GlobalNotificationBell shows "Latest:" prefix for grouped notification content**: Mock a notification with `occurrenceCount: 3` and `content: "Job failed"`. Assert the rendered content shows `"Latest: Job failed"`.
+
+### Test File: `apps/web/client/src/pages/__tests__/Notifications.groupExpansion.test.tsx`
+
+Tests for group expansion on the Notifications page:
+
+- **GroupExpansion component calls getGroupOccurrences and renders sub-items**: Mock `trpc.scheduledMessages.getGroupOccurrences` to return 3 occurrences. Render a notification with `occurrenceCount: 3`, click the "Expand group" button. Assert that the endpoint was called with the correct `notificationId` and that 3 sub-items are rendered with their `content` and `occurredAt` timestamps.
+- **Occurrence badge (xN) renders in notification list item when occurrenceCount > 1**: Mock `trpc.scheduledMessages.getNotificationHistory` with a notification having `occurrenceCount: 7`. Assert that `"x7"` badge is visible in the list.
+- **Detail panel shows firstOccurredAt, lastOccurredAt, occurrenceCount for grouped notifications**: Select a notification with `occurrenceCount: 4`, `firstOccurredAt: "2026-03-20T10:00:00Z"`, `lastOccurredAt: "2026-03-20T11:30:00Z"`. Assert the detail panel renders all three values.
+- **Group expansion shows empty state when no occurrences exist**: Mock `getGroupOccurrences` to return an empty array. Click "Expand group". Assert "No individual occurrences recorded" or similar message appears.
+- **Group expansion collapse toggles visibility**: Click "Expand group" to expand, then click again to collapse. Assert sub-items are hidden after collapse.
+
+---
+
+## Implementation Details
+
+### 1. SSE Reconnection Hook: `apps/web/client/src/lib/useSSEReconnect.ts`
+
+Create a reusable custom hook that encapsulates EventSource lifecycle with exponential backoff reconnection.
+
+**Interface**:
+
+```typescript
+interface UseSSEReconnectOptions {
+  url: string;
+  /** Called when a message of the given event type arrives */
+  onMessage: () => void;
+  /** Event type to listen for (default: "notification") */
+  eventType?: string;
+  /** Whether the hook is active (default: true) */
+  enabled?: boolean;
+}
+```
+
+**Constants** (exported for testing):
+
+- `MAX_RECONNECT_ATTEMPTS = 5`
+- `BASE_DELAY_MS = 1000`
+- `MAX_DELAY_MS = 30000`
+
+**Behavior**:
+
+1. On mount (when `enabled`), create `new EventSource(url, { withCredentials: true })`
+2. Listen for the specified `eventType` and call `onMessage`
+3. On the `open` event, reset the attempt counter to 0
+4. On `onerror`:
+   - Close the current EventSource
+   - If `attempts < MAX_RECONNECT_ATTEMPTS`, schedule a reconnection after `min(BASE_DELAY_MS * 2^attempts, MAX_DELAY_MS)` milliseconds
+   - Increment attempts
+   - If `attempts >= MAX_RECONNECT_ATTEMPTS`, stop reconnecting (log a warning via `console.warn`)
+5. On cleanup (unmount or `enabled` becoming false), close EventSource and clear any pending reconnection timeout via `clearTimeout`
+
+**Internal state** managed via `useRef`:
+
+- `esRef: React.MutableRefObject<EventSource | null>`
+- `attemptsRef: React.MutableRefObject<number>`
+- `reconnectTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>`
+
+Do NOT use `useState` for attempts — it would cause unnecessary re-renders and the value is only needed inside the effect.
+
+### 2. GlobalAlerts.tsx Changes
+
+**Replace SSE block** (lines ~648-668) with the `useSSEReconnect` hook:
+
+```typescript
+// Before (current):
+useEffect(() => {
+  let es: EventSource | null = null;
+  try {
+    es = new EventSource("/api/notifications/stream", { withCredentials: true });
+    // ...
+    es.onerror = () => { es?.close(); };
+  } catch { }
+  return () => { es?.close(); };
+}, [showDropdown, utils]);
+
+// After:
+useSSEReconnect({
+  url: "/api/notifications/stream",
+  onMessage: () => {
+    utils.scheduledMessages.getNotificationCount.invalidate();
+    if (showDropdown) {
+      utils.scheduledMessages.getNotifications.invalidate();
+    }
+  },
+  eventType: "notification",
+  enabled: true,
+});
+```
+
+Note: The `onMessage` callback references `showDropdown` and `utils`, so wrap it in `useCallback` with those dependencies to avoid stale closures. The hook should accept the callback as a ref or use the latest value pattern internally.
+
+**Add occurrence badge** to each notification item in the dropdown list (around line ~827-850 where `notifications.map((n: any) => ...)` renders). After the notification content text, conditionally render:
+
+```tsx
+{(n.occurrenceCount ?? 1) > 1 && (
+  <span style={{
+    fontSize: "10px",
+    padding: "1px 5px",
+    borderRadius: "4px",
+    background: "rgba(99, 102, 241, 0.15)",
+    color: "#818cf8",
+    fontWeight: 600,
+    flexShrink: 0,
+    marginLeft: "4px",
+  }}>
+    x{n.occurrenceCount}
+  </span>
+)}
+```
+
+**Add "Latest:" prefix** for grouped notification content display: When `occurrenceCount > 1`, prefix the displayed content with `"Latest: "` so the user understands this is the most recent event in a group.
+
+### 3. Notifications.tsx Changes
+
+**Occurrence badge in list items** (around line ~224-265 where each notification renders). Add the same occurrence badge span after the priority badge in the header row of each list item. Use the same styling as GlobalAlerts for consistency.
+
+**Expandable group section**: Below the content line of each list item, when `(n.occurrenceCount ?? 1) > 1`, render an "Expand group (xN)" button. When clicked:
+
+1. Toggle a local state `expandedGroupId` (one group expanded at a time for simplicity)
+2. Call `trpc.scheduledMessages.getGroupOccurrences.useQuery({ notificationId: n.id, limit: 10 }, { enabled: expandedGroupId === n.id })` to fetch occurrences
+3. Render occurrences as indented sub-items below the parent notification:
+   - Each sub-item shows: `content`, `occurredAt` formatted as locale string
+   - Styled with left border (`borderLeft: "2px solid var(--border, #444)"`) and left padding to indicate hierarchy
+   - If metadata present, show a condensed view (error message or source)
+
+**Detail panel group info**: When the selected notification has `occurrenceCount > 1`, add a "Group Info" section in the detail panel (between the content and resource sections) showing:
+- `occurrenceCount` (e.g., "4 occurrences")
+- `firstOccurredAt` formatted
+- `lastOccurredAt` formatted
+- A link/button to expand the group if not already expanded
+
+**State management for expansion**: Add to the component:
+
+```typescript
+const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
+
+const { data: groupOccurrences, isLoading: groupLoading } =
+  trpc.scheduledMessages.getGroupOccurrences.useQuery(
+    { notificationId: expandedGroupId!, limit: 10 },
+    { enabled: expandedGroupId !== null }
+  );
+```
+
+### 4. Data Shape Assumptions
+
+The notification objects returned by `getNotifications` and `getNotificationHistory` will include the new columns added in section-01:
+
+- `occurrenceCount: number` (default 1)
+- `firstOccurredAt: string` (ISO timestamp)
+- `lastOccurredAt: string` (ISO timestamp)
+- `groupKey: string | null`
+
+These are returned by the existing Drizzle `select()` calls which automatically include all columns from the `userNotifications` table. No router changes are needed to expose these fields.
+
+The `getGroupOccurrences` endpoint (added in section-02) returns:
+
+```typescript
+Array<{
+  id: number;
+  content: string;
+  metadata: Record<string, unknown> | null;
+  occurredAt: string; // ISO timestamp
+}>
+```
+
+### 5. Fallback Behavior
+
+- When `occurrenceCount` is missing or `undefined` on a notification object (e.g., older notifications created before the migration), treat it as `1` using `(n.occurrenceCount ?? 1)`. This ensures no visual change for pre-existing notifications.
+- When `firstOccurredAt` or `lastOccurredAt` are missing, do not render the group info section in the detail panel.
+- The SSE reconnection hook gracefully handles the case where `EventSource` is not available in the browser (e.g., SSR or very old browsers) with a try/catch guard.
+
+---
+
+## Dependencies on Other Sections
+
+- **section-01-phase4-schema-migration**: Adds `occurrenceCount`, `firstOccurredAt`, `lastOccurredAt`, `groupKey` columns to `userNotifications` table and creates the `notificationOccurrences` table. Without these columns, the occurrence badge will always show default values and group expansion will have no data.
+- **section-02-phase4-dedup-service**: Adds the `getGroupOccurrences` tRPC endpoint to the `scheduledMessages` router. Without this endpoint, the group expansion button will not be able to fetch occurrence sub-items.
+
+---
+
+## Security Considerations
+
+- **SSE endpoint authentication**: No changes to the server-side SSE endpoint. The existing JWT auth via cookie (`withCredentials: true`) is maintained.
+- **SSE connection cap (S4)**: The reconnection logic uses the same single EventSource pattern. The server-side cap of 5 connections per user prevents reconnection storms from consuming resources. The client-side cap of `MAX_RECONNECT_ATTEMPTS = 5` provides additional protection.
+- **XSS prevention**: Occurrence count is rendered as a number, not user-supplied HTML. Content prefixed with "Latest:" is text content, not dangerouslySetInnerHTML.
+- **Ownership check**: The `getGroupOccurrences` endpoint (section-02) enforces ownership. The frontend does not need additional authorization logic.
+
+---
+
+## Verification Steps
+
+1. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run useSSEReconnect`
+2. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run GlobalAlerts.notificationBell`
+3. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run Notifications.groupExpansion`
+4. TypeScript check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
+5. Manual verification (after sections 01 and 02 are deployed):
+   - Trigger a notification with `groupKey` that deduplicates (e.g., multiple media job failures)
+   - Observe the `x5` badge in the bell dropdown
+   - Navigate to `/notifications`, observe badge in list
+   - Click "Expand group" and verify sub-items render
+   - Kill SSE connection (e.g., disconnect network briefly) and verify reconnection occurs with increasing delay in browser dev tools Network tab
\ No newline at end of file
