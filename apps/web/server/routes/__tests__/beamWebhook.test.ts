import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuditLog = vi.fn();
const mockProcessEvent = vi.fn();

vi.mock("../../services/auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

vi.mock("../../services/billing/providerConfig", () => ({
  getBeamProviderRuntimeConfig: vi.fn(async () => ({
    apiBaseUrl: "https://beam.test",
    apiKey: "beam-key",
    chargesPath: "/v1/charges",
    paymentLinksPath: "/v1/payment_links",
    chargeStatusPathTemplate: "/v1/charges/{id}",
    paymentLinkStatusPathTemplate: "/v1/payment_links/{id}",
    cancelPathSuffix: "/cancel",
    webhookSecretCurrent: "beam-test-secret",
    webhookSecretPrevious: null,
  })),
}));

vi.mock("../../services/billing/runtimeConfig", () => ({
  getBillingRuntimeConfig: vi.fn(async () => ({
    BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: "300",
  })),
}));

describe("Beam webhook handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-31T12:00:00.000Z").getTime());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a valid Beam webhook and forwards the normalized event", async () => {
    const { handleBeamWebhookRequest } = await import("../beamWebhook");

    const payload = {
      id: "evt_accepted_1",
      type: "charge.succeeded",
      data: { id: "charge_1", status: "paid", amount: 214, currency: "THB" },
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac("sha256", "beam-test-secret").update(`${timestamp}.${rawBody}`).digest("hex");

    const response = await handleBeamWebhookRequest({
      headers: {
        "x-beam-signature": signature,
        "x-beam-timestamp": timestamp,
      },
      rawBody,
      body: payload,
      processEvent: mockProcessEvent,
    });

    expect(response).toEqual({
      status: 202,
      body: {
        ok: true,
        eventId: "evt_accepted_1",
        status: "paid",
      },
    });
    expect(mockProcessEvent).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures", async () => {
    const { handleBeamWebhookRequest } = await import("../beamWebhook");

    const response = await handleBeamWebhookRequest({
      headers: {
        "x-beam-signature": "bad-signature",
        "x-beam-timestamp": String(Math.floor(Date.now() / 1000)),
      },
      rawBody: JSON.stringify({ id: "evt_bad" }),
      body: { id: "evt_bad" },
      processEvent: mockProcessEvent,
    });

    expect(response.status).toBe(401);
    expect(response.body.ok).toBe(false);
    expect(mockProcessEvent).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });
});
