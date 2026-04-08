import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";

import {
  billingPaymentMethods,
  billingSubscriptions,
  invoices,
  paymentAttempts,
  payments,
  renewalAttempts,
  subscriptionPaymentSettings,
  type InsertRenewalAttempt,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { createBeamProvider, type BillingPaymentProvider } from "./beamProvider";
import { assertBillingFeatureEnabled, isBillingPhase2CohortEnabled, isBillingFeatureEnabled } from "./featureFlags";
import { incrementBillingPhase2Metric } from "./phase2Metrics";
import { regenerateInvoicePaymentAttempt } from "./recovery";
import { createInvoiceChargeFlow } from "./orchestration";

function buildCycleKey(start: Date, end: Date) {
  return `${start.toISOString()}_${end.toISOString()}`;
}

function addMonth(base: Date): Date {
  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export async function listRenewalAttemptsForSubscription(params: {
  subscriptionId: number;
  limit?: number;
}) {
  const db = getDb();
  return db
    .select()
    .from(renewalAttempts)
    .where(eq(renewalAttempts.subscriptionId, params.subscriptionId))
    .orderBy(desc(renewalAttempts.createdAt))
    .limit(params.limit ?? 50);
}

export async function listRenewalAttemptsForInvoice(params: {
  invoiceId: number;
  limit?: number;
}) {
  const db = getDb();
  return db
    .select()
    .from(renewalAttempts)
    .where(eq(renewalAttempts.invoiceId, params.invoiceId))
    .orderBy(desc(renewalAttempts.createdAt))
    .limit(params.limit ?? 50);
}

export async function getCurrentRenewalAttemptForInvoice(invoiceId: number) {
  const rows = await listRenewalAttemptsForInvoice({ invoiceId, limit: 1 });
  return rows[0] ?? null;
}

function getRetryDelayMs(retryPolicyJson: Record<string, any> | null | undefined) {
  const hours = Number(retryPolicyJson?.retryDelayHours ?? retryPolicyJson?.delayHours ?? 24);
  if (!Number.isFinite(hours) || hours <= 0) {
    return 24 * 60 * 60 * 1000;
  }
  return hours * 60 * 60 * 1000;
}

export async function createAutoRenewalAttempt(params: {
  subscriptionId: number;
  actorUserId?: number | null;
  cycleStart?: Date | null;
  cycleEnd?: Date | null;
  provider?: BillingPaymentProvider;
}) {
  await assertBillingFeatureEnabled("BILLING_PHASE2_AUTO_RENEW_ENABLED");
  const db = getDb();
  const provider = params.provider ?? await createBeamProvider();
  const [subscription] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.id, params.subscriptionId))
    .limit(1);
  if (!subscription) {
    throw new Error("Subscription not found");
  }
  if (!subscription.autoRenewEnabled || subscription.renewalMode !== "auto_charge") {
    throw new Error("Subscription is not enabled for auto-renew");
  }

  const [settings] = await db
    .select()
    .from(subscriptionPaymentSettings)
    .where(eq(subscriptionPaymentSettings.subscriptionId, subscription.id))
    .limit(1);
  const paymentMethodId = settings?.defaultPaymentMethodId ?? subscription.defaultPaymentMethodId ?? null;
  if (settings?.consentWithdrawnAt) {
    throw new Error("Auto-renew consent has been withdrawn");
  }
  if (!await isBillingPhase2CohortEnabled(settings?.rolloutCohort ?? null)) {
    throw new Error("Subscription is outside the active auto-renew rollout cohort");
  }
  if (!paymentMethodId) {
    throw new Error("No default payment method configured");
  }

  const [method] = await db
    .select()
    .from(billingPaymentMethods)
    .where(and(eq(billingPaymentMethods.id, paymentMethodId), eq(billingPaymentMethods.userId, subscription.userId)))
    .limit(1);
  if (!method) {
    throw new Error("Default payment method not found");
  }
  if (method.status !== "active" || !method.autoRenewEligible) {
    throw new Error("Default payment method is not eligible for auto-renew");
  }

  const cycleStart = params.cycleStart ?? subscription.currentPeriodEnd ?? new Date();
  const cycleEnd = params.cycleEnd ?? addMonth(cycleStart);
  const cycleKey = buildCycleKey(cycleStart, cycleEnd);

  const [existingActive] = await db
    .select()
    .from(renewalAttempts)
    .where(and(
      eq(renewalAttempts.subscriptionId, subscription.id),
      eq(renewalAttempts.cycleKey, cycleKey),
      inArray(renewalAttempts.status, [
        "scheduled",
        "charge_in_progress",
        "retry_scheduled",
        "grace_period_active",
        "paused_dunning",
        "manual_review_required",
      ]),
    ))
    .limit(1);

  if (existingActive) {
    return { renewalAttempt: existingActive, reused: true as const };
  }

  const basePrice = Number(
    subscription.legacyPlanSnapshot?.basePrice
    ?? subscription.legacyPlanSnapshot?.monthlyPrice
    ?? 0,
  );

  const created = await createInvoiceChargeFlow({
    tenantId: subscription.tenantId ?? null,
    userId: subscription.userId,
    actorUserId: params.actorUserId ?? null,
    invoiceType: "subscription_renewal",
    subscriptionId: subscription.id,
    paymentMethodId: method.id,
    offSession: true,
    billingCycleStart: cycleStart,
    billingCycleEnd: cycleEnd,
    provider,
    suppressQrReadyNotification: true,
    chargePayload: {
      subscriptionId: subscription.id,
      cycleKey,
      offSession: true,
      providerPaymentMethodId: method.providerPaymentMethodId,
      providerCustomerId: method.providerCustomerId,
    },
    lineItems: [
      {
        itemType: "subscription_plan",
        description: `Subscription renewal: ${subscription.planCode}`,
        quantity: 1,
        unitPrice: basePrice,
        metadataJson: {
          planCode: subscription.planCode,
          billingPeriod: subscription.billingPeriod,
          cycleStart: cycleStart.toISOString(),
          cycleEnd: cycleEnd.toISOString(),
          renewalMode: "auto_charge",
        },
      },
    ],
  });

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, created.invoice!.id))
    .orderBy(desc(payments.createdAt))
    .limit(1);

  const payload: InsertRenewalAttempt = {
    subscriptionId: subscription.id,
    invoiceId: created.invoice!.id,
    cycleKey,
    renewalModeSnapshot: "auto_charge",
    paymentMethodId: method.id,
    attemptNo: 1,
    status: payment?.status === "payment_pending" ? "charge_in_progress" : "manual_review_required",
    scheduledAt: new Date(),
    executedAt: new Date(),
    metadataJson: {
      paymentId: payment?.id ?? null,
      paymentStatus: payment?.status ?? null,
    },
  };

  const [renewalAttempt] = await db.insert(renewalAttempts).values(payload).returning();
  incrementBillingPhase2Metric("autoRenewAttemptsCreated");
  return {
    renewalAttempt,
    invoice: created.invoice,
    payment,
    reused: false as const,
  };
}

export async function syncRenewalAttemptForInvoice(params: {
  invoiceId: number;
  paymentStatus:
    | "pending_provider_creation"
    | "payment_pending"
    | "provider_pending_unknown"
    | "reconciliation_required"
    | "manual_review_required"
    | "expired"
    | "expired_internal"
    | "canceled"
    | "canceled_overdue"
    | "paid"
    | "paid_recovered";
  amountMatchStatus?: string | null;
  actorUserId?: number | null;
  reason?: string | null;
}) {
  const db = getDb();
  const [attempt] = await db
    .select()
    .from(renewalAttempts)
    .where(and(eq(renewalAttempts.invoiceId, params.invoiceId), isNull(renewalAttempts.supersededByAttemptId)))
    .orderBy(desc(renewalAttempts.createdAt))
    .limit(1);

  if (!attempt) {
    return null;
  }

  const [settings] = await db
    .select()
    .from(subscriptionPaymentSettings)
    .where(eq(subscriptionPaymentSettings.subscriptionId, attempt.subscriptionId))
    .limit(1);
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, params.invoiceId))
    .orderBy(desc(payments.createdAt))
    .limit(1);

  let status = attempt.status;
  let nextRetryAt: Date | null | undefined = attempt.nextRetryAt ?? null;
  let finalOutcome = attempt.finalOutcome ?? null;
  let retryClassification = attempt.retryClassification ?? null;

  const rolloutEnabled = await isBillingFeatureEnabled("BILLING_PHASE2_AUTO_RENEW_ENABLED")
    && await isBillingPhase2CohortEnabled(settings?.rolloutCohort ?? null)
    && !settings?.consentWithdrawnAt;

  if (params.paymentStatus === "paid" || params.paymentStatus === "paid_recovered") {
    status = "settled";
    nextRetryAt = null;
    finalOutcome = "paid";
    retryClassification = null;
  } else if (["payment_pending", "pending_provider_creation"].includes(params.paymentStatus)) {
    status = "charge_in_progress";
    nextRetryAt = null;
    finalOutcome = null;
    retryClassification = null;
  } else if (["provider_pending_unknown", "reconciliation_required", "manual_review_required"].includes(params.paymentStatus)) {
    status = "manual_review_required";
    nextRetryAt = null;
    retryClassification = payment?.declineCategory ?? "provider_unknown";
    finalOutcome = payment?.declineCode ?? "provider_review_required";
  } else if (["expired", "expired_internal", "canceled", "canceled_overdue"].includes(params.paymentStatus)) {
    if (!rolloutEnabled) {
      status = "manual_fallback_active";
      nextRetryAt = null;
      finalOutcome = settings?.consentWithdrawnAt ? "consent_withdrawn" : "rollout_disabled";
      retryClassification = "suppressed";
    } else if (params.amountMatchStatus && ["underpaid", "overpaid", "currency_mismatch", "mismatch"].includes(params.amountMatchStatus)) {
      status = "requires_new_card";
      nextRetryAt = null;
      finalOutcome = params.amountMatchStatus;
      retryClassification = "hard_decline";
    } else if (payment?.declineCategory === "hard_decline") {
      status = "requires_new_card";
      nextRetryAt = null;
      finalOutcome = payment.declineCode ?? "hard_decline";
      retryClassification = "hard_decline";
    } else if (payment?.declineCategory === "manual_review_required" || payment?.declineCategory === "provider_unknown") {
      status = "manual_review_required";
      nextRetryAt = null;
      finalOutcome = payment.declineCode ?? payment.declineCategory;
      retryClassification = payment.declineCategory;
    } else {
      status = "retry_scheduled";
      nextRetryAt = new Date(Date.now() + getRetryDelayMs(settings?.retryPolicyJson));
      finalOutcome = payment?.declineCode ?? "retry_pending";
      retryClassification = payment?.declineCategory ?? "soft_decline";
    }
  }

  const [updated] = await db
    .update(renewalAttempts)
    .set({
      status,
      retryClassification,
      nextRetryAt,
      finalOutcome,
      metadataJson: {
        ...(attempt.metadataJson ?? {}),
        lastSyncedPaymentStatus: params.paymentStatus,
        lastSyncedAmountMatchStatus: params.amountMatchStatus ?? null,
        lastSyncReason: params.reason ?? null,
        lastSyncedAt: new Date().toISOString(),
        lastSyncedBy: params.actorUserId ?? null,
      },
      updatedAt: new Date(),
    })
    .where(eq(renewalAttempts.id, attempt.id))
    .returning();

  if (status === "settled") {
    incrementBillingPhase2Metric("autoRenewSettled");
    await db
      .update(billingSubscriptions)
      .set({
        nextRetryAt: null,
        graceEndsAt: null,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.id, attempt.subscriptionId));
  } else if (status === "retry_scheduled") {
    incrementBillingPhase2Metric("autoRenewRetryScheduled");
    await db
      .update(billingSubscriptions)
      .set({
        nextRetryAt,
        graceEndsAt: nextRetryAt,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.id, attempt.subscriptionId));
  } else if (status === "manual_fallback_active") {
    incrementBillingPhase2Metric("autoRenewManualFallbacks");
  }

  return updated;
}

export async function pauseRenewalDunning(params: {
  renewalAttemptId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const [attempt] = await db
    .select()
    .from(renewalAttempts)
    .where(eq(renewalAttempts.id, params.renewalAttemptId))
    .limit(1);
  if (!attempt) throw new Error("Renewal attempt not found");

  const [updated] = await db
    .update(renewalAttempts)
    .set({
      status: "paused_dunning",
      metadataJson: {
        ...(attempt.metadataJson ?? {}),
        pausedBy: params.actorUserId,
        pauseReason: params.reason,
      },
      updatedAt: new Date(),
    })
    .where(eq(renewalAttempts.id, attempt.id))
    .returning();
  return updated;
}

export async function resumeRenewalDunning(params: {
  renewalAttemptId: number;
  actorUserId: number;
  nextRetryAt?: Date | null;
}) {
  const db = getDb();
  const [attempt] = await db
    .select()
    .from(renewalAttempts)
    .where(eq(renewalAttempts.id, params.renewalAttemptId))
    .limit(1);
  if (!attempt) throw new Error("Renewal attempt not found");

  const [updated] = await db
    .update(renewalAttempts)
    .set({
      status: "retry_scheduled",
      nextRetryAt: params.nextRetryAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadataJson: {
        ...(attempt.metadataJson ?? {}),
        resumedBy: params.actorUserId,
      },
      updatedAt: new Date(),
    })
    .where(eq(renewalAttempts.id, attempt.id))
    .returning();
  return updated;
}

export async function fallbackInvoiceToManualCollection(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const [attempt] = await db
    .select()
    .from(renewalAttempts)
    .where(and(eq(renewalAttempts.invoiceId, params.invoiceId), isNull(renewalAttempts.supersededByAttemptId)))
    .orderBy(desc(renewalAttempts.createdAt))
    .limit(1);

  if (!attempt) {
    return null;
  }

  const [updated] = await db
    .update(renewalAttempts)
    .set({
      status: "manual_fallback_active",
      metadataJson: {
        ...(attempt.metadataJson ?? {}),
        fallbackReason: params.reason,
        fallbackBy: params.actorUserId,
      },
      updatedAt: new Date(),
    })
    .where(eq(renewalAttempts.id, attempt.id))
    .returning();

  return updated;
}

export async function forceRetryRenewalAttempt(params: {
  renewalAttemptId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const [attempt] = await db
    .select()
    .from(renewalAttempts)
    .where(eq(renewalAttempts.id, params.renewalAttemptId))
    .limit(1);
  if (!attempt || !attempt.invoiceId) {
    throw new Error("Renewal attempt not found");
  }

  const paymentResult = await regenerateInvoicePaymentAttempt({
    invoiceId: attempt.invoiceId,
    actorUserId: params.actorUserId,
    reason: params.reason,
  });

  const [updated] = await db
    .update(renewalAttempts)
    .set({
      status: "charge_in_progress",
      executedAt: new Date(),
      nextRetryAt: null,
      metadataJson: {
        ...(attempt.metadataJson ?? {}),
        forcedRetryBy: params.actorUserId,
        lastForcedRetryReason: params.reason,
        paymentResult,
      },
      updatedAt: new Date(),
    })
    .where(eq(renewalAttempts.id, attempt.id))
    .returning();

  return {
    renewalAttempt: updated,
    paymentResult,
  };
}

export async function runRenewalRetryScheduler() {
  if (!(await isBillingFeatureEnabled("BILLING_PHASE2_DUNNING_ENABLED"))) {
    return [];
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(renewalAttempts)
    .where(and(
      eq(renewalAttempts.status, "retry_scheduled"),
      lte(renewalAttempts.nextRetryAt, new Date()),
    ))
    .limit(100);

  const results = [];
  for (const row of rows) {
    results.push(await forceRetryRenewalAttempt({
      renewalAttemptId: row.id,
      actorUserId: 0,
      reason: "scheduled_retry",
    }).catch((error) => ({
      renewalAttemptId: row.id,
      error: error instanceof Error ? error.message : String(error),
    })));
  }
  return results;
}
