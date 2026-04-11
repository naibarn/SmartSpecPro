import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { roleRecords } from "../../drizzle/schema";
import {
  type RoleAgent,
  roleAgentSchema,
  type RoleApprovalRequest,
  roleApprovalRequestSchema,
  type RoleBlueprint,
  roleBlueprintSchema,
  type RoleCheckpoint,
  roleCheckpointSchema,
  type RoleContract,
  roleContractSchema,
  type RoleExceptionBinding,
  roleExceptionBindingSchema,
  type RoleHandoff,
  roleHandoffSchema,
  type RoleImprovementProposal,
  roleImprovementProposalSchema,
  type RoleMemoryItem,
  roleMemoryItemSchema,
  type RoleMessage,
  roleMessageSchema,
  type RoleMetricSnapshot,
  roleMetricSnapshotSchema,
  type RolePromotionGate,
  rolePromotionGateSchema,
  type RoleRecordType,
  roleRecordTypeValues,
  type RoleRoutine,
  type RoleRoutineQueueItem,
  roleRoutineQueueItemSchema,
  type RoleRoutineRun,
  roleRoutineRunSchema,
  roleRoutineSchema,
  sanitizeRoleSensitivePayload,
  type RoleWorkpackBinding,
  roleWorkpackBindingSchema,
  requiresNewRoleContractVersion,
} from "../../shared/roleAgentContracts";
import {
  type RoleIncidentRecord,
  roleIncidentRecordSchema,
  type RoleTelemetryEvent,
  roleTelemetryEventSchema,
} from "../../shared/roleTelemetry";
import { getDb, type DrizzleDB } from "../db";

export interface RolePersistenceSession {
  db: DrizzleDB | null;
}

export interface RoleAgentDetailRecord {
  role: RoleAgent;
  blueprint: RoleBlueprint | null;
  activeContract: RoleContract | null;
  contracts: RoleContract[];
  bindings: RoleWorkpackBinding[];
  routines: RoleRoutine[];
  routineRuns: RoleRoutineRun[];
  checkpoints: RoleCheckpoint[];
  queueItems: RoleRoutineQueueItem[];
  approvals: RoleApprovalRequest[];
  messages: RoleMessage[];
  handoffs: RoleHandoff[];
  exceptionBindings: RoleExceptionBinding[];
  improvementProposals: RoleImprovementProposal[];
  promotionGates: RolePromotionGate[];
  telemetryEvents: RoleTelemetryEvent[];
  incidents: RoleIncidentRecord[];
  metricSnapshots: RoleMetricSnapshot[];
  memoryItems: RoleMemoryItem[];
}

type StoreState = {
  blueprints: Map<string, RoleBlueprint>;
  agents: Map<string, RoleAgent>;
  contracts: Map<string, RoleContract>;
  bindings: Map<string, RoleWorkpackBinding>;
  routines: Map<string, RoleRoutine>;
  routineRuns: Map<string, RoleRoutineRun>;
  checkpoints: Map<string, RoleCheckpoint>;
  messages: Map<string, RoleMessage>;
  handoffs: Map<string, RoleHandoff>;
  metricSnapshots: Map<string, RoleMetricSnapshot>;
  exceptionBindings: Map<string, RoleExceptionBinding>;
  improvementProposals: Map<string, RoleImprovementProposal>;
  promotionGates: Map<string, RolePromotionGate>;
  queueItems: Map<string, RoleRoutineQueueItem>;
  approvals: Map<string, RoleApprovalRequest>;
  memoryItems: Map<string, RoleMemoryItem>;
  telemetryEvents: Map<string, RoleTelemetryEvent>;
  incidents: Map<string, RoleIncidentRecord>;
};

type PersistedRoleRecordPayloadMap = {
  role_blueprint: RoleBlueprint;
  role_agent: RoleAgent;
  role_contract: RoleContract;
  role_workpack_binding: RoleWorkpackBinding;
  role_routine: RoleRoutine;
  role_routine_run: RoleRoutineRun;
  role_checkpoint: RoleCheckpoint;
  role_message: RoleMessage;
  role_handoff: RoleHandoff;
  role_metric_snapshot: RoleMetricSnapshot;
  role_exception_binding: RoleExceptionBinding;
  role_improvement_proposal: RoleImprovementProposal;
  role_promotion_gate: RolePromotionGate;
  role_telemetry_event: RoleTelemetryEvent;
  role_incident_record: RoleIncidentRecord;
  role_routine_queue_item: RoleRoutineQueueItem;
  role_approval_request: RoleApprovalRequest;
  role_memory_item: RoleMemoryItem;
};

type PersistedRolePayload<T extends RoleRecordType> = PersistedRoleRecordPayloadMap[T];

const state: StoreState = {
  blueprints: new Map(),
  agents: new Map(),
  contracts: new Map(),
  bindings: new Map(),
  routines: new Map(),
  routineRuns: new Map(),
  checkpoints: new Map(),
  messages: new Map(),
  handoffs: new Map(),
  metricSnapshots: new Map(),
  exceptionBindings: new Map(),
  improvementProposals: new Map(),
  promotionGates: new Map(),
  queueItems: new Map(),
  approvals: new Map(),
  memoryItems: new Map(),
  telemetryEvents: new Map(),
  incidents: new Map(),
};

const memoryKeyByType: Record<RoleRecordType, keyof StoreState> = {
  role_blueprint: "blueprints",
  role_agent: "agents",
  role_contract: "contracts",
  role_workpack_binding: "bindings",
  role_routine: "routines",
  role_routine_run: "routineRuns",
  role_checkpoint: "checkpoints",
  role_message: "messages",
  role_handoff: "handoffs",
  role_metric_snapshot: "metricSnapshots",
  role_exception_binding: "exceptionBindings",
  role_improvement_proposal: "improvementProposals",
  role_promotion_gate: "promotionGates",
  role_telemetry_event: "telemetryEvents",
  role_incident_record: "incidents",
  role_routine_queue_item: "queueItems",
  role_approval_request: "approvals",
  role_memory_item: "memoryItems",
};

let dbWarningIssued = false;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clearState(): void {
  for (const map of Object.values(state)) {
    map.clear();
  }
}

function isIsoExpired(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now;
}

function applyGovernanceToCheckpoint(checkpoint: RoleCheckpoint, now = Date.now()): RoleCheckpoint {
  const next = clone(checkpoint);
  if (isIsoExpired(next.governance.expiresAt ?? null, now) && !next.governance.legalHold) {
    next.objectiveSummary = "[Expired checkpoint context]";
    next.activeQueueSummary = [];
    next.recentDecisions = [];
    next.pendingApprovalIds = [];
    next.nextWakeConditions = [];
    next.progressCursor = {};
  } else {
    next.progressCursor = sanitizeRoleSensitivePayload(next.progressCursor) as Record<string, unknown>;
  }
  return next;
}

function applyGovernanceToMessage(message: RoleMessage): RoleMessage {
  const next = clone(message);
  next.metadata = sanitizeRoleSensitivePayload(next.metadata);
  if (next.visibilityClass === "redacted_summary") {
    next.contentSummary = next.contentSummary.slice(0, 140);
  }
  return next;
}

function applyGovernanceToMemory(memoryItem: RoleMemoryItem, now = Date.now()): RoleMemoryItem {
  const next = clone(memoryItem);
  if (isIsoExpired(next.governance.expiresAt ?? null, now) && !next.governance.legalHold) {
    next.summary = "[Expired memory]";
    next.relatedRefs = [];
  }
  return next;
}

function normalizeRolePayload<T extends RoleRecordType>(
  type: T,
  payload: PersistedRolePayload<T>,
): PersistedRolePayload<T> {
  switch (type) {
    case "role_agent":
      return {
        ...(clone(payload) as RoleAgent),
        ownershipContext: sanitizeRoleSensitivePayload((payload as RoleAgent).ownershipContext),
      } as PersistedRolePayload<T>;
    case "role_checkpoint":
      return applyGovernanceToCheckpoint(payload as RoleCheckpoint) as PersistedRolePayload<T>;
    case "role_message":
      return applyGovernanceToMessage(payload as RoleMessage) as PersistedRolePayload<T>;
    case "role_memory_item":
      return applyGovernanceToMemory(payload as RoleMemoryItem) as PersistedRolePayload<T>;
    case "role_improvement_proposal":
      return {
        ...(clone(payload) as RoleImprovementProposal),
        suggestedChange: sanitizeRoleSensitivePayload((payload as RoleImprovementProposal).suggestedChange),
      } as PersistedRolePayload<T>;
    default:
      return clone(payload) as PersistedRolePayload<T>;
  }
}

function mapForType<T extends RoleRecordType>(type: T): Map<string, PersistedRolePayload<T>> {
  return state[memoryKeyByType[type]] as Map<string, PersistedRolePayload<T>>;
}

function getRecordSortTimestamp<T extends RoleRecordType>(type: T, payload: PersistedRolePayload<T>): string | null {
  switch (type) {
    case "role_blueprint":
      return (payload as RoleBlueprint).updatedAt;
    case "role_agent":
      return (payload as RoleAgent).updatedAt;
    case "role_contract":
      return (payload as RoleContract).activatedAt ?? (payload as RoleContract).createdAt;
    case "role_workpack_binding":
      return (payload as RoleWorkpackBinding).createdAt;
    case "role_routine":
      return (payload as RoleRoutine).updatedAt;
    case "role_routine_run":
      return (payload as RoleRoutineRun).updatedAt;
    case "role_checkpoint":
      return (payload as RoleCheckpoint).updatedAt;
    case "role_message":
      return (payload as RoleMessage).createdAt;
    case "role_handoff":
      return (payload as RoleHandoff).updatedAt;
    case "role_metric_snapshot":
      return (payload as RoleMetricSnapshot).generatedAt;
    case "role_exception_binding":
      return (payload as RoleExceptionBinding).updatedAt;
    case "role_improvement_proposal":
      return (payload as RoleImprovementProposal).updatedAt;
    case "role_promotion_gate":
      return (payload as RolePromotionGate).evaluatedAt;
    case "role_telemetry_event":
      return (payload as RoleTelemetryEvent).createdAt;
    case "role_incident_record":
      return (payload as RoleIncidentRecord).resolvedAt ?? (payload as RoleIncidentRecord).createdAt;
    case "role_routine_queue_item":
      return (payload as RoleRoutineQueueItem).updatedAt;
    case "role_approval_request":
      return (payload as RoleApprovalRequest).resolvedAt ?? (payload as RoleApprovalRequest).createdAt;
    case "role_memory_item":
      return (payload as RoleMemoryItem).updatedAt;
    default:
      return null;
  }
}

function getRoleLink<T extends RoleRecordType>(type: T, payload: PersistedRolePayload<T>): string | null {
  switch (type) {
    case "role_agent":
      return (payload as RoleAgent).id;
    case "role_blueprint":
      return null;
    case "role_contract":
    case "role_workpack_binding":
    case "role_routine":
    case "role_routine_run":
    case "role_checkpoint":
    case "role_metric_snapshot":
    case "role_exception_binding":
    case "role_improvement_proposal":
    case "role_promotion_gate":
    case "role_routine_queue_item":
    case "role_approval_request":
    case "role_memory_item":
      return (payload as
        | RoleContract
        | RoleWorkpackBinding
        | RoleRoutine
        | RoleRoutineRun
        | RoleCheckpoint
        | RoleMetricSnapshot
        | RoleExceptionBinding
        | RoleImprovementProposal
        | RolePromotionGate
        | RoleRoutineQueueItem
        | RoleApprovalRequest
        | RoleMemoryItem).roleId;
    case "role_telemetry_event":
      return (payload as RoleTelemetryEvent).roleId;
    case "role_incident_record":
      return (payload as RoleIncidentRecord).roleId ?? null;
    case "role_message":
      return (payload as RoleMessage).senderRoleId;
    case "role_handoff":
      return (payload as RoleHandoff).senderRoleId;
    default:
      return null;
  }
}

function getRoutineLink<T extends RoleRecordType>(type: T, payload: PersistedRolePayload<T>): string | null {
  switch (type) {
    case "role_routine":
      return (payload as RoleRoutine).id;
    case "role_routine_run":
      return (payload as RoleRoutineRun).routineId;
    case "role_checkpoint":
      return (payload as RoleCheckpoint).routineId ?? null;
    case "role_message":
      return (payload as RoleMessage).relatedRoutineId ?? null;
    case "role_handoff":
      return (payload as RoleHandoff).relatedRoutineId ?? null;
    case "role_metric_snapshot":
      return (payload as RoleMetricSnapshot).routineId ?? null;
    case "role_exception_binding":
      return (payload as RoleExceptionBinding).routineId ?? null;
    case "role_improvement_proposal":
      return (payload as RoleImprovementProposal).routineId ?? null;
    case "role_promotion_gate":
      return (payload as RolePromotionGate).routineId ?? null;
    case "role_telemetry_event":
      return (payload as RoleTelemetryEvent).routineId ?? null;
    case "role_incident_record":
      return (payload as RoleIncidentRecord).routineId ?? null;
    case "role_routine_queue_item":
      return (payload as RoleRoutineQueueItem).routineId;
    case "role_approval_request":
      return (payload as RoleApprovalRequest).routineId ?? null;
    case "role_memory_item":
      return (payload as RoleMemoryItem).routineId ?? null;
    default:
      return null;
  }
}

function getRoutineRunLink<T extends RoleRecordType>(type: T, payload: PersistedRolePayload<T>): string | null {
  switch (type) {
    case "role_routine_run":
      return (payload as RoleRoutineRun).id;
    case "role_checkpoint":
      return (payload as RoleCheckpoint).routineRunId ?? null;
    case "role_message":
      return (payload as RoleMessage).relatedRoutineRunId ?? null;
    case "role_handoff":
      return (payload as RoleHandoff).relatedRoutineRunId ?? null;
    case "role_exception_binding":
      return (payload as RoleExceptionBinding).routineRunId ?? null;
    case "role_approval_request":
      return (payload as RoleApprovalRequest).routineRunId ?? null;
    case "role_memory_item":
      return (payload as RoleMemoryItem).routineRunId ?? null;
    case "role_incident_record":
      return null;
    default:
      return null;
  }
}

function parsePayload<T extends RoleRecordType>(type: T, payload: unknown): PersistedRolePayload<T> {
  switch (type) {
    case "role_blueprint":
      return roleBlueprintSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_agent":
      return roleAgentSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_contract":
      return roleContractSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_workpack_binding":
      return roleWorkpackBindingSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_routine":
      return roleRoutineSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_routine_run":
      return roleRoutineRunSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_checkpoint":
      return roleCheckpointSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_message":
      return roleMessageSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_handoff":
      return roleHandoffSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_metric_snapshot":
      return roleMetricSnapshotSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_exception_binding":
      return roleExceptionBindingSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_improvement_proposal":
      return roleImprovementProposalSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_promotion_gate":
      return rolePromotionGateSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_telemetry_event":
      return roleTelemetryEventSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_incident_record":
      return roleIncidentRecordSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_routine_queue_item":
      return roleRoutineQueueItemSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_approval_request":
      return roleApprovalRequestSchema.parse(payload) as PersistedRolePayload<T>;
    case "role_memory_item":
      return roleMemoryItemSchema.parse(payload) as PersistedRolePayload<T>;
    default:
      throw new Error(`Unsupported role record type: ${String(type)}`);
  }
}

async function getOptionalDb(): Promise<DrizzleDB | null> {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production" && process.env.ROLE_AGENT_ALLOW_IN_MEMORY_FALLBACK !== "1") {
      throw new Error("Role persistence requires a durable database in production.");
    }
    return null;
  }

  try {
    return getDb();
  } catch (error) {
    if (process.env.NODE_ENV === "production" && process.env.ROLE_AGENT_ALLOW_IN_MEMORY_FALLBACK !== "1") {
      throw new Error(
        `Role persistence database unavailable in production: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!dbWarningIssued) {
      console.warn("[rolePersistence] database unavailable, using in-memory fallback", error);
      dbWarningIssued = true;
    }
    return null;
  }
}

async function putRecord<T extends RoleRecordType>(
  type: T,
  payload: PersistedRolePayload<T>,
  session?: RolePersistenceSession,
): Promise<PersistedRolePayload<T>> {
  const parsed = normalizeRolePayload(type, parsePayload(type, payload));
  mapForType(type).set(parsed.id, clone(parsed));

  const db = session?.db ?? await getOptionalDb();
  if (db) {
    const roleId = getRoleLink(type, parsed);
    const routineId = getRoutineLink(type, parsed);
    const routineRunId = getRoutineRunLink(type, parsed);
    const sortTimestamp = getRecordSortTimestamp(type, parsed);

    await db
      .insert(roleRecords)
      .values({
        tenantId: parsed.tenantId,
        recordType: type,
        recordId: parsed.id,
        roleId,
        routineId,
        routineRunId,
        sortTimestamp: sortTimestamp ? new Date(sortTimestamp) : null,
        payloadJson: parsed as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: [
          roleRecords.tenantId,
          roleRecords.recordType,
          roleRecords.recordId,
        ],
        set: {
          roleId,
          routineId,
          routineRunId,
          sortTimestamp: sortTimestamp ? new Date(sortTimestamp) : null,
          payloadJson: parsed as unknown as Record<string, unknown>,
          updatedAt: sql`now()`,
        },
      });
  }

  return clone(parsed);
}

async function getRecordById<T extends RoleRecordType>(
  type: T,
  recordId: string,
  session?: RolePersistenceSession,
): Promise<PersistedRolePayload<T> | null> {
  const memory = mapForType(type).get(recordId);
  if (memory) {
    return normalizeRolePayload(type, memory);
  }

  const db = session?.db ?? await getOptionalDb();
  if (!db) {
    return null;
  }

  const [row] = await db
    .select({ payloadJson: roleRecords.payloadJson })
    .from(roleRecords)
    .where(and(eq(roleRecords.recordType, type), eq(roleRecords.recordId, recordId)))
    .orderBy(desc(roleRecords.updatedAt))
    .limit(1);

  if (!row) {
    return null;
  }
  return normalizeRolePayload(type, parsePayload(type, row.payloadJson));
}

async function listRecordsByTenant<T extends RoleRecordType>(
  type: T,
  tenantId: string,
  session?: RolePersistenceSession,
): Promise<PersistedRolePayload<T>[]> {
  const memoryItems = Array.from(mapForType(type).values())
    .filter((item) => item.tenantId === tenantId)
    .sort((left, right) => (getRecordSortTimestamp(type, right) ?? "").localeCompare(getRecordSortTimestamp(type, left) ?? ""))
    .map((item) => normalizeRolePayload(type, item));
  if (memoryItems.length > 0) {
    return memoryItems;
  }

  const db = session?.db ?? await getOptionalDb();
  if (!db) {
    return [];
  }

  const rows = await db
    .select({ payloadJson: roleRecords.payloadJson })
    .from(roleRecords)
    .where(and(eq(roleRecords.recordType, type), eq(roleRecords.tenantId, tenantId)))
    .orderBy(desc(roleRecords.sortTimestamp), desc(roleRecords.updatedAt));

  return rows.map((row) => normalizeRolePayload(type, parsePayload(type, row.payloadJson)));
}

async function listAllRecordsByType<T extends RoleRecordType>(
  type: T,
  session?: RolePersistenceSession,
): Promise<PersistedRolePayload<T>[]> {
  const memoryItems = Array.from(mapForType(type).values())
    .sort((left, right) => (getRecordSortTimestamp(type, right) ?? "").localeCompare(getRecordSortTimestamp(type, left) ?? ""))
    .map((item) => normalizeRolePayload(type, item));
  if (memoryItems.length > 0) {
    return memoryItems;
  }

  const db = session?.db ?? await getOptionalDb();
  if (!db) {
    return [];
  }

  const rows = await db
    .select({ payloadJson: roleRecords.payloadJson })
    .from(roleRecords)
    .where(eq(roleRecords.recordType, type))
    .orderBy(desc(roleRecords.sortTimestamp), desc(roleRecords.updatedAt));

  return rows.map((row) => normalizeRolePayload(type, parsePayload(type, row.payloadJson)));
}

async function updateRecord<T extends RoleRecordType>(
  type: T,
  recordId: string,
  updater: (current: PersistedRolePayload<T>) => PersistedRolePayload<T>,
  session?: RolePersistenceSession,
): Promise<PersistedRolePayload<T> | null> {
  const current = await getRecordById(type, recordId, session);
  if (!current) return null;
  return putRecord(type, updater(current), session);
}

function newestFirst<T>(items: T[], pick: (item: T) => string | null | undefined): T[] {
  return [...items].sort((left, right) => {
    const leftValue = pick(left) ?? "";
    const rightValue = pick(right) ?? "";
    return rightValue.localeCompare(leftValue);
  });
}

export function createRoleId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}

export async function resetRoleStore(): Promise<void> {
  clearState();
  const db = await getOptionalDb();
  if (db) {
    await db.delete(roleRecords);
  }
}

export async function withRolePersistenceTransaction<T>(
  callback: (session: RolePersistenceSession) => Promise<T>,
): Promise<T> {
  const db = await getOptionalDb();
  if (!db) {
    return callback({ db: null });
  }
  return db.transaction(async (tx) => callback({ db: tx as unknown as DrizzleDB }));
}

export async function runRoleGovernanceMaintenance(session?: RolePersistenceSession): Promise<void> {
  const db = session?.db ?? await getOptionalDb();
  for (const type of roleRecordTypeValues) {
    const items = db
      ? (await db
        .select({ payloadJson: roleRecords.payloadJson })
        .from(roleRecords)
        .where(eq(roleRecords.recordType, type)))
        .map((row) => parsePayload(type, row.payloadJson))
      : Array.from(mapForType(type).values());

    for (const item of items) {
      await putRecord(type, normalizeRolePayload(type, item), session);
    }
  }
}

export async function saveRoleBlueprint(value: RoleBlueprint, session?: RolePersistenceSession): Promise<RoleBlueprint> {
  return putRecord("role_blueprint", value, session);
}

export async function saveRoleAgent(value: RoleAgent, session?: RolePersistenceSession): Promise<RoleAgent> {
  return putRecord("role_agent", value, session);
}

export async function saveRoleContract(value: RoleContract, session?: RolePersistenceSession): Promise<RoleContract> {
  return putRecord("role_contract", value, session);
}

export async function saveRoleWorkpackBinding(value: RoleWorkpackBinding, session?: RolePersistenceSession): Promise<RoleWorkpackBinding> {
  return putRecord("role_workpack_binding", value, session);
}

export async function saveRoleRoutine(value: RoleRoutine, session?: RolePersistenceSession): Promise<RoleRoutine> {
  return putRecord("role_routine", value, session);
}

export async function saveRoleRoutineRun(value: RoleRoutineRun, session?: RolePersistenceSession): Promise<RoleRoutineRun> {
  return putRecord("role_routine_run", value, session);
}

export async function saveRoleCheckpoint(value: RoleCheckpoint, session?: RolePersistenceSession): Promise<RoleCheckpoint> {
  return putRecord("role_checkpoint", value, session);
}

export async function saveRoleMessage(value: RoleMessage, session?: RolePersistenceSession): Promise<RoleMessage> {
  return putRecord("role_message", value, session);
}

export async function saveRoleHandoff(value: RoleHandoff, session?: RolePersistenceSession): Promise<RoleHandoff> {
  return putRecord("role_handoff", value, session);
}

export async function saveRoleMetricSnapshot(value: RoleMetricSnapshot, session?: RolePersistenceSession): Promise<RoleMetricSnapshot> {
  return putRecord("role_metric_snapshot", value, session);
}

export async function saveRoleExceptionBinding(value: RoleExceptionBinding, session?: RolePersistenceSession): Promise<RoleExceptionBinding> {
  return putRecord("role_exception_binding", value, session);
}

export async function saveRoleImprovementProposal(value: RoleImprovementProposal, session?: RolePersistenceSession): Promise<RoleImprovementProposal> {
  return putRecord("role_improvement_proposal", value, session);
}

export async function saveRolePromotionGate(value: RolePromotionGate, session?: RolePersistenceSession): Promise<RolePromotionGate> {
  return putRecord("role_promotion_gate", value, session);
}

export async function saveRoleTelemetryEvent(value: RoleTelemetryEvent, session?: RolePersistenceSession): Promise<RoleTelemetryEvent> {
  return putRecord("role_telemetry_event", value, session);
}

export async function saveRoleIncidentRecord(value: RoleIncidentRecord, session?: RolePersistenceSession): Promise<RoleIncidentRecord> {
  return putRecord("role_incident_record", value, session);
}

export async function saveRoleRoutineQueueItem(value: RoleRoutineQueueItem, session?: RolePersistenceSession): Promise<RoleRoutineQueueItem> {
  return putRecord("role_routine_queue_item", value, session);
}

export async function saveRoleApprovalRequest(value: RoleApprovalRequest, session?: RolePersistenceSession): Promise<RoleApprovalRequest> {
  return putRecord("role_approval_request", value, session);
}

export async function saveRoleMemoryItem(value: RoleMemoryItem, session?: RolePersistenceSession): Promise<RoleMemoryItem> {
  return putRecord("role_memory_item", value, session);
}

export async function getRoleBlueprint(id: string, session?: RolePersistenceSession): Promise<RoleBlueprint | null> {
  return getRecordById("role_blueprint", id, session);
}

export async function getRoleAgent(id: string, session?: RolePersistenceSession): Promise<RoleAgent | null> {
  return getRecordById("role_agent", id, session);
}

export async function getRoleAgentForTenant(
  tenantId: string,
  id: string,
  session?: RolePersistenceSession,
): Promise<RoleAgent | null> {
  const role = await getRoleAgent(id, session);
  return role?.tenantId === tenantId ? role : null;
}

export async function getRoleContract(id: string, session?: RolePersistenceSession): Promise<RoleContract | null> {
  return getRecordById("role_contract", id, session);
}

export async function getRoleWorkpackBinding(id: string, session?: RolePersistenceSession): Promise<RoleWorkpackBinding | null> {
  return getRecordById("role_workpack_binding", id, session);
}

export async function getRoleWorkpackBindingForTenant(
  tenantId: string,
  id: string,
  session?: RolePersistenceSession,
): Promise<RoleWorkpackBinding | null> {
  const binding = await getRoleWorkpackBinding(id, session);
  return binding?.tenantId === tenantId ? binding : null;
}

export async function getRoleRoutine(id: string, session?: RolePersistenceSession): Promise<RoleRoutine | null> {
  return getRecordById("role_routine", id, session);
}

export async function getRoleRoutineForTenant(
  tenantId: string,
  id: string,
  session?: RolePersistenceSession,
): Promise<RoleRoutine | null> {
  const routine = await getRoleRoutine(id, session);
  return routine?.tenantId === tenantId ? routine : null;
}

export async function getRoleRoutineRun(id: string, session?: RolePersistenceSession): Promise<RoleRoutineRun | null> {
  return getRecordById("role_routine_run", id, session);
}

export async function getRoleRoutineRunForTenant(
  tenantId: string,
  id: string,
  session?: RolePersistenceSession,
): Promise<RoleRoutineRun | null> {
  const run = await getRoleRoutineRun(id, session);
  return run?.tenantId === tenantId ? run : null;
}

export async function getRoleCheckpoint(id: string, session?: RolePersistenceSession): Promise<RoleCheckpoint | null> {
  return getRecordById("role_checkpoint", id, session);
}

export async function getRoleRoutineQueueItem(id: string, session?: RolePersistenceSession): Promise<RoleRoutineQueueItem | null> {
  return getRecordById("role_routine_queue_item", id, session);
}

export async function getRoleApprovalRequest(id: string, session?: RolePersistenceSession): Promise<RoleApprovalRequest | null> {
  return getRecordById("role_approval_request", id, session);
}

export async function getRoleMemoryItem(id: string, session?: RolePersistenceSession): Promise<RoleMemoryItem | null> {
  return getRecordById("role_memory_item", id, session);
}

export async function getRoleAgentDetailForTenant(
  tenantId: string,
  roleId: string,
  session?: RolePersistenceSession,
): Promise<RoleAgentDetailRecord | null> {
  const detail = await getRoleAgentDetail(roleId, session);
  return detail?.role.tenantId === tenantId ? detail : null;
}

export async function updateRoleAgent(id: string, updater: (current: RoleAgent) => RoleAgent, session?: RolePersistenceSession): Promise<RoleAgent | null> {
  return updateRecord("role_agent", id, updater, session);
}

export async function updateRoleContract(id: string, updater: (current: RoleContract) => RoleContract, session?: RolePersistenceSession): Promise<RoleContract | null> {
  const current = await getRoleContract(id, session);
  if (!current) return null;
  const next = updater(current);
  if (requiresNewRoleContractVersion(current, next)) {
    throw new Error("Active role contracts require a new version for material changes.");
  }
  return putRecord("role_contract", next, session);
}

export async function updateRoleWorkpackBinding(
  id: string,
  updater: (current: RoleWorkpackBinding) => RoleWorkpackBinding,
  session?: RolePersistenceSession,
): Promise<RoleWorkpackBinding | null> {
  return updateRecord("role_workpack_binding", id, updater, session);
}

export async function updateRoleRoutine(id: string, updater: (current: RoleRoutine) => RoleRoutine, session?: RolePersistenceSession): Promise<RoleRoutine | null> {
  return updateRecord("role_routine", id, updater, session);
}

export async function updateRoleRoutineRun(
  id: string,
  updater: (current: RoleRoutineRun) => RoleRoutineRun,
  session?: RolePersistenceSession,
): Promise<RoleRoutineRun | null> {
  return updateRecord("role_routine_run", id, updater, session);
}

export async function updateRoleCheckpoint(
  id: string,
  updater: (current: RoleCheckpoint) => RoleCheckpoint,
  session?: RolePersistenceSession,
): Promise<RoleCheckpoint | null> {
  return updateRecord("role_checkpoint", id, updater, session);
}

export async function updateRoleRoutineQueueItem(
  id: string,
  updater: (current: RoleRoutineQueueItem) => RoleRoutineQueueItem,
  session?: RolePersistenceSession,
): Promise<RoleRoutineQueueItem | null> {
  return updateRecord("role_routine_queue_item", id, updater, session);
}

export async function updateRoleApprovalRequest(
  id: string,
  updater: (current: RoleApprovalRequest) => RoleApprovalRequest,
  session?: RolePersistenceSession,
): Promise<RoleApprovalRequest | null> {
  return updateRecord("role_approval_request", id, updater, session);
}

export async function updateRoleExceptionBinding(
  id: string,
  updater: (current: RoleExceptionBinding) => RoleExceptionBinding,
  session?: RolePersistenceSession,
): Promise<RoleExceptionBinding | null> {
  return updateRecord("role_exception_binding", id, updater, session);
}

export async function updateRoleMemoryItem(
  id: string,
  updater: (current: RoleMemoryItem) => RoleMemoryItem,
  session?: RolePersistenceSession,
): Promise<RoleMemoryItem | null> {
  return updateRecord("role_memory_item", id, updater, session);
}

export async function listRoleAgentsByTenant(tenantId: string, session?: RolePersistenceSession): Promise<RoleAgent[]> {
  return listRecordsByTenant("role_agent", tenantId, session);
}

export async function listRoleBlueprintsByTenant(tenantId: string, session?: RolePersistenceSession): Promise<RoleBlueprint[]> {
  return listRecordsByTenant("role_blueprint", tenantId, session);
}

export async function listRoleContractsByTenant(tenantId: string, session?: RolePersistenceSession): Promise<RoleContract[]> {
  return listRecordsByTenant("role_contract", tenantId, session);
}

export async function listRoleContractsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleContract[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return (await listRecordsByTenant("role_contract", role.tenantId, session))
    .filter((contract) => contract.roleId === roleId);
}

export async function listRoleBindingsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleWorkpackBinding[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return (await listRecordsByTenant("role_workpack_binding", role.tenantId, session))
    .filter((binding) => binding.roleId === roleId);
}

export async function listRoleRoutinesForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleRoutine[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return (await listRecordsByTenant("role_routine", role.tenantId, session))
    .filter((routine) => routine.roleId === roleId);
}

export async function listRoleRoutinesByTenant(tenantId: string, session?: RolePersistenceSession): Promise<RoleRoutine[]> {
  return listRecordsByTenant("role_routine", tenantId, session);
}

export async function listRoleRoutineRunsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleRoutineRun[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_routine_run", role.tenantId, session)).filter((run) => run.roleId === roleId),
    (run) => run.updatedAt ?? run.createdAt,
  );
}

export async function listRoleRoutineRunsForRoutine(routineId: string, session?: RolePersistenceSession): Promise<RoleRoutineRun[]> {
  const routine = await getRoleRoutine(routineId, session);
  if (!routine) return [];
  return newestFirst(
    (await listRecordsByTenant("role_routine_run", routine.tenantId, session)).filter((run) => run.routineId === routineId),
    (run) => run.updatedAt ?? run.createdAt,
  );
}

export async function listActiveRoleRoutineRuns(tenantId: string, session?: RolePersistenceSession): Promise<RoleRoutineRun[]> {
  return (await listRecordsByTenant("role_routine_run", tenantId, session))
    .filter((run) => run.status === "queued" || run.status === "running" || run.status === "awaiting_approval");
}

export async function listRoleCheckpointsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleCheckpoint[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_checkpoint", role.tenantId, session)).filter((checkpoint) => checkpoint.roleId === roleId),
    (checkpoint) => checkpoint.updatedAt ?? checkpoint.createdAt,
  );
}

export async function listRoleQueueItemsByTenant(tenantId: string, session?: RolePersistenceSession): Promise<RoleRoutineQueueItem[]> {
  return newestFirst(await listRecordsByTenant("role_routine_queue_item", tenantId, session), (item) => item.updatedAt ?? item.createdAt);
}

export async function listRoleQueueItemsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleRoutineQueueItem[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_routine_queue_item", role.tenantId, session)).filter((item) => item.roleId === roleId),
    (item) => item.updatedAt ?? item.createdAt,
  );
}

export async function listRoleApprovalsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleApprovalRequest[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_approval_request", role.tenantId, session)).filter((approval) => approval.roleId === roleId),
    (approval) => approval.resolvedAt ?? approval.createdAt,
  );
}

export async function listRoleMessagesForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleMessage[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_message", role.tenantId, session)).filter((message) => message.senderRoleId === roleId || message.recipientRoleId === roleId),
    (message) => message.createdAt,
  );
}

export async function listRoleHandoffsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleHandoff[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_handoff", role.tenantId, session)).filter((handoff) => handoff.senderRoleId === roleId || handoff.recipientRoleId === roleId),
    (handoff) => handoff.updatedAt ?? handoff.createdAt,
  );
}

export async function listRoleMetricSnapshotsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleMetricSnapshot[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_metric_snapshot", role.tenantId, session)).filter((snapshot) => snapshot.roleId === roleId),
    (snapshot) => snapshot.generatedAt,
  );
}

export async function listRoleTelemetryEventsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleTelemetryEvent[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_telemetry_event", role.tenantId, session)).filter((event) => event.roleId === roleId),
    (event) => event.createdAt,
  );
}

export async function listRoleIncidentsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleIncidentRecord[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_incident_record", role.tenantId, session)).filter((incident) => incident.roleId === roleId),
    (incident) => incident.resolvedAt ?? incident.createdAt,
  );
}

export async function listRoleExceptionBindingsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleExceptionBinding[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_exception_binding", role.tenantId, session)).filter((binding) => binding.roleId === roleId),
    (binding) => binding.updatedAt ?? binding.createdAt,
  );
}

export async function listRoleImprovementProposalsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleImprovementProposal[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_improvement_proposal", role.tenantId, session)).filter((proposal) => proposal.roleId === roleId),
    (proposal) => proposal.updatedAt ?? proposal.createdAt,
  );
}

export async function listRolePromotionGatesForRole(roleId: string, session?: RolePersistenceSession): Promise<RolePromotionGate[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_promotion_gate", role.tenantId, session)).filter((gate) => gate.roleId === roleId),
    (gate) => gate.evaluatedAt,
  );
}

export async function listRoleMemoryItemsForRole(roleId: string, session?: RolePersistenceSession): Promise<RoleMemoryItem[]> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return [];
  return newestFirst(
    (await listRecordsByTenant("role_memory_item", role.tenantId, session)).filter((item) => item.roleId === roleId),
    (item) => item.updatedAt ?? item.createdAt,
  );
}

export async function getLatestRoleCheckpoint(roleId: string, session?: RolePersistenceSession): Promise<RoleCheckpoint | null> {
  const checkpoints = await listRoleCheckpointsForRole(roleId, session);
  return checkpoints[0] ?? null;
}

export async function getRoleAgentDetail(
  roleId: string,
  session?: RolePersistenceSession,
): Promise<RoleAgentDetailRecord | null> {
  const role = await getRoleAgent(roleId, session);
  if (!role) return null;

  const [
    blueprint,
    contracts,
    bindings,
    routines,
    routineRuns,
    checkpoints,
    queueItems,
    approvals,
    messages,
    handoffs,
    exceptionBindings,
    improvementProposals,
    promotionGates,
    metricSnapshots,
    memoryItems,
  ] = await Promise.all([
    role.blueprintId ? getRoleBlueprint(role.blueprintId, session) : Promise.resolve(null),
    listRoleContractsForRole(roleId, session),
    listRoleBindingsForRole(roleId, session),
    listRoleRoutinesForRole(roleId, session),
    listRoleRoutineRunsForRole(roleId, session),
    listRoleCheckpointsForRole(roleId, session),
    listRoleQueueItemsForRole(roleId, session),
    listRoleApprovalsForRole(roleId, session),
    listRoleMessagesForRole(roleId, session),
    listRoleHandoffsForRole(roleId, session),
    listRoleExceptionBindingsForRole(roleId, session),
    listRoleImprovementProposalsForRole(roleId, session),
    listRolePromotionGatesForRole(roleId, session),
    listRoleMetricSnapshotsForRole(roleId, session),
    listRoleMemoryItemsForRole(roleId, session),
  ]);

  const activeContract = role.activeContractId
    ? contracts.find((contract) => contract.id === role.activeContractId) ?? null
    : contracts.find((contract) => contract.status === "active") ?? null;

  return {
    role,
    blueprint,
    activeContract,
    contracts,
    bindings,
    routines,
    routineRuns,
    checkpoints,
    queueItems,
    approvals,
    messages,
    handoffs,
    exceptionBindings,
    improvementProposals,
    promotionGates,
    telemetryEvents: await listRoleTelemetryEventsForRole(roleId, session),
    incidents: await listRoleIncidentsForRole(roleId, session),
    metricSnapshots,
    memoryItems,
  };
}

export async function listRoleDetailsByTenant(
  tenantId: string,
  session?: RolePersistenceSession,
): Promise<RoleAgentDetailRecord[]> {
  const roles = await listRoleAgentsByTenant(tenantId, session);
  const details = await Promise.all(roles.map((role) => getRoleAgentDetail(role.id, session)));
  return details.filter((detail): detail is RoleAgentDetailRecord => Boolean(detail));
}

export async function listAllRoleRoutineRuns(session?: RolePersistenceSession): Promise<RoleRoutineRun[]> {
  return listAllRecordsByType("role_routine_run", session);
}

export async function listAllRoleQueueItems(session?: RolePersistenceSession): Promise<RoleRoutineQueueItem[]> {
  return listAllRecordsByType("role_routine_queue_item", session);
}

export async function listAllRoleRoutines(session?: RolePersistenceSession): Promise<RoleRoutine[]> {
  return listAllRecordsByType("role_routine", session);
}

export async function listAllRoleAgents(session?: RolePersistenceSession): Promise<RoleAgent[]> {
  return listAllRecordsByType("role_agent", session);
}
