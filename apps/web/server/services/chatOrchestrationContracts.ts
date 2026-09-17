import {
  JobControlPlaneError,
  type CanonicalJobStatus,
} from "./jobControlPlaneTypes";

export const CHAT_ORCHESTRATION_CONTRACT_VERSION = "sah-chat-orchestration-v1";

export type ChatRequestContext = {
  tenantId: string;
  userId: number;
  conversationId: string;
  pageRoute?: string;
  pageResourceId?: string;
};

export type ChatTaskState =
  | { kind: "draft"; correlationId: string }
  | { kind: "clarification"; correlationId: string; questions: string[] }
  | {
      kind: "awaiting_approval";
      correlationId: string;
      planId: string;
      planRevision: number;
    }
  | {
      kind: "running";
      correlationId: string;
      jobId: string;
      status: CanonicalJobStatus;
    }
  | {
      kind: "succeeded";
      correlationId: string;
      jobId: string;
      resultRef?: string | null;
    }
  | {
      kind: "failed" | "cancelled" | "unknown";
      correlationId: string;
      jobId?: string;
      reason: string;
    };

export type ChatTaskProjection = {
  correlationId: string;
  tenantId: string;
  conversationId: string;
  state: ChatTaskState;
  sourceCount: number;
  capabilityCount: number;
  updatedAt: string;
};

function invalid(message: string): never {
  throw new JobControlPlaneError(
    "CHAT_ORCHESTRATION_CONTRACT_INVALID",
    message
  );
}

export function normalizeChatRequest(
  input: ChatRequestContext & {
    text: string;
    idempotencyKey: string;
    correlationId: string;
  }
): ChatRequestContext & {
  text: string;
  idempotencyKey: string;
  correlationId: string;
} {
  const optionalTextFields = [
    ["pageRoute", input.pageRoute, 300],
    ["pageResourceId", input.pageResourceId, 200],
  ] as const;
  if (
    typeof input.tenantId !== "string" ||
    !input.tenantId.trim() ||
    input.tenantId.length > 36 ||
    typeof input.conversationId !== "string" ||
    !input.conversationId.trim() ||
    input.conversationId.length > 160 ||
    typeof input.correlationId !== "string" ||
    !input.correlationId.trim() ||
    input.correlationId.length > 160
  )
    invalid("chat identity is invalid");
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0)
    invalid("userId is invalid");
  if (
    typeof input.text !== "string" ||
    !input.text.trim() ||
    input.text.length > 24_000 ||
    typeof input.idempotencyKey !== "string" ||
    !input.idempotencyKey.trim() ||
    input.idempotencyKey.length > 128
  )
    invalid("chat request is invalid");
  for (const [field, value, maxLength] of optionalTextFields) {
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > maxLength)
    )
      invalid(`${field} is invalid`);
  }
  return {
    ...input,
    tenantId: input.tenantId.trim(),
    conversationId: input.conversationId.trim(),
    correlationId: input.correlationId.trim(),
    text: input.text.trim(),
    idempotencyKey: input.idempotencyKey.trim(),
    pageRoute: input.pageRoute?.slice(0, 300),
    pageResourceId: input.pageResourceId?.slice(0, 200),
  };
}

export function projectCanonicalJobToChat(input: {
  context: ChatRequestContext;
  correlationId: string;
  jobId: string;
  status: CanonicalJobStatus;
  resultRef?: string | null;
  statusReason?: string | null;
  updatedAt?: Date;
}): ChatTaskProjection {
  const state: ChatTaskState =
    input.status === "succeeded"
      ? {
          kind: "succeeded",
          correlationId: input.correlationId,
          jobId: input.jobId,
          resultRef: input.resultRef,
        }
      : input.status === "failed" || input.status === "expired"
        ? {
            kind: "failed",
            correlationId: input.correlationId,
            jobId: input.jobId,
            reason: input.statusReason ?? input.status,
          }
        : input.status === "cancelled"
          ? {
              kind: "cancelled",
              correlationId: input.correlationId,
              jobId: input.jobId,
              reason: input.statusReason ?? "cancelled",
            }
          : {
              kind: "running",
              correlationId: input.correlationId,
              jobId: input.jobId,
              status: input.status,
            };
  return {
    correlationId: input.correlationId,
    tenantId: input.context.tenantId,
    conversationId: input.context.conversationId,
    state,
    sourceCount: 0,
    capabilityCount: 0,
    updatedAt: (input.updatedAt ?? new Date()).toISOString(),
  };
}

export function assertChatProjectionTenant(
  projection: ChatTaskProjection,
  context: ChatRequestContext
): void {
  if (
    projection.tenantId !== context.tenantId ||
    projection.conversationId !== context.conversationId
  )
    invalid("chat projection is outside the request scope");
}
