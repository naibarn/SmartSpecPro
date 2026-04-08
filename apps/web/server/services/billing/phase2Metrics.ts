import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../../db";
import { billingSubscriptions, paymentMethodSetupSessions, renewalAttempts, subscriptionPaymentSettings } from "../../../drizzle/schema";

const counters = {
  setupSessionsCreated: 0,
  autoRenewAttemptsCreated: 0,
  autoRenewSettled: 0,
  autoRenewRetryScheduled: 0,
  autoRenewManualFallbacks: 0,
};

export function incrementBillingPhase2Metric(name: keyof typeof counters) {
  counters[name] += 1;
}

export async function getBillingPhase2Metrics(params?: { tenantId?: string | null }) {
  const db = getDb();
  const tenantScope = params?.tenantId
    ? eq(billingSubscriptions.tenantId, params.tenantId)
    : isNull(billingSubscriptions.tenantId);

  const [subscriptions, setupSessions, attempts] = await Promise.all([
    db.select({
      id: billingSubscriptions.id,
    }).from(billingSubscriptions).where(tenantScope),
    db.select({
      id: paymentMethodSetupSessions.id,
      status: paymentMethodSetupSessions.status,
      tenantId: paymentMethodSetupSessions.tenantId,
    }).from(paymentMethodSetupSessions).where(
      params?.tenantId
        ? eq(paymentMethodSetupSessions.tenantId, params.tenantId)
        : isNull(paymentMethodSetupSessions.tenantId),
    ),
    db.select({
      id: renewalAttempts.id,
      status: renewalAttempts.status,
      subscriptionId: renewalAttempts.subscriptionId,
    }).from(renewalAttempts)
      .innerJoin(billingSubscriptions, eq(billingSubscriptions.id, renewalAttempts.subscriptionId))
      .where(tenantScope),
  ]);

  const subscriptionIds = new Set(subscriptions.map((row) => row.id));
  const filteredAttempts = attempts.filter((row) => subscriptionIds.has(row.subscriptionId));
  return {
    setupSessionsCreated: setupSessions.length,
    autoRenewAttemptsCreated: filteredAttempts.length,
    autoRenewSettled: filteredAttempts.filter((row) => row.status === "settled").length,
    autoRenewRetryScheduled: filteredAttempts.filter((row) => row.status === "retry_scheduled").length,
    autoRenewManualFallbacks: filteredAttempts.filter((row) => row.status === "manual_fallback_active").length,
    activeAutoRenewSubscriptions: await db.select({
      id: subscriptionPaymentSettings.id,
    }).from(subscriptionPaymentSettings)
      .innerJoin(billingSubscriptions, eq(billingSubscriptions.id, subscriptionPaymentSettings.subscriptionId))
      .where(and(
        tenantScope,
        eq(subscriptionPaymentSettings.autoRenewEnabled, true),
        eq(subscriptionPaymentSettings.renewalMode, "auto_charge"),
      ))
      .then((rows) => rows.length),
    processCounters: { ...counters },
  };
}

export function resetBillingPhase2Metrics() {
  for (const key of Object.keys(counters) as Array<keyof typeof counters>) {
    counters[key] = 0;
  }
}
