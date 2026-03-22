/**
 * Room Service — room lifecycle, participant management, message routing.
 */

import { eq, and, sql, desc, asc } from "drizzle-orm";
import { getDb } from "../db";
import {
  teamRooms,
  teamRoomParticipants,
  teamRoomMessages,
  teamRuns,
  assistantTeams,
  assistantProfiles,
  type TeamRoom,
  type TeamRoomMessage,
} from "../../drizzle/schema";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

const ROOM_SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bghp_[A-Za-z0-9]{8,}\b/g,
  /\bgho_[A-Za-z0-9]{8,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
];
const ROOM_SUMMARY_LIMIT = 280;

export type WorkUpdateMessageType =
  | "work_update"
  | "critique"
  | "suggestion"
  | "revision"
  | "approval"
  | "decision"
  | "summary";

export interface WorkCitationRef {
  id?: string;
  title?: string;
  url?: string;
  note?: string;
}

export interface WorkArtifactRef {
  artifactId?: string;
  label?: string;
  kind?: string;
  status?: string;
  url?: string;
}

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
  summaryContent?: string;
  artifactRefsJson?: unknown;
  memoryRefsJson?: unknown;
  metadataJson?: Record<string, unknown>;
  tokenUsageJson?: { inputTokens?: number; outputTokens?: number; model?: string };
  runId?: string;
}

export interface PostWorkUpdateInput {
  roomId: string;
  tenantId: string;
  senderAssistantId: string;
  content: string;
  runId?: string;
  workItemId?: string;
  messageType?: WorkUpdateMessageType;
  visibility?: SendMessageInput["visibility"];
  replyToMessageId?: string;
  threadRootMessageId?: string;
  citationRefs?: WorkCitationRef[];
  artifactRefs?: WorkArtifactRef[];
  memoryRefs?: unknown;
  metadataJson?: Record<string, unknown>;
  tokenUsageJson?: SendMessageInput["tokenUsageJson"];
  sensitivity?: "low" | "medium" | "high";
}

export interface RoomRedactionDecision {
  applied: boolean;
  reason: "secret_pattern" | "sensitive_payload" | null;
  originalContentLength: number;
  sanitizedContentLength: number;
}

export interface MessageFilters {
  viewMode?: "transparent" | "milestone" | "summary";
  callerType: "user" | "system";
  cursor?: string;
  limit?: number;
}

export interface RoomViewerState {
  roomId: string;
  userId: number;
  lastViewedAt: Date | null;
}

export type TeamRoomType = CreateRoomInput["roomType"];
export type TeamRunExecutionMode = "team_chat" | "auto_team" | "review";

export function getDefaultExecutionModeForRoomType(roomType: TeamRoomType): Exclude<TeamRunExecutionMode, "review"> {
  switch (roomType) {
    case "auto_team":
      return "auto_team";
    case "direct":
    case "job_review":
    case "team":
    default:
      return "team_chat";
  }
}

export function mapRoomTypeToExecutionMode(
  roomType: TeamRoomType,
  requestedExecutionMode?: TeamRunExecutionMode | null,
): Exclude<TeamRunExecutionMode, "review"> {
  if (requestedExecutionMode === "auto_team") {
    return "auto_team";
  }

  if (requestedExecutionMode === "team_chat") {
    return "team_chat";
  }

  return getDefaultExecutionModeForRoomType(roomType);
}

function sanitizeRoomString(value: string): { value: string; changed: boolean } {
  let sanitized = value;
  for (const pattern of ROOM_SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return { value: sanitized, changed: sanitized !== value };
}

function sanitizeRoomJsonValue(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    return sanitizeRoomString(value);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const sanitized = value.map((item) => {
      const result = sanitizeRoomJsonValue(item);
      if (result.changed) changed = true;
      return result.value;
    });
    return { value: sanitized, changed };
  }
  if (value !== null && typeof value === "object") {
    let changed = false;
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const result = sanitizeRoomJsonValue(item);
      if (result.changed) changed = true;
      sanitized[key] = result.value;
    }
    return { value: sanitized, changed };
  }
  return { value, changed: false };
}

function buildSummaryContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= ROOM_SUMMARY_LIMIT) return normalized;
  return `${normalized.slice(0, ROOM_SUMMARY_LIMIT - 3).trimEnd()}...`;
}

function mapMessageTypeToTurnType(messageType: WorkUpdateMessageType): NonNullable<SendMessageInput["turnType"]> {
  switch (messageType) {
    case "critique":
    case "suggestion":
      return "review";
    case "approval":
    case "decision":
      return "decision";
    case "summary":
      return "summary";
    case "revision":
    case "work_update":
    default:
      return "execution_update";
  }
}

function defaultVisibilityForMessageType(messageType: WorkUpdateMessageType): NonNullable<SendMessageInput["visibility"]> {
  switch (messageType) {
    case "approval":
    case "decision":
      return "milestone";
    case "summary":
      return "summary_only";
    case "critique":
    case "suggestion":
    case "revision":
    case "work_update":
    default:
      return "transparent";
  }
}

export function prepareWorkUpdate(input: PostWorkUpdateInput): {
  content: string;
  summaryContent: string;
  turnType: NonNullable<SendMessageInput["turnType"]>;
  visibility: NonNullable<SendMessageInput["visibility"]>;
  artifactRefsJson: unknown;
  memoryRefsJson: unknown;
  metadataJson: Record<string, unknown>;
} {
  const messageType = input.messageType ?? "work_update";
  const sanitizedContent = sanitizeRoomString(input.content);
  const sanitizedMetadata = sanitizeRoomJsonValue(input.metadataJson ?? {});
  const summaryContent = buildSummaryContent(sanitizedContent.value);
  const replyToMessageId = input.replyToMessageId ?? null;
  const threadRootMessageId = input.threadRootMessageId ?? input.replyToMessageId ?? null;
  const redactToSummary = input.sensitivity === "high";
  const redactionApplied = redactToSummary || sanitizedContent.changed || sanitizedMetadata.changed;

  const redactionDecision: RoomRedactionDecision = {
    applied: redactionApplied,
    reason: redactToSummary
      ? "sensitive_payload"
      : sanitizedContent.changed || sanitizedMetadata.changed
        ? "secret_pattern"
        : null,
    originalContentLength: input.content.length,
    sanitizedContentLength: sanitizedContent.value.length,
  };

  return {
    content: redactToSummary ? summaryContent : sanitizedContent.value,
    summaryContent,
    turnType: mapMessageTypeToTurnType(messageType),
    visibility: input.visibility ?? defaultVisibilityForMessageType(messageType),
    artifactRefsJson: input.artifactRefs ?? null,
    memoryRefsJson: input.memoryRefs ?? null,
    metadataJson: {
      messageType,
      workItemId: input.workItemId ?? null,
      replyToMessageId,
      threadRootMessageId,
      citationRefs: input.citationRefs ?? [],
      roomRedaction: redactionDecision,
      details: sanitizedMetadata.value,
    },
  };
}

export function projectMessageForView(
  message: TeamRoomMessage,
  viewMode: string,
  callerType: "user" | "system",
): TeamRoomMessage {
  if (callerType !== "user") return message;

  const metadata = (message.metadataJson ?? {}) as Record<string, any>;
  const roomRedaction = metadata.roomRedaction as RoomRedactionDecision | undefined;
  const shouldUseSummary = Boolean(message.summaryContent) && (
    viewMode === "summary" ||
    roomRedaction?.applied === true
  );

  if (!shouldUseSummary) return message;
  return {
    ...message,
    content: message.summaryContent ?? message.content,
  };
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
      if (member.memberKind === "assistant") {
        await tx.insert(teamRoomParticipants).values({
          roomId,
          participantType: "assistant",
          participantAssistantId: member.id,
          participantLabel: member.displayName ?? member.nickname ?? "Agent",
          roleInRoom: member.isLead ? "lead" : "member",
        });
        continue;
      }

      if (member.memberKind === "human" && member.humanUserId) {
        await tx.insert(teamRoomParticipants).values({
          roomId,
          participantType: "observer",
          participantUserId: member.humanUserId,
          participantLabel: member.displayName ?? member.nickname ?? "Human Member",
          roleInRoom: member.isLead ? "lead_observer" : "observer",
        });
      }
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
      summaryContent: input.summaryContent ?? null,
      artifactRefsJson: input.artifactRefsJson ?? null,
      memoryRefsJson: input.memoryRefsJson ?? null,
      metadataJson: input.metadataJson ?? null,
      tokenUsageJson: input.tokenUsageJson ?? null,
    })
    .returning();

  // Publish to Redis pub/sub for SSE (Section 11)
  try {
    const { publishEvent, createEvent } = await import("./orchestratorEventBus");
    // Find active run for this room to include runId
    const [activeRun] = await db
      .select({ id: teamRuns.id, teamId: teamRuns.teamId })
      .from(teamRuns)
      .where(and(eq(teamRuns.roomId, input.roomId), sql`${teamRuns.status} IN ('running', 'queued')`))
      .limit(1);

    if (activeRun) {
      await publishEvent(createEvent("message", {
        tenantId: input.tenantId,
        teamId: activeRun.teamId,
        roomId: input.roomId,
        runId: activeRun.id,
        actorType: input.senderType,
        actorId: input.senderAssistantId ?? String(input.senderUserId ?? "system"),
        visibility: (input.visibility as any) ?? "transparent",
        data: {
          messageId: message.id,
          content: input.content.slice(0, 200),
          turnType: (input.turnType as any) ?? "discussion",
          metadata: input.metadataJson ?? null,
          artifactRefsJson: input.artifactRefsJson ?? null,
          summaryContent: input.summaryContent ?? null,
        },
        userId: input.senderUserId ?? undefined,
      }));
    }
  } catch {
    // Non-critical — SSE update missed but message persisted
  }

  return message;
}

export async function postWorkUpdate(input: PostWorkUpdateInput): Promise<TeamRoomMessage> {
  const prepared = prepareWorkUpdate(input);
  return sendMessage({
    roomId: input.roomId,
    tenantId: input.tenantId,
    senderType: "assistant",
    senderAssistantId: input.senderAssistantId,
    recipientType: "all",
    runId: input.runId,
    turnType: prepared.turnType,
    visibility: prepared.visibility,
    content: prepared.content,
    summaryContent: prepared.summaryContent,
    artifactRefsJson: prepared.artifactRefsJson,
    memoryRefsJson: prepared.memoryRefsJson,
    metadataJson: prepared.metadataJson,
    tokenUsageJson: input.tokenUsageJson,
  });
}

export async function getViewerState(
  roomId: string,
  tenantId: string,
  userId: number,
): Promise<RoomViewerState> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [room] = await db
    .select({ id: teamRooms.id })
    .from(teamRooms)
    .where(and(eq(teamRooms.id, roomId), eq(teamRooms.tenantId, tenantId)))
    .limit(1);

  if (!room) {
    throw new Error("Room not found");
  }

  const [participant] = await db
    .select({ lastViewedAt: teamRoomParticipants.lastViewedAt })
    .from(teamRoomParticipants)
    .where(
      and(
        eq(teamRoomParticipants.roomId, roomId),
        eq(teamRoomParticipants.participantUserId, userId),
      ),
    )
    .limit(1);

  return {
    roomId,
    userId,
    lastViewedAt: participant?.lastViewedAt ?? null,
  };
}

export async function markRoomViewed(
  roomId: string,
  tenantId: string,
  userId: number,
): Promise<RoomViewerState> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [room] = await db
    .select({ id: teamRooms.id })
    .from(teamRooms)
    .where(and(eq(teamRooms.id, roomId), eq(teamRooms.tenantId, tenantId)))
    .limit(1);

  if (!room) {
    throw new Error("Room not found");
  }

  const now = new Date();
  const [participant] = await db
    .select({ id: teamRoomParticipants.id })
    .from(teamRoomParticipants)
    .where(
      and(
        eq(teamRoomParticipants.roomId, roomId),
        eq(teamRoomParticipants.participantUserId, userId),
      ),
    )
    .limit(1);

  if (participant) {
    const [updated] = await db
      .update(teamRoomParticipants)
      .set({ lastViewedAt: now })
      .where(eq(teamRoomParticipants.id, participant.id))
      .returning({ lastViewedAt: teamRoomParticipants.lastViewedAt });

    return {
      roomId,
      userId,
      lastViewedAt: updated?.lastViewedAt ?? now,
    };
  }

  const [inserted] = await db
    .insert(teamRoomParticipants)
    .values({
      roomId,
      participantType: "observer",
      participantUserId: userId,
      participantLabel: "Viewer",
      roleInRoom: "viewer",
      canWriteSharedMemory: false,
      lastViewedAt: now,
    })
    .returning({ lastViewedAt: teamRoomParticipants.lastViewedAt });

  return {
    roomId,
    userId,
    lastViewedAt: inserted?.lastViewedAt ?? now,
  };
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
  ).map((message) => projectMessageForView(
    message,
    filters.viewMode ?? "transparent",
    filters.callerType,
  ));
}

export async function listRoomsByTeam(
  teamId: string,
  tenantId: string,
): Promise<TeamRoom[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(teamRooms)
    .where(
      and(
        eq(teamRooms.teamId, teamId),
        eq(teamRooms.tenantId, tenantId),
      ),
    )
    .orderBy(desc(teamRooms.createdAt))
    .limit(50);
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
