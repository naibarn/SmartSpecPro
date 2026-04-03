import { addCredits } from "../creditService";
import { getDb } from "../../db";
import {
  billingEffects,
  billingSubscriptions,
  invoiceLineItems,
  invoices,
  payments,
  users,
} from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

function inferGrantedCredits(lineItems: Array<{ metadataJson: Record<string, any> | null }>): number {
  return lineItems.reduce((sum, item) => {
    const raw = item.metadataJson?.credits ?? item.metadataJson?.creditAmount ?? 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
}

async function reserveBillingEffect(params: {
  effectKey: string;
  effectType: "grant_credits" | "renew_subscription" | "downgrade_subscription" | "reverse_downgrade";
  invoiceId: number;
  paymentId: number;
  subscriptionId?: number | null;
  metadataJson?: Record<string, any>;
}) {
  const db = getDb();
  const inserted = await db
    .insert(billingEffects)
    .values({
      effectKey: params.effectKey,
      effectType: params.effectType,
      invoiceId: params.invoiceId,
      paymentId: params.paymentId,
      subscriptionId: params.subscriptionId ?? null,
      metadataJson: params.metadataJson ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: billingEffects.id });

  return inserted.length > 0;
}

export async function applyPaidBusinessEffects(params: {
  invoiceId: number;
  paymentId: number;
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

  if (invoice.status !== "paid") {
    return { applied: false, reason: "invoice_not_paid" as const };
  }

  if (invoice.invoiceType === "topup") {
    const lineItems = await db
      .select({ metadataJson: invoiceLineItems.metadataJson })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id));

    const credits = inferGrantedCredits(lineItems);
    const reserved = await reserveBillingEffect({
      effectKey: `grant_credits:invoice:${invoice.id}`,
      effectType: "grant_credits",
      invoiceId: invoice.id,
      paymentId: params.paymentId,
      metadataJson: { credits },
    });
    if (!reserved) {
      return { applied: false, reason: "duplicate_effect" as const };
    }

    if (credits > 0) {
      await addCredits({
        userId: invoice.userId,
        amount: credits,
        type: "purchase",
        description: `Top-up credits from invoice ${invoice.invoiceNumber ?? invoice.id}`,
        referenceId: String(invoice.id),
        metadata: {
          invoiceId: invoice.id,
          paymentId: params.paymentId,
          businessEffectKey: `grant_credits:invoice:${invoice.id}`,
        },
        sourceType: "admin",
      });
    }

    await db
      .update(payments)
      .set({
        businessEffectStatus: "applied",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, params.paymentId));

    return { applied: true, reason: "credits_granted" as const };
  }

  if (invoice.invoiceType === "subscription_renewal" && invoice.subscriptionId) {
    const renewReserved = await reserveBillingEffect({
      effectKey: `renew_subscription:invoice:${invoice.id}`,
      effectType: "renew_subscription",
      invoiceId: invoice.id,
      paymentId: params.paymentId,
      subscriptionId: invoice.subscriptionId,
    });
    if (!renewReserved) {
      return { applied: false, reason: "duplicate_effect" as const };
    }

    const [subscription] = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.id, invoice.subscriptionId))
      .limit(1);

    const baseDate = subscription?.currentPeriodEnd ?? invoice.paidAt ?? new Date();
    const nextPeriodEnd = new Date(baseDate);
    nextPeriodEnd.setUTCMonth(nextPeriodEnd.getUTCMonth() + 1);

    await db.transaction(async (tx) => {
      await tx
        .update(billingSubscriptions)
        .set({
          status: "active",
          currentPeriodStart: invoice.paidAt ?? new Date(),
          currentPeriodEnd: nextPeriodEnd,
          nextInvoiceAt: nextPeriodEnd,
          downgradedAt: null,
          downgradeReason: null,
          lastRecoveryActionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(billingSubscriptions.id, invoice.subscriptionId!));

      await tx
        .update(users)
        .set({
          plan: (subscription?.planCode as "free" | "starter" | "pro" | "enterprise") ?? "free",
          updatedAt: new Date(),
        })
        .where(eq(users.id, invoice.userId));

      await tx
        .update(payments)
        .set({
          businessEffectStatus: "applied",
          updatedAt: new Date(),
        })
        .where(eq(payments.id, params.paymentId));
    });

    return { applied: true, reason: "subscription_renewed" as const };
  }

  return { applied: false, reason: "no_effect_handler" as const };
}

export async function markSubscriptionDowngraded(params: {
  invoiceId: number;
  paymentId: number;
  subscriptionId: number;
  userId: number;
  reason: string;
}) {
  const reserved = await reserveBillingEffect({
    effectKey: `downgrade_subscription:invoice:${params.invoiceId}`,
    effectType: "downgrade_subscription",
    invoiceId: params.invoiceId,
    paymentId: params.paymentId,
    subscriptionId: params.subscriptionId,
    metadataJson: { reason: params.reason },
  });

  if (!reserved) {
    return { applied: false, reason: "duplicate_effect" as const };
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(billingSubscriptions)
      .set({
        status: "downgraded_to_free",
        downgradedAt: new Date(),
        downgradeReason: params.reason,
        lastRecoveryActionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.id, params.subscriptionId));

    await tx
      .update(users)
      .set({
        plan: "free",
        updatedAt: new Date(),
      })
      .where(eq(users.id, params.userId));
  });

  return { applied: true, reason: "subscription_downgraded" as const };
}

export async function hasAppliedBillingEffect(effectKey: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: billingEffects.id })
    .from(billingEffects)
    .where(eq(billingEffects.effectKey, effectKey))
    .limit(1);
  return Boolean(row);
}
