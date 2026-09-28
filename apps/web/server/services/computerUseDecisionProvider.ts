import {
  canonicalize,
  sha256Reference,
  type Spec208ActionCandidate,
  type Spec208BrowserObservation,
  type Spec208CandidateSet,
} from "./computerUseSpec208Contracts";

export type DecisionStatus = "SELECTED" | "NO_MATCH" | "ABSTAIN";

export type DecisionRequest = {
  requestedProvider: string;
  goal: string;
  observation: Spec208BrowserObservation;
  candidateSet: Spec208CandidateSet;
  policyHints?: Record<string, string | number | boolean>;
  recentExecutionContext?: Record<string, unknown>;
  expectedSuccessCondition?: Record<string, unknown>;
};

export type DecisionProbability = {
  candidateId: string;
  probability: number;
};

export type DecisionResult = {
  decisionId: string;
  providerImplementation: "rules" | "jev" | "llm_choice";
  requestedProvider: string;
  resolvedProvider: string;
  resolvedModel: string;
  resolvedModelVersion: string;
  primitiveType: Spec208ActionCandidate["operation"] | "NO_MATCH";
  observationId: string;
  observationRevision: number;
  candidateSetId: string;
  candidateSetHash: string;
  selectedCandidateId: string | null;
  status: DecisionStatus;
  confidence: number;
  probabilities: DecisionProbability[];
  calibrationRevision: string;
  fallbackReason?: string;
  decisionEvidenceRef: string;
  decisionEvidenceHash: string;
  decidedAt: string;
};

type RawProviderDecision = {
  selectedCandidateId?: string | null;
  confidence?: number;
  probabilities?: DecisionProbability[];
};

export interface DecisionProvider {
  readonly providerImplementation: DecisionResult["providerImplementation"];
  readonly providerId: string;
  choose(request: DecisionRequest): Promise<DecisionResult>;
}

type ProviderMetadata = {
  providerImplementation: DecisionResult["providerImplementation"];
  providerId: string;
  model: string;
  version: string;
  calibrationRevision: string;
};

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function assertRequestBinding(request: DecisionRequest): void {
  if (
    request.candidateSet.observationId !== request.observation.observationId
    || request.candidateSet.observationRevision !== request.observation.revision
    || request.candidateSet.browserGeneration !== request.observation.browserGeneration
  ) {
    throw new Error("DECISION_OBSERVATION_BINDING_MISMATCH");
  }
  for (const candidate of request.candidateSet.candidates) {
    if (
      candidate.observationId !== request.observation.observationId
      || candidate.observationRevision !== request.observation.revision
      || candidate.browserGeneration !== request.observation.browserGeneration
    ) {
      throw new Error("DECISION_CANDIDATE_BINDING_MISMATCH");
    }
  }
}

function validateProbabilities(probabilities: DecisionProbability[] | undefined, candidateIds: Set<string>): DecisionProbability[] {
  if (!probabilities) return [];
  if (probabilities.length > candidateIds.size) throw new Error("DECISION_PROBABILITY_CARDINALITY_INVALID");
  const seen = new Set<string>();
  let total = 0;
  for (const entry of probabilities) {
    if (!candidateIds.has(entry.candidateId)) throw new Error("DECISION_PROBABILITY_CANDIDATE_NOT_FOUND");
    if (seen.has(entry.candidateId) || !Number.isFinite(entry.probability) || entry.probability < 0 || entry.probability > 1) {
      throw new Error("DECISION_PROBABILITY_INVALID");
    }
    seen.add(entry.candidateId);
    total += entry.probability;
  }
  if (probabilities.length > 0 && Math.abs(total - 1) > 0.01) throw new Error("DECISION_PROBABILITY_NOT_NORMALIZED");
  return probabilities.map(entry => ({ ...entry }));
}

function buildResult(
  request: DecisionRequest,
  metadata: ProviderMetadata,
  raw: RawProviderDecision,
  fallbackReason?: string,
): DecisionResult {
  assertRequestBinding(request);
  const candidateIds = new Set(request.candidateSet.candidates.map(candidate => candidate.candidateId));
  const selectedCandidateId = raw.selectedCandidateId ?? null;
  if (selectedCandidateId !== null && !candidateIds.has(selectedCandidateId)) {
    throw new Error("DECISION_CANDIDATE_NOT_FOUND");
  }
  const selected = selectedCandidateId
    ? request.candidateSet.candidates.find(candidate => candidate.candidateId === selectedCandidateId)
    : undefined;
  const confidence = raw.confidence ?? (selected ? 1 : 0);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("DECISION_CONFIDENCE_INVALID");
  const probabilities = validateProbabilities(raw.probabilities, candidateIds);
  const status: DecisionStatus = selected ? "SELECTED" : "NO_MATCH";
  const evidenceBody = {
    providerImplementation: metadata.providerImplementation,
    providerId: metadata.providerId,
    requestedProvider: request.requestedProvider,
    model: metadata.model,
    version: metadata.version,
    calibrationRevision: metadata.calibrationRevision,
    observationId: request.observation.observationId,
    observationRevision: request.observation.revision,
    candidateSetId: request.candidateSet.candidateSetId,
    candidateSetHash: request.candidateSet.candidateSetHash,
    selectedCandidateId,
    confidence,
    probabilities,
    status,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
  const decisionRef = sha256Reference("decision", evidenceBody);
  const evidenceRef = sha256Reference("decision-evidence", evidenceBody);
  return Object.freeze({
    decisionId: decisionRef,
    providerImplementation: metadata.providerImplementation,
    requestedProvider: request.requestedProvider,
    resolvedProvider: metadata.providerId,
    resolvedModel: metadata.model,
    resolvedModelVersion: metadata.version,
    primitiveType: selected?.operation ?? "NO_MATCH",
    observationId: request.observation.observationId,
    observationRevision: request.observation.revision,
    candidateSetId: request.candidateSet.candidateSetId,
    candidateSetHash: request.candidateSet.candidateSetHash,
    selectedCandidateId,
    status,
    confidence,
    probabilities,
    calibrationRevision: metadata.calibrationRevision,
    ...(fallbackReason ? { fallbackReason } : {}),
    decisionEvidenceRef: evidenceRef,
    decisionEvidenceHash: evidenceRef.slice("decision-evidence:sha256:".length),
    decidedAt: new Date().toISOString(),
  });
}

function goalTokens(goal: string): string[] {
  return goal.toLowerCase().split(/[^a-z0-9ก-๙]+/u).filter(token => token.length >= 2);
}

export class RulesDecisionProvider implements DecisionProvider {
  readonly providerImplementation = "rules" as const;
  readonly providerId = "rules";

  async choose(request: DecisionRequest): Promise<DecisionResult> {
    const tokens = new Set(goalTokens(request.goal));
    const selected = request.candidateSet.candidates
      .map(candidate => ({
        candidate,
        score: goalTokens(candidate.semanticHint).filter(token => tokens.has(token)).length,
      }))
      .filter(item => item.score > 0)
      .sort((left, right) => right.score - left.score || left.candidate.candidateId.localeCompare(right.candidate.candidateId))[0]?.candidate;
    return buildResult(request, {
      providerImplementation: "rules",
      providerId: "rules",
      model: "rules",
      version: "rules-v1",
      calibrationRevision: "rules-calibration-v1",
    }, {
      selectedCandidateId: selected?.candidateId ?? null,
      confidence: selected ? 1 : 0,
      probabilities: selected ? [{ candidateId: selected.candidateId, probability: 1 }] : [],
    });
  }
}

export type JevDecisionClient = {
  choose(request: {
    goal: string;
    observation: Spec208BrowserObservation;
    candidateSet: Spec208CandidateSet;
  }): Promise<RawProviderDecision>;
};

export class JevDecisionProvider implements DecisionProvider {
  readonly providerImplementation = "jev" as const;
  readonly providerId = "jev";
  private readonly metadata: ProviderMetadata;
  private readonly client: JevDecisionClient;

  constructor(input: { model: string; version: string; calibrationRevision: string; choose: JevDecisionClient["choose"] }) {
    this.metadata = {
      providerImplementation: "jev",
      providerId: "jev",
      model: requiredText(input.model, "JEV_MODEL_REQUIRED"),
      version: requiredText(input.version, "JEV_VERSION_REQUIRED"),
      calibrationRevision: requiredText(input.calibrationRevision, "JEV_CALIBRATION_REQUIRED"),
    };
    this.client = { choose: input.choose };
  }

  choose(request: DecisionRequest): Promise<DecisionResult> {
    return this.client.choose({
      goal: request.goal,
      observation: request.observation,
      candidateSet: request.candidateSet,
    }).then(raw => buildResult(request, this.metadata, raw));
  }
}

export type LLMChoiceClient = JevDecisionClient;

export class LLMChoiceDecisionProvider implements DecisionProvider {
  readonly providerImplementation = "llm_choice" as const;
  readonly providerId: string;
  private readonly metadata: ProviderMetadata;
  private readonly client: LLMChoiceClient;

  constructor(input: { model: string; version: string; calibrationRevision: string; choose: LLMChoiceClient["choose"]; providerId?: string }) {
    this.providerId = input.providerId ?? "llm-choice";
    this.metadata = {
      providerImplementation: "llm_choice",
      providerId: this.providerId,
      model: requiredText(input.model, "LLM_MODEL_REQUIRED"),
      version: requiredText(input.version, "LLM_VERSION_REQUIRED"),
      calibrationRevision: requiredText(input.calibrationRevision, "LLM_CALIBRATION_REQUIRED"),
    };
    this.client = { choose: input.choose };
  }

  choose(request: DecisionRequest): Promise<DecisionResult> {
    return this.client.choose({
      goal: request.goal,
      observation: request.observation,
      candidateSet: request.candidateSet,
    }).then(raw => buildResult(request, this.metadata, raw));
  }
}

export class FallbackDecisionProvider implements DecisionProvider {
  readonly providerImplementation: DecisionResult["providerImplementation"] = "llm_choice";
  readonly providerId = "fallback";
  private readonly primary: DecisionProvider;
  private readonly fallback: DecisionProvider;
  private readonly fallbackReason: string;

  constructor(input: { primary: DecisionProvider; fallback: DecisionProvider; fallbackReason: string }) {
    this.primary = input.primary;
    this.fallback = input.fallback;
    this.fallbackReason = requiredText(input.fallbackReason, "FALLBACK_REASON_REQUIRED");
  }

  async choose(request: DecisionRequest): Promise<DecisionResult> {
    try {
      return await this.primary.choose(request);
    } catch (error) {
      const result = await this.fallback.choose(request);
      const evidence = {
        ...result,
        requestedProvider: request.requestedProvider,
        fallbackReason: this.fallbackReason,
        primaryError: error instanceof Error ? error.message : "PROVIDER_ERROR",
      };
      const serialized = canonicalize(evidence);
      const decisionHash = sha256Reference("decision", serialized);
      const evidenceHash = sha256Reference("decision-evidence", serialized);
      return Object.freeze({
        ...result,
        requestedProvider: request.requestedProvider,
        fallbackReason: this.fallbackReason,
        decisionId: decisionHash,
        decisionEvidenceRef: evidenceHash,
        decisionEvidenceHash: evidenceHash.slice("decision-evidence:sha256:".length),
      });
    }
  }
}

