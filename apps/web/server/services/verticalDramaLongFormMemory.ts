import {
  canonicalJsonStringify,
  sha256Hex,
} from "@shared/verticalDramaSeries/artifacts";
import {
  queryRelationshipGraph,
  type CharacterRelationshipGraph,
  type RelationshipGraphQuery,
  type RelationshipGraphView,
  type RelationshipGraphEdge,
} from "@shared/verticalDramaSeries/longFormContracts";

export type LongFormRelationshipDelta = {
  deltaId: string;
  graphRevisionId: string;
  episodeNumber: number;
  add: RelationshipGraphEdge[];
  update: RelationshipGraphEdge[];
  revealEdgeIds: string[];
  endEdgeIds: string[];
  retconEdgeIds: string[];
  evidenceIds: string[];
};

export type LongFormReverseDependencyIndex = {
  graphRevisionId: string;
  fingerprint: string;
  entries: Record<
    string,
    {
      episodeNumbers: number[];
      shotIds: string[];
      dialogueIds: string[];
      memoryEventIds: string[];
      recapEpisodeNumbers: number[];
      lookIds: string[];
      worldRuleIds: string[];
    }
  >;
};

export type LongFormRetrievalPack = {
  graphRevisionId: string;
  graphFingerprint: string;
  relationshipRedactionPolicyVersion: string;
  relationshipRedactionPolicyFingerprint: string;
  episodeNumber: number;
  canonicalFacts: string[];
  openThreadIds: string[];
  knownByCharacterKeys: string[];
  relationshipGraph: RelationshipGraphView;
  omittedPaths: string[];
  fingerprint: string;
};

export function buildReverseDependencyIndex(
  graphRevisionId: string,
  edges: readonly RelationshipGraphEdge[],
  dependencies: Record<
    string,
    Partial<LongFormReverseDependencyIndex["entries"][string]>
  > = {}
): LongFormReverseDependencyIndex {
  const entries: LongFormReverseDependencyIndex["entries"] = {};
  for (const edge of edges) {
    entries[edge.edgeId] = {
      episodeNumbers: [
        edge.validFromEpisode,
        ...(edge.validToEpisode ? [edge.validToEpisode] : []),
      ],
      shotIds: [],
      dialogueIds: [],
      memoryEventIds: [],
      recapEpisodeNumbers: [],
      lookIds: [],
      worldRuleIds: [],
      ...dependencies[edge.edgeId],
    };
  }
  return {
    graphRevisionId,
    entries,
    fingerprint: sha256Hex(canonicalJsonStringify(entries)),
  };
}

export function buildLongFormRetrievalPack(input: {
  graph: CharacterRelationshipGraph;
  graphQuery: RelationshipGraphQuery;
  canonicalFacts: string[];
  openThreadIds: string[];
  knownByCharacterKeys: string[];
  permittedFactEpisodes?: number[];
  canViewSecretEdges?: boolean;
  redactionPolicyVersion?: string;
  redactionPolicyFingerprint?: string;
  candidateGraph?: CharacterRelationshipGraph;
}): LongFormRetrievalPack {
  const omittedPaths: string[] = [];
  // Canonical facts are already episode-scoped by the caller. Never infer an
  // episode from array position: compaction/reordering would otherwise attach
  // a fact to the wrong episode. `permittedFactEpisodes` is an admission gate
  // for the requested pack, not an index map for the facts array.
  const requestedEpisode = input.graphQuery.episodeNumber ?? 1;
  const allowedEpisodes = new Set(
    input.permittedFactEpisodes ?? [requestedEpisode]
  );
  const facts = allowedEpisodes.has(requestedEpisode)
    ? [...input.canonicalFacts]
    : [];
  if (facts.length !== input.canonicalFacts.length)
    omittedPaths.push("canonicalFacts");
  const relationshipGraph = queryRelationshipGraph(
    input.graph,
    input.graphQuery,
    {
      candidateGraph: input.candidateGraph,
      canViewSecretEdges: input.canViewSecretEdges,
      redactionPolicyVersion: input.redactionPolicyVersion,
      redactionPolicyFingerprint: input.redactionPolicyFingerprint,
    }
  );
  if (relationshipGraph.redacted)
    omittedPaths.push("relationshipGraph.secretEdges");
  const packWithoutFingerprint = {
    graphRevisionId: input.graph.graphRevisionId,
    graphFingerprint: input.graph.fingerprint,
    relationshipRedactionPolicyVersion:
      relationshipGraph.redactionPolicyVersion,
    relationshipRedactionPolicyFingerprint:
      relationshipGraph.redactionPolicyFingerprint,
    episodeNumber: input.graphQuery.episodeNumber ?? 1,
    canonicalFacts: facts,
    openThreadIds: [...input.openThreadIds],
    knownByCharacterKeys: [...input.knownByCharacterKeys],
    relationshipGraph,
    omittedPaths,
  } satisfies Omit<LongFormRetrievalPack, "fingerprint">;
  return {
    ...packWithoutFingerprint,
    fingerprint: sha256Hex(canonicalJsonStringify(packWithoutFingerprint)),
  };
}

export function validateCompactedMemorySnapshot(input: {
  requiredTruthIds: readonly string[];
  retainedTruthIds: readonly string[];
  preFingerprint: string;
  postFingerprint: string;
}): { status: "ready" | "needs_repair"; missingTruthIds: string[] } {
  const retained = new Set(input.retainedTruthIds);
  const missingTruthIds = input.requiredTruthIds.filter(
    id => !retained.has(id)
  );
  return {
    status:
      missingTruthIds.length || input.preFingerprint !== input.postFingerprint
        ? "needs_repair"
        : "ready",
    missingTruthIds,
  };
}

export function calculateRepairImpact(
  index: LongFormReverseDependencyIndex,
  edgeIds: readonly string[]
): {
  edgeIds: string[];
  episodeNumbers: number[];
  shotIds: string[];
  dialogueIds: string[];
  recapEpisodeNumbers: number[];
} {
  const affected = edgeIds.map(edgeId => index.entries[edgeId]).filter(Boolean);
  return {
    edgeIds: [...edgeIds],
    episodeNumbers: [
      ...new Set(affected.flatMap(item => item.episodeNumbers)),
    ].sort((a, b) => a - b),
    shotIds: [...new Set(affected.flatMap(item => item.shotIds))],
    dialogueIds: [...new Set(affected.flatMap(item => item.dialogueIds))],
    recapEpisodeNumbers: [
      ...new Set(affected.flatMap(item => item.recapEpisodeNumbers)),
    ].sort((a, b) => a - b),
  };
}
