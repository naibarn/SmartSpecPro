import { eq, and, sql, gt } from "drizzle-orm";
import { getDb } from "../../db";
import { virtualAdminIncidents, virtualAdminApprovals } from "../../../drizzle/schema";
import type { SensorReading, IncidentRule, ActionPlan } from "./types";

// ─── Cooldown Map ──────────────────────────────────────────

const cooldownMap = new Map<string, number>();

function getCooldownKey(ruleId: string, tenantId?: string): string {
  return tenantId ? `${ruleId}:${tenantId}` : ruleId;
}

function isInCooldown(ruleId: string, cooldownMs: number, tenantId?: string): boolean {
  const key = getCooldownKey(ruleId, tenantId);
  const lastFired = cooldownMap.get(key);
  if (!lastFired) return false;
  return Date.now() - lastFired < cooldownMs;
}

function setCooldown(ruleId: string, tenantId?: string): void {
  cooldownMap.set(getCooldownKey(ruleId, tenantId), Date.now());
}

export function _resetCooldownMap(): void {
  cooldownMap.clear();
}

export async function initCooldownMap(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db
    .select({
      ruleId: virtualAdminIncidents.ruleId,
      tenantId: virtualAdminIncidents.tenantId,
      lastCreated: sql<Date>`MAX(${virtualAdminIncidents.createdAt})`,
    })
    .from(virtualAdminIncidents)
    .where(gt(virtualAdminIncidents.createdAt, dayAgo))
    .groupBy(virtualAdminIncidents.ruleId, virtualAdminIncidents.tenantId);

  for (const row of recent) {
    const key = getCooldownKey(row.ruleId, row.tenantId ?? undefined);
    cooldownMap.set(key, new Date(row.lastCreated).getTime());
  }
}

// ─── Rules ─────────────────────────────────────────────────

const ALL_CHANNELS: ActionPlan["notify"]["channels"] = ["in_app", "email", "slack", "telegram"];

const rules: IncidentRule[] = [
  // Queue Health
  {
    id: "queue_depth_high",
    sensorId: "queue_health",
    condition: (r) => r.status === "degraded",
    severity: "warning",
    actionPlan: { notify: { channels: ["in_app"] } },
    cooldownMs: 600_000,
  },
  {
    id: "queue_depth_critical",
    sensorId: "queue_health",
    condition: (r) => r.status === "critical",
    severity: "critical",
    actionPlan: {
      autoFix: { type: "retry_failed_job", params: {} },
      notify: { channels: ALL_CHANNELS },
      requiresApproval: true,
    },
    cooldownMs: 300_000,
  },

  // Celery Health
  {
    id: "celery_worker_slow",
    sensorId: "celery_health",
    condition: (r) => r.status === "degraded",
    severity: "warning",
    actionPlan: { notify: { channels: ["in_app", "email"] } },
    cooldownMs: 900_000,
  },
  {
    id: "celery_worker_down",
    sensorId: "celery_health",
    condition: (r) => r.status === "critical",
    severity: "critical",
    actionPlan: {
      notify: { channels: ALL_CHANNELS },
      requiresApproval: true,
    },
    cooldownMs: 300_000,
  },

  // Error Spike
  {
    id: "error_spike_moderate",
    sensorId: "error_spike",
    condition: (r) => r.status === "degraded",
    severity: "warning",
    actionPlan: { notify: { channels: ["in_app", "email"] } },
    cooldownMs: 600_000,
  },
  {
    id: "error_spike_severe",
    sensorId: "error_spike",
    condition: (r) => r.status === "critical",
    severity: "error",
    actionPlan: { notify: { channels: ["in_app", "email", "slack"] } },
    cooldownMs: 300_000,
  },

  // LLM Provider
  {
    id: "llm_provider_degraded",
    sensorId: "llm_provider",
    condition: (r) => r.status === "degraded",
    severity: "warning",
    actionPlan: {
      autoFix: { type: "failover_provider", params: {} },
      notify: { channels: ["in_app"] },
    },
    cooldownMs: 600_000,
  },
  {
    id: "llm_provider_down",
    sensorId: "llm_provider",
    condition: (r) => r.status === "critical",
    severity: "critical",
    actionPlan: {
      autoFix: { type: "failover_provider", params: {} },
      notify: { channels: ALL_CHANNELS },
      requiresApproval: true,
    },
    cooldownMs: 300_000,
  },

  // Credit Balance
  {
    id: "credit_low",
    sensorId: "credit_balance",
    condition: (r) => r.status === "degraded",
    severity: "warning",
    actionPlan: { notify: { channels: ["in_app", "email"] } },
    cooldownMs: 3_600_000,
  },
  {
    id: "credit_exhausted",
    sensorId: "credit_balance",
    condition: (r) => r.status === "critical",
    severity: "critical",
    actionPlan: { notify: { channels: ALL_CHANNELS } },
    cooldownMs: 1_800_000,
  },

  // Disk Storage
  {
    id: "disk_space_low",
    sensorId: "disk_storage",
    condition: (r) => r.status === "degraded",
    severity: "warning",
    actionPlan: {
      autoFix: { type: "cleanup_temp_files", params: {} },
      notify: { channels: ["in_app"] },
    },
    cooldownMs: 1_800_000,
  },
  {
    id: "disk_space_critical",
    sensorId: "disk_storage",
    condition: (r) => r.status === "critical",
    severity: "critical",
    actionPlan: {
      autoFix: { type: "cleanup_temp_files", params: {} },
      notify: { channels: ALL_CHANNELS },
      requiresApproval: true,
    },
    cooldownMs: 600_000,
  },

  // Database Health
  {
    id: "db_connection_issues",
    sensorId: "db_health",
    condition: (r) => r.status === "degraded" || r.status === "critical",
    severity: "error",
    actionPlan: { notify: { channels: ["in_app", "email", "slack"] } },
    cooldownMs: 300_000,
  },

  // Certificate Expiry
  {
    id: "cert_expiring_soon",
    sensorId: "cert_expiry",
    condition: (r) => r.status === "degraded",
    severity: "warning",
    actionPlan: { notify: { channels: ["in_app", "email"] } },
    cooldownMs: 86_400_000,
  },

  // API Latency
  {
    id: "api_latency_high",
    sensorId: "api_latency",
    condition: (r) => r.status === "degraded" || r.status === "critical",
    severity: "warning",
    actionPlan: { notify: { channels: ["in_app", "email"] } },
    cooldownMs: 900_000,
  },

  // Media Pipeline
  {
    id: "media_pipeline_slow",
    sensorId: "media_pipeline",
    condition: (r) => r.status === "degraded",
    severity: "warning",
    actionPlan: { notify: { channels: ["in_app"] } },
    cooldownMs: 900_000,
  },
  {
    id: "media_pipeline_stuck",
    sensorId: "media_pipeline",
    condition: (r) => r.status === "critical",
    severity: "error",
    actionPlan: {
      autoFix: { type: "retry_failed_job", params: {} },
      notify: { channels: ["in_app", "email", "slack"] },
      requiresApproval: true,
    },
    cooldownMs: 300_000,
  },

  // Team Escalation
  {
    id: "team_escalation_needed",
    sensorId: "team_escalation",
    condition: (r) => r.status === "critical",
    severity: "critical",
    actionPlan: { notify: { channels: ALL_CHANNELS } },
    cooldownMs: 1_800_000,
  },
];

export function getRules(): IncidentRule[] {
  return [...rules];
}

// ─── Stub interfaces for section-04 and section-05 ─────────

export type NotifyFn = (
  incidentId: number,
  severity: string,
  channels: string[],
  tenantId?: string,
) => Promise<void>;

export type AutoFixFn = (
  type: string,
  params: Record<string, unknown>,
  tenantId?: string,
) => Promise<{ success: boolean; result: string }>;

// Default stubs (replaced by sections 04/05)
let notifyFn: NotifyFn = async () => {};
let autoFixFn: AutoFixFn = async () => ({ success: false, result: "Not implemented" });

export function setNotifier(fn: NotifyFn): void {
  notifyFn = fn;
}

export function setAutoFixer(fn: AutoFixFn): void {
  autoFixFn = fn;
}

// ─── Evaluation ────────────────────────────────────────────

async function isAutoFixEnabled(tenantId?: string): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const db = await getDb();
    if (!db) return false;
    const result = await db.execute(
      sql`SELECT value FROM system_settings WHERE key = 'VIRTUAL_ADMIN_AUTO_FIX' AND "tenantId" = ${tenantId} LIMIT 1`,
    );
    return (result.rows[0] as any)?.value === "true";
  } catch {
    return false;
  }
}

async function executeActionPlan(
  plan: ActionPlan,
  incidentId: number,
  severity: string,
  tenantId?: string,
): Promise<void> {
  // Always notify
  await notifyFn(incidentId, severity, plan.notify.channels, tenantId);

  // Auto-fix if enabled
  if (plan.autoFix) {
    const enabled = await isAutoFixEnabled(tenantId);
    if (enabled) {
      const result = await autoFixFn(plan.autoFix.type, plan.autoFix.params, tenantId);
      const db = await getDb();
      if (db) {
        await db
          .update(virtualAdminIncidents)
          .set({
            actionTaken: plan.autoFix.type,
            actionResult: result.result,
            updatedAt: new Date(),
          })
          .where(eq(virtualAdminIncidents.id, incidentId));
      }
    }
  }

  // Approval if required
  if (plan.requiresApproval) {
    const db = await getDb();
    if (db) {
      const ttlHours = severity === "critical" ? 4 : 24;
      await db.insert(virtualAdminApprovals).values({
        incidentId,
        actionType: plan.autoFix?.type ?? "manual_review",
        actionParamsJson: plan.autoFix?.params ?? {},
        status: "pending",
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      });
    }
  }
}

export async function evaluateReading(reading: SensorReading): Promise<void> {
  if (reading.status === "unknown") return;

  const matchingRules = rules.filter((r) => r.sensorId === reading.sensorId);

  for (const rule of matchingRules) {
    try {
      if (!rule.condition(reading)) continue;
      if (isInCooldown(rule.id, rule.cooldownMs, reading.tenantId)) continue;

      const db = await getDb();
      if (!db) continue;

      // Check for existing open incident
      const conditions = [
        eq(virtualAdminIncidents.sensorId, reading.sensorId),
        eq(virtualAdminIncidents.ruleId, rule.id),
        eq(virtualAdminIncidents.status, "open"),
      ];
      if (reading.tenantId) {
        conditions.push(eq(virtualAdminIncidents.tenantId, reading.tenantId));
      }

      const existing = await db
        .select({ id: virtualAdminIncidents.id })
        .from(virtualAdminIncidents)
        .where(and(...conditions))
        .limit(1);

      if (existing.length > 0) {
        // Update existing incident
        await db
          .update(virtualAdminIncidents)
          .set({
            metricsJson: reading.metrics,
            updatedAt: new Date(),
          })
          .where(eq(virtualAdminIncidents.id, existing[0].id));
        continue;
      }

      // Create new incident
      const inserted = await db
        .insert(virtualAdminIncidents)
        .values({
          tenantId: reading.tenantId ?? null,
          sensorId: reading.sensorId,
          ruleId: rule.id,
          severity: rule.severity,
          status: "open",
          title: `[${rule.severity.toUpperCase()}] ${rule.id.replace(/_/g, " ")}`,
          message: reading.message,
          metricsJson: reading.metrics,
        })
        .returning({ id: virtualAdminIncidents.id });

      const incidentId = inserted[0].id;
      setCooldown(rule.id, reading.tenantId);

      // Execute action plan
      await executeActionPlan(rule.actionPlan, incidentId, rule.severity, reading.tenantId);
    } catch (err) {
      console.error(`[RuleEngine] Error evaluating rule ${rule.id}:`, err);
    }
  }
}
