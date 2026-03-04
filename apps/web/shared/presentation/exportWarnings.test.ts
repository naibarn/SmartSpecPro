import { describe, expect, it } from "vitest";

import {
  categorizePresentationExportWarningCode,
  presentationExportWarningsSchema,
} from "./exportWarnings";

describe("presentation export warnings contract", () => {
  it("accepts unknown warning codes for forward compatibility", () => {
    const parsed = presentationExportWarningsSchema.parse([
      { code: "W_FUTURE_RENDERER_WARNING", slideId: 1 },
    ]);

    expect(parsed[0]?.code).toBe("W_FUTURE_RENDERER_WARNING");
    expect(categorizePresentationExportWarningCode("W_FUTURE_RENDERER_WARNING")).toBe("unknown");
  });

  it("maps warning categories for unsupported, fallback, and timeout/deferred paths", () => {
    expect(categorizePresentationExportWarningCode("SLIDE_ELEMENT_UNSUPPORTED")).toBe("unsupported");
    expect(categorizePresentationExportWarningCode("W_SVG_PLACEHOLDER")).toBe("fallback_degraded");
    expect(categorizePresentationExportWarningCode("W_SLIDE_READY_TIMEOUT")).toBe("timeout_deferred");
  });
});
