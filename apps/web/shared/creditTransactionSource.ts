export const CREDIT_TRANSACTION_SOURCE_TYPES = [
  "chat",
  "skill",
  "media_image",
  "media_video",
  "media_audio",
  "indexing",
  "rag",
  "stt",
  "translation",
  "brainstorm",
  "scheduler",
  "admin",
  "agency",
  "creator_revenue",
  "other",
  "tts",
  "browser_automation",
  "worker_runtime",
  "widget_chat",
  "webhook_chat",
  "webhook_trigger",
  "api_skill",
  "api_agency",
  "api_job",
  "api_media",
  "api_presentation",
  "api_video_project",
  "api_chat",
  "api_mcp",
  "voice_agent",
] as const;

export type CreditTransactionSourceType =
  (typeof CREDIT_TRANSACTION_SOURCE_TYPES)[number];

export const CREDIT_TRANSACTION_ORIGIN_SURFACES = [
  "media_studio",
] as const;

export type CreditTransactionOriginSurface =
  (typeof CREDIT_TRANSACTION_ORIGIN_SURFACES)[number];

export interface CreditTransactionSourceInput {
  sourceType?: unknown;
  description?: unknown;
  skillSlug?: unknown;
  metadata?: Record<string, unknown> | null | undefined;
}

const CREDIT_TRANSACTION_SOURCE_TYPE_SET = new Set<string>(
  CREDIT_TRANSACTION_SOURCE_TYPES,
);

const CREDIT_TRANSACTION_ORIGIN_SURFACE_SET = new Set<string>(
  CREDIT_TRANSACTION_ORIGIN_SURFACES,
);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function normalizeCreditTransactionSourceType(
  value: unknown,
): CreditTransactionSourceType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return CREDIT_TRANSACTION_SOURCE_TYPE_SET.has(normalized)
    ? (normalized as CreditTransactionSourceType)
    : null;
}

export function normalizeCreditTransactionOriginSurface(
  value: unknown,
): CreditTransactionOriginSurface | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return CREDIT_TRANSACTION_ORIGIN_SURFACE_SET.has(normalized)
    ? (normalized as CreditTransactionOriginSurface)
    : null;
}

export function resolveCreditTransactionOriginSurface(
  transaction: CreditTransactionSourceInput,
): CreditTransactionOriginSurface | null {
  const metadata = asRecord(transaction.metadata);
  if (!metadata) {
    return null;
  }

  return (
    normalizeCreditTransactionOriginSurface(metadata.originSurface)
    ?? normalizeCreditTransactionOriginSurface(metadata.origin_surface)
    ?? normalizeCreditTransactionOriginSurface(metadata.launchSurface)
    ?? null
  );
}

export function inferCreditTransactionSourceType(
  transaction: CreditTransactionSourceInput,
): CreditTransactionSourceType | null {
  const declaredSourceType = normalizeCreditTransactionSourceType(
    transaction.sourceType,
  );
  if (declaredSourceType) {
    return declaredSourceType;
  }

  const metadata = asRecord(transaction.metadata);
  const description = typeof transaction.description === "string"
    ? transaction.description.toLowerCase()
    : "";
  const endpoint = typeof metadata?.endpoint === "string"
    ? metadata.endpoint.toLowerCase()
    : "";
  const mediaType = typeof metadata?.mediaType === "string"
    ? metadata.mediaType.toLowerCase()
    : "";
  const requestType = typeof metadata?.requestType === "string"
    ? metadata.requestType.toLowerCase()
    : "";
  const service = typeof metadata?.service === "string"
    ? metadata.service.toLowerCase()
    : "";
  const action = typeof metadata?.action === "string"
    ? metadata.action.toLowerCase()
    : "";
  const metadataType = typeof metadata?.type === "string"
    ? metadata.type.toLowerCase()
    : "";
  const hasSkillContext = typeof transaction.skillSlug === "string"
    || typeof metadata?.skill === "string";

  if (mediaType === "image") return "media_image";
  if (mediaType === "video") return "media_video";
  if (mediaType === "audio") return "media_audio";

  if (endpoint.includes("video")) return "media_video";
  if (endpoint.includes("image")) return "media_image";
  if (endpoint.includes("audio")) return "media_audio";

  if (
    hasSkillContext
    || description.includes("skill execution")
    || description.includes("auto prompt enhancement")
  ) {
    return "skill";
  }

  if (description.includes("credit reconciliation") && description.includes("video")) {
    return "media_video";
  }
  if (description.includes("image generation")) return "media_image";
  if (description.includes("video generation")) return "media_video";
  if (description.includes("audio generation")) return "media_audio";

  if (action.startsWith("admin_")) return "admin";
  if (
    metadataType === "ai_layout_from_note"
    || description.includes("ai layout from note")
  ) {
    return "other";
  }

  if (requestType.includes("chat")) return "chat";
  if (service.startsWith("rag.")) return "rag";
  if (service.startsWith("library.") || service.startsWith("gdrive.")) return "indexing";

  return null;
}
