export const AGENCY_DEFAULT_ENGINE = "agency_swarm" as const;
export const AGENCY_HYBRID_ENGINE = "adk2" as const;
export const AGENCY_DEFAULT_COMPILE_MODE = "legacy_agency" as const;
export const AGENCY_STRICT_COMPILE_MODE = "strict" as const;
export const AGENCY_DEFAULT_COMPATIBILITY_MODE = "preserve_agency_swarm" as const;
export const AGENCY_DEFAULT_TRACE_LEVEL = "standard" as const;

export type AgencyWorkflowEngine =
  | typeof AGENCY_DEFAULT_ENGINE
  | typeof AGENCY_HYBRID_ENGINE;

export type AgencyCompileMode =
  | typeof AGENCY_DEFAULT_COMPILE_MODE
  | typeof AGENCY_STRICT_COMPILE_MODE
  | "assist";

export type AgencyCompatibilityMode =
  | typeof AGENCY_DEFAULT_COMPATIBILITY_MODE
  | "hybrid";

export interface AgencyBuilderNodeDocument {
  id?: string;
  name: string;
  description?: string;
  instructions?: string;
  model?: string | null;
  modelSettings?: Record<string, unknown> | null;
  isEntryPoint?: boolean;
  isOptional?: boolean;
  position?: { x: number; y: number } | null;
  nodeType?: string;
  nodeConfig?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  examples?: Array<Array<{ role: "user" | "assistant"; content: string }>>;
  toolIds?: string[];
  toolConfigs?: Record<string, Record<string, unknown>>;
  parallelToolCalls?: boolean;
  maxTurns?: number;
  subgraphId?: string | null;
  engineHint?: AgencyWorkflowEngine | null;
  runtimeConfig?: Record<string, unknown> | null;
}

export interface AgencyBuilderEdgeDocument {
  fromAgentName: string;
  toAgentName: string;
  flowType?: string;
  flowConfig?: Record<string, unknown> | null;
}

export interface AgencySubgraphDocument {
  id: string;
  name: string;
  engine: AgencyWorkflowEngine;
  entryNodeIds: string[];
  exitNodeIds: string[];
  nodeIds: string[];
  boundaryPolicy: Record<string, unknown> | null;
}

export interface AgencyBuilderDocumentSettings {
  compileMode: AgencyCompileMode;
  compatibilityMode: AgencyCompatibilityMode;
  traceLevel: string;
}

export interface AgencyBuilderDocument {
  documentVersion: number;
  name: string;
  defaultEngine: AgencyWorkflowEngine;
  nodes: AgencyBuilderNodeDocument[];
  edges: AgencyBuilderEdgeDocument[];
  subgraphs: AgencySubgraphDocument[];
  settings: AgencyBuilderDocumentSettings;
}

export interface LegacyAgencyVersionSnapshot {
  name: string;
  nodes: AgencyBuilderNodeDocument[];
  edges: AgencyBuilderEdgeDocument[];
}

export interface AgencyBuilderDocumentSnapshotV2 extends AgencyBuilderDocument {}

export type AgencyVersionSnapshot =
  | LegacyAgencyVersionSnapshot
  | AgencyBuilderDocumentSnapshotV2;

interface BuildDocumentFromRowsInput {
  agency: {
    name?: string | null;
    documentVersion?: number | null;
    defaultEngine?: string | null;
    compileMode?: string | null;
    compatibilityMode?: string | null;
  };
  nodes: AgencyBuilderNodeDocument[];
  edges: AgencyBuilderEdgeDocument[];
  subgraphs?: Array<Partial<AgencySubgraphDocument>> | null;
}

const ENGINE_SET = new Set<AgencyWorkflowEngine>([
  AGENCY_DEFAULT_ENGINE,
  AGENCY_HYBRID_ENGINE,
]);

const COMPILE_MODE_SET = new Set<AgencyCompileMode>([
  AGENCY_DEFAULT_COMPILE_MODE,
  AGENCY_STRICT_COMPILE_MODE,
  "assist",
]);

const COMPATIBILITY_MODE_SET = new Set<AgencyCompatibilityMode>([
  AGENCY_DEFAULT_COMPATIBILITY_MODE,
  "hybrid",
]);

function getNodeIdentity(node: AgencyBuilderNodeDocument): string {
  return typeof node.id === "string" && node.id.length > 0
    ? node.id
    : node.name;
}

function normalizeEngine(value: unknown): AgencyWorkflowEngine {
  return typeof value === "string" && ENGINE_SET.has(value as AgencyWorkflowEngine)
    ? value as AgencyWorkflowEngine
    : AGENCY_DEFAULT_ENGINE;
}

function normalizeCompileMode(
  value: unknown,
  documentVersion: number,
): AgencyCompileMode {
  if (typeof value === "string" && COMPILE_MODE_SET.has(value as AgencyCompileMode)) {
    return value as AgencyCompileMode;
  }
  return documentVersion >= 2
    ? AGENCY_STRICT_COMPILE_MODE
    : AGENCY_DEFAULT_COMPILE_MODE;
}

function normalizeCompatibilityMode(value: unknown): AgencyCompatibilityMode {
  return typeof value === "string" && COMPATIBILITY_MODE_SET.has(value as AgencyCompatibilityMode)
    ? value as AgencyCompatibilityMode
    : AGENCY_DEFAULT_COMPATIBILITY_MODE;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function computeEntryNodeIds(nodes: AgencyBuilderNodeDocument[]): string[] {
  const explicit = nodes.filter((node) => node.isEntryPoint).map(getNodeIdentity);
  if (explicit.length > 0) return explicit;
  return nodes[0] ? [getNodeIdentity(nodes[0])] : [];
}

function computeExitNodeIds(
  nodes: AgencyBuilderNodeDocument[],
  edges: AgencyBuilderEdgeDocument[],
): string[] {
  const outgoing = new Set(edges.map((edge) => edge.fromAgentName));
  const exitIds = nodes
    .filter((node) => !outgoing.has(node.name))
    .map(getNodeIdentity);
  if (exitIds.length > 0) return exitIds;
  return nodes[nodes.length - 1] ? [getNodeIdentity(nodes[nodes.length - 1])] : [];
}

function synthesizeRootSubgraph(
  nodes: AgencyBuilderNodeDocument[],
  edges: AgencyBuilderEdgeDocument[],
  defaultEngine: AgencyWorkflowEngine,
): AgencySubgraphDocument {
  return {
    id: "sg_root_legacy",
    name: "Legacy Agency Root",
    engine: defaultEngine,
    entryNodeIds: computeEntryNodeIds(nodes),
    exitNodeIds: computeExitNodeIds(nodes, edges),
    nodeIds: nodes.map(getNodeIdentity),
    boundaryPolicy: null,
  };
}

function normalizeSubgraphs(
  nodes: AgencyBuilderNodeDocument[],
  edges: AgencyBuilderEdgeDocument[],
  defaultEngine: AgencyWorkflowEngine,
  subgraphs?: Array<Partial<AgencySubgraphDocument>> | null,
): AgencySubgraphDocument[] {
  if (!Array.isArray(subgraphs) || subgraphs.length === 0) {
    return [synthesizeRootSubgraph(nodes, edges, defaultEngine)];
  }

  const normalized = subgraphs
    .map((subgraph) => {
      const id = typeof subgraph.id === "string" && subgraph.id.length > 0
        ? subgraph.id
        : null;
      if (!id) return null;

      return {
        id,
        name: typeof subgraph.name === "string" && subgraph.name.length > 0
          ? subgraph.name
          : id,
        engine: normalizeEngine(subgraph.engine),
        entryNodeIds: normalizeStringArray(subgraph.entryNodeIds),
        exitNodeIds: normalizeStringArray(subgraph.exitNodeIds),
        nodeIds: normalizeStringArray(subgraph.nodeIds),
        boundaryPolicy: (subgraph.boundaryPolicy as Record<string, unknown> | null | undefined) ?? null,
      } satisfies AgencySubgraphDocument;
    })
    .filter((subgraph): subgraph is AgencySubgraphDocument => subgraph !== null);

  return normalized.length > 0
    ? normalized
    : [synthesizeRootSubgraph(nodes, edges, defaultEngine)];
}

function isDocumentV2Shape(snapshot: unknown): snapshot is Partial<AgencyBuilderDocumentSnapshotV2> {
  if (!snapshot || typeof snapshot !== "object") return false;
  return "documentVersion" in snapshot
    || "defaultEngine" in snapshot
    || "subgraphs" in snapshot
    || "settings" in snapshot;
}

export function remapAgencySubgraphs(
  subgraphs: AgencySubgraphDocument[],
  nodeIdMap: Record<string, string>,
): AgencySubgraphDocument[] {
  const remapIds = (ids: string[]) =>
    ids
      .map((id) => nodeIdMap[id] ?? id)
      .filter((id, index, array) => id.length > 0 && array.indexOf(id) === index);

  return subgraphs.map((subgraph) => ({
    ...subgraph,
    entryNodeIds: remapIds(subgraph.entryNodeIds),
    exitNodeIds: remapIds(subgraph.exitNodeIds),
    nodeIds: remapIds(subgraph.nodeIds),
  }));
}

export function normalizeAgencyDocumentSnapshot(
  snapshot: unknown,
  fallbackName: string,
): AgencyBuilderDocument {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      documentVersion: 1,
      name: fallbackName,
      defaultEngine: AGENCY_DEFAULT_ENGINE,
      nodes: [],
      edges: [],
      subgraphs: [
        synthesizeRootSubgraph([], [], AGENCY_DEFAULT_ENGINE),
      ],
      settings: {
        compileMode: AGENCY_DEFAULT_COMPILE_MODE,
        compatibilityMode: AGENCY_DEFAULT_COMPATIBILITY_MODE,
        traceLevel: AGENCY_DEFAULT_TRACE_LEVEL,
      },
    };
  }

  const raw = snapshot as Partial<AgencyBuilderDocumentSnapshotV2> & LegacyAgencyVersionSnapshot;
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const edges = Array.isArray(raw.edges) ? raw.edges : [];
  const explicitVersion = typeof raw.documentVersion === "number" && Number.isFinite(raw.documentVersion)
    ? raw.documentVersion
    : 1;
  const documentVersion = isDocumentV2Shape(snapshot)
    ? Math.max(2, explicitVersion)
    : 1;
  const defaultEngine = normalizeEngine(raw.defaultEngine);

  return {
    documentVersion,
    name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : fallbackName,
    defaultEngine,
    nodes,
    edges,
    subgraphs: normalizeSubgraphs(nodes, edges, defaultEngine, raw.subgraphs),
    settings: {
      compileMode: normalizeCompileMode(raw.settings?.compileMode, documentVersion),
      compatibilityMode: normalizeCompatibilityMode(raw.settings?.compatibilityMode),
      traceLevel: typeof raw.settings?.traceLevel === "string" && raw.settings.traceLevel.length > 0
        ? raw.settings.traceLevel
        : AGENCY_DEFAULT_TRACE_LEVEL,
    },
  };
}

export function buildAgencyDocumentFromRows(
  input: BuildDocumentFromRowsInput,
): AgencyBuilderDocument {
  const hasHybridMetadata =
    Array.isArray(input.subgraphs) && input.subgraphs.length > 0
      ? true
      : input.nodes.some((node) => !!node.subgraphId || !!node.engineHint || !!node.runtimeConfig);
  const storedVersion = typeof input.agency.documentVersion === "number" && Number.isFinite(input.agency.documentVersion)
    ? input.agency.documentVersion
    : 1;
  const documentVersion = hasHybridMetadata
    ? Math.max(2, storedVersion)
    : storedVersion;
  const defaultEngine = normalizeEngine(input.agency.defaultEngine);

  return {
    documentVersion,
    name: input.agency.name?.trim() || "Untitled Agency",
    defaultEngine,
    nodes: input.nodes,
    edges: input.edges,
    subgraphs: normalizeSubgraphs(input.nodes, input.edges, defaultEngine, input.subgraphs),
    settings: {
      compileMode: normalizeCompileMode(input.agency.compileMode, documentVersion),
      compatibilityMode: normalizeCompatibilityMode(input.agency.compatibilityMode),
      traceLevel: AGENCY_DEFAULT_TRACE_LEVEL,
    },
  };
}

export function buildAgencyVersionSnapshot(
  document: AgencyBuilderDocument,
  options?: { persistAsDocumentV2?: boolean },
): AgencyVersionSnapshot {
  if (!options?.persistAsDocumentV2) {
    return {
      name: document.name,
      nodes: document.nodes,
      edges: document.edges,
    };
  }

  return {
    documentVersion: Math.max(2, document.documentVersion),
    name: document.name,
    defaultEngine: document.defaultEngine,
    nodes: document.nodes,
    edges: document.edges,
    subgraphs: document.subgraphs,
    settings: document.settings,
  };
}

export function shouldPersistAgencyDocumentV2(input: {
  documentVersion?: number | null;
  defaultEngine?: string | null;
  compileMode?: string | null;
  compatibilityMode?: string | null;
  subgraphs?: Array<Partial<AgencySubgraphDocument>> | null;
  nodes?: AgencyBuilderNodeDocument[];
}): boolean {
  if ((input.documentVersion ?? 1) >= 2) return true;
  if (typeof input.defaultEngine === "string" && input.defaultEngine !== AGENCY_DEFAULT_ENGINE) return true;
  if (typeof input.compileMode === "string" && input.compileMode !== AGENCY_DEFAULT_COMPILE_MODE) return true;
  if (typeof input.compatibilityMode === "string" && input.compatibilityMode !== AGENCY_DEFAULT_COMPATIBILITY_MODE) return true;
  if (Array.isArray(input.subgraphs) && input.subgraphs.some((subgraph) => {
    const id = typeof subgraph.id === "string" ? subgraph.id : "";
    const engine = typeof subgraph.engine === "string" ? subgraph.engine : AGENCY_DEFAULT_ENGINE;
    const entryNodeIds = normalizeStringArray(subgraph.entryNodeIds);
    const exitNodeIds = normalizeStringArray(subgraph.exitNodeIds);
    const nodeIds = normalizeStringArray(subgraph.nodeIds);
    const isSyntheticLegacyRoot = id === "sg_root_legacy"
      && engine === AGENCY_DEFAULT_ENGINE
      && entryNodeIds.length <= 1
      && exitNodeIds.length <= 1
      && nodeIds.length === (input.nodes ?? []).length;
    return !isSyntheticLegacyRoot;
  })) {
    return true;
  }
  return (input.nodes ?? []).some((node) =>
    !!node.subgraphId || !!node.engineHint || !!node.runtimeConfig
  );
}
