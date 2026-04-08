import crypto from "crypto";
import { getBeamProviderRuntimeConfig } from "./providerConfig";
import { getBillingRuntimeConfig } from "./runtimeConfig";

export interface BillingPaymentProvider {
  createInvoiceCharge(input: Record<string, unknown>): Promise<BeamChargeResponse>;
  createTopupCharge(input: Record<string, unknown>): Promise<BeamChargeResponse>;
  getPaymentStatus(providerPaymentId: string, providerPaymentType?: "charge" | "payment_link"): Promise<BeamPaymentStatusResponse>;
  cancelPayment(providerPaymentId: string, providerPaymentType?: "charge" | "payment_link"): Promise<{ canceled: boolean; raw: Record<string, any> }>;
  verifyWebhook(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>): BeamWebhookVerificationResult;
  normalizeWebhookEvent(payload: Record<string, any>): BeamNormalizedWebhookEvent;
}

export interface BeamWebhookVerificationResult {
  valid: boolean;
  reason?: "missing_secret" | "missing_signature" | "missing_timestamp" | "timestamp_out_of_window" | "signature_mismatch";
  matchedSecretVersion?: "current" | "previous";
}

export interface BeamNormalizedWebhookEvent {
  provider: "beam";
  eventId: string | null;
  eventType: string;
  providerObjectId: string | null;
  paymentStatus: "paid" | "pending" | "failed" | "expired" | "unknown";
  amount: string | null;
  currency: string | null;
  occurredAt: string | null;
  raw: Record<string, any>;
}

export interface BeamChargeResponse {
  providerPaymentId: string | null;
  providerReferenceId?: string | null;
  paymentUrl?: string | null;
  qrCodeUrl?: string | null;
  expiresAt?: string | null;
  raw: Record<string, any>;
}

export interface BeamPaymentStatusResponse {
  providerPaymentId: string | null;
  paymentStatus: "paid" | "pending" | "failed" | "expired" | "unknown";
  amount: string | null;
  currency: string | null;
  expiresAt?: string | null;
  raw: Record<string, any>;
}

const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 300;

function coerceHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function timingSafeHexEqual(leftHex: string, rightHex: string): boolean {
  if (leftHex.length !== rightHex.length) {
    return false;
  }

  const left = Buffer.from(leftHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  if (left.length !== right.length || left.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export class BeamProvider implements BillingPaymentProvider {
  constructor(private readonly options: {
    apiBaseUrl?: string | null;
    apiKey?: string | null;
    chargesPath?: string;
    paymentLinksPath?: string;
    chargeStatusPathTemplate?: string;
    paymentLinkStatusPathTemplate?: string;
    cancelPathSuffix?: string;
    webhookSecretCurrent?: string | null;
    webhookSecretPrevious?: string | null;
    timestampToleranceSeconds?: number;
  } = {}) {}

  private requireApiConfig() {
    const baseUrl = this.options.apiBaseUrl?.trim();
    const apiKey = this.options.apiKey?.trim();
    if (!baseUrl || !apiKey) {
      throw new Error("Beam API is not configured");
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
  }

  private async requestJson(path: string, init: RequestInit): Promise<Record<string, any>> {
    const { baseUrl, apiKey } = this.requireApiConfig();
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(init.headers ?? {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `Beam API request failed (${response.status} ${response.statusText}): ${JSON.stringify(payload).slice(0, 500)}`,
      );
    }
    return payload;
  }

  private normalizeChargeResponse(payload: Record<string, any>): BeamChargeResponse {
    const data = typeof payload.data === "object" && payload.data ? payload.data : payload;
    return {
      providerPaymentId:
        typeof data.id === "string"
          ? data.id
          : typeof data.charge_id === "string"
            ? data.charge_id
            : null,
      providerReferenceId:
        typeof data.reference_id === "string"
          ? data.reference_id
          : typeof data.reference === "string"
            ? data.reference
            : null,
      paymentUrl:
        typeof data.payment_url === "string"
          ? data.payment_url
          : typeof data.url === "string"
            ? data.url
            : typeof data.checkout_url === "string"
              ? data.checkout_url
              : null,
      qrCodeUrl:
        typeof data.qr_code_url === "string"
          ? data.qr_code_url
          : typeof data.promptpay_qr_url === "string"
            ? data.promptpay_qr_url
            : null,
      expiresAt:
        typeof data.expires_at === "string"
          ? data.expires_at
          : typeof data.expired_at === "string"
            ? data.expired_at
            : null,
      raw: payload,
    };
  }

  private resolveCreatePath(input: Record<string, unknown>) {
    return input.providerPaymentType === "payment_link"
      ? this.options.paymentLinksPath ?? "/v1/payment_links"
      : this.options.chargesPath ?? "/v1/charges";
  }

  async createInvoiceCharge(input: Record<string, unknown>): Promise<BeamChargeResponse> {
    const payload = await this.requestJson(this.resolveCreatePath(input), {
      method: "POST",
      body: JSON.stringify(input),
    });
    return this.normalizeChargeResponse(payload);
  }

  async createTopupCharge(input: Record<string, unknown>): Promise<BeamChargeResponse> {
    const payload = await this.requestJson(this.resolveCreatePath(input), {
      method: "POST",
      body: JSON.stringify(input),
    });
    return this.normalizeChargeResponse(payload);
  }

  async getPaymentStatus(providerPaymentId: string, providerPaymentType: "charge" | "payment_link" = "charge"): Promise<BeamPaymentStatusResponse> {
    const template = providerPaymentType === "payment_link"
      ? this.options.paymentLinkStatusPathTemplate ?? "/v1/payment_links/{id}"
      : this.options.chargeStatusPathTemplate ?? "/v1/charges/{id}";
    const payload = await this.requestJson(template.replace("{id}", encodeURIComponent(providerPaymentId)), {
      method: "GET",
    });
    const normalized = this.normalizeWebhookEvent(payload);
    return {
      providerPaymentId: normalized.providerObjectId,
      paymentStatus: normalized.paymentStatus,
      amount: normalized.amount,
      currency: normalized.currency,
      expiresAt:
        typeof payload.expires_at === "string"
          ? payload.expires_at
          : typeof payload.data?.expires_at === "string"
            ? payload.data.expires_at
            : null,
      raw: payload,
    };
  }

  async cancelPayment(providerPaymentId: string, providerPaymentType: "charge" | "payment_link" = "charge"): Promise<{ canceled: boolean; raw: Record<string, any> }> {
    const template = providerPaymentType === "payment_link"
      ? this.options.paymentLinkStatusPathTemplate ?? "/v1/payment_links/{id}"
      : this.options.chargeStatusPathTemplate ?? "/v1/charges/{id}";
    const suffix = this.options.cancelPathSuffix ?? "/cancel";
    const payload = await this.requestJson(
      `${template.replace("{id}", encodeURIComponent(providerPaymentId))}${suffix}`,
      { method: "POST" },
    );
    return { canceled: true, raw: payload };
  }

  verifyWebhook(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): BeamWebhookVerificationResult {
    const currentSecret = this.options.webhookSecretCurrent?.trim();
    const previousSecret = this.options.webhookSecretPrevious?.trim();
    if (!currentSecret && !previousSecret) {
      return { valid: false, reason: "missing_secret" };
    }

    const signature = coerceHeaderValue(headers["x-beam-signature"])?.trim();
    const timestamp = coerceHeaderValue(headers["x-beam-timestamp"])?.trim();
    if (!signature) {
      return { valid: false, reason: "missing_signature" };
    }
    if (!timestamp) {
      return { valid: false, reason: "missing_timestamp" };
    }

    const now = Math.floor(Date.now() / 1000);
    const parsedTimestamp = Number.parseInt(timestamp, 10);
    const tolerance = this.options.timestampToleranceSeconds ?? DEFAULT_TIMESTAMP_TOLERANCE_SECONDS;
    if (!Number.isFinite(parsedTimestamp) || Math.abs(now - parsedTimestamp) > tolerance) {
      return { valid: false, reason: "timestamp_out_of_window" };
    }

    const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
    const signingMaterial = `${timestamp}.${bodyString}`;

    if (currentSecret) {
      const expected = crypto.createHmac("sha256", currentSecret).update(signingMaterial).digest("hex");
      if (timingSafeHexEqual(expected, signature)) {
        return { valid: true, matchedSecretVersion: "current" };
      }
    }

    if (previousSecret) {
      const expected = crypto.createHmac("sha256", previousSecret).update(signingMaterial).digest("hex");
      if (timingSafeHexEqual(expected, signature)) {
        return { valid: true, matchedSecretVersion: "previous" };
      }
    }

    return { valid: false, reason: "signature_mismatch" };
  }

  normalizeWebhookEvent(payload: Record<string, any>): BeamNormalizedWebhookEvent {
    const eventType = typeof payload.type === "string" ? payload.type : typeof payload.event_type === "string" ? payload.event_type : "unknown";
    const data = typeof payload.data === "object" && payload.data ? payload.data : payload;
    const rawStatus = String(
      data.status ??
      data.payment_status ??
      data.charge_status ??
      "unknown",
    ).toLowerCase();

    const paymentStatus =
      rawStatus === "paid" || rawStatus === "succeeded" || rawStatus === "success"
        ? "paid"
        : rawStatus === "pending" || rawStatus === "processing"
          ? "pending"
          : rawStatus === "failed"
            ? "failed"
            : rawStatus === "expired" || rawStatus === "canceled" || rawStatus === "cancelled"
              ? "expired"
              : "unknown";

    return {
      provider: "beam",
      eventId: typeof payload.id === "string" ? payload.id : typeof payload.event_id === "string" ? payload.event_id : null,
      eventType,
      providerObjectId:
        typeof data.id === "string"
          ? data.id
          : typeof data.charge_id === "string"
            ? data.charge_id
            : typeof data.payment_link_id === "string"
              ? data.payment_link_id
              : null,
      paymentStatus,
      amount: data.amount != null ? String(data.amount) : null,
      currency: data.currency != null ? String(data.currency) : null,
      occurredAt:
        typeof payload.created_at === "string"
          ? payload.created_at
          : typeof data.created_at === "string"
            ? data.created_at
            : null,
      raw: payload,
    };
  }
}

export async function createBeamProvider() {
  const config = await getBeamProviderRuntimeConfig();
  const runtime = await getBillingRuntimeConfig();
  const toleranceSeconds = Number.parseInt(runtime.BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS ?? "300", 10);
  return new BeamProvider({
    apiBaseUrl: config.apiBaseUrl ?? null,
    apiKey: config.apiKey ?? null,
    chargesPath: config.chargesPath ?? "/v1/charges",
    paymentLinksPath: config.paymentLinksPath ?? "/v1/payment_links",
    chargeStatusPathTemplate: config.chargeStatusPathTemplate ?? "/v1/charges/{id}",
    paymentLinkStatusPathTemplate: config.paymentLinkStatusPathTemplate ?? "/v1/payment_links/{id}",
    cancelPathSuffix: config.cancelPathSuffix ?? "/cancel",
    webhookSecretCurrent: config.webhookSecretCurrent ?? null,
    webhookSecretPrevious: config.webhookSecretPrevious ?? null,
    timestampToleranceSeconds: Number.isFinite(toleranceSeconds) ? toleranceSeconds : DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
  });
}
