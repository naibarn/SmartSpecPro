import { and, eq, isNotNull, lte, ne, or } from "drizzle-orm";

import { getDb } from "../db";
import { billingSubscriptions, invoiceAuditLogs, invoiceDocuments, invoices, paymentAttempts, payments, promptpayAmountReservations, supportRecoveryCases } from "../../drizzle/schema";
import { applyPaidBusinessEffects, markSubscriptionDowngraded } from "../services/billing/businessEffects";
import { createBeamProvider } from "../services/billing/beamProvider";
import { renderInvoiceDocumentWithFailureAudit } from "../services/billing/documentRendering";
import { sendInvoiceNotification } from "../services/billing/notifications";
import { createAutoRenewalAttempt, runRenewalRetryScheduler } from "../services/billing/autoRenew";
import { markExpiredPaymentMethodSetupSessionsAbandoned } from "../services/billing/paymentMethodSetup";
import { createOrGetInvoiceForBillingCycle } from "../services/billing/renewalService";
import { reconcilePendingPayments, reconcilePaymentWithProvider } from "../services/billing/reconciliation";
import { storageDelete } from "../storage";
import { isBillingFeatureEnabled } from "../services/billing/featureFlags";
import { getBillingRuntimeConfig } from "../services/billing/runtimeConfig";
import { releasePromptPayReservationForPayment } from "../services/billing/promptpayDirectService";
import { reconcileTerminalSkillSandboxJobs } from "../services/skillBillingReconciler";
import { backfillFreePlanAssignments, runFreePlanMonthlyGrant } from "../services/freePlanService";

const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;
const OVERDUE_INTERVAL_MS = 60 * 60 * 1000;
let reconciliationIntervalId: NodeJS.Timeout | null = null;
let overdueIntervalId: NodeJS.Timeout | null = null;
let startupTimeoutId: NodeJS.Timeout | null = null;

export async function runPaymentReconciliationJob() {
  if (!(await isBillingFeatureEnabled("PAYMENT_RECONCILIATION_ENABLED"))) {
    return [];
  }
  return reconcilePendingPayments({
    provider: await createBeamProvider(),
  });
}

export async function runSubscriptionRenewalJob() {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      subscriptionId: billingSubscriptions.id,
      tenantId: billingSubscriptions.tenantId,
      autoRenewEnabled: billingSubscriptions.autoRenewEnabled,
      renewalMode: billingSubscriptions.renewalMode,
    })
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.status, "active"),
        lte(billingSubscriptions.nextInvoiceAt, now),
      ),
    );

  const results = [];
  for (const row of rows) {
    const created = row.autoRenewEnabled && row.renewalMode === "auto_charge"
      ? await createAutoRenewalAttempt({
        subscriptionId: row.subscriptionId,
        actorUserId: null,
      })
      : await createOrGetInvoiceForBillingCycle({
        subscriptionId: row.subscriptionId,
        tenantId: row.tenantId ?? null,
        actorUserId: null,
      });
    results.push({
      subscriptionId: row.subscriptionId,
      invoiceId: created.invoice?.id ?? null,
      renewalAttemptId: "renewalAttempt" in created ? created.renewalAttempt?.id ?? null : null,
      reused: Boolean(created.reused),
    });
  }

  return results;
}

export async function runInvoiceOverdueDowngradeJob() {
  if (!(await isBillingFeatureEnabled("AUTO_DOWNGRADE_AFTER_7_DAYS"))) {
    return [];
  }

  const db = getDb();
  const runtime = await getBillingRuntimeConfig();
  const overdueDays = Number.parseInt(runtime.BILLING_OVERDUE_DAYS ?? "7", 10);
  const overdueBefore = new Date(Date.now() - (Number.isFinite(overdueDays) ? overdueDays : 7) * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      invoiceId: invoices.id,
      userId: invoices.userId,
      subscriptionId: invoices.subscriptionId,
      status: invoices.status,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.invoiceType, "subscription_renewal"),
        or(eq(invoices.status, "issued"), eq(invoices.status, "payment_pending")),
        lte(invoices.issuedAt, overdueBefore),
      ),
    );

  const results = [];
  for (const row of rows) {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, row.invoiceId))
      .limit(1);
    if (!payment || !row.subscriptionId) {
      results.push({ invoiceId: row.invoiceId, downgraded: false, reason: "missing_payment_or_subscription" });
      continue;
    }

    if (await isBillingFeatureEnabled("FINAL_RECONCILIATION_BEFORE_DOWNGRADE")) {
      const reconciliation = await reconcilePaymentWithProvider({
        paymentId: payment.id,
        triggerType: "schedule",
        provider: await createBeamProvider(),
      });
      if (reconciliation.reconciled) {
        results.push({ invoiceId: row.invoiceId, downgraded: false, reason: "paid_on_final_reconciliation" });
        continue;
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          status: "canceled_overdue",
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      await tx
        .update(invoices)
        .set({
          status: "canceled_overdue",
          canceledAt: new Date(),
          cancelReason: "overdue_7_days",
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, row.invoiceId));
    });

    await markSubscriptionDowngraded({
      invoiceId: row.invoiceId,
      paymentId: payment.id,
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      reason: "overdue_7_days",
    });

    await sendInvoiceNotification({
      invoiceId: row.invoiceId,
      notificationType: "invoice_overdue_downgraded",
    });

    results.push({ invoiceId: row.invoiceId, downgraded: true });
  }

  return results;
}

export async function runExpiredPaymentCleanupJob() {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      paymentId: payments.id,
      invoiceId: payments.invoiceId,
    })
    .from(payments)
    .where(
      and(
        or(
          eq(payments.status, "payment_pending"),
          eq(payments.status, "provider_pending_unknown"),
          eq(payments.status, "reconciliation_required"),
        ),
        ne(payments.paymentChannel, "promptpay_direct_manual"),
        lte(payments.expiresAt, now),
      ),
    );

  for (const row of rows) {
    await db.update(payments).set({
      status: "expired_internal",
      updatedAt: new Date(),
    }).where(eq(payments.id, row.paymentId));

    await db.update(invoices).set({
      status: "expired",
      updatedAt: new Date(),
    }).where(eq(invoices.id, row.invoiceId));
    await releasePromptPayReservationForPayment(row.paymentId).catch(() => {});
  }

  return rows;
}

export async function runTopupInvoiceRetentionCleanupJob(params: { tenantId?: string | null; actorUserId?: number | null } = {}) {
  const db = getDb();
  const runtime = await getBillingRuntimeConfig();
  const retentionDays = Number.parseInt(runtime.BILLING_TOPUP_PENDING_RETENTION_DAYS ?? "15", 10);
  const safeRetentionDays = Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : 15;
  const cutoff = new Date(Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000);
  const tenantClause = params.tenantId ? eq(invoices.tenantId, params.tenantId) : undefined;
  const rows = await db
    .select({ invoiceId: invoices.id, paymentId: payments.id })
    .from(invoices)
    .innerJoin(payments, eq(payments.invoiceId, invoices.id))
    .where(and(
      eq(invoices.invoiceType, "topup"),
      or(eq(invoices.status, "issued"), eq(invoices.status, "payment_pending")),
      eq(payments.status, "payment_pending"),
      lte(invoices.issuedAt, cutoff),
      tenantClause,
    ))
    .limit(500);

  const cleared: number[] = [];
  for (const row of rows) {
    const changed = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ invoice: invoices, payment: payments })
        .from(invoices)
        .innerJoin(payments, eq(payments.invoiceId, invoices.id))
        .where(and(eq(invoices.id, row.invoiceId), eq(payments.id, row.paymentId)))
        .for("update");
      if (!current || !["issued", "payment_pending"].includes(current.invoice.status) || current.payment.status !== "payment_pending") {
        return false;
      }

      const now = new Date();
      const reason = `topup_pending_retention_${safeRetentionDays}_days`;
      await tx.update(payments).set({ status: "canceled_overdue", updatedAt: now }).where(eq(payments.id, current.payment.id));
      await tx.update(paymentAttempts).set({ status: "canceled_overdue" }).where(and(eq(paymentAttempts.paymentId, current.payment.id), eq(paymentAttempts.status, "active")));
      await tx.update(promptpayAmountReservations).set({ state: "released", releasedAt: now, updatedAt: now }).where(and(eq(promptpayAmountReservations.paymentId, current.payment.id), eq(promptpayAmountReservations.state, "reserved")));
      await tx.update(invoices).set({ status: "canceled_overdue", canceledAt: now, cancelReason: reason, updatedAt: now }).where(eq(invoices.id, current.invoice.id));
      await tx.insert(invoiceAuditLogs).values({
        invoiceId: current.invoice.id,
        action: "topup_invoice_cleared_after_retention",
        actorType: params.actorUserId ? "admin" : "system",
        actorId: params.actorUserId ?? null,
        reason,
        beforeJson: { invoiceStatus: current.invoice.status, paymentStatus: current.payment.status },
        afterJson: { invoiceStatus: "canceled_overdue", paymentStatus: "canceled_overdue", retentionDays: safeRetentionDays },
      });
      return true;
    });
    if (changed) cleared.push(row.invoiceId);
  }

  return { retentionDays: safeRetentionDays, clearedCount: cleared.length, invoiceIds: cleared };
}

export async function runInvoiceDueReminderJob() {
  const db = getDb();
  const now = Date.now();
  const runtime = await getBillingRuntimeConfig();
  const earlyThresholdDays = Number.parseInt(runtime.BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS ?? "4", 10);
  const finalThresholdDays = Number.parseInt(runtime.BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS ?? "1", 10);
  const rows = await db
    .select({
      invoiceId: invoices.id,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
    })
    .from(invoices)
    .where(
      and(
        or(eq(invoices.status, "issued"), eq(invoices.status, "payment_pending")),
        or(eq(invoices.invoiceType, "subscription_renewal"), eq(invoices.invoiceType, "topup")),
      ),
    );

  const results = [];
  for (const row of rows) {
    const dueAtMs = row.dueAt ? new Date(row.dueAt).getTime() : null;
    if (!dueAtMs) continue;
    const daysRemaining = Math.ceil((dueAtMs - now) / (24 * 60 * 60 * 1000));
    let variant: string | null = null;
    if (daysRemaining <= (Number.isFinite(finalThresholdDays) ? finalThresholdDays : 1)) {
      variant = "day6";
    } else if (daysRemaining <= (Number.isFinite(earlyThresholdDays) ? earlyThresholdDays : 4)) {
      variant = "day3";
    }
    if (!variant) continue;

    results.push(await sendInvoiceNotification({
      invoiceId: row.invoiceId,
      notificationType: "invoice_due_reminder",
      variant,
    }));
  }

  return results;
}

export async function runPaidButUnappliedRecoveryJob() {
  const db = getDb();
  const rows = await db
    .select({
      paymentId: payments.id,
      invoiceId: payments.invoiceId,
    })
    .from(payments)
    .where(
      and(
        or(eq(payments.status, "paid"), eq(payments.status, "paid_recovered"), eq(payments.status, "paid_unapplied")),
        or(eq(payments.businessEffectStatus, "not_started"), eq(payments.businessEffectStatus, "failed"), eq(payments.businessEffectStatus, "pending")),
      ),
    );

  const results = [];
  for (const row of rows) {
    results.push(await applyPaidBusinessEffects({
      invoiceId: row.invoiceId,
      paymentId: row.paymentId,
    }));
  }

  return results;
}

export async function runDowngradeReversalRecoveryJob() {
  const db = getDb();
  const rows = await db
    .select({
      paymentId: payments.id,
      invoiceId: payments.invoiceId,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(billingSubscriptions, eq(billingSubscriptions.id, invoices.subscriptionId))
    .where(
      and(
        or(eq(payments.status, "paid"), eq(payments.status, "paid_recovered")),
        eq(billingSubscriptions.status, "downgraded_to_free"),
      ),
    );

  for (const row of rows) {
    await applyPaidBusinessEffects({
      invoiceId: row.invoiceId,
      paymentId: row.paymentId,
    });
  }

  return rows;
}

export async function runDocumentRecoveryJob() {
  if (!(await isBillingFeatureEnabled("DOCUMENT_RECOVERY_ENABLED"))) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select({
      invoiceId: invoices.id,
      language: invoices.defaultDocumentLanguage,
      documentId: invoiceDocuments.id,
      pdfFileUrl: invoiceDocuments.pdfFileUrl,
    })
    .from(invoices)
    .leftJoin(invoiceDocuments, and(eq(invoiceDocuments.invoiceId, invoices.id), eq(invoiceDocuments.isLatestForLanguage, true)))
    .where(
      and(
        isNotNull(invoices.issuedAt),
        or(eq(invoices.status, "issued"), eq(invoices.status, "payment_pending"), eq(invoices.status, "paid")),
      ),
    )
    .limit(100);

  const missing = rows.filter((row) => !row.documentId || !row.pdfFileUrl);
  const results = [];
  for (const row of missing) {
    const rendered = await renderInvoiceDocumentWithFailureAudit({
      invoiceId: row.invoiceId,
      language: (row.language ?? "th") as "th" | "en" | "bilingual",
      reason: "manual_regeneration",
      renderedByType: "system",
      renderedById: null,
    });
    results.push({
      invoiceId: row.invoiceId,
      rendered: Boolean(rendered),
      documentVersion: rendered?.documentVersion ?? null,
    });
  }
  return results;
}

export async function runInvoicePdfBackfillJob() {
  return runDocumentRecoveryJob();
}

export async function runRecoveryEvidenceRetentionCleanupJob() {
  const db = getDb();
  const rows = await db
    .select()
    .from(supportRecoveryCases)
    .limit(200);

  const now = Date.now();
  let deletedCount = 0;
  for (const row of rows) {
    const attachments = Array.isArray(row.evidenceJson?.attachments) ? row.evidenceJson.attachments : [];
    const kept = [];
    for (const attachment of attachments) {
      const expiresAt = attachment?.retentionExpiresAt ? new Date(String(attachment.retentionExpiresAt)).getTime() : null;
      if (expiresAt && expiresAt <= now && attachment?.objectKey) {
        await storageDelete(String(attachment.objectKey)).catch(() => false);
        deletedCount += 1;
      } else {
        kept.push(attachment);
      }
    }
    if (kept.length !== attachments.length) {
      await db.update(supportRecoveryCases).set({
        evidenceJson: {
          ...(row.evidenceJson ?? {}),
          attachments: kept,
        },
        updatedAt: new Date(),
      }).where(eq(supportRecoveryCases.id, row.id));

      if (row.invoiceId) {
        await db.insert(invoiceAuditLogs).values({
          invoiceId: row.invoiceId,
          action: "support_recovery_evidence_retention_cleanup",
          actorType: "system",
          actorId: null,
          afterJson: {
            recoveryCaseId: row.id,
            deletedCount,
          },
        });
      }
    }
  }

  return { deletedCount };
}

export async function runPaymentMethodSetupSessionCleanupJob() {
  return markExpiredPaymentMethodSetupSessionsAbandoned();
}

export async function runFreePlanMaintenanceJob(options: { backfill?: boolean } = {}) {
  try {
    const backfill = options.backfill
      ? await backfillFreePlanAssignments()
      : null;
    const monthly = await runFreePlanMonthlyGrant();
    return { backfill, monthly };
  } catch (error) {
    console.error("[BillingJobs] free plan maintenance failed:", error);
    return null;
  }
}

export async function initializeBillingJobs() {
  shutdownBillingJobs();

  startupTimeoutId = setTimeout(async () => {
    try {
      await runSubscriptionRenewalJob();
      await runPaymentReconciliationJob();
      await runExpiredPaymentCleanupJob();
      await runTopupInvoiceRetentionCleanupJob();
      await runInvoiceDueReminderJob();
      await runPaidButUnappliedRecoveryJob();
      await runRenewalRetryScheduler();
      await runDowngradeReversalRecoveryJob();
      await runDocumentRecoveryJob();
      await runPaymentMethodSetupSessionCleanupJob();
      await runRecoveryEvidenceRetentionCleanupJob();
      await runInvoiceOverdueDowngradeJob();
      await reconcileTerminalSkillSandboxJobs();
      await runFreePlanMaintenanceJob({ backfill: true });
    } catch (error) {
      console.error("[BillingJobs] initial run failed:", error);
    }
  }, 30_000);

  reconciliationIntervalId = setInterval(async () => {
    try {
      await runPaymentReconciliationJob();
      await runExpiredPaymentCleanupJob();
      await runTopupInvoiceRetentionCleanupJob();
      await runInvoiceDueReminderJob();
      await runPaidButUnappliedRecoveryJob();
      await runRenewalRetryScheduler();
      await runDowngradeReversalRecoveryJob();
      await runDocumentRecoveryJob();
      await runPaymentMethodSetupSessionCleanupJob();
      await runRecoveryEvidenceRetentionCleanupJob();
      await reconcileTerminalSkillSandboxJobs();
      await runFreePlanMaintenanceJob();
    } catch (error) {
      console.error("[BillingJobs] reconciliation run failed:", error);
    }
  }, RECONCILIATION_INTERVAL_MS);

  overdueIntervalId = setInterval(async () => {
    try {
      await runSubscriptionRenewalJob();
      await runInvoiceOverdueDowngradeJob();
      await runInvoicePdfBackfillJob();
    } catch (error) {
      console.error("[BillingJobs] overdue downgrade run failed:", error);
    }
  }, OVERDUE_INTERVAL_MS);
}

export async function shutdownBillingJobs(): Promise<void> {
  if (startupTimeoutId) {
    clearTimeout(startupTimeoutId);
    startupTimeoutId = null;
  }
  if (reconciliationIntervalId) {
    clearInterval(reconciliationIntervalId);
    reconciliationIntervalId = null;
  }
  if (overdueIntervalId) {
    clearInterval(overdueIntervalId);
    overdueIntervalId = null;
  }
}
