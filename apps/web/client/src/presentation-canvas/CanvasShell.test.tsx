import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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

  it("collapses side panels into edge rails without hiding the canvas workspace", () => {
    render(
      <div style={{ height: 900 }}>
        <CanvasShell
          slidesPanel={<div>Slides</div>}
          toolRail={<div>Tools</div>}
          assetPanel={<div data-testid="asset-panel-content">Assets</div>}
          canvasToolbar={<div>Toolbar</div>}
          canvasStage={<div data-testid="canvas-stage">Stage</div>}
          propertiesPanel={<div>Properties body</div>}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse Left Panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse Right Panel" }));

    expect(screen.getByRole("button", { name: "Expand Left Panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Right Panel" })).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand Left Panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Right Panel" }));

    expect(screen.getByRole("button", { name: "Collapse Left Panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Right Panel" })).toBeInTheDocument();
    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("Properties body")).toBeInTheDocument();
  });

  it("honors defaultLeftCollapsed/defaultRightCollapsed for initial render but stays user-expandable", () => {
    render(
      <div style={{ height: 900 }}>
        <CanvasShell
          slidesPanel={<div>Slides</div>}
          toolRail={<div>Tools</div>}
          assetPanel={<div data-testid="asset-panel-content">Assets</div>}
          canvasToolbar={<div>Toolbar</div>}
          canvasStage={<div data-testid="canvas-stage">Stage</div>}
          propertiesPanel={<div>Properties body</div>}
          defaultLeftCollapsed
          defaultRightCollapsed
        />
      </div>,
    );

    // Both rails start collapsed — only the expand toggles are present, and
    // the right (properties) rail's content is not rendered at all.
    expect(screen.getByRole("button", { name: "Expand Left Panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Right Panel" })).toBeInTheDocument();
    expect(screen.queryByText("Properties body")).not.toBeInTheDocument();

    // User can still expand them.
    fireEvent.click(screen.getByRole("button", { name: "Expand Left Panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Right Panel" }));

    expect(screen.getByRole("button", { name: "Collapse Left Panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Right Panel" })).toBeInTheDocument();
    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("Properties body")).toBeInTheDocument();
  });
});
