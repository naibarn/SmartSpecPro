import { and, eq, or } from "drizzle-orm";
import path from "path";

import { getDb } from "../../db";
import {
  billingEffects,
  billingSubscriptions,
  invoiceLineItems,
  invoiceAuditLogs,
  invoices,
  paymentAttempts,
  payments,
  supportRecoveryCases,
  users,
} from "../../../drizzle/schema";
import { applyPaidBusinessEffects } from "./businessEffects";
import { sendInvoiceNotification } from "./notifications";
import { getInvoiceActivePayment, reconcilePaymentWithProvider } from "./reconciliation";
import { storagePresignGet, storagePut, storageResolveUrl } from "../../storage";
import { createBeamProvider, type BillingPaymentProvider } from "./beamProvider";
import { isBillingFeatureEnabled } from "./featureFlags";
import { getBillingRuntimeConfig } from "./runtimeConfig";

function sanitizeFileName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "evidence.bin";
}

function validateEvidenceContent(buffer: Buffer, contentType: string) {
  if (contentType === "application/pdf") {
    return buffer.subarray(0, 4).toString("utf8") === "%PDF";
  }
  if (contentType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (contentType === "image/webp") {
    return buffer.subarray(0, 4).toString("utf8") === "RIFF" && buffer.subarray(8, 12).toString("utf8") === "WEBP";
  }
  if (contentType === "text/plain") {
    return true;
  }
  return false;
}

export async function createSupportRecoveryCase(params: {
  tenantId: string | null;
  userId: number | null;
  invoiceId: number;
  paymentId?: number | null;
  actorUserId: number;
  issueType:
    | "payment_not_applied"
    | "wrong_downgrade"
    | "amount_mismatch"
    | "missing_document"
    | "duplicate_charge_review"
    | "other";
  resolutionNote?: string | null;
  evidenceJson?: Record<string, any> | null;
}) {
  const db = getDb();
  const [created] = await db.insert(supportRecoveryCases).values({
    tenantId: params.tenantId,
    userId: params.userId,
    invoiceId: params.invoiceId,
    paymentId: params.paymentId ?? null,
    issueType: params.issueType,
    status: "open",
    customerReportedAt: new Date(),
    assignedAdminId: params.actorUserId,
    resolutionNote: params.resolutionNote ?? null,
    evidenceJson: params.evidenceJson ?? null,
  }).returning();
  return created;
}

export async function uploadSupportRecoveryEvidence(params: {
  recoveryCaseId: number;
  actorUserId: number;
  fileName: string;
  contentType: string;
  base64Content: string;
  note?: string | null;
}) {
  const db = getDb();
  const [recoveryCase] = await db
    .select()
    .from(supportRecoveryCases)
    .where(eq(supportRecoveryCases.id, params.recoveryCaseId))
    .limit(1);

  if (!recoveryCase) {
    throw new Error("Recovery case not found");
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, recoveryCase.invoiceId))
    .limit(1);

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const fileName = sanitizeFileName(params.fileName);
  const buffer = Buffer.from(params.base64Content, "base64");
  if (buffer.byteLength === 0) {
    throw new Error("Evidence file is empty");
  }
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("Evidence file exceeds 10 MB limit");
  }

  const allowedTypes = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
  ]);
  if (!allowedTypes.has(params.contentType)) {
    throw new Error("Unsupported evidence file type");
  }
  if (!validateEvidenceContent(buffer, params.contentType)) {
    throw new Error("Evidence file content does not match declared type");
  }

  const storageKey = [
    "billing",
    "recovery-evidence",
    recoveryCase.tenantId ?? "global",
    `invoice-${invoice.id}`,
    `case-${recoveryCase.id}`,
    `${Date.now()}-${fileName}`,
  ].join("/");
  const stored = await storagePut(storageKey, buffer, params.contentType);

  const existingEvidence = recoveryCase.evidenceJson ?? {};
  const attachments = Array.isArray(existingEvidence.attachments) ? existingEvidence.attachments : [];
  const runtime = await getBillingRuntimeConfig();
  const retentionDays = Number.parseInt(runtime.BILLING_EVIDENCE_RETENTION_DAYS ?? "180", 10);
  const attachment = {
    name: fileName,
    contentType: params.contentType,
    sizeBytes: buffer.byteLength,
    objectKey: stored.key,
    url: stored.url,
    scanStatus: "basic_content_validated",
    scannedAt: new Date().toISOString(),
    retentionExpiresAt: new Date(Date.now() + (Number.isFinite(retentionDays) ? retentionDays : 180) * 24 * 60 * 60 * 1000).toISOString(),
    note: params.note ?? null,
    uploadedBy: params.actorUserId,
    uploadedAt: new Date().toISOString(),
  };

  await db.transaction(async (tx) => {
    await tx
      .update(supportRecoveryCases)
      .set({
        evidenceJson: {
          ...existingEvidence,
          attachments: [...attachments, attachment],
        },
        updatedAt: new Date(),
      })
      .where(eq(supportRecoveryCases.id, recoveryCase.id));

    await tx.insert(invoiceAuditLogs).values({
      invoiceId: invoice.id,
      action: "support_recovery_evidence_uploaded",
      actorType: "admin",
      actorId: params.actorUserId,
      reason: params.note ?? "support_recovery_evidence_uploaded",
      afterJson: {
        recoveryCaseId: recoveryCase.id,
        attachment: {
          name: attachment.name,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
          objectKey: attachment.objectKey,
        },
      },
    });
  });

  return attachment;
}

export async function resolveSupportRecoveryEvidenceAccess(params: {
  recoveryCaseId: number;
  attachmentIndex: number;
  actorUserId: number;
  ttlSeconds?: number;
}) {
  const db = getDb();
  const [recoveryCase] = await db
    .select()
    .from(supportRecoveryCases)
    .where(eq(supportRecoveryCases.id, params.recoveryCaseId))
    .limit(1);

  if (!recoveryCase) {
    throw new Error("Recovery case not found");
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, recoveryCase.invoiceId))
    .limit(1);

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const attachments = Array.isArray(recoveryCase.evidenceJson?.attachments)
    ? recoveryCase.evidenceJson.attachments
    : [];
  const attachment = attachments[params.attachmentIndex];
  if (!attachment?.objectKey) {
    throw new Error("Evidence attachment not found");
  }

  const presigned = await storagePresignGet(String(attachment.objectKey), params.ttlSeconds ?? 900);
  const url = presigned?.url ?? await storageResolveUrl(String(attachment.objectKey));

  await db.insert(invoiceAuditLogs).values({
    invoiceId: invoice.id,
    action: "support_recovery_evidence_accessed",
    actorType: "admin",
    actorId: params.actorUserId,
    afterJson: {
      recoveryCaseId: recoveryCase.id,
      attachmentIndex: params.attachmentIndex,
      objectKey: attachment.objectKey,
    },
  });

  return {
    attachment,
    url,
  };
}

export async function manualMarkInvoicePaid(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
  evidenceJson?: Record<string, any> | null;
}) {
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, params.invoiceId))
    .limit(1);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const payment = await getInvoiceActivePayment(invoice.id);
  if (!payment) {
    throw new Error("No active payment found");
  }

  if (!params.evidenceJson || Object.keys(params.evidenceJson).length === 0) {
    throw new Error("Manual payment recovery requires evidence");
  }

  if (["underpaid", "overpaid", "currency_mismatch", "mismatch"].includes(payment.amountMatchStatus ?? "unknown")) {
    throw new Error("Cannot manually mark paid while amount match is unresolved");
  }

  if (invoice.status === "paid") {
    return { invoice, payment, idempotent: true };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "paid_recovered",
        reconciliationStatus: "fixed",
        manualRecoveryRequired: false,
        manualRecoveryResolvedAt: new Date(),
        paidAt: new Date(),
        providerStatusLastSeen: "manual_recovery",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    await tx
      .update(invoices)
      .set({
        status: "paid",
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    await tx.insert(invoiceAuditLogs).values({
      invoiceId: invoice.id,
      action: "manual_mark_paid",
      actorType: "admin",
      actorId: params.actorUserId,
      reason: params.reason,
      beforeJson: {
        invoiceStatus: invoice.status,
        paymentStatus: payment.status,
      },
      afterJson: {
        invoiceStatus: "paid",
        paymentStatus: "paid_recovered",
        evidenceJson: params.evidenceJson ?? null,
      },
    });
  });

  await applyPaidBusinessEffects({
    invoiceId: invoice.id,
    paymentId: payment.id,
  });
  await sendInvoiceNotification({
    invoiceId: invoice.id,
    notificationType: "payment_success",
  }).catch(() => {});

  return { invoiceId: invoice.id, paymentId: payment.id, idempotent: false };
}

export async function reverseWrongDowngrade(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, params.invoiceId))
    .limit(1);
  if (!invoice?.subscriptionId) {
    throw new Error("Invoice subscription not found");
  }

  const [subscription] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.id, invoice.subscriptionId))
    .limit(1);
  if (!subscription) {
    throw new Error("Subscription not found");
  }

  const [existingEffect] = await db
    .select({ id: billingEffects.id })
    .from(billingEffects)
    .where(eq(billingEffects.effectKey, `reverse_downgrade:invoice:${invoice.id}`))
    .limit(1);
  if (existingEffect) {
    return { reversed: false, reason: "duplicate_effect" as const };
  }

  const payment = await getInvoiceActivePayment(invoice.id)
    ?? (
      await db.select().from(payments).where(
        and(
          eq(payments.invoiceId, invoice.id),
          or(eq(payments.status, "paid"), eq(payments.status, "paid_recovered")),
        ),
      ).limit(1)
    )[0];

  await db.transaction(async (tx) => {
    await tx.insert(billingEffects).values({
      effectKey: `reverse_downgrade:invoice:${invoice.id}`,
      effectType: "reverse_downgrade",
      invoiceId: invoice.id,
      paymentId: payment?.id ?? null,
      subscriptionId: subscription.id,
      metadataJson: { reason: params.reason },
    });

    await tx
      .update(billingSubscriptions)
      .set({
        status: "active",
        downgradedAt: null,
        downgradeReason: null,
        lastRecoveryActionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.id, subscription.id));

    await tx
      .update(users)
      .set({
        plan: subscription.planCode as "free" | "starter" | "pro" | "enterprise",
        updatedAt: new Date(),
      })
      .where(eq(users.id, invoice.userId));

    await tx.insert(invoiceAuditLogs).values({
      invoiceId: invoice.id,
      action: "reverse_wrong_downgrade",
      actorType: "admin",
      actorId: params.actorUserId,
      reason: params.reason,
      beforeJson: {
        subscriptionStatus: subscription.status,
      },
      afterJson: {
        subscriptionStatus: "active",
      },
    });
  });

  return { reversed: true };
}

export async function requestInvoiceReconciliation(params: {
  invoiceId: number;
  actorUserId?: number | null;
}) {
  const payment = await getInvoiceActivePayment(params.invoiceId);
  if (!payment) {
    return { requested: false, reason: "no_active_payment" as const };
  }

  return reconcilePaymentWithProvider({
    paymentId: payment.id,
    triggerType: "admin",
    actorUserId: params.actorUserId ?? null,
  });
}

async function getLatestPaymentForInvoice(invoiceId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .limit(10);
  return rows.sort((left, right) => right.id - left.id)[0] ?? null;
}

function getRenewalDueDate(invoiceType: string) {
  const dueAt = new Date();
  dueAt.setUTCDate(dueAt.getUTCDate() + (invoiceType === "subscription_renewal" ? 7 : 1));
  return dueAt;
}

export async function cancelInvoiceForAdmin(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
  provider?: BillingPaymentProvider;
}) {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, params.invoiceId)).limit(1);
  if (!invoice) {
    throw new Error("Invoice not found");
  }
  if (invoice.status === "paid") {
    throw new Error("Paid invoice cannot be canceled");
  }

  const payment = await getLatestPaymentForInvoice(invoice.id);
  const provider = params.provider ?? await createBeamProvider();
  let cancelRaw: Record<string, any> | null = null;
  if (payment?.providerPaymentId && ["payment_pending", "provider_pending_unknown", "reconciliation_required", "manual_review_required"].includes(payment.status)) {
    try {
      cancelRaw = (await provider.cancelPayment(payment.providerPaymentId, payment.providerPaymentType)).raw;
    } catch (error) {
      cancelRaw = { cancelError: error instanceof Error ? error.message : String(error) };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        status: "canceled",
        canceledAt: new Date(),
        cancelReason: params.reason,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    if (payment) {
      await tx
        .update(payments)
        .set({
          status: "canceled",
          rawResponseJson: cancelRaw ? { ...(payment.rawResponseJson ?? {}), cancelRaw } : payment.rawResponseJson,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
    }

    await tx.insert(invoiceAuditLogs).values({
      invoiceId: invoice.id,
      action: "invoice_canceled",
      actorType: "admin",
      actorId: params.actorUserId,
      reason: params.reason,
      beforeJson: { invoiceStatus: invoice.status, paymentStatus: payment?.status ?? null },
      afterJson: { invoiceStatus: "canceled", paymentStatus: payment ? "canceled" : null },
    });
  });

  return { canceled: true };
}

export async function cancelStalePaymentAttempt(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const payment = await getInvoiceActivePayment(params.invoiceId);
  if (!payment) {
    return { canceled: false, reason: "no_active_payment" as const };
  }

  const attempts = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.paymentId, payment.id))
    .limit(20);
  const latestAttempt = attempts.sort((left, right) => right.attemptNo - left.attemptNo)[0] ?? null;

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "canceled",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    if (latestAttempt) {
      await tx
        .update(paymentAttempts)
        .set({
          status: "canceled",
        })
        .where(eq(paymentAttempts.id, latestAttempt.id));
    }

    await tx.insert(invoiceAuditLogs).values({
      invoiceId: params.invoiceId,
      action: "payment_attempt_canceled",
      actorType: "admin",
      actorId: params.actorUserId,
      reason: params.reason,
      beforeJson: { paymentStatus: payment.status, attemptStatus: latestAttempt?.status ?? null },
      afterJson: { paymentStatus: "canceled", attemptStatus: latestAttempt ? "canceled" : null },
    });
  });

  return { canceled: true };
}

export async function regenerateInvoicePaymentAttempt(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
  provider?: BillingPaymentProvider;
}) {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, params.invoiceId)).limit(1);
  if (!invoice) {
    throw new Error("Invoice not found");
  }
  if (invoice.status === "paid" || invoice.status === "replaced") {
    throw new Error("Invoice cannot receive a new payment attempt");
  }

  const existingActive = await getInvoiceActivePayment(invoice.id);
  if (existingActive) {
    return { paymentId: existingActive.id, reused: true };
  }

  const payment = await getLatestPaymentForInvoice(invoice.id);
  if (!payment) {
    throw new Error("Payment not found");
  }
  const lineItems = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoice.id));
  const attempts = await db.select().from(paymentAttempts).where(eq(paymentAttempts.paymentId, payment.id)).limit(100);
  const nextAttemptNo = Math.max(0, ...attempts.map((attempt) => attempt.attemptNo)) + 1;
  const dueAt = getRenewalDueDate(invoice.invoiceType);
  const provider = params.provider ?? await createBeamProvider();
  let usedPaymentType: "charge" | "payment_link" = "charge";
  const baseProviderPayload = {
    invoiceNumber: invoice.invoiceNumber,
    invoiceId: invoice.id,
    paymentId: payment.id,
    amount: invoice.totalAmount,
    currency: invoice.currency,
    dueAt: dueAt.toISOString(),
    lineItems: lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      metadataJson: item.metadataJson ?? null,
    })),
    recoveryReason: params.reason,
  };
  let charge;
  try {
    charge = await provider.createInvoiceCharge({
      ...baseProviderPayload,
      providerPaymentType: "charge",
    });
  } catch (primaryError) {
    if (!(await isBillingFeatureEnabled("BEAM_PAYMENT_LINK_FALLBACK"))) {
      throw primaryError;
    }
    usedPaymentType = "payment_link";
    charge = await provider.createInvoiceCharge({
      ...baseProviderPayload,
      providerPaymentType: "payment_link",
      fallbackReason: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });
  }

  await db.transaction(async (tx) => {
    await tx.insert(paymentAttempts).values({
      paymentId: payment.id,
      attemptNo: nextAttemptNo,
      status: "active",
      providerPaymentId: charge.providerPaymentId,
      providerReferenceId: charge.providerReferenceId ?? charge.paymentUrl ?? null,
      expectedAmount: invoice.totalAmount,
      expectedCurrency: invoice.currency,
      expiresAt: charge.expiresAt ? new Date(charge.expiresAt) : dueAt,
      providerPayloadJson: charge.raw,
    });

    await tx
      .update(payments)
      .set({
        providerPaymentType: usedPaymentType,
        providerPaymentId: charge.providerPaymentId,
        providerReferenceId: charge.providerReferenceId ?? charge.paymentUrl ?? null,
        status: "payment_pending",
        rawResponseJson: {
          ...charge.raw,
          paymentUrl: charge.paymentUrl ?? null,
          qrCodeUrl: charge.qrCodeUrl ?? null,
        },
        expiresAt: charge.expiresAt ? new Date(charge.expiresAt) : dueAt,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    await tx
      .update(invoices)
      .set({
        status: "payment_pending",
        dueAt: charge.expiresAt ? new Date(charge.expiresAt) : dueAt,
        canceledAt: null,
        cancelReason: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    await tx.insert(invoiceAuditLogs).values({
      invoiceId: invoice.id,
      action: "payment_attempt_regenerated",
      actorType: "admin",
      actorId: params.actorUserId,
      reason: params.reason,
      afterJson: {
        paymentId: payment.id,
        attemptNo: nextAttemptNo,
        providerPaymentType: usedPaymentType,
        providerPaymentId: charge.providerPaymentId,
        providerReferenceId: charge.providerReferenceId ?? null,
      },
    });
  });

  return {
    paymentId: payment.id,
    reused: false,
    paymentUrl: charge.paymentUrl ?? null,
    qrCodeUrl: charge.qrCodeUrl ?? null,
    expiresAt: charge.expiresAt ?? null,
  };
}

export async function reopenInvoiceForAdmin(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
  provider?: BillingPaymentProvider;
}) {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, params.invoiceId)).limit(1);
  if (!invoice) {
    throw new Error("Invoice not found");
  }
  if (invoice.status === "paid" || invoice.status === "replaced") {
    throw new Error("Invoice cannot be reopened");
  }

  await db.insert(invoiceAuditLogs).values({
    invoiceId: invoice.id,
    action: "invoice_reopened",
    actorType: "admin",
    actorId: params.actorUserId,
    reason: params.reason,
    beforeJson: { invoiceStatus: invoice.status },
    afterJson: { invoiceStatus: "payment_pending" },
  });

  return regenerateInvoicePaymentAttempt({
    invoiceId: params.invoiceId,
    actorUserId: params.actorUserId,
    reason: params.reason,
    provider: params.provider,
  });
}

export async function applyMissingCreditsForInvoice(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const payment = await getLatestPaymentForInvoice(params.invoiceId);
  if (!payment) {
    throw new Error("Payment not found");
  }
  const result = await applyPaidBusinessEffects({ invoiceId: params.invoiceId, paymentId: payment.id });
  await db.insert(invoiceAuditLogs).values({
    invoiceId: params.invoiceId,
    action: "apply_missing_credits",
    actorType: "admin",
    actorId: params.actorUserId,
    reason: params.reason,
    afterJson: result,
  });
  return result;
}

export async function applyMissingSubscriptionRenewalForInvoice(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const payment = await getLatestPaymentForInvoice(params.invoiceId);
  if (!payment) {
    throw new Error("Payment not found");
  }
  const result = await applyPaidBusinessEffects({ invoiceId: params.invoiceId, paymentId: payment.id });
  await db.insert(invoiceAuditLogs).values({
    invoiceId: params.invoiceId,
    action: "apply_missing_subscription_renewal",
    actorType: "admin",
    actorId: params.actorUserId,
    reason: params.reason,
    afterJson: result,
  });
  return result;
}
