export interface DecisionCriterion {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly direction: "higher_is_better" | "lower_is_better";
  readonly required: boolean;
  readonly normalization: string;
}

export interface DecisionValue {
  readonly value: number;
  readonly low?: number;
  readonly high?: number;
  readonly evidenceRefs: readonly string[];
  /** True only after the shared Spec 266 admission/authorization check. */
  readonly admitted: boolean;
}

export interface DecisionAlternative {
  readonly id: string;
  readonly values: Readonly<Record<string, DecisionValue | undefined>>;
}

export interface DecisionAnalysisInput {
  readonly templateVersion: string;
  readonly methodologyVersion: string;
  readonly criteria: readonly DecisionCriterion[];
  readonly alternatives: readonly DecisionAlternative[];
}

export interface DecisionContribution {
  readonly criterionId: string;
  readonly rawValue: number;
  readonly normalizedValue: number;
  readonly weightedContribution: number;
  readonly evidenceRefs: readonly string[];
}

export interface DecisionRanking {
  readonly alternativeId: string;
  readonly comparable: boolean;
  readonly score?: number;
  readonly lowerBound?: number;
  readonly upperBound?: number;
  readonly contributions: readonly DecisionContribution[];
  readonly missingRequiredCriteria: readonly string[];
}

export interface DecisionAnalysisResult {
  readonly templateVersion: string;
  readonly methodologyVersion: string;
  readonly ranking: readonly DecisionRanking[];
  readonly readiness: {
    readonly status: "blocked" | "partial" | "ready";
    readonly requiredCovered: number;
    readonly requiredTotal: number;
    readonly criticalMissing: readonly string[];
  };
  readonly materiallyDistinguishable: boolean;
  readonly sensitivity: {
    readonly method: "one_criterion_at_a_time_relative_10_percent_v1";
    readonly relativeWeightDelta: 0.1;
    readonly stableTopChoice: boolean;
    readonly changedTopAlternativeIds: readonly string[];
  };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MAX_CRITERIA = 100;
const MAX_ALTERNATIVES = 100;
const MAX_EVIDENCE_REFS = 128;
const round = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

function validate(input: DecisionAnalysisInput): void {
  if (!ID.test(input.templateVersion) || !ID.test(input.methodologyVersion) ||
    input.criteria.length === 0 || input.criteria.length > MAX_CRITERIA || input.alternatives.length > MAX_ALTERNATIVES) {
    throw new Error("DECISION_ANALYSIS_INVALID");
  }
  const criterionIds = new Set<string>();
  for (const criterion of input.criteria) {
    if (!ID.test(criterion.id) || criterionIds.has(criterion.id) || !criterion.label.trim() || criterion.label.length > 200 ||
      !Number.isFinite(criterion.weight) || criterion.weight <= 0 || criterion.weight > 1_000 ||
      (criterion.direction !== "higher_is_better" && criterion.direction !== "lower_is_better") ||
      criterion.normalization !== "unit_interval") throw new Error("DECISION_CRITERIA_INVALID");
    criterionIds.add(criterion.id);
  }
  const alternativeIds = new Set<string>();
  for (const alternative of input.alternatives) {
    if (!ID.test(alternative.id) || alternativeIds.has(alternative.id)) throw new Error("DECISION_ALTERNATIVE_INVALID");
    alternativeIds.add(alternative.id);
    for (const [criterionId, value] of Object.entries(alternative.values)) {
      if (!criterionIds.has(criterionId)) throw new Error("DECISION_VALUE_INVALID");
      if (value && (!Number.isFinite(value.value) || value.value < 0 || value.value > 1 ||
        (value.low !== undefined && (!Number.isFinite(value.low) || value.low < 0 || value.low > value.value)) ||
        (value.high !== undefined && (!Number.isFinite(value.high) || value.high < value.value || value.high > 1)) ||
        !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length === 0 || value.evidenceRefs.length > MAX_EVIDENCE_REFS ||
        value.evidenceRefs.some(ref => !ID.test(ref)) || new Set(value.evidenceRefs).size !== value.evidenceRefs.length || typeof value.admitted !== "boolean")) {
        throw new Error("DECISION_VALUE_INVALID");
      }
    }
  }
}

function normalized(value: number, direction: DecisionCriterion["direction"]): number {
  return direction === "higher_is_better" ? value : 1 - value;
}

function scoreAlternative(
  alternative: DecisionAlternative,
  criteria: readonly DecisionCriterion[],
): DecisionRanking {
  const contributions: DecisionContribution[] = [];
  const missingRequiredCriteria: string[] = [];
  let weightTotal = 0;
  let scoreTotal = 0;
  let lowTotal = 0;
  let highTotal = 0;

  for (const criterion of criteria) {
    const value = alternative.values[criterion.id];
    if (!value || !value.admitted || value.evidenceRefs.length === 0) {
      if (criterion.required) missingRequiredCriteria.push(criterion.id);
      continue;
    }
    const normalizedValue = normalized(value.value, criterion.direction);
    const low = normalized(value.low ?? value.value, criterion.direction);
    const high = normalized(value.high ?? value.value, criterion.direction);
    const lowerBound = Math.min(low, high);
    const upperBound = Math.max(low, high);
    weightTotal += criterion.weight;
    scoreTotal += criterion.weight * normalizedValue;
    lowTotal += criterion.weight * lowerBound;
    highTotal += criterion.weight * upperBound;
    contributions.push({
      criterionId: criterion.id,
      rawValue: value.value,
      normalizedValue: round(normalizedValue),
      weightedContribution: round(criterion.weight * normalizedValue),
      evidenceRefs: [...value.evidenceRefs],
    });
  }

  if (weightTotal === 0) return { alternativeId: alternative.id, comparable: missingRequiredCriteria.length === 0, contributions, missingRequiredCriteria };
  return {
    alternativeId: alternative.id,
    comparable: missingRequiredCriteria.length === 0,
    score: round(scoreTotal / weightTotal),
    lowerBound: round(lowTotal / weightTotal),
    upperBound: round(highTotal / weightTotal),
    contributions,
    missingRequiredCriteria,
  };
}

/** Deterministic, version-pinned weighted score; no LLM-generated values or missing-as-zero behavior. */
export function analyzeDecision(input: DecisionAnalysisInput): DecisionAnalysisResult {
  validate(input);
  const ranking = input.alternatives.map(alternative => scoreAlternative(alternative, input.criteria))
    .sort((a, b) => Number(b.comparable) - Number(a.comparable) || (b.score ?? -1) - (a.score ?? -1) || a.alternativeId.localeCompare(b.alternativeId));
  const requiredCriteria = input.criteria.filter(criterion => criterion.required);
  const requiredCovered = requiredCriteria.filter(criterion => input.alternatives.length > 0 && input.alternatives.every(alternative => {
    const value = alternative.values[criterion.id];
    return Boolean(value?.admitted && value.evidenceRefs.length > 0);
  }));
  const criticalMissing = requiredCriteria.filter(criterion => !requiredCovered.includes(criterion)).map(criterion => criterion.id);
  const status = input.alternatives.length === 0 || (requiredCriteria.length > 0 && requiredCovered.length === 0)
    ? "blocked"
    : criticalMissing.length > 0
      ? "partial"
      : "ready";
  const changedTopAlternativeIds = new Set<string>();
  const baselineTop = ranking[0]?.alternativeId;
  if (baselineTop) {
    for (let criterionIndex = 0; criterionIndex < input.criteria.length; criterionIndex += 1) {
      for (const weightMultiplier of [0.9, 1.1]) {
        const perturbedCriteria = input.criteria.map((criterion, index) => index === criterionIndex
          ? { ...criterion, weight: criterion.weight * weightMultiplier }
          : criterion);
        const perturbedTop = input.alternatives.map(alternative => scoreAlternative(alternative, perturbedCriteria))
          .sort((a, b) => Number(b.comparable) - Number(a.comparable) || (b.score ?? -1) - (a.score ?? -1) || a.alternativeId.localeCompare(b.alternativeId))[0]?.alternativeId;
        if (perturbedTop && perturbedTop !== baselineTop) changedTopAlternativeIds.add(perturbedTop);
      }
    }
  }
  const first = ranking[0];
  const second = ranking[1];
  const materiallyDistinguishable = Boolean(first && second && first.comparable && second.comparable && first.lowerBound !== undefined && first.upperBound !== undefined &&
    second.lowerBound !== undefined && second.upperBound !== undefined && (first.lowerBound > second.upperBound || second.lowerBound > first.upperBound));

  return {
    templateVersion: input.templateVersion,
    methodologyVersion: input.methodologyVersion,
    ranking,
    readiness: { status, requiredCovered: requiredCovered.length, requiredTotal: requiredCriteria.length, criticalMissing },
    materiallyDistinguishable,
    sensitivity: {
      method: "one_criterion_at_a_time_relative_10_percent_v1",
      relativeWeightDelta: 0.1,
      stableTopChoice: Boolean(baselineTop && ranking[0]?.comparable) && changedTopAlternativeIds.size === 0,
      changedTopAlternativeIds: [...changedTopAlternativeIds].sort(),
    },
  };
}
