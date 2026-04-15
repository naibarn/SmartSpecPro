import type { RoleAutonomyTier, RoleRoutineRun, RoleWorkpackBinding } from "../../shared/roleAgentContracts";
import type { BenchmarkPack } from "../../shared/workpackPromotion";
import type { WorkpackVersion } from "../../shared/workpackContracts";
import { getWorkpackReadinessSummary } from "./workpackReadinessService";
import { evaluateWorkpackRolloutGate } from "./workpackRolloutGateService";
import { getWorkpack, getWorkpackVersion } from "./workpackPersistence";
import {
  updateRoleRoutineRun,
} from "./rolePersistence";

const SIDE_EFFECT_RANK: Record<string, number> = {
  read_only: 0,
  bounded_write: 1,
  external_write: 2,
  irreversible: 3,
  financial: 4,
  privileged: 5,
};

const ROLE_AUTONOMY_RANK: Record<RoleAutonomyTier, number> = {
  manual: 0,
  guided: 1,
  supervised: 2,
  autonomous: 3,
};

export interface ResolvedRoleWorkpackTarget {
  workpackId: string;
  versionId: string;
  bindingId: string;
  resolutionPolicy: RoleWorkpackBinding["resolutionPolicy"];
  rollbackBaselineVersionId: string | null;
  previousResolvedVersionId: string | null;
  readinessGateResult: string;
  rolloutPhase: string;
  blockers: string[];
  effectiveAutonomyTier: RoleAutonomyTier;
}

function workpackAutonomyToRoleTier(autonomyMode: "draft" | "supervised" | "autonomous"): RoleAutonomyTier {
  if (autonomyMode === "autonomous") return "autonomous";
  if (autonomyMode === "supervised") return "supervised";
  return "manual";
}

function lowerAutonomyTier(left: RoleAutonomyTier, right: RoleAutonomyTier): RoleAutonomyTier {
  return ROLE_AUTONOMY_RANK[left] <= ROLE_AUTONOMY_RANK[right] ? left : right;
}

function estimatedWorkpackBudget(detail: any): number {
  return detail.version.executionPlan?.steps.reduce((total: number, step: any) => {
    return total + (step.sideEffectClass === "read_only" ? 1 : step.sideEffectClass === "bounded_write" ? 3 : 5);
  }, 0) ?? 0;
}

function maxWorkpackSideEffect(detail: any): keyof typeof SIDE_EFFECT_RANK {
  const maxStep = detail.version.executionPlan?.steps.reduce((current: keyof typeof SIDE_EFFECT_RANK, step: any) => {
    return SIDE_EFFECT_RANK[step.sideEffectClass] > SIDE_EFFECT_RANK[current]
      ? step.sideEffectClass
      : current;
  }, "read_only" as keyof typeof SIDE_EFFECT_RANK);
  return maxStep ?? "read_only";
}

function dedupeTargets(targets: Array<{ workpackId: string; versionId: string }>): Array<{ workpackId: string; versionId: string }> {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.workpackId}:${target.versionId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function compareVersionPriority(left: WorkpackVersion, right: WorkpackVersion): number {
  if (left.versionNumber !== right.versionNumber) {
    return right.versionNumber - left.versionNumber;
  }
  return right.createdAt.localeCompare(left.createdAt);
}

function sortBenchmarks(benchmarks: BenchmarkPack[]): BenchmarkPack[] {
  return [...benchmarks].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

async function resolveBindingTargets(binding: RoleWorkpackBinding): Promise<Array<{ workpackId: string; versionId: string }>> {
  if (binding.resolutionPolicy === "pinned_version") {
    if (!binding.pinnedVersionId) return [];
    const version = await getWorkpackVersion(binding.pinnedVersionId);
    if (!version) return [];
    return [{ workpackId: version.workpackId, versionId: version.id }];
  }

  const workpack = await getWorkpack(binding.workpackFamily);
  if (!workpack) return [];

  const { getWorkpackDetail, listVersionsForWorkpack } = await import("./workpackPersistence");
  const [detail, versions] = await Promise.all([
    getWorkpackDetail(workpack.id),
    listVersionsForWorkpack(workpack.id),
  ]);
  const sortedVersions = [...versions].sort(compareVersionPriority);

  if (binding.resolutionPolicy === "follow_benchmark_track") {
    const publishedBenchmarks = sortBenchmarks(
      (detail?.benchmarks ?? []).filter((benchmark) => benchmark.publicationStatus === "published"),
    );
    const benchmarkTargets = publishedBenchmarks.map((benchmark) => ({
      workpackId: benchmark.sourceWorkpackId,
      versionId: benchmark.sourceVersionId,
    }));
    const fallbackTargets = sortedVersions.slice(0, 1).map((version) => ({
      workpackId: version.workpackId,
      versionId: version.id,
    }));
    return dedupeTargets([
      ...benchmarkTargets,
      ...fallbackTargets,
      ...(binding.rollbackBaselineVersionId
        ? [{ workpackId: workpack.id, versionId: binding.rollbackBaselineVersionId }]
        : []),
    ]);
  }

  return dedupeTargets([
    ...sortedVersions.map((version) => ({
      workpackId: version.workpackId,
      versionId: version.id,
    })),
    ...(binding.rollbackBaselineVersionId
      ? [{ workpackId: workpack.id, versionId: binding.rollbackBaselineVersionId }]
      : []),
  ]);
}

async function bindingAuthorityBlockers(binding: RoleWorkpackBinding, detail: any, roleAutonomyTier: RoleAutonomyTier): Promise<string[]> {
  const blockers: string[] = [];
  const connectorFamilies: string[] = Array.from(new Set<string>(
    detail.version.connectorMaps
      .map((map: any) => typeof map.connectorFamily === "string" ? map.connectorFamily : null)
      .filter((family: string | null): family is string => Boolean(family)),
  ));
  if (binding.connectorCeilingFamilies.length > 0 && connectorFamilies.some((family) => !binding.connectorCeilingFamilies.includes(family))) {
    blockers.push("connector_scope_exceeded");
  }

  const maxSideEffect = maxWorkpackSideEffect(detail);
  if (SIDE_EFFECT_RANK[maxSideEffect] > SIDE_EFFECT_RANK[binding.sideEffectCeiling]) {
    blockers.push("side_effect_ceiling_exceeded");
  }

  if (binding.budgetCeiling > 0 && estimatedWorkpackBudget(detail) > binding.budgetCeiling) {
    blockers.push("budget_ceiling_exceeded");
  }

  const effectiveAutonomy = lowerAutonomyTier(roleAutonomyTier, workpackAutonomyToRoleTier(detail.workpack.autonomyMode));
  if (ROLE_AUTONOMY_RANK[effectiveAutonomy] < ROLE_AUTONOMY_RANK[roleAutonomyTier]) {
    blockers.push("autonomy_downgraded_by_workpack");
  }

  if (binding.regulatedBoundaryLabel && maxSideEffect !== "read_only") {
    blockers.push("regulated_boundary_review_required");
  }

  return blockers;
}

export async function resolveRoleRoutineRunWorkpackTarget(routineRunId: string): Promise<ResolvedRoleWorkpackTarget> {
  const roleDetail = await getRoleDetailForRun(routineRunId);
  if (!roleDetail) {
    throw new Error(`Unknown role routine run: ${routineRunId}`);
  }

  const run = roleDetail.run;
  const routine = roleDetail.routine;
  const bindingCandidates = roleDetail.bindings.filter((binding) => routine.workpackBindingIds.includes(binding.id) && binding.active);
  if (bindingCandidates.length === 0) {
    throw new Error(`Routine ${routine.id} has no active role-workpack bindings`);
  }

  const blockers: string[] = [];
  const resolutionAttempts = (await Promise.all(bindingCandidates.map(async (binding) => {
    const targets = await resolveBindingTargets(binding);
    if (targets.length === 0) {
      return [{ binding, target: null, blockers: ["binding_target_missing"] }];
    }

    return Promise.all(targets.map(async (target) => {
      const workpackDetail = await import("./workpackPersistence").then((module) => module.getWorkpackDetail(target.workpackId));
      if (!workpackDetail) {
        return { binding, target: null, blockers: ["version_not_available"] };
      }

      const candidateVersion = target.versionId === workpackDetail.version.id
        ? workpackDetail.version
        : (await import("./workpackPersistence").then((module) => module.getWorkpackVersion(target.versionId)));
      if (!candidateVersion || candidateVersion.workpackId !== target.workpackId) {
        return { binding, target: null, blockers: ["version_not_available"] };
      }

      const detailForCandidate = {
        ...workpackDetail,
        version: candidateVersion,
      };

      const rollout = await evaluateWorkpackRolloutGate({
        workpackId: target.workpackId,
        targetMode: routine.autonomyTier === "autonomous" ? "autonomous" : "supervised",
      });
      const readiness = await getWorkpackReadinessSummary(target.workpackId);
      const authorityBlockers = await bindingAuthorityBlockers(binding, detailForCandidate, routine.autonomyTier);
      const candidateBlockers = [
        ...(rollout.gateResult === "blocked" ? rollout.blockers : []),
        ...(rollout.gateResult === "review_required" ? [rollout.reasonCode] : []),
        ...(readiness.gateResult === "blocked" ? [readiness.reasonCode] : []),
        ...authorityBlockers,
      ];

      return {
        binding,
        target,
        workpackDetail: detailForCandidate,
        rollout,
        readiness,
        blockers: candidateBlockers,
      };
    }));
  }))).flat();

  const selected = resolutionAttempts.find((attempt) => attempt.target && attempt.blockers.length === 0);
  if (!selected || !selected.target) {
    for (const attempt of resolutionAttempts) {
      blockers.push(...attempt.blockers);
    }
    await updateRoleRoutineRun(run.id, (current) => ({
      ...current,
      status: "blocked",
      blockerCodes: Array.from(new Set([...current.blockerCodes, ...blockers])),
      updatedAt: new Date().toISOString(),
    }));
    throw new Error(`No eligible workpack target for routine run ${run.id}: ${Array.from(new Set(blockers)).join(", ")}`);
  }

  const effectiveAutonomyTier = lowerAutonomyTier(
    routine.autonomyTier,
    workpackAutonomyToRoleTier(selected.workpackDetail.workpack.autonomyMode),
  );

  const resolved = {
    workpackId: selected.target.workpackId,
    versionId: selected.target.versionId,
    bindingId: selected.binding.id,
    resolutionPolicy: selected.binding.resolutionPolicy,
    rollbackBaselineVersionId: selected.binding.rollbackBaselineVersionId ?? null,
    previousResolvedVersionId: run.resolvedWorkpackVersionId ?? null,
    readinessGateResult: selected.readiness.gateResult,
    rolloutPhase: selected.rollout.rolloutPhase,
    blockers: [],
    effectiveAutonomyTier,
  } satisfies ResolvedRoleWorkpackTarget;

  if (run.resolvedWorkpackVersionId && run.resolvedWorkpackVersionId !== resolved.versionId) {
    await updateRoleRoutineRun(run.id, (current) => ({
      ...current,
      status: "blocked",
      blockerCodes: Array.from(new Set([...current.blockerCodes, "version_transition_requires_new_cycle"])),
      updatedAt: new Date().toISOString(),
    }));
    throw new Error(`Routine run ${run.id} requires a new cycle boundary before switching workpack version`);
  }

  await updateRoleRoutineRun(run.id, (current) => ({
    ...current,
    selectedWorkpackFamily: resolved.workpackId,
    resolvedWorkpackVersionId: resolved.versionId,
    resolutionPolicy: resolved.resolutionPolicy,
    previousResolvedVersionId: resolved.previousResolvedVersionId,
    rollbackBaselineVersionId: resolved.rollbackBaselineVersionId,
    updatedAt: new Date().toISOString(),
  }));

  return resolved;
}

async function getRoleDetailForRun(routineRunId: string): Promise<{
  run: RoleRoutineRun;
  routine: import("../../shared/roleAgentContracts").RoleRoutine;
  bindings: RoleWorkpackBinding[];
} | null> {
  const { getRoleRoutineRun, getRoleRoutine, listRoleBindingsForRole } = await import("./rolePersistence");
  const run = await getRoleRoutineRun(routineRunId);
  if (!run) return null;
  const routine = await getRoleRoutine(run.routineId);
  if (!routine) return null;
  const bindings = await listRoleBindingsForRole(run.roleId);
  return { run, routine, bindings };
}
