import { describe, expect, it } from "vitest";

import {
  chatCreateMessageToolInputSchema,
  voiceAgentConfigCreateInputSchema,
  voiceAgentConnectionMaterialSchema,
  voiceAgentPostCallWebhookPayloadSchema,
  voiceAgentToolCallbackPayloadSchema,
} from "../voiceAgents";

describe("voice agent shared contracts", () => {
  it("rejects raw API key fields in config input", () => {
    const result = voiceAgentConfigCreateInputSchema.safeParse({
      displayName: "Support voice",
      externalAgentId: "agent_123",
      apiKey: "secret",
    });

    expect(result.success).toBe(false);
  });

  it("requires exactly one connection material credential", () => {
    expect(
      voiceAgentConnectionMaterialSchema.safeParse({
        smartSpecSessionId: 1,
        provider: "elevenlabs",
        connectionType: "webrtc_token",
        conversationToken: "token",
        expiresAt: new Date().toISOString(),
      }).success,
    ).toBe(true);

    expect(
      voiceAgentConnectionMaterialSchema.safeParse({
        smartSpecSessionId: 1,
        provider: "elevenlabs",
        connectionType: "webrtc_token",
        conversationToken: "token",
        signedUrl: "https://example.test/signed",
        expiresAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });

  it("validates tool callback payload and strict chat.create_message input", () => {
    const valid = voiceAgentToolCallbackPayloadSchema.parse({
      type: "tool_call",
      event_timestamp: 1767225605,
      session_id: "session_1",
      conversation_id: "conv_1",
      tool_call_id: "tool_1",
      tool_name: "chat.create_message",
      input: {
        conversationId: 123,
        content: "Add this note.",
      },
    });

    expect(valid.tool_name).toBe("chat.create_message");

    const invalidInput = chatCreateMessageToolInputSchema.safeParse({
      conversationId: 123,
      content: "Add this note.",
      unsafeExtra: true,
    });
    expect(invalidInput.success).toBe(false);
  });

  it("accepts representative post-call transcription payloads", () => {
    const result = voiceAgentPostCallWebhookPayloadSchema.safeParse({
      type: "post_call_transcription",
      event_timestamp: 1767225610,
      data: {
        agent_id: "agent_123",
        conversation_id: "conv_123",
        status: "done",
        transcript: [
          {
            role: "user",
            message: "Hello",
            time_in_call_secs: 1,
          },
        ],
        metadata: {
          call_duration_secs: 12,
        },
      },
    });

    expect(result.success).toBe(true);
  });
});
