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
  "WAITING_DEPENDENCY",
  "WAITING_EXTERNAL",
  "WAITING_RESOURCE",
  "WAITING_CAPABILITY",
  "WAITING_APPROVAL",
  "WAITING_CANONICAL_ARTIFACT",
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
  /** Origin/execution metadata only; session and harness never identify durable work. */
  ownership: { actor: string; session: string; harness: string };
  canonicalTarget: { kind: CanonicalTargetKind; locator: string };
  baseRevision: string;
  progress: {
    state: DevelopmentWorkState;
    canonicalRevision: string;
    completedScope: string[];
    remainingScope: string[];
    immediatelyRunnableScope: string[];
  };
  validation: {
    completed: ValidationObligation[];
    pending: ValidationObligation[];
    failed: ValidationObligation[];
    stale: ValidationObligation[];
  };
  handoff: DevelopmentHandoff | null;
  dependencies: DevelopmentDependencyContract[];
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

export const DEVELOPMENT_DEPENDENCY_TYPES = [
  "canonical-artifact",
  "api-contract",
  "schema",
  "capability",
  "runner-readiness",
  "provider-availability",
  "deployment-result",
  "external-event",
  "work-output",
] as const;

export type DevelopmentDependencyState = "UNSATISFIED" | "SATISFIED" | "INVALIDATED";

export type DevelopmentDependencyContract = {
  dependencyId: string;
  consumerWorkId: string;
  projectId: string;
  requirement: {
    type: (typeof DEVELOPMENT_DEPENDENCY_TYPES)[number];
    locator: string;
    minimumRevision?: string;
  };
  /** Producer is diagnostic metadata only; satisfaction is based on output evidence. */
  producer?: { workId: string; projectId: string; optional: boolean };
  satisfaction: {
    predicateId: string;
    evidenceSource: string;
  };
  waitPolicy: {
    eventFirst: true;
    pollingFallback: true;
    timeoutIsTerminal: false;
  };
  wake: {
    resumeWorkId: string;
    resumeFrom: string;
    eventTypes: string[];
  };
  fallback: {
    rediscoverProducer: true;
    alternateRouteAllowed: true;
    continueIndependentWork: true;
  };
  blockedScope: string[];
  state: DevelopmentDependencyState;
  watcher: {
    watcherId: string;
    status: "ACTIVE" | "MISSING";
    registeredAt: string;
    lastCheckedAt?: string;
    lastEvidenceRef?: string;
  };
};

export type DevelopmentDependencyEvidence = {
  source: string;
  reference: string;
  projectId: string;
  requirementType: DevelopmentDependencyContract["requirement"]["type"];
  locator: string;
  revision?: string;
  satisfiesMinimumRevision: boolean;
  observedAt: string;
  producerWorkId?: string;
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
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
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
      immediatelyRunnableScope: [],
    },
    validation: { completed: [], pending: [], failed: [], stale: [] },
    handoff: null,
    dependencies: [],
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
      immediatelyRunnableScope: workUnit.progress.immediatelyRunnableScope.filter(item => remainingScope.includes(item)),
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
  if (workUnit.dependencies.some(item => item.state === "UNSATISFIED")) {
    throw new DevelopmentLifecycleContractError("DEPENDENCIES_UNRESOLVED");
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
      immediatelyRunnableScope: [],
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

function parseDevelopmentDependencies(
  value: unknown,
  workId: string
): DevelopmentDependencyContract[] {
  if (!Array.isArray(value) || value.length > 128) {
    throw new DevelopmentLifecycleContractError("DEPENDENCIES_INVALID");
  }
  const ids = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new DevelopmentLifecycleContractError("DEPENDENCY_INVALID");
    }
    const item = raw as DevelopmentDependencyContract;
    const dependencyId = requiredText(item.dependencyId, "DEPENDENCY_ID_INVALID", 256);
    if (ids.has(dependencyId)) throw new DevelopmentLifecycleContractError("DEPENDENCY_ID_DUPLICATE");
    ids.add(dependencyId);
    if (!(DEVELOPMENT_DEPENDENCY_TYPES as readonly string[]).includes(item.requirement?.type)) {
      throw new DevelopmentLifecycleContractError("DEPENDENCY_TYPE_INVALID");
    }
    if (!("UNSATISFIED SATISFIED INVALIDATED".split(" ").includes(item.state))) {
      throw new DevelopmentLifecycleContractError("DEPENDENCY_STATE_INVALID");
    }
    if (
      item.consumerWorkId !== workId ||
      item.waitPolicy?.eventFirst !== true ||
      item.waitPolicy?.pollingFallback !== true ||
      item.waitPolicy?.timeoutIsTerminal !== false ||
      item.fallback?.rediscoverProducer !== true ||
      item.fallback?.alternateRouteAllowed !== true ||
      item.fallback?.continueIndependentWork !== true
    ) {
      throw new DevelopmentLifecycleContractError("DEPENDENCY_POLICY_INVALID");
    }
    if (!item.watcher || !["ACTIVE", "MISSING", "STOPPED"].includes(item.watcher.status)) {
      throw new DevelopmentLifecycleContractError("DEPENDENCY_WATCHER_INVALID");
    }
    const registeredAt = requiredText(item.watcher.registeredAt, "DEPENDENCY_WATCHER_INVALID");
    if (!Number.isFinite(Date.parse(registeredAt))) {
      throw new DevelopmentLifecycleContractError("DEPENDENCY_WATCHER_INVALID");
    }
    const producer = item.producer
      ? {
          workId: requiredText(item.producer.workId, "DEPENDENCY_PRODUCER_INVALID", 256),
          projectId: requiredText(item.producer.projectId, "DEPENDENCY_PRODUCER_INVALID", 256),
          optional: item.producer.optional === true,
        }
      : undefined;
    return {
      dependencyId,
      consumerWorkId: workId,
      projectId: requiredText(item.projectId, "DEPENDENCY_PROJECT_INVALID", 256),
      requirement: {
        type: item.requirement.type,
        locator: requiredText(item.requirement.locator, "DEPENDENCY_LOCATOR_INVALID", 1024),
        ...(item.requirement.minimumRevision
          ? { minimumRevision: revision(item.requirement.minimumRevision, "DEPENDENCY_REVISION_INVALID") }
          : {}),
      },
      ...(producer ? { producer } : {}),
      satisfaction: {
        predicateId: requiredText(item.satisfaction?.predicateId, "DEPENDENCY_PREDICATE_INVALID", 256),
        evidenceSource: requiredText(item.satisfaction?.evidenceSource, "DEPENDENCY_EVIDENCE_SOURCE_INVALID", 256),
      },
      waitPolicy: { eventFirst: true, pollingFallback: true, timeoutIsTerminal: false },
      wake: {
        resumeWorkId: requiredText(item.wake?.resumeWorkId, "DEPENDENCY_RESUME_WORK_INVALID", 256),
        resumeFrom: requiredText(item.wake?.resumeFrom, "DEPENDENCY_RESUME_FROM_INVALID"),
        eventTypes: uniqueTexts(item.wake?.eventTypes, "DEPENDENCY_EVENT_TYPES_INVALID", 64),
      },
      fallback: {
        rediscoverProducer: true,
        alternateRouteAllowed: true,
        continueIndependentWork: true,
      },
      blockedScope: uniqueTexts(item.blockedScope, "DEPENDENCY_BLOCKED_SCOPE_INVALID"),
      state: item.state,
      watcher: {
        watcherId: requiredText(item.watcher.watcherId, "DEPENDENCY_WATCHER_INVALID", 256),
        status: item.watcher.status,
        registeredAt,
        ...(item.watcher.lastCheckedAt
          ? { lastCheckedAt: requiredText(item.watcher.lastCheckedAt, "DEPENDENCY_WATCHER_INVALID") }
          : {}),
        ...(item.watcher.lastEvidenceRef
          ? { lastEvidenceRef: requiredText(item.watcher.lastEvidenceRef, "DEPENDENCY_EVIDENCE_INVALID") }
          : {}),
      },
    };
  });
}

export function registerDevelopmentDependencyWait(
  workUnit: DevelopmentWorkUnit,
  dependencyInput: DevelopmentDependencyContract,
  immediatelyRunnableScope: string[],
  now = new Date().toISOString()
): DevelopmentWorkUnit {
  workUnit = parseDevelopmentWorkUnit(workUnit);
  assertSafeValue(dependencyInput);
  const dependency = parseDevelopmentDependencies([dependencyInput], workUnit.workId)[0];
  if (dependency.projectId !== workUnit.projectId) {
    throw new DevelopmentLifecycleContractError("DEPENDENCY_PROJECT_MISMATCH");
  }
  if (dependency.state !== "UNSATISFIED" || dependency.watcher.status !== "ACTIVE" || dependency.wake.eventTypes.length === 0) {
    throw new DevelopmentLifecycleContractError("DEPENDENCY_WAIT_CONTRACT_INVALID");
  }
  if (workUnit.dependencies.some(item => item.dependencyId === dependency.dependencyId)) {
    throw new DevelopmentLifecycleContractError("DEPENDENCY_ID_DUPLICATE");
  }
  const remaining = new Set(workUnit.progress.remainingScope);
  if (dependency.blockedScope.length === 0 || dependency.blockedScope.some(item => !remaining.has(item))) {
    throw new DevelopmentLifecycleContractError("DEPENDENCY_SCOPE_INVALID");
  }
  const runnable = uniqueTexts(immediatelyRunnableScope, "RUNNABLE_SCOPE_INVALID");
  if (runnable.some(item => !remaining.has(item)) || runnable.some(item => dependency.blockedScope.includes(item))) {
    throw new DevelopmentLifecycleContractError("RUNNABLE_SCOPE_INVALID");
  }
  if (!Number.isFinite(Date.parse(now))) throw new DevelopmentLifecycleContractError("TIMESTAMP_INVALID");
  const dependencies = [...workUnit.dependencies, { ...dependency, watcher: { ...dependency.watcher, registeredAt: now } }];
  const state: DevelopmentWorkState = runnable.length > 0
    ? "WORKING"
    : stateForDependencyType(dependency.requirement.type);
  return {
    ...workUnit,
    progress: {
      ...workUnit.progress,
      state,
      immediatelyRunnableScope: runnable,
    },
    dependencies,
    handoff: {
      resumeFrom: dependency.wake.resumeFrom,
      nextAction: runnable.length > 0 ? "Continue independently runnable scope" : "Resume when the dependency predicate is satisfied",
      nextOwner: workUnit.ownership.actor,
      handoffRef: workUnit.handoff?.handoffRef ?? `work:${workUnit.workId}`,
      ...(runnable.length === 0 ? { wakeCondition: `dependency:${dependency.dependencyId}` } : {}),
    },
    updatedAt: now,
  };
}

export function registerDevelopmentDependencyWaits(
  workUnit: DevelopmentWorkUnit,
  dependencies: DevelopmentDependencyContract[],
  immediatelyRunnableScope: string[],
  now = new Date().toISOString()
): DevelopmentWorkUnit {
  if (!dependencies.length || dependencies.length > 128) {
    throw new DevelopmentLifecycleContractError("DEPENDENCIES_INVALID");
  }
  return dependencies.reduce(
    (current, dependency) => registerDevelopmentDependencyWait(current, dependency, immediatelyRunnableScope, now),
    parseDevelopmentWorkUnit(workUnit),
  );
}

function stateForDependencyType(type: DevelopmentDependencyContract["requirement"]["type"]): DevelopmentWorkState {
  switch (type) {
    case "capability":
    case "runner-readiness":
      return "WAITING_CAPABILITY";
    case "provider-availability":
      return "WAITING_EXTERNAL";
    case "deployment-result":
      return "WAITING_EXTERNAL";
    case "canonical-artifact":
    case "api-contract":
    case "schema":
    case "external-event":
    case "work-output":
      return "WAITING_DEPENDENCY";
  }
}

export function applyDevelopmentDependencyEvidence(
  workUnit: DevelopmentWorkUnit,
  dependencyId: string,
  evidence: DevelopmentDependencyEvidence,
  now = new Date().toISOString()
): DevelopmentWorkUnit {
  workUnit = parseDevelopmentWorkUnit(workUnit);
  assertSafeValue(evidence);
  const id = requiredText(dependencyId, "DEPENDENCY_ID_INVALID", 256);
  const dependency = workUnit.dependencies.find(item => item.dependencyId === id);
  if (!dependency) throw new DevelopmentLifecycleContractError("DEPENDENCY_NOT_FOUND");
  if (dependency.state === "SATISFIED") return workUnit;
  if (
    evidence.source !== dependency.satisfaction.evidenceSource ||
    evidence.projectId !== dependency.projectId ||
    evidence.requirementType !== dependency.requirement.type ||
    evidence.locator !== dependency.requirement.locator ||
    evidence.satisfiesMinimumRevision !== true ||
    (dependency.requirement.minimumRevision && !evidence.revision) ||
    !Number.isFinite(Date.parse(evidence.observedAt)) ||
    !Number.isFinite(Date.parse(now))
  ) {
    throw new DevelopmentLifecycleContractError("DEPENDENCY_EVIDENCE_MISMATCH");
  }
  const dependencies = workUnit.dependencies.map(item => item.dependencyId === id
    ? {
        ...item,
        state: "SATISFIED" as const,
        watcher: {
          ...item.watcher,
          status: "STOPPED" as const,
          lastCheckedAt: now,
          lastEvidenceRef: requiredText(evidence.reference, "DEPENDENCY_EVIDENCE_INVALID", 1024),
        },
      }
    : item);
  const stillWaiting = dependencies.some(item => item.state === "UNSATISFIED");
  const stillBlocked = new Set(dependencies
    .filter(item => item.state === "UNSATISFIED")
    .flatMap(item => item.blockedScope));
  const runnable = [...new Set([...workUnit.progress.immediatelyRunnableScope, ...dependency.blockedScope])]
    .filter(item => workUnit.progress.remainingScope.includes(item) && !stillBlocked.has(item));
  const nextDependency = dependencies.find(item => item.state === "UNSATISFIED");
  return {
    ...workUnit,
    progress: {
      ...workUnit.progress,
      state: runnable.length > 0 ? "WORKING" : stillWaiting && nextDependency
        ? stateForDependencyType(nextDependency.requirement.type)
        : "CONTINUATION_REQUIRED",
      immediatelyRunnableScope: runnable,
    },
    dependencies,
    handoff: {
      resumeFrom: dependency.wake.resumeFrom,
      nextAction: runnable.length > 0 ? "Resume newly runnable scope" : "Resume remaining work from canonical lifecycle state",
      nextOwner: workUnit.ownership.actor,
      handoffRef: workUnit.handoff?.handoffRef ?? `work:${workUnit.workId}`,
      ...(runnable.length === 0 && stillWaiting && nextDependency
        ? { wakeCondition: `dependency:${nextDependency.dependencyId}` }
        : {}),
    },
    updatedAt: now,
  };
}

export function repairMissingDevelopmentDependencyWatchers(
  workUnit: DevelopmentWorkUnit,
  now = new Date().toISOString()
): DevelopmentWorkUnit {
  workUnit = parseDevelopmentWorkUnit(workUnit);
  if (!Number.isFinite(Date.parse(now))) throw new DevelopmentLifecycleContractError("TIMESTAMP_INVALID");
  const dependencies = workUnit.dependencies.map(item => item.state === "UNSATISFIED" && item.watcher.status === "MISSING"
    ? { ...item, watcher: { ...item.watcher, status: "ACTIVE" as const, lastCheckedAt: now } }
    : item);
  return dependencies.every((item, index) => item === workUnit.dependencies[index])
    ? workUnit
    : { ...workUnit, dependencies, updatedAt: now };
}

export function parseDevelopmentWorkUnit(value: unknown): DevelopmentWorkUnit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DevelopmentLifecycleContractError("WORK_UNIT_INVALID");
  }
  assertSafeValue(value);
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
  if (input.progress.state.startsWith("WAITING_") && (
    !handoff?.wakeCondition ||
    !Array.isArray(input.dependencies) ||
    !input.dependencies.some(item => item && item.state === "UNSATISFIED") ||
    (Array.isArray(input.progress.immediatelyRunnableScope) && input.progress.immediatelyRunnableScope.length > 0)
  )) {
    throw new DevelopmentLifecycleContractError("WAITING_DEPENDENCY_WAKE_REQUIRED");
  }
  const remainingScope = uniqueTexts(input.progress.remainingScope, "REMAINING_SCOPE_INVALID");
  const immediatelyRunnableScope = uniqueTexts(input.progress.immediatelyRunnableScope ?? remainingScope, "RUNNABLE_SCOPE_INVALID");
  if (immediatelyRunnableScope.some(item => !remainingScope.includes(item))) {
    throw new DevelopmentLifecycleContractError("RUNNABLE_SCOPE_INVALID");
  }
  const blockedByPending = new Set(parseDevelopmentDependencies(input.dependencies ?? [], input.workId)
    .filter(item => item.state === "UNSATISFIED")
    .flatMap(item => item.blockedScope));
  if (immediatelyRunnableScope.some(item => blockedByPending.has(item))) {
    throw new DevelopmentLifecycleContractError("RUNNABLE_SCOPE_BLOCKED");
  }
  return {
    ...base,
    progress: {
      state: input.progress.state,
      canonicalRevision: revision(input.progress.canonicalRevision, "CANONICAL_REVISION_INVALID"),
      completedScope: uniqueTexts(input.progress.completedScope, "COMPLETED_SCOPE_INVALID"),
      remainingScope,
      immediatelyRunnableScope,
    },
    validation: {
      completed: parseObligations(input.validation.completed),
      pending: parseObligations(input.validation.pending),
      failed: parseObligations(input.validation.failed),
      stale: parseObligations(input.validation.stale),
    },
    handoff,
    dependencies: parseDevelopmentDependencies(input.dependencies ?? [], input.workId),
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
