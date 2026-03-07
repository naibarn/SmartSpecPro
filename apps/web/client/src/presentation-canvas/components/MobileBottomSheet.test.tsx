import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { MobileBottomSheet, type MobileBottomSheetTab } from "./MobileBottomSheet";

describe("MobileBottomSheet", () => {
  const scrollIntoViewMock = vi.fn();

  beforeEach(() => {
    scrollIntoViewMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  function renderSheet(activeTab: MobileBottomSheetTab = "Properties") {
    const onTabChange = vi.fn();

    render(
      <MobileBottomSheet
        activeTab={activeTab}
        onTabChange={onTabChange}
        body={<div>Panel Body</div>}
      />,
    );

    return { onTabChange };
  }

  it("supports controlled expanded state", () => {
    const onExpandedChange = vi.fn();

    render(
      <MobileBottomSheet
        activeTab="Properties"
        onTabChange={vi.fn()}
        body={<div>Panel Body</div>}
        expanded={false}
        onExpandedChange={onExpandedChange}
      />,
    );

    expect(screen.queryByText("Panel Body")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /expand panel/i }));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it("renders tabs inside a horizontal scroller for cramped mobile widths", () => {
    renderSheet();

    expect(screen.getByTestId("mobile-bottom-sheet-tab-scroller")).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: /mobile editor tabs/i })).toBeInTheDocument();
  });

  it("scrolls the active tab into view when the selected tab changes", () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <MobileBottomSheet
        activeTab="Properties"
        onTabChange={onTabChange}
        body={<div>Panel Body</div>}
      />,
    );

    scrollIntoViewMock.mockClear();

    rerender(
      <MobileBottomSheet
        activeTab="Audio"
        onTabChange={onTabChange}
        body={<div>Panel Body</div>}
      />,
    );

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  });

  it("expands collapsed sheet and switches tab when the user taps another tab", () => {
    const { onTabChange } = renderSheet("Properties");

    fireEvent.click(screen.getByRole("tab", { name: "Audio" }));

    expect(onTabChange).toHaveBeenCalledWith("Audio");
    expect(screen.getByText("Panel Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /collapse panel/i })).toBeInTheDocument();
  });
});
