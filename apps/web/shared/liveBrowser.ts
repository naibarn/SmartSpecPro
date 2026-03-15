import { z } from "zod";
import { browserSkillIdSchema } from "./browserSkills";

export const liveBrowserActorTypeValues = [
  "agent",
  "user",
  "system",
  "policy",
] as const;

export const liveBrowserSourceTypeValues = [
  "automation",
  "chat",
  "workflow",
  "agency",
] as const;

export const liveBrowserSessionStatusValues = [
  "created",
  "provisioning",
  "ready",
  "agent_running",
  "waiting_for_human",
  "human_controlling",
  "waiting_for_runtime_recovery",
  "failed_recovery_required",
  "completed",
  "cancelled",
  "failed",
  "expired",
] as const;

export const liveBrowserControlModeValues = [
  "observe",
  "approve_only",
  "takeover",
  "agent_control",
] as const;

export const liveBrowserAssistRequestTypeValues = [
  "decision",
  "field_input",
  "review_page",
  "takeover_required",
] as const;

export const liveBrowserAssistRequestStatusValues = [
  "pending",
  "resolved",
  "cancelled",
] as const;

export const liveBrowserEventTypeValues = [
  "session_created",
  "session_state_changed",
  "stream_ready",
  "frame_updated",
  "url_changed",
  "command_queued",
  "command_started",
  "command_completed",
  "command_failed",
  "assist_requested",
  "assist_resolved",
  "approval_requested",
  "approval_resolved",
  "takeover_started",
  "takeover_lease_expiring",
  "takeover_ended",
  "incident",
  "agent_started",
  "agent_resumed",
  "navigation_completed",
  "session_completed",
  "session_failed",
] as const;

export const liveBrowserErrorCodeValues = [
  "session_version_conflict",
  "session_not_found",
  "session_terminated",
  "invalid_state_transition",
  "policy_denied",
  "rate_limited",
  "command_queue_full",
  "session_pool_exhausted",
  "takeover_locked_out",
  "step_up_auth_required",
  "lease_expired",
  "stream_unavailable",
] as const;

export const liveBrowserApprovalDecisionValues = [
  "approved",
  "rejected",
] as const;

export const liveBrowserBarrierTypeValues = [
  "login_required",
  "captcha_required",
  "payment_review_required",
  "booking_confirmation_required",
] as const;

export const liveBrowserStreamScopeValues = [
  "viewer",
  "controller",
] as const;

export const liveBrowserActorTypeSchema = z.enum(liveBrowserActorTypeValues);
export const liveBrowserSourceTypeSchema = z.enum(liveBrowserSourceTypeValues);
export const liveBrowserSessionStatusSchema = z.enum(liveBrowserSessionStatusValues);
export const liveBrowserControlModeSchema = z.enum(liveBrowserControlModeValues);
export const liveBrowserAssistRequestTypeSchema = z.enum(liveBrowserAssistRequestTypeValues);
export const liveBrowserAssistRequestStatusSchema = z.enum(liveBrowserAssistRequestStatusValues);
export const liveBrowserEventTypeSchema = z.enum(liveBrowserEventTypeValues);
export const liveBrowserErrorCodeSchema = z.enum(liveBrowserErrorCodeValues);
export const liveBrowserApprovalDecisionSchema = z.enum(liveBrowserApprovalDecisionValues);
export const liveBrowserBarrierTypeSchema = z.enum(liveBrowserBarrierTypeValues);
export const liveBrowserStreamScopeSchema = z.enum(liveBrowserStreamScopeValues);

const stringRecordSchema = z.record(z.string(), z.unknown());

export const liveBrowserActorSchema = z.object({
  actorType: liveBrowserActorTypeSchema,
  actorId: z.string().min(1),
}).strict();

export const liveBrowserCommandSchema = z.object({
  type: z.literal("natural_language"),
  text: z.string().min(1),
}).strict();

export const liveBrowserAssistResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("decision"),
    value: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal("field_input"),
    fields: stringRecordSchema,
  }).strict(),
  z.object({
    type: z.literal("review_page"),
    notes: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal("takeover_required"),
    reason: z.string().min(1),
  }).strict(),
]);

export const liveBrowserStreamSchema = z.object({
  viewerToken: z.string().min(1).optional(),
  controllerToken: z.string().min(1).optional(),
  expiresAt: z.string().min(1),
  leaseExpiresAt: z.string().min(1).optional(),
}).strict();

export const liveBrowserSessionSchema = z.object({
  sessionId: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.number().int().nonnegative(),
  sourceType: liveBrowserSourceTypeSchema,
  sourceId: z.string().min(1).nullable().optional(),
  status: liveBrowserSessionStatusSchema,
  controlMode: liveBrowserControlModeSchema,
  sessionVersion: z.number().int().nonnegative(),
  controllerActorType: liveBrowserActorTypeSchema.nullable().optional(),
  controllerActorId: z.string().min(1).nullable().optional(),
  controllerConnectionId: z.string().min(1).nullable().optional(),
  controllerLeaseExpiresAt: z.string().min(1).nullable().optional(),
  pauseReason: z.string().min(1).nullable().optional(),
  barrierType: liveBrowserBarrierTypeSchema.nullable().optional(),
  pendingAssistRequestId: z.string().min(1).nullable().optional(),
  pendingApprovalRequestId: z.string().min(1).nullable().optional(),
  policyContext: stringRecordSchema.default({}),
  browserContextRef: stringRecordSchema.default({}),
  stream: liveBrowserStreamSchema.optional(),
  activeTabCount: z.number().int().positive().default(1),
  startedAt: z.string().min(1),
  lastActivityAt: z.string().min(1),
  endedAt: z.string().min(1).nullable().optional(),
  endReason: z.string().min(1).nullable().optional(),
}).strict();

export const liveBrowserEventPayloadSchema = z.object({
  session: liveBrowserSessionSchema.optional(),
}).catchall(z.unknown());

export const liveBrowserEventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  sessionVersion: z.number().int().nonnegative(),
  type: liveBrowserEventTypeSchema,
  timestamp: z.string().min(1),
  payload: liveBrowserEventPayloadSchema.default({}),
  cursor: z.string().min(1),
}).strict();

export const liveBrowserErrorSchema = z.object({
  code: liveBrowserErrorCodeSchema,
  message: z.string().min(1),
  currentSessionVersion: z.number().int().nonnegative().optional(),
  retryable: z.boolean(),
  reasonCodes: z.array(z.string()).default([]),
}).strict();

export const liveBrowserErrorResponseSchema = z.object({
  accepted: z.literal(false),
  error: liveBrowserErrorSchema,
}).strict();

const liveBrowserMutationRequestBaseSchema = z.object({
  sessionId: z.string().min(1),
  sessionVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1),
  actor: liveBrowserActorSchema,
}).strict();

export const liveBrowserCreateSessionRequestSchema = z.object({
  actor: liveBrowserActorSchema,
  sourceType: liveBrowserSourceTypeSchema,
  sourceId: z.string().min(1).nullable().optional(),
  initialUrl: z.string().min(1).optional(),
  mode: liveBrowserControlModeSchema.default("observe"),
  executionIntent: z.object({
    prompt: z.string().min(1),
    skillId: browserSkillIdSchema.optional(),
    discoverWebsites: z.boolean().optional(),
    autoDraftSkill: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export const liveBrowserCreateSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  status: liveBrowserSessionStatusSchema,
  controlMode: liveBrowserControlModeSchema,
  sessionVersion: z.number().int().nonnegative(),
  stream: liveBrowserStreamSchema,
}).strict();

export const liveBrowserGetSessionRequestSchema = z.object({
  sessionId: z.string().min(1),
  actor: liveBrowserActorSchema,
}).strict();

export const liveBrowserSendCommandRequestSchema = liveBrowserMutationRequestBaseSchema.extend({
  command: liveBrowserCommandSchema,
}).strict();

export const liveBrowserSendCommandResponseSchema = z.object({
  accepted: z.literal(true),
  sessionVersion: z.number().int().nonnegative(),
  queuedCommandId: z.string().min(1),
}).strict();

export const liveBrowserUpdatePolicyContextRequestSchema = liveBrowserMutationRequestBaseSchema.extend({
  policyContextPatch: stringRecordSchema.default({}),
}).strict();

export const liveBrowserUpdatePolicyContextResponseSchema = z.object({
  accepted: z.literal(true),
  sessionVersion: z.number().int().nonnegative(),
  policyContext: stringRecordSchema.default({}),
}).strict();

export const liveBrowserPauseAgentRequestSchema = liveBrowserMutationRequestBaseSchema.extend({
  reason: z.string().min(1),
}).strict();

export const liveBrowserPauseAgentResponseSchema = z.object({
  accepted: z.literal(true),
  status: liveBrowserSessionStatusSchema,
  controlMode: liveBrowserControlModeSchema,
  sessionVersion: z.number().int().nonnegative(),
}).strict();

export const liveBrowserTakeControlRequestSchema = liveBrowserMutationRequestBaseSchema.extend({
  reason: z.string().min(1),
  stepUpCode: z.string().min(1).optional(),
}).strict();

export const liveBrowserTakeControlResponseSchema = z.object({
  accepted: z.literal(true),
  status: liveBrowserSessionStatusSchema,
  controlMode: liveBrowserControlModeSchema,
  sessionVersion: z.number().int().nonnegative(),
  stream: liveBrowserStreamSchema,
}).strict();

export const liveBrowserReturnControlRequestSchema = liveBrowserMutationRequestBaseSchema.extend({
  checkpoint: z.string().min(1),
  notes: z.string().min(1).optional(),
}).strict();

export const liveBrowserReturnControlResponseSchema = z.object({
  accepted: z.literal(true),
  status: liveBrowserSessionStatusSchema,
  controlMode: liveBrowserControlModeSchema,
  sessionVersion: z.number().int().nonnegative(),
}).strict();

export const liveBrowserSubmitAssistResponseRequestSchema = liveBrowserMutationRequestBaseSchema.extend({
  assistRequestId: z.string().min(1),
  response: liveBrowserAssistResponseSchema,
}).strict();

export const liveBrowserSubmitAssistResponseResponseSchema = z.object({
  accepted: z.literal(true),
  assistRequestStatus: liveBrowserAssistRequestStatusSchema,
  sessionVersion: z.number().int().nonnegative(),
}).strict();

export const liveBrowserResolveApprovalRequestSchema = liveBrowserMutationRequestBaseSchema.extend({
  approvalRequestId: z.string().min(1),
  decision: liveBrowserApprovalDecisionSchema,
  notes: z.string().min(1).optional(),
}).strict();

export const liveBrowserResolveApprovalResponseSchema = z.object({
  accepted: z.literal(true),
  approvalStatus: liveBrowserApprovalDecisionSchema,
  sessionVersion: z.number().int().nonnegative(),
  agentResumed: z.boolean(),
}).strict();

export const liveBrowserCancelSessionRequestSchema = liveBrowserMutationRequestBaseSchema.extend({
  reason: z.string().min(1),
}).strict();

export const liveBrowserCancelSessionResponseSchema = z.object({
  accepted: z.literal(true),
  status: liveBrowserSessionStatusSchema,
  sessionVersion: z.number().int().nonnegative(),
}).strict();

export const liveBrowserListEventsRequestSchema = z.object({
  sessionId: z.string().min(1),
  actor: liveBrowserActorSchema,
  cursor: z.string().min(1).optional(),
  limit: z.number().int().positive().max(500).default(100),
}).strict();

export const liveBrowserListEventsResponseSchema = z.object({
  sessionId: z.string().min(1),
  events: z.array(liveBrowserEventEnvelopeSchema),
  nextCursor: z.string().min(1).nullable().optional(),
  hasMore: z.boolean(),
}).strict();

export const liveBrowserStreamTokenRequestSchema = z.object({
  sessionId: z.string().min(1),
  actor: liveBrowserActorSchema,
  scope: liveBrowserStreamScopeSchema,
}).strict();

export const liveBrowserStreamTokenResponseSchema = z.object({
  sessionId: z.string().min(1),
  scope: liveBrowserStreamScopeSchema,
  token: z.string().min(1),
  expiresAt: z.string().min(1),
  leaseExpiresAt: z.string().min(1).nullable().optional(),
}).strict();

export type LiveBrowserActor = z.infer<typeof liveBrowserActorSchema>;
export type LiveBrowserSession = z.infer<typeof liveBrowserSessionSchema>;
export type LiveBrowserEventPayload = z.infer<typeof liveBrowserEventPayloadSchema>;
export type LiveBrowserEventEnvelope = z.infer<typeof liveBrowserEventEnvelopeSchema>;
export type LiveBrowserError = z.infer<typeof liveBrowserErrorSchema>;
export type LiveBrowserCreateSessionRequest = z.infer<typeof liveBrowserCreateSessionRequestSchema>;
export type LiveBrowserCreateSessionResponse = z.infer<typeof liveBrowserCreateSessionResponseSchema>;
export type LiveBrowserGetSessionRequest = z.infer<typeof liveBrowserGetSessionRequestSchema>;
export type LiveBrowserSendCommandRequest = z.infer<typeof liveBrowserSendCommandRequestSchema>;
export type LiveBrowserSendCommandResponse = z.infer<typeof liveBrowserSendCommandResponseSchema>;
export type LiveBrowserUpdatePolicyContextRequest = z.infer<typeof liveBrowserUpdatePolicyContextRequestSchema>;
export type LiveBrowserUpdatePolicyContextResponse = z.infer<typeof liveBrowserUpdatePolicyContextResponseSchema>;
export type LiveBrowserPauseAgentRequest = z.infer<typeof liveBrowserPauseAgentRequestSchema>;
export type LiveBrowserPauseAgentResponse = z.infer<typeof liveBrowserPauseAgentResponseSchema>;
export type LiveBrowserTakeControlRequest = z.infer<typeof liveBrowserTakeControlRequestSchema>;
export type LiveBrowserTakeControlResponse = z.infer<typeof liveBrowserTakeControlResponseSchema>;
export type LiveBrowserReturnControlRequest = z.infer<typeof liveBrowserReturnControlRequestSchema>;
export type LiveBrowserReturnControlResponse = z.infer<typeof liveBrowserReturnControlResponseSchema>;
export type LiveBrowserSubmitAssistResponseRequest = z.infer<typeof liveBrowserSubmitAssistResponseRequestSchema>;
export type LiveBrowserSubmitAssistResponseResponse = z.infer<typeof liveBrowserSubmitAssistResponseResponseSchema>;
export type LiveBrowserResolveApprovalRequest = z.infer<typeof liveBrowserResolveApprovalRequestSchema>;
export type LiveBrowserResolveApprovalResponse = z.infer<typeof liveBrowserResolveApprovalResponseSchema>;
export type LiveBrowserCancelSessionRequest = z.infer<typeof liveBrowserCancelSessionRequestSchema>;
export type LiveBrowserCancelSessionResponse = z.infer<typeof liveBrowserCancelSessionResponseSchema>;
export type LiveBrowserListEventsRequest = z.infer<typeof liveBrowserListEventsRequestSchema>;
export type LiveBrowserListEventsResponse = z.infer<typeof liveBrowserListEventsResponseSchema>;
export type LiveBrowserStreamTokenRequest = z.infer<typeof liveBrowserStreamTokenRequestSchema>;
export type LiveBrowserStreamTokenResponse = z.infer<typeof liveBrowserStreamTokenResponseSchema>;

export function getLiveBrowserEventSessionSnapshot(
  event: Pick<LiveBrowserEventEnvelope, "payload">,
): LiveBrowserSession | null {
  const candidate = event.payload?.session;
  if (!candidate) {
    return null;
  }
  const parsed = liveBrowserSessionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
