import { and, eq, ne, or } from "drizzle-orm";

import { getDb } from "../../db";
import {
  invoices,
  paymentAttempts,
  payments,
  reconciliationRuns,
} from "../../../drizzle/schema";
import { createBeamProvider, type BeamPaymentStatusResponse, type BillingPaymentProvider } from "./beamProvider";
import { getCurrentRenewalAttemptForInvoice, syncRenewalAttemptForInvoice } from "./autoRenew";
import { applyPaidBusinessEffects } from "./businessEffects";
import { sendInvoiceNotification } from "./notifications";

function deriveAmountMatchStatus(expectedAmount: string | null, settledAmount: string | null) {
  if (!expectedAmount || !settledAmount) {
    return "unknown" as const;
  }
  const expected = Number(expectedAmount);
  const settled = Number(settledAmount);
  if (!Number.isFinite(expected) || !Number.isFinite(settled)) {
    return "unknown" as const;
  }
  if (expected === settled) return "matched" as const;
  if (settled < expected) return "underpaid" as const;
  if (settled > expected) return "overpaid" as const;
  return "mismatch" as const;
}

export async function reconcilePaymentWithProvider(params: {
  paymentId: number;
  triggerType?: "webhook" | "schedule" | "admin" | "support_case";
  actorUserId?: number | null;
  provider?: BillingPaymentProvider;
}) {
  const db = getDb();
  const provider = params.provider ?? await createBeamProvider();
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, params.paymentId))
    .limit(1);
  if (!payment) {
    throw new Error("Payment not found");
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, payment.invoiceId))
    .limit(1);
  if (!invoice) {
    throw new Error("Invoice not found");
  }
  if (payment.paymentChannel === "promptpay_direct_manual") {
    return { reconciled: false, reason: "direct_manual_payment" as const };
  }
  const renewalAttempt = await getCurrentRenewalAttemptForInvoice(invoice.id).catch(() => null);

  if (!payment.providerPaymentId) {
    await db.insert(reconciliationRuns).values({
      entityType: "payment",
      entityId: payment.id,
      renewalAttemptId: renewalAttempt?.id ?? null,
      triggerType: params.triggerType ?? "schedule",
      result: "manual_review_required",
      beforeJson: { paymentStatus: payment.status },
      afterJson: { paymentStatus: payment.status },
      notes: "missing_provider_payment_id",
      createdBy: params.actorUserId ?? null,
    });
    return { reconciled: false, reason: "missing_provider_payment_id" as const };
  }

  let providerState: BeamPaymentStatusResponse;
  try {
    providerState = await provider.getPaymentStatus(payment.providerPaymentId, payment.providerPaymentType);
  } catch (error) {
    await db.insert(reconciliationRuns).values({
      entityType: "payment",
      entityId: payment.id,
      renewalAttemptId: renewalAttempt?.id ?? null,
      triggerType: params.triggerType ?? "schedule",
      result: "failed",
      beforeJson: { paymentStatus: payment.status },
      afterJson: { paymentStatus: payment.status },
      notes: error instanceof Error ? error.message : String(error),
      createdBy: params.actorUserId ?? null,
    });
    return { reconciled: false, reason: "provider_query_failed" as const };
  }

  const amountMatchStatus =
    providerState.currency && payment.expectedCurrency && providerState.currency !== payment.expectedCurrency
      ? "currency_mismatch"
      : deriveAmountMatchStatus(payment.expectedAmount, providerState.amount);

  if (
    providerState.paymentStatus === "paid" &&
    amountMatchStatus === "matched" &&
    invoice.status !== "paid"
  ) {
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          status: "paid",
          settledAmount: providerState.amount,
          settledCurrency: providerState.currency,
          paidAt: new Date(),
          providerStatusLastSeen: providerState.paymentStatus,
          amountMatchStatus,
          reconciliationStatus: "fixed",
          lastReconciledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      await tx
        .update(paymentAttempts)
        .set({
          providerPaymentId: payment.providerPaymentId,
          settledAmount: providerState.amount,
          settledCurrency: providerState.currency,
          expiresAt: providerState.expiresAt ? new Date(providerState.expiresAt) : payment.expiresAt,
          providerPayloadJson: providerState.raw,
          status: "paid",
        })
        .where(eq(paymentAttempts.paymentId, payment.id));

      await tx
        .update(invoices)
        .set({
          status: "paid",
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));
    });

    await applyPaidBusinessEffects({
      invoiceId: invoice.id,
      paymentId: payment.id,
    });
    await syncRenewalAttemptForInvoice({
      invoiceId: invoice.id,
      paymentStatus: "paid",
      amountMatchStatus,
      actorUserId: params.actorUserId ?? null,
      reason: "reconciliation_paid",
    }).catch(() => {});
    await sendInvoiceNotification({
      invoiceId: invoice.id,
      notificationType: "payment_success",
    }).catch(() => {});

    await db.insert(reconciliationRuns).values({
      entityType: "payment",
      entityId: payment.id,
      triggerType: params.triggerType ?? "schedule",
      result: "fixed",
      beforeJson: {
        paymentStatus: payment.status,
        invoiceStatus: invoice.status,
      },
      afterJson: {
        paymentStatus: "paid",
        invoiceStatus: "paid",
        amountMatchStatus,
      },
      createdBy: params.actorUserId ?? null,
    });

    return { reconciled: true, reason: "paid_applied" as const };
  }

  const nextStatus =
    providerState.paymentStatus === "expired"
      ? "expired"
      : providerState.paymentStatus === "pending"
        ? "reconciliation_required"
        : "manual_review_required";

  await db
    .update(payments)
    .set({
      status: nextStatus,
      settledAmount: providerState.amount,
      settledCurrency: providerState.currency,
      providerStatusLastSeen: providerState.paymentStatus,
      amountMatchStatus,
      reconciliationStatus: nextStatus === "manual_review_required" ? "manual_review_required" : "pending",
      lastReconciledAt: new Date(),
      rawResponseJson: providerState.raw,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  await db
    .update(paymentAttempts)
    .set({
      providerPaymentId: payment.providerPaymentId,
      settledAmount: providerState.amount,
      settledCurrency: providerState.currency,
      expiresAt: providerState.expiresAt ? new Date(providerState.expiresAt) : payment.expiresAt,
      providerPayloadJson: providerState.raw,
      status:
        providerState.paymentStatus === "expired"
          ? "expired"
          : nextStatus === "manual_review_required"
            ? "reconciliation_required"
            : "active",
    })
    .where(eq(paymentAttempts.paymentId, payment.id));

  if (providerState.paymentStatus === "expired" && ["issued", "payment_pending"].includes(invoice.status)) {
    await db
      .update(invoices)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));
  }

  await syncRenewalAttemptForInvoice({
    invoiceId: invoice.id,
    paymentStatus:
      nextStatus === "expired"
        ? "expired"
        : nextStatus === "manual_review_required"
          ? "manual_review_required"
          : "reconciliation_required",
    amountMatchStatus,
    actorUserId: params.actorUserId ?? null,
    reason: `reconciliation_${providerState.paymentStatus}`,
  }).catch(() => {});

  await db.insert(reconciliationRuns).values({
    entityType: "payment",
    entityId: payment.id,
    renewalAttemptId: renewalAttempt?.id ?? null,
    triggerType: params.triggerType ?? "schedule",
    result: nextStatus === "manual_review_required" ? "manual_review_required" : "no_change",
    beforeJson: {
      paymentStatus: payment.status,
      invoiceStatus: invoice.status,
    },
    afterJson: {
      paymentStatus: nextStatus,
      providerStatus: providerState.paymentStatus,
      amountMatchStatus,
    },
    createdBy: params.actorUserId ?? null,
  });

  return {
    reconciled: false,
    reason: nextStatus as "expired" | "reconciliation_required" | "manual_review_required",
  };
}

export async function reconcilePendingPayments(params?: {
  limit?: number;
  provider?: BillingPaymentProvider;
}) {
  const db = getDb();
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        or(
        eq(payments.status, "payment_pending"),
        eq(payments.status, "provider_pending_unknown"),
        eq(payments.status, "reconciliation_required"),
        eq(payments.status, "manual_review_required"),
        ),
        ne(payments.paymentChannel, "promptpay_direct_manual"),
      ),
    )
    .limit(params?.limit ?? 50);

  const results = [];
  for (const row of rows) {
    results.push(await reconcilePaymentWithProvider({
      paymentId: row.id,
      triggerType: "schedule",
      provider: params?.provider,
    }));
  }
  return results;
}

export async function getInvoiceActivePayment(invoiceId: number) {
  const db = getDb();
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.invoiceId, invoiceId),
        or(
          eq(payments.status, "payment_pending"),
          eq(payments.status, "provider_pending_unknown"),
          eq(payments.status, "reconciliation_required"),
          eq(payments.status, "manual_review_required"),
          eq(payments.status, "pending_provider_creation"),
        ),
      ),
    )
    .limit(1);
  return payment ?? null;
}
