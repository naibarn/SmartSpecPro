/**
 * Skill Agent Loop — COMPLEX mode ReAct-style execution.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator (Section 07).
 * Implements an LLM-driven iterative loop for complex multi-step tasks.
 * This first production loop is intentionally bounded and sequential: execute
 * candidate skills, run a quality gate, and feed repair guidance into the next
 * round without recursive calls or unbounded self-modification.
 */

import type {
  AgentAction,
  OrchestrationResult,
  OrchestrationResultSection,
} from "@shared/orchestration/types";
import {
  AGENT_MAX_ITERATIONS,
  AGENT_MAX_DURATION_MS,
  AGENT_LOOP_CONTEXT_SOFT_LIMIT_CHARS,
  AGENT_LOOP_MAX_SUBAGENT_FANOUT,
  AGENT_LOOP_STEP_TIMEOUT_MS,
  AGENT_LOOP_SUBAGENT_RECOMMEND_AFTER_REPAIRS,
} from "@shared/orchestration/constants";
import { getSkillByIdAsync } from "./skillRegistry";
import { executeSkill, type SkillExecutionParams } from "./skillExecutor";
import { validateQuality } from "./skillQualityGate";
import {
  logAgentLoopSummaryEvent,
  logAgentStepEvent,
} from "./orchestrationAuditHelpers";

export interface AgentLoopOptions {
  userId: number;
  tenantId: string;
  userToken: string;
  traceId: string;
  budget?: number;
}

export interface AgentLoopResult {
  sections: OrchestrationResultSection[];
  totalCreditsUsed: number;
  totalDurationMs: number;
  iterations: number;
  actions: AgentAction[];
  subAgentPolicy: SubAgentPolicySnapshot;
  debugEvidencePolicy: DebugEvidencePolicySnapshot;
  stopReason:
    | "quality_passed"
    | "max_iterations"
    | "max_duration"
    | "budget_exceeded"
    | "no_skills"
    | "skill_not_found"
    | "skill_failed"
    | "step_timeout"
    | "data_first_debug_required";
}

export interface SubAgentPolicySnapshot {
  mode: "inline" | "subagent_recommended" | "subagent_blocked";
  reason: string;
  maxFanout: number;
  maxConcurrency: number;
  estimatedContextChars: number;
  failedQualityChecks: number;
  activeSubagents: number;
}

export interface DebugEvidencePolicySnapshot {
  requiresDataFirst: boolean;
  hasEvidenceHint: boolean;
  reason: "not_debug_request" | "evidence_present" | "evidence_missing";
  evidenceHints: string[];
}

export async function runAgentLoop(
  message: string,
  skillIds: string[],
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const startMs = Date.now();
  const sections: OrchestrationResultSection[] = [];
  const actions: AgentAction[] = [];
  const uniqueSkillIds = Array.from(new Set(skillIds.filter(Boolean)));
  let totalCreditsUsed = 0;
  let repairContext = "";
  let iterations = 0;
  let failedQualityChecks = 0;
  let subAgentPolicy = buildSubAgentPolicySnapshot({
    message,
    sections,
    repairContext,
    failedQualityChecks,
  });
  const debugEvidencePolicy = buildDebugEvidencePolicySnapshot(message);
  const finish = (input: Omit<Parameters<typeof buildResult>[0], "startMs">): AgentLoopResult => {
    const result = buildResult({ ...input, startMs });
    logAgentLoopSummaryEvent({
      traceId: options.traceId,
      userId: options.userId,
      stopReason: result.stopReason,
      iterations: result.iterations,
      totalCreditsUsed: result.totalCreditsUsed,
      totalDurationMs: result.totalDurationMs,
      sectionCount: result.sections.length,
      actionCount: result.actions.length,
      subAgentPolicy: result.subAgentPolicy,
      debugEvidencePolicy: result.debugEvidencePolicy,
    });
    return result;
  };

  if (debugEvidencePolicy.requiresDataFirst && !debugEvidencePolicy.hasEvidenceHint) {
    const content =
      "Data-first debug required: provide or locate evidence before proposing a fix. " +
      "Use a traceId, runId, jobId, taskId, audit/server log, DB table row/status, provider task id, or concrete error output.";
    actions.push({
      type: "done",
      reasoning: content,
    });
    logAgentStepEvent({
      traceId: options.traceId,
      userId: options.userId,
      iteration: 0,
      action: "data_first_debug_required",
      creditsUsed: 0,
      reasoning: content,
      durationMs: Date.now() - startMs,
    });
    return finish({
      sections: [{
        skillId: "debug-evidence-gate",
        type: "error",
        content,
        metadata: {
          creditsUsed: 0,
          durationMs: Date.now() - startMs,
        },
      }],
      totalCreditsUsed,
      iterations,
      actions,
      subAgentPolicy,
      debugEvidencePolicy,
      stopReason: "data_first_debug_required",
    });
  }

  if (uniqueSkillIds.length === 0) {
    return finish({
      sections,
      totalCreditsUsed,
      iterations,
      actions,
      subAgentPolicy,
      debugEvidencePolicy,
      stopReason: "no_skills",
    });
  }

  for (let index = 0; index < AGENT_MAX_ITERATIONS; index += 1) {
    iterations = index + 1;

    if (Date.now() - startMs >= AGENT_MAX_DURATION_MS) {
      actions.push({
        type: "done",
        reasoning: "Agent loop stopped because the duration limit was reached.",
      });
      return finish({
        sections,
        totalCreditsUsed,
        iterations,
        actions,
        subAgentPolicy,
        debugEvidencePolicy,
        stopReason: "max_duration",
      });
    }

    if (options.budget != null && totalCreditsUsed >= options.budget) {
      actions.push({
        type: "done",
        reasoning: "Agent loop stopped because the credit budget was reached.",
      });
      return finish({
        sections,
        totalCreditsUsed,
        iterations,
        actions,
        subAgentPolicy,
        debugEvidencePolicy,
        stopReason: "budget_exceeded",
      });
    }

    subAgentPolicy = buildSubAgentPolicySnapshot({
      message,
      sections,
      repairContext,
      failedQualityChecks,
    });

    const skillId = uniqueSkillIds[index % uniqueSkillIds.length];
    const skill = await getSkillByIdAsync(skillId);
    if (!skill) {
      actions.push({
        type: "done",
        skillId,
        reasoning: `Agent loop stopped because skill '${skillId}' was not found.`,
      });
      return finish({
        sections,
        totalCreditsUsed,
        iterations,
        actions,
        subAgentPolicy,
        debugEvidencePolicy,
        stopReason: "skill_not_found",
      });
    }

    const action: AgentAction = {
      type: "execute_skill",
      skillId,
      params: { prompt: buildPrompt(message, repairContext) },
      reasoning: `Executing candidate skill '${skillId}' in bounded complex loop.`,
    };
    actions.push(action);

    const stepStartMs = Date.now();
    const execParams: SkillExecutionParams = {
      prompt: buildPrompt(message, repairContext),
      extraParams: repairContext ? { repairContext } : undefined,
    };
    let execResult;
    try {
      execResult = await withTimeout(
        executeSkill(
          skill,
          execParams,
          options.userId,
          options.userToken,
          options.tenantId,
        ),
        remainingStepTimeoutMs(startMs),
        `skill_step_timeout:${skillId}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Skill execution timed out";
      const stopReason = errorMessage.startsWith("skill_step_timeout:")
        ? "step_timeout"
        : "skill_failed";
      sections.push({
        skillId,
        type: "error",
        content: errorMessage,
        metadata: {
          creditsUsed: 0,
          durationMs: Date.now() - stepStartMs,
        },
      });
      actions.push({
        type: "done",
        skillId,
        reasoning: errorMessage,
      });
      return finish({
        sections,
        totalCreditsUsed,
        iterations,
        actions,
        subAgentPolicy,
        debugEvidencePolicy,
        stopReason,
      });
    }
    const creditsUsed = execResult.creditsUsed ?? 0;
    totalCreditsUsed += creditsUsed;

    logAgentStepEvent({
      traceId: options.traceId,
      userId: options.userId,
      iteration: iterations,
      action: action.type,
      skillId,
      creditsUsed,
      reasoning: action.reasoning,
      durationMs: Date.now() - stepStartMs,
    });

    const section: OrchestrationResultSection = {
      skillId,
      type: execResult.success
        ? toResultSectionType(execResult.type)
        : "error",
      content: execResult.message ?? execResult.error,
      urls: execResult.resultUrls ?? (execResult.resultUrl ? [execResult.resultUrl] : undefined),
      metadata: {
        creditsUsed,
        durationMs: Date.now() - stepStartMs,
      },
    };
    sections.push(section);

    if (!execResult.success) {
      actions.push({
        type: "done",
        skillId,
        reasoning: execResult.error ?? "Agent loop stopped because skill execution failed.",
      });
      return finish({
        sections,
        totalCreditsUsed,
        iterations,
        actions,
        subAgentPolicy,
        debugEvidencePolicy,
        stopReason: "skill_failed",
      });
    }

    const qualityResult = await validateQuality(
      buildQualityPayload(sections, totalCreditsUsed, startMs, options.traceId),
      message,
      {
        tenantId: options.tenantId,
        traceId: options.traceId,
        forceQualityGate: true,
        maxLevel: "complex",
      },
    );

    actions.push({
      type: qualityResult.pass ? "done" : "quality_check",
      reasoning: qualityResult.pass
        ? "Quality gate passed."
        : `Quality gate requested repair: ${qualityResult.issues.join("; ") || qualityResult.suggestion || "unspecified issue"}`,
    });

    if (qualityResult.pass) {
      return finish({
        sections,
        totalCreditsUsed,
        iterations,
        actions,
        subAgentPolicy,
        debugEvidencePolicy,
        stopReason: "quality_passed",
      });
    }

    failedQualityChecks += 1;
    repairContext = [
      qualityResult.issues.length > 0
        ? `Issues: ${qualityResult.issues.join("; ")}`
        : "",
      qualityResult.suggestion ? `Suggestion: ${qualityResult.suggestion}` : "",
    ].filter(Boolean).join("\n");
    subAgentPolicy = buildSubAgentPolicySnapshot({
      message,
      sections,
      repairContext,
      failedQualityChecks,
    });
  }

  actions.push({
    type: "done",
    reasoning: "Agent loop stopped because the iteration limit was reached.",
  });
  return finish({
    sections,
    totalCreditsUsed,
    iterations,
    actions,
    subAgentPolicy,
    debugEvidencePolicy,
    stopReason: "max_iterations",
  });
}

function buildPrompt(message: string, repairContext: string): string {
  if (!repairContext) return message;
  return [
    message,
    "",
    "Repair the previous attempt using this reviewer feedback:",
    repairContext,
  ].join("\n");
}

function toResultSectionType(
  type: string,
): OrchestrationResultSection["type"] {
  if (type === "image" || type === "video" || type === "audio" || type === "text") {
    return type;
  }
  return "text";
}

function buildQualityPayload(
  sections: OrchestrationResultSection[],
  totalCreditsUsed: number,
  startMs: number,
  traceId: string,
): OrchestrationResult {
  return {
    sections,
    totalCreditsUsed,
    totalDurationMs: Date.now() - startMs,
    traceId,
    orchestrationLevel: "complex",
    classificationLatencyMs: 0,
  };
}

function buildResult(input: {
  sections: OrchestrationResultSection[];
  totalCreditsUsed: number;
  startMs: number;
  iterations: number;
  actions: AgentAction[];
  subAgentPolicy: SubAgentPolicySnapshot;
  debugEvidencePolicy: DebugEvidencePolicySnapshot;
  stopReason: AgentLoopResult["stopReason"];
}): AgentLoopResult {
  return {
    sections: input.sections,
    totalCreditsUsed: input.totalCreditsUsed,
    totalDurationMs: Date.now() - input.startMs,
    iterations: input.iterations,
    actions: input.actions,
    subAgentPolicy: input.subAgentPolicy,
    debugEvidencePolicy: input.debugEvidencePolicy,
    stopReason: input.stopReason,
  };
}

function buildSubAgentPolicySnapshot(input: {
  message: string;
  sections: OrchestrationResultSection[];
  repairContext: string;
  failedQualityChecks: number;
}): SubAgentPolicySnapshot {
  const estimatedContextChars =
    input.message.length +
    input.repairContext.length +
    input.sections.reduce((total, section) => {
      return total + (section.content?.length ?? 0) + (section.urls?.join("\n").length ?? 0);
    }, 0);

  const base = {
    maxFanout: AGENT_LOOP_MAX_SUBAGENT_FANOUT,
    maxConcurrency: Math.min(AGENT_LOOP_MAX_SUBAGENT_FANOUT, 2),
    estimatedContextChars,
    failedQualityChecks: input.failedQualityChecks,
    activeSubagents: 0,
  };

  if (estimatedContextChars >= AGENT_LOOP_CONTEXT_SOFT_LIMIT_CHARS) {
    return {
      ...base,
      mode: "subagent_recommended",
      reason: "context_soft_limit",
    };
  }

  if (input.failedQualityChecks > AGENT_LOOP_SUBAGENT_RECOMMEND_AFTER_REPAIRS) {
    return {
      ...base,
      mode: "subagent_recommended",
      reason: "repeated_quality_repair",
    };
  }

  return {
    ...base,
    mode: "inline",
    reason: "within_inline_limits",
  };
}

function buildDebugEvidencePolicySnapshot(message: string): DebugEvidencePolicySnapshot {
  const normalized = message.toLowerCase();
  const requiresDataFirst = DEBUG_REQUEST_PATTERNS.some(pattern => pattern.test(normalized));
  if (!requiresDataFirst) {
    return {
      requiresDataFirst: false,
      hasEvidenceHint: false,
      reason: "not_debug_request",
      evidenceHints: [],
    };
  }

  const evidenceHints = DEBUG_EVIDENCE_PATTERNS
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ hint }) => hint);

  return {
    requiresDataFirst,
    hasEvidenceHint: evidenceHints.length > 0,
    reason: evidenceHints.length > 0 ? "evidence_present" : "evidence_missing",
    evidenceHints,
  };
}

const DEBUG_REQUEST_PATTERNS = [
  /\bbug\b/,
  /\bdebug\b/,
  /\bfix\b/,
  /\bbroken\b/,
  /\berror\b/,
  /\bfail(?:ed|ing|ure)?\b/,
  /\bregression\b/,
  /\bnot working\b/,
  /\bissue\b/,
  /แก้บั๊ก/,
  /บั๊ก/,
  /ดีบัก/,
  /ผิดพลาด/,
  /พัง/,
  /ค้าง/,
  /ไม่ทำงาน/,
  /ล้มเหลว/,
  /หา\s*root cause/,
];

const DEBUG_EVIDENCE_PATTERNS: Array<{ hint: string; pattern: RegExp }> = [
  { hint: "trace_id", pattern: /\btrace(?:id| id)?\b|trace[_-]id/ },
  { hint: "run_id", pattern: /\brun(?:id| id)?\b|run[_-]id/ },
  { hint: "job_id", pattern: /\bjob(?:id| id)?\b|job[_-]id/ },
  { hint: "task_id", pattern: /\btask(?:id| id)?\b|task[_-]id/ },
  { hint: "provider_task_id", pattern: /\bprovider\b.*\b(task|id)\b|provider[_-]task[_-]id/ },
  { hint: "audit_log", pattern: /\baudit\b|\blog\b|jsonl|บันทึก|ล็อก/ },
  { hint: "server_log", pattern: /\bserver log\b|\bconsole\b|\bstack trace\b|\btraceback\b/ },
  { hint: "db_table", pattern: /\btable\b|\bdatabase\b|\bdb\b|\bsql\b|\brow\b|ตาราง|ฐานข้อมูล|ข้อมูลจริง/ },
  { hint: "status_error", pattern: /\bstatus\b|\bstatusCode\b|\b500\b|\b400\b|\b404\b|\btimeout\b|สถานะ/ },
  { hint: "error_output", pattern: /\btypeerror\b|\breferenceerror\b|\bsyntaxerror\b|\bexception\b|error:/ },
  { hint: "test_output", pattern: /\btest failed\b|\bvitest\b|\bplaywright\b|\bpytest\b|\btsc\b/ },
];


function remainingStepTimeoutMs(startMs: number): number {
  const elapsedMs = Date.now() - startMs;
  const remainingLoopMs = Math.max(1, AGENT_MAX_DURATION_MS - elapsedMs);
  return Math.max(1, Math.min(AGENT_LOOP_STEP_TIMEOUT_MS, remainingLoopMs));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
