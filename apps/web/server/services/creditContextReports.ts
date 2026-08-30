import { and, desc, eq, gte, inArray, isNotNull, lt, lte, max, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { creditContexts, creditTransactionContexts, creditTransactions, skills, verticalDramaSeries } from "../../drizzle/schema";
import { getDb } from "../db";
import { CREDITS_PER_USD, CreditContextError, creditsToUsdEstimate, type CreditContextAttributionStatus, type CreditContextReportFilters } from "../../shared/creditContextContracts";
import { auditCreditContextEvent } from "./creditContextAudit";

export interface CreditReportScope {
  tenantId: string;
  userId?: number;
  operatorId?: number;
  isAdmin?: boolean;
}

interface LedgerRow {
  id: number;
  userId: number;
  amount: number;
  type: string;
  createdAt: Date;
  sourceType: string | null;
  skillSlug: string | null;
  skillName: string | null;
  metadata: Record<string, unknown> | null;
  reversalOfTransactionId: number | null;
  contextId: string | null;
  contextType: string | null;
  contextSourceType: string | null;
  contextStatus: string | null;
  contextLabel: string | null;
  rootContextId: string | null;
  rootLabel: string | null;
  stageLabel: string | null;
  relationType: string | null;
};

export interface CreditContextReportRow {
  rootContextId: string | null;
  rootLabel: string | null;
  primaryContextId: string | null;
  primaryWorkLabel: string | null;
  attributionStatus: CreditContextAttributionStatus;
  chargedCredits: number;
  refundedCredits: number;
  netActualCredits: number;
  usageTransactionCount: number;
  refundTransactionCount: number;
  adjustmentTransactionCount: number;
  firstUsedAt: Date | null;
  lastUsedAt: Date | null;
  byWork: Array<{ contextId: string; workType: string; workLabel: string; chargedCredits: number; refundedCredits: number; netActualCredits: number; transactionCount: number }>;
  bySourceType: Array<{ sourceType: string | null; chargedCredits: number; refundedCredits: number; netActualCredits: number; count: number }>;
  byContextSourceType: Array<{ contextSourceType: string | null; chargedCredits: number; refundedCredits: number; netActualCredits: number; count: number }>;
  bySkill: Array<{ skillSlug: string | null; skillName: string | null; chargedCredits: number; refundedCredits: number; netActualCredits: number; count: number }>;
  byModel: Array<{ model: string | null; provider: string | null; chargedCredits: number; refundedCredits: number; netActualCredits: number; count: number }>;
  byStage: Array<{ stageLabel: string | null; chargedCredits: number; refundedCredits: number; netActualCredits: number; count: number }>;
}

export interface CreditContextReport {
  scope: "self" | "user" | "tenant";
  distinctUserCount: number;
  rows: CreditContextReportRow[];
  totals: {
    chargedCredits: number;
    refundedCredits: number;
    netActualCredits: number;
    usageTransactionCount: number;
    refundTransactionCount: number;
    adjustmentTransactionCount: number;
    unattributedTransactionCount: number;
    ambiguousTransactionCount: number;
    unattributedChargedCredits: number;
    unattributedRefundedCredits: number;
    unattributedNetActualCredits: number;
    ambiguousChargedCredits: number;
    ambiguousRefundedCredits: number;
    ambiguousNetActualCredits: number;
    integrityExceptionTransactionCount: number;
    integrityExceptionCredits: number;
  };
  pagination: { limit: number; offset: number; hasMore: boolean; nextOffset: number | null; asOfTransactionId: number };
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 128) : null;
}

function emptyRow(key: string, status: CreditContextAttributionStatus, row: LedgerRow): CreditContextReportRow {
  const named = key !== "null" && row.contextId && row.contextLabel;
  return {
    rootContextId: named ? row.rootContextId ?? row.contextId : null,
    rootLabel: named ? row.rootLabel ?? row.contextLabel : null,
    primaryContextId: named ? row.contextId : null,
    primaryWorkLabel: named ? row.contextLabel : null,
    attributionStatus: status,
    chargedCredits: 0,
    refundedCredits: 0,
    netActualCredits: 0,
    usageTransactionCount: 0,
    refundTransactionCount: 0,
    adjustmentTransactionCount: 0,
    firstUsedAt: null,
    lastUsedAt: null,
    byWork: [],
    bySourceType: [],
    byContextSourceType: [],
    bySkill: [],
    byModel: [],
    byStage: [],
  };
}

function addBreakdown<T extends { chargedCredits: number; refundedCredits: number; netActualCredits: number; count: number }>(list: T[], match: (item: T) => boolean, create: () => T, charged: number, refunded: number, count = 1) {
  const item = list.find(match) ?? (() => { const next = create(); list.push(next); return next; })();
  item.chargedCredits += charged;
  item.refundedCredits += refunded;
  item.netActualCredits += charged - refunded;
  item.count += count;
}

function classify(row: LedgerRow, originals: Map<number, LedgerRow>) {
  const original = row.reversalOfTransactionId ? originals.get(row.reversalOfTransactionId) : undefined;
  const reason = metadataString(row.metadata, "reason");
  if (row.type === "usage" && row.amount < 0 && row.sourceType !== "admin" && reason !== "admin_adjustment" && reason !== "system_adjustment") return { kind: "usage" as const, charged: Math.abs(row.amount), refunded: 0, exception: 0 };
  if (row.type === "refund" && row.amount > 0) {
    if (!original || original.type !== "usage" || original.amount >= 0) return { kind: "invalid" as const, charged: 0, refunded: 0, exception: row.amount };
    if (original.contextId && row.contextId && original.contextId !== row.contextId) return { kind: "invalid" as const, charged: 0, refunded: 0, exception: row.amount };
    const valid = Math.min(row.amount, Math.abs(original.amount));
    return { kind: "refund" as const, charged: 0, refunded: valid, exception: row.amount - valid };
  }
  if (row.type === "adjustment" && row.amount < 0 && row.relationType === "work_adjustment") {
    return { kind: "adjustment" as const, charged: Math.abs(row.amount), refunded: 0, exception: 0 };
  }
  return { kind: "excluded" as const, charged: 0, refunded: 0, exception: 0 };
}

export async function getCreditContextReport(scope: CreditReportScope, filters: CreditContextReportFilters = {}): Promise<CreditContextReport> {
  if (!scope.tenantId.trim()) throw new CreditContextError("TENANT_SCOPE_REQUIRED", "Tenant scope is required");
  const now = new Date();
  const startDate = filters.startDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const endDate = filters.endDate ?? now;
  if (endDate <= startDate) throw new CreditContextError("INVALID_DATE_RANGE", "End date must be after start date");
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  let db;
  try {
    db = await getDb();
  } catch {
    throw new CreditContextError("REPORT_UNAVAILABLE", "Credit usage report is temporarily unavailable");
  }
  if (!db) throw new CreditContextError("REPORT_UNAVAILABLE", "Credit usage report is temporarily unavailable");
  const rootContexts = alias(creditContexts, "credit_context_report_roots");
  let rootTransactionIds: number[] = [];
  if (filters.rootContextId) {
    const rootTransactionRows = await db.select({ transactionId: creditTransactionContexts.transactionId })
      .from(creditTransactionContexts)
      .innerJoin(creditTransactions, and(
        eq(creditTransactions.id, creditTransactionContexts.transactionId),
        eq(creditTransactions.tenantId, scope.tenantId),
      ))
      .innerJoin(creditContexts, and(
        eq(creditContexts.id, creditTransactionContexts.contextId),
        eq(creditContexts.tenantId, scope.tenantId),
      ))
      .leftJoin(rootContexts, and(
        eq(rootContexts.id, creditContexts.rootContextId),
        eq(rootContexts.tenantId, scope.tenantId),
      ))
      .where(and(
        eq(creditTransactionContexts.isPrimary, true),
        or(eq(creditContexts.id, filters.rootContextId), eq(rootContexts.id, filters.rootContextId)),
        scope.userId === undefined ? sql`true` : eq(creditTransactions.userId, scope.userId),
      ));
    rootTransactionIds = Array.from(new Set(rootTransactionRows.map(row => row.transactionId)));
  }
  let metadataSeriesTransactionIds: number[] = [];
  if (filters.metadataSeriesId) {
    const metadataRows = await db.select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.tenantId, scope.tenantId),
        sql`(${creditTransactions.metadata}->>'seriesId' = ${filters.metadataSeriesId} OR ${creditTransactions.metadata}->>'series_id' = ${filters.metadataSeriesId})`,
        scope.userId === undefined ? sql`true` : eq(creditTransactions.userId, scope.userId),
      ));
    metadataSeriesTransactionIds = Array.from(new Set(metadataRows.map(row => row.id)));
  }
  const scopeConditions = [eq(creditTransactions.tenantId, scope.tenantId), gte(creditTransactions.createdAt, startDate), lt(creditTransactions.createdAt, endDate)];
  if (scope.userId !== undefined) scopeConditions.push(eq(creditTransactions.userId, scope.userId));
  if (filters.asOfTransactionId !== undefined) scopeConditions.push(lte(creditTransactions.id, filters.asOfTransactionId));
  if (filters.transactionSourceType) scopeConditions.push(eq(creditTransactions.sourceType, filters.transactionSourceType));
  if (filters.skillSlug) scopeConditions.push(eq(creditTransactions.skillSlug, filters.skillSlug));
  if (filters.contextType) scopeConditions.push(eq(creditContexts.contextType, filters.contextType));
  if (filters.contextSourceType) scopeConditions.push(eq(creditContexts.sourceType, filters.contextSourceType));
  const attributionConditions: SQL[] = [];
  if (filters.rootContextId) {
    const rootCondition = or(
      eq(rootContexts.id, filters.rootContextId),
      inArray(creditTransactions.reversalOfTransactionId, rootTransactionIds.length ? rootTransactionIds : [-1]),
    );
    if (rootCondition) attributionConditions.push(rootCondition);
  }
  if (filters.metadataSeriesId) {
    const metadataCondition = or(
      sql`(${creditTransactions.metadata}->>'seriesId' = ${filters.metadataSeriesId} OR ${creditTransactions.metadata}->>'series_id' = ${filters.metadataSeriesId})`,
      inArray(creditTransactions.reversalOfTransactionId, metadataSeriesTransactionIds.length ? metadataSeriesTransactionIds : [-1]),
    );
    if (metadataCondition) attributionConditions.push(metadataCondition);
  }
  if (attributionConditions.length) {
    const combinedAttributionCondition = or(...attributionConditions);
    if (combinedAttributionCondition) scopeConditions.push(combinedAttributionCondition);
  }
  const maxResult = filters.asOfTransactionId === undefined
    ? await db.select({ value: max(creditTransactions.id) }).from(creditTransactions).where(and(eq(creditTransactions.tenantId, scope.tenantId)))
    : [{ value: filters.asOfTransactionId }];
  const asOfTransactionId = Number(maxResult[0]?.value ?? filters.asOfTransactionId ?? 0);
  const rows = await db.select({
    id: creditTransactions.id,
    userId: creditTransactions.userId,
    amount: creditTransactions.amount,
    type: creditTransactions.type,
    createdAt: creditTransactions.createdAt,
    sourceType: creditTransactions.sourceType,
    skillSlug: creditTransactions.skillSlug,
    skillName: skills.name,
    metadata: creditTransactions.metadata,
    reversalOfTransactionId: creditTransactions.reversalOfTransactionId,
    contextId: creditContexts.id,
    contextType: creditContexts.contextType,
    contextSourceType: creditContexts.sourceType,
    contextStatus: creditContexts.attributionStatus,
    contextLabel: creditContexts.displayNameSnapshot,
    rootContextId: rootContexts.id,
    rootLabel: rootContexts.displayNameSnapshot,
    stageLabel: sql<string | null>`COALESCE(${creditContexts.snapshotJson}->>'stageLabel', ${creditContexts.snapshotJson}->>'stage', ${creditTransactions.metadata}->>'stage')`,
    relationType: creditTransactionContexts.relationType,
  }).from(creditTransactions)
    .leftJoin(creditTransactionContexts, and(eq(creditTransactionContexts.transactionId, creditTransactions.id), eq(creditTransactionContexts.isPrimary, true)))
    .leftJoin(creditContexts, and(eq(creditContexts.id, creditTransactionContexts.contextId), eq(creditContexts.tenantId, scope.tenantId)))
    .leftJoin(rootContexts, and(eq(rootContexts.id, creditContexts.rootContextId), eq(rootContexts.tenantId, scope.tenantId)))
    .leftJoin(skills, eq(skills.slug, creditTransactions.skillSlug))
    .where(and(...scopeConditions))
    .orderBy(desc(creditTransactions.createdAt), desc(creditTransactions.id));
  const reversalIds = rows.flatMap(row => row.reversalOfTransactionId == null ? [] : [row.reversalOfTransactionId]);
  const originalRows = reversalIds.length
    ? await db.select({ id: creditTransactions.id, amount: creditTransactions.amount, type: creditTransactions.type, contextId: creditContexts.id, tenantId: creditTransactions.tenantId, userId: creditTransactions.userId, createdAt: creditTransactions.createdAt, sourceType: creditTransactions.sourceType, skillSlug: creditTransactions.skillSlug, skillName: skills.name, metadata: creditTransactions.metadata, reversalOfTransactionId: creditTransactions.reversalOfTransactionId, contextType: creditContexts.contextType, contextSourceType: creditContexts.sourceType, contextStatus: creditContexts.attributionStatus, contextLabel: creditContexts.displayNameSnapshot, rootContextId: rootContexts.id, rootLabel: rootContexts.displayNameSnapshot, stageLabel: sql<string | null>`NULL`, relationType: creditTransactionContexts.relationType }).from(creditTransactions).leftJoin(creditTransactionContexts, and(eq(creditTransactionContexts.transactionId, creditTransactions.id), eq(creditTransactionContexts.isPrimary, true))).leftJoin(creditContexts, and(eq(creditContexts.id, creditTransactionContexts.contextId), eq(creditContexts.tenantId, scope.tenantId))).leftJoin(rootContexts, and(eq(rootContexts.id, creditContexts.rootContextId), eq(rootContexts.tenantId, scope.tenantId))).leftJoin(skills, eq(skills.slug, creditTransactions.skillSlug)).where(and(inArray(creditTransactions.id, reversalIds), eq(creditTransactions.tenantId, scope.tenantId)))
    : [];
  const originals = new Map(originalRows.filter(row => row.tenantId === scope.tenantId && (scope.userId === undefined || row.userId === scope.userId)).map(row => [row.id, row]));

  const groups = new Map<string, CreditContextReportRow>();
  const totals = { chargedCredits: 0, refundedCredits: 0, netActualCredits: 0, usageTransactionCount: 0, refundTransactionCount: 0, adjustmentTransactionCount: 0, unattributedTransactionCount: 0, ambiguousTransactionCount: 0, unattributedChargedCredits: 0, unattributedRefundedCredits: 0, unattributedNetActualCredits: 0, ambiguousChargedCredits: 0, ambiguousRefundedCredits: 0, ambiguousNetActualCredits: 0, integrityExceptionTransactionCount: 0, integrityExceptionCredits: 0 };
  for (const row of rows) {
    const classified = classify(row, originals);
    if (classified.kind === "excluded") continue;
    if (classified.exception > 0) {
      totals.integrityExceptionTransactionCount += 1;
      totals.integrityExceptionCredits += classified.exception;
    }
    if (classified.kind === "invalid") continue;
    totals.chargedCredits += classified.charged;
    totals.refundedCredits += classified.refunded;
    totals.netActualCredits += classified.charged - classified.refunded;
    if (classified.kind === "usage") totals.usageTransactionCount += 1;
    if (classified.kind === "refund") totals.refundTransactionCount += 1;
    if (classified.kind === "adjustment") totals.adjustmentTransactionCount += 1;
    // A refund is a ledger event in its own right, but its accounting context
    // is the usage transaction it reverses. Reuse the verified original
    // snapshot when the refund row has no primary link.
    const original = row.reversalOfTransactionId ? originals.get(row.reversalOfTransactionId) : undefined;
    const contextRow = classified.kind === "refund" && original && !row.contextId
      ? { ...row, contextId: original.contextId, contextType: original.contextType, contextSourceType: original.contextSourceType, contextStatus: original.contextStatus, contextLabel: original.contextLabel, rootContextId: original.rootContextId, rootLabel: original.rootLabel, stageLabel: original.stageLabel }
      : row;
    const status: CreditContextAttributionStatus = contextRow.contextStatus === "ambiguous" ? "ambiguous" : contextRow.contextId && contextRow.contextLabel ? (contextRow.contextStatus === "partial" ? "partial" : "linked") : "unattributed";
    const named = status === "linked" || status === "partial";
    const groupKey = named ? `${contextRow.rootContextId ?? contextRow.contextId}:${status}` : `null:${status}`;
    if (!named) {
      const prefix = status === "ambiguous" ? "ambiguous" : "unattributed";
      totals[`${prefix}TransactionCount` as "ambiguousTransactionCount" | "unattributedTransactionCount"] += 1;
      totals[`${prefix}ChargedCredits` as "ambiguousChargedCredits" | "unattributedChargedCredits"] += classified.charged;
      totals[`${prefix}RefundedCredits` as "ambiguousRefundedCredits" | "unattributedRefundedCredits"] += classified.refunded;
      totals[`${prefix}NetActualCredits` as "ambiguousNetActualCredits" | "unattributedNetActualCredits"] += classified.charged - classified.refunded;
    }
    const aggregate = groups.get(groupKey) ?? emptyRow(groupKey, status, contextRow);
    aggregate.chargedCredits += classified.charged;
    aggregate.refundedCredits += classified.refunded;
    aggregate.netActualCredits += classified.charged - classified.refunded;
    if (classified.kind === "usage") aggregate.usageTransactionCount += 1;
    if (classified.kind === "refund") aggregate.refundTransactionCount += 1;
    if (classified.kind === "adjustment") aggregate.adjustmentTransactionCount += 1;
    aggregate.firstUsedAt = aggregate.firstUsedAt && aggregate.firstUsedAt < row.createdAt ? aggregate.firstUsedAt : row.createdAt;
    aggregate.lastUsedAt = aggregate.lastUsedAt && aggregate.lastUsedAt > row.createdAt ? aggregate.lastUsedAt : row.createdAt;
    const charged = classified.charged;
    const refunded = classified.refunded;
    addBreakdown(aggregate.bySourceType, item => item.sourceType === row.sourceType, () => ({ sourceType: row.sourceType, chargedCredits: 0, refundedCredits: 0, netActualCredits: 0, count: 0 }), charged, refunded);
    addBreakdown(aggregate.byContextSourceType, item => item.contextSourceType === contextRow.contextSourceType, () => ({ contextSourceType: contextRow.contextSourceType, chargedCredits: 0, refundedCredits: 0, netActualCredits: 0, count: 0 }), charged, refunded);
    addBreakdown(aggregate.bySkill, item => item.skillSlug === row.skillSlug, () => ({ skillSlug: row.skillSlug, skillName: row.skillName, chargedCredits: 0, refundedCredits: 0, netActualCredits: 0, count: 0 }), charged, refunded);
    const model = metadataString(row.metadata, "model") ?? metadataString(row.metadata, "modelId");
    const provider = metadataString(row.metadata, "provider");
    addBreakdown(aggregate.byModel, item => item.model === model && item.provider === provider, () => ({ model, provider, chargedCredits: 0, refundedCredits: 0, netActualCredits: 0, count: 0 }), charged, refunded);
    addBreakdown(aggregate.byStage, item => item.stageLabel === contextRow.stageLabel, () => ({ stageLabel: contextRow.stageLabel, chargedCredits: 0, refundedCredits: 0, netActualCredits: 0, count: 0 }), charged, refunded);
    if (named && contextRow.contextId && contextRow.contextLabel) {
      const work = aggregate.byWork.find(item => item.contextId === contextRow.contextId) ?? (() => {
        const next = { contextId: contextRow.contextId!, workType: contextRow.contextType ?? "work", workLabel: contextRow.contextLabel!, chargedCredits: 0, refundedCredits: 0, netActualCredits: 0, transactionCount: 0 };
        aggregate.byWork.push(next);
        return next;
      })();
      work.chargedCredits += charged;
      work.refundedCredits += refunded;
      work.netActualCredits += charged - refunded;
      work.transactionCount += 1;
    }
    groups.set(groupKey, aggregate);
  }
  const allRows = Array.from(groups.values()).sort((a, b) => b.netActualCredits - a.netActualCredits || String(a.rootContextId).localeCompare(String(b.rootContextId)) || a.attributionStatus.localeCompare(b.attributionStatus) || String(a.primaryContextId).localeCompare(String(b.primaryContextId)));
  const visibleRows = filters.includeUnattributed ? allRows : allRows.filter(row => row.rootContextId !== null);
  const page = visibleRows.slice(offset, offset + limit);
  return {
    scope: scope.userId === undefined ? (scope.isAdmin ? "tenant" : "self") : (scope.isAdmin ? "user" : "self"),
    distinctUserCount: scope.userId === undefined ? new Set(rows.map(row => row.userId)).size : rows.length ? 1 : 0,
    rows: page,
    totals,
    pagination: { limit, offset, hasMore: offset + limit < visibleRows.length, nextOffset: offset + limit < visibleRows.length ? offset + limit : null, asOfTransactionId },
  };
}

export async function auditAdminCreditReport(scope: CreditReportScope, filters: CreditContextReportFilters, eventType = "credit_report_export_requested") {
  auditCreditContextEvent({ eventType, tenantId: scope.tenantId, userId: scope.operatorId, reason: JSON.stringify({ ...filters, asOfTransactionId: filters.asOfTransactionId }).slice(0, 160) });
}

export type CreditSeriesUsageCoverage = "complete" | "partial" | "legacy_unattributed" | "none";

export interface CreditSeriesUsageSummary {
  seriesId: number;
  seriesTitle: string;
  hasContext: boolean;
  coverage: CreditSeriesUsageCoverage;
  creditsPerUsd: number;
  chargedCredits: number;
  refundedCredits: number;
  netActualCredits: number;
  usdEstimate: number;
  usageTransactionCount: number;
  refundTransactionCount: number;
  adjustmentTransactionCount: number;
  transactionCount: number;
  integrityExceptionTransactionCount: number;
  integrityExceptionCredits: number;
  firstUsedAt: Date | null;
  lastUsedAt: Date | null;
  asOfTransactionId: number;
  refreshedAt: Date;
}

/**
 * Return an all-time, tenant/user-safe cost summary for one Drama Series.
 * Context links are authoritative; metadataSeriesId is only a compatibility
 * bridge for historical charges created before context writes were enabled.
 */
export async function getCreditContextUsageBySeries(
  scope: CreditReportScope & { userId: number },
  seriesId: number,
): Promise<CreditSeriesUsageSummary> {
  if (!Number.isSafeInteger(seriesId) || seriesId <= 0) {
    throw new CreditContextError("CONTEXT_NOT_FOUND", "Invalid Drama Series reference");
  }
  let db;
  try {
    db = await getDb();
  } catch {
    throw new CreditContextError("REPORT_UNAVAILABLE", "Credit usage report is temporarily unavailable");
  }
  if (!db) throw new CreditContextError("REPORT_UNAVAILABLE", "Credit usage report is temporarily unavailable");

  const [series] = await db.select({
    id: verticalDramaSeries.id,
    title: verticalDramaSeries.title,
  }).from(verticalDramaSeries).where(and(
    eq(verticalDramaSeries.id, seriesId),
    eq(verticalDramaSeries.tenantId, scope.tenantId),
    eq(verticalDramaSeries.userId, scope.userId),
  )).limit(1);
  if (!series) throw new CreditContextError("CONTEXT_UNAUTHORIZED", "Drama Series is not available");

  const [context] = await db.select({ id: creditContexts.id }).from(creditContexts).where(and(
    eq(creditContexts.tenantId, scope.tenantId),
    eq(creditContexts.ownerUserId, scope.userId),
    eq(creditContexts.sourceType, "vertical_drama_series"),
    eq(creditContexts.sourceId, String(seriesId)),
  )).limit(1);

  const report = await getCreditContextReport(scope, {
    ...(context ? { rootContextId: context.id } : {}),
    metadataSeriesId: String(seriesId),
    startDate: new Date(0),
    endDate: new Date(),
    includeUnattributed: true,
    limit: 100,
    offset: 0,
  });
  const totals = report.totals;
  const transactionCount = totals.usageTransactionCount + totals.refundTransactionCount + totals.adjustmentTransactionCount;
  const unattributedCount = totals.unattributedTransactionCount + totals.ambiguousTransactionCount;
  const hasAccountingActivity = transactionCount > 0 || totals.integrityExceptionTransactionCount > 0;
  const coverage: CreditSeriesUsageCoverage = !hasAccountingActivity
    ? "none"
    : context && unattributedCount === 0 && totals.integrityExceptionTransactionCount === 0
      ? "complete"
      : context
        ? "partial"
        : "legacy_unattributed";
  const firstUsedAt = report.rows.reduce<Date | null>((current, row) => (
    row.firstUsedAt && (!current || row.firstUsedAt < current) ? row.firstUsedAt : current
  ), null);
  const lastUsedAt = report.rows.reduce<Date | null>((current, row) => (
    row.lastUsedAt && (!current || row.lastUsedAt > current) ? row.lastUsedAt : current
  ), null);
  const refreshedAt = new Date();

  return {
    seriesId,
    seriesTitle: series.title,
    hasContext: Boolean(context),
    coverage,
    creditsPerUsd: CREDITS_PER_USD,
    chargedCredits: totals.chargedCredits,
    refundedCredits: totals.refundedCredits,
    netActualCredits: totals.netActualCredits,
    usdEstimate: creditsToUsdEstimate(totals.netActualCredits),
    usageTransactionCount: totals.usageTransactionCount,
    refundTransactionCount: totals.refundTransactionCount,
    adjustmentTransactionCount: totals.adjustmentTransactionCount,
    transactionCount,
    integrityExceptionTransactionCount: totals.integrityExceptionTransactionCount,
    integrityExceptionCredits: totals.integrityExceptionCredits,
    firstUsedAt,
    lastUsedAt,
    asOfTransactionId: report.pagination.asOfTransactionId,
    refreshedAt,
  };
}

export async function getTransactionContextPresentations(
  transactionIds: number[],
  scope: CreditReportScope,
) {
  const fallback = { status: "unattributed" as const, primaryLabel: null, rootLabel: null, workTypeLabel: null, stageLabel: null, technicalRefsAvailable: false };
  if (!transactionIds.length || !scope.tenantId) return new Map<number, typeof fallback>();
  let db;
  try {
    db = await getDb();
  } catch {
    return new Map<number, typeof fallback>();
  }
  if (!db) return new Map<number, typeof fallback>();
  const rootContexts = alias(creditContexts, "credit_history_roots");
  let rows: Array<{ transactionId: number; contextId: string; contextLabel: string | null; contextType: string | null; contextStatus: string; rootLabel: string | null; stageLabel: string | null; rootContextId: string | null }>;
  try {
    rows = await db.select({ transactionId: creditTransactionContexts.transactionId, contextId: creditContexts.id, contextLabel: creditContexts.displayNameSnapshot, contextType: creditContexts.displayTypeSnapshot, contextStatus: creditContexts.attributionStatus, rootLabel: rootContexts.displayNameSnapshot, stageLabel: sql<string | null>`${creditContexts.snapshotJson}->>'stageLabel'`, rootContextId: rootContexts.id })
    .from(creditTransactionContexts)
    .innerJoin(creditTransactions, and(eq(creditTransactions.id, creditTransactionContexts.transactionId), eq(creditTransactions.tenantId, scope.tenantId), scope.userId === undefined ? sql`true` : eq(creditTransactions.userId, scope.userId)))
    .innerJoin(creditContexts, and(eq(creditContexts.id, creditTransactionContexts.contextId), eq(creditContexts.tenantId, scope.tenantId)))
    .leftJoin(rootContexts, and(eq(rootContexts.id, creditContexts.rootContextId), eq(rootContexts.tenantId, scope.tenantId)))
    .where(and(inArray(creditTransactionContexts.transactionId, transactionIds), eq(creditTransactionContexts.isPrimary, true)));
  } catch {
    return new Map<number, typeof fallback>();
  }
  return new Map(rows.map(row => [row.transactionId, {
    status: row.contextStatus === "ambiguous" ? "ambiguous" as const : row.contextStatus === "partial" ? "partial" as const : "linked" as const,
    primaryLabel: row.contextLabel,
    rootLabel: row.rootLabel ?? row.contextLabel,
    workTypeLabel: row.contextType,
    stageLabel: row.stageLabel,
    technicalRefsAvailable: false,
    primaryContextId: row.contextId,
    rootContextId: row.rootContextId ?? row.contextId,
  }]));
}

export function formatCreditContextReportCsv(report: CreditContextReport): string {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = ["เรื่อง,งาน,สถานะ,ใช้ไป,คืนเครดิต,สุทธิ,จำนวนรายการ"];
  for (const row of report.rows) {
    lines.push([row.rootLabel, row.primaryWorkLabel, row.attributionStatus, row.chargedCredits, row.refundedCredits, row.netActualCredits, row.usageTransactionCount + row.refundTransactionCount + row.adjustmentTransactionCount].map(escape).join(","));
  }
  lines.push(["รวม", "", "", report.totals.chargedCredits, report.totals.refundedCredits, report.totals.netActualCredits, report.totals.usageTransactionCount + report.totals.refundTransactionCount + report.totals.adjustmentTransactionCount].map(escape).join(","));
  return lines.join("\n");
}

export async function getCreditContextUsageDetail(
  scope: CreditReportScope,
  contextId: string,
  filters: CreditContextReportFilters = {},
) {
  let db;
  try {
    db = await getDb();
  } catch {
    throw new CreditContextError("REPORT_UNAVAILABLE", "Credit usage detail is temporarily unavailable");
  }
  if (!db) throw new CreditContextError("REPORT_UNAVAILABLE", "Credit usage detail is temporarily unavailable");
  const roots = alias(creditContexts, "credit_detail_roots");
  const [context] = await db.select({ id: creditContexts.id, tenantId: creditContexts.tenantId, ownerUserId: creditContexts.ownerUserId })
    .from(creditContexts)
    .where(and(eq(creditContexts.id, contextId), eq(creditContexts.tenantId, scope.tenantId)))
    .limit(1);
  if (!context || (scope.userId !== undefined && context.ownerUserId !== scope.userId)) {
    throw new CreditContextError("CONTEXT_UNAUTHORIZED", "Credit context is not available");
  }
  const report = await getCreditContextReport(scope, { ...filters, rootContextId: contextId });
  const linkedRows = await db.select({ id: creditTransactions.id })
    .from(creditTransactions)
    .leftJoin(creditTransactionContexts, and(eq(creditTransactionContexts.transactionId, creditTransactions.id), eq(creditTransactionContexts.isPrimary, true)))
    .leftJoin(creditContexts, and(eq(creditContexts.id, creditTransactionContexts.contextId), eq(creditContexts.tenantId, scope.tenantId)))
    .leftJoin(roots, and(eq(roots.id, creditContexts.rootContextId), eq(roots.tenantId, scope.tenantId)))
    .where(and(eq(creditTransactions.tenantId, scope.tenantId), scope.userId === undefined ? sql`true` : eq(creditTransactions.userId, scope.userId), or(eq(creditContexts.id, contextId), eq(roots.id, contextId))));
  const linkedTransactionIds = linkedRows.map(row => row.id);
  const contextCondition = linkedTransactionIds.length
    ? or(eq(creditContexts.id, contextId), eq(roots.id, contextId), inArray(creditTransactions.reversalOfTransactionId, linkedTransactionIds))
    : or(eq(creditContexts.id, contextId), eq(roots.id, contextId));
  const conditions = [eq(creditTransactions.tenantId, scope.tenantId), contextCondition];
  if (scope.userId !== undefined) conditions.push(eq(creditTransactions.userId, scope.userId));
  if (filters.startDate) conditions.push(gte(creditTransactions.createdAt, filters.startDate));
  if (filters.endDate) conditions.push(lt(creditTransactions.createdAt, filters.endDate));
  if (filters.asOfTransactionId !== undefined) conditions.push(lte(creditTransactions.id, filters.asOfTransactionId));
  const transactions = await db.select({ id: creditTransactions.id, amount: creditTransactions.amount, type: creditTransactions.type, createdAt: creditTransactions.createdAt, sourceType: creditTransactions.sourceType, skillSlug: creditTransactions.skillSlug, skillName: skills.name, reversalOfTransactionId: creditTransactions.reversalOfTransactionId, metadata: creditTransactions.metadata, contextId: creditContexts.id, contextLabel: creditContexts.displayNameSnapshot, stageLabel: sql<string | null>`${creditContexts.snapshotJson}->>'stageLabel'` })
    .from(creditTransactions)
    .leftJoin(creditTransactionContexts, and(eq(creditTransactionContexts.transactionId, creditTransactions.id), eq(creditTransactionContexts.isPrimary, true)))
    .leftJoin(creditContexts, and(eq(creditContexts.id, creditTransactionContexts.contextId), eq(creditContexts.tenantId, scope.tenantId)))
    .leftJoin(roots, and(eq(roots.id, creditContexts.rootContextId), eq(roots.tenantId, scope.tenantId)))
    .leftJoin(skills, eq(skills.slug, creditTransactions.skillSlug))
    .where(and(...conditions))
    .orderBy(desc(creditTransactions.createdAt), desc(creditTransactions.id));
  return {
    ...report,
    contextId,
    completeness: report.totals.unattributedTransactionCount || report.totals.ambiguousTransactionCount ? "partial" as const : "complete" as const,
    transactions: transactions.map(row => ({ id: row.id, amount: row.amount, type: row.type, createdAt: row.createdAt, sourceType: row.sourceType, skillSlug: row.skillSlug, skillName: row.skillName, reversalOfTransactionId: row.reversalOfTransactionId, model: metadataString(row.metadata, "model") ?? metadataString(row.metadata, "modelId"), provider: metadataString(row.metadata, "provider"), stageLabel: row.stageLabel, contextLabel: row.contextLabel })),
  };
}
