/**
 * Orchestration Audit Helpers — convenience logging for orchestration events.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator (Section 10).
 */

import { auditLogger } from "./auditLogger";
import { getTraceId } from "./traceContext";
import type { OrchestrationLevel, OrchestrationStrategy } from "@shared/orchestration/types";

function resolveTraceId(explicit?: string): string {
  return explicit || getTraceId() || "unknown";
}

export function logClassifyEvent(params: {
  traceId?: string;
  userId: number;
  level: OrchestrationLevel;
  skills: Array<{ skillId: string; confidence: number; reason: string }>;
  strategy: OrchestrationStrategy;
  classifierModel: string;
  latencyMs: number;
}): void {
  auditLogger.log({
    traceId: resolveTraceId(params.traceId),
    eventType: "orchestration_classify",
    userId: params.userId,
    skillSlug: params.skills[0]?.skillId,
    skillDetectionConfidence: params.skills[0]?.confidence,
    metadata: {
      level: params.level,
      skills: params.skills,
      strategy: params.strategy,
      classifierModel: params.classifierModel,
      latencyMs: params.latencyMs,
    },
  });
}

export function logPipelineEvent(params: {
  traceId?: string;
  userId: number;
  steps: Array<{
    stepId: string;
    skillId: string;
    status: string;
    creditsUsed: number;
    durationMs: number;
    error?: string;
  }>;
  totalCreditsUsed: number;
  totalDurationMs: number;
}): void {
  auditLogger.log({
    traceId: resolveTraceId(params.traceId),
    eventType: "orchestration_pipeline",
    userId: params.userId,
    creditsCharged: params.totalCreditsUsed,
    metadata: {
      steps: params.steps,
      totalCreditsUsed: params.totalCreditsUsed,
      totalDurationMs: params.totalDurationMs,
    },
  });
}

export function logAgentStepEvent(params: {
  traceId?: string;
  userId: number;
  iteration: number;
  action: string;
  skillId?: string;
  creditsUsed: number;
  reasoning: string;
  durationMs: number;
}): void {
  auditLogger.log({
    traceId: resolveTraceId(params.traceId),
    eventType: "orchestration_agent_step",
    userId: params.userId,
    skillSlug: params.skillId,
    metadata: {
      iteration: params.iteration,
      action: params.action,
      skillId: params.skillId,
      creditsUsed: params.creditsUsed,
      reasoning: params.reasoning,
      durationMs: params.durationMs,
    },
  });
}

export function logAgentLoopSummaryEvent(params: {
  traceId?: string;
  userId: number;
  stopReason: string;
  iterations: number;
  totalCreditsUsed: number;
  totalDurationMs: number;
  sectionCount: number;
  actionCount: number;
  subAgentPolicy: {
    mode: string;
    reason: string;
    maxFanout: number;
    maxConcurrency: number;
    estimatedContextChars: number;
    failedQualityChecks: number;
    activeSubagents: number;
  };
  debugEvidencePolicy: {
    requiresDataFirst: boolean;
    hasEvidenceHint: boolean;
    reason: string;
    evidenceHints: string[];
  };
}): void {
  auditLogger.log({
    traceId: resolveTraceId(params.traceId),
    eventType: "orchestration_agent_loop_summary",
    userId: params.userId,
    creditsCharged: params.totalCreditsUsed,
    metadata: {
      stopReason: params.stopReason,
      iterations: params.iterations,
      totalCreditsUsed: params.totalCreditsUsed,
      totalDurationMs: params.totalDurationMs,
      sectionCount: params.sectionCount,
      actionCount: params.actionCount,
      subAgentPolicy: params.subAgentPolicy,
      debugEvidencePolicy: params.debugEvidencePolicy,
      learningSignals: {
        stoppedByEvidenceGate: params.stopReason === "data_first_debug_required",
        stoppedByTimeout: params.stopReason === "step_timeout" || params.stopReason === "max_duration",
        stoppedByBudget: params.stopReason === "budget_exceeded",
        subAgentRecommended: params.subAgentPolicy.mode === "subagent_recommended",
        repeatedRepair: params.subAgentPolicy.reason === "repeated_quality_repair",
        contextSoftLimit: params.subAgentPolicy.reason === "context_soft_limit",
      },
    },
  });
}

export function logQualityGateEvent(params: {
  traceId?: string;
  userId: number;
  pass: boolean;
  score: number;
  issues: string[];
  suggestion?: string;
  durationMs: number;
}): void {
  auditLogger.log({
    traceId: resolveTraceId(params.traceId),
    eventType: "orchestration_quality_gate",
    userId: params.userId,
    metadata: {
      pass: params.pass,
      score: params.score,
      issues: params.issues,
      suggestion: params.suggestion,
      durationMs: params.durationMs,
    },
  });
}

export function logParamExtractEvent(params: {
  traceId?: string;
  userId: number;
  skillId: string;
  fieldsExtracted: string[];
  fieldsMissing: string[];
  confidence: number;
  usedCombinedCall: boolean;
  durationMs: number;
}): void {
  auditLogger.log({
    traceId: resolveTraceId(params.traceId),
    eventType: "orchestration_param_extract",
    userId: params.userId,
    skillSlug: params.skillId,
    metadata: {
      skillId: params.skillId,
      fieldsExtracted: params.fieldsExtracted,
      fieldsMissing: params.fieldsMissing,
      confidence: params.confidence,
      usedCombinedCall: params.usedCombinedCall,
      durationMs: params.durationMs,
    },
  });
}

export function logFallbackEvent(params: {
  traceId?: string;
  userId: number;
  reason: "timeout" | "error" | "disabled" | "circuit_breaker";
  classifierAttempted: boolean;
  errorMessage?: string;
}): void {
  auditLogger.log({
    traceId: resolveTraceId(params.traceId),
    eventType: "orchestration_fallback",
    userId: params.userId,
    errorMessage: params.errorMessage,
    metadata: {
      reason: params.reason,
      classifierAttempted: params.classifierAttempted,
    },
  });
}
