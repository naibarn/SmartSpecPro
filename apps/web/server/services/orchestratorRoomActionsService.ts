import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  assistantProfiles,
  teamRoomMessages,
  teamRooms,
  type TeamRoomMessage,
  type TeamWorkItem,
} from "../../drizzle/schema";
import * as roomService from "./roomService";
import * as workItemService from "./workItemService";

interface BaseAssistantRoomActionInput {
  tenantId: string;
  teamId: string;
  roomId: string;
  actorAssistantId: string;
  actorUserId?: number;
}

export interface PromoteMessageToWorkItemInput extends BaseAssistantRoomActionInput {
  messageId: string;
  title?: string;
  objective?: string;
  targetStep?: workItemService.WorkItemWorkflowStep;
}

export interface AdvanceWorkItemByAssistantInput extends BaseAssistantRoomActionInput {
  workItemId: string;
  replyToMessageId?: string;
  targetStep?: workItemService.WorkItemWorkflowStep;
}

export interface ApproveWorkItemByAssistantInput extends BaseAssistantRoomActionInput {
  workItemId: string;
  replyToMessageId?: string;
}

export interface RequestWorkItemChangesByAssistantInput extends BaseAssistantRoomActionInput {
  workItemId: string;
  reason?: string;
  replyToMessageId?: string;
}

interface RoomActionContext {
  roomId: string;
  teamId: string;
  actorAssistantId: string;
}

function truncateInline(value: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeMessageMetadata(value: unknown): {
  threadRootMessageId?: string | null;
  workItemId?: string | null;
} {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    threadRootMessageId:
      typeof record.threadRootMessageId === "string" ? record.threadRootMessageId : null,
    workItemId: typeof record.workItemId === "string" ? record.workItemId : null,
  };
}

async function assertRoomContext(input: BaseAssistantRoomActionInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [room] = await db
    .select({ id: teamRooms.id })
    .from(teamRooms)
    .where(
      and(
        eq(teamRooms.id, input.roomId),
        eq(teamRooms.teamId, input.teamId),
        eq(teamRooms.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  if (!room) {
    throw new Error("Room not found in the specified team");
  }

  const [assistant] = await db
    .select({ id: assistantProfiles.id })
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.id, input.actorAssistantId),
        eq(assistantProfiles.teamId, input.teamId),
        eq(assistantProfiles.tenantId, input.tenantId),
        eq(assistantProfiles.isActive, true),
      ),
    )
    .limit(1);

  if (!assistant) {
    throw new Error("Assistant actor is not active in the specified team");
  }
}

async function getRoomMessageOrThrow(
  tenantId: string,
  roomId: string,
  messageId: string,
): Promise<TeamRoomMessage> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [message] = await db
    .select()
    .from(teamRoomMessages)
    .where(
      and(
        eq(teamRoomMessages.id, messageId),
        eq(teamRoomMessages.roomId, roomId),
      ),
    )
    .limit(1);

  if (!message) {
    throw new Error("Room message not found");
  }

  const [room] = await db
    .select({ id: teamRooms.id })
    .from(teamRooms)
    .where(and(eq(teamRooms.id, roomId), eq(teamRooms.tenantId, tenantId)))
    .limit(1);

  if (!room) {
    throw new Error("Room not found");
  }

  return message;
}

async function postAssistantDecision(params: {
  tenantId: string;
  roomId: string;
  actorAssistantId: string;
  runId?: string | null;
  workItemId: string;
  messageType: roomService.WorkUpdateMessageType;
  content: string;
  replyToMessageId?: string;
  threadRootMessageId?: string;
}): Promise<TeamRoomMessage> {
  return roomService.postWorkUpdate({
    roomId: params.roomId,
    tenantId: params.tenantId,
    senderAssistantId: params.actorAssistantId,
    runId: params.runId ?? undefined,
    workItemId: params.workItemId,
    messageType: params.messageType,
    content: params.content,
    replyToMessageId: params.replyToMessageId,
    threadRootMessageId: params.threadRootMessageId,
    sensitivity: "medium",
  });
}

export async function promoteMessageToWorkItem(
  input: PromoteMessageToWorkItemInput,
): Promise<{
  workItem: TeamWorkItem;
  createdMessage: TeamRoomMessage;
  autoRouted?: {
    workItem: TeamWorkItem;
    targetStep: workItemService.WorkItemWorkflowStep;
    roomMessage: TeamRoomMessage;
  };
}> {
  await assertRoomContext(input);

  const sourceMessage = await getRoomMessageOrThrow(input.tenantId, input.roomId, input.messageId);
  const sourceMetadata = normalizeMessageMetadata(sourceMessage.metadataJson);
  const title = input.title?.trim() || `Follow up: ${truncateInline(sourceMessage.content)}`;

  const createdWorkItem = await workItemService.createWorkItem({
    tenantId: input.tenantId,
    teamId: input.teamId,
    roomId: input.roomId,
    runId: sourceMessage.runId ?? undefined,
    sourceType: "room_message",
    sourceRef: sourceMessage.id,
    title,
    objective: input.objective?.trim() || sourceMessage.content,
    actorAssistantId: input.actorAssistantId,
    actorUserId: input.actorUserId,
    autoAssignByRole: true,
  });

  const createdMessage = await postAssistantDecision({
    tenantId: input.tenantId,
    roomId: input.roomId,
    actorAssistantId: input.actorAssistantId,
    runId: sourceMessage.runId,
    workItemId: createdWorkItem.id,
    messageType: "decision",
    content: `Promoted this thread into a tracked work item: ${createdWorkItem.title}`,
    replyToMessageId: sourceMessage.id,
    threadRootMessageId: sourceMetadata.threadRootMessageId ?? sourceMessage.id,
  });

  const attachedWorkItem = createdWorkItem.threadRootMessageId
    ? createdWorkItem
    : await workItemService.setThreadRootMessageId(
        createdWorkItem.id,
        createdMessage.id,
        input.tenantId,
      );

  const targetStep = input.targetStep ?? "research";
  const routed = await workItemService.routeWorkItemByRole({
    tenantId: input.tenantId,
    workItemId: attachedWorkItem.id,
    expectedRevisionVersion: attachedWorkItem.revisionVersion,
    actorAssistantId: input.actorAssistantId,
    targetStep,
  });

  const routedMessage = await postAssistantDecision({
    tenantId: input.tenantId,
    roomId: input.roomId,
    actorAssistantId: input.actorAssistantId,
    runId: sourceMessage.runId,
    workItemId: routed.workItem.id,
    messageType: "decision",
    content: `Moved the new work item to ${routed.targetStep} stage.`,
    replyToMessageId: createdMessage.id,
    threadRootMessageId: createdMessage.id,
  });

  return {
    workItem: routed.workItem,
    createdMessage,
    autoRouted: {
      workItem: routed.workItem,
      targetStep: routed.targetStep,
      roomMessage: routedMessage,
    },
  };
}

export async function advanceWorkItemByAssistant(
  input: AdvanceWorkItemByAssistantInput,
): Promise<{
  workItem: TeamWorkItem;
  targetStep: workItemService.WorkItemWorkflowStep;
  roomMessage: TeamRoomMessage;
}> {
  await assertRoomContext(input);
  const current = await workItemService.getWorkItem(input.workItemId, input.tenantId);
  if (current.roomId !== input.roomId || current.teamId !== input.teamId) {
    throw new Error("Work item does not belong to the specified room/team");
  }

  const routed = await workItemService.routeWorkItemByRole({
    tenantId: input.tenantId,
    workItemId: current.id,
    expectedRevisionVersion: current.revisionVersion,
    actorAssistantId: input.actorAssistantId,
    targetStep: input.targetStep,
  });

  const roomMessage = await postAssistantDecision({
    tenantId: input.tenantId,
    roomId: input.roomId,
    actorAssistantId: input.actorAssistantId,
    runId: routed.workItem.runId,
    workItemId: routed.workItem.id,
    messageType: "decision",
    content: `Moved the work item to ${routed.targetStep} stage.`,
    replyToMessageId: input.replyToMessageId ?? current.threadRootMessageId ?? undefined,
    threadRootMessageId: current.threadRootMessageId ?? input.replyToMessageId,
  });

  return {
    workItem: routed.workItem,
    targetStep: routed.targetStep,
    roomMessage,
  };
}

export async function approveWorkItemByAssistant(
  input: ApproveWorkItemByAssistantInput,
): Promise<{
  workItem: TeamWorkItem;
  roomMessage: TeamRoomMessage;
}> {
  await assertRoomContext(input);
  const current = await workItemService.getWorkItem(input.workItemId, input.tenantId);
  if (current.roomId !== input.roomId || current.teamId !== input.teamId) {
    throw new Error("Work item does not belong to the specified room/team");
  }

  const approved = await workItemService.approveWorkItemRevision({
    tenantId: input.tenantId,
    workItemId: current.id,
    expectedRevisionVersion: current.revisionVersion,
    approverMemberId: input.actorAssistantId,
  });

  const roomMessage = await postAssistantDecision({
    tenantId: input.tenantId,
    roomId: input.roomId,
    actorAssistantId: input.actorAssistantId,
    runId: approved.runId,
    workItemId: approved.id,
    messageType: "approval",
    content: `Approved work item revision v${approved.revisionVersion}: ${approved.title}`,
    replyToMessageId: input.replyToMessageId ?? approved.threadRootMessageId ?? undefined,
    threadRootMessageId: approved.threadRootMessageId ?? input.replyToMessageId,
  });

  return {
    workItem: approved,
    roomMessage,
  };
}

export async function requestWorkItemChangesByAssistant(
  input: RequestWorkItemChangesByAssistantInput,
): Promise<{
  workItem: TeamWorkItem;
  roomMessage: TeamRoomMessage;
  autoRouted?: {
    workItem: TeamWorkItem;
    targetStep: workItemService.WorkItemWorkflowStep;
    roomMessage: TeamRoomMessage;
  };
}> {
  await assertRoomContext(input);
  const current = await workItemService.getWorkItem(input.workItemId, input.tenantId);
  if (current.roomId !== input.roomId || current.teamId !== input.teamId) {
    throw new Error("Work item does not belong to the specified room/team");
  }

  const rejected = await workItemService.rejectWorkItemRevision({
    tenantId: input.tenantId,
    workItemId: current.id,
    expectedRevisionVersion: current.revisionVersion,
    approverMemberId: input.actorAssistantId,
    reason: input.reason,
  });

  const roomMessage = await postAssistantDecision({
    tenantId: input.tenantId,
    roomId: input.roomId,
    actorAssistantId: input.actorAssistantId,
    runId: rejected.runId,
    workItemId: rejected.id,
    messageType: "decision",
    content:
      input.reason?.trim()
        ? `Requested changes: ${input.reason.trim()}`
        : `Requested changes for work item revision v${rejected.revisionVersion}.`,
    replyToMessageId: input.replyToMessageId ?? rejected.threadRootMessageId ?? undefined,
    threadRootMessageId: rejected.threadRootMessageId ?? input.replyToMessageId,
  });

  const autoAdvanceStep = workItemService.suggestAutoAdvanceStep(rejected);
  if (!autoAdvanceStep) {
    return { workItem: rejected, roomMessage };
  }

  const routed = await workItemService.routeWorkItemByRole({
    tenantId: input.tenantId,
    workItemId: rejected.id,
    expectedRevisionVersion: rejected.revisionVersion,
    actorAssistantId: input.actorAssistantId,
    targetStep: autoAdvanceStep,
  });

  const routedMessage = await postAssistantDecision({
    tenantId: input.tenantId,
    roomId: input.roomId,
    actorAssistantId: input.actorAssistantId,
    runId: routed.workItem.runId,
    workItemId: routed.workItem.id,
    messageType: "decision",
    content: `Routed the revised work item back to ${routed.targetStep} stage.`,
    replyToMessageId: roomMessage.id,
    threadRootMessageId: rejected.threadRootMessageId ?? roomMessage.id,
  });

  return {
    workItem: routed.workItem,
    roomMessage,
    autoRouted: {
      workItem: routed.workItem,
      targetStep: routed.targetStep,
      roomMessage: routedMessage,
    },
  };
}
