import { createHash } from "node:crypto";

export const SPEC208_CANDIDATE_BUILDER_VERSION = "spec208-deterministic-v1";

export const browserActionFamilyValues = [
  "click",
  "type",
  "select",
  "scroll",
  "press_key",
  "wait",
] as const;

export type BrowserActionFamily = (typeof browserActionFamilyValues)[number];
export type BrowserOperation = "CLICK" | "TYPE_TEXT" | "SELECT_OPTION" | "SCROLL" | "PRESS_KEY" | "WAIT";

export type Spec208BrowserElement = {
  targetRef: string;
  role: string;
  name: string;
  visible: boolean;
  enabled: boolean;
  occluded: boolean;
  frameId: string;
  origin: string;
  supportedActionFamilies: string[];
  semanticEffectId?: string;
};

export type Spec208BrowserObservation = {
  observationId: string;
  revision: number;
  observedAt: string;
  surface: "browser";
  origin: string;
  url: string;
  browserGeneration: string;
  elements: Spec208BrowserElement[];
  observationHash: string;
};

export type CandidateExclusion = {
  targetRef: string;
  reason:
    | "not_visible"
    | "disabled"
    | "occluded"
    | "action_family_not_allowed"
    | "prompt_injection"
    | "reduction_limit";
  detail?: string;
};

export type Spec208ActionCandidate = {
  candidateId: string;
  operation: BrowserOperation;
  targetRef: string;
  targetIdentity: string;
  allowed: true;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  semanticEffectId?: string;
  requiresApproval: boolean;
  semanticHint: string;
  observationId: string;
  observationRevision: number;
  browserGeneration: string;
  frameId: string;
  origin: string;
  supportedActionFamilies: BrowserActionFamily[];
};

export type Spec208CandidateSet = {
  candidateSetId: string;
  candidateSetHash: string;
  reductionStrategy: typeof SPEC208_CANDIDATE_BUILDER_VERSION;
  observationId: string;
  observationRevision: number;
  browserGeneration: string;
  candidates: Spec208ActionCandidate[];
  exclusions: CandidateExclusion[];
  createdAt: string;
};

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
    .join(",")}}`;
}

export function sha256Reference(namespace: string, value: unknown): string {
  return `${namespace}:sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`;
}
