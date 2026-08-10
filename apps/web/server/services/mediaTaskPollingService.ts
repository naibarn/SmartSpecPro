import type { MediaAuditContext, MediaTask } from "./mediaGenerationService";
import { ensureMarketplaceAutoReviewTaskResultDurable } from "./marketplaceAutoReviewMediaAssetService";
import { ensureVerticalDramaTaskResultDurable } from "./verticalDramaMediaAssetService";

export type UnifiedMediaTaskPollInput = {
  taskId: string;
  userId: number;
  userToken: string;
  tenantId?: string | null;
  auditContext?: MediaAuditContext;
};

/**
 * The single task-polling boundary shared by `media.getTask` and Vertical
 * Drama's domain-specific settle/status procedures. The adapters are loaded
 * lazily so importing a Vertical Drama router does not eagerly pull the full
 * MCP/deferred transport graph into unrelated router tests.
 */
export async function getUnifiedMediaTask(
  input: UnifiedMediaTaskPollInput
): Promise<MediaTask> {
  const [
    { getMcpMediaTask },
    { getDeferredMediaTask },
    { mediaGenerationService },
  ] = await Promise.all([
    import("./mcpMediaAdapter"),
    import("./deferredMediaRetryService"),
    import("./mediaGenerationService"),
  ]);

  const mcpTask = await getMcpMediaTask(input.taskId, input.userId);
  if (mcpTask) return durabilizeTask(mcpTask, input);

  const deferredTask = await getDeferredMediaTask(
    input.taskId,
    input.userId,
    input.userToken,
    input.auditContext
      ? { ...input.auditContext, stage: "deferred_poll" }
      : undefined
  );
  if (deferredTask) return durabilizeTask(deferredTask, input);

  const task = await mediaGenerationService.getTask(
    input.taskId,
    input.userToken,
    input.auditContext
  );
  return durabilizeTask(task, input);
}

async function durabilizeTask(
  task: MediaTask,
  input: UnifiedMediaTaskPollInput
): Promise<MediaTask> {
  if (input.tenantId) {
    const verticalDrama = await ensureVerticalDramaTaskResultDurable({
      tenantId: input.tenantId,
      userId: input.userId,
      task,
    });
    if (verticalDrama?.task) return verticalDrama.task;
  }
  const marketplaceAutoReview =
    await ensureMarketplaceAutoReviewTaskResultDurable({
      tenantId: input.tenantId,
      userId: input.userId,
      task,
    });
  return marketplaceAutoReview?.task ?? task;
}
