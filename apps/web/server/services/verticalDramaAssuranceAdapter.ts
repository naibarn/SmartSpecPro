import {
  OrchestraAssuranceRequestSchema,
  type OrchestraAssuranceResult,
  type OrchestraRuntimeBudget,
  type OrchestraAssuranceRequest,
  type OrchestraSideEffectAuthorization,
} from "../../shared/agentRuntime/orchestraSchemas";
import { FEATURE_FLAG_DEFAULTS, type TenantFeatureFlags } from "../../shared/featureFlags";
import {
  VerticalDramaAssuranceRequestSchema,
  VerticalDramaAssuranceResultSchema,
  VerticalDramaAgentProposalSchema,
  VERTICAL_DRAMA_RUNTIME_TASK_MAP,
  mapVerticalDramaTaskToRuntimeCapability,
  type VerticalDramaAssuranceCapabilityManifest,
  type VerticalDramaAssuranceErrorCode,
  type VerticalDramaAssuranceFinding,
  type VerticalDramaAssuranceMode,
  type VerticalDramaAssuranceRequest,
  type VerticalDramaAssuranceResult,
  type VerticalDramaAgentProposal,
  type VerticalDramaAssuranceReadiness,
} from "../../shared/verticalDramaSeries/assurance";
import type {
  AgentRuntimeRequest,
  AgentRuntimeResponse,
  AgentRuntimeStatus,
  RuntimeModelConfig,
} from "../../shared/agentRuntime/types";
import type { ProductionContextSnapshot } from "../../shared/verticalDramaSeries/verticalDramaAssuranceContext";
import {
  validateProductionContextAdmission,
  type ProductionContextOwner,
} from "./verticalDramaProductionContext";
import { AgentRuntimeClient, AgentRuntimeClientError } from "./agentRuntime/client";
import {
  executeSharedSkillRuntime,
} from "./agentRuntime/skillRuntimeOrchestrator";
import {
  getOpenAiAgentsRuntimeFlagSnapshot,
  type AgentRuntimeSelection,
  type OpenAiAgentsRuntimeFlagSnapshot,
} from "./agentRuntime/runtimeSelection";
import { assertOrchestraFinalGate, type OrchestraFinalGateInput } from "./agentRuntime/orchestraFinalGate";

export type VerticalDramaAssuranceFlagSnapshot = Pick<
  TenantFeatureFlags,
  | "verticalDramaAssuranceShadow"
  | "verticalDramaDraftQcOrchestraActive"
  | "verticalDramaPromptQcOrchestraActive"
  | "verticalDramaStoryAssuranceActive"
  | "verticalDramaAssuranceKillSwitch"
>;

const FLAG_KEYS = [
  "verticalDramaAssuranceShadow",
  "verticalDramaDraftQcOrchestraActive",
  "verticalDramaPromptQcOrchestraActive",
  "verticalDramaStoryAssuranceActive",
  "verticalDramaAssuranceKillSwitch",
] as const;

export function getVerticalDramaAssuranceFlagSnapshot(
  flags: Partial<TenantFeatureFlags> | null | undefined
): VerticalDramaAssuranceFlagSnapshot {
  return Object.fromEntries(
    FLAG_KEYS.map(key => [key, flags?.[key] === true || (flags?.[key] == null && FEATURE_FLAG_DEFAULTS[key] === true)])
  ) as VerticalDramaAssuranceFlagSnapshot;
}

function taskActive(task: VerticalDramaAssuranceRequest["taskKind"], flags: VerticalDramaAssuranceFlagSnapshot): boolean {
  if (["premise_expansion", "story_architecture", "full_story", "season_qc"].includes(task)) return flags.verticalDramaStoryAssuranceActive;
  if (["draft_qc", "draft_repair"].includes(task)) return flags.verticalDramaDraftQcOrchestraActive;
  return flags.verticalDramaPromptQcOrchestraActive;
}

export function selectVerticalDramaAssuranceMode(
  task: VerticalDramaAssuranceRequest["taskKind"],
  flags: VerticalDramaAssuranceFlagSnapshot
): VerticalDramaAssuranceMode {
  if (flags.verticalDramaAssuranceKillSwitch) return "legacy_deterministic";
  if (taskActive(task, flags)) return "agent_active";
  if (flags.verticalDramaAssuranceShadow) return "agent_shadow";
  return "legacy_deterministic";
}

type AdmissionFailure = { ok: false; finding: VerticalDramaAssuranceFinding };
export type VerticalDramaAssuranceAdmission =
  | { ok: true; request: VerticalDramaAssuranceRequest; mode: VerticalDramaAssuranceMode }
  | AdmissionFailure;

function finding(code: VerticalDramaAssuranceErrorCode, message: string): AdmissionFailure {
  return { ok: false, finding: { code, message } };
}

export function admitVerticalDramaAssuranceRequest(input: {
  owner: ProductionContextOwner;
  expectedOwner?: ProductionContextOwner | null;
  snapshot: ProductionContextSnapshot;
  request: unknown;
  manifest: VerticalDramaAssuranceCapabilityManifest | null | undefined;
  oneTimeAuthorization?: OrchestraSideEffectAuthorization | null;
  flags?: Partial<TenantFeatureFlags> | null;
}): VerticalDramaAssuranceAdmission {
  const rawRequest = input.request as Record<string, unknown>;
  const rawContext = rawRequest?.contextSnapshotRef;
  const normalizedInput = rawContext && typeof rawContext === "object"
    ? {
        ...rawRequest,
        contextSnapshotRef: {
          snapshotId: (rawContext as Record<string, unknown>).snapshotId,
          revision: (rawContext as Record<string, unknown>).revision,
          fingerprint: (rawContext as Record<string, unknown>).fingerprint,
        },
      }
    : input.request;
  const parsed = VerticalDramaAssuranceRequestSchema.safeParse(normalizedInput);
  if (!parsed.success) {
    const missingContext = parsed.error.issues.some(issue => issue.path[0] === "contextSnapshotRef");
    return finding(missingContext ? "VD_ASSURANCE_CONTEXT_MISSING" : "VD_ASSURANCE_REQUEST_INVALID", "Assurance request does not satisfy the versioned contract");
  }
  const request = parsed.data;
  if (request.tenantId !== input.owner.tenantId || String(request.userId) !== String(input.owner.userId)) {
    return finding("VD_ASSURANCE_TENANT_MISMATCH", "Request owner does not match the authoritative owner");
  }
  const contextFinding = validateProductionContextAdmission({
    owner: input.owner, expectedOwner: input.expectedOwner, snapshot: input.snapshot,
    contextRef: request.contextSnapshotRef, sourceRef: request.sourceRef,
    requiredReadiness: request.requiredReadiness,
  });
  if (contextFinding) return finding(contextFinding.code, contextFinding.message);
  if (!input.manifest) return finding("VD_ASSURANCE_CAPABILITY_UNAVAILABLE", "A compatible runtime capability manifest is required");
  const mapping = mapVerticalDramaTaskToRuntimeCapability(request.taskKind, input.manifest);
  if (!mapping.ok) return mapping;
  if (request.runtimeTaskKind !== mapping.mapping.runtimeTaskKind) return finding("VD_ASSURANCE_TASK_UNMAPPED", "Request runtime task does not match the canonical domain mapping");
  if (request.sideEffectPolicy === "provider_ready" && !input.oneTimeAuthorization) {
    return finding("VD_ASSURANCE_SIDE_EFFECT_POLICY_INVALID", "Provider-ready assurance requires a one-time authorization from a later final gate");
  }
  return { ok: true, request, mode: selectVerticalDramaAssuranceMode(request.taskKind, getVerticalDramaAssuranceFlagSnapshot(input.flags)) };
}

export function toOrchestraAssuranceRequest(
  request: VerticalDramaAssuranceRequest,
  options: { sideEffectAuthorization?: OrchestraSideEffectAuthorization | null } = {}
): OrchestraAssuranceRequest {
  const mapping = VERTICAL_DRAMA_RUNTIME_TASK_MAP[request.taskKind];
  const sideEffectPolicy = request.sideEffectPolicy === "none" ? "read_only" : request.sideEffectPolicy === "candidate_only" ? "approval_required" : "mutating_allowed";
  return OrchestraAssuranceRequestSchema.parse({
    contractVersion: 1,
    contractId: `vertical-drama-assurance:${request.taskKind}:${request.contractVersion}`,
    attemptId: request.attemptId,
    taskKind: request.runtimeTaskKind,
    contractHash: request.contextSnapshotRef.fingerprint,
    evidencePolicy: { requiredPurposes: [], requireVisionFor: [], allowTextOnlyFallback: true, maxEvidenceItems: request.inputRefs.length, minQualityScore: 0 },
    evidence: request.inputRefs.map(ref => ({ ref, purpose: "vertical_drama_context", readable: true, resolution: "unknown", unresolvedPeople: 0, trusted: true })),
    outputContract: { schemaRef: mapping.outputSchemaRef, requiredFields: ["schemaRef", "taskKind", "attemptId", "contextFingerprint", "inputRefs"], maxChars: null },
    budget: request.budget,
    rulePackIds: request.rulePackIds,
    sideEffectPolicy,
    sideEffectAuthorization: options.sideEffectAuthorization ?? null,
    repairAttempts: 0,
  });
}

export type VerticalDramaRuntimeBoundary = "advisory" | "activation" | "paid" | "export";

export interface VerticalDramaRuntimeDispatchInput<TLegacy> {
  request: VerticalDramaAssuranceRequest;
  durableAttempt: {
    executionId: string;
    attemptId: string;
    requestId: string;
    idempotencyKey: string;
    fenceToken: string;
    frozenMode: VerticalDramaAssuranceMode;
  };
  boundary: VerticalDramaRuntimeBoundary;
  context: ProductionContextSnapshot;
  skillSlugs: string[];
  modelConfig: RuntimeModelConfig;
  legacyExecute: () => Promise<TLegacy>;
  legacyNormalize: (value: TLegacy) => Promise<VerticalDramaAgentProposal>;
}

export interface VerticalDramaRuntimeUsage {
  turns: number;
  toolCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  wallClockMs: number;
  providerUsageKnown: boolean;
  budgetExceededField: keyof OrchestraRuntimeBudget | null;
}

export interface VerticalDramaRuntimeEvidence {
  runtimeStatus: AgentRuntimeStatus | "legacy" | "shadow_skipped";
  orchestraState: OrchestraAssuranceResult["state"] | null;
  structuredOutputValid: boolean;
  domainPostValidation: "not_run" | "passed" | "failed";
  domainReadiness: VerticalDramaAssuranceReadiness | null;
  traceId: string | null;
  providerCallId: string | null;
  usage: VerticalDramaRuntimeUsage;
}

export interface VerticalDramaRuntimeFallback {
  eligible: boolean;
  executed: boolean;
  from: "agent_active" | "agent_shadow" | null;
  to: "legacy_deterministic" | null;
  reasonCode: VerticalDramaAssuranceErrorCode | null;
  callOrdinal: number | null;
}

export interface VerticalDramaRuntimeDispatchResult {
  proposal: VerticalDramaAgentProposal | null;
  runtimeRequest: AgentRuntimeRequest | null;
  runtimeResponse: AgentRuntimeResponse | null;
  runtimeEvidence: VerticalDramaRuntimeEvidence;
  fallback: VerticalDramaRuntimeFallback;
}

export interface VerticalDramaRuntimeCapabilitySnapshot {
  adapterVersion: string;
  sdkVersion: string | null;
  runtimeContractSupported: boolean;
  outputSchemaSupported: boolean;
  productionSafeTracing: boolean;
  checkedAt: string;
}

export interface VerticalDramaRuntimeDispatchDependencies {
  flags?: Partial<TenantFeatureFlags> | null;
  client?: Pick<AgentRuntimeClient, "run" | "health">;
  activationGate?: Parameters<typeof executeSharedSkillRuntime>[0]["activationGate"];
  domainPostValidator?: (proposal: VerticalDramaAgentProposal) => boolean | Promise<boolean>;
}

class VerticalDramaRuntimeError extends Error {
  constructor(readonly code: VerticalDramaAssuranceErrorCode, message: string, readonly usageUnknown = false) {
    super(message);
    this.name = "VerticalDramaRuntimeError";
  }
}

const HEALTH_CACHE_MS = 30_000;
const capabilityCache = new WeakMap<object, { expiresAt: number; bySchema: Map<string, VerticalDramaRuntimeCapabilitySnapshot> }>();

function emptyUsage(): VerticalDramaRuntimeUsage {
  return { turns: 0, toolCalls: 0, inputTokens: null, outputTokens: null, wallClockMs: 0, providerUsageKnown: false, budgetExceededField: null };
}

function runtimeUsage(response: AgentRuntimeResponse | null): VerticalDramaRuntimeUsage {
  const raw = response?.traceMetadata?.assuranceUsage;
  const usage = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const number = (key: string) => typeof usage[key] === "number" && Number.isFinite(usage[key]) ? usage[key] as number : null;
  return {
    turns: number("turns") ?? 0,
    toolCalls: number("toolCalls") ?? response?.toolCallsMade.length ?? 0,
    inputTokens: number("inputTokens"), outputTokens: number("outputTokens"),
    wallClockMs: number("wallClockMs") ?? 0,
    providerUsageKnown: usage.providerUsageKnown === true,
    budgetExceededField: typeof usage.budgetExceededField === "string" ? usage.budgetExceededField as keyof OrchestraRuntimeBudget : null,
  };
}

function runtimeEvidence(response: AgentRuntimeResponse | null, structuredOutputValid = false, domainPostValidation: VerticalDramaRuntimeEvidence["domainPostValidation"] = "not_run"): VerticalDramaRuntimeEvidence {
  return {
    runtimeStatus: response?.status ?? "legacy",
    orchestraState: response?.assurance?.state ?? null,
    structuredOutputValid,
    domainPostValidation,
    // Python's provider_ready only means its bounded stage completed.  No Node
    // domain readiness is inferred until the independent domain final gate runs.
    domainReadiness: null,
    traceId: response?.traceId ?? null,
    providerCallId: typeof response?.traceMetadata?.providerCallId === "string" ? response.traceMetadata.providerCallId : null,
    usage: runtimeUsage(response),
  };
}

function fallback(reasonCode: VerticalDramaAssuranceErrorCode | null, eligible = false): VerticalDramaRuntimeFallback {
  return { eligible, executed: false, from: null, to: null, reasonCode, callOrdinal: null };
}

export function validateVerticalDramaStructuredOutput(
  request: VerticalDramaAssuranceRequest,
  response: AgentRuntimeResponse,
): VerticalDramaAgentProposal {
  const parsed = VerticalDramaAgentProposalSchema.safeParse(response.finalOutput);
  if (!parsed.success) throw new VerticalDramaRuntimeError("VD_ASSURANCE_OUTPUT_SCHEMA_INVALID", "Runtime output did not match the trusted structured proposal schema");
  const output = parsed.data;
  const expectedSchema = VERTICAL_DRAMA_RUNTIME_TASK_MAP[request.taskKind].outputSchemaRef;
  if (output.schemaRef !== expectedSchema || output.taskKind !== request.taskKind || output.attemptId !== request.attemptId || output.contextFingerprint !== request.contextSnapshotRef.fingerprint) {
    throw new VerticalDramaRuntimeError("VD_ASSURANCE_OUTPUT_IDENTITY_MISMATCH", "Runtime output identity did not echo the admitted request");
  }
  const allowedRefs = new Set(request.inputRefs);
  if (!output.inputRefs.every(ref => allowedRefs.has(ref)) || !output.findings.every(finding => finding.evidenceRefs.every(ref => allowedRefs.has(ref)))) {
    throw new VerticalDramaRuntimeError("VD_ASSURANCE_OUTPUT_IDENTITY_MISMATCH", "Runtime output referenced a value outside the admitted evidence set");
  }
  return output;
}

export function classifyVerticalDramaRuntimeFailure(
  error: unknown,
  boundary: VerticalDramaRuntimeBoundary,
  budgetState: { exhausted?: boolean; usageUnknown?: boolean } = {},
): { code: VerticalDramaAssuranceErrorCode; fallbackEligible: boolean } {
  if (budgetState.usageUnknown || error instanceof VerticalDramaRuntimeError && error.usageUnknown) return { code: "VD_ASSURANCE_USAGE_UNKNOWN", fallbackEligible: false };
  if (budgetState.exhausted) return { code: "VD_ASSURANCE_BUDGET_EXCEEDED", fallbackEligible: false };
  const rawCode = error instanceof VerticalDramaRuntimeError ? error.code : error instanceof AgentRuntimeClientError || error instanceof Error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const normalized = rawCode.toLowerCase();
  const code: VerticalDramaAssuranceErrorCode = normalized.includes("timeout") ? "VD_ASSURANCE_RUNTIME_TIMEOUT"
    : normalized.includes("manifest_missing") ? "VD_ASSURANCE_MANIFEST_MISSING"
    : normalized.includes("manifest") ? "VD_ASSURANCE_MANIFEST_INCOMPATIBLE"
    : normalized.includes("tool") ? "VD_ASSURANCE_TOOL_DENIED"
    : normalized.includes("recursion") ? "VD_ASSURANCE_RECURSION_LIMIT"
    : normalized.includes("schema") ? "VD_ASSURANCE_OUTPUT_SCHEMA_INVALID"
    : normalized.includes("identity") || normalized.includes("contract_hash") || normalized.includes("attempt_mismatch") ? "VD_ASSURANCE_OUTPUT_IDENTITY_MISMATCH"
    : normalized.includes("guardrail") ? "VD_ASSURANCE_GUARDRAIL_BLOCKED"
    : rawCode === "VD_ASSURANCE_OUTPUT_IDENTITY_MISMATCH" || rawCode === "VD_ASSURANCE_OUTPUT_SCHEMA_INVALID" ? rawCode
    : "VD_ASSURANCE_RUNTIME_UNAVAILABLE";
  const compromised = ["VD_ASSURANCE_MANIFEST_UNTRUSTED", "VD_ASSURANCE_OUTPUT_IDENTITY_MISMATCH", "VD_ASSURANCE_GUARDRAIL_BLOCKED", "VD_ASSURANCE_TOOL_DENIED", "VD_ASSURANCE_USAGE_UNKNOWN"].includes(code);
  return { code, fallbackEligible: boundary === "advisory" && !compromised };
}

export async function resolveVerticalDramaRuntimeCapability(
  client: Pick<AgentRuntimeClient, "health">,
  schemaRef: string,
): Promise<VerticalDramaRuntimeCapabilitySnapshot> {
  const now = Date.now();
  const cached = capabilityCache.get(client as object);
  const hit = cached?.bySchema.get(schemaRef);
  if (hit && cached && cached.expiresAt > now) return hit;
  const health = await client.health();
  const snapshot: VerticalDramaRuntimeCapabilitySnapshot = {
    adapterVersion: health.adapterVersion, sdkVersion: health.sdkVersion ?? null,
    runtimeContractSupported: health.supportedRuntimeContractVersions.includes(2),
    outputSchemaSupported: health.supportedAssuranceOutputSchemas?.includes(schemaRef) === true,
    productionSafeTracing: health.productionSafeTracing,
    checkedAt: new Date(now).toISOString(),
  };
  const bySchema = cached?.bySchema ?? new Map<string, VerticalDramaRuntimeCapabilitySnapshot>();
  bySchema.set(schemaRef, snapshot);
  capabilityCache.set(client as object, { expiresAt: now + HEALTH_CACHE_MS, bySchema });
  return snapshot;
}

function selectRuntimeMode<TLegacy>(input: VerticalDramaRuntimeDispatchInput<TLegacy>, flags?: Partial<TenantFeatureFlags> | null): VerticalDramaAssuranceMode {
  const domain = getVerticalDramaAssuranceFlagSnapshot(flags);
  const generic = getOpenAiAgentsRuntimeFlagSnapshot(flags);
  if (domain.verticalDramaAssuranceKillSwitch || generic.openAiAgentsRuntimeForceRollback) return "legacy_deterministic";
  if (input.durableAttempt.frozenMode !== "legacy_deterministic") return input.durableAttempt.frozenMode;
  const requested = selectVerticalDramaAssuranceMode(input.request.taskKind, domain);
  if (requested === "agent_active" && generic.openAiAgentsRuntimeEnabled && generic.openAiAgentsRuntimeSkillActive) return requested;
  if (requested === "agent_shadow" && generic.openAiAgentsRuntimeEnabled && generic.openAiAgentsRuntimeSkillShadow) return requested;
  return "legacy_deterministic";
}

function toFrozenSelection(mode: VerticalDramaAssuranceMode, flags?: Partial<TenantFeatureFlags> | null): AgentRuntimeSelection {
  const generic = getOpenAiAgentsRuntimeFlagSnapshot(flags);
  const runtimeMode = mode === "agent_active" ? "active" : mode === "agent_shadow" ? "shadow" : "legacy";
  return { engine: runtimeMode === "legacy" ? "legacy" : "openai_agents", mode: runtimeMode, selectionReason: "vertical_drama_durable_selection", flagSnapshot: generic as OpenAiAgentsRuntimeFlagSnapshot, frozenAtRecommendation: "already_frozen", rollbackReason: null, originSurface: "workflow", entryPoint: "system" };
}

export async function executeVerticalDramaAssuranceRuntime<TLegacy>(
  input: VerticalDramaRuntimeDispatchInput<TLegacy>,
  deps: VerticalDramaRuntimeDispatchDependencies = {},
): Promise<VerticalDramaRuntimeDispatchResult> {
  if (input.durableAttempt.attemptId !== input.request.attemptId) throw new VerticalDramaRuntimeError("VD_ASSURANCE_OUTPUT_IDENTITY_MISMATCH", "Durable attempt does not match assurance request");
  const selectedMode = selectRuntimeMode(input, deps.flags);
  const executeLegacy = async () => input.legacyNormalize(await input.legacyExecute());
  if (selectedMode === "legacy_deterministic") {
    const proposal = await executeLegacy();
    return { proposal, runtimeRequest: null, runtimeResponse: null, runtimeEvidence: runtimeEvidence(null), fallback: fallback(null) };
  }

  const client = deps.client ?? new AgentRuntimeClient();
  const assurance = toOrchestraAssuranceRequest(input.request);
  try {
    const capability = await resolveVerticalDramaRuntimeCapability(client, assurance.outputContract.schemaRef);
    if (!capability.runtimeContractSupported || !capability.outputSchemaSupported || !capability.productionSafeTracing) {
      throw new VerticalDramaRuntimeError("VD_ASSURANCE_MANIFEST_INCOMPATIBLE", "Runtime health does not advertise the required trusted output capability");
    }
    const result = await executeSharedSkillRuntime<VerticalDramaAgentProposal, VerticalDramaAgentProposal>({
      tenantId: input.request.tenantId,
      userId: typeof input.request.userId === "number" ? input.request.userId : Number(input.request.userId),
      objective: `Vertical Drama assurance ${input.request.taskKind}`,
      originSurface: "workflow", entryPoint: "system", modelConfig: input.modelConfig,
      skillSlugs: input.skillSlugs, requestId: input.durableAttempt.requestId, idempotencyKey: input.durableAttempt.idempotencyKey,
      frozenSelection: toFrozenSelection(selectedMode, deps.flags), requestedOperationMode: selectedMode === "agent_active" ? "active" : "shadow",
      assurance, featureFlags: deps.flags, activationGate: deps.activationGate,
      legacyExecute: executeLegacy,
      activeTransform: response => validateVerticalDramaStructuredOutput(input.request, response),
    });
    const proposal = result.value;
    const response = result.runtimeResponse;
    const postValid = await (deps.domainPostValidator?.(proposal) ?? true);
    if (!postValid) throw new VerticalDramaRuntimeError("VD_ASSURANCE_FINAL_GATE_BLOCKED", "Domain post-validation rejected the structured proposal");
    return {
      proposal, runtimeRequest: result.runtimeRequest, runtimeResponse: response,
      runtimeEvidence: runtimeEvidence(response, response != null, "passed"),
      fallback: { eligible: false, executed: false, from: selectedMode === "agent_shadow" ? "agent_shadow" : null, to: null, reasonCode: result.runtime.errorCode as VerticalDramaAssuranceErrorCode | null, callOrdinal: null },
    };
  } catch (error) {
    const classified = classifyVerticalDramaRuntimeFailure(error, input.boundary);
    if (classified.fallbackEligible) {
      const proposal = await executeLegacy();
      return {
        proposal, runtimeRequest: null, runtimeResponse: null, runtimeEvidence: runtimeEvidence(null),
        fallback: { eligible: true, executed: true, from: "agent_active", to: "legacy_deterministic", reasonCode: classified.code, callOrdinal: 2 },
      };
    }
    return {
      proposal: null, runtimeRequest: null, runtimeResponse: null, runtimeEvidence: runtimeEvidence(null),
      fallback: { eligible: false, executed: false, from: "agent_active", to: null, reasonCode: classified.code, callOrdinal: null },
    };
  }
}

export function assertVerticalDramaDomainFinalGate(input: OrchestraFinalGateInput & {
  contextCurrent: boolean;
  requiredModeSatisfied: boolean;
  domainReadiness: VerticalDramaAssuranceReadiness;
  requiredReadiness: VerticalDramaAssuranceReadiness;
  billingAuthorized: boolean;
  candidateCasReady: boolean;
}): OrchestraAssuranceResult {
  const runtimeResult = assertOrchestraFinalGate(input);
  const rank: Record<VerticalDramaAssuranceReadiness, number> = { draft: 0, verified: 1, provider_ready: 2, production_ready: 3 };
  if (!input.contextCurrent || !input.requiredModeSatisfied || !input.billingAuthorized || !input.candidateCasReady || rank[input.domainReadiness] < rank[input.requiredReadiness]) {
    throw new VerticalDramaRuntimeError("VD_ASSURANCE_FINAL_GATE_BLOCKED", "Runtime provider readiness did not satisfy the independent Vertical Drama final gate");
  }
  return runtimeResult;
}

export function normalizeVerticalDramaAssuranceResult(input: {
  attemptId: string;
  executionId: string;
  runtimeState?: "admitted" | "planned" | "running" | "verifying" | "repairing" | "awaiting_user" | "provider_ready" | "committed" | "blocked" | "failed" | "cancelled" | "expired" | "provider_result_unknown" | "reconciliation_required";
  recoveredBaseline?: { exact: boolean } | null;
}): VerticalDramaAssuranceResult {
  if (input.runtimeState === "failed" && input.recoveredBaseline?.exact) {
    return VerticalDramaAssuranceResultSchema.parse({ executionId: input.executionId, attemptId: input.attemptId, state: "recovered", disposition: "recovered_needs_repair", readiness: "draft", findings: [], mode: "recovered_result", fallbackReason: null, traceId: null, nextAction: "repair" });
  }
  const state = input.runtimeState === "committed" ? "succeeded" : input.runtimeState === "cancelled" ? "cancelled" : input.runtimeState === "reconciliation_required" || input.runtimeState === "provider_result_unknown" ? "reconciliation_required" : input.runtimeState === "blocked" ? "fatal_failed" : input.runtimeState === "failed" || input.runtimeState === "expired" ? "retryable_failed" : input.runtimeState === "awaiting_user" ? "awaiting_action" : input.runtimeState === "running" || input.runtimeState === "verifying" || input.runtimeState === "repairing" ? "running" : "queued";
  const disposition = state === "succeeded" ? "verified" : state === "retryable_failed" ? "retryable" : "blocked";
  return VerticalDramaAssuranceResultSchema.parse({ executionId: input.executionId, attemptId: input.attemptId, state, disposition, readiness: state === "succeeded" ? "verified" : "draft", findings: [], mode: "legacy_deterministic", fallbackReason: null, traceId: null, nextAction: state === "succeeded" ? "continue" : state === "reconciliation_required" ? "reconcile" : "start_new_run" });
}
