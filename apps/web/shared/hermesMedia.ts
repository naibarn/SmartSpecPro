/**
 * Feature 135 — Hermes Grok media worker: shared contracts and constants.
 *
 * Single source of truth for the job contract, connection capability
 * manifest, typed error codes/copy, and the capability-intersection helper.
 * This module is deliberately dependency-free besides `zod` — it must stay
 * importable by the client, the web server, and the section-07 shared
 * worker process (no `db`/server imports here, ever).
 *
 * Namespace note: this feature (`hermesMedia` / `hermes_media`) is UNRELATED
 * to the pre-existing agent-gateway Hermes lane (its worker-queueing helper
 * in `server/services/workerSchedulerService.ts`, its own tenant runtime
 * flag, and job type `external_agent_task`). This file intentionally does
 * not reference any of those unrelated symbols by name — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`, which
 * enforces this at the file-content level.
 */
import { z } from "zod";

/** Provider-neutral operation taxonomy (spec §13.1). */
export const HERMES_MEDIA_OPERATIONS = [
  "image.generate",
  "image.edit",
  "video.generate",
  "video.image_to_video",
  "video.reference_to_video",
] as const;

export type HermesMediaOperation = (typeof HERMES_MEDIA_OPERATIONS)[number];

/**
 * Operation-static reference bounds (spec §13.1). The per-connection
 * capability manifest may narrow these bounds further (see
 * `effectiveHermesCapability`), but it may never widen them.
 */
export const HERMES_OPERATION_REFERENCE_BOUNDS: Record<
  HermesMediaOperation,
  { min: number; max: number }
> = {
  "image.generate": { min: 0, max: 0 },
  "image.edit": { min: 1, max: 3 },
  "video.generate": { min: 0, max: 0 },
  "video.image_to_video": { min: 1, max: 1 },
  "video.reference_to_video": { min: 1, max: 7 },
};

/**
 * Reference schema is `.strict()` — this is the URL ban (spec §13.1
 * claim-time-minting rule). Any extra key (e.g. `downloadUrl`, `url`) must be
 * a hard parse failure so a reference can never carry a pre-resolved URL at
 * rest; URLs are minted fresh at claim time by the section-08/09 resolver.
 */
export const hermesMediaReferenceSchema = z
  .object({
    assetId: z.string().min(1),
    index: z.number().int().positive(),
    role: z.string().min(1),
    label: z.string().min(1),
    sha256: z.string().length(64),
  })
  .strict();

export type HermesMediaReference = z.infer<typeof hermesMediaReferenceSchema>;

function validateHermesMediaReferences(
  data: { operation: HermesMediaOperation; references: HermesMediaReference[] },
  ctx: z.RefinementCtx,
): void {
  const bounds = HERMES_OPERATION_REFERENCE_BOUNDS[data.operation];
  const refs = data.references;

  if (refs.length < bounds.min || refs.length > bounds.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["references"],
      message: `operation "${data.operation}" requires between ${bounds.min} and ${bounds.max} references (received ${refs.length})`,
    });
    return;
  }

  if (refs.length === 0) return;

  const indices = refs.map((ref) => ref.index);
  const sortedIndices = [...indices].sort((a, b) => a - b);
  const isContinuousFromOne = sortedIndices.every((value, position) => value === position + 1);
  if (!isContinuousFromOne) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["references"],
      message: "reference indices must be continuous starting at 1",
    });
  }

  if (new Set(indices).size !== indices.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["references"],
      message: "reference indices must be unique",
    });
  }

  const labels = refs.map((ref) => ref.label);
  if (new Set(labels).size !== labels.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["references"],
      message: "reference labels must be unique",
    });
  }
}

export const hermesMediaJobContractSchema = z
  .object({
    contractVersion: z.literal(1),
    operation: z.enum(HERMES_MEDIA_OPERATIONS),
    connectionId: z.string().min(1),
    prompt: z.string().min(1),
    settings: z
      .object({
        model: z.string().min(1),
        aspectRatio: z.string().optional(),
        resolution: z.string().optional(),
        outputCount: z.number().int().min(1).max(4).optional(),
        durationSeconds: z.number().int().positive().nullable().optional(),
      })
      .strict(),
    references: z.array(hermesMediaReferenceSchema),
    entity: z.object({ type: z.string(), id: z.string() }).passthrough().optional(),
    storage: z.object({ libraryFolderId: z.string().optional() }).strict().optional(),
    traceId: z.string().min(1),
  })
  .strict()
  .superRefine(validateHermesMediaReferences);

export type HermesMediaJobContract = z.infer<typeof hermesMediaJobContractSchema>;

/** Capability manifest stored in `hermes_provider_connections.capabilitiesJson` (spec §12.2). */
export interface HermesConnectionCapabilityManifest {
  hermesVersion: string;
  probedAt: string;
  operations: Partial<
    Record<
      HermesMediaOperation,
      {
        enabled: boolean;
        maxReferences?: number;
        maxOutputs?: number;
        reason?: string;
      }
    >
  >;
  models: { image: string[]; video: string[] };
}

/** Exactly the 22 codes of spec §13.7, in table order. */
export const HERMES_MEDIA_ERROR_CODES = [
  "HERMES_DISABLED",
  "HERMES_CONNECTION_REQUIRED",
  "HERMES_CONNECTION_BUSY",
  "HERMES_WORKER_UNAVAILABLE",
  "HERMES_RATE_LIMITED",
  "HERMES_QUEUE_FULL",
  "HERMES_QUOTA_EXHAUSTED",
  "HERMES_OAUTH_SESSION_EXPIRED",
  "HERMES_OAUTH_DENIED",
  "HERMES_REAUTH_REQUIRED",
  "HERMES_ENTITLEMENT_RESTRICTED",
  "HERMES_OPERATION_UNSUPPORTED",
  "HERMES_REFERENCE_LIMIT_EXCEEDED",
  "HERMES_REFERENCE_MAPPING_CONFLICT",
  "HERMES_REFERENCE_DOWNLOAD_FAILED",
  "HERMES_PROCESS_FAILED",
  "HERMES_TIMEOUT",
  "HERMES_RESULT_INVALID",
  "HERMES_OUTPUT_INVALID",
  "HERMES_UPLOAD_FAILED",
  "HERMES_LIBRARY_REGISTRATION_FAILED",
  "HERMES_JOB_CANCELLED",
] as const;

export type HermesMediaErrorCode = (typeof HERMES_MEDIA_ERROR_CODES)[number];

/** Codes that are safe to retry automatically (spec §13.7). All other codes are not retryable. */
const HERMES_RETRYABLE_ERROR_CODES: ReadonlySet<HermesMediaErrorCode> = new Set([
  "HERMES_CONNECTION_BUSY",
  "HERMES_RATE_LIMITED",
  "HERMES_QUEUE_FULL",
  "HERMES_REFERENCE_DOWNLOAD_FAILED",
  "HERMES_PROCESS_FAILED",
  "HERMES_TIMEOUT",
  "HERMES_RESULT_INVALID",
  "HERMES_UPLOAD_FAILED",
  "HERMES_LIBRARY_REGISTRATION_FAILED",
]);

interface HermesErrorCopyEntry {
  th: string;
  en: string;
}

/** Thai-primary + English copy per spec §13.7. Keep messages user-safe — no paths/tokens/internal ids. */
const HERMES_ERROR_COPY: Record<HermesMediaErrorCode, HermesErrorCopyEntry> = {
  HERMES_DISABLED: {
    th: "ระบบ Hermes Grok media worker ถูกปิดใช้งานอยู่ในขณะนี้",
    en: "Hermes Grok media worker is currently disabled.",
  },
  HERMES_CONNECTION_REQUIRED: {
    th: "กรุณาเชื่อมต่อบัญชี Grok ก่อนสร้างสื่อ",
    en: "Connect your Grok account before generating media.",
  },
  HERMES_CONNECTION_BUSY: {
    th: "การเชื่อมต่อ Grok นี้กำลังประมวลผลงานอื่นอยู่ กรุณาลองใหม่อีกครั้ง",
    en: "This Grok connection is currently busy with another job. Please try again.",
  },
  HERMES_WORKER_UNAVAILABLE: {
    th: "ไม่มี worker ที่พร้อมใช้งานสำหรับ Hermes ในขณะนี้",
    en: "No Hermes worker is currently available.",
  },
  HERMES_RATE_LIMITED: {
    th: "ถูกจำกัดอัตราการส่งคำขอ กรุณาลองใหม่ภายหลัง",
    en: "Request rate limited. Please try again shortly.",
  },
  HERMES_QUEUE_FULL: {
    th: "คิวงานเต็มในขณะนี้ กรุณาลองใหม่ภายหลัง",
    en: "The job queue is currently full. Please try again later.",
  },
  HERMES_QUOTA_EXHAUSTED: {
    th: "โควต้าการใช้งานหมดแล้ว",
    en: "Usage quota has been exhausted.",
  },
  HERMES_OAUTH_SESSION_EXPIRED: {
    th: "เซสชัน OAuth หมดอายุ กรุณาเชื่อมต่อบัญชีใหม่",
    en: "The OAuth session has expired. Please reconnect your account.",
  },
  HERMES_OAUTH_DENIED: {
    th: "การอนุญาต OAuth ถูกปฏิเสธ",
    en: "OAuth authorization was denied.",
  },
  HERMES_REAUTH_REQUIRED: {
    th: "จำเป็นต้องเชื่อมต่อบัญชีใหม่อีกครั้ง",
    en: "Re-authorization is required for this connection.",
  },
  HERMES_ENTITLEMENT_RESTRICTED: {
    th: "เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI ยังไม่อนุญาตให้บัญชีนี้ใช้การสร้างสื่อผ่าน OAuth API กรุณาตรวจสอบระดับสมาชิก",
    en: "Grok account connected successfully, but xAI has not authorized this account for OAuth API media generation. Please check your membership tier.",
  },
  HERMES_OPERATION_UNSUPPORTED: {
    th: "การดำเนินการนี้ไม่รองรับสำหรับบัญชีหรือรุ่นที่เลือก",
    en: "This operation is not supported for the selected account or model.",
  },
  HERMES_REFERENCE_LIMIT_EXCEEDED: {
    th: "จำนวนภาพอ้างอิงเกินขีดจำกัดที่อนุญาต",
    en: "The number of reference images exceeds the allowed limit.",
  },
  HERMES_REFERENCE_MAPPING_CONFLICT: {
    th: "การจับคู่ภาพอ้างอิงขัดแย้งกัน",
    en: "Reference image mapping conflict detected.",
  },
  HERMES_REFERENCE_DOWNLOAD_FAILED: {
    th: "ดาวน์โหลดภาพอ้างอิงไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    en: "Failed to download a reference image. Please try again.",
  },
  HERMES_PROCESS_FAILED: {
    th: "การประมวลผลของ Hermes ล้มเหลว กรุณาลองใหม่อีกครั้ง",
    en: "Hermes processing failed. Please try again.",
  },
  HERMES_TIMEOUT: {
    th: "การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง",
    en: "Processing timed out. Please try again.",
  },
  HERMES_RESULT_INVALID: {
    th: "ผลลัพธ์ที่ได้รับไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
    en: "The result received was invalid. Please try again.",
  },
  HERMES_OUTPUT_INVALID: {
    th: "ไฟล์ผลลัพธ์ไม่ถูกต้องหรือไม่สามารถใช้งานได้",
    en: "The output file is invalid or unusable.",
  },
  HERMES_UPLOAD_FAILED: {
    th: "อัปโหลดผลลัพธ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    en: "Failed to upload the result. Please try again.",
  },
  HERMES_LIBRARY_REGISTRATION_FAILED: {
    th: "ลงทะเบียนไฟล์ในคลังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    en: "Failed to register the file in the library. Please try again.",
  },
  HERMES_JOB_CANCELLED: {
    th: "งานถูกยกเลิก",
    en: "The job was cancelled.",
  },
};

/** Thai-primary + English copy and retryability per spec §13.7. */
export function hermesErrorCopy(
  code: HermesMediaErrorCode,
): { th: string; en: string; retryable: boolean } {
  const copy = HERMES_ERROR_COPY[code];
  return {
    th: copy.th,
    en: copy.en,
    retryable: HERMES_RETRYABLE_ERROR_CODES.has(code),
  };
}

const HERMES_ERROR_MESSAGE_PATTERN = /^\[(HERMES_[A-Z_]+)\]/;

/**
 * THE canonical error-code wire convention (pure string helpers — this file
 * must stay importable by the client, so no `@trpc/server` import here).
 * Server sections (03/05/08/09) throw
 * `new TRPCError({ code: <httpish>, message: formatHermesErrorMessage(code, detail?) })`
 * — i.e. message = `[HERMES_X] <english copy>[ — detail]`. A TRPCError's
 * `cause` does NOT serialize to the client, so the message prefix is the
 * one zero-infrastructure channel; section-10's `extractHermesErrorCode`
 * parses it back with `parseHermesErrorMessage`. Never hand-format codes.
 */
export function formatHermesErrorMessage(code: HermesMediaErrorCode, detail?: string): string {
  const { en } = hermesErrorCopy(code);
  const base = `[${code}] ${en}`;
  const trimmedDetail = detail?.trim();
  return trimmedDetail ? `${base} — ${trimmedDetail}` : base;
}

export function parseHermesErrorMessage(message: string): HermesMediaErrorCode | null {
  const match = HERMES_ERROR_MESSAGE_PATTERN.exec(message);
  if (!match) return null;
  const candidate = match[1];
  return (HERMES_MEDIA_ERROR_CODES as readonly string[]).includes(candidate)
    ? (candidate as HermesMediaErrorCode)
    : null;
}

function minDefined(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/**
 * Effective capability = intersection of the global media_models row and the
 * per-connection manifest (spec §12.2 rule): enabled = row AND manifest;
 * numeric limits = min(row, manifest); row supplies defaults only when the
 * manifest has no opinion. Used by the section-05 submit validator, the
 * section-09 reference trimmer, and the section-10/13 client forms.
 */
export function effectiveHermesCapability(
  modelRow: { enabled?: boolean; maxReferences?: number; maxOutputs?: number },
  manifest: HermesConnectionCapabilityManifest | null | undefined,
  operation: HermesMediaOperation,
): { enabled: boolean; maxReferences?: number; maxOutputs?: number; reason?: string } {
  const manifestOperation = manifest?.operations?.[operation];

  const rowEnabled = modelRow.enabled !== false;
  const manifestEnabled = manifestOperation ? manifestOperation.enabled !== false : true;
  const enabled = rowEnabled && manifestEnabled;

  const maxReferences = minDefined(modelRow.maxReferences, manifestOperation?.maxReferences);
  const maxOutputs = minDefined(modelRow.maxOutputs, manifestOperation?.maxOutputs);

  const result: { enabled: boolean; maxReferences?: number; maxOutputs?: number; reason?: string } = {
    enabled,
  };
  if (maxReferences !== undefined) result.maxReferences = maxReferences;
  if (maxOutputs !== undefined) result.maxOutputs = maxOutputs;
  if (manifestOperation?.reason) result.reason = manifestOperation.reason;
  return result;
}

/**
 * Masks a token-like secret for safe display/logging. This is its own
 * convention (not the same threshold/reveal rule as `maskApiKey` in
 * `server/routers/infrastructure.ts`, which reveals first+last 4 chars for
 * values 12+ chars long): values of 8 or more characters keep only their
 * first 4 characters, followed by a fixed ellipsis mask ("…") — never more
 * than 4 original characters are ever revealed. Anything shorter than 8
 * characters (including empty/null/undefined) is fully masked to a fixed
 * `"***"` string with zero original characters revealed.
 */
export function maskTokenLike(value: string | null | undefined): string {
  if (!value) return "***";
  if (value.length >= 8) {
    return `${value.slice(0, 4)}…`;
  }
  return "***";
}

// ────────────────────────────────────────────────────────────────────────
// Section 04 — connection-control job event contract (additive block).
//
// Rule (spec §16 token-leak ban): device-code payloads
// (`hermesDeviceCodeEventPayloadSchema` shape) exist ONLY in
// `worker_job_events.payloadJson` and the `getConnectStatus` response —
// NEVER in worker logs, audit JSONL, or error messages. Section 12's CI
// grep test locks this in fleet-wide; `server/hermesWorker/` handler tests
// assert the injected logger spy is never called with a string containing
// `userCode`/`verificationUrl`.
// ────────────────────────────────────────────────────────────────────────

/** Frozen event-type strings — `worker_job_events.eventType` values used by
 *  this feature's connection-control jobs. Consumed by sections 03/07/10/11. */
export const HERMES_DEVICE_CODE_EVENT_TYPE = "hermes_device_code" as const;
export const HERMES_AUTHORIZED_EVENT_TYPE = "hermes_authorized" as const;
export const HERMES_CONNECTION_SETTLED_EVENT_TYPE = "hermes_connection_settled" as const;

export const hermesDeviceCodeEventPayloadSchema = z
  .object({
    verificationUrl: z.string().url().optional(),
    userCode: z.string().min(1).optional(),
    expiresAt: z.string().datetime().optional(),
    // Fallback when defensive stdout parsing failed — still never logged.
    raw: z.string().optional(),
  })
  .strict();

export type HermesDeviceCodeEventPayload = z.infer<typeof hermesDeviceCodeEventPayloadSchema>;

export const hermesAuthorizedEventPayloadSchema = z
  .object({
    accountHint: z.string().optional(),
  })
  .strict();

export type HermesAuthorizedEventPayload = z.infer<typeof hermesAuthorizedEventPayloadSchema>;

/**
 * Shared failure-reason vocabulary (section-03 review carry-forward item A).
 * `server/hermesWorker/connectionControlHandlers.ts` emits EXACTLY these
 * strings as a job's `failureReason` / outcome `classification`; both
 * `hermesConnectionService.ts`'s classifiers and
 * `hermesConnectionJobs.ts`'s media-job side-effect classifier match these
 * constants FIRST, keeping their prior substring-sniffing heuristics only
 * as a legacy fallback for jobs written before this vocabulary existed.
 */
export const HERMES_CONTROL_FAILURE_REASONS = [
  "oauth_session_expired",
  "oauth_denied",
  "entitlement_restricted",
  "reauth_required",
  "process_failed",
] as const;

export type HermesControlFailureReason = (typeof HERMES_CONTROL_FAILURE_REASONS)[number];
