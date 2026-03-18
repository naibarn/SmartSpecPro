/**
 * Automation Handoff Service — manages cross-surface agent actions.
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  automationHandoffs,
  type AutomationHandoff,
} from "../../drizzle/schema";

export interface CreateHandoffInput {
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string;
  assistantId: string;
  destinationType: string;
  destinationId?: string;
  requestPayloadJson?: Record<string, unknown>;
  requiresApproval?: boolean;
}

export async function createHandoff(
  input: CreateHandoffInput,
): Promise<AutomationHandoff> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [handoff] = await db
    .insert(automationHandoffs)
    .values({
      tenantId: input.tenantId,
      teamId: input.teamId,
      roomId: input.roomId,
      runId: input.runId,
      assistantId: input.assistantId,
      destinationType: input.destinationType,
      destinationId: input.destinationId ?? null,
      requestPayloadJson: input.requestPayloadJson ?? null,
      status: "pending",
      approvalState: input.requiresApproval === false ? "not_required" : "pending",
    })
    .returning();

  return handoff;
}

export async function approveHandoff(
  handoffId: string,
  approvedByUserId: number,
): Promise<AutomationHandoff> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [handoff] = await db
    .select()
    .from(automationHandoffs)
    .where(eq(automationHandoffs.id, handoffId))
    .limit(1);

  if (!handoff) throw new Error(`Handoff ${handoffId} not found`);
  if (handoff.approvalState !== "pending") {
    throw new Error(`Handoff approval state must be 'pending', got '${handoff.approvalState}'`);
  }

  const [updated] = await db
    .update(automationHandoffs)
    .set({
      approvalState: "approved",
      status: "executing",
      approvedByUserId,
      updatedAt: new Date(),
    })
    .where(eq(automationHandoffs.id, handoffId))
    .returning();

  return updated;
}

export async function rejectHandoff(
  handoffId: string,
  approvedByUserId: number,
): Promise<AutomationHandoff> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db
    .update(automationHandoffs)
    .set({
      approvalState: "rejected",
      status: "rejected",
      approvedByUserId,
      updatedAt: new Date(),
    })
    .where(eq(automationHandoffs.id, handoffId))
    .returning();

  return updated;
}

export async function completeHandoff(
  handoffId: string,
  resultPayloadJson?: Record<string, unknown>,
): Promise<AutomationHandoff> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db
    .update(automationHandoffs)
    .set({
      status: "completed",
      resultPayloadJson: resultPayloadJson ?? null,
      updatedAt: new Date(),
    })
    .where(eq(automationHandoffs.id, handoffId))
    .returning();

  return updated;
}

export async function listByRun(runId: string): Promise<AutomationHandoff[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(automationHandoffs)
    .where(eq(automationHandoffs.runId, runId))
    .orderBy(desc(automationHandoffs.createdAt));
}
