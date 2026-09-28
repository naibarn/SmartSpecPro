import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketplaceAutoReviewLaunchModeSwitch } from "../MarketplaceAutoReviewLaunchModeSwitch";

describe("MarketplaceAutoReviewLaunchModeSwitch", () => {
  it("keeps Auto and Standard reachable", () => {
    const onChange = vi.fn();
    render(
      <MarketplaceAutoReviewLaunchModeSwitch
        value="auto_storyboard_review"
        onChange={onChange}
        autoEnabled
        standardAvailable
      />
    );

    expect(screen.getByRole("group", { name: /launch mode/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /auto mode/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: /standard mode/i }));
    expect(onChange).toHaveBeenCalledWith("standard_order");
  });

  it("keeps blocked Auto inspectable while making Standard Order reachable", () => {
    const onChange = vi.fn();
    render(
      <MarketplaceAutoReviewLaunchModeSwitch
        value="standard_order"
        onChange={onChange}
        autoEnabled={false}
        standardAvailable
        locale="en"
      />
    );

    const autoButton = screen.getByRole("button", { name: /auto mode/i });
    expect(autoButton.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Review blockers")).toBeTruthy();

    fireEvent.click(autoButton);
    expect(onChange).toHaveBeenCalledWith("auto_storyboard_review");
    expect(
      screen.getByRole("button", { name: /standard mode/i })
    ).not.toBeDisabled();
  });

  it("uses a full-width Auto mode when Standard is intentionally hidden", () => {
    const onChange = vi.fn();
    render(
      <MarketplaceAutoReviewLaunchModeSwitch
        value="auto_storyboard_review"
        onChange={onChange}
        autoEnabled
        standardAvailable
        showStandardOption={false}
      />
    );

    expect(screen.queryByRole("button", { name: /standard mode/i })).toBeNull();
    expect(screen.getByRole("group")).toHaveClass("grid-cols-1");
  });
});
