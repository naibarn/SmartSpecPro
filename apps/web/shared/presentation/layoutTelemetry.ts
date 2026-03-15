/**
 * Layout Routing Telemetry (Spec 014 — Section 07)
 *
 * Structured telemetry events for layout routing decisions, fallback
 * triggers, and quality gate results. Designed to be consumed by the
 * audit logger for post-hoc analysis and regression detection.
 */

import type { PresentationAILayoutMode, PresentationAILayoutModeCandidate } from "./contentProfile";
import type { PresentationAIDesignFitScore, PresentationAIDesignFallbackHistory } from "./contracts";
import type { QualityGateVerdict, QualityGateIssue } from "./qualityGate";
import type { DeckConsistencyWarning } from "./deckConsistency";

export const LAYOUT_TELEMETRY_EVENT_TYPES = [
  "mode_selected",
  "fallback_triggered",
  "quality_gate_result",
  "deck_consistency_evaluated",
  "compaction_attempted",
  "slide_split",
] as const;

export type LayoutTelemetryEventType = (typeof LAYOUT_TELEMETRY_EVENT_TYPES)[number];

export interface LayoutTelemetryBaseEvent {
  eventType: LayoutTelemetryEventType;
  deckId: number;
  slideIndex: number;
  timestamp: string;
}

export interface ModeSelectedEvent extends LayoutTelemetryBaseEvent {
  eventType: "mode_selected";
  selectedMode: PresentationAILayoutMode;
  recommendedMode: PresentationAILayoutMode;
  candidateModes: Array<{
    mode: PresentationAILayoutMode;
    score: number;
    fitStatus: string;
    blocked?: boolean;
  }>;
  enabledModes: Partial<Record<PresentationAILayoutMode, boolean>>;
  contentMetrics: {
    totalChars: number;
    paragraphCount: number;
    sectionCount: number;
    denseTextCandidate: boolean;
    visualFirstCandidate: boolean;
  };
}

export interface FallbackTriggeredEvent extends LayoutTelemetryBaseEvent {
  eventType: "fallback_triggered";
  fallbackHistory: PresentationAIDesignFallbackHistory[];
  originalMode: PresentationAILayoutMode;
  finalMode: PresentationAILayoutMode;
}

export interface QualityGateResultEvent extends LayoutTelemetryBaseEvent {
  eventType: "quality_gate_result";
  verdict: QualityGateVerdict;
  fitScore?: PresentationAIDesignFitScore;
  issueCount: number;
  issues: QualityGateIssue[];
}

export interface DeckConsistencyEvaluatedEvent extends LayoutTelemetryBaseEvent {
  eventType: "deck_consistency_evaluated";
  consistencyScore: number;
  warningCount: number;
  warnings: DeckConsistencyWarning[];
  slideCount: number;
}

export interface CompactionAttemptedEvent extends LayoutTelemetryBaseEvent {
  eventType: "compaction_attempted";
  recipeId: string;
  compactionLevel: string;
  fitScoreBefore?: number;
  fitScoreAfter?: number;
  success: boolean;
}

export interface SlideSplitEvent extends LayoutTelemetryBaseEvent {
  eventType: "slide_split";
  originalSlideIndex: number;
  resultSlideCount: number;
  reason: string;
}

export type LayoutTelemetryEvent =
  | ModeSelectedEvent
  | FallbackTriggeredEvent
  | QualityGateResultEvent
  | DeckConsistencyEvaluatedEvent
  | CompactionAttemptedEvent
  | SlideSplitEvent;

/**
 * Build a mode_selected telemetry event.
 */
export function buildModeSelectedEvent(input: {
  deckId: number;
  slideIndex: number;
  selectedMode: PresentationAILayoutMode;
  recommendedMode: PresentationAILayoutMode;
  candidateModes: PresentationAILayoutModeCandidate[];
  enabledModes: Partial<Record<PresentationAILayoutMode, boolean>>;
  contentMetrics: ModeSelectedEvent["contentMetrics"];
}): ModeSelectedEvent {
  return {
    eventType: "mode_selected",
    deckId: input.deckId,
    slideIndex: input.slideIndex,
    timestamp: new Date().toISOString(),
    selectedMode: input.selectedMode,
    recommendedMode: input.recommendedMode,
    candidateModes: input.candidateModes.map((c) => ({
      mode: c.mode,
      score: c.score,
      fitStatus: c.fitStatus,
      blocked: !!c.blockedBy,
    })),
    enabledModes: input.enabledModes,
    contentMetrics: input.contentMetrics,
  };
}

/**
 * Build a quality_gate_result telemetry event.
 */
export function buildQualityGateEvent(input: {
  deckId: number;
  slideIndex: number;
  verdict: QualityGateVerdict;
  fitScore?: PresentationAIDesignFitScore;
  issues: QualityGateIssue[];
}): QualityGateResultEvent {
  return {
    eventType: "quality_gate_result",
    deckId: input.deckId,
    slideIndex: input.slideIndex,
    timestamp: new Date().toISOString(),
    verdict: input.verdict,
    fitScore: input.fitScore,
    issueCount: input.issues.length,
    issues: input.issues,
  };
}

/**
 * Build a deck_consistency_evaluated telemetry event.
 */
export function buildDeckConsistencyEvent(input: {
  deckId: number;
  consistencyScore: number;
  warnings: DeckConsistencyWarning[];
  slideCount: number;
}): DeckConsistencyEvaluatedEvent {
  return {
    eventType: "deck_consistency_evaluated",
    deckId: input.deckId,
    slideIndex: 0,
    timestamp: new Date().toISOString(),
    consistencyScore: input.consistencyScore,
    warningCount: input.warnings.length,
    warnings: input.warnings,
    slideCount: input.slideCount,
  };
}
