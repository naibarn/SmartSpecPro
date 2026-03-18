/**
 * Inter-Agent Communication Service — bridges system agents (046) with team agents.
 */

import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  interAgentMessages,
  systemResourceState,
  teamRuns,
  teamRooms,
  type InterAgentMessage,
  type SystemResourceState,
} from "../../drizzle/schema";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImpactAssessment {
  runId: string;
  roomId: string | null;
  impactLevel: "unaffected" | "degraded" | "blocked" | "critical";
  actionTaken: string;
}

export interface BroadcastResult {
  messagesDelivered: number;
  roomsNotified: string[];
}

// ─── System Broadcast ───────────────────────────────────────────────────────

export async function sendSystemBroadcast(
  tenantId: string,
  targetRoomIds: string[],
  messageType: string,
  displayMessage: string,
  severity: "low" | "normal" | "high" | "critical" = "normal",
  relatedIncidentId?: number,
): Promise<BroadcastResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let delivered = 0;

  await db.transaction(async (tx) => {
    for (const roomId of targetRoomIds) {
      await tx.insert(interAgentMessages).values({
        tenantId,
        channel: "system_broadcast",
        sourceAgentType: "system",
        sourceAgentId: "virtual-admin",
        targetType: "room",
        targetId: roomId,
        priority: severity,
        messageType,
        displayMessage,
        relatedIncidentId: relatedIncidentId ?? null,
        relatedRoomId: roomId,
      });
      delivered++;
    }
  });

  return { messagesDelivered: delivered, roomsNotified: targetRoomIds };
}

// ─── Impact Assessment ──────────────────────────────────────────────────────

export async function assessImpact(
  tenantId: string,
  incidentType: string,
  affectedResources: string[],
  recommendedAction: string,
): Promise<ImpactAssessment[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Load all active runs for tenant (join through teamRooms for tenant isolation)
  const activeRuns = await db
    .select({ teamRuns })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRuns.roomId, teamRooms.id))
    .where(
      and(
        sql`${teamRuns.status} IN ('queued', 'running')`,
        eq(teamRooms.tenantId, tenantId),
      ),
    )
    .limit(100)
    .then(rows => rows.map(r => r.teamRuns));

  const assessments: ImpactAssessment[] = [];

  for (const run of activeRuns) {
    let impactLevel: ImpactAssessment["impactLevel"] = "unaffected";
    let actionTaken = "none";

    // Classify impact based on incident type
    switch (incidentType) {
      case "all_providers_down":
      case "credit_exhausted":
        impactLevel = "critical";
        actionTaken = "hard_stop";
        break;
      case "llm_provider_down":
        impactLevel = "blocked";
        actionTaken = "pause";
        break;
      case "credit_low":
        impactLevel = "degraded";
        actionTaken = "warn";
        break;
      case "error_rate_spike":
        impactLevel = "degraded";
        actionTaken = "caution";
        break;
      default:
        impactLevel = "unaffected";
        actionTaken = "none";
    }

    assessments.push({
      runId: run.id,
      roomId: run.roomId,
      impactLevel,
      actionTaken,
    });
  }

  return assessments;
}

// ─── Team Escalation ────────────────────────────────────────────────────────

export async function handleTeamEscalation(
  tenantId: string,
  roomId: string,
  runId: string,
  assistantId: string,
  escalationType: string,
  context: Record<string, unknown>,
): Promise<{ messageId: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [msg] = await db
    .insert(interAgentMessages)
    .values({
      tenantId,
      channel: "team_escalation",
      sourceAgentType: "team",
      sourceAgentId: assistantId,
      targetType: "user",
      targetId: "virtual-admin",
      priority: "high",
      messageType: escalationType,
      payload: context,
      displayMessage: `Team escalation: ${escalationType}`,
      actionRequired: true,
      relatedRunId: runId,
      relatedRoomId: roomId,
    })
    .returning();

  return { messageId: msg.id };
}

// ─── Resource State ─────────────────────────────────────────────────────────

export async function updateResourceState(
  resourceId: string,
  resourceType: string,
  status: "healthy" | "degraded" | "down" | "critical",
  stateJson?: Record<string, unknown>,
  updatedBy?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(systemResourceState)
    .values({
      id: resourceId,
      resourceType,
      status,
      stateJson: stateJson ?? null,
      updatedBy: updatedBy ?? "system",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemResourceState.id,
      set: {
        status,
        stateJson: stateJson ?? null,
        updatedBy: updatedBy ?? "system",
        updatedAt: new Date(),
      },
    });
}

export async function getResourceState(): Promise<SystemResourceState[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(systemResourceState);
}
