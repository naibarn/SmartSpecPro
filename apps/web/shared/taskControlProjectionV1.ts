export type TaskControlProjectionV1 = {
  readonly schemaVersion: "smartaihub.task-control-projection.v1";
  readonly workspaceId: string | null;
  readonly items: readonly {
    readonly taskId: string;
    readonly jobId: string;
    readonly threadId: string | null;
    readonly conversationId: number | null;
    readonly runId: string | null;
    readonly attemptId: string | null;
    readonly status: string;
    readonly agentId: string | null;
    readonly harnessId: string | null;
    readonly executorId: string | null;
    readonly machineId: string | null;
    readonly eventCursor: number | null;
    readonly artifactIds: readonly string[];
    readonly updatedAt: string;
  }[];
  readonly nextCursor: string | null;
};

export function projectTaskControlV1(input: {
  readonly workspaceId: string | null;
  readonly page: {
    readonly items: readonly {
      readonly id?: unknown;
      readonly status?: unknown;
      readonly createdAt?: unknown;
      readonly threadId?: unknown;
      readonly conversationId?: unknown;
      readonly executionIdentity?: unknown;
      readonly heartbeatAt?: unknown;
    }[];
    readonly nextCursor: string | null;
  };
}): TaskControlProjectionV1 {
  return {
    schemaVersion: "smartaihub.task-control-projection.v1",
    workspaceId: input.workspaceId,
    items: input.page.items.flatMap((item) => {
      if (typeof item.id !== "string" || typeof item.status !== "string" || typeof item.createdAt !== "string") return [];
      const executionIdentity = item.executionIdentity && typeof item.executionIdentity === "object"
        ? item.executionIdentity as Record<string, unknown>
        : null;
      return [{
        taskId: item.id,
        jobId: item.id,
        threadId: typeof item.threadId === "string" ? item.threadId : null,
        conversationId: Number.isSafeInteger(item.conversationId) && Number(item.conversationId) > 0 ? Number(item.conversationId) : null,
        runId: typeof executionIdentity?.runId === "string" ? executionIdentity.runId : null,
        attemptId: null,
        status: item.status,
        // This list projection has labels, not trusted canonical entity IDs.
        agentId: null,
        harnessId: null,
        executorId: null,
        machineId: null,
        eventCursor: null,
        artifactIds: [],
        updatedAt: typeof item.heartbeatAt === "string" ? item.heartbeatAt : item.createdAt,
      }];
    }),
    nextCursor: input.page.nextCursor,
  };
}
