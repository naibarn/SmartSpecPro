import crypto from "node:crypto";
import { checkRateLimit } from "../middleware/distributedRateLimit";
import { getCacheClient } from "./redisClients";
import { getPublicContactProtectionConfig } from "./publicContactProtectionSettings";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "public_contact";
const MIN_FORM_DWELL_MS = 1_500;
const MAX_FORM_AGE_MS = 2 * 60 * 60_000;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const IP_RATE_LIMIT = 5;
const EMAIL_RATE_LIMIT = 5;
const REPLAY_TTL_SECONDS = 24 * 60 * 60;

type TurnstileValidation = {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

export type PublicContactAbuseReason =
  | "missing_turnstile"
  | "turnstile_configuration"
  | "turnstile_failed"
  | "turnstile_unavailable"
  | "honeypot"
  | "invalid_form_timing"
  | "too_many_links"
  | "invalid_payload"
  | "rate_limited"
  | "duplicate_submission"
  | "abuse_store_unavailable";

export type PublicContactGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: PublicContactAbuseReason;
      retryAfter?: number;
      temporary?: boolean;
    };

function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function countLinks(value: string): number {
  return (value.match(/(?:https?:\/\/|www\.)/gi) || []).length;
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

async function validateTurnstile(
  token: string | undefined,
  ip: string
): Promise<PublicContactGuardResult> {
  const config = await getPublicContactProtectionConfig();

  if (!config.required) return { allowed: true };
  if (!token?.trim()) return { allowed: false, reason: "missing_turnstile" };
  if (!config.configured || !config.secretKey) {
    return {
      allowed: false,
      reason: "turnstile_configuration",
      temporary: true,
    };
  }
  if (token.length > 2048) {
    return { allowed: false, reason: "invalid_payload" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  let response: Response;
  try {
    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: config.secretKey,
        response: token,
        remoteip: ip || undefined,
        idempotency_key: crypto.randomUUID(),
      }),
      signal: controller.signal,
    });
  } catch {
    return {
      allowed: false,
      reason: "turnstile_unavailable",
      temporary: true,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      allowed: false,
      reason: "turnstile_unavailable",
      temporary: true,
    };
  }

  let validation: TurnstileValidation;
  try {
    validation = (await response.json()) as TurnstileValidation;
  } catch {
    return {
      allowed: false,
      reason: "turnstile_unavailable",
      temporary: true,
    };
  }

  if (!validation.success) {
    return { allowed: false, reason: "turnstile_failed" };
  }
  if (validation.action !== TURNSTILE_ACTION) {
    return { allowed: false, reason: "turnstile_failed" };
  }
  if (
    !validation.hostname ||
    !config.allowedHostnames.includes(validation.hostname.toLowerCase())
  ) {
    return { allowed: false, reason: "turnstile_failed" };
  }

  return { allowed: true };
}

export async function checkPublicContactAbuse(params: {
  ip: string;
  email: string;
  subject: string;
  message: string;
  turnstileToken?: string;
  honeypot?: string;
  formStartedAt?: number;
  nowMs?: number;
}): Promise<PublicContactGuardResult> {
  const nowMs = params.nowMs ?? Date.now();
  const normalizedEmail = normalizeText(params.email);
  const normalizedSubject = normalizeText(params.subject);
  const normalizedMessage = normalizeText(params.message);

  if (params.honeypot?.trim()) {
    return { allowed: false, reason: "honeypot" };
  }
  if (
    !Number.isFinite(params.formStartedAt) ||
    nowMs - Number(params.formStartedAt) < MIN_FORM_DWELL_MS ||
    nowMs - Number(params.formStartedAt) > MAX_FORM_AGE_MS
  ) {
    return { allowed: false, reason: "invalid_form_timing" };
  }
  if (
    !normalizedEmail ||
    !normalizedSubject ||
    !normalizedMessage ||
    hasControlCharacters(params.email) ||
    hasControlCharacters(params.subject) ||
    hasControlCharacters(params.message)
  ) {
    return { allowed: false, reason: "invalid_payload" };
  }
  if (countLinks(`${params.subject}\n${params.message}`) > 4) {
    return { allowed: false, reason: "too_many_links" };
  }

  const ipHash = hashIdentifier(params.ip || "unknown");
  try {
    // Spend the IP budget before contacting Turnstile so hostile clients
    // cannot use this endpoint to amplify requests to the verification API.
    const ipLimit = await checkRateLimit(
      `public-contact:ip:${ipHash}`,
      IP_RATE_LIMIT,
      RATE_LIMIT_WINDOW_SECONDS
    );
    if (ipLimit.error === "redis_unavailable") {
      return {
        allowed: false,
        reason: "abuse_store_unavailable",
        temporary: true,
      };
    }
    if (!ipLimit.allowed) {
      return {
        allowed: false,
        reason: "rate_limited",
        retryAfter: ipLimit.retryAfter ?? RATE_LIMIT_WINDOW_SECONDS,
      };
    }
  } catch {
    return {
      allowed: false,
      reason: "abuse_store_unavailable",
      temporary: true,
    };
  }

  const turnstileResult = await validateTurnstile(
    params.turnstileToken,
    params.ip
  );
  if (!turnstileResult.allowed) return turnstileResult;

  const emailHash = hashIdentifier(normalizedEmail);
  const fingerprint = hashIdentifier(
    `${normalizedEmail}\n${normalizedSubject}\n${normalizedMessage}`
  );

  try {
    const emailLimit = await checkRateLimit(
      `public-contact:email:${emailHash}`,
      EMAIL_RATE_LIMIT,
      RATE_LIMIT_WINDOW_SECONDS
    );
    if (emailLimit.error === "redis_unavailable") {
      return {
        allowed: false,
        reason: "abuse_store_unavailable",
        temporary: true,
      };
    }
    if (!emailLimit.allowed) {
      return {
        allowed: false,
        reason: "rate_limited",
        retryAfter: emailLimit.retryAfter ?? RATE_LIMIT_WINDOW_SECONDS,
      };
    }

    const replayKey = `public-contact:replay:${fingerprint}`;
    const replayResult = await getCacheClient().set(
      replayKey,
      "1",
      "EX",
      REPLAY_TTL_SECONDS,
      "NX"
    );
    if (replayResult !== "OK") {
      return { allowed: false, reason: "duplicate_submission" };
    }
  } catch {
    return {
      allowed: false,
      reason: "abuse_store_unavailable",
      temporary: true,
    };
  }

  return { allowed: true };
}

export const publicContactAbuseConstants = {
  turnstileAction: TURNSTILE_ACTION,
  minFormDwellMs: MIN_FORM_DWELL_MS,
  maxFormAgeMs: MAX_FORM_AGE_MS,
  rateLimitWindowSeconds: RATE_LIMIT_WINDOW_SECONDS,
};
