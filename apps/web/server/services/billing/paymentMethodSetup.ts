import crypto from "crypto";

import { and, eq, lte } from "drizzle-orm";

import {
  paymentMethodSetupSessions,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { createSavedPaymentMethod } from "./paymentMethods";
import { assertBillingFeatureEnabled, isBillingPhase2CohortEnabled } from "./featureFlags";
import { incrementBillingPhase2Metric } from "./phase2Metrics";
import { getBeamProviderRuntimeConfig } from "./providerConfig";
import { getBillingRuntimeConfig } from "./runtimeConfig";

function replaceTemplateTokens(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, encodeURIComponent(value)),
    template,
  );
}

export function getBeamCardCapabilityMatrix(config?: {
  apiBaseUrl?: string | null;
  apiKey?: string | null;
  paymentMethodSetupPath?: string | null;
  paymentMethodSetupHostedUrlTemplate?: string | null;
}) {
  return {
    setupEnabled: true,
    hostedSetupTemplateConfigured: Boolean(config?.paymentMethodSetupHostedUrlTemplate?.trim()),
    apiSetupConfigured: Boolean(
      config?.apiBaseUrl?.trim()
      && config?.apiKey?.trim()
      && config?.paymentMethodSetupPath?.trim(),
    ),
    offSessionChargeEnabled: true,
    declineTaxonomyComplete: true,
  };
}

export async function getBeamCardCapabilityMatrixAsync() {
  const config = await getBeamProviderRuntimeConfig();
  const runtime = await getBillingRuntimeConfig();
  const base = getBeamCardCapabilityMatrix(config);
  return {
    ...base,
    setupEnabled: runtime.BILLING_PHASE2_CARD_SETUP_ENABLED,
    offSessionChargeEnabled: runtime.BILLING_PHASE2_AUTO_RENEW_ENABLED,
  };
}

function timingSafeHexEqual(leftHex: string, rightHex: string) {
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

export async function verifyPaymentMethodSetupCallbackSignature(params: {
  rawQuery: string;
  headers: Record<string, string | string[] | undefined>;
}) {
  const runtimeConfig = await getBeamProviderRuntimeConfig();
  const currentSecret = runtimeConfig.paymentMethodSetupCallbackSecretCurrent?.trim()
    ?? null;
  const previousSecret = runtimeConfig.paymentMethodSetupCallbackSecretPrevious?.trim()
    ?? null;
  if (!currentSecret && !previousSecret) {
    return { valid: false as const, reason: "missing_secret" as const };
  }

  const signature = Array.isArray(params.headers["x-beam-setup-signature"])
    ? params.headers["x-beam-setup-signature"][0]
    : params.headers["x-beam-setup-signature"];
  const timestamp = Array.isArray(params.headers["x-beam-setup-timestamp"])
    ? params.headers["x-beam-setup-timestamp"][0]
    : params.headers["x-beam-setup-timestamp"];
  if (!signature) {
    return { valid: false as const, reason: "missing_signature" as const };
  }
  if (!timestamp) {
    return { valid: false as const, reason: "missing_timestamp" as const };
  }

  const parsedTimestamp = Number.parseInt(timestamp, 10);
  const runtime = await getBillingRuntimeConfig();
  const toleranceSeconds = Number.parseInt(runtime.BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS ?? "300", 10);
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Math.floor(Date.now() / 1000) - parsedTimestamp) > toleranceSeconds) {
    return { valid: false as const, reason: "timestamp_out_of_window" as const };
  }

  const material = `${timestamp}.${params.rawQuery}`;
  if (currentSecret) {
    const expected = crypto.createHmac("sha256", currentSecret).update(material).digest("hex");
    if (timingSafeHexEqual(expected, signature)) {
      return { valid: true as const, matchedSecretVersion: "current" as const };
    }
  }
  if (previousSecret) {
    const expected = crypto.createHmac("sha256", previousSecret).update(material).digest("hex");
    if (timingSafeHexEqual(expected, signature)) {
      return { valid: true as const, matchedSecretVersion: "previous" as const };
    }
  }
  return { valid: false as const, reason: "signature_mismatch" as const };
}

export async function createPaymentMethodSetupIntent(params: {
  userId: number;
  tenantId: string | null;
  rolloutCohort?: string | null;
  returnUrl?: string | null;
}) {
  await assertBillingFeatureEnabled("BILLING_PHASE2_SAVED_CARDS_ENABLED");
  const runtimeConfig = await getBeamProviderRuntimeConfig();
  const runtime = await getBillingRuntimeConfig();
  const capabilities = {
    ...getBeamCardCapabilityMatrix(runtimeConfig),
    setupEnabled: runtime.BILLING_PHASE2_CARD_SETUP_ENABLED,
    offSessionChargeEnabled: runtime.BILLING_PHASE2_AUTO_RENEW_ENABLED,
  };
  if (!capabilities.setupEnabled) {
    throw new Error("Card setup is disabled");
  }
  if (!await isBillingPhase2CohortEnabled(params.rolloutCohort ?? null)) {
    throw new Error("Card setup is not enabled for this rollout cohort");
  }

  const setupSessionId = crypto.randomUUID();
  const returnUrl = params.returnUrl?.trim() || runtimeConfig.paymentMethodSetupReturnUrl || runtime.BILLING_PUBLIC_URL;
  const setupExpiryMinutes = Number.parseInt(runtime.BILLING_PAYMENT_METHOD_SETUP_EXPIRY_MINUTES ?? "60", 10);
  const db = getDb();
  await db.insert(paymentMethodSetupSessions).values({
    userId: params.userId,
    tenantId: params.tenantId,
    provider: "beam",
    setupSessionId,
    status: "pending",
    returnUrl,
    expiresAt: new Date(Date.now() + (Number.isFinite(setupExpiryMinutes) ? setupExpiryMinutes : 60) * 60 * 1000),
    payloadJson: {
      capabilities,
      rolloutCohort: params.rolloutCohort ?? null,
    },
  });
  incrementBillingPhase2Metric("setupSessionsCreated");

  const hostedTemplate = runtimeConfig.paymentMethodSetupHostedUrlTemplate?.trim();
  if (hostedTemplate) {
    return {
      provider: "beam" as const,
      setupSessionId,
      hostedUrl: replaceTemplateTokens(hostedTemplate, {
        userId: String(params.userId),
        tenantId: params.tenantId ?? "",
        sessionId: setupSessionId,
        returnUrl,
      }),
      clientToken: null,
      capabilities,
      mode: "hosted_url" as const,
    };
  }

  const apiBaseUrl = runtimeConfig.apiBaseUrl?.trim();
  const apiKey = runtimeConfig.apiKey?.trim();
  const path = runtimeConfig.paymentMethodSetupPath?.trim();
  if (apiBaseUrl && apiKey && path) {
    const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        userId: params.userId,
        tenantId: params.tenantId,
        returnUrl,
        setupSessionId,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Beam setup request failed: ${JSON.stringify(payload).slice(0, 500)}`);
    }

    const data = typeof payload.data === "object" && payload.data ? payload.data : payload;
    return {
      provider: "beam" as const,
      setupSessionId: typeof data.id === "string" ? data.id : setupSessionId,
      hostedUrl: typeof data.url === "string" ? data.url : typeof data.hosted_url === "string" ? data.hosted_url : null,
      clientToken: typeof data.client_token === "string" ? data.client_token : null,
      capabilities,
      mode: "provider_api" as const,
    };
  }

  throw new Error("Beam card setup capability is not configured");
}

export async function confirmPaymentMethodSetup(params: {
  userId: number;
  actorUserId: number;
  tenantId: string | null;
  setupSessionId?: string | null;
  providerCustomerId?: string | null;
  providerPaymentMethodId: string;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
  cardholderName?: string | null;
  consentVersion?: string | null;
  consentSnapshotJson?: Record<string, any> | null;
  autoRenewEligible?: boolean;
  setAsDefault?: boolean;
  status?: "active" | "requires_verification";
}) {
  const created = await createSavedPaymentMethod({
    userId: params.userId,
    actorUserId: params.actorUserId,
    actorType: "user",
    input: {
      tenantId: params.tenantId,
      provider: "beam",
      providerCustomerId: params.providerCustomerId ?? null,
      providerPaymentMethodId: params.providerPaymentMethodId,
      brand: params.brand ?? null,
      last4: params.last4 ?? null,
      expMonth: params.expMonth ?? null,
      expYear: params.expYear ?? null,
      cardholderName: params.cardholderName ?? null,
      isDefault: params.setAsDefault ?? true,
      status: params.status ?? "active",
      autoRenewEligible: params.autoRenewEligible ?? true,
      consentVersion: params.consentVersion ?? null,
      consentedAt: params.consentVersion ? new Date() : null,
      consentSnapshotJson: params.consentSnapshotJson ?? null,
    },
  });

  if (params.setupSessionId) {
    const db = getDb();
    await db
      .update(paymentMethodSetupSessions)
      .set({
        status: "confirmed",
        providerCustomerId: params.providerCustomerId ?? null,
        providerPaymentMethodId: params.providerPaymentMethodId,
        confirmedAt: new Date(),
        payloadJson: {
          paymentMethodId: created.id,
          brand: params.brand ?? null,
          last4: params.last4 ?? null,
        },
        updatedAt: new Date(),
      })
      .where(and(
        eq(paymentMethodSetupSessions.setupSessionId, params.setupSessionId),
        eq(paymentMethodSetupSessions.userId, params.userId),
      ));
  }

  return created;
}

export async function getPaymentMethodSetupSessionStatus(params: {
  userId: number;
  setupSessionId: string;
}) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(paymentMethodSetupSessions)
    .where(and(
      eq(paymentMethodSetupSessions.setupSessionId, params.setupSessionId),
      eq(paymentMethodSetupSessions.userId, params.userId),
    ))
    .limit(1);
  return session ?? null;
}

export async function reconcilePaymentMethodSetupSession(params: {
  setupSessionId: string;
  status: "confirmed" | "abandoned" | "failed";
  providerCustomerId?: string | null;
  providerPaymentMethodId?: string | null;
  payloadJson?: Record<string, any> | null;
  errorMessage?: string | null;
}) {
  const db = getDb();
  const [updated] = await db
    .update(paymentMethodSetupSessions)
    .set({
      status: params.status,
      providerCustomerId: params.providerCustomerId ?? null,
      providerPaymentMethodId: params.providerPaymentMethodId ?? null,
      payloadJson: params.payloadJson ?? null,
      errorMessage: params.errorMessage ?? null,
      confirmedAt: params.status === "confirmed" ? new Date() : null,
      abandonedAt: params.status === "abandoned" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(paymentMethodSetupSessions.setupSessionId, params.setupSessionId))
    .returning();
  return updated ?? null;
}

export async function markExpiredPaymentMethodSetupSessionsAbandoned() {
  const db = getDb();
  const rows = await db
    .select()
    .from(paymentMethodSetupSessions)
    .where(and(
      eq(paymentMethodSetupSessions.status, "pending"),
      lte(paymentMethodSetupSessions.expiresAt, new Date()),
    ))
    .limit(100);

  for (const row of rows) {
    await db
      .update(paymentMethodSetupSessions)
      .set({
        status: "abandoned",
        abandonedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentMethodSetupSessions.id, row.id));
  }

  return rows.length;
}
