import { z } from "zod";

export const voiceAgentProviderSchema = z.enum(["elevenlabs"]);
export const voiceAgentSurfaceSchema = z.enum(["chat", "work_os", "team_room", "agency"]);
export const voiceAgentConnectionTypeSchema = z.enum([
  "webrtc_token",
  "websocket_signed_url",
  "server_relay",
]);
export const voiceAgentSessionStatusSchema = z.enum([
  "created",
  "connecting",
  "active",
  "ended",
  "failed",
  "cancelled",
]);
export const voiceAgentBillingStatusSchema = z.enum(["reserved", "settled", "released", "failed"]);
export const voiceAgentToolCallStatusSchema = z.enum([
  "received",
  "denied",
  "queued",
  "running",
  "completed",
  "failed",
]);

export type VoiceAgentProvider = z.infer<typeof voiceAgentProviderSchema>;
export type VoiceAgentSurface = z.infer<typeof voiceAgentSurfaceSchema>;
export type VoiceAgentConnectionType = z.infer<typeof voiceAgentConnectionTypeSchema>;
export type VoiceAgentSessionStatus = z.infer<typeof voiceAgentSessionStatusSchema>;
export type VoiceAgentBillingStatus = z.infer<typeof voiceAgentBillingStatusSchema>;
export type VoiceAgentToolCallStatus = z.infer<typeof voiceAgentToolCallStatusSchema>;

const nonEmptyString = z.string().trim().min(1);
const idString = z.string().trim().min(1).max(256);

export const chatCreateMessageToolInputSchema = z
  .object({
    conversationId: z.union([z.number().int().positive(), nonEmptyString]),
    content: z.string().trim().min(1).max(8000),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const chatCreateMessageToolResultSchema = z
  .object({
    messageId: z.union([z.number().int().positive(), nonEmptyString]).optional(),
    accepted: z.boolean(),
    content: z.string().max(12000).optional(),
  })
  .strict();

export const voiceAgentConfigCreateInputSchema = z
  .object({
    displayName: nonEmptyString.max(160),
    externalAgentId: idString.max(128),
    description: z.string().max(2000).optional().nullable(),
    branchId: z.string().max(128).optional().nullable(),
    environment: z.string().max(64).optional().nullable(),
    defaultLanguage: z.string().max(16).optional().nullable(),
    serverLocation: z.string().max(32).default("us"),
    retentionPolicy: z.string().max(32).default("default"),
    allowedSurfaces: z.array(voiceAgentSurfaceSchema).min(1).default(["chat"]),
    allowedTools: z.array(z.literal("chat.create_message")).min(1).default(["chat.create_message"]),
    configJson: z.record(z.string(), z.unknown()).default({}),
    isEnabled: z.boolean().default(false),
  })
  .strict();

export const voiceAgentConfigUpdateInputSchema = voiceAgentConfigCreateInputSchema
  .partial()
  .extend({
    id: z.number().int().positive(),
  })
  .strict();

export const voiceAgentSessionCreateInputSchema = z
  .object({
    agentConfigId: z.number().int().positive(),
    conversationId: z.number().int().positive(),
    surface: voiceAgentSurfaceSchema.default("chat"),
    connectionType: voiceAgentConnectionTypeSchema.default("webrtc_token"),
    idempotencyKey: idString.max(256),
  })
  .strict();

export const voiceAgentConnectionMaterialSchema = z
  .object({
    smartSpecSessionId: z.number().int().positive(),
    provider: voiceAgentProviderSchema,
    connectionType: voiceAgentConnectionTypeSchema,
    conversationToken: z.string().min(1).optional(),
    signedUrl: z.string().url().optional(),
    expiresAt: z.string().datetime(),
    providerConversationId: z.string().max(128).optional(),
    serverLocation: z.string().max(32).optional(),
    environment: z.string().max(64).optional(),
    branchId: z.string().max(128).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.conversationToken) !== Boolean(value.signedUrl),
    "Exactly one of conversationToken or signedUrl is required",
  );

export const voiceAgentStopInputSchema = z
  .object({
    sessionId: z.number().int().positive(),
    reason: z.enum(["user", "disconnect", "timeout", "error"]).default("user"),
  })
  .strict();

export const voiceAgentClientEventInputSchema = z
  .object({
    sessionId: z.number().int().positive(),
    providerConversationId: z.string().max(128).optional(),
    eventType: nonEmptyString.max(80),
    source: z.enum(["user", "agent", "tool", "system"]).default("system"),
    sequence: z.number().int().nonnegative().optional(),
    text: z.string().max(12000).optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const voiceAgentToolCallbackPayloadSchema = z
  .object({
    type: z.string().default("tool_call"),
    event_timestamp: z.number().int().positive(),
    session_id: idString,
    conversation_id: idString,
    tool_call_id: idString,
    tool_name: z.literal("chat.create_message"),
    input: chatCreateMessageToolInputSchema,
    idempotency_key: z.string().max(256).optional(),
  })
  .strict();

export const voiceAgentToolCallbackResultSchema = z
  .object({
    ok: z.boolean(),
    idempotent: z.boolean().default(false),
    result: chatCreateMessageToolResultSchema.optional(),
    error: z
      .object({
        code: z.string().max(128),
        message: z.string().max(512),
        retryable: z.boolean().default(false),
      })
      .strict()
      .optional(),
  })
  .strict();

export const voiceAgentPostCallWebhookPayloadSchema = z
  .object({
    type: z.literal("post_call_transcription"),
    event_timestamp: z.number().int().positive(),
    data: z
      .object({
        agent_id: idString,
        conversation_id: idString,
        status: z.string().max(64),
        user_id: z.string().max(256).optional().nullable(),
        transcript: z
          .array(
            z
              .object({
                role: z.enum(["user", "agent", "assistant", "system"]).catch("system"),
                message: z.string().default(""),
                time_in_call_secs: z.number().optional().nullable(),
              })
              .passthrough(),
          )
          .default([]),
        metadata: z.record(z.string(), z.unknown()).optional(),
        analysis: z.record(z.string(), z.unknown()).optional().nullable(),
      })
      .passthrough(),
  })
  .strict();

export type VoiceAgentConfigCreateInput = z.infer<typeof voiceAgentConfigCreateInputSchema>;
export type VoiceAgentConfigUpdateInput = z.infer<typeof voiceAgentConfigUpdateInputSchema>;
export type VoiceAgentSessionCreateInput = z.infer<typeof voiceAgentSessionCreateInputSchema>;
export type VoiceAgentConnectionMaterial = z.infer<typeof voiceAgentConnectionMaterialSchema>;
export type VoiceAgentClientEventInput = z.infer<typeof voiceAgentClientEventInputSchema>;
export type VoiceAgentToolCallbackPayload = z.infer<typeof voiceAgentToolCallbackPayloadSchema>;
export type VoiceAgentToolCallbackResult = z.infer<typeof voiceAgentToolCallbackResultSchema>;
export type VoiceAgentPostCallWebhookPayload = z.infer<typeof voiceAgentPostCallWebhookPayloadSchema>;
export type ChatCreateMessageToolInput = z.infer<typeof chatCreateMessageToolInputSchema>;
export type ChatCreateMessageToolResult = z.infer<typeof chatCreateMessageToolResultSchema>;
