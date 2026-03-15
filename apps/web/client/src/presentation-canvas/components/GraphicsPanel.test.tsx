import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { GraphicsPanel } from "./GraphicsPanel";

describe("GraphicsPanel", () => {
  it("keeps the icon grid inside a constrained scroll region", () => {
    render(<GraphicsPanel onInsertGraphic={vi.fn()} />);

    const scrollArea = screen.getByTestId("graphics-panel-scroll-area");
    expect(scrollArea.className).toContain("h-0");
    expect(scrollArea.className).toContain("min-h-0");
    expect(scrollArea.className).toContain("flex-1");
  });
});
