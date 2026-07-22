/**
 * Feature 135 — Hermes Grok media worker: defensive stdout parsers for the
 * `hermes` CLI (research B2/B3: device-code stdout format is
 * UNDOCUMENTED — parse defensively, never throw).
 *
 * Pure functions, no I/O, no `db` import — this module must stay importable
 * by the section-07 shared worker process AND unit-testable here with zero
 * DB/process dependencies. See `server/services/__tests__/
 * hermesMediaNamespaceGuard.test.ts`, which also walks this directory.
 */
import {
  HERMES_CONTROL_FAILURE_REASONS,
  HERMES_MEDIA_OPERATIONS,
  type HermesConnectionCapabilityManifest,
  type HermesControlFailureReason,
  type HermesMediaOperation,
} from "../../shared/hermesMedia";

export interface HermesDeviceCodeParseResult {
  verificationUrl?: string;
  userCode?: string;
  expiresAt?: string;
  /** Fallback when parsing failed — raw candidate lines preserved so the UI
   *  can still show the (untranslated) instruction text. Never logged. */
  raw?: string;
}

export interface HermesAuthStatusParseResult {
  authorized: boolean;
  accountHint?: string;
}

// Box-drawing (U+2500–U+257F), block elements (U+2580–U+259F), geometric
// shapes (U+25A0–U+25FF), and common bullet glyphs. Deliberately does NOT
// strip plain ASCII punctuation (":", "-", ".", "/") — a user code like
// "ABCD-EFGH" or a URL must survive stripping intact.
const DECORATION_PATTERN = /[─-◿•]/g;

function stripDecoration(line: string): string {
  return line.replace(DECORATION_PATTERN, " ").trim();
}

const URL_PATTERN = /https:\/\/[^\s"'<>]+/g;
const CODE_PATTERN = /\b[A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8})?\b/g;
const XAI_HOST_PATTERN = /^https:\/\/([a-z0-9-]+\.)*x\.ai\//i;

/** Prefer an xAI-ish host when multiple URLs are present; accept any
 *  https URL otherwise (spec: "do not over-fit"). */
function pickBestUrl(urls: string[]): string | undefined {
  if (urls.length === 0) return undefined;
  return urls.find((url) => XAI_HOST_PATTERN.test(url)) ?? urls[0];
}

function extractExpiresAt(text: string, now: () => Date): string | undefined {
  const isoMatch = text.match(/expires?(?:\s+at)?[:\s]+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.Z+-]+)/i);
  if (isoMatch) {
    const parsed = new Date(isoMatch[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const relMatch = text.match(/(?:expires?|valid for)\s+(?:in\s+)?(\d+)\s*(minute|min|hour|hr)s?\b/i);
  if (relMatch) {
    const amount = Number.parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const ms = unit.startsWith("hour") || unit === "hr" ? amount * 60 * 60_000 : amount * 60_000;
    return new Date(now().getTime() + ms).toISOString();
  }
  return undefined;
}

/**
 * Extracts `{ verificationUrl, userCode, expiresAt }` from an accumulated
 * buffer of `hermes auth add xai-oauth --no-browser` stdout (callers should
 * pass the FULL buffer seen so far — URL and code frequently land on
 * separate lines). Never throws; unparseable output falls back to
 * `{ raw }` with the (decoration-stripped) candidate lines preserved.
 * Never returns a userCode without at least attempting to find its URL —
 * a code found with no URL (or vice versa) is treated as unparseable.
 */
export function parseHermesDeviceCodeOutput(
  rawText: string,
  deps: { now?: () => Date } = {},
): HermesDeviceCodeParseResult {
  const now = deps.now ?? (() => new Date());
  const lines = rawText
    .split(/\r?\n/)
    .map(stripDecoration)
    .filter((line) => line.length > 0);
  if (lines.length === 0) return {};

  const joined = lines.join("\n");
  const urls = joined.match(URL_PATTERN) ?? [];
  const verificationUrl = pickBestUrl(urls);

  // Strip URL substrings before scanning for the code so no URL fragment
  // is ever mistaken for the user code.
  let codeSearchText = joined;
  for (const url of urls) {
    codeSearchText = codeSearchText.split(url).join(" ");
  }
  const codeMatches = codeSearchText.match(CODE_PATTERN) ?? [];
  const userCode = codeMatches.find((candidate) => candidate.includes("-")) ?? codeMatches[0];

  if (verificationUrl && userCode) {
    const expiresAt = extractExpiresAt(joined, now);
    return expiresAt ? { verificationUrl, userCode, expiresAt } : { verificationUrl, userCode };
  }

  return { raw: joined };
}

const AUTHORIZED_PATTERN = /\b(authenticated|authorized|logged in)\b/i;
const NOT_AUTHORIZED_PATTERN = /\b(not authenticated|not authorized|no active session|not logged in)\b/i;
const ACCOUNT_HINT_PATTERN = /(?:account|user|logged in as)[:\s]+([\w.@+-]+)/i;

/** Parses `hermes auth status xai-oauth` stdout into
 *  `{ authorized, accountHint? }`. Garbage/empty input → `{ authorized: false }`. */
export function parseHermesAuthStatusOutput(text: string): HermesAuthStatusParseResult {
  if (NOT_AUTHORIZED_PATTERN.test(text)) return { authorized: false };
  if (!AUTHORIZED_PATTERN.test(text)) return { authorized: false };
  const hintMatch = text.match(ACCOUNT_HINT_PATTERN);
  return hintMatch ? { authorized: true, accountHint: hintMatch[1] } : { authorized: true };
}

/** Substring presence check against the fixed operation taxonomy — the
 *  fake CLI (and section 07's real `hermes tools` output) list operation
 *  identifiers verbatim (e.g. `image.generate`, `image.edit`). */
export function parseHermesToolsOutput(text: string): HermesMediaOperation[] {
  const found: HermesMediaOperation[] = [];
  const normalized = text.toLowerCase();
  const imageGenerationAvailable = normalized.includes("image generation");
  const videoGenerationAvailable = normalized.includes("video generation");
  for (const operation of HERMES_MEDIA_OPERATIONS) {
    if (
      text.includes(operation)
      || (operation.startsWith("image.") && imageGenerationAvailable)
      || (operation.startsWith("video.") && videoGenerationAvailable)
    ) {
      found.push(operation);
    }
  }
  return found;
}

/**
 * Composes the section-01 `HermesConnectionCapabilityManifest`: an
 * operation is `enabled: true` only when its backing tool is present
 * post-auth (`toolsOutput`); absent tools get `enabled: false` + `reason`.
 */
export function buildCapabilityManifest(params: {
  hermesVersion: string;
  toolsOutput: string;
  authStatus: HermesAuthStatusParseResult;
  probedAt: string;
}): HermesConnectionCapabilityManifest {
  const available = new Set(parseHermesToolsOutput(params.toolsOutput));
  const operations: HermesConnectionCapabilityManifest["operations"] = {};
  for (const operation of HERMES_MEDIA_OPERATIONS) {
    operations[operation] = available.has(operation)
      ? { enabled: true }
      : {
          enabled: false,
          reason: params.authStatus.authorized
            ? "Tool not available for this Hermes CLI installation post-authorization"
            : "Connection is not authorized",
        };
  }
  return {
    hermesVersion: params.hermesVersion,
    probedAt: params.probedAt,
    operations,
    // Model discovery from `hermes tools` output is out of this section's
    // scope (no documented format yet) — left empty; a later section may
    // extend `parseHermesToolsOutput` to populate these.
    models: { image: [], video: [] },
  };
}

const ENTITLEMENT_PATTERN = /\b403\b|forbidden|entitlement/i;
const REAUTH_PATTERN = /revoked|invalid_grant|unauthorized|reauth|no active session|not authenticated/i;
const DENIED_PATTERN = /denied|declined/i;
const EXPIRED_PATTERN = /expired|timeout|timed out/i;

/** Maps a xAI error body / stderr / stdout excerpt to one of the shared
 *  `HERMES_CONTROL_FAILURE_REASONS` classifications. Anything unmatched
 *  falls back to `"process_failed"` — a generic, safe default. */
export function classifyHermesFailureOutput(text: string): HermesControlFailureReason {
  if (ENTITLEMENT_PATTERN.test(text)) return "entitlement_restricted";
  if (REAUTH_PATTERN.test(text)) return "reauth_required";
  if (DENIED_PATTERN.test(text)) return "oauth_denied";
  if (EXPIRED_PATTERN.test(text)) return "oauth_session_expired";
  return "process_failed";
}

// Re-exported for convenience so handler code / tests need only import
// from this module for the parser + vocabulary pairing.
export { HERMES_CONTROL_FAILURE_REASONS };
