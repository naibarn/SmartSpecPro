import type { StoryGenerationStage, StoryGenerationStatus } from "./verticalDramaStoryGenerationContracts";

export type StoryGenerationTelemetryEvent = {
  eventName: string;
  tenantId: string;
  runId: string;
  attemptId: string | null;
  status: StoryGenerationStatus;
  stage: StoryGenerationStage;
  contractHash: string;
  eventCursor: number;
  metadata: Record<string, string | number | boolean | null>;
};

const SENSITIVE_KEYS = /prompt|story|draft|source|token|secret|authorization|url|payload/i;

export function buildStoryGenerationTelemetryEvent(input: {
  eventName: string;
  tenantId: string;
  runId: string;
  attemptId?: string | null;
  status: StoryGenerationStatus;
  stage: StoryGenerationStage;
  contractHash: string;
  eventCursor: number;
  metadata?: Record<string, unknown>;
}): StoryGenerationTelemetryEvent {
  const metadata: StoryGenerationTelemetryEvent["metadata"] = {};
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (SENSITIVE_KEYS.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      metadata[key] = value;
    }
  }
  return {
    eventName: input.eventName,
    tenantId: input.tenantId,
    runId: input.runId,
    attemptId: input.attemptId ?? null,
    status: input.status,
    stage: input.stage,
    contractHash: input.contractHash,
    eventCursor: input.eventCursor,
    metadata,
  };
}
