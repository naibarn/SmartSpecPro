/**
 * Automation Handoff Service — manages cross-surface agent actions.
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  automationHandoffs,
  type AutomationHandoff,
} from "../../drizzle/schema";
import crypto from "crypto";

const DEFAULT_CALLBACK_TTL_MS = 15 * 60 * 1000;

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function timingSafeHexEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left, "hex");
  const rightBuf = Buffer.from(right, "hex");
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

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
  idempotencyKey?: string;
  callbackToken?: string;
  callbackTtlMs?: number;
}

export interface CreateHandoffResult {
  handoff: AutomationHandoff;
  callbackToken: string | null;
  created: boolean;
}

export interface CompleteHandoffFromCallbackInput {
  handoffId: string;
  teamId: string;
  runId: string;
  callbackToken: string;
  callbackNonce: string;
  resultPayloadJson?: Record<string, unknown>;
}

export async function createHandoff(
  input: CreateHandoffInput,
): Promise<CreateHandoffResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const callbackToken = input.callbackToken ?? crypto.randomUUID();
  const callbackNonce = crypto.randomUUID();
  const callbackDeadlineAt = new Date(Date.now() + (input.callbackTtlMs ?? DEFAULT_CALLBACK_TTL_MS));

  const [existing] = await db
    .select()
    .from(automationHandoffs)
    .where(
      and(
        eq(automationHandoffs.runId, input.runId),
        eq(automationHandoffs.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  if (existing) {
    return {
      handoff: existing,
      callbackToken: null,
      created: false,
    };
  }

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
      idempotencyKey,
      dispatchTokenHash: sha256Hex(callbackToken),
      callbackNonce,
      callbackDeadlineAt,
      requestPayloadJson: input.requestPayloadJson ?? null,
      attemptCount: 0,
      lastAttemptAt: null,
      status: "pending",
      approvalState: input.requiresApproval === false ? "not_required" : "pending",
    })
    .returning();

  return {
    handoff,
    callbackToken,
    created: true,
  };
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

  const [handoff] = await db
    .select()
    .from(automationHandoffs)
    .where(eq(automationHandoffs.id, handoffId))
    .limit(1);

  if (!handoff) throw new Error(`Handoff ${handoffId} not found`);
  if (handoff.status === "completed" || handoff.status === "rejected" || handoff.status === "failed") {
    throw new Error(`Handoff ${handoffId} is already finalized`);
  }

  const [updated] = await db
    .update(automationHandoffs)
    .set({
      status: "completed",
      resultPayloadJson: resultPayloadJson ?? null,
      dispatchTokenHash: null,
      callbackNonce: null,
      callbackDeadlineAt: null,
      updatedAt: new Date(),
    })
    .where(eq(automationHandoffs.id, handoffId))
    .returning();

  return updated;
}

export async function recordDispatchAttempt(
  handoffId: string,
): Promise<AutomationHandoff> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [handoff] = await db
    .select()
    .from(automationHandoffs)
    .where(eq(automationHandoffs.id, handoffId))
    .limit(1);

  if (!handoff) throw new Error(`Handoff ${handoffId} not found`);

  const [updated] = await db
    .update(automationHandoffs)
    .set({
      attemptCount: (handoff.attemptCount ?? 0) + 1,
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(automationHandoffs.id, handoffId))
    .returning();

  return updated;
}

export async function completeHandoffFromCallback(
  input: CompleteHandoffFromCallbackInput,
): Promise<AutomationHandoff> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [handoff] = await db
    .select()
    .from(automationHandoffs)
    .where(eq(automationHandoffs.id, input.handoffId))
    .limit(1);

  if (!handoff) throw new Error(`Handoff ${input.handoffId} not found`);
  if (handoff.teamId !== input.teamId || handoff.runId !== input.runId) {
    throw new Error("Callback binding mismatch");
  }
  if (handoff.approvalState === "pending") {
    throw new Error("Handoff is awaiting approval");
  }
  if (handoff.status === "completed" || handoff.status === "rejected" || handoff.status === "failed") {
    throw new Error(`Handoff ${input.handoffId} is already finalized`);
  }
  if (!handoff.dispatchTokenHash || !handoff.callbackNonce || !handoff.callbackDeadlineAt) {
    throw new Error("Callback security context is missing");
  }
  if (handoff.callbackNonce !== input.callbackNonce) {
    throw new Error("Callback nonce mismatch");
  }
  if (handoff.callbackDeadlineAt.getTime() < Date.now()) {
    throw new Error("Callback token expired");
  }

  const providedHash = sha256Hex(input.callbackToken);
  if (!timingSafeHexEqual(handoff.dispatchTokenHash, providedHash)) {
    throw new Error("Callback token mismatch");
  }

  const [updated] = await db
    .update(automationHandoffs)
    .set({
      status: "completed",
      resultPayloadJson: input.resultPayloadJson ?? null,
      dispatchTokenHash: null,
      callbackNonce: null,
      callbackDeadlineAt: null,
      updatedAt: new Date(),
    })
    .where(eq(automationHandoffs.id, input.handoffId))
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
