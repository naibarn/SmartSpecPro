import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";

import { getDb, type DrizzleDB } from "../db";
import { auditLogger } from "./auditLogger";
import {
  agentRegistryPolicyBindings,
  agentRegistryPromotionReviews,
  agentRegistryOutcomeMemory,
  agentRegistryRegistries,
  agentRegistryRolloutBindings,
  agentRegistryVersions,
  type AgentRegistryPolicyBinding,
  type AgentRegistryPromotionReview,
  type AgentRegistryOutcomeMemory,
  type AgentRegistryRegistry,
  type AgentRegistryRolloutBinding,
  type AgentRegistryVersion,
  type InsertAgentRegistryPolicyBinding,
  type InsertAgentRegistryPromotionReview,
  type InsertAgentRegistryOutcomeMemory,
  type InsertAgentRegistryRegistry,
  type InsertAgentRegistryRolloutBinding,
  type InsertAgentRegistryVersion,
} from "../../drizzle/schema";
import {
  agentRegistryCreateSchema,
  agentRegistryMemoryRecordSchema,
  agentRegistryResolutionRequestSchema,
  agentRegistryResolutionResultSchema,
  agentRegistryVersionCreateSchema,
  sanitizeAgentRegistryMemoryRecord,
  type AgentRegistryCreateInput,
  type AgentRegistryMemoryRecord,
  type AgentRegistryResolutionRequest,
  type AgentRegistryVersionCreateInput,
} from "../../shared/agentRegistryContracts";
import { sanitizeSensitiveRecord } from "../../shared/workpackContracts";
import {
  recordRegistryPromotionMetrics,
  recordRegistryResolutionMetrics,
} from "./agentRegistryMetrics";

type RegistryContext = {
  registry: AgentRegistryRegistry;
  versions: AgentRegistryVersion[];
  policyBindings: AgentRegistryPolicyBinding[];
  rolloutBindings: AgentRegistryRolloutBinding[];
  memories: AgentRegistryOutcomeMemory[];
};

export interface AgentRegistryRepository {
  transaction<T>(fn: (repo: AgentRegistryRepository) => Promise<T>): Promise<T>;
  createRegistry(values: InsertAgentRegistryRegistry): Promise<AgentRegistryRegistry>;
  getRegistryByTenantAndId(tenantId: string, registryId: string): Promise<AgentRegistryRegistry | null>;
  getRegistryByTenantAndKey(tenantId: string, registryKey: string): Promise<AgentRegistryRegistry | null>;
  listRegistries(tenantId: string): Promise<AgentRegistryRegistry[]>;
  updateRegistry(registryId: string, patch: Partial<InsertAgentRegistryRegistry>): Promise<AgentRegistryRegistry | null>;
  createVersion(values: InsertAgentRegistryVersion): Promise<AgentRegistryVersion>;
  updateVersion(versionId: string, patch: Partial<InsertAgentRegistryVersion>): Promise<AgentRegistryVersion | null>;
  listVersionsByRegistryId(registryId: string): Promise<AgentRegistryVersion[]>;
  createPolicyBinding(values: InsertAgentRegistryPolicyBinding): Promise<AgentRegistryPolicyBinding>;
  createRolloutBinding(values: InsertAgentRegistryRolloutBinding): Promise<AgentRegistryRolloutBinding>;
  createOutcomeMemory(values: InsertAgentRegistryOutcomeMemory): Promise<AgentRegistryOutcomeMemory>;
  createPromotionReview(values: InsertAgentRegistryPromotionReview): Promise<AgentRegistryPromotionReview>;
  loadResolutionContext(tenantId: string, identifier: { registryId?: string; registryKey?: string }, workloadClass?: string | null): Promise<RegistryContext | null>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createRowId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function createRepository(db: DrizzleDB): AgentRegistryRepository {
  return {
    async transaction<T>(fn: (repo: AgentRegistryRepository) => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => fn(createRepository(tx as unknown as DrizzleDB)));
    },

    async createRegistry(values) {
      const [row] = await db.insert(agentRegistryRegistries).values(values).returning();
      return row;
    },

    async getRegistryByTenantAndId(tenantId, registryId) {
      const [row] = await db.select().from(agentRegistryRegistries).where(and(eq(agentRegistryRegistries.tenantId, tenantId), eq(agentRegistryRegistries.id, registryId))).limit(1);
      return row ?? null;
    },

    async getRegistryByTenantAndKey(tenantId, registryKey) {
      const [row] = await db.select().from(agentRegistryRegistries).where(and(eq(agentRegistryRegistries.tenantId, tenantId), eq(agentRegistryRegistries.registryKey, registryKey))).limit(1);
      return row ?? null;
    },

    async listRegistries(tenantId) {
      return db.select().from(agentRegistryRegistries).where(eq(agentRegistryRegistries.tenantId, tenantId)).orderBy(desc(agentRegistryRegistries.createdAt));
    },

    async updateRegistry(registryId, patch) {
      const [row] = await db.update(agentRegistryRegistries).set({ ...patch, updatedAt: new Date() }).where(eq(agentRegistryRegistries.id, registryId)).returning();
      return row ?? null;
    },

    async createVersion(values) {
      const [row] = await db.insert(agentRegistryVersions).values(values).returning();
      return row;
    },

    async listVersionsByRegistryId(registryId) {
      return db.select().from(agentRegistryVersions).where(eq(agentRegistryVersions.registryId, registryId)).orderBy(desc(agentRegistryVersions.versionNumber));
    },

    async updateVersion(versionId, patch) {
      const [row] = await db.update(agentRegistryVersions).set(patch).where(eq(agentRegistryVersions.id, versionId)).returning();
      return row ?? null;
    },

    async createPolicyBinding(values) {
      const [row] = await db.insert(agentRegistryPolicyBindings).values(values).returning();
      return row;
    },

    async createRolloutBinding(values) {
      const [row] = await db.insert(agentRegistryRolloutBindings).values(values).returning();
      return row;
    },

    async createOutcomeMemory(values) {
      const [row] = await db.insert(agentRegistryOutcomeMemory).values(values).returning();
      return row;
    },

    async createPromotionReview(values) {
      const [row] = await db.insert(agentRegistryPromotionReviews).values(values).returning();
      return row;
    },

    async loadResolutionContext(tenantId, identifier, workloadClass) {
      const repo = this;
      const registry = identifier.registryId
        ? await repo.getRegistryByTenantAndId(tenantId, identifier.registryId)
        : identifier.registryKey
          ? await repo.getRegistryByTenantAndKey(tenantId, identifier.registryKey)
          : null;
      if (!registry) return null;

      const [versions, policyBindings, rolloutBindings, memories] = await Promise.all([
        db.select().from(agentRegistryVersions).where(eq(agentRegistryVersions.registryId, registry.id)).orderBy(desc(agentRegistryVersions.versionNumber)),
        db.select().from(agentRegistryPolicyBindings).where(eq(agentRegistryPolicyBindings.registryId, registry.id)),
        db.select().from(agentRegistryRolloutBindings).where(eq(agentRegistryRolloutBindings.registryId, registry.id)),
        workloadClass
          ? db.select().from(agentRegistryOutcomeMemory).where(and(eq(agentRegistryOutcomeMemory.registryId, registry.id), eq(agentRegistryOutcomeMemory.workloadClass, workloadClass))).orderBy(desc(agentRegistryOutcomeMemory.createdAt))
          : db.select().from(agentRegistryOutcomeMemory).where(eq(agentRegistryOutcomeMemory.registryId, registry.id)).orderBy(desc(agentRegistryOutcomeMemory.createdAt)),
      ]);

      return { registry, versions, policyBindings, rolloutBindings, memories };
    },
  };
}

function getDefaultRepository(): AgentRegistryRepository {
  return createRepository(getDb());
}

function normalizeMemoryPayload(input: AgentRegistryMemoryRecord): Record<string, unknown> {
  return sanitizeAgentRegistryMemoryRecord({
    ...input,
    failureMode: input.failureMode ?? null,
    operatorEdits: input.operatorEdits ?? [],
    improvementNotes: input.improvementNotes ?? "",
    metadata: sanitizeRecord(input.metadata ?? {}),
  });
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value), (_key, entry) => {
    if (typeof entry === "string") {
      return entry
        .replace(/api[_-]?key/gi, "[redacted]")
        .replace(/token/gi, "[redacted]")
        .replace(/secret/gi, "[redacted]")
        .replace(/password/gi, "[redacted]");
    }
    return entry;
  }) as Record<string, unknown>;
}

function sanitizeMemoryText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value
    .replace(/api[_-]?key/gi, "[redacted]")
    .replace(/token/gi, "[redacted]")
    .replace(/secret/gi, "[redacted]")
    .replace(/password/gi, "[redacted]");
}

function sanitizeMemoryTextList(values: string[]): string[] {
  return values.map((value) => sanitizeMemoryText(value) ?? "");
}

function bucketForTarget(request: AgentRegistryResolutionRequest): number {
  const digest = crypto
    .createHash("sha256")
    .update([
      request.tenantId,
      request.registryId ?? "",
      request.registryKey ?? "",
      request.teamId ?? "",
      request.queueId ?? "",
      request.workpackFamily ?? "",
      request.environment ?? "",
      request.workloadClass ?? "",
    ].join("|"))
    .digest();
  return digest.readUInt32BE(0) % 100;
}

function rolloutPriority(rolloutState: AgentRegistryVersion["rolloutState"]): number {
  switch (rolloutState) {
    case "frozen":
      return 500;
    case "general":
      return 400;
    case "supervised":
      return 300;
    case "canary":
      return 200;
    case "shadow":
      return 100;
    case "draft":
    default:
      return 0;
  }
}

function findPolicyForVersion(context: RegistryContext, versionId: string): AgentRegistryPolicyBinding | null {
  return context.policyBindings.find((binding) => binding.versionId === versionId) ?? null;
}

function findRolloutBindingsForVersion(context: RegistryContext, versionId: string): AgentRegistryRolloutBinding[] {
  return context.rolloutBindings.filter((binding) => binding.versionId === versionId);
}

function evidenceSummaryForVersion(context: RegistryContext, versionId: string, workloadClass?: string | null) {
  const rows = context.memories.filter((memory) => memory.versionId === versionId && (!workloadClass || memory.workloadClass === workloadClass));
  if (rows.length === 0) {
    return { runs: 0, successRate: 0 };
  }

  const successes = rows.filter((row) => row.outcome === "success" || row.outcome === "partial_success").length;
  return {
    runs: rows.length,
    successRate: successes / rows.length,
  };
}

function matchesRolloutBinding(binding: AgentRegistryRolloutBinding, request: AgentRegistryResolutionRequest): boolean {
  if (request.registryId && binding.registryId !== request.registryId) return false;
  if (request.teamId && binding.teamTargetId && binding.teamTargetId !== request.teamId) return false;
  if (request.queueId && binding.queueTargetId && binding.queueTargetId !== request.queueId) return false;
  if (request.workpackFamily && binding.workpackFamily && binding.workpackFamily !== request.workpackFamily) return false;
  if (request.environment && binding.environment && binding.environment !== request.environment) return false;
  return true;
}

function determineRolloutEligibility(
  context: RegistryContext,
  request: AgentRegistryResolutionRequest,
  version: AgentRegistryVersion,
): { eligible: boolean; reasons: string[]; rolloutBindings: AgentRegistryRolloutBinding[] } {
  const reasons: string[] = [];
  const rolloutBindings = findRolloutBindingsForVersion(context, version.id);
  const matchingBindings = rolloutBindings.filter((binding) => matchesRolloutBinding(binding, request));
  const targetBucket = bucketForTarget(request);

  if (version.versionStatus === "draft" && !request.allowDraftVersions) {
    reasons.push("version is still draft");
  }

  switch (version.rolloutState) {
    case "draft":
      if (!request.allowDraftVersions) {
        reasons.push("draft rollout state is not eligible");
      }
      break;
    case "shadow":
      if (matchingBindings.length === 0) {
        reasons.push("shadow rollout requires a matching binding");
      } else if (matchingBindings.every((binding) => binding.shadowPercent <= 0)) {
        reasons.push("shadow rollout percent is zero");
      } else if (!matchingBindings.some((binding) => targetBucket < binding.shadowPercent)) {
        reasons.push("shadow rollout cohort did not match");
      }
      break;
    case "canary":
      if (matchingBindings.length === 0) {
        reasons.push("canary rollout requires a matching binding");
      } else if (matchingBindings.every((binding) => binding.canaryPercent <= 0)) {
        reasons.push("canary rollout percent is zero");
      } else if (!matchingBindings.some((binding) => targetBucket < binding.canaryPercent)) {
        reasons.push("canary rollout cohort did not match");
      }
      break;
    case "supervised":
      if (rolloutBindings.length > 0 && matchingBindings.length === 0) {
        reasons.push("no supervised rollout binding matched tenant/team/queue/workpack scope");
      }
      break;
    case "general":
      if (rolloutBindings.length > 0 && matchingBindings.length === 0) {
        reasons.push("no rollout binding matched tenant/team/queue/workpack scope");
      }
      break;
    case "frozen":
      if (rolloutBindings.length > 0 && matchingBindings.length === 0) {
        reasons.push("frozen version is outside the matching rollout scope");
      }
      break;
    default:
      reasons.push(`unknown rollout state ${version.rolloutState}`);
      break;
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    rolloutBindings,
  };
}

function evaluateCandidate(context: RegistryContext, request: AgentRegistryResolutionRequest, version: AgentRegistryVersion) {
  const reasons: string[] = [];
  const policy = findPolicyForVersion(context, version.id);
  const rolloutEligibility = determineRolloutEligibility(context, request, version);
  reasons.push(...rolloutEligibility.reasons);

  if (version.versionStatus === "draft" && !request.allowDraftVersions) {
    reasons.push("version status draft is not eligible");
  }
  if (version.versionStatus === "review_required" || version.versionStatus === "retired") {
    reasons.push(`version status ${version.versionStatus} is not eligible`);
  }

  if (policy) {
    if (request.requestedToolClasses.length > 0 && policy.supportedToolClasses && policy.supportedToolClasses.length > 0) {
      const unsupported = request.requestedToolClasses.filter((tool) => !policy.supportedToolClasses.includes(tool));
      if (unsupported.length > 0) {
        reasons.push(`unsupported tool classes: ${unsupported.join(", ")}`);
      }
    }

    if (request.requestedActionClasses.length > 0 && policy.disallowedActionClasses && policy.disallowedActionClasses.length > 0) {
      const blocked = request.requestedActionClasses.filter((action) => policy.disallowedActionClasses.includes(action));
      if (blocked.length > 0) {
        reasons.push(`disallowed action classes: ${blocked.join(", ")}`);
      }
    }

    if (request.requestedModelFamily && policy.modelCompatibilityJson && policy.modelCompatibilityJson.length > 0 && !policy.modelCompatibilityJson.includes(request.requestedModelFamily)) {
      reasons.push(`model family ${request.requestedModelFamily} is not compatible`);
    }

    if (request.requireApproval && policy.approvalRequirementsJson && policy.approvalRequirementsJson.length > 0) {
      reasons.push("approval required by policy");
    }
  } else {
    reasons.push("missing policy binding");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    evidenceSummary: evidenceSummaryForVersion(context, version.id, request.workloadClass),
    policy,
    rolloutBindings: rolloutEligibility.rolloutBindings,
  };
}

function comparePolicyScope(previousPolicy: AgentRegistryPolicyBinding | null, nextPolicy: AgentRegistryPolicyBinding): string[] {
  const reasons: string[] = [];
  if (!previousPolicy) {
    return reasons;
  }

  const previousSupported = new Set(previousPolicy.supportedToolClasses ?? []);
  const nextSupported = new Set(nextPolicy.supportedToolClasses ?? []);
  const widenedTools = [...nextSupported].filter((tool) => !previousSupported.has(tool));
  if (widenedTools.length > 0) {
    reasons.push(`tool scope widened: ${widenedTools.join(", ")}`);
  }

  const previousBudget = previousPolicy.budgetPolicyJson as Record<string, unknown> | null;
  const nextBudget = nextPolicy.budgetPolicyJson as Record<string, unknown> | null;
  const previousRunCredits = typeof previousBudget?.perRunCredits === "number" ? previousBudget.perRunCredits : null;
  const nextRunCredits = typeof nextBudget?.perRunCredits === "number" ? nextBudget.perRunCredits : null;
  const previousTenantCredits = typeof previousBudget?.perTenantCredits === "number" ? previousBudget.perTenantCredits : null;
  const nextTenantCredits = typeof nextBudget?.perTenantCredits === "number" ? nextBudget.perTenantCredits : null;
  if (nextRunCredits !== null && (previousRunCredits === null || nextRunCredits > previousRunCredits)) {
    reasons.push("budget scope widened: perRunCredits");
  }
  if (nextTenantCredits !== null && (previousTenantCredits === null || nextTenantCredits > previousTenantCredits)) {
    reasons.push("budget scope widened: perTenantCredits");
  }

  const previousMemoryScope = previousPolicy.memoryScopeJson as Record<string, unknown> | null;
  const nextMemoryScope = nextPolicy.memoryScopeJson as Record<string, unknown> | null;
  const previousAccessScope = typeof previousMemoryScope?.accessScope === "string" ? previousMemoryScope.accessScope : "registry";
  const nextAccessScope = typeof nextMemoryScope?.accessScope === "string" ? nextMemoryScope.accessScope : "registry";
  const accessOrder = new Map([
    ["tenant", 0],
    ["team", 1],
    ["queue", 2],
    ["registry", 3],
    ["version", 4],
  ]);
  if ((accessOrder.get(nextAccessScope) ?? 0) > (accessOrder.get(previousAccessScope) ?? 0)) {
    reasons.push("data scope widened: memory access scope");
  }

  return reasons;
}

export function createAgentRegistryRepository(db: DrizzleDB): AgentRegistryRepository {
  return createRepository(db);
}

function logAgentRegistryEvent(
  eventType:
    | "agent_registry_created"
    | "agent_registry_version_published"
    | "agent_registry_version_selected"
    | "agent_registry_promotion_reviewed"
    | "agent_registry_version_frozen"
    | "agent_registry_version_rolled_back"
    | "agent_registry_memory_recorded",
  metadata: Record<string, unknown>,
): void {
  auditLogger.log({
    eventType,
    metadata,
  });
}

export async function createAgentRegistry(input: AgentRegistryCreateInput, repo: AgentRegistryRepository = getDefaultRepository()) {
  const parsed = agentRegistryCreateSchema.parse(input);
  const timestamp = new Date();
  const registry = await repo.transaction(async (tx) => {
    const registry = await tx.createRegistry({
      id: createRowId("agr"),
      tenantId: parsed.tenantId,
      registryKey: parsed.registryKey,
      agentKind: parsed.agentKind,
      title: parsed.title,
      description: parsed.description,
      owningTeamId: parsed.owningTeamId ?? null,
      owningUserId: parsed.owningUserId ?? null,
      currentStableVersionId: null,
      currentLatestVersionId: null,
      modelFamilies: parsed.modelFamilies,
      metadataJson: parsed.metadata as unknown as Record<string, unknown>,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return registry;
  });
  logAgentRegistryEvent("agent_registry_created", {
    tenantId: registry.tenantId,
    registryId: registry.id,
    registryKey: registry.registryKey,
    agentKind: registry.agentKind,
  });
  recordRegistryPromotionMetrics({
    action: "created",
    decision: registry.agentKind,
  });
  return registry;
}

export async function publishAgentVersion(input: AgentRegistryVersionCreateInput, repo: AgentRegistryRepository = getDefaultRepository()) {
  const parsed = agentRegistryVersionCreateSchema.parse(input);
  const version = await repo.transaction(async (tx) => {
    const registry = await tx.getRegistryByTenantAndId(parsed.tenantId, parsed.registryId);
    if (!registry) {
      throw new Error(`Unknown registry: ${parsed.registryId}`);
    }

    const priorContext = await tx.loadResolutionContext(parsed.tenantId, { registryId: parsed.registryId }, null);
    const priorVersion = priorContext?.versions.find((candidate) => candidate.id === (parsed.previousVersionId ?? registry.currentLatestVersionId)) ?? null;
    const priorPolicy = priorContext?.policyBindings.find((binding) => binding.versionId === priorVersion?.id) ?? null;

    const policyReviewReasons = priorPolicy ? comparePolicyScope(priorPolicy, {
      id: "",
      tenantId: parsed.tenantId,
      registryId: parsed.registryId,
      versionId: "",
      purpose: parsed.policies.purpose,
      supportedWorkDomains: parsed.policies.supportedWorkDomains,
      supportedToolClasses: parsed.policies.supportedToolClasses,
      disallowedActionClasses: parsed.policies.disallowedActionClasses,
      memoryScopeJson: parsed.policies.memoryScope as unknown as Record<string, unknown>,
      budgetPolicyJson: parsed.policies.budgetPolicy as unknown as Record<string, unknown>,
      escalationPolicyJson: parsed.policies.escalationPolicy as unknown as Record<string, unknown>,
      approvalRequirementsJson: parsed.policies.approvalRequirements,
      modelCompatibilityJson: parsed.policies.modelCompatibility,
      evaluationTargetsJson: parsed.policies.evaluationTargets,
      outcomeMemoryHook: parsed.policies.outcomeMemoryHook,
      metadataJson: parsed.policies.metadata as unknown as Record<string, unknown>,
      createdAt: new Date(),
    }) : [];
    const requiresReview = parsed.reviewRequired || policyReviewReasons.length > 0;
    const versionStatus = requiresReview ? "review_required" : parsed.versionStatus;
    const rolloutState = requiresReview && parsed.rolloutState === "general" ? "supervised" : parsed.rolloutState;

    const version = await tx.createVersion({
      id: createRowId("agv"),
      tenantId: parsed.tenantId,
      registryId: parsed.registryId,
      versionNumber: parsed.versionNumber,
      versionStatus,
      rolloutState,
      previousVersionId: parsed.previousVersionId ?? null,
      isStable: parsed.isStable,
      reviewRequired: requiresReview,
      publishedAt: parsed.publishedAt ? new Date(parsed.publishedAt) : null,
      frozenAt: parsed.frozenAt ? new Date(parsed.frozenAt) : null,
      createdAt: new Date(),
    });

    const registryPatch: Partial<InsertAgentRegistryRegistry> = {
      currentLatestVersionId: version.id,
      rolloutState,
      updatedAt: new Date(),
    };
    if (parsed.isStable) {
      registryPatch.currentStableVersionId = version.id;
    }

    await tx.updateRegistry(parsed.registryId, registryPatch);

    await tx.createPolicyBinding({
      id: createRowId("agp"),
      tenantId: registry.tenantId,
      registryId: parsed.registryId,
      versionId: version.id,
      purpose: parsed.policies.purpose,
      supportedWorkDomains: parsed.policies.supportedWorkDomains,
      supportedToolClasses: parsed.policies.supportedToolClasses,
      disallowedActionClasses: parsed.policies.disallowedActionClasses,
      memoryScopeJson: parsed.policies.memoryScope as unknown as Record<string, unknown>,
      budgetPolicyJson: parsed.policies.budgetPolicy as unknown as Record<string, unknown>,
      escalationPolicyJson: parsed.policies.escalationPolicy as unknown as Record<string, unknown>,
      approvalRequirementsJson: parsed.policies.approvalRequirements,
      modelCompatibilityJson: parsed.policies.modelCompatibility,
      evaluationTargetsJson: parsed.policies.evaluationTargets,
      outcomeMemoryHook: parsed.policies.outcomeMemoryHook,
      metadataJson: parsed.policies.metadata as unknown as Record<string, unknown>,
      createdAt: new Date(),
    });

    for (const binding of parsed.rolloutBindings) {
      await tx.createRolloutBinding({
        id: createRowId("agrb"),
        tenantId: registry.tenantId,
        registryId: parsed.registryId,
        versionId: version.id,
        tenantTargetId: binding.tenantTargetId ?? null,
        teamTargetId: binding.teamTargetId ?? null,
        queueTargetId: binding.queueTargetId ?? null,
        workpackFamily: binding.workpackFamily ?? null,
        environment: binding.environment ?? null,
        shadowPercent: binding.shadowPercent,
        canaryPercent: binding.canaryPercent,
        createdAt: new Date(),
      });
    }

    return version;
  });
  logAgentRegistryEvent("agent_registry_version_published", {
    tenantId: version.tenantId,
    registryId: version.registryId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    versionStatus: version.versionStatus,
    rolloutState: version.rolloutState,
    reviewRequired: version.reviewRequired,
  });
  recordRegistryPromotionMetrics({
    action: "published",
    decision: version.reviewRequired ? "review_required" : "published",
  });
  return version;
}

export async function resolveAgentVersion(input: AgentRegistryResolutionRequest, repo: AgentRegistryRepository = getDefaultRepository()) {
  const parsed = agentRegistryResolutionRequestSchema.parse(input);
  const context = await repo.loadResolutionContext(parsed.tenantId, { registryId: parsed.registryId, registryKey: parsed.registryKey }, parsed.workloadClass);
  if (!context) {
    const result = agentRegistryResolutionResultSchema.parse({
      registryId: parsed.registryId ?? "",
      registryKey: parsed.registryKey ?? "",
      selectedVersionId: null,
      selectedVersionNumber: null,
      selectedVersionStatus: null,
      selectedRolloutState: null,
      stableVersionId: null,
      eligibleVersionIds: [],
      rejectedVersions: [],
      usedEvidencePreference: false,
      reason: "registry not found",
    });
    recordRegistryResolutionMetrics({
      selectedVersionId: null,
      reason: result.reason,
      usedEvidencePreference: result.usedEvidencePreference,
    });
    return result;
  }

  const evaluated = context.versions.map((version) => {
    const evaluation = evaluateCandidate(context, parsed, version);
    return {
      version,
      evaluation,
    };
  });

  const eligible = evaluated.filter(({ evaluation }) => evaluation.eligible);
  const rejectedVersions = evaluated
    .filter(({ evaluation }) => !evaluation.eligible)
    .map(({ version, evaluation }) => ({
      versionId: version.id,
      versionNumber: version.versionNumber,
      versionStatus: version.versionStatus,
      rolloutState: version.rolloutState,
      selected: false,
      reasons: evaluation.reasons,
      evidenceSummary: evaluation.evidenceSummary,
    }));

  if (eligible.length === 0) {
    const result = agentRegistryResolutionResultSchema.parse({
      registryId: context.registry.id,
      registryKey: context.registry.registryKey,
      selectedVersionId: null,
      selectedVersionNumber: null,
      selectedVersionStatus: null,
      selectedRolloutState: null,
      stableVersionId: context.registry.currentStableVersionId ?? null,
      eligibleVersionIds: [],
      rejectedVersions,
      usedEvidencePreference: false,
      reason: rejectedVersions.map((entry) => `${entry.versionId}: ${entry.reasons.join("; ")}`).join(" | ") || "no eligible version matched",
    });
    logAgentRegistryEvent("agent_registry_version_selected", {
      tenantId: parsed.tenantId,
      registryId: context.registry.id,
      registryKey: context.registry.registryKey,
      selectedVersionId: null,
      reason: result.reason,
      eligibleVersionIds: result.eligibleVersionIds,
    });
    recordRegistryResolutionMetrics({
      selectedVersionId: null,
      reason: result.reason,
      usedEvidencePreference: result.usedEvidencePreference,
    });
    return result;
  }

  const withStableBonus = eligible.map(({ version, evaluation }) => {
    const stableBonus = context.registry.currentStableVersionId === version.id ? 2 : 0;
    const evidenceBonus = parsed.allowEvidencePreference ? evaluation.evidenceSummary.successRate : 0;
    const rolloutBonus = rolloutPriority(version.rolloutState);
    return {
      version,
      evaluation,
      score: rolloutBonus + stableBonus + evidenceBonus + version.versionNumber / 1000,
    };
  });

  withStableBonus.sort((a, b) => b.score - a.score);
  const selected = withStableBonus[0];

  const result = agentRegistryResolutionResultSchema.parse({
    registryId: context.registry.id,
    registryKey: context.registry.registryKey,
    selectedVersionId: selected.version.id,
    selectedVersionNumber: selected.version.versionNumber,
    selectedVersionStatus: selected.version.versionStatus,
    selectedRolloutState: selected.version.rolloutState,
    stableVersionId: context.registry.currentStableVersionId ?? null,
    eligibleVersionIds: eligible.map(({ version }) => version.id),
    rejectedVersions,
    usedEvidencePreference: parsed.allowEvidencePreference,
    reason: selected.evaluation.reasons.length > 0 ? selected.evaluation.reasons.join("; ") : "eligible and selected",
  });
  logAgentRegistryEvent("agent_registry_version_selected", {
    tenantId: parsed.tenantId,
    registryId: context.registry.id,
    registryKey: context.registry.registryKey,
    selectedVersionId: result.selectedVersionId,
    selectedVersionNumber: result.selectedVersionNumber,
    stableVersionId: result.stableVersionId,
    usedEvidencePreference: result.usedEvidencePreference,
    reason: result.reason,
  });
  recordRegistryResolutionMetrics({
    selectedVersionId: result.selectedVersionId,
    reason: result.reason,
    usedEvidencePreference: result.usedEvidencePreference,
  });
  return result;
}

export async function recordAgentOutcomeMemory(input: AgentRegistryMemoryRecord, repo: AgentRegistryRepository = getDefaultRepository()) {
  const parsed = agentRegistryMemoryRecordSchema.parse(input);
  const payload = normalizeMemoryPayload(parsed);
  const memory = await repo.createOutcomeMemory({
    id: createRowId("agm"),
    tenantId: parsed.tenantId,
    registryId: parsed.registryId,
    versionId: parsed.versionId,
    workloadClass: parsed.workloadClass,
    selectedModelFamily: parsed.selectedModelFamily ?? null,
    outcome: parsed.outcome,
    failureMode: sanitizeMemoryText(parsed.failureMode),
    operatorEditsJson: sanitizeMemoryTextList(parsed.operatorEdits),
    improvementNotes: typeof payload.improvementNotes === "string" ? payload.improvementNotes : sanitizeMemoryText(parsed.improvementNotes) ?? "",
    redactionState: parsed.redactionState,
    retentionTier: parsed.retentionTier,
    metadataJson: sanitizeSensitiveRecord(parsed.metadata as unknown as Record<string, unknown>),
    createdAt: new Date(),
  });
  logAgentRegistryEvent("agent_registry_memory_recorded", {
    tenantId: parsed.tenantId,
    registryId: parsed.registryId,
    versionId: parsed.versionId,
    workloadClass: parsed.workloadClass,
    outcome: parsed.outcome,
    redactionState: parsed.redactionState,
    retentionTier: parsed.retentionTier,
  });
  return memory;
}

export async function createPromotionReview(input: {
  tenantId: string;
  registryId: string;
  proposedVersionId: string;
  baselineVersionId: string | null;
  decision: "promote" | "freeze" | "revert" | "hold";
  reason: string;
  createdByUserId?: number | null;
}, repo: AgentRegistryRepository = getDefaultRepository()) {
  const review = await repo.createPromotionReview({
    id: createRowId("agpr"),
    tenantId: input.tenantId,
    registryId: input.registryId,
    proposedVersionId: input.proposedVersionId,
    baselineVersionId: input.baselineVersionId,
    decision: input.decision,
    reason: input.reason,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: new Date(),
  });
  logAgentRegistryEvent("agent_registry_promotion_reviewed", {
    tenantId: input.tenantId,
    registryId: input.registryId,
    proposedVersionId: input.proposedVersionId,
    decision: input.decision,
    reason: input.reason,
  });
  recordRegistryPromotionMetrics({
    action: "reviewed",
    decision: input.decision,
  });
  return review;
}

export async function freezeAgentVersion(input: { tenantId: string; versionId: string; reason?: string | null }, repo: AgentRegistryRepository = getDefaultRepository()) {
  return repo.transaction(async (tx) => {
    const updated = await tx.updateVersion(input.versionId, {
      versionStatus: "frozen",
      frozenAt: new Date(),
    });
    if (!updated) {
      throw new Error(`Unknown agent version: ${input.versionId}`);
    }
    await tx.createPromotionReview({
      id: createRowId("agpr"),
      tenantId: input.tenantId,
      registryId: updated.registryId,
      proposedVersionId: input.versionId,
      baselineVersionId: updated.previousVersionId ?? null,
      decision: "freeze",
      reason: input.reason ?? "version frozen",
      createdByUserId: null,
      createdAt: new Date(),
    });
    logAgentRegistryEvent("agent_registry_version_frozen", {
      tenantId: input.tenantId,
      registryId: updated.registryId,
      versionId: updated.id,
      reason: input.reason ?? "version frozen",
    });
    recordRegistryPromotionMetrics({
      action: "frozen",
      decision: input.reason ?? "version frozen",
    });
    return updated;
  });
}

export async function rollbackAgentVersion(input: { tenantId: string; registryId: string; versionId: string; reason?: string | null }, repo: AgentRegistryRepository = getDefaultRepository()) {
  return repo.transaction(async (tx) => {
    const registry = await tx.getRegistryByTenantAndId(input.tenantId, input.registryId);
    if (!registry) {
      throw new Error(`Unknown registry: ${input.registryId}`);
    }
    const updatedRegistry = await tx.updateRegistry(registry.id, {
      currentStableVersionId: input.versionId,
      updatedAt: new Date(),
    });
    if (!updatedRegistry) {
      throw new Error(`Unable to update registry: ${registry.id}`);
    }
    await tx.createPromotionReview({
      id: createRowId("agpr"),
      tenantId: input.tenantId,
      registryId: registry.id,
      proposedVersionId: input.versionId,
      baselineVersionId: registry.currentStableVersionId ?? null,
      decision: "revert",
      reason: input.reason ?? "rolled back to stable version",
      createdByUserId: null,
      createdAt: new Date(),
    });
    logAgentRegistryEvent("agent_registry_version_rolled_back", {
      tenantId: input.tenantId,
      registryId: registry.id,
      versionId: input.versionId,
      reason: input.reason ?? "rolled back to stable version",
      previousStableVersionId: registry.currentStableVersionId ?? null,
    });
    recordRegistryPromotionMetrics({
      action: "rolled_back",
      decision: input.reason ?? "rolled back to stable version",
    });
    return updatedRegistry;
  });
}

export async function listAgentRegistries(tenantId: string, repo: AgentRegistryRepository = getDefaultRepository()) {
  return repo.listRegistries(tenantId);
}

export async function getAgentRegistry(tenantId: string, registryId: string, repo: AgentRegistryRepository = getDefaultRepository()) {
  return repo.getRegistryByTenantAndId(tenantId, registryId);
}

export async function listAgentRegistryVersions(tenantId: string, registryId: string, repo: AgentRegistryRepository = getDefaultRepository()) {
  const registry = await repo.getRegistryByTenantAndId(tenantId, registryId);
  if (!registry) {
    return [];
  }
  return repo.listVersionsByRegistryId(registryId);
}

export type AgentRegistryResolutionResult = import("../../shared/agentRegistryContracts").AgentRegistryResolutionResult;
export type { RegistryContext as AgentRegistryResolutionContext };
