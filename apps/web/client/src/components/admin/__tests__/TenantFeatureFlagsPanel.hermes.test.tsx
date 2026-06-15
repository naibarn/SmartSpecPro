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

describe("TenantFeatureFlagsPanel Hermes discoverability", () => {
  beforeEach(() => {
    getFeatureFlagsMock.mockReturnValue({
      data: {
        hermesAgentRuntime: true,
        hermesProfileExperience: true,
        hermesChannelWorkflowExpansion: true,
        hermesMemoryContextSync: false,
        hermesTaskModes: true,
        hermesVisibilitySummaries: true,
      },
      isLoading: false,
    });
    getWorkpackRolloutStateMock.mockReturnValue({
      data: null,
      isLoading: false,
    });
  });

  it("surfaces the Hermes Runtime group and helper hint", () => {
    render(<TenantFeatureFlagsPanel tenantId="tenant-1" canEdit={false} />);

    expect(screen.getByRole("button", { name: /hermes runtime/i })).toBeInTheDocument();
    expect(screen.getByText(/hermes runtime has its own group near the top of the list/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /toggle hermes profile experience/i })).toBeInTheDocument();
  });

  it("surfaces Marketplace HyperFrames labels with their internal keys", () => {
    render(<TenantFeatureFlagsPanel tenantId="tenant-1" canEdit={false} />);

    expect(screen.getByRole("button", { name: /media production & hyperframes/i })).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceHyperframesEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceHyperframesWorkerEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceHyperframesLibrarySaveEnabled")).toBeInTheDocument();
    expect(screen.getByText("Key: marketplaceHyperframesOperatorEnabled")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: /toggle marketplace hyperframes \(marketplaceHyperframesEnabled\)/i,
      }),
    ).toBeInTheDocument();
  });
});
