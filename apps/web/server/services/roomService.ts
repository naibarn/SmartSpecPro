/**
 * Room Service — room lifecycle, participant management, message routing.
 */

import { eq, and, sql, desc, asc } from "drizzle-orm";
import { getDb } from "../db";
import {
  teamRooms,
  teamRoomParticipants,
  teamRoomMessages,
  assistantTeams,
  assistantProfiles,
  type TeamRoom,
  type TeamRoomMessage,
} from "../../drizzle/schema";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateRoomInput {
  teamId: string;
  tenantId: string;
  orchestratorUserId: number;
  roomType: "direct" | "team" | "auto_team" | "job_review";
  goalPrompt: string;
  projectId?: number;
  viewMode?: string;
  autonomyLevel?: string;
}

export interface SendMessageInput {
  roomId: string;
  tenantId: string;
  senderType: "user" | "assistant" | "system";
  senderUserId?: number;
  senderAssistantId?: string;
  recipientType: "all" | "assistant" | "subgroup" | "user";
  recipientAssistantId?: string;
  recipientGroupJson?: Record<string, unknown>;
  turnType?: string;
  visibility?: string;
  content: string;
  metadataJson?: Record<string, unknown>;
  tokenUsageJson?: { inputTokens?: number; outputTokens?: number; model?: string };
  runId?: string;
}

export interface MessageFilters {
  viewMode?: "transparent" | "milestone" | "summary";
  callerType: "user" | "system";
  cursor?: string;
  limit?: number;
}

// ─── View Mode Filtering (pure function, exported for testing) ──────────────

export function filterMessagesByViewMode(
  messages: TeamRoomMessage[],
  viewMode: string,
  callerType: "user" | "system",
): TeamRoomMessage[] {
  return messages.filter((msg) => {
    const vis = msg.visibility;

    // System callers see everything in transparent mode
    if (viewMode === "transparent" && callerType === "system") return true;

    // Always exclude private_internal for user callers
    if (callerType === "user" && vis === "private_internal") return false;

    switch (viewMode) {
      case "transparent":
        return true;
      case "milestone":
        return vis === "transparent" || vis === "milestone";
      case "summary":
        return msg.turnType === "summary" || vis === "summary_only";
      default:
        return true;
    }
  });
}

// ─── Room CRUD ──────────────────────────────────────────────────────────────

export async function createRoom(input: CreateRoomInput): Promise<TeamRoom> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Validate team exists and is active
  const [team] = await db
    .select()
    .from(assistantTeams)
    .where(
      and(
        eq(assistantTeams.id, input.teamId),
        eq(assistantTeams.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  if (!team || team.status === "archived") {
    throw new Error(`Team ${input.teamId} not found or archived`);
  }

  const roomId = crypto.randomUUID();

  // Load all active team members before starting the transaction
  const members = await db
    .select()
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.teamId, input.teamId),
        eq(assistantProfiles.isActive, true),
      ),
    );

  let room: typeof import("../../drizzle/schema").teamRooms.$inferSelect;

  await db.transaction(async (tx) => {
    // Create room
    const [inserted] = await tx
      .insert(teamRooms)
      .values({
        id: roomId,
        tenantId: input.tenantId,
        teamId: input.teamId,
        orchestratorUserId: input.orchestratorUserId,
        roomType: input.roomType,
        title: input.goalPrompt.substring(0, 255),
        goalPrompt: input.goalPrompt,
        projectId: input.projectId ?? null,
        viewMode: input.viewMode ?? team.defaultViewMode ?? "transparent",
        autonomyLevel: input.autonomyLevel ?? team.defaultAutonomyLevel ?? "guided",
        status: "active",
      })
      .returning();

    room = inserted;

    // Add orchestrator user as participant
    await tx.insert(teamRoomParticipants).values({
      roomId,
      participantType: "user",
      participantUserId: input.orchestratorUserId,
      participantLabel: "Orchestrator",
      roleInRoom: "orchestrator",
    });

    // Add all active team members as participants
    for (const member of members) {
      await tx.insert(teamRoomParticipants).values({
        roomId,
        participantType: "assistant",
        participantAssistantId: member.id,
        participantLabel: member.displayName ?? member.nickname ?? "Agent",
        roleInRoom: member.isLead ? "lead" : "member",
      });
    }
  });

  return room!;
}

export async function sendMessage(input: SendMessageInput): Promise<TeamRoomMessage> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verify the room belongs to the caller's tenant
  const [room] = await db
    .select()
    .from(teamRooms)
    .where(and(eq(teamRooms.id, input.roomId), eq(teamRooms.tenantId, input.tenantId)))
    .limit(1);

  if (!room) {
    throw new Error("Room not found");
  }

  // Validate sender is participant (for user senders)
  if (input.senderType === "user" && input.senderUserId) {
    const [participant] = await db
      .select()
      .from(teamRoomParticipants)
      .where(
        and(
          eq(teamRoomParticipants.roomId, input.roomId),
          eq(teamRoomParticipants.participantUserId, input.senderUserId),
        ),
      )
      .limit(1);

    if (!participant) {
      throw new Error("Sender is not a participant in this room");
    }
  }

  // Validate assistant sender is participant and not muted
  if (input.senderType === "assistant" && input.senderAssistantId) {
    const [participant] = await db
      .select()
      .from(teamRoomParticipants)
      .where(
        and(
          eq(teamRoomParticipants.roomId, input.roomId),
          eq(teamRoomParticipants.participantAssistantId, input.senderAssistantId),
        ),
      )
      .limit(1);

    if (!participant) {
      throw new Error("Assistant is not a participant in this room");
    }
    if (participant.isMuted) {
      throw new Error("Assistant is muted in this room");
    }
  }

  const [message] = await db
    .insert(teamRoomMessages)
    .values({
      roomId: input.roomId,
      runId: input.runId ?? null,
      senderType: input.senderType,
      senderUserId: input.senderUserId ?? null,
      senderAssistantId: input.senderAssistantId ?? null,
      recipientType: input.recipientType,
      recipientAssistantId: input.recipientAssistantId ?? null,
      recipientGroupJson: input.recipientGroupJson ?? null,
      turnType: (input.turnType as any) ?? "discussion",
      visibility: (input.visibility as any) ?? "transparent",
      content: input.content,
      metadataJson: input.metadataJson ?? null,
      tokenUsageJson: input.tokenUsageJson ?? null,
    })
    .returning();

  // TODO: Publish to Redis pub/sub for SSE (Section 11)
  // redisPublisher.publish(`room:${input.roomId}:messages`, JSON.stringify(message));

  return message;
}

export async function getMessages(
  roomId: string,
  tenantId: string,
  filters: MessageFilters,
): Promise<TeamRoomMessage[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verify the room belongs to the caller's tenant
  const [room] = await db
    .select()
    .from(teamRooms)
    .where(and(eq(teamRooms.id, roomId), eq(teamRooms.tenantId, tenantId)))
    .limit(1);

  if (!room) {
    throw new Error("Room not found");
  }

  const limit = filters.limit ?? 50;

  const conditions = [eq(teamRoomMessages.roomId, roomId)];
  if (filters.cursor) {
    conditions.push(sql`${teamRoomMessages.createdAt} < ${filters.cursor}`);
  }

  const messages = await db
    .select()
    .from(teamRoomMessages)
    .where(and(...conditions))
    .orderBy(asc(teamRoomMessages.createdAt))
    .limit(limit);

  return filterMessagesByViewMode(
    messages,
    filters.viewMode ?? "transparent",
    filters.callerType,
  );
}

export async function getRoom(
  roomId: string,
  tenantId: string,
): Promise<TeamRoom | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [room] = await db
    .select()
    .from(teamRooms)
    .where(
      and(
        eq(teamRooms.id, roomId),
        eq(teamRooms.tenantId, tenantId),
      ),
    )
    .limit(1);

  return room ?? null;
}
