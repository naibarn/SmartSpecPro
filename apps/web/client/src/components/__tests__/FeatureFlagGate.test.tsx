/**
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FeatureFlagGate } from "../FeatureFlagGate";

// Mock the useTenantFeatureFlag hook
vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: vi.fn(),
}));

import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";

const mockedUseFlag = vi.mocked(useTenantFeatureFlag);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("FeatureFlagGate", () => {
  it("renders children when feature flag is enabled", () => {
    mockedUseFlag.mockReturnValue(true);

    render(
      <FeatureFlagGate flag="canvas">
        <div>Canvas</div>
      </FeatureFlagGate>,
      { wrapper },
    );

    expect(screen.getByText("Canvas")).toBeDefined();
  });

  it("does not render children when feature flag is disabled", () => {
    mockedUseFlag.mockReturnValue(false);

    render(
      <FeatureFlagGate flag="canvas">
        <div>Canvas</div>
      </FeatureFlagGate>,
      { wrapper },
    );

    expect(screen.queryByText("Canvas")).toBeNull();
  });

  it("renders fallback when flag is disabled and fallback provided", () => {
    mockedUseFlag.mockReturnValue(false);

    render(
      <FeatureFlagGate flag="canvas" fallback={<div>Upgrade</div>}>
        <div>Canvas</div>
      </FeatureFlagGate>,
      { wrapper },
    );

    expect(screen.getByText("Upgrade")).toBeDefined();
    expect(screen.queryByText("Canvas")).toBeNull();
  });

  it("renders nothing (no fallback) when flag is disabled", () => {
    mockedUseFlag.mockReturnValue(false);

    const { container } = render(
      <FeatureFlagGate flag="canvas">
        <div>Canvas</div>
      </FeatureFlagGate>,
      { wrapper },
    );

    expect(container.innerHTML).toBe("");
  });

  it("uses default true value for costDisplay when featureFlags is undefined", () => {
    // costDisplay defaults to true — mock reflects the hook's default fallback
    mockedUseFlag.mockReturnValue(true);

    render(
      <FeatureFlagGate flag="costDisplay">
        <div>Cost</div>
      </FeatureFlagGate>,
      { wrapper },
    );

    expect(screen.getByText("Cost")).toBeDefined();
  });

  it("uses default false value for browserTool when featureFlags is undefined", () => {
    // browserTool defaults to false — hook returns false for missing data
    mockedUseFlag.mockReturnValue(false);

    render(
      <FeatureFlagGate flag="browserTool">
        <div>Browser</div>
      </FeatureFlagGate>,
      { wrapper },
    );

    expect(screen.queryByText("Browser")).toBeNull();
  });
});
