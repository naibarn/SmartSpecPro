import { describe, expect, it } from "vitest";

import {
  buildContextStateMessages,
  extractContextHintsFromDynamicParams,
  evaluateContextStateHints,
} from "../contextEngineAdapter";

describe("contextEngine state contract", () => {
  it("reads session state from dynamic params and emits a dedicated session block", () => {
    const hints = extractContextHintsFromDynamicParams({
      contextState: {
        session_state: {
          title: "Session state",
          content: "Current turn is a research request",
          source: "unit-test",
          trust: "trusted",
          freshness: "fresh",
        },
      },
    });

    expect(hints?.sessionState).toBeTruthy();
    const messages = buildContextStateMessages(hints ?? null);
    expect(messages[0].content).toContain("[SESSION STATE]");
  });

  it("counts session state in state-only evaluation", () => {
    const evaluation = evaluateContextStateHints({
      sessionState: {
        title: "Session state",
        content: "Current turn is a research request",
        source: "unit-test",
        trust: "trusted",
        freshness: "fresh",
      },
      activeNote: {
        title: "Active note",
        content: "Research the project state",
      },
    });

    expect(evaluation.sessionStateSlots).toBeGreaterThan(0);
    expect(evaluation.activeNoteSlots).toBeGreaterThan(0);
    expect(evaluation.healthScore).toBeGreaterThan(0);
  });
});

