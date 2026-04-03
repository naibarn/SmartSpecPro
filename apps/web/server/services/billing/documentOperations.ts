import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import { invoiceAuditLogs, invoiceLineItems, invoices } from "../../../drizzle/schema";
import { getBillingProfileForUser, getSellerProfileForTenant } from "./profiles";
import { reserveNextInvoiceNumber } from "./invoiceDomain";
import { renderInvoiceDocument } from "./documentRendering";
import { sendInvoiceNotification } from "./notifications";

export async function syncInvoiceHeader(params: {
  invoiceId: number;
  actorUserId: number;
  scope: "seller" | "buyer" | "both";
  reason?: string | null;
}) {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, params.invoiceId)).limit(1);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  if (!["draft", "issued", "payment_pending"].includes(invoice.status)) {
    throw new Error("Invoice header sync is only allowed for unpaid editable invoices");
  }

  const latestSeller = params.scope === "seller" || params.scope === "both"
    ? await getSellerProfileForTenant(invoice.tenantId ?? null)
    : null;
  const latestBuyer = params.scope === "buyer" || params.scope === "both"
    ? await getBillingProfileForUser(invoice.userId)
    : null;

  const beforeSeller = invoice.sellerSnapshotJson ?? null;
  const beforeBuyer = invoice.buyerSnapshotJson ?? null;
  const nextSeller = params.scope === "seller" || params.scope === "both"
    ? (latestSeller ?? beforeSeller)
    : beforeSeller;
  const nextBuyer = params.scope === "buyer" || params.scope === "both"
    ? (latestBuyer ?? beforeBuyer)
    : beforeBuyer;

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        sellerSnapshotJson: nextSeller,
        buyerSnapshotJson: nextBuyer,
        headerVersion: (invoice.headerVersion ?? 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    await tx.insert(invoiceAuditLogs).values({
      invoiceId: invoice.id,
      action: "sync_header",
      actorType: "admin",
      actorId: params.actorUserId,
      reason: params.reason ?? `sync_${params.scope}_header`,
      beforeJson: {
        sellerSnapshot: beforeSeller,
        buyerSnapshot: beforeBuyer,
        headerVersion: invoice.headerVersion,
      },
      afterJson: {
        sellerSnapshot: nextSeller,
        buyerSnapshot: nextBuyer,
        headerVersion: (invoice.headerVersion ?? 1) + 1,
      },
    });
  });

  return renderInvoiceDocument({
    invoiceId: invoice.id,
    language: invoice.defaultDocumentLanguage,
    reason: "sync_header",
    renderedByType: "admin",
    renderedById: params.actorUserId,
  });
}

export async function replacePaidInvoice(params: {
  invoiceId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, params.invoiceId)).limit(1);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  if (invoice.status !== "paid") {
    throw new Error("Only paid invoices can be replaced");
  }

  const latestSeller = await getSellerProfileForTenant(invoice.tenantId ?? null);
  const latestBuyer = await getBillingProfileForUser(invoice.userId);
  const numbering = await reserveNextInvoiceNumber({
    tenantId: invoice.tenantId ?? null,
    stream: invoice.invoiceStream,
    actorUserId: params.actorUserId,
  });
  const existingLineItems = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoice.id));

  const [replacement] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(invoices)
      .values({
        tenantId: invoice.tenantId,
        invoiceNumber: numbering.invoiceNumber,
        invoiceStream: invoice.invoiceStream,
        taxPolicyId: invoice.taxPolicyId,
        invoiceType: invoice.invoiceType,
        userId: invoice.userId,
        subscriptionId: invoice.subscriptionId,
        orderId: invoice.orderId,
        status: "paid",
        currency: invoice.currency,
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        issuedAt: new Date(),
        dueAt: invoice.dueAt,
        paidAt: invoice.paidAt ?? new Date(),
        headerVersion: 1,
        sellerSnapshotJson: latestSeller ?? invoice.sellerSnapshotJson,
        buyerSnapshotJson: latestBuyer ?? invoice.buyerSnapshotJson,
        totalsSnapshotJson: invoice.totalsSnapshotJson,
        defaultDocumentLanguage: invoice.defaultDocumentLanguage,
        supersedesInvoiceId: invoice.id,
        billingCycleStart: invoice.billingCycleStart,
        billingCycleEnd: invoice.billingCycleEnd,
        documentAccessScope: invoice.documentAccessScope,
        updatedAt: new Date(),
      })
      .returning();

    if (existingLineItems.length > 0) {
      await tx.insert(invoiceLineItems).values(existingLineItems.map((lineItem) => ({
        invoiceId: created.id,
        itemType: lineItem.itemType,
        description: lineItem.description,
        quantity: lineItem.quantity,
        unitPrice: lineItem.unitPrice,
        amount: lineItem.amount,
        metadataJson: lineItem.metadataJson,
      })));
    }

    await tx
      .update(invoices)
      .set({
        status: "replaced",
        replacedByInvoiceId: created.id,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    await tx.insert(invoiceAuditLogs).values([
      {
        invoiceId: invoice.id,
        action: "replace_paid_invoice",
        actorType: "admin",
        actorId: params.actorUserId,
        reason: params.reason,
        beforeJson: {
          status: invoice.status,
          invoiceNumber: invoice.invoiceNumber,
        },
        afterJson: {
          status: "replaced",
          replacedByInvoiceId: created.id,
        },
      },
      {
        invoiceId: created.id,
        action: "reissue_from_paid_invoice",
        actorType: "admin",
        actorId: params.actorUserId,
        reason: params.reason,
        beforeJson: {
          supersedesInvoiceId: invoice.id,
        },
        afterJson: {
          invoiceNumber: created.invoiceNumber,
          status: created.status,
        },
      },
    ]);

    return [created];
  });

  await renderInvoiceDocument({
    invoiceId: replacement.id,
    language: replacement.defaultDocumentLanguage,
    reason: "reissue_render",
    renderedByType: "admin",
    renderedById: params.actorUserId,
  });

  await sendInvoiceNotification({
    invoiceId: replacement.id,
    notificationType: "invoice_reissued",
    actorUserId: params.actorUserId,
  }).catch(() => {});

  return replacement;
}
