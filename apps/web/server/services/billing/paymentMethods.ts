import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  billingPaymentMethods,
  billingSubscriptions,
  paymentMethodAuditLogs,
  subscriptionPaymentSettings,
  type InsertBillingPaymentMethod,
  type InsertPaymentMethodAuditLog,
  type InsertSubscriptionPaymentSettings,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { assertBillingFeatureEnabled, getDefaultBillingPhase2Cohort } from "./featureFlags";

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function getCurrentSubscriptionForUser(userId: number) {
  const db = getDb();
  const [subscription] = await db
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.userId, userId),
        inArray(billingSubscriptions.status, ["active", "past_due", "downgraded_to_free", "pending_migration"]),
      ),
    )
    .orderBy(desc(billingSubscriptions.updatedAt), desc(billingSubscriptions.id))
    .limit(1);

  return subscription ?? null;
}

async function createPaymentMethodAuditLog(params: {
  paymentMethodId: number;
  actorType: "system" | "admin" | "user";
  actorUserId: number | null;
  action: string;
  reason?: string | null;
  beforeJson?: Record<string, any> | null;
  afterJson?: Record<string, any> | null;
}) {
  const db = getDb();
  const payload: InsertPaymentMethodAuditLog = {
    paymentMethodId: params.paymentMethodId,
    actorType: params.actorType,
    actorId: params.actorUserId,
    action: params.action,
    reason: params.reason ?? null,
    beforeJson: params.beforeJson ?? null,
    afterJson: params.afterJson ?? null,
  };
  await db.insert(paymentMethodAuditLogs).values(payload);
}

export async function listPaymentMethodsForUser(userId: number) {
  const db = getDb();
  return db
    .select()
    .from(billingPaymentMethods)
    .where(eq(billingPaymentMethods.userId, userId))
    .orderBy(desc(billingPaymentMethods.isDefault), desc(billingPaymentMethods.createdAt));
}

export async function listPaymentMethodsForAdmin(params: {
  tenantId: string | null;
  userId?: number | null;
}) {
  const db = getDb();
  const scope = params.userId != null
    ? and(eq(billingPaymentMethods.userId, params.userId), params.tenantId ? eq(billingPaymentMethods.tenantId, params.tenantId) : isNull(billingPaymentMethods.tenantId))
    : params.tenantId
      ? eq(billingPaymentMethods.tenantId, params.tenantId)
      : isNull(billingPaymentMethods.tenantId);

  return db
    .select()
    .from(billingPaymentMethods)
    .where(scope)
    .orderBy(desc(billingPaymentMethods.isDefault), desc(billingPaymentMethods.createdAt));
}

export async function createSavedPaymentMethod(params: {
  userId: number;
  actorUserId: number | null;
  actorType?: "system" | "admin" | "user";
  input: {
    tenantId?: string | null;
    provider?: "beam";
    providerCustomerId?: string | null;
    providerPaymentMethodId: string;
    brand?: string | null;
    last4?: string | null;
    expMonth?: number | null;
    expYear?: number | null;
    cardholderName?: string | null;
    isDefault?: boolean;
    status?: "active" | "requires_verification" | "expired" | "revoked" | "provider_unavailable";
    autoRenewEligible?: boolean;
    consentVersion?: string | null;
    consentedAt?: Date | null;
    metadataJson?: Record<string, any> | null;
    consentSnapshotJson?: Record<string, any> | null;
  };
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(billingPaymentMethods)
      .where(eq(billingPaymentMethods.userId, params.userId));
    const shouldDefault = params.input.isDefault === true || existing.length === 0;

    if (shouldDefault) {
      await tx
        .update(billingPaymentMethods)
        .set({
          isDefault: false,
          updatedAt: new Date(),
        })
        .where(eq(billingPaymentMethods.userId, params.userId));
    }

    const payload: InsertBillingPaymentMethod = {
      userId: params.userId,
      tenantId: params.input.tenantId ?? null,
      provider: params.input.provider ?? "beam",
      providerCustomerId: normalizeNullableString(params.input.providerCustomerId),
      providerPaymentMethodId: params.input.providerPaymentMethodId.trim(),
      methodType: "card",
      brand: normalizeNullableString(params.input.brand),
      last4: normalizeNullableString(params.input.last4),
      expMonth: params.input.expMonth ?? null,
      expYear: params.input.expYear ?? null,
      cardholderName: normalizeNullableString(params.input.cardholderName),
      isDefault: shouldDefault,
      status: params.input.status ?? "active",
      autoRenewEligible: params.input.autoRenewEligible ?? false,
      consentVersion: normalizeNullableString(params.input.consentVersion),
      consentedAt: params.input.consentedAt ?? null,
      metadataJson: params.input.metadataJson ?? null,
      consentSnapshotJson: params.input.consentSnapshotJson ?? null,
      updatedAt: new Date(),
    };

    const [created] = await tx.insert(billingPaymentMethods).values(payload).returning();
    await tx.insert(paymentMethodAuditLogs).values({
      paymentMethodId: created.id,
      actorType: params.actorType ?? "system",
      actorId: params.actorUserId,
      action: shouldDefault ? "payment_method_created_default" : "payment_method_created",
      afterJson: {
        paymentMethodId: created.id,
        provider: created.provider,
        brand: created.brand,
        last4: created.last4,
        status: created.status,
        isDefault: created.isDefault,
      },
    });
    return created;
  });
}

export async function setDefaultPaymentMethodForUser(params: {
  userId: number;
  paymentMethodId: number;
  actorUserId: number;
}) {
  const db = getDb();
  const [method] = await db
    .select()
    .from(billingPaymentMethods)
    .where(and(eq(billingPaymentMethods.id, params.paymentMethodId), eq(billingPaymentMethods.userId, params.userId)))
    .limit(1);

  if (!method) {
    throw new Error("Payment method not found");
  }

  if (!["active", "requires_verification"].includes(method.status)) {
    throw new Error("Payment method is not eligible to be default");
  }

  return db.transaction(async (tx) => {
    await tx
      .update(billingPaymentMethods)
      .set({
        isDefault: false,
        updatedAt: new Date(),
      })
      .where(eq(billingPaymentMethods.userId, params.userId));

    const [updated] = await tx
      .update(billingPaymentMethods)
      .set({
        isDefault: true,
        updatedAt: new Date(),
      })
      .where(eq(billingPaymentMethods.id, method.id))
      .returning();

    await tx
      .update(subscriptionPaymentSettings)
      .set({
        defaultPaymentMethodId: updated.id,
        updatedBy: params.actorUserId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(subscriptionPaymentSettings.defaultPaymentMethodId, method.id),
        eq(subscriptionPaymentSettings.autoRenewEnabled, true),
      ));

    await tx
      .update(billingSubscriptions)
      .set({
        defaultPaymentMethodId: updated.id,
        updatedAt: new Date(),
      })
      .where(and(
        eq(billingSubscriptions.userId, params.userId),
        eq(billingSubscriptions.defaultPaymentMethodId, method.id),
      ));

    await tx.insert(paymentMethodAuditLogs).values({
      paymentMethodId: updated.id,
      actorType: "user",
      actorId: params.actorUserId,
      action: "payment_method_set_default",
      beforeJson: {
        paymentMethodId: method.id,
        isDefault: method.isDefault,
      },
      afterJson: {
        paymentMethodId: updated.id,
        isDefault: updated.isDefault,
      },
    });

    return updated;
  });
}

export async function getCurrentSubscriptionPaymentSettingsForUser(userId: number) {
  const db = getDb();
  const subscription = await getCurrentSubscriptionForUser(userId);
  if (!subscription) {
    return null;
  }

  const [settings] = await db
    .select()
    .from(subscriptionPaymentSettings)
    .where(eq(subscriptionPaymentSettings.subscriptionId, subscription.id))
    .limit(1);

  return {
    subscription,
    settings: settings ?? null,
  };
}

export async function getSubscriptionPaymentSettingsForAdmin(params: {
  subscriptionId: number;
  tenantId: string | null;
}) {
  const db = getDb();
  const [subscription] = await db
    .select()
    .from(billingSubscriptions)
    .where(and(
      eq(billingSubscriptions.id, params.subscriptionId),
      params.tenantId ? eq(billingSubscriptions.tenantId, params.tenantId) : isNull(billingSubscriptions.tenantId),
    ))
    .limit(1);

  if (!subscription) {
    return null;
  }

  const [settings] = await db
    .select()
    .from(subscriptionPaymentSettings)
    .where(eq(subscriptionPaymentSettings.subscriptionId, subscription.id))
    .limit(1);

  return {
    subscription,
    settings: settings ?? null,
  };
}

export async function enableAutoRenewForUser(params: {
  userId: number;
  actorUserId: number;
  defaultPaymentMethodId: number;
  consentVersion: string;
  consentSnapshotJson: Record<string, any>;
  retryPolicyJson?: Record<string, any> | null;
  dunningPolicyJson?: Record<string, any> | null;
}) {
  await assertBillingFeatureEnabled("BILLING_PHASE2_AUTO_RENEW_ENABLED");
  const db = getDb();
  const subscription = await getCurrentSubscriptionForUser(params.userId);
  if (!subscription) {
    throw new Error("No current billing subscription");
  }

  const [method] = await db
    .select()
    .from(billingPaymentMethods)
    .where(and(eq(billingPaymentMethods.id, params.defaultPaymentMethodId), eq(billingPaymentMethods.userId, params.userId)))
    .limit(1);

  if (!method) {
    throw new Error("Payment method not found");
  }
  if (method.status !== "active" || !method.autoRenewEligible) {
    throw new Error("Payment method is not eligible for auto-renew");
  }
  if (!params.consentVersion.trim()) {
    throw new Error("Consent version is required");
  }

  return db.transaction(async (tx) => {
    await tx
      .update(billingPaymentMethods)
      .set({
        isDefault: false,
        updatedAt: new Date(),
      })
      .where(eq(billingPaymentMethods.userId, params.userId));

    const [defaultMethod] = await tx
      .update(billingPaymentMethods)
      .set({
        isDefault: true,
        consentVersion: params.consentVersion.trim(),
        consentedAt: new Date(),
        consentSnapshotJson: params.consentSnapshotJson,
        updatedAt: new Date(),
      })
      .where(eq(billingPaymentMethods.id, method.id))
      .returning();

    const existingSettings = await tx
      .select()
      .from(subscriptionPaymentSettings)
      .where(eq(subscriptionPaymentSettings.subscriptionId, subscription.id))
      .limit(1);

    const payload: InsertSubscriptionPaymentSettings = {
      subscriptionId: subscription.id,
      renewalMode: "auto_charge",
      defaultPaymentMethodId: defaultMethod.id,
      retryPolicyJson: params.retryPolicyJson ?? null,
      dunningPolicyJson: params.dunningPolicyJson ?? null,
      autoRenewEnabled: true,
      consentWithdrawnAt: null,
      rolloutCohort: await getDefaultBillingPhase2Cohort(),
      updatedBy: params.actorUserId,
      updatedAt: new Date(),
    };

    if (existingSettings[0]) {
      await tx
        .update(subscriptionPaymentSettings)
        .set(payload)
        .where(eq(subscriptionPaymentSettings.id, existingSettings[0].id));
    } else {
      await tx.insert(subscriptionPaymentSettings).values(payload);
    }

    await tx
      .update(billingSubscriptions)
      .set({
        renewalMode: "auto_charge",
        defaultPaymentMethodId: defaultMethod.id,
        autoRenewEnabled: true,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.id, subscription.id));

    await tx.insert(paymentMethodAuditLogs).values({
      paymentMethodId: defaultMethod.id,
      actorType: "user",
      actorId: params.actorUserId,
      action: "auto_renew_enabled",
      afterJson: {
        subscriptionId: subscription.id,
        renewalMode: "auto_charge",
        paymentMethodId: defaultMethod.id,
        consentVersion: params.consentVersion.trim(),
      },
    });

    return {
      subscriptionId: subscription.id,
      paymentMethodId: defaultMethod.id,
      renewalMode: "auto_charge" as const,
      autoRenewEnabled: true,
    };
  });
}

export async function disableAutoRenewForUser(params: {
  userId: number;
  actorUserId: number;
  reason?: string | null;
}) {
  const db = getDb();
  const subscription = await getCurrentSubscriptionForUser(params.userId);
  if (!subscription) {
    throw new Error("No current billing subscription");
  }

  const [existingSettings] = await db
    .select()
    .from(subscriptionPaymentSettings)
    .where(eq(subscriptionPaymentSettings.subscriptionId, subscription.id))
    .limit(1);

  const paymentMethodId = existingSettings?.defaultPaymentMethodId ?? subscription.defaultPaymentMethodId ?? null;

  await db.transaction(async (tx) => {
    if (existingSettings) {
      await tx
        .update(subscriptionPaymentSettings)
        .set({
          renewalMode: "manual_invoice",
          autoRenewEnabled: false,
          consentWithdrawnAt: new Date(),
          updatedBy: params.actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionPaymentSettings.id, existingSettings.id));
    } else {
      await tx.insert(subscriptionPaymentSettings).values({
        subscriptionId: subscription.id,
        renewalMode: "manual_invoice",
        defaultPaymentMethodId: paymentMethodId,
        autoRenewEnabled: false,
        consentWithdrawnAt: new Date(),
        updatedBy: params.actorUserId,
      });
    }

    await tx
      .update(billingSubscriptions)
      .set({
        renewalMode: "manual_invoice",
        autoRenewEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.id, subscription.id));

    if (paymentMethodId) {
      await tx.insert(paymentMethodAuditLogs).values({
        paymentMethodId,
        actorType: "user",
        actorId: params.actorUserId,
        action: "auto_renew_disabled",
        reason: params.reason ?? null,
        afterJson: {
          subscriptionId: subscription.id,
          renewalMode: "manual_invoice",
          autoRenewEnabled: false,
        },
      });
    }
  });

  return {
    subscriptionId: subscription.id,
    renewalMode: "manual_invoice" as const,
    autoRenewEnabled: false,
  };
}

export async function disableAutoRenewForSubscriptionAdmin(params: {
  subscriptionId: number;
  tenantId: string | null;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const [subscription] = await db
    .select()
    .from(billingSubscriptions)
    .where(and(
      eq(billingSubscriptions.id, params.subscriptionId),
      params.tenantId ? eq(billingSubscriptions.tenantId, params.tenantId) : isNull(billingSubscriptions.tenantId),
    ))
    .limit(1);

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  const [existingSettings] = await db
    .select()
    .from(subscriptionPaymentSettings)
    .where(eq(subscriptionPaymentSettings.subscriptionId, subscription.id))
    .limit(1);

  const paymentMethodId = existingSettings?.defaultPaymentMethodId ?? subscription.defaultPaymentMethodId ?? null;

  await db.transaction(async (tx) => {
    if (existingSettings) {
      await tx
        .update(subscriptionPaymentSettings)
        .set({
          renewalMode: "manual_invoice",
          autoRenewEnabled: false,
          consentWithdrawnAt: existingSettings.consentWithdrawnAt ?? new Date(),
          updatedBy: params.actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionPaymentSettings.id, existingSettings.id));
    } else {
      await tx.insert(subscriptionPaymentSettings).values({
        subscriptionId: subscription.id,
        renewalMode: "manual_invoice",
        defaultPaymentMethodId: paymentMethodId,
        autoRenewEnabled: false,
        consentWithdrawnAt: new Date(),
        updatedBy: params.actorUserId,
      });
    }

    await tx
      .update(billingSubscriptions)
      .set({
        renewalMode: "manual_invoice",
        autoRenewEnabled: false,
        nextRetryAt: null,
        graceEndsAt: null,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.id, subscription.id));

    if (paymentMethodId) {
      await tx.insert(paymentMethodAuditLogs).values({
        paymentMethodId,
        actorType: "admin",
        actorId: params.actorUserId,
        action: "auto_renew_force_disabled",
        reason: params.reason,
        afterJson: {
          subscriptionId: subscription.id,
          renewalMode: "manual_invoice",
          autoRenewEnabled: false,
        },
      });
    }
  });

  return {
    subscriptionId: subscription.id,
    renewalMode: "manual_invoice" as const,
    autoRenewEnabled: false,
  };
}

export async function removePaymentMethodForUser(params: {
  userId: number;
  paymentMethodId: number;
  actorUserId: number;
}) {
  const db = getDb();
  const [method] = await db
    .select()
    .from(billingPaymentMethods)
    .where(and(eq(billingPaymentMethods.id, params.paymentMethodId), eq(billingPaymentMethods.userId, params.userId)))
    .limit(1);

  if (!method) {
    throw new Error("Payment method not found");
  }

  const activeSettings = await db
    .select()
    .from(subscriptionPaymentSettings)
    .where(and(
      eq(subscriptionPaymentSettings.defaultPaymentMethodId, method.id),
      eq(subscriptionPaymentSettings.autoRenewEnabled, true),
      isNull(subscriptionPaymentSettings.consentWithdrawnAt),
    ))
    .limit(1);
  const activeSubscription = await db
    .select()
    .from(billingSubscriptions)
    .where(and(
      eq(billingSubscriptions.defaultPaymentMethodId, method.id),
      eq(billingSubscriptions.autoRenewEnabled, true),
    ))
    .limit(1);

  if (activeSettings[0] || activeSubscription[0]) {
    throw new Error("Cannot remove a payment method that is active for auto-renew");
  }

  const [updated] = await db
    .update(billingPaymentMethods)
    .set({
      status: "revoked",
      isDefault: false,
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(billingPaymentMethods.id, method.id))
    .returning();

  await createPaymentMethodAuditLog({
    paymentMethodId: updated.id,
    actorType: "user",
    actorUserId: params.actorUserId,
    action: "payment_method_removed",
    beforeJson: {
      status: method.status,
      isDefault: method.isDefault,
    },
    afterJson: {
      status: updated.status,
      isDefault: updated.isDefault,
      revokedAt: updated.revokedAt,
    },
  });

  return updated;
}

export async function revokePaymentMethodForAdmin(params: {
  tenantId: string | null;
  paymentMethodId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = getDb();
  const [method] = await db
    .select()
    .from(billingPaymentMethods)
    .where(and(
      eq(billingPaymentMethods.id, params.paymentMethodId),
      params.tenantId ? eq(billingPaymentMethods.tenantId, params.tenantId) : isNull(billingPaymentMethods.tenantId),
    ))
    .limit(1);

  if (!method) {
    throw new Error("Payment method not found");
  }

  const activeSettings = await db
    .select()
    .from(subscriptionPaymentSettings)
    .where(and(
      eq(subscriptionPaymentSettings.defaultPaymentMethodId, method.id),
      eq(subscriptionPaymentSettings.autoRenewEnabled, true),
      isNull(subscriptionPaymentSettings.consentWithdrawnAt),
    ))
    .limit(1);
  const activeSubscription = await db
    .select()
    .from(billingSubscriptions)
    .where(and(
      eq(billingSubscriptions.defaultPaymentMethodId, method.id),
      eq(billingSubscriptions.autoRenewEnabled, true),
    ))
    .limit(1);

  if (activeSettings[0] || activeSubscription[0]) {
    throw new Error("Cannot revoke a payment method that is active for auto-renew");
  }

  const [updated] = await db
    .update(billingPaymentMethods)
    .set({
      status: "revoked",
      isDefault: false,
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(billingPaymentMethods.id, method.id))
    .returning();

  await createPaymentMethodAuditLog({
    paymentMethodId: updated.id,
    actorType: "admin",
    actorUserId: params.actorUserId,
    action: "payment_method_revoked",
    reason: params.reason,
    beforeJson: {
      status: method.status,
      isDefault: method.isDefault,
    },
    afterJson: {
      status: updated.status,
      isDefault: updated.isDefault,
      revokedAt: updated.revokedAt,
    },
  });

  return updated;
}
