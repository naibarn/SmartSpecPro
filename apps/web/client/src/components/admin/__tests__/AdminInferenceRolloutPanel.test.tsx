import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  result: null as any,
  isLoading: false,
  isError: false,
  capability: null as any,
  capabilityIsLoading: false,
  capabilityIsError: false,
  activationResult: null as any,
  activated: vi.fn(),
}));

vi.mock("../../../lib/trpc", () => ({
  trpc: {
    llmProviders: {
      getInferenceRolloutBundleStatus: {
        useQuery: () => ({
          data: state.result,
          isLoading: state.isLoading,
          isError: state.isError,
        }),
      },
      getInferenceCapabilityRecheckStatus: {
        useQuery: () => ({
          data: state.capability,
          isLoading: state.capabilityIsLoading,
          isError: state.capabilityIsError,
        }),
      },
      activateInferenceRolloutBundle: {
        useMutation: (options: any) => ({
          mutate: (input: unknown) => options.onSuccess(state.activationResult, input),
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      llmProviders: {
        getInferenceRolloutBundleStatus: { invalidate: state.activated },
      },
    }),
  },
}));

vi.mock("../../../i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key === "admin.llmProviders.rollout.sequence"
        ? `${key}:${values?.sequence}`
        : key === "admin.llmProviders.rollout.capability.profiles"
          ? `${key}:${values?.count}`
          : key,
  }),
}));

import { AdminInferenceRolloutPanel } from "../AdminInferenceRolloutPanel";

describe("AdminInferenceRolloutPanel", () => {
  beforeEach(() => {
    state.result = null;
    state.isLoading = false;
    state.isError = false;
    state.capability = null;
    state.capabilityIsLoading = false;
    state.capabilityIsError = false;
    state.activationResult = null;
    state.activated.mockReset();
  });

  it("shows active release identity and signature verification state", () => {
    state.result = {
      keyringStatus: "ready",
      activeBundle: {
        bundleHash: `sha256:${"a".repeat(64)}`,
        bundleId: "release:2026-09-27",
        sequence: 9,
        createdAt: new Date("2026-09-27T10:00:00Z"),
        payload: {
          routerPolicyRevision: "policy:r9",
          logicalModelRegistryRevision: "registry:r12",
        },
        signatureStatus: "valid",
        active: true,
      },
      recentBundles: [],
    };

    render(<AdminInferenceRolloutPanel />);

    expect(screen.getByText("release:2026-09-27")).toBeInTheDocument();
    expect(
      screen.getByText("admin.llmProviders.rollout.signature.valid")
    ).toBeInTheDocument();
    expect(screen.getByText("policy:r9")).toBeInTheDocument();
    expect(screen.getByText("registry:r12")).toBeInTheDocument();
  });

  it("clearly reports an absent active bundle and an unconfigured signing keyring", () => {
    state.result = {
      keyringStatus: "KEYRING_MISSING",
      activeBundle: null,
      recentBundles: [],
    };

    render(<AdminInferenceRolloutPanel />);

    expect(
      screen.getByText("admin.llmProviders.rollout.keyring.KEYRING_MISSING")
    ).toBeInTheDocument();
    expect(
      screen.getByText("admin.llmProviders.rollout.noActiveBundle")
    ).toBeInTheDocument();
  });

  it("shows the verified capability evidence reference without exposing provider data", () => {
    state.result = {
      keyringStatus: "ready",
      activeBundle: null,
      recentBundles: [],
    };
    state.capability = {
      ready: true,
      reason: null,
      reference: `sha256:${"b".repeat(64)}`,
      registryRevision: "registry:r13",
      eligibleProfileCount: 2,
      ineligibleDeploymentIds: [],
    };

    render(<AdminInferenceRolloutPanel />);

    expect(
      screen.getByText("admin.llmProviders.rollout.capability.ready")
    ).toBeInTheDocument();
    expect(screen.getByText(`sha256:${"b".repeat(64)}`)).toBeInTheDocument();
    expect(screen.getByText(/registry:r13/)).toBeInTheDocument();
    expect(
      screen.getByText(/admin\.llmProviders\.rollout\.capability\.profiles:2/)
    ).toBeInTheDocument();
  });

  it("lets an admin attempt activation only for a signed bundle after capability readiness and reports server blockers", async () => {
    const bundleHash = `sha256:${"c".repeat(64)}`;
    state.result = {
      keyringStatus: "ready",
      activeBundle: null,
      recentBundles: [
        {
          bundleHash,
          bundleId: "candidate:next",
          sequence: 2,
          createdAt: new Date("2026-09-27T11:00:00Z"),
          payload: null,
          signatureStatus: "valid",
          active: false,
        },
      ],
    };
    state.capability = {
      ready: true,
      reference: `sha256:${"d".repeat(64)}`,
      registryRevision: "registry:r2",
      eligibleProfileCount: 1,
      ineligibleDeploymentIds: [],
    };
    state.activationResult = {
      ok: false,
      reason: "ENVIRONMENT_READINESS_UNAVAILABLE",
    };

    render(<AdminInferenceRolloutPanel />);
    const activateButton = screen.getByRole("button", {
      name: "admin.llmProviders.rollout.activate.action",
    });
    fireEvent.click(activateButton);

    expect(state.activated).not.toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "admin.llmProviders.rollout.activate.reason.ENVIRONMENT_READINESS_UNAVAILABLE"
    );
  });
});
