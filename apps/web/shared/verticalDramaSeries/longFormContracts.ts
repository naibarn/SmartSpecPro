import { z } from "zod";
import { canonicalJsonStringify, sha256Hex } from "./artifacts";
import {
  createUniformVerticalDramaDurationPlan,
  VERTICAL_DRAMA_STRICT_90_SECOND_PROFILE_ID,
  type VerticalDramaDurationPlan,
} from "./durationProfiles";

export const LONG_FORM_CONTRACT_VERSION = "vd-long-form-v1" as const;
export const LONG_FORM_DEFAULT_EPISODE_COUNT = 120 as const;
export const LONG_FORM_MAX_EPISODE_COUNT = 1000 as const;
export const LONG_FORM_DEFAULT_PLAN_CHUNK_SIZE = 10 as const;
export const LONG_FORM_MAX_PLAN_CHUNK_SIZE = 20 as const;
export const LONG_FORM_DEFAULT_GRAPH_PAGE_SIZE = 100 as const;
export const LONG_FORM_MAX_GRAPH_PAGE_SIZE = 200 as const;

export const LONG_FORM_MODES = ["quality_120", "extended_long_form"] as const;
export type LongFormMode = (typeof LONG_FORM_MODES)[number];

export function resolveLongFormMode(requestedEpisodeCount: number): {
  requestedEpisodeCount: number;
  recommendedEpisodeCount: number;
  mode: LongFormMode;
  episodeDurationSeconds: 90;
  estimatedRuntimeSeconds: number;
} {
  if (!Number.isInteger(requestedEpisodeCount) || requestedEpisodeCount < 1) {
    throw new Error("requestedEpisodeCount must be a positive integer");
  }
  if (requestedEpisodeCount > LONG_FORM_MAX_EPISODE_COUNT) {
    throw new Error(
      `requestedEpisodeCount cannot exceed ${LONG_FORM_MAX_EPISODE_COUNT}`
    );
  }
  return {
    requestedEpisodeCount,
    recommendedEpisodeCount: LONG_FORM_DEFAULT_EPISODE_COUNT,
    mode:
      requestedEpisodeCount <= LONG_FORM_DEFAULT_EPISODE_COUNT
        ? "quality_120"
        : "extended_long_form",
    episodeDurationSeconds: 90,
    estimatedRuntimeSeconds: requestedEpisodeCount * 90,
  };
}

export function buildLongFormId(
  kind: string,
  scope: string,
  ...parts: Array<string | number>
): string {
  const payload = [kind, scope, ...parts].map(String).join("|");
  return `${kind}-${sha256Hex(payload).slice(0, 20)}`;
}

export const longFormPolicySchema = z.object({
  version: z.string().min(1),
  fingerprint: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
});
export type LongFormPolicy = z.infer<typeof longFormPolicySchema>;

export const longFormBlueprintSchema = z.object({
  contractVersion: z.literal(LONG_FORM_CONTRACT_VERSION),
  blueprintId: z.string().min(1),
  blueprintFingerprint: z.string().min(1),
  mode: z.enum(LONG_FORM_MODES),
  requestedEpisodeCount: z
    .number()
    .int()
    .positive()
    .max(LONG_FORM_MAX_EPISODE_COUNT),
  recommendedEpisodeCount: z.number().int().positive(),
  episodeDurationSeconds: z.literal(90),
  relationshipGraphRevisionId: z.string().min(1),
  relationshipGraphFingerprint: z.string().min(1),
  relationshipRedactionPolicyVersion: z.string().min(1),
  relationshipRedactionPolicyFingerprint: z.string().min(1),
  relationshipDependencyIndexFingerprint: z.string().min(1),
  relationshipGraphReadiness: z.enum([
    "ready",
    "compatibility_backfill",
    "needs_repair",
  ]),
  unresolvedRelationQuestions: z.array(z.string().min(1)),
  policies: z.record(z.string(), longFormPolicySchema),
});
export type LongFormBlueprint = z.infer<typeof longFormBlueprintSchema>;

export type LongFormRunExtension = {
  blueprintId: string;
  blueprintFingerprint: string;
  mode: LongFormMode;
  requestedEpisodeCount: number;
  recommendedEpisodeCount: number;
  episodeDurationSeconds: 90;
  arcBlockPlanFingerprint: string;
  relationshipGraphRevisionId: string;
  relationshipGraphFingerprint: string;
  relationshipDependencyIndexFingerprint: string;
  relationshipRedactionPolicyVersion: string;
  relationshipRedactionPolicyFingerprint: string;
  castFingerprint: string;
  worldFingerprint: string;
  lookFingerprint: string;
  memorySnapshotFingerprint: string;
  retryPolicyFingerprint: string;
  sloPolicyFingerprint: string;
  speechPolicyFingerprint: string;
  benchmarkPolicyFingerprint: string;
  antiDriftPolicyFingerprint: string;
  planChunkPolicyFingerprint: string;
  executionPolicyFingerprint: string;
  pricingSnapshotFingerprint: string;
  closurePolicyVersion: string;
  benchmarkFinalizationRef?: string;
};

/** Runtime fence for the typed long-form extension stored in a run contract. */
export const longFormRunExtensionSchema = z.object({
  blueprintId: z.string().min(1),
  blueprintFingerprint: z.string().min(1),
  mode: z.enum(LONG_FORM_MODES),
  requestedEpisodeCount: z
    .number()
    .int()
    .positive()
    .max(LONG_FORM_MAX_EPISODE_COUNT),
  recommendedEpisodeCount: z.number().int().positive(),
  episodeDurationSeconds: z.literal(90),
  arcBlockPlanFingerprint: z.string().min(1),
  relationshipGraphRevisionId: z.string().min(1),
  relationshipGraphFingerprint: z.string().min(1),
  relationshipDependencyIndexFingerprint: z.string().min(1),
  relationshipRedactionPolicyVersion: z.string().min(1),
  relationshipRedactionPolicyFingerprint: z.string().min(1),
  castFingerprint: z.string().min(1),
  worldFingerprint: z.string().min(1),
  lookFingerprint: z.string().min(1),
  memorySnapshotFingerprint: z.string().min(1),
  retryPolicyFingerprint: z.string().min(1),
  sloPolicyFingerprint: z.string().min(1),
  speechPolicyFingerprint: z.string().min(1),
  benchmarkPolicyFingerprint: z.string().min(1),
  antiDriftPolicyFingerprint: z.string().min(1),
  planChunkPolicyFingerprint: z.string().min(1),
  executionPolicyFingerprint: z.string().min(1),
  pricingSnapshotFingerprint: z.string().min(1),
  closurePolicyVersion: z.string().min(1),
  benchmarkFinalizationRef: z.string().min(1).optional(),
});

export function fingerprintLongFormPolicy(value: unknown): string {
  return sha256Hex(canonicalJsonStringify(value));
}

export function createStrict90SecondDurationPlan(): VerticalDramaDurationPlan {
  return {
    ...createUniformVerticalDramaDurationPlan(10, {
      profileId: VERTICAL_DRAMA_STRICT_90_SECOND_PROFILE_ID,
      source: "provider_capability",
    }),
    renderSegmentDurationsSeconds: Array(9).fill(10),
  };
}

export function validateStrict90SecondDurationPlan(
  plan: VerticalDramaDurationPlan
): string[] {
  const errors: string[] = [];
  if (plan.profileId !== VERTICAL_DRAMA_STRICT_90_SECOND_PROFILE_ID)
    errors.push("incompatible_duration_profile");
  if (
    plan.shotDurationsSeconds.length !== 9 ||
    plan.shotDurationsSeconds.some(value => value !== 10)
  ) {
    errors.push("logical_duration_sum_mismatch");
  }
  if (
    plan.renderSegmentDurationsSeconds?.some(value => value !== 10) ||
    plan.renderSegmentDurationsSeconds?.length !== 9
  ) {
    errors.push("render_duration_sum_mismatch");
  }
  return errors;
}

export type LongFormPlanChunk = {
  chunkId?: string;
  startEpisode: number;
  endEpisode: number;
  idempotencyKey: string;
  predecessorCoverageFingerprint: string;
  policyFingerprint?: string;
};

export function validatePlanChunks(
  chunks: readonly LongFormPlanChunk[],
  targetEpisodeCount: number
): string[] {
  const errors: string[] = [];
  const sorted = [...chunks].sort((a, b) => a.startEpisode - b.startEpisode);
  let expected = 1;
  for (const chunk of sorted) {
    if (
      !Number.isInteger(chunk.startEpisode) ||
      !Number.isInteger(chunk.endEpisode) ||
      chunk.endEpisode < chunk.startEpisode
    ) {
      errors.push("invalid_chunk_interval");
      continue;
    }
    if (
      chunk.endEpisode - chunk.startEpisode + 1 >
      LONG_FORM_MAX_PLAN_CHUNK_SIZE
    )
      errors.push("chunk_size_exceeds_maximum");
    if (chunk.startEpisode !== expected)
      errors.push(
        chunk.startEpisode < expected ? "coverage_overlap" : "coverage_gap"
      );
    if (!chunk.idempotencyKey || !chunk.predecessorCoverageFingerprint)
      errors.push("missing_chunk_policy");
    expected = Math.max(expected, chunk.endEpisode + 1);
  }
  if (expected - 1 !== targetEpisodeCount)
    errors.push(
      expected - 1 < targetEpisodeCount
        ? "coverage_gap"
        : "coverage_exceeds_target"
    );
  return [...new Set(errors)];
}

export const RELATIONSHIP_TYPES = [
  "parent",
  "child",
  "sibling",
  "grandparent",
  "grandchild",
  "aunt_uncle",
  "niece_nephew",
  "cousin",
  "relative",
  "spouse",
  "ex_spouse",
  "fiance",
  "in_law",
  "friend",
  "acquaintance",
  "colleague",
  "mentor",
  "ally",
  "rival",
  "faction_member",
  "knows",
  "guardian",
  "enemy",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export const RELATIONSHIP_STATUSES = [
  "active",
  "strained",
  "broken",
  "secret",
  "suspected",
  "ended",
  "unknown",
  "disputed",
  "superseded",
  "candidate",
] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];
export const RELATIONSHIP_DISCLOSURES = [
  "private",
  "secret",
  "known_to_some",
  "public",
  "misunderstood",
  "undeclared",
] as const;
export type RelationshipDisclosure = (typeof RELATIONSHIP_DISCLOSURES)[number];
export const FAMILY_SIDES = [
  "maternal",
  "paternal",
  "spouse",
  "in_law",
  "adoptive",
  "guardian",
  "faction",
  "none",
  "unknown",
] as const;
export type FamilySide = (typeof FAMILY_SIDES)[number];

export type RelationshipGraphNode = {
  characterKey: string;
  familyGroupIds?: string[];
  factionIds?: string[];
};

export type RelationshipGraphEdge = {
  edgeId: string;
  fromCharacterKey: string;
  toCharacterKey: string;
  relationType: RelationshipType;
  status: RelationshipStatus;
  familySide: FamilySide;
  familyGroupId?: string;
  factionId?: string;
  disclosure: RelationshipDisclosure;
  beliefState?: RelationshipBeliefState;
  knownByCharacterKeys?: string[];
  validFromEpisode: number;
  validToEpisode: number | null;
  arcId?: string;
  sourceEdgeIds: string[];
  evidenceIds: string[];
  provenance:
    | "authored"
    | "derived"
    | "episode_fact"
    | "user_edit"
    | "user_approved"
    | "retcon"
    | "legacy_derived";
};

export const RELATIONSHIP_DELTA_OPERATIONS = [
  "add",
  "update_status",
  "reveal",
  "end",
  "retcon",
] as const;
export type RelationshipDeltaOperation =
  (typeof RELATIONSHIP_DELTA_OPERATIONS)[number];

export const RELATIONSHIP_BELIEF_STATES = [
  "unknown",
  "suspected",
  "believed",
  "known",
  "false",
] as const;
export type RelationshipBeliefState =
  (typeof RELATIONSHIP_BELIEF_STATES)[number];

/** Strict episode-level relationship mutation; legacy pair state is derived from this. */
export type RelationshipGraphDelta = {
  operation: RelationshipDeltaOperation;
  edgeId: string;
  fromCharacterKey: string;
  toCharacterKey: string;
  relationType: RelationshipType;
  validFromEpisode: number;
  validToEpisode?: number;
  disclosure: RelationshipDisclosure;
  beliefState: RelationshipBeliefState;
  knownByCharacterKeys: string[];
  evidenceRefs: string[];
  affectedCharacterKeys: string[];
  supersedesRevisionId?: string;
};

export const relationshipGraphDeltaSchema = z
  .object({
    operation: z.enum(RELATIONSHIP_DELTA_OPERATIONS),
    edgeId: z.string().trim().min(1),
    fromCharacterKey: z.string().trim().min(1),
    toCharacterKey: z.string().trim().min(1),
    relationType: z.enum(RELATIONSHIP_TYPES),
    validFromEpisode: z.number().int().positive(),
    validToEpisode: z.number().int().positive().optional(),
    disclosure: z.enum(RELATIONSHIP_DISCLOSURES),
    beliefState: z.enum(RELATIONSHIP_BELIEF_STATES),
    knownByCharacterKeys: z.array(z.string().trim().min(1)),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1),
    affectedCharacterKeys: z.array(z.string().trim().min(1)).min(2),
    supersedesRevisionId: z.string().trim().min(1).optional(),
  })
  .superRefine((delta, context) => {
    if (delta.fromCharacterKey === delta.toCharacterKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toCharacterKey"],
        message: "relationship_delta_self_edge",
      });
    }
    if (
      delta.validToEpisode !== undefined &&
      delta.validToEpisode < delta.validFromEpisode
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validToEpisode"],
        message: "relationship_delta_invalid_timeline",
      });
    }
    if (
      !delta.affectedCharacterKeys.includes(delta.fromCharacterKey) ||
      !delta.affectedCharacterKeys.includes(delta.toCharacterKey)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["affectedCharacterKeys"],
        message: "relationship_delta_missing_affected_character",
      });
    }
  });

export function validateStrictRelationshipGraphDeltas(input: {
  episodeNumber: number;
  deltas: unknown;
}): string[] {
  if (!Array.isArray(input.deltas)) return ["relationship_graph_delta_missing"];
  const errors: string[] = [];
  const edgeIds = new Set<string>();
  for (const [index, rawDelta] of input.deltas.entries()) {
    const parsed = relationshipGraphDeltaSchema.safeParse(rawDelta);
    if (!parsed.success) {
      errors.push(`relationship_graph_delta_invalid:${index}`);
      continue;
    }
    if (edgeIds.has(parsed.data.edgeId))
      errors.push(
        `relationship_graph_delta_duplicate_edge:${parsed.data.edgeId}`
      );
    edgeIds.add(parsed.data.edgeId);
    if (parsed.data.validFromEpisode > input.episodeNumber)
      errors.push(
        `relationship_graph_delta_future_start:${parsed.data.edgeId}`
      );
  }
  return [...new Set(errors)];
}

export type RelationshipGraphFamilyGroup = {
  familyGroupId: string;
  label: string;
  side: FamilySide;
  memberCharacterKeys: string[];
};

export type CharacterRelationshipGraph = {
  graphRevisionId: string;
  fingerprint: string;
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  familyGroups: RelationshipGraphFamilyGroup[];
};

const relationshipGraphNodeSchema = z.object({
  characterKey: z.string().trim().min(1),
  familyGroupIds: z.array(z.string().trim().min(1)).optional(),
  factionIds: z.array(z.string().trim().min(1)).optional(),
});

const relationshipGraphEdgeSchema = z.object({
  edgeId: z.string().trim().min(1),
  fromCharacterKey: z.string().trim().min(1),
  toCharacterKey: z.string().trim().min(1),
  relationType: z.enum(RELATIONSHIP_TYPES),
  status: z.enum(RELATIONSHIP_STATUSES),
  familySide: z.enum(FAMILY_SIDES),
  familyGroupId: z.string().trim().min(1).optional(),
  factionId: z.string().trim().min(1).optional(),
  disclosure: z.enum(RELATIONSHIP_DISCLOSURES),
  beliefState: z.enum(RELATIONSHIP_BELIEF_STATES).optional(),
  knownByCharacterKeys: z.array(z.string().trim().min(1)).optional(),
  validFromEpisode: z.number().int().positive(),
  validToEpisode: z.number().int().positive().nullable(),
  arcId: z.string().trim().min(1).optional(),
  sourceEdgeIds: z.array(z.string().trim().min(1)),
  evidenceIds: z.array(z.string().trim().min(1)),
  provenance: z.enum([
    "authored",
    "derived",
    "episode_fact",
    "user_edit",
    "user_approved",
    "retcon",
    "legacy_derived",
  ]),
});

const relationshipGraphFamilyGroupSchema = z.object({
  familyGroupId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  side: z.enum(FAMILY_SIDES),
  memberCharacterKeys: z.array(z.string().trim().min(1)),
});

/** Runtime guard for graph JSON read from the series bible. */
export const characterRelationshipGraphSchema = z.object({
  graphRevisionId: z.string().trim().min(1),
  fingerprint: z.string().trim().min(1),
  nodes: z.array(relationshipGraphNodeSchema),
  edges: z.array(relationshipGraphEdgeSchema),
  familyGroups: z.array(relationshipGraphFamilyGroupSchema),
});

export type RelationshipGraphQuery = {
  graphRevisionId: string;
  episodeNumber?: number;
  episodeRange?: { startEpisode: number; endEpisode: number };
  familySide?: FamilySide;
  familyGroupId?: string;
  factionId?: string;
  relationTypes?: RelationshipType[];
  statuses?: RelationshipStatus[];
  disclosure?: RelationshipDisclosure[];
  arcId?: string;
  candidateGraphRevisionId?: string;
  includeCandidateActiveDiff?: boolean;
  cursor?: string;
  pageSize?: number;
  expectedRedactionPolicyFingerprint?: string;
  viewpointCharacterKey?: string;
};

/** Shared input contract used by both tRPC adapters and memory retrieval. */
export const relationshipGraphQuerySchema = z
  .object({
    graphRevisionId: z.string().trim().min(1),
    episodeNumber: z.number().int().positive().optional(),
    episodeRange: z
      .object({
        startEpisode: z.number().int().positive(),
        endEpisode: z.number().int().positive(),
      })
      .refine(
        range => range.endEpisode >= range.startEpisode,
        "invalid_episode_range"
      )
      .optional(),
    familySide: z.enum(FAMILY_SIDES).optional(),
    familyGroupId: z.string().trim().min(1).optional(),
    factionId: z.string().trim().min(1).optional(),
    relationTypes: z
      .array(z.enum(RELATIONSHIP_TYPES))
      .max(RELATIONSHIP_TYPES.length)
      .optional(),
    statuses: z
      .array(z.enum(RELATIONSHIP_STATUSES))
      .max(RELATIONSHIP_STATUSES.length)
      .optional(),
    disclosure: z
      .array(z.enum(RELATIONSHIP_DISCLOSURES))
      .max(RELATIONSHIP_DISCLOSURES.length)
      .optional(),
    arcId: z.string().trim().min(1).optional(),
    candidateGraphRevisionId: z.string().trim().min(1).optional(),
    includeCandidateActiveDiff: z.boolean().optional(),
    cursor: z
      .string()
      .regex(/^offset:[0-9]+$/)
      .optional(),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(LONG_FORM_MAX_GRAPH_PAGE_SIZE)
      .optional(),
    expectedRedactionPolicyFingerprint: z.string().trim().min(1).optional(),
    viewpointCharacterKey: z.string().trim().min(1).optional(),
  })
  .superRefine((query, context) => {
    if (query.episodeNumber !== undefined && query.episodeRange !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["episodeRange"],
        message: "episode_number_and_range_are_mutually_exclusive",
      });
    }
  });

export type RelationshipGraphView = {
  graphRevisionId: string;
  episodeNumber: number | null;
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  familyGroups: RelationshipGraphFamilyGroup[];
  nextCursor?: string;
  pageSize: number;
  truncated: boolean;
  redacted: boolean;
  redactedEdgeCount: number;
  redactedEvidenceCount: number;
  redactionPolicyVersion: string;
  redactionPolicyFingerprint: string;
  candidateActiveDiff?: {
    candidateGraphRevisionId: string;
    addedCount: number;
    changedCount: number;
    removedCount: number;
    affectedEpisodeNumbers: number[];
  };
  findingIds: string[];
};

type GraphQueryOptions = {
  candidateGraph?: CharacterRelationshipGraph;
  canViewSecretEdges?: boolean;
  redactionPolicyVersion?: string;
  redactionPolicyFingerprint?: string;
  viewpointCharacterKey?: string;
};

function edgeMatchesQuery(
  edge: RelationshipGraphEdge,
  query: RelationshipGraphQuery
): boolean {
  const episode = query.episodeNumber;
  const inRange =
    episode === undefined
      ? query.episodeRange === undefined ||
        ((edge.validToEpisode === null ||
          edge.validToEpisode >= query.episodeRange.startEpisode) &&
          edge.validFromEpisode <= query.episodeRange.endEpisode)
      : edge.validFromEpisode <= episode &&
        (edge.validToEpisode === null || edge.validToEpisode >= episode);
  return (
    inRange &&
    (!query.familySide || edge.familySide === query.familySide) &&
    (!query.familyGroupId || edge.familyGroupId === query.familyGroupId) &&
    (!query.factionId || edge.factionId === query.factionId) &&
    (!query.relationTypes?.length ||
      query.relationTypes.includes(edge.relationType)) &&
    (!query.statuses?.length || query.statuses.includes(edge.status)) &&
    (!query.disclosure?.length || query.disclosure.includes(edge.disclosure)) &&
    (!query.arcId || edge.arcId === query.arcId)
  );
}

function edgeIsVisible(
  edge: RelationshipGraphEdge,
  options: Pick<
    GraphQueryOptions,
    "canViewSecretEdges" | "viewpointCharacterKey"
  >
): boolean {
  if (edge.disclosure === "secret") return options.canViewSecretEdges === true;
  if (edge.disclosure === "known_to_some") {
    return (
      options.canViewSecretEdges === true ||
      Boolean(
        options.viewpointCharacterKey &&
        edge.knownByCharacterKeys?.includes(options.viewpointCharacterKey)
      )
    );
  }
  return true;
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const parsed = Number(cursor.replace(/^offset:/, ""));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function encodeCursor(offset: number): string {
  return `offset:${offset}`;
}

export function queryRelationshipGraph(
  graph: CharacterRelationshipGraph,
  query: RelationshipGraphQuery,
  options: GraphQueryOptions = {}
): RelationshipGraphView {
  if (query.graphRevisionId !== graph.graphRevisionId)
    throw new Error("stale_graph_revision");
  const policyVersion =
    options.redactionPolicyVersion ?? "relationship-redaction-v1";
  const policyFingerprint =
    options.redactionPolicyFingerprint ?? "relationship-redaction-default";
  if (
    query.expectedRedactionPolicyFingerprint &&
    query.expectedRedactionPolicyFingerprint !== policyFingerprint
  ) {
    throw new Error("stale_redaction_policy");
  }
  const canViewSecretEdges = options.canViewSecretEdges ?? false;
  const matching = graph.edges.filter(edge => edgeMatchesQuery(edge, query));
  const visible = matching.filter(edge =>
    edgeIsVisible(edge, {
      canViewSecretEdges,
      viewpointCharacterKey:
        options.viewpointCharacterKey ?? query.viewpointCharacterKey,
    })
  );
  const redactedEdges = matching.length - visible.length;
  const pageSize = Math.min(
    Math.max(query.pageSize ?? LONG_FORM_DEFAULT_GRAPH_PAGE_SIZE, 1),
    LONG_FORM_MAX_GRAPH_PAGE_SIZE
  );
  const offset = parseCursor(query.cursor);
  const page = visible.slice(offset, offset + pageSize);
  const truncated = offset + page.length < visible.length;
  const visibleNodeKeys = new Set(
    page.flatMap(edge => [edge.fromCharacterKey, edge.toCharacterKey])
  );
  const nodes = graph.nodes.filter(node =>
    visibleNodeKeys.has(node.characterKey)
  );
  const familyGroups = graph.familyGroups.filter(group =>
    group.memberCharacterKeys.some(key => visibleNodeKeys.has(key))
  );
  const candidate = options.candidateGraph;
  const candidateActiveDiff =
    query.includeCandidateActiveDiff &&
    candidate &&
    query.candidateGraphRevisionId === candidate.graphRevisionId
      ? buildCandidateActiveDiff(graph, candidate)
      : undefined;
  return {
    graphRevisionId: graph.graphRevisionId,
    episodeNumber: query.episodeNumber ?? null,
    nodes,
    edges: page,
    familyGroups,
    ...(truncated ? { nextCursor: encodeCursor(offset + page.length) } : {}),
    pageSize,
    truncated,
    redacted: redactedEdges > 0,
    redactedEdgeCount: redactedEdges,
    redactedEvidenceCount: matching
      .filter(edge => !visible.includes(edge))
      .reduce((sum, edge) => sum + edge.evidenceIds.length, 0),
    redactionPolicyVersion: policyVersion,
    redactionPolicyFingerprint: policyFingerprint,
    candidateActiveDiff,
    findingIds: redactedEdges > 0 ? ["relationship-edge-redacted"] : [],
  };
}

function buildCandidateActiveDiff(
  active: CharacterRelationshipGraph,
  candidate: CharacterRelationshipGraph
): NonNullable<RelationshipGraphView["candidateActiveDiff"]> {
  const activeById = new Map(active.edges.map(edge => [edge.edgeId, edge]));
  const candidateById = new Map(
    candidate.edges.map(edge => [edge.edgeId, edge])
  );
  let addedCount = 0;
  let changedCount = 0;
  let removedCount = 0;
  const affectedEpisodeNumbers = new Set<number>();
  for (const [id, edge] of candidateById) {
    const prior = activeById.get(id);
    if (!prior) addedCount++;
    else if (canonicalJsonStringify(prior) !== canonicalJsonStringify(edge))
      changedCount++;
    affectedEpisodeNumbers.add(edge.validFromEpisode);
  }
  for (const [id, edge] of activeById) {
    if (!candidateById.has(id)) {
      removedCount++;
      affectedEpisodeNumbers.add(edge.validFromEpisode);
    }
  }
  return {
    candidateGraphRevisionId: candidate.graphRevisionId,
    addedCount,
    changedCount,
    removedCount,
    affectedEpisodeNumbers: [...affectedEpisodeNumbers].sort((a, b) => a - b),
  };
}

export function validateRelationshipGraph(
  graph: CharacterRelationshipGraph
): string[] {
  const errors: string[] = [];
  const nodeKeys = new Set(graph.nodes.map(node => node.characterKey));
  const edgeIds = new Set<string>();
  const parentAdjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.edgeId)) errors.push("duplicate_edge_id");
    edgeIds.add(edge.edgeId);
    if (edge.fromCharacterKey === edge.toCharacterKey) errors.push("self_edge");
    if (
      !nodeKeys.has(edge.fromCharacterKey) ||
      !nodeKeys.has(edge.toCharacterKey)
    )
      errors.push("unknown_character");
    if (
      edge.validToEpisode !== null &&
      edge.validToEpisode < edge.validFromEpisode
    )
      errors.push("invalid_timeline");
    if (edge.provenance === "derived" && edge.sourceEdgeIds.length === 0)
      errors.push("derived_edge_without_source");
    if (edge.relationType === "parent")
      parentAdjacency.set(edge.fromCharacterKey, [
        ...(parentAdjacency.get(edge.fromCharacterKey) ?? []),
        edge.toCharacterKey,
      ]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of parentAdjacency.get(node) ?? [])
      if (visit(child)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  for (const node of nodeKeys) if (visit(node)) errors.push("parent_cycle");
  return [...new Set(errors)];
}

export type RelationshipPathCandidate = {
  relationKind: "direct" | "derived";
  characterKeys: string[];
  sourceEdgeIds: string[];
  familySide: FamilySide;
  validFromEpisode: number;
  validToEpisode: number | null;
  disclosures: RelationshipDisclosure[];
  evidenceIds: string[];
};

export type RelationshipPathResult = {
  kind: "direct" | "derived" | "multiple" | "ambiguous" | "no_path";
  paths: RelationshipPathCandidate[];
  truncated: boolean;
  maxHops: number;
  maxPaths: number;
  redacted: boolean;
  redactionPolicyVersion: string;
  redactionPolicyFingerprint: string;
};

export function findRelationshipPaths(
  graph: CharacterRelationshipGraph,
  fromCharacterKey: string,
  toCharacterKey: string,
  options: {
    maxHops?: number;
    maxPaths?: number;
    episodeNumber?: number;
    canViewSecretEdges?: boolean;
    viewpointCharacterKey?: string;
    redactionPolicyVersion?: string;
    redactionPolicyFingerprint?: string;
  } = {}
): RelationshipPathResult {
  const maxHops = Math.min(Math.max(options.maxHops ?? 6, 1), 6);
  const maxPaths = Math.min(Math.max(options.maxPaths ?? 3, 1), 3);
  const usable = graph.edges.filter(
    edge =>
      edgeIsVisible(edge, options) &&
      (options.episodeNumber === undefined ||
        edgeMatchesQuery(edge, {
          graphRevisionId: graph.graphRevisionId,
          episodeNumber: options.episodeNumber,
        }))
  );
  const adjacency = new Map<string, RelationshipGraphEdge[]>();
  for (const edge of usable)
    adjacency.set(edge.fromCharacterKey, [
      ...(adjacency.get(edge.fromCharacterKey) ?? []),
      edge,
    ]);
  const found: RelationshipPathCandidate[] = [];
  const walk = (
    current: string,
    chars: string[],
    edges: RelationshipGraphEdge[]
  ) => {
    if (found.length > maxPaths || edges.length >= maxHops) return;
    if (current === toCharacterKey && edges.length > 0) {
      found.push({
        relationKind: edges.some(edge => edge.provenance === "derived")
          ? "derived"
          : edges.length === 1
            ? "direct"
            : "derived",
        characterKeys: chars,
        sourceEdgeIds: edges.flatMap(edge => [
          edge.edgeId,
          ...edge.sourceEdgeIds,
        ]),
        familySide:
          edges.find(edge => edge.familySide !== "none")?.familySide ?? "none",
        validFromEpisode: Math.min(...edges.map(edge => edge.validFromEpisode)),
        validToEpisode: edges.some(edge => edge.validToEpisode === null)
          ? null
          : Math.max(...edges.map(edge => edge.validToEpisode as number)),
        disclosures: [...new Set(edges.map(edge => edge.disclosure))],
        evidenceIds: [...new Set(edges.flatMap(edge => edge.evidenceIds))],
      });
      return;
    }
    for (const edge of adjacency.get(current) ?? []) {
      if (chars.includes(edge.toCharacterKey)) continue;
      walk(
        edge.toCharacterKey,
        [...chars, edge.toCharacterKey],
        [...edges, edge]
      );
    }
  };
  walk(fromCharacterKey, [fromCharacterKey], []);
  const truncated = found.length > maxPaths;
  const paths = found.slice(0, maxPaths);
  const kind =
    paths.length === 0
      ? "no_path"
      : paths.length === 1
        ? paths[0].relationKind
        : truncated
          ? "ambiguous"
          : "multiple";
  return {
    kind,
    paths,
    truncated,
    maxHops,
    maxPaths,
    redacted: usable.length < graph.edges.length,
    redactionPolicyVersion:
      options.redactionPolicyVersion ?? "relationship-redaction-v1",
    redactionPolicyFingerprint:
      options.redactionPolicyFingerprint ?? "relationship-redaction-default",
  };
}

export type CastAdmissionInput = {
  characterKey: string;
  entryEpisode: number;
  role: "core" | "recurring" | "arc" | "faction" | "guest";
  hasSeed: boolean;
  hasExitOrPayoff: boolean;
  hardDeathEstablished?: boolean;
  worldRuleForReturn?: boolean;
};

export function validateCharacterAdmission(
  input: CastAdmissionInput
): string[] {
  const errors: string[] = [];
  if (input.role === "guest" && (!input.hasSeed || !input.hasExitOrPayoff))
    errors.push("guest_without_seed_or_payoff");
  if (input.hardDeathEstablished && !input.worldRuleForReturn)
    errors.push("hard_dead_return_without_world_rule");
  if (!input.characterKey || input.entryEpisode < 1)
    errors.push("invalid_character_identity");
  return errors;
}

export type CapabilityResolution = {
  status: "supported" | "fallback" | "unavailable" | "blocked";
  fallbackTag?: string;
};
export function resolveCapability(
  tag: string,
  policy: { supported: boolean; fallback?: string; blocked?: boolean }
): CapabilityResolution {
  if (policy.blocked) return { status: "blocked" };
  if (policy.supported) return { status: "supported" };
  if (policy.fallback)
    return { status: "fallback", fallbackTag: policy.fallback };
  return { status: "unavailable" };
}

export type LookCueInput = {
  lookId: string;
  characterKey: string;
  episodeNumber: number;
  cueType?: "event" | "location" | "weather" | "time" | "role" | "continuity";
  cueText?: string;
};

export function validateLookCue(input: LookCueInput): string[] {
  const errors: string[] = [];
  if (!input.lookId || !input.characterKey || input.episodeNumber < 1)
    errors.push("invalid_look_identity");
  if (!input.cueType || !input.cueText?.trim())
    errors.push("missing_story_cue");
  return errors;
}
