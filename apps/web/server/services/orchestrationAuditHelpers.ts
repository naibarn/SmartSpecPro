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
