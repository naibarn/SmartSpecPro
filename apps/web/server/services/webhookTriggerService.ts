/**
 * Webhook Trigger Service — core business logic.
 *
 * Handles: auth verification (token + HMAC-SHA256), deduplication,
 * rate limiting, template substitution, secret stripping, and log recording.
 *
 * Security properties:
 * - Token comparison: crypto.timingSafeEqual() to prevent timing attacks
 * - HMAC replay protection: 300-second window on timestamp
 * - Dedup: Redis SET NX EX 300 keyed by triggerId+timestamp+bodyHash
 * - Template substitution: regex-only (no SSTI), allowlist validated at save time
 * - Secret stripping: redacts known secret patterns before log storage
 */

import crypto from "crypto";
import { getRedisClient } from "./redis";
import { decrypt } from "./crypto";

// ── Constants ──────────────────────────────────────────────────────────────────

const HMAC_WINDOW_SECONDS = 300;   // 5 minutes
const DEDUP_TTL_SECONDS = 300;     // 5 minutes
const RATE_LIMIT_WINDOW_SECONDS = 60;

// Patterns that indicate secret values — redacted before log storage
const SECRET_PATTERNS = [
  /^sk-/i,
  /^ghp_/i,
  /^xoxb-/i,
  /^Bearer /i,
  /^gho_/i,
  /^glpat-/i,
];

// Allowlisted variable patterns for template substitution
const ALLOWED_VARS_RE =
  /^\{\{(event\.type|event\.data(\.\w+){0,3}|trigger\.name|trigger\.id|timestamp)\}\}$/;

// ── Auth verification ──────────────────────────────────────────────────────────

/**
 * Verify a Bearer token using timing-safe comparison.
 * Rejects immediately if lengths differ (length is not secret-sensitive),
 * then compares equal-length buffers with timingSafeEqual.
 */
export async function verifyTokenAuth(
  authSecretEncrypted: string,
  providedToken: string,
): Promise<boolean> {
  if (!providedToken) return false;
  try {
    const storedSecret = decrypt(authSecretEncrypted);
    const a = Buffer.from(storedSecret, "utf8");
    const b = Buffer.from(providedToken, "utf8");
    // Reject immediately on length mismatch — length is not timing-sensitive
    // since an attacker can independently measure both values.
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface HmacVerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify HMAC-SHA256 signature with replay protection.
 * HMAC input: `timestamp + "." + rawBody`
 * Replay window: 300 seconds.
 */
export async function verifyHmacAuth(
  authSecretEncrypted: string,
  timestamp: string,
  signature: string,
  rawBody: string,
): Promise<HmacVerifyResult> {
  // Validate timestamp is within replay window
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > HMAC_WINDOW_SECONDS) {
    return { valid: false, reason: "Timestamp outside acceptable window (±300s)" };
  }

  try {
    const storedSecret = decrypt(authSecretEncrypted);
    const expectedSig = crypto
      .createHmac("sha256", storedSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    const a = Buffer.from(expectedSig, "hex");
    // Guard: compare hex string lengths first, then validate decoded byte lengths
    if (signature.length !== expectedSig.length) {
      return { valid: false, reason: "Invalid signature format" };
    }
    const b = Buffer.from(signature, "hex");
    // Explicit byte-length check after hex decode (guards against invalid hex chars)
    if (a.length !== b.length || a.length !== 32) {
      return { valid: false, reason: "Invalid signature format" };
    }
    const match = crypto.timingSafeEqual(a, b);
    return { valid: match };
  } catch {
    return { valid: false, reason: "Signature verification failed" };
  }
}

// ── Deduplication ──────────────────────────────────────────────────────────────

/**
 * Check and record dedup key in Redis using SET NX EX.
 * Returns true if this is a duplicate (key already existed).
 * Returns false if this is a new request (key was set successfully).
 */
export async function checkDedup(
  triggerId: string,
  timestamp: string,
  bodyHash: string,
): Promise<boolean> {
  const redis = getRedisClient();
  const key = `webhook:dedup:${triggerId}:${timestamp}:${bodyHash}`;
  // SET NX EX — returns "OK" if set (new), null if already exists (duplicate)
  const result = await redis.set(key, "1", "EX", DEDUP_TTL_SECONDS, "NX");
  return result === null; // null = key existed = duplicate
}

// ── Rate limiting ──────────────────────────────────────────────────────────────

/**
 * Check and increment rate limit counter for a trigger.
 * Returns true if rate-limited (blocked), false if allowed.
 */
export async function checkWebhookRateLimit(
  triggerId: string,
  limitPerMinute: number,
): Promise<boolean> {
  const redis = getRedisClient();
  const minuteBucket = Math.floor(Date.now() / 60000);
  const key = `webhook:ratelimit:${triggerId}:${minuteBucket}`;
  // Use pipeline to INCR + EXPIRE atomically, preventing race where two concurrent
  // first-requests both increment to 1+ and neither sets the TTL (key lives forever).
  const [count] = await redis
    .pipeline()
    .incr(key)
    .expire(key, RATE_LIMIT_WINDOW_SECONDS)
    .exec() as [number, number];
  return count > limitPerMinute;
}

// ── Template validation and substitution ──────────────────────────────────────

/**
 * Validate that all {{...}} patterns in a template are in the allowlist.
 * Returns true if all patterns are allowed (or no patterns exist).
 */
export function validateTemplate(template: string): boolean {
  const matches = template.match(/\{\{[^}]+\}\}/g) ?? [];
  return matches.every((m) => ALLOWED_VARS_RE.test(m));
}

export interface TemplateVars {
  eventType: string;
  eventData: unknown;
  triggerName: string;
  triggerId: string;
  timestamp: string;
}

/**
 * Substitute allowlisted {{variable}} patterns in a template string.
 * Unresolved variables are replaced with empty string (no raw template leak).
 */
export function substituteTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    path = path.trim();
    if (path === "event.type") return String(vars.eventType ?? "");
    if (path === "event.data") return JSON.stringify(vars.eventData ?? {});
    if (path === "trigger.name") return String(vars.triggerName ?? "");
    if (path === "trigger.id") return String(vars.triggerId ?? "");
    if (path === "timestamp") return String(vars.timestamp ?? "");
    // event.data.* — dot-notation access up to 3 levels
    if (path.startsWith("event.data.")) {
      const parts = path.slice("event.data.".length).split(".");
      if (parts.length > 0 && parts.length <= 3) {
        let val: unknown = vars.eventData;
        for (const part of parts) {
          if (val !== null && typeof val === "object" && part in (val as Record<string, unknown>)) {
            val = (val as Record<string, unknown>)[part];
          } else {
            val = undefined;
            break;
          }
        }
        return val !== undefined ? String(val) : "";
      }
    }
    // Unrecognized — return empty string
    return "";
  });
}

/**
 * Substitute variables in an entire JSON template object.
 * Returns a new object with all string values substituted.
 */
export function substituteTemplateObject(
  templateObj: Record<string, unknown>,
  vars: TemplateVars,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(templateObj)) {
    if (typeof value === "string") {
      result[key] = substituteTemplate(value, vars);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = substituteTemplateObject(value as Record<string, unknown>, vars);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── Secret stripping ──────────────────────────────────────────────────────────

/**
 * Strip values matching known secret patterns from a variables object.
 * Recursively traverses nested objects and arrays.
 */
export function stripSecrets(vars: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === "string" && SECRET_PATTERNS.some((p) => p.test(value))) {
      sanitized[key] = "[REDACTED]";
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        item !== null && typeof item === "object"
          ? stripSecrets(item as Record<string, unknown>)
          : item,
      );
    } else if (value !== null && typeof value === "object") {
      sanitized[key] = stripSecrets(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ── Body hashing ──────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest of a raw body string.
 */
export function hashBody(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
}

// ── IP masking ────────────────────────────────────────────────────────────────

/**
 * Mask an IP address to its /24 prefix (privacy requirement).
 * Returns "unknown/24" if the IP cannot be parsed.
 */
export function maskIp(ip: string | undefined): string {
  if (!ip) return "unknown/24";
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  // IPv6 or unexpected format — return masked version
  return "masked/24";
}
