import type { DrizzleDB } from "../db";
import type { TeamRun } from "../../drizzle/schema";

export type WorkRequestCompletionContext = {
  requestId: string | null;
  requestTitle: string | null;
  caseId: string | null;
  requesterUserId: number | null;
  actionUrl: string;
};

export function buildWorkRequestResultUrl(input: {
  requestId: string | null;
  caseId: string | null;
  runId: string;
}): string {
  const params = new URLSearchParams();
  if (input.requestId) params.set("requestId", input.requestId);
  if (input.caseId) params.set("caseId", input.caseId);
  params.set("runId", input.runId);
  params.set("result", "1");
  return `/work/requests?${params.toString()}`;
}

export function buildTeamRunCompletionNotification(input: {
  run: Pick<TeamRun, "id" | "roomId" | "teamId" | "objective">;
  reason: string;
  context: WorkRequestCompletionContext;
}) {
  const requestTitle = input.context.requestTitle ?? input.run.objective ?? "your request";
  return {
    userId: input.context.requesterUserId,
    type: "system" as const,
    title: "Work Request completed",
    content: `Team automation finished "${requestTitle}". Open the result from My Requests.`,
    priority: "normal" as const,
    relatedResourceType: "team_run" as const,
    relatedResourceId: input.run.id,
    actionUrl: input.context.actionUrl,
    actionLabel: "Open result",
    groupKey: `team-run-completed:${input.run.id}`,
    metadata: {
      source: "team_run_completion",
      eventId: `team-run-completed:${input.run.id}`,
      signal: input.reason,
      relatedItems: {
        runId: input.run.id,
        roomId: input.run.roomId,
        teamId: input.run.teamId,
        ...(input.context.requestId ? { requestId: input.context.requestId } : {}),
        ...(input.context.caseId ? { caseId: input.context.caseId } : {}),
      },
    },
  };
}

export async function notifyRequesterOfTeamRunCompletion(input: {
  db: DrizzleDB;
  run: Pick<TeamRun, "id" | "roomId" | "teamId" | "objective">;
  reason: string;
  context: WorkRequestCompletionContext;
}): Promise<void> {
  if (!input.context.requesterUserId) return;
  const { createNotification } = await import("./notificationService");
  const payload = buildTeamRunCompletionNotification({
    run: input.run,
    reason: input.reason,
    context: input.context,
  });
  if (!payload.userId) return;
  await createNotification({
    db: input.db,
    userId: payload.userId,
    type: payload.type,
    title: payload.title,
    content: payload.content,
    priority: payload.priority,
    relatedResourceType: payload.relatedResourceType,
    relatedResourceId: payload.relatedResourceId,
    actionUrl: payload.actionUrl,
    actionLabel: payload.actionLabel,
    groupKey: payload.groupKey,
    metadata: payload.metadata,
  });
}
