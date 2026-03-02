/**
 * Channel Router Service — F10
 *
 * Evaluates tenant-configured routing rules against inbound channel messages.
 * Rules are loaded from Redis cache (30s TTL) with DB fallback, evaluated in
 * priority DESC order with short-circuit on first match.
 *
 * Security: no regex operators (ReDoS prevention). Unsupported operators are
 * treated as non-matching and logged.
 *
 * Performance: rule evaluation is bypassed entirely when the caller has already
 * confirmed the channelRouter feature flag is enabled.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { channelRoutingRules } from "../../drizzle/schema";
import type { ChannelRoutingRule } from "../../drizzle/schema";
import { getRedisClient } from "./redis";
import { auditLogger } from "./auditLogger";
import type { ChatIngressEvent } from "@shared/channelTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Allowed string comparison operators. Regex is intentionally excluded (ReDoS prevention). */
type ConditionOperator = "eq" | "contains" | "startsWith" | "endsWith" | "in";

export interface RuleCondition {
  /** Dot-path field on ChatIngressEvent (allowlisted: message.text, channel.type, eventType, conversationType) */
  field: string;
  /** String comparison operator */
  operator: ConditionOperator | string;
  /** Value(s) to compare against. For "in", a comma-separated string or array. */
  value: string | string[];
}

export interface RouterMatchResult {
  rule: ChannelRoutingRule;
  targetType: string;
  /** Resolved target ID (agency UUID, persona UUID, or workflow ID as string) */
  targetId: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 30;

/** Allowlisted field paths that can be read from ChatIngressEvent */
const ALLOWED_FIELDS = new Set([
  "message.text",
  "channel.type",
  "eventType",
  "conversationType",
]);

// ── Cache helpers ─────────────────────────────────────────────────────────────

function getCacheKey(tenantId: string): string {
  return `channel-router:rules:${tenantId}`;
}

async function loadRules(tenantId: string): Promise<ChannelRoutingRule[]> {
  const redis = getRedisClient();
  const cacheKey = getCacheKey(tenantId);

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as ChannelRoutingRule[];
    } catch {
      // Ignore parse errors — fall through to DB
    }
  }

  // Load active rules from DB ordered by priority DESC
  const rows = await db
    .select()
    .from(channelRoutingRules)
    .where(
      and(
        eq(channelRoutingRules.tenantId, tenantId),
        eq(channelRoutingRules.isActive, true),
      ),
    )
    .orderBy(desc(channelRoutingRules.priority));

  // Populate cache
  await redis.set(cacheKey, JSON.stringify(rows), "EX", CACHE_TTL_SECONDS);

  return rows;
}

// ── Condition evaluation ───────────────────────────────────────────────────────

function getFieldValue(event: ChatIngressEvent, field: string): string {
  if (!ALLOWED_FIELDS.has(field)) return "";

  switch (field) {
    case "message.text":
      return event.message.text ?? "";
    case "channel.type":
      return event.channel.type ?? "";
    case "eventType":
      return event.eventType ?? "";
    case "conversationType":
      return event.conversationType ?? "";
    default:
      return "";
  }
}

function evaluateCondition(event: ChatIngressEvent, condition: RuleCondition): boolean {
  const fieldValue = getFieldValue(event, condition.field).toLowerCase();

  switch (condition.operator as ConditionOperator) {
    case "eq":
      return fieldValue === String(condition.value).toLowerCase();

    case "contains":
      return fieldValue.includes(String(condition.value).toLowerCase());

    case "startsWith":
      return fieldValue.startsWith(String(condition.value).toLowerCase());

    case "endsWith":
      return fieldValue.endsWith(String(condition.value).toLowerCase());

    case "in": {
      const values = Array.isArray(condition.value)
        ? condition.value.map((v) => v.toLowerCase())
        : String(condition.value)
            .split(",")
            .map((v) => v.trim().toLowerCase());
      return values.includes(fieldValue);
    }

    default:
      // Unknown operator (e.g., "regex") — non-matching by design
      auditLogger.log({
        eventType: "channel_router_unknown_operator",
        metadata: {
          operator: condition.operator,
          field: condition.field,
          tenantId: event.tenantId,
        },
      });
      return false;
  }
}

function matchesRule(event: ChatIngressEvent, conditions: RuleCondition[]): boolean {
  // All conditions must match (AND semantics)
  return conditions.every((condition) => evaluateCondition(event, condition));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Evaluate routing rules for a tenant against an inbound event.
 *
 * Rules are loaded from Redis cache (key: `channel-router:rules:{tenantId}`,
 * TTL: 30 seconds). On cache miss, loads from DB ordered by priority DESC.
 *
 * Evaluation is short-circuit: stops at the first matching rule.
 * All conditions in a rule must match (AND semantics).
 *
 * @returns The match result with the rule and resolved target, or null if no match.
 */
export async function evaluateRules(
  event: ChatIngressEvent,
  tenantId: string,
): Promise<RouterMatchResult | null> {
  const rules = await loadRules(tenantId);

  for (const rule of rules) {
    const conditions = rule.conditions as unknown as RuleCondition[];
    if (!Array.isArray(conditions) || conditions.length === 0) continue;

    if (matchesRule(event, conditions)) {
      // Fire-and-forget statistics update (no await — avoids blocking hot path)
      // Use SQL increment to avoid the stale-read race condition under concurrent traffic
      db.update(channelRoutingRules)
        .set({
          totalMatches: sql`"totalMatches" + 1`,
          lastMatchedAt: new Date(),
        })
        .where(eq(channelRoutingRules.id, rule.id))
        .catch(() => {});

      // Resolve target ID from whichever column is set
      const targetId =
        rule.targetAgencyId ??
        rule.targetPersonaId ??
        (rule.targetWorkflowId != null ? String(rule.targetWorkflowId) : null);

      return {
        rule,
        targetType: rule.targetType,
        targetId,
      };
    }
  }

  return null;
}

/**
 * Invalidate the Redis cache for a tenant's routing rules.
 * Must be called after any rule create, update, or delete.
 */
export async function invalidateCache(tenantId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(getCacheKey(tenantId));
}
