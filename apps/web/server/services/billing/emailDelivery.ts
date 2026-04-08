import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import { invoiceDocuments, invoices, users } from "../../../drizzle/schema";
import { createTransporter, getSmtpConfig } from "../emailService";
import { resolveInvoiceDocumentAccess } from "./documentAccess";
import { getBillingRuntimeConfig } from "./runtimeConfig";

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildBillingEmailCopy(params: {
  type: string;
  invoiceNumber: string | null;
  actionUrl: string;
  documentUrl?: string | null;
}) {
  const invoiceLabel = params.invoiceNumber ?? "your invoice";
  switch (params.type) {
    case "payment_success":
      return {
        subject: `Payment received for ${invoiceLabel}`,
        heading: "Payment received",
        body: `We received payment for ${invoiceLabel}. You can review the latest invoice document below.`,
      };
    case "qr_ready":
      return {
        subject: `PromptPay QR ready for ${invoiceLabel}`,
        heading: "QR payment is ready",
        body: `Your payment QR for ${invoiceLabel} is ready. Open the invoice page to continue payment.`,
      };
    case "invoice_due_reminder":
      return {
        subject: `Reminder: ${invoiceLabel} is awaiting payment`,
        heading: "Invoice due reminder",
        body: `This is a reminder that ${invoiceLabel} is still awaiting payment.`,
      };
    case "invoice_overdue_downgraded":
      return {
        subject: `Subscription downgraded due to overdue invoice`,
        heading: "Subscription downgraded",
        body: `The related subscription was downgraded because ${invoiceLabel} remained unpaid past the grace period.`,
      };
    case "invoice_reissued":
      return {
        subject: `Updated invoice document for ${invoiceLabel}`,
        heading: "Invoice reissued",
        body: `A refreshed invoice document is now available for ${invoiceLabel}.`,
      };
    default:
      return {
        subject: `Invoice available: ${invoiceLabel}`,
        heading: "Invoice available",
        body: `A new invoice document is ready for ${invoiceLabel}.`,
      };
  }
}

export async function sendBillingNotificationEmail(params: {
  invoiceId: number;
  notificationType: string;
}) {
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, params.invoiceId))
    .limit(1);
  if (!invoice) return false;

  const [user] = await db
    .select({
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, invoice.userId))
    .limit(1);
  if (!user?.email) return false;

  const config = await getSmtpConfig();
  const transporter = await createTransporter();
  if (!config || !transporter) return false;
  const runtime = await getBillingRuntimeConfig();

  const actionUrl = `${runtime.BILLING_PUBLIC_URL}/billing/invoices/${invoice.id}`;
  const [latestDoc] = await db
    .select()
    .from(invoiceDocuments)
    .where(eq(invoiceDocuments.invoiceId, invoice.id))
    .limit(1);
  const docAccess = latestDoc
    ? await resolveInvoiceDocumentAccess({
        invoiceId: invoice.id,
        documentId: latestDoc.id,
        ttlSeconds: 3600,
      })
    : null;
  const copy = buildBillingEmailCopy({
    type: params.notificationType,
    invoiceNumber: invoice.invoiceNumber,
    actionUrl,
    documentUrl: docAccess?.url ?? null,
  });

  const documentLink = docAccess?.url
    ? `<p><a href="${escapeHtml(docAccess.url)}" style="color:#2563eb;">Download latest invoice PDF</a></p>`
    : "";
  const html = `
<!doctype html>
<html>
<body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827;">
  <h2>${escapeHtml(copy.heading)}</h2>
  <p>Hello ${escapeHtml(user.name || "there")},</p>
  <p>${escapeHtml(copy.body)}</p>
  <p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Open invoice</a></p>
  ${documentLink}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
  <p style="font-size:12px;color:#6b7280;">SmartAIHub billing</p>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: user.email,
      subject: copy.subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("[BillingEmail] Send failed", error);
    return false;
  }
}
