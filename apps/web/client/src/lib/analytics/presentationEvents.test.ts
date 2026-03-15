import { describe, expect, it, vi } from "vitest";

import {
  trackAIModeLockToggled,
  trackAIModeOverrideSet,
  trackAIRecipeOverrideApplied,
  trackAutosaveResult,
  trackPresentationCustomBlockSaved,
  setPresentationEventEmitterForTests,
  trackMobileAccidentalTransformCancelled,
  trackMobileModeSwitch,
} from "./presentationEvents";

describe("presentationEvents", () => {
  it("emits mobile telemetry payloads with required fields", () => {
    const emitter = vi.fn();
    setPresentationEventEmitterForTests(emitter);

    trackMobileModeSwitch({
      fromMode: "pan_mode",
      toMode: "edit_mode",
    });
    trackMobileAccidentalTransformCancelled({
      mode: "pan_mode",
      touchTargetPx: 16,
    });
    trackAutosaveResult({
      result: "saved",
      deckId: 7,
      slideId: 71,
      mode: "autosave",
    });
    trackAIRecipeOverrideApplied({
      deckId: 7,
      slideId: 71,
      previousRecipeId: "poster-spotlight",
      nextRecipeId: "quote-callout",
      source: "editor",
    });
    trackAIModeOverrideSet({
      deckId: 7,
      slideId: 71,
      previousMode: "structured_block",
      nextMode: "long_form_block",
      source: "editor",
    });
    trackAIModeLockToggled({
      deckId: 7,
      slideId: 71,
      mode: "long_form_block",
      locked: true,
      source: "editor",
    });
    trackPresentationCustomBlockSaved({
      componentId: "quote-callout",
      visibility: "team",
      source: "ai-layout",
    });

    expect(emitter).toHaveBeenCalledWith(
      "presentation_mobile_mode_switch",
      { fromMode: "pan_mode", toMode: "edit_mode" },
    );
    expect(emitter).toHaveBeenCalledWith(
      "presentation_mobile_accidental_transform_cancelled",
      { mode: "pan_mode", touchTargetPx: 16 },
    );
    expect(emitter).toHaveBeenCalledWith(
      "presentation_autosave_result",
      { result: "saved", deckId: 7, slideId: 71, mode: "autosave" },
    );
    expect(emitter).toHaveBeenCalledWith(
      "presentation_ai_recipe_override_applied",
      {
        deckId: 7,
        slideId: 71,
        previousRecipeId: "poster-spotlight",
        nextRecipeId: "quote-callout",
        source: "editor",
      },
    );
    expect(emitter).toHaveBeenCalledWith(
      "presentation_ai_mode_override_set",
      {
        deckId: 7,
        slideId: 71,
        previousMode: "structured_block",
        nextMode: "long_form_block",
        source: "editor",
      },
    );
    expect(emitter).toHaveBeenCalledWith(
      "presentation_ai_mode_lock_toggled",
      {
        deckId: 7,
        slideId: 71,
        mode: "long_form_block",
        locked: true,
        source: "editor",
      },
    );
    expect(emitter).toHaveBeenCalledWith(
      "presentation_custom_block_saved",
      {
        componentId: "quote-callout",
        visibility: "team",
        source: "ai-layout",
      },
    );

    setPresentationEventEmitterForTests(null);
  });
});
