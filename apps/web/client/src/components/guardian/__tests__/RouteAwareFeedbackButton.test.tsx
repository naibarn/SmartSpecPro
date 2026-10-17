/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ location: "/login" }));

vi.mock("wouter", () => ({
  useLocation: () => [routeState.location, vi.fn()],
}));

vi.mock("../FeedbackButton", () => ({
  FeedbackButton: () => <button type="button">Feedback launcher</button>,
}));

import { RouteAwareFeedbackButton } from "../RouteAwareFeedbackButton";

describe("RouteAwareFeedbackButton", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(["/login", "/login/", "/login?returnUrl=%2Fdashboard"])(
    "does not mount the global assistant on %s",
    location => {
      routeState.location = location;
      const { container } = render(<RouteAwareFeedbackButton />);
      expect(container).toBeEmptyDOMElement();
    }
  );

  it("keeps the global assistant available on other routes", () => {
    routeState.location = "/dashboard";
    render(<RouteAwareFeedbackButton />);
    expect(
      screen.getByRole("button", { name: "Feedback launcher" })
    ).toBeInTheDocument();
  });
});
