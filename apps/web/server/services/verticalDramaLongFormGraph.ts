import {
  buildLongFormId,
  fingerprintLongFormPolicy,
  relationshipGraphDeltaSchema,
  type CharacterRelationshipGraph,
  type RelationshipGraphDelta,
  type RelationshipGraphEdge,
  type RelationshipGraphNode,
} from "@shared/verticalDramaSeries/longFormContracts";

type RelationshipChangeLike = {
  pair?: unknown;
  status?: unknown;
  disclosure?: unknown;
  knownBy?: unknown;
};

type EpisodeMemoryLike = {
  episodeNumber?: unknown;
  relationshipChanges?: unknown;
  relationshipGraphDeltas?: unknown;
};

/**
 * Makes the strict long-form contract explicit for the only safe omission:
 * an episode that has no relationship state to apply. This intentionally does
 * not synthesize typed deltas from legacy relationshipChanges; those entries
 * need a real edge id, evidence, and affected-character provenance.
 */
export function normalizeStrictRelationshipGraphDeltas<T extends object>(
  draftedItems: readonly T[]
): T[] {
  return draftedItems.map(item => {
    if (!item || typeof item !== "object") return item;
    const candidate = item as T & {
      episodeMemory?: EpisodeMemoryLike;
    };
    const memory = candidate.episodeMemory;
    if (!memory || typeof memory !== "object") return item;
    if (Array.isArray(memory.relationshipGraphDeltas)) return item;
    if (
      Array.isArray(memory.relationshipChanges) &&
      memory.relationshipChanges.length > 0
    ) {
      return item;
    }
    return {
      ...item,
      episodeMemory: {
        ...memory,
        relationshipGraphDeltas: [],
      },
    } as T;
  });
}

export type CompatibilityRelationshipGraphMaterialization = {
  graph: CharacterRelationshipGraph;
  readiness: "compatibility_backfill";
  dependencyIndexFingerprint: string;
  redactionPolicyVersion: string;
  redactionPolicyFingerprint: string;
};

const RELATIONSHIP_REDACTION_POLICY_VERSION = "relationship-redaction-v1";
const RELATIONSHIP_REDACTION_POLICY_FINGERPRINT =
  "relationship-redaction-default";

/**
 * Projects the existing structured episode-memory relationship states into
 * the Feature 153 graph. This is deliberately marked `legacy_derived`: it
 * never treats prose as an authoritative edge, and a later authored/user
 * graph revision can replace it without silently overwriting user edits.
 */
export function materializeCompatibilityRelationshipGraph(input: {
  seriesId: number;
  characterKeys: readonly string[];
  episodeMemories: readonly unknown[];
}): CompatibilityRelationshipGraphMaterialization {
  const nodeKeys = new Set(
    input.characterKeys.map(normalizeKey).filter(Boolean)
  );
  const rawEdges: RelationshipGraphEdge[] = [];
  const strictEdgeIdOccurrences = new Map<string, number>();
  for (const rawMemory of input.episodeMemories) {
    const memory = asEpisodeMemory(rawMemory);
    if (!memory) continue;
    const episodeNumber = memory.episodeNumber;
    const graphDeltas = asRelationshipGraphDeltas(
      memory.relationshipGraphDeltas
    );
    if (graphDeltas) {
      for (const delta of graphDeltas) {
        const fromCharacterKey = normalizeKey(delta.fromCharacterKey);
        const toCharacterKey = normalizeKey(delta.toCharacterKey);
        if (
          !fromCharacterKey ||
          !toCharacterKey ||
          fromCharacterKey === toCharacterKey
        )
          continue;
        nodeKeys.add(fromCharacterKey);
        nodeKeys.add(toCharacterKey);
        const occurrence = (strictEdgeIdOccurrences.get(delta.edgeId) ?? 0) + 1;
        strictEdgeIdOccurrences.set(delta.edgeId, occurrence);
        const materializedEdgeId =
          occurrence === 1
            ? delta.edgeId
            : buildLongFormId(
                "relationship-edge-segment",
                delta.edgeId,
                episodeNumber,
                occurrence
              );
        rawEdges.push({
          edgeId: materializedEdgeId,
          fromCharacterKey,
          toCharacterKey,
          relationType: delta.relationType,
          status:
            delta.operation === "end"
              ? "ended"
              : delta.operation === "retcon"
                ? "superseded"
                : "active",
          familySide: inferFamilySide(delta.relationType),
          disclosure:
            delta.disclosure === "private"
              ? "secret"
              : delta.disclosure === "misunderstood"
                ? "known_to_some"
                : delta.disclosure,
          beliefState: delta.beliefState,
          knownByCharacterKeys: delta.knownByCharacterKeys,
          validFromEpisode: delta.validFromEpisode,
          validToEpisode: delta.validToEpisode ?? null,
          sourceEdgeIds: [
            ...(occurrence > 1 ? [delta.edgeId] : []),
            ...(delta.supersedesRevisionId ? [delta.supersedesRevisionId] : []),
          ],
          evidenceIds: delta.evidenceRefs,
          provenance: "episode_fact",
        });
      }
      continue;
    }
    for (const rawChange of Array.isArray(memory.relationshipChanges)
      ? memory.relationshipChanges
      : []) {
      const change = asRelationshipChange(rawChange);
      if (!change) continue;
      const fromCharacterKey = normalizeKey(change.pair[0]);
      const toCharacterKey = normalizeKey(change.pair[1]);
      if (
        !fromCharacterKey ||
        !toCharacterKey ||
        fromCharacterKey === toCharacterKey
      )
        continue;
      nodeKeys.add(fromCharacterKey);
      nodeKeys.add(toCharacterKey);
      const relationType = inferRelationshipType(String(change.status ?? ""));
      rawEdges.push({
        edgeId: buildLongFormId(
          "legacy-edge",
          String(input.seriesId),
          episodeNumber,
          fromCharacterKey,
          toCharacterKey,
          relationType
        ),
        fromCharacterKey,
        toCharacterKey,
        relationType,
        status: inferRelationshipStatus(String(change.status ?? "")),
        familySide: inferFamilySide(String(change.status ?? "")),
        disclosure: isDisclosure(change.disclosure)
          ? change.disclosure
          : "undeclared",
        knownByCharacterKeys: asStringArray(change.knownBy),
        validFromEpisode: episodeNumber,
        validToEpisode: null,
        sourceEdgeIds: [],
        evidenceIds: [`episode-memory:${episodeNumber}`],
        provenance: "legacy_derived",
      });
    }
  }

  const edges = closeRepeatedEdges(rawEdges);
  const nodes: RelationshipGraphNode[] = [...nodeKeys]
    .sort()
    .map(characterKey => ({ characterKey }));
  const graphBody = { nodes, edges, familyGroups: [] };
  const fingerprint = fingerprintLongFormPolicy(graphBody);
  const graph: CharacterRelationshipGraph = {
    graphRevisionId: buildLongFormId(
      "relationship-graph",
      String(input.seriesId),
      fingerprint
    ),
    fingerprint,
    ...graphBody,
  };

  return {
    graph,
    readiness: "compatibility_backfill",
    dependencyIndexFingerprint: fingerprintLongFormPolicy(
      edges.map(edge => ({
        edgeId: edge.edgeId,
        evidenceIds: edge.evidenceIds,
      }))
    ),
    redactionPolicyVersion: RELATIONSHIP_REDACTION_POLICY_VERSION,
    redactionPolicyFingerprint: RELATIONSHIP_REDACTION_POLICY_FINGERPRINT,
  };
}

export function attachRelationshipGraphToBible(
  bible: Record<string, unknown>,
  materialization: CompatibilityRelationshipGraphMaterialization
): Record<string, unknown> {
  const currentLongForm =
    bible.longForm && typeof bible.longForm === "object"
      ? (bible.longForm as Record<string, unknown>)
      : {};
  // An authored or user-edited graph is authoritative. Compatibility
  // backfill may never silently replace it during a later draft run.
  if (
    currentLongForm.relationshipGraph &&
    currentLongForm.relationshipGraphReadiness !== "compatibility_backfill"
  ) {
    return bible;
  }
  return {
    ...bible,
    longForm: {
      ...currentLongForm,
      relationshipGraph: materialization.graph,
      relationshipGraphRevisionId: materialization.graph.graphRevisionId,
      relationshipGraphFingerprint: materialization.graph.fingerprint,
      relationshipGraphReadiness: materialization.readiness,
      relationshipDependencyIndexFingerprint:
        materialization.dependencyIndexFingerprint,
      relationshipRedactionPolicyVersion:
        materialization.redactionPolicyVersion,
      relationshipRedactionPolicyFingerprint:
        materialization.redactionPolicyFingerprint,
    },
  };
}

function asEpisodeMemory(value: unknown): {
  episodeNumber: number;
  relationshipChanges: unknown[];
  relationshipGraphDeltas?: unknown;
} | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as EpisodeMemoryLike;
  return Number.isInteger(candidate.episodeNumber) &&
    Number(candidate.episodeNumber) > 0
    ? {
        episodeNumber: Number(candidate.episodeNumber),
        relationshipChanges: Array.isArray(candidate.relationshipChanges)
          ? candidate.relationshipChanges
          : [],
        relationshipGraphDeltas: candidate.relationshipGraphDeltas,
      }
    : null;
}

function asRelationshipGraphDeltas(
  value: unknown
): RelationshipGraphDelta[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(item =>
    relationshipGraphDeltaSchema.safeParse(item)
  );
  if (parsed.some(result => !result.success)) return null;
  return parsed.map(result => result.data as RelationshipGraphDelta);
}

function asRelationshipChange(value: unknown): {
  pair: [string, string];
  status: unknown;
  disclosure: unknown;
  knownBy: unknown;
} | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as RelationshipChangeLike;
  if (!Array.isArray(candidate.pair) || candidate.pair.length !== 2)
    return null;
  if (
    typeof candidate.pair[0] !== "string" ||
    typeof candidate.pair[1] !== "string"
  )
    return null;
  return {
    pair: [candidate.pair[0], candidate.pair[1]],
    status: candidate.status,
    disclosure: candidate.disclosure,
    knownBy: candidate.knownBy,
  };
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .filter((item): item is string => typeof item === "string")
    .map(normalizeKey)
    .filter(Boolean);
  return result.length ? result : undefined;
}

function isDisclosure(
  value: unknown
): value is RelationshipGraphEdge["disclosure"] {
  return (
    value === "secret" ||
    value === "known_to_some" ||
    value === "public" ||
    value === "undeclared"
  );
}

function inferRelationshipType(
  status: string
): RelationshipGraphEdge["relationType"] {
  const value = status.toLocaleLowerCase();
  if (/spouse|married|husband|wife|สามี|ภรรยา|แต่งงาน/.test(value))
    return "spouse";
  if (/fiance|engaged|คู่หมั้น/.test(value)) return "fiance";
  if (/parent|mother|father|แม่|พ่อ|บุตร|ลูก/.test(value)) return "parent";
  if (/sibling|brother|sister|พี่|น้อง/.test(value)) return "sibling";
  if (/enemy|ศัตรู/.test(value)) return "enemy";
  if (/rival|คู่แข่ง/.test(value)) return "rival";
  if (/friend|เพื่อน/.test(value)) return "friend";
  return "knows";
}

function inferRelationshipStatus(
  status: string
): RelationshipGraphEdge["status"] {
  const value = status.toLocaleLowerCase();
  if (/candidate|pending|สงสัย/.test(value)) return "candidate";
  if (/disputed|ขัดแย้ง|ไม่แน่/.test(value)) return "disputed";
  if (/ended|เลิก|สิ้นสุด/.test(value)) return "ended";
  if (/superseded|แทนที่/.test(value)) return "superseded";
  return "active";
}

function inferFamilySide(status: string): RelationshipGraphEdge["familySide"] {
  const value = status.toLocaleLowerCase();
  if (/maternal|ฝ่ายแม่|แม่/.test(value)) return "maternal";
  if (/paternal|ฝ่ายพ่อ|พ่อ/.test(value)) return "paternal";
  if (/in.?law|เขย|สะใภ้|น้องเมีย/.test(value)) return "in_law";
  return "none";
}

function closeRepeatedEdges(
  edges: readonly RelationshipGraphEdge[]
): RelationshipGraphEdge[] {
  const ordered = [...edges].sort(
    (a, b) =>
      a.validFromEpisode - b.validFromEpisode ||
      a.edgeId.localeCompare(b.edgeId)
  );
  const lastByPair = new Map<string, RelationshipGraphEdge>();
  for (const edge of ordered) {
    const key = `${edge.fromCharacterKey}|${edge.toCharacterKey}|${edge.relationType}`;
    const previous = lastByPair.get(key);
    if (previous && previous.validFromEpisode < edge.validFromEpisode)
      previous.validToEpisode = edge.validFromEpisode - 1;
    lastByPair.set(key, edge);
  }
  return ordered;
}
