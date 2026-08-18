import { describe, expect, it } from "vitest";

import {
  COMPANION_TOKEN_MESSAGE,
  LEGACY_MARKETPLACE_EXTENSION_TOKEN_MESSAGE,
  deliverCompanionToken,
  isMissingCompanionReceiverError,
  type CompanionExtensionRuntime,
} from "./companionExtensionDelivery";

const payload = {
  accessToken: "token",
  expiresAt: "2026-08-19T00:00:00.000Z",
  baseUrl: "https://smartaihub.app",
  deviceId: "device-1",
};

function createRuntime(responses: Array<{ response?: any; lastError?: string }>) {
  const calls: Array<Record<string, unknown>> = [];
  const runtime: CompanionExtensionRuntime = {
    sendMessage: (_extensionId, message, callback) => {
      calls.push(message);
      const next = responses.shift() ?? {};
      runtime.lastError = next.lastError ? { message: next.lastError } : undefined;
      callback(next.response);
      runtime.lastError = undefined;
    },
  };
  return { runtime, calls };
}

describe("SmartAIHub Companion token delivery", () => {
  it("uses the canonical protocol when the installed extension supports it", async () => {
    const { runtime, calls } = createRuntime([{ response: { ok: true } }]);
    await expect(deliverCompanionToken(runtime, "extension-id", payload)).resolves.toEqual({
      ok: true,
      protocol: "canonical",
    });
    expect(calls.map((call) => call.type)).toEqual([COMPANION_TOKEN_MESSAGE]);
  });

  it("falls back to the legacy protocol only when no canonical receiver exists", async () => {
    const { runtime, calls } = createRuntime([
      { lastError: "Could not establish connection. Receiving end does not exist." },
      { response: { ok: true } },
    ]);
    await expect(deliverCompanionToken(runtime, "extension-id", payload)).resolves.toEqual({
      ok: true,
      protocol: "legacy",
    });
    expect(calls.map((call) => call.type)).toEqual([
      COMPANION_TOKEN_MESSAGE,
      LEGACY_MARKETPLACE_EXTENSION_TOKEN_MESSAGE,
    ]);
  });

  it("does not downgrade after an explicit security rejection", async () => {
    const { runtime, calls } = createRuntime([{ response: { ok: false, error: "external_sender_not_allowed" } }]);
    await expect(deliverCompanionToken(runtime, "extension-id", payload)).resolves.toEqual({
      ok: false,
      error: "external_sender_not_allowed",
      protocol: "canonical",
    });
    expect(calls.map((call) => call.type)).toEqual([COMPANION_TOKEN_MESSAGE]);
  });

  it("recognizes only Chrome missing-receiver transport errors", () => {
    expect(isMissingCompanionReceiverError("Receiving end does not exist.")).toBe(true);
    expect(isMissingCompanionReceiverError("The message port closed before a response was received.")).toBe(true);
    expect(isMissingCompanionReceiverError("external_sender_not_allowed")).toBe(false);
  });
});
