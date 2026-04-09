/**
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const assignMock = vi.fn();
const navigateMock = vi.fn();
const state = vi.hoisted(() => ({
  search: "runId=run-1&agencyId=proposal-orchestrator",
}));

vi.mock("wouter", () => ({
  useSearch: () => state.search,
  useLocation: () => ["/desktop/open", navigateMock] as const,
}));

Object.defineProperty(window, "location", {
  value: {
    assign: assignMock,
  },
  writable: true,
});

import DesktopOpen from "../DesktopOpen";
import DesktopView from "../DesktopView";

describe("desktop handoff pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.search = "runId=run-1&agencyId=proposal-orchestrator";
  });

  it("renders desktop launch fallback UI", () => {
    render(<DesktopOpen />);

    expect(screen.getByText("Open in SmartSpecPro Desktop")).toBeInTheDocument();
    expect(screen.getByText(/smartspecpro:\/\/desktop\/open/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try opening Desktop again/i })).toBeInTheDocument();
  });

  it("redirects /desktop/view links back into web routes", () => {
    render(<DesktopView />);

    expect(navigateMock).toHaveBeenCalledWith("/agencies/proposal-orchestrator");
  });
});
