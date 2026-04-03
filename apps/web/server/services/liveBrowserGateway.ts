import crypto from "crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { signBearerToken } from "../_core/tokens";
import { getCachedPreferredInternalToken, getCachedPythonBackendUrl } from "./appRuntimeConfig";
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
  liveBrowserUpdatePolicyContextResponseSchema,
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
import {
  buildBrowserInstruction,
  getBrowserSkillPreset,
  inferBrowserSkillId,
  isComplexBrowserGoal,
  shouldDiscoverWebsitesForPrompt,
  type BrowserSkillId,
} from "../../shared/browserSkills";
import { assertBrowserPolicySurfaceReady } from "./browserPolicyReleaseControl";
import { buildAutomationCopilotBrowserPolicyContext } from "./browserPolicyRuntime";
import { discoverBrowserTargets, type BrowserSiteDiscoveryResult } from "./browserSiteDiscovery";
import { assertLiveBrowserEntryReady } from "./liveBrowserReadiness";
import { verifyLiveBrowserTakeoverMfa } from "./liveBrowserStepUpAuth";
import { loadLegacyAutomationSettings } from "./browserPolicySettingsBridge";
import {
  commitCreditReservation,
  createCreditReservation,
  hasEnoughCredits,
  refundReservation,
} from "./creditService";
import { getTenantFeatureFlag } from "./featureFlags";
import { launchSkillStudioTask } from "./skillStudioService";
import type { SkillExecutionResult } from "./skillExecutor";

const LIVE_BROWSER_PREFIX = `${
  (getCachedPythonBackendUrl() || ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "")
}/api/v1/live-browser`;
const LIVE_BROWSER_RESERVE_CREDITS = 100;
const LIVE_BROWSER_STREAM_VIEWER_TTL = "5m";
const LIVE_BROWSER_STREAM_CONTROLLER_TTL = "2m";
const LIVE_BROWSER_TAKEOVER_RECENT_AUTH_MAX_AGE_MS = 15 * 60_000;
const LIVE_BROWSER_TAKEOVER_PROOF_TTL = "5m";
const LIVE_BROWSER_CREATE_RATE_LIMIT = { limit: 3, windowMs: 60_000 };
const LIVE_BROWSER_MUTATION_RATE_LIMIT = { limit: 20, windowMs: 60_000 };
const LIVE_BROWSER_QUERY_RATE_LIMIT = { limit: 40, windowMs: 60_000 };

const liveBrowserRateBuckets = new Map<string, number[]>();

interface DeferredValue<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

type LiveBrowserGatewayAction =
  | "createSession"
  | "getSession"
  | "updatePolicyContext"
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

function createDeferred<T>(): DeferredValue<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function assertPhaseOneActor(ctx: TrpcContext, actor: LiveBrowserActor): void {
  if (actor.actorType !== "user" || actor.actorId !== String(ctx.user?.id ?? "")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Live Browser Phase 1 only supports the authenticated user as the session actor",
    });
  }
}

function assertRecentTakeoverAuth(ctx: TrpcContext): void {
  const rawLastSignedIn = ctx.user?.lastSignedIn;
  const lastSignedIn = rawLastSignedIn instanceof Date
    ? rawLastSignedIn.getTime()
    : typeof rawLastSignedIn === "string"
      ? Date.parse(rawLastSignedIn)
      : Number.NaN;

  if (Number.isNaN(lastSignedIn) || Date.now() - lastSignedIn > LIVE_BROWSER_TAKEOVER_RECENT_AUTH_MAX_AGE_MS) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Live Browser takeover requires a recent sign-in within the last 15 minutes. Sign in again and retry.",
    });
  }
}

function getRecentTakeoverAuthTimestamp(ctx: TrpcContext): string {
  assertRecentTakeoverAuth(ctx);
  return ctx.user?.lastSignedIn instanceof Date
    ? ctx.user.lastSignedIn.toISOString()
    : typeof ctx.user?.lastSignedIn === "string"
      ? ctx.user.lastSignedIn
      : new Date().toISOString();
}

async function buildTakeoverProof(
  ctx: TrpcContext,
  request: Omit<LiveBrowserTakeControlRequest, "stepUpCode">,
  stepUpCode?: string,
): Promise<string> {
  const normalizedStepUpCode = stepUpCode?.trim();
  const assurance = normalizedStepUpCode ? "mfa" : "recent_sign_in";
  const reauthenticatedAt = normalizedStepUpCode
    ? await verifyLiveBrowserTakeoverMfa(ctx, normalizedStepUpCode)
    : getRecentTakeoverAuthTimestamp(ctx);

  return signBearerToken(
    {
      sub: String(ctx.user!.id),
      type: "live_browser_takeover_step_up",
      scopes: [
        "live-browser:takeover",
        `live-browser:session:${request.sessionId}`,
      ],
      jti: crypto.randomUUID(),
      liveBrowserSessionId: request.sessionId,
      liveBrowserSessionVersion: request.sessionVersion,
      liveBrowserActorId: request.actor.actorId,
      liveBrowserUserId: String(ctx.user!.id),
      liveBrowserTenantId: assertTenantContext(ctx),
      liveBrowserAssurance: assurance,
      liveBrowserReauthenticatedAt: reauthenticatedAt,
    } as Parameters<typeof signBearerToken>[0],
    LIVE_BROWSER_TAKEOVER_PROOF_TTL,
  );
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
    ...(getCachedPreferredInternalToken() ? { "x-proxy-token": getCachedPreferredInternalToken() } : {}),
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
  allowedDomains: string[];
  visionModel: string;
  siteDiscovery?: BrowserSiteDiscoveryResult | null;
  skillDraft?: {
    status: "building";
    skillId: BrowserSkillId;
    note: string;
  } | null;
}): Promise<Record<string, unknown>> {
  const context = await buildAutomationCopilotBrowserPolicyContext({
    tenantId: input.tenantId,
    userId: input.userId,
    executionId: input.sourceId ?? `live-${crypto.randomUUID()}`,
    allowedDomains: input.allowedDomains,
    visionModel: input.visionModel,
  }) as unknown as Record<string, unknown>;

  if (input.siteDiscovery) {
    context.siteDiscovery = {
      strategy: input.siteDiscovery.strategy,
      summary: input.siteDiscovery.summary,
      recommendedUrl: input.siteDiscovery.recommendedUrl,
      candidates: input.siteDiscovery.candidates,
    };
  }
  if (input.skillDraft) {
    context.skillDraft = input.skillDraft;
  }
  return context;
}

function buildBrowserSkillStudioBrief(input: {
  goal: string;
  skillId: BrowserSkillId;
  siteDiscovery?: BrowserSiteDiscoveryResult | null;
}): string {
  const skill = getBrowserSkillPreset(input.skillId);
  const candidateLines = input.siteDiscovery?.candidates.length
    ? input.siteDiscovery.candidates
        .slice(0, 4)
        .map((candidate) => `- ${candidate.label}: ${candidate.url} — ${candidate.reason}`)
        .join("\n")
    : "- No candidate sites were discovered yet.";
  return [
    "Convert this complex browser task into a reusable private skill draft before live execution.",
    "Optimize for fewer runtime mistakes, explicit checkpoints, and easier future editing.",
    `Preset: ${skill.label} — ${skill.description}`,
    `User goal: ${input.goal}`,
    "Suggested starting sites:",
    candidateLines,
    "The resulting skill should help a live browser agent decide where to go, what to compare, and where to pause for approval or human takeover.",
  ].join("\n\n");
}

function buildSkillDraftInstruction(input: {
  goal: string;
  skillId: BrowserSkillId;
  siteDiscovery?: BrowserSiteDiscoveryResult | null;
  result: SkillExecutionResult;
}): string {
  const candidateLines = input.siteDiscovery?.candidates.length
    ? input.siteDiscovery.candidates
        .slice(0, 4)
        .map((candidate) => `- ${candidate.label}: ${candidate.url} — ${candidate.reason}`)
        .join("\n")
    : "- No candidate sites were discovered.";
  const draftStatus = input.result.success
    ? "The reusable browser skill draft is ready. Use it as the normalized plan for this run."
    : "The skill draft failed. Continue directly from the original goal using the discovered site hints.";
  const draftNotes = input.result.message?.trim() || "No extra draft notes were returned.";
  return [
    buildBrowserInstruction({
      goal: input.goal,
      skillId: input.skillId,
    }),
    draftStatus,
    `Skill draft notes:\n${draftNotes}`,
    `Discovered sites:\n${candidateLines}`,
    "Continue this Browser Session now. Adapt to page changes, verify important details, and pause at sensitive or commitment-heavy steps.",
  ].join("\n\n");
}

function buildSkillDraftPolicyContext(input: {
  goal: string;
  skillId: BrowserSkillId;
  result: SkillExecutionResult;
}): Record<string, unknown> {
  const succeeded = Boolean(input.result.success);
  const metadata = input.result.metadata && typeof input.result.metadata === "object"
    ? input.result.metadata as Record<string, unknown>
    : {};
  const syncedSkillId = typeof metadata.syncedSkillId === "number" ? metadata.syncedSkillId : null;
  const syncedSkillSlug = typeof metadata.syncedSkillSlug === "string" ? metadata.syncedSkillSlug : null;
  return {
    skillDraft: {
      status: succeeded ? "ready" : "failed",
      skillId: input.skillId,
      note: succeeded
        ? "Reusable browser skill draft is ready. Live execution is continuing with the drafted plan."
        : "Browser skill draft failed. Live execution is continuing from the original goal.",
      goal: input.goal,
      completedAt: new Date().toISOString(),
      ...(syncedSkillId ? { syncedSkillId } : {}),
      ...(syncedSkillSlug ? { syncedSkillSlug } : {}),
      ...(!succeeded && input.result.message?.trim()
        ? { failureReason: input.result.message.trim() }
        : {}),
    },
  };
}

async function updateBackgroundPolicyContext(input: {
  ctx: TrpcContext;
  tenantId: string;
  sessionId: string;
  actor: LiveBrowserActor;
  policyContextPatch: Record<string, unknown>;
}): Promise<void> {
  const currentSession = await callLiveBrowserBackend({
    ctx: input.ctx,
    tenantId: input.tenantId,
    action: "getSession",
    path: `/sessions/${encodeURIComponent(input.sessionId)}/get`,
    body: {
      request: {
        sessionId: input.sessionId,
        actor: input.actor,
      },
      tenantId: input.tenantId,
      userId: input.ctx.user!.id,
      userJwt: input.ctx.userToken ?? "",
    },
    responseSchema: liveBrowserSessionSchema,
    skipRateLimit: true,
  });

  await callLiveBrowserBackend({
    ctx: input.ctx,
    tenantId: input.tenantId,
    action: "updatePolicyContext",
    path: `/sessions/${encodeURIComponent(input.sessionId)}/policy-context`,
    body: {
      request: {
        sessionId: input.sessionId,
        sessionVersion: currentSession.sessionVersion,
        idempotencyKey: `policy-context-${crypto.randomUUID()}`,
        actor: input.actor,
        policyContextPatch: input.policyContextPatch,
      },
      tenantId: input.tenantId,
      userId: input.ctx.user!.id,
      userJwt: input.ctx.userToken ?? "",
    },
    responseSchema: liveBrowserUpdatePolicyContextResponseSchema,
    skipRateLimit: true,
  });
}

async function queueBackgroundAgentCommand(input: {
  ctx: TrpcContext;
  tenantId: string;
  sessionId: string;
  commandText: string;
}): Promise<void> {
  const currentSession = await callLiveBrowserBackend({
    ctx: input.ctx,
    tenantId: input.tenantId,
    action: "getSession",
    path: `/sessions/${encodeURIComponent(input.sessionId)}/get`,
    body: {
      request: {
        sessionId: input.sessionId,
        actor: {
          actorType: "user",
          actorId: String(input.ctx.user!.id),
        },
      },
      tenantId: input.tenantId,
      userId: input.ctx.user!.id,
      userJwt: input.ctx.userToken ?? "",
    },
    responseSchema: liveBrowserSessionSchema,
    skipRateLimit: true,
  });

  await callLiveBrowserBackend({
    ctx: input.ctx,
    tenantId: input.tenantId,
    action: "sendCommand",
    path: `/sessions/${encodeURIComponent(input.sessionId)}/commands`,
    body: {
      request: {
        sessionId: input.sessionId,
        sessionVersion: currentSession.sessionVersion,
        idempotencyKey: `skill-draft-${crypto.randomUUID()}`,
        actor: {
          actorType: "agent",
          actorId: "browser_goal_skill_draft",
        },
        command: {
          type: "natural_language",
          text: input.commandText,
        },
      },
      tenantId: input.tenantId,
      userId: input.ctx.user!.id,
      userJwt: input.ctx.userToken ?? "",
    },
    responseSchema: liveBrowserSendCommandResponseSchema,
    skipRateLimit: true,
  });
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
  let stagedTask:
    | {
        sessionId: DeferredValue<string>;
        skillId: BrowserSkillId;
      }
    | null = null;

  try {
    const { allowedDomains, visionModel } = await loadLegacyAutomationSettings();
    const goal = request.executionIntent?.prompt?.trim() ?? "";
    const skillId = goal
      ? (request.executionIntent?.skillId ?? inferBrowserSkillId(goal))
      : null;
    const wantsDiscovery = goal && skillId
      ? (request.executionIntent?.discoverWebsites ?? shouldDiscoverWebsitesForPrompt(goal, skillId))
      : false;
    const siteDiscovery = goal && skillId && wantsDiscovery
      ? await discoverBrowserTargets({
          goal,
          model: visionModel,
          skillId,
        })
      : null;
    let stageSkillDraft = Boolean(goal && skillId && (request.executionIntent?.autoDraftSkill ?? isComplexBrowserGoal(goal)));
    if (goal && skillId && stageSkillDraft) {
      try {
        const sessionId = createDeferred<string>();
        await launchSkillStudioTask(
          {
            userId: ctx.user!.id,
            userRole: ctx.user?.role ?? null,
            userToken: ctx.userToken ?? null,
            publicUrl: ctx.publicUrl ?? null,
          },
          {
            mode: "create",
            brief: buildBrowserSkillStudioBrief({
              goal,
              skillId,
              siteDiscovery,
            }),
            complexity: "complex",
            desiredVisibility: "private",
            skillLanguage: "auto",
          },
          {
            onCompleted: async (result) => {
              const resolvedSessionId = await sessionId.promise;
              await updateBackgroundPolicyContext({
                ctx,
                tenantId,
                sessionId: resolvedSessionId,
                actor: {
                  actorType: "agent",
                  actorId: "browser_goal_skill_draft",
                },
                policyContextPatch: buildSkillDraftPolicyContext({
                  goal,
                  skillId,
                  result,
                }),
              }).catch(() => undefined);
              await queueBackgroundAgentCommand({
                ctx,
                tenantId,
                sessionId: resolvedSessionId,
                commandText: buildSkillDraftInstruction({
                  goal,
                  skillId,
                  siteDiscovery,
                  result,
                }),
              }).catch(() => undefined);
            },
          },
        );
        stagedTask = { sessionId, skillId };
      } catch {
        stageSkillDraft = false;
      }
    }

    const effectiveAllowedDomains = siteDiscovery?.discoveredDomains.length
      ? siteDiscovery.discoveredDomains
      : allowedDomains;
    const browserPolicyContext = await buildLiveBrowserPolicyContext({
      tenantId,
      userId: ctx.user!.id,
      sourceId: request.sourceId,
      allowedDomains: effectiveAllowedDomains,
      visionModel,
      siteDiscovery,
      skillDraft: stageSkillDraft && skillId
        ? {
            status: "building",
            skillId,
            note: "Complex goal is being converted into a reusable browser skill draft before live execution.",
          }
        : null,
    });
    const createRequest = {
      ...request,
      initialUrl: request.initialUrl ?? siteDiscovery?.recommendedUrl ?? undefined,
      executionIntent: stageSkillDraft
        ? undefined
        : request.executionIntent
          ? {
              ...request.executionIntent,
              skillId: skillId ?? undefined,
              discoverWebsites: wantsDiscovery,
              autoDraftSkill: stageSkillDraft,
            }
          : undefined,
    } satisfies LiveBrowserCreateSessionRequest;

    const created = await callLiveBrowserBackend({
      ctx,
      tenantId,
      action: "createSession",
      path: "/sessions",
      body: {
        request: createRequest,
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
    stagedTask?.sessionId.resolve(created.sessionId);
    await commitCreditReservation(reservation.reservationId);
    return created;
  } catch (error) {
    stagedTask?.sessionId.reject(error);
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
  bodyOverrides?: Record<string, unknown>;
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
      ...input.bodyOverrides,
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

export async function takeLiveBrowserControl(
  ctx: TrpcContext,
  request: LiveBrowserTakeControlRequest,
) {
  const { stepUpCode, ...backendRequest } = request;
  const takeoverProof = await buildTakeoverProof(ctx, backendRequest, stepUpCode);
  return proxyMutation({
    ctx,
    action: "takeControl",
    request: backendRequest,
    path: `/sessions/${encodeURIComponent(request.sessionId)}/take-control`,
    responseSchema: liveBrowserTakeControlResponseSchema,
    bodyOverrides: {
      takeoverProof,
    },
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
  const controllerLeaseExpiresAt = session.controllerLeaseExpiresAt
    ? Date.parse(session.controllerLeaseExpiresAt)
    : Number.NaN;

  if (
    request.scope === "controller"
    && (
      session.controllerActorId !== request.actor.actorId
      || session.controlMode !== "takeover"
      || session.status !== "human_controlling"
      || !session.controllerLeaseExpiresAt
      || Number.isNaN(controllerLeaseExpiresAt)
      || controllerLeaseExpiresAt <= Date.now()
    )
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Controller token requires an active control lease owned by the caller",
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
