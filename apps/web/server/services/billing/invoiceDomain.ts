import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";

import {
  documentNumberSequences,
  invoiceLineItems,
  taxPolicies,
  type InsertDocumentNumberSequence,
} from "../../../drizzle/schema";
import { getDb } from "../../db";

export interface InvoiceStreamClassificationInput {
  country?: string | null;
  adminOverrideStream?: "domestic" | "international" | null;
}

export interface InvoiceLineItemInput {
  quantity: number;
  unitPrice: number;
  amount?: number;
}

export interface InvoiceTotalsResult {
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  taxRatePercent: string;
  roundingPolicy: string;
}

function normalizeCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const trimmed = country.trim().toLowerCase();
  return trimmed || null;
}

function roundTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function classifyInvoiceStream(input: InvoiceStreamClassificationInput): "domestic" | "international" {
  if (input.adminOverrideStream) {
    return input.adminOverrideStream;
  }

  const country = normalizeCountry(input.country);
  if (country === "th" || country === "thailand" || country === "ประเทศไทย") {
    return "domestic";
  }

  return "international";
}

export async function getActiveTaxPolicy(params: {
  stream: "domestic" | "international";
  issuedAt: Date;
  tenantId?: string | null;
}) {
  const db = getDb();
  try {
    const result = params.tenantId
      ? await db.execute(sql`
          select *
          from "tax_policies"
          where "stream" = ${params.stream}
            and "isEnabled" = true
            and "effectiveFrom" <= ${params.issuedAt}
            and ("tenantId" = ${params.tenantId} or "tenantId" is null)
          order by "effectiveFrom" desc
          limit 10
        `)
      : await db.execute(sql`
          select *
          from "tax_policies"
          where "stream" = ${params.stream}
            and "isEnabled" = true
            and "effectiveFrom" <= ${params.issuedAt}
            and "tenantId" is null
          order by "effectiveFrom" desc
          limit 10
        `);

    const row = Array.isArray(result.rows) ? (result.rows[0] as Record<string, any> | undefined) : undefined;
    if (!row) return null;

    return {
      id: row.id ?? null,
      tenantId: row.tenantId ?? row.tenant_id ?? params.tenantId ?? null,
      stream: row.stream ?? params.stream,
      taxName: row.taxName ?? row.tax_name ?? "VAT",
      taxRatePercent: String(row.taxRatePercent ?? row.tax_rate_percent ?? "0"),
      isEnabled: row.isEnabled ?? row.is_enabled ?? true,
      effectiveFrom: row.effectiveFrom ?? row.effective_from ?? params.issuedAt,
      effectiveTo: row.effectiveTo ?? row.effective_to ?? null,
      roundingPolicy: row.roundingPolicy ?? row.rounding_policy ?? "half_up_2dp",
      createdBy: row.createdBy ?? row.created_by ?? null,
      createdAt: row.createdAt ?? row.created_at ?? null,
      updatedAt: row.updatedAt ?? row.updated_at ?? null,
    };
  } catch {
    return null;
  }
}

export function calculateInvoiceTotalsFromBasePrice(params: {
  lineItems: InvoiceLineItemInput[];
  taxRatePercent: number;
  roundingPolicy?: string | null;
}): InvoiceTotalsResult {
  const subtotalValue = roundTwo(
    params.lineItems.reduce((sum, line) => {
      const lineAmount = typeof line.amount === "number" ? line.amount : line.quantity * line.unitPrice;
      return sum + lineAmount;
    }, 0),
  );
  const taxAmountValue = roundTwo(subtotalValue * (params.taxRatePercent / 100));
  const totalAmountValue = roundTwo(subtotalValue + taxAmountValue);

  return {
    subtotal: subtotalValue.toFixed(2),
    taxAmount: taxAmountValue.toFixed(2),
    totalAmount: totalAmountValue.toFixed(2),
    taxRatePercent: params.taxRatePercent.toFixed(4),
    roundingPolicy: params.roundingPolicy?.trim() || "half_up_2dp",
  };
}

export async function previewInvoiceNumber(params: {
  stream: "domestic" | "international";
  tenantId?: string | null;
  documentType?: string;
  year?: number;
}) {
  const db = getDb();
  const year = params.year ?? new Date().getUTCFullYear();
  const documentType = params.documentType ?? "invoice";
  const scope = params.tenantId
    ? and(eq(documentNumberSequences.tenantId, params.tenantId), eq(documentNumberSequences.stream, params.stream))
    : and(isNull(documentNumberSequences.tenantId), eq(documentNumberSequences.stream, params.stream));

  const [sequence] = await db
    .select()
    .from(documentNumberSequences)
    .where(and(scope, eq(documentNumberSequences.documentType, documentType), eq(documentNumberSequences.isActive, true)))
    .limit(1);

  if (!sequence) {
    return null;
  }

  const nextRunningNo = (sequence.currentRunningNo ?? 0) + 1;
  return formatInvoiceNumber(sequence.prefix, year, nextRunningNo);
}

export async function reserveNextInvoiceNumber(params: {
  stream: "domestic" | "international";
  tenantId?: string | null;
  actorUserId?: number | null;
  documentType?: string;
  year?: number;
}) {
  const db = getDb();
  const documentType = params.documentType ?? "invoice";
  const year = params.year ?? new Date().getUTCFullYear();

  return db.transaction(async (tx) => {
    const scope = params.tenantId
      ? and(eq(documentNumberSequences.tenantId, params.tenantId), eq(documentNumberSequences.stream, params.stream))
      : and(isNull(documentNumberSequences.tenantId), eq(documentNumberSequences.stream, params.stream));

    const [existing] = await tx
      .select()
      .from(documentNumberSequences)
      .where(and(scope, eq(documentNumberSequences.documentType, documentType), eq(documentNumberSequences.isActive, true)))
      .limit(1);

    let sequence = existing;
    if (!sequence) {
      const defaultPrefix = params.stream === "domestic" ? "TH-INV" : "INT-INV";
      const [created] = await tx
        .insert(documentNumberSequences)
        .values({
          tenantId: params.tenantId ?? null,
          stream: params.stream,
          documentType,
          prefix: defaultPrefix,
          yearMode: "gregorian",
          currentRunningNo: 0,
          isActive: true,
          updatedBy: params.actorUserId ?? null,
        } satisfies InsertDocumentNumberSequence)
        .returning();
      sequence = created;
    }

    const nextRunningNo = (sequence.currentRunningNo ?? 0) + 1;
    const [updated] = await tx
      .update(documentNumberSequences)
      .set({
        currentRunningNo: nextRunningNo,
        updatedBy: params.actorUserId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(documentNumberSequences.id, sequence.id))
      .returning();

    return {
      sequenceId: updated.id,
      invoiceNumber: formatInvoiceNumber(updated.prefix, year, nextRunningNo),
      runningNo: nextRunningNo,
    };
  });
}

export function formatInvoiceNumber(prefix: string, year: number, runningNo: number): string {
  return `${prefix}-${year}-${String(runningNo).padStart(6, "0")}`;
}

export async function loadInvoiceLineItems(invoiceId: number) {
  const db = getDb();
  return db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(sql`${invoiceLineItems.id} asc`);
}
