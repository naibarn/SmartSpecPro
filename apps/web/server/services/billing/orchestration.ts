import { and, desc, eq } from "drizzle-orm";

import { getDb } from "../../db";
import {
  billingSubscriptions,
  invoiceAuditLogs,
  invoiceLineItems,
  invoices,
  paymentAttempts,
  payments,
  type InsertInvoice,
  type InsertInvoiceLineItem,
  type InsertPayment,
  type InsertPaymentAttempt,
} from "../../../drizzle/schema";
import { createBeamProvider, type BillingPaymentProvider } from "./beamProvider";
import {
  calculateInvoiceTotalsFromBasePrice,
  classifyInvoiceStream,
  getActiveTaxPolicy,
  reserveNextInvoiceNumber,
  type InvoiceLineItemInput,
} from "./invoiceDomain";
import {
  getBillingProfileForUser,
  getSellerProfileForTenant,
} from "./profiles";
import { renderInvoiceDocument } from "./documentRendering";
import { sendInvoiceNotification } from "./notifications";
import { isBillingFeatureEnabled } from "./featureFlags";
import { getBillingRuntimeConfig } from "./runtimeConfig";

type ChargeCreationResult = {
  providerPaymentId: string | null;
  providerReferenceId?: string | null;
  paymentUrl?: string | null;
  qrCodeUrl?: string | null;
  expiresAt?: string | Date | null;
  raw: Record<string, any>;
};

type CreatedProviderPaymentType = "charge" | "payment_link";

export interface BillingLineItemDraft {
  itemType: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
  metadataJson?: Record<string, any> | null;
}

export interface CreateInvoiceChargeFlowParams {
  tenantId: string | null;
  userId: number;
  actorUserId: number | null;
  invoiceType: "topup" | "subscription_renewal" | "manual";
  subscriptionId?: number | null;
  paymentMethodId?: number | null;
  offSession?: boolean;
  currency?: string;
  dueInDays?: number;
  billingCycleStart?: Date | null;
  billingCycleEnd?: Date | null;
  documentLanguage?: "th" | "en" | "bilingual";
  lineItems: BillingLineItemDraft[];
  providerPaymentType?: "charge" | "payment_link";
  provider?: BillingPaymentProvider;
  chargePayload: Record<string, unknown>;
  renderInitialDocument?: boolean;
  suppressInvoiceIssuedNotification?: boolean;
  suppressQrReadyNotification?: boolean;
}

function normalizeMoney(value: number): string {
  return value.toFixed(2);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mapDraftsToTotalsInput(lineItems: BillingLineItemDraft[]): InvoiceLineItemInput[] {
  return lineItems.map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.amount,
  }));
}

export async function createInvoiceChargeFlow(
  params: CreateInvoiceChargeFlowParams,
) {
  const db = getDb();
  const issuedAt = new Date();
  const runtime = await getBillingRuntimeConfig();
  const currency = params.currency ?? "THB";
  const provider = params.provider ?? await createBeamProvider();
  const buyerProfile = await getBillingProfileForUser(params.userId);
  const sellerProfile = await getSellerProfileForTenant(params.tenantId);
  const invoiceStream = classifyInvoiceStream({
    country: buyerProfile?.country ?? sellerProfile?.country ?? "Thailand",
  });
  const taxPolicy = await getActiveTaxPolicy({
    tenantId: params.tenantId,
    stream: invoiceStream,
    issuedAt,
  });
  const totals = calculateInvoiceTotalsFromBasePrice({
    lineItems: mapDraftsToTotalsInput(params.lineItems),
    taxRatePercent: Number(taxPolicy?.taxRatePercent ?? "0"),
    roundingPolicy: taxPolicy?.roundingPolicy ?? "half_up_2dp",
  });
  const numbering = await reserveNextInvoiceNumber({
    tenantId: params.tenantId,
    stream: invoiceStream,
    actorUserId: params.actorUserId,
  });
  const defaultDueDays = params.invoiceType === "subscription_renewal"
    ? Number.parseInt(runtime.BILLING_SUBSCRIPTION_RENEWAL_DUE_DAYS ?? "7", 10)
    : Number.parseInt(runtime.BILLING_TOPUP_DUE_DAYS ?? "1", 10);
  const dueAt = addDays(issuedAt, params.dueInDays ?? (Number.isFinite(defaultDueDays) ? defaultDueDays : (params.invoiceType === "subscription_renewal" ? 7 : 1)));

  const created = await db.transaction(async (tx) => {
    const [invoice] = await tx.insert(invoices).values({
      tenantId: params.tenantId,
      invoiceNumber: numbering.invoiceNumber,
      invoiceStream,
      taxPolicyId: taxPolicy?.id ?? null,
      invoiceType: params.invoiceType,
      userId: params.userId,
      subscriptionId: params.subscriptionId ?? null,
      status: "issued",
      currency,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      issuedAt,
      dueAt,
      headerVersion: 1,
      sellerSnapshotJson: sellerProfile,
      buyerSnapshotJson: buyerProfile,
      totalsSnapshotJson: {
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        taxRatePercent: totals.taxRatePercent,
        taxPolicyId: taxPolicy?.id ?? null,
        taxName: taxPolicy?.taxName ?? null,
        stream: invoiceStream,
      },
      defaultDocumentLanguage: params.documentLanguage ?? "th",
      billingCycleStart: params.billingCycleStart ?? null,
      billingCycleEnd: params.billingCycleEnd ?? null,
    } satisfies InsertInvoice).returning();

    await tx.insert(invoiceLineItems).values(
      params.lineItems.map((item) => ({
        invoiceId: invoice.id,
        itemType: item.itemType,
        description: item.description,
        quantity: normalizeMoney(item.quantity),
        unitPrice: normalizeMoney(item.unitPrice),
        amount: normalizeMoney(item.amount ?? item.quantity * item.unitPrice),
        metadataJson: item.metadataJson ?? null,
      } satisfies InsertInvoiceLineItem)),
    );

    const [payment] = await tx.insert(payments).values({
      invoiceId: invoice.id,
      paymentMethodId: params.paymentMethodId ?? null,
      provider: "beam",
      providerPaymentType: params.providerPaymentType ?? "charge",
      status: "pending_provider_creation",
      amount: totals.totalAmount,
      currency,
      offSession: params.offSession ?? false,
      expectedAmount: totals.totalAmount,
      expectedCurrency: currency,
      reconciliationStatus: "pending",
      businessEffectStatus: "not_started",
    } satisfies InsertPayment).returning();

    await tx.insert(paymentAttempts).values({
      paymentId: payment.id,
      attemptNo: 1,
      status: "pending_provider_creation",
      expectedAmount: totals.totalAmount,
      expectedCurrency: currency,
      providerPayloadJson: null,
    } satisfies InsertPaymentAttempt);

    await tx.insert(invoiceAuditLogs).values({
      invoiceId: invoice.id,
      action: "invoice_issued",
      actorType: params.actorUserId ? "admin" : "system",
      actorId: params.actorUserId,
      afterJson: {
        status: "issued",
        invoiceNumber: invoice.invoiceNumber,
        paymentId: payment.id,
      },
    });

    return { invoice, payment };
  });

  try {
    const chargeFactory =
      params.invoiceType === "topup"
        ? provider.createTopupCharge.bind(provider)
        : provider.createInvoiceCharge.bind(provider);
    let charge: ChargeCreationResult;
    let usedPaymentType: CreatedProviderPaymentType = params.providerPaymentType ?? "charge";
    const baseProviderPayload = {
      invoiceNumber: created.invoice.invoiceNumber,
      invoiceId: created.invoice.id,
      paymentId: created.payment.id,
      amount: created.invoice.totalAmount,
      currency,
      dueAt: dueAt.toISOString(),
      lineItems: params.lineItems,
      subscriptionId: params.subscriptionId ?? null,
      offSession: params.offSession ?? false,
      paymentMethodId: params.paymentMethodId ?? null,
      ...params.chargePayload,
    };

    try {
      charge = await chargeFactory({
        ...baseProviderPayload,
        providerPaymentType: usedPaymentType,
      }) as ChargeCreationResult;
    } catch (primaryError) {
      if ((params.providerPaymentType ?? "charge") === "payment_link" || !(await isBillingFeatureEnabled("BEAM_PAYMENT_LINK_FALLBACK"))) {
        throw primaryError;
      }
      usedPaymentType = "payment_link";
      charge = await chargeFactory({
        ...baseProviderPayload,
        providerPaymentType: "payment_link",
        fallbackReason: primaryError instanceof Error ? primaryError.message : String(primaryError),
      }) as ChargeCreationResult;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          paymentMethodId: params.paymentMethodId ?? null,
          providerPaymentType: usedPaymentType,
          providerPaymentId: charge.providerPaymentId,
          providerReferenceId: charge.providerReferenceId ?? charge.paymentUrl ?? null,
          status: "payment_pending",
          rawResponseJson: {
            ...charge.raw,
            paymentUrl: charge.paymentUrl ?? null,
            qrCodeUrl: charge.qrCodeUrl ?? null,
          },
          expiresAt: charge.expiresAt ? new Date(charge.expiresAt) : null,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, created.payment.id));

      await tx
        .update(paymentAttempts)
        .set({
          status: "active",
          providerPaymentId: charge.providerPaymentId,
          providerReferenceId: charge.providerReferenceId ?? charge.paymentUrl ?? null,
          expiresAt: charge.expiresAt ? new Date(charge.expiresAt) : null,
          providerPayloadJson: charge.raw,
        })
        .where(and(eq(paymentAttempts.paymentId, created.payment.id), eq(paymentAttempts.attemptNo, 1)));

      await tx
        .update(invoices)
        .set({
          status: "payment_pending",
          dueAt: charge.expiresAt ? new Date(charge.expiresAt) : dueAt,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, created.invoice.id));

      await tx.insert(invoiceAuditLogs).values({
        invoiceId: created.invoice.id,
        action: "payment_attempt_created",
        actorType: params.actorUserId ? "admin" : "system",
        actorId: params.actorUserId,
        afterJson: {
          providerPaymentId: charge.providerPaymentId,
          providerPaymentType: usedPaymentType,
          providerReferenceId: charge.providerReferenceId ?? null,
          paymentUrl: charge.paymentUrl ?? null,
          qrCodeUrl: charge.qrCodeUrl ?? null,
        },
      });
    });
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          status: "provider_pending_unknown",
          reconciliationStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(payments.id, created.payment.id));

      await tx
        .update(paymentAttempts)
        .set({
          status: "provider_pending_unknown",
          providerPayloadJson: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
        .where(and(eq(paymentAttempts.paymentId, created.payment.id), eq(paymentAttempts.attemptNo, 1)));

      await tx.insert(invoiceAuditLogs).values({
        invoiceId: created.invoice.id,
        action: "payment_attempt_pending_unknown",
        actorType: params.actorUserId ? "admin" : "system",
        actorId: params.actorUserId,
        reason: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, created.invoice.id))
    .limit(1);
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, created.payment.id))
    .limit(1);

  if (params.renderInitialDocument !== false) {
    try {
      await renderInvoiceDocument({
        invoiceId: created.invoice.id,
        language: params.documentLanguage ?? "th",
        reason: "initial_issue",
        renderedByType: params.actorUserId ? "admin" : "system",
        renderedById: params.actorUserId,
      });
    } catch (error) {
      await db.insert(invoiceAuditLogs).values({
        invoiceId: created.invoice.id,
        action: "invoice_document_render_failed",
        actorType: params.actorUserId ? "admin" : "system",
        actorId: params.actorUserId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!params.suppressInvoiceIssuedNotification) {
    await sendInvoiceNotification({
      invoiceId: created.invoice.id,
      notificationType: "invoice_issued",
    }).catch(() => {});
  }
  if (!params.suppressQrReadyNotification && payment?.status === "payment_pending" && !params.offSession) {
    await sendInvoiceNotification({
      invoiceId: created.invoice.id,
      notificationType: "qr_ready",
    }).catch(() => {});
  }

  return {
    invoice,
    payment,
  };
}

export async function getCurrentBillingSubscriptionForUser(userId: number) {
  const db = getDb();
  const [subscription] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, userId))
    .orderBy(desc(billingSubscriptions.updatedAt))
    .limit(1);
  return subscription ?? null;
}
