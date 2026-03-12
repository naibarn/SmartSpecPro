import crypto from "crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { signBearerToken } from "../_core/tokens";
import {
  liveBrowserCancelSessionResponseSchema,
  liveBrowserCreateSessionResponseSchema,
  liveBrowserErrorResponseSchema,
  liveBrowserGetSessionRequestSchema,
  liveBrowserListEventsResponseSchema,
  liveBrowserPauseAgentResponseSchema,
  liveBrowserResolveApprovalResponseSchema,
  liveBrowserReturnControlResponseSchema,
  liveBrowserSendCommandResponseSchema,
  liveBrowserSessionSchema,
  liveBrowserStreamTokenResponseSchema,
  liveBrowserSubmitAssistResponseResponseSchema,
  liveBrowserTakeControlResponseSchema,
  type LiveBrowserActor,
  type LiveBrowserCancelSessionRequest,
  type LiveBrowserCreateSessionRequest,
  type LiveBrowserGetSessionRequest,
  type LiveBrowserListEventsRequest,
  type LiveBrowserPauseAgentRequest,
  type LiveBrowserResolveApprovalRequest,
  type LiveBrowserReturnControlRequest,
  type LiveBrowserSendCommandRequest,
  type LiveBrowserStreamTokenRequest,
  type LiveBrowserSubmitAssistResponseRequest,
  type LiveBrowserTakeControlRequest,
} from "../../shared/liveBrowser";
import { assertBrowserPolicySurfaceReady } from "./browserPolicyReleaseControl";
import { buildAutomationCopilotBrowserPolicyContext } from "./browserPolicyRuntime";
import { assertLiveBrowserEntryReady } from "./liveBrowserReadiness";
import { loadLegacyAutomationSettings } from "./browserPolicySettingsBridge";
import {
  createCreditReservation,
  hasEnoughCredits,
  refundReservation,
} from "./creditService";
import { getTenantFeatureFlag } from "./featureFlags";

const LIVE_BROWSER_PREFIX = `${
  (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "")
}/api/v1/live-browser`;
const LIVE_BROWSER_RESERVE_CREDITS = 100;
const LIVE_BROWSER_STREAM_VIEWER_TTL = "5m";
const LIVE_BROWSER_STREAM_CONTROLLER_TTL = "2m";
const LIVE_BROWSER_CREATE_RATE_LIMIT = { limit: 3, windowMs: 60_000 };
const LIVE_BROWSER_MUTATION_RATE_LIMIT = { limit: 20, windowMs: 60_000 };
const LIVE_BROWSER_QUERY_RATE_LIMIT = { limit: 40, windowMs: 60_000 };

const liveBrowserRateBuckets = new Map<string, number[]>();

type LiveBrowserGatewayAction =
  | "createSession"
  | "getSession"
  | "sendCommand"
  | "pauseAgent"
  | "takeControl"
  | "returnControl"
  | "submitAssistResponse"
  | "resolveApproval"
  | "cancelSession"
  | "listEvents"
  | "issueStreamToken";

type ZodSchema<T> = z.ZodType<T>;

function getRateLimitConfig(action: LiveBrowserGatewayAction): {
  limit: number;
  windowMs: number;
} {
  if (action === "createSession") {
    return LIVE_BROWSER_CREATE_RATE_LIMIT;
  }
  if (action === "getSession" || action === "listEvents" || action === "issueStreamToken") {
    return LIVE_BROWSER_QUERY_RATE_LIMIT;
  }
  return LIVE_BROWSER_MUTATION_RATE_LIMIT;
}

export function resetLiveBrowserGatewayRateLimitsForTest(): void {
  liveBrowserRateBuckets.clear();
}

function enforceLiveBrowserRateLimit(
  ctx: TrpcContext,
  action: LiveBrowserGatewayAction,
): void {
  const userId = ctx.user?.id;
  if (!userId) {
    return;
  }

  const { limit, windowMs } = getRateLimitConfig(action);
  const now = Date.now();
  const bucketKey = `${action}:${ctx.tenantId ?? "no-tenant"}:${userId}`;
  const bucket = liveBrowserRateBuckets.get(bucketKey) ?? [];
  const activeEntries = bucket.filter((timestamp) => timestamp > now - windowMs);

  if (activeEntries.length >= limit) {
    liveBrowserRateBuckets.set(bucketKey, activeEntries);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Live Browser ${action} rate limit exceeded.`,
    });
  }

  activeEntries.push(now);
  liveBrowserRateBuckets.set(bucketKey, activeEntries);
}

function assertTenantContext(ctx: TrpcContext): string {
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
  }
  return ctx.tenantId;
}

function assertPhaseOneActor(ctx: TrpcContext, actor: LiveBrowserActor): void {
  if (actor.actorType !== "user" || actor.actorId !== String(ctx.user?.id ?? "")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Live Browser Phase 1 only supports the authenticated user as the session actor",
    });
  }
}

async function assertLiveBrowserAccess(
  ctx: TrpcContext,
  actor: LiveBrowserActor,
): Promise<string> {
  const tenantId = assertTenantContext(ctx);
  assertPhaseOneActor(ctx, actor);

  const enabled = await getTenantFeatureFlag("liveBrowser", tenantId);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Live Browser is disabled for this tenant",
    });
  }

  await assertBrowserPolicySurfaceReady({
    tenantId,
    surface: "liveBrowser",
  }).catch((error) => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: error instanceof Error ? error.message : "Browser policy release gate blocked live browser",
    });
  });

  return tenantId;
}

function buildGatewayHeaders(ctx: TrpcContext, tenantId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(ENV.webGatewayToken ? { "x-proxy-token": ENV.webGatewayToken } : {}),
    "X-Tenant-Id": tenantId,
    "X-User-Id": String(ctx.user?.id ?? ""),
    "X-User-Token": ctx.userToken ?? "",
  };
}

function mapHttpStatusToTrpcCode(status: number): TRPCError["code"] {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "TOO_MANY_REQUESTS";
  return "INTERNAL_SERVER_ERROR";
}

async function readGatewayError(response: Response): Promise<{
  code: TRPCError["code"];
  message: string;
}> {
  try {
    const data = await response.json();
    const parsed = liveBrowserErrorResponseSchema.safeParse(data);
    if (parsed.success) {
      return {
        code: mapHttpStatusToTrpcCode(response.status),
        message: parsed.data.error.message,
      };
    }

    if (typeof data?.detail === "string") {
      return {
        code: mapHttpStatusToTrpcCode(response.status),
        message: data.detail,
      };
    }

    if (typeof data?.error === "string") {
      return {
        code: mapHttpStatusToTrpcCode(response.status),
        message: data.error,
      };
    }
  } catch {
    // Fall through to generic status handling.
  }

  return {
    code: mapHttpStatusToTrpcCode(response.status),
    message: response.statusText || "Live Browser gateway request failed",
  };
}

async function callLiveBrowserBackend<T>(input: {
  ctx: TrpcContext;
  tenantId: string;
  action: LiveBrowserGatewayAction;
  path: string;
  body: Record<string, unknown>;
  responseSchema: ZodSchema<T>;
  timeoutMs?: number;
  skipRateLimit?: boolean;
}): Promise<T> {
  if (!input.skipRateLimit) {
    enforceLiveBrowserRateLimit(input.ctx, input.action);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000);

  try {
    const response = await fetch(`${LIVE_BROWSER_PREFIX}${input.path}`, {
      method: "POST",
      headers: buildGatewayHeaders(input.ctx, input.tenantId),
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await readGatewayError(response);
      throw new TRPCError(error);
    }

    const data = await response.json();
    return input.responseSchema.parse(data);
  } finally {
    clearTimeout(timer);
  }
}

async function buildLiveBrowserPolicyContext(input: {
  tenantId: string;
  userId: number;
  sourceId?: string | null;
}): Promise<Record<string, unknown>> {
  const { allowedDomains, visionModel } = await loadLegacyAutomationSettings();
  return buildAutomationCopilotBrowserPolicyContext({
    tenantId: input.tenantId,
    userId: input.userId,
    executionId: input.sourceId ?? `live-${crypto.randomUUID()}`,
    allowedDomains,
    visionModel,
  }) as unknown as Record<string, unknown>;
}

export async function createLiveBrowserSession(
  ctx: TrpcContext,
  request: LiveBrowserCreateSessionRequest,
) {
  const tenantId = await assertLiveBrowserAccess(ctx, request.actor);
  await assertLiveBrowserEntryReady().catch((error) => {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error instanceof Error
        ? error.message
        : "Live Browser entry is blocked by readiness checks",
    });
  });
  enforceLiveBrowserRateLimit(ctx, "createSession");

  const hasCredits = await hasEnoughCredits(ctx.user!.id, LIVE_BROWSER_RESERVE_CREDITS);
  if (!hasCredits) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Insufficient credits (${LIVE_BROWSER_RESERVE_CREDITS} required for live browser launch)`,
    });
  }

  const reservation = await createCreditReservation(
    ctx.user!.id,
    LIVE_BROWSER_RESERVE_CREDITS,
    "browser_automation",
    {
      sourceId: request.sourceId ?? null,
      sourceType: request.sourceType,
      mode: request.mode,
    },
  );

  try {
    const browserPolicyContext = await buildLiveBrowserPolicyContext({
      tenantId,
      userId: ctx.user!.id,
      sourceId: request.sourceId,
    });

    return await callLiveBrowserBackend({
      ctx,
      tenantId,
      action: "createSession",
      path: "/sessions",
      body: {
        request,
        tenantId,
        userId: ctx.user!.id,
        userJwt: ctx.userToken ?? "",
        browserPolicyContext,
        reservationId: reservation.reservationId,
      },
      responseSchema: liveBrowserCreateSessionResponseSchema,
      timeoutMs: 60_000,
      skipRateLimit: true,
    });
  } catch (error) {
    await refundReservation(reservation.reservationId).catch(() => undefined);
    throw error;
  }
}

async function readLiveBrowserSession(
  ctx: TrpcContext,
  request: LiveBrowserGetSessionRequest,
  options?: {
    skipRateLimit?: boolean;
  },
) {
  const tenantId = await assertLiveBrowserAccess(ctx, request.actor);

  return callLiveBrowserBackend({
    ctx,
    tenantId,
    action: "getSession",
    path: `/sessions/${encodeURIComponent(request.sessionId)}/get`,
    body: {
      request,
      tenantId,
      userId: ctx.user!.id,
      userJwt: ctx.userToken ?? "",
    },
    responseSchema: liveBrowserSessionSchema,
    skipRateLimit: options?.skipRateLimit,
  });
}

export async function getLiveBrowserSession(
  ctx: TrpcContext,
  request: LiveBrowserGetSessionRequest,
) {
  return readLiveBrowserSession(ctx, request);
}

async function proxyMutation<TRequest extends { actor: LiveBrowserActor }, TResponse>(input: {
  ctx: TrpcContext;
  action: LiveBrowserGatewayAction;
  request: TRequest;
  path: string;
  responseSchema: ZodSchema<TResponse>;
}) {
  const tenantId = await assertLiveBrowserAccess(input.ctx, input.request.actor);

  return callLiveBrowserBackend({
    ctx: input.ctx,
    tenantId,
    action: input.action,
    path: input.path,
    body: {
      request: input.request,
      tenantId,
      userId: input.ctx.user!.id,
      userJwt: input.ctx.userToken ?? "",
    },
    responseSchema: input.responseSchema,
  });
}

export function sendLiveBrowserCommand(
  ctx: TrpcContext,
  request: LiveBrowserSendCommandRequest,
) {
  return proxyMutation({
    ctx,
    action: "sendCommand",
    request,
    path: `/sessions/${encodeURIComponent(request.sessionId)}/commands`,
    responseSchema: liveBrowserSendCommandResponseSchema,
  });
}

export function pauseLiveBrowserAgent(
  ctx: TrpcContext,
  request: LiveBrowserPauseAgentRequest,
) {
  return proxyMutation({
    ctx,
    action: "pauseAgent",
    request,
    path: `/sessions/${encodeURIComponent(request.sessionId)}/pause`,
    responseSchema: liveBrowserPauseAgentResponseSchema,
  });
}

export function takeLiveBrowserControl(
  ctx: TrpcContext,
  request: LiveBrowserTakeControlRequest,
) {
  return proxyMutation({
    ctx,
    action: "takeControl",
    request,
    path: `/sessions/${encodeURIComponent(request.sessionId)}/take-control`,
    responseSchema: liveBrowserTakeControlResponseSchema,
  });
}

export function returnLiveBrowserControl(
  ctx: TrpcContext,
  request: LiveBrowserReturnControlRequest,
) {
  return proxyMutation({
    ctx,
    action: "returnControl",
    request,
    path: `/sessions/${encodeURIComponent(request.sessionId)}/return-control`,
    responseSchema: liveBrowserReturnControlResponseSchema,
  });
}

export function submitLiveBrowserAssistResponse(
  ctx: TrpcContext,
  request: LiveBrowserSubmitAssistResponseRequest,
) {
  return proxyMutation({
    ctx,
    action: "submitAssistResponse",
    request,
    path: `/sessions/${encodeURIComponent(request.sessionId)}/assist-response`,
    responseSchema: liveBrowserSubmitAssistResponseResponseSchema,
  });
}

export function resolveLiveBrowserApproval(
  ctx: TrpcContext,
  request: LiveBrowserResolveApprovalRequest,
) {
  return proxyMutation({
    ctx,
    action: "resolveApproval",
    request,
    path: `/sessions/${encodeURIComponent(request.sessionId)}/approval`,
    responseSchema: liveBrowserResolveApprovalResponseSchema,
  });
}

export function cancelLiveBrowserSession(
  ctx: TrpcContext,
  request: LiveBrowserCancelSessionRequest,
) {
  return proxyMutation({
    ctx,
    action: "cancelSession",
    request,
    path: `/sessions/${encodeURIComponent(request.sessionId)}/cancel`,
    responseSchema: liveBrowserCancelSessionResponseSchema,
  });
}

export async function listLiveBrowserEvents(
  ctx: TrpcContext,
  request: LiveBrowserListEventsRequest,
) {
  const tenantId = await assertLiveBrowserAccess(ctx, request.actor);

  return callLiveBrowserBackend({
    ctx,
    tenantId,
    action: "listEvents",
    path: `/sessions/${encodeURIComponent(request.sessionId)}/events`,
    body: {
      request,
      tenantId,
      userId: ctx.user!.id,
      userJwt: ctx.userToken ?? "",
    },
    responseSchema: liveBrowserListEventsResponseSchema,
  });
}

export async function issueLiveBrowserStreamToken(
  ctx: TrpcContext,
  request: LiveBrowserStreamTokenRequest,
) {
  enforceLiveBrowserRateLimit(ctx, "issueStreamToken");

  const session = await readLiveBrowserSession(
    ctx,
    liveBrowserGetSessionRequestSchema.parse({
      sessionId: request.sessionId,
      actor: request.actor,
    }),
    { skipRateLimit: true },
  );

  if (
    request.scope === "controller"
    && session.controllerActorId
    && session.controllerActorId !== request.actor.actorId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Controller token is reserved for the current session controller",
    });
  }

  const expiresIn = request.scope === "controller"
    ? LIVE_BROWSER_STREAM_CONTROLLER_TTL
    : LIVE_BROWSER_STREAM_VIEWER_TTL;
  const expiresAt = new Date(
    Date.now() + (request.scope === "controller" ? 2 : 5) * 60_000,
  ).toISOString();
  const token = signBearerToken(
    {
      sub: String(ctx.user!.id),
      type: "live_browser_stream",
      scopes: [
        `live-browser:${request.scope}`,
        `live-browser:session:${request.sessionId}`,
      ],
      jti: crypto.randomUUID(),
    },
    expiresIn,
  );

  return liveBrowserStreamTokenResponseSchema.parse({
    sessionId: request.sessionId,
    scope: request.scope,
    token,
    expiresAt,
    leaseExpiresAt: request.scope === "controller"
      ? session.controllerLeaseExpiresAt ?? null
      : null,
  });
}
