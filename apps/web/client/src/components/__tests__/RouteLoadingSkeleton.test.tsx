import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteLoadingSkeleton } from "../RouteLoadingSkeleton";

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
});
