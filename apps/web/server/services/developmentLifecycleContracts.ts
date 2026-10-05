/** Project-neutral work and handoff semantics shared by development runners. */

export const DEVELOPMENT_SOURCE_TYPES = [
  "spec",
  "issue",
  "prompt",
  "bug",
  "feature",
  "maintenance",
  "generated",
  "migration",
  "refactor",
  "research-derived",
] as const;

export const DEVELOPMENT_WORK_STATES = [
  "DISCOVERING",
  "WORKING",
  "CHECKPOINT_READY",
  "CANONICALIZING",
  "PARTIAL_INTEGRATED",
  "CONTINUATION_REQUIRED",
  "IMPLEMENTATION_COMPLETE",
  "VALIDATION_PENDING",
  "VALIDATING",
  "REPAIR_REQUIRED",
  "VERIFIED",
  "RELEASE_READY",
  "DEPLOYING",
  "DEPLOYED",
  "BLOCKED_RECOVERABLE",
  "FAILED_TERMINAL",
  "CANCELLED",
] as const;

export const CANONICAL_TARGET_KINDS = [
  "git",
  "application-version",
  "workflow-revision",
  "artifact-revision",
] as const;

export type DevelopmentSourceType = (typeof DEVELOPMENT_SOURCE_TYPES)[number];
export type DevelopmentWorkState = (typeof DEVELOPMENT_WORK_STATES)[number];
export type CanonicalTargetKind = (typeof CANONICAL_TARGET_KINDS)[number];

export type DevelopmentWorkUnit = {
  workId: string;
  projectId: string;
  repositoryId: string;
  source: { type: DevelopmentSourceType; ref: string };
  objective: string;
  ownership: { actor: string; session: string; harness: string };
  canonicalTarget: { kind: CanonicalTargetKind; locator: string };
  baseRevision: string;
  progress: {
    state: DevelopmentWorkState;
    canonicalRevision: string;
    completedScope: string[];
    remainingScope: string[];
  };
  validation: {
    completed: ValidationObligation[];
    pending: ValidationObligation[];
    failed: ValidationObligation[];
    stale: ValidationObligation[];
  };
  handoff: DevelopmentHandoff | null;
  artifacts: string[];
  createdAt: string;
  updatedAt: string;
};

export type ValidationObligation = {
  revision: string;
  checkType: string;
  state: "PENDING" | "NOT_RUN" | "PASS" | "FAIL" | "STALE";
  owner?: string;
  nextAction?: string;
};

export type DevelopmentHandoff = {
  resumeFrom: string;
  nextAction: string;
  nextOwner: string;
  handoffRef: string;
  wakeCondition?: string;
};

export type CanonicalCheckpointInput = {
  canonicalRevision: string;
  completedScope: string[];
  remainingScope: string[];
  pendingValidation: Array<{
    checkType: string;
    revision: string;
    owner?: string;
    nextAction?: string;
    state?: "PENDING" | "NOT_RUN";
  }>;
  nextAction: string;
  nextOwner: string;
  handoffRef: string;
  resumeFrom: string;
  wakeCondition?: string;
  artifacts?: string[];
};

export class DevelopmentLifecycleContractError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DevelopmentLifecycleContractError";
  }
}

const SECRET_KEY = /(api[_-]?key|secret|token|password|credential|authorization|private[_-]?key)/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,255}$/;

function requiredText(value: unknown, code: string, maxLength = 512): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new DevelopmentLifecycleContractError(code);
  }
  return value.trim();
}

function assertSafeValue(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertSafeValue);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) throw new DevelopmentLifecycleContractError("RAW_SECRET_FORBIDDEN");
    assertSafeValue(child);
  }
}

function uniqueTexts(values: unknown, code: string, maxItems = 256): string[] {
  if (!Array.isArray(values) || values.length > maxItems) {
    throw new DevelopmentLifecycleContractError(code);
  }
  return [...new Set(values.map(value => requiredText(value, code)))];
}

function revision(value: unknown, code: string): string {
  const result = requiredText(value, code, 256);
  if (!ID.test(result)) throw new DevelopmentLifecycleContractError(code);
  return result;
}

export function createDevelopmentWorkUnit(input: {
  workId: string;
  projectId: string;
  repositoryId: string;
  source: { type: DevelopmentSourceType; ref: string };
  objective: string;
  ownership: { actor: string; session: string; harness: string };
  canonicalTarget: { kind: CanonicalTargetKind; locator: string };
  baseRevision: string;
  createdAt?: string;
}): DevelopmentWorkUnit {
  assertSafeValue(input);
  if (!(DEVELOPMENT_SOURCE_TYPES as readonly string[]).includes(input.source?.type)) {
    throw new DevelopmentLifecycleContractError("SOURCE_TYPE_INVALID");
  }
  if (!(CANONICAL_TARGET_KINDS as readonly string[]).includes(input.canonicalTarget?.kind)) {
    throw new DevelopmentLifecycleContractError("CANONICAL_TARGET_KIND_INVALID");
  }
  const now = input.createdAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) {
    throw new DevelopmentLifecycleContractError("TIMESTAMP_INVALID");
  }
  return {
    workId: requiredText(input.workId, "WORK_ID_INVALID", 256),
    projectId: requiredText(input.projectId, "PROJECT_ID_INVALID", 256),
    repositoryId: requiredText(input.repositoryId, "REPOSITORY_ID_INVALID", 256),
    source: {
      type: input.source.type,
      ref: requiredText(input.source.ref, "SOURCE_REF_INVALID", 1024),
    },
    objective: requiredText(input.objective, "OBJECTIVE_INVALID", 4_000),
    ownership: {
      actor: requiredText(input.ownership?.actor, "OWNER_ACTOR_INVALID"),
      session: requiredText(input.ownership?.session, "OWNER_SESSION_INVALID"),
      harness: requiredText(input.ownership?.harness, "OWNER_HARNESS_INVALID"),
    },
    canonicalTarget: {
      kind: input.canonicalTarget.kind,
      locator: requiredText(input.canonicalTarget.locator, "CANONICAL_TARGET_INVALID", 1024),
    },
    baseRevision: revision(input.baseRevision, "BASE_REVISION_INVALID"),
    progress: {
      state: "DISCOVERING",
      canonicalRevision: revision(input.baseRevision, "BASE_REVISION_INVALID"),
      completedScope: [],
      remainingScope: [],
    },
    validation: { completed: [], pending: [], failed: [], stale: [] },
    handoff: null,
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function recordCanonicalCheckpoint(
  workUnit: DevelopmentWorkUnit,
  input: CanonicalCheckpointInput,
  now = new Date().toISOString()
): DevelopmentWorkUnit {
  workUnit = parseDevelopmentWorkUnit(workUnit);
  assertSafeValue(input);
  const canonicalRevision = revision(input.canonicalRevision, "CANONICAL_REVISION_INVALID");
  const completedScope = uniqueTexts(input.completedScope, "COMPLETED_SCOPE_INVALID");
  const completed = new Set(completedScope);
  const remainingScope = uniqueTexts(input.remainingScope, "REMAINING_SCOPE_INVALID").filter(
    item => !completed.has(item)
  );
  if (completedScope.length === 0) {
    throw new DevelopmentLifecycleContractError("CHECKPOINT_SCOPE_EMPTY");
  }
  if (remainingScope.length === 0) {
    throw new DevelopmentLifecycleContractError("CONTINUATION_SCOPE_EMPTY");
  }
  if (!Number.isFinite(Date.parse(now))) {
    throw new DevelopmentLifecycleContractError("TIMESTAMP_INVALID");
  }
  if (!Array.isArray(input.pendingValidation) || input.pendingValidation.length > 128) {
    throw new DevelopmentLifecycleContractError("VALIDATION_OBLIGATIONS_INVALID");
  }
  const pending = input.pendingValidation.map(item => {
    if (revision(item.revision, "VALIDATION_REVISION_INVALID") !== canonicalRevision) {
      throw new DevelopmentLifecycleContractError("VALIDATION_REVISION_MISMATCH");
    }
    return {
      revision: canonicalRevision,
      checkType: requiredText(item.checkType, "VALIDATION_CHECK_TYPE_INVALID"),
      state: item.state ?? "PENDING",
      ...(item.owner ? { owner: requiredText(item.owner, "VALIDATION_OWNER_INVALID") } : {}),
      ...(item.nextAction ? { nextAction: requiredText(item.nextAction, "VALIDATION_NEXT_ACTION_INVALID") } : {}),
    } satisfies ValidationObligation;
  });
  const handoff: DevelopmentHandoff = {
    resumeFrom: requiredText(input.resumeFrom, "HANDOFF_RESUME_FROM_INVALID"),
    nextAction: requiredText(input.nextAction, "HANDOFF_NEXT_ACTION_INVALID"),
    nextOwner: requiredText(input.nextOwner, "HANDOFF_NEXT_OWNER_INVALID"),
    handoffRef: requiredText(input.handoffRef, "HANDOFF_REQUIRED"),
    ...(input.wakeCondition ? { wakeCondition: requiredText(input.wakeCondition, "HANDOFF_WAKE_CONDITION_INVALID") } : {}),
  };
  const allExisting = [
    ...workUnit.validation.completed,
    ...workUnit.validation.pending,
    ...workUnit.validation.failed,
    ...workUnit.validation.stale,
  ];
  const stale = allExisting.filter(item => item.revision !== canonicalRevision).map(item => ({ ...item, state: "STALE" as const }));
  return {
    ...workUnit,
    progress: {
      state: "PARTIAL_INTEGRATED",
      canonicalRevision,
      completedScope: [...new Set([...workUnit.progress.completedScope, ...completedScope])],
      remainingScope,
    },
    validation: {
      completed: workUnit.validation.completed.filter(item => item.revision === canonicalRevision),
      pending: [
        ...workUnit.validation.pending.filter(item => item.revision === canonicalRevision),
        ...pending,
      ],
      failed: workUnit.validation.failed.filter(item => item.revision === canonicalRevision),
      stale: [...workUnit.validation.stale, ...stale],
    },
    handoff,
    artifacts: [...new Set([...workUnit.artifacts, ...uniqueTexts(input.artifacts ?? [], "ARTIFACT_INVALID")])],
    updatedAt: now,
  };
}

export function completeDevelopmentWorkUnit(
  workUnit: DevelopmentWorkUnit,
  input: {
    canonicalRevision: string;
    completedScope: string[];
    pendingValidation: CanonicalCheckpointInput["pendingValidation"];
    artifacts?: string[];
  },
  now = new Date().toISOString()
): DevelopmentWorkUnit {
  workUnit = parseDevelopmentWorkUnit(workUnit);
  assertSafeValue(input);
  const canonicalRevision = revision(input.canonicalRevision, "CANONICAL_REVISION_INVALID");
  const completedScope = uniqueTexts(input.completedScope, "COMPLETED_SCOPE_INVALID");
  if (!Number.isFinite(Date.parse(now))) throw new DevelopmentLifecycleContractError("TIMESTAMP_INVALID");
  if (!Array.isArray(input.pendingValidation) || input.pendingValidation.length > 128) {
    throw new DevelopmentLifecycleContractError("VALIDATION_OBLIGATIONS_INVALID");
  }
  if (completedScope.length === 0) {
    throw new DevelopmentLifecycleContractError("COMPLETION_SCOPE_EMPTY");
  }
  const pending = input.pendingValidation.map(item => {
    if (revision(item.revision, "VALIDATION_REVISION_INVALID") !== canonicalRevision) {
      throw new DevelopmentLifecycleContractError("VALIDATION_REVISION_MISMATCH");
    }
    return {
      revision: canonicalRevision,
      checkType: requiredText(item.checkType, "VALIDATION_CHECK_TYPE_INVALID"),
      state: item.state ?? "PENDING",
      ...(item.owner ? { owner: requiredText(item.owner, "VALIDATION_OWNER_INVALID") } : {}),
      ...(item.nextAction ? { nextAction: requiredText(item.nextAction, "VALIDATION_NEXT_ACTION_INVALID") } : {}),
    } satisfies ValidationObligation;
  });
  const allExisting = [
    ...workUnit.validation.completed,
    ...workUnit.validation.pending,
    ...workUnit.validation.failed,
    ...workUnit.validation.stale,
  ];
  const stale = allExisting.filter(item => item.revision !== canonicalRevision).map(item => ({ ...item, state: "STALE" as const }));
  return {
    ...workUnit,
    progress: {
      state: "IMPLEMENTATION_COMPLETE",
      canonicalRevision,
      completedScope: [...new Set([...workUnit.progress.completedScope, ...completedScope])],
      remainingScope: [],
    },
    validation: {
      completed: workUnit.validation.completed.filter(item => item.revision === canonicalRevision),
      pending: [
        ...workUnit.validation.pending.filter(item => item.revision === canonicalRevision),
        ...pending,
      ],
      failed: workUnit.validation.failed.filter(item => item.revision === canonicalRevision),
      stale: [...workUnit.validation.stale, ...stale],
    },
    handoff: null,
    artifacts: [...new Set([...workUnit.artifacts, ...uniqueTexts(input.artifacts ?? [], "ARTIFACT_INVALID")])],
    updatedAt: now,
  };
}

export function parseDevelopmentWorkUnit(value: unknown): DevelopmentWorkUnit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DevelopmentLifecycleContractError("WORK_UNIT_INVALID");
  }
  const input = value as DevelopmentWorkUnit;
  const base = createDevelopmentWorkUnit({
    workId: input.workId,
    projectId: input.projectId,
    repositoryId: input.repositoryId,
    source: input.source,
    objective: input.objective,
    ownership: input.ownership,
    canonicalTarget: input.canonicalTarget,
    baseRevision: input.baseRevision,
    createdAt: input.createdAt,
  });
  if (!input.progress || !(DEVELOPMENT_WORK_STATES as readonly string[]).includes(input.progress.state)) {
    throw new DevelopmentLifecycleContractError("WORK_UNIT_PROGRESS_INVALID");
  }
  if (!input.validation || !Array.isArray(input.validation.completed) ||
      !Array.isArray(input.validation.pending) || !Array.isArray(input.validation.failed) ||
      !Array.isArray(input.validation.stale)) {
    throw new DevelopmentLifecycleContractError("WORK_UNIT_VALIDATION_INVALID");
  }
  const parseObligations = (items: ValidationObligation[]) => items.map(item => {
    const checkState = ["PENDING", "NOT_RUN", "PASS", "FAIL", "STALE"];
    if (!item || !checkState.includes(item.state)) {
      throw new DevelopmentLifecycleContractError("VALIDATION_OBLIGATION_INVALID");
    }
    return {
      revision: revision(item.revision, "VALIDATION_REVISION_INVALID"),
      checkType: requiredText(item.checkType, "VALIDATION_CHECK_TYPE_INVALID"),
      state: item.state,
      ...(item.owner ? { owner: requiredText(item.owner, "VALIDATION_OWNER_INVALID") } : {}),
      ...(item.nextAction ? { nextAction: requiredText(item.nextAction, "VALIDATION_NEXT_ACTION_INVALID") } : {}),
    };
  });
  const handoff = input.handoff === null ? null : input.handoff ? {
    resumeFrom: requiredText(input.handoff.resumeFrom, "HANDOFF_RESUME_FROM_INVALID"),
    nextAction: requiredText(input.handoff.nextAction, "HANDOFF_NEXT_ACTION_INVALID"),
    nextOwner: requiredText(input.handoff.nextOwner, "HANDOFF_NEXT_OWNER_INVALID"),
    handoffRef: requiredText(input.handoff.handoffRef, "HANDOFF_REQUIRED"),
    ...(input.handoff.wakeCondition ? { wakeCondition: requiredText(input.handoff.wakeCondition, "HANDOFF_WAKE_CONDITION_INVALID") } : {}),
  } : null;
  if (input.progress.state === "PARTIAL_INTEGRATED" && !handoff) {
    throw new DevelopmentLifecycleContractError("HANDOFF_REQUIRED");
  }
  return {
    ...base,
    progress: {
      state: input.progress.state,
      canonicalRevision: revision(input.progress.canonicalRevision, "CANONICAL_REVISION_INVALID"),
      completedScope: uniqueTexts(input.progress.completedScope, "COMPLETED_SCOPE_INVALID"),
      remainingScope: uniqueTexts(input.progress.remainingScope, "REMAINING_SCOPE_INVALID"),
    },
    validation: {
      completed: parseObligations(input.validation.completed),
      pending: parseObligations(input.validation.pending),
      failed: parseObligations(input.validation.failed),
      stale: parseObligations(input.validation.stale),
    },
    handoff,
    artifacts: uniqueTexts(input.artifacts, "ARTIFACT_INVALID"),
    updatedAt: requiredText(input.updatedAt, "TIMESTAMP_INVALID"),
  };
}

export function reconcileDevelopmentResume(
  workUnit: DevelopmentWorkUnit,
  snapshot: { snapshotRevision: string; completedScope: string[]; remainingScope: string[] }
) {
  workUnit = parseDevelopmentWorkUnit(workUnit);
  revision(snapshot.snapshotRevision, "SNAPSHOT_REVISION_INVALID");
  uniqueTexts(snapshot.remainingScope, "SNAPSHOT_SCOPE_INVALID");
  const canonicalCompleted = new Set(workUnit.progress.completedScope);
  return {
    sourceOfTruth: "DURABLE_HANDOFF" as const,
    canonicalRevision: workUnit.progress.canonicalRevision,
    remainingScope: [...workUnit.progress.remainingScope],
    nextAction: workUnit.handoff?.nextAction ?? "Continue from the latest canonical work record",
    nextOwner: workUnit.handoff?.nextOwner ?? workUnit.ownership.actor,
    alreadyCanonicalizedFromSnapshot: uniqueTexts(snapshot.completedScope, "SNAPSHOT_SCOPE_INVALID").filter(
      item => canonicalCompleted.has(item)
    ),
    snapshotRevisionStale: snapshot.snapshotRevision !== workUnit.progress.canonicalRevision,
  };
}
