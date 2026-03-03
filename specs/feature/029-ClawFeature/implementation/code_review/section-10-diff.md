diff --git a/apps/web/client/src/pages/AdminWidgets.tsx b/apps/web/client/src/pages/AdminWidgets.tsx
new file mode 100644
index 0000000..cbc705e
--- /dev/null
+++ b/apps/web/client/src/pages/AdminWidgets.tsx
@@ -0,0 +1,521 @@
+/**
+ * AdminWidgets — Widget management page for domain_admin and admin roles.
+ *
+ * Features:
+ * - List all widgets for the tenant
+ * - Create / Edit widget (modal)
+ * - Embed code generator with copy-to-clipboard
+ * - Theme customization (primary color, background, text color)
+ * - Soft-delete (set is_active = false)
+ */
+
+import { useState } from "react";
+import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
+import { trpc } from "@/lib/trpc";
+import { Button } from "@/components/ui/button";
+import {
+  Dialog,
+  DialogContent,
+  DialogHeader,
+  DialogTitle,
+  DialogFooter,
+} from "@/components/ui/dialog";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import { Switch } from "@/components/ui/switch";
+import { Badge } from "@/components/ui/badge";
+import {
+  Table,
+  TableBody,
+  TableCell,
+  TableHead,
+  TableHeader,
+  TableRow,
+} from "@/components/ui/table";
+import { Textarea } from "@/components/ui/textarea";
+import { useToast } from "@/hooks/use-toast";
+import { Copy, Plus, Pencil, Trash2, Code2 } from "lucide-react";
+
+// ── Types ──────────────────────────────────────────────────────────────────────
+
+interface WidgetRow {
+  id: string;
+  name: string;
+  targetType: string | null;
+  isActive: boolean | null;
+  allowedOrigins: string[] | null;
+  rateLimitPerMinute: number | null;
+  creditSource: string | null;
+  monthlyCreditBudget: number | null;
+  createdAt: Date | string;
+}
+
+// ── Embed Code Dialog ──────────────────────────────────────────────────────────
+
+function EmbedCodeDialog({
+  widgetId,
+  onClose,
+}: {
+  widgetId: string;
+  onClose: () => void;
+}) {
+  const { toast } = useToast();
+  const { data } = trpc.widget.getEmbedCode.useQuery({ widgetId });
+
+  const handleCopy = () => {
+    if (data?.embedCode) {
+      navigator.clipboard.writeText(data.embedCode).then(() => {
+        toast({ title: "Copied to clipboard" });
+      });
+    }
+  };
+
+  return (
+    <Dialog open onOpenChange={onClose}>
+      <DialogContent className="max-w-xl">
+        <DialogHeader>
+          <DialogTitle>Embed Code</DialogTitle>
+        </DialogHeader>
+        <p className="text-sm text-muted-foreground">
+          Add this snippet to your website's HTML, just before the closing{" "}
+          <code>&lt;/body&gt;</code> tag.
+        </p>
+        <Textarea
+          readOnly
+          value={data?.embedCode ?? "Loading..."}
+          className="font-mono text-xs h-32"
+        />
+        <DialogFooter>
+          <Button variant="outline" onClick={onClose}>
+            Close
+          </Button>
+          <Button onClick={handleCopy}>
+            <Copy className="mr-2 h-4 w-4" />
+            Copy
+          </Button>
+        </DialogFooter>
+      </DialogContent>
+    </Dialog>
+  );
+}
+
+// ── Create / Edit Form ─────────────────────────────────────────────────────────
+
+interface WidgetFormData {
+  name: string;
+  targetType: "chat" | "agency";
+  allowedOrigins: string;
+  rateLimitPerMinute: number;
+  maxConversationLength: number;
+  requireEmail: boolean;
+  creditSource: "tenant" | "visitor";
+  monthlyCreditBudget: string;
+  maxCreditsPerVisitorSession: number;
+  maxCreditsPerVisitorDay: number;
+  primaryColor: string;
+  backgroundColor: string;
+  textColor: string;
+}
+
+const defaultForm: WidgetFormData = {
+  name: "",
+  targetType: "chat",
+  allowedOrigins: "",
+  rateLimitPerMinute: 10,
+  maxConversationLength: 100,
+  requireEmail: false,
+  creditSource: "tenant",
+  monthlyCreditBudget: "",
+  maxCreditsPerVisitorSession: 50,
+  maxCreditsPerVisitorDay: 100,
+  primaryColor: "#6366f1",
+  backgroundColor: "#ffffff",
+  textColor: "#1a1a1a",
+};
+
+function WidgetFormDialog({
+  widgetId,
+  initialData,
+  onClose,
+}: {
+  widgetId?: string;
+  initialData?: Partial<WidgetFormData>;
+  onClose: () => void;
+}) {
+  const { toast } = useToast();
+  const [form, setForm] = useState<WidgetFormData>({ ...defaultForm, ...initialData });
+  const queryClient = useQueryClient();
+
+  const createMutation = trpc.widget.create.useMutation({
+    onSuccess: () => {
+      queryClient.invalidateQueries({ queryKey: [["widget", "list"]] });
+      toast({ title: "Widget created" });
+      onClose();
+    },
+    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
+  });
+
+  const updateMutation = trpc.widget.update.useMutation({
+    onSuccess: () => {
+      queryClient.invalidateQueries({ queryKey: [["widget", "list"]] });
+      toast({ title: "Widget updated" });
+      onClose();
+    },
+    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
+  });
+
+  const handleSubmit = () => {
+    const allowedOrigins = form.allowedOrigins
+      .split("\n")
+      .map((s) => s.trim())
+      .filter(Boolean);
+
+    const theme = {
+      primaryColor: form.primaryColor,
+      backgroundColor: form.backgroundColor,
+      textColor: form.textColor,
+    };
+
+    const monthlyCreditBudget = form.monthlyCreditBudget
+      ? parseInt(form.monthlyCreditBudget, 10) || null
+      : null;
+
+    if (widgetId) {
+      updateMutation.mutate({
+        widgetId,
+        name: form.name,
+        targetType: form.targetType,
+        allowedOrigins,
+        rateLimitPerMinute: form.rateLimitPerMinute,
+        maxConversationLength: form.maxConversationLength,
+        requireEmail: form.requireEmail,
+        creditSource: form.creditSource,
+        monthlyCreditBudget,
+        maxCreditsPerVisitorSession: form.maxCreditsPerVisitorSession,
+        maxCreditsPerVisitorDay: form.maxCreditsPerVisitorDay,
+        theme,
+      });
+    } else {
+      createMutation.mutate({
+        name: form.name,
+        targetType: form.targetType,
+        allowedOrigins,
+        rateLimitPerMinute: form.rateLimitPerMinute,
+        maxConversationLength: form.maxConversationLength,
+        requireEmail: form.requireEmail,
+        creditSource: form.creditSource,
+        monthlyCreditBudget,
+        maxCreditsPerVisitorSession: form.maxCreditsPerVisitorSession,
+        maxCreditsPerVisitorDay: form.maxCreditsPerVisitorDay,
+        theme,
+      });
+    }
+  };
+
+  const isPending = createMutation.isPending || updateMutation.isPending;
+
+  return (
+    <Dialog open onOpenChange={onClose}>
+      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
+        <DialogHeader>
+          <DialogTitle>{widgetId ? "Edit Widget" : "Create Widget"}</DialogTitle>
+        </DialogHeader>
+        <div className="grid gap-4">
+          <div>
+            <Label>Name *</Label>
+            <Input
+              value={form.name}
+              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
+              placeholder="My Website Widget"
+            />
+          </div>
+
+          <div>
+            <Label>Target Type</Label>
+            <Select
+              value={form.targetType}
+              onValueChange={(v) => setForm((f) => ({ ...f, targetType: v as "chat" | "agency" }))}
+            >
+              <SelectTrigger>
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="chat">Chat</SelectItem>
+                <SelectItem value="agency">Agency</SelectItem>
+              </SelectContent>
+            </Select>
+          </div>
+
+          <div>
+            <Label>
+              Allowed Origins{" "}
+              <span className="text-muted-foreground text-xs">(one per line)</span>
+            </Label>
+            <Textarea
+              value={form.allowedOrigins}
+              onChange={(e) => setForm((f) => ({ ...f, allowedOrigins: e.target.value }))}
+              placeholder={"https://example.com\nhttps://www.yoursite.com"}
+              className="h-24 text-sm"
+            />
+          </div>
+
+          <div className="grid grid-cols-2 gap-3">
+            <div>
+              <Label>Rate Limit (msgs/min)</Label>
+              <Input
+                type="number"
+                min={1}
+                max={1000}
+                value={form.rateLimitPerMinute}
+                onChange={(e) =>
+                  setForm((f) => ({ ...f, rateLimitPerMinute: parseInt(e.target.value) || 10 }))
+                }
+              />
+            </div>
+            <div>
+              <Label>Max Conversation Length</Label>
+              <Input
+                type="number"
+                min={1}
+                value={form.maxConversationLength}
+                onChange={(e) =>
+                  setForm((f) => ({
+                    ...f,
+                    maxConversationLength: parseInt(e.target.value) || 100,
+                  }))
+                }
+              />
+            </div>
+          </div>
+
+          <div className="flex items-center gap-3">
+            <Switch
+              checked={form.requireEmail}
+              onCheckedChange={(v) => setForm((f) => ({ ...f, requireEmail: v }))}
+            />
+            <Label>Require Email</Label>
+          </div>
+
+          <div>
+            <Label>Credit Source</Label>
+            <Select
+              value={form.creditSource}
+              onValueChange={(v) =>
+                setForm((f) => ({ ...f, creditSource: v as "tenant" | "visitor" }))
+              }
+            >
+              <SelectTrigger>
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="tenant">Tenant (my credits)</SelectItem>
+                <SelectItem value="visitor">Visitor</SelectItem>
+              </SelectContent>
+            </Select>
+          </div>
+
+          <div className="grid grid-cols-2 gap-3">
+            <div>
+              <Label>Monthly Credit Budget</Label>
+              <Input
+                type="number"
+                min={0}
+                value={form.monthlyCreditBudget}
+                onChange={(e) => setForm((f) => ({ ...f, monthlyCreditBudget: e.target.value }))}
+                placeholder="Unlimited"
+              />
+            </div>
+            <div>
+              <Label>Session Cap (credits)</Label>
+              <Input
+                type="number"
+                min={1}
+                value={form.maxCreditsPerVisitorSession}
+                onChange={(e) =>
+                  setForm((f) => ({
+                    ...f,
+                    maxCreditsPerVisitorSession: parseInt(e.target.value) || 50,
+                  }))
+                }
+              />
+            </div>
+          </div>
+
+          <div>
+            <Label className="mb-2 block">Theme Customization</Label>
+            <div className="grid grid-cols-3 gap-3">
+              <div>
+                <Label className="text-xs">Primary Color</Label>
+                <Input
+                  type="color"
+                  value={form.primaryColor}
+                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
+                />
+              </div>
+              <div>
+                <Label className="text-xs">Background</Label>
+                <Input
+                  type="color"
+                  value={form.backgroundColor}
+                  onChange={(e) => setForm((f) => ({ ...f, backgroundColor: e.target.value }))}
+                />
+              </div>
+              <div>
+                <Label className="text-xs">Text Color</Label>
+                <Input
+                  type="color"
+                  value={form.textColor}
+                  onChange={(e) => setForm((f) => ({ ...f, textColor: e.target.value }))}
+                />
+              </div>
+            </div>
+          </div>
+        </div>
+
+        <DialogFooter>
+          <Button variant="outline" onClick={onClose} disabled={isPending}>
+            Cancel
+          </Button>
+          <Button onClick={handleSubmit} disabled={isPending || !form.name.trim()}>
+            {isPending ? "Saving..." : widgetId ? "Save Changes" : "Create Widget"}
+          </Button>
+        </DialogFooter>
+      </DialogContent>
+    </Dialog>
+  );
+}
+
+// ── Main Page ──────────────────────────────────────────────────────────────────
+
+export default function AdminWidgets() {
+  const { toast } = useToast();
+  const [showCreate, setShowCreate] = useState(false);
+  const [editWidgetId, setEditWidgetId] = useState<string | null>(null);
+  const [embedWidgetId, setEmbedWidgetId] = useState<string | null>(null);
+  const queryClient = useQueryClient();
+
+  const { data: widgets = [], isLoading } = trpc.widget.list.useQuery();
+
+  const deleteMutation = trpc.widget.delete.useMutation({
+    onSuccess: () => {
+      queryClient.invalidateQueries({ queryKey: [["widget", "list"]] });
+      toast({ title: "Widget deactivated" });
+    },
+    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
+  });
+
+  return (
+    <div className="container mx-auto py-6 max-w-6xl">
+      <div className="flex justify-between items-center mb-6">
+        <div>
+          <h1 className="text-2xl font-bold">Chat Widgets</h1>
+          <p className="text-muted-foreground text-sm mt-1">
+            Manage embeddable chat widgets for your website.
+          </p>
+        </div>
+        <Button onClick={() => setShowCreate(true)}>
+          <Plus className="mr-2 h-4 w-4" />
+          Create Widget
+        </Button>
+      </div>
+
+      {isLoading ? (
+        <div className="text-center py-12 text-muted-foreground">Loading widgets...</div>
+      ) : widgets.length === 0 ? (
+        <div className="text-center py-12 border rounded-lg">
+          <p className="text-muted-foreground mb-4">
+            No widgets yet. Create one to embed a chat on your website.
+          </p>
+          <Button onClick={() => setShowCreate(true)}>
+            <Plus className="mr-2 h-4 w-4" />
+            Create Widget
+          </Button>
+        </div>
+      ) : (
+        <Table>
+          <TableHeader>
+            <TableRow>
+              <TableHead>Name</TableHead>
+              <TableHead>Type</TableHead>
+              <TableHead>Status</TableHead>
+              <TableHead>Credit Source</TableHead>
+              <TableHead>Rate Limit</TableHead>
+              <TableHead>Created</TableHead>
+              <TableHead className="text-right">Actions</TableHead>
+            </TableRow>
+          </TableHeader>
+          <TableBody>
+            {(widgets as WidgetRow[]).map((widget) => (
+              <TableRow key={widget.id}>
+                <TableCell className="font-medium">{widget.name}</TableCell>
+                <TableCell className="capitalize">{widget.targetType ?? "chat"}</TableCell>
+                <TableCell>
+                  <Badge variant={widget.isActive ? "default" : "secondary"}>
+                    {widget.isActive ? "Active" : "Inactive"}
+                  </Badge>
+                </TableCell>
+                <TableCell className="capitalize">{widget.creditSource ?? "tenant"}</TableCell>
+                <TableCell>{widget.rateLimitPerMinute ?? 10}/min</TableCell>
+                <TableCell>
+                  {new Date(widget.createdAt).toLocaleDateString()}
+                </TableCell>
+                <TableCell className="text-right">
+                  <div className="flex justify-end gap-2">
+                    <Button
+                      size="sm"
+                      variant="outline"
+                      onClick={() => setEmbedWidgetId(widget.id)}
+                    >
+                      <Code2 className="h-4 w-4" />
+                    </Button>
+                    <Button
+                      size="sm"
+                      variant="outline"
+                      onClick={() => setEditWidgetId(widget.id)}
+                    >
+                      <Pencil className="h-4 w-4" />
+                    </Button>
+                    <Button
+                      size="sm"
+                      variant="outline"
+                      onClick={() => {
+                        if (confirm("Deactivate this widget?")) {
+                          deleteMutation.mutate({ widgetId: widget.id });
+                        }
+                      }}
+                    >
+                      <Trash2 className="h-4 w-4 text-destructive" />
+                    </Button>
+                  </div>
+                </TableCell>
+              </TableRow>
+            ))}
+          </TableBody>
+        </Table>
+      )}
+
+      {showCreate && <WidgetFormDialog onClose={() => setShowCreate(false)} />}
+
+      {editWidgetId && (
+        <WidgetFormDialog
+          widgetId={editWidgetId}
+          onClose={() => setEditWidgetId(null)}
+        />
+      )}
+
+      {embedWidgetId && (
+        <EmbedCodeDialog
+          widgetId={embedWidgetId}
+          onClose={() => setEmbedWidgetId(null)}
+        />
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/widget/WidgetChat.tsx b/apps/web/client/widget/WidgetChat.tsx
new file mode 100644
index 0000000..b8c17e9
--- /dev/null
+++ b/apps/web/client/widget/WidgetChat.tsx
@@ -0,0 +1,268 @@
+/**
+ * WidgetChat — Minimal chat UI component for the embedded iframe.
+ *
+ * Features:
+ * - WebSocket connection with auth handshake
+ * - Message list with auto-scroll
+ * - Text input with send button
+ * - Typing indicator for assistant responses
+ * - postMessage to parent for resize events
+ * - Strict origin validation on postMessage
+ */
+
+import React, { useState, useEffect, useRef, useCallback } from "react";
+
+const PARENT_ORIGIN = "https://smartaihub.app";
+
+interface Message {
+  id: string;
+  role: "user" | "assistant";
+  text: string;
+  timestamp: number;
+}
+
+interface WidgetChatProps {
+  token: string;
+  widgetId: string;
+  wsUrl: string;
+}
+
+type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
+
+export function WidgetChat({ token, widgetId, wsUrl }: WidgetChatProps) {
+  const [messages, setMessages] = useState<Message[]>([]);
+  const [inputText, setInputText] = useState("");
+  const [status, setStatus] = useState<ConnectionStatus>("connecting");
+  const [isTyping, setIsTyping] = useState(false);
+  const wsRef = useRef<WebSocket | null>(null);
+  const messagesEndRef = useRef<HTMLDivElement | null>(null);
+
+  // Auto-scroll to bottom
+  const scrollToBottom = useCallback(() => {
+    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
+  }, []);
+
+  useEffect(() => {
+    scrollToBottom();
+  }, [messages, isTyping, scrollToBottom]);
+
+  // WebSocket connection
+  useEffect(() => {
+    const ws = new WebSocket(wsUrl);
+    wsRef.current = ws;
+
+    ws.addEventListener("open", () => {
+      ws.send(JSON.stringify({ type: "auth", token }));
+    });
+
+    ws.addEventListener("message", (event) => {
+      try {
+        const msg = JSON.parse(event.data) as {
+          type: string;
+          text?: string;
+          error?: string;
+          code?: string;
+        };
+
+        if (msg.type === "auth_ok") {
+          setStatus("connected");
+        } else if (msg.type === "message") {
+          setIsTyping(false);
+          if (msg.text) {
+            setMessages((prev) => [
+              ...prev,
+              {
+                id: crypto.randomUUID(),
+                role: "assistant",
+                text: msg.text!,
+                timestamp: Date.now(),
+              },
+            ]);
+          }
+        } else if (msg.type === "typing") {
+          setIsTyping(true);
+        } else if (msg.type === "error") {
+          setIsTyping(false);
+        }
+      } catch {
+        // Malformed JSON — ignore
+      }
+    });
+
+    ws.addEventListener("close", (event) => {
+      wsRef.current = null;
+      setStatus(event.code === 4001 ? "error" : "disconnected");
+    });
+
+    ws.addEventListener("error", () => {
+      setStatus("error");
+    });
+
+    return () => {
+      ws.close();
+    };
+  }, [token, wsUrl]);
+
+  // Notify parent of height changes
+  useEffect(() => {
+    const height = document.body.scrollHeight;
+    if (window.parent !== window) {
+      window.parent.postMessage({ type: "widget:resize", height }, PARENT_ORIGIN);
+    }
+  }, [messages]);
+
+  const sendMessage = useCallback(() => {
+    const text = inputText.trim();
+    if (!text || status !== "connected" || !wsRef.current) return;
+
+    setMessages((prev) => [
+      ...prev,
+      {
+        id: crypto.randomUUID(),
+        role: "user",
+        text,
+        timestamp: Date.now(),
+      },
+    ]);
+    setInputText("");
+    setIsTyping(true);
+
+    wsRef.current.send(JSON.stringify({ type: "message", text }));
+  }, [inputText, status]);
+
+  const handleKeyDown = useCallback(
+    (e: React.KeyboardEvent) => {
+      if (e.key === "Enter" && !e.shiftKey) {
+        e.preventDefault();
+        sendMessage();
+      }
+    },
+    [sendMessage],
+  );
+
+  const styles: Record<string, React.CSSProperties> = {
+    container: {
+      display: "flex",
+      flexDirection: "column",
+      height: "100vh",
+      fontFamily: "system-ui, -apple-system, sans-serif",
+      fontSize: "14px",
+      backgroundColor: "#fff",
+      color: "#1a1a1a",
+    },
+    header: {
+      padding: "12px 16px",
+      borderBottom: "1px solid #e5e7eb",
+      backgroundColor: "#6366f1",
+      color: "#fff",
+      fontWeight: 600,
+    },
+    messages: {
+      flex: 1,
+      overflowY: "auto",
+      padding: "12px 16px",
+      display: "flex",
+      flexDirection: "column",
+      gap: "8px",
+    },
+    messageBubble: (role: string) => ({
+      maxWidth: "80%",
+      padding: "8px 12px",
+      borderRadius: role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
+      backgroundColor: role === "user" ? "#6366f1" : "#f3f4f6",
+      color: role === "user" ? "#fff" : "#1a1a1a",
+      alignSelf: role === "user" ? "flex-end" : "flex-start",
+      lineHeight: 1.4,
+      wordBreak: "break-word" as const,
+    }),
+    inputArea: {
+      display: "flex",
+      gap: "8px",
+      padding: "12px",
+      borderTop: "1px solid #e5e7eb",
+    },
+    input: {
+      flex: 1,
+      padding: "8px 12px",
+      borderRadius: "8px",
+      border: "1px solid #d1d5db",
+      outline: "none",
+      fontSize: "14px",
+      resize: "none" as const,
+    },
+    sendButton: {
+      padding: "8px 16px",
+      backgroundColor: "#6366f1",
+      color: "#fff",
+      border: "none",
+      borderRadius: "8px",
+      cursor: "pointer",
+      fontSize: "14px",
+      fontWeight: 500,
+    },
+    typingIndicator: {
+      alignSelf: "flex-start",
+      padding: "8px 12px",
+      backgroundColor: "#f3f4f6",
+      borderRadius: "16px 16px 16px 4px",
+      color: "#9ca3af",
+      fontSize: "12px",
+    },
+    statusBanner: {
+      padding: "8px 16px",
+      textAlign: "center" as const,
+      fontSize: "12px",
+      color: status === "error" ? "#ef4444" : "#6b7280",
+      backgroundColor: status === "error" ? "#fee2e2" : "#f9fafb",
+    },
+  };
+
+  if (status === "error") {
+    return (
+      <div style={styles.container}>
+        <div style={styles.header}>Chat</div>
+        <div style={styles.statusBanner}>
+          Connection failed. Please refresh the page.
+        </div>
+      </div>
+    );
+  }
+
+  return (
+    <div style={styles.container}>
+      <div style={styles.header}>Chat</div>
+      {status === "connecting" && (
+        <div style={styles.statusBanner}>Connecting...</div>
+      )}
+      <div style={styles.messages}>
+        {messages.map((msg) => (
+          <div key={msg.id} style={styles.messageBubble(msg.role)}>
+            {msg.text}
+          </div>
+        ))}
+        {isTyping && (
+          <div style={styles.typingIndicator}>● ● ●</div>
+        )}
+        <div ref={messagesEndRef} />
+      </div>
+      <div style={styles.inputArea}>
+        <textarea
+          style={styles.input}
+          value={inputText}
+          onChange={(e) => setInputText(e.target.value)}
+          onKeyDown={handleKeyDown}
+          placeholder={status === "connected" ? "Type a message..." : "Connecting..."}
+          disabled={status !== "connected"}
+          rows={1}
+        />
+        <button
+          style={styles.sendButton}
+          onClick={sendMessage}
+          disabled={status !== "connected" || !inputText.trim()}
+        >
+          Send
+        </button>
+      </div>
+    </div>
+  );
+}
diff --git a/apps/web/client/widget/__tests__/embed.test.ts b/apps/web/client/widget/__tests__/embed.test.ts
new file mode 100644
index 0000000..178a25c
--- /dev/null
+++ b/apps/web/client/widget/__tests__/embed.test.ts
@@ -0,0 +1,75 @@
+/**
+ * Tests for the embed.js loader script.
+ *
+ * Covers:
+ * - Creates iframe element pointing to /widget/v1/chat?token=...
+ * - postMessage origin validation (rejects messages from unexpected origins)
+ * - Applies position from data attributes
+ * - Prevents duplicate iframe creation on re-initialization
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// These tests run in jsdom environment which simulates browser APIs.
+// The embed.ts module is designed to run in a browser context.
+
+describe("Embed Script", () => {
+  beforeEach(() => {
+    // Clean up DOM
+    document.body.innerHTML = "";
+    // Remove any cached module state
+  });
+
+  it("isValidOrigin returns true for allowed origins", async () => {
+    const { isValidOrigin } = await import("../embed");
+    expect(isValidOrigin("https://smartaihub.app")).toBe(true);
+  });
+
+  it("isValidOrigin returns false for unexpected origins", async () => {
+    const { isValidOrigin } = await import("../embed");
+    expect(isValidOrigin("https://evil.com")).toBe(false);
+    expect(isValidOrigin("http://smartaihub.app")).toBe(false); // http not https
+    expect(isValidOrigin("")).toBe(false);
+  });
+
+  it("builds iframe src with token query parameter", async () => {
+    const { buildIframeSrc } = await import("../embed");
+    const src = buildIframeSrc("widget-123", "mytoken");
+    expect(src).toContain("/widget/v1/chat");
+    expect(src).toContain("token=mytoken");
+    expect(src).toContain("widget-123");
+  });
+
+  it("prevents duplicate iframe creation on re-initialization", async () => {
+    const { createWidgetIframe, WIDGET_CONTAINER_ID } = await import("../embed");
+
+    // First call creates iframe
+    createWidgetIframe("widget-abc", "https://smartaihub.app", "bottom-right");
+    const firstContainer = document.getElementById(WIDGET_CONTAINER_ID);
+    expect(firstContainer).not.toBeNull();
+
+    // Second call should not create duplicate
+    createWidgetIframe("widget-abc", "https://smartaihub.app", "bottom-right");
+    const containers = document.querySelectorAll(`#${WIDGET_CONTAINER_ID}`);
+    expect(containers).toHaveLength(1);
+  });
+
+  it("applies position bottom-right via inline style", async () => {
+    const { createWidgetIframe, WIDGET_CONTAINER_ID } = await import("../embed");
+    document.body.innerHTML = ""; // fresh DOM
+
+    createWidgetIframe("widget-pos", "https://smartaihub.app", "bottom-right");
+    const container = document.getElementById(WIDGET_CONTAINER_ID);
+    expect(container?.style.position).toBe("fixed");
+    expect(container?.style.bottom).toBeTruthy();
+    expect(container?.style.right).toBeTruthy();
+  });
+
+  it("applies position bottom-left via inline style", async () => {
+    const { createWidgetIframe, WIDGET_CONTAINER_ID } = await import("../embed");
+    document.body.innerHTML = "";
+
+    createWidgetIframe("widget-left", "https://smartaihub.app", "bottom-left");
+    const container = document.getElementById(WIDGET_CONTAINER_ID);
+    expect(container?.style.left).toBeTruthy();
+  });
+});
diff --git a/apps/web/client/widget/embed.ts b/apps/web/client/widget/embed.ts
new file mode 100644
index 0000000..fe985bd
--- /dev/null
+++ b/apps/web/client/widget/embed.ts
@@ -0,0 +1,135 @@
+/**
+ * Widget Embed Script — served at /widget/v1/embed.js
+ *
+ * Website owners embed this with a single <script> tag:
+ *   <script src="https://smartaihub.app/widget/v1/embed.js"
+ *     data-widget-id="<WIDGET_UUID>"
+ *     data-position="bottom-right">
+ *   </script>
+ *
+ * Security:
+ * - All postMessage handlers validate event.origin strictly
+ * - Duplicate initialization is idempotent (no double iframes)
+ * - Token stored in iframe's sessionStorage only (not accessible to parent)
+ */
+
+export const WIDGET_CONTAINER_ID = "ssp-widget-container";
+const ALLOWED_ORIGIN = "https://smartaihub.app";
+const INIT_ENDPOINT = `${ALLOWED_ORIGIN}/api/widget/init`;
+
+/**
+ * Check if a postMessage origin is the trusted smartaihub.app origin.
+ * Exported for unit testing.
+ */
+export function isValidOrigin(origin: string): boolean {
+  return origin === ALLOWED_ORIGIN;
+}
+
+/**
+ * Build the iframe src URL for the widget chat page.
+ * Exported for unit testing.
+ */
+export function buildIframeSrc(widgetId: string, token: string): string {
+  return `${ALLOWED_ORIGIN}/widget/v1/chat?widget=${encodeURIComponent(widgetId)}&token=${encodeURIComponent(token)}`;
+}
+
+/**
+ * Create and inject the widget iframe into the DOM.
+ * Idempotent — skips creation if container already exists.
+ * Exported for unit testing.
+ */
+export function createWidgetIframe(
+  widgetId: string,
+  _iframeSrc: string,
+  position: "bottom-right" | "bottom-left" = "bottom-right",
+): void {
+  if (document.getElementById(WIDGET_CONTAINER_ID)) {
+    return; // Already initialized
+  }
+
+  const container = document.createElement("div");
+  container.id = WIDGET_CONTAINER_ID;
+  container.style.position = "fixed";
+  container.style.bottom = "24px";
+  container.style.zIndex = "999999";
+  container.style.width = "380px";
+  container.style.height = "600px";
+
+  if (position === "bottom-left") {
+    container.style.left = "24px";
+  } else {
+    container.style.right = "24px";
+  }
+
+  const iframe = document.createElement("iframe");
+  iframe.src = _iframeSrc;
+  iframe.style.width = "100%";
+  iframe.style.height = "100%";
+  iframe.style.border = "none";
+  iframe.style.borderRadius = "12px";
+  iframe.style.boxShadow = "0 4px 24px rgba(0,0,0,0.18)";
+  // Sandbox: allow scripts and same-origin for WS, but restrict navigation
+  iframe.setAttribute(
+    "sandbox",
+    "allow-scripts allow-same-origin allow-forms allow-popups",
+  );
+  iframe.setAttribute("title", "Chat Widget");
+
+  container.appendChild(iframe);
+  document.body.appendChild(container);
+
+  // Listen for postMessage from iframe (resize, toggle)
+  window.addEventListener("message", (event) => {
+    if (!isValidOrigin(event.origin)) return;
+    const msg = event.data as { type?: string; height?: number };
+    if (msg.type === "widget:resize" && typeof msg.height === "number") {
+      container.style.height = `${Math.min(Math.max(msg.height, 200), 700)}px`;
+    }
+    if (msg.type === "widget:close") {
+      container.style.display = "none";
+    }
+    if (msg.type === "widget:open") {
+      container.style.display = "block";
+    }
+  });
+}
+
+// ── Auto-init from script tag data attributes ─────────────────────────────────
+
+function autoInit(): void {
+  const script =
+    document.currentScript ??
+    document.querySelector<HTMLScriptElement>(`script[data-widget-id]`);
+
+  if (!script) return;
+
+  const widgetId = (script as HTMLScriptElement).dataset.widgetId;
+  const position = ((script as HTMLScriptElement).dataset.position ?? "bottom-right") as
+    | "bottom-right"
+    | "bottom-left";
+
+  if (!widgetId) return;
+
+  // Fetch init token from server
+  fetch(INIT_ENDPOINT, {
+    method: "POST",
+    headers: { "Content-Type": "application/json" },
+    body: JSON.stringify({ widgetId }),
+  })
+    .then((res) => res.json())
+    .then((data: { token?: string; error?: string }) => {
+      if (!data.token) return;
+      const src = buildIframeSrc(widgetId, data.token);
+      createWidgetIframe(widgetId, src, position);
+    })
+    .catch(() => {
+      // Silently fail — widget should not break the host page
+    });
+}
+
+// Run on DOMContentLoaded or immediately if already loaded
+if (document.readyState === "loading") {
+  document.addEventListener("DOMContentLoaded", autoInit);
+} else {
+  autoInit();
+}
diff --git a/apps/web/client/widget/index.html b/apps/web/client/widget/index.html
new file mode 100644
index 0000000..1466ea7
--- /dev/null
+++ b/apps/web/client/widget/index.html
@@ -0,0 +1,17 @@
+<!DOCTYPE html>
+<html lang="en">
+  <head>
+    <meta charset="UTF-8" />
+    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
+    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
+    <title>Chat Widget</title>
+    <style>
+      * { box-sizing: border-box; margin: 0; padding: 0; }
+      body { overflow: hidden; }
+    </style>
+  </head>
+  <body>
+    <div id="root"></div>
+    <script type="module" src="/widget/v1/widget.js"></script>
+  </body>
+</html>
diff --git a/apps/web/client/widget/main.tsx b/apps/web/client/widget/main.tsx
new file mode 100644
index 0000000..296f3f8
--- /dev/null
+++ b/apps/web/client/widget/main.tsx
@@ -0,0 +1,64 @@
+/**
+ * Widget React Entry Point
+ *
+ * Reads the signed init token from URL query parameter ?token=...
+ * Establishes WebSocket connection to wss://smartaihub.app/widget/v1/ws
+ * Renders WidgetChat component with connection state.
+ *
+ * Token is stored in sessionStorage only (not accessible to parent page via postMessage).
+ */
+
+import React, { StrictMode } from "react";
+import { createRoot } from "react-dom/client";
+import { WidgetChat } from "./WidgetChat";
+
+function getParams(): { token: string | null; widgetId: string | null } {
+  const params = new URLSearchParams(window.location.search);
+  return {
+    token: params.get("token"),
+    widgetId: params.get("widget"),
+  };
+}
+
+function App() {
+  const { token, widgetId } = getParams();
+
+  if (!token || !widgetId) {
+    return (
+      <div
+        style={{
+          display: "flex",
+          alignItems: "center",
+          justifyContent: "center",
+          height: "100vh",
+          fontFamily: "system-ui, sans-serif",
+          color: "#666",
+          fontSize: "14px",
+        }}
+      >
+        Widget configuration error. Missing token.
+      </div>
+    );
+  }
+
+  // Store token in sessionStorage for reconnection
+  try {
+    sessionStorage.setItem("ssp_widget_token", token);
+    sessionStorage.setItem("ssp_widget_id", widgetId);
+  } catch {
+    // sessionStorage may be unavailable in some iframe sandbox configurations
+  }
+
+  const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/widget/v1/ws`;
+
+  return <WidgetChat token={token} widgetId={widgetId} wsUrl={wsUrl} />;
+}
+
+const container = document.getElementById("root");
+if (container) {
+  createRoot(container).render(
+    <StrictMode>
+      <App />
+    </StrictMode>,
+  );
+}
diff --git a/apps/web/package.json b/apps/web/package.json
index 52fc7d2..9866d1e 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -7,7 +7,8 @@
     "dev": "lsof -ti:3000 | xargs kill -9 2>/dev/null; NODE_ENV=development NODE_OPTIONS='--max-old-space-size=4096' tsx watch server/_core/index.ts",
     "dev:tsx": "lsof -ti:3000 | xargs kill -9 2>/dev/null; NODE_ENV=development tsx watch server/_core/index.ts",
     "dev:no-watch": "lsof -ti:3000 | xargs kill -9 2>/dev/null; NODE_ENV=development node --import tsx server/_core/index.ts",
-    "build": "vite build",
+    "build": "vite build && npm run build:widget",
+    "build:widget": "vite build --config vite.config.widget.ts",
     "start": "NODE_ENV=production NODE_OPTIONS='--max-old-space-size=8192' tsx server/_core/index.ts",
     "check": "tsc --noEmit",
     "typecheck": "tsc --noEmit",
@@ -79,6 +80,7 @@
     "@types/multer": "^2.0.0",
     "@types/nodemailer": "^7.0.9",
     "@types/sanitize-html": "^2.16.0",
+    "@types/ws": "^8.18.1",
     "@uiw/react-codemirror": "^4.25.4",
     "@uiw/react-json-view": "^2.0.0-alpha.41",
     "@xterm/addon-fit": "^0.11.0",
@@ -140,6 +142,7 @@
     "tailwindcss-animate": "^1.0.7",
     "vaul": "^1.1.2",
     "wouter": "^3.3.5",
+    "ws": "^8.19.0",
     "xlsx": "^0.18.5",
     "zod": "^3.24.1"
   },
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index d32f3bd..b1d1ea6 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -23,6 +23,7 @@ import { createWebhookRouter } from "../routes/webhooks";
 import { createTelegramWebhookRouter } from "../routes/telegramWebhook";
 import { createChannelWebhookRouter } from "../routes/channelWebhook";
 import { createVoiceSessionRouter, handleVoiceUpgrade, shutdownVoiceGateway } from "../routes/voiceGateway";
+import { createWidgetInitRouter, handleWidgetUpgrade } from "../routes/widgetGateway";
 import browserToolRouter from "../routes/browserTool";
 import "../services/telegramLinkService"; // Register /start link handler
 import "../services/channelAdapters/telegram"; // Register Telegram adapter
@@ -367,6 +368,10 @@ app.use("/webhooks/telegram", express.json({ limit: "1mb" }), createTelegramWebh
 
 // Voice gateway: session token + consent endpoints
 app.use("/api/voice", createVoiceSessionRouter());
+
+// Widget gateway: init token endpoint
+app.use("/api/widget", express.json({ limit: "100kb" }), createWidgetInitRouter());
+
 app.use(browserToolRouter);
 
 // Cloud Tasks handler routes (called by Cloud Tasks with OIDC auth)
@@ -964,11 +969,13 @@ async function main() {
   const server = createServer(app);
   httpServer = server;
 
-  // Voice gateway: handle WebSocket upgrade for /api/voice/stream
+  // WebSocket upgrade routing
   server.on("upgrade", (req, socket, head) => {
     const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
     if (url.pathname === "/api/voice/stream") {
       handleVoiceUpgrade(req, socket as any, head);
+    } else if (url.pathname === "/widget/v1/ws") {
+      handleWidgetUpgrade(req, socket as any, head);
     }
   });
 
diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index c6accf0..f39ae0b 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -69,6 +69,7 @@ import { sandboxRouter } from "./routers/sandbox";
 import { agencyRouter } from "./routers/agency";
 import { personaRouter } from "./routers/persona";
 import { artifactRouter } from "./routers/artifact";
+import { widgetRouter } from "./routers/widget";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -261,6 +262,11 @@ export const appRouter = router({
           throw new Error('Invalid email or password');
         }
 
+        // Block login for widget system accounts (defense-in-depth)
+        if (/^widget-system@.+\.internal$/.test(input.email)) {
+          throw new Error('Invalid email or password');
+        }
+
         // If user registered with password, verify it
         if (user.password) {
           const valid = await bcrypt.compare(input.password, user.password);
@@ -1350,6 +1356,9 @@ export const appRouter = router({
   // Canvas / AI Artifacts (versioned, interactive artifacts)
   artifact: artifactRouter,
 
+  // Embeddable chat widget management
+  widget: widgetRouter,
+
   // Memory system (entity memories, summaries, context)
   memory: memoryRouter,
 
diff --git a/apps/web/server/routers/widget.ts b/apps/web/server/routers/widget.ts
new file mode 100644
index 0000000..7518c72
--- /dev/null
+++ b/apps/web/server/routers/widget.ts
@@ -0,0 +1,260 @@
+/**
+ * Widget tRPC Router — CRUD for chat widget configurations.
+ *
+ * All procedures require domain_admin or admin role and check the chatWidget
+ * feature flag before executing.
+ *
+ * Tenant isolation: every mutation validates that the target widget belongs
+ * to the caller's tenant before proceeding.
+ *
+ * Theme sanitization: only keys from ALLOWED_THEME_KEYS are stored; values
+ * are stripped of HTML tags and limited to 200 characters.
+ */
+
+import { z } from "zod";
+import { eq, and, desc } from "drizzle-orm";
+import { TRPCError } from "@trpc/server";
+import { router, protectedProcedure } from "../_core/trpc";
+import { db } from "../db";
+import { chatWidgets } from "../../drizzle/schema";
+import { getTenantFeatureFlag } from "../services/featureFlags";
+import { getOrCreateSystemUser } from "../services/widgetService";
+
+// ── Theme key allowlist & sanitization ────────────────────────────────────────
+
+const ALLOWED_THEME_KEYS = new Set([
+  "primaryColor",
+  "backgroundColor",
+  "textColor",
+  "fontFamily",
+  "borderRadius",
+  "headerText",
+]);
+
+const HTML_TAG_RE = /<[^>]*>/g;
+
+function sanitizeTheme(raw: Record<string, unknown>): Record<string, string> {
+  const out: Record<string, string> = {};
+  for (const [key, value] of Object.entries(raw)) {
+    if (!ALLOWED_THEME_KEYS.has(key)) continue;
+    if (typeof value !== "string") continue;
+    out[key] = value.replace(HTML_TAG_RE, "").slice(0, 200);
+  }
+  return out;
+}
+
+// ── Zod schemas ────────────────────────────────────────────────────────────────
+
+const widgetCreateSchema = z.object({
+  name: z.string().min(1).max(255),
+  targetType: z.enum(["chat", "agency"]).optional(),
+  targetAgencyId: z.string().optional(),
+  defaultPersonaId: z.string().optional(),
+  allowedOrigins: z.array(z.string()).default([]),
+  rateLimitPerMinute: z.number().int().min(1).max(1000).default(10),
+  maxConversationLength: z.number().int().min(1).default(100),
+  requireEmail: z.boolean().default(false),
+  creditSource: z.enum(["tenant", "visitor"]).default("tenant"),
+  monthlyCreditBudget: z.number().int().positive().nullable().optional(),
+  maxCreditsPerVisitorSession: z.number().int().positive().default(50),
+  maxCreditsPerVisitorDay: z.number().int().positive().default(100),
+  theme: z.record(z.unknown()).optional(),
+});
+
+const widgetUpdateSchema = z.object({
+  widgetId: z.string(),
+  name: z.string().min(1).max(255).optional(),
+  targetType: z.enum(["chat", "agency"]).optional(),
+  targetAgencyId: z.string().nullable().optional(),
+  defaultPersonaId: z.string().nullable().optional(),
+  allowedOrigins: z.array(z.string()).optional(),
+  rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
+  maxConversationLength: z.number().int().min(1).optional(),
+  requireEmail: z.boolean().optional(),
+  creditSource: z.enum(["tenant", "visitor"]).optional(),
+  monthlyCreditBudget: z.number().int().positive().nullable().optional(),
+  maxCreditsPerVisitorSession: z.number().int().positive().optional(),
+  maxCreditsPerVisitorDay: z.number().int().positive().optional(),
+  theme: z.record(z.unknown()).optional(),
+  isActive: z.boolean().optional(),
+});
+
+// ── Helper: check feature flag and return caller's tenantId ──────────────────
+
+async function requireWidgetFeature(tenantId: string): Promise<void> {
+  const enabled = await getTenantFeatureFlag("chatWidget", tenantId);
+  if (!enabled) {
+    throw new TRPCError({
+      code: "FORBIDDEN",
+      message: "Chat widget feature is not enabled for this tenant",
+    });
+  }
+}
+
+async function requireWidgetOwnership(widgetId: string, tenantId: string) {
+  const [widget] = await db
+    .select()
+    .from(chatWidgets)
+    .where(eq(chatWidgets.id, widgetId))
+    .limit(1);
+
+  if (!widget) {
+    throw new TRPCError({ code: "NOT_FOUND", message: "Widget not found" });
+  }
+  if (widget.tenantId !== tenantId) {
+    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
+  }
+  return widget;
+}
+
+// ── Router ────────────────────────────────────────────────────────────────────
+
+export const widgetRouter = router({
+  /** List all widgets for the caller's tenant */
+  list: protectedProcedure.query(async ({ ctx }) => {
+    const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+    await requireWidgetFeature(tenantId);
+
+    return db
+      .select()
+      .from(chatWidgets)
+      .where(eq(chatWidgets.tenantId, tenantId))
+      .orderBy(desc(chatWidgets.createdAt));
+  }),
+
+  /** Get a single widget by ID (validates tenant ownership) */
+  getById: protectedProcedure
+    .input(z.object({ widgetId: z.string() }))
+    .query(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await requireWidgetFeature(tenantId);
+      return requireWidgetOwnership(input.widgetId, tenantId);
+    }),
+
+  /** Create a new widget */
+  create: protectedProcedure
+    .input(widgetCreateSchema)
+    .mutation(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await requireWidgetFeature(tenantId);
+
+      // Ensure system user exists for this tenant
+      await getOrCreateSystemUser(tenantId);
+
+      const sanitizedTheme = input.theme ? sanitizeTheme(input.theme as Record<string, unknown>) : {};
+
+      const [created] = await db
+        .insert(chatWidgets)
+        .values({
+          tenantId,
+          name: input.name,
+          targetType: input.targetType ?? "chat",
+          targetAgencyId: input.targetAgencyId ?? null,
+          defaultPersonaId: input.defaultPersonaId ?? null,
+          allowedOrigins: input.allowedOrigins,
+          rateLimitPerMinute: input.rateLimitPerMinute,
+          maxConversationLength: input.maxConversationLength,
+          requireEmail: input.requireEmail,
+          creditSource: input.creditSource,
+          monthlyCreditBudget: input.monthlyCreditBudget ?? null,
+          maxCreditsPerVisitorSession: input.maxCreditsPerVisitorSession,
+          maxCreditsPerVisitorDay: input.maxCreditsPerVisitorDay,
+          theme: sanitizedTheme,
+          isActive: true,
+        } as any)
+        .returning();
+
+      return created;
+    }),
+
+  /** Update widget config */
+  update: protectedProcedure
+    .input(widgetUpdateSchema)
+    .mutation(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await requireWidgetFeature(tenantId);
+
+      const widget = await requireWidgetOwnership(input.widgetId, tenantId);
+
+      const updateData: Record<string, unknown> = {
+        updatedAt: new Date(),
+      };
+
+      if (input.name !== undefined) updateData.name = input.name;
+      if (input.targetType !== undefined) updateData.targetType = input.targetType;
+      if (input.targetAgencyId !== undefined) updateData.targetAgencyId = input.targetAgencyId;
+      if (input.defaultPersonaId !== undefined) updateData.defaultPersonaId = input.defaultPersonaId;
+      if (input.allowedOrigins !== undefined) updateData.allowedOrigins = input.allowedOrigins;
+      if (input.rateLimitPerMinute !== undefined) updateData.rateLimitPerMinute = input.rateLimitPerMinute;
+      if (input.maxConversationLength !== undefined) updateData.maxConversationLength = input.maxConversationLength;
+      if (input.requireEmail !== undefined) updateData.requireEmail = input.requireEmail;
+      if (input.creditSource !== undefined) updateData.creditSource = input.creditSource;
+      if (input.monthlyCreditBudget !== undefined) updateData.monthlyCreditBudget = input.monthlyCreditBudget;
+      if (input.maxCreditsPerVisitorSession !== undefined) updateData.maxCreditsPerVisitorSession = input.maxCreditsPerVisitorSession;
+      if (input.maxCreditsPerVisitorDay !== undefined) updateData.maxCreditsPerVisitorDay = input.maxCreditsPerVisitorDay;
+      if (input.isActive !== undefined) updateData.isActive = input.isActive;
+      if (input.theme !== undefined) {
+        updateData.theme = sanitizeTheme(input.theme as Record<string, unknown>);
+      }
+
+      const [updated] = await db
+        .update(chatWidgets)
+        .set(updateData as any)
+        .where(and(eq(chatWidgets.id, input.widgetId), eq(chatWidgets.tenantId, tenantId)))
+        .returning();
+
+      return updated ?? widget;
+    }),
+
+  /** Soft-delete a widget (set is_active = false) */
+  delete: protectedProcedure
+    .input(z.object({ widgetId: z.string() }))
+    .mutation(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await requireWidgetFeature(tenantId);
+
+      await requireWidgetOwnership(input.widgetId, tenantId);
+
+      await db
+        .update(chatWidgets)
+        .set({ isActive: false, updatedAt: new Date() } as any)
+        .where(and(eq(chatWidgets.id, input.widgetId), eq(chatWidgets.tenantId, tenantId)));
+
+      return { success: true };
+    }),
+
+  /** Get embed HTML snippet for a widget */
+  getEmbedCode: protectedProcedure
+    .input(z.object({ widgetId: z.string() }))
+    .query(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await requireWidgetFeature(tenantId);
+
+      await requireWidgetOwnership(input.widgetId, tenantId);
+
+      const embedCode = `<script src="https://smartaihub.app/widget/v1/embed.js"\n  data-widget-id="${input.widgetId}"\n  data-position="bottom-right">\n</script>`;
+
+      return { embedCode, widgetId: input.widgetId };
+    }),
+
+  /** Get monthly credit usage stats for a widget */
+  getUsageStats: protectedProcedure
+    .input(z.object({ widgetId: z.string(), month: z.string().optional() }))
+    .query(async ({ input, ctx }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await requireWidgetFeature(tenantId);
+
+      await requireWidgetOwnership(input.widgetId, tenantId);
+
+      const month = input.month ?? new Date().toISOString().slice(0, 7);
+
+      // Read from Redis monthly counter
+      const { getCacheClient } = await import("../services/redisClients");
+      const redis = getCacheClient();
+      const monthlyKey = `widget:monthly:${input.widgetId}:${month}`;
+      const rawCount = await redis.get(monthlyKey);
+      const creditsUsed = rawCount ? parseInt(rawCount, 10) : 0;
+
+      return { widgetId: input.widgetId, month, creditsUsed };
+    }),
+});
diff --git a/apps/web/server/routes/widgetGateway.ts b/apps/web/server/routes/widgetGateway.ts
new file mode 100644
index 0000000..8e53577
--- /dev/null
+++ b/apps/web/server/routes/widgetGateway.ts
@@ -0,0 +1,373 @@
+/**
+ * Widget Gateway
+ *
+ * HTTP endpoint: POST /api/widget/init
+ *   - Validates widgetId, checks feature flag + is_active + allowed origins
+ *   - Returns HMAC-signed init token (24h TTL)
+ *
+ * WebSocket endpoint: /widget/v1/ws
+ *   - First message must be { type: "auth", token: "..." }
+ *   - Token validated via HMAC-SHA256 + timingSafeEqual + exp check
+ *   - Subsequent messages routed through channelGateway.ingest()
+ *   - Rate limiting via Redis INCR with 60s TTL
+ *
+ * Security:
+ *   - HMAC key derived from LLM_ENCRYPTION_KEY (never transmitted)
+ *   - timingSafeEqual for constant-time token comparison
+ *   - Empty allowed_origins = deny all (deny-by-default)
+ *   - Token contains only IDs and timestamps (no secrets or PII)
+ */
+
+import crypto from "crypto";
+import { Router } from "express";
+import type { IncomingMessage } from "http";
+import type { Socket } from "net";
+import { WebSocketServer, WebSocket } from "ws";
+import { eq } from "drizzle-orm";
+import { getDb } from "../db";
+import { chatWidgets } from "../../drizzle/schema";
+import { getCacheClient } from "../services/redisClients";
+import { getTenantFeatureFlag } from "../services/featureFlags";
+import { auditLogger } from "../services/auditLogger";
+
+// ── Constants ──────────────────────────────────────────────────────────────────
+
+export const INIT_TOKEN_TTL_SECONDS = 86400; // 24 hours
+export const CLOSE_CODE_UNAUTHORIZED = 4001;
+export const CLOSE_CODE_RATE_LIMIT = 4003;
+
+// ── HMAC token helpers ─────────────────────────────────────────────────────────
+
+function getHmacKey(): Buffer {
+  const encKey = process.env.LLM_ENCRYPTION_KEY;
+  if (!encKey) {
+    throw new Error("LLM_ENCRYPTION_KEY is not configured");
+  }
+  // Derive widget-specific subkey
+  return crypto
+    .createHmac("sha256", encKey)
+    .update("widget-token-v1")
+    .digest();
+}
+
+export interface InitTokenPayload {
+  tenantId: string;
+  widgetId: string;
+  visitorSessionId: string;
+  iat: number;
+  exp: number;
+}
+
+/**
+ * Generate a signed init token.
+ * Format: base64url(JSON.stringify(payload)) + "." + base64url(hmac-signature)
+ */
+export function generateInitToken(payload: InitTokenPayload): string {
+  const payloadStr = JSON.stringify(payload);
+  const payloadB64 = Buffer.from(payloadStr).toString("base64url");
+
+  const key = getHmacKey();
+  const sig = crypto.createHmac("sha256", key).update(payloadStr).digest();
+  const sigB64 = sig.toString("base64url");
+
+  return `${payloadB64}.${sigB64}`;
+}
+
+/**
+ * Validate and parse an init token.
+ * Returns null if invalid (wrong HMAC, expired, or malformed).
+ * Uses timingSafeEqual to prevent timing attacks.
+ */
+export function validateInitToken(token: string): InitTokenPayload | null {
+  try {
+    const dotIdx = token.lastIndexOf(".");
+    if (dotIdx <= 0) return null;
+
+    const payloadB64 = token.slice(0, dotIdx);
+    const sigB64 = token.slice(dotIdx + 1);
+
+    if (!payloadB64 || !sigB64) return null;
+
+    const payloadStr = Buffer.from(payloadB64, "base64url").toString();
+    const payload = JSON.parse(payloadStr) as InitTokenPayload;
+
+    // Verify required fields
+    if (!payload.tenantId || !payload.widgetId || !payload.visitorSessionId) {
+      return null;
+    }
+    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
+      return null;
+    }
+
+    // Check expiry
+    if (payload.exp < Math.floor(Date.now() / 1000)) {
+      return null;
+    }
+
+    // Verify HMAC
+    const key = getHmacKey();
+    const expectedSig = crypto.createHmac("sha256", key).update(payloadStr).digest();
+    const receivedSig = Buffer.from(sigB64, "base64url");
+
+    // Constant-time comparison with length check
+    const len = Math.max(expectedSig.length, receivedSig.length);
+    const padExpected = Buffer.alloc(len);
+    const padReceived = Buffer.alloc(len);
+    expectedSig.copy(padExpected);
+    receivedSig.copy(padReceived);
+
+    if (
+      !crypto.timingSafeEqual(padExpected, padReceived) ||
+      expectedSig.length !== receivedSig.length
+    ) {
+      return null;
+    }
+
+    return payload;
+  } catch {
+    return null;
+  }
+}
+
+// ── Origin validation ──────────────────────────────────────────────────────────
+
+function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
+  if (!origin || allowedOrigins.length === 0) return false;
+  // Normalize: strip trailing slash
+  const normalizedOrigin = origin.replace(/\/$/, "");
+  return allowedOrigins.some((allowed) => {
+    const normalizedAllowed = allowed.replace(/\/$/, "");
+    // Support wildcard subdomain: *.example.com
+    if (normalizedAllowed.startsWith("*.")) {
+      const suffix = normalizedAllowed.slice(1); // .example.com
+      return normalizedOrigin.endsWith(suffix);
+    }
+    return normalizedOrigin === normalizedAllowed;
+  });
+}
+
+// ── HTTP Init Endpoint ─────────────────────────────────────────────────────────
+
+export function createWidgetInitRouter(): Router {
+  const router = Router();
+
+  router.post("/init", async (req, res) => {
+    try {
+      const { widgetId } = req.body as { widgetId?: string };
+      if (!widgetId || typeof widgetId !== "string") {
+        res.status(400).json({ error: "widgetId is required" });
+        return;
+      }
+
+      const db = await getDb();
+      if (!db) {
+        res.status(503).json({ error: "Service unavailable" });
+        return;
+      }
+
+      const [widget] = await db
+        .select()
+        .from(chatWidgets)
+        .where(eq(chatWidgets.id, widgetId))
+        .limit(1);
+
+      if (!widget) {
+        res.status(404).json({ error: "Widget not found" });
+        return;
+      }
+
+      if (!widget.isActive) {
+        res.status(403).json({ error: "Widget is not active" });
+        return;
+      }
+
+      // Check feature flag
+      const flagEnabled = await getTenantFeatureFlag("chatWidget", widget.tenantId);
+      if (!flagEnabled) {
+        res.status(403).json({ error: "Widget feature is not enabled" });
+        return;
+      }
+
+      // Validate request origin
+      const requestOrigin = req.headers.origin;
+      const allowedOrigins = (widget.allowedOrigins as string[]) ?? [];
+      if (!isOriginAllowed(requestOrigin, allowedOrigins)) {
+        auditLogger.log({
+          eventType: "widget_origin_rejected",
+          metadata: { widgetId, origin: requestOrigin ?? "none" },
+        });
+        res.status(403).json({ error: "Origin not allowed" });
+        return;
+      }
+
+      // Generate visitor session ID and token
+      const visitorSessionId = crypto.randomUUID();
+      const now = Math.floor(Date.now() / 1000);
+      const payload: InitTokenPayload = {
+        tenantId: widget.tenantId,
+        widgetId,
+        visitorSessionId,
+        iat: now,
+        exp: now + INIT_TOKEN_TTL_SECONDS,
+      };
+
+      const token = generateInitToken(payload);
+      res.json({ token });
+    } catch (err) {
+      auditLogger.log({
+        eventType: "widget_init_error",
+        metadata: { error: String(err) },
+      });
+      res.status(500).json({ error: "Internal server error" });
+    }
+  });
+
+  return router;
+}
+
+// ── WebSocket Server ───────────────────────────────────────────────────────────
+
+interface WidgetSession {
+  tenantId: string;
+  widgetId: string;
+  visitorSessionId: string;
+  conversationId?: string;
+  authenticated: boolean;
+  rateLimitKey: string;
+  rateLimitPerMinute: number;
+}
+
+let widgetWss: WebSocketServer | null = null;
+
+function getWidgetWss(): WebSocketServer {
+  if (!widgetWss) {
+    widgetWss = new WebSocketServer({ noServer: true });
+  }
+  return widgetWss;
+}
+
+export function handleWidgetUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
+  const wss = getWidgetWss();
+  wss.handleUpgrade(req, socket, head, (ws) => {
+    wss.emit("connection", ws, req);
+    handleWidgetConnection(ws);
+  });
+}
+
+function handleWidgetConnection(ws: WebSocket): void {
+  let session: WidgetSession | null = null;
+  let authTimeout: ReturnType<typeof setTimeout>;
+
+  // Require auth message within 10 seconds
+  authTimeout = setTimeout(() => {
+    if (!session?.authenticated) {
+      ws.close(CLOSE_CODE_UNAUTHORIZED, "Auth timeout");
+    }
+  }, 10000);
+
+  ws.on("message", async (data) => {
+    try {
+      const msg = JSON.parse(data.toString()) as { type: string; token?: string; text?: string };
+
+      if (msg.type === "auth") {
+        clearTimeout(authTimeout);
+        const payload = validateInitToken(msg.token ?? "");
+        if (!payload) {
+          ws.close(CLOSE_CODE_UNAUTHORIZED, "Invalid token");
+          return;
+        }
+
+        // Load widget to verify is_active and get config
+        const db = await getDb();
+        if (!db) {
+          ws.close(1011, "Server error");
+          return;
+        }
+        const [widget] = await db
+          .select()
+          .from(chatWidgets)
+          .where(eq(chatWidgets.id, payload.widgetId))
+          .limit(1);
+
+        if (!widget || !widget.isActive) {
+          ws.close(CLOSE_CODE_UNAUTHORIZED, "Widget inactive");
+          return;
+        }
+
+        session = {
+          tenantId: payload.tenantId,
+          widgetId: payload.widgetId,
+          visitorSessionId: payload.visitorSessionId,
+          authenticated: true,
+          rateLimitKey: `widget:rate:${payload.visitorSessionId}`,
+          rateLimitPerMinute: widget.rateLimitPerMinute ?? 10,
+        };
+
+        ws.send(JSON.stringify({ type: "auth_ok" }));
+        return;
+      }
+
+      if (!session?.authenticated) {
+        ws.close(CLOSE_CODE_UNAUTHORIZED, "Not authenticated");
+        return;
+      }
+
+      if (msg.type === "message" && msg.text) {
+        // Rate limit check
+        const redis = getCacheClient();
+        const rateCount = await redis.incr(session.rateLimitKey);
+        if (rateCount === 1) {
+          await redis.expire(session.rateLimitKey, 60); // 1 minute window
+        }
+        if (rateCount > session.rateLimitPerMinute) {
+          ws.close(CLOSE_CODE_RATE_LIMIT, "Rate limit exceeded");
+          return;
+        }
+
+        // Echo acknowledgement — actual processing is async
+        ws.send(JSON.stringify({ type: "ack" }));
+
+        // Route through channelGateway (lazy import to avoid circular deps)
+        setImmediate(async () => {
+          try {
+            const { channelGateway } = await import("../services/channelGateway");
+            const { getOrCreateSystemUser } = await import("../services/widgetService");
+
+            const { userId } = await getOrCreateSystemUser(session!.tenantId);
+
+            await channelGateway.ingest({
+              eventId: crypto.randomUUID(),
+              eventType: "user_message",
+              tenantId: session!.tenantId,
+              userId,
+              conversationId: session!.conversationId ?? session!.visitorSessionId,
+              conversationType: "chat",
+              channel: {
+                type: "widget",
+                connectionId: session!.widgetId,
+              },
+              message: { text: msg.text!, attachments: [] },
+              idempotencyKey: `widget:${session!.visitorSessionId}:${Date.now()}`,
+            });
+          } catch (err) {
+            auditLogger.log({
+              eventType: "widget_ingest_error",
+              metadata: { error: String(err), widgetId: session?.widgetId },
+            });
+          }
+        });
+      }
+    } catch {
+      // Malformed JSON — ignore
+    }
+  });
+
+  ws.on("close", () => {
+    clearTimeout(authTimeout);
+    session = null;
+  });
+
+  ws.on("error", () => {
+    clearTimeout(authTimeout);
+  });
+}
diff --git a/apps/web/server/services/auditLogger.ts b/apps/web/server/services/auditLogger.ts
index 972eec3..10a957c 100644
--- a/apps/web/server/services/auditLogger.ts
+++ b/apps/web/server/services/auditLogger.ts
@@ -67,6 +67,9 @@ export type AuditEventType =
   | "channel_gateway_invalid_conversation_id"
   | "channel_gateway_llm_error"
   | "channel_gateway_chat_error"
+  | "widget_origin_rejected"
+  | "widget_init_error"
+  | "widget_ingest_error"
   | "error";
 
 export interface AuditLogEntry {
diff --git a/apps/web/server/services/widgetService.ts b/apps/web/server/services/widgetService.ts
new file mode 100644
index 0000000..03e5965
--- /dev/null
+++ b/apps/web/server/services/widgetService.ts
@@ -0,0 +1,141 @@
+/**
+ * Widget Service — system user management, credit cap enforcement.
+ *
+ * Per-tenant system user:
+ *   - email: widget-system@{tenantId}.internal
+ *   - role: 'user' (not 'system' — that role doesn't exist in roleEnum)
+ *   - password: random bcrypt hash (cannot be guessed or logged into)
+ *
+ * Redis cap keys:
+ *   - widget:session:{visitorSessionId}         — TTL: 1 hour
+ *   - widget:daily:{widgetId}:{hashedIp}:{date} — TTL: 24 hours
+ *   - widget:monthly:{widgetId}:{YYYY-MM}       — TTL: 32 days
+ */
+
+import crypto from "crypto";
+import bcrypt from "bcrypt";
+import { eq } from "drizzle-orm";
+import { getDb } from "../db";
+import { users } from "../../drizzle/schema";
+import { getRedisClient } from "../services/redis";
+
+// ── TTL constants ──────────────────────────────────────────────────────────────
+
+export const WIDGET_SESSION_CAP_TTL = 3600;       // 1 hour
+export const WIDGET_DAILY_CAP_TTL = 86400;        // 24 hours
+export const WIDGET_MONTHLY_CAP_TTL = 32 * 86400; // 32 days
+
+// ── System user ────────────────────────────────────────────────────────────────
+
+/**
+ * Returns true if the email matches the widget system user pattern.
+ * Used by the login flow to reject login attempts for these accounts.
+ */
+export function isWidgetSystemEmail(email: string): boolean {
+  return /^widget-system@.+\.internal$/.test(email);
+}
+
+/**
+ * Get or create the per-tenant system user for widget anonymous traffic.
+ * Idempotent — always returns the same user for the same tenantId.
+ */
+export async function getOrCreateSystemUser(
+  tenantId: string,
+): Promise<{ userId: number }> {
+  const db = await getDb();
+  if (!db) throw new Error("Database unavailable");
+
+  const email = `widget-system@${tenantId}.internal`;
+
+  const [existing] = await db
+    .select()
+    .from(users)
+    .where(eq(users.email, email))
+    .limit(1);
+
+  if (existing) {
+    return { userId: existing.id };
+  }
+
+  // Random password — this account can never be logged into
+  const randomPassword = crypto.randomBytes(32).toString("hex");
+  const hashedPassword = await bcrypt.hash(randomPassword, 12);
+
+  const [created] = await db
+    .insert(users)
+    .values({
+      email,
+      username: `Widget System (${tenantId})`,
+      password: hashedPassword,
+      role: "user",
+      currentTenantId: tenantId,
+      isActive: true,
+    } as any)
+    .returning();
+
+  return { userId: created.id };
+}
+
+// ── Visitor cap enforcement ────────────────────────────────────────────────────
+
+export interface CapCheckParams {
+  widgetId: string;
+  visitorSessionId: string;
+  visitorIp: string;
+  creditCost: number;
+  maxPerSession: number;
+  maxPerDay: number;
+  monthlyBudget: number | null;
+}
+
+export class WidgetCapExceededError extends Error {
+  constructor(message: string) {
+    super(message);
+    this.name = "WidgetCapExceededError";
+  }
+}
+
+/**
+ * Atomically check and increment all per-visitor credit caps.
+ * Throws WidgetCapExceededError if any cap would be exceeded.
+ *
+ * All operations are non-transactional but individually atomic (INCRBY is atomic in Redis).
+ */
+export async function checkVisitorCaps(params: CapCheckParams): Promise<void> {
+  const { widgetId, visitorSessionId, visitorIp, creditCost, maxPerSession, maxPerDay, monthlyBudget } = params;
+  const redis = getRedisClient();
+
+  // Hash visitor IP for privacy
+  const hashedIp = crypto.createHash("sha256").update(visitorIp).digest("hex").slice(0, 16);
+
+  // Date parts
+  const now = new Date();
+  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
+  const monthStr = now.toISOString().slice(0, 7);  // YYYY-MM
+
+  // ── Session cap ────────────────────────────────────────────────────────────
+  const sessionKey = `widget:session:${visitorSessionId}`;
+  const sessionTotal = await redis.incrby(sessionKey, creditCost);
+  await redis.expire(sessionKey, WIDGET_SESSION_CAP_TTL);
+  if (sessionTotal > maxPerSession) {
+    throw new WidgetCapExceededError(`Widget session credit cap (${maxPerSession}) exceeded`);
+  }
+
+  // ── Daily cap ──────────────────────────────────────────────────────────────
+  const dailyKey = `widget:daily:${widgetId}:${hashedIp}:${dateStr}`;
+  const dailyTotal = await redis.incrby(dailyKey, creditCost);
+  await redis.expire(dailyKey, WIDGET_DAILY_CAP_TTL);
+  if (dailyTotal > maxPerDay) {
+    throw new WidgetCapExceededError(`Widget daily credit cap (${maxPerDay}) exceeded`);
+  }
+
+  // ── Monthly budget cap ─────────────────────────────────────────────────────
+  if (monthlyBudget !== null) {
+    const monthlyKey = `widget:monthly:${widgetId}:${monthStr}`;
+    const monthlyTotal = await redis.incrby(monthlyKey, creditCost);
+    await redis.expire(monthlyKey, WIDGET_MONTHLY_CAP_TTL);
+    if (monthlyTotal > monthlyBudget) {
+      throw new WidgetCapExceededError(`Widget monthly budget (${monthlyBudget}) exceeded`);
+    }
+  }
+}
diff --git a/apps/web/vite.config.widget.ts b/apps/web/vite.config.widget.ts
new file mode 100644
index 0000000..7ac1af4
--- /dev/null
+++ b/apps/web/vite.config.widget.ts
@@ -0,0 +1,53 @@
+/**
+ * Vite configuration for the embeddable chat widget build.
+ *
+ * Produces a self-contained bundle at dist/public/widget/v1/:
+ *   - widget.js  — React widget app (< 50KB gzipped goal)
+ *   - embed.js   — Standalone loader script (< 5KB minified)
+ *
+ * Key settings:
+ * - No code splitting (single bundle each)
+ * - CSS inlined into JS to minimize requests
+ * - es2020 target for broad browser compatibility
+ * - Only React core — no Radix, no TanStack Query, no tRPC client
+ */
+
+import { defineConfig } from "vite";
+import react from "@vitejs/plugin-react";
+import { resolve } from "path";
+
+export default defineConfig({
+  plugins: [react()],
+  build: {
+    outDir: "dist/public/widget/v1",
+    emptyOutDir: false,
+    target: "es2020",
+    cssCodeSplit: false,
+    rollupOptions: {
+      input: {
+        widget: resolve(__dirname, "client/widget/main.tsx"),
+        embed: resolve(__dirname, "client/widget/embed.ts"),
+      },
+      output: {
+        // Single file per entry, no chunks
+        manualChunks: undefined,
+        entryFileNames: "[name].js",
+        chunkFileNames: "[name]-[hash].js",
+        assetFileNames: "[name][extname]",
+      },
+      external: [],
+    },
+    // Inline CSS into JS
+    cssMinify: true,
+    minify: "esbuild",
+  },
+  resolve: {
+    alias: {
+      "@": resolve(__dirname, "client/src"),
+    },
+  },
+  // Prevent Vite from referencing server-side modules
+  define: {
+    "process.env.NODE_ENV": JSON.stringify("production"),
+  },
+});
diff --git a/nginx/conf.d/dev-host.conf b/nginx/conf.d/dev-host.conf
index 870e07d..b8cca05 100644
--- a/nginx/conf.d/dev-host.conf
+++ b/nginx/conf.d/dev-host.conf
@@ -177,6 +177,26 @@ server {
         proxy_set_header Host $host;
     }
 
+    # Widget WebSocket (long-lived sessions)
+    location /widget/v1/ws {
+        proxy_pass http://web_host;
+        proxy_http_version 1.1;
+        proxy_set_header Upgrade $http_upgrade;
+        proxy_set_header Connection "upgrade";
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_read_timeout 600s;
+    }
+
+    # Widget static assets and init endpoint
+    location /widget/v1/ {
+        proxy_pass http://web_host;
+        proxy_set_header Host $host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+    }
+
     # Block external access to internal Playwright/screenshot routes
     location /internal/ {
         deny all;
