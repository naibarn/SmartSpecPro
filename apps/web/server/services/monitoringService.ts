/**
 * Monitoring Service — records agent activity events, captures snapshots,
 * and detects stuck/looping agents.
 */

import { eq, and, sql, desc, count } from "drizzle-orm";
import { getDb } from "../db";
import {
  agentActivityEvents,
  agentRunSummaries,
  runSnapshots,
  teamRuns,
  teamRooms,
  assistantProfiles,
  type AgentActivityEvent,
  type InsertAgentActivityEvent,
  type RunSnapshot,
  type BudgetSnapshot,
} from "../../drizzle/schema";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecordEventInput {
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string;
  assistantId?: string;
  eventType: string;
  eventCategory: "status_change" | "communication" | "tool_use" | "memory_op" | "artifact_op" | "handoff" | "approval" | "error";
  visibility?: "transparent" | "milestone" | "summary_only" | "private_internal";
  summary?: string;
  detailJson?: Record<string, unknown>;
  tokenUsageSnapshot?: number;
  costSnapshot?: number;
  durationMs?: number;
}

export interface StuckAgentCheck {
  isStuck: boolean;
  agentId: string | null;
  reason: string | null;
  lastActivityAge: number | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const STUCK_THRESHOLD_MS = 120_000; // 2 minutes without activity
export const SNAPSHOT_INTERVAL_MS = 15_000; // every 15 seconds

// ─── Event Recording ────────────────────────────────────────────────────────

export async function recordEvent(
  input: RecordEventInput,
): Promise<AgentActivityEvent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [event] = await db
    .insert(agentActivityEvents)
    .values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      teamId: input.teamId,
      roomId: input.roomId,
      runId: input.runId,
      assistantId: input.assistantId ?? null,
      eventType: input.eventType,
      eventCategory: input.eventCategory,
      visibility: (input.visibility as any) ?? "transparent",
      summary: input.summary ?? null,
      detailJson: input.detailJson ?? null,
      tokenUsageSnapshot: input.tokenUsageSnapshot ?? null,
      costSnapshot: input.costSnapshot ? String(input.costSnapshot) : null,
      durationMs: input.durationMs ?? null,
    })
    .returning();

  return event;
}

// ─── Snapshot Capture ───────────────────────────────────────────────────────

export async function captureSnapshot(
  runId: string,
  tenantId: string,
): Promise<RunSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .select({ run: teamRuns })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(and(eq(teamRuns.id, runId), eq(teamRooms.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows.map((r) => r.run));

  if (!run) throw new Error(`Run ${runId} not found`);

  const budget = (run.budgetSnapshotJson as BudgetSnapshot) ?? { totalCreditsUsed: 0, perAgent: {} };
  const perAgent = budget.perAgent ?? {};

  // Build agent statuses
  const agentStatuses: Record<string, string> = {};
  for (const [agentId] of Object.entries(perAgent)) {
    agentStatuses[agentId] = agentId === run.activeAssistantId ? "active" : "idle";
  }

  const [snapshot] = await db
    .insert(runSnapshots)
    .values({
      runId,
      activeAssistantId: run.activeAssistantId,
      agentStatusesJson: agentStatuses,
      tokenUsageJson: Object.fromEntries(
        Object.entries(perAgent).map(([id, d]) => [
          id,
          { inputTokens: d.inputTokens, outputTokens: d.outputTokens },
        ]),
      ),
      costJson: Object.fromEntries(
        Object.entries(perAgent).map(([id, d]) => [id, d.creditsUsed]),
      ),
    })
    .returning();

  return snapshot;
}

// ─── Stuck Detection ────────────────────────────────────────────────────────

export async function checkStuckAgent(
  runId: string,
  tenantId: string,
): Promise<StuckAgentCheck> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .select({ run: teamRuns })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(and(eq(teamRuns.id, runId), eq(teamRooms.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows.map((r) => r.run));

  if (!run || run.status !== "running") {
    return { isStuck: false, agentId: null, reason: null, lastActivityAge: null };
  }

  // Get last activity event
  const [lastEvent] = await db
    .select()
    .from(agentActivityEvents)
    .where(eq(agentActivityEvents.runId, runId))
    .orderBy(desc(agentActivityEvents.createdAt))
    .limit(1);

  const lastActivityTime = lastEvent?.createdAt ?? run.startedAt;
  const ageMs = lastActivityTime ? Date.now() - new Date(lastActivityTime).getTime() : 0;

  if (ageMs > STUCK_THRESHOLD_MS) {
    return {
      isStuck: true,
      agentId: run.activeAssistantId,
      reason: `No activity for ${Math.round(ageMs / 1000)}s`,
      lastActivityAge: ageMs,
    };
  }

  return { isStuck: false, agentId: null, reason: null, lastActivityAge: ageMs };
}

// ─── Event Queries ──────────────────────────────────────────────────────────

export async function getRunEvents(
  runId: string,
  tenantId: string,
  limit: number = 100,
): Promise<AgentActivityEvent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(agentActivityEvents)
    .where(and(eq(agentActivityEvents.runId, runId), eq(agentActivityEvents.tenantId, tenantId)))
    .orderBy(desc(agentActivityEvents.createdAt))
    .limit(limit);
}
