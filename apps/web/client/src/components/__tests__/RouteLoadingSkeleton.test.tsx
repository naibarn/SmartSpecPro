import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouteLoadingError,
  RouteLoadingSkeleton,
  RouteServiceRecovery,
} from "../RouteLoadingSkeleton";

describe("RouteLoadingSkeleton", () => {
  it("renders a container with data-testid='route-loading-skeleton'", () => {
    render(<RouteLoadingSkeleton />);
    expect(screen.getByTestId("route-loading-skeleton")).toBeInTheDocument();
  });

  it("renders at least one animated pulse/shimmer element", () => {
    render(<RouteLoadingSkeleton />);
    const skeleton = screen.getByTestId("route-loading-skeleton");
    // Check for any element with animate-pulse class anywhere in the subtree
    const pulseEls = skeleton.querySelectorAll('[class*="animate-pulse"]');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it("is not empty (has visible child elements)", () => {
    render(<RouteLoadingSkeleton />);
    const skeleton = screen.getByTestId("route-loading-skeleton");
    expect(skeleton.children.length).toBeGreaterThan(0);
  });

  it("renders an accessible retry state instead of a blank route", () => {
    const onRetry = vi.fn();
    render(<RouteLoadingError onRetry={onRetry} />);

    expect(screen.getByTestId("route-loading-error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load this page");
    screen.getByRole("button", { name: "Retry" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a calm reconnecting state without an error alert", () => {
    const onRetry = vi.fn();
    render(
      <RouteServiceRecovery
        autoRefreshPending={false}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByTestId("route-service-recovery")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    screen.getByRole("button", { name: "ลองเชื่อมต่ออีกครั้ง" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
