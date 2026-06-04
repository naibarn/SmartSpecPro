import {
  CURRENT_CHECKPOINT_SCHEMA_VERSION,
  CURRENT_RUNTIME_CONTRACT_VERSION,
  CURRENT_TRACE_SCHEMA_VERSION,
  AgentRuntimeRequestSchema,
  type AgentsGatewayInvocationMetadata,
  type AgentCapabilityManifest,
  type AgentContextEvidenceItem,
  type AgentRuntimePersonaSnapshot,
  type AgentRuntimeRequest,
  type AgentRuntimeStepAssignment,
  type AgentRuntimeSurface,
  type AgentRuntimeTeamMemberSnapshot,
  type ProductionAgentsSdkCapabilityManifest,
  type RuntimeModelConfig,
  type AgentExecutionEnvelope,
} from "../../../shared/agentRuntime/types";
import type {
  ContextMessage,
  ContextPack,
  ContextPackSlot,
  ContextSurface,
} from "../../../shared/contextEngine";
import {
  buildContextPack as defaultBuildContextPack,
  type BuildContextPackRequest,
} from "../contextPackBuilder";
import {
  loadSkillCapabilityManifests as defaultLoadSkillCapabilityManifests,
  type LoadSkillCapabilityManifestsInput,
  type LoadSkillCapabilityManifestsResult,
} from "../skillCapabilityManifestService";

export interface ResolvedContextPack {
  contextPack: ContextPack;
  contextPackRef?: string | null;
}

export interface AgentRuntimeRequestBuilderDependencies {
  buildContextPack?: (
    input: BuildContextPackRequest
  ) => Promise<ContextPack | ResolvedContextPack>;
  loadSkillCapabilityManifests?: (
    input: LoadSkillCapabilityManifestsInput
  ) => Promise<LoadSkillCapabilityManifestsResult>;
}

export interface BuildAgentRuntimeRequestInput {
  surface: AgentRuntimeSurface;
  originSurface?: AgentRuntimeRequest["originSurface"];
  entryPoint: AgentRuntimeRequest["entryPoint"];
  tenantId: string;
  roomId?: string | null;
  runId?: string | null;
  messageId?: string | null;
  requestId: string;
  idempotencyKey: string;
  objective: string;
  contextPackRequest: BuildContextPackRequest;
  contextPackRef?: string | null;
  planContext?: Record<string, unknown> | null;
  stepContext?: AgentRuntimeRequest["stepContext"];
  activePersonaId?: string | null;
  personaSnapshot?: AgentRuntimePersonaSnapshot | null;
  teamMembers?: AgentRuntimeTeamMemberSnapshot[];
  stepAssignment?: AgentRuntimeStepAssignment | null;
  approvalCheckpointId?: string | null;
  resumeCursor?: string | null;
  modelConfig: RuntimeModelConfig;
  executionEnvelope: AgentExecutionEnvelope;
  allowedTools?: string[];
  allowedSkills?: string[];
  allowedAgents?: string[];
  completionPolicy?: Record<string, unknown>;
  reviewPolicy?: Record<string, unknown>;
  retryPolicy?: Record<string, unknown>;
  traceCorrelationIds?: AgentRuntimeRequest["traceCorrelationIds"];
  sdkVersionConstraint?: string | null;
  candidateSkillManifests?: AgentCapabilityManifest[];
  gatewayInvocationMetadata?: AgentsGatewayInvocationMetadata | null;
  productionAgentsSdkCapabilityManifest?: ProductionAgentsSdkCapabilityManifest | null;
  skillManifestSelection?: Omit<
    LoadSkillCapabilityManifestsInput,
    "surface" | "originSurface" | "entryPoint"
  >;
  runtimeSelectionSnapshot?: Record<string, unknown> | null;
}

const UNSAFE_PLAN_CONTEXT_KEY_PATTERN =
  /(credential|secret|token|api[-_]?key|password|memory[_-]?store|vector[_-]?store|persona[_-]?query|sql|direct[_-]?query|connector[_-]?credential)/i;

function normalizeContextBuildResult(
  result: ContextPack | ResolvedContextPack,
  fallbackRef: string
): ResolvedContextPack {
  if ("contextPack" in result) {
    return {
      contextPack: result.contextPack,
      contextPackRef: result.contextPackRef ?? fallbackRef,
    };
  }
  return {
    contextPack: result,
    contextPackRef: fallbackRef,
  };
}

function sanitizePlanContext(
  input: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!input) return {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (UNSAFE_PLAN_CONTEXT_KEY_PATTERN.test(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === "object" && item !== null
          ? sanitizePlanContext(item as Record<string, unknown>)
          : item
      );
      continue;
    }
    if (value && typeof value === "object") {
      sanitized[key] = sanitizePlanContext(value as Record<string, unknown>);
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function mapContextTrustLevel(
  slot: ContextPackSlot
): AgentContextEvidenceItem["trustLevel"] {
  if (slot.trust === "trusted") return "trusted_platform";
  if (slot.kind === "tool_result") return "tool_generated_untrusted";
  if (slot.kind === "retrieved_evidence") return "retrieved_untrusted";
  return "tenant_authored";
}

function mapSanitizationLevel(slot: ContextPackSlot): string {
  if (slot.trust === "trusted") return "platform_sanitized";
  if (slot.trust === "derived") return "normalized";
  return "redacted_untrusted";
}

export function contextPackSurfaceForRuntime(
  surface: AgentRuntimeSurface
): ContextSurface {
  return surface === "team" ? "team_room" : "chat";
}

export function buildContextEvidenceItems(
  contextPack: ContextPack
): AgentContextEvidenceItem[] {
  return contextPack.slots.map(slot => ({
    artifactId: `context-slot:${slot.id}`,
    sourceType: slot.kind,
    origin: slot.source,
    trustLevel: mapContextTrustLevel(slot),
    sanitizationLevel: mapSanitizationLevel(slot),
    contentRef:
      slot.provenance?.sourceRef ?? slot.refs[0] ?? `context://slot/${slot.id}`,
    tokenEstimate: slot.tokenEstimate,
    contextPackSlot: slot.id,
    sourceRef: slot.provenance?.sourceRef ?? slot.refs[0] ?? null,
    retrievalRecipeMetadata: slot.provenance
      ? {
          retrievalSource: slot.provenance.source,
          ownerScopeType: slot.provenance.ownerScope.type,
          ownerScopeId: slot.provenance.ownerScope.id,
          trust: slot.provenance.trust,
          freshness: slot.provenance.freshness,
          includedReason: slot.provenance.includedReason,
        }
      : null,
  }));
}

function summarizeContextMessages(messages: ContextMessage[]): number {
  return messages.reduce((count, message) => {
    const content = message.content;
    if (typeof content === "string") return count + 1;
    return count + content.length;
  }, 0);
}

export function buildDelegatedMemoryLifecycleMetadata(
  contextPack: ContextPack
) {
  return {
    authority: "context_engine",
    directAdapterReadsAllowed: false,
    directAdapterWritesAllowed: false,
    promotionDelegated: true,
    pruningDelegated: true,
    dedupeDelegated: true,
    clearToolResultsDelegated: true,
    contextPackIntent: contextPack.intent,
  };
}

export function extractCandidateEvidenceRefsFromRuntimeResponse(
  response: Pick<AgentRuntimeRequest, never> & {
    evidenceRefs?: string[] | null;
    artifacts?: Array<{ contentRef?: string | null }> | null;
  }
): string[] {
  const refs = new Set<string>();
  for (const ref of response.evidenceRefs ?? []) {
    if (typeof ref === "string" && ref.trim()) refs.add(ref.trim());
  }
  for (const artifact of response.artifacts ?? []) {
    if (artifact?.contentRef?.trim()) refs.add(artifact.contentRef.trim());
  }
  return [...refs];
}

export async function buildAgentRuntimeRequest(
  input: BuildAgentRuntimeRequestInput,
  deps: AgentRuntimeRequestBuilderDependencies = {}
): Promise<AgentRuntimeRequest> {
  const buildContextPack = deps.buildContextPack ?? defaultBuildContextPack;
  const loadSkillCapabilityManifests =
    deps.loadSkillCapabilityManifests ?? defaultLoadSkillCapabilityManifests;
  const contextPackRef =
    input.contextPackRef ?? `context-pack:${input.surface}:${input.requestId}`;
  const resolvedContextPack = normalizeContextBuildResult(
    await buildContextPack(input.contextPackRequest),
    contextPackRef
  );
  const contextEvidenceItems = buildContextEvidenceItems(
    resolvedContextPack.contextPack
  );

  const manifestResult =
    input.candidateSkillManifests != null
      ? null
      : await loadSkillCapabilityManifests({
          surface: input.surface,
          originSurface: input.originSurface ?? null,
          entryPoint: input.entryPoint,
          ...(input.skillManifestSelection ?? {}),
          skillSlugs:
            input.skillManifestSelection?.skillSlugs ??
            input.allowedSkills ??
            input.executionEnvelope.allowedSkills,
        });

  const candidateSkillManifests =
    input.candidateSkillManifests ??
    manifestResult?.candidates.map(candidate => candidate.agentManifest) ??
    [];

  const sanitizedPlanContext = sanitizePlanContext(input.planContext);
  const runtimeRequest = AgentRuntimeRequestSchema.parse({
    runtimeContractVersion: CURRENT_RUNTIME_CONTRACT_VERSION,
    traceSchemaVersion: CURRENT_TRACE_SCHEMA_VERSION,
    checkpointSchemaVersion: CURRENT_CHECKPOINT_SCHEMA_VERSION,
    surface: input.surface,
    originSurface: input.originSurface,
    entryPoint: input.entryPoint,
    tenantId: input.tenantId,
    roomId: input.roomId ?? null,
    runId: input.runId ?? null,
    messageId: input.messageId ?? null,
    requestId: input.requestId,
    idempotencyKey: input.idempotencyKey,
    objective: input.objective,
    planContext: {
      ...sanitizedPlanContext,
      runtimeSelection: input.runtimeSelectionSnapshot ?? null,
      contextPackSummary: {
        surface: resolvedContextPack.contextPack.surface,
        intent: resolvedContextPack.contextPack.intent,
        budgetProfile: resolvedContextPack.contextPack.budgetProfile,
        estimatedTokens: resolvedContextPack.contextPack.estimatedTokens,
        slotCount: resolvedContextPack.contextPack.slots.length,
        messageCount: summarizeContextMessages(
          resolvedContextPack.contextPack.messages
        ),
        tokenHeadroom: resolvedContextPack.contextPack.compaction.tokenHeadroom,
      },
      memoryLifecycle: buildDelegatedMemoryLifecycleMetadata(
        resolvedContextPack.contextPack
      ),
    },
    stepContext: input.stepContext ?? null,
    activePersonaId: input.activePersonaId ?? null,
    personaSnapshot: input.personaSnapshot ?? null,
    teamMembers: input.teamMembers ?? [],
    stepAssignment: input.stepAssignment ?? null,
    approvalCheckpointId: input.approvalCheckpointId ?? null,
    resumeCursor: input.resumeCursor ?? null,
    structuredContextPackRef: resolvedContextPack.contextPackRef ?? null,
    contextEvidenceItems,
    candidateSkillManifests,
    allowedTools: input.allowedTools ?? input.executionEnvelope.allowedTools,
    allowedSkills: input.allowedSkills ?? input.executionEnvelope.allowedSkills,
    allowedAgents: input.allowedAgents ?? input.executionEnvelope.allowedAgents,
    completionPolicy: input.completionPolicy ?? {},
    reviewPolicy: input.reviewPolicy ?? {},
    retryPolicy: input.retryPolicy ?? {},
    traceCorrelationIds: input.traceCorrelationIds ?? {},
    sdkVersionConstraint: input.sdkVersionConstraint ?? null,
    modelConfig: input.modelConfig,
    executionEnvelope: input.executionEnvelope,
    gatewayInvocationMetadata: input.gatewayInvocationMetadata ?? null,
    productionAgentsSdkCapabilityManifest:
      input.productionAgentsSdkCapabilityManifest ?? null,
  });

  return runtimeRequest;
}
