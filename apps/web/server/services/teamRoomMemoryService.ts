import { createMemory, deleteMemory, listMemories, updateMemory } from "./scopedMemoryService";
import { extractEntitiesFromMessage, upsertEntityMemory } from "./memoryService";
import { getMessages } from "./roomService";
import { buildSmartSummary } from "./smartSummarizer";

function normalizeMemoryText(content: string, maxLength = 1600): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildScopedMemoryTitle(input: {
  assistantLabel?: string | null;
  objective: string;
}): string {
  const actorPrefix = input.assistantLabel?.trim()
    ? `${input.assistantLabel.trim()} update`
    : "Room update";
  const objective = normalizeMemoryText(input.objective, 90);
  return `${actorPrefix}: ${objective}`;
}

function buildRollingSummaryTitle(ownerLabel: string): string {
  return `Working summary: ${ownerLabel}`;
}

function normalizeTeamRoomMessageContent(message: { content: string; summaryContent?: string | null }): string {
  const content = (message.summaryContent ?? message.content ?? "").replace(/\s+/g, " ").trim();
  return content;
}

async function upsertRollingSummaryMemory(input: {
  tenantId: string;
  ownerType: "room" | "team";
  ownerId: string;
  assistantId: string;
  assistantLabel?: string | null;
  objective: string;
  summary: string;
  projectId?: string | null;
  sourceRoomId?: string | null;
  runId?: string | null;
  initiatedByUserId?: number;
  messageCount: number;
}): Promise<string | null> {
  const title = buildRollingSummaryTitle(input.ownerId);
  const summaryContent = input.summary.trim();
  if (!summaryContent) return null;

  const memoryCandidates = await listMemories(input.tenantId, input.ownerType, input.ownerId, 32).catch(() => []);
  const summaryMemories = memoryCandidates.filter((memory) => {
    const metadata = (memory.metadataJson ?? {}) as Record<string, unknown>;
    const contextRole = typeof metadata.contextRole === "string" ? metadata.contextRole : "";
    const summaryKind = typeof metadata.summaryKind === "string" ? metadata.summaryKind : "";
    const normalizedTitle = memory.title.trim().toLowerCase();
    return (
      contextRole === "working_summary" ||
      summaryKind === "working_summary" ||
      normalizedTitle.startsWith("working summary")
    );
  });

  const existing = summaryMemories.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
  const duplicateIds = summaryMemories
    .filter((memory) => !existing || memory.id !== existing.id)
    .map((memory) => memory.id);

  await Promise.all(
    duplicateIds.map((id) => deleteMemory(id, input.tenantId).catch(() => false)),
  );

  const metadata = {
    contextRole: "working_summary",
    summaryKind: "working_summary",
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    roomId: input.sourceRoomId ?? null,
    teamId: input.ownerType === "team" ? input.ownerId : null,
    projectId: input.projectId ?? null,
    runId: input.runId ?? null,
    assistantId: input.assistantId,
    assistantLabel: input.assistantLabel ?? null,
    initiatedByUserId: input.initiatedByUserId ?? null,
    messageCount: input.messageCount,
    objective: input.objective,
    updatedAt: new Date().toISOString(),
  };

  const content = [
    `Objective: ${normalizeMemoryText(input.objective, 240)}`,
    `Current summary: ${summaryContent}`,
  ].join("\n\n");

  if (existing) {
    const updated = await updateMemory(existing.id, input.tenantId, {
      title,
      content,
      summary: summaryContent,
      tags: ["context-engine", "working-summary", input.ownerType],
      metadataJson: metadata,
      confidence: "0.94",
      importance: 8,
      reinforcementCount: (existing.reinforcementCount ?? 0) + 1,
    });
    return updated?.id ?? existing.id;
  }

  const created = await createMemory({
    tenantId: input.tenantId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    memoryKind: "note",
    sourceType: "auto",
    sourceAssistantId: input.assistantId,
    sourceUserId: input.initiatedByUserId ?? null,
    sourceRoomId: input.sourceRoomId ?? null,
    projectId: input.projectId ?? null,
    title,
    content,
    summary: summaryContent,
    tags: ["context-engine", "working-summary", input.ownerType],
    metadataJson: metadata,
    confidence: "0.94",
    importance: 8,
    reinforcementCount: 1,
  });

  return created.id;
}

export async function captureUserMemoryFromTeamMessage(input: {
  tenantId: string;
  userId: number;
  content: string;
  projectId?: string | null;
}): Promise<number> {
  const extracted = extractEntitiesFromMessage(input.content);
  if (extracted.length === 0) return 0;

  const seen = new Set<string>();
  let stored = 0;

  for (const entity of extracted) {
    const key = `${entity.type}:${entity.name}:${entity.fact}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      await upsertEntityMemory(
        input.userId,
        entity.type,
        entity.name,
        [entity.fact],
        undefined,
        entity.importance,
        "team_room",
        input.projectId ?? null,
        null,
      );
      stored += 1;
    } catch (error) {
      console.warn("[teamRoomMemoryService] failed to store entity memory", {
        userId: input.userId,
        tenantId: input.tenantId,
        entityType: entity.type,
        entityName: entity.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return stored;
}

export async function recordAssistantTurnScopedMemories(input: {
  tenantId: string;
  teamId: string;
  roomId: string;
  runId?: string | null;
  assistantId: string;
  assistantLabel?: string | null;
  objective: string;
  content: string;
  initiatedByUserId?: number;
  projectId?: string | null;
  messageId?: string | null;
}): Promise<string[]> {
  const normalizedObjective = normalizeMemoryText(input.objective, 220);
  const normalizedContent = normalizeMemoryText(input.content, 1600);
  if (!normalizedContent) return [];

  const memoryPayload = {
    tenantId: input.tenantId,
    memoryKind: "episode" as const,
    sourceType: "auto" as const,
    sourceUserId: input.initiatedByUserId ?? null,
    sourceAssistantId: input.assistantId,
    sourceRoomId: input.roomId,
    projectId: input.projectId ?? null,
    title: buildScopedMemoryTitle({
      assistantLabel: input.assistantLabel,
      objective: normalizedObjective,
    }),
    content: [
      `Objective: ${normalizedObjective}`,
      `Assistant output: ${normalizedContent}`,
    ].join("\n\n"),
    metadataJson: {
      runId: input.runId ?? null,
      roomId: input.roomId,
      teamId: input.teamId,
      messageId: input.messageId ?? null,
      assistantId: input.assistantId,
      objective: normalizedObjective,
    },
  };

  const scopes = [
    input.runId
      ? { ownerType: "run" as const, ownerId: input.runId }
      : null,
    { ownerType: "room" as const, ownerId: input.roomId },
    { ownerType: "team" as const, ownerId: input.teamId },
  ].filter((scope): scope is { ownerType: "run" | "room" | "team"; ownerId: string } => Boolean(scope));

  const storedIds: string[] = [];
  for (const scope of scopes) {
    try {
      const memory = await createMemory({
        ...memoryPayload,
        ownerType: scope.ownerType,
        ownerId: scope.ownerId,
      });
      storedIds.push(memory.id);
    } catch (error) {
      console.warn("[teamRoomMemoryService] failed to store scoped memory", {
        tenantId: input.tenantId,
        ownerType: scope.ownerType,
        ownerId: scope.ownerId,
        assistantId: input.assistantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return storedIds;
}

export async function refreshRollingSummaryMemories(input: {
  tenantId: string;
  teamId: string;
  roomId: string;
  runId?: string | null;
  assistantId: string;
  assistantLabel?: string | null;
  objective: string;
  initiatedByUserId?: number;
  projectId?: string | null;
  windowSize?: number;
}): Promise<string[]> {
  const windowSize = Math.max(6, Math.min(input.windowSize ?? 12, 24));
  const messages = await getMessages(input.roomId, input.tenantId, {
    callerType: "system",
    viewMode: "transparent",
    limit: windowSize,
  }).catch(() => []);

  if (messages.length === 0) return [];

  const summaryMessages = messages
    .map((message, index) => ({
      id: index,
      role: message.senderType === "assistant" ? "assistant" as const : "user" as const,
      content: normalizeTeamRoomMessageContent(message),
    }))
    .filter((message) => message.content.length > 0);

  if (summaryMessages.length === 0) return [];

  let summary = summaryMessages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  try {
    const smartSummary = await buildSmartSummary({
      messages: summaryMessages,
      userId: input.initiatedByUserId ?? 0,
      tenantId: input.tenantId,
    });
    if (smartSummary.summary.trim().length > 0) {
      summary = smartSummary.summary.trim();
    }
  } catch (error) {
    console.warn("[teamRoomMemoryService] rolling summary generation failed", {
      roomId: input.roomId,
      teamId: input.teamId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const storedIds: string[] = [];
  const roomSummaryId = await upsertRollingSummaryMemory({
    tenantId: input.tenantId,
    ownerType: "room",
    ownerId: input.roomId,
    assistantId: input.assistantId,
    assistantLabel: input.assistantLabel ?? null,
    objective: input.objective,
    summary,
    projectId: input.projectId ?? null,
    sourceRoomId: input.roomId,
    runId: input.runId ?? null,
    initiatedByUserId: input.initiatedByUserId,
    messageCount: summaryMessages.length,
  }).catch((error) => {
    console.warn("[teamRoomMemoryService] failed to upsert room summary", {
      roomId: input.roomId,
      teamId: input.teamId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (roomSummaryId) storedIds.push(roomSummaryId);

  const teamSummaryId = await upsertRollingSummaryMemory({
    tenantId: input.tenantId,
    ownerType: "team",
    ownerId: input.teamId,
    assistantId: input.assistantId,
    assistantLabel: input.assistantLabel ?? null,
    objective: input.objective,
    summary,
    projectId: input.projectId ?? null,
    sourceRoomId: input.roomId,
    runId: input.runId ?? null,
    initiatedByUserId: input.initiatedByUserId,
    messageCount: summaryMessages.length,
  }).catch((error) => {
    console.warn("[teamRoomMemoryService] failed to upsert team summary", {
      roomId: input.roomId,
      teamId: input.teamId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (teamSummaryId) storedIds.push(teamSummaryId);

  return storedIds;
}
