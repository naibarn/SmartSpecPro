/**
 * Social automation service layer.
 *
 * Stores and evaluates per-page or per-tenant rules, manages human approvals,
 * and executes approved actions through the existing inbox/publishing services.
 */

import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import {
  socialAutomationRules,
  socialConversations,
  socialHumanApprovals,
  socialPages,
  socialPosts,
  socialProviderConnections,
} from "../../drizzle/schema";
import { type DrizzleDB, getDb } from "../db";
import { auditLogger } from "./auditLogger";
import { getTenantFeatureFlag } from "./featureFlags";
import { verifyPageAccess } from "./socialAccessService";
import { sendReplyToConversation } from "./socialInboxService";
import { publishPublishingPostNow } from "./socialPublishingService";

export type SocialAutomationTriggerType = "new_message" | "keyword_match" | "unread_timeout";
export type SocialAutomationActionMode = "off" | "draft_only" | "approval_required" | "auto_send";
export type SocialAutomationApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type SocialAutomationEntityType = "reply" | "post";

export interface SocialAutomationPageSummary {
  id: number;
  label: string;
  status: string;
  pageName: string | null;
  pageCategory: string | null;
  providerPageId: string;
  aiActionMode: SocialAutomationActionMode | string;
  selectedForInbox: boolean;
  selectedForPublishing: boolean;
  selectedForModeration: boolean;
}

export interface SocialAutomationRuleSummary {
  id: number;
  tenantId: string;
  pageId: number | null;
  pageName: string | null;
  providerPageId: string | null;
  name: string;
  isEnabled: boolean;
  triggerType: SocialAutomationTriggerType | string;
  conditions: Record<string, unknown> | null;
  actionMode: SocialAutomationActionMode | string;
  policyConfig: Record<string, unknown> | null;
  createdByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialAutomationApprovalSummary {
  id: number;
  tenantId: string;
  pageId: number;
  pageName: string | null;
  providerPageId: string | null;
  entityType: SocialAutomationEntityType | string;
  entityId: number;
  proposedContent: string | null;
  confidence: number | null;
  status: SocialAutomationApprovalStatus | string;
  requestedBySystem: boolean;
  reviewedByUserId: number | null;
  decisionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialAutomationListResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SocialAutomationMatchResult {
  rule: SocialAutomationRuleSummary;
  page: {
    id: number;
    tenantId: string;
    pageName: string | null;
    providerPageId: string;
    status: string;
    aiActionMode: SocialAutomationActionMode | string;
    autoSendConfidenceThreshold: number;
  };
}

export interface AutomationRuleInput {
  name: string;
  pageId?: number | null;
  triggerType: SocialAutomationTriggerType;
  conditions?: Record<string, unknown> | null;
  actionMode?: SocialAutomationActionMode | null;
  policyConfig?: Record<string, unknown> | null;
}

export interface AutomationRuleUpdateInput {
  ruleId: number;
  name?: string;
  conditions?: Record<string, unknown> | null;
  actionMode?: SocialAutomationActionMode | null;
  policyConfig?: Record<string, unknown> | null;
}

export interface AutomationApprovalActionResult {
  approval: SocialAutomationApprovalSummary;
  result:
    | {
        kind: "reply";
        success: true;
        messageId: number;
        providerMessageId: string | null;
      }
    | {
        kind: "post";
        success: true;
        postId: number;
        providerPostId: string | null;
      }
    | null;
}

const DEFAULT_BLOCKED_AUTO_SEND_CATEGORIES = ["billing", "legal", "harassment", "refund", "complaint"];
const DEFAULT_TONE_GUIDE = "Professional, friendly, helpful";
const DEFAULT_APPROVAL_EXPIRY_HOURS = 24;
const DEFAULT_PAGE_LIST_LIMIT = 50;

function resolveDb(db?: DrizzleDB | null): Promise<DrizzleDB> {
  return Promise.resolve(db ?? getDb());
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item).toLowerCase())
    .filter((item) => item.length > 0);
}

function normalizeTriggerType(value: unknown): SocialAutomationTriggerType {
  if (value === "keyword_match" || value === "unread_timeout" || value === "new_message") {
    return value;
  }
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Invalid trigger type",
  });
}

function normalizeActionMode(value: unknown, fallback: SocialAutomationActionMode = "draft_only"): SocialAutomationActionMode {
  if (value === "off" || value === "draft_only" || value === "approval_required" || value === "auto_send") {
    return value;
  }
  return fallback;
}

function normalizeApprovalStatus(value: unknown): SocialAutomationApprovalStatus | undefined {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  return undefined;
}

function normalizePolicyConfig(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      blockedCategories: [...DEFAULT_BLOCKED_AUTO_SEND_CATEGORIES],
      toneGuide: DEFAULT_TONE_GUIDE,
    };
  }

  const config = value as Record<string, unknown>;
  const hasBlockedCategories = Object.prototype.hasOwnProperty.call(config, "blockedCategories");
  const blockedCategories = hasBlockedCategories ? normalizeStringArray(config.blockedCategories) : [...DEFAULT_BLOCKED_AUTO_SEND_CATEGORIES];
  return {
    ...config,
    blockedCategories,
    toneGuide: normalizeText(config.toneGuide) || DEFAULT_TONE_GUIDE,
  };
}

function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => normalizeText(part).toLowerCase())
      .filter((part) => part.length > 0);
  }
  return [];
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
}

function normalizeRuleConditions(
  triggerType: SocialAutomationTriggerType,
  value: unknown,
): Record<string, unknown> {
  const base = !value || typeof value !== "object" || Array.isArray(value) ? {} : ({ ...value } as Record<string, unknown>);

  if (triggerType === "keyword_match") {
    const keywords = parseKeywords(base.keywords ?? base.keywordText ?? base.keywordList);
    if (keywords.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Keyword match rules require at least one keyword",
      });
    }
    return {
      ...base,
      keywords,
    };
  }

  if (triggerType === "unread_timeout") {
    const threshold = parsePositiveInteger(base.threshold ?? base.unreadThreshold, 1);
    const timeoutMinutes = parsePositiveInteger(base.timeoutMinutes ?? base.timeout, 30);
    return {
      ...base,
      threshold,
      timeoutMinutes,
    };
  }

  return base;
}

function parseCursorDate(cursor?: string | null): Date | null {
  if (!cursor) return null;
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid cursor value",
    });
  }
  return parsed;
}

function toRuleSummary(row: {
  id: number;
  tenantId: string;
  pageId: number | null;
  name: string;
  isEnabled: boolean;
  triggerType: string;
  conditions: Record<string, unknown> | null;
  actionMode: string;
  policyConfig: Record<string, unknown> | null;
  createdByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
  pageName: string | null;
  providerPageId: string | null;
}): SocialAutomationRuleSummary {
  return {
    id: row.id,
    tenantId: row.tenantId,
    pageId: row.pageId,
    pageName: row.pageName,
    providerPageId: row.providerPageId,
    name: row.name,
    isEnabled: row.isEnabled,
    triggerType: row.triggerType,
    conditions: row.conditions ?? null,
    actionMode: row.actionMode,
    policyConfig: row.policyConfig ?? null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toApprovalSummary(row: {
  id: number;
  tenantId: string;
  pageId: number;
  entityType: string;
  entityId: number;
  proposedContent: string | null;
  confidence: number | null;
  status: string;
  requestedBySystem: boolean;
  reviewedByUserId: number | null;
  decisionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  pageName: string | null;
  providerPageId: string | null;
}): SocialAutomationApprovalSummary {
  return {
    id: row.id,
    tenantId: row.tenantId,
    pageId: row.pageId,
    pageName: row.pageName,
    providerPageId: row.providerPageId,
    entityType: row.entityType,
    entityId: row.entityId,
    proposedContent: row.proposedContent,
    confidence: row.confidence,
    status: row.status,
    requestedBySystem: row.requestedBySystem,
    reviewedByUserId: row.reviewedByUserId,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireUserPageAccess(
  pageId: number,
  userId: number,
  tenantId: string,
): Promise<void> {
  await verifyPageAccess(pageId, userId, tenantId, tenantId);
}

async function loadRuleContext(
  ruleId: number,
  tenantId: string,
): Promise<{
  rule: {
    id: number;
    tenantId: string;
    pageId: number | null;
    name: string;
    isEnabled: boolean;
    triggerType: string;
    conditions: Record<string, unknown> | null;
    actionMode: string;
    policyConfig: Record<string, unknown> | null;
    createdByUserId: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
}> {
  const db = await resolveDb();
  const rows = await db
    .select({
      id: socialAutomationRules.id,
      tenantId: socialAutomationRules.tenantId,
      pageId: socialAutomationRules.pageId,
      name: socialAutomationRules.name,
      isEnabled: socialAutomationRules.isEnabled,
      triggerType: socialAutomationRules.triggerType,
      conditions: socialAutomationRules.conditions,
      actionMode: socialAutomationRules.actionMode,
      policyConfig: socialAutomationRules.policyConfig,
      createdByUserId: socialAutomationRules.createdByUserId,
      createdAt: socialAutomationRules.createdAt,
      updatedAt: socialAutomationRules.updatedAt,
    })
    .from(socialAutomationRules)
    .where(and(eq(socialAutomationRules.id, ruleId), eq(socialAutomationRules.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Automation rule not found",
    });
  }

  return {
    rule: row,
  };
}

async function loadApprovalContext(
  approvalId: number,
  tenantId: string,
  userId: number,
): Promise<{
  approval: {
    id: number;
    tenantId: string;
    pageId: number;
    entityType: string;
    entityId: number;
    proposedContent: string | null;
    confidence: number | null;
    status: string;
    requestedBySystem: boolean;
    reviewedByUserId: number | null;
    decisionNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    pageName: string | null;
    providerPageId: string | null;
  };
  page: {
    id: number;
    tenantId: string;
    providerPageId: string;
    pageName: string | null;
    status: string;
  };
}> {
  const db = await resolveDb();
  const rows = await db
    .select({
      id: socialHumanApprovals.id,
      tenantId: socialHumanApprovals.tenantId,
      pageId: socialHumanApprovals.pageId,
      entityType: socialHumanApprovals.entityType,
      entityId: socialHumanApprovals.entityId,
      proposedContent: socialHumanApprovals.proposedContent,
      confidence: socialHumanApprovals.confidence,
      status: socialHumanApprovals.status,
      requestedBySystem: socialHumanApprovals.requestedBySystem,
      reviewedByUserId: socialHumanApprovals.reviewedByUserId,
      decisionNote: socialHumanApprovals.decisionNote,
      createdAt: socialHumanApprovals.createdAt,
      updatedAt: socialHumanApprovals.updatedAt,
      pageTenantId: socialPages.tenantId,
      providerPageId: socialPages.providerPageId,
      pageName: socialPages.pageName,
      pageStatus: socialPages.status,
    })
    .from(socialHumanApprovals)
    .innerJoin(socialPages, eq(socialHumanApprovals.pageId, socialPages.id))
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(
      and(
        eq(socialHumanApprovals.id, approvalId),
        eq(socialHumanApprovals.tenantId, tenantId),
        eq(socialPages.tenantId, tenantId),
        eq(socialProviderConnections.tenantId, tenantId),
        eq(socialProviderConnections.userId, userId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Approval not found",
    });
  }

  return {
    approval: {
      id: row.id,
      tenantId: row.tenantId,
      pageId: row.pageId,
      entityType: row.entityType,
      entityId: row.entityId,
      proposedContent: row.proposedContent,
      confidence: row.confidence,
      status: row.status,
      requestedBySystem: row.requestedBySystem,
      reviewedByUserId: row.reviewedByUserId,
      decisionNote: row.decisionNote,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      pageName: row.pageName,
      providerPageId: row.providerPageId,
    },
    page: {
      id: row.pageId,
      tenantId: row.pageTenantId,
      providerPageId: row.providerPageId,
      pageName: row.pageName,
      status: row.pageStatus,
    },
  };
}

async function loadConversationForTimeout(
  conversationId: number,
  tenantId: string,
): Promise<{
  unreadCount: number;
  lastInboundAt: Date | null;
}> {
  const db = await resolveDb();
  const rows = await db
    .select({
      unreadCount: socialConversations.unreadCount,
      lastInboundAt: socialConversations.lastInboundAt,
    })
    .from(socialConversations)
    .where(and(eq(socialConversations.id, conversationId), eq(socialConversations.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found",
    });
  }

  return {
    unreadCount: Number(row.unreadCount ?? 0),
    lastInboundAt: row.lastInboundAt,
  };
}

async function loadAutomationPage(
  pageId: number,
  tenantId: string,
): Promise<{
  id: number;
  tenantId: string;
  pageName: string | null;
  providerPageId: string;
  status: string;
  aiActionMode: SocialAutomationActionMode | string;
  autoSendConfidenceThreshold: number;
}> {
  const db = await resolveDb();
  const rows = await db
    .select({
      id: socialPages.id,
      tenantId: socialPages.tenantId,
      pageName: socialPages.pageName,
      providerPageId: socialPages.providerPageId,
      status: socialPages.status,
      aiActionMode: socialPages.aiActionMode,
      autoSendConfidenceThreshold: socialPages.autoSendConfidenceThreshold,
    })
    .from(socialPages)
    .where(and(eq(socialPages.id, pageId), eq(socialPages.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Social page not found",
    });
  }

  return {
    id: row.id,
    tenantId: row.tenantId,
    pageName: row.pageName,
    providerPageId: row.providerPageId,
    status: row.status,
    aiActionMode: row.aiActionMode,
    autoSendConfidenceThreshold: Number(row.autoSendConfidenceThreshold ?? 0.95),
  };
}

function loadPotentialApprovalOutcome(
  approval: SocialAutomationApprovalSummary,
  editedContent?: string | null,
): string {
  const trimmed = normalizeText(editedContent);
  if (trimmed) return trimmed;
  return approval.proposedContent ?? "";
}

export async function listAutomationPages(tenantId: string, userId: number): Promise<SocialAutomationPageSummary[]> {
  const db = await resolveDb();
  const rows = await db
    .select({
      id: socialPages.id,
      tenantId: socialPages.tenantId,
      pageName: socialPages.pageName,
      pageCategory: socialPages.pageCategory,
      providerPageId: socialPages.providerPageId,
      status: socialPages.status,
      aiActionMode: socialPages.aiActionMode,
      selectedForInbox: socialPages.selectedForInbox,
      selectedForPublishing: socialPages.selectedForPublishing,
      selectedForModeration: socialPages.selectedForModeration,
    })
    .from(socialPages)
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(
      and(
        eq(socialPages.tenantId, tenantId),
        eq(socialProviderConnections.tenantId, tenantId),
        eq(socialProviderConnections.userId, userId),
        eq(socialPages.status, "active"),
      ),
    )
    .orderBy(asc(socialPages.pageName), asc(socialPages.id))
    .limit(DEFAULT_PAGE_LIST_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    label: row.pageName || `Page ${row.providerPageId}`,
    status: row.status,
    pageName: row.pageName,
    pageCategory: row.pageCategory,
    providerPageId: row.providerPageId,
    aiActionMode: row.aiActionMode,
    selectedForInbox: row.selectedForInbox,
    selectedForPublishing: row.selectedForPublishing,
    selectedForModeration: row.selectedForModeration,
  }));
}

export async function listAutomationRules(params: {
  tenantId: string;
  pageId?: number | null;
}): Promise<SocialAutomationRuleSummary[]> {
  const db = await resolveDb();
  const conditions = [eq(socialAutomationRules.tenantId, params.tenantId)];
  if (params.pageId !== undefined && params.pageId !== null) {
    conditions.push(eq(socialAutomationRules.pageId, params.pageId));
  }

  const rows = await db
    .select({
      id: socialAutomationRules.id,
      tenantId: socialAutomationRules.tenantId,
      pageId: socialAutomationRules.pageId,
      name: socialAutomationRules.name,
      isEnabled: socialAutomationRules.isEnabled,
      triggerType: socialAutomationRules.triggerType,
      conditions: socialAutomationRules.conditions,
      actionMode: socialAutomationRules.actionMode,
      policyConfig: socialAutomationRules.policyConfig,
      createdByUserId: socialAutomationRules.createdByUserId,
      createdAt: socialAutomationRules.createdAt,
      updatedAt: socialAutomationRules.updatedAt,
      pageName: socialPages.pageName,
      providerPageId: socialPages.providerPageId,
    })
    .from(socialAutomationRules)
    .leftJoin(socialPages, eq(socialAutomationRules.pageId, socialPages.id))
    .where(and(...conditions))
    .orderBy(desc(socialAutomationRules.createdAt), desc(socialAutomationRules.id));

  return rows.map(toRuleSummary);
}

export async function createAutomationRule(params: {
  tenantId: string;
  userId: number;
  input: AutomationRuleInput;
}): Promise<SocialAutomationRuleSummary> {
  const db = await resolveDb();
  const pageId = params.input.pageId ?? null;
  if (pageId !== null) {
    await requireUserPageAccess(pageId, params.userId, params.tenantId);
  }

  const triggerType = normalizeTriggerType(params.input.triggerType);
  const conditions = normalizeRuleConditions(triggerType, params.input.conditions);
  const actionMode = normalizeActionMode(params.input.actionMode ?? "draft_only", "draft_only");
  const policyConfig = normalizePolicyConfig(params.input.policyConfig);
  const now = new Date();

  const inserted = await db
    .insert(socialAutomationRules)
    .values({
      tenantId: params.tenantId,
      pageId,
      name: normalizeText(params.input.name),
      isEnabled: false,
      triggerType,
      conditions,
      actionMode,
      policyConfig,
      createdByUserId: params.userId,
      updatedAt: now,
    })
    .returning({
      id: socialAutomationRules.id,
      tenantId: socialAutomationRules.tenantId,
      pageId: socialAutomationRules.pageId,
      name: socialAutomationRules.name,
      isEnabled: socialAutomationRules.isEnabled,
      triggerType: socialAutomationRules.triggerType,
      conditions: socialAutomationRules.conditions,
      actionMode: socialAutomationRules.actionMode,
      policyConfig: socialAutomationRules.policyConfig,
      createdByUserId: socialAutomationRules.createdByUserId,
      createdAt: socialAutomationRules.createdAt,
      updatedAt: socialAutomationRules.updatedAt,
    });

  const row = inserted[0];
  if (!row) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create automation rule",
    });
  }

  const pageContext = pageId !== null ? await loadAutomationPage(pageId, params.tenantId) : null;
  return toRuleSummary({
    ...row,
    name: row.name,
    pageName: pageContext?.pageName ?? null,
    providerPageId: pageContext?.providerPageId ?? null,
  });
}

export async function updateAutomationRule(params: {
  tenantId: string;
  userId: number;
  input: AutomationRuleUpdateInput;
}): Promise<SocialAutomationRuleSummary> {
  const db = await resolveDb();
  const context = await loadRuleContext(params.input.ruleId, params.tenantId);
  if (context.rule.pageId !== null) {
    await requireUserPageAccess(context.rule.pageId, params.userId, params.tenantId);
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (params.input.name !== undefined) {
    updates.name = normalizeText(params.input.name);
  }
  if (params.input.conditions !== undefined) {
    updates.conditions = normalizeRuleConditions(
      normalizeTriggerType(context.rule.triggerType),
      params.input.conditions,
    );
  }
  if (params.input.actionMode !== undefined) {
    updates.actionMode = normalizeActionMode(params.input.actionMode, normalizeActionMode(context.rule.actionMode));
  }
  if (params.input.policyConfig !== undefined) {
    updates.policyConfig = normalizePolicyConfig(params.input.policyConfig);
  }

  await db
    .update(socialAutomationRules)
    .set(updates)
    .where(and(eq(socialAutomationRules.id, params.input.ruleId), eq(socialAutomationRules.tenantId, params.tenantId)));

  const rows = await db
    .select({
      id: socialAutomationRules.id,
      tenantId: socialAutomationRules.tenantId,
      pageId: socialAutomationRules.pageId,
      name: socialAutomationRules.name,
      isEnabled: socialAutomationRules.isEnabled,
      triggerType: socialAutomationRules.triggerType,
      conditions: socialAutomationRules.conditions,
      actionMode: socialAutomationRules.actionMode,
      policyConfig: socialAutomationRules.policyConfig,
      createdByUserId: socialAutomationRules.createdByUserId,
      createdAt: socialAutomationRules.createdAt,
      updatedAt: socialAutomationRules.updatedAt,
      pageName: socialPages.pageName,
      providerPageId: socialPages.providerPageId,
    })
    .from(socialAutomationRules)
    .leftJoin(socialPages, eq(socialAutomationRules.pageId, socialPages.id))
    .where(and(eq(socialAutomationRules.id, params.input.ruleId), eq(socialAutomationRules.tenantId, params.tenantId)))
    .limit(1);

  return toRuleSummary(rows[0]!);
}

export async function toggleAutomationRule(params: {
  tenantId: string;
  userId: number;
  ruleId: number;
  isEnabled: boolean;
}): Promise<SocialAutomationRuleSummary> {
  const db = await resolveDb();
  const context = await loadRuleContext(params.ruleId, params.tenantId);
  if (context.rule.pageId !== null) {
    await requireUserPageAccess(context.rule.pageId, params.userId, params.tenantId);
  }

  await db
    .update(socialAutomationRules)
    .set({
      isEnabled: params.isEnabled,
      updatedAt: new Date(),
    })
    .where(and(eq(socialAutomationRules.id, params.ruleId), eq(socialAutomationRules.tenantId, params.tenantId)));

  const rows = await db
    .select({
      id: socialAutomationRules.id,
      tenantId: socialAutomationRules.tenantId,
      pageId: socialAutomationRules.pageId,
      name: socialAutomationRules.name,
      isEnabled: socialAutomationRules.isEnabled,
      triggerType: socialAutomationRules.triggerType,
      conditions: socialAutomationRules.conditions,
      actionMode: socialAutomationRules.actionMode,
      policyConfig: socialAutomationRules.policyConfig,
      createdByUserId: socialAutomationRules.createdByUserId,
      createdAt: socialAutomationRules.createdAt,
      updatedAt: socialAutomationRules.updatedAt,
      pageName: socialPages.pageName,
      providerPageId: socialPages.providerPageId,
    })
    .from(socialAutomationRules)
    .leftJoin(socialPages, eq(socialAutomationRules.pageId, socialPages.id))
    .where(and(eq(socialAutomationRules.id, params.ruleId), eq(socialAutomationRules.tenantId, params.tenantId)))
    .limit(1);

  return toRuleSummary(rows[0]!);
}

export async function deleteAutomationRule(params: {
  tenantId: string;
  userId: number;
  ruleId: number;
}): Promise<{ success: true; ruleId: number }> {
  const db = await resolveDb();
  const context = await loadRuleContext(params.ruleId, params.tenantId);
  if (context.rule.pageId !== null) {
    await requireUserPageAccess(context.rule.pageId, params.userId, params.tenantId);
  }

  await db
    .delete(socialAutomationRules)
    .where(and(eq(socialAutomationRules.id, params.ruleId), eq(socialAutomationRules.tenantId, params.tenantId)));

  return { success: true, ruleId: params.ruleId };
}

export async function expireOldApprovals(tenantId: string, db?: DrizzleDB | null): Promise<number> {
  const resolvedDb = await resolveDb(db);
  const cutoff = new Date(Date.now() - DEFAULT_APPROVAL_EXPIRY_HOURS * 60 * 60 * 1000);
  const expired = await resolvedDb
    .update(socialHumanApprovals)
    .set({
      status: "expired",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(socialHumanApprovals.tenantId, tenantId),
        eq(socialHumanApprovals.status, "pending"),
        lt(socialHumanApprovals.createdAt, cutoff),
      ),
    )
    .returning({ id: socialHumanApprovals.id });

  return expired.length;
}

export async function listAutomationApprovals(params: {
  tenantId: string;
  userId: number;
  pageId?: number | null;
  status?: SocialAutomationApprovalStatus | "all" | null;
  cursor?: string | null;
  limit?: number;
}): Promise<SocialAutomationListResponse<SocialAutomationApprovalSummary>> {
  const db = await resolveDb();
  if (params.pageId !== undefined && params.pageId !== null) {
    await requireUserPageAccess(params.pageId, params.userId, params.tenantId);
  }

  await expireOldApprovals(params.tenantId, db);

  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const cursorDate = parseCursorDate(params.cursor);
  const conditions = [eq(socialHumanApprovals.tenantId, params.tenantId)];
  if (params.pageId !== undefined && params.pageId !== null) {
    conditions.push(eq(socialHumanApprovals.pageId, params.pageId));
  }
  const normalizedStatus = params.status ? normalizeApprovalStatus(params.status) : undefined;
  if (normalizedStatus) {
    conditions.push(eq(socialHumanApprovals.status, normalizedStatus));
  }
  if (cursorDate) {
    conditions.push(lt(socialHumanApprovals.createdAt, cursorDate));
  }

  const rows = await db
    .select({
      id: socialHumanApprovals.id,
      tenantId: socialHumanApprovals.tenantId,
      pageId: socialHumanApprovals.pageId,
      entityType: socialHumanApprovals.entityType,
      entityId: socialHumanApprovals.entityId,
      proposedContent: socialHumanApprovals.proposedContent,
      confidence: socialHumanApprovals.confidence,
      status: socialHumanApprovals.status,
      requestedBySystem: socialHumanApprovals.requestedBySystem,
      reviewedByUserId: socialHumanApprovals.reviewedByUserId,
      decisionNote: socialHumanApprovals.decisionNote,
      createdAt: socialHumanApprovals.createdAt,
      updatedAt: socialHumanApprovals.updatedAt,
      pageName: socialPages.pageName,
      providerPageId: socialPages.providerPageId,
    })
    .from(socialHumanApprovals)
    .leftJoin(socialPages, eq(socialHumanApprovals.pageId, socialPages.id))
    .where(and(...conditions))
    .orderBy(desc(socialHumanApprovals.createdAt), desc(socialHumanApprovals.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: pageRows.map(toApprovalSummary),
    nextCursor: hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1]?.createdAt.toISOString() ?? null : null,
    hasMore,
  };
}

export async function approveAutomationAction(params: {
  tenantId: string;
  userId: number;
  approvalId: number;
  editedContent?: string | null;
}): Promise<AutomationApprovalActionResult> {
  const db = await resolveDb();
  await expireOldApprovals(params.tenantId, db);
  const context = await loadApprovalContext(params.approvalId, params.tenantId, params.userId);

  if (context.approval.status !== "pending") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Only pending approvals can be approved",
    });
  }

  const now = new Date();
  await db
    .update(socialHumanApprovals)
    .set({
      status: "approved",
      reviewedByUserId: params.userId,
      updatedAt: now,
    })
    .where(and(eq(socialHumanApprovals.id, params.approvalId), eq(socialHumanApprovals.tenantId, params.tenantId)));

  let result: AutomationApprovalActionResult["result"] = null;
  const content = loadPotentialApprovalOutcome(context.approval, params.editedContent);

  if (context.approval.entityType === "reply") {
    const replyResult = await sendReplyToConversation({
      tenantId: params.tenantId,
      userId: params.userId,
      conversationId: context.approval.entityId,
      body: content,
    });
    result = {
      kind: "reply",
      success: true,
      messageId: replyResult.messageId,
      providerMessageId: replyResult.providerMessageId,
    };
  } else if (context.approval.entityType === "post") {
    if (params.editedContent !== undefined && params.editedContent !== null) {
      await db
        .update(socialPosts)
        .set({
          contentText: content,
          updatedAt: now,
        })
        .where(and(eq(socialPosts.id, context.approval.entityId), eq(socialPosts.tenantId, params.tenantId)));
    }

    const published = await publishPublishingPostNow({
      tenantId: params.tenantId,
      userId: params.userId,
      postId: context.approval.entityId,
    });
    result = {
      kind: "post",
      success: true,
      postId: published.id,
      providerPostId: published.providerPostId,
    };
  } else {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported approval entity type: ${context.approval.entityType}`,
    });
  }

  auditLogger.log({
    eventType: "social.approval.approved",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      approvalId: context.approval.id,
      pageId: context.page.id,
      entityType: context.approval.entityType,
      entityId: context.approval.entityId,
      editedContentProvided: normalizeText(params.editedContent).length > 0,
    },
  });

  const updatedApproval = await loadApprovalContext(params.approvalId, params.tenantId, params.userId);
  return {
    approval: toApprovalSummary({
      ...updatedApproval.approval,
    }),
    result,
  };
}

export async function rejectAutomationAction(params: {
  tenantId: string;
  userId: number;
  approvalId: number;
  note?: string | null;
}): Promise<SocialAutomationApprovalSummary> {
  const db = await resolveDb();
  await expireOldApprovals(params.tenantId, db);
  const context = await loadApprovalContext(params.approvalId, params.tenantId, params.userId);

  if (context.approval.status !== "pending") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Only pending approvals can be rejected",
    });
  }

  const now = new Date();
  await db
    .update(socialHumanApprovals)
    .set({
      status: "rejected",
      reviewedByUserId: params.userId,
      decisionNote: normalizeText(params.note) || null,
      updatedAt: now,
    })
    .where(and(eq(socialHumanApprovals.id, params.approvalId), eq(socialHumanApprovals.tenantId, params.tenantId)));

  auditLogger.log({
    eventType: "social.approval.rejected",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      approvalId: context.approval.id,
      pageId: context.page.id,
      entityType: context.approval.entityType,
      entityId: context.approval.entityId,
      note: normalizeText(params.note) || null,
    },
  });

  const updatedApproval = await loadApprovalContext(params.approvalId, params.tenantId, params.userId);
  return toApprovalSummary({
    ...updatedApproval.approval,
  });
}

export async function listAutomationPageRules(params: {
  tenantId: string;
  userId: number;
  pageId?: number | null;
}): Promise<SocialAutomationRuleSummary[]> {
  if (params.pageId !== undefined && params.pageId !== null) {
    await requireUserPageAccess(params.pageId, params.userId, params.tenantId);
  }
  return listAutomationRules({
    tenantId: params.tenantId,
    pageId: params.pageId,
  });
}

export async function matchAutomationRules(params: {
  tenantId: string;
  pageId: number;
  messageBody: string;
  conversationId: number;
  db?: DrizzleDB | null;
}): Promise<SocialAutomationMatchResult | null> {
  const enabled = await getTenantFeatureFlag("META_CHANNELS_ENABLED", params.tenantId);
  if (!enabled) {
    return null;
  }

  const db = await resolveDb(params.db);
  const pageRows = await db
    .select({
      id: socialPages.id,
      tenantId: socialPages.tenantId,
      pageName: socialPages.pageName,
      providerPageId: socialPages.providerPageId,
      status: socialPages.status,
      aiActionMode: socialPages.aiActionMode,
      autoSendConfidenceThreshold: socialPages.autoSendConfidenceThreshold,
    })
    .from(socialPages)
    .where(and(eq(socialPages.id, params.pageId), eq(socialPages.tenantId, params.tenantId)))
    .limit(1);

  const page = pageRows[0];
  if (!page || page.status !== "active" || normalizeActionMode(page.aiActionMode, "off") === "off") {
    return null;
  }

  const conversation = await loadConversationForTimeout(params.conversationId, params.tenantId);
  const rules = await db
    .select({
      id: socialAutomationRules.id,
      tenantId: socialAutomationRules.tenantId,
      pageId: socialAutomationRules.pageId,
      name: socialAutomationRules.name,
      isEnabled: socialAutomationRules.isEnabled,
      triggerType: socialAutomationRules.triggerType,
      conditions: socialAutomationRules.conditions,
      actionMode: socialAutomationRules.actionMode,
      policyConfig: socialAutomationRules.policyConfig,
      createdByUserId: socialAutomationRules.createdByUserId,
      createdAt: socialAutomationRules.createdAt,
      updatedAt: socialAutomationRules.updatedAt,
      pageName: socialPages.pageName,
      providerPageId: socialPages.providerPageId,
    })
    .from(socialAutomationRules)
    .leftJoin(socialPages, eq(socialAutomationRules.pageId, socialPages.id))
    .where(
      and(
        eq(socialAutomationRules.tenantId, params.tenantId),
        eq(socialAutomationRules.isEnabled, true),
        or(
          eq(socialAutomationRules.pageId, params.pageId),
          isNull(socialAutomationRules.pageId),
        ),
      ),
    )
    .orderBy(
      sql`case when ${socialAutomationRules.pageId} = ${params.pageId} then 1 else 0 end desc`,
      sql`case ${socialAutomationRules.triggerType}
        when 'keyword_match' then 3
        when 'unread_timeout' then 2
        else 1
      end desc`,
      desc(socialAutomationRules.updatedAt),
      desc(socialAutomationRules.id),
    );

  const normalizedMessageBody = normalizeText(params.messageBody).toLowerCase();
  for (const rule of rules) {
    const triggerType = normalizeTriggerType(rule.triggerType);
    const conditions = rule.conditions ?? {};

    if (triggerType === "new_message") {
      return {
        rule: toRuleSummary(rule),
        page: {
          id: page.id,
          tenantId: page.tenantId,
          pageName: page.pageName,
          providerPageId: page.providerPageId,
          status: page.status,
          aiActionMode: page.aiActionMode,
          autoSendConfidenceThreshold: Number(page.autoSendConfidenceThreshold ?? 0.95),
        },
      };
    }

    if (triggerType === "keyword_match") {
      const keywords = parseKeywords((conditions as Record<string, unknown>).keywords);
      if (keywords.length > 0 && keywords.some((keyword) => normalizedMessageBody.includes(keyword))) {
        return {
          rule: toRuleSummary(rule),
          page: {
            id: page.id,
            tenantId: page.tenantId,
            pageName: page.pageName,
            providerPageId: page.providerPageId,
            status: page.status,
            aiActionMode: page.aiActionMode,
            autoSendConfidenceThreshold: Number(page.autoSendConfidenceThreshold ?? 0.95),
          },
        };
      }
    }

    if (triggerType === "unread_timeout") {
      const threshold = parsePositiveInteger((conditions as Record<string, unknown>).threshold, 1);
      const timeoutMinutes = parsePositiveInteger((conditions as Record<string, unknown>).timeoutMinutes, 30);
      const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
      if (conversation.unreadCount > threshold && conversation.lastInboundAt && conversation.lastInboundAt < cutoff) {
        return {
          rule: toRuleSummary(rule),
          page: {
            id: page.id,
            tenantId: page.tenantId,
            pageName: page.pageName,
            providerPageId: page.providerPageId,
            status: page.status,
            aiActionMode: page.aiActionMode,
            autoSendConfidenceThreshold: Number(page.autoSendConfidenceThreshold ?? 0.95),
          },
        };
      }
    }
  }

  return null;
}
