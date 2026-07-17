/**
 * Feature 135 (Hermes/Grok media worker) — client-side error presentation.
 *
 * Small, pure module so every surface (HermesConnectPanel, HermesConnectionPicker,
 * VD/MediaStudio generate-error toasts) renders a typed `HERMES_*` error code
 * identically: Thai-primary + English copy, retryability, and an optional
 * retry-after hint. This module owns no UI — callers wire the returned shape
 * into their own toast/inline-error rendering.
 *
 * Wire convention (section-01, pinned): the server throws
 * `new TRPCError({ message: formatHermesErrorMessage(code, detail) })`, i.e.
 * `message = "[HERMES_X] <english copy>[ — detail]"`. A TRPCError's `cause`
 * does NOT serialize to the client, so this message prefix is the ONE
 * channel for the typed code on a thrown mutation/query error;
 * `extractHermesErrorCode` parses it back via `parseHermesErrorMessage`.
 * Task projections (section-06) instead carry a plain `errorCode` field.
 */
import {
  hermesErrorCopy,
  parseHermesErrorMessage,
  HERMES_MEDIA_ERROR_CODES,
  type HermesMediaErrorCode,
} from "@shared/hermesMedia";

function isHermesErrorCode(value: unknown): value is HermesMediaErrorCode {
  return (
    typeof value === "string" &&
    (HERMES_MEDIA_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Pulls a typed Hermes error code out of, in order:
 * 1. A TRPCClientError-shaped value whose `message` carries the pinned
 *    `[HERMES_X] ...` prefix (delegates to `parseHermesErrorMessage`).
 * 2. A plain `{ errorCode }` task projection (section-06).
 * 3. A bare code string.
 * Returns `null` when nothing recognizable is found.
 */
export function extractHermesErrorCode(error: unknown): HermesMediaErrorCode | null {
  if (error == null) return null;

  if (typeof error === "string") {
    return isHermesErrorCode(error) ? error : parseHermesErrorMessage(error);
  }

  if (typeof error === "object") {
    const candidate = error as { message?: unknown; errorCode?: unknown };
    if (typeof candidate.errorCode === "string" && isHermesErrorCode(candidate.errorCode)) {
      return candidate.errorCode;
    }
    if (typeof candidate.message === "string") {
      const parsed = parseHermesErrorMessage(candidate.message);
      if (parsed) return parsed;
    }
  }

  return null;
}

export interface HermesErrorPresentation {
  code: HermesMediaErrorCode;
  th: string;
  en: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}

/**
 * Wraps `hermesErrorCopy` with the extracted code and passes through
 * `retryAfterSeconds` when the error carries one (e.g. `HERMES_RATE_LIMITED`
 * rejections that include a numeric `retryAfterSeconds` field). Returns
 * `null` when no typed code can be extracted — callers should fall back to
 * the raw error message in that case.
 */
export function presentHermesError(error: unknown): HermesErrorPresentation | null {
  const code = extractHermesErrorCode(error);
  if (!code) return null;

  const copy = hermesErrorCopy(code);
  const retryAfterSeconds =
    error != null && typeof error === "object" && "retryAfterSeconds" in error
      ? (() => {
          const value = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
          return typeof value === "number" && Number.isFinite(value) ? value : undefined;
        })()
      : undefined;

  return {
    code,
    th: copy.th,
    en: copy.en,
    retryable: copy.retryable,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}

/**
 * Renders a `presentHermesError` result as a single localized string with an
 * optional textual retry affordance — the shared "one toast line" format
 * every VD/MediaStudio generate-error toast uses (CharacterStockPanel,
 * LocationStockPanel, StoryboardPanel, EpisodePage, MediaStudio). Purely
 * textual (no new interactive button/callback) so wiring it into an
 * existing `toast.error(string)` call site is a pure rendering change, never
 * a behavior change: non-retryable codes get no suffix at all; retryable
 * codes get "(ลองใหม่ได้)" / "(retryable)", refined to
 * "(ลองใหม่ได้ในอีก Ns)" / "(retry in Ns)" when `retryAfterSeconds` is present.
 */
export function formatHermesErrorForToast(
  presentation: HermesErrorPresentation,
  lang: "th" | "en",
): string {
  const copy = lang === "th" ? presentation.th : presentation.en;
  if (!presentation.retryable) return copy;
  const retrySuffix =
    lang === "th"
      ? presentation.retryAfterSeconds != null
        ? ` (ลองใหม่ได้ในอีก ${presentation.retryAfterSeconds} วินาที)`
        : " (ลองใหม่ได้)"
      : presentation.retryAfterSeconds != null
        ? ` (retry in ${presentation.retryAfterSeconds}s)`
        : " (retryable)";
  return `${copy}${retrySuffix}`;
}
