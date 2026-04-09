import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../db";
import {
  conversations,
  documentExtractions,
  financeDrafts,
  financeRecurringRules,
  financeTransactionDocuments,
  financeTransactions,
  libraryItems,
  type Conversation,
  type FinanceDraft,
  type InsertFinanceDraft,
  type InsertFinanceRecurringRule,
  type FinanceRecurringRule,
  type FinanceTransaction,
} from "../../drizzle/schema";
import {
  financeDocumentRoleSchema,
  financeMonthlySummarySchema,
  financeStructuredDraftSchema,
  financeTransactionStatusSchema,
  financeTransactionTypeSchema,
  type FinanceStructuredDraft,
  type FinanceMonthlySummary,
} from "../../shared/finance";
import { callLLMStructured } from "./callLLMStructured";
import { getConversationById, isPersonalProjectId } from "./chatService";
import { resolveTenantIdVarchar } from "./tenantContext";
import { auditLogger } from "./auditLogger";

const personalScopeToken = (userId: number) => `user:${userId}`;

const draftPatchSchema = financeStructuredDraftSchema
  .partial()
  .omit({
    sourceMessageId: true,
    sourceLibraryItemId: true,
    recurringRuleId: true,
  })
  .extend({
    clarificationPrompt: z.string().nullable().optional(),
  })
  .strict();

const recurringScheduleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365).default(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  month: z.number().int().min(1).max(12).optional(),
});

const transactionListFiltersSchema = z.object({
  status: financeTransactionStatusSchema.optional(),
  categoryCode: z.string().min(1).max(64).optional(),
  merchant: z.string().min(1).max(255).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export interface FinanceScope {
  tenantId: string;
  ownerUserId: number;
  projectId: string;
  conversationId: number;
  personal: boolean;
  allowedScopes: string[];
}

export interface FinanceDraftRecord extends Omit<FinanceDraft, "payloadJson" | "allowedScopes"> {
  payloadJson: Record<string, unknown> & { version?: number };
  allowedScopes: string[];
  version: number;
}

export interface FinanceSummaryResult extends FinanceMonthlySummary {
  granularity: "day" | "month";
}

export interface FinanceLinkedDocumentRecord {
  id: number;
  transactionId: number;
  libraryItemId: number;
  role: string;
  note: string | null;
  sourceExtractionId: number | null;
  createdAt: Date;
  updatedAt: Date;
  libraryItem: {
    id: number;
    title: string;
    source: string;
    metadata: Record<string, unknown>;
    projectId: string | null;
  } | null;
  extraction: {
    id: number;
    ocrProvider: string;
    mimeType: string;
    fileHash: string;
    pageCount: number;
  } | null;
}

export interface ParseTextToDraftInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  text: string;
  sourceMessageId?: number | null;
  model?: string;
  idempotencyKey?: string;
}

export interface ParseDocumentToDraftInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  documentExtractionId: number;
  idempotencyKey?: string;
}

export interface UpdateDraftInput {
  draftId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
  expectedVersion: number;
  patch: z.infer<typeof draftPatchSchema>;
}

export interface ConfirmDraftInput {
  draftId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
}

export interface VoidTransactionInput {
  transactionId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
  reason?: string | null;
}

export interface ListTransactionsInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  status?: FinanceTransaction["status"] | null;
  categoryCode?: string;
  merchant?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface CreateRecurringRuleInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  type: FinanceTransaction["type"];
  amountMinor: number;
  currency?: string;
  categoryCode: string;
  merchantName?: string | null;
  note?: string | null;
  rrule: z.infer<typeof recurringScheduleSchema> | string;
  timezone?: string;
  startDate?: Date;
  endDate?: Date | null;
  autoConfirm?: boolean;
  sourceMessageId?: number | null;
  sourceLibraryItemId?: number | null;
  idempotencyKey?: string;
}

export interface PauseRecurringRuleInput {
  recurringRuleId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
}

export interface ResumeRecurringRuleInput {
  recurringRuleId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
}

export interface ListLinkedDocumentsInput {
  transactionId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
}

export interface RunRecurringRulesResult {
  scannedCount: number;
  draftsCreated: number;
  transactionsCreated: number;
  errors: number;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function ensureDb(db: Awaited<ReturnType<typeof getDb>> | null | undefined): asserts db is NonNullable<Awaited<ReturnType<typeof getDb>>> {
  if (!db) {
    throw new Error("Database not available");
  }
}

function getTimeZoneParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday ?? "Sun"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function timeZonePartsToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const candidate = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    0,
  );

  let utc = candidate;
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utc), timeZone);
    const next = candidate - offset;
    if (next === utc) {
      break;
    }
    utc = next;
  }
  return new Date(utc);
}

function startOfDayInTimeZone(date: Date, timeZone: string): Date {
  const parts = getTimeZoneParts(date, timeZone);
  return timeZonePartsToUtc({ year: parts.year, month: parts.month, day: parts.day }, timeZone);
}

function startOfMonthInTimeZone(date: Date, timeZone: string): Date {
  const parts = getTimeZoneParts(date, timeZone);
  return timeZonePartsToUtc({ year: parts.year, month: parts.month, day: 1 }, timeZone);
}

function startOfNextMonthInTimeZone(date: Date, timeZone: string): Date {
  const parts = getTimeZoneParts(date, timeZone);
  let year = parts.year;
  let month = parts.month + 1;
  if (month > 12) {
    year += 1;
    month = 1;
  }
  return timeZonePartsToUtc({ year, month, day: 1 }, timeZone);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildClarificationPrompt(missingFields: string[]): string | null {
  if (missingFields.length === 0) {
    return null;
  }
  return `Please confirm: ${missingFields.join(", ")}.`;
}

function buildAllowedScopes(userId: number): string[] {
  return [personalScopeToken(userId)];
}

function buildScopeFromConversation(conversation: Conversation, userId: number, ctxTenantId?: string | null): FinanceScope {
  const conversationTenantId = conversation.tenantId ?? null;
  const resolvedTenantId = resolveTenantIdVarchar(ctxTenantId ?? conversationTenantId, conversationTenantId);
  if (!resolvedTenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for finance operations",
    });
  }

  if (conversationTenantId && resolvedTenantId !== String(conversationTenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Conversation tenant does not match finance request tenant",
    });
  }

  if (!conversation.projectId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Finance operations require a conversation with a project scope",
    });
  }

  return {
    tenantId: resolvedTenantId,
    ownerUserId: userId,
    projectId: conversation.projectId,
    conversationId: conversation.id,
    personal: isPersonalProjectId(conversation.projectId),
    allowedScopes: buildAllowedScopes(userId),
  };
}

async function resolveScopeFromConversation(params: {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
}): Promise<FinanceScope> {
  const conversation = await getConversationById(params.conversationId, params.userId);
  if (!conversation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found",
    });
  }
  return buildScopeFromConversation(conversation, params.userId, params.tenantId);
}

function computeBaseSourceHash(parts: Array<string | number | null | undefined>): string {
  return sha256(parts.map((part) => String(part ?? "")).join("::"));
}

function normalizePayloadVersion(payloadJson: Record<string, unknown> | null | undefined): number {
  const raw = payloadJson?.version;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

function mapDraftRow(row: FinanceDraft): FinanceDraftRecord {
  const payloadJson = (row.payloadJson ?? {}) as Record<string, unknown>;
  const version = normalizePayloadVersion(payloadJson);
  return {
    ...row,
    payloadJson,
    allowedScopes: row.allowedScopes ?? [],
    version,
  };
}

function mapTransactionRow(row: FinanceTransaction): FinanceTransaction {
  return row;
}

function toIdempotencyKey(defaultPrefix: string, parts: Array<string | number | null | undefined>): string {
  return `${defaultPrefix}:${sha256(parts.map((part) => String(part ?? "")).join("::"))}`;
}

function validateRecurringSchedule(input: z.infer<typeof recurringScheduleSchema>): z.infer<typeof recurringScheduleSchema> {
  const parsed = recurringScheduleSchema.parse(input);
  if (parsed.frequency === "weekly" && parsed.daysOfWeek && parsed.daysOfWeek.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Weekly recurring rules must include at least one day of week" });
  }
  return parsed;
}

function normalizeRecurringSchedule(input: z.infer<typeof recurringScheduleSchema> | string): z.infer<typeof recurringScheduleSchema> {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Recurring schedule cannot be empty" });
    }

    if (trimmed.startsWith("{")) {
      try {
        return validateRecurringSchedule(JSON.parse(trimmed) as z.infer<typeof recurringScheduleSchema>);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Invalid recurring schedule JSON",
        });
      }
    }

    const upper = trimmed.toUpperCase();
    if (upper === "DAILY") return validateRecurringSchedule({ frequency: "daily", interval: 1 });
    if (upper === "WEEKLY") return validateRecurringSchedule({ frequency: "weekly", interval: 1 });
    if (upper === "MONTHLY") return validateRecurringSchedule({ frequency: "monthly", interval: 1 });
    if (upper === "YEARLY") return validateRecurringSchedule({ frequency: "yearly", interval: 1 });

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unsupported recurring schedule format. Use JSON schedule or DAILY/WEEKLY/MONTHLY/YEARLY.",
    });
  }

  return validateRecurringSchedule(input);
}

function buildScheduleAnchor(startDate: Date, timeZone: string) {
  const parts = getTimeZoneParts(startDate, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    weekday: parts.weekday,
  };
}

function scheduleMatchesDate(
  candidate: Date,
  schedule: z.infer<typeof recurringScheduleSchema>,
  anchor: ReturnType<typeof buildScheduleAnchor>,
  timeZone: string,
): boolean {
  const candidateParts = getTimeZoneParts(candidate, timeZone);
  const daysSinceAnchor = Math.floor(
    (Date.UTC(candidateParts.year, candidateParts.month - 1, candidateParts.day) - Date.UTC(anchor.year, anchor.month - 1, anchor.day))
      / 86_400_000,
  );

  if (candidateParts.hour !== anchor.hour || candidateParts.minute !== anchor.minute || candidateParts.second !== anchor.second) {
    return false;
  }

  switch (schedule.frequency) {
    case "daily":
      return daysSinceAnchor >= 0 && daysSinceAnchor % schedule.interval === 0;
    case "weekly": {
      const weekdayOk = schedule.daysOfWeek?.length
        ? schedule.daysOfWeek.includes(candidateParts.weekday)
        : candidateParts.weekday === anchor.weekday;
      const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
      return daysSinceAnchor >= 0 && weekdayOk && weeksSinceAnchor >= 0 && weeksSinceAnchor % schedule.interval === 0;
    }
    case "monthly": {
      const monthsSinceAnchor = (candidateParts.year - anchor.year) * 12 + (candidateParts.month - anchor.month);
      const targetDay = schedule.dayOfMonth ?? anchor.day;
      const expectedDay = Math.min(targetDay, daysInMonth(candidateParts.year, candidateParts.month));
      return monthsSinceAnchor >= 0
        && monthsSinceAnchor % schedule.interval === 0
        && candidateParts.day === expectedDay;
    }
    case "yearly": {
      const yearsSinceAnchor = candidateParts.year - anchor.year;
      const targetMonth = schedule.month ?? anchor.month;
      const targetDay = schedule.dayOfMonth ?? anchor.day;
      const expectedDay = Math.min(targetDay, daysInMonth(candidateParts.year, targetMonth));
      return yearsSinceAnchor >= 0
        && yearsSinceAnchor % schedule.interval === 0
        && candidateParts.month === targetMonth
        && candidateParts.day === expectedDay;
    }
    default:
      return false;
  }
}

function computeNextRecurringRunAt(
  schedule: z.infer<typeof recurringScheduleSchema>,
  startDate: Date,
  timeZone: string,
  afterDate: Date,
): Date | null {
  const anchor = buildScheduleAnchor(startDate, timeZone);
  const maxDays = 366 * 5;

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const candidateLocal = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day + offset, anchor.hour, anchor.minute, anchor.second));
    const candidate = timeZonePartsToUtc(
      {
        year: candidateLocal.getUTCFullYear(),
        month: candidateLocal.getUTCMonth() + 1,
        day: candidateLocal.getUTCDate(),
        hour: anchor.hour,
        minute: anchor.minute,
        second: anchor.second,
      },
      timeZone,
    );

    if (candidate.getTime() < startDate.getTime()) {
      continue;
    }
    if (candidate.getTime() < afterDate.getTime()) {
      continue;
    }
    if (scheduleMatchesDate(candidate, schedule, anchor, timeZone)) {
      return candidate;
    }
  }

  return null;
}

async function selectExistingDraft(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, scope: FinanceScope, identity: { idempotencyKey: string; sourceHash?: string | null; draftId?: number | null }): Promise<FinanceDraftRecord | null> {
  if (identity.draftId) {
    const [byId] = await db
      .select()
      .from(financeDrafts)
      .where(and(
        eq(financeDrafts.id, identity.draftId),
        eq(financeDrafts.tenantId, scope.tenantId),
        eq(financeDrafts.projectId, scope.projectId),
        eq(financeDrafts.ownerUserId, scope.ownerUserId),
      ))
      .limit(1);
    if (byId) {
      return mapDraftRow(byId);
    }
  }

  const [byIdempotency] = await db
    .select()
    .from(financeDrafts)
    .where(and(
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.idempotencyKey, identity.idempotencyKey),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);
  if (byIdempotency) {
    return mapDraftRow(byIdempotency);
  }

  if (identity.sourceHash) {
    const [byHash] = await db
      .select()
      .from(financeDrafts)
      .where(and(
        eq(financeDrafts.tenantId, scope.tenantId),
        eq(financeDrafts.sourceHash, identity.sourceHash),
        eq(financeDrafts.projectId, scope.projectId),
        eq(financeDrafts.ownerUserId, scope.ownerUserId),
      ))
      .limit(1);
    if (byHash) {
      return mapDraftRow(byHash);
    }
  }

  return null;
}

async function selectExistingConfirmedTransaction(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: FinanceScope,
  draftId: number,
): Promise<FinanceTransaction | null> {
  const [row] = await db
    .select()
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.confirmedFromDraftId, draftId),
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);
  return row ?? null;
}

async function ensureDraftOwnership(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: FinanceScope,
  draftId: number,
): Promise<FinanceDraftRecord> {
  const [draft] = await db
    .select()
    .from(financeDrafts)
    .where(and(
      eq(financeDrafts.id, draftId),
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);

  if (!draft) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
  }

  return mapDraftRow(draft);
}

async function ensureTransactionOwnership(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: FinanceScope,
  transactionId: number,
): Promise<FinanceTransaction> {
  const [transaction] = await db
    .select()
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.id, transactionId),
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);

  if (!transaction) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
  }

  return transaction;
}

async function ensureRecurringRuleOwnership(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: FinanceScope,
  recurringRuleId: number,
): Promise<FinanceRecurringRule> {
  const [rule] = await db
    .select()
    .from(financeRecurringRules)
    .where(and(
      eq(financeRecurringRules.id, recurringRuleId),
      eq(financeRecurringRules.tenantId, scope.tenantId),
      eq(financeRecurringRules.projectId, scope.projectId),
      eq(financeRecurringRules.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);

  if (!rule) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Recurring rule not found" });
  }

  return rule;
}

function buildDraftClarificationPayload(payload: FinanceStructuredDraft & { version?: number }, source: {
  sourceKind: "chat_text" | "ocr_document" | "recurring_rule";
  sourceMessageId?: number | null;
  sourceLibraryItemId?: number | null;
  recurringRuleId?: number | null;
  sourceHash?: string | null;
  documentExtractionId?: number | null;
}): Record<string, unknown> {
  return {
    ...payload,
    ...source,
    version: payload.version ?? 1,
  };
}

function buildSummaryRow(
  base: FinanceMonthlySummary,
  granularity: "day" | "month",
): FinanceSummaryResult {
  const parsed = financeMonthlySummarySchema.parse(base);
  return {
    ...parsed,
    granularity,
  };
}

async function insertDraftWithIdempotency(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: FinanceScope,
  draft: InsertFinanceDraft,
): Promise<FinanceDraftRecord> {
  try {
    const [inserted] = await db
      .insert(financeDrafts)
      .values(draft)
      .returning();
    if (!inserted) {
      throw new Error("Draft insert returned no rows");
    }
    return mapDraftRow(inserted);
  } catch (error: any) {
    if (error?.code === "23505") {
      const existing = await selectExistingDraft(db, scope, {
        idempotencyKey: draft.idempotencyKey,
        sourceHash: draft.sourceHash ?? null,
      });
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

async function insertRecurringRuleWithIdempotency(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: FinanceScope,
  rule: InsertFinanceRecurringRule,
): Promise<FinanceRecurringRule> {
  try {
    const [inserted] = await db
      .insert(financeRecurringRules)
      .values(rule)
      .returning();
    if (!inserted) {
      throw new Error("Recurring rule insert returned no rows");
    }
    return inserted;
  } catch (error: any) {
    if (error?.code === "23505") {
      const [existing] = await db
        .select()
        .from(financeRecurringRules)
        .where(and(
          eq(financeRecurringRules.tenantId, scope.tenantId),
          eq(financeRecurringRules.idempotencyKey, rule.idempotencyKey),
          eq(financeRecurringRules.projectId, scope.projectId),
          eq(financeRecurringRules.ownerUserId, scope.ownerUserId),
        ))
        .limit(1);
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

async function createTransactionFromDraft(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: FinanceScope,
  draft: FinanceDraftRecord,
  options: { idempotencyKey?: string; confirmedAt?: Date; confirmUserId: number },
): Promise<FinanceTransaction> {
  const transactionIdempotency = options.idempotencyKey ?? `finance-confirm:${draft.id}`;
  const [existingTransaction] = await db
    .select()
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.confirmedFromDraftId, draft.id),
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);

  if (existingTransaction) {
    return existingTransaction;
  }

  const draftPayload = draft.payloadJson as FinanceStructuredDraft & {
    version?: number;
    sourceKind?: string;
    documentExtractionId?: number;
  };
  const [insertedTransaction] = await db
    .insert(financeTransactions)
    .values({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      type: draft.type,
      status: "confirmed",
      source: draft.source,
      amountMinor: draft.amountMinor,
      currency: draft.currency,
      occurredAt: new Date(draftPayload.occurredAt),
      categoryCode: draft.categoryCode,
      merchantName: draft.merchantName ?? null,
      note: draft.note ?? null,
      confidence: draft.confidence ?? null,
      idempotencyKey: transactionIdempotency,
      sourceHash: draft.sourceHash ?? null,
      confirmedFromDraftId: draft.id,
      recurringRuleId: draft.recurringRuleId ?? null,
      sourceMessageId: draft.sourceMessageId ?? null,
      sourceLibraryItemId: draft.sourceLibraryItemId ?? null,
      confirmedAt: options.confirmedAt ?? new Date(),
      confirmedByUserId: options.confirmUserId,
      allowedScopes: draft.allowedScopes,
    })
    .returning();

  if (!insertedTransaction) {
    throw new Error("Transaction insert returned no rows");
  }

  if (draft.sourceLibraryItemId) {
    const role = draft.source === "ocr_document" ? "receipt" : "supporting";
    await db
      .insert(financeTransactionDocuments)
      .values({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        ownerUserId: scope.ownerUserId,
        transactionId: insertedTransaction.id,
        libraryItemId: draft.sourceLibraryItemId,
        sourceExtractionId: typeof draftPayload.documentExtractionId === "number"
          ? draftPayload.documentExtractionId
          : null,
        role,
        note: draft.note ?? null,
        allowedScopes: draft.allowedScopes,
      })
      .onConflictDoNothing();
  }

  await db
    .update(financeDrafts)
    .set({
      status: "confirmed",
      updatedAt: new Date(),
    })
    .where(eq(financeDrafts.id, draft.id));

  return insertedTransaction;
}

export async function parseTextToDraft(input: ParseTextToDraftInput): Promise<FinanceDraftRecord> {
  const db = await getDb();
  ensureDb(db);

  const conversation = await getConversationById(input.conversationId, input.userId);
  if (!conversation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
  }

  const scope = buildScopeFromConversation(conversation, input.userId, input.tenantId);
  const normalizedText = normalizeText(input.text);
  if (!normalizedText) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Finance text cannot be empty" });
  }

  const sourceMessageId = input.sourceMessageId ?? null;
  const sourceHash = computeBaseSourceHash([
    scope.tenantId,
    scope.projectId,
    scope.ownerUserId,
    "chat_text",
    normalizedText,
  ]);
  const idempotencyKey = input.idempotencyKey ?? toIdempotencyKey("finance-draft-text", [
    scope.tenantId,
    scope.projectId,
    scope.ownerUserId,
    sourceMessageId ?? sourceHash,
    sourceHash,
  ]);

  const existing = await selectExistingDraft(db, scope, {
    idempotencyKey,
    sourceHash,
  });
  if (existing) {
    return existing;
  }

  const structured = await callLLMStructured<FinanceStructuredDraft>({
    systemPrompt: [
      "You extract a single finance transaction draft from user text.",
      "Do not change the tenant, project, or owner.",
      "Return only valid JSON matching the schema.",
      "Use missingFields and needsClarification when the user text does not provide enough detail.",
    ].join("\n"),
    userMessage: JSON.stringify({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      personal: scope.personal,
      text: normalizedText,
      sourceMessageId,
    }),
    zodSchema: financeStructuredDraftSchema,
    userId: input.userId,
    tenantId: scope.tenantId,
    maxRetries: 1,
    billingDescription: "finance_text_to_draft",
    billingMetadata: {
      domain: "finance",
      source: "chat_text",
      conversationId: input.conversationId,
    },
    model: input.model,
  });

  const draftPayload = buildDraftClarificationPayload(structured.data, {
    sourceKind: "chat_text",
    sourceMessageId,
    sourceHash,
  });

  const draft = await insertDraftWithIdempotency(db, scope, {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    ownerUserId: scope.ownerUserId,
    type: structured.data.type,
    status: "draft",
    source: "chat_text",
    idempotencyKey,
    sourceHash,
    payloadJson: {
      ...draftPayload,
      version: 1,
    },
    missingFields: structured.data.missingFields ?? [],
    confidence: Number(structured.data.confidence.toFixed(2)),
    needsClarification: structured.data.needsClarification,
    clarificationPrompt: buildClarificationPrompt(structured.data.missingFields ?? []),
    sourceMessageId,
    sourceLibraryItemId: null,
    recurringRuleId: null,
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    allowedScopes: scope.allowedScopes,
  });

  auditLogger.log({
    eventType: "finance_draft_created",
    userId: input.userId,
    tenantId: scope.tenantId,
    metadata: {
      conversationId: input.conversationId,
      source: "chat_text",
      draftId: draft.id,
      needsClarification: draft.needsClarification,
    },
  });

  return draft;
}

export async function parseDocumentToDraft(input: ParseDocumentToDraftInput): Promise<FinanceDraftRecord> {
  const db = await getDb();
  ensureDb(db);

  const [extraction] = await db
    .select()
    .from(documentExtractions)
    .where(eq(documentExtractions.id, input.documentExtractionId))
    .limit(1);

  if (!extraction) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Document extraction not found" });
  }

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId ?? extraction.tenantId,
  });

  if (
    extraction.tenantId !== scope.tenantId
    || extraction.projectId !== scope.projectId
    || extraction.ownerUserId !== scope.ownerUserId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Document extraction is outside the active finance scope",
    });
  }

  if (extraction.financeDraftId) {
    const existingDraft = await selectExistingDraft(db, scope, {
      idempotencyKey: `finance-draft-doc:${extraction.id}`,
      draftId: extraction.financeDraftId,
      sourceHash: extraction.sourceHash ?? extraction.fileHash,
    });
    if (existingDraft) {
      return existingDraft;
    }
  }

  const extracted = financeStructuredDraftSchema.parse({
    ...extraction.extractedJson,
    sourceMessageId: extraction.sourceMessageId ?? null,
    sourceLibraryItemId: extraction.libraryItemId,
  });

  const draftPayload = buildDraftClarificationPayload(extracted, {
    sourceKind: "ocr_document",
    sourceMessageId: extraction.sourceMessageId ?? null,
    sourceLibraryItemId: extraction.libraryItemId,
    sourceHash: extraction.sourceHash ?? extraction.fileHash,
    documentExtractionId: extraction.id,
  });

  const draft = await db.transaction(async (tx) => {
    const created = await insertDraftWithIdempotency(tx, scope, {
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      type: extracted.type,
      status: "draft",
      source: "ocr_document",
      idempotencyKey: input.idempotencyKey ?? `finance-draft-doc:${extraction.id}`,
      sourceHash: extraction.sourceHash ?? extraction.fileHash,
      payloadJson: {
        ...draftPayload,
        version: 1,
      },
      missingFields: extracted.missingFields ?? [],
      confidence: Number(extracted.confidence.toFixed(2)),
      needsClarification: extracted.needsClarification,
      clarificationPrompt: buildClarificationPrompt(extracted.missingFields ?? []),
      sourceMessageId: extraction.sourceMessageId ?? null,
      sourceLibraryItemId: extraction.libraryItemId,
      recurringRuleId: null,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      allowedScopes: scope.allowedScopes,
    });

    await tx
      .update(documentExtractions)
      .set({
        financeDraftId: created.id,
        updatedAt: new Date(),
      })
      .where(eq(documentExtractions.id, extraction.id));

    return created;
  });

  auditLogger.log({
    eventType: "finance_draft_created",
    userId: input.userId,
    tenantId: scope.tenantId,
    metadata: {
      conversationId: input.conversationId,
      source: "ocr_document",
      draftId: draft.id,
      documentExtractionId: extraction.id,
    },
  });

  return draft;
}

export async function updateDraft(input: UpdateDraftInput): Promise<FinanceDraftRecord> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const draft = await ensureDraftOwnership(db, scope, input.draftId);
  if (draft.status !== "draft") {
    throw new TRPCError({ code: "CONFLICT", message: "Draft is no longer editable" });
  }

  if (draft.version !== input.expectedVersion) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Draft version mismatch (expected ${input.expectedVersion}, found ${draft.version})`,
    });
  }

  const patch = draftPatchSchema.parse(input.patch);
  const nextVersion = draft.version + 1;
  const nextPayload = {
    ...(draft.payloadJson ?? {}),
    ...patch,
    version: nextVersion,
  };

  const [updated] = await db
    .update(financeDrafts)
    .set({
      type: patch.type ?? draft.type,
      amountMinor: patch.amountMinor ?? draft.amountMinor,
      currency: patch.currency ?? draft.currency,
      occurredAt: patch.occurredAt ? new Date(patch.occurredAt) : new Date((draft.payloadJson.occurredAt as string) ?? draft.createdAt),
      categoryCode: patch.categoryCode ?? draft.categoryCode,
      merchantName: patch.merchantName === undefined ? draft.merchantName : patch.merchantName,
      note: patch.note === undefined ? draft.note : patch.note,
      confidence: patch.confidence ?? draft.confidence,
      missingFields: patch.missingFields ?? draft.missingFields,
      needsClarification: patch.needsClarification ?? draft.needsClarification,
      clarificationPrompt: patch.clarificationPrompt === undefined ? draft.clarificationPrompt : patch.clarificationPrompt,
      payloadJson: nextPayload,
      updatedAt: new Date(),
    })
    .where(and(
      eq(financeDrafts.id, draft.id),
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
    ))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update draft" });
  }

  return mapDraftRow(updated);
}

export async function confirmDraft(input: ConfirmDraftInput): Promise<FinanceTransaction> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  return db.transaction(async (tx) => {
    const draft = await ensureDraftOwnership(tx, scope, input.draftId);

    const existingTransaction = await selectExistingConfirmedTransaction(tx, scope, draft.id);
    if (existingTransaction) {
      return existingTransaction;
    }

    try {
      const transaction = await createTransactionFromDraft(tx, scope, draft, {
        confirmUserId: input.userId,
      });

      auditLogger.log({
        eventType: "finance_draft_confirmed",
        userId: input.userId,
        tenantId: scope.tenantId,
        metadata: {
          conversationId: input.conversationId,
          draftId: draft.id,
          transactionId: transaction.id,
        },
      });

      return transaction;
    } catch (error: any) {
      if (error?.code === "23505") {
        const existing = await selectExistingConfirmedTransaction(tx, scope, draft.id);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  });
}

export async function voidTransaction(input: VoidTransactionInput): Promise<FinanceTransaction> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const transaction = await ensureTransactionOwnership(db, scope, input.transactionId);
  if (transaction.status === "voided" || transaction.voidedAt) {
    return mapTransactionRow(transaction);
  }

  const [updated] = await db
    .update(financeTransactions)
    .set({
      status: "voided",
      voidedAt: new Date(),
      voidedByUserId: input.userId,
      voidReason: input.reason ?? "Voided by user",
      updatedAt: new Date(),
    })
    .where(and(
      eq(financeTransactions.id, transaction.id),
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
    ))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to void transaction" });
  }

  auditLogger.log({
    eventType: "finance_transaction_voided",
    userId: input.userId,
    tenantId: scope.tenantId,
    metadata: {
      conversationId: input.conversationId,
      transactionId: updated.id,
      reason: input.reason ?? null,
    },
  });

  return updated;
}

export async function listTransactions(input: ListTransactionsInput): Promise<FinanceTransaction[]> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const filters = transactionListFiltersSchema.parse({
    status: input.status ?? "confirmed",
    categoryCode: input.categoryCode,
    merchant: input.merchant,
    fromDate: input.fromDate,
    toDate: input.toDate,
    limit: input.limit ?? 50,
    offset: input.offset ?? 0,
  });

  if (filters.fromDate && filters.toDate && filters.toDate.getTime() < filters.fromDate.getTime()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "toDate must be after fromDate" });
  }

  const conditions = [
    eq(financeTransactions.tenantId, scope.tenantId),
    eq(financeTransactions.projectId, scope.projectId),
    eq(financeTransactions.ownerUserId, scope.ownerUserId),
  ];

  if (filters.status) {
    conditions.push(eq(financeTransactions.status, filters.status));
  }
  if (filters.categoryCode) {
    conditions.push(eq(financeTransactions.categoryCode, filters.categoryCode));
  }
  if (filters.merchant) {
    conditions.push(ilike(financeTransactions.merchantName, `%${filters.merchant}%`));
  }
  if (filters.fromDate) {
    conditions.push(gte(financeTransactions.occurredAt, filters.fromDate));
  }
  if (filters.toDate) {
    conditions.push(lt(financeTransactions.occurredAt, filters.toDate));
  }

  return db
    .select()
    .from(financeTransactions)
    .where(and(...conditions))
    .orderBy(desc(financeTransactions.occurredAt), desc(financeTransactions.id))
    .limit(filters.limit)
    .offset(filters.offset);
}

async function aggregateSummary(
  scope: FinanceScope,
  referenceDate: Date,
  granularity: "day" | "month",
): Promise<FinanceSummaryResult> {
  const db = await getDb();
  ensureDb(db);

  const rangeStart = granularity === "day"
    ? startOfDayInTimeZone(referenceDate, "Asia/Bangkok")
    : startOfMonthInTimeZone(referenceDate, "Asia/Bangkok");
  const rangeEnd = granularity === "day"
    ? new Date(rangeStart.getTime() + 86_400_000)
    : startOfNextMonthInTimeZone(referenceDate, "Asia/Bangkok");

  const [row] = await db
    .select({
      incomeMinor: sql<number>`coalesce(sum(case when ${financeTransactions.type} = 'income' then ${financeTransactions.amountMinor} else 0 end), 0)::int`,
      expenseMinor: sql<number>`coalesce(sum(case when ${financeTransactions.type} = 'expense' then ${financeTransactions.amountMinor} else 0 end), 0)::int`,
      transferMinor: sql<number>`coalesce(sum(case when ${financeTransactions.type} = 'transfer' then ${financeTransactions.amountMinor} else 0 end), 0)::int`,
    })
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
      eq(financeTransactions.status, "confirmed"),
      isNull(financeTransactions.voidedAt),
      gte(financeTransactions.occurredAt, rangeStart),
      lt(financeTransactions.occurredAt, rangeEnd),
    ));

  const incomeMinor = Number(row?.incomeMinor ?? 0);
  const expenseMinor = Number(row?.expenseMinor ?? 0);
  const transferMinor = Number(row?.transferMinor ?? 0);
  const summary = buildSummaryRow({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    timezone: "Asia/Bangkok",
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    incomeMinor,
    expenseMinor,
    transferMinor,
    balanceMinor: incomeMinor - expenseMinor,
  }, granularity);

  return summary;
}

export async function getDailySummary(input: { conversationId: number; userId: number; tenantId?: string | null; referenceDate?: Date }): Promise<FinanceSummaryResult> {
  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });
  return await aggregateSummary(scope, input.referenceDate ?? new Date(), "day");
}

export async function getMonthlySummary(input: { conversationId: number; userId: number; tenantId?: string | null; referenceDate?: Date }): Promise<FinanceSummaryResult> {
  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });
  return await aggregateSummary(scope, input.referenceDate ?? new Date(), "month");
}

export async function createRecurringRule(input: CreateRecurringRuleInput): Promise<FinanceRecurringRule> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const schedule = normalizeRecurringSchedule(input.rrule);
  const timezone = input.timezone?.trim() || "Asia/Bangkok";
  const startDate = input.startDate ?? new Date();
  const endDate = input.endDate ?? null;
  const nextRunAt = computeNextRecurringRunAt(schedule, startDate, timezone, new Date());
  if (!nextRunAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Could not compute the next recurring run" });
  }
  if (endDate && nextRunAt.getTime() > endDate.getTime()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recurring schedule ends before the first run" });
  }

  const scheduleHash = sha256(JSON.stringify(schedule));
  const idempotencyKey = input.idempotencyKey ?? toIdempotencyKey("finance-recurring", [
    scope.tenantId,
    scope.projectId,
    scope.ownerUserId,
    scheduleHash,
    input.type,
    input.amountMinor,
    input.currency ?? "THB",
    input.categoryCode,
    input.merchantName ?? "",
    input.note ?? "",
    input.sourceMessageId ?? "",
    input.sourceLibraryItemId ?? "",
  ]);

  return await insertRecurringRuleWithIdempotency(db, scope, {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    ownerUserId: scope.ownerUserId,
    type: input.type,
    amountMinor: input.amountMinor,
    currency: input.currency ?? "THB",
    categoryCode: input.categoryCode,
    merchantName: input.merchantName ?? null,
    note: input.note ?? null,
    rrule: JSON.stringify(schedule),
    timezone,
    startDate,
    endDate,
    nextRunAt,
    lastRunAt: null,
    runCount: 0,
    autoConfirm: input.autoConfirm ?? false,
    status: "active",
    idempotencyKey,
    sourceHash: scheduleHash,
    sourceMessageId: input.sourceMessageId ?? null,
    sourceLibraryItemId: input.sourceLibraryItemId ?? null,
    allowedScopes: scope.allowedScopes,
  });
}

export async function pauseRecurringRule(input: PauseRecurringRuleInput): Promise<FinanceRecurringRule> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const rule = await ensureRecurringRuleOwnership(db, scope, input.recurringRuleId);
  if (rule.status === "paused") {
    return rule;
  }

  const [updated] = await db
    .update(financeRecurringRules)
    .set({
      status: "paused",
      updatedAt: new Date(),
    })
    .where(eq(financeRecurringRules.id, rule.id))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to pause recurring rule" });
  }

  return updated;
}

export async function resumeRecurringRule(input: ResumeRecurringRuleInput): Promise<FinanceRecurringRule> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const rule = await ensureRecurringRuleOwnership(db, scope, input.recurringRuleId);
  if (rule.status === "active") {
    return rule;
  }

  const schedule = normalizeRecurringSchedule(rule.rrule);
  const nextRunAt = computeNextRecurringRunAt(schedule, rule.startDate, rule.timezone, new Date());
  if (!nextRunAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Could not compute the next recurring run" });
  }

  const [updated] = await db
    .update(financeRecurringRules)
    .set({
      status: "active",
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(financeRecurringRules.id, rule.id))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to resume recurring rule" });
  }

  return updated;
}

export async function listLinkedDocuments(input: ListLinkedDocumentsInput): Promise<FinanceLinkedDocumentRecord[]> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  await ensureTransactionOwnership(db, scope, input.transactionId);

  const rows = await db
    .select({
      id: financeTransactionDocuments.id,
      transactionId: financeTransactionDocuments.transactionId,
      libraryItemId: financeTransactionDocuments.libraryItemId,
      sourceExtractionId: financeTransactionDocuments.sourceExtractionId,
      role: financeTransactionDocuments.role,
      note: financeTransactionDocuments.note,
      createdAt: financeTransactionDocuments.createdAt,
      updatedAt: financeTransactionDocuments.updatedAt,
      libraryItemIdFromJoin: libraryItems.id,
      libraryTitle: libraryItems.title,
      librarySource: libraryItems.source,
      libraryMetadata: libraryItems.metadata,
      libraryProjectId: libraryItems.projectId,
      extractionId: documentExtractions.id,
      extractionOcrProvider: documentExtractions.ocrProvider,
      extractionMimeType: documentExtractions.mimeType,
      extractionFileHash: documentExtractions.fileHash,
      extractionPageCount: documentExtractions.pageCount,
    })
    .from(financeTransactionDocuments)
    .leftJoin(libraryItems, eq(financeTransactionDocuments.libraryItemId, libraryItems.id))
    .leftJoin(documentExtractions, eq(financeTransactionDocuments.sourceExtractionId, documentExtractions.id))
    .where(and(
      eq(financeTransactionDocuments.tenantId, scope.tenantId),
      eq(financeTransactionDocuments.projectId, scope.projectId),
      eq(financeTransactionDocuments.ownerUserId, scope.ownerUserId),
      eq(financeTransactionDocuments.transactionId, input.transactionId),
    ))
    .orderBy(asc(financeTransactionDocuments.createdAt));

  return rows.map((row) => ({
    id: row.id,
    transactionId: row.transactionId,
    libraryItemId: row.libraryItemId,
    role: financeDocumentRoleSchema.parse(row.role),
    note: row.note ?? null,
    sourceExtractionId: row.sourceExtractionId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    libraryItem: row.libraryItemIdFromJoin
      ? {
          id: row.libraryItemIdFromJoin,
          title: row.libraryTitle ?? "",
          source: row.librarySource ?? "",
          metadata: (row.libraryMetadata ?? {}) as Record<string, unknown>,
          projectId: row.libraryProjectId ?? null,
        }
      : null,
    extraction: row.extractionId
      ? {
          id: row.extractionId,
          ocrProvider: row.extractionOcrProvider ?? "",
          mimeType: row.extractionMimeType ?? "",
          fileHash: row.extractionFileHash ?? "",
          pageCount: row.extractionPageCount ?? 1,
        }
      : null,
  }));
}

async function createRecurringDraftFromRule(
  tx: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: FinanceScope,
  rule: FinanceRecurringRule,
  runAt: Date,
): Promise<FinanceDraftRecord> {
  const draftPayload = buildDraftClarificationPayload({
    type: rule.type,
    amountMinor: rule.amountMinor,
    currency: rule.currency,
    occurredAt: runAt.toISOString(),
    categoryCode: rule.categoryCode,
    merchantName: rule.merchantName,
    note: rule.note,
    confidence: 1,
    needsClarification: false,
    missingFields: [],
    sourceMessageId: rule.sourceMessageId ?? null,
    sourceLibraryItemId: rule.sourceLibraryItemId ?? null,
    recurringRuleId: rule.id,
  }, {
    sourceKind: "recurring_rule",
    sourceMessageId: rule.sourceMessageId ?? null,
    sourceLibraryItemId: rule.sourceLibraryItemId ?? null,
    recurringRuleId: rule.id,
    sourceHash: rule.sourceHash ?? null,
  });

  return await insertDraftWithIdempotency(tx, scope, {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    ownerUserId: scope.ownerUserId,
    type: rule.type,
    status: "draft",
    source: "recurring_rule",
    idempotencyKey: `finance-recurring-draft:${rule.id}:${rule.runCount + 1}`,
    sourceHash: rule.sourceHash ?? null,
    payloadJson: {
      ...draftPayload,
      version: 1,
    },
    missingFields: [],
    confidence: 1,
    needsClarification: false,
    clarificationPrompt: null,
    sourceMessageId: rule.sourceMessageId ?? null,
    sourceLibraryItemId: rule.sourceLibraryItemId ?? null,
    recurringRuleId: rule.id,
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    allowedScopes: scope.allowedScopes,
  });
}

export async function runDueRecurringRules(now = new Date()): Promise<RunRecurringRulesResult> {
  const db = await getDb();
  ensureDb(db);

  const dueRules = await db
    .select()
    .from(financeRecurringRules)
    .where(and(
      eq(financeRecurringRules.status, "active"),
      or(
        isNull(financeRecurringRules.nextRunAt),
        lt(financeRecurringRules.nextRunAt, now),
        eq(financeRecurringRules.nextRunAt, now),
      ),
    ))
    .orderBy(asc(financeRecurringRules.nextRunAt), asc(financeRecurringRules.id))
    .limit(100);

  let draftsCreated = 0;
  let transactionsCreated = 0;
  let errors = 0;

  for (const rule of dueRules) {
    const scope: FinanceScope = {
      tenantId: rule.tenantId,
      ownerUserId: rule.ownerUserId,
      projectId: rule.projectId,
      conversationId: 0,
      personal: isPersonalProjectId(rule.projectId),
      allowedScopes: rule.allowedScopes?.length > 0 ? rule.allowedScopes : [personalScopeToken(rule.ownerUserId)],
    };

    try {
      let createdDraft: FinanceDraftRecord | null = null;
      let createdTransaction: FinanceTransaction | null = null;
      await db.transaction(async (tx) => {
        const schedule = normalizeRecurringSchedule(rule.rrule);
        const runAt = rule.nextRunAt ?? now;
        createdDraft = await createRecurringDraftFromRule(tx, scope, rule, runAt);

        if (rule.autoConfirm) {
          createdTransaction = await createTransactionFromDraft(tx, scope, createdDraft, {
            confirmUserId: rule.ownerUserId,
            confirmedAt: runAt,
          });
        }

        const nextRunAt = computeNextRecurringRunAt(schedule, rule.startDate, rule.timezone, new Date(runAt.getTime() + 1000));
        await tx
          .update(financeRecurringRules)
          .set({
            lastRunAt: runAt,
            nextRunAt,
            runCount: rule.runCount + 1,
            status: nextRunAt ? "active" : "ended",
            updatedAt: new Date(),
          })
          .where(eq(financeRecurringRules.id, rule.id));
      });
      if (createdDraft) {
        draftsCreated += 1;
      }
      if (createdTransaction) {
        transactionsCreated += 1;
      }
    } catch (error) {
      errors += 1;
      auditLogger.log({
        eventType: "finance_recurring_rule_failed",
        userId: rule.ownerUserId,
        tenantId: rule.tenantId,
        metadata: {
          recurringRuleId: rule.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return {
    scannedCount: dueRules.length,
    draftsCreated,
    transactionsCreated,
    errors,
  };
}
