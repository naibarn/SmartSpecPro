import { describe, expect, it } from "vitest";

import {
  computeElevenLabsSignature,
  parseElevenLabsSignatureHeader,
  verifyElevenLabsSignature,
} from "../voiceAgents/voiceAgentSecurity";
import { redactVoiceAgentPayload } from "../voiceAgents/voiceAgentRedaction";

describe("voice agent security helpers", () => {
  it("verifies ElevenLabs HMAC signature with timestamp tolerance", () => {
    const rawBody = JSON.stringify({ type: "post_call_transcription" });
    const timestamp = "1767225600";
    const secret = "test-secret";
    const signature = computeElevenLabsSignature(rawBody, secret, timestamp);

    expect(parseElevenLabsSignatureHeader(`t=${timestamp},v0=${signature}`)).toEqual({
      timestamp,
      signature,
    });
    expect(
      verifyElevenLabsSignature({
        rawBody,
        header: `t=${timestamp},v0=${signature}`,
        secret,
        nowMs: 1767225600 * 1000,
      }),
    ).toBe(true);
    expect(
      verifyElevenLabsSignature({
        rawBody,
        header: `t=${timestamp},v0=${signature}`,
        secret: "wrong",
        nowMs: 1767225600 * 1000,
      }),
    ).toBe(false);
  });

  it("redacts nested connection material and secrets", () => {
    expect(
      redactVoiceAgentPayload({
        conversationToken: "secret-token",
        nested: {
          signedUrl: "https://example.test/secret",
          ok: true,
        },
      }),
    ).toEqual({
      conversationToken: "[REDACTED]",
      nested: {
        signedUrl: "[REDACTED]",
        ok: true,
      },
    });
  });
});
