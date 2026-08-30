/**
 * Central client-side system-error monitor.
 *
 * Classifies tRPC/query errors as system-vs-user-vs-auth, shows a single
 * friendly Thai toast (with a "report to admin" action) for system-class
 * errors, and keeps a small ring buffer of recent errors for the feedback
 * system to attach as diagnostics.
 *
 * Kept dependency-light on purpose (only `sonner`, `@trpc/client`, and the
 * small `apiResponseDiagnostics` helper — all side-effect free) so it is
 * safe to import from anywhere, including the feedback UI.
 */
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import {
  isHtmlApiErrorMessage,
  isLostUpstreamApiErrorMessage,
} from "@/lib/apiResponseDiagnostics";
import { isTransientTenantServiceError } from "@/lib/tenantServiceRecovery";
import {
  formatStorageCapacityErrorForUser,
  isStorageCapacityError,
} from "@shared/storageCapacityError";

export type ErrorClass = "system" | "user" | "auth";

export interface ErrorRecord {
  ts: string;
  path?: string;
  code?: string;
  httpStatus?: number;
  message: string;
  traceId?: string;
  requestId?: string;
  url: string;
}

export interface DiagnosticsBundle {
  kind: "system_error_report";
  capturedAt: string;
  page: {
    url: string;
    pathname: string;
    referrer?: string;
  };
  client: {
    userAgent: string;
    language: string;
    viewport: { w: number; h: number };
    platform: string;
  };
  primaryError?: ErrorRecord;
  recentErrors: ErrorRecord[];
}

export const REPORT_ERROR_EVENT = "smartspec:report-error";

export interface ReportErrorEventDetail {
  source: string;
  diagnostics: DiagnosticsBundle;
  suggestedTitle: string;
  suggestedDescription: string;
}

const MAX_BUFFER = 20;
const MAX_REQUEST_IDS = 5;
const TOAST_DEDUPE_WINDOW_MS = 10_000;

// Newest-first ring buffer of recent system-class errors.
const errorBuffer: ErrorRecord[] = [];
// Newest-first list of recently-seen X-Request-ID values from failed
// /trpc responses, used as a fallback correlator when the tRPC error
// payload itself doesn't carry a traceId.
const recentRequestIds: Array<{ requestId: string; ts: number }> = [];
// path+code -> last toast timestamp, to avoid re-toasting the same
// system error repeatedly within a short window.
const recentToastAt = new Map<string, number>();

/** tRPC error data shape, loosely typed since `traceId` may not exist on
 * every server version yet (rolling out separately). */
type TrpcErrorData = {
  code?: string;
  httpStatus?: number;
  path?: string;
  traceId?: string;
};

function getTrpcData(error: unknown): TrpcErrorData | undefined {
  if (!(error instanceof TRPCClientError)) return undefined;
  // `traceId` is an in-progress backend addition not yet reflected in the
  // shared TRPCClientError data types, so we widen via TrpcErrorData here.
  return error.data as TrpcErrorData | undefined;
}

/**
 * True when a failed request is a temporary provider/transport observation
 * problem rather than evidence of a code or data-contract bug. Keep this
 * separate from `classifyError`: React Query still needs transient 5xx and
 * network failures classified as `system` so its retry policy remains active,
 * while the feedback monitor must not turn those expected retries into bug
 * reports.
 */
export function isTransientSystemError(error: unknown): boolean {
  if (isNetworkFailure(error)) return true;
  if (error instanceof Error && error.name === "AbortError") return true;

  const data = getTrpcData(error);
  if (
    data?.code === "TOO_MANY_REQUESTS" ||
    data?.code === "TIMEOUT" ||
    data?.code === "SERVICE_UNAVAILABLE" ||
    data?.httpStatus === 408 ||
    data?.httpStatus === 429
  ) {
    return true;
  }

  if (isTransientReconnectClass(error)) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  const hasTransientStatus = /\b(?:408|429|502|503|504|522|524)\b/i.test(
    message
  );
  const hasTransientContext =
    /rate[ -]?limit|too many requests|provider status temporarily unavailable|provider.*(?:timeout|unavailable)|safety review.*(?:unavailable|temporarily)|get task failed.*(?:408|429|5\d{2})|request timeout|timed? out|upstream|gateway/i.test(
      message
    );
  return (
    hasTransientContext ||
    (hasTransientStatus &&
      /provider|task|poll|status|upstream|gateway/i.test(message))
  );
}

/**
 * True only for a pure network-connection failure — a `TypeError` thrown
 * because the request never reached the server (offline, DNS failure,
 * connection refused/reset, e.g. during a backend restart). Exported so
 * `@/lib/requestResilience` can reuse this exact check for the mutation
 * retry policy instead of duplicating the regex.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return /failed to fetch|networkerror|load failed/i.test(error.message);
}

function isHtmlInsteadOfJsonError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return isHtmlApiErrorMessage(error.message);
}

export function classifyError(error: unknown): ErrorClass {
  const data = getTrpcData(error);
  if (data) {
    if (data.code === "UNAUTHORIZED") return "auth";
    if (
      (data.httpStatus != null && data.httpStatus >= 500)
      || data.code === "INTERNAL_SERVER_ERROR"
      || data.code === "TIMEOUT"
    ) {
      return "system";
    }
    return "user";
  }

  if (
    isNetworkFailure(error) ||
    isHtmlInsteadOfJsonError(error) ||
    isTransientTenantServiceError(error)
  ) {
    return "system";
  }

  return "user";
}

function pushErrorRecord(record: ErrorRecord): void {
  errorBuffer.unshift(record);
  if (errorBuffer.length > MAX_BUFFER) {
    errorBuffer.length = MAX_BUFFER;
  }
}

/** Called by the tRPC fetch wrapper for failed (non-ok) /trpc responses. */
export function noteRequestId(requestId: string): void {
  if (!requestId) return;
  recentRequestIds.unshift({ requestId, ts: Date.now() });
  if (recentRequestIds.length > MAX_REQUEST_IDS) {
    recentRequestIds.length = MAX_REQUEST_IDS;
  }
}

function closestRequestId(): string | undefined {
  return recentRequestIds[0]?.requestId;
}

function currentUrl(): string {
  return typeof window !== "undefined" ? window.location.href : "";
}

/**
 * True for errors that most likely mean "the backend is mid-restart /
 * briefly unreachable" rather than a genuine application failure — either
 * a pure network-connection failure (`isNetworkFailure`) or a gateway/proxy
 * losing the upstream connection mid-request (Cloudflare 502/503/504/522/
 * 524 HTML instead of JSON — see `isLostUpstreamApiErrorMessage`, matched
 * against the exact message `assertJsonApiResponse` throws for those
 * statuses). Used only to pick the softer "reconnecting" toast copy in
 * `handleError` below — it does NOT affect `classifyError`'s system/user/
 * auth classification, so query-retry behavior is unchanged.
 */
function isTransientReconnectClass(error: unknown): boolean {
  if (isTransientTenantServiceError(error)) return true;
  return error instanceof Error && isLostUpstreamApiErrorMessage(error.message);
}

/**
 * Classifies the error and, for system-class errors, records it and shows
 * a single friendly Thai toast with a "report to admin" action. No-op for
 * "user" (existing per-call-site toasts already handle those) and "auth"
 * (the existing redirect-to-login logic handles those).
 */
export function handleError(error: unknown, path?: string): void {
  const message = error instanceof Error ? error.message : String(error ?? "");
  // Storage exhaustion is actionable for the operator but is not a product
  // bug. Keep it out of the diagnostics ring and never offer "แจ้งปัญหา".
  if (isStorageCapacityError(message)) {
    const localized = formatStorageCapacityErrorForUser(message, "th");
    if (localized) {
      toast.error(localized, { id: "storage-capacity-error", duration: 10000 });
    }
    return;
  }
  // A status poll can fail to observe a still-running provider task. Keep the
  // retry behavior owned by React Query/poller code, but do not put this
  // transient observation failure in the feedback ring buffer or show a bug
  // report action. A gateway restart still gets the existing soft info toast.
  if (isTransientSystemError(error)) {
    if (isTransientReconnectClass(error)) {
      toast.info("กำลังเชื่อมต่อใหม่...", {
        id: "system-error",
        duration: 8000,
        description:
          "เซิร์ฟเวอร์กำลังรีสตาร์ทหรือขัดข้องชั่วคราว ระบบกำลังลองเชื่อมต่อให้อัตโนมัติ",
      });
    }
    return;
  }

  const errorClass = classifyError(error);
  if (errorClass !== "system") return;

  const data = getTrpcData(error);
  const resolvedPath = path ?? data?.path;
  const record: ErrorRecord = {
    ts: new Date().toISOString(),
    path: resolvedPath,
    code: data?.code,
    httpStatus: data?.httpStatus,
    message,
    traceId: data?.traceId,
    requestId: data?.traceId ? undefined : closestRequestId(),
    url: currentUrl(),
  };
  pushErrorRecord(record);

  const dedupeKey = `${resolvedPath ?? ""}|${data?.code ?? ""}`;
  const now = Date.now();
  const lastToastAt = recentToastAt.get(dedupeKey);
  if (lastToastAt != null && now - lastToastAt < TOAST_DEDUPE_WINDOW_MS) {
    return;
  }
  recentToastAt.set(dedupeKey, now);

  // A pure network-connection failure (the request never reached the
  // server at all) OR a gateway/proxy losing the upstream mid-request
  // (Cloudflare 502/503/504/522/524 HTML instead of JSON) is most often a
  // brief backend restart rather than a genuine application error, so show
  // a softer "reconnecting" message instead of the generic "system
  // malfunction" wording. This only changes the toast copy — dedupe
  // (above), the record buffer (above), and classifyError()'s "system"
  // classification (which is what makes query retries fire in the first
  // place) are all unchanged either way.
  toast.error("ระบบขัดข้องชั่วคราว", {
    id: "system-error",
    duration: 8000,
    description:
      "เกิดข้อผิดพลาดฝั่งระบบ ไม่ใช่ความผิดของคุณ ทีมงานสามารถตรวจสอบได้หากคุณส่งรายงาน",
    action: {
      label: "แจ้งปัญหา",
      onClick: () => dispatchReportEvent(resolvedPath),
    },
  });
}

/**
 * Builds a whitelisted diagnostics snapshot for the feedback system. Only
 * page/client metadata + recorded error records are included — never
 * headers, cookies, localStorage, tokens, or full request bodies.
 */
export function buildDiagnosticsBundle(): DiagnosticsBundle {
  const hasWindow = typeof window !== "undefined";
  return {
    kind: "system_error_report",
    capturedAt: new Date().toISOString(),
    page: {
      url: currentUrl(),
      pathname: hasWindow ? window.location.pathname : "",
      referrer:
        typeof document !== "undefined" && document.referrer
          ? document.referrer
          : undefined,
    },
    client: {
      userAgent: hasWindow ? navigator.userAgent : "",
      language: hasWindow ? navigator.language : "",
      viewport: {
        w: hasWindow ? window.innerWidth : 0,
        h: hasWindow ? window.innerHeight : 0,
      },
      platform: hasWindow ? navigator.platform : "",
    },
    primaryError: errorBuffer[0],
    recentErrors: [...errorBuffer],
  };
}

/** Same as buildDiagnosticsBundle(), exposed under a name meant for the
 * feedback dialog so it can attach base diagnostics even for manual
 * (non-error-triggered) feedback. */
export function getDiagnosticsForFeedback(): DiagnosticsBundle {
  return buildDiagnosticsBundle();
}

/**
 * Dispatches a `smartspec:report-error` CustomEvent carrying a whitelisted
 * diagnostics bundle plus a suggested Thai title/description, for the
 * feedback UI to prefill.
 */
export function dispatchReportEvent(path?: string): void {
  if (typeof window === "undefined") return;

  const diagnostics = buildDiagnosticsBundle();
  const primary = diagnostics.primaryError;
  const resolvedPath = path ?? primary?.path;

  const suggestedTitle =
    "พบข้อผิดพลาดของระบบ" + (resolvedPath ? ` (${resolvedPath})` : "");

  const correlator = primary?.traceId
    ? ` (traceId: ${primary.traceId})`
    : primary?.requestId
      ? ` (requestId: ${primary.requestId})`
      : "";
  const suggestedDescription = primary
    ? `${primary.message}${correlator}`
    : "ไม่พบรายละเอียดข้อผิดพลาดเพิ่มเติม";

  const detail: ReportErrorEventDetail = {
    source: "system-error-toast",
    diagnostics,
    suggestedTitle,
    suggestedDescription,
  };

  window.dispatchEvent(
    new CustomEvent<ReportErrorEventDetail>(REPORT_ERROR_EVENT, { detail }),
  );
}
