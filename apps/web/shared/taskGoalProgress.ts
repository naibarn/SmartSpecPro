import { z } from "zod";

/**
 * Read-only projection for a goal baseline.  This module deliberately does
 * not persist observations or schedule work; callers must obtain both from
 * their existing authoritative sources.
 */

const identifierSchema = z.string().trim().min(1).max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const digestSchema = z.string().trim().regex(/^sha256:[a-f0-9]{64}$/i);
const weightSchema = z.number().finite().nonnegative();

const workUnitBaselineSchema = z.object({
  workUnitId: identifierSchema,
  weight: weightSchema.default(1),
}).strict();

const acceptanceCriterionBaselineSchema = z.object({
  criterionId: identifierSchema,
  weight: weightSchema,
  required: z.boolean(),
  liveRequired: z.boolean().default(false),
  workUnits: z.array(workUnitBaselineSchema).max(10_000).default([]),
}).strict();

const deliverableBaselineSchema = z.object({
  deliverableId: identifierSchema,
  weight: weightSchema,
  acceptanceCriteria: z.array(acceptanceCriterionBaselineSchema).min(1).max(10_000),
}).strict();

const milestoneBaselineSchema = z.object({
  milestoneId: identifierSchema,
  weight: weightSchema,
  deliverables: z.array(deliverableBaselineSchema).min(1).max(10_000),
}).strict();

export const goalBaselineSchema = z.object({
  goalId: identifierSchema,
  version: z.string().trim().min(1).max(200),
  digest: digestSchema,
  milestones: z.array(milestoneBaselineSchema).min(1).max(10_000),
}).strict().superRefine((baseline, context) => {
  const totalCriterionWeight = baseline.milestones
    .flatMap((milestone) => milestone.deliverables)
    .flatMap((deliverable) => deliverable.acceptanceCriteria)
    .reduce((total, criterion) => total + criterion.weight, 0);
  const totalHierarchicalWeight = baseline.milestones.reduce((milestoneTotal, milestone) =>
    milestoneTotal + milestone.deliverables.reduce((deliverableTotal, deliverable) =>
      deliverableTotal + deliverable.acceptanceCriteria.reduce((criterionTotal, criterion) =>
        criterionTotal + milestone.weight * deliverable.weight * criterion.weight, 0), 0), 0);

  if (totalCriterionWeight <= 0 || totalHierarchicalWeight <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["milestones"],
      message: "Declared acceptance-criterion weights must total more than zero",
    });
  }
});

export type GoalBaseline = z.infer<typeof goalBaselineSchema>;

export type GoalVerificationStatus = "PASS" | "FAIL" | "PENDING" | "UNVERIFIED";

export interface GoalProgressObservation {
  /** Must bind exactly to the currently projected trusted baseline. */
  baselineVersion: string;
  baselineDigest: string;
  criterionId: string;
  /** Revisions are monotonic per criterion; duplicate revisions must agree. */
  revision: number;
  evidenceRef: string | null;
  verificationStatus: GoalVerificationStatus;
  implemented: boolean;
  workComplete: boolean;
  workUnits?: readonly { workUnitId: string; implemented: boolean; workComplete: boolean; executionProgress: number | null }[];
  /** Fractional execution reported by the authoritative task/run read model. */
  executionProgress: number | null;
  liveRequired: boolean;
  liveVerified: boolean;
  reopened: boolean;
  regressed: boolean;
  blockers: readonly string[];
  dependencies: readonly string[];
  nextAction: string | null;
}

export interface GoalProgressInput {
  /** Optional because a goal without a trusted canonical baseline is unknown. */
  baseline?: GoalBaseline | null;
  observations: readonly GoalProgressObservation[];
}

export type GoalProgressStatus = "BASELINE_MISSING" | "PROJECTED" | "EVIDENCE_CONFLICT";

export interface GoalProgressMetric {
  /** null means that the source did not provide this particular read signal. */
  percent: number | null;
  completedWeight: number;
  totalWeight: number;
}

export interface GoalEvidenceCoverage {
  coveredCriteria: number;
  totalCriteria: number;
  weightedPercent: number;
}

export interface GoalScopeItem {
  criterionId: string;
  blockers: readonly string[];
  dependencies: readonly string[];
  nextAction: string | null;
}

export interface GoalProgressProjection {
  status: GoalProgressStatus;
  reason?: string | null;
  scopeVersion: { version: string; digest: string } | null;
  executionProgress: GoalProgressMetric;
  implementationCompletion: GoalProgressMetric;
  workCompletion: GoalProgressMetric;
  verifiedGoalCompletion: GoalProgressMetric & {
    /** Uncapped weighted result, retained to explain a zero-weight requirement cap. */
    rawPercent: number | null;
    requiredCriteriaComplete: boolean;
  };
  evidenceCoverage: GoalEvidenceCoverage;
  remainingScope: readonly GoalScopeItem[];
  blockedScope: readonly GoalScopeItem[];
  unverifiedScope: readonly GoalScopeItem[];
  ignoredObservationCount: number;
}

export class GoalProgressProjectionError extends Error {
  constructor(public readonly code: "BASELINE_DUPLICATE_CONFLICT" | "OBSERVATION_DUPLICATE_CONFLICT" | "OBSERVATION_INVALID") {
    super(code);
    this.name = "GoalProgressProjectionError";
  }
}

const ZERO_METRIC: GoalProgressMetric = {
  percent: null,
  completedWeight: 0,
  totalWeight: 0,
};

const noBaselineProjection = (): GoalProgressProjection => ({
  status: "BASELINE_MISSING",
  reason: "trusted_baseline_missing",
  scopeVersion: null,
  executionProgress: ZERO_METRIC,
  implementationCompletion: ZERO_METRIC,
  workCompletion: ZERO_METRIC,
  verifiedGoalCompletion: {
    ...ZERO_METRIC,
    rawPercent: null,
    requiredCriteriaComplete: false,
  },
  evidenceCoverage: { coveredCriteria: 0, totalCriteria: 0, weightedPercent: 0 },
  remainingScope: [],
  blockedScope: [],
  unverifiedScope: [],
  ignoredObservationCount: 0,
});

type CanonicalCriterion = {
  criterionId: string;
  weight: number;
  required: boolean;
  liveRequired: boolean;
  workUnits: readonly { workUnitId: string; weight: number }[];
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function duplicateConflict(): never {
  throw new GoalProgressProjectionError("BASELINE_DUPLICATE_CONFLICT");
}

function canonicalizeBaseline(baseline: GoalBaseline): readonly CanonicalCriterion[] {
  const milestones = new Map<string, string>();
  const deliverables = new Map<string, string>();
  const criteria = new Map<string, CanonicalCriterion>();
  const workUnits = new Map<string, string>();

  for (const milestone of baseline.milestones) {
    const milestoneIdentity = stableStringify({
      weight: milestone.weight,
      deliverableIds: milestone.deliverables.map((deliverable) => deliverable.deliverableId).sort(),
    });
    const existingMilestone = milestones.get(milestone.milestoneId);
    if (existingMilestone && existingMilestone !== milestoneIdentity) duplicateConflict();
    milestones.set(milestone.milestoneId, milestoneIdentity);

    for (const deliverable of milestone.deliverables) {
      const deliverableIdentity = stableStringify({
        weight: deliverable.weight,
        criterionIds: deliverable.acceptanceCriteria.map((criterion) => criterion.criterionId).sort(),
      });
      const existingDeliverable = deliverables.get(deliverable.deliverableId);
      if (existingDeliverable && existingDeliverable !== deliverableIdentity) duplicateConflict();
      deliverables.set(deliverable.deliverableId, deliverableIdentity);

      for (const criterion of deliverable.acceptanceCriteria) {
        const canonicalWorkUnits = [...criterion.workUnits]
          .sort((left, right) => left.workUnitId.localeCompare(right.workUnitId))
          .map((workUnit) => ({ workUnitId: workUnit.workUnitId, weight: workUnit.weight }));
        const canonical: CanonicalCriterion = {
          criterionId: criterion.criterionId,
          // Weights compose through the declared hierarchy. The resulting
          // product is normalized by the total at projection time.
          weight: milestone.weight * deliverable.weight * criterion.weight,
          required: criterion.required,
          liveRequired: criterion.liveRequired,
          workUnits: canonicalWorkUnits,
        };
        const existingCriterion = criteria.get(criterion.criterionId);
        if (existingCriterion && stableStringify(existingCriterion) !== stableStringify(canonical)) {
          duplicateConflict();
        }
        criteria.set(criterion.criterionId, canonical);

        for (const workUnit of criterion.workUnits) {
          const workUnitIdentity = stableStringify({ weight: workUnit.weight });
          const existingWorkUnit = workUnits.get(workUnit.workUnitId);
          if (existingWorkUnit && existingWorkUnit !== workUnitIdentity) duplicateConflict();
          workUnits.set(workUnit.workUnitId, workUnitIdentity);
        }
      }
    }
  }

  return [...criteria.values()].sort((left, right) => left.criterionId.localeCompare(right.criterionId));
}

function observationIsValid(observation: GoalProgressObservation): boolean {
  const workUnitsValid = observation.workUnits === undefined || (
    Array.isArray(observation.workUnits) && observation.workUnits.every((workUnit) =>
      typeof workUnit.workUnitId === "string" && workUnit.workUnitId.length > 0 &&
      typeof workUnit.implemented === "boolean" && typeof workUnit.workComplete === "boolean" &&
      (workUnit.executionProgress === null || (Number.isFinite(workUnit.executionProgress) && workUnit.executionProgress >= 0 && workUnit.executionProgress <= 1)))
  );
  return (
    typeof observation.criterionId === "string" && observation.criterionId.length > 0 &&
    Number.isSafeInteger(observation.revision) && observation.revision >= 0 &&
    (observation.executionProgress === null ||
      (Number.isFinite(observation.executionProgress) && observation.executionProgress >= 0 && observation.executionProgress <= 1)) &&
    typeof observation.implemented === "boolean" &&
    typeof observation.workComplete === "boolean" &&
    typeof observation.liveRequired === "boolean" &&
    typeof observation.liveVerified === "boolean" &&
    typeof observation.reopened === "boolean" &&
    typeof observation.regressed === "boolean" &&
    Array.isArray(observation.blockers) && Array.isArray(observation.dependencies) && workUnitsValid
  );
}

function identicalObservation(left: GoalProgressObservation, right: GoalProgressObservation): boolean {
  return stableStringify(left) === stableStringify(right);
}

function currentObservations(
  baseline: GoalBaseline,
  observations: readonly GoalProgressObservation[],
): { current: Map<string, GoalProgressObservation>; ignoredObservationCount: number } {
  const current = new Map<string, GoalProgressObservation>();
  const validWorkUnitIds = new Set(baseline.milestones.flatMap((milestone) => milestone.deliverables)
    .flatMap((deliverable) => deliverable.acceptanceCriteria).flatMap((criterion) => criterion.workUnits.map((unit) => unit.workUnitId)));
  let ignoredObservationCount = 0;

  for (const observation of observations) {
    if (!observationIsValid(observation)) {
      throw new GoalProgressProjectionError("OBSERVATION_INVALID");
    }
    if (observation.workUnits) {
      const unitObservations = new Map<string, string>();
      for (const unit of observation.workUnits) {
        const value = stableStringify(unit);
        const prior = unitObservations.get(unit.workUnitId);
        if (!validWorkUnitIds.has(unit.workUnitId) || (prior !== undefined && prior !== value)) {
          throw new GoalProgressProjectionError("OBSERVATION_INVALID");
        }
        unitObservations.set(unit.workUnitId, value);
      }
    }
    if (observation.baselineVersion !== baseline.version || observation.baselineDigest !== baseline.digest) {
      ignoredObservationCount += 1;
      continue;
    }
    const existing = current.get(observation.criterionId);
    if (!existing || observation.revision > existing.revision) {
      current.set(observation.criterionId, observation);
    } else if (observation.revision === existing.revision && !identicalObservation(existing, observation)) {
      throw new GoalProgressProjectionError("OBSERVATION_DUPLICATE_CONFLICT");
    }
  }

  return { current, ignoredObservationCount };
}

function percent(completedWeight: number, totalWeight: number): number {
  return totalWeight === 0 ? 0 : (completedWeight / totalWeight) * 100;
}

function metric(completedWeight: number, totalWeight: number, known: boolean): GoalProgressMetric {
  return {
    percent: known ? percent(completedWeight, totalWeight) : null,
    completedWeight,
    totalWeight,
  };
}

function scopeItem(criterionId: string, observation: GoalProgressObservation | undefined): GoalScopeItem {
  return {
    criterionId,
    blockers: observation ? [...observation.blockers] : [],
    dependencies: observation ? [...observation.dependencies] : [],
    nextAction: observation?.nextAction ?? null,
  };
}

/**
 * Projects trusted baseline plus read observations without changing either.
 * A matching PASS counts only when current, evidence-bound, unreopened and
 * unregressed; live evidence is additionally required when either source says
 * the criterion needs it.
 */
export function projectGoalProgress(input: GoalProgressInput): GoalProgressProjection {
  if (!input.baseline) return noBaselineProjection();

  const baseline = goalBaselineSchema.parse(input.baseline);
  const criteria = canonicalizeBaseline(baseline);
  const { current, ignoredObservationCount } = currentObservations(baseline, input.observations);
  const totalWeight = criteria.reduce((total, criterion) => total + criterion.weight, 0);
  const canonicalWorkUnits = new Map<string, { weight: number; criterionId: string }>();
  for (const criterion of criteria) {
    const childWeight = criterion.workUnits.reduce((sum, workUnit) => sum + workUnit.weight, 0);
    for (const workUnit of criterion.workUnits) {
      if (!canonicalWorkUnits.has(workUnit.workUnitId)) {
        canonicalWorkUnits.set(workUnit.workUnitId, {
          weight: childWeight > 0 ? criterion.weight * workUnit.weight / childWeight : 0,
          criterionId: criterion.criterionId,
        });
      }
    }
  }
  let executionWeight = 0;
  let executionKnownWeight = 0;
  let implementationWeight = 0;
  let implementationKnownWeight = 0;
  let workWeight = 0;
  let workKnownWeight = 0;
  let verifiedWeight = 0;
  let coveredCriteria = 0;
  let coveredWeight = 0;
  let requiredCriteriaComplete = true;
  const remainingScope: GoalScopeItem[] = [];
  const blockedScope: GoalScopeItem[] = [];
  const unverifiedScope: GoalScopeItem[] = [];

  for (const criterion of criteria) {
    const observation = current.get(criterion.criterionId);
    const evidenceBound = Boolean(observation?.evidenceRef?.trim());
    const currentEvidence = Boolean(observation && evidenceBound && !observation.reopened && !observation.regressed);
    const requiresLive = criterion.liveRequired || Boolean(observation?.liveRequired);
    const verified = Boolean(
      currentEvidence &&
      observation?.verificationStatus === "PASS" &&
      (!requiresLive || observation.liveVerified),
    );

    if (currentEvidence) {
      coveredCriteria += 1;
      coveredWeight += criterion.weight;
    }
    if (observation?.executionProgress !== null && observation?.executionProgress !== undefined) {
      executionKnownWeight += criterion.weight;
      executionWeight += criterion.weight * observation.executionProgress;
    }
    if (observation) {
      implementationKnownWeight += criterion.weight;
      if (observation.implemented) implementationWeight += criterion.weight;
    }
    if (verified) verifiedWeight += criterion.weight;
    if (!verified) {
      const item = scopeItem(criterion.criterionId, observation);
      remainingScope.push(item);
      unverifiedScope.push(item);
      if ((observation?.blockers.length ?? 0) > 0) blockedScope.push(item);
      if (criterion.required) requiredCriteriaComplete = false;
    }
  }

  // A shared work unit is counted once at its first canonical criterion path.
  for (const [workUnitId, unit] of canonicalWorkUnits) {
    const observationsForUnit = criteria.flatMap((criterion) => {
      const observation = current.get(criterion.criterionId);
      const workUnit = observation?.workUnits?.find((candidate) => candidate.workUnitId === workUnitId);
      return workUnit ? [{ revision: observation!.revision, workUnit }] : [];
    });
    if (!observationsForUnit.length) continue;
    const newestRevision = Math.max(...observationsForUnit.map((item) => item.revision));
    const newest = observationsForUnit.filter((item) => item.revision === newestRevision);
    if (new Set(newest.map((item) => stableStringify(item.workUnit))).size > 1) {
      throw new GoalProgressProjectionError("OBSERVATION_DUPLICATE_CONFLICT");
    }
    const workUnit = newest[0].workUnit;
    workKnownWeight += unit.weight;
    if (workUnit.workComplete) workWeight += unit.weight;
  }

  const totalWorkWeight = [...canonicalWorkUnits.values()].reduce((total, unit) => total + unit.weight, 0)
    + criteria.filter((criterion) => criterion.workUnits.length === 0).reduce((total, criterion) => total + criterion.weight, 0);
  for (const criterion of criteria.filter((item) => item.workUnits.length === 0)) {
    const observation = current.get(criterion.criterionId);
    if (observation) {
      workKnownWeight += criterion.weight;
      if (observation.workComplete) workWeight += criterion.weight;
    }
  }

  const rawVerifiedPercent = percent(verifiedWeight, totalWeight);
  // A zero-weight required criterion cannot add to the numerator, but it still
  // prevents a completion claim. Keep the raw value for auditability.
  const visibleVerifiedPercent = requiredCriteriaComplete
    ? rawVerifiedPercent
    : Math.min(rawVerifiedPercent, 99.999999);

  return {
    status: "PROJECTED",
    scopeVersion: { version: baseline.version, digest: baseline.digest },
    executionProgress: metric(executionWeight, totalWeight, executionKnownWeight >= totalWeight),
    implementationCompletion: metric(implementationWeight, totalWeight, implementationKnownWeight >= totalWeight),
    workCompletion: metric(workWeight, totalWorkWeight, workKnownWeight >= totalWorkWeight),
    verifiedGoalCompletion: {
      percent: visibleVerifiedPercent,
      rawPercent: rawVerifiedPercent,
      completedWeight: verifiedWeight,
      totalWeight,
      requiredCriteriaComplete,
    },
    evidenceCoverage: {
      coveredCriteria,
      totalCriteria: criteria.length,
      weightedPercent: percent(coveredWeight, totalWeight),
    },
    remainingScope,
    blockedScope,
    unverifiedScope,
    ignoredObservationCount,
  };
}
