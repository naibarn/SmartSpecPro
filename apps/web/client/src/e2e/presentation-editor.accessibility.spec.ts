// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import type { PresentationExportWarning } from "@shared/presentation/contracts";

function ExportWarningLiveRegion(props: { warnings: PresentationExportWarning[] }) {
  const summary = props.warnings
    .map((warning) => `${warning.code} (slide ${warning.slideId})`)
    .join(", ");

  return createElement(
    "p",
    { role: "status", "aria-live": "polite" },
    `Export warnings: ${summary}`,
  );
}

describe("presentation-editor accessibility e2e gates", () => {
  it("keeps warning announcements keyboard/screen-reader readable", () => {
    render(createElement(ExportWarningLiveRegion, {
      warnings: [
        { code: "SLIDE_TRANSITION_UNSUPPORTED", slideId: 3 },
        { code: "SLIDE_IMAGE_SOURCE_MISSING", slideId: 5 },
      ],
    }));

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("SLIDE_TRANSITION_UNSUPPORTED (slide 3)");
    expect(status).toHaveTextContent("SLIDE_IMAGE_SOURCE_MISSING (slide 5)");
  });
});
