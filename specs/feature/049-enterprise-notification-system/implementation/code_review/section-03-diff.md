diff --git a/apps/web/client/src/components/GlobalAlerts.tsx b/apps/web/client/src/components/GlobalAlerts.tsx
index 026d8e42..61fa0ce6 100644
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
+                              setLocation((n as any).actionUrl);
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
diff --git a/apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts b/apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts
new file mode 100644
index 00000000..cecd1a20
--- /dev/null
+++ b/apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts
@@ -0,0 +1,244 @@
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
+    // First error → schedules reconnect
+    act(() => latestES()._triggerError());
+    const countAfterFirst = MockEventSource.instances.length;
+
+    // Advance timer to reconnect
+    act(() => vi.advanceTimersByTime(BASE_DELAY_MS));
+    expect(MockEventSource.instances).toHaveLength(countAfterFirst + 1);
+
+    // Second error → schedules reconnect
+    act(() => latestES()._triggerError());
+
+    // Before timer fires, somehow another error happens (shouldn't double-schedule)
+    // This is tested by verifying only one reconnect happens
+    act(() => vi.advanceTimersByTime(BASE_DELAY_MS * 2));
+    expect(MockEventSource.instances).toHaveLength(countAfterFirst + 2);
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
index 00000000..53ccad38
--- /dev/null
+++ b/apps/web/client/src/pages/Notifications.tsx
@@ -0,0 +1,533 @@
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
+                  {selected.metadata.errorDetails.errorMessage}
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
index 00000000..ca76292c
--- /dev/null
+++ b/apps/web/client/src/pages/__tests__/Notifications.groupExpansion.test.tsx
@@ -0,0 +1,161 @@
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
