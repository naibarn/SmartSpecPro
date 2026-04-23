import { randomUUID } from "node:crypto";

import type { BuildContextPackRequest } from "../contextPackBuilder";
import type { UnifiedExecutionRequest } from "../executors/types";
import {
  buildAgentRuntimeCandidateBundle,
  evaluateSkillCapabilityActivationGate,
  type SkillCapabilityActivationGateResult,
} from "../skillCapabilityManifestService";
import { getTenantFeatureFlags } from "../tenantFeatureFlagService";
import {
  AgentRuntimeClient,
  AgentRuntimeClientError,
} from "./client";
import {
  buildAgentRuntimeRequest,
  contextPackSurfaceForRuntime,
  type AgentRuntimeRequestBuilderDependencies,
} from "./requestBuilder";
import {
  selectAgentRuntime,
  type AgentRuntimeSelection,
  type OpenAiAgentsRuntimeFlagSnapshot,
} from "./runtimeSelection";
import {
  evaluateShadowSideEffect,
  type ShadowEffectKind,
} from "./shadowPolicy";
import type {
  AgentExecutionEnvelope,
  AgentRuntimeEntryPoint,
  AgentRuntimeOriginSurface,
  AgentRuntimeRequest,
  AgentRuntimeResponse,
  RuntimeModelConfig,
} from "../../../shared/agentRuntime/types";

export interface RuntimeUsageSummary {
  promptTokens: number;
  completionTokens: number;
}

export interface SharedSkillRuntimeTextResult {
  rawContent: string;
  usage: RuntimeUsageSummary;
  creditsUsed: number;
  providerName: string | null;
  modelId: string | null;
  rawResponse?: unknown;
}

export interface SharedSkillRuntimeReplaySnapshot {
  selectedSkillSlug: string | null;
  schemaValid: boolean;
  status: string | null;
}

export interface SharedSkillRuntimeReplayComparison {
  matches: boolean;
  mismatchCodes: Array<
    "selected_skill_drift" | "schema_validity_drift" | "status_drift"
  >;
}

export interface SharedSkillRuntimeMetadata {
  selection: AgentRuntimeSelection;
  requestId: string | null;
  traceId: string | null;
  selectedSkillSlug: string | null;
  status: AgentRuntimeResponse["status"] | "legacy" | "shadow_skipped";
  diagnostics: string[];
  comparison: Record<string, unknown> | null;
  errorCode: string | null;
}

export interface SharedSkillRuntimeExecutionResult<T> {
  value: T;
  runtime: SharedSkillRuntimeMetadata;
  runtimeRequest: AgentRuntimeRequest | null;
  runtimeResponse: AgentRuntimeResponse | null;
}

export interface SharedSkillRuntimeRecursionConfig {
  currentDepth?: number;
  maxDepth?: number;
  traceId?: string | null;
  parentTraceId?: string | null;
}

export interface SharedSkillRuntimeSchemaHint {
  name: string;
  requiredFields?: string[];
  validationMode?: "structured_json" | "text_output";
}

export interface ExecuteSharedSkillRuntimeInput<TLegacy, TResult> {
  tenantId: string;
  userId: number;
  objective: string;
  originSurface?: AgentRuntimeOriginSurface;
  entryPoint: AgentRuntimeEntryPoint;
  modelConfig: RuntimeModelConfig;
  skillSlugs: string[];
  systemPrompt?: string | null;
  userPrompt?: string | null;
  planContext?: Record<string, unknown> | null;
  dynamicParams?: Record<string, unknown> | null;
  referenceImages?: string[];
  approvalGranted?: boolean;
  requestLabel?: string | null;
  roomId?: string | null;
  runId?: string | null;
  messageId?: string | null;
  allowedTools?: string[];
  allowedAgents?: string[];
  sideEffectKind?: ShadowEffectKind;
  featureFlags?: Partial<OpenAiAgentsRuntimeFlagSnapshot> | null;
  schemaHint?: SharedSkillRuntimeSchemaHint | null;
  recursion?: SharedSkillRuntimeRecursionConfig | null;
  buildContextPackRequest?: BuildContextPackRequest;
  builderDeps?: AgentRuntimeRequestBuilderDependencies;
  client?: Pick<AgentRuntimeClient, "run">;
  activationGate?: SkillCapabilityActivationGateResult;
  legacyExecute: () => Promise<TLegacy>;
  activeTransform: (
    response: AgentRuntimeResponse,
  ) => Promise<TResult> | TResult;
  shadowCompare?: (
    legacyValue: TLegacy,
    runtimeValue: TResult,
    response: AgentRuntimeResponse,
  ) => Record<string, unknown> | null;
}

export class SharedSkillRuntimeError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | null;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = "SharedSkillRuntimeError";
    this.code = code;
    this.details = details ?? null;
  }
}

const DEFAULT_RECURSION_MAX_DEPTH = 2;
const DEFAULT_ENVELOPE_LIFETIME_MS = 15 * 60 * 1000;

function normalizeUsageLike(value: unknown): RuntimeUsageSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  const record = value as Record<string, unknown>;
  const promptTokens = Number(
    record.promptTokens ?? record.prompt_tokens ?? record.inputTokens ?? 0,
  );
  const completionTokens = Number(
    record.completionTokens ??
      record.completion_tokens ??
      record.outputTokens ??
      0,
  );

  return {
    promptTokens:
      Number.isFinite(promptTokens) && promptTokens >= 0
        ? Math.floor(promptTokens)
        : 0,
    completionTokens:
      Number.isFinite(completionTokens) && completionTokens >= 0
        ? Math.floor(completionTokens)
        : 0,
  };
}

function firstNonEmptyString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function firstFiniteNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function buildDefaultExecutionEnvelope(input: {
  tenantId: string;
  requestId: string;
  allowedTools: string[];
  allowedAgents: string[];
  skillSlugs: string[];
  approvalGranted: boolean;
  sideEffectKind?: ShadowEffectKind;
}): AgentExecutionEnvelope {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + DEFAULT_ENVELOPE_LIFETIME_MS);
  const isReadOnly =
    input.sideEffectKind == null ||
    input.sideEffectKind === "tool" ||
    input.sideEffectKind === "user_visible_message";

  return {
    envelopeId: `shared-skill-runtime:${input.requestId}`,
    tenantId: input.tenantId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    allowedTools: input.allowedTools,
    allowedSkills: input.skillSlugs,
    allowedAgents: input.allowedAgents,
    sideEffectPolicy: isReadOnly
      ? "read_only"
      : input.approvalGranted
        ? "mutating_allowed"
        : "approval_required",
  };
}

function buildDefaultContextPackRequest(
  input: Pick<
    ExecuteSharedSkillRuntimeInput<unknown, unknown>,
    | "tenantId"
    | "userId"
    | "objective"
    | "dynamicParams"
    | "userPrompt"
    | "systemPrompt"
    | "referenceImages"
    | "requestLabel"
  >,
): BuildContextPackRequest {
  const contextSurface = contextPackSurfaceForRuntime("skill");
  const request: UnifiedExecutionRequest = {
    channel: contextSurface === "team_room" ? "team_room" : "chat",
    userId: input.userId,
    tenantId: input.tenantId,
    userMessage: input.userPrompt?.trim() || input.objective,
    attachments: (input.referenceImages ?? []).map(url => ({
      type: "image" as const,
      url,
    })),
    ...(input.dynamicParams ? { dynamicParams: input.dynamicParams } : {}),
  };

  return {
    surface: contextSurface,
    tenantId: input.tenantId,
    request,
    skillSystemPrompt: input.systemPrompt ?? null,
    dynamicParams: input.dynamicParams ?? null,
    label: input.requestLabel ?? null,
  };
}

function buildSchemaPlanContext(
  input: ExecuteSharedSkillRuntimeInput<unknown, unknown>,
): Record<string, unknown> {
  const recursionDepth = input.recursion?.currentDepth ?? 0;
  const recursionMax = input.recursion?.maxDepth ?? DEFAULT_RECURSION_MAX_DEPTH;

  return {
    ...(input.planContext ?? {}),
    input: input.userPrompt?.trim() || input.objective,
    systemPrompt: input.systemPrompt ?? null,
    requestLabel: input.requestLabel ?? null,
    schemaHint: input.schemaHint ?? null,
    referenceImageCount: input.referenceImages?.length ?? 0,
    recursion: {
      currentDepth: recursionDepth,
      maxDepth: recursionMax,
    },
  };
}

function toRuntimeRequestId(value?: string | null): string {
  return value?.trim() || `skill-runtime-${randomUUID()}`;
}

function summarizeDiagnostics(
  gate: SkillCapabilityActivationGateResult | null,
): string[] {
  if (!gate) return [];
  return gate.diagnostics.map(diagnostic => diagnostic.message);
}

function toRuntimeSelectionSnapshot(
  selection: AgentRuntimeSelection,
): Record<string, unknown> {
  return {
    engine: selection.engine,
    mode: selection.mode,
    selectionReason: selection.selectionReason,
    flagSnapshot: selection.flagSnapshot,
    frozenAtRecommendation: selection.frozenAtRecommendation,
    rollbackReason: selection.rollbackReason,
    originSurface: selection.originSurface ?? null,
    entryPoint: selection.entryPoint ?? null,
  };
}

function toSharedRuntimeError(error: unknown): SharedSkillRuntimeError {
  if (error instanceof SharedSkillRuntimeError) {
    return error;
  }

  if (error instanceof AgentRuntimeClientError) {
    return new SharedSkillRuntimeError(error.code, error.message, error.details);
  }

  if (error instanceof Error) {
    return new SharedSkillRuntimeError("shared_skill_runtime_failed", error.message);
  }

  return new SharedSkillRuntimeError(
    "shared_skill_runtime_failed",
    "Shared skill runtime failed.",
  );
}

function assertRuntimeResponseReady(response: AgentRuntimeResponse): void {
  if (response.status !== "completed") {
    throw new SharedSkillRuntimeError(
      "runtime_not_completed",
      `Runtime returned status '${response.status}' instead of 'completed'.`,
      {
        status: response.status,
        terminalReason: response.terminalReason ?? null,
        nextAction: response.nextAction ?? null,
      },
    );
  }

  if (response.reviewVerdict && response.reviewVerdict.status !== "pass") {
    throw new SharedSkillRuntimeError(
      "runtime_review_not_passed",
      `Runtime review verdict was '${response.reviewVerdict.status}'.`,
      {
        reviewVerdict: response.reviewVerdict,
      },
    );
  }
}

function compareTextRuntimeOutput(
  legacyValue: SharedSkillRuntimeTextResult,
  runtimeValue: SharedSkillRuntimeTextResult,
  response: AgentRuntimeResponse,
): Record<string, unknown> {
  return {
    selectedSkillSlug: response.selectedSkillSlug ?? null,
    sameRawContent: legacyValue.rawContent.trim() === runtimeValue.rawContent.trim(),
    legacyContentLength: legacyValue.rawContent.length,
    runtimeContentLength: runtimeValue.rawContent.length,
  };
}

function buildActivationGateError(
  gate: SkillCapabilityActivationGateResult,
  input: ExecuteSharedSkillRuntimeInput<unknown, unknown>,
): SharedSkillRuntimeError {
  const firstDiagnostic = gate.diagnostics[0];
  return new SharedSkillRuntimeError(
    firstDiagnostic?.code ?? "manifest_missing",
    firstDiagnostic?.message ??
      `Shared skill runtime activation was blocked for ${input.entryPoint}.`,
    {
      skillSlugs: input.skillSlugs,
      diagnostics: gate.diagnostics,
      entryPoint: input.entryPoint,
      originSurface: input.originSurface ?? null,
    },
  );
}

async function resolveActivationGate(
  selection: AgentRuntimeSelection,
  input: ExecuteSharedSkillRuntimeInput<unknown, unknown>,
): Promise<SkillCapabilityActivationGateResult | null> {
  if (input.activationGate) {
    return input.activationGate;
  }

  if (input.skillSlugs.length === 0) {
    return null;
  }

  return evaluateSkillCapabilityActivationGate({
    mode: selection.mode,
    surface: "skill",
    originSurface: input.originSurface ?? null,
    entryPoint: input.entryPoint,
    skillSlugs: input.skillSlugs,
    approvalGranted: input.approvalGranted ?? false,
  });
}

async function buildRuntimeRequestPayload(
  input: ExecuteSharedSkillRuntimeInput<unknown, unknown>,
  selection: AgentRuntimeSelection,
  gate: SkillCapabilityActivationGateResult | null,
): Promise<AgentRuntimeRequest> {
  const requestId = toRuntimeRequestId(input.messageId);
  const idempotencyKey = `skill-runtime:${requestId}`;
  const executionEnvelope = buildDefaultExecutionEnvelope({
    tenantId: input.tenantId,
    requestId,
    allowedTools: input.allowedTools ?? [],
    allowedAgents: input.allowedAgents ?? [],
    skillSlugs: input.skillSlugs,
    approvalGranted: input.approvalGranted ?? false,
    sideEffectKind: input.sideEffectKind,
  });

  return buildAgentRuntimeRequest(
    {
      surface: "skill",
      originSurface: input.originSurface,
      entryPoint: input.entryPoint,
      tenantId: input.tenantId,
      roomId: input.roomId ?? null,
      runId: input.runId ?? null,
      messageId: input.messageId ?? null,
      requestId,
      idempotencyKey,
      objective: input.objective,
      contextPackRequest:
        input.buildContextPackRequest ??
        buildDefaultContextPackRequest(input),
      planContext: buildSchemaPlanContext(input),
      modelConfig: input.modelConfig,
      executionEnvelope,
      allowedTools: input.allowedTools ?? [],
      allowedAgents: input.allowedAgents ?? [],
      allowedSkills: input.skillSlugs,
      candidateSkillManifests: gate
        ? buildAgentRuntimeCandidateBundle(gate.candidates)
        : [],
      completionPolicy: {
        maxRounds: 1,
        requestLabel: input.requestLabel ?? null,
      },
      reviewPolicy: {
        requirePassVerdict: true,
      },
      retryPolicy: {
        maxAttempts: 1,
      },
      traceCorrelationIds: {
        traceId: input.recursion?.traceId ?? null,
        parentTraceId: input.recursion?.parentTraceId ?? null,
      },
      runtimeSelectionSnapshot: toRuntimeSelectionSnapshot(selection),
    },
    input.builderDeps,
  );
}

export function buildRuntimeModelConfig(input: {
  modelId: string;
  providerId?: number | string | null;
  gatewayRouteId?: string | null;
  resolvedGatewayModelId?: string | null;
}): RuntimeModelConfig {
  return {
    providerId:
      typeof input.providerId === "string"
        ? input.providerId
        : input.providerId != null
          ? String(input.providerId)
          : "auto",
    modelId: input.modelId,
    gatewayRouteId: input.gatewayRouteId ?? null,
    resolvedGatewayModelId:
      input.resolvedGatewayModelId ?? input.modelId ?? null,
  };
}

export function compareSharedSkillReplaySnapshots(
  baseline: SharedSkillRuntimeReplaySnapshot,
  candidate: SharedSkillRuntimeReplaySnapshot,
): SharedSkillRuntimeReplayComparison {
  const mismatchCodes: SharedSkillRuntimeReplayComparison["mismatchCodes"] = [];

  if ((baseline.selectedSkillSlug ?? null) !== (candidate.selectedSkillSlug ?? null)) {
    mismatchCodes.push("selected_skill_drift");
  }

  if (baseline.schemaValid !== candidate.schemaValid) {
    mismatchCodes.push("schema_validity_drift");
  }

  if ((baseline.status ?? null) !== (candidate.status ?? null)) {
    mismatchCodes.push("status_drift");
  }

  return {
    matches: mismatchCodes.length === 0,
    mismatchCodes,
  };
}

export function extractRuntimeTextResult(
  response: AgentRuntimeResponse,
): SharedSkillRuntimeTextResult {
  const finalOutput = response.finalOutput;
  if (typeof finalOutput === "string" && finalOutput.trim().length > 0) {
    return {
      rawContent: finalOutput,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
      creditsUsed: 0,
      providerName: response.providerId ?? null,
      modelId: response.resolvedGatewayModelId ?? response.modelId ?? null,
      rawResponse: response.finalOutput,
    };
  }

  if (!finalOutput || typeof finalOutput !== "object" || Array.isArray(finalOutput)) {
    throw new SharedSkillRuntimeError(
      "runtime_output_schema_invalid",
      "Runtime finalOutput did not contain a text payload.",
      {
        finalOutput,
      },
    );
  }

  const record = finalOutput as Record<string, unknown>;
  const rawContent = firstNonEmptyString(record, [
    "rawContent",
    "content",
    "text",
    "response",
    "output",
  ]);

  if (!rawContent) {
    throw new SharedSkillRuntimeError(
      "runtime_output_schema_invalid",
      "Runtime finalOutput did not contain a usable text field.",
      {
        finalOutput,
      },
    );
  }

  const creditsUsed =
    firstFiniteNumber(record, ["creditsUsed", "credits"]) ?? 0;

  return {
    rawContent,
    usage:
      record.usage && typeof record.usage === "object"
        ? normalizeUsageLike(record.usage)
        : normalizeUsageLike(record),
    creditsUsed,
    providerName:
      firstNonEmptyString(record, ["providerName"]) ??
      response.providerId ??
      null,
    modelId:
      firstNonEmptyString(record, ["modelId", "resolvedGatewayModelId"]) ??
      response.resolvedGatewayModelId ??
      response.modelId ??
      null,
    rawResponse: record.rawResponse ?? response.finalOutput,
  };
}

export async function executeSharedSkillRuntime<TLegacy, TResult>(
  input: ExecuteSharedSkillRuntimeInput<TLegacy, TResult>,
): Promise<SharedSkillRuntimeExecutionResult<TLegacy | TResult>> {
  const featureFlags =
    input.featureFlags ?? (await getTenantFeatureFlags(input.tenantId));
  const selection = selectAgentRuntime({
    surface: "skill",
    originSurface: input.originSurface,
    entryPoint: input.entryPoint,
    featureFlags,
  });

  const recursionDepth = input.recursion?.currentDepth ?? 0;
  const recursionMax = input.recursion?.maxDepth ?? DEFAULT_RECURSION_MAX_DEPTH;

  if (selection.mode !== "legacy" && recursionDepth >= recursionMax) {
    if (selection.mode === "shadow") {
      const legacyValue = await input.legacyExecute();
      return {
        value: legacyValue,
        runtimeRequest: null,
        runtimeResponse: null,
        runtime: {
          selection,
          requestId: null,
          traceId: null,
          selectedSkillSlug: null,
          status: "shadow_skipped",
          diagnostics: [
            `Shadow runtime skipped because recursion depth ${recursionDepth} reached the ceiling ${recursionMax}.`,
          ],
          comparison: null,
          errorCode: "runtime_recursion_ceiling_reached",
        },
      };
    }

    throw new SharedSkillRuntimeError(
      "runtime_recursion_ceiling_reached",
      `Shared skill runtime recursion depth ${recursionDepth} reached the ceiling ${recursionMax}.`,
      {
        currentDepth: recursionDepth,
        maxDepth: recursionMax,
      },
    );
  }

  const activationGate =
    selection.mode === "legacy"
      ? null
      : await resolveActivationGate(
          selection,
          input as ExecuteSharedSkillRuntimeInput<unknown, unknown>,
        );

  const diagnostics = summarizeDiagnostics(activationGate);

  if (selection.mode === "legacy") {
    const legacyValue = await input.legacyExecute();
    return {
      value: legacyValue,
      runtimeRequest: null,
      runtimeResponse: null,
      runtime: {
        selection,
        requestId: null,
        traceId: null,
        selectedSkillSlug: null,
        status: "legacy",
        diagnostics,
        comparison: null,
        errorCode: null,
      },
    };
  }

  if (selection.mode === "active" && (!activationGate || !activationGate.allowed)) {
    throw buildActivationGateError(
      activationGate ?? {
        allowed: false,
        candidates: [],
        diagnostics: [
          {
            code: "manifest_missing",
            severity: "error",
            skillSlug: input.skillSlugs[0] ?? "unknown",
            message: "No manifest-backed skill candidates were available for shared skill runtime.",
          },
        ],
      },
      input as ExecuteSharedSkillRuntimeInput<unknown, unknown>,
    );
  }

  if (selection.mode === "shadow" && activationGate && !activationGate.allowed) {
    const legacyValue = await input.legacyExecute();
    return {
      value: legacyValue,
      runtimeRequest: null,
      runtimeResponse: null,
      runtime: {
        selection,
        requestId: null,
        traceId: null,
        selectedSkillSlug: null,
        status: "shadow_skipped",
        diagnostics,
        comparison: null,
        errorCode: activationGate.diagnostics[0]?.code ?? "manifest_missing",
      },
    };
  }

  if (selection.mode === "shadow" && input.sideEffectKind) {
    const shadowDecision = evaluateShadowSideEffect({
      mode: selection.mode,
      effectKind: input.sideEffectKind,
    });

    if (shadowDecision.suppressed) {
      const legacyValue = await input.legacyExecute();
      return {
        value: legacyValue,
        runtimeRequest: null,
        runtimeResponse: null,
        runtime: {
          selection,
          requestId: null,
          traceId: null,
          selectedSkillSlug: null,
          status: "shadow_skipped",
          diagnostics: [
            ...diagnostics,
            shadowDecision.reason ?? "shadow_suppressed",
          ],
          comparison: null,
          errorCode: shadowDecision.reason ?? "shadow_suppressed",
        },
      };
    }
  }

  const runtimeRequest = await buildRuntimeRequestPayload(
    input as ExecuteSharedSkillRuntimeInput<unknown, unknown>,
    selection,
    activationGate,
  );
  const client = input.client ?? new AgentRuntimeClient();

  if (selection.mode === "active") {
    const runtimeResponse = await client.run(runtimeRequest).catch(error => {
      throw toSharedRuntimeError(error);
    });
    assertRuntimeResponseReady(runtimeResponse);
    const value = await input.activeTransform(runtimeResponse);

    return {
      value,
      runtimeRequest,
      runtimeResponse,
      runtime: {
        selection,
        requestId: runtimeRequest.requestId,
        traceId: runtimeResponse.traceId ?? null,
        selectedSkillSlug: runtimeResponse.selectedSkillSlug ?? null,
        status: runtimeResponse.status,
        diagnostics,
        comparison: null,
        errorCode: null,
      },
    };
  }

  const legacyValue = await input.legacyExecute();

  try {
    const runtimeResponse = await client.run(runtimeRequest);
    assertRuntimeResponseReady(runtimeResponse);
    const runtimeValue = await input.activeTransform(runtimeResponse);

    return {
      value: legacyValue,
      runtimeRequest,
      runtimeResponse,
      runtime: {
        selection,
        requestId: runtimeRequest.requestId,
        traceId: runtimeResponse.traceId ?? null,
        selectedSkillSlug: runtimeResponse.selectedSkillSlug ?? null,
        status: runtimeResponse.status,
        diagnostics,
        comparison:
          input.shadowCompare?.(legacyValue, runtimeValue, runtimeResponse) ?? null,
        errorCode: null,
      },
    };
  } catch (error) {
    const runtimeError = toSharedRuntimeError(error);
    return {
      value: legacyValue,
      runtimeRequest,
      runtimeResponse: null,
      runtime: {
        selection,
        requestId: runtimeRequest.requestId,
        traceId: null,
        selectedSkillSlug: null,
        status: "shadow_skipped",
        diagnostics: [...diagnostics, runtimeError.message],
        comparison: null,
        errorCode: runtimeError.code,
      },
    };
  }
}

export async function executeSharedSkillTextRuntime(
  input: Omit<
    ExecuteSharedSkillRuntimeInput<
      SharedSkillRuntimeTextResult,
      SharedSkillRuntimeTextResult
    >,
    "activeTransform" | "shadowCompare"
  >,
): Promise<SharedSkillRuntimeExecutionResult<SharedSkillRuntimeTextResult>> {
  const result = await executeSharedSkillRuntime<
    SharedSkillRuntimeTextResult,
    SharedSkillRuntimeTextResult
  >({
    ...input,
    activeTransform: response => extractRuntimeTextResult(response),
    shadowCompare: compareTextRuntimeOutput,
  });

  return {
    ...result,
    value: result.value as SharedSkillRuntimeTextResult,
  };
}
