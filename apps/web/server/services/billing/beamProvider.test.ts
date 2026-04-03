import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("BeamProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies webhook signature using current secret", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    const { BeamProvider } = await import("./beamProvider");
    const provider = new BeamProvider({ webhookSecretCurrent: "beam-secret-current" });
    const rawBody = JSON.stringify({ id: "evt_1", type: "charge.succeeded" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac("sha256", "beam-secret-current").update(`${timestamp}.${rawBody}`).digest("hex");

    expect(
      provider.verifyWebhook(rawBody, {
        "x-beam-signature": signature,
        "x-beam-timestamp": timestamp,
      }),
    ).toEqual({
      valid: true,
      matchedSecretVersion: "current",
    });

    vi.useRealTimers();
  });

  it("verifies webhook signature using previous secret during rotation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    const { BeamProvider } = await import("./beamProvider");
    const provider = new BeamProvider({
      webhookSecretCurrent: "new-secret",
      webhookSecretPrevious: "old-secret",
    });
    const rawBody = JSON.stringify({ id: "evt_2", type: "charge.pending" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac("sha256", "old-secret").update(`${timestamp}.${rawBody}`).digest("hex");

    expect(
      provider.verifyWebhook(rawBody, {
        "x-beam-signature": signature,
        "x-beam-timestamp": timestamp,
      }),
    ).toEqual({
      valid: true,
      matchedSecretVersion: "previous",
    });

    vi.useRealTimers();
  });

  it("rejects webhook outside timestamp tolerance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    const { BeamProvider } = await import("./beamProvider");
    const provider = new BeamProvider({ webhookSecretCurrent: "beam-secret-current" });

    expect(
      provider.verifyWebhook("{}", {
        "x-beam-signature": "deadbeef",
        "x-beam-timestamp": "1",
      }),
    ).toEqual({
      valid: false,
      reason: "timestamp_out_of_window",
    });

    vi.useRealTimers();
  });

  it("normalizes paid webhook payloads", async () => {
    const { BeamProvider } = await import("./beamProvider");
    const provider = new BeamProvider();

    expect(
      provider.normalizeWebhookEvent({
        id: "evt_paid_1",
        type: "charge.succeeded",
        data: {
          id: "charge_123",
          status: "succeeded",
          amount: 214,
          currency: "THB",
          created_at: "2026-03-31T12:00:00.000Z",
        },
      }),
    ).toEqual({
      provider: "beam",
      eventId: "evt_paid_1",
      eventType: "charge.succeeded",
      providerObjectId: "charge_123",
      paymentStatus: "paid",
      amount: "214",
      currency: "THB",
      occurredAt: "2026-03-31T12:00:00.000Z",
      raw: {
        id: "evt_paid_1",
        type: "charge.succeeded",
        data: {
          id: "charge_123",
          status: "succeeded",
          amount: 214,
          currency: "THB",
          created_at: "2026-03-31T12:00:00.000Z",
        },
      },
    });
  });

  it("creates a charge through the Beam API when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          id: "charge_123",
          reference_id: "ref_456",
          payment_url: "https://beam.test/pay/123",
          qr_code_url: "https://beam.test/qr/123",
          expires_at: "2026-03-31T13:00:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { BeamProvider } = await import("./beamProvider");
    const provider = new BeamProvider({
      apiBaseUrl: "https://beam.test",
      apiKey: "beam-key",
    });

    await expect(provider.createTopupCharge({ amount: 214 })).resolves.toEqual({
      providerPaymentId: "charge_123",
      providerReferenceId: "ref_456",
      paymentUrl: "https://beam.test/pay/123",
      qrCodeUrl: "https://beam.test/qr/123",
      expiresAt: "2026-03-31T13:00:00.000Z",
      raw: {
        data: {
          id: "charge_123",
          reference_id: "ref_456",
          payment_url: "https://beam.test/pay/123",
          qr_code_url: "https://beam.test/qr/123",
          expires_at: "2026-03-31T13:00:00.000Z",
        },
      },
    });
  });

  it("uses payment link endpoint when requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          id: "plink_123",
          reference_id: "plink_ref_456",
          payment_url: "https://beam.test/link/123",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { BeamProvider } = await import("./beamProvider");
    const provider = new BeamProvider({
      apiBaseUrl: "https://beam.test",
      apiKey: "beam-key",
      paymentLinksPath: "/v1/payment_links",
    });

    await provider.createInvoiceCharge({
      amount: 999,
      providerPaymentType: "payment_link",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://beam.test/v1/payment_links",
      expect.any(Object),
    );
  });
});
