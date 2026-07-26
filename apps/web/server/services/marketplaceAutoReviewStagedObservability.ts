import { buildProductionStableHash } from "../../shared/mediaProduction";

function safeText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function buildStagedSafeEvidenceEvent(input: {
  runId: string;
  operation: string;
  checkpointKind?: string;
  shotId?: number | null;
  state?: string;
  model?: string | null;
  provider?: string | null;
  estimatedCredits?: number | null;
  contentHash?: string | null;
}) {
  return {
    runId: safeText(input.runId, 120),
    operation: safeText(input.operation, 80),
    checkpointKind: safeText(input.checkpointKind, 40) || null,
    shotId: input.shotId ?? null,
    state: safeText(input.state, 40) || null,
    model: safeText(input.model, 100) || null,
    provider: safeText(input.provider, 100) || null,
    estimatedCredits:
      typeof input.estimatedCredits === "number" && Number.isFinite(input.estimatedCredits)
        ? input.estimatedCredits
        : null,
    contentHash: safeText(input.contentHash, 128) || null,
    evidenceId: buildProductionStableHash({
      runId: input.runId,
      operation: input.operation,
      checkpointKind: input.checkpointKind ?? null,
      shotId: input.shotId ?? null,
      contentHash: input.contentHash ?? null,
    }),
  };
}
