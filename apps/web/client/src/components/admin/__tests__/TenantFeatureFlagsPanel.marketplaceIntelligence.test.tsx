/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getFeatureFlagsMock = vi.fn();
const getWorkpackRolloutStateMock = vi.fn();
const useUtilsMock = vi.fn(() => ({
  tenantFeatureFlags: {
    getFeatureFlags: {
      cancel: vi.fn(),
      getData: vi.fn(),
      setData: vi.fn(),
      invalidate: vi.fn(),
    },
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => useUtilsMock(),
    tenantFeatureFlags: {
      getFeatureFlags: { useQuery: (...args: unknown[]) => getFeatureFlagsMock(...args) },
      getWorkpackRolloutState: { useQuery: (...args: unknown[]) => getWorkpackRolloutStateMock(...args) },
      updateFeatureFlags: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }) },
    },
  },
}));

import { TenantFeatureFlagsPanel } from "../TenantFeatureFlagsPanel";

describe("TenantFeatureFlagsPanel Marketplace Intelligence discoverability", () => {
  beforeEach(() => {
    getFeatureFlagsMock.mockReturnValue({
      data: {
        marketplaceConnectorLabEnabled: false,
        marketplaceIntelligenceImportsEnabled: false,
        marketplaceKeywordDiscoveryEnabled: false,
        marketplaceIntelligenceReportsEnabled: false,
        marketplaceReportImageSkillsEnabled: false,
        marketplaceIntelligenceShareableImageEnabled: false,
        marketplaceIntelligenceWatchlistsEnabled: false,
        marketplaceIntelligenceMcpWritesEnabled: false,
      },
      isLoading: false,
    });
    getWorkpackRolloutStateMock.mockReturnValue({
      data: null,
      isLoading: false,
    });
  });

  it("surfaces the Marketplace Intelligence group and sub-feature flags", () => {
    render(<TenantFeatureFlagsPanel tenantId="tenant-1" canEdit={false} />);

    expect(screen.getByRole("button", { name: /marketplace intelligence/i })).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceConnectorLabEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceIntelligenceImportsEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceKeywordDiscoveryEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceIntelligenceReportsEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceReportImageSkillsEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceIntelligenceShareableImageEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceIntelligenceWatchlistsEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceIntelligenceMcpWritesEnabled")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: /toggle marketplace connector lab \(marketplaceConnectorLabEnabled\)/i,
      }),
    ).toBeInTheDocument();
  });
});
