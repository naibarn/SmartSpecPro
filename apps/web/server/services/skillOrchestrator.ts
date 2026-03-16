/**
 * Skill Orchestrator — main entry point for the Hybrid Skill Orchestrator.
 *
 * Part of Feature 045 (Section 05).
 * Coordinates classifier, param extractor, and execution routing.
 */

import crypto from "crypto";
import { getTenantFeatureFlag, getTenantFeatureFlagValue } from "./featureFlags";
import { classifyIntent } from "./skillIntentClassifier";
import { extractParams, projectSchemaForUI } from "./skillParamExtractor";
import { loadInputSchema } from "./skillSchemaLoader";
import { getSkillByIdAsync } from "./skillRegistry";
import { executeSkill, type SkillExecutionParams } from "./skillExecutor";
import { hasEnoughCredits } from "./creditService";
import { auditLogger } from "./auditLogger";
import type {
  OrchestrationLevel,
  OrchestrationResult,
  OrchestrationResultSection,
  OrchestrateOptions,
  ClassificationResult,
  OrchestrationConfirmationData,
} from "@shared/orchestration/types";
import {
  CONFIDENCE_ASK_USER,
  ORCHESTRATOR_MAX_LEVEL_DEFAULT,
  type SkillOrchestratorMaxLevel,
} from "@shared/orchestration/constants";

// ─── Level Hierarchy ─────────────────────────────────────────────────────────

const LEVEL_ORDER: Record<OrchestrationLevel, number> = {
  simple: 0,
  compound: 1,
  complex: 2,
};

function capLevel(
  classified: OrchestrationLevel,
  maxLevel: OrchestrationLevel,
): OrchestrationLevel {
  if (LEVEL_ORDER[classified] <= LEVEL_ORDER[maxLevel]) return classified;
  return maxLevel;
}

// ─── Confirmation Response ───────────────────────────────────────────────────

export interface OrchestrationConfirmResponse {
  type: "orchestration_confirm";
  skillId: string;
  prefilledParams: Record<string, unknown>;
  missingFields: string[];
  schema: OrchestrationConfirmationData["schema"];
  traceId: string;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function orchestrateSkill(
  message: string,
  options: OrchestrateOptions,
): Promise<OrchestrationResult | OrchestrationConfirmResponse | null> {
  const traceId = crypto.randomUUID();
  const startMs = Date.now();
  let classificationLatencyMs = 0;

  try {
    // 1. Check feature flag
    const enabled = await getTenantFeatureFlag(
      "skillOrchestrator",
      options.tenantId,
    );
    if (!enabled) {
      return null; // Let chat router use existing detectSkill path
    }

    // 2. Check max level
    const maxLevelStr = await getTenantFeatureFlagValue(
      "skillOrchestratorMaxLevel",
      options.tenantId,
    );
    const maxLevel = (maxLevelStr as SkillOrchestratorMaxLevel) || ORCHESTRATOR_MAX_LEVEL_DEFAULT;
    if (maxLevel === "disabled") {
      return null;
    }

    // 3. Run classifier
    const classifyStart = Date.now();
    const classification = await classifyIntent(
      message,
      options.userId,
      options.tenantId,
      options.conversationId,
      traceId,
    );
    classificationLatencyMs = Date.now() - classifyStart;

    if (!classification) {
      auditLogger.log({
        eventType: "orchestration_fallback" as any,
        userId: options.userId,
        metadata: { tenantId: options.tenantId, traceId, reason: "classifier_failed" },
      });
      return null;
    }

    // 4. Check confidence threshold
    const topSkill = classification.skills[0];
    if (!topSkill || topSkill.confidence < CONFIDENCE_ASK_USER) {
      return null;
    }

    // 5. Cap level
    const cappedLevel = capLevel(
      classification.level,
      maxLevel as OrchestrationLevel,
    );
    let effectiveSkills = classification.skills;
    if (cappedLevel === "simple" && effectiveSkills.length > 1) {
      effectiveSkills = [effectiveSkills[0]];
    }

    // 6. Extract parameters (SIMPLE path)
    if (cappedLevel === "simple") {
      const skill = effectiveSkills[0];
      const extraction = await extractParams(
        message,
        skill.skillId,
        skill.extractedParams,
        skill.confidence,
      );

      // 6a. Confirmation needed?
      if (extraction.needsConfirmation) {
        const schemaInfo = await loadInputSchema(skill.skillId);
        return {
          type: "orchestration_confirm",
          skillId: skill.skillId,
          prefilledParams: extraction.params,
          missingFields: extraction.missingRequired,
          schema: schemaInfo ? projectSchemaForUI(schemaInfo) : [],
          traceId,
        };
      }

      // 6b. Credit check
      const estimatedCost = 10; // Base estimate — real calculation deferred to skill executor
      const hasCredits = await hasEnoughCredits(options.userId, estimatedCost);
      if (!hasCredits) {
        return buildErrorResult(traceId, cappedLevel, classificationLatencyMs, startMs, {
          code: "insufficient_credits",
          message: "Insufficient credits for this skill",
        });
      }

      // 6c. Execute skill
      const skillDef = await getSkillByIdAsync(skill.skillId);
      if (!skillDef) {
        return buildErrorResult(traceId, cappedLevel, classificationLatencyMs, startMs, {
          code: "skill_not_found",
          message: `Skill not found: ${skill.skillId}`,
        });
      }

      const execParams: SkillExecutionParams = {
        prompt: (extraction.params.prompt as string) ||
          (extraction.params.topic as string) ||
          (extraction.params.content as string) ||
          message,
        conversationId: options.conversationId?.toString(),
        extraParams: extraction.params as Record<string, any>,
        model: (extraction.params.model as string) || undefined,
        aspectRatio: (extraction.params.aspectRatio as string) || undefined,
        quality: (extraction.params.quality as string) || undefined,
        style: (extraction.params.style as string) || undefined,
      };

      try {
        const execResult = await executeSkill(
          skillDef,
          execParams,
          options.userId,
          options.userToken,
          options.tenantId,
        );

        const section: OrchestrationResultSection = {
          skillId: skill.skillId,
          type: execResult.success ? (execResult.type === "text" ? "text" : "image") : "error",
          content: execResult.content,
          urls: execResult.urls ? [execResult.urls].flat() : undefined,
          metadata: {
            creditsUsed: execResult.creditsUsed ?? 0,
            durationMs: Date.now() - startMs,
          },
        };

        return {
          sections: [section],
          totalCreditsUsed: execResult.creditsUsed ?? 0,
          totalDurationMs: Date.now() - startMs,
          traceId,
          orchestrationLevel: cappedLevel,
          classificationLatencyMs,
        };
      } catch (execError) {
        return buildErrorResult(traceId, cappedLevel, classificationLatencyMs, startMs, {
          code: "pipeline_failed",
          message: execError instanceof Error ? execError.message : "Execution failed",
          affectedSkills: [skill.skillId],
        });
      }
    }

    // 7. COMPOUND path — delegate to pipeline engine (Section 06)
    if (cappedLevel === "compound") {
      // Pipeline engine not yet implemented — return placeholder
      return buildErrorResult(traceId, cappedLevel, classificationLatencyMs, startMs, {
        code: "pipeline_failed",
        message: "Compound orchestration not yet available",
      });
    }

    // 8. COMPLEX path — delegate to agent loop (Section 07)
    if (cappedLevel === "complex") {
      return buildErrorResult(traceId, cappedLevel, classificationLatencyMs, startMs, {
        code: "agent_timeout",
        message: "Complex orchestration not yet available",
      });
    }

    return null;
  } catch {
    // Never throw — return null for chat router to use default path
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildErrorResult(
  traceId: string,
  level: OrchestrationLevel,
  classificationLatencyMs: number,
  startMs: number,
  error: { code: string; message: string; affectedSkills?: string[] },
): OrchestrationResult {
  return {
    sections: [],
    totalCreditsUsed: 0,
    totalDurationMs: Date.now() - startMs,
    traceId,
    orchestrationLevel: level,
    classificationLatencyMs,
    error: error as any,
  };
}
