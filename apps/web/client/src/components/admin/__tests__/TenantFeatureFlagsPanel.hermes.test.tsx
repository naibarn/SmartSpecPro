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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", resolvedLanguage: "en" },
  }),
}));

vi.mock("@/components/help/HelpButton", () => ({
  HelpButton: ({ page, topic, label }: { page: string; topic: string; label: string }) => (
    <button type="button" data-page={page} data-topic={topic}>{label}</button>
  ),
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
        hermesMediaWorker: false,
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

  it("links the tenant rollout controls to the Grok via Hermes admin guide", () => {
    render(<TenantFeatureFlagsPanel tenantId="tenant-1" canEdit={false} />);

    expect(screen.getByRole("button", { name: "Setup Help" })).toHaveAttribute(
      "data-topic",
      "grok-via-hermes-admin",
    );
    expect(screen.getByRole("button", { name: "Setup Help" })).toHaveAttribute(
      "data-page",
      "/admin/tenants",
    );
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

  it("surfaces hermesMediaWorker (F135 Grok media worker) as discoverable and distinguishable from hermesAgentRuntime", () => {
    render(<TenantFeatureFlagsPanel tenantId="tenant-1" canEdit={false} />);

    // Discoverable: has its own switch, keyed by its own internal key —
    // NOT nested under the "Hermes Runtime" group's flags.
    expect(screen.getByText("Key: hermesMediaWorker")).toBeInTheDocument();
    const mediaWorkerSwitch = screen.getByRole("switch", {
      name: /toggle grok via hermes — tenant rollout \(hermesmediaworker\)/i,
    });
    expect(mediaWorkerSwitch).toBeInTheDocument();

    // Distinguishable: label/description explicitly calls out that this is
    // NOT the agent-gateway Hermes runtime (hermesAgentRuntime).
    expect(screen.getByText(/not the agent-gateway hermes runtime/i)).toBeInTheDocument();

    // hermesMediaWorker lives in the media/generation group, not the
    // "Hermes Runtime" agent-gateway group (which only has the six legacy
    // hermesAgentRuntime-lane flags).
    const hermesRuntimeSwitch = screen.getByRole("switch", { name: /toggle hermes runtime \(hermesagentruntime\)/i });
    expect(hermesRuntimeSwitch).toBeInTheDocument();
    expect(mediaWorkerSwitch).not.toBe(hermesRuntimeSwitch);
  });
});
