import type { MediaAuditContext, MediaTask } from "./mediaGenerationService";
import { ensureMarketplaceAutoReviewTaskResultDurable } from "./marketplaceAutoReviewMediaAssetService";
import { ensureVerticalDramaTaskResultDurable } from "./verticalDramaMediaAssetService";
import { ensureMediaTaskArtifactsForPolling } from "./mediaTaskArtifactService";
import { isTransientGenerationError } from "../../shared/transientGenerationError";

export { isTransientGenerationError };

export type UnifiedMediaTaskPollInput = {
  taskId: string;
  userId: number;
  userToken: string;
  tenantId?: string | null;
  auditContext?: MediaAuditContext;
};

export type TransientMediaPollRetryHint = {
  kind: "rate_limit" | "timeout" | "upstream";
  retryAfterSeconds: number;
};

const MEDIA_POLL_DEFAULT_RATE_LIMIT_RETRY_SECONDS = 60;
const MEDIA_POLL_DEFAULT_TRANSIENT_RETRY_SECONDS = 15;

function collectPollErrorText(
  error: unknown,
  output: string[],
  depth = 0
): void {
  if (depth > 4 || error == null) return;
  if (typeof error === "string") {
    output.push(error);
    return;
  }
  if (error instanceof Error) output.push(error.message);
  if (typeof error !== "object") return;
  for (const [key, value] of Object.entries(error as Record<string, unknown>)) {
    if (
      ["message", "detail", "error", "raw", "responsePayload", "data"].includes(
        key
      )
    ) {
      collectPollErrorText(value, output, depth + 1);
    }
  }
}

function readPollErrorNumber(
  error: unknown,
  keys: string[]
): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  for (const key of keys) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Classifies failures while reading an already-submitted provider task.
 * These failures mean that the task outcome could not be observed; they do
 * not mean that the provider declared the generation failed.
 */
export function getTransientMediaPollRetryHint(
  error: unknown
): TransientMediaPollRetryHint | null {
  const messages: string[] = [];
  collectPollErrorText(error, messages);
  const text = messages.join(" ").replace(/\s+/g, " ").trim();
  const statusCode = readPollErrorNumber(error, [
    "statusCode",
    "status",
    "httpStatus",
  ]);
  const retryAfter =
    readPollErrorNumber(error, ["retryAfterSeconds", "retryAfter"]) ??
    Number(
      text.match(
        /(?:retry[- ]after|try again in)\s+(\d+(?:\.\d+)?)\s*seconds?/i
      )?.[1]
    );
  const boundedRetryAfter =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(300, Math.max(1, Math.ceil(retryAfter)))
      : undefined;

  if (
    statusCode === 429 ||
    /\b429\b|rate[ -]?limit|too many requests|hourly limit|quota exceeded/i.test(
      text
    )
  ) {
    return {
      kind: "rate_limit",
      retryAfterSeconds:
        boundedRetryAfter ?? MEDIA_POLL_DEFAULT_RATE_LIMIT_RETRY_SECONDS,
    };
  }

  if (
    statusCode === 408 ||
    /\b408\b|request timeout|timed? out|abort(?:ed)?|deadline exceeded/i.test(
      text
    )
  ) {
    return {
      kind: "timeout",
      retryAfterSeconds:
        boundedRetryAfter ?? MEDIA_POLL_DEFAULT_TRANSIENT_RETRY_SECONDS,
    };
  }

  if (
    (statusCode != null && statusCode >= 500 && statusCode <= 599) ||
    /\b5\d{2}\b|failed to fetch|networkerror|connection reset|connection refused|upstream|gateway|provider status temporarily unavailable/i.test(
      text
    )
  ) {
    return {
      kind: "upstream",
      retryAfterSeconds:
        boundedRetryAfter ?? MEDIA_POLL_DEFAULT_TRANSIENT_RETRY_SECONDS,
    };
  }

  return null;
}

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

  const auditContext = input.auditContext
    ? {
        ...input.auditContext,
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      }
    : input.tenantId
      ? { tenantId: input.tenantId }
      : undefined;

  const mcpTask = await getMcpMediaTask(
    input.taskId,
    input.userId,
    input.tenantId ?? undefined
  );
  if (mcpTask) return durabilizeTask(mcpTask, input);

  const deferredTask = await getDeferredMediaTask(
    input.taskId,
    input.userId,
    input.userToken,
    auditContext ? { ...auditContext, stage: "deferred_poll" } : undefined
  );
  if (deferredTask) return durabilizeTask(deferredTask, input);

  const task = await mediaGenerationService.getTask(
    input.taskId,
    input.userToken,
    auditContext
  );
  return durabilizeTask(task, input);
}

async function durabilizeTask(
  task: MediaTask,
  input: UnifiedMediaTaskPollInput
): Promise<MediaTask> {
  // Vertical Drama and Marketplace Auto Review have their own canonical
  // asset ledgers. Media Studio tasks use the shared provider-provenance
  // ledger, but must not duplicate those domain-owned outputs.
  const internalParams = {
    ...(task.parameters ?? {}),
    ...((task.parameters?.extra_params as
      | Record<string, unknown>
      | undefined) ?? {}),
    ...((task.resultData?.extra_params as
      | Record<string, unknown>
      | undefined) ?? {}),
  };
  const isDomainOwnedTask = Boolean(
    internalParams.__vd_series_id || internalParams.__auto_review_run_id
  );
  const durableTask =
    input.tenantId && !isDomainOwnedTask
      ? await ensureMediaTaskArtifactsForPolling({
          task,
          tenantId: input.tenantId,
          userId: input.userId,
        })
      : task;
  if (input.tenantId) {
    const verticalDrama = await ensureVerticalDramaTaskResultDurable({
      tenantId: input.tenantId,
      userId: input.userId,
      task: durableTask,
    });
    if (verticalDrama?.task) return verticalDrama.task;
  }
  const marketplaceAutoReview =
    await ensureMarketplaceAutoReviewTaskResultDurable({
      tenantId: input.tenantId,
      userId: input.userId,
      task: durableTask,
    });
  return marketplaceAutoReview?.task ?? durableTask;
}
