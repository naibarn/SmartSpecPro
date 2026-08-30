import {
  buildAssuranceUiProjection,
  VerticalDramaAssuranceApiErrorSchema,
  VerticalDramaAssuranceErrorCodeSchema,
  VerticalDramaAssuranceTimingSchema,
  type AssuranceUiProjection,
  type VerticalDramaAssuranceApiError,
  type VerticalDramaAssuranceErrorCode,
  type VerticalDramaAssuranceTiming,
} from "@shared/verticalDramaSeries/assurance";
import { TRPCError } from "@trpc/server";

export function withVerticalDramaAssuranceProjection<TLegacy>(
  legacy: TLegacy,
  projection: AssuranceUiProjection | null,
  timing: VerticalDramaAssuranceTiming | null = null,
): TLegacy & { assurance?: AssuranceUiProjection | null; assuranceTiming?: VerticalDramaAssuranceTiming | null } {
  return { ...(legacy as object), assurance: projection, assuranceTiming: timing } as TLegacy & {
    assurance?: AssuranceUiProjection | null;
    assuranceTiming?: VerticalDramaAssuranceTiming | null;
  };
}

export function buildVerticalDramaAssuranceApiError(
  errorCode: VerticalDramaAssuranceErrorCode,
  projection: AssuranceUiProjection | null,
): VerticalDramaAssuranceApiError {
  const parsedCode = VerticalDramaAssuranceErrorCodeSchema.parse(errorCode);
  const nextAction = projection?.nextAction ?? "inspect";
  return VerticalDramaAssuranceApiErrorSchema.parse({
    schemaVersion: 1,
    surface: "vertical_drama_assurance",
    errorCode: parsedCode,
    userMessageKey: `vertical_drama.assurance.${parsedCode.toLowerCase()}`,
    nextAction,
    projection,
  });
}

export function createVerticalDramaAssuranceTrpcError(input: {
  trpcCode: "BAD_REQUEST" | "CONFLICT" | "PRECONDITION_FAILED" | "TOO_MANY_REQUESTS" | "INTERNAL_SERVER_ERROR";
  errorCode: VerticalDramaAssuranceErrorCode;
  projection: AssuranceUiProjection | null;
  traceId?: string | null;
}): TRPCError {
  const payload = buildVerticalDramaAssuranceApiError(input.errorCode, input.projection);
  return new TRPCError({ code: input.trpcCode, message: input.errorCode, cause: payload });
}

export function mapStoryGenerationSummaryToAssuranceProjection(summary: {
  status?: string | null;
  readiness?: "draft" | "verified" | "provider_ready" | "production_ready" | null;
}): AssuranceUiProjection {
  const status = summary.status ?? "queued";
  const state = status === "committed" || status === "succeeded"
    ? "succeeded"
    : status === "provider_result_unknown" || status === "reconciliation_required" || status === "awaiting_reconciliation"
      ? "reconciliation_required"
      : status === "failed" || status === "expired"
        ? "retryable_failed"
        : status === "needs_repair" || status === "partial"
          ? "recovered"
          : status === "cancelled"
            ? "cancelled"
            : status === "running" || status === "validating" || status === "repairing"
              ? "running"
              : "queued";
  const disposition = state === "succeeded" ? "verified" : state === "retryable_failed" ? "retryable" : state === "recovered" ? "recovered_needs_repair" : state === "reconciliation_required" || state === "cancelled" ? "blocked" : "retryable";
  const readiness = state === "succeeded" ? (summary.readiness ?? "verified") : "draft";
  return buildAssuranceUiProjection({
    state,
    disposition,
    readiness,
    requiredReadiness: "verified",
    sourceCurrent: true,
    contextCurrent: true,
    hasRecoveredResult: state === "recovered",
  });
}

export function validateVerticalDramaAssuranceTiming(input: unknown): VerticalDramaAssuranceTiming {
  return VerticalDramaAssuranceTimingSchema.parse(input);
}
