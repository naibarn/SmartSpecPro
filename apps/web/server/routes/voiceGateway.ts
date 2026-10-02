/**
 * Voice Gateway — Session Token Endpoint + WebSocket Server
 *
 * POST /api/voice/session      — Create one-time session token (30s TTL)
 * POST /api/voice/consent/grant    — Grant PDPA/GDPR consent
 * POST /api/voice/consent/withdraw — Withdraw consent + terminate active session
 *
 * WebSocket /api/voice/stream?token=<token>  — Real-time audio streaming
 *
 * Security model:
 * - Session token: random 32-byte hex, stored in PostgreSQL with 30s TTL
 * - Token consumption and active-session claims are atomic PostgreSQL operations
 * - Consent withdrawals are observed by each instance's active WebSocket poll
 * - Max frame size: 64KB
 * - Rate limit: 50 audio chunks/sec per connection
 * - Session hard timeout: 300s
 */

import { Router } from "express";
import crypto from "crypto";
import type { IncomingMessage, Server } from "http";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { transcribe, calculateSTTCredits } from "../services/sttService";
import { deductCredits } from "../services/creditService";
import { users } from "../../drizzle/schema";
import {
  claimVoiceSession,
  consumeVoiceSessionToken,
  isVoiceSessionActive,
  issueVoiceSessionToken,
  releaseVoiceSession,
} from "../services/postgresVoiceSessionStore";

// ── Constants ─────────────────────────────────────────────────────────────

const TOKEN_TTL = 30;          // seconds
const SESSION_TTL = 300;       // seconds (5 minutes max)
const AUDIO_BUFFER_MAX = 60;   // seconds before forced STT dispatch
const MAX_FRAME_BYTES = 64 * 1024; // 64KB
const RATE_LIMIT_CHUNKS = 50;  // chunks per second
const RATE_WARNING_WINDOW = 10_000; // ms

export const CLOSE_CODES = {
  INVALID_TOKEN: 4001,
  CREDIT_EXHAUSTED: 4002,
  RATE_LIMIT: 4003,
  CONCURRENT_SESSION: 4004,
  SESSION_TIMEOUT: 4005,
  FRAME_TOO_LARGE: 4006,
} as const;

// ── Active sessions map (userId -> WebSocket) ─────────────────────────────

const activeSessions = new Map<number, { ws: WebSocket; owner: string }>();

// ── WebSocket Server ──────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;
let consentPollTimer: ReturnType<typeof setInterval> | null = null;
let consentPollRunning = false;

function getWss(): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
  }
  return wss;
}

function closeLocalVoiceSession(userId: number): void {
  const session = activeSessions.get(userId);
  if (session?.ws.readyState === WebSocket.OPEN) {
    session.ws.close(1008, "Consent withdrawn");
  }
  activeSessions.delete(userId);
}

function startConsentRevocationPolling(): void {
  if (consentPollTimer) return;
  consentPollTimer = setInterval(async () => {
    if (consentPollRunning) return;
    const userIds = [...activeSessions.keys()];
    if (userIds.length === 0) {
      if (consentPollTimer) clearInterval(consentPollTimer);
      consentPollTimer = null;
      return;
    }
    consentPollRunning = true;
    try {
      const db = getDb();
      const consented = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, userIds), isNotNull(users.voiceConsentGrantedAt)));
      const consentedIds = new Set(consented.map((row) => row.id));
      for (const userId of userIds) {
        if (!consentedIds.has(userId)) closeLocalVoiceSession(userId);
      }
    } catch (error) {
      // A failed consent check is fail-closed: a withdrawn consent must never
      // leave a live audio stream running because the database is unavailable.
      console.error("[VoiceGateway] Consent status check failed; closing active sessions", error);
      for (const userId of userIds) closeLocalVoiceSession(userId);
    } finally {
      consentPollRunning = false;
    }
  }, 2_000);
  consentPollTimer.unref?.();
}

// ── Session Token Endpoint ────────────────────────────────────────────────

export function createVoiceSessionRouter(): Router {
  const router = Router();

  // POST /api/voice/session — create session token
  router.post("/session", async (req, res) => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userId = user.id as number;
    const tenantId = user.currentTenantId as string;

    // Feature flag gate — voice chat must be enabled for this tenant
    const voiceChatEnabled = await getTenantFeatureFlag("voiceChat", tenantId);
    if (!voiceChatEnabled) {
      res.status(403).json({ error: "Voice chat is not enabled for this tenant" });
      return;
    }

    // Check consent
    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const [userRecord] = await db
      .select({ voiceConsentGrantedAt: users.voiceConsentGrantedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRecord?.voiceConsentGrantedAt) {
      res.status(403).json({ error: "Voice consent required before starting a session" });
      return;
    }

    // The PostgreSQL slot is the cross-instance source of truth.
    try {
      if (await isVoiceSessionActive(userId)) {
        res.status(409).json({ error: "Active voice session already exists" });
        return;
      }

      // Generate token
      const token = crypto.randomBytes(32).toString("hex");
      await issueVoiceSessionToken(token, { userId, tenantId }, TOKEN_TTL);

      res.json({ token, wsUrl: "/api/voice/stream" });
    } catch {
      res.status(503).json({ error: "Session service unavailable" });
    }
  });

  // POST /api/voice/consent/grant — grant PDPA/GDPR consent
  router.post("/consent/grant", async (req, res) => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    await db
      .update(users)
      .set({ voiceConsentGrantedAt: new Date() })
      .where(eq(users.id, user.id as number));

    res.json({ ok: true });
  });

  // POST /api/voice/consent/withdraw — withdraw consent + terminate session
  router.post("/consent/withdraw", async (req, res) => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userId = user.id as number;
    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    await db
      .update(users)
      .set({ voiceConsentGrantedAt: null })
      .where(eq(users.id, userId));

    // Close immediately on this instance. Other instances observe the SQL
    // consent update through their bounded active-session polling loop.
    closeLocalVoiceSession(userId);

    res.json({ ok: true });
  });

  return router;
}

// ── WebSocket Upgrade Handler ─────────────────────────────────────────────

/**
 * Handle HTTP -> WebSocket upgrade for /api/voice/stream.
 * Call this from the HTTP server's `upgrade` event.
 */
export function handleVoiceUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
): void {
  const wssInstance = getWss();
  wssInstance.handleUpgrade(req, socket as any, head, async (ws) => {
    const urlStr = req.url ?? "";
    const url = new URL(urlStr, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(CLOSE_CODES.INVALID_TOKEN, "Missing token");
      return;
    }

    // Atomically consume the one-time token in PostgreSQL.
    let sessionInfo: { userId: number; tenantId: string } | null = null;
    try {
      sessionInfo = await consumeVoiceSessionToken(token);
    } catch {
      ws.close(CLOSE_CODES.INVALID_TOKEN, "Token service unavailable");
      return;
    }

    if (!sessionInfo) {
      ws.close(CLOSE_CODES.INVALID_TOKEN, "Invalid or expired token");
      return;
    }

    const { userId, tenantId } = sessionInfo;
    if (!Number.isSafeInteger(userId) || userId < 1 || !tenantId) {
      ws.close(CLOSE_CODES.INVALID_TOKEN, "Malformed session data");
      return;
    }

    // Check concurrent session limit
    const owner = crypto.randomUUID();
    try {
      const claimed = await claimVoiceSession(userId, owner, SESSION_TTL);
      if (!claimed) {
        ws.close(CLOSE_CODES.CONCURRENT_SESSION, "Concurrent session limit reached");
        return;
      }
    } catch {
      ws.close(CLOSE_CODES.INVALID_TOKEN, "Session setup failed");
      return;
    }

    activeSessions.set(userId, { ws, owner });
    startConsentRevocationPolling();
    handleVoiceSession(ws, userId, tenantId, owner);
  });
}

// ── WebSocket Session Handler ─────────────────────────────────────────────

interface ChunkRateLimiter {
  timestamps: number[];
  warnings: number;
  windowStart: number;
}

function handleVoiceSession(ws: WebSocket, userId: number, tenantId: string, owner: string): void {
  const audioChunks: Buffer[] = [];
  let audioByteCount = 0;
  const rateLimiter: ChunkRateLimiter = { timestamps: [], warnings: 0, windowStart: Date.now() };

  // Session timeout (300s)
  const sessionTimer = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "system", message: "Session expired" }));
      ws.close(CLOSE_CODES.SESSION_TIMEOUT, "Session timeout");
    }
  }, SESSION_TTL * 1000);

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      // Audio chunk
      const chunk = data as Buffer;

      // Frame size check
      if (chunk.byteLength > MAX_FRAME_BYTES) {
        ws.close(CLOSE_CODES.FRAME_TOO_LARGE, "Frame too large");
        return;
      }

      // Rate limiting — count warnings per 10s window, close after 3
      const now = Date.now();
      rateLimiter.timestamps = rateLimiter.timestamps.filter(t => now - t < 1000);
      rateLimiter.timestamps.push(now);

      if (rateLimiter.timestamps.length > RATE_LIMIT_CHUNKS) {
        // Reset window every 10s and increment warning for this window
        if (now - rateLimiter.windowStart >= RATE_WARNING_WINDOW) {
          rateLimiter.windowStart = now;
        }
        rateLimiter.warnings++;
        if (rateLimiter.warnings >= 3) {
          ws.close(CLOSE_CODES.RATE_LIMIT, "Rate limit exceeded");
          return;
        }
        ws.send(JSON.stringify({ type: "error", code: "rate_limit_warning", message: "Sending audio too fast" }));
        return;
      }

      audioChunks.push(chunk);
      audioByteCount += chunk.byteLength;

      // Auto-dispatch at 60s buffer limit
      const MAX_PCM_BYTES = 16_000 * 2 * AUDIO_BUFFER_MAX;
      if (audioByteCount >= MAX_PCM_BYTES) {
        dispatchSTT(ws, audioChunks.splice(0), userId, tenantId);
        audioByteCount = 0;
      }
    } else {
      // Control message
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "end_turn") {
          if (audioChunks.length > 0) {
            dispatchSTT(ws, audioChunks.splice(0), userId, tenantId);
            audioByteCount = 0;
          }
        }
      } catch {
        // Ignore malformed JSON
      }
    }
  });

  ws.on("close", () => {
    clearTimeout(sessionTimer);
    if (activeSessions.get(userId)?.ws === ws) activeSessions.delete(userId);
    releaseVoiceSession(userId, owner).catch((error) => {
      console.error("[VoiceGateway] Failed to release session slot", error);
    });
  });
}

async function dispatchSTT(ws: WebSocket, chunks: Buffer[], userId: number, tenantId: string): Promise<void> {
  if (chunks.length === 0) return;

  try {
    const combined = Buffer.concat(chunks);
    const result = await transcribe(combined, { format: "pcm16" });

    // Deduct credits for STT usage (non-blocking — failure must not break transcription)
    const durationSeconds = (combined.byteLength / (16_000 * 2));
    const credits = calculateSTTCredits(durationSeconds, result.provider ?? "groq");
    if (credits > 0) {
      deductCredits({
        userId,
        tenantId,
        amount: credits,
        description: `Voice STT (${Math.round(durationSeconds)}s via ${result.provider ?? "groq"})`,
        sourceType: "stt",
      }).catch(() => { /* non-critical */ });
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "transcript",
        text: result.text,
        isFinal: true,
        language: result.language,
        confidence: result.confidence,
      }));
    }
  } catch {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "error", code: "stt_failed", message: "Transcription failed" }));
    }
  }
}

// ── Shutdown ──────────────────────────────────────────────────────────────

export async function shutdownVoiceGateway(): Promise<void> {
  if (consentPollTimer) clearInterval(consentPollTimer);
  consentPollTimer = null;
  for (const { ws } of activeSessions.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.close(1001, "Server shutting down");
  }
  if (wss) {
    await new Promise<void>((resolve) => wss!.close(() => resolve()));
    wss = null;
  }
}
