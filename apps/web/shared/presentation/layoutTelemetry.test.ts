import { describe, expect, it } from "vitest";

import {
  buildModeSelectedEvent,
  buildQualityGateEvent,
  buildDeckConsistencyEvent,
} from "./layoutTelemetry";

describe("buildModeSelectedEvent", () => {
  it("creates a mode_selected event with correct type and payload", () => {
    const event = buildModeSelectedEvent({
      deckId: 1,
      slideIndex: 2,
      selectedMode: "long_form_block",
      recommendedMode: "long_form_block",
      candidateModes: [
        { mode: "structured_block", score: 0.6, fitStatus: "cramped" },
        { mode: "long_form_block", score: 0.9, fitStatus: "accept" },
      ],
      enabledModes: { structured_block: true, long_form_block: true },
      contentMetrics: {
        totalChars: 500,
        paragraphCount: 3,
        sectionCount: 2,
        denseTextCandidate: true,
        visualFirstCandidate: false,
      },
    });
    expect(event.eventType).toBe("mode_selected");
    expect(event.slideIndex).toBe(2);
    expect(event.selectedMode).toBe("long_form_block");
    expect(event.candidateModes).toHaveLength(2);
    expect(event.timestamp).toBeTruthy();
  });
});

describe("buildQualityGateEvent", () => {
  it("creates a quality_gate_result event", () => {
    const event = buildQualityGateEvent({
      deckId: 1,
      slideIndex: 0,
      verdict: "accept",
      fitScore: { overall: 0.88, overflowRisk: 0.05 },
      issues: [],
    });
    expect(event.eventType).toBe("quality_gate_result");
    expect(event.verdict).toBe("accept");
    expect(event.fitScore?.overall).toBe(0.88);
    expect(event.issueCount).toBe(0);
  });

  it("includes issue count from issues array", () => {
    const event = buildQualityGateEvent({
      deckId: 1,
      slideIndex: 1,
      verdict: "reject",
      issues: [
        { rule: "fit_score_unsafe", severity: "error", message: "too low" },
        { rule: "overflow_risk_unsafe", severity: "error", message: "overflow" },
        { rule: "readability_line_overflow", severity: "warning", message: "cramped" },
      ],
    });
    expect(event.issueCount).toBe(3);
    expect(event.issues).toHaveLength(3);
  });
});

describe("buildDeckConsistencyEvent", () => {
  it("creates a deck_consistency_evaluated event", () => {
    const event = buildDeckConsistencyEvent({
      deckId: 1,
      consistencyScore: 0.92,
      warnings: [
        { slideIndex: 3, rule: "full_slide_media_density", severity: "warning", message: "too many" },
      ],
      slideCount: 5,
    });
    expect(event.eventType).toBe("deck_consistency_evaluated");
    expect(event.consistencyScore).toBe(0.92);
    expect(event.warningCount).toBe(1);
    expect(event.slideCount).toBe(5);
  });
});
