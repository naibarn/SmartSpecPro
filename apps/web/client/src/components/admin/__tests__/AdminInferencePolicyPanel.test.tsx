import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  heads: [] as any[],
  policyHistory: { revisions: [] as any[], events: [] as any[] },
  revocations: [] as any[],
  profiles: { ok: true, profiles: [] as any[] },
  activeProfiles: { ok: true, profiles: [] as any[] },
  probeRuns: [] as any[],
  mutate: vi.fn(),
  revoke: vi.fn(),
  rollback: vi.fn(),
  probe: vi.fn(),
  capabilityProbe: vi.fn(),
  certifyProfile: vi.fn(),
  probeOptions: null as null | { onSuccess?: (value: any) => unknown; onError?: () => void },
  capabilityProbeOptions: null as null | { onSuccess?: (value: any) => unknown; onError?: () => void },
  certifyProfileOptions: null as null | { onSuccess?: (value: any) => unknown; onError?: () => void },
  profilePublish: vi.fn(),
  profilePublishOptions: null as null | { onSuccess?: (value: any) => unknown; onError?: () => void },
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));

vi.mock("../../../lib/trpc", () => ({
  trpc: {
    llmProviders: {
      listInferencePolicies: {
        useQuery: () => ({ data: state.heads, isLoading: false }),
      },
      listInferencePolicyRevisions: {
        useQuery: () => ({ data: state.policyHistory, isLoading: false, isError: false }),
      },
      listInferenceRevocations: {
        useQuery: () => ({ data: state.revocations, isLoading: false }),
      },
      listInferenceProfileCandidates: {
        useQuery: () => ({ data: state.profiles, isLoading: false, isError: false }),
      },
      listInferenceProfiles: {
        useQuery: () => ({ data: state.activeProfiles, isLoading: false, isError: false }),
      },
      listInferenceConnectivityProbeRuns: {
        useQuery: () => ({ data: state.probeRuns, isLoading: false }),
      },
      runInferenceConnectivityProbe: {
        useMutation: (options: typeof state.probeOptions) => {
          state.probeOptions = options;
          return { mutate: state.probe, isPending: false };
        },
      },
      runInferenceCapabilityProbe: {
        useMutation: (options: typeof state.capabilityProbeOptions) => {
          state.capabilityProbeOptions = options;
          return { mutate: state.capabilityProbe, isPending: false };
        },
      },
      certifyInferenceProfileCandidate: {
        useMutation: (options: typeof state.certifyProfileOptions) => {
          state.certifyProfileOptions = options;
          return { mutate: state.certifyProfile, isPending: false };
        },
      },
      publishInferenceProfile: {
        useMutation: (options: typeof state.profilePublishOptions) => {
          state.profilePublishOptions = options;
          return { mutate: state.profilePublish, isPending: false };
        },
      },
      publishInferencePolicy: {
        useMutation: () => ({ mutate: state.mutate, isPending: false }),
      },
      rollbackInferencePolicy: {
        useMutation: () => ({ mutate: state.rollback, isPending: false }),
      },
      createInferenceRevocation: {
        useMutation: () => ({ mutate: state.revoke, isPending: false }),
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ t: (key: string) => key }),
}));

import { AdminInferencePolicyPanel } from "../AdminInferencePolicyPanel";

describe("AdminInferencePolicyPanel", () => {
  beforeEach(() => {
    state.heads = [];
    state.policyHistory = { revisions: [], events: [] };
    state.revocations = [];
    state.profiles = { ok: true, profiles: [] };
    state.activeProfiles = { ok: true, profiles: [] };
    state.probeRuns = [];
    state.mutate.mockReset();
    state.revoke.mockReset();
    state.rollback.mockReset();
    state.probe.mockReset();
    state.capabilityProbe.mockReset();
    state.certifyProfile.mockReset();
    state.probeOptions = null;
    state.capabilityProbeOptions = null;
    state.certifyProfileOptions = null;
    state.profilePublish.mockReset();
    state.profilePublishOptions = null;
    state.invalidate.mockReset();
  });

  it("compares a saved policy revision and requests a scoped rollback", () => {
    const activePolicy = {
      ready: true,
      allowedProviderIds: ["provider-current"],
      allowedRegions: ["TH"],
      allowedCredentialOwnerRefs: ["platform:default"],
      requireZeroDataRetention: false,
      routingPolicy: {
        scoreCalibrationRevision: "scores:current",
        weights: {
          qualityPpm: 800_000,
          costPpm: 50_000,
          latencyPpm: 50_000,
          reliabilityPpm: 50_000,
          compatibilityPpm: 50_000,
        },
      },
    };
    const savedPolicy = {
      ...activePolicy,
      allowedProviderIds: ["provider-previous"],
      routingPolicy: {
        ...activePolicy.routingPolicy,
        scoreCalibrationRevision: "scores:previous",
      },
    };
    state.heads = [{
      scopeType: "platform",
      scopeKey: "platform",
      revision: "sha256:current",
      policyJson: activePolicy,
    }];
    state.policyHistory = {
      revisions: [
        { revision: "sha256:previous", policyJson: savedPolicy, createdByUserId: 7, createdAt: new Date("2026-09-26T00:00:00Z") },
        { revision: "sha256:current", policyJson: activePolicy, createdByUserId: 8, createdAt: new Date("2026-09-27T00:00:00Z") },
      ],
      events: [],
    };

    render(<AdminInferencePolicyPanel />);
    fireEvent.change(screen.getByLabelText("admin.llmProviders.policy.compareRevision"), {
      target: { value: "sha256:previous" },
    });
    expect(screen.getByText((_, element) => element?.textContent === "allowedProviderIds")).toBeTruthy();
    expect(screen.getAllByText((_, element) =>
      element?.textContent?.includes("scores:previous") ?? false
    ).length).toBeGreaterThan(0);
    const rollbackButton = screen.getByRole("button", { name: "admin.llmProviders.policy.rollback" });
    expect(rollbackButton).toHaveProperty("disabled", false);
    fireEvent.click(rollbackButton);
    expect(state.rollback).toHaveBeenCalledWith({
      scopeType: "platform",
      scopeKey: "platform",
      revision: "sha256:previous",
    });
  });

  it("explains missing policy and publishes AUTO policy directly without a confirmation dialog", () => {
    render(<AdminInferencePolicyPanel />);
    expect(screen.getByText("admin.llmProviders.policy.noPolicy")).toBeTruthy();
    fireEvent.change(
      screen.getByLabelText("admin.llmProviders.policy.providers"),
      {
        target: { value: "provider-b\nprovider-a" },
      }
    );
    fireEvent.change(
      screen.getByLabelText("admin.llmProviders.policy.regions"),
      {
        target: { value: "TH" },
      }
    );
    fireEvent.change(
      screen.getByLabelText("admin.llmProviders.policy.credentialOwners"),
      {
        target: { value: "platform:default" },
      }
    );
    fireEvent.change(
      screen.getByLabelText("admin.llmProviders.policy.weight.quality"),
      { target: { value: "750000" } }
    );
    fireEvent.change(
      screen.getByLabelText("admin.llmProviders.policy.weight.cost"),
      { target: { value: "100000" } }
    );
    fireEvent.click(
      screen.getByRole("button", { name: "admin.llmProviders.policy.publish" })
    );
    expect(state.mutate).toHaveBeenCalledWith({
      scopeType: "platform",
      policy: {
        ready: false,
        requireZeroDataRetention: false,
        allowedProviderIds: ["provider-a", "provider-b"],
        allowedRegions: ["TH"],
        allowedCredentialOwnerRefs: ["platform:default"],
        routingPolicy: {
          scoreCalibrationRevision: "scores:spec231-default-1",
          weights: {
          qualityPpm: 750_000,
          costPpm: 100_000,
            latencyPpm: 50_000,
            reliabilityPpm: 50_000,
            compatibilityPpm: 50_000,
          },
        },
      },
    });
  });

  it("requires explicit tenant and principal identity for narrower policy scopes", () => {
    render(<AdminInferencePolicyPanel />);
    fireEvent.change(
      screen.getByRole("combobox", { name: "admin.llmProviders.policy.scope" }),
      {
        target: { value: "principal" },
      }
    );
    expect(
      screen.getByRole("button", { name: "admin.llmProviders.policy.publish" })
    ).toHaveProperty("disabled", true);
    fireEvent.change(
      screen.getByLabelText("admin.llmProviders.policy.tenantId"),
      {
        target: { value: "tenant-1" },
      }
    );
    fireEvent.change(
      screen.getByLabelText("admin.llmProviders.policy.principalId"),
      {
        target: { value: "user-1" },
      }
    );
    expect(
      screen.getByRole("button", { name: "admin.llmProviders.policy.publish" })
    ).toHaveProperty("disabled", false);
  });

  it("creates a tenant-scoped, expiring emergency deployment revocation", () => {
    render(<AdminInferencePolicyPanel />);
    fireEvent.change(
      screen.getByRole("combobox", { name: "admin.llmProviders.policy.scope" }),
      { target: { value: "tenant" } }
    );
    fireEvent.change(screen.getByLabelText("admin.llmProviders.policy.tenantId"), {
      target: { value: "tenant-1" },
    });
    fireEvent.change(screen.getByLabelText("admin.llmProviders.policy.revokeTargetId"), {
      target: { value: "deployment:openai:gpt-5" },
    });
    fireEvent.change(screen.getByLabelText("admin.llmProviders.policy.revokeExpiry"), {
      target: { value: "2026-09-28T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin.llmProviders.policy.revoke" }));

    expect(state.revoke).toHaveBeenCalledWith({
      scopeType: "tenant",
      tenantId: "tenant-1",
      targetType: "deployment",
      targetId: "deployment:openai:gpt-5",
      reasonCode: "operator_action",
      expiresAt: new Date("2026-09-28T12:00").toISOString(),
    });
  });

  it("shows the recent revocation history for the selected tenant scope", () => {
    state.revocations = [{
      id: 9,
      targetType: "deployment",
      targetId: "deployment:openai:gpt-5",
      reasonCode: "operator_action",
      createdByUserId: 12,
      createdAt: new Date("2026-09-27T10:00:00.000Z"),
      expiresAt: new Date("2099-09-28T12:00:00.000Z"),
    }];
    render(<AdminInferencePolicyPanel />);
    fireEvent.change(
      screen.getByRole("combobox", { name: "admin.llmProviders.policy.scope" }),
      { target: { value: "tenant" } }
    );
    fireEvent.change(screen.getByLabelText("admin.llmProviders.policy.tenantId"), {
      target: { value: "tenant-1" },
    });

    expect(screen.getByText("deployment: deployment:openai:gpt-5")).toBeTruthy();
    expect(screen.getByText("admin.llmProviders.policy.revocationHistory")).toBeTruthy();
    expect(screen.getByText(/admin.llmProviders.policy.revocationActor/)).toBeTruthy();
  });

  it("runs a connectivity-only probe and displays its safe result", async () => {
    state.profiles = {
      ok: true,
      profiles: [{
        model: { logicalModelId: "model:demo" },
        deployment: {
          deploymentId: "deployment:demo",
          revision: "r1",
          providerNativeModelId: "provider-model-demo",
          endpointSurface: "chat-completions",
        },
      }],
    };
    render(<AdminInferencePolicyPanel />);

    expect(screen.getByText("admin.llmProviders.probe.description")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "admin.llmProviders.probe.run" }));
    expect(state.probe).toHaveBeenCalledWith({ deploymentId: "deployment:demo" });
    await act(async () => {
      await state.probeOptions?.onSuccess?.({ status: "passed" });
    });
    expect(screen.getByText("admin.llmProviders.probe.passed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "admin.llmProviders.capabilityProbe.run" }));
    expect(state.capabilityProbe).toHaveBeenCalledWith({ deploymentId: "deployment:demo" });
    await act(async () => {
      await state.capabilityProbeOptions?.onSuccess?.({
        status: "incomplete",
        reasonCode: "REGION_RETENTION_VERIFIER_UNAVAILABLE",
      });
    });
    expect(screen.getByText(/admin\.llmProviders\.capabilityProbe\.incomplete/)).toBeTruthy();
    expect(state.invalidate).toHaveBeenCalled();
  });

  it("offers profile certification only after a passed capability suite", () => {
    state.profiles = {
      ok: true,
      profiles: [{
        model: { logicalModelId: "model:demo" },
        deployment: {
          deploymentId: "deployment:demo",
          revision: "r1",
          providerNativeModelId: "provider-model-demo",
          endpointSurface: "chat-completions",
        },
      }],
    };
    state.probeRuns = [{
      runId: "probe:latest",
      probeKind: "capability_suite",
      status: "passed",
      resultJson: { qualificationStatus: "passed" },
      finishedAt: new Date("2026-09-27T00:00:00Z"),
    }];
    render(<AdminInferencePolicyPanel />);

    fireEvent.click(screen.getByRole("button", {
      name: "admin.llmProviders.profile.certify",
    }));
    expect(state.certifyProfile).toHaveBeenCalledWith({
      deploymentId: "deployment:demo",
    });
  });

  it("shows active certified profiles and their evidence reference", () => {
    state.activeProfiles = {
      ok: true,
      profiles: [{
        model: {
          logicalModelId: "model:active-demo",
          providerNativeModelId: "native-active-demo",
        },
        deployment: {
          deploymentId: "deployment:active-demo",
          revision: "deployment-rev:active",
          providerId: "provider:7",
          region: "TH",
          probe: { evidenceRef: "sha256:active-evidence" },
        },
      }],
    };
    render(<AdminInferencePolicyPanel />);

    expect(screen.getByText("admin.llmProviders.profile.activeTitle")).toBeTruthy();
    expect(screen.getByText(/sha256:active-evidence/)).toBeTruthy();
    expect(screen.getByText("admin.llmProviders.profile.activeStatus")).toBeTruthy();
  });

  it("shows a redacted generic message when the connectivity request fails", () => {
    state.profiles = {
      ok: true,
      profiles: [{
        model: { logicalModelId: "model:demo" },
        deployment: {
          deploymentId: "deployment:demo",
          revision: "r1",
          providerNativeModelId: "provider-model-demo",
          endpointSurface: "chat-completions",
        },
      }],
    };
    render(<AdminInferencePolicyPanel />);
    fireEvent.click(screen.getByRole("button", { name: "admin.llmProviders.probe.run" }));
    act(() => state.probeOptions?.onError?.());
    expect(screen.getByText("admin.llmProviders.probe.requestFailed")).toBeTruthy();
  });

  it("validates profile JSON locally and publishes a candidate without activating it", async () => {
    render(<AdminInferencePolicyPanel />);
    const profileInput = screen.getByLabelText("admin.llmProviders.profile.jsonLabel");
    const publish = screen.getByRole("button", { name: "admin.llmProviders.profile.publish" });

    fireEvent.change(profileInput, { target: { value: "{invalid" } });
    fireEvent.click(publish);
    expect(screen.getByText("admin.llmProviders.profile.invalidJson")).toBeTruthy();
    expect(state.profilePublish).not.toHaveBeenCalled();

    const candidate = { model: { lifecycle: "METADATA_VALIDATED" }, deployment: { status: "DEGRADED" } };
    fireEvent.change(profileInput, { target: { value: JSON.stringify(candidate) } });
    fireEvent.click(publish);
    expect(state.profilePublish).toHaveBeenCalledWith({ profileInput: candidate });
    await act(async () => {
      await state.profilePublishOptions?.onSuccess?.({
        ok: true,
        deploymentRevision: "deployment-rev-2",
      });
    });
    expect(screen.getByText(/admin\.llmProviders\.profile\.published/)).toBeTruthy();
    expect(state.invalidate).toHaveBeenCalled();
  });

  it("shows server rejection when an admin tries to self-certify an active profile", async () => {
    render(<AdminInferencePolicyPanel />);
    fireEvent.change(screen.getByLabelText("admin.llmProviders.profile.jsonLabel"), {
      target: { value: JSON.stringify({ model: {}, deployment: {} }) },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin.llmProviders.profile.publish" }));
    await act(async () => {
      await state.profilePublishOptions?.onSuccess?.({
        ok: false,
        code: "SERVER_PROBE_REQUIRED_FOR_ACTIVATION",
      });
    });
    expect(screen.getByText("admin.llmProviders.profile.activationBlocked")).toBeTruthy();
  });
});
