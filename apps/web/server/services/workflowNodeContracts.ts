import { createHash } from "node:crypto";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";

export type JsonSchema202012 = Record<string, unknown>;

export type NodeTypeFamily =
  | "trigger"
  | "transform"
  | "model"
  | "agent"
  | "capability"
  | "retrieval"
  | "subflow"
  | "router"
  | "join"
  | "loop"
  | "human-approval"
  | "human-input"
  | "wait"
  | "computer-use"
  | "artifact"
  | "verifier";

export type NodeBindingKind =
  | "trigger-source"
  | "capability"
  | "model"
  | "agent"
  | "workflow"
  | "retrieval-source"
  | "computer-use-profile"
  | "verifier";

export type NodeBindingRef = {
  kind: NodeBindingKind;
  ref: string;
  versionPolicy?: {
    mode: "exact" | "range" | "latest-compatible";
    value?: string;
  };
  selection?: "pinned" | "auto";
  constraints?: Record<string, unknown>;
};

export type NodePort = {
  id: string;
  direction: "input" | "output";
  channel: "data" | "control" | "error" | "event";
  schema?: JsonSchema202012;
  required?: boolean;
  cardinality?: "one" | "many";
  connectionPolicy?: "single" | "multi";
  payloadMode?: "value" | "artifact-ref" | "stream" | "event-envelope";
};

export type EffectContract = {
  mutation: "none" | "read" | "write";
  boundary: "internal" | "external";
  reversible?: boolean;
};

export type EffectDeclaration =
  | ({ mode: "fixed" } & EffectContract)
  | {
      mode: "derived";
      conservative: EffectContract;
      resolverRef: string;
      resolveAt: "compile" | "runtime-preflight";
    };

export type DataGovernanceDeclaration = {
  acceptedClassifications?: string[];
  outputClassificationRule?: "inherit-max" | "derive" | "fixed";
  residencySensitivity?: boolean;
  purposeTags?: string[];
  minimizationStrategy?: string;
};

export type NodeMigrationDescriptor = {
  typeId: string;
  fromVersionRange: string;
  toVersion: string;
  configMigratorRef?: string;
  portMap?: Record<string, string | null>;
  bindingMigratorRef?: string;
  deterministic: true;
  packageDigest: string;
};

export type NodeTypeManifest = {
  schemaVersion: "4";
  identity: {
    typeId: string;
    version: string;
    namespace: "core" | "plugin" | "tenant" | "marketplace";
    publisher: string;
    displayNameKey: string;
    descriptionKey: string;
    manifestDigest: string;
    extensionProvenance?: {
      packageDigest: string;
      hostApiVersion: string;
      trustStatus: "verified" | "approved" | "quarantined";
      uiIsolation: "sandboxed" | "host-only";
    };
  };
  semantic: {
    family: NodeTypeFamily;
    executionClass:
      | "activation"
      | "compute"
      | "orchestration"
      | "human"
      | "suspension"
      | "boundary"
      | "verification";
    summary: string;
    composable: boolean;
  };
  /** Device-neutral capabilities required when a node needs human interaction. */
  interaction?: {
    requiredCapabilities: string[];
  };
  ports: {
    inputs: NodePort[];
    outputs: NodePort[];
    derivation?: {
      mode: "fixed" | "binding-derived" | "config-derived";
      resolverRef?: string;
      resolverVersion?: string;
      stablePortIdStrategy?: string;
    };
  };
  config: {
    schema: JsonSchema202012;
    defaults?: Record<string, unknown>;
    uiHints?: Record<string, unknown>;
    canonicalizationVersion: string;
  };
  resolution: {
    allowedBindings: NodeBindingKind[];
    required: boolean;
    selection: ("author" | "auto" | "policy")[];
    schemaProjection?: "none" | "input-output" | "full";
  };
  runtimeRequirement: {
    capabilityClasses?: string[];
    protocolFamilies?: (
      | "native"
      | "skill"
      | "mcp"
      | "a2a"
      | "acp"
      | "http"
      | "custom"
    )[];
    placements?: (
      | "server"
      | "browser"
      | "runner"
      | "cloud-container"
      | "external"
    )[];
    resources?: {
      os?: ("windows" | "macos" | "linux")[];
      gpu?: boolean;
      minMemoryMb?: number;
      minVramMb?: number;
      browser?: boolean;
      localFilesystem?: boolean;
      network?: boolean;
    };
  };
  execution: {
    invocation: "inline" | "job" | "either";
    streaming: "none" | "optional" | "required";
    longRunning?: boolean;
    suspension: "none" | "timer" | "human" | "external" | "session" | "derived";
    determinism: "deterministic" | "nondeterministic" | "provider-dependent";
    cancellable?: boolean;
    continuation?: "none" | "checkpoint" | "external-handle" | "session";
    idempotencyClass:
      | "naturally-idempotent"
      | "requires-key"
      | "non-idempotent"
      | "derived";
    effects: EffectDeclaration;
  };
  security: {
    requiredScopes?: string[];
    credentialClasses?: string[];
    requiresSandbox?: boolean;
    networkEgress?: "none" | "allowlisted" | "internet" | "derived";
    filesystem?: "none" | "read" | "write" | "derived";
    approvalClass?: string;
    minimumTrustLevel?: string;
  };
  ui: {
    category: string;
    compactLabelKey: string;
    icon?: string;
    accentRole?: string;
    propertyGroups?: Array<{ id: string; labelKey: string; fields: string[] }>;
    customEditor?: {
      packageRef: string;
      sandboxed: true;
      hostApiVersion: string;
    };
  };
  aiBuilder: {
    capabilities: string[];
    intents: string[];
    inputConcepts: string[];
    outputConcepts: string[];
    examples?: string[];
    contraindications?: string[];
    compositionHints?: string[];
    retrievalSummary: string;
  };
  dataGovernance?: DataGovernanceDeclaration;
  compatibility: {
    compilerContract: string;
    acceptedVersionRange: string;
  };
  lifecycle: {
    status: "experimental" | "active" | "deprecated" | "retired" | "quarantined";
    introducedVersion: string;
    deprecatedAt?: string;
    retiredAt?: string;
    replacementTypeId?: string;
  };
  migrations?: NodeMigrationDescriptor[];
  presets?: NodePreset[];
  extensionAdmission?: NodeTypeAdmissionInput;
};

export type NodePreset = {
  presetId: string;
  typeId: string;
  compatibleVersionRange: string;
  labelKey: string;
  descriptionKey?: string;
  configOverrides?: Record<string, unknown>;
  bindingHint?: NodeBindingRef;
  tags?: string[];
};

export type NodeInstance = {
  id: string;
  typeId: string;
  typeVersion: string;
  presetId?: string;
  label?: string;
  binding?: NodeBindingRef;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  metadata?: Record<string, unknown>;
};

export class NodeContractError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "NodeContractError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const CORE_NODE_TYPE_IDS = [
  "core.trigger",
  "data.transform",
  "ai.model",
  "ai.agent",
  "core.capability",
  "data.retrieval",
  "flow.subflow",
  "flow.router",
  "flow.join",
  "flow.loop",
  "human.approval",
  "human.input",
  "flow.wait",
  "automation.computer_use",
  "data.artifact",
  "quality.verifier",
] as const;

const SECRET_KEY = /token|secret|password|api.?key|private.?key|credential/i;
const RUNTIME_KEY = /nodeRun|nodeAttempt|attemptId|runId|lease|status|progress|outputRef|outputSnapshotRef|inputSnapshotRef/i;
const schemaValidators = new Map<string, ValidateFunction>();
const schemaValidator = new Ajv2020({ allErrors: true, strict: false });

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(",")}}`;
}

export function computeNodeManifestDigest(manifest: NodeTypeManifest): string {
  const withoutDigest = {
    ...manifest,
    identity: { ...manifest.identity, manifestDigest: "" },
  };
  return createHash("sha256")
    .update(stableStringify(withoutDigest), "utf8")
    .digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function versionMatches(version: string, range: string): boolean {
  const actual = version.split(".").map(Number);
  const requested = range.trim();
  if (/^\d+\.\d+\.\d+$/.test(requested)) return version === requested;
  const operator = requested[0];
  const base = (operator === "^" || operator === "~" ? requested.slice(1) : requested)
    .split(".").map(Number);
  if (actual.length !== 3 || base.length !== 3 || [...actual, ...base].some(value => !Number.isInteger(value)))
    return false;
  if (operator === "~") return actual[0] === base[0] && actual[1] === base[1] && actual[2] >= base[2];
  if (operator === "^") {
    if (base[0] > 0) return actual[0] === base[0] && (actual[1] > base[1] || (actual[1] === base[1] && actual[2] >= base[2]));
    if (base[1] > 0) return actual[0] === 0 && actual[1] === base[1] && actual[2] >= base[2];
    return actual[0] === 0 && actual[1] === 0 && actual[2] === base[2];
  }
  return false;
}

function port(id: string, direction: "input" | "output"): NodePort {
  return {
    id,
    direction,
    channel: "data",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
    },
    required: direction === "input",
    cardinality: "one",
    connectionPolicy: "single",
    payloadMode: "value",
  };
}

const jsonSchema = (schema: Record<string, unknown>): JsonSchema202012 => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...schema,
});

function canonicalPorts(typeId: (typeof CORE_NODE_TYPE_IDS)[number]): { inputs: NodePort[]; outputs: NodePort[] } {
  const object = (properties: Record<string, unknown>, required: string[] = []) => jsonSchema({
    type: "object", properties, required, additionalProperties: false,
  });
  const string = { type: "string" };
  const schemas: Record<(typeof CORE_NODE_TYPE_IDS)[number], { input: JsonSchema202012; output: JsonSchema202012 }> = {
    "core.trigger": { input: object({}), output: object({ eventId: string, occurredAt: { type: "string", format: "date-time" }, payload: { type: "object" } }, ["eventId", "occurredAt", "payload"]) },
    "data.transform": { input: object({ value: {} }, ["value"]), output: object({ value: {} }, ["value"]) },
    "ai.model": { input: object({ prompt: string, context: { type: "array" }, media: { type: "array" } }, ["prompt"]), output: object({ value: {}, usage: { type: "object" } }, ["value"]) },
    "ai.agent": { input: object({ goal: string, context: { type: "object" }, artifacts: { type: "array" } }, ["goal"]), output: object({ result: {}, session: { type: "object" }, evidence: { type: "array" } }, ["result"]) },
    "core.capability": { input: object({ input: { type: "object" } }, ["input"]), output: object({ output: {} }, ["output"]) },
    "data.retrieval": { input: object({ query: string, filters: { type: "object" }, context: { type: "object" }, intent: { type: "string", enum: ["DOCUMENT_RAG", "EXACT_IDENTIFIER", "SEMANTIC_ENTITY", "SKILL_DISCOVERY", "CAPABILITY_DISCOVERY", "SIMILAR_CASE", "HYBRID_SEARCH"] }, exactIdentifiers: { type: "array", items: string }, sourceClasses: { type: "array", items: string }, requiredVisibility: { type: "array", items: string }, languageHints: { type: "array", items: string }, maximumEvidence: { type: "integer", minimum: 1 }, freshness: { type: "string" } }, ["query", "intent"]), output: jsonSchema({
      type: "object", additionalProperties: false, required: ["retrievalTraceId", "provider", "queryPlan", "evidence", "degraded", "qualityGate"], properties: {
        retrievalTraceId: { type: "string", minLength: 1 },
        provider: { type: "object", additionalProperties: false, required: ["profile", "version"], properties: { profile: string, version: string } },
        queryPlan: { type: "object" },
        evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["evidenceRef", "source", "acl", "freshness", "score"], properties: {
          evidenceRef: { type: "string", minLength: 1 }, source: { type: "object", required: ["identity", "revision"], properties: { identity: string, revision: string, digest: { type: "string" } } },
          acl: { type: "string", enum: ["authorized"] }, freshness: { type: "string", enum: ["fresh", "stale", "unknown"] }, score: { type: "number" },
          candidateOnly: { type: "boolean" },
        } } }, degraded: { type: "boolean" }, degradationReasons: { type: "array", items: string }, qualityGate: { type: "string", enum: ["passed", "insufficient", "failed"] },
      },
    }) },
    "flow.subflow": { input: object({ inputs: { type: "object" } }, ["inputs"]), output: object({ outputs: { type: "object" } }, ["outputs"]) },
    "flow.router": { input: object({ value: {} }, ["value"]), output: object({ routes: { type: "array", items: string } }, ["routes"]) },
    "flow.join": { input: object({ branches: { type: "array" } }, ["branches"]), output: object({ branches: { type: "array" }, partial: { type: "boolean" } }, ["branches", "partial"]) },
    "flow.loop": { input: object({ collection: { type: "array" }, state: { type: "object" } }), output: object({ iterations: { type: "array" }, result: {} }, ["iterations", "result"]) },
    "human.approval": { input: object({ subject: { type: "object" }, summary: string }, ["subject", "summary"]), output: object({ decision: { type: "string", enum: ["approved", "rejected"] }, evidence: { type: "object" } }, ["decision", "evidence"]) },
    "human.input": { input: object({ request: string, context: { type: "object" }, responseSchema: { type: "object" } }, ["request", "responseSchema"]), output: object({ response: {} }, ["response"]) },
    "flow.wait": { input: object({ wait: { type: "object" }, correlationId: string }, ["wait", "correlationId"]), output: object({ resumedAt: { type: "string", format: "date-time" }, signal: {} }, ["resumedAt"]) },
    "automation.computer_use": { input: object({ goal: string, target: { type: "object" }, context: { type: "object" } }, ["goal"]), output: object({ result: {}, evidence: { type: "array" }, artifacts: { type: "array" } }, ["result"]) },
    "data.artifact": { input: object({ artifact: {}, operation: string }, ["artifact", "operation"]), output: object({ artifactRef: string, manifest: { type: "object" } }, ["artifactRef"]) },
    "quality.verifier": { input: object({ subject: {}, evidence: { type: "array" }, rubric: { type: "object" } }, ["subject"]), output: object({ verdict: { type: "string", enum: ["pass", "fail", "inconclusive"] }, score: { type: "number" }, evidence: { type: "array" } }, ["verdict", "evidence"]) },
  };
  const pair = schemas[typeId];
  return {
    inputs: [{ ...port("input", "input"), schema: pair.input, required: typeId !== "core.trigger" }],
    outputs: [{ ...port("output", "output"), schema: pair.output, required: false }],
  };
}

function getSchemaValidator(schema: JsonSchema202012, errorCode: string): ValidateFunction {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    throw new NodeContractError(errorCode);
  if (schema.$schema !== undefined &&
      schema.$schema !== "https://json-schema.org/draft/2020-12/schema")
    throw new NodeContractError(errorCode);
  const schemaKey = createHash("sha256").update(stableStringify(schema), "utf8").digest("hex");
  const cached = schemaValidators.get(schemaKey);
  if (cached) return cached;
  try {
    const compiled = schemaValidator.compile(schema);
    schemaValidators.set(schemaKey, compiled);
    return compiled;
  } catch {
    throw new NodeContractError(errorCode);
  }
}

const NODE_PROFILES: Record<
  (typeof CORE_NODE_TYPE_IDS)[number],
  {
    family: NodeTypeFamily;
    executionClass: NodeTypeManifest["semantic"]["executionClass"];
    summary: string;
    allowedBindings: NodeBindingKind[];
    requiredBinding: boolean;
    invocation: NodeTypeManifest["execution"]["invocation"];
    suspension: NodeTypeManifest["execution"]["suspension"];
    determinism: NodeTypeManifest["execution"]["determinism"];
    mutation: NodeTypeManifest["execution"]["effects"]["mutation"];
    boundary: NodeTypeManifest["execution"]["effects"]["boundary"];
    intents: string[];
    capabilities: string[];
  }
> = {
  "core.trigger": {
    family: "trigger",
    executionClass: "activation",
    summary: "External, time or event activation source for a workflow path.",
    allowedBindings: ["trigger-source"],
    requiredBinding: true,
    invocation: "job",
    suspension: "none",
    determinism: "provider-dependent",
    mutation: "none",
    boundary: "external",
    intents: ["start workflow", "receive event", "schedule automation"],
    capabilities: ["trigger"],
  },
  "data.transform": {
    family: "transform",
    executionClass: "compute",
    summary: "Pure bounded transformation of already available typed values.",
    allowedBindings: [],
    requiredBinding: false,
    invocation: "inline",
    suspension: "none",
    determinism: "deterministic",
    mutation: "none",
    boundary: "internal",
    intents: ["transform data", "parse value", "map values", "merge values"],
    capabilities: ["transform", "parse", "map", "filter", "reduce"],
  },
  "ai.model": {
    family: "model",
    executionClass: "compute",
    summary: "Direct model inference without autonomous tool orchestration.",
    allowedBindings: ["model"],
    requiredBinding: true,
    invocation: "job",
    suspension: "none",
    determinism: "nondeterministic",
    mutation: "read",
    boundary: "external",
    intents: ["generate", "summarize", "translate", "classify", "embed"],
    capabilities: ["text-generation", "structured-output", "multimodal-inference"],
  },
  "ai.agent": {
    family: "agent",
    executionClass: "orchestration",
    summary: "Goal-directed autonomous or semi-autonomous agent execution.",
    allowedBindings: ["agent"],
    requiredBinding: true,
    invocation: "job",
    suspension: "session",
    determinism: "provider-dependent",
    mutation: "write",
    boundary: "external",
    intents: ["autonomous agent", "delegate task", "use tools", "coding agent"],
    capabilities: ["agent", "tool-using-agent", "external-agent"],
  },
  "core.capability": {
    family: "capability",
    executionClass: "boundary",
    summary: "One governed non-agent operation, Skill, tool, API or business capability.",
    allowedBindings: ["capability"],
    requiredBinding: true,
    invocation: "either",
    suspension: "derived",
    determinism: "provider-dependent",
    mutation: "write",
    boundary: "external",
    intents: ["call tool", "send notification", "use connector", "run skill"],
    capabilities: ["capability", "skill", "connector", "mcp-tool"],
  },
  "data.retrieval": {
    family: "retrieval",
    executionClass: "compute",
    summary: "Retrieve, search and rank context or assets with provenance.",
    allowedBindings: ["retrieval-source"],
    requiredBinding: true,
    invocation: "job",
    suspension: "none",
    determinism: "provider-dependent",
    mutation: "read",
    boundary: "external",
    intents: ["search context", "retrieve documents", "rank evidence"],
    capabilities: ["retrieval", "vector-search", "hybrid-search"],
  },
  "flow.subflow": {
    family: "subflow",
    executionClass: "orchestration",
    summary: "Invoke a reusable workflow or subflow through a typed interface.",
    allowedBindings: ["workflow"],
    requiredBinding: true,
    invocation: "job",
    suspension: "derived",
    determinism: "provider-dependent",
    mutation: "write",
    boundary: "internal",
    intents: ["reuse workflow", "invoke subflow"],
    capabilities: ["subflow"],
  },
  "flow.router": {
    family: "router",
    executionClass: "orchestration",
    summary: "Deterministic choice of outgoing routes from existing values.",
    allowedBindings: [],
    requiredBinding: false,
    invocation: "inline",
    suspension: "none",
    determinism: "deterministic",
    mutation: "none",
    boundary: "internal",
    intents: ["branch", "switch", "route condition"],
    capabilities: ["condition", "switch", "rules"],
  },
  "flow.join": {
    family: "join",
    executionClass: "orchestration",
    summary: "Synchronize concurrent workflow branches with an explicit policy.",
    allowedBindings: [],
    requiredBinding: false,
    invocation: "job",
    suspension: "none",
    determinism: "deterministic",
    mutation: "none",
    boundary: "internal",
    intents: ["join branches", "wait for all", "barrier"],
    capabilities: ["barrier", "race", "quorum"],
  },
  "flow.loop": {
    family: "loop",
    executionClass: "orchestration",
    summary: "Structured bounded repetition of workflow work.",
    allowedBindings: [],
    requiredBinding: false,
    invocation: "job",
    suspension: "derived",
    determinism: "deterministic",
    mutation: "write",
    boundary: "internal",
    intents: ["iterate", "repeat", "repair loop", "foreach"],
    capabilities: ["foreach", "while", "until"],
  },
  "human.approval": {
    family: "human-approval",
    executionClass: "human",
    summary: "Human authorization or decision gate before continuation.",
    allowedBindings: [],
    requiredBinding: false,
    invocation: "job",
    suspension: "human",
    determinism: "provider-dependent",
    mutation: "none",
    boundary: "internal",
    intents: ["approve", "review", "four eyes", "quorum decision"],
    capabilities: ["approval"],
  },
  "human.input": {
    family: "human-input",
    executionClass: "human",
    summary: "Collect typed data, correction or takeover from a human.",
    allowedBindings: [],
    requiredBinding: false,
    invocation: "job",
    suspension: "human",
    determinism: "provider-dependent",
    mutation: "none",
    boundary: "internal",
    intents: ["ask user", "collect input", "take over", "correct"],
    capabilities: ["form", "choice", "handoff"],
  },
  "flow.wait": {
    family: "wait",
    executionClass: "suspension",
    summary: "Durably suspend until a timer, event or callback condition.",
    allowedBindings: [],
    requiredBinding: false,
    invocation: "job",
    suspension: "timer",
    determinism: "deterministic",
    mutation: "none",
    boundary: "internal",
    intents: ["wait", "delay", "resume callback"],
    capabilities: ["timer", "callback", "event-wait"],
  },
  "automation.computer_use": {
    family: "computer-use",
    executionClass: "boundary",
    summary: "Goal-level browser or desktop interaction session with safety controls.",
    allowedBindings: ["computer-use-profile"],
    requiredBinding: true,
    invocation: "job",
    suspension: "session",
    determinism: "provider-dependent",
    mutation: "write",
    boundary: "external",
    intents: ["browse", "operate browser", "computer use", "desktop automation"],
    capabilities: ["browser-automation", "runner-automation"],
  },
  "data.artifact": {
    family: "artifact",
    executionClass: "boundary",
    summary: "Materialize, persist, package, export or publish an artifact.",
    allowedBindings: [],
    requiredBinding: false,
    invocation: "job",
    suspension: "none",
    determinism: "provider-dependent",
    mutation: "write",
    boundary: "external",
    intents: ["save artifact", "export", "package", "publish library"],
    capabilities: ["artifact", "library-publish", "export"],
  },
  "quality.verifier": {
    family: "verifier",
    executionClass: "verification",
    summary: "Produce typed verification, evaluation or quality evidence.",
    allowedBindings: ["verifier"],
    requiredBinding: true,
    invocation: "job",
    suspension: "none",
    determinism: "provider-dependent",
    mutation: "read",
    boundary: "external",
    intents: ["verify", "test", "quality check", "evaluate evidence"],
    capabilities: ["schema-check", "tests", "moderation", "media-qc"],
  },
};

function buildManifest(typeId: (typeof CORE_NODE_TYPE_IDS)[number]): NodeTypeManifest {
  const profile = NODE_PROFILES[typeId];
  const effects: EffectDeclaration = typeId === "core.capability"
    ? {
        mode: "derived",
        conservative: {
          mutation: profile.mutation,
          boundary: profile.boundary,
          reversible: false,
        },
        resolverRef: "core.capability.effect.v1",
        resolveAt: "runtime-preflight",
      }
    : {
        mode: "fixed",
        mutation: profile.mutation,
        boundary: profile.boundary,
        reversible: profile.mutation !== "write",
      };
  const configSchema: JsonSchema202012 = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: typeId === "data.transform"
      ? { operation: { type: "string", minLength: 1 } }
      : typeId === "ai.model"
        ? { prompt: { type: "string" }, responseFormat: { type: "string", enum: ["text", "json"] } }
        : typeId === "flow.router"
          ? { mode: { type: "string", enum: ["condition", "switch", "rules"] } }
          : typeId === "human.approval"
            ? { title: { type: "string", maxLength: 256 } }
            : typeId === "human.input"
              ? { prompt: { type: "string", maxLength: 2000 }, fields: { type: "array", maxItems: 100, items: { type: "object" } } }
              : typeId === "flow.wait"
                ? { durationMs: { type: "integer", minimum: 0, maximum: 31536000000 }, event: { type: "string", maxLength: 256 } }
                : typeId === "flow.join"
                  ? { strategy: { type: "string", enum: ["all", "any", "quorum"] }, quorum: { type: "integer", minimum: 1 } }
                  : typeId === "flow.loop"
                    ? { mode: { type: "string", enum: ["foreach", "while", "until"] }, maxIterations: { type: "integer", minimum: 1, maximum: 10000 } }
                    : typeId === "data.retrieval"
                      ? { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 1000 }, intent: { type: "string", enum: ["DOCUMENT_RAG", "EXACT_IDENTIFIER", "SEMANTIC_ENTITY", "SKILL_DISCOVERY", "CAPABILITY_DISCOVERY", "SIMILAR_CASE", "HYBRID_SEARCH"] } }
                      : typeId === "core.capability"
                        ? { input: { type: "object" }, operation: { type: "string", maxLength: 256 } }
                        : typeId === "ai.agent"
                          ? { goal: { type: "string", maxLength: 20000 }, maxSteps: { type: "integer", minimum: 1, maximum: 1000 } }
                          : typeId === "flow.subflow"
                            ? { inputMapping: { type: "object" }, outputMapping: { type: "object" } }
                            : typeId === "automation.computer_use"
                              ? { goal: { type: "string", maxLength: 20000 } }
                              : typeId === "data.artifact"
                                ? { artifactType: { type: "string" }, outputKey: { type: "string" } }
                                : typeId === "quality.verifier"
                                  ? { checks: { type: "array", items: { type: "string" }, maxItems: 100 } }
                                  : typeId === "core.trigger"
                                    ? { eventType: { type: "string" }, schedule: { type: "string" } }
                                    : {},
  };
  const manifest = {
    schemaVersion: "4" as const,
    identity: {
      typeId,
      version: "1.0.0",
      namespace: "core" as const,
      publisher: "smartspec",
      displayNameKey: `workflow.node.${typeId}.name`,
      descriptionKey: `workflow.node.${typeId}.description`,
      manifestDigest: "",
    },
    semantic: {
      family: profile.family,
      executionClass: profile.executionClass,
      summary: profile.summary,
      composable: true,
    },
    ...(typeId === "human.input" ? { interaction: { requiredCapabilities: ["interaction.text", "interaction.choice"] } } : {}),
    ...(typeId === "human.approval" ? { interaction: { requiredCapabilities: ["interaction.approval"] } } : {}),
    ports: canonicalPorts(typeId),
    config: {
      schema: configSchema,
      canonicalizationVersion: "1",
    },
    resolution: {
      allowedBindings: profile.allowedBindings,
      required: profile.requiredBinding,
      selection: profile.requiredBinding ? ["author", "auto", "policy"] : ["author"],
      schemaProjection: profile.requiredBinding ? "full" as const : "none" as const,
    },
    runtimeRequirement: {
      capabilityClasses: profile.capabilities,
      protocolFamilies: profile.boundary === "external" ? ["native", "http", "custom"] : ["native"],
      placements: profile.boundary === "external" ? ["server", "runner", "cloud-container", "external"] : ["server"],
      resources: {
        gpu: false,
        minMemoryMb: 0,
        browser: typeId === "automation.computer_use",
        localFilesystem: typeId === "data.artifact",
        network: profile.boundary === "external",
      },
    },
    execution: {
      invocation: profile.invocation,
      streaming: "optional" as const,
      longRunning: profile.invocation === "job",
      suspension: profile.suspension,
      determinism: profile.determinism,
      cancellable: profile.invocation === "job",
      continuation: profile.suspension === "none" ? "none" as const : "checkpoint" as const,
      idempotencyClass: profile.mutation === "none" ? "naturally-idempotent" as const : "requires-key" as const,
      effects,
    },
    security: {
      networkEgress: profile.boundary === "external" ? "derived" as const : "none" as const,
      filesystem: typeId === "data.artifact" ? "write" as const : "none" as const,
      minimumTrustLevel: profile.boundary === "external" ? "governed" : "trusted",
    },
    ui: {
      category: profile.family,
      compactLabelKey: `workflow.node.${typeId}.compact`,
      propertyGroups: [],
    },
    aiBuilder: {
      capabilities: profile.capabilities,
      intents: profile.intents,
      inputConcepts: ["typed input", "context"],
      outputConcepts: ["typed output", "evidence"],
      examples: profile.intents.slice(0, 2),
      contraindications: ["Do not use as a provider-specific semantic type."],
      compositionHints: ["Pair with a registered compatible binding when required."],
      retrievalSummary: `${profile.summary} Use a real compatible binding when required.`,
    },
    dataGovernance: {
      acceptedClassifications: ["public", "internal", "confidential"],
      outputClassificationRule: "derive",
      residencySensitivity: profile.boundary === "external",
      purposeTags: ["workflow-execution"],
      minimizationStrategy: "binding-policy",
    },
    compatibility: {
      compilerContract: "spec-215-v1",
      acceptedVersionRange: "^1.0.0",
    },
    lifecycle: {
      status: "active" as const,
      introducedVersion: "1.0.0",
    },
  } satisfies Omit<NodeTypeManifest, "identity"> & {
    identity: Omit<NodeTypeManifest["identity"], "manifestDigest"> & { manifestDigest: string };
  };
  manifest.identity.manifestDigest = computeNodeManifestDigest(manifest as NodeTypeManifest);
  return deepFreeze(manifest as NodeTypeManifest);
}

export function validateNodeTypeManifest(manifest: NodeTypeManifest): true {
  if (!manifest || manifest.schemaVersion !== "4")
    throw new NodeContractError("NODE_MANIFEST_INVALID");
  const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (!manifest.identity || !manifest.semantic || !manifest.ports || !manifest.config ||
      !manifest.resolution || !manifest.runtimeRequirement || !manifest.execution ||
      !manifest.security || !manifest.ui || !manifest.aiBuilder ||
      !manifest.compatibility || !manifest.lifecycle ||
      !isRecord(manifest.identity) || !isRecord(manifest.semantic) || !isRecord(manifest.ports) ||
      !isRecord(manifest.config) || !isRecord(manifest.resolution) || !isRecord(manifest.runtimeRequirement) ||
      !isRecord(manifest.execution) || !isRecord(manifest.execution.effects) || !isRecord(manifest.security) ||
      !isRecord(manifest.ui) || !isRecord(manifest.aiBuilder) || !isRecord(manifest.compatibility) || !isRecord(manifest.lifecycle))
    throw new NodeContractError("NODE_MANIFEST_INVALID");
  if (!manifest.identity.typeId || !manifest.identity.publisher ||
      !manifest.identity.displayNameKey || !manifest.identity.descriptionKey ||
      !manifest.semantic.summary || !manifest.ui.category ||
      !manifest.ui.compactLabelKey || !manifest.config.canonicalizationVersion ||
      !Array.isArray(manifest.ports.inputs) || !Array.isArray(manifest.ports.outputs) ||
      !Array.isArray(manifest.resolution.allowedBindings) ||
      !Array.isArray(manifest.resolution.selection))
    throw new NodeContractError("NODE_MANIFEST_INVALID");
  const enumHas = (value: unknown, allowed: readonly string[]) => typeof value === "string" && allowed.includes(value);
  const stringArray = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string" && item.trim());
  if (!isRecord(manifest.execution.effects) ||
      !["fixed", "derived"].includes(manifest.execution.effects.mode) ||
      (manifest.execution.effects.mode === "derived" && !isRecord(manifest.execution.effects.conservative)))
    throw new NodeContractError("NODE_EFFECT_CONTRACT_INVALID");
  const declaredEffect = manifest.execution.effects.mode === "derived"
    ? manifest.execution.effects.conservative
    : manifest.execution.effects;
  if (!enumHas(manifest.semantic.family, ["trigger", "transform", "model", "agent", "capability", "retrieval", "subflow", "router", "join", "loop", "human-approval", "human-input", "wait", "computer-use", "artifact", "verifier"]) ||
      !enumHas(manifest.semantic.executionClass, ["activation", "compute", "orchestration", "human", "suspension", "boundary", "verification"]) ||
      !enumHas(manifest.execution.invocation, ["inline", "job", "either"]) ||
      !enumHas(manifest.execution.streaming, ["none", "optional", "required"]) ||
      !enumHas(manifest.execution.suspension, ["none", "timer", "human", "external", "session", "derived"]) ||
      !enumHas(manifest.execution.determinism, ["deterministic", "nondeterministic", "provider-dependent"]) ||
      !enumHas(manifest.execution.idempotencyClass, ["naturally-idempotent", "requires-key", "non-idempotent", "derived"]) ||
      !enumHas(manifest.lifecycle.status, ["experimental", "active", "deprecated", "retired", "quarantined"]) ||
      !enumHas(manifest.security.networkEgress ?? "none", ["none", "allowlisted", "internet", "derived"]) ||
      !enumHas(manifest.security.filesystem ?? "none", ["none", "read", "write", "derived"]) ||
      !Array.isArray(manifest.aiBuilder.capabilities) || !Array.isArray(manifest.aiBuilder.intents) ||
      typeof manifest.aiBuilder.retrievalSummary !== "string" || typeof manifest.semantic.composable !== "boolean")
    throw new NodeContractError("NODE_MANIFEST_INVALID");
  if (!stringArray(manifest.aiBuilder.capabilities) || !stringArray(manifest.aiBuilder.intents) ||
      !stringArray(manifest.aiBuilder.inputConcepts) || !stringArray(manifest.aiBuilder.outputConcepts) ||
      (manifest.aiBuilder.examples && !stringArray(manifest.aiBuilder.examples)) ||
      (manifest.aiBuilder.contraindications && !stringArray(manifest.aiBuilder.contraindications)) ||
      (manifest.aiBuilder.compositionHints && !stringArray(manifest.aiBuilder.compositionHints)) ||
      (manifest.runtimeRequirement.capabilityClasses && !stringArray(manifest.runtimeRequirement.capabilityClasses)) ||
      (manifest.security.requiredScopes && !stringArray(manifest.security.requiredScopes)) ||
      (manifest.security.credentialClasses && !stringArray(manifest.security.credentialClasses)) ||
      !manifest.resolution.allowedBindings.every(kind => ["trigger-source", "capability", "model", "agent", "workflow", "retrieval-source", "computer-use-profile", "verifier"].includes(kind)) ||
      !manifest.resolution.selection.every(item => ["author", "auto", "policy"].includes(item)) ||
      (manifest.resolution.schemaProjection !== undefined && !["none", "input-output", "full"].includes(manifest.resolution.schemaProjection)) ||
      typeof manifest.resolution.required !== "boolean" ||
      !["none", "allowlisted", "internet", "derived", undefined].includes(manifest.security.networkEgress) ||
      !["none", "read", "write", "derived", undefined].includes(manifest.security.filesystem) ||
      !["none", "read", "write"].includes(declaredEffect.mutation) ||
      !["internal", "external"].includes(declaredEffect.boundary) ||
      (manifest.execution.effects.mode === "derived" && !["compile", "runtime-preflight"].includes(manifest.execution.effects.resolveAt)) ||
      (manifest.execution.effects.reversible !== undefined && typeof manifest.execution.effects.reversible !== "boolean") ||
      (manifest.runtimeRequirement.protocolFamilies && !manifest.runtimeRequirement.protocolFamilies.every(item => ["native", "skill", "mcp", "a2a", "acp", "http", "custom"].includes(item))) ||
      (manifest.runtimeRequirement.placements && !manifest.runtimeRequirement.placements.every(item => ["server", "browser", "runner", "cloud-container", "external"].includes(item))) ||
      !["inline", "job", "either"].includes(manifest.execution.invocation))
    throw new NodeContractError("NODE_MANIFEST_INVALID");
  if (manifest.interaction && (!isRecord(manifest.interaction) ||
      !stringArray(manifest.interaction.requiredCapabilities) ||
      manifest.interaction.requiredCapabilities.some(item => !/^interaction\.[a-z][a-z0-9_.-]*$/.test(item))))
    throw new NodeContractError("NODE_INTERACTION_CONTRACT_INVALID");
  if ((manifest.identity.typeId === "human.input" || manifest.identity.typeId === "human.approval") &&
      (!manifest.interaction || manifest.interaction.requiredCapabilities.length === 0))
    throw new NodeContractError("NODE_INTERACTION_CONTRACT_INVALID");
  if (typeof manifest.compatibility.compilerContract !== "string" || !manifest.compatibility.compilerContract.trim() ||
      typeof manifest.compatibility.acceptedVersionRange !== "string" || !versionMatches(manifest.identity.version, manifest.compatibility.acceptedVersionRange) ||
      typeof manifest.lifecycle.introducedVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.lifecycle.introducedVersion) ||
      (manifest.lifecycle.deprecatedAt !== undefined && typeof manifest.lifecycle.deprecatedAt !== "string") ||
      (manifest.lifecycle.retiredAt !== undefined && typeof manifest.lifecycle.retiredAt !== "string") ||
      (manifest.lifecycle.status === "deprecated" && !manifest.lifecycle.deprecatedAt) ||
      (manifest.lifecycle.status === "retired" && !manifest.lifecycle.retiredAt))
    throw new NodeContractError("NODE_LIFECYCLE_CONTRACT_INVALID");
  if (manifest.dataGovernance && ((manifest.dataGovernance.outputClassificationRule !== undefined && !["inherit-max", "derive", "fixed"].includes(manifest.dataGovernance.outputClassificationRule)) ||
      (manifest.dataGovernance.acceptedClassifications && !stringArray(manifest.dataGovernance.acceptedClassifications)) ||
      (manifest.dataGovernance.purposeTags && !stringArray(manifest.dataGovernance.purposeTags)) ||
      (manifest.dataGovernance.residencySensitivity !== undefined && typeof manifest.dataGovernance.residencySensitivity !== "boolean")))
    throw new NodeContractError("NODE_DATA_GOVERNANCE_INVALID");
  if (manifest.ui.propertyGroups && (!Array.isArray(manifest.ui.propertyGroups) || manifest.ui.propertyGroups.some(group =>
      !isRecord(group) || typeof group.id !== "string" || !group.id.trim() || typeof group.labelKey !== "string" || !group.labelKey.trim() || !Array.isArray(group.fields) || !stringArray(group.fields))))
    throw new NodeContractError("NODE_UI_CONTRACT_INVALID");
  if (manifest.ui.customEditor && (!isRecord(manifest.ui.customEditor) || manifest.ui.customEditor.sandboxed !== true || typeof manifest.ui.customEditor.packageRef !== "string" || !manifest.ui.customEditor.packageRef.trim() || typeof manifest.ui.customEditor.hostApiVersion !== "string" || !manifest.ui.customEditor.hostApiVersion.trim()))
    throw new NodeContractError("NODE_UI_CONTRACT_INVALID");
  const isCoreType = CORE_NODE_TYPE_IDS.includes(
    manifest.identity.typeId as (typeof CORE_NODE_TYPE_IDS)[number]
  );
  if (isCoreType) {
    if (manifest.identity.namespace !== "core")
      throw new NodeContractError("NODE_NAMESPACE_INVALID");
  } else {
    const extensionType = manifest.identity.typeId.match(
      /^(plugin|tenant|marketplace)\.([a-z0-9][a-z0-9_-]{0,62})\.([a-z][a-z0-9_-]{0,62})$/
    );
    if (!extensionType || manifest.identity.namespace !== extensionType[1])
      throw new NodeContractError("NODE_TYPE_UNKNOWN");
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.identity.version))
    throw new NodeContractError("NODE_VERSION_INVALID");
  if (computeNodeManifestDigest(manifest) !== manifest.identity.manifestDigest)
    throw new NodeContractError("NODE_TYPE_DIGEST_INVALID");
  if (!isRecord(manifest.config.schema) || manifest.config.schema.$schema !== "https://json-schema.org/draft/2020-12/schema")
    throw new NodeContractError("NODE_CONFIG_SCHEMA_INVALID");
  const configValidator = getSchemaValidator(manifest.config.schema, "NODE_CONFIG_SCHEMA_INVALID");
  if (manifest.config.defaults && !configValidator(manifest.config.defaults))
    throw new NodeContractError("NODE_CONFIG_DEFAULTS_INVALID");
  const allPorts = [...manifest.ports.inputs, ...manifest.ports.outputs];
  for (const item of allPorts) {
    if (!item || typeof item.id !== "string" || !item.id.trim() ||
        !["data", "control", "error", "event"].includes(item.channel) ||
        !["one", "many", undefined].includes(item.cardinality) ||
        !["single", "multi", undefined].includes(item.connectionPolicy) ||
        !["value", "artifact-ref", "stream", "event-envelope", undefined].includes(item.payloadMode) ||
        (item.required !== undefined && typeof item.required !== "boolean"))
      throw new NodeContractError("NODE_PORT_CONTRACT_INVALID");
    if (item.schema) getSchemaValidator(item.schema, "NODE_PORT_SCHEMA_INVALID");
  }
  if (manifest.ports.derivation && (manifest.ports.derivation.mode !== "fixed" &&
      (!manifest.ports.derivation.resolverRef || !manifest.ports.derivation.resolverVersion || !manifest.ports.derivation.stablePortIdStrategy)))
    throw new NodeContractError("NODE_PORT_DERIVATION_INVALID");
  if (manifest.ports.derivation && !["fixed", "binding-derived", "config-derived"].includes(manifest.ports.derivation.mode))
    throw new NodeContractError("NODE_PORT_DERIVATION_INVALID");
  const portIds = allPorts.map(item => item.id);
  if (new Set(portIds).size !== portIds.length || manifest.ports.inputs.some(item => item.direction !== "input") ||
      manifest.ports.outputs.some(item => item.direction !== "output"))
    throw new NodeContractError("NODE_PORT_CONTRACT_INVALID");
  if (manifest.execution.effects.mode === "derived" &&
      (!manifest.execution.effects.resolverRef || !manifest.execution.effects.conservative))
    throw new NodeContractError("NODE_EFFECT_CONTRACT_INVALID");
  if (manifest.execution.effects.mode !== "derived" && manifest.execution.effects.mode !== "fixed")
    throw new NodeContractError("NODE_EFFECT_CONTRACT_INVALID");
  const resources = manifest.runtimeRequirement.resources;
  if (resources && (!isRecord(resources) ||
      (resources.os && (!Array.isArray(resources.os) || !resources.os.every(item => ["windows", "macos", "linux"].includes(item)))) ||
      (resources.gpu !== undefined && typeof resources.gpu !== "boolean") ||
      (resources.browser !== undefined && typeof resources.browser !== "boolean") ||
      (resources.localFilesystem !== undefined && typeof resources.localFilesystem !== "boolean") ||
      (resources.network !== undefined && typeof resources.network !== "boolean") ||
      [resources.minMemoryMb, resources.minVramMb].some(value =>
    value !== undefined && (!Number.isFinite(value) || value < 0)
  ))) throw new NodeContractError("NODE_RUNTIME_REQUIREMENT_INVALID");
  if ((manifest.presets ?? []).some(preset =>
    preset.typeId !== manifest.identity.typeId || !preset.presetId || !preset.labelKey ||
    !versionMatches(manifest.identity.version, preset.compatibleVersionRange) ||
    (preset.bindingHint && !manifest.resolution.allowedBindings.includes(preset.bindingHint.kind))
  )) throw new NodeContractError("NODE_PRESET_INVALID");
  if ((manifest.presets ?? []).some(preset => preset.configOverrides && !configValidator(preset.configOverrides)))
    throw new NodeContractError("NODE_PRESET_INVALID");
  if (new Set((manifest.presets ?? []).map(preset => preset.presetId)).size !== (manifest.presets ?? []).length)
    throw new NodeContractError("NODE_PRESET_INVALID");
  const migrationInvalid = manifest.migrations !== undefined &&
    (!Array.isArray(manifest.migrations) || manifest.migrations.some(migration => {
      if (!isRecord(migration)) return true;
      return migration.typeId !== manifest.identity.typeId || typeof migration.fromVersionRange !== "string" || !migration.fromVersionRange.trim() ||
        typeof migration.toVersion !== "string" || !migration.toVersion.trim() || migration.deterministic !== true || typeof migration.packageDigest !== "string" || !/^[a-f0-9]{64}$/i.test(migration.packageDigest) ||
        (migration.configMigratorRef !== undefined && typeof migration.configMigratorRef !== "string") ||
        (migration.bindingMigratorRef !== undefined && typeof migration.bindingMigratorRef !== "string") ||
        (migration.portMap !== undefined && (!isRecord(migration.portMap) || Object.values(migration.portMap).some(value => value !== null && typeof value !== "string")));
    }));
  if (migrationInvalid)
    throw new NodeContractError("NODE_MIGRATION_INVALID");
  if (manifest.resolution.required && manifest.resolution.allowedBindings.length === 0)
    throw new NodeContractError("NODE_BINDING_CONTRACT_INVALID");
  if (!isCoreType && (!manifest.identity.extensionProvenance ||
      !/^[a-f0-9]{64}$/i.test(manifest.identity.extensionProvenance.packageDigest) ||
      !manifest.identity.extensionProvenance.hostApiVersion ||
      !["verified", "approved", "quarantined"].includes(manifest.identity.extensionProvenance.trustStatus) ||
      manifest.identity.extensionProvenance.uiIsolation !== "sandboxed"))
    throw new NodeContractError("NODE_EXTENSION_PROVENANCE_INVALID");
  if (!isCoreType && (!manifest.extensionAdmission || !evaluateNodeTypeAdmission(manifest.extensionAdmission).admitted))
    throw new NodeContractError("NODE_TYPE_ADMISSION_REQUIRED");
  return true;
}

export class NodeTypeRegistry {
  private readonly manifests = new Map<string, NodeTypeManifest>();
  private readonly historicalManifests = new Map<string, NodeTypeManifest>();

  constructor(manifests: readonly NodeTypeManifest[] = []) {
    for (const manifest of manifests) this.register(manifest);
  }

  register(manifest: NodeTypeManifest, admission?: NodeTypeAdmissionInput): void {
    const isCoreType = CORE_NODE_TYPE_IDS.includes(
      manifest.identity.typeId as (typeof CORE_NODE_TYPE_IDS)[number]
    );
    if (!isCoreType && !admission)
      throw new NodeContractError("NODE_TYPE_ADMISSION_REQUIRED");
    if (admission && !evaluateNodeTypeAdmission(admission).admitted)
      throw new NodeContractError("NODE_TYPE_ADMISSION_REJECTED");
    if (!isCoreType && stableStringify(admission) !== stableStringify(manifest.extensionAdmission))
      throw new NodeContractError("NODE_TYPE_ADMISSION_MISMATCH");
    validateNodeTypeManifest(manifest);
    const key = `${manifest.identity.typeId}@${manifest.identity.version}`;
    if (this.manifests.has(key)) throw new NodeContractError("NODE_TYPE_DUPLICATE");
    if (this.historicalManifests.has(key)) throw new NodeContractError("NODE_TYPE_DUPLICATE");
    this.manifests.set(key, deepFreeze(structuredClone(manifest)));
  }

  archiveHistorical(manifest: NodeTypeManifest, admission?: NodeTypeAdmissionInput): void {
    const isCoreType = CORE_NODE_TYPE_IDS.includes(
      manifest.identity.typeId as (typeof CORE_NODE_TYPE_IDS)[number]
    );
    if (!isCoreType && !admission)
      throw new NodeContractError("NODE_TYPE_ADMISSION_REQUIRED");
    if (admission && !evaluateNodeTypeAdmission(admission).admitted)
      throw new NodeContractError("NODE_TYPE_ADMISSION_REJECTED");
    if (!isCoreType && stableStringify(admission) !== stableStringify(manifest.extensionAdmission))
      throw new NodeContractError("NODE_TYPE_ADMISSION_MISMATCH");
    validateNodeTypeManifest(manifest);
    const key = `${manifest.identity.typeId}@${manifest.identity.version}`;
    if (this.manifests.has(key) || this.historicalManifests.has(key))
      throw new NodeContractError("NODE_TYPE_DUPLICATE");
    this.historicalManifests.set(key, deepFreeze(structuredClone(manifest)));
  }

  get(typeId: string, version: string): NodeTypeManifest | undefined {
    return this.manifests.get(`${typeId}@${version}`);
  }

  getHistorical(typeId: string, version: string): NodeTypeManifest | undefined {
    return this.historicalManifests.get(`${typeId}@${version}`);
  }

  entries(): NodeTypeManifest[] {
    return [...this.manifests.values()];
  }

  search(input: { query?: string; family?: NodeTypeFamily; limit?: number }): NodeTypeManifest[] {
    const query = input.query?.trim().toLowerCase();
    const matches = this.entries().filter(manifest => {
      if (input.family && manifest.semantic.family !== input.family) return false;
      if (!query) return true;
      const haystack = [
        manifest.identity.typeId,
        manifest.semantic.family,
        manifest.semantic.summary,
        ...manifest.aiBuilder.capabilities,
        ...manifest.aiBuilder.intents,
        ...manifest.aiBuilder.inputConcepts,
        ...manifest.aiBuilder.outputConcepts,
        manifest.aiBuilder.retrievalSummary,
      ].join(" ").toLowerCase();
      return query.split(/\s+/).every(token => haystack.includes(token));
    });
    matches.sort((left, right) => left.identity.typeId.localeCompare(right.identity.typeId) ||
      left.identity.version.localeCompare(right.identity.version));
    const limit = input.limit === undefined ? matches.length : Math.max(0, Math.min(100, Math.floor(input.limit)));
    return matches.slice(0, limit);
  }

  getCompatiblePresets(typeId: string, version: string): NodePreset[] {
    return (this.get(typeId, version)?.presets ?? []).filter(preset =>
      preset.typeId === typeId && versionMatches(version, preset.compatibleVersionRange)
    );
  }

  getBindingRequirements(typeId: string, version: string): NodeTypeManifest["resolution"] {
    const manifest = this.get(typeId, version);
    if (!manifest) throw new NodeContractError("NODE_TYPE_UNKNOWN");
    return manifest.resolution;
  }
}

export const canonicalNodeTypeRegistry = new NodeTypeRegistry(
  CORE_NODE_TYPE_IDS.map(buildManifest)
);

export function getNodeTypeManifest(typeId: string, version: string): NodeTypeManifest {
  const manifest = canonicalNodeTypeRegistry.get(typeId, version);
  if (!manifest) {
    if (canonicalNodeTypeRegistry.entries().some(item => item.identity.typeId === typeId))
      throw new NodeContractError("NODE_TYPE_VERSION_UNSUPPORTED");
    throw new NodeContractError("NODE_TYPE_UNKNOWN");
  }
  return manifest;
}

export function searchNodeTypes(input: {
  query?: string;
  family?: NodeTypeFamily;
  limit?: number;
}): NodeTypeManifest[] {
  return canonicalNodeTypeRegistry.search(input);
}

export function getNodeTypeCoverageMetadata(typeId: string, version: string): {
  typeId: string;
  version: string;
  family: NodeTypeFamily;
  coverageIntents: string[];
  bindingKinds: NodeBindingKind[];
  requiredBinding: boolean;
  runtimePlacements: string[];
} {
  const manifest = getNodeTypeManifest(typeId, version);
  return {
    typeId,
    version,
    family: manifest.semantic.family,
    coverageIntents: [...manifest.aiBuilder.intents],
    bindingKinds: [...manifest.resolution.allowedBindings],
    requiredBinding: manifest.resolution.required,
    runtimePlacements: [...(manifest.runtimeRequirement.placements ?? [])],
  };
}

export type NodePortProjectionInput = {
  binding?: NodeBindingRef;
  config: Record<string, unknown>;
  resolvedPorts?: {
    inputs: Array<Omit<NodePort, "id"> & { id?: string; semanticName?: string }>;
    outputs: Array<Omit<NodePort, "id"> & { id?: string; semanticName?: string }>;
  };
};

export function stableDerivedPortId(input: {
  typeId: string;
  resolverVersion: string;
  bindingRef: string;
  direction: "input" | "output";
  semanticName: string;
}): string {
  const semanticName = input.semanticName.trim();
  if (!semanticName || !input.bindingRef.trim() || !input.resolverVersion.trim())
    throw new NodeContractError("NODE_PORT_DERIVATION_INVALID");
  const digest = createHash("sha256")
    .update(`${input.typeId}\0${input.resolverVersion}\0${input.bindingRef}\0${input.direction}\0${semanticName}`, "utf8")
    .digest("hex")
    .slice(0, 20);
  return `derived-${input.direction}-${digest}`;
}

export function projectNodePortContract(
  manifest: NodeTypeManifest,
  input: NodePortProjectionInput
): { inputs: NodePort[]; outputs: NodePort[] } {
  validateNodeTypeManifest(manifest);
  if (!input.config || typeof input.config !== "object" || Array.isArray(input.config))
    throw new NodeContractError("NODE_CONFIG_INVALID");
  assertConfigMatchesSchema(manifest.config.schema, input.config);
  if (manifest.resolution.required && !input.binding)
    throw new NodeContractError("NODE_BINDING_REQUIRED");
  if (input.binding && !manifest.resolution.allowedBindings.includes(input.binding.kind))
    throw new NodeContractError("NODE_BINDING_KIND_INVALID");
  if (input.binding && !input.binding.ref.trim())
    throw new NodeContractError("NODE_BINDING_INVALID");
  if (input.binding?.versionPolicy &&
      (!["exact", "range", "latest-compatible"].includes(input.binding.versionPolicy.mode) ||
       (input.binding.versionPolicy.mode !== "latest-compatible" && !input.binding.versionPolicy.value?.trim())))
    throw new NodeContractError("NODE_BINDING_INVALID");
  const derivation = manifest.ports.derivation;
  if (!derivation || derivation.mode === "fixed")
    return structuredClone({ inputs: manifest.ports.inputs, outputs: manifest.ports.outputs });
  if (!input.resolvedPorts)
    throw new NodeContractError("NODE_PORT_DERIVATION_UNRESOLVED");
  const bindingRef = input.binding?.ref ?? "config-derived";
  const mapPorts = (
    ports: Array<Omit<NodePort, "id"> & { id?: string; semanticName?: string }>,
    direction: "input" | "output"
  ): NodePort[] => ports.map(port => {
    if (port.direction !== direction || !["data", "control", "error", "event"].includes(port.channel) ||
        !["one", "many", undefined].includes(port.cardinality) ||
        !["single", "multi", undefined].includes(port.connectionPolicy) ||
        !["value", "artifact-ref", "stream", "event-envelope", undefined].includes(port.payloadMode) ||
        (port.required !== undefined && typeof port.required !== "boolean"))
      throw new NodeContractError("NODE_PORT_CONTRACT_INVALID");
    if (port.schema) getSchemaValidator(port.schema, "NODE_PORT_SCHEMA_INVALID");
    const semanticName = port.semanticName;
    if (!semanticName || !derivation.resolverVersion)
      throw new NodeContractError("NODE_PORT_DERIVATION_INVALID");
    const expectedId = stableDerivedPortId({
      typeId: manifest.identity.typeId,
      resolverVersion: derivation.resolverVersion,
      bindingRef,
      direction,
      semanticName,
    });
    if (port.id && port.id !== expectedId)
      throw new NodeContractError("NODE_PORT_ID_UNSTABLE");
    return {
      ...structuredClone(port),
      id: expectedId,
    } as NodePort;
  });
  const projected = {
    inputs: mapPorts(input.resolvedPorts.inputs, "input"),
    outputs: mapPorts(input.resolvedPorts.outputs, "output"),
  };
  const ids = [...projected.inputs, ...projected.outputs].map(port => port.id);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length)
    throw new NodeContractError("NODE_PORT_CONTRACT_INVALID");
  for (const projectedPort of [...projected.inputs, ...projected.outputs]) {
    if (!/^derived-(?:input|output)-[a-f0-9]{20}$/.test(projectedPort.id))
      throw new NodeContractError("NODE_PORT_ID_UNSTABLE");
  }
  return projected;
}

export function validateNodePortPayload(
  manifest: NodeTypeManifest,
  direction: "input" | "output",
  portId: string,
  payload: unknown,
  config: Record<string, unknown> = {},
): true {
  validateNodeTypeManifest(manifest);
  const ports = direction === "input" ? manifest.ports.inputs : manifest.ports.outputs;
  const selected = ports.find(item => item.id === portId);
  if (!selected) throw new NodeContractError("NODE_PORT_UNKNOWN");
  if (selected.schema && !getSchemaValidator(selected.schema, "NODE_PORT_SCHEMA_INVALID")(payload))
    throw new NodeContractError("NODE_PORT_PAYLOAD_INVALID");
  if (manifest.identity.typeId === "data.retrieval" && direction === "output") {
    const evidence = (payload as { evidence: Array<{ candidateOnly?: boolean }> }).evidence;
    if (config.intent === "SKILL_DISCOVERY" && evidence.some(item => item.candidateOnly !== true))
      throw new NodeContractError("RETRIEVAL_CANDIDATE_AUTHORITY_FORBIDDEN");
  }
  return true;
}

export type NodeTypeAdmissionInput = {
  semanticUnique: boolean;
  graphSemanticImpact: boolean;
  contractUnique: boolean;
  authoringValue: boolean;
  providerNeutral: boolean;
  stableMeaning: boolean;
  useCaseEvidence: boolean;
  capabilitySubstitutionAvailable: boolean;
  bindingPolicySubstitutionAvailable: boolean;
  compositionSubstitutionAvailable: boolean;
  evidence: {
    semanticRationale: string;
    useCaseReferences: string[];
    reviewer: string;
    recordedAt: string;
  };
};

export type NodeTypeAdmissionCheck = keyof NodeTypeAdmissionInput;

export function evaluateNodeTypeAdmission(input: NodeTypeAdmissionInput): {
  admitted: boolean;
  failedChecks: Array<{ check: NodeTypeAdmissionCheck | "evidence"; reason: string }>;
} {
  const requiredTrue: NodeTypeAdmissionCheck[] = [
    "semanticUnique",
    "graphSemanticImpact",
    "contractUnique",
    "authoringValue",
    "providerNeutral",
    "stableMeaning",
    "useCaseEvidence",
  ];
  const requiredFalse: NodeTypeAdmissionCheck[] = [
    "capabilitySubstitutionAvailable",
    "bindingPolicySubstitutionAvailable",
    "compositionSubstitutionAvailable",
  ];
  const failedChecks: Array<{ check: NodeTypeAdmissionCheck | "evidence"; reason: string }> = [
    ...requiredTrue.filter(key => input[key] !== true).map(check => ({ check, reason: `${check} must be evidenced as true` })),
    ...requiredFalse.filter(key => input[key] !== false).map(check => ({ check, reason: `${check} must be evidenced as false` })),
  ];
  if (!input.evidence || input.evidence.semanticRationale.trim().length < 20 ||
      !input.evidence.reviewer.trim() || !Number.isFinite(Date.parse(input.evidence.recordedAt)) ||
      !input.evidence.useCaseReferences.length)
    failedChecks.push({ check: "evidence", reason: "Admission needs rationale, reviewer, timestamp, and use-case references" });
  return { admitted: failedChecks.length === 0, failedChecks };
}

function assertConfigMatchesSchema(schema: JsonSchema202012, config: Record<string, unknown>): void {
  const validate = getSchemaValidator(schema, "NODE_CONFIG_SCHEMA_INVALID");
  if (!validate(config)) throw new NodeContractError("NODE_CONFIG_SCHEMA_INVALID");
}

function containsKey(value: unknown, pattern: RegExp): boolean {
  if (Array.isArray(value)) return value.some(item => containsKey(item, pattern));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => pattern.test(key) || containsKey(child, pattern)
  );
}

export function validateNodeInstance(
  instance: NodeInstance,
  registry: NodeTypeRegistry = canonicalNodeTypeRegistry
): true {
  if (!instance || typeof instance !== "object" || Array.isArray(instance))
    throw new NodeContractError("NODE_INSTANCE_INVALID");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(instance.id))
    throw new NodeContractError("NODE_INSTANCE_INVALID");
  if (!instance.config || typeof instance.config !== "object" || Array.isArray(instance.config))
    throw new NodeContractError("NODE_CONFIG_INVALID");
  if (containsKey(instance.config, SECRET_KEY))
    throw new NodeContractError("NODE_SECRET_CONFIG_FORBIDDEN");
  if (containsKey(instance.config, RUNTIME_KEY) || containsKey(instance.metadata, RUNTIME_KEY) || containsKey(instance.binding?.constraints, RUNTIME_KEY))
    throw new NodeContractError("NODE_RUNTIME_STATE_FORBIDDEN");
  if (containsKey(instance.metadata, SECRET_KEY) || containsKey(instance.binding, SECRET_KEY))
    throw new NodeContractError("NODE_SECRET_CONFIG_FORBIDDEN");
  const manifest = registry.get(instance.typeId, instance.typeVersion);
  if (!manifest) {
    if (registry.entries().some(item => item.identity.typeId === instance.typeId))
      throw new NodeContractError("NODE_TYPE_VERSION_UNSUPPORTED");
    throw new NodeContractError("NODE_TYPE_UNKNOWN");
  }
  validateNodeTypeManifest(manifest);
  assertConfigMatchesSchema(manifest.config.schema, instance.config);
  if (manifest.resolution.required && !instance.binding)
    throw new NodeContractError("NODE_BINDING_REQUIRED");
  if (instance.binding && !manifest.resolution.allowedBindings.includes(instance.binding.kind))
    throw new NodeContractError("NODE_BINDING_KIND_INVALID");
  if (instance.binding && (!instance.binding.ref || instance.binding.ref.length > 256))
    throw new NodeContractError("NODE_BINDING_INVALID");
  if (instance.binding && /(?:\.default|^default$|placeholder|unknown)/i.test(instance.binding.ref))
    throw new NodeContractError("NODE_BINDING_UNRESOLVED");
  if (instance.binding?.versionPolicy &&
      (!["exact", "range", "latest-compatible"].includes(instance.binding.versionPolicy.mode) ||
       (instance.binding.versionPolicy.mode !== "latest-compatible" && !instance.binding.versionPolicy.value?.trim())))
    throw new NodeContractError("NODE_BINDING_INVALID");
  if (instance.binding?.selection && !["pinned", "auto"].includes(instance.binding.selection))
    throw new NodeContractError("NODE_BINDING_INVALID");
  if (instance.binding?.constraints && (typeof instance.binding.constraints !== "object" || Array.isArray(instance.binding.constraints)))
    throw new NodeContractError("NODE_BINDING_INVALID");
  if (instance.presetId && !registry.getCompatiblePresets(instance.typeId, instance.typeVersion).some(preset => preset.presetId === instance.presetId))
    throw new NodeContractError("NODE_PRESET_INVALID");
  if (instance.label !== undefined && (typeof instance.label !== "string" || instance.label.length > 256))
    throw new NodeContractError("NODE_INSTANCE_INVALID");
  if (instance.position && (!Number.isFinite(instance.position.x) || !Number.isFinite(instance.position.y)))
    throw new NodeContractError("NODE_INSTANCE_INVALID");
  if (instance.size && (!Number.isFinite(instance.size.width) || !Number.isFinite(instance.size.height) || instance.size.width <= 0 || instance.size.height <= 0))
    throw new NodeContractError("NODE_INSTANCE_INVALID");
  if (instance.metadata && (typeof instance.metadata !== "object" || Array.isArray(instance.metadata)))
    throw new NodeContractError("NODE_INSTANCE_INVALID");
  return true;
}
