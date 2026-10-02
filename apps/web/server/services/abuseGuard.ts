/**
 * Abuse Guard — PostgreSQL-backed anomaly detection for LLM/media abuse patterns.
 *
 * Detects three attack patterns:
 * 1. Duplicate loop: identical prompt sent N+ times in a short window
 * 2. Burst anomaly: request rate far exceeds normal usage
 * 3. Sequential repetition: same action repeated in a tight loop
 *
 * Core limits fail closed; supplementary repetition heuristics fail open on storage errors.
 * All blocks are logged to the JSONL audit trail.
 */

import crypto from "node:crypto";
import { checkRateLimit } from "../middleware/distributedRateLimit";
import { auditLogger } from "./auditLogger";

// ─── Configuration (env vars with sensible defaults) ─────────────────────────

const ENABLED = process.env.ABUSE_GUARD_ENABLED !== "false";
const DUP_WINDOW_SEC = parseInt(process.env.ABUSE_DUP_WINDOW_SEC || "30", 10);
const DUP_MAX = parseInt(process.env.ABUSE_DUP_MAX || "3", 10);
const BURST_SHORT_MAX = parseInt(process.env.ABUSE_BURST_SHORT_MAX || "30", 10);
const BURST_LONG_MAX = parseInt(process.env.ABUSE_BURST_LONG_MAX || "200", 10);
const SEQ_MAX = parseInt(process.env.ABUSE_SEQ_MAX || "5", 10);
const SEQ_WINDOW_SEC = 120;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AbuseGuardResult {
  allowed: boolean;
  reason?: "duplicate_loop" | "burst_anomaly" | "sequential_repetition";
  retryAfter?: number;
}

export interface AbuseGuardParams {
  userId: number;
  namespace:
    | "chat"
    | "skill"
    | "media"
    | "media:image"
    | "media:video"
    | "media:audio"
    | "media:image_async"
    | "media:audio_async"
    | "media:video_async"
    | "finance";
  /** SHA-256 hash of the prompt/input content */
  promptHash: string;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Create a short hash of the prompt content for comparison.
 * Uses first 16 hex chars of SHA-256 — collision probability is negligible
 * for per-user duplicate detection.
 */
export function hashPrompt(content: string, extra?: string): string {
  return crypto
    .createHash("sha256")
    .update(content + (extra || ""))
    .digest("hex")
    .slice(0, 16);
}

// ─── Detection Layer 1: Duplicate Request ────────────────────────────────────

/**
 * Detect identical requests sent repeatedly in a short window.
 * Uses a shared PostgreSQL sliding window scoped to userId + promptHash.
 *
 * Example: same prompt sent 4 times in 30 seconds → blocked.
 */
async function detectDuplicateRequest(
  userId: number,
  namespace: string,
  promptHash: string,
): Promise<AbuseGuardResult> {
  try {
    const key = `abuse:dup:${namespace}:${userId}:${promptHash}`;
    const result = await checkRateLimit(key, DUP_MAX, DUP_WINDOW_SEC);
    if (!result.allowed) {
      return {
        allowed: false,
        reason: "duplicate_loop",
        retryAfter: result.retryAfter ?? DUP_WINDOW_SEC,
      };
    }

    return { allowed: true };
  } catch {
    // Fail open — let existing rate limiters handle it
    return { allowed: true };
  }
}

// ─── Detection Layer 2: Burst Anomaly ────────────────────────────────────────

/**
 * Detect sudden spikes in request frequency using two sliding windows:
 * - Short window (1 min): catches rapid bursts
 * - Long window (1 hour): catches sustained high-volume abuse
 *
 * Reuses the PostgreSQL-backed checkRateLimit from distributedRateLimit.ts.
 */
async function detectBurstAnomaly(
  userId: number,
  namespace: string,
): Promise<AbuseGuardResult> {
  try {
    // Short window: 30 requests per minute (default)
    const shortKey = `abuse:burst:${namespace}:short:${userId}`;
    const shortResult = await checkRateLimit(shortKey, BURST_SHORT_MAX, 60);
    // This detector is supplementary; core request limits remain fail-closed.
    if (shortResult.error === "storage_unavailable") {
      return { allowed: true };
    }

    if (!shortResult.allowed) {
      return {
        allowed: false,
        reason: "burst_anomaly",
        retryAfter: shortResult.retryAfter ?? 60,
      };
    }

    // Long window: 200 requests per hour (default)
    const longKey = `abuse:burst:${namespace}:long:${userId}`;
    const longResult = await checkRateLimit(longKey, BURST_LONG_MAX, 3600);
    if (longResult.error === "storage_unavailable") {
      return { allowed: true };
    }

    if (!longResult.allowed) {
      return {
        allowed: false,
        reason: "burst_anomaly",
        retryAfter: longResult.retryAfter ?? 300,
      };
    }

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

// ─── Detection Layer 3: Sequential Repetition ────────────────────────────────

/**
 * Detect automated loops by tracking the last N action hashes per user.
 * If all recent actions are identical, the user is likely running a script.
 *
 * Stores a bounded recent sequence in PostgreSQL so all web instances share it.
 */
async function detectSequentialRepetition(
  userId: number,
  namespace: string,
  promptHash: string,
): Promise<AbuseGuardResult> {
  try {
    const { recordSequentialValue } = await import("./postgresRateLimitStore");
    const recent = await recordSequentialValue(`abuse-seq:${namespace}`, String(userId), promptHash, SEQ_MAX, SEQ_WINDOW_SEC);

    if (recent.length >= SEQ_MAX) {
      const allSame = recent.every((h) => h === recent[0]);
      if (allSame) {
        return {
          allowed: false,
          reason: "sequential_repetition",
          retryAfter: SEQ_WINDOW_SEC,
        };
      }
    }

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

// ─── Unified Entry Point ─────────────────────────────────────────────────────

/**
 * Run all 3 abuse detection layers. Returns as soon as any layer blocks.
 *
 * Integration: call after existing rate limiters but before LLM/media dispatch.
 * On block, logs an audit event and returns { allowed: false, reason, retryAfter }.
 */
export async function checkAbuseGuard(
  params: AbuseGuardParams,
): Promise<AbuseGuardResult> {
  if (!ENABLED) return { allowed: true };

  const { userId, namespace, promptHash } = params;

  // Layer 1: Duplicate request detection
  const dupResult = await detectDuplicateRequest(userId, namespace, promptHash);
  if (!dupResult.allowed) {
    logAbuseEvent(userId, namespace, dupResult);
    return dupResult;
  }

  // Layer 2: Burst anomaly detection
  const burstResult = await detectBurstAnomaly(userId, namespace);
  if (!burstResult.allowed) {
    logAbuseEvent(userId, namespace, burstResult);
    return burstResult;
  }

  // Layer 3: Sequential repetition detection
  const seqResult = await detectSequentialRepetition(userId, namespace, promptHash);
  if (!seqResult.allowed) {
    logAbuseEvent(userId, namespace, seqResult);
    return seqResult;
  }

  return { allowed: true };
}

// ─── Audit Logging ───────────────────────────────────────────────────────────

function logAbuseEvent(
  userId: number,
  namespace: string,
  result: AbuseGuardResult,
): void {
  auditLogger.log({
    eventType: "error",
    userId,
    metadata: {
      kind: "abuse_guard",
      namespace,
      reason: result.reason,
      retryAfter: result.retryAfter,
    },
    errorType: "abuse_blocked",
    errorMessage: `Abuse guard blocked: ${result.reason} (namespace=${namespace}, retryAfter=${result.retryAfter}s)`,
  });
}
