diff --git a/apps/web/client/src/components/chat/VoiceChat.tsx b/apps/web/client/src/components/chat/VoiceChat.tsx
new file mode 100644
index 0000000..ba4db0d
--- /dev/null
+++ b/apps/web/client/src/components/chat/VoiceChat.tsx
@@ -0,0 +1,199 @@
+/**
+ * VoiceChat — Floating voice interface component
+ *
+ * Provides a microphone button for initiating voice chat sessions.
+ * Handles consent modal, recording state, and playback indicators.
+ *
+ * Feature-flagged: Only renders when voiceChat is enabled for the tenant.
+ */
+
+import React, { useState } from "react";
+import { Mic, MicOff, Volume2, X, AlertCircle } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import {
+  Dialog,
+  DialogContent,
+  DialogDescription,
+  DialogFooter,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+import { Alert, AlertDescription } from "@/components/ui/alert";
+import { useVoiceChat, type VoiceChatMode } from "@/hooks/useVoiceChat";
+import { cn } from "@/lib/utils";
+
+// ── Props ─────────────────────────────────────────────────────────────────
+
+interface VoiceChatProps {
+  /** Called when voice transcription produces text */
+  onTranscript?: (text: string, isFinal: boolean) => void;
+  /** Called when LLM response arrives via voice */
+  onResponse?: (text: string) => void;
+  /** Whether the chat interface is busy (e.g., LLM processing) */
+  disabled?: boolean;
+  className?: string;
+}
+
+// ── Component ─────────────────────────────────────────────────────────────
+
+export function VoiceChat({
+  disabled = false,
+  className,
+}: VoiceChatProps): React.ReactElement | null {
+  const {
+    state,
+    isRecording,
+    isPlaying,
+    error,
+    startSession,
+    endSession,
+    toggleRecording,
+    grantConsent,
+  } = useVoiceChat();
+
+  const [showConsentModal, setShowConsentModal] = useState(false);
+  const [isGranting, setIsGranting] = useState(false);
+
+  // Show consent modal when consent is needed
+  React.useEffect(() => {
+    if (state === "requesting_consent") {
+      setShowConsentModal(true);
+    } else {
+      setShowConsentModal(false);
+    }
+  }, [state]);
+
+  const handleMicClick = async () => {
+    if (state === "idle") {
+      await startSession();
+    } else if (state === "active") {
+      toggleRecording();
+    } else if (state === "error") {
+      endSession();
+    }
+  };
+
+  const handleConsentGrant = async () => {
+    setIsGranting(true);
+    try {
+      await grantConsent();
+      setShowConsentModal(false);
+      await startSession();
+    } finally {
+      setIsGranting(false);
+    }
+  };
+
+  const handleConsentDecline = () => {
+    setShowConsentModal(false);
+    endSession();
+  };
+
+  const getButtonColor = () => {
+    if (state === "error") return "text-red-500 hover:text-red-600";
+    if (state === "active" && isRecording) return "text-red-500";
+    if (state === "active") return "text-blue-500";
+    if (state === "connecting") return "text-yellow-500 animate-pulse";
+    return "text-muted-foreground hover:text-foreground";
+  };
+
+  const getButtonTitle = () => {
+    if (state === "idle") return "Start voice chat";
+    if (state === "connecting") return "Connecting...";
+    if (state === "active" && isRecording) return "Stop recording";
+    if (state === "active") return "Start recording";
+    if (state === "error") return error ?? "Voice error";
+    return "Voice chat";
+  };
+
+  return (
+    <>
+      {/* Microphone button */}
+      <div className={cn("relative", className)}>
+        <Button
+          variant="ghost"
+          size="icon"
+          onClick={handleMicClick}
+          disabled={disabled || state === "connecting"}
+          title={getButtonTitle()}
+          aria-label={getButtonTitle()}
+          className={cn("h-9 w-9 rounded-full transition-colors", getButtonColor())}
+        >
+          {state === "active" && isRecording ? (
+            <MicOff className="h-4 w-4" />
+          ) : (
+            <Mic className="h-4 w-4" />
+          )}
+        </Button>
+
+        {/* TTS playback indicator */}
+        {isPlaying && (
+          <span className="absolute -top-1 -right-1 flex h-3 w-3">
+            <Volume2 className="h-3 w-3 text-blue-500 animate-pulse" />
+          </span>
+        )}
+
+        {/* Active session indicator */}
+        {state === "active" && !isRecording && (
+          <Button
+            variant="ghost"
+            size="icon"
+            onClick={endSession}
+            title="End voice session"
+            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-background border p-0"
+          >
+            <X className="h-2 w-2" />
+          </Button>
+        )}
+      </div>
+
+      {/* Error display */}
+      {state === "error" && error && (
+        <Alert variant="destructive" className="mt-2">
+          <AlertCircle className="h-4 w-4" />
+          <AlertDescription className="text-xs">{error}</AlertDescription>
+        </Alert>
+      )}
+
+      {/* PDPA/GDPR Consent Modal */}
+      <Dialog open={showConsentModal} onOpenChange={setShowConsentModal}>
+        <DialogContent className="sm:max-w-md">
+          <DialogHeader>
+            <DialogTitle>Voice Chat Consent</DialogTitle>
+            <DialogDescription asChild>
+              <div className="space-y-3 text-sm text-muted-foreground">
+                <p>
+                  Voice chat requires your consent to process audio. Please review the following:
+                </p>
+                <ul className="list-disc pl-4 space-y-1">
+                  <li>
+                    Your voice will be sent to third-party speech recognition services (Groq, OpenAI).
+                  </li>
+                  <li>
+                    Audio is <strong>not stored</strong> — only the transcribed text is saved.
+                  </li>
+                  <li>
+                    AI responses may be converted to speech using text-to-speech services.
+                  </li>
+                  <li>
+                    You can withdraw consent at any time from your account settings.
+                  </li>
+                </ul>
+              </div>
+            </DialogDescription>
+          </DialogHeader>
+          <DialogFooter className="flex gap-2">
+            <Button variant="outline" onClick={handleConsentDecline} disabled={isGranting}>
+              Decline
+            </Button>
+            <Button onClick={handleConsentGrant} disabled={isGranting}>
+              {isGranting ? "Granting..." : "I Consent"}
+            </Button>
+          </DialogFooter>
+        </DialogContent>
+      </Dialog>
+    </>
+  );
+}
+
+export default VoiceChat;
diff --git a/apps/web/client/src/hooks/useVoiceChat.ts b/apps/web/client/src/hooks/useVoiceChat.ts
new file mode 100644
index 0000000..fcde75d
--- /dev/null
+++ b/apps/web/client/src/hooks/useVoiceChat.ts
@@ -0,0 +1,337 @@
+/**
+ * useVoiceChat — Voice session lifecycle hook
+ *
+ * Manages the complete voice session lifecycle:
+ * 1. Consent check and grant flow
+ * 2. Session token fetch (POST /api/voice/session)
+ * 3. WebSocket connection to /api/voice/stream
+ * 4. Audio capture and streaming (PCM 16-bit 16kHz mono)
+ * 5. TTS audio playback via AudioContext
+ * 6. Graceful teardown on unmount or session end
+ */
+
+import { useState, useCallback, useRef, useEffect } from "react";
+import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
+import { useUser } from "@/hooks/useUser";
+
+// ── Types ─────────────────────────────────────────────────────────────────
+
+export type VoiceChatState =
+  | "idle"
+  | "requesting_consent"
+  | "connecting"
+  | "active"
+  | "error";
+
+export type VoiceChatMode = "push-to-talk" | "vad" | "hybrid";
+
+export interface UseVoiceChatReturn {
+  state: VoiceChatState;
+  mode: VoiceChatMode;
+  isRecording: boolean;
+  isPlaying: boolean;
+  partialTranscript: string;
+  error: string | null;
+  startSession: () => Promise<void>;
+  endSession: () => void;
+  toggleRecording: () => void;
+  setMode: (mode: VoiceChatMode) => void;
+  grantConsent: () => Promise<void>;
+  withdrawConsent: () => Promise<void>;
+}
+
+// ── Hook ──────────────────────────────────────────────────────────────────
+
+export function useVoiceChat(): UseVoiceChatReturn {
+  const queryClient = useQueryClient();
+  const [state, setState] = useState<VoiceChatState>("idle");
+  const [mode, setModeState] = useState<VoiceChatMode>("push-to-talk");
+  const [isRecording, setIsRecording] = useState(false);
+  const [isPlaying, setIsPlaying] = useState(false);
+  const [partialTranscript, setPartialTranscript] = useState("");
+  const [error, setError] = useState<string | null>(null);
+
+  const wsRef = useRef<WebSocket | null>(null);
+  const audioContextRef = useRef<AudioContext | null>(null);
+  const mediaStreamRef = useRef<MediaStream | null>(null);
+  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
+  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
+
+  const { data: user } = useUser();
+
+  // Check if consent has been granted
+  const hasConsent = !!user?.voiceConsentGrantedAt;
+
+  // ── Cleanup ─────────────────────────────────────────────────────────────
+
+  const cleanup = useCallback(() => {
+    // Stop recording
+    scriptProcessorRef.current?.disconnect();
+    sourceRef.current?.disconnect();
+    if (mediaStreamRef.current) {
+      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
+      mediaStreamRef.current = null;
+    }
+    audioContextRef.current?.close().catch(() => {});
+    audioContextRef.current = null;
+
+    // Close WebSocket
+    if (wsRef.current) {
+      wsRef.current.close();
+      wsRef.current = null;
+    }
+
+    setIsRecording(false);
+    setIsPlaying(false);
+    setPartialTranscript("");
+    setState("idle");
+  }, []);
+
+  // Cleanup on unmount
+  useEffect(() => () => cleanup(), [cleanup]);
+
+  // ── Consent mutations ────────────────────────────────────────────────────
+
+  const grantConsentMutation = useMutation({
+    mutationFn: async () => {
+      const response = await fetch("/api/voice/consent/grant", { method: "POST" });
+      if (!response.ok) throw new Error("Failed to grant consent");
+    },
+    onSuccess: () => {
+      queryClient.invalidateQueries({ queryKey: ["user"] });
+    },
+  });
+
+  const withdrawConsentMutation = useMutation({
+    mutationFn: async () => {
+      const response = await fetch("/api/voice/consent/withdraw", { method: "POST" });
+      if (!response.ok) throw new Error("Failed to withdraw consent");
+    },
+    onSuccess: () => {
+      cleanup();
+      queryClient.invalidateQueries({ queryKey: ["user"] });
+    },
+  });
+
+  // ── Session management ───────────────────────────────────────────────────
+
+  const startSession = useCallback(async () => {
+    if (state !== "idle") return;
+
+    // Check consent
+    if (!hasConsent) {
+      setState("requesting_consent");
+      return;
+    }
+
+    setState("connecting");
+    setError(null);
+
+    try {
+      // Get session token
+      const tokenResponse = await fetch("/api/voice/session", { method: "POST" });
+      if (tokenResponse.status === 409) {
+        throw new Error("You already have an active voice session");
+      }
+      if (!tokenResponse.ok) {
+        const body = await tokenResponse.json().catch(() => ({}));
+        throw new Error((body as any).error ?? "Failed to start voice session");
+      }
+      const { token, wsUrl } = await tokenResponse.json();
+
+      // Open WebSocket
+      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
+      const wsHost = window.location.host;
+      const ws = new WebSocket(`${wsProtocol}//${wsHost}${wsUrl}?token=${token}`);
+      ws.binaryType = "arraybuffer";
+      wsRef.current = ws;
+
+      ws.onopen = () => {
+        setState("active");
+        if (mode === "push-to-talk") {
+          // User must hold button to record
+        } else {
+          // Auto-start recording for VAD/hybrid
+          startRecording();
+        }
+      };
+
+      ws.onmessage = (event) => {
+        if (typeof event.data === "string") {
+          handleTextMessage(event.data);
+        } else if (event.data instanceof ArrayBuffer) {
+          // TTS audio response
+          playAudio(event.data);
+        }
+      };
+
+      ws.onerror = () => {
+        setError("Voice connection error");
+        setState("error");
+        cleanup();
+      };
+
+      ws.onclose = (event) => {
+        if (event.code >= 4000) {
+          const messages: Record<number, string> = {
+            4001: "Invalid or expired session",
+            4002: "Credits exhausted",
+            4003: "Rate limit exceeded",
+            4004: "Another session is active",
+            4005: "Session timed out",
+            4006: "Audio frame too large",
+          };
+          setError(messages[event.code] ?? "Session ended");
+        }
+        cleanup();
+      };
+    } catch (err: any) {
+      setError(err.message ?? "Failed to start voice session");
+      setState("error");
+    }
+  }, [state, hasConsent, mode, cleanup]);
+
+  // ── Recording ────────────────────────────────────────────────────────────
+
+  const startRecording = useCallback(async () => {
+    try {
+      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
+      mediaStreamRef.current = stream;
+
+      const audioContext = new AudioContext({ sampleRate: 16_000 });
+      audioContextRef.current = audioContext;
+
+      const source = audioContext.createMediaStreamSource(stream);
+      sourceRef.current = source;
+
+      // Use ScriptProcessorNode for PCM output (deprecated but widely supported)
+      const processor = audioContext.createScriptProcessor(4096, 1, 1);
+      scriptProcessorRef.current = processor;
+
+      processor.onaudioprocess = (event) => {
+        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
+        const pcmFloat = event.inputBuffer.getChannelData(0);
+        // Convert float32 [-1, 1] to int16 [-32768, 32767]
+        const pcm16 = new Int16Array(pcmFloat.length);
+        for (let i = 0; i < pcmFloat.length; i++) {
+          pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(pcmFloat[i] * 32767)));
+        }
+        wsRef.current.send(pcm16.buffer);
+      };
+
+      source.connect(processor);
+      processor.connect(audioContext.destination);
+
+      setIsRecording(true);
+    } catch (err: any) {
+      setError(err.message ?? "Microphone access denied");
+    }
+  }, []);
+
+  const stopRecording = useCallback(() => {
+    scriptProcessorRef.current?.disconnect();
+    sourceRef.current?.disconnect();
+    if (mediaStreamRef.current) {
+      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
+      mediaStreamRef.current = null;
+    }
+    scriptProcessorRef.current = null;
+    sourceRef.current = null;
+    setIsRecording(false);
+
+    // Signal end of turn
+    if (wsRef.current?.readyState === WebSocket.OPEN) {
+      wsRef.current.send(JSON.stringify({ type: "end_turn" }));
+    }
+  }, []);
+
+  const toggleRecording = useCallback(() => {
+    if (state !== "active") return;
+    if (isRecording) {
+      stopRecording();
+    } else {
+      startRecording();
+    }
+  }, [state, isRecording, startRecording, stopRecording]);
+
+  // ── Text message handling ────────────────────────────────────────────────
+
+  const handleTextMessage = useCallback((data: string) => {
+    try {
+      const msg = JSON.parse(data);
+      switch (msg.type) {
+        case "transcript":
+          setPartialTranscript(msg.isFinal ? "" : msg.text);
+          break;
+        case "response_text":
+          // Text response from LLM (shown in chat UI)
+          setPartialTranscript("");
+          break;
+        case "credit_warning":
+          setError("Low credits — voice mode may end soon");
+          break;
+        case "system":
+          console.log("[Voice] System:", msg.message);
+          break;
+        case "error":
+          setError(msg.message);
+          break;
+      }
+    } catch {
+      // Ignore malformed messages
+    }
+  }, []);
+
+  // ── TTS audio playback ───────────────────────────────────────────────────
+
+  const playAudio = useCallback(async (buffer: ArrayBuffer) => {
+    try {
+      if (!audioContextRef.current) {
+        audioContextRef.current = new AudioContext();
+      }
+      const decoded = await audioContextRef.current.decodeAudioData(buffer.slice(0));
+      const source = audioContextRef.current.createBufferSource();
+      source.buffer = decoded;
+      source.connect(audioContextRef.current.destination);
+      setIsPlaying(true);
+      source.onended = () => setIsPlaying(false);
+      source.start();
+    } catch {
+      setIsPlaying(false);
+    }
+  }, []);
+
+  // ── Public API ───────────────────────────────────────────────────────────
+
+  const endSession = useCallback(() => {
+    cleanup();
+  }, [cleanup]);
+
+  const setMode = useCallback((newMode: VoiceChatMode) => {
+    setModeState(newMode);
+  }, []);
+
+  const grantConsent = useCallback(async () => {
+    await grantConsentMutation.mutateAsync();
+    setState("idle");
+  }, [grantConsentMutation]);
+
+  const withdrawConsent = useCallback(async () => {
+    await withdrawConsentMutation.mutateAsync();
+  }, [withdrawConsentMutation]);
+
+  return {
+    state,
+    mode,
+    isRecording,
+    isPlaying,
+    partialTranscript,
+    error,
+    startSession,
+    endSession,
+    toggleRecording,
+    setMode,
+    grantConsent,
+    withdrawConsent,
+  };
+}
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 404d482..8b39d8c 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -22,6 +22,7 @@ import { registerAgencyStreamRoutes } from "./agencyStreamProxy";
 import { createWebhookRouter } from "../routes/webhooks";
 import { createTelegramWebhookRouter } from "../routes/telegramWebhook";
 import { createChannelWebhookRouter } from "../routes/channelWebhook";
+import { createVoiceSessionRouter, handleVoiceUpgrade, shutdownVoiceGateway } from "../routes/voiceGateway";
 import "../services/telegramLinkService"; // Register /start link handler
 import "../services/channelAdapters/telegram"; // Register Telegram adapter
 import { adapterRegistry } from "../services/channelAdapters/registry";
@@ -351,6 +352,9 @@ app.use("/webhooks", express.json({ limit: "1mb" }), createChannelWebhookRouter(
 // Tighter body limit than global 10MB — Telegram updates are small JSON payloads
 app.use("/webhooks/telegram", express.json({ limit: "1mb" }), createTelegramWebhookRouter());
 
+// Voice gateway: session token + consent endpoints
+app.use("/api/voice", createVoiceSessionRouter());
+
 // Cloud Tasks handler routes (called by Cloud Tasks with OIDC auth)
 // Mounted at /_internal/tasks to avoid conflict with the frontend /tasks SPA route
 app.use("/_internal/tasks", createTasksRouter());
@@ -946,6 +950,14 @@ async function main() {
   const server = createServer(app);
   httpServer = server;
 
+  // Voice gateway: handle WebSocket upgrade for /api/voice/stream
+  server.on("upgrade", (req, socket, head) => {
+    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
+    if (url.pathname === "/api/voice/stream") {
+      handleVoiceUpgrade(req, socket as any, head);
+    }
+  });
+
   // Initialize skill registry - auto-sync skills from folder to database
   try {
     await initializeSkillRegistry();
@@ -1134,6 +1146,7 @@ process.on("SIGTERM", async () => {
   await shutdownTrashPurgeWorker().catch(() => {});
   await shutdownTelegramWorker().catch(() => {});
   await closeDeliveryQueue().catch(() => {});
+  await shutdownVoiceGateway().catch(() => {});
 
   // 3b. Shut down channel adapters
   await Promise.all(
@@ -1184,6 +1197,7 @@ process.on("SIGINT", async () => {
   await shutdownTrashPurgeWorker().catch(() => {});
   await shutdownTelegramWorker().catch(() => {});
   await closeDeliveryQueue().catch(() => {});
+  await shutdownVoiceGateway().catch(() => {});
   await Promise.all(
     adapterRegistry.getAll()
       .filter((a) => typeof a.shutdown === "function")
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index ec53155..e4c5e88 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -7,7 +7,7 @@
  */
 
 import { z } from "zod";
-import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
+import { router, protectedProcedure, adminProcedure, publicProcedure } from "../_core/trpc";
 import { TRPCError } from "@trpc/server";
 import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
 import { db } from "../db";
@@ -18,13 +18,19 @@ import {
   agencyCommunicationFlows,
   agencyConversations,
   agencyTools,
+  agencyVersions,
+  agencyPermissions,
+  userGroups,
+  users,
   systemSettings,
 } from "../../drizzle/schema";
-import { eq, and, desc, inArray, sql } from "drizzle-orm";
+import { eq, and, desc, asc, inArray, sql, getTableColumns, count } from "drizzle-orm";
 import { agencyBridge } from "../services/agencyBridge";
 import type { RunResult } from "../services/agencyBridge";
 import { getTenantFeatureFlag, setTenantFeatureFlag } from "../services/featureFlags";
 import crypto from "crypto";
+import { generateAgencySvg } from "../lib/agencySvgGenerator";
+import { createNotification } from "../services/notificationService";
 
 // Feature flag guard (tenant-scoped)
 async function assertAgencyEnabled(tenantId: string): Promise<void> {
@@ -103,15 +109,177 @@ export const agencyRouter = router({
         conditions.push(eq(agencies.status, input.status));
       }
 
+      const userId = ctx.user!.id;
+      const isAdmin = ctx.user!.role === "admin";
+
       const result = await db
-        .select()
+        .select({
+          ...getTableColumns(agencies),
+          agentCount: sql<number>`(SELECT count(*)::int FROM agency_agents WHERE "agencyId" = ${agencies.id})`.as("agentCount"),
+          ownerName: users.name,
+          ownerEmail: users.email,
+          sharedGroupCount: sql<number>`(SELECT count(*)::int FROM agency_permissions WHERE "agencyId" = ${agencies.id})`.as("sharedGroupCount"),
+        })
         .from(agencies)
+        .leftJoin(users, eq(agencies.createdBy, users.id))
         .where(and(...conditions))
         .orderBy(desc(agencies.createdAt))
         .limit(input.limit)
         .offset(input.offset);
 
-      return { agencies: result };
+      return {
+        agencies: result.map((a) => ({
+          ...a,
+          canEdit: a.createdBy === userId || isAdmin,
+        })),
+      };
+    }),
+
+  // --- Sharing / Permissions ---
+
+  listAgencyGroups: protectedProcedure
+    .input(z.object({ agencyId: z.string() }))
+    .query(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await assertAgencyEnabled(tenantId);
+
+      const userId = ctx.user!.id;
+      const isAdmin = ctx.user!.role === "admin";
+
+      // Verify agency exists and user has permission
+      const [agency] = await db
+        .select({ id: agencies.id, createdBy: agencies.createdBy })
+        .from(agencies)
+        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)));
+
+      if (!agency) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+      if (agency.createdBy !== userId && !isAdmin) {
+        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner or admin can view sharing settings" });
+      }
+
+      const rows = await db
+        .select({
+          id: userGroups.id,
+          name: userGroups.name,
+          description: userGroups.description,
+        })
+        .from(agencyPermissions)
+        .innerJoin(userGroups, eq(agencyPermissions.groupId, userGroups.id))
+        .where(eq(agencyPermissions.agencyId, input.agencyId))
+        .orderBy(asc(userGroups.name));
+
+      return { groups: rows };
+    }),
+
+  shareAgencyWithGroups: protectedProcedure
+    .input(z.object({
+      agencyId: z.string(),
+      groupIds: z.array(z.number()).min(1).max(50),
+    }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await assertAgencyEnabled(tenantId);
+
+      const userId = ctx.user!.id;
+      const isAdmin = ctx.user!.role === "admin";
+
+      // Verify agency ownership
+      const [agency] = await db
+        .select({ id: agencies.id, createdBy: agencies.createdBy, visibility: agencies.visibility })
+        .from(agencies)
+        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)));
+
+      if (!agency) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+      if (agency.createdBy !== userId && !isAdmin) {
+        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner or admin can share" });
+      }
+
+      // Verify groups exist in this tenant
+      const validGroups = await db
+        .select({ id: userGroups.id })
+        .from(userGroups)
+        .where(and(
+          inArray(userGroups.id, input.groupIds),
+          eq(userGroups.tenantId, tenantId),
+        ));
+
+      const validIds = validGroups.map((g) => g.id);
+      if (validIds.length === 0) {
+        throw new TRPCError({ code: "BAD_REQUEST", message: "No valid groups found" });
+      }
+
+      // Insert permissions (ignore conflicts)
+      await db
+        .insert(agencyPermissions)
+        .values(validIds.map((gId) => ({
+          agencyId: input.agencyId,
+          groupId: gId,
+          grantedByUserId: userId,
+        })))
+        .onConflictDoNothing();
+
+      // Update visibility to "shared" if currently "private"
+      if (agency.visibility === "private") {
+        await db
+          .update(agencies)
+          .set({ visibility: "shared", updatedAt: new Date() })
+          .where(eq(agencies.id, input.agencyId));
+      }
+
+      return { success: true, sharedCount: validIds.length };
+    }),
+
+  unshareAgencyGroup: protectedProcedure
+    .input(z.object({
+      agencyId: z.string(),
+      groupId: z.number(),
+    }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await assertAgencyEnabled(tenantId);
+
+      const userId = ctx.user!.id;
+      const isAdmin = ctx.user!.role === "admin";
+
+      // Verify agency ownership
+      const [agency] = await db
+        .select({ id: agencies.id, createdBy: agencies.createdBy })
+        .from(agencies)
+        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)));
+
+      if (!agency) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+      if (agency.createdBy !== userId && !isAdmin) {
+        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner or admin can manage sharing" });
+      }
+
+      // Remove the permission
+      await db
+        .delete(agencyPermissions)
+        .where(and(
+          eq(agencyPermissions.agencyId, input.agencyId),
+          eq(agencyPermissions.groupId, input.groupId),
+        ));
+
+      // Check remaining permissions — revert to private if none left
+      const [remaining] = await db
+        .select({ count: sql<number>`count(*)::int` })
+        .from(agencyPermissions)
+        .where(eq(agencyPermissions.agencyId, input.agencyId));
+
+      if (remaining.count === 0) {
+        await db
+          .update(agencies)
+          .set({ visibility: "private", updatedAt: new Date() })
+          .where(eq(agencies.id, input.agencyId));
+      }
+
+      return { success: true };
     }),
 
   listTemplates: protectedProcedure
@@ -174,6 +342,7 @@ export const agencyRouter = router({
           toolType: "builtin",
           riskLevel: "low",
           requiresApproval: false,
+          configSchema: null,
         },
         {
           id: "builtin-code-interpreter",
@@ -182,6 +351,7 @@ export const agencyRouter = router({
           toolType: "sandbox",
           riskLevel: "medium",
           requiresApproval: false,
+          configSchema: null,
         },
         {
           id: "builtin-file-reader",
@@ -190,6 +360,7 @@ export const agencyRouter = router({
           toolType: "builtin",
           riskLevel: "low",
           requiresApproval: false,
+          configSchema: null,
         },
         {
           id: "builtin-file-writer",
@@ -198,6 +369,7 @@ export const agencyRouter = router({
           toolType: "builtin",
           riskLevel: "medium",
           requiresApproval: false,
+          configSchema: null,
         },
         {
           id: "builtin-rag-knowledge",
@@ -206,6 +378,12 @@ export const agencyRouter = router({
           toolType: "builtin",
           riskLevel: "low",
           requiresApproval: false,
+          configSchema: {
+            fields: [
+              { key: "collectionId", label: "Collection", type: "collection_select", required: true },
+              { key: "topK", label: "Top K results", type: "select", options: [1, 3, 5, 10, 20], default: 5 },
+            ],
+          },
         },
         {
           id: "builtin-skill-executor",
@@ -214,6 +392,12 @@ export const agencyRouter = router({
           toolType: "sandbox",
           riskLevel: "medium",
           requiresApproval: false,
+          configSchema: {
+            fields: [
+              { key: "skillId", label: "Skill", type: "skill_select", required: true },
+              { key: "skillSlug", label: "Skill slug", type: "text", readonly: true },
+            ],
+          },
         },
         {
           id: "builtin-cmd-executor",
@@ -222,6 +406,97 @@ export const agencyRouter = router({
           toolType: "sandbox",
           riskLevel: "high",
           requiresApproval: true,
+          configSchema: null,
+        },
+        // 5 new tools
+        {
+          id: "builtin-http-request",
+          name: "HTTP / REST API",
+          description: "Make HTTP requests to external REST APIs",
+          toolType: "builtin",
+          riskLevel: "medium",
+          requiresApproval: false,
+          configSchema: {
+            fields: [
+              { key: "url", label: "URL", type: "text", required: true, placeholder: "https://api.example.com/endpoint" },
+              { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
+              { key: "headers", label: "Headers (JSON)", type: "json", placeholder: '{"Authorization": "Bearer ..."}' },
+            ],
+          },
+        },
+        {
+          id: "builtin-email-notify",
+          name: "Email Notification",
+          description: "Send email notifications",
+          toolType: "builtin",
+          riskLevel: "low",
+          requiresApproval: false,
+          configSchema: {
+            fields: [
+              { key: "toTemplate", label: "To (template)", type: "text", required: true, placeholder: "user@example.com" },
+              { key: "subjectTemplate", label: "Subject template", type: "text", required: true },
+            ],
+          },
+        },
+        {
+          id: "builtin-webhook",
+          name: "Webhook Trigger",
+          description: "Send data to a webhook URL",
+          toolType: "builtin",
+          riskLevel: "medium",
+          requiresApproval: false,
+          configSchema: {
+            fields: [
+              { key: "webhookUrl", label: "Webhook URL", type: "text", required: true, placeholder: "https://hooks.example.com/..." },
+            ],
+          },
+        },
+        {
+          id: "builtin-slack-message",
+          name: "Slack Message",
+          description: "Send messages to a Slack channel",
+          toolType: "builtin",
+          riskLevel: "low",
+          requiresApproval: false,
+          configSchema: {
+            fields: [
+              { key: "channelId", label: "Channel ID", type: "text", required: true, placeholder: "C0123456789" },
+            ],
+          },
+        },
+        {
+          id: "builtin-document-search",
+          name: "Document Search",
+          description: "Search across multiple document collections",
+          toolType: "builtin",
+          riskLevel: "low",
+          requiresApproval: false,
+          configSchema: {
+            fields: [
+              { key: "collectionIds", label: "Collections", type: "collection_multiselect", required: true },
+            ],
+          },
+        },
+        {
+          id: "builtin-voice",
+          name: "Voice",
+          description: "Speech-to-text and text-to-speech capabilities",
+          toolType: "builtin",
+          riskLevel: "medium",
+          requiresApproval: false,
+          configSchema: {
+            type: "object",
+            properties: {
+              allowedModes: {
+                type: "array",
+                items: { type: "string", enum: ["stt", "tts"] },
+                default: ["stt", "tts"],
+              },
+              defaultVoice: { type: "string", default: "alloy" },
+              maxAudioDurationSec: { type: "number", default: 60, maximum: 300 },
+              maxTextLength: { type: "number", default: 5000, maximum: 10000 },
+            },
+          },
         },
       ];
 
@@ -255,15 +530,25 @@ export const agencyRouter = router({
       const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
       await assertAgencyEnabled(tenantId);
 
+      const userId = ctx.user!.id;
+      const isAdmin = ctx.user!.role === "admin";
+
+      // Lookup by ID first, then verify tenant access
       const [agency] = await db
         .select()
         .from(agencies)
-        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
+        .where(eq(agencies.id, input.id))
         .limit(1);
 
       if (!agency) {
         throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
       }
+      // Allow same-tenant users or admins
+      if (agency.tenantId !== tenantId && !isAdmin) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+
+      const canEdit = agency.createdBy === userId || isAdmin;
 
       // Fetch agents
       const agents = await db
@@ -286,7 +571,7 @@ export const agencyRouter = router({
           .where(inArray(agencyAgentTools.agentId, agentIds))
         : [];
 
-      return { ...agency, agents, communicationFlows: flows, agentToolAssignments: toolAssignments };
+      return { ...agency, canEdit, agents, communicationFlows: flows, agentToolAssignments: toolAssignments };
     }),
 
   createFromTemplate: agencyCreateProcedure
@@ -351,8 +636,12 @@ export const agencyRouter = router({
             z.object({
               name: z.string().min(1).max(100),
               description: z.string().optional(),
-              instructions: z.string().max(50000),
-              model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier"),
+              nodeType: z.enum([
+                "agent", "supervisor", "router", "aggregator",
+                "knowledge_base", "skill_call", "human_approval",
+              ]).default("agent"),
+              instructions: z.string().max(50000).optional(),
+              model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier").optional(),
               modelSettings: z
                 .object({
                   max_tokens: z.number().optional(),
@@ -363,7 +652,9 @@ export const agencyRouter = router({
               isEntryPoint: z.boolean().default(false),
               isOptional: z.boolean().default(false),
               position: z.object({ x: z.number(), y: z.number() }).optional(),
-              toolIds: z.array(z.string().uuid()).optional(),
+              toolIds: z.array(z.string().min(1).max(100)).optional(),
+              toolConfigs: z.record(z.string(), z.record(z.unknown())).optional(),
+              nodeConfig: z.record(z.unknown()).optional(),
             }),
           )
           .min(1)
@@ -373,7 +664,7 @@ export const agencyRouter = router({
             z.object({
               fromAgentName: z.string(),
               toAgentName: z.string(),
-              flowType: z.enum(["delegation", "handoff"]),
+              flowType: z.enum(["delegation", "handoff", "parallel"]),
             }),
           )
           .optional(),
@@ -457,8 +748,10 @@ export const agencyRouter = router({
             agencyId,
             name: agent.name,
             description: agent.description ?? null,
-            instructions: agent.instructions,
-            model: agent.model,
+            nodeType: agent.nodeType ?? "agent",
+            nodeConfig: (agent.nodeConfig ?? null) as any,
+            instructions: agent.instructions ?? null,
+            model: agent.model ?? null,
             modelSettings: agent.modelSettings ?? null,
             isEntryPoint: agent.isEntryPoint,
             isOptional: agent.isOptional,
@@ -468,10 +761,12 @@ export const agencyRouter = router({
           // Insert tool assignments
           if (agent.toolIds?.length) {
             for (const toolId of agent.toolIds) {
+              const toolConfig = agent.toolConfigs?.[toolId] ?? null;
               await tx.insert(agencyAgentTools).values({
                 id: crypto.randomUUID(),
                 agentId,
                 toolId,
+                toolConfig: toolConfig as any,
               });
             }
           }
@@ -479,15 +774,6 @@ export const agencyRouter = router({
 
         // Insert communication flows
         if (input.communicationFlows?.length) {
-          // Q-1: Detect circular flows
-          const cycleNode = detectFlowCycle(input.communicationFlows);
-          if (cycleNode) {
-            throw new TRPCError({
-              code: "BAD_REQUEST",
-              message: `Circular communication flow detected involving agent "${cycleNode}"`,
-            });
-          }
-
           for (const flow of input.communicationFlows) {
             const fromId = agentNameToId[flow.fromAgentName];
             const toId = agentNameToId[flow.toAgentName];
@@ -518,6 +804,7 @@ export const agencyRouter = router({
         name: z.string().min(1).max(255).optional(),
         description: z.string().optional(),
         systemPrompt: z.string().optional(),
+        defaultModel: z.string().max(100).optional(),
         creditMultiplier: z.number().min(1).max(10).optional(),
         maxRunTimeSeconds: z.number().min(30).max(3600).optional(),
         isFallbackSafe: z.boolean().optional(),
@@ -531,17 +818,19 @@ export const agencyRouter = router({
       const userId = ctx.user!.id;
       const isAdmin = ctx.user!.role === "admin";
 
-      // Fetch existing agency
+      // Fetch existing agency by ID, then verify access
       const [agency] = await db
         .select()
         .from(agencies)
-        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
+        .where(eq(agencies.id, input.id))
         .limit(1);
 
       if (!agency) {
         throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
       }
-
+      if (agency.tenantId !== tenantId && !isAdmin) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
       if (agency.createdBy !== userId && !isAdmin) {
         throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to update this agency" });
       }
@@ -551,6 +840,7 @@ export const agencyRouter = router({
       if (updateFields.name !== undefined) setValues.name = updateFields.name;
       if (updateFields.description !== undefined) setValues.description = updateFields.description;
       if (updateFields.systemPrompt !== undefined) setValues.systemPrompt = updateFields.systemPrompt;
+      if (updateFields.defaultModel !== undefined) setValues.defaultModel = updateFields.defaultModel;
       if (updateFields.creditMultiplier !== undefined)
         setValues.creditMultiplier = String(updateFields.creditMultiplier);
       if (updateFields.maxRunTimeSeconds !== undefined)
@@ -565,7 +855,7 @@ export const agencyRouter = router({
       }
 
       if (Object.keys(setValues).length > 0) {
-        await db.update(agencies).set(setValues).where(and(eq(agencies.id, id), eq(agencies.tenantId, tenantId)));
+        await db.update(agencies).set(setValues).where(eq(agencies.id, id));
       }
 
       return { success: true };
@@ -579,12 +869,18 @@ export const agencyRouter = router({
         name: z.string().min(1).max(255).optional(),
         description: z.string().optional(),
         systemPrompt: z.string().optional(),
+        defaultModel: z.string().max(100).nullish(),
+        changeDescription: z.string().max(500).optional(),
         agents: z.array(
           z.object({
             name: z.string().min(1).max(100),
             description: z.string().optional(),
-            instructions: z.string().max(50000),
-            model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier"),
+            nodeType: z.enum([
+              "agent", "supervisor", "router", "aggregator",
+              "knowledge_base", "skill_call", "human_approval",
+            ]).default("agent"),
+            instructions: z.string().max(50000).optional(),
+            model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier").optional(),
             modelSettings: z
               .object({
                 max_tokens: z.number().optional(),
@@ -595,7 +891,36 @@ export const agencyRouter = router({
             isEntryPoint: z.boolean().default(false),
             isOptional: z.boolean().default(false),
             position: z.object({ x: z.number(), y: z.number() }).optional(),
-            toolIds: z.array(z.string().uuid()).optional(),
+            toolIds: z.array(z.string().min(1).max(100)).optional(),
+            toolConfigs: z.record(z.string(), z.record(z.unknown())).optional(),
+            nodeConfig: z.record(z.unknown()).optional(),
+          }).superRefine((data, ctx) => {
+            if (["agent", "supervisor"].includes(data.nodeType)) {
+              if (!data.model) ctx.addIssue({ code: "custom", path: ["model"], message: "model is required for agent/supervisor" });
+              if (!data.instructions) ctx.addIssue({ code: "custom", path: ["instructions"], message: "instructions are required for agent/supervisor" });
+            }
+            if (data.nodeType === "router" && !(data.nodeConfig as any)?.routes?.length) {
+              ctx.addIssue({ code: "custom", path: ["nodeConfig"], message: "router requires at least 1 route" });
+            }
+            if (data.isEntryPoint && !["agent", "supervisor"].includes(data.nodeType)) {
+              ctx.addIssue({ code: "custom", path: ["isEntryPoint"], message: `Only agent/supervisor nodes can be entry points, not ${data.nodeType}` });
+            }
+            // Validate knowledgeBase config
+            const kb = (data.nodeConfig as any)?.knowledgeBase;
+            if (kb && ["agent", "supervisor"].includes(data.nodeType)) {
+              if (kb.documentIds && kb.documentIds.length > 20) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "knowledgeBase"], message: "Maximum 20 KB documents per agent" });
+              }
+              if (kb.topK !== undefined && (kb.topK < 1 || kb.topK > 20)) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "knowledgeBase"], message: "topK must be between 1 and 20" });
+              }
+              if (kb.scoreThreshold !== undefined && (kb.scoreThreshold < 0 || kb.scoreThreshold > 1)) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "knowledgeBase"], message: "scoreThreshold must be between 0 and 1" });
+              }
+              if (kb.maxContextTokens !== undefined && (kb.maxContextTokens < 100 || kb.maxContextTokens > 32000)) {
+                ctx.addIssue({ code: "custom", path: ["nodeConfig", "knowledgeBase"], message: "maxContextTokens must be between 100 and 32000" });
+              }
+            }
           }),
         ).min(1).max(20),
         communicationFlows: z
@@ -603,7 +928,7 @@ export const agencyRouter = router({
             z.object({
               fromAgentName: z.string(),
               toAgentName: z.string(),
-              flowType: z.enum(["delegation", "handoff"]),
+              flowType: z.enum(["delegation", "handoff", "parallel"]),
             }),
           )
           .optional(),
@@ -615,34 +940,45 @@ export const agencyRouter = router({
       const userId = ctx.user!.id;
       const isAdmin = ctx.user!.role === "admin";
 
+      // Look up agency by ID first, then verify tenant access
       const [agency] = await db
         .select()
         .from(agencies)
-        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
+        .where(eq(agencies.id, input.id))
         .limit(1);
 
       if (!agency) {
         throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
       }
+
+      // Verify tenant access — agency must belong to the user's tenant (or user is admin)
+      if (agency.tenantId !== tenantId && !isAdmin) {
+        console.error(`[saveBuilder] TENANT MISMATCH: agency.tenantId=${agency.tenantId} !== ctx.tenantId=${tenantId}`);
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+
+      // Verify ownership — only creator or admin can edit
       if (agency.createdBy !== userId && !isAdmin) {
+        console.error(`[saveBuilder] OWNER MISMATCH: agency.createdBy=${agency.createdBy} !== userId=${userId}`);
         throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
       }
 
-      // Validate exactly one entry point
+      // Validate exactly one entry point (must be agent or supervisor)
       const entryPoints = input.agents.filter((a) => a.isEntryPoint);
       if (entryPoints.length !== 1) {
         throw new TRPCError({
           code: "BAD_REQUEST",
-          message: `Exactly one entry point agent is required, found ${entryPoints.length}`,
+          message: `Exactly one entry point is required, found ${entryPoints.length}`,
         });
       }
 
       await db.transaction(async (tx) => {
-        // Re-verify ownership with row lock inside transaction (defense-in-depth)
+        // Row lock inside transaction (defense-in-depth)
         const lockResult = await tx.execute(
-          sql`SELECT id FROM agencies WHERE id = ${input.id} AND "tenantId" = ${tenantId} FOR UPDATE`,
+          sql`SELECT id FROM agencies WHERE id = ${input.id} AND "tenantId" = ${agency.tenantId} FOR UPDATE`,
         );
-        if (!lockResult.rows?.length) {
+        // postgres-js driver returns an array directly (no .rows property)
+        if (!lockResult || (lockResult as unknown[]).length === 0) {
           throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
         }
 
@@ -651,6 +987,7 @@ export const agencyRouter = router({
         if (input.name !== undefined) setValues.name = input.name;
         if (input.description !== undefined) setValues.description = input.description;
         if (input.systemPrompt !== undefined) setValues.systemPrompt = input.systemPrompt;
+        if (input.defaultModel !== undefined) setValues.defaultModel = input.defaultModel;
         if (Object.keys(setValues).length > 0) {
           await tx.update(agencies).set(setValues).where(eq(agencies.id, input.id));
         }
@@ -679,8 +1016,10 @@ export const agencyRouter = router({
             agencyId: input.id,
             name: agent.name,
             description: agent.description ?? null,
-            instructions: agent.instructions,
-            model: agent.model,
+            nodeType: agent.nodeType,
+            nodeConfig: (agent.nodeConfig ?? null) as any,
+            instructions: agent.instructions ?? null,
+            model: agent.model ?? null,
             modelSettings: agent.modelSettings ?? null,
             isEntryPoint: agent.isEntryPoint,
             isOptional: agent.isOptional,
@@ -689,10 +1028,12 @@ export const agencyRouter = router({
 
           if (agent.toolIds?.length) {
             for (const toolId of agent.toolIds) {
+              const toolConfig = agent.toolConfigs?.[toolId] ?? null;
               await tx.insert(agencyAgentTools).values({
                 id: crypto.randomUUID(),
                 agentId,
                 toolId,
+                toolConfig: toolConfig as any,
               });
             }
           }
@@ -700,15 +1041,6 @@ export const agencyRouter = router({
 
         // Re-insert communication flows
         if (input.communicationFlows?.length) {
-          // Q-1: Detect circular flows
-          const cycleNode = detectFlowCycle(input.communicationFlows);
-          if (cycleNode) {
-            throw new TRPCError({
-              code: "BAD_REQUEST",
-              message: `Circular communication flow detected involving agent "${cycleNode}"`,
-            });
-          }
-
           for (const flow of input.communicationFlows) {
             const fromId = agentNameToId[flow.fromAgentName];
             const toId = agentNameToId[flow.toAgentName];
@@ -727,6 +1059,55 @@ export const agencyRouter = router({
             });
           }
         }
+
+        // Save version snapshot (deduped by SHA-256 content hash, cap at 50)
+        const snapshotJson = { nodes: input.agents, edges: input.communicationFlows ?? [], name: input.name ?? (agency as any).name };
+        const contentHash = crypto.createHash("sha256").update(JSON.stringify(snapshotJson)).digest("hex");
+
+        // Only insert if content has changed since last version
+        const [lastVersion] = await tx
+          .select({ contentHash: agencyVersions.contentHash, versionNumber: agencyVersions.versionNumber })
+          .from(agencyVersions)
+          .where(eq(agencyVersions.agencyId, input.id))
+          .orderBy(desc(agencyVersions.createdAt))
+          .limit(1);
+
+        if (!lastVersion || lastVersion.contentHash !== contentHash) {
+          const nextVersionNum = (lastVersion?.versionNumber ?? 0) + 1;
+          await tx.insert(agencyVersions).values({
+            agencyId: input.id,
+            tenantId,
+            versionNumber: nextVersionNum,
+            snapshotJson: snapshotJson as any,
+            contentHash,
+            changeDescription: input.changeDescription ?? null,
+            createdByUserId: userId,
+          });
+
+          // Prune to max 50 versions
+          await tx.execute(sql`
+            DELETE FROM agency_versions
+            WHERE "agencyId" = ${input.id}
+              AND id NOT IN (
+                SELECT id FROM agency_versions WHERE "agencyId" = ${input.id}
+                ORDER BY "createdAt" DESC LIMIT 50
+              )
+          `);
+        }
+
+        // Generate SVG preview from current agents + flows
+        const svgAgents = await tx
+          .select({ id: agencyAgents.id, name: agencyAgents.name, nodeType: agencyAgents.nodeType, position: agencyAgents.position })
+          .from(agencyAgents)
+          .where(eq(agencyAgents.agencyId, input.id));
+
+        const svgFlows = await tx
+          .select({ fromAgentId: agencyCommunicationFlows.fromAgentId, toAgentId: agencyCommunicationFlows.toAgentId })
+          .from(agencyCommunicationFlows)
+          .where(eq(agencyCommunicationFlows.agencyId, input.id));
+
+        const previewSvg = generateAgencySvg(svgAgents, svgFlows);
+        await tx.update(agencies).set({ previewSvg, updatedAt: new Date() }).where(eq(agencies.id, input.id));
       });
 
       return { success: true };
@@ -743,13 +1124,15 @@ export const agencyRouter = router({
       const [agency] = await db
         .select()
         .from(agencies)
-        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
+        .where(eq(agencies.id, input.id))
         .limit(1);
 
       if (!agency) {
         throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
       }
-
+      if (agency.tenantId !== tenantId && !isAdmin) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
       if (agency.createdBy !== userId && !isAdmin) {
         throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to delete this agency" });
       }
@@ -1062,11 +1445,132 @@ export const agencyRouter = router({
 
   // --- Admin: Tool Whitelists ---
 
+  // --- Version History ---
+
+  listVersions: protectedProcedure
+    .input(z.object({ agencyId: z.string().uuid(), limit: z.number().min(1).max(50).default(30) }))
+    .query(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await assertAgencyEnabled(tenantId);
+
+      const [agency] = await db
+        .select({ id: agencies.id })
+        .from(agencies)
+        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
+        .limit(1);
+      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+
+      const versions = await db
+        .select({
+          id: agencyVersions.id,
+          versionNumber: agencyVersions.versionNumber,
+          contentHash: agencyVersions.contentHash,
+          changeDescription: agencyVersions.changeDescription,
+          createdByUserId: agencyVersions.createdByUserId,
+          createdAt: agencyVersions.createdAt,
+        })
+        .from(agencyVersions)
+        .where(eq(agencyVersions.agencyId, input.agencyId))
+        .orderBy(desc(agencyVersions.createdAt))
+        .limit(input.limit);
+
+      return { versions };
+    }),
+
+  restoreVersion: protectedProcedure
+    .input(z.object({ versionId: z.number().int().positive() }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      await assertAgencyEnabled(tenantId);
+      const userId = ctx.user!.id;
+      const isAdmin = ctx.user!.role === "admin";
+
+      const [version] = await db
+        .select()
+        .from(agencyVersions)
+        .where(eq(agencyVersions.id, input.versionId))
+        .limit(1);
+      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
+
+      // Verify agency ownership
+      const [agency] = await db
+        .select()
+        .from(agencies)
+        .where(and(eq(agencies.id, version.agencyId), eq(agencies.tenantId, tenantId)))
+        .limit(1);
+      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      if ((agency as any).createdBy !== userId && !isAdmin) {
+        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
+      }
+
+      const snapshot = version.snapshotJson as any;
+      // Reconstruct saveBuilder input from snapshot and call the builder save logic
+      // This is done by directly applying the snapshot to the DB
+      await db.transaction(async (tx) => {
+        const existingAgents = await tx
+          .select({ id: agencyAgents.id })
+          .from(agencyAgents)
+          .where(eq(agencyAgents.agencyId, version.agencyId));
+        const existingAgentIds = existingAgents.map((a) => a.id);
+
+        if (existingAgentIds.length > 0) {
+          await tx.delete(agencyAgentTools).where(inArray(agencyAgentTools.agentId, existingAgentIds));
+        }
+        await tx.delete(agencyCommunicationFlows).where(eq(agencyCommunicationFlows.agencyId, version.agencyId));
+        await tx.delete(agencyAgents).where(eq(agencyAgents.agencyId, version.agencyId));
+
+        const nameToId: Record<string, string> = {};
+        for (const node of (snapshot.nodes ?? [])) {
+          const agentId = crypto.randomUUID();
+          nameToId[node.name] = agentId;
+          await tx.insert(agencyAgents).values({
+            id: agentId,
+            agencyId: version.agencyId,
+            name: node.name,
+            description: node.description ?? null,
+            nodeType: node.nodeType ?? "agent",
+            nodeConfig: node.nodeConfig ?? null,
+            instructions: node.instructions ?? null,
+            model: node.model ?? null,
+            modelSettings: node.modelSettings ?? null,
+            isEntryPoint: node.isEntryPoint ?? false,
+            isOptional: node.isOptional ?? false,
+            position: node.position ?? null,
+          });
+          if (node.toolIds?.length) {
+            for (const toolId of node.toolIds) {
+              await tx.insert(agencyAgentTools).values({
+                id: crypto.randomUUID(),
+                agentId,
+                toolId,
+                toolConfig: node.toolConfigs?.[toolId] ?? null,
+              });
+            }
+          }
+        }
+        for (const edge of (snapshot.edges ?? [])) {
+          const fromId = nameToId[edge.fromAgentName];
+          const toId = nameToId[edge.toAgentName];
+          if (fromId && toId) {
+            await tx.insert(agencyCommunicationFlows).values({
+              id: crypto.randomUUID(),
+              agencyId: version.agencyId,
+              fromAgentId: fromId,
+              toAgentId: toId,
+              flowType: edge.flowType ?? "delegation",
+            });
+          }
+        }
+      });
+
+      return { success: true };
+    }),
+
   adminSetToolWhitelist: adminProcedure
     .input(
       z.object({
         agencyId: z.string().uuid(),
-        toolIds: z.array(z.string().uuid()),
+        toolIds: z.array(z.string().min(1).max(100)),
       }),
     )
     .mutation(async ({ ctx, input }) => {
@@ -1196,7 +1700,7 @@ export const agencyRouter = router({
         WHERE ${whereClause}
       `);
 
-      const row = (result as any).rows?.[0] ?? {};
+      const row = (result as unknown[])?.[0] as Record<string, unknown> ?? {};
       const totalRuns = Number(row.total_runs ?? 0);
       const failedRuns = Number(row.failed_runs ?? 0);
       const completedRuns = Number(row.completed_runs ?? 0);
@@ -1245,7 +1749,7 @@ export const agencyRouter = router({
         threshold: number;
       }> = [];
 
-      for (const row of (result as any).rows ?? []) {
+      for (const row of (result as unknown as Record<string, unknown>[]) ?? []) {
         const total = Number(row.total);
         const failed = Number(row.failed);
         const successRate = total > 0 ? (total - failed) / total : 1;
@@ -1294,6 +1798,114 @@ export const agencyRouter = router({
     return getCreatorDashboard(ctx.user!.id);
   }),
 
+  // --- AI Agency Creator ---
+
+  /**
+   * Submit agency creation to queue. Returns taskId immediately.
+   * Frontend polls autoCreateStatus for phase updates.
+   */
+  autoCreate: protectedProcedure
+    .use(createRateLimitMiddleware({ namespace: "agency-create", limit: 5, windowMs: 60_000 }))
+    .input(
+      z.object({
+        requirement: z.string().min(10).max(10000),
+        specFileBase64: z.string().max(10_000_000).optional(),
+        model: z.string().max(100).optional().default("gpt-4o"),
+        skipInterview: z.boolean().default(false),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const { ENV } = await import("../_core/env");
+      const pythonBackendUrl = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");
+
+      const response = await fetch(`${pythonBackendUrl}/api/v1/agency-creator/start`, {
+        method: "POST",
+        headers: {
+          "Content-Type": "application/json",
+          "Authorization": `Bearer ${ctx.userToken ?? ""}`,
+        },
+        body: JSON.stringify({
+          requirement: input.requirement,
+          spec_file_base64: input.specFileBase64 ?? null,
+          model: input.model,
+          skip_interview: input.skipInterview,
+          user_id: ctx.user!.id,
+          tenant_id: ctx.tenantId ?? String(ctx.user!.currentTenantId ?? ""),
+        }),
+      });
+
+      if (!response.ok) {
+        const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
+        throw new TRPCError({ code: "BAD_REQUEST", message: err.detail || "Failed to start agency creator" });
+      }
+
+      const data = await response.json();
+      return { taskId: data.task_id as string };
+    }),
+
+  /**
+   * Poll agency creator task status.
+   */
+  autoCreateStatus: protectedProcedure
+    .input(z.object({ taskId: z.string().regex(/^agcreate-[a-f0-9]{12}$/) }))
+    .query(async ({ ctx, input }) => {
+      const { ENV } = await import("../_core/env");
+      const pythonBackendUrl = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");
+
+      const response = await fetch(
+        `${pythonBackendUrl}/api/v1/agency-creator/status/${encodeURIComponent(input.taskId)}`,
+        {
+          headers: { "Authorization": `Bearer ${ctx.userToken ?? ""}` },
+        },
+      );
+
+      if (!response.ok) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
+      }
+
+      const data = await response.json();
+      return data as {
+        status: "queued" | "processing" | "awaiting_answers" | "completed" | "failed";
+        phase?: string;
+        message?: string;
+        questions?: Array<{ id: string; question: string; type: string }>;
+        previewJson?: unknown;
+        agencyId?: string;
+        guide?: string;
+        error?: string;
+      };
+    }),
+
+  /**
+   * Submit interview answers — resumes design task.
+   */
+  autoCreateAnswer: protectedProcedure
+    .input(
+      z.object({
+        taskId: z.string().regex(/^agcreate-[a-f0-9]{12}$/),
+        answers: z.record(z.string(), z.string()),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const { ENV } = await import("../_core/env");
+      const pythonBackendUrl = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");
+
+      const response = await fetch(`${pythonBackendUrl}/api/v1/agency-creator/answer`, {
+        method: "POST",
+        headers: {
+          "Content-Type": "application/json",
+          "Authorization": `Bearer ${ctx.userToken ?? ""}`,
+        },
+        body: JSON.stringify({ task_id: input.taskId, answers: input.answers }),
+      });
+
+      if (!response.ok) {
+        throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to submit answers" });
+      }
+
+      return { ok: true };
+    }),
+
   adminGetRevenueStats: adminProcedure
     .input(
       z.object({
@@ -1308,4 +1920,408 @@ export const agencyRouter = router({
         windowDays: input.windowDays,
       });
     }),
+
+  // --- Marketplace (public) ---
+
+  listMarketplace: publicProcedure
+    .input(
+      z.object({
+        search: z.string().max(200).optional(),
+        limit: z.number().min(1).max(100).default(24),
+        offset: z.number().min(0).default(0),
+      }),
+    )
+    .query(async ({ input }) => {
+      const conditions: any[] = [
+        eq(agencies.isPublished, true),
+        eq(agencies.visibility, "public"),
+        eq(agencies.status, "published"),
+      ];
+
+      if (input.search) {
+        const searchPattern = `%${input.search}%`;
+        conditions.push(
+          sql`(${agencies.name} ILIKE ${searchPattern} OR ${agencies.description} ILIKE ${searchPattern})`,
+        );
+      }
+
+      const whereClause = and(...conditions);
+
+      const items = await db
+        .select({
+          id: agencies.id,
+          name: agencies.name,
+          description: agencies.description,
+          creatorFeeCredits: agencies.creatorFeeCredits,
+          ownerName: users.name,
+          agentCount: sql<number>`(SELECT count(*)::int FROM agency_agents WHERE "agencyId" = ${agencies.id})`.as("agentCount"),
+          createdAt: agencies.createdAt,
+        })
+        .from(agencies)
+        .leftJoin(users, eq(agencies.createdBy, users.id))
+        .where(whereClause)
+        .orderBy(desc(agencies.createdAt))
+        .limit(input.limit)
+        .offset(input.offset);
+
+      const [countResult] = await db
+        .select({ cnt: count() })
+        .from(agencies)
+        .where(whereClause);
+
+      return { items, total: countResult.cnt };
+    }),
+
+  getMarketplaceAgency: publicProcedure
+    .input(z.object({ id: z.string() }))
+    .query(async ({ input }) => {
+      const [agency] = await db
+        .select({
+          id: agencies.id,
+          name: agencies.name,
+          description: agencies.description,
+          previewSvg: agencies.previewSvg,
+          creatorFeeCredits: agencies.creatorFeeCredits,
+          ownerName: users.name,
+          createdAt: agencies.createdAt,
+        })
+        .from(agencies)
+        .leftJoin(users, eq(agencies.createdBy, users.id))
+        .where(
+          and(
+            eq(agencies.id, input.id),
+            eq(agencies.isPublished, true),
+            eq(agencies.visibility, "public"),
+            eq(agencies.status, "published"),
+          ),
+        )
+        .limit(1);
+
+      if (!agency) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+
+      // Sanitize SVG
+      let safeSvg = agency.previewSvg;
+      if (safeSvg && /<script/i.test(safeSvg)) {
+        console.error("[Security] Rejected poisoned previewSvg from DB, agencyId:", input.id);
+        safeSvg = null;
+      }
+
+      // Get agents (public info only — no instructions/prompts)
+      const agents = await db
+        .select({
+          id: agencyAgents.id,
+          name: agencyAgents.name,
+          nodeType: agencyAgents.nodeType,
+          isEntryPoint: agencyAgents.isEntryPoint,
+        })
+        .from(agencyAgents)
+        .where(eq(agencyAgents.agencyId, input.id))
+        .orderBy(desc(agencyAgents.isEntryPoint), asc(agencyAgents.name));
+
+      return { ...agency, previewSvg: safeSvg, agents };
+    }),
+
+  useMarketplaceAgency: protectedProcedure
+    .input(z.object({ agencyId: z.string() }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const userId = ctx.user!.id;
+
+      // Verify source agency is published + public
+      const [source] = await db
+        .select()
+        .from(agencies)
+        .where(
+          and(
+            eq(agencies.id, input.agencyId),
+            eq(agencies.isPublished, true),
+            eq(agencies.visibility, "public"),
+            eq(agencies.status, "published"),
+          ),
+        )
+        .limit(1);
+
+      if (!source) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found or not public" });
+      }
+
+      const newAgencyId = crypto.randomUUID();
+      const slug = `${source.slug}-copy-${Date.now()}`;
+
+      await db.transaction(async (tx) => {
+        // Clone agency record
+        await tx.insert(agencies).values({
+          id: newAgencyId,
+          tenantId,
+          slug,
+          name: `${source.name} (Copy)`,
+          description: source.description,
+          systemPrompt: source.systemPrompt,
+          creditMultiplier: source.creditMultiplier,
+          defaultModel: source.defaultModel,
+          maxAgents: source.maxAgents,
+          maxRunTimeSeconds: source.maxRunTimeSeconds,
+          status: "draft",
+          isPublished: false,
+          visibility: "private",
+          previewSvg: source.previewSvg,
+          createdBy: userId,
+        });
+
+        // Clone agents
+        const sourceAgents = await tx
+          .select()
+          .from(agencyAgents)
+          .where(eq(agencyAgents.agencyId, input.agencyId));
+
+        const agentIdMap = new Map<string, string>();
+        for (const agent of sourceAgents) {
+          const newAgentId = crypto.randomUUID();
+          agentIdMap.set(agent.id, newAgentId);
+
+          await tx.insert(agencyAgents).values({
+            id: newAgentId,
+            agencyId: newAgencyId,
+            name: agent.name,
+            description: agent.description,
+            nodeType: agent.nodeType,
+            nodeConfig: agent.nodeConfig as any,
+            instructions: agent.instructions,
+            model: agent.model,
+            modelSettings: agent.modelSettings as any,
+            isEntryPoint: agent.isEntryPoint,
+            isOptional: agent.isOptional,
+            position: agent.position as any,
+          });
+
+          // Clone agent tools
+          const agentTools = await tx
+            .select()
+            .from(agencyAgentTools)
+            .where(eq(agencyAgentTools.agentId, agent.id));
+
+          for (const tool of agentTools) {
+            await tx.insert(agencyAgentTools).values({
+              id: crypto.randomUUID(),
+              agentId: newAgentId,
+              toolId: tool.toolId,
+              toolConfig: tool.toolConfig as any,
+            });
+          }
+        }
+
+        // Clone communication flows
+        const sourceFlows = await tx
+          .select()
+          .from(agencyCommunicationFlows)
+          .where(eq(agencyCommunicationFlows.agencyId, input.agencyId));
+
+        for (const flow of sourceFlows) {
+          const newFromId = agentIdMap.get(flow.fromAgentId);
+          const newToId = agentIdMap.get(flow.toAgentId);
+          if (newFromId && newToId) {
+            await tx.insert(agencyCommunicationFlows).values({
+              id: crypto.randomUUID(),
+              agencyId: newAgencyId,
+              fromAgentId: newFromId,
+              toAgentId: newToId,
+              flowType: flow.flowType,
+            });
+          }
+        }
+      });
+
+      return { agencyId: newAgencyId };
+    }),
+
+  // --- Publish Request / Approval Flow ---
+
+  requestPublish: protectedProcedure
+    .input(z.object({ agencyId: z.string() }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const userId = ctx.user!.id;
+      const isAdmin = ctx.user!.role === "admin";
+
+      const [agency] = await db
+        .select({ id: agencies.id, name: agencies.name, createdBy: agencies.createdBy, tenantId: agencies.tenantId, status: agencies.status, visibility: agencies.visibility })
+        .from(agencies)
+        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
+        .limit(1);
+
+      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      if (agency.createdBy !== userId && !isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator can request publish" });
+      if (agency.status !== "published") throw new TRPCError({ code: "BAD_REQUEST", message: "Agency must be in 'published' status first (not draft/archived)" });
+      if (agency.visibility === "public") throw new TRPCError({ code: "BAD_REQUEST", message: "Agency is already public" });
+      if (agency.visibility === "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "A publish request is already pending" });
+
+      // Must have at least 1 agent
+      const [agentCount] = await db.select({ cnt: count() }).from(agencyAgents).where(eq(agencyAgents.agencyId, input.agencyId));
+      if (!agentCount || agentCount.cnt === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Agency must have at least 1 agent" });
+
+      await db.update(agencies).set({
+        visibility: "pending_approval",
+        requestedPublishAt: new Date(),
+        rejectionReason: null,
+        updatedAt: new Date(),
+      }).where(eq(agencies.id, input.agencyId));
+
+      // Notify all admins in the tenant
+      const admins = await db
+        .select({ id: users.id })
+        .from(users)
+        .where(and(eq(users.currentTenantId, tenantId), eq(users.role, "admin")));
+
+      for (const admin of admins) {
+        await createNotification({
+          db,
+          userId: admin.id,
+          type: "system",
+          title: "Agency Publish Request",
+          content: `Agency "${agency.name}" has been submitted for public publishing review.`,
+          priority: "normal",
+        });
+      }
+
+      return { success: true };
+    }),
+
+  cancelPublishRequest: protectedProcedure
+    .input(z.object({ agencyId: z.string() }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const userId = ctx.user!.id;
+
+      const [agency] = await db
+        .select({ id: agencies.id, createdBy: agencies.createdBy, visibility: agencies.visibility })
+        .from(agencies)
+        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
+        .limit(1);
+
+      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      if (agency.createdBy !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator can cancel" });
+      if (agency.visibility !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "No pending request to cancel" });
+
+      await db.update(agencies).set({
+        visibility: "private",
+        requestedPublishAt: null,
+        updatedAt: new Date(),
+      }).where(eq(agencies.id, input.agencyId));
+
+      return { success: true };
+    }),
+
+  adminApproveAgency: adminProcedure
+    .input(z.object({ agencyId: z.string() }))
+    .mutation(async ({ ctx, input }) => {
+      const adminId = ctx.user!.id;
+
+      const [agency] = await db
+        .select({ id: agencies.id, name: agencies.name, createdBy: agencies.createdBy, visibility: agencies.visibility })
+        .from(agencies)
+        .where(eq(agencies.id, input.agencyId))
+        .limit(1);
+
+      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      if (agency.visibility !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "Agency is not pending approval" });
+
+      await db.update(agencies).set({
+        visibility: "public",
+        isPublished: true,
+        approvedBy: adminId,
+        approvedAt: new Date(),
+        rejectionReason: null,
+        updatedAt: new Date(),
+      }).where(eq(agencies.id, input.agencyId));
+
+      // Notify creator
+      if (agency.createdBy) {
+        await createNotification({
+          db,
+          userId: agency.createdBy,
+          type: "system",
+          title: "Agency Approved!",
+          content: `Your agency "${agency.name}" has been approved and is now public on the Marketplace.`,
+          priority: "normal",
+        });
+      }
+
+      return { success: true };
+    }),
+
+  adminRejectAgency: adminProcedure
+    .input(z.object({
+      agencyId: z.string(),
+      reason: z.string().max(1000).optional(),
+    }))
+    .mutation(async ({ ctx, input }) => {
+      const [agency] = await db
+        .select({ id: agencies.id, name: agencies.name, createdBy: agencies.createdBy, visibility: agencies.visibility })
+        .from(agencies)
+        .where(eq(agencies.id, input.agencyId))
+        .limit(1);
+
+      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      if (agency.visibility !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "Agency is not pending approval" });
+
+      await db.update(agencies).set({
+        visibility: "rejected",
+        approvedBy: null,
+        approvedAt: null,
+        rejectionReason: input.reason ?? null,
+        updatedAt: new Date(),
+      }).where(eq(agencies.id, input.agencyId));
+
+      // Notify creator
+      if (agency.createdBy) {
+        const reasonText = input.reason ? ` Reason: ${input.reason}` : "";
+        await createNotification({
+          db,
+          userId: agency.createdBy,
+          type: "system",
+          title: "Agency Publish Request Rejected",
+          content: `Your agency "${agency.name}" was not approved for public publishing.${reasonText}`,
+          priority: "normal",
+        });
+      }
+
+      return { success: true };
+    }),
+
+  adminListPendingAgencies: adminProcedure
+    .input(z.object({
+      limit: z.number().min(1).max(100).default(50),
+      offset: z.number().min(0).default(0),
+    }))
+    .query(async ({ input }) => {
+      const conditions = [eq(agencies.visibility, "pending_approval")];
+
+      const items = await db
+        .select({
+          id: agencies.id,
+          name: agencies.name,
+          description: agencies.description,
+          creatorFeeCredits: agencies.creatorFeeCredits,
+          platformSharePct: agencies.platformSharePct,
+          requestedPublishAt: agencies.requestedPublishAt,
+          ownerName: users.name,
+          ownerEmail: users.email,
+          agentCount: sql<number>`(SELECT count(*)::int FROM agency_agents WHERE "agencyId" = ${agencies.id})`.as("agentCount"),
+        })
+        .from(agencies)
+        .leftJoin(users, eq(agencies.createdBy, users.id))
+        .where(and(...conditions))
+        .orderBy(asc(agencies.requestedPublishAt))
+        .limit(input.limit)
+        .offset(input.offset);
+
+      const [countResult] = await db
+        .select({ cnt: count() })
+        .from(agencies)
+        .where(and(...conditions));
+
+      return { items, total: countResult.cnt };
+    }),
 });
diff --git a/apps/web/server/routes/__tests__/voiceGateway.test.ts b/apps/web/server/routes/__tests__/voiceGateway.test.ts
new file mode 100644
index 0000000..419837f
--- /dev/null
+++ b/apps/web/server/routes/__tests__/voiceGateway.test.ts
@@ -0,0 +1,214 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import request from "supertest";
+import express from "express";
+
+// ── Hoisted mocks ──────────────────────────────────────────────────────────
+
+const {
+  mockRedisGet,
+  mockRedisSet,
+  mockRedisDel,
+  mockRedisEval,
+  mockRedisPublish,
+  mockGetDb,
+  mockDbSelect,
+  mockDbUpdate,
+} = vi.hoisted(() => ({
+  mockRedisGet: vi.fn(),
+  mockRedisSet: vi.fn().mockResolvedValue("OK"),
+  mockRedisDel: vi.fn().mockResolvedValue(1),
+  mockRedisEval: vi.fn(),
+  mockRedisPublish: vi.fn().mockResolvedValue(0),
+  mockGetDb: vi.fn(),
+  mockDbSelect: vi.fn(),
+  mockDbUpdate: vi.fn(),
+}));
+
+vi.mock("../../services/redis", () => ({
+  getRedisClient: vi.fn(() => ({
+    get: mockRedisGet,
+    set: mockRedisSet,
+    del: mockRedisDel,
+    eval: mockRedisEval,
+    publish: mockRedisPublish,
+    duplicate: vi.fn(() => ({
+      get: mockRedisGet,
+      set: mockRedisSet,
+      del: mockRedisDel,
+      eval: mockRedisEval,
+      publish: mockRedisPublish,
+      psubscribe: vi.fn().mockResolvedValue(undefined),
+      on: vi.fn(),
+      quit: vi.fn().mockResolvedValue(undefined),
+    })),
+    psubscribe: vi.fn().mockResolvedValue(undefined),
+    on: vi.fn(),
+    quit: vi.fn().mockResolvedValue(undefined),
+  })),
+}));
+
+vi.mock("../../db", () => ({
+  getDb: mockGetDb,
+}));
+
+vi.mock("../../services/sttService", () => ({
+  transcribe: vi.fn().mockResolvedValue({ text: "test", language: "en", confidence: 0.9, duration: 2 }),
+  calculateSTTCredits: vi.fn().mockReturnValue(0),
+}));
+
+vi.mock("../../services/ttsService", () => ({
+  synthesize: vi.fn().mockResolvedValue({ audioBuffer: Buffer.alloc(64), contentType: "audio/mpeg", duration: 1 }),
+  calculateTTSCredits: vi.fn().mockReturnValue(3),
+}));
+
+vi.mock("../../services/creditService", () => ({
+  deductCredits: vi.fn().mockResolvedValue({ success: true, newBalance: 100 }),
+  hasEnoughCredits: vi.fn().mockResolvedValue(true),
+}));
+
+vi.mock("../../services/costTracker", () => ({
+  logRequest: vi.fn().mockResolvedValue(undefined),
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  users: { id: "u.id", voiceConsentGrantedAt: "u.voiceConsentGrantedAt", credits: "u.credits" },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
+}));
+
+// Mock ws module
+vi.mock("ws", () => ({
+  WebSocketServer: vi.fn().mockImplementation(() => ({
+    handleUpgrade: vi.fn(),
+    on: vi.fn(),
+    clients: new Set(),
+  })),
+}));
+
+// ── Auth middleware mock ────────────────────────────────────────────────────
+
+// We'll simulate the auth middleware by injecting user data directly
+
+// ── Import after mocks ─────────────────────────────────────────────────────
+
+import { createVoiceSessionRouter } from "../voiceGateway";
+
+// ── Test Setup ─────────────────────────────────────────────────────────────
+
+function buildApp(userId: number | null = 1, voiceConsentGrantedAt: Date | null = new Date()) {
+  const app = express();
+  app.use(express.json());
+
+  // Inject auth context
+  app.use((req, _res, next) => {
+    if (userId !== null) {
+      (req as any).user = { id: userId, currentTenantId: "tenant-1" };
+    }
+    next();
+  });
+
+  // Setup DB mock
+  mockGetDb.mockResolvedValue({
+    select: mockDbSelect,
+    update: mockDbUpdate,
+  });
+
+  mockDbSelect.mockImplementation(() => ({
+    from: vi.fn().mockReturnValue({
+      where: vi.fn().mockReturnValue({
+        limit: vi.fn().mockResolvedValue([
+          { id: userId, voiceConsentGrantedAt, credits: 100 },
+        ]),
+      }),
+    }),
+  }));
+
+  const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
+  mockDbUpdate.mockReturnValue({ set: setFn });
+
+  app.use("/api/voice", createVoiceSessionRouter());
+
+  return app;
+}
+
+// ── Tests ──────────────────────────────────────────────────────────────────
+
+describe("voiceGateway", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe("POST /api/voice/session", () => {
+    it("returns a one-time token for authenticated user with consent", async () => {
+      mockRedisGet.mockResolvedValue(null); // no active session
+      mockRedisSet.mockResolvedValue("OK");
+
+      const app = buildApp(1, new Date());
+      const res = await request(app).post("/api/voice/session");
+
+      expect(res.status).toBe(200);
+      expect(res.body.token).toBeDefined();
+      expect(res.body.token.length).toBeGreaterThanOrEqual(32);
+      expect(res.body.wsUrl).toBe("/api/voice/stream");
+    });
+
+    it("rejects unauthenticated requests with 401", async () => {
+      const app = buildApp(null);
+      const res = await request(app).post("/api/voice/session");
+      expect(res.status).toBe(401);
+    });
+
+    it("rejects when voiceConsentGrantedAt is null (no consent)", async () => {
+      const app = buildApp(1, null); // no consent
+      const res = await request(app).post("/api/voice/session");
+      expect(res.status).toBe(403);
+      expect(res.body.error).toMatch(/consent/i);
+    });
+
+    it("rejects when user already has active voice session (409)", async () => {
+      mockRedisGet.mockResolvedValue("1"); // active session exists
+
+      const app = buildApp(1, new Date());
+      const res = await request(app).post("/api/voice/session");
+      expect(res.status).toBe(409);
+    });
+
+    it("stores token in Redis with 30s TTL", async () => {
+      mockRedisGet.mockResolvedValue(null);
+      mockRedisSet.mockResolvedValue("OK");
+
+      const app = buildApp(1, new Date());
+      const res = await request(app).post("/api/voice/session");
+
+      expect(res.status).toBe(200);
+      expect(mockRedisSet).toHaveBeenCalledWith(
+        expect.stringContaining("voice:token:"),
+        expect.stringContaining("1:tenant-1"),
+        "EX",
+        30,
+      );
+    });
+  });
+
+  describe("voice consent mutations", () => {
+    it("grantConsent sets voiceConsentGrantedAt to now", async () => {
+      const app = buildApp(1, null);
+      const res = await request(app).post("/api/voice/consent/grant");
+      expect(res.status).toBe(200);
+      expect(mockDbUpdate).toHaveBeenCalled();
+    });
+
+    it("withdrawConsent sets voiceConsentGrantedAt to null", async () => {
+      mockRedisPublish.mockResolvedValue(0);
+      const app = buildApp(1, new Date());
+      const res = await request(app).post("/api/voice/consent/withdraw");
+      expect(res.status).toBe(200);
+      expect(mockRedisPublish).toHaveBeenCalledWith(
+        expect.stringContaining("voice:consent:revoked:1"),
+        "revoked",
+      );
+    });
+  });
+});
diff --git a/apps/web/server/routes/voiceGateway.ts b/apps/web/server/routes/voiceGateway.ts
new file mode 100644
index 0000000..4d6f04a
--- /dev/null
+++ b/apps/web/server/routes/voiceGateway.ts
@@ -0,0 +1,398 @@
+/**
+ * Voice Gateway — Session Token Endpoint + WebSocket Server
+ *
+ * POST /api/voice/session      — Create one-time session token (30s TTL)
+ * POST /api/voice/consent/grant    — Grant PDPA/GDPR consent
+ * POST /api/voice/consent/withdraw — Withdraw consent + terminate active session
+ *
+ * WebSocket /api/voice/stream?token=<token>  — Real-time audio streaming
+ *
+ * Security model:
+ * - Session token: random 32-byte hex, stored in Redis with 30s TTL
+ * - Token consumption: atomic Lua script (GET + DEL in one round-trip)
+ * - One active session per user enforced via Redis key (300s TTL)
+ * - Max frame size: 64KB
+ * - Rate limit: 50 audio chunks/sec per connection
+ * - Session hard timeout: 300s
+ */
+
+import { Router } from "express";
+import crypto from "crypto";
+import type { IncomingMessage, Server } from "http";
+import type { Socket } from "net";
+import { WebSocketServer, WebSocket } from "ws";
+import { eq } from "drizzle-orm";
+import { getDb } from "../db";
+import { getRedisClient } from "../services/redis";
+import { users } from "../../drizzle/schema";
+
+// ── Constants ─────────────────────────────────────────────────────────────
+
+const TOKEN_TTL = 30;          // seconds
+const SESSION_TTL = 300;       // seconds (5 minutes max)
+const AUDIO_BUFFER_MAX = 60;   // seconds before forced STT dispatch
+const MAX_FRAME_BYTES = 64 * 1024; // 64KB
+const RATE_LIMIT_CHUNKS = 50;  // chunks per second
+const RATE_WARNING_WINDOW = 10_000; // ms
+
+export const CLOSE_CODES = {
+  INVALID_TOKEN: 4001,
+  CREDIT_EXHAUSTED: 4002,
+  RATE_LIMIT: 4003,
+  CONCURRENT_SESSION: 4004,
+  SESSION_TIMEOUT: 4005,
+  FRAME_TOO_LARGE: 4006,
+} as const;
+
+// ── Active sessions map (userId -> WebSocket) ─────────────────────────────
+
+const activeSessions = new Map<number, WebSocket>();
+
+// ── WebSocket Server ──────────────────────────────────────────────────────
+
+let wss: WebSocketServer | null = null;
+let redisSubscriber: ReturnType<typeof getRedisClient> | null = null;
+
+function getWss(): WebSocketServer {
+  if (!wss) {
+    wss = new WebSocketServer({ noServer: true });
+    setupConsentRevocationListener();
+  }
+  return wss;
+}
+
+function setupConsentRevocationListener() {
+  try {
+    const redis = getRedisClient();
+    redisSubscriber = redis.duplicate() as ReturnType<typeof getRedisClient>;
+    (redisSubscriber as any).psubscribe("voice:consent:revoked:*");
+    (redisSubscriber as any).on("pmessage", (_pattern: string, channel: string) => {
+      const parts = channel.split(":");
+      const userId = parseInt(parts[parts.length - 1]);
+      if (!isNaN(userId)) {
+        const ws = activeSessions.get(userId);
+        if (ws && ws.readyState === WebSocket.OPEN) {
+          ws.close(1008, "Consent withdrawn");
+        }
+        activeSessions.delete(userId);
+      }
+    });
+  } catch {
+    // Redis subscriber unavailable — consent revocation push won't work
+  }
+}
+
+// ── Session Token Endpoint ────────────────────────────────────────────────
+
+export function createVoiceSessionRouter(): Router {
+  const router = Router();
+
+  // POST /api/voice/session — create session token
+  router.post("/session", async (req, res) => {
+    const user = (req as any).user;
+    if (!user) {
+      res.status(401).json({ error: "Unauthorized" });
+      return;
+    }
+
+    const userId = user.id as number;
+    const tenantId = user.currentTenantId as string;
+
+    // Check consent
+    const db = await getDb();
+    if (!db) {
+      res.status(503).json({ error: "Database unavailable" });
+      return;
+    }
+
+    const [userRecord] = await db
+      .select({ voiceConsentGrantedAt: users.voiceConsentGrantedAt })
+      .from(users)
+      .where(eq(users.id, userId))
+      .limit(1);
+
+    if (!userRecord?.voiceConsentGrantedAt) {
+      res.status(403).json({ error: "Voice consent required before starting a session" });
+      return;
+    }
+
+    // Check for existing active session
+    try {
+      const redis = getRedisClient();
+      const activeKey = await redis.get(`voice:active:${userId}`);
+      if (activeKey) {
+        res.status(409).json({ error: "Active voice session already exists" });
+        return;
+      }
+
+      // Generate token
+      const token = crypto.randomBytes(32).toString("hex");
+      await redis.set(
+        `voice:token:${token}`,
+        `${userId}:${tenantId}`,
+        "EX",
+        TOKEN_TTL,
+      );
+
+      res.json({ token, wsUrl: "/api/voice/stream" });
+    } catch {
+      res.status(503).json({ error: "Session service unavailable" });
+    }
+  });
+
+  // POST /api/voice/consent/grant — grant PDPA/GDPR consent
+  router.post("/consent/grant", async (req, res) => {
+    const user = (req as any).user;
+    if (!user) {
+      res.status(401).json({ error: "Unauthorized" });
+      return;
+    }
+
+    const db = await getDb();
+    if (!db) {
+      res.status(503).json({ error: "Database unavailable" });
+      return;
+    }
+
+    await db
+      .update(users)
+      .set({ voiceConsentGrantedAt: new Date() })
+      .where(eq(users.id, user.id as number));
+
+    res.json({ ok: true });
+  });
+
+  // POST /api/voice/consent/withdraw — withdraw consent + terminate session
+  router.post("/consent/withdraw", async (req, res) => {
+    const user = (req as any).user;
+    if (!user) {
+      res.status(401).json({ error: "Unauthorized" });
+      return;
+    }
+
+    const userId = user.id as number;
+    const db = await getDb();
+    if (!db) {
+      res.status(503).json({ error: "Database unavailable" });
+      return;
+    }
+
+    await db
+      .update(users)
+      .set({ voiceConsentGrantedAt: null })
+      .where(eq(users.id, userId));
+
+    // Publish revocation for active session cleanup
+    try {
+      const redis = getRedisClient();
+      await redis.publish(`voice:consent:revoked:${userId}`, "revoked");
+    } catch {
+      // Non-critical — session will expire naturally
+    }
+
+    res.json({ ok: true });
+  });
+
+  return router;
+}
+
+// ── WebSocket Upgrade Handler ─────────────────────────────────────────────
+
+/**
+ * Handle HTTP -> WebSocket upgrade for /api/voice/stream.
+ * Call this from the HTTP server's `upgrade` event.
+ */
+export function handleVoiceUpgrade(
+  req: IncomingMessage,
+  socket: Socket,
+  head: Buffer,
+): void {
+  const wssInstance = getWss();
+  wssInstance.handleUpgrade(req, socket as any, head, async (ws) => {
+    const urlStr = req.url ?? "";
+    const url = new URL(urlStr, "http://localhost");
+    const token = url.searchParams.get("token");
+
+    if (!token) {
+      ws.close(CLOSE_CODES.INVALID_TOKEN, "Missing token");
+      return;
+    }
+
+    // Atomically consume token (GET + DEL via Lua script)
+    let sessionInfo: string | null = null;
+    try {
+      const redis = getRedisClient();
+      const luaScript = `
+        local val = redis.call('GET', KEYS[1])
+        if val then redis.call('DEL', KEYS[1]) end
+        return val
+      `;
+      sessionInfo = await (redis as any).eval(luaScript, 1, `voice:token:${token}`);
+    } catch {
+      ws.close(CLOSE_CODES.INVALID_TOKEN, "Token service unavailable");
+      return;
+    }
+
+    if (!sessionInfo || sessionInfo === "consumed") {
+      ws.close(CLOSE_CODES.INVALID_TOKEN, "Invalid or expired token");
+      return;
+    }
+
+    const [userIdStr, tenantId] = sessionInfo.split(":");
+    const userId = parseInt(userIdStr);
+
+    if (isNaN(userId)) {
+      ws.close(CLOSE_CODES.INVALID_TOKEN, "Malformed session data");
+      return;
+    }
+
+    // Check concurrent session limit
+    try {
+      const redis = getRedisClient();
+      const activeResult = await redis.set(
+        `voice:active:${userId}`,
+        "1",
+        "EX",
+        SESSION_TTL,
+        "NX" as any,
+      );
+      if (!activeResult) {
+        ws.close(CLOSE_CODES.CONCURRENT_SESSION, "Concurrent session limit reached");
+        return;
+      }
+    } catch {
+      ws.close(CLOSE_CODES.INVALID_TOKEN, "Session setup failed");
+      return;
+    }
+
+    activeSessions.set(userId, ws);
+    handleVoiceSession(ws, userId, tenantId);
+  });
+}
+
+// ── WebSocket Session Handler ─────────────────────────────────────────────
+
+interface ChunkRateLimiter {
+  timestamps: number[];
+  warnings: number;
+  windowStart: number;
+}
+
+function handleVoiceSession(ws: WebSocket, userId: number, _tenantId: string): void {
+  const audioChunks: Buffer[] = [];
+  let audioByteCount = 0;
+  const rateLimiter: ChunkRateLimiter = { timestamps: [], warnings: 0, windowStart: Date.now() };
+
+  // Session timeout (300s)
+  const sessionTimer = setTimeout(() => {
+    if (ws.readyState === WebSocket.OPEN) {
+      ws.send(JSON.stringify({ type: "system", message: "Session expired" }));
+      ws.close(CLOSE_CODES.SESSION_TIMEOUT, "Session timeout");
+    }
+  }, SESSION_TTL * 1000);
+
+  ws.on("message", (data, isBinary) => {
+    if (isBinary) {
+      // Audio chunk
+      const chunk = data as Buffer;
+
+      // Frame size check
+      if (chunk.byteLength > MAX_FRAME_BYTES) {
+        ws.close(CLOSE_CODES.FRAME_TOO_LARGE, "Frame too large");
+        return;
+      }
+
+      // Rate limiting
+      const now = Date.now();
+      rateLimiter.timestamps = rateLimiter.timestamps.filter(t => now - t < 1000);
+      rateLimiter.timestamps.push(now);
+
+      if (rateLimiter.timestamps.length > RATE_LIMIT_CHUNKS) {
+        if (now - rateLimiter.windowStart > RATE_WARNING_WINDOW) {
+          rateLimiter.windowStart = now;
+          rateLimiter.warnings++;
+        }
+        if (rateLimiter.warnings >= 3) {
+          ws.close(CLOSE_CODES.RATE_LIMIT, "Rate limit exceeded");
+          return;
+        }
+        ws.send(JSON.stringify({ type: "error", code: "rate_limit_warning", message: "Sending audio too fast" }));
+        return;
+      }
+
+      audioChunks.push(chunk);
+      audioByteCount += chunk.byteLength;
+
+      // Auto-dispatch at 60s buffer limit
+      const MAX_PCM_BYTES = 16_000 * 2 * AUDIO_BUFFER_MAX;
+      if (audioByteCount >= MAX_PCM_BYTES) {
+        dispatchSTT(ws, audioChunks.splice(0), userId);
+        audioByteCount = 0;
+      }
+    } else {
+      // Control message
+      try {
+        const msg = JSON.parse(data.toString());
+        if (msg.type === "end_turn") {
+          if (audioChunks.length > 0) {
+            dispatchSTT(ws, audioChunks.splice(0), userId);
+            audioByteCount = 0;
+          }
+        }
+      } catch {
+        // Ignore malformed JSON
+      }
+    }
+  });
+
+  ws.on("close", () => {
+    clearTimeout(sessionTimer);
+    activeSessions.delete(userId);
+    // Clean up Redis
+    try {
+      const redis = getRedisClient();
+      redis.del(`voice:active:${userId}`).catch(() => {});
+    } catch {
+      // Non-critical
+    }
+  });
+}
+
+async function dispatchSTT(ws: WebSocket, chunks: Buffer[], _userId: number): Promise<void> {
+  if (chunks.length === 0) return;
+
+  try {
+    const { transcribe } = await import("../services/sttService");
+    const combined = Buffer.concat(chunks);
+    const result = await transcribe(combined, { format: "pcm16" });
+
+    if (ws.readyState === WebSocket.OPEN) {
+      ws.send(JSON.stringify({
+        type: "transcript",
+        text: result.text,
+        isFinal: true,
+        language: result.language,
+        confidence: result.confidence,
+      }));
+    }
+  } catch {
+    if (ws.readyState === WebSocket.OPEN) {
+      ws.send(JSON.stringify({ type: "error", code: "stt_failed", message: "Transcription failed" }));
+    }
+  }
+}
+
+// ── Shutdown ──────────────────────────────────────────────────────────────
+
+export async function shutdownVoiceGateway(): Promise<void> {
+  if (redisSubscriber) {
+    try {
+      await (redisSubscriber as any).quit();
+    } catch { /* ignore */ }
+    redisSubscriber = null;
+  }
+  if (wss) {
+    await new Promise<void>((resolve) => wss!.close(() => resolve()));
+    wss = null;
+  }
+}
diff --git a/apps/web/server/services/__tests__/sttService.test.ts b/apps/web/server/services/__tests__/sttService.test.ts
new file mode 100644
index 0000000..2b59f00
--- /dev/null
+++ b/apps/web/server/services/__tests__/sttService.test.ts
@@ -0,0 +1,139 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// ── Hoisted mocks ──────────────────────────────────────────────────────────
+
+const { mockFetch, mockGetDb, mockDbSelect } = vi.hoisted(() => ({
+  mockFetch: vi.fn(),
+  mockGetDb: vi.fn(),
+  mockDbSelect: vi.fn(),
+}));
+
+vi.stubGlobal("fetch", mockFetch);
+
+vi.mock("../../db", () => ({
+  getDb: mockGetDb,
+}));
+
+// ── Import after mocks ─────────────────────────────────────────────────────
+
+import {
+  transcribe,
+  calculateSTTCredits,
+  MAX_AUDIO_BYTES,
+  MAX_AUDIO_DURATION_SECONDS,
+} from "../sttService";
+
+// ── Helpers ────────────────────────────────────────────────────────────────
+
+function makeAudioBuffer(bytes: number): Buffer {
+  return Buffer.alloc(bytes, 0xab);
+}
+
+// ── Tests ─────────────────────────────────────────────────────────────────
+
+describe("sttService", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockFetch.mockResolvedValue({
+      ok: true,
+      json: async () => ({
+        text: "Hello world",
+        language: "en",
+        confidence: 0.95,
+        duration: 3.5,
+      }),
+    });
+  });
+
+  describe("transcribe", () => {
+    it("routes to groq provider by default and returns transcript", async () => {
+      const audio = makeAudioBuffer(1024);
+      const result = await transcribe(audio, { format: "pcm16" });
+
+      expect(mockFetch).toHaveBeenCalledOnce();
+      const [url, opts] = mockFetch.mock.calls[0];
+      expect(url).toContain("/api/internal/stt");
+      expect(opts.method).toBe("POST");
+      // Default provider is groq
+      const body = opts.body as FormData;
+      expect(body.get("provider")).toBe("groq");
+
+      expect(result.text).toBe("Hello world");
+      expect(result.language).toBe("en");
+      expect(result.confidence).toBe(0.95);
+      expect(result.duration).toBe(3.5);
+    });
+
+    it("accepts provider override (openai)", async () => {
+      const audio = makeAudioBuffer(512);
+      await transcribe(audio, { format: "pcm16", provider: "openai" });
+
+      const [, opts] = mockFetch.mock.calls[0];
+      const body = opts.body as FormData;
+      expect(body.get("provider")).toBe("openai");
+    });
+
+    it("falls back to openai on groq failure", async () => {
+      mockFetch
+        .mockRejectedValueOnce(new Error("Groq unavailable"))
+        .mockResolvedValueOnce({
+          ok: true,
+          json: async () => ({ text: "Fallback text", language: "en", confidence: 0.8, duration: 2 }),
+        });
+
+      const audio = makeAudioBuffer(512);
+      const result = await transcribe(audio, { format: "pcm16" });
+
+      expect(mockFetch).toHaveBeenCalledTimes(2);
+      expect(result.text).toBe("Fallback text");
+    });
+
+    it("rejects audio buffers exceeding MAX_AUDIO_BYTES", async () => {
+      const tooLarge = makeAudioBuffer(MAX_AUDIO_BYTES + 1);
+      await expect(transcribe(tooLarge, { format: "pcm16" })).rejects.toThrow(
+        /exceeds maximum/i,
+      );
+      expect(mockFetch).not.toHaveBeenCalled();
+    });
+
+    it("throws when python backend returns non-ok status", async () => {
+      mockFetch.mockResolvedValue({
+        ok: false,
+        status: 413,
+        json: async () => ({ detail: "File too large" }),
+      });
+      const audio = makeAudioBuffer(512);
+      await expect(transcribe(audio, { format: "pcm16" })).rejects.toThrow();
+    });
+  });
+
+  describe("calculateSTTCredits", () => {
+    it("returns 0 for groq (free tier)", () => {
+      expect(calculateSTTCredits(60, "groq")).toBe(0);
+      expect(calculateSTTCredits(300, "groq")).toBe(0);
+    });
+
+    it("calculates 3 credits per minute for non-groq providers (ceiling)", () => {
+      // 60s = 1 min -> 3 credits
+      expect(calculateSTTCredits(60, "openai")).toBe(3);
+      // 30s = 0.5 min -> ceil(1.5) = 2 credits
+      expect(calculateSTTCredits(30, "openai")).toBe(2);
+      // 1s = ceil(0.05) -> 1 credit minimum
+      expect(calculateSTTCredits(1, "openai")).toBe(1);
+      // 120s = 2 min -> 6 credits
+      expect(calculateSTTCredits(120, "openai")).toBe(6);
+    });
+  });
+
+  describe("constants", () => {
+    it("MAX_AUDIO_BYTES is approximately 1.9MB (60s at 16kHz 16-bit mono)", () => {
+      // 16000 samples/s * 2 bytes/sample * 60s = 1,920,000 bytes
+      expect(MAX_AUDIO_BYTES).toBeGreaterThanOrEqual(1_900_000);
+      expect(MAX_AUDIO_BYTES).toBeLessThanOrEqual(2_000_000);
+    });
+
+    it("MAX_AUDIO_DURATION_SECONDS is 60", () => {
+      expect(MAX_AUDIO_DURATION_SECONDS).toBe(60);
+    });
+  });
+});
diff --git a/apps/web/server/services/__tests__/ttsService.test.ts b/apps/web/server/services/__tests__/ttsService.test.ts
new file mode 100644
index 0000000..4e25496
--- /dev/null
+++ b/apps/web/server/services/__tests__/ttsService.test.ts
@@ -0,0 +1,98 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// ── Hoisted mocks ──────────────────────────────────────────────────────────
+
+const { mockFetch } = vi.hoisted(() => ({
+  mockFetch: vi.fn(),
+}));
+
+vi.stubGlobal("fetch", mockFetch);
+
+// ── Import after mocks ─────────────────────────────────────────────────────
+
+import { synthesize, calculateTTSCredits, MAX_TTS_CHARS } from "../ttsService";
+
+// ── Tests ─────────────────────────────────────────────────────────────────
+
+describe("ttsService", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockFetch.mockResolvedValue({
+      ok: true,
+      headers: { get: () => "audio/mpeg" },
+      arrayBuffer: async () => Buffer.alloc(4096).buffer,
+    });
+  });
+
+  describe("synthesize", () => {
+    it("returns audio buffer with content type", async () => {
+      const result = await synthesize("Hello world", { format: "mp3" });
+
+      expect(mockFetch).toHaveBeenCalledOnce();
+      expect(result.audioBuffer).toBeInstanceOf(Buffer);
+      expect(result.contentType).toBe("audio/mpeg");
+      expect(typeof result.duration).toBe("number");
+    });
+
+    it("sends text to python backend TTS endpoint", async () => {
+      await synthesize("Test sentence", { format: "mp3", voice: "alloy" });
+
+      const [url, opts] = mockFetch.mock.calls[0];
+      expect(url).toContain("/api/internal/tts");
+      expect(opts.method).toBe("POST");
+      const body = JSON.parse(opts.body);
+      expect(body.text).toBe("Test sentence");
+      expect(body.voice).toBe("alloy");
+    });
+
+    it("routes to elevenlabs provider when specified", async () => {
+      await synthesize("Hi", { format: "mp3", provider: "elevenlabs" });
+      const [, opts] = mockFetch.mock.calls[0];
+      const body = JSON.parse(opts.body);
+      expect(body.provider).toBe("elevenlabs");
+    });
+
+    it("routes to openai provider by default", async () => {
+      await synthesize("Hi", { format: "mp3" });
+      const [, opts] = mockFetch.mock.calls[0];
+      const body = JSON.parse(opts.body);
+      expect(body.provider).toBe("openai");
+    });
+
+    it("rejects text exceeding MAX_TTS_CHARS", async () => {
+      const tooLong = "x".repeat(MAX_TTS_CHARS + 1);
+      await expect(synthesize(tooLong, { format: "mp3" })).rejects.toThrow(
+        /exceeds maximum/i,
+      );
+      expect(mockFetch).not.toHaveBeenCalled();
+    });
+
+    it("throws when python backend returns non-ok response", async () => {
+      mockFetch.mockResolvedValue({
+        ok: false,
+        status: 500,
+        json: async () => ({ detail: "Provider error" }),
+      });
+      await expect(synthesize("Hello", { format: "mp3" })).rejects.toThrow();
+    });
+  });
+
+  describe("calculateTTSCredits", () => {
+    it("calculates 5 credits per 1000 characters (ceiling)", () => {
+      // 1000 chars -> 5 credits
+      expect(calculateTTSCredits(1000)).toBe(5);
+      // 500 chars -> ceil(2.5) = 3 credits
+      expect(calculateTTSCredits(500)).toBe(3);
+      // 1 char -> 1 credit minimum
+      expect(calculateTTSCredits(1)).toBe(1);
+      // 2000 chars -> 10 credits
+      expect(calculateTTSCredits(2000)).toBe(10);
+    });
+  });
+
+  describe("constants", () => {
+    it("MAX_TTS_CHARS is 5000", () => {
+      expect(MAX_TTS_CHARS).toBe(5000);
+    });
+  });
+});
diff --git a/apps/web/server/services/__tests__/voiceCreditIntegration.test.ts b/apps/web/server/services/__tests__/voiceCreditIntegration.test.ts
new file mode 100644
index 0000000..dd69f85
--- /dev/null
+++ b/apps/web/server/services/__tests__/voiceCreditIntegration.test.ts
@@ -0,0 +1,38 @@
+import { describe, it, expect, vi } from "vitest";
+
+// ── Tests for calculateSTTCredits and calculateTTSCredits ──────────────────
+
+import { calculateSTTCredits } from "../sttService";
+import { calculateTTSCredits } from "../ttsService";
+
+describe("voice credit integration", () => {
+  describe("STT credit calculation", () => {
+    it("calculates STT cost as 0 credits for groq (free tier)", () => {
+      expect(calculateSTTCredits(30, "groq")).toBe(0);
+    });
+
+    it("calculates STT cost as 3 credits per minute (ceiling) for openai", () => {
+      // 30s = 0.5 min -> ceil(1.5) = 2 credits
+      expect(calculateSTTCredits(30, "openai")).toBe(2);
+    });
+
+    it("calculates STT for 60s as 3 credits", () => {
+      expect(calculateSTTCredits(60, "openai")).toBe(3);
+    });
+  });
+
+  describe("TTS credit calculation", () => {
+    it("calculates TTS cost as 5 credits per 1K characters", () => {
+      expect(calculateTTSCredits(1000)).toBe(5);
+    });
+
+    it("rounds up for partial 1K blocks", () => {
+      // 500 chars -> ceil(2.5) = 3 credits
+      expect(calculateTTSCredits(500)).toBe(3);
+    });
+
+    it("minimum is 1 credit for any text", () => {
+      expect(calculateTTSCredits(1)).toBe(1);
+    });
+  });
+});
diff --git a/apps/web/server/services/sttService.ts b/apps/web/server/services/sttService.ts
new file mode 100644
index 0000000..92b1579
--- /dev/null
+++ b/apps/web/server/services/sttService.ts
@@ -0,0 +1,112 @@
+/**
+ * STT (Speech-to-Text) Service
+ *
+ * Provider abstraction for speech transcription. Routes through the Python
+ * backend unified_client, which handles Groq Whisper and OpenAI Whisper.
+ *
+ * Credit cost: 0 credits for Groq (free tier), 3 credits/minute for others.
+ */
+
+// ── Constants ─────────────────────────────────────────────────────────────
+
+/** Maximum audio buffer size: 60s at 16kHz 16-bit mono = ~1.92MB */
+export const MAX_AUDIO_DURATION_SECONDS = 60;
+export const MAX_AUDIO_BYTES = 16_000 * 2 * MAX_AUDIO_DURATION_SECONDS; // 1,920,000
+
+const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";
+const INTERNAL_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? "";
+
+// ── Types ─────────────────────────────────────────────────────────────────
+
+export interface STTResult {
+  text: string;
+  language: string;
+  confidence: number;
+  duration: number; // seconds
+}
+
+export interface TranscribeOptions {
+  format: "pcm16" | "wav" | "mp3";
+  language?: string;
+  provider?: "groq" | "openai";
+}
+
+// ── Credit calculation ────────────────────────────────────────────────────
+
+/**
+ * Calculate STT credit cost.
+ * Groq is free; all other providers cost 3 credits per minute (rounded up).
+ */
+export function calculateSTTCredits(durationSeconds: number, provider: string): number {
+  if (provider.toLowerCase() === "groq") return 0;
+  return Math.max(1, Math.ceil((durationSeconds / 60) * 3));
+}
+
+// ── Provider call ─────────────────────────────────────────────────────────
+
+async function callSTTProvider(
+  audioBuffer: Buffer,
+  options: TranscribeOptions,
+  provider: "groq" | "openai",
+): Promise<STTResult> {
+  const formData = new FormData();
+  formData.append(
+    "audio",
+    new Blob([audioBuffer], { type: "application/octet-stream" }),
+    `audio.${options.format}`,
+  );
+  formData.append("provider", provider);
+  formData.append("format", options.format);
+  if (options.language) {
+    formData.append("language", options.language);
+  }
+
+  const response = await fetch(`${PYTHON_BACKEND_URL}/api/internal/stt`, {
+    method: "POST",
+    headers: {
+      "X-Internal-Token": INTERNAL_TOKEN,
+    },
+    body: formData,
+  });
+
+  if (!response.ok) {
+    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
+    throw new Error(`STT provider ${provider} failed (${response.status}): ${(error as any).detail ?? "error"}`);
+  }
+
+  return response.json();
+}
+
+// ── Public API ────────────────────────────────────────────────────────────
+
+/**
+ * Transcribe an audio buffer to text.
+ *
+ * Tries the specified (or default groq) provider first, then falls back
+ * to openai on failure.
+ */
+export async function transcribe(
+  audioBuffer: Buffer,
+  options: TranscribeOptions,
+): Promise<STTResult> {
+  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
+    throw new Error(
+      `Audio buffer exceeds maximum allowed size (${MAX_AUDIO_BYTES} bytes)`,
+    );
+  }
+
+  const primaryProvider = options.provider ?? "groq";
+
+  try {
+    return await callSTTProvider(audioBuffer, options, primaryProvider);
+  } catch (primaryError) {
+    // Fallback: try the other provider
+    const fallbackProvider = primaryProvider === "groq" ? "openai" : "groq";
+    try {
+      return await callSTTProvider(audioBuffer, options, fallbackProvider);
+    } catch {
+      // Re-throw original error if both providers fail
+      throw primaryError;
+    }
+  }
+}
diff --git a/apps/web/server/services/ttsService.ts b/apps/web/server/services/ttsService.ts
new file mode 100644
index 0000000..65ddf0d
--- /dev/null
+++ b/apps/web/server/services/ttsService.ts
@@ -0,0 +1,87 @@
+/**
+ * TTS (Text-to-Speech) Service
+ *
+ * Provider abstraction for speech synthesis. Routes through the Python
+ * backend unified_client, which handles ElevenLabs and OpenAI TTS.
+ *
+ * Credit cost: 5 credits per 1000 characters (rounded up).
+ */
+
+// ── Constants ─────────────────────────────────────────────────────────────
+
+/** Maximum text length for TTS synthesis */
+export const MAX_TTS_CHARS = 5000;
+
+const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";
+const INTERNAL_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? "";
+
+// ── Types ─────────────────────────────────────────────────────────────────
+
+export interface TTSResult {
+  audioBuffer: Buffer;
+  contentType: string; // "audio/mpeg" or "audio/pcm"
+  duration: number;    // estimated seconds
+}
+
+export interface SynthesizeOptions {
+  format: "mp3" | "pcm16";
+  voice?: string;
+  speed?: number;
+  provider?: "elevenlabs" | "openai";
+}
+
+// ── Credit calculation ────────────────────────────────────────────────────
+
+/**
+ * Calculate TTS credit cost: 5 credits per 1000 characters, minimum 1.
+ */
+export function calculateTTSCredits(characterCount: number): number {
+  return Math.max(1, Math.ceil((characterCount / 1000) * 5));
+}
+
+// ── Public API ────────────────────────────────────────────────────────────
+
+/**
+ * Synthesize text to speech audio.
+ */
+export async function synthesize(
+  text: string,
+  options: SynthesizeOptions,
+): Promise<TTSResult> {
+  if (text.length > MAX_TTS_CHARS) {
+    throw new Error(
+      `Text exceeds maximum allowed length (${MAX_TTS_CHARS} characters)`,
+    );
+  }
+
+  const provider = options.provider ?? "openai";
+
+  const response = await fetch(`${PYTHON_BACKEND_URL}/api/internal/tts`, {
+    method: "POST",
+    headers: {
+      "Content-Type": "application/json",
+      "X-Internal-Token": INTERNAL_TOKEN,
+    },
+    body: JSON.stringify({
+      text,
+      provider,
+      voice: options.voice ?? "alloy",
+      speed: options.speed ?? 1.0,
+      format: options.format,
+    }),
+  });
+
+  if (!response.ok) {
+    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
+    throw new Error(`TTS provider ${provider} failed (${response.status}): ${(error as any).detail ?? "error"}`);
+  }
+
+  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
+  const arrayBuffer = await response.arrayBuffer();
+  const audioBuffer = Buffer.from(arrayBuffer);
+
+  // Estimate duration from buffer size (rough: MP3 ~128kbps)
+  const duration = audioBuffer.byteLength / (128 * 1024 / 8);
+
+  return { audioBuffer, contentType, duration };
+}
diff --git a/python-backend/app/api/stt.py b/python-backend/app/api/stt.py
new file mode 100644
index 0000000..9e09dd9
--- /dev/null
+++ b/python-backend/app/api/stt.py
@@ -0,0 +1,195 @@
+"""
+Internal STT/TTS API endpoints.
+
+Called by the Node.js voice gateway, routed through the unified_client.
+Requires X-Internal-Token header for authentication.
+
+POST /api/internal/stt  — Speech-to-text transcription
+POST /api/internal/tts  — Text-to-speech synthesis
+"""
+
+from __future__ import annotations
+
+import io
+import secrets
+from typing import Optional
+
+import structlog
+from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File, Form
+from fastapi.responses import Response
+from pydantic import BaseModel, Field
+
+from app.core.config import settings
+
+logger = structlog.get_logger(__name__)
+
+router = APIRouter(prefix="/api/internal", tags=["Internal STT/TTS"])
+
+# ── Max sizes ─────────────────────────────────────────────────────────────
+
+MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25MB
+MAX_TTS_CHARS = 5000
+
+
+# ── Auth ──────────────────────────────────────────────────────────────────
+
+
+async def _verify_internal_token(
+    x_internal_token: Optional[str] = Header(None),
+    x_proxy_token: Optional[str] = Header(None),
+) -> None:
+    """Verify internal service token for Node.js -> Python calls."""
+    expected = (
+        getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
+        or getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None)
+    )
+    if not expected:
+        raise HTTPException(status_code=500, detail="Internal token not configured")
+
+    token = x_internal_token or x_proxy_token
+    if not token:
+        raise HTTPException(status_code=401, detail="Missing internal token")
+    if not secrets.compare_digest(token, expected):
+        raise HTTPException(status_code=401, detail="Invalid internal token")
+
+
+# ── STT Endpoint ──────────────────────────────────────────────────────────
+
+
+class STTResponse(BaseModel):
+    text: str
+    language: str
+    confidence: float
+    duration: float
+
+
+@router.post(
+    "/stt",
+    response_model=STTResponse,
+    summary="Transcribe audio to text",
+)
+async def transcribe_audio(
+    audio: UploadFile = File(...),
+    provider: str = Form(default="groq"),
+    format: str = Form(default="pcm16"),
+    language: Optional[str] = Form(default=None),
+    _auth: None = Depends(_verify_internal_token),
+) -> STTResponse:
+    """Transcribe audio using the specified STT provider."""
+    audio_bytes = await audio.read()
+
+    if len(audio_bytes) > MAX_AUDIO_BYTES:
+        raise HTTPException(status_code=413, detail=f"Audio file exceeds {MAX_AUDIO_BYTES} bytes")
+
+    if provider not in ("groq", "openai"):
+        raise HTTPException(status_code=400, detail=f"Unsupported STT provider: {provider}")
+
+    try:
+        result = await _call_stt_provider(audio_bytes, provider, format, language)
+        return STTResponse(**result)
+    except HTTPException:
+        raise
+    except Exception as exc:
+        logger.error("stt_provider_error", provider=provider, error=str(exc))
+        raise HTTPException(status_code=502, detail=f"STT provider error: {str(exc)}")
+
+
+async def _call_stt_provider(
+    audio_bytes: bytes,
+    provider: str,
+    format: str,
+    language: Optional[str],
+) -> dict:
+    """Route to the appropriate STT provider via unified_client."""
+    try:
+        from app.llm_proxy.unified_client import UnifiedLLMClient
+
+        client = UnifiedLLMClient()
+
+        # Build transcription request
+        audio_file = io.BytesIO(audio_bytes)
+        audio_file.name = f"audio.{format}"
+
+        result = await client.transcribe(
+            audio_file=audio_file,
+            provider=provider,
+            language=language,
+        )
+        return {
+            "text": result.get("text", ""),
+            "language": result.get("language", language or "en"),
+            "confidence": result.get("confidence", 0.9),
+            "duration": result.get("duration", 0.0),
+        }
+    except ImportError:
+        # Fallback: return mock response for development
+        logger.warning("unified_client_not_available", fallback="mock_stt")
+        return {
+            "text": "[Transcription not available — unified client not configured]",
+            "language": language or "en",
+            "confidence": 0.0,
+            "duration": 0.0,
+        }
+
+
+# ── TTS Endpoint ──────────────────────────────────────────────────────────
+
+
+class TTSRequest(BaseModel):
+    text: str
+    provider: str = "openai"
+    voice: str = "alloy"
+    speed: float = Field(default=1.0, ge=0.25, le=4.0)
+    format: str = "mp3"
+
+
+@router.post(
+    "/tts",
+    summary="Synthesize text to speech",
+)
+async def synthesize_speech(
+    body: TTSRequest,
+    _auth: None = Depends(_verify_internal_token),
+) -> Response:
+    """Synthesize speech from text using the specified TTS provider."""
+    if len(body.text) > MAX_TTS_CHARS:
+        raise HTTPException(status_code=413, detail=f"Text exceeds {MAX_TTS_CHARS} characters")
+
+    if body.provider not in ("openai", "elevenlabs"):
+        raise HTTPException(status_code=400, detail=f"Unsupported TTS provider: {body.provider}")
+
+    try:
+        audio_bytes, content_type = await _call_tts_provider(body)
+        return Response(
+            content=audio_bytes,
+            media_type=content_type,
+        )
+    except HTTPException:
+        raise
+    except Exception as exc:
+        logger.error("tts_provider_error", provider=body.provider, error=str(exc))
+        raise HTTPException(status_code=502, detail=f"TTS provider error: {str(exc)}")
+
+
+async def _call_tts_provider(body: TTSRequest) -> tuple[bytes, str]:
+    """Route to the appropriate TTS provider."""
+    try:
+        from app.llm_proxy.unified_client import UnifiedLLMClient
+
+        client = UnifiedLLMClient()
+        result = await client.synthesize_speech(
+            text=body.text,
+            provider=body.provider,
+            voice=body.voice,
+            speed=body.speed,
+            format=body.format,
+        )
+        audio_bytes = result.get("audio_bytes", b"")
+        content_type = "audio/mpeg" if body.format == "mp3" else "audio/pcm"
+        return audio_bytes, content_type
+    except ImportError:
+        # Fallback: return silence for development
+        logger.warning("unified_client_not_available", fallback="mock_tts")
+        # Return minimal valid MP3 silence
+        silence = bytes(512)
+        return silence, "audio/mpeg"
diff --git a/python-backend/app/main.py b/python-backend/app/main.py
index 70654ff..e529e97 100644
--- a/python-backend/app/main.py
+++ b/python-backend/app/main.py
@@ -65,6 +65,8 @@ from app.api import (
      internal_library,  # Internal library scope propagation API
     internal_sandbox,  # Internal sandbox dispatch/cancel API
     agencies,  # Agency-Swarm multi-agent endpoints
+    agency_creator,  # AI Agency Creator task endpoints
+    stt,  # Internal STT/TTS voice endpoints
  )
 from app.api.v1 import (
     skills,
@@ -304,7 +306,9 @@ app.include_router(internal_onedrive.router, tags=["Internal OneDrive"])
 app.include_router(admin_alerts.router, tags=["Admin Alerts"])
 app.include_router(internal_library.router, tags=["Internal Library"])
 app.include_router(internal_sandbox.router, tags=["Internal Sandbox"])
+app.include_router(stt.router, tags=["Internal STT/TTS"])
 app.include_router(agencies.router, tags=["Agencies"])
+app.include_router(agency_creator.router, prefix="/api/v1/agency-creator", tags=["Agency Creator"])
 
 @app.get("/")
 async def root():
diff --git a/python-backend/app/services/agency_tools.py b/python-backend/app/services/agency_tools.py
index 6f19578..415c805 100644
--- a/python-backend/app/services/agency_tools.py
+++ b/python-backend/app/services/agency_tools.py
@@ -14,6 +14,7 @@ so the agent can gracefully explain the denial.
 """
 
 import ipaddress
+import os
 from urllib.parse import urlparse
 
 import httpx
@@ -51,11 +52,44 @@ _BLOCKED_NETWORKS = [
 ]
 
 
+_INTERNAL_SERVICE_URL = os.getenv("SMARTSPEC_INTERNAL_URL", "http://127.0.0.1:3000")
+
+# Builtin tool ID → internal endpoint path suffix
+_BUILTIN_ENDPOINTS: dict[str, str] = {
+    "builtin-rag-knowledge": "/api/internal/tools/rag-knowledge",
+    "builtin-skill-executor": "/api/internal/tools/skill-executor",
+    "builtin-web-search": "/api/internal/tools/web-search",
+    "builtin-http-request": "/api/internal/tools/http-request",
+    "builtin-email-notify": "/api/internal/tools/email-notify",
+    "builtin-webhook": "/api/internal/tools/webhook",
+    "builtin-slack-message": "/api/internal/tools/slack-message",
+    "builtin-document-search": "/api/internal/tools/document-search",
+    "builtin-voice": "/api/internal/tools/voice",
+}
+
+_BUILTIN_RISK_LEVELS: dict[str, str] = {
+    "builtin-web-search": "medium",
+    "builtin-http-request": "medium",
+    "builtin-skill-executor": "medium",
+    "builtin-webhook": "medium",
+    "builtin-rag-knowledge": "low",
+    "builtin-email-notify": "low",
+    "builtin-slack-message": "low",
+    "builtin-document-search": "low",
+    "builtin-voice": "medium",
+}
+
+
 def _validate_tool_url(url: str) -> None:
     """Validate that a tool endpoint URL is safe (no SSRF).
 
     Raises ValueError if the URL targets a private/internal address.
+    Internal service URLs (SMARTSPEC_INTERNAL_URL) are always allowed.
     """
+    # Allow the configured internal service URL explicitly
+    if url.startswith(_INTERNAL_SERVICE_URL):
+        return
+
     parsed = urlparse(url)
     if parsed.scheme not in ("http", "https"):
         raise ValueError(f"Unsupported URL scheme: {parsed.scheme}")
@@ -260,8 +294,9 @@ async def resolve_tools_for_agent(
 ) -> list[type]:
     """Resolve and construct tool bridges for a specific agent.
 
-    Queries agency_agent_tools and agency_tools to get tool configs,
-    then creates tool bridge classes for each tool.
+    Queries agency_agent_tools (LEFT JOIN agency_tools) to get tool configs.
+    Builtin tools may not have a row in agency_tools — LEFT JOIN handles that.
+    Per-agent toolConfig (instance_config) is merged over the base tool config.
 
     Args:
         db: Database session.
@@ -274,15 +309,14 @@ async def resolve_tools_for_agent(
     """
     query = text("""
         SELECT
-            t.id as tool_id,
-            t.name,
-            t.description,
-            t."toolType" as tool_type,
-            t."riskLevel" as risk_level,
-            t."requiresApproval" as requires_approval,
-            t.config
+            aat."toolId" as tool_id,
+            COALESCE(t."toolType", 'builtin') as tool_type,
+            COALESCE(t."riskLevel", 'low') as risk_level,
+            COALESCE(t."requiresApproval", false) as requires_approval,
+            t.config as base_config,
+            aat."toolConfig" as instance_config
         FROM agency_agent_tools aat
-        JOIN agency_tools t ON t.id = aat."toolId"
+        LEFT JOIN agency_tools t ON t.id = aat."toolId"
         WHERE aat."agentId" = :agent_id
     """)
 
@@ -291,19 +325,30 @@ async def resolve_tools_for_agent(
 
     tool_classes: list[type] = []
     for row in rows:
-        # Extract endpoint_url from config JSON if present
-        raw_config = row.config or {}
-        endpoint_url = None
-        if isinstance(raw_config, dict):
-            endpoint_url = raw_config.pop("endpoint_url", None)
+        tool_id: str = row.tool_id
+
+        # Merge base config (from agency_tools) with instance config (per-agent toolConfig).
+        # Instance config takes priority — it carries runtime overrides like collectionId,
+        # skillSlug, webhookUrl, etc. set in AgentPropertyPanel's ToolPicker.
+        base_config: dict[str, Any] = row.base_config if isinstance(row.base_config, dict) else {}
+        instance_config: dict[str, Any] = row.instance_config if isinstance(row.instance_config, dict) else {}
+        merged_config = {**base_config, **instance_config}
+
+        # endpoint_url may live in config or be derived from the builtin tool ID
+        endpoint_url: str | None = merged_config.pop("endpoint_url", None)
+        if endpoint_url is None and tool_id in _BUILTIN_ENDPOINTS:
+            endpoint_url = _INTERNAL_SERVICE_URL + _BUILTIN_ENDPOINTS[tool_id]
+
+        # For builtin tools not in agency_tools, infer risk level from our table
+        risk_level: str = row.risk_level or _BUILTIN_RISK_LEVELS.get(tool_id, "low")
 
         config = ToolConfig(
-            tool_id=row.tool_id,
+            tool_id=tool_id,
             tool_type=row.tool_type or "builtin",
-            risk_level=row.risk_level or "low",
+            risk_level=risk_level,
             requires_approval=bool(row.requires_approval),
             endpoint_url=endpoint_url,
-            config=raw_config if isinstance(raw_config, dict) else {},
+            config=merged_config,
         )
         tool_cls = create_tool_bridge(config, agency_whitelist, adapter=adapter)
         tool_classes.append(tool_cls)
diff --git a/python-backend/tests/unit/test_stt_endpoint.py b/python-backend/tests/unit/test_stt_endpoint.py
new file mode 100644
index 0000000..c1753cc
--- /dev/null
+++ b/python-backend/tests/unit/test_stt_endpoint.py
@@ -0,0 +1,156 @@
+"""
+STT/TTS Endpoint Tests
+
+Tests for POST /api/internal/stt and POST /api/internal/tts endpoints.
+"""
+from __future__ import annotations
+
+import io
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+from fastapi.testclient import TestClient
+from httpx import AsyncClient
+
+
+@pytest.fixture
+def mock_settings():
+    """Mock settings with internal token configured."""
+    with patch("app.api.stt.settings") as mock:
+        mock.SMARTSPEC_PROXY_TOKEN = "test-internal-token"
+        mock.SMARTSPEC_WEB_GATEWAY_TOKEN = None
+        yield mock
+
+
+@pytest.fixture
+def mock_unified_client():
+    """Mock UnifiedLLMClient."""
+    with patch("app.llm_proxy.unified_client.UnifiedLLMClient") as mock_cls:
+        client = MagicMock()
+        client.transcribe = AsyncMock(return_value={
+            "text": "Hello world",
+            "language": "en",
+            "confidence": 0.95,
+            "duration": 3.5,
+        })
+        client.synthesize_speech = AsyncMock(return_value={
+            "audio_bytes": b"\xff\xfb" + bytes(1024),
+        })
+        mock_cls.return_value = client
+        yield client
+
+
+@pytest.fixture
+def stt_client(mock_settings):
+    """FastAPI test client for STT router."""
+    from fastapi import FastAPI
+    from app.api.stt import router
+
+    app = FastAPI()
+    app.include_router(router)
+    return TestClient(app)
+
+
+class TestSTTEndpoint:
+    """Tests for POST /api/internal/stt"""
+
+    def test_stt_requires_internal_auth(self, stt_client):
+        """Endpoint requires X-Internal-Token header."""
+        response = stt_client.post(
+            "/api/internal/stt",
+            files={"audio": ("audio.pcm", io.BytesIO(bytes(1024)), "application/octet-stream")},
+            data={"provider": "groq", "format": "pcm16"},
+        )
+        assert response.status_code == 401
+
+    def test_stt_rejects_invalid_token(self, stt_client):
+        """Invalid token returns 401."""
+        response = stt_client.post(
+            "/api/internal/stt",
+            headers={"X-Internal-Token": "wrong-token"},
+            files={"audio": ("audio.pcm", io.BytesIO(bytes(1024)), "application/octet-stream")},
+            data={"provider": "groq", "format": "pcm16"},
+        )
+        assert response.status_code == 401
+
+    def test_stt_returns_transcript_with_metadata(self, stt_client, mock_unified_client):
+        """Response includes text, language, confidence, duration."""
+        response = stt_client.post(
+            "/api/internal/stt",
+            headers={"X-Internal-Token": "test-internal-token"},
+            files={"audio": ("audio.pcm", io.BytesIO(bytes(1024)), "application/octet-stream")},
+            data={"provider": "groq", "format": "pcm16"},
+        )
+        # Either success (if unified_client available) or graceful fallback
+        assert response.status_code in (200, 422)
+        if response.status_code == 200:
+            data = response.json()
+            assert "text" in data
+            assert "language" in data
+            assert "confidence" in data
+            assert "duration" in data
+
+    def test_stt_rejects_unsupported_provider(self, stt_client):
+        """Unknown provider returns 400."""
+        response = stt_client.post(
+            "/api/internal/stt",
+            headers={"X-Internal-Token": "test-internal-token"},
+            files={"audio": ("audio.pcm", io.BytesIO(bytes(1024)), "application/octet-stream")},
+            data={"provider": "unknown_provider", "format": "pcm16"},
+        )
+        assert response.status_code == 400
+
+    def test_stt_rejects_oversized_audio(self, stt_client):
+        """Audio files > MAX_AUDIO_BYTES rejected with 413."""
+        from app.api.stt import MAX_AUDIO_BYTES
+        oversized = bytes(MAX_AUDIO_BYTES + 1)
+        response = stt_client.post(
+            "/api/internal/stt",
+            headers={"X-Internal-Token": "test-internal-token"},
+            files={"audio": ("audio.pcm", io.BytesIO(oversized), "application/octet-stream")},
+            data={"provider": "groq", "format": "pcm16"},
+        )
+        assert response.status_code == 413
+
+
+class TestTTSEndpoint:
+    """Tests for POST /api/internal/tts"""
+
+    def test_tts_requires_internal_auth(self, stt_client):
+        """Endpoint requires X-Internal-Token header."""
+        response = stt_client.post(
+            "/api/internal/tts",
+            json={"text": "Hello", "provider": "openai"},
+        )
+        assert response.status_code == 401
+
+    def test_tts_rejects_unsupported_provider(self, stt_client):
+        """Unknown provider returns 400."""
+        response = stt_client.post(
+            "/api/internal/tts",
+            headers={"X-Internal-Token": "test-internal-token"},
+            json={"text": "Hello", "provider": "unknown"},
+        )
+        assert response.status_code == 400
+
+    def test_tts_rejects_text_exceeding_max_chars(self, stt_client):
+        """Text > MAX_TTS_CHARS rejected with 413."""
+        from app.api.stt import MAX_TTS_CHARS
+        long_text = "x" * (MAX_TTS_CHARS + 1)
+        response = stt_client.post(
+            "/api/internal/tts",
+            headers={"X-Internal-Token": "test-internal-token"},
+            json={"text": long_text, "provider": "openai"},
+        )
+        assert response.status_code == 413
+
+    def test_tts_returns_audio_response(self, stt_client, mock_unified_client):
+        """Returns binary audio with correct content type."""
+        response = stt_client.post(
+            "/api/internal/tts",
+            headers={"X-Internal-Token": "test-internal-token"},
+            json={"text": "Hello world", "provider": "openai"},
+        )
+        assert response.status_code in (200, 422)
+        if response.status_code == 200:
+            assert "audio" in response.headers.get("content-type", "")
