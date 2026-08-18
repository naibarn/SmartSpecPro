import crypto from "node:crypto";
import path from "node:path";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { getDb } from "../../db";
import {
  billingEffects,
  creditPackages,
  invoiceAuditLogs,
  invoiceLineItems,
  invoices,
  paymentSlips,
  paymentAttempts,
  payments,
  promptpayAmountReservations,
  users,
} from "../../../drizzle/schema";
import { addCreditsWithinTransaction } from "../creditService";
import { storageDelete, storagePresignGet, storagePut, storageResolveUrl } from "../../storage";
import { getBillingRuntimeConfig } from "./runtimeConfig";
import { getBillingProfileForUser, getSellerProfileForTenant } from "./profiles";
import {
  calculateInvoiceTotalsFromBasePrice,
  classifyInvoiceStream,
  getActiveTaxPolicy,
  reserveNextInvoiceNumber,
} from "./invoiceDomain";
import { renderInvoiceDocument } from "./documentRendering";
import { fetchFrankfurterUsdThbRate, calculatePromptPayThb, type FrankfurterRateQuote } from "./frankfurterRateService";
import { buildPromptPayPayload, normalizePromptPayRecipient } from "./promptpayQr";

type DirectRuntime = Awaited<ReturnType<typeof getBillingRuntimeConfig>>;

function settingInt(value: string | undefined, fallback: number, min = 0, max = 10_000) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function settingNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value: number | string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid monetary value");
  return parsed.toFixed(2);
}

function bangkokDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

function sanitizeFileName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "promptpay-slip.bin";
}

function validateSlipContent(buffer: Buffer, contentType: string) {
  if (contentType === "application/pdf") return buffer.subarray(0, 4).toString("utf8") === "%PDF";
  if (contentType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (contentType === "image/webp") return buffer.subarray(0, 4).toString("utf8") === "RIFF" && buffer.subarray(8, 12).toString("utf8") === "WEBP";
  return false;
}

function directConfigError(runtime: DirectRuntime) {
  if (!runtime.PROMPTPAY_DIRECT_ENABLED) return "PROMPTPAY_DIRECT_DISABLED";
  if (!runtime.PROMPTPAY_DIRECT_RECIPIENT_ID) return "PROMPTPAY_DIRECT_NOT_CONFIGURED";
  try {
    normalizePromptPayRecipient({
      type: (runtime.PROMPTPAY_DIRECT_RECIPIENT_TYPE || "phone") as "phone" | "national_id" | "tax_id" | "ewallet",
      value: runtime.PROMPTPAY_DIRECT_RECIPIENT_ID,
    });
  } catch {
    return "PROMPTPAY_DIRECT_RECIPIENT_INVALID";
  }
  return null;
}

export async function getPromptPayDirectAvailability() {
  const runtime = await getBillingRuntimeConfig();
  return {
    enabled: Boolean(runtime.PROMPTPAY_DIRECT_ENABLED),
    configured: !directConfigError(runtime),
    displayName: runtime.PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME || null,
    recipientType: runtime.PROMPTPAY_DIRECT_RECIPIENT_TYPE || null,
  };
}

async function preparePricing(params: { priceUsd: number; runtime: DirectRuntime; now: Date; quote?: FrankfurterRateQuote }) {
  const quote = params.quote ?? await fetchFrankfurterUsdThbRate({ now: params.now });
  const sellSpreadBps = settingInt(params.runtime.PROMPTPAY_DIRECT_FX_SELL_SPREAD_BPS, 200);
  const riskBufferBps = settingInt(params.runtime.PROMPTPAY_DIRECT_FX_RISK_BUFFER_BPS, 300);
  const recipientType = (params.runtime.PROMPTPAY_DIRECT_RECIPIENT_TYPE || "phone") as "phone" | "national_id" | "tax_id" | "ewallet";
  const recipient = normalizePromptPayRecipient({
    type: recipientType,
    value: params.runtime.PROMPTPAY_DIRECT_RECIPIENT_ID,
  });
  const randomSatang = crypto.randomInt(0, 100);
  const taxRatePercent = 0;
  const pricing = calculatePromptPayThb({
    priceUsd: params.priceUsd,
    dailyRate: quote.rate,
    sellSpreadBps,
    riskBufferBps,
    taxRatePercent,
    roundingUnitThb: 1,
    randomSatang,
  });
  return {
    quote,
    recipientType,
    recipient,
    randomSatang,
    sellSpreadBps,
    riskBufferBps,
    ...pricing,
  };
}

export async function createPromptPayDirectTopup(params: {
  tenantId: string | null;
  userId: number;
  actorUserId: number;
  packageId: number;
}) {
  const runtime = await getBillingRuntimeConfig();
  const configError = directConfigError(runtime);
  if (configError) throw new Error(configError);

  const db = getDb();
  const [pkg] = await db
    .select()
    .from(creditPackages)
    .where(and(eq(creditPackages.id, params.packageId), eq(creditPackages.isActive, true)))
    .limit(1);
  if (!pkg) throw new Error("PAYMENT_PACKAGE_NOT_AVAILABLE");

  const now = new Date();
  const buyerProfile = await getBillingProfileForUser(params.userId);
  const sellerProfile = await getSellerProfileForTenant(params.tenantId);
  const invoiceStream = classifyInvoiceStream({
    country: buyerProfile?.country ?? sellerProfile?.country ?? "Thailand",
  });
  const taxPolicy = await getActiveTaxPolicy({ tenantId: params.tenantId, stream: invoiceStream, issuedAt: now });
  const quote = await fetchFrankfurterUsdThbRate({ now });
  const preview = preparePricing({ priceUsd: Number(pkg.priceUsd), runtime, now, quote });
  const pricing = await preview;
  const taxRatePercent = Number(taxPolicy?.taxRatePercent ?? 0);
  const recalculated = calculatePromptPayThb({
    priceUsd: Number(pkg.priceUsd),
    dailyRate: quote.rate,
    sellSpreadBps: pricing.sellSpreadBps,
    riskBufferBps: pricing.riskBufferBps,
    taxRatePercent,
    roundingUnitThb: 1,
    randomSatang: pricing.randomSatang,
  });
  const finalAmount = toMoney(recalculated.finalAmountThb);
  const taxAmount = toMoney(recalculated.taxAmount);
  const subtotal = toMoney(Number(finalAmount) - Number(taxAmount));
  const expiryMinutes = settingInt(runtime.PROMPTPAY_DIRECT_ORDER_EXPIRY_MINUTES, 60, 5, 7 * 24 * 60);
  const dueAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);
  const businessDateBangkok = bangkokDate(now);
  const qr = buildPromptPayPayload({
    recipientType: pricing.recipientType,
    recipientId: runtime.PROMPTPAY_DIRECT_RECIPIENT_ID,
    amountThb: finalAmount,
    accountDisplayName: runtime.PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME,
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const numbering = await reserveNextInvoiceNumber({
      tenantId: params.tenantId,
      stream: invoiceStream,
      actorUserId: params.actorUserId,
    });
    try {
      const created = await db.transaction(async (tx) => {
        const [invoice] = await tx.insert(invoices).values({
          tenantId: params.tenantId,
          invoiceNumber: numbering.invoiceNumber,
          invoiceStream,
          taxPolicyId: taxPolicy?.id ?? null,
          invoiceType: "topup",
          userId: params.userId,
          status: "payment_pending",
          currency: "THB",
          subtotal,
          taxAmount,
          totalAmount: finalAmount,
          issuedAt: now,
          dueAt,
          sellerSnapshotJson: sellerProfile,
          buyerSnapshotJson: buyerProfile,
          totalsSnapshotJson: {
            subtotal,
            taxAmount,
            totalAmount: finalAmount,
            sourceAmountUsd: toMoney(pkg.priceUsd),
            fxRate: quote.rate,
            fxRateDate: quote.rateDate,
            fxFetchedAt: quote.fetchedAt.toISOString(),
            sellSpreadBps: pricing.sellSpreadBps,
            riskBufferBps: pricing.riskBufferBps,
            effectiveRate: recalculated.effectiveRate,
            roundedBaseThb: recalculated.roundedBaseThb,
            randomSatang: pricing.randomSatang,
            taxPolicyId: taxPolicy?.id ?? null,
            invoiceStream,
          },
          defaultDocumentLanguage: "th",
        }).returning();

        const lineMetadata = {
          packageId: pkg.id,
          packageName: pkg.name,
          credits: pkg.credits,
          priceUsd: toMoney(pkg.priceUsd),
          paymentChannel: "promptpay_direct_manual",
          finalAmountThb: finalAmount,
          randomSatang: pricing.randomSatang,
          fxRate: quote.rate,
          fxRateDate: quote.rateDate,
          sellSpreadBps: pricing.sellSpreadBps,
          riskBufferBps: pricing.riskBufferBps,
        };
        await tx.insert(invoiceLineItems).values({
          invoiceId: invoice.id,
          itemType: "credit_package",
          description: pkg.description?.trim() || `${pkg.name} (${pkg.credits} credits)`,
          quantity: "1.00",
          unitPrice: subtotal,
          amount: subtotal,
          metadataJson: lineMetadata,
        });

        const [payment] = await tx.insert(payments).values({
          invoiceId: invoice.id,
          provider: "internal_manual",
          paymentChannel: "promptpay_direct_manual",
          providerPaymentType: "charge",
          status: "payment_pending",
          amount: finalAmount,
          currency: "THB",
          expectedAmount: finalAmount,
          expectedCurrency: "THB",
          expiresAt: dueAt,
          reconciliationStatus: "not_required",
          businessEffectStatus: "not_started",
          sourceAmountUsd: toMoney(pkg.priceUsd),
          sourceCurrency: "USD",
          fxRate: String(quote.rate),
          fxProvider: quote.provider,
          fxRateDate: new Date(`${quote.rateDate}T00:00:00.000Z`),
          fxFetchedAt: quote.fetchedAt,
          fxSellSpreadBps: pricing.sellSpreadBps,
          fxRiskBufferBps: pricing.riskBufferBps,
          fxEffectiveRate: String(recalculated.effectiveRate),
          roundedBaseAmountThb: toMoney(recalculated.roundedBaseThb),
          randomSatang: pricing.randomSatang,
          promptpayAmountThb: finalAmount,
          promptpayRecipientSnapshotJson: {
            type: pricing.recipientType,
            displayName: runtime.PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME,
            normalizedValue: pricing.recipient.value,
            displayValue: pricing.recipient.displayValue,
          },
          rawResponseJson: {
            paymentChannel: "promptpay_direct_manual",
            qrPayload: qr.payload,
          },
        }).returning();

        await tx.insert(promptpayAmountReservations).values({
          paymentId: payment.id,
          businessDateBangkok,
          randomSatang: pricing.randomSatang,
          state: "reserved",
        });
        await tx.insert(paymentAttempts).values({
          paymentId: payment.id,
          attemptNo: 1,
          status: "active",
          expectedAmount: finalAmount,
          expectedCurrency: "THB",
          expiresAt: dueAt,
          providerPayloadJson: { paymentChannel: "promptpay_direct_manual" },
        });
        await tx.insert(invoiceAuditLogs).values({
          invoiceId: invoice.id,
          action: "promptpay_direct_order_created",
          actorType: "user",
          actorId: params.userId,
          afterJson: {
            paymentId: payment.id,
            paymentChannel: "promptpay_direct_manual",
            finalAmountThb: finalAmount,
            randomSatang: pricing.randomSatang,
            businessDateBangkok,
            fxProvider: quote.provider,
            fxRateDate: quote.rateDate,
          },
        });
        return { invoice, payment };
      });

      await renderInvoiceDocument({
        invoiceId: created.invoice.id,
        language: "th",
        reason: "initial_issue",
        renderedByType: "system",
        renderedById: null,
      }).catch(() => {});

      return {
        invoice: created.invoice,
        payment: created.payment,
        qrPayload: qr.payload,
        amountThb: finalAmount,
        recipientDisplayName: runtime.PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME,
        rateDate: quote.rateDate,
        fetchedAt: quote.fetchedAt,
        expiresAt: dueAt,
      };
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw new Error("PROMPTPAY_SATANG_POOL_EXHAUSTED");
}

export async function getPromptPayDirectPaymentForUser(params: { paymentId?: number; invoiceId?: number; userId: number }) {
  const db = getDb();
  const conditions = [eq(payments.paymentChannel, "promptpay_direct_manual"), eq(invoices.userId, params.userId)];
  if (params.paymentId) conditions.push(eq(payments.id, params.paymentId));
  if (params.invoiceId) conditions.push(eq(invoices.id, params.invoiceId));
  const [row] = await db.select({ payment: payments, invoice: invoices })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(...conditions))
    .limit(1);
  if (!row) return null;
  const slips = await db.select().from(paymentSlips).where(eq(paymentSlips.paymentId, row.payment.id)).orderBy(desc(paymentSlips.uploadedAt));
  const [reservation] = await db.select().from(promptpayAmountReservations).where(eq(promptpayAmountReservations.paymentId, row.payment.id)).limit(1);
  return { ...row, slips, reservation };
}

export async function uploadPromptPaySlip(params: {
  paymentId: number;
  userId: number;
  fileName: string;
  contentType: string;
  base64Content: string;
  note?: string | null;
}) {
  const payment = await getPromptPayDirectPaymentForUser({ paymentId: params.paymentId, userId: params.userId });
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");
  if (!["payment_pending", "manual_review_required"].includes(payment.payment.status)) throw new Error("INVALID_PAYMENT_STATE");
  const latest = payment.slips[0];
  if (latest?.status === "submitted") throw new Error("INVALID_PAYMENT_STATE");

  const runtime = await getBillingRuntimeConfig();
  const maxBytes = settingInt(runtime.PROMPTPAY_DIRECT_SLIP_MAX_BYTES, 10 * 1024 * 1024, 1024, 25 * 1024 * 1024);
  const allowed = new Set((runtime.PROMPTPAY_DIRECT_SLIP_ALLOWED_TYPES || "application/pdf,image/png,image/jpeg,image/webp").split(",").map((value) => value.trim()).filter(Boolean));
  if (!allowed.has(params.contentType)) throw new Error("INVALID_SLIP_FILE");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(params.base64Content, "base64");
  } catch {
    throw new Error("INVALID_SLIP_FILE");
  }
  if (!buffer.length || buffer.length > maxBytes || !validateSlipContent(buffer, params.contentType)) throw new Error("INVALID_SLIP_FILE");

  const fileName = sanitizeFileName(params.fileName);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const storageKey = [
    "billing",
    "promptpay-slips",
    payment.invoice.tenantId ?? "global",
    `user-${params.userId}`,
    `payment-${params.paymentId}`,
    `${crypto.randomUUID()}-${fileName}`,
  ].join("/");
  const stored = await storagePut(storageKey, buffer, params.contentType);
  try {
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const [fresh] = await tx.select({ payment: payments, invoice: invoices })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .where(and(eq(payments.id, params.paymentId), eq(invoices.userId, params.userId), eq(payments.paymentChannel, "promptpay_direct_manual")))
        .for("update");
      if (!fresh || !["payment_pending", "manual_review_required"].includes(fresh.payment.status)) throw new Error("INVALID_PAYMENT_STATE");
      const [current] = await tx.select().from(paymentSlips).where(eq(paymentSlips.paymentId, params.paymentId)).orderBy(desc(paymentSlips.uploadedAt)).limit(1);
      if (current?.status === "submitted") throw new Error("INVALID_PAYMENT_STATE");
      const [slip] = await tx.insert(paymentSlips).values({
        paymentId: params.paymentId,
        invoiceId: fresh.invoice.id,
        userId: params.userId,
        tenantId: fresh.invoice.tenantId,
        storageKey: stored.key,
        originalFileName: fileName,
        mimeType: params.contentType,
        fileSizeBytes: buffer.byteLength,
        checksumSha256: checksum,
        status: "submitted",
        customerNote: params.note?.trim() || null,
      }).returning();
      await tx.update(payments).set({ status: "manual_review_required", updatedAt: new Date() }).where(eq(payments.id, params.paymentId));
      await tx.insert(invoiceAuditLogs).values({
        invoiceId: fresh.invoice.id,
        action: "promptpay_slip_submitted",
        actorType: "user",
        actorId: params.userId,
        afterJson: { paymentId: params.paymentId, slipId: slip.id, checksumSha256: checksum },
      });
      return slip;
    });
    return result;
  } catch (error) {
    await storageDelete(stored.key).catch(() => {});
    throw error;
  }
}

export async function resolvePromptPaySlipAccess(params: { slipId: number; actorUserId: number; isAdmin: boolean; tenantId?: string | null; ttlSeconds?: number }) {
  const db = getDb();
  const [row] = await db.select({ slip: paymentSlips, payment: payments, invoice: invoices })
    .from(paymentSlips)
    .innerJoin(payments, eq(payments.id, paymentSlips.paymentId))
    .innerJoin(invoices, eq(invoices.id, paymentSlips.invoiceId))
    .where(and(eq(paymentSlips.id, params.slipId), params.tenantId ? eq(invoices.tenantId, params.tenantId) : sql`true`))
    .limit(1);
  if (!row || (!params.isAdmin && row.slip.userId !== params.actorUserId)) return null;
  const signed = await storagePresignGet(row.slip.storageKey, params.ttlSeconds ?? (params.isAdmin ? 3600 : 600));
  return signed ?? { url: await storageResolveUrl(row.slip.storageKey), key: row.slip.storageKey };
}

export async function listPromptPayReviewQueue(params: { tenantId: string | null; query?: string | null; limit?: number }) {
  const db = getDb();
  const query = params.query?.trim();
  const filters = [eq(payments.paymentChannel, "promptpay_direct_manual"), eq(payments.status, "manual_review_required")];
  if (params.tenantId) filters.push(eq(invoices.tenantId, params.tenantId));
  if (query) filters.push(or(ilike(users.email, `%${query}%`), ilike(invoices.invoiceNumber, `%${query}%`))!);
  return db.select({ payment: payments, invoice: invoices, user: users })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(users, eq(users.id, invoices.userId))
    .where(and(...filters))
    .orderBy(desc(payments.updatedAt))
    .limit(params.limit ?? 100);
}

export async function getPromptPayReview(params: { paymentId: number; tenantId: string | null }) {
  const db = getDb();
  const [row] = await db.select({ payment: payments, invoice: invoices, user: users })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(users, eq(users.id, invoices.userId))
    .where(and(eq(payments.id, params.paymentId), eq(payments.paymentChannel, "promptpay_direct_manual"), params.tenantId ? eq(invoices.tenantId, params.tenantId) : sql`true`))
    .limit(1);
  if (!row) return null;
  const slips = await db.select().from(paymentSlips).where(eq(paymentSlips.paymentId, params.paymentId)).orderBy(desc(paymentSlips.uploadedAt));
  const [reservation] = await db.select().from(promptpayAmountReservations).where(eq(promptpayAmountReservations.paymentId, params.paymentId)).limit(1);
  const [effect] = await db.select().from(billingEffects).where(eq(billingEffects.invoiceId, row.invoice.id)).limit(1);
  return { ...row, slips, reservation, effect };
}

export async function rejectPromptPayPayment(params: { paymentId: number; actorUserId: number; reason: string; tenantId: string | null }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ payment: payments, invoice: invoices })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.id, params.paymentId), eq(payments.paymentChannel, "promptpay_direct_manual"), params.tenantId ? eq(invoices.tenantId, params.tenantId) : sql`true`))
      .for("update");
    if (!row) throw new Error("PAYMENT_NOT_FOUND");
    const [slip] = await tx.select().from(paymentSlips).where(and(eq(paymentSlips.paymentId, params.paymentId), eq(paymentSlips.status, "submitted"))).orderBy(desc(paymentSlips.uploadedAt)).limit(1);
    if (!slip) throw new Error("INVALID_PAYMENT_STATE");
    await tx.update(paymentSlips).set({ status: "rejected", rejectionReason: params.reason.trim(), reviewedAt: new Date(), reviewedBy: params.actorUserId, updatedAt: new Date() }).where(eq(paymentSlips.id, slip.id));
    await tx.update(payments).set({ status: "payment_pending", updatedAt: new Date() }).where(eq(payments.id, params.paymentId));
    await tx.insert(invoiceAuditLogs).values({ invoiceId: row.invoice.id, action: "promptpay_slip_rejected", actorType: "admin", actorId: params.actorUserId, reason: params.reason.trim(), afterJson: { paymentId: params.paymentId, slipId: slip.id } });
    return { paymentId: params.paymentId, status: "payment_pending", slipId: slip.id };
  });
}

export async function approvePromptPayPayment(params: {
  paymentId: number;
  actorUserId: number;
  tenantId: string | null;
  allowSelfApproval?: boolean;
}) {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select({ payment: payments, invoice: invoices })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.id, params.paymentId), eq(payments.paymentChannel, "promptpay_direct_manual"), params.tenantId ? eq(invoices.tenantId, params.tenantId) : sql`true`))
      .for("update");
    if (!row) throw new Error("PAYMENT_NOT_FOUND");
    if (!params.allowSelfApproval && row.invoice.userId === params.actorUserId) {
      throw new Error("PAYMENT_APPROVAL_NOT_ALLOWED");
    }
    if (row.payment.status === "paid" && row.payment.businessEffectStatus === "applied") return { invoice: row.invoice, payment: row.payment, alreadyApplied: true };
    if (row.payment.status !== "manual_review_required") throw new Error("INVALID_PAYMENT_STATE");
    const [slip] = await tx.select().from(paymentSlips).where(and(eq(paymentSlips.paymentId, params.paymentId), eq(paymentSlips.status, "submitted"))).orderBy(desc(paymentSlips.uploadedAt)).limit(1);
    if (!slip) throw new Error("SLIP_REQUIRED");
    const [reservation] = await tx.select().from(promptpayAmountReservations).where(eq(promptpayAmountReservations.paymentId, params.paymentId)).for("update");
    if (!reservation || reservation.state !== "reserved") throw new Error("INVALID_PAYMENT_STATE");
    const [effect] = await tx.insert(billingEffects).values({
      effectKey: `grant_credits:invoice:${row.invoice.id}`,
      effectType: "grant_credits",
      invoiceId: row.invoice.id,
      paymentId: row.payment.id,
      metadataJson: { channel: "promptpay_direct_manual", slipId: slip.id },
    }).onConflictDoNothing().returning({ id: billingEffects.id });
    if (!effect) {
      throw new Error("CREDIT_GRANT_CONFLICT");
    }
    const [lineItem] = await tx.select({ metadataJson: invoiceLineItems.metadataJson }).from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, row.invoice.id)).limit(1);
    const credits = Number(lineItem?.metadataJson?.credits ?? 0);
    if (!Number.isInteger(credits) || credits <= 0) throw new Error("CREDIT_GRANT_CONFLICT");
    const grant = await addCreditsWithinTransaction(tx, {
      userId: row.invoice.userId,
      amount: credits,
      type: "purchase",
      description: `Top-up credits from invoice ${row.invoice.invoiceNumber ?? row.invoice.id}`,
      referenceId: String(row.invoice.id),
      idempotencyKey: `credit_purchase:invoice:${row.invoice.id}`,
      metadata: { invoiceId: row.invoice.id, paymentId: row.payment.id, paymentChannel: "promptpay_direct_manual", slipId: slip.id },
      sourceType: "admin",
    });
    const now = new Date();
    await tx.update(paymentSlips).set({ status: "accepted", reviewedAt: now, reviewedBy: params.actorUserId, updatedAt: now }).where(eq(paymentSlips.id, slip.id));
    await tx.update(promptpayAmountReservations).set({ state: "consumed", consumedAt: now, updatedAt: now }).where(eq(promptpayAmountReservations.id, reservation.id));
    await tx.update(payments).set({ status: "paid", paidAt: now, settledAmount: row.payment.expectedAmount, settledCurrency: "THB", amountMatchStatus: "matched", reconciliationStatus: "not_required", businessEffectStatus: "applied", updatedAt: now }).where(eq(payments.id, row.payment.id));
    await tx.update(paymentAttempts).set({ status: "paid", settledAmount: row.payment.expectedAmount, settledCurrency: "THB", providerPayloadJson: { approvedBy: params.actorUserId, slipId: slip.id } }).where(eq(paymentAttempts.paymentId, row.payment.id));
    await tx.update(invoices).set({ status: "paid", paidAt: now, updatedAt: now }).where(eq(invoices.id, row.invoice.id));
    await tx.insert(invoiceAuditLogs).values({ invoiceId: row.invoice.id, action: "promptpay_payment_approved", actorType: "admin", actorId: params.actorUserId, afterJson: { paymentId: row.payment.id, slipId: slip.id, credits, transactionId: grant.transactionId } });
    return { invoice: { ...row.invoice, status: "paid", paidAt: now }, payment: { ...row.payment, status: "paid", businessEffectStatus: "applied", paidAt: now }, alreadyApplied: false };
  });
  if (!result.alreadyApplied) {
    await renderInvoiceDocument({ invoiceId: result.invoice.id, language: "th", reason: "manual_regeneration", renderedByType: "admin", renderedById: params.actorUserId }).catch(() => {});
  }
  return result;
}

export async function releasePromptPayReservationForPayment(paymentId: number, state: "released" = "released") {
  const db = getDb();
  await db.update(promptpayAmountReservations).set({ state, releasedAt: new Date(), updatedAt: new Date() }).where(and(eq(promptpayAmountReservations.paymentId, paymentId), eq(promptpayAmountReservations.state, "reserved")));
}
