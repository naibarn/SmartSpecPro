import { describe, expect, it, vi } from "vitest";

import {
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

    expect(emitter).toHaveBeenCalledWith(
      "presentation_mobile_mode_switch",
      { fromMode: "pan_mode", toMode: "edit_mode" },
    );
    expect(emitter).toHaveBeenCalledWith(
      "presentation_mobile_accidental_transform_cancelled",
      { mode: "pan_mode", touchTargetPx: 16 },
    );

    setPresentationEventEmitterForTests(null);
  });
});
