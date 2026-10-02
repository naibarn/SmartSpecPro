import { and, asc, eq, or } from "drizzle-orm";

import { getDb } from "../../db";
import {
  invoices,
  paymentAttempts,
  payments,
  webhookEvents,
  type Invoice,
  type Payment,
} from "../../../drizzle/schema";
import type { BeamWebhookEnvelope } from "../../routes/beamWebhook";
import { applyPaidBusinessEffects } from "./businessEffects";
import { syncRenewalAttemptForInvoice } from "./autoRenew";
import { sendInvoiceNotification } from "./notifications";
import { createBeamProvider } from "./beamProvider";
import { EmergencyFinancialError, settleEmergencyContributionsForPayment } from "../emergencyFinancialService";

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeDeclineCategory(category: string | null): Payment["declineCategory"] | null {
  if (!category) return null;
  const normalized = category.trim().toLowerCase();
  if (["soft_decline", "soft", "retryable"].includes(normalized)) {
    return "soft_decline";
  }
  if (["hard_decline", "hard", "permanent", "requires_new_card"].includes(normalized)) {
    return "hard_decline";
  }
  if (["manual_review_required", "manual_review", "review"].includes(normalized)) {
    return "manual_review_required";
  }
  if (["provider_unknown", "unknown"].includes(normalized)) {
    return "provider_unknown";
  }
  return null;
}

function classifyDeclineCode(code: string | null): Payment["declineCategory"] | null {
  if (!code) return null;
  const normalized = code.trim().toLowerCase();
  const hardCodes = new Set([
    "expired_card",
    "invalid_card",
    "lost_card",
    "stolen_card",
    "pickup_card",
    "transaction_not_allowed",
    "do_not_retry",
    "card_not_supported",
  ]);
  const softCodes = new Set([
    "insufficient_funds",
    "issuer_unavailable",
    "issuer_timeout",
    "temporary_hold",
    "processing_error",
    "do_not_honor",
    "try_again_later",
  ]);
  if (hardCodes.has(normalized)) return "hard_decline";
  if (softCodes.has(normalized)) return "soft_decline";
  return null;
}

function extractDeclineMetadata(rawPayload: Record<string, any>) {
  const data = typeof rawPayload.data === "object" && rawPayload.data ? rawPayload.data : rawPayload;
  const declineCode = firstString(
    data.decline_code,
    data.declineCode,
    data.failure_code,
    data.error_code,
    data.reason_code,
    data.code,
    rawPayload.decline_code,
    rawPayload.declineCode,
  );
  const explicitCategory = normalizeDeclineCategory(firstString(
    data.decline_category,
    data.declineCategory,
    rawPayload.decline_category,
    rawPayload.declineCategory,
  ));
  return {
    declineCode,
    declineCategory: explicitCategory ?? classifyDeclineCode(declineCode),
  };
}

export interface PaymentSettlementValidationResult {
  canAutoApply: boolean;
  reason:
    | "payment_not_paid"
    | "amount_missing"
    | "currency_missing"
    | "missing_payment"
    | "missing_invoice"
    | "invoice_not_payable"
    | "amount_mismatch"
    | "currency_mismatch"
    | "valid";
}

export function validatePaymentSettlement(params: {
  invoice: Pick<Invoice, "status" | "totalAmount" | "currency">;
  payment: Pick<Payment, "expectedAmount" | "expectedCurrency">;
  allowAlreadyPaid?: boolean;
  providerState: {
    paymentStatus: "paid" | "pending" | "failed" | "expired" | "unknown";
    amount: string | null;
    currency: string | null;
  };
}): PaymentSettlementValidationResult {
  if (params.providerState.paymentStatus !== "paid") {
    return { canAutoApply: false, reason: "payment_not_paid" };
  }

  if (!params.providerState.amount) return { canAutoApply: false, reason: "amount_missing" };
  if (!params.providerState.currency) return { canAutoApply: false, reason: "currency_missing" };

  if (!["issued", "payment_pending"].includes(params.invoice.status) &&
      !(params.allowAlreadyPaid && params.invoice.status === "paid")) {
    return { canAutoApply: false, reason: "invoice_not_payable" };
  }

  const expectedAmount = params.payment.expectedAmount ?? params.invoice.totalAmount;
  if (expectedAmount && params.providerState.amount && String(expectedAmount) !== String(params.providerState.amount)) {
    return { canAutoApply: false, reason: "amount_mismatch" };
  }

  const expectedCurrency = params.payment.expectedCurrency ?? params.invoice.currency;
  if (expectedCurrency && params.providerState.currency && expectedCurrency !== params.providerState.currency) {
    return { canAutoApply: false, reason: "currency_mismatch" };
  }

  return { canAutoApply: true, reason: "valid" };
}

export async function processBeamWebhookEvent(event: BeamWebhookEnvelope) {
  const db = getDb();
  const eventId = event.normalizedEvent.eventId;
  const providerObjectId = event.normalizedEvent.providerObjectId;
  if (!eventId || !providerObjectId) {
    return { processed: false, reason: "schema_invalid" as const };
  }
  const [paymentLookup] = await db
    .select()
    .from(payments)
    .where(
      or(
        eq(payments.providerPaymentId, providerObjectId),
        eq(payments.providerReferenceId, providerObjectId),
      ),
    )
    .limit(1);

  const [invoiceLookup] = paymentLookup
    ? await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, paymentLookup.invoiceId))
      .limit(1)
    : [];

  const eventClaim = await db.transaction(async tx => {
    await tx.insert(webhookEvents).values({
      provider: "beam",
      invoiceId: invoiceLookup?.id ?? null,
      paymentId: paymentLookup?.id ?? null,
      eventType: event.normalizedEvent.eventType,
      eventId,
      signatureValid: event.verification.valid,
      payloadJson: event.payload,
      processingStatus: "pending",
      validatedSecretVersion: event.verification.matchedSecretVersion ?? null,
    }).onConflictDoNothing();
    const [stored] = await tx.select().from(webhookEvents)
      .where(and(eq(webhookEvents.provider, "beam"), eq(webhookEvents.eventId, eventId)))
      .for("update").limit(1);
    if (!stored) return null;
    if (stored.processingStatus === "processed" || stored.processingStatus === "ignored_duplicate" ||
      stored.processingStatus === "schema_invalid" || stored.processingStatus === "failed") return null;
    if (stored.processingStatus === "manual_review_required" &&
      !["payment_not_found", "invoice_not_found"].includes(stored.errorMessage ?? "")) return null;
    const now = Date.now();
    if (stored.processingStartedAt && now - stored.processingStartedAt.getTime() < 60_000) return null;
    const [claimed] = await tx.update(webhookEvents).set({
      processingStatus: "pending",
      processingStartedAt: new Date(now),
      processingAttempts: (stored.processingAttempts ?? 0) + 1,
      processedAt: null,
      errorMessage: null,
      invoiceId: invoiceLookup?.id ?? stored.invoiceId,
      paymentId: paymentLookup?.id ?? stored.paymentId,
    }).where(eq(webhookEvents.id, stored.id)).returning({ id: webhookEvents.id });
    return claimed ?? null;
  });
  if (!eventClaim) return { processed: false, reason: "duplicate_webhook" as const };
  const eventRowId = eventClaim.id;

  const payment = paymentLookup;

  if (!payment) {
    await db.update(webhookEvents).set({ processingStatus: "pending", processingStartedAt: null,
      errorMessage: "payment_not_found", processedAt: null }).where(eq(webhookEvents.id, eventRowId));
    return { processed: false, reason: "payment_not_found" as const };
  }

  const invoice = invoiceLookup;

  if (!invoice) {
    await db.update(webhookEvents).set({ processingStatus: "pending", processingStartedAt: null,
      errorMessage: "invoice_not_found", processedAt: null }).where(eq(webhookEvents.id, eventRowId));
    return { processed: false, reason: "invoice_not_found" as const };
  }

  const settlement = validatePaymentSettlement({
    invoice,
    payment,
    allowAlreadyPaid: payment.status === "paid",
    providerState: {
      paymentStatus: event.normalizedEvent.paymentStatus,
      amount: event.normalizedEvent.amount,
      currency: event.normalizedEvent.currency,
    },
  });
  const decline = extractDeclineMetadata(event.normalizedEvent.raw);

  await db
    .update(payments)
    .set({
      providerStatusLastSeen: event.normalizedEvent.paymentStatus,
      providerEventLastSeenId: event.normalizedEvent.eventId,
      declineCode: event.normalizedEvent.paymentStatus === "paid" ? null : decline.declineCode,
      declineCategory: event.normalizedEvent.paymentStatus === "paid" ? null : decline.declineCategory,
      settledAmount: event.normalizedEvent.amount,
      settledCurrency: event.normalizedEvent.currency,
      amountMatchStatus:
        settlement.reason === "valid"
          ? "matched"
          : settlement.reason === "currency_mismatch"
            ? "currency_mismatch"
            : settlement.reason === "amount_mismatch"
              ? "mismatch"
              : "unknown",
      reconciliationStatus: settlement.canAutoApply ? "fixed" : "manual_review_required",
      status: settlement.canAutoApply ? "paid" : "manual_review_required",
      paidAt: settlement.canAutoApply ? new Date() : payment.paidAt,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  await db
    .update(paymentAttempts)
    .set({
      providerPaymentId: payment.providerPaymentId ?? event.normalizedEvent.providerObjectId,
      settledAmount: event.normalizedEvent.amount,
      settledCurrency: event.normalizedEvent.currency,
      expiresAt: payment.expiresAt,
      providerPayloadJson: event.normalizedEvent.raw,
      status: settlement.canAutoApply ? "paid" : "reconciliation_required",
    })
    .where(eq(paymentAttempts.paymentId, payment.id));

  if (!settlement.canAutoApply) {
    await syncRenewalAttemptForInvoice({
      invoiceId: invoice.id,
      paymentStatus:
        event.normalizedEvent.paymentStatus === "expired"
          ? "expired"
          : "manual_review_required",
      amountMatchStatus:
        settlement.reason === "currency_mismatch"
          ? "currency_mismatch"
          : settlement.reason === "amount_mismatch"
            ? "mismatch"
            : null,
      reason: settlement.reason,
    }).catch(() => {});
    await db.update(webhookEvents).set({ processingStatus: "manual_review_required", processingStartedAt: null,
      errorMessage: settlement.reason, processedAt: new Date() }).where(eq(webhookEvents.id, eventRowId));
    return { processed: false, reason: settlement.reason };
  }

  await db
    .update(invoices)
    .set({
      status: "paid",
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, invoice.id), eq(invoices.status, invoice.status)));

  await syncRenewalAttemptForInvoice({
    invoiceId: invoice.id,
    paymentStatus: "paid",
    amountMatchStatus: "matched",
    reason: "webhook_paid",
  }).catch(() => {});

  const effectResult = await applyPaidBusinessEffects({
    invoiceId: invoice.id,
    paymentId: payment.id,
  });

  try {
    await settleEmergencyContributionsForPayment(db, { paymentId: payment.id, policyVersion: "spec260-financial-v1" });
  } catch (error) {
    if (!(error instanceof EmergencyFinancialError)) throw error;
    await db.update(webhookEvents).set({ processingStatus: "manual_review_required", processingStartedAt: null,
      errorMessage: `emergency_financial:${error.code}`, processedAt: new Date() }).where(eq(webhookEvents.id, eventRowId));
    return { processed: false, reason: "emergency_financial_review_required" as const };
  }

  await db.update(webhookEvents).set({ processingStatus: "processed", processingStartedAt: null,
    errorMessage: null, processedAt: new Date() }).where(eq(webhookEvents.id, eventRowId));

  await sendInvoiceNotification({
    invoiceId: invoice.id,
    notificationType: "payment_success",
  }).catch(() => {});

  return {
    processed: true,
    reason: effectResult.reason,
  };
}

/** Retry verified inbox events that arrived before the provider charge ID was persisted. */
export async function replayPendingBeamWebhooksForPayment(paymentId: number) {
  const db = getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  const providerObjectIds = new Set([payment?.providerPaymentId, payment?.providerReferenceId].filter((value): value is string => Boolean(value)));
  if (!payment || providerObjectIds.size === 0) return { replayed: 0 };

  const candidates = await db.select().from(webhookEvents).where(and(
    eq(webhookEvents.provider, "beam"),
    or(
      eq(webhookEvents.processingStatus, "pending"),
      and(eq(webhookEvents.processingStatus, "manual_review_required"),
        or(eq(webhookEvents.errorMessage, "payment_not_found"), eq(webhookEvents.errorMessage, "invoice_not_found"))),
    ),
  )).orderBy(asc(webhookEvents.createdAt)).limit(100);
  const provider = await createBeamProvider();
  let replayed = 0;
  for (const candidate of candidates) {
    if (!candidate.eventId || !candidate.payloadJson) continue;
    const normalizedEvent = provider.normalizeWebhookEvent(candidate.payloadJson);
    if (normalizedEvent.eventId !== candidate.eventId || !providerObjectIds.has(normalizedEvent.providerObjectId ?? "")) continue;
    await processBeamWebhookEvent({
      verification: { valid: true, matchedSecretVersion: candidate.validatedSecretVersion ?? undefined },
      normalizedEvent,
      payload: candidate.payloadJson,
    });
    replayed += 1;
  }
  return { replayed };
}
