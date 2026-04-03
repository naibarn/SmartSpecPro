import { and, eq } from "drizzle-orm";

import { getDb } from "../../db";
import { billingSubscriptions, invoices } from "../../../drizzle/schema";
import { assertBillingSubscriptionCutoverReady } from "./cutover";
import { createBeamProvider, type BillingPaymentProvider } from "./beamProvider";
import { createAutoRenewalAttempt } from "./autoRenew";
import { createInvoiceChargeFlow } from "./orchestration";

export interface CreateOrGetRenewalInvoiceParams {
  subscriptionId: number;
  actorUserId?: number | null;
  tenantId?: string | null;
  cycleStart?: Date | null;
  cycleEnd?: Date | null;
  basePriceOverride?: number | null;
  provider?: BillingPaymentProvider;
}

function addMonth(base: Date): Date {
  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export async function createOrGetInvoiceForBillingCycle(params: CreateOrGetRenewalInvoiceParams) {
  await assertBillingSubscriptionCutoverReady();
  const db = getDb();
  const [subscription] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.id, params.subscriptionId))
    .limit(1);

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  const cycleStart = params.cycleStart ?? subscription.currentPeriodEnd ?? new Date();
  const cycleEnd = params.cycleEnd ?? addMonth(cycleStart);

  if (subscription.autoRenewEnabled && subscription.renewalMode === "auto_charge") {
    try {
      return await createAutoRenewalAttempt({
        subscriptionId: subscription.id,
        actorUserId: params.actorUserId ?? null,
        cycleStart,
        cycleEnd,
        provider: params.provider,
      });
    } catch {
      // Fall back to the Phase 1 manual invoice path when Phase 2 rollout,
      // consent, or provider capability rules suppress off-session charging.
    }
  }

  const [existing] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.subscriptionId, subscription.id),
        eq(invoices.invoiceType, "subscription_renewal"),
        eq(invoices.billingCycleStart, cycleStart),
        eq(invoices.billingCycleEnd, cycleEnd),
      ),
    )
    .limit(1);

  if (existing) {
    return { invoice: existing, reused: true };
  }

  const provider = params.provider ?? await createBeamProvider();
  const basePrice = Number(
    params.basePriceOverride ??
      subscription.legacyPlanSnapshot?.basePrice ??
      subscription.legacyPlanSnapshot?.monthlyPrice ??
      0,
  );

  const created = await createInvoiceChargeFlow({
    tenantId: params.tenantId ?? subscription.tenantId ?? null,
    userId: subscription.userId,
    actorUserId: params.actorUserId ?? null,
    invoiceType: "subscription_renewal",
    subscriptionId: subscription.id,
    currency: "THB",
    dueInDays: 7,
    billingCycleStart: cycleStart,
    billingCycleEnd: cycleEnd,
    provider,
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
        },
      },
    ],
    chargePayload: {
      subscriptionId: subscription.id,
      planCode: subscription.planCode,
      cycleStart: cycleStart.toISOString(),
      cycleEnd: cycleEnd.toISOString(),
    },
  });

  return {
    invoice: created.invoice,
    payment: created.payment,
    reused: false,
  };
}
