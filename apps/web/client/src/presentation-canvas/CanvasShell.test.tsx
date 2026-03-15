import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CanvasShell } from "./CanvasShell";

describe("CanvasShell", () => {
  it("keeps the studio asset column constrained with a full-height overflow wrapper", () => {
    const { container } = render(
      <div style={{ height: 900 }}>
        <CanvasShell
          slidesPanel={<div>Slides</div>}
          toolRail={<div>Tools</div>}
          assetPanel={<div data-testid="asset-panel-content">Assets</div>}
          canvasToolbar={<div>Toolbar</div>}
          canvasStage={<div>Stage</div>}
          propertiesPanel={<div>Properties</div>}
        />
      </div>,
    );

    expect(screen.getByTestId("canvas-shell")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-shell").className).toContain("min-h-0");
    const asides = container.querySelectorAll("aside");
    expect(asides).toHaveLength(3);
    expect(asides[1]?.className).toContain("min-h-0");
    expect(asides[1]?.className).toContain("min-w-0");
    expect(screen.getByTestId("asset-panel-content").parentElement?.className).toContain("flex h-full min-h-0 min-w-0 flex-col overflow-hidden");
  });
});
