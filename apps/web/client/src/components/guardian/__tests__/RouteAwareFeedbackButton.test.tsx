/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ location: "/login" }));

vi.mock("wouter", () => ({
  useLocation: () => [routeState.location, vi.fn()],
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ t: () => "Open AI Chat & Feedback" }),
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
    "keeps the assistant launcher available without mounting its dialog on %s",
    location => {
      routeState.location = location;
      render(<RouteAwareFeedbackButton />);
      expect(
        screen.getByRole("button", { name: "Open AI Chat & Feedback" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Feedback launcher" })
      ).not.toBeInTheDocument();
    }
  );

  it("opens the assistant when requested from login", async () => {
    routeState.location = "/login";
    render(<RouteAwareFeedbackButton />);
    screen.getByRole("button", { name: "Open AI Chat & Feedback" }).click();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Feedback launcher" })
      ).toBeInTheDocument()
    );
  });

  it("keeps the global assistant available on other routes", async () => {
    routeState.location = "/dashboard";
    render(<RouteAwareFeedbackButton />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Feedback launcher" })
      ).toBeInTheDocument()
    );
  });
});
