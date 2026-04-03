import { and, eq, or } from "drizzle-orm";

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
  providerState: {
    paymentStatus: "paid" | "pending" | "failed" | "expired" | "unknown";
    amount: string | null;
    currency: string | null;
  };
}): PaymentSettlementValidationResult {
  if (params.providerState.paymentStatus !== "paid") {
    return { canAutoApply: false, reason: "payment_not_paid" };
  }

  if (!["issued", "payment_pending"].includes(params.invoice.status)) {
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
  const [paymentLookup] = await db
    .select()
    .from(payments)
    .where(
      or(
        eq(payments.providerPaymentId, event.normalizedEvent.providerObjectId ?? ""),
        eq(payments.providerReferenceId, event.normalizedEvent.providerObjectId ?? ""),
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

  const persistedEvents = await db
    .insert(webhookEvents)
    .values({
      provider: "beam",
      invoiceId: invoiceLookup?.id ?? null,
      paymentId: paymentLookup?.id ?? null,
      eventType: event.normalizedEvent.eventType,
      eventId: event.normalizedEvent.eventId,
      signatureValid: event.verification.valid,
      payloadJson: event.payload,
      processingStatus: "pending",
      validatedSecretVersion: event.verification.matchedSecretVersion ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (event.normalizedEvent.eventId && persistedEvents.length === 0) {
    return { processed: false, reason: "duplicate_webhook" as const };
  }

  const payment = paymentLookup;

  if (!payment) {
    if (persistedEvents[0]) {
      await db
        .update(webhookEvents)
        .set({
          processingStatus: "manual_review_required",
          errorMessage: "payment_not_found",
          processedAt: new Date(),
        })
        .where(eq(webhookEvents.id, persistedEvents[0].id));
    }
    return { processed: false, reason: "payment_not_found" as const };
  }

  const invoice = invoiceLookup;

  if (!invoice) {
    if (persistedEvents[0]) {
      await db
        .update(webhookEvents)
        .set({
          processingStatus: "manual_review_required",
          errorMessage: "invoice_not_found",
          processedAt: new Date(),
        })
        .where(eq(webhookEvents.id, persistedEvents[0].id));
    }
    return { processed: false, reason: "invoice_not_found" as const };
  }

  const settlement = validatePaymentSettlement({
    invoice,
    payment,
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
    if (persistedEvents[0]) {
      await db
        .update(webhookEvents)
        .set({
          processingStatus: "manual_review_required",
          errorMessage: settlement.reason,
          processedAt: new Date(),
        })
        .where(eq(webhookEvents.id, persistedEvents[0].id));
    }
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

  if (persistedEvents[0]) {
    await db
      .update(webhookEvents)
      .set({
        processingStatus: "processed",
        processedAt: new Date(),
      })
      .where(eq(webhookEvents.id, persistedEvents[0].id));
  }

  await sendInvoiceNotification({
    invoiceId: invoice.id,
    notificationType: "payment_success",
  }).catch(() => {});

  return {
    processed: true,
    reason: effectResult.reason,
  };
}
