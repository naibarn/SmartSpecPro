import {
  AgentRuntimeCheckpointSchema,
  type AgentRuntimeCheckpoint,
} from "../../../shared/agentRuntime/runtimeEvents";
import type { AgentRuntimeSurface } from "../../../shared/agentRuntime/types";

export interface GenericCheckpointRecord {
  checkpointId: string;
  tenantId: string;
  surface: AgentRuntimeSurface;
  requestId: string;
  status: AgentRuntimeCheckpoint["status"];
  resumeCursor: string | null;
  checkpointPayload: Record<string, unknown>;
  originalCheckpointId: string | null;
  attemptId: string | null;
}

export interface WorkOsCheckpointRecord extends GenericCheckpointRecord {
  workApprovalId: string;
  workAutomationRunId: string;
}

export interface AgentRuntimeCheckpointRepository {
  upsertGenericCheckpoint(record: GenericCheckpointRecord): Promise<void>;
  upsertWorkOsCheckpoint(record: WorkOsCheckpointRecord): Promise<void>;
}

export interface PersistAgentRuntimeCheckpointInput {
  checkpoint: AgentRuntimeCheckpoint;
  repository: AgentRuntimeCheckpointRepository;
  workApprovalId?: string | null;
  workAutomationRunId?: string | null;
  originalCheckpointId?: string | null;
  attemptId?: string | null;
}

export interface PersistAgentRuntimeCheckpointResult {
  storage: "generic" | "work_os";
  checkpointId: string;
}

function toBaseRecord(
  input: PersistAgentRuntimeCheckpointInput,
  checkpoint: AgentRuntimeCheckpoint,
): GenericCheckpointRecord {
  return {
    checkpointId: checkpoint.checkpointId,
    tenantId: checkpoint.tenantId,
    surface: checkpoint.surface,
    requestId: checkpoint.requestId,
    status: checkpoint.status,
    resumeCursor: checkpoint.resumeCursor ?? null,
    checkpointPayload: checkpoint.checkpointPayload ?? {},
    originalCheckpointId: input.originalCheckpointId ?? null,
    attemptId: input.attemptId ?? null,
  };
}

export async function persistAgentRuntimeCheckpoint(
  input: PersistAgentRuntimeCheckpointInput,
): Promise<PersistAgentRuntimeCheckpointResult> {
  const checkpoint = AgentRuntimeCheckpointSchema.parse(input.checkpoint);
  const baseRecord = toBaseRecord(input, checkpoint);

  if (
    checkpoint.surface === "team" &&
    input.workApprovalId &&
    input.workAutomationRunId
  ) {
    await input.repository.upsertWorkOsCheckpoint({
      ...baseRecord,
      workApprovalId: input.workApprovalId,
      workAutomationRunId: input.workAutomationRunId,
    });
    return {
      storage: "work_os",
      checkpointId: checkpoint.checkpointId,
    };
  }

  await input.repository.upsertGenericCheckpoint(baseRecord);
  return {
    storage: "generic",
    checkpointId: checkpoint.checkpointId,
  };
}
