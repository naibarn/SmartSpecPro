/**
 * FE03 (LOW, pre-merge security gate) — `NotWiredJobCard` used to render
 * `jobStatus.error` verbatim with no allowlist check. Proves the fix: the
 * raw message is only rendered when it starts with our own greppable `VI_`
 * prefix; any other value falls back to a generic message instead of being
 * echoed to the DOM verbatim.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotWiredJobCard } from "../NotWiredJobCard";

describe("NotWiredJobCard — FE03 error-message allowlist fix", () => {
  it("renders a VI_-prefixed job error verbatim", () => {
    render(
      <NotWiredJobCard
        lang="en"
        title="Scene plan"
        buttonLabel="Run"
        testId="scene-plan"
        jobStatus={{ status: "failed", error: "VI_SCENE_PLAN_NOT_WIRED: not wired yet", progress: null }}
        onRun={() => {}}
      />,
    );

    expect(screen.getByText("VI_SCENE_PLAN_NOT_WIRED: not wired yet")).toBeInTheDocument();
  });

  it("does NOT render an arbitrary (non VI_-prefixed) job error verbatim — falls back to a generic message", () => {
    const maliciousLookingError = "<img src=x onerror=alert(1)>internal stack trace leaked here";
    render(
      <NotWiredJobCard
        lang="en"
        title="Scene plan"
        buttonLabel="Run"
        testId="scene-plan"
        jobStatus={{ status: "failed", error: maliciousLookingError, progress: null }}
        onRun={() => {}}
      />,
    );

    expect(screen.queryByText(maliciousLookingError)).not.toBeInTheDocument();
    expect(screen.getByText("The job failed. Please try again or contact support.")).toBeInTheDocument();
  });

  it("renders nothing extra when there is no error", () => {
    render(
      <NotWiredJobCard
        lang="en"
        title="Scene plan"
        buttonLabel="Run"
        testId="scene-plan"
        jobStatus={{ status: "queued", error: null, progress: null }}
        onRun={() => {}}
      />,
    );

    expect(screen.queryByTestId("scene-plan-not-wired-notice")).not.toBeInTheDocument();
  });
});
