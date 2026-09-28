import {
  sha256Reference,
  type BrowserActionFamily,
  type BrowserOperation,
  type Spec208ActionCandidate,
  type Spec208BrowserElement,
  type Spec208BrowserObservation,
  type Spec208CandidateSet,
  SPEC208_CANDIDATE_BUILDER_VERSION,
  type CandidateExclusion,
} from "./computerUseSpec208Contracts";

type RawBrowserObservation = {
  observationId: unknown;
  revision: unknown;
  observedAt: unknown;
  origin: unknown;
  url?: unknown;
  browserGeneration: unknown;
  elements: unknown;
};

type RawBrowserElement = {
  targetRef: unknown;
  role: unknown;
  name: unknown;
  visible: unknown;
  enabled: unknown;
  occluded: unknown;
  frameId: unknown;
  origin?: unknown;
  supportedActionFamilies: unknown;
  semanticEffectId?: unknown;
};

const operationByFamily: Record<BrowserActionFamily, BrowserOperation> = {
  click: "CLICK",
  type: "TYPE_TEXT",
  select: "SELECT_OPTION",
  scroll: "SCROLL",
  press_key: "PRESS_KEY",
  wait: "WAIT",
};

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function requiredOrigin(value: unknown, code: string): string {
  const origin = requiredText(value, code);
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(code);
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin) throw new Error(code);
  return parsed.origin;
}

function supportedFamilies(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("OBSERVATION_ACTION_FAMILIES_INVALID");
  const families = value.map(item => requiredText(item, "OBSERVATION_ACTION_FAMILY_INVALID"));
  return Array.from(new Set(families));
}

function normalizeElement(raw: RawBrowserElement, observationOrigin: string): Spec208BrowserElement {
  const origin = raw.origin === undefined ? observationOrigin : requiredOrigin(raw.origin, "OBSERVATION_ELEMENT_ORIGIN_INVALID");
  return {
    targetRef: requiredText(raw.targetRef, "OBSERVATION_TARGET_REF_INVALID"),
    role: requiredText(raw.role, "OBSERVATION_ROLE_INVALID").toLowerCase(),
    name: requiredText(raw.name, "OBSERVATION_NAME_INVALID"),
    visible: raw.visible === true,
    enabled: raw.enabled !== false,
    occluded: raw.occluded === true,
    frameId: requiredText(raw.frameId, "OBSERVATION_FRAME_INVALID"),
    origin,
    supportedActionFamilies: supportedFamilies(raw.supportedActionFamilies),
    ...(raw.semanticEffectId === undefined ? {} : { semanticEffectId: requiredText(raw.semanticEffectId, "OBSERVATION_EFFECT_INVALID") }),
  };
}

export function normalizeBrowserObservation(raw: RawBrowserObservation): Spec208BrowserObservation {
  const observationId = requiredText(raw.observationId, "OBSERVATION_ID_INVALID");
  const revision = raw.revision;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("OBSERVATION_REVISION_INVALID");
  const observedAt = requiredText(raw.observedAt, "OBSERVATION_TIMESTAMP_INVALID");
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("OBSERVATION_TIMESTAMP_INVALID");
  const origin = requiredOrigin(raw.origin, "OBSERVATION_ORIGIN_INVALID");
  const url = requiredText(raw.url ?? origin, "OBSERVATION_URL_INVALID");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("OBSERVATION_URL_INVALID");
  }
  if (parsedUrl.origin !== origin) throw new Error("OBSERVATION_URL_ORIGIN_MISMATCH");
  const browserGeneration = requiredText(raw.browserGeneration, "OBSERVATION_BROWSER_GENERATION_INVALID");
  if (!Array.isArray(raw.elements)) throw new Error("OBSERVATION_ELEMENTS_INVALID");
  const elements = raw.elements.map(element => normalizeElement(element as RawBrowserElement, origin));
  const normalized = {
    observationId,
    revision,
    observedAt,
    surface: "browser" as const,
    origin,
    url,
    browserGeneration,
    elements,
  };
  return { ...normalized, observationHash: sha256Reference("observation", normalized) };
}

function containsPromptInjection(element: Spec208BrowserElement): boolean {
  return /ignore\s+(all\s+)?previous|system\s+message|developer\s+instruction|reveal\s+secret/i.test(element.name);
}

function riskFor(operation: BrowserOperation): "LOW" | "MEDIUM" | "HIGH" {
  if (operation === "CLICK" || operation === "SCROLL" || operation === "WAIT") return "LOW";
  if (operation === "TYPE_TEXT" || operation === "SELECT_OPTION") return "MEDIUM";
  return "HIGH";
}

function candidateFor(
  element: Spec208BrowserElement,
  family: BrowserActionFamily,
  observation: Spec208BrowserObservation,
): Spec208ActionCandidate {
  const operation = operationByFamily[family];
  return {
    candidateId: sha256Reference("candidate", [observation.observationId, observation.revision, observation.browserGeneration, element.targetRef, operation]),
    operation,
    targetRef: element.targetRef,
    targetIdentity: `${element.origin}|${element.frameId}|${element.targetRef}`,
    allowed: true,
    riskLevel: riskFor(operation),
    ...(element.semanticEffectId ? { semanticEffectId: element.semanticEffectId } : {}),
    requiresApproval: operation === "TYPE_TEXT" || operation === "SELECT_OPTION",
    semanticHint: element.name,
    observationId: observation.observationId,
    observationRevision: observation.revision,
    browserGeneration: observation.browserGeneration,
    frameId: element.frameId,
    origin: element.origin,
    supportedActionFamilies: [family],
  };
}

export function buildBoundedBrowserCandidateSet(input: {
  observation: Spec208BrowserObservation;
  subgoal: string;
  allowedActionFamilies: readonly BrowserActionFamily[];
  maxCandidates: number;
  createdAt?: string;
}): Spec208CandidateSet {
  if (!input.subgoal.trim()) throw new Error("CANDIDATE_SUBGOAL_REQUIRED");
  if (!Number.isSafeInteger(input.maxCandidates) || input.maxCandidates < 1 || input.maxCandidates > 64) {
    throw new Error("CANDIDATE_LIMIT_INVALID");
  }
  const allowed = new Set(input.allowedActionFamilies);
  const exclusions: CandidateExclusion[] = [];
  const candidates: Spec208ActionCandidate[] = [];
  for (const element of input.observation.elements) {
    if (element.origin !== input.observation.origin) throw new Error("CANDIDATE_TARGET_ORIGIN_MISMATCH");
    if (containsPromptInjection(element)) {
      exclusions.push({ targetRef: element.targetRef, reason: "prompt_injection" });
      continue;
    }
    if (!element.visible) {
      exclusions.push({ targetRef: element.targetRef, reason: "not_visible" });
      continue;
    }
    if (!element.enabled) {
      exclusions.push({ targetRef: element.targetRef, reason: "disabled" });
      continue;
    }
    if (element.occluded) {
      exclusions.push({ targetRef: element.targetRef, reason: "occluded" });
      continue;
    }
    const family = element.supportedActionFamilies.find(item => allowed.has(item as BrowserActionFamily)) as BrowserActionFamily | undefined;
    if (!family) {
      exclusions.push({ targetRef: element.targetRef, reason: "action_family_not_allowed" });
      continue;
    }
    candidates.push(candidateFor(element, family, input.observation));
  }
  candidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const bounded = candidates.slice(0, input.maxCandidates);
  for (const candidate of candidates.slice(input.maxCandidates)) {
    exclusions.push({ targetRef: candidate.targetRef, reason: "reduction_limit" });
  }
  const body = {
    reductionStrategy: SPEC208_CANDIDATE_BUILDER_VERSION,
    observationId: input.observation.observationId,
    observationRevision: input.observation.revision,
    browserGeneration: input.observation.browserGeneration,
    candidates: bounded,
    exclusions,
  };
  const candidateSetHash = sha256Reference("candidate-set", body).slice("candidate-set:".length);
  return {
    candidateSetId: `candidate-set:${candidateSetHash.slice("sha256:".length, 40)}`,
    candidateSetHash,
    reductionStrategy: SPEC208_CANDIDATE_BUILDER_VERSION,
    observationId: input.observation.observationId,
    observationRevision: input.observation.revision,
    browserGeneration: input.observation.browserGeneration,
    candidates: bounded,
    exclusions,
    // The candidate set is a deterministic projection of one observation;
    // wall-clock creation time would make repeated builds differ even when
    // observationId/revision/content are identical.
    createdAt: input.createdAt ?? input.observation.observedAt,
  };
}
