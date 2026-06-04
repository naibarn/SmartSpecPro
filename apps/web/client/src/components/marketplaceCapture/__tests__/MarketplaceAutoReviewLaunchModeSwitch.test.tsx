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

    expect(screen.getByRole("tab", { name: /auto mode/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /standard mode/i }));
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

    const autoTab = screen.getByRole("tab", { name: /auto mode/i });
    expect(autoTab.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Review blockers")).toBeTruthy();

    fireEvent.click(autoTab);
    expect(onChange).toHaveBeenCalledWith("auto_storyboard_review");
    expect(screen.getByRole("tab", { name: /standard mode/i })).not.toBeDisabled();
  });
});
