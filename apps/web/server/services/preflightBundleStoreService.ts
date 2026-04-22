import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { workCases } from "../../drizzle/schema";
import {
  type OrchestratorLearningProposal,
  orchestratorLearningProposalSchema,
  preflightApprovalBundleSchema,
} from "../../shared/workOrchestrator";
import { getDb } from "../db";
import { transitionProposal } from "./orchestratorLearningService";
import { transitionPreflightBundle } from "./preflightApprovalLifecycleService";

const storedStateSchema = z.object({
  version: z.literal("work-orchestrator-json.v1").default(
    "work-orchestrator-json.v1",
  ),
  currentPreflightBundleId: z.string().nullable().default(null),
  preflightBundles: z.array(preflightApprovalBundleSchema).default([]),
  learningProposals: z.array(orchestratorLearningProposalSchema).default([]),
  persistenceDecision: z
    .object({
      storageMode: z.literal("json_metadata").default("json_metadata"),
      rolloutStage: z.literal("preview_beta").default("preview_beta"),
      decisionLogRef: z
        .string()
        .default(
          "specs/feature/105-work-os-team-orchestrator-unified-automation/decision-log.md#17",
        ),
      recordedAt: z.string().datetime(),
    })
    .default({
      storageMode: "json_metadata",
      rolloutStage: "preview_beta",
      decisionLogRef:
        "specs/feature/105-work-os-team-orchestrator-unified-automation/decision-log.md#17",
      recordedAt: new Date().toISOString(),
    }),
  lastUpdatedAt: z.string().datetime(),
});

export type WorkOrchestratorStoredState = z.infer<typeof storedStateSchema>;
type DbExecutor = any;
type AtomicPreflightBundleTransitionResult = {
  applied: boolean;
  reason:
    | "current_bundle_mismatch"
    | "missing_bundle"
    | "state_mismatch"
    | "updated";
  bundle: WorkOrchestratorStoredState["preflightBundles"][number] | null;
};
type StoredLearningProposal = WorkOrchestratorStoredState["learningProposals"][number];

function normalizeUniqueStrings(
  values: readonly (string | null | undefined)[],
): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map(value => value.trim())
        .filter(Boolean),
    ),
  );
}

function asMetadataRecord(
  value: OrchestratorLearningProposal["metadata"],
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readMetadataStringArray(
  metadata: Record<string, unknown>,
  key: string,
): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return normalizeUniqueStrings(
    value.map(item => (typeof item === "string" ? item : null)),
  );
}

function readMetadataNumber(
  metadata: Record<string, unknown>,
  key: string,
): number {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function maxIsoTimestamp(left: string, right: string): string {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function mergeLearningProposal(
  existing: StoredLearningProposal,
  incoming: StoredLearningProposal,
): StoredLearningProposal {
  const existingMetadata = asMetadataRecord(existing.metadata);
  const nextProposal =
    existing.state === "generated"
      ? transitionProposal({
          proposal: existing,
          nextState: "deduped",
          reason: "learning_proposal_deduped",
          evidenceRefs: incoming.evidenceRefs,
          occurredAt: incoming.updatedAt,
        })
      : existing;
  const nextMetadata = asMetadataRecord(nextProposal.metadata);

  return {
    ...nextProposal,
    confidence: Math.max(nextProposal.confidence, incoming.confidence),
    evidenceRefs: normalizeUniqueStrings([
      ...nextProposal.evidenceRefs,
      ...incoming.evidenceRefs,
    ]),
    updatedAt: maxIsoTimestamp(nextProposal.updatedAt, incoming.updatedAt),
    metadata: {
      ...nextMetadata,
      duplicateCount: readMetadataNumber(existingMetadata, "duplicateCount") + 1,
      duplicateRunIds: normalizeUniqueStrings([
        existing.relatedRunId ?? null,
        incoming.relatedRunId ?? null,
        ...readMetadataStringArray(existingMetadata, "duplicateRunIds"),
      ]),
      duplicateEvidenceRefs: normalizeUniqueStrings([
        ...readMetadataStringArray(existingMetadata, "duplicateEvidenceRefs"),
        ...incoming.evidenceRefs,
      ]),
      lastDedupedAt: incoming.updatedAt,
      lastDedupedProposalId: incoming.id,
      lastDedupedActionType: incoming.actionType,
      lastDedupedState: incoming.state,
      latestConfidence: Math.max(nextProposal.confidence, incoming.confidence),
    },
  };
}

export function applyLearningProposalUpdates(input: {
  state: WorkOrchestratorStoredState;
  proposals: readonly StoredLearningProposal[];
}): {
  state: WorkOrchestratorStoredState;
  proposals: StoredLearningProposal[];
} {
  const nextProposals = [...input.state.learningProposals];
  const resolvedProposals: StoredLearningProposal[] = [];

  for (const proposal of input.proposals) {
    const existingByIdIndex = nextProposals.findIndex(
      existing => existing.id === proposal.id,
    );
    if (existingByIdIndex >= 0) {
      nextProposals[existingByIdIndex] = proposal;
      resolvedProposals.push(proposal);
      continue;
    }

    const duplicateIndex = nextProposals.findIndex(
      existing =>
        existing.dedupeKey === proposal.dedupeKey &&
        existing.actionType === proposal.actionType,
    );
    if (duplicateIndex >= 0) {
      const merged = mergeLearningProposal(nextProposals[duplicateIndex]!, proposal);
      nextProposals[duplicateIndex] = merged;
      resolvedProposals.push(merged);
      continue;
    }

    nextProposals.push(proposal);
    resolvedProposals.push(proposal);
  }

  return {
    state: {
      ...input.state,
      learningProposals: nextProposals,
    },
    proposals: resolvedProposals,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultStoredState(): WorkOrchestratorStoredState {
  const recordedAt = nowIso();
  return storedStateSchema.parse({
    currentPreflightBundleId: null,
    preflightBundles: [],
    learningProposals: [],
    persistenceDecision: {
      storageMode: "json_metadata",
      rolloutStage: "preview_beta",
      decisionLogRef:
        "specs/feature/105-work-os-team-orchestrator-unified-automation/decision-log.md#17",
      recordedAt,
    },
    lastUpdatedAt: recordedAt,
  });
}

async function loadCaseRecord(input: {
  tenantId: string;
  caseId: string;
}, dbOverride?: DbExecutor): Promise<{
  automationPolicyJson: Record<string, unknown>;
}> {
  const db = dbOverride ?? (await getDb());
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .select({
      automationPolicyJson: workCases.automationPolicyJson,
    })
    .from(workCases)
    .where(
      and(
        eq(workCases.id, input.caseId),
        eq(workCases.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  if (!record) {
    throw new Error(`Work case ${input.caseId} not found`);
  }

  return {
    automationPolicyJson: record.automationPolicyJson ?? {},
  };
}

export async function loadWorkOrchestratorState(input: {
  tenantId: string;
  caseId: string;
}, dbOverride?: DbExecutor): Promise<{
  state: WorkOrchestratorStoredState;
  policyJson: Record<string, unknown>;
}> {
  const record = await loadCaseRecord(input, dbOverride);
  const container =
    record.automationPolicyJson.workOrchestrator &&
    typeof record.automationPolicyJson.workOrchestrator === "object"
      ? (record.automationPolicyJson.workOrchestrator as Record<string, unknown>)
      : null;

  const parsed = storedStateSchema.safeParse(container ?? null);

  return {
    state: parsed.success ? parsed.data : defaultStoredState(),
    policyJson: record.automationPolicyJson,
  };
}

export async function saveWorkOrchestratorState(input: {
  tenantId: string;
  caseId: string;
  policyJson: Record<string, unknown>;
  state: WorkOrchestratorStoredState;
}, dbOverride?: DbExecutor): Promise<WorkOrchestratorStoredState> {
  const db = dbOverride ?? (await getDb());
  if (!db) throw new Error("Database not available");

  const nextState = storedStateSchema.parse({
    ...input.state,
    lastUpdatedAt: nowIso(),
  });
  const nextPolicyJson = {
    ...input.policyJson,
    workOrchestrator: nextState,
  };

  await db
    .update(workCases)
    .set({
      automationPolicyJson: nextPolicyJson,
      automationUpdatedAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .where(
      and(
        eq(workCases.id, input.caseId),
        eq(workCases.tenantId, input.tenantId),
      ),
    )
    .returning();

  return nextState;
}

function replaceBundle(
  bundles: WorkOrchestratorStoredState["preflightBundles"],
  bundle: WorkOrchestratorStoredState["preflightBundles"][number],
) {
  const nextBundles = bundles.filter(existing => existing.id !== bundle.id);
  nextBundles.push(bundle);
  return nextBundles;
}

function applyBundleUpdate(input: {
  state: WorkOrchestratorStoredState;
  bundle: WorkOrchestratorStoredState["preflightBundles"][number];
  makeCurrent?: boolean;
  supersedeCurrent?: boolean;
}): WorkOrchestratorStoredState {
  let nextBundles = [...input.state.preflightBundles];
  let currentBundleId = input.state.currentPreflightBundleId;

  if (input.makeCurrent && input.supersedeCurrent && currentBundleId) {
    const current = nextBundles.find(bundle => bundle.id === currentBundleId);
    if (
      current &&
      current.id !== input.bundle.id &&
      current.state !== "superseded" &&
      current.state !== "cancelled" &&
      current.state !== "launched"
    ) {
      const superseded = transitionPreflightBundle({
        bundle: {
          ...current,
          supersededByBundleId: input.bundle.id,
        },
        toState: "superseded",
        event: "preview.superseded",
        reasonCode: "preview_regenerated",
      });
      nextBundles = replaceBundle(nextBundles, superseded);
    }
  }

  nextBundles = replaceBundle(nextBundles, input.bundle);
  if (input.makeCurrent) {
    currentBundleId = input.bundle.id;
  }

  return {
    ...input.state,
    currentPreflightBundleId: currentBundleId,
    preflightBundles: nextBundles,
  };
}

async function withLockedWorkOrchestratorState<T>(input: {
  tenantId: string;
  caseId: string;
  mutate: (args: {
    state: WorkOrchestratorStoredState;
    policyJson: Record<string, unknown>;
    db: DbExecutor;
  }) => Promise<{
    state: WorkOrchestratorStoredState;
    result: T;
  }>;
}): Promise<T> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.transaction(async tx => {
    await tx.execute(
      sql`SELECT 1 FROM ${workCases} WHERE ${workCases.id} = ${input.caseId} AND ${workCases.tenantId} = ${input.tenantId} FOR UPDATE`,
    );
    const { state, policyJson } = await loadWorkOrchestratorState(
      {
        tenantId: input.tenantId,
        caseId: input.caseId,
      },
      tx as DbExecutor,
    );
    const mutated = await input.mutate({
      state,
      policyJson,
      db: tx as DbExecutor,
    });
    await saveWorkOrchestratorState(
      {
        tenantId: input.tenantId,
        caseId: input.caseId,
        policyJson,
        state: mutated.state,
      },
      tx as DbExecutor,
    );
    return mutated.result;
  });
}

export async function getCurrentPreflightBundle(input: {
  tenantId: string;
  caseId: string;
}) {
  const { state } = await loadWorkOrchestratorState(input);
  if (!state.currentPreflightBundleId) {
    return null;
  }
  return (
    state.preflightBundles.find(
      bundle => bundle.id === state.currentPreflightBundleId,
    ) ?? null
  );
}

export async function getPreflightBundle(input: {
  tenantId: string;
  caseId: string;
  preflightBundleId: string;
}) {
  const { state } = await loadWorkOrchestratorState(input);
  return (
    state.preflightBundles.find(bundle => bundle.id === input.preflightBundleId) ??
    null
  );
}

export async function putPreflightBundle(input: {
  tenantId: string;
  caseId: string;
  bundle: WorkOrchestratorStoredState["preflightBundles"][number];
  makeCurrent?: boolean;
  supersedeCurrent?: boolean;
}) {
  const { state, policyJson } = await loadWorkOrchestratorState(input);
  const savedState = await saveWorkOrchestratorState({
    tenantId: input.tenantId,
    caseId: input.caseId,
    policyJson,
    state: applyBundleUpdate({
      state,
      bundle: input.bundle,
      makeCurrent: input.makeCurrent,
      supersedeCurrent: input.supersedeCurrent,
    }),
  });

  return (
    savedState.preflightBundles.find(bundle => bundle.id === input.bundle.id) ??
    input.bundle
  );
}

export async function transitionPreflightBundleAtomically(input: {
  tenantId: string;
  caseId: string;
  preflightBundleId: string;
  expectedCurrentBundleId?: string | null;
  expectedState?: WorkOrchestratorStoredState["preflightBundles"][number]["state"] | null;
  transform: (
    bundle: WorkOrchestratorStoredState["preflightBundles"][number],
  ) => WorkOrchestratorStoredState["preflightBundles"][number];
  makeCurrent?: boolean;
  supersedeCurrent?: boolean;
}): Promise<AtomicPreflightBundleTransitionResult> {
  return withLockedWorkOrchestratorState<AtomicPreflightBundleTransitionResult>({
    tenantId: input.tenantId,
    caseId: input.caseId,
    mutate: async ({ state }) => {
      if (
        input.expectedCurrentBundleId !== undefined &&
        state.currentPreflightBundleId !== input.expectedCurrentBundleId
      ) {
        return {
          state,
          result: {
            applied: false,
            reason: "current_bundle_mismatch" as const,
            bundle:
              state.preflightBundles.find(
                bundle => bundle.id === input.preflightBundleId,
              ) ?? null,
          },
        };
      }

      const existing =
        state.preflightBundles.find(
          bundle => bundle.id === input.preflightBundleId,
        ) ?? null;
      if (!existing) {
        return {
          state,
          result: {
            applied: false,
            reason: "missing_bundle" as const,
            bundle: null,
          },
        };
      }

      if (
        input.expectedState !== undefined &&
        input.expectedState !== null &&
        existing.state !== input.expectedState
      ) {
        return {
          state,
          result: {
            applied: false,
            reason: "state_mismatch" as const,
            bundle: existing,
          },
        };
      }

      const nextBundle = input.transform(existing);
      const nextState = applyBundleUpdate({
        state,
        bundle: nextBundle,
        makeCurrent: input.makeCurrent,
        supersedeCurrent: input.supersedeCurrent,
      });

      return {
        state: nextState,
        result: {
          applied: true,
          reason: "updated" as const,
          bundle: nextBundle,
        },
      };
    },
  });
}

export async function putLearningProposal(input: {
  tenantId: string;
  caseId: string;
  proposal: WorkOrchestratorStoredState["learningProposals"][number];
}) {
  const [storedProposal] = await putLearningProposalsAtomically({
    tenantId: input.tenantId,
    caseId: input.caseId,
    proposals: [input.proposal],
  });
  return storedProposal ?? input.proposal;
}

export async function putLearningProposalsAtomically(input: {
  tenantId: string;
  caseId: string;
  proposals: readonly StoredLearningProposal[];
}) {
  if (input.proposals.length === 0) {
    return [] as StoredLearningProposal[];
  }

  return withLockedWorkOrchestratorState<StoredLearningProposal[]>({
    tenantId: input.tenantId,
    caseId: input.caseId,
    mutate: async ({ state }) => {
      const updated = applyLearningProposalUpdates({
        state,
        proposals: input.proposals,
      });
      return {
        state: updated.state,
        result: updated.proposals,
      };
    },
  });
}
