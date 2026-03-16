/**
 * Skill Pipeline Engine — COMPOUND mode execution.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator (Section 06).
 * Handles topological sorting, wave-based parallel execution,
 * input mapping, per-step error strategies, and async skill handling.
 */

import { getSkillByIdAsync, type SkillDefinition } from "./skillRegistry";
import { executeSkill, type SkillExecutionParams, type SkillExecutionResult } from "./skillExecutor";
import { resolvePromptField } from "./skillParamExtractor";
import type { PipelineStep, ErrorStrategy } from "@shared/orchestration/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const ASYNC_STEP_TIMEOUT_MS = 60_000;
const ASYNC_POLL_INTERVAL_MS = 3_000;
const MAX_PIPELINE_STEPS = 10;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PipelineStepResult {
  stepId: string;
  skillId: string;
  status: "completed" | "failed" | "skipped" | "pending_async";
  result?: SkillExecutionResult;
  error?: string;
  creditsUsed: number;
  durationMs: number;
}

export interface PipelineResult {
  steps: PipelineStepResult[];
  totalCreditsUsed: number;
  totalDurationMs: number;
}

export interface PipelineOptions {
  userId: number;
  tenantId: string;
  userToken: string;
  traceId: string;
  budget?: number;
}

// ─── Topological Sort ────────────────────────────────────────────────────────

function topologicalSort(steps: PipelineStep[]): PipelineStep[][] {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.id, step.dependsOn.length);
    for (const dep of step.dependsOn) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(step.id);
    }
  }

  const waves: PipelineStep[][] = [];
  const scheduled = new Set<string>();

  while (scheduled.size < steps.length) {
    const wave: PipelineStep[] = [];
    for (const step of steps) {
      if (scheduled.has(step.id)) continue;
      if ((inDegree.get(step.id) ?? 0) === 0) {
        wave.push(step);
      }
    }

    if (wave.length === 0) {
      const remaining = steps.filter((s) => !scheduled.has(s.id)).map((s) => s.id);
      throw new Error(`Cycle detected in pipeline steps: ${remaining.join(", ")}`);
    }

    waves.push(wave);
    for (const step of wave) {
      scheduled.add(step.id);
      for (const depId of dependents.get(step.id) ?? []) {
        inDegree.set(depId, (inDegree.get(depId) ?? 1) - 1);
      }
    }
  }

  return waves;
}

// ─── Input Mapping Resolution ────────────────────────────────────────────────

export function resolveInputMapping(
  mapping: Record<string, string>,
  completedResults: Map<string, SkillExecutionResult>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(mapping)) {
    if (!value.includes(".")) {
      // Literal value
      resolved[key] = value;
      continue;
    }

    const dotIdx = value.indexOf(".");
    const stepId = value.slice(0, dotIdx);
    const fieldPath = value.slice(dotIdx + 1);

    const stepResult = completedResults.get(stepId);
    if (!stepResult) {
      resolved[key] = undefined;
      continue;
    }

    resolved[key] = resolveField(stepResult, fieldPath);
  }

  return resolved;
}

function resolveField(result: SkillExecutionResult, path: string): unknown {
  // Handle well-known aliases
  if (path === "content" || path === "text") return result.message;
  if (path === "url") return (result as any).resultUrl;
  if (path === "urls") return (result as any).resultUrls;
  if (path === "type") return result.type;

  // Handle urls[N]
  const urlsMatch = path.match(/^urls\[(\d+)\]$/);
  if (urlsMatch) {
    const idx = parseInt(urlsMatch[1], 10);
    return (result as any).resultUrls?.[idx];
  }

  // Handle nested field access via dot notation
  const segments = path.split(".");
  let current: any = result;
  for (const seg of segments) {
    if (current == null) return undefined;
    current = current[seg];
  }
  return current;
}

// ─── Build Execution Params ──────────────────────────────────────────────────

function buildExecParams(
  stepParams: Record<string, unknown>,
  traceId: string,
): SkillExecutionParams {
  const {
    prompt, model, aspectRatio, quality, style, numImages,
    duration, voice, resolution, referenceImageUrls,
    referenceStyleUrl, ...rest
  } = stepParams as any;
  return {
    prompt: prompt ?? "",
    model, aspectRatio, quality, style, numImages,
    duration, voice, resolution, referenceImageUrls,
    referenceStyleUrl,
    extraParams: Object.keys(rest).length > 0 ? rest : undefined,
    traceId,
  };
}

// ─── Main Pipeline Execution ─────────────────────────────────────────────────

export async function executePipeline(
  steps: PipelineStep[],
  options: PipelineOptions,
): Promise<PipelineResult> {
  const pipelineStart = Date.now();

  if (steps.length === 0) {
    return { steps: [], totalCreditsUsed: 0, totalDurationMs: 0 };
  }

  if (steps.length > MAX_PIPELINE_STEPS) {
    throw new Error(`Pipeline exceeds maximum of ${MAX_PIPELINE_STEPS} steps`);
  }

  const waves = topologicalSort(steps);
  const completedResults = new Map<string, SkillExecutionResult>();
  const stepResults: PipelineStepResult[] = [];
  const failedSteps = new Set<string>();
  let pipelineAborted = false;
  let totalCredits = 0;

  console.log(`[PipelineEngine] Starting pipeline: ${steps.length} steps, ${waves.length} waves`);

  for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    if (pipelineAborted) break;

    const wave = waves[waveIdx];
    console.log(`[PipelineEngine] Wave ${waveIdx + 1}: [${wave.map((s) => s.id).join(", ")}]`);

    // Check budget
    if (options.budget && totalCredits >= options.budget) {
      for (const step of wave) {
        stepResults.push({
          stepId: step.id,
          skillId: step.skillId,
          status: "skipped",
          error: "Budget exceeded",
          creditsUsed: 0,
          durationMs: 0,
        });
      }
      break;
    }

    const wavePromises = wave.map(async (step): Promise<PipelineStepResult> => {
      // Skip if any dependency failed
      if (step.dependsOn.some((d) => failedSteps.has(d))) {
        return {
          stepId: step.id,
          skillId: step.skillId,
          status: "skipped",
          error: "Dependency failed",
          creditsUsed: 0,
          durationMs: 0,
        };
      }

      const stepStart = Date.now();

      // Look up skill
      const skillDef = await getSkillByIdAsync(step.skillId);
      if (!skillDef) {
        failedSteps.add(step.id);
        return {
          stepId: step.id,
          skillId: step.skillId,
          status: "failed",
          error: `Skill not found: ${step.skillId}`,
          creditsUsed: 0,
          durationMs: Date.now() - stepStart,
        };
      }

      // Resolve input mapping
      let params = { ...step.params };
      if (step.inputMapping && Object.keys(step.inputMapping).length > 0) {
        const mapped = resolveInputMapping(step.inputMapping, completedResults);
        params = { ...params, ...mapped };
      }

      const execParams = buildExecParams(params, options.traceId);

      // Execute with error strategy handling
      try {
        const result = await executeSkillWithRetry(
          skillDef,
          execParams,
          options,
          step.errorStrategy,
        );

        if (result.isAsync && !hasStepDependents(step.id, steps)) {
          return {
            stepId: step.id,
            skillId: step.skillId,
            status: "pending_async",
            result,
            creditsUsed: result.creditsUsed ?? 0,
            durationMs: Date.now() - stepStart,
          };
        }

        if (!result.success) {
          failedSteps.add(step.id);
          if (step.errorStrategy === "fail-fast") {
            pipelineAborted = true;
          }
          return {
            stepId: step.id,
            skillId: step.skillId,
            status: "failed",
            result,
            error: result.error || "Execution failed",
            creditsUsed: result.creditsUsed ?? 0,
            durationMs: Date.now() - stepStart,
          };
        }

        completedResults.set(step.id, result);
        return {
          stepId: step.id,
          skillId: step.skillId,
          status: "completed",
          result,
          creditsUsed: result.creditsUsed ?? 0,
          durationMs: Date.now() - stepStart,
        };
      } catch (err) {
        failedSteps.add(step.id);
        if (step.errorStrategy === "fail-fast") {
          pipelineAborted = true;
        }
        return {
          stepId: step.id,
          skillId: step.skillId,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
          creditsUsed: 0,
          durationMs: Date.now() - stepStart,
        };
      }
    });

    const waveResults = await Promise.allSettled(wavePromises);
    for (const settled of waveResults) {
      if (settled.status === "fulfilled") {
        stepResults.push(settled.value);
        totalCredits += settled.value.creditsUsed;
      }
    }

    // Skip remaining steps if pipeline aborted
    if (pipelineAborted) {
      const remaining = waves.slice(waveIdx + 1).flat();
      for (const step of remaining) {
        stepResults.push({
          stepId: step.id,
          skillId: step.skillId,
          status: "skipped",
          error: "Pipeline aborted (fail-fast)",
          creditsUsed: 0,
          durationMs: 0,
        });
      }
    }
  }

  return {
    steps: stepResults,
    totalCreditsUsed: totalCredits,
    totalDurationMs: Date.now() - pipelineStart,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasStepDependents(stepId: string, allSteps: PipelineStep[]): boolean {
  return allSteps.some((s) => s.dependsOn.includes(stepId));
}

async function executeSkillWithRetry(
  skillDef: SkillDefinition,
  params: SkillExecutionParams,
  options: PipelineOptions,
  errorStrategy: ErrorStrategy,
): Promise<SkillExecutionResult> {
  const result = await executeSkill(
    skillDef,
    params,
    options.userId,
    options.userToken,
    options.tenantId,
  );

  if (!result.success && errorStrategy === "retry") {
    // Retry once
    return executeSkill(
      skillDef,
      params,
      options.userId,
      options.userToken,
      options.tenantId,
    );
  }

  return result;
}
