import { and, eq } from "drizzle-orm";

import { getDb } from "../../db";
import {
  invoices,
  notificationDispatches,
  type InsertNotificationDispatch,
} from "../../../drizzle/schema";
import { createNotification } from "../notificationService";
import { getCurrentRenewalAttemptForInvoice } from "./autoRenew";
import { sendBillingNotificationEmail } from "./emailDelivery";
import { getBillingRuntimeConfig } from "./runtimeConfig";

export type BillingNotificationType =
  | "invoice_issued"
  | "qr_ready"
  | "payment_success"
  | "invoice_due_reminder"
  | "invoice_overdue_downgraded"
  | "invoice_reissued";

function buildDedupeKey(notificationType: BillingNotificationType, invoiceId: number, variant?: string | null) {
  return `${notificationType}:invoice:${invoiceId}${variant ? `:${variant}` : ""}`;
}

function buildNotificationContent(params: {
  notificationType: BillingNotificationType;
  invoiceNumber: string | null;
  invoiceStatus: string;
}) {
  const invoiceLabel = params.invoiceNumber ?? `#${params.invoiceStatus}`;
  switch (params.notificationType) {
    case "invoice_issued":
      return {
        title: "New invoice issued",
        content: `Invoice ${invoiceLabel} is ready for payment.`,
        priority: "normal" as const,
      };
    case "qr_ready":
      return {
        title: "QR payment is ready",
        content: `PromptPay QR for invoice ${invoiceLabel} is available.`,
        priority: "normal" as const,
      };
    case "payment_success":
      return {
        title: "Payment received",
        content: `Invoice ${invoiceLabel} has been paid successfully.`,
        priority: "high" as const,
      };
    case "invoice_due_reminder":
      return {
        title: "Invoice due reminder",
        content: `Invoice ${invoiceLabel} is still awaiting payment.`,
        priority: "high" as const,
      };
    case "invoice_overdue_downgraded":
      return {
        title: "Subscription downgraded",
        content: `Invoice ${invoiceLabel} was overdue and the account was moved to the free plan.`,
        priority: "critical" as const,
      };
    case "invoice_reissued":
      return {
        title: "Invoice reissued",
        content: `A replacement document for invoice ${invoiceLabel} is now available.`,
        priority: "normal" as const,
      };
  }
}

function shouldSuppressForInvoiceStatus(notificationType: BillingNotificationType, invoiceStatus: string) {
  if (notificationType === "invoice_due_reminder") {
    return ["paid", "canceled", "canceled_overdue", "replaced"].includes(invoiceStatus);
  }
  if (notificationType === "qr_ready") {
    return !["issued", "payment_pending"].includes(invoiceStatus);
  }
  return false;
}

function getNotificationCooldownMs(notificationType: BillingNotificationType) {
  return getBillingRuntimeConfig().then((runtime) => {
    const reminderHours = Number.parseInt(runtime.BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS ?? "12", 10);
    const successHours = Number.parseInt(runtime.BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS ?? "24", 10);
    const defaultHours = Number.parseInt(runtime.BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS ?? "1", 10);
    switch (notificationType) {
      case "invoice_due_reminder":
        return (Number.isFinite(reminderHours) ? reminderHours : 12) * 60 * 60 * 1000;
      case "invoice_overdue_downgraded":
      case "payment_success":
        return (Number.isFinite(successHours) ? successHours : 24) * 60 * 60 * 1000;
      default:
        return (Number.isFinite(defaultHours) ? defaultHours : 1) * 60 * 60 * 1000;
    }
  });
}

function getNotificationRateLimitConfig(notificationType: BillingNotificationType) {
  switch (notificationType) {
    case "invoice_due_reminder":
      return {
        userWindowMs: 24 * 60 * 60 * 1000,
        userMax: 3,
        invoiceWindowMs: 7 * 24 * 60 * 60 * 1000,
        invoiceMax: 2,
        systemWindowMs: 60 * 60 * 1000,
        systemMax: 500,
      };
    case "invoice_overdue_downgraded":
    case "payment_success":
      return {
        userWindowMs: 24 * 60 * 60 * 1000,
        userMax: 2,
        invoiceWindowMs: 7 * 24 * 60 * 60 * 1000,
        invoiceMax: 2,
        systemWindowMs: 60 * 60 * 1000,
        systemMax: 500,
      };
    default:
      return {
        userWindowMs: 24 * 60 * 60 * 1000,
        userMax: 5,
        invoiceWindowMs: 24 * 60 * 60 * 1000,
        invoiceMax: 3,
        systemWindowMs: 60 * 60 * 1000,
        systemMax: 1000,
      };
  }
}

function countDispatchesWithinWindow(
  rows: Array<{ sentAt: Date | null; channel: string; userId: number | null; invoiceId: number | null }>,
  windowMs: number,
  nowMs: number,
  matcher: (row: { sentAt: Date | null; channel: string; userId: number | null; invoiceId: number | null }) => boolean,
) {
  return rows.filter((row) => {
    if (!row.sentAt) return false;
    if (!matcher(row)) return false;
    return nowMs - new Date(row.sentAt).getTime() < windowMs;
  }).length;
}

export async function shouldSendNotification(dedupeKey: string) {
  const db = getDb();
  const [existing] = await db
    .select({ id: notificationDispatches.id })
    .from(notificationDispatches)
    .where(eq(notificationDispatches.dedupeKey, dedupeKey))
    .limit(1);
  return !existing;
}

export async function sendInvoiceNotification(params: {
  invoiceId: number;
  notificationType: BillingNotificationType;
  actorUserId?: number | null;
  variant?: string | null;
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

  const dedupeBase = buildDedupeKey(params.notificationType, invoice.id, params.variant);
  const renewalAttempt = await getCurrentRenewalAttemptForInvoice(invoice.id).catch(() => null);
  const runtime = await getBillingRuntimeConfig();
  const suppressed = shouldSuppressForInvoiceStatus(params.notificationType, invoice.status);
  const insertedDispatches: Array<{ channel: string; id: number; status: string }> = [];
  const nowMs = Date.now();
  const rateLimit = getNotificationRateLimitConfig(params.notificationType);
  const recentDispatchRows = await db
    .select()
    .from(notificationDispatches)
    .where(
      and(
        eq(notificationDispatches.invoiceId, invoice.id),
        eq(notificationDispatches.notificationType, params.notificationType),
      ),
    )
    .limit(20);

  for (const channel of ["in_app", "email"] as const) {
    const dedupeKey = `${dedupeBase}:${channel}`;
    const cooldownMs = await getNotificationCooldownMs(params.notificationType);
    const cooldownHit = recentDispatchRows.some((dispatch) => {
      if (dispatch.channel !== channel) return false;
      if (!dispatch.sentAt) return false;
      return nowMs - new Date(dispatch.sentAt).getTime() < cooldownMs;
    });
    const rateLimitHit = countDispatchesWithinWindow(recentDispatchRows, rateLimit.userWindowMs, nowMs, (dispatch) => (
      dispatch.channel === channel && dispatch.userId === invoice.userId
    )) >= rateLimit.userMax
      || countDispatchesWithinWindow(recentDispatchRows, rateLimit.invoiceWindowMs, nowMs, (dispatch) => (
        dispatch.channel === channel && dispatch.invoiceId === invoice.id
      )) >= rateLimit.invoiceMax
      || countDispatchesWithinWindow(recentDispatchRows, rateLimit.systemWindowMs, nowMs, (dispatch) => (
        dispatch.channel === channel
      )) >= rateLimit.systemMax;
    const payload: InsertNotificationDispatch = {
      userId: invoice.userId,
      invoiceId: invoice.id,
      renewalAttemptId: renewalAttempt?.id ?? null,
      notificationType: params.notificationType,
      channel,
      dedupeKey,
      status: suppressed
        ? "suppressed"
        : cooldownHit
          ? "suppressed"
        : rateLimitHit
          ? "suppressed"
        : channel === "email" && !runtime.BILLING_EMAIL_NOTIFICATIONS_ENABLED
          ? "suppressed"
          : "pending",
      sentAt: suppressed ? null : undefined,
      suppressedReason: suppressed
        ? `invoice_status_${invoice.status}`
        : cooldownHit
          ? "cooldown_active"
        : rateLimitHit
          ? "rate_limit_active"
        : channel === "email" && !runtime.BILLING_EMAIL_NOTIFICATIONS_ENABLED
          ? "email_delivery_not_enabled"
          : null,
      metadataJson: {
        actorUserId: params.actorUserId ?? null,
        renewalAttemptId: renewalAttempt?.id ?? null,
      },
    };

    const inserted = await db
      .insert(notificationDispatches)
      .values(payload)
      .onConflictDoNothing()
      .returning({ id: notificationDispatches.id, channel: notificationDispatches.channel });
    if (inserted[0]) {
      insertedDispatches.push({
        ...inserted[0],
        status: payload.status,
      });
    }
  }

  if (insertedDispatches.length === 0) {
    return { sent: false, reason: "duplicate_dispatch" as const };
  }

  const message = buildNotificationContent({
    notificationType: params.notificationType,
    invoiceNumber: invoice.invoiceNumber,
    invoiceStatus: invoice.status,
  });

  const shouldSendInApp = insertedDispatches.some((dispatch) => dispatch.channel === "in_app" && dispatch.status === "pending");
  if (shouldSendInApp && !suppressed) {
    await createNotification({
      db,
      userId: invoice.userId,
      type: "system",
      title: message.title,
      content: message.content,
      priority: message.priority,
      relatedResourceType: "scheduled_message",
      relatedResourceId: String(invoice.id),
      actionUrl: `/billing/invoices/${invoice.id}`,
      metadata: {
        source: "billing",
        relatedItems: {
          invoiceId: String(invoice.id),
          invoiceNumber: invoice.invoiceNumber ?? "",
          notificationType: params.notificationType,
        },
      },
      groupKey: dedupeBase,
    });
  }

  const shouldSendEmail = insertedDispatches.some((dispatch) => dispatch.channel === "email" && dispatch.status === "pending");
  if (shouldSendEmail && !suppressed && runtime.BILLING_EMAIL_NOTIFICATIONS_ENABLED) {
    await sendBillingNotificationEmail({
      invoiceId: invoice.id,
      notificationType: params.notificationType,
    }).catch(() => false);
  }

  const sentAt = new Date();
  for (const dispatch of insertedDispatches) {
    if (dispatch.status !== "pending") {
      continue;
    }
    await db
      .update(notificationDispatches)
      .set({
        status: "sent",
        sentAt,
      })
      .where(eq(notificationDispatches.id, dispatch.id));
  }

  const delivered = shouldSendInApp || shouldSendEmail;
  return { sent: delivered, reason: delivered ? "sent" as const : "suppressed" as const };
}

export async function listInvoiceNotificationDispatches(invoiceId: number) {
  const db = getDb();
  return db
    .select()
    .from(notificationDispatches)
    .where(eq(notificationDispatches.invoiceId, invoiceId));
}
