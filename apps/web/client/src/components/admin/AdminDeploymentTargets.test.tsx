// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDeploymentTargets from "./AdminDeploymentTargets";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  disable: vi.fn(),
  queueStagingDeploy: vi.fn(),
  activateStagingProfile: vi.fn(),
  activationError: null as string | null,
  activationSucceeds: false,
  stagingPreflight: { ready: false, reason: "VERIFIED_ROLLBACK_BASELINE_UNAVAILABLE", artifact: null, baseline: null },
  stagingRuntime: { status: "NOT_READY", checkedAt: "2026-10-22T00:00:00.000Z", activation: "disabled", transport: "all", missing: ["JOB_WORKFLOW", "WORKER_APP"], jobHandlerConfigured: true, controlPlaneConfigured: false, reason: "CLOUDFLARE_WORKER_RUNTIME_NOT_READY" },
  originConfiguration: null as Record<string, unknown> | null,
  originConfigurationError: false,
  fetchTargets: vi.fn(),
  fetchOriginConfiguration: vi.fn(),
  refetchStagingPreflight: vi.fn(),
  refetchStagingRuntimeReadiness: vi.fn(),
  refetchStagingOriginConfiguration: vi.fn(),
  refetchProductionRuntimeReadiness: vi.fn(),
  saveCredential: vi.fn(),
  revokeCredential: vi.fn(),
  targets: [] as Array<Record<string, unknown>>,
  targetsError: false,
}));

vi.mock("wouter", () => ({ useLocation: () => ["/admin/settings", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ infrastructure: {
      listProviderDeploymentTargets: { invalidate: mocks.invalidate, fetch: mocks.fetchTargets },
      getDeploymentCredentialState: { invalidate: mocks.invalidate },
      getCloudflareStagingDeployPreflight: { invalidate: mocks.invalidate },
      getCloudflareStagingRuntimeReadiness: { invalidate: mocks.invalidate },
      getCloudflareOriginConfiguration: { invalidate: mocks.invalidate, fetch: mocks.fetchOriginConfiguration },
      getCloudflareProductionRuntimeReadiness: { invalidate: mocks.invalidate },
    } }),
    systemSettings: { listTenants: { useQuery: () => ({ data: [
      { id: "tenant-system", name: "System" },
      { id: "tenant-codex-uat", name: "Codex UAT Isolated Tenant" },
      { id: "tenant-ZCSKEM9s", name: "Tenant One" },
      { id: "tenant-smartaihub", name: "Production tenant", domain: "smartaihub.app" },
    ] }) } },
    infrastructure: {
      listDeploymentTargetProjects: { useQuery: () => ({ data: [{ projectId: "2fe8a309-8be6-4370-9813-8fb9cc4645a0", title: "Wiki", projectType: "workspace" }] }) },
      listProviderDeploymentTargets: { useQuery: () => ({ data: mocks.targets, isLoading: false, isError: mocks.targetsError, isFetching: false }) },
      getCloudflareStagingDeployPreflight: { useQuery: () => ({ data: mocks.stagingPreflight, isLoading: false, isError: false, refetch: mocks.refetchStagingPreflight }) },
      getCloudflareOriginConfiguration: { useQuery: () => ({ data: mocks.originConfiguration, isLoading: false, isError: mocks.originConfigurationError, refetch: mocks.refetchStagingOriginConfiguration }) },
      getCloudflareStagingRuntimeReadiness: { useQuery: () => ({ data: mocks.stagingRuntime, isLoading: false, isFetching: false, isError: false, refetch: mocks.refetchStagingRuntimeReadiness }) },
      getCloudflareProductionRuntimeReadiness: { useQuery: () => ({ data: { status: "NOT_READY", checkedAt: "2026-10-22T00:00:00.000Z", environment: "production", activation: "disabled", transport: "queues", missing: ["HYPERDRIVE", "JOB_QUEUE"], unconfigured: ["HYPERDRIVE", "JOB_QUEUE", "JOB_WORKFLOW", "JOB_CONTAINERS", "WORKER_APP", "MEDIA_BUCKET", "VECTOR_INDEX"], jobHandlerConfigured: false, reason: "CLOUDFLARE_PRODUCTION_WORKER_RUNTIME_NOT_READY" }, isLoading: false, isFetching: false, isError: false, refetch: mocks.refetchProductionRuntimeReadiness }) },
      getDeploymentCredentialState: { useQuery: () => ({ data: { status: "CONFIGURED" }, isLoading: false, isError: false }) },
      createProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.create, isPending: false, error: null }) },
      updateProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.update, isPending: false, error: null }) },
      disableProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.disable, isPending: false, error: null }) },
      queueCloudflareStagingDeploy: { useMutation: () => ({ mutate: mocks.queueStagingDeploy, isPending: false, error: null }) },
      activateCloudflareStagingQueueProfile: { useMutation: (options: { onSuccess?: (result: { configurationRef: string }) => unknown }) => ({
        mutate: (input: unknown) => {
          mocks.activateStagingProfile(input);
          if (mocks.activationSucceeds) void options.onSuccess?.({ configurationRef: "cf-origin:new-reference" });
        },
        isPending: false,
        error: mocks.activationError ? { message: mocks.activationError } : null,
      }) },
      saveDeploymentCredential: { useMutation: () => ({ mutate: mocks.saveCredential, isPending: false, error: null }) },
      revokeDeploymentCredential: { useMutation: () => ({ mutate: mocks.revokeCredential, isPending: false, error: null }) },
    },
  },
}));

const tenantId = "tenant-ZCSKEM9s";
const projectId = "2fe8a309-8be6-4370-9813-8fb9cc4645a0";

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { configurable: true, value: () => false },
  setPointerCapture: { configurable: true, value: () => undefined },
  releasePointerCapture: { configurable: true, value: () => undefined },
  scrollIntoView: { configurable: true, value: () => undefined },
});

const existingTarget = {
  id: "target-row-1",
  tenantId,
  projectId,
  environment: "staging",
  provider: "cloudflare",
  deploymentTargetId: "wiki-staging-worker",
  accountRef: "acct-ref",
  workerRef: "wiki-staging-worker",
  containerApplicationRef: null,
  enabled: true,
  provenance: "approved change ticket",
  runtimePolicy: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};
const stagingActivationTarget = {
  ...existingTarget,
  deploymentTargetId: "smartspec-cloudflare-staging",
  workerRef: "smartspec-cloudflare-staging",
};

async function chooseScope(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Authenticated tenant" }));
  await user.type(screen.getByPlaceholderText("Search tenant name, domain, or ID…"), "Tenant One");
  await user.click(await screen.findByRole("option", { name: /Tenant One/ }));
  await user.click(screen.getByRole("combobox", { name: "Canonical project" }));
  await user.type(screen.getByPlaceholderText("Search project name or ID…"), "Wiki");
  await user.click(await screen.findByRole("option", { name: /Wiki/ }));
  await user.click(screen.getByRole("combobox", { name: "Environment" }));
  await user.click(await screen.findByRole("option", { name: "staging" }));
}

async function chooseProductionScope(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Authenticated tenant" }));
  await user.type(screen.getByPlaceholderText("Search tenant name, domain, or ID…"), "Tenant One");
  await user.click(await screen.findByRole("option", { name: /Tenant One/ }));
  await user.click(screen.getByRole("combobox", { name: "Canonical project" }));
  await user.type(screen.getByPlaceholderText("Search project name or ID…"), "Wiki");
  await user.click(await screen.findByRole("option", { name: /Wiki/ }));
  await user.click(screen.getByRole("combobox", { name: "Environment" }));
  await user.click(await screen.findByRole("option", { name: "production" }));
}

describe("AdminDeploymentTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.targets = [];
    mocks.targetsError = false;
    mocks.activationError = null;
    mocks.activationSucceeds = false;
    mocks.stagingPreflight = { ready: false, reason: "VERIFIED_ROLLBACK_BASELINE_UNAVAILABLE", artifact: null, baseline: null };
    mocks.stagingRuntime = { status: "NOT_READY", checkedAt: "2026-10-22T00:00:00.000Z", activation: "disabled", transport: "all", missing: ["JOB_WORKFLOW", "WORKER_APP"], jobHandlerConfigured: true, controlPlaneConfigured: false, reason: "CLOUDFLARE_WORKER_RUNTIME_NOT_READY" };
    mocks.originConfiguration = null;
    mocks.originConfigurationError = false;
  });

  it("filters the tenant list by name or ID instead of requiring scrolling", async () => {
    const user = userEvent.setup();
    render(<AdminDeploymentTargets />);

    await user.click(screen.getByRole("combobox", { name: "Authenticated tenant" }));
    const search = screen.getByPlaceholderText("Search tenant name, domain, or ID…");
    await user.type(search, "tenant-ZCSKEM9s");

    expect(await screen.findByRole("option", { name: /Tenant One/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Codex UAT/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Tenant One/ }));
    expect(screen.getByRole("combobox", { name: "Authenticated tenant" })).toHaveTextContent("Tenant One");
  });

  it("finds a tenant by its domain when the display name and ID differ", async () => {
    const user = userEvent.setup();
    render(<AdminDeploymentTargets />);

    await user.click(screen.getByRole("combobox", { name: "Authenticated tenant" }));
    await user.type(screen.getByPlaceholderText("Search tenant name, domain, or ID…"), "smartaihub.app");

    const option = await screen.findByRole("option", { name: /Production tenant/ });
    expect(option).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Codex UAT/ })).not.toBeInTheDocument();
    await user.click(option);
    expect(screen.getByRole("combobox", { name: "Authenticated tenant" })).toHaveTextContent("Production tenant");
  });

  it("requires an explicit selection and displays scoped target and credential readiness", async () => {
    const user = userEvent.setup();
    mocks.targets = [existingTarget];
    render(<AdminDeploymentTargets />);
    expect(screen.getAllByText("app_project_wiki_pages")).toHaveLength(1);
    expect(mocks.create).not.toHaveBeenCalled();

    await chooseScope(user);
    expect(await screen.findByText("wiki-staging-worker")).toBeInTheDocument();
    expect(screen.getByText("Credential: CONFIGURED")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token|encryptedSecret/i)).not.toBeInTheDocument();
    expect(screen.getByText(/dedicated non-production Mini-App Cloudflare account/)).toBeInTheDocument();

    await user.click(screen.getByText("Configure target account credential"));
    await user.type(screen.getByLabelText("Cloudflare API token"), "target-only-cloudflare-token-123");
    await user.click(screen.getByRole("button", { name: "Save encrypted token" }));
    expect(mocks.saveCredential).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "staging",
      provider: "cloudflare",
      token: "target-only-cloudflare-token-123",
    });
    expect(screen.getByRole("button", { name: "Revoke target token" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revoke target token" }));
    expect(mocks.revokeCredential).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging", provider: "cloudflare" });

    await user.click(screen.getByText("Edit target"));
    const targetIdentityInputs = screen.getAllByLabelText("Deployment target identity");
    await user.clear(targetIdentityInputs[0]);
    await user.type(targetIdentityInputs[0], "wiki-staging-worker-v2");
    await user.click(screen.getByRole("button", { name: "Save target changes" }));
    expect(mocks.update).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "staging",
      provider: "cloudflare",
      targetRowId: "target-row-1",
      changes: {
        deploymentTargetId: "wiki-staging-worker-v2",
        accountRef: "acct-ref",
        workerRef: "wiki-staging-worker",
        containerApplicationRef: null,
        provenance: "approved change ticket",
      },
    });

    await user.click(screen.getByRole("button", { name: "Disable target" }));
    expect(mocks.disable).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "staging",
      provider: "cloudflare",
      targetRowId: "target-row-1",
    });
  });

  it("shows live runtime blockers separately from artifact deploy readiness and marks containers optional", async () => {
    const user = userEvent.setup();
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    expect(await screen.findByText("NOT_READY")).toBeInTheDocument();
    expect(screen.getByText(/JOB_WORKFLOW, WORKER_APP/)).toBeInTheDocument();
    expect(screen.getByText(/Containers are only needed for workloads/)).toBeInTheDocument();
    expect(screen.getByText(/does not mean app traffic has moved from the Linux origin/)).toBeInTheDocument();
    expect(screen.queryByText(/JOB_CONTAINERS/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize and deploy to staging" })).not.toBeInTheDocument();
  });

  it("shows the staging activation action when the runtime probe is unavailable and preflight requires activation", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "UNAVAILABLE", checkedAt: "2026-10-22T00:00:00.000Z", activation: null, transport: "queues", missing: [], reason: "STAGING_READINESS_PROBE_UNAVAILABLE" };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ACTIVATION_PROFILE_REQUIRED", artifact: null, baseline: null };
    mocks.originConfiguration = {
      status: "STORED",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: true,
      descriptor: { nativeResources: { privateDatabase: { provisionJobId: "private-db-receipt" } } },
    };
    render(<AdminDeploymentTargets />);

    await chooseScope(user);

    expect(await screen.findByText("STAGING_READINESS_PROBE_UNAVAILABLE")).toBeInTheDocument();
    const activate = screen.getByRole("button", { name: "Enable minimum Staging Queue profile" });
    expect(activate).toBeEnabled();
    await user.click(activate);
    expect(mocks.activateStagingProfile).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "staging",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();
  });

  it("requires missing workflow secrets and never submits until both are supplied", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "UNAVAILABLE", checkedAt: "2026-10-22T00:00:00.000Z", missing: [], reason: "STAGING_READINESS_PROBE_UNAVAILABLE" };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ACTIVATION_PROFILE_REQUIRED", artifact: null, baseline: null };
    mocks.originConfiguration = {
      status: "STORED",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRuntimeTokenConfigured: false,
      controlPlaneTokenConfigured: false,
      descriptor: { nativeResources: { privateDatabase: { provisionJobId: "private-db-receipt" } } },
    };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    const activate = screen.getByRole("button", { name: "Enable minimum Staging Queue profile" });
    expect(activate).toBeDisabled();
    await user.type(screen.getByLabelText("Staging workflow runtime token"), "w".repeat(32));
    expect(activate).toBeDisabled();
    await user.type(screen.getByLabelText("Staging control-plane token"), "c".repeat(32));
    expect(activate).toBeEnabled();
    await user.click(activate);
    expect(mocks.activateStagingProfile).toHaveBeenCalledWith(expect.objectContaining({
      workflowRuntimeToken: "w".repeat(32),
      controlPlaneToken: "c".repeat(32),
    }));
  });

  it("does not activate expired configuration or configuration without a verified private database binding", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "NOT_DEPLOYED", checkedAt: "2026-10-22T00:00:00.000Z", missing: [], reason: "STAGING_READINESS_PROBE_UNAVAILABLE" };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ACTIVATION_PROFILE_REQUIRED", artifact: null, baseline: null };
    mocks.originConfiguration = {
      status: "EXPIRED",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: true,
      descriptor: { nativeResources: { privateDatabase: { provisionJobId: "private-db-receipt" } } },
    };
    const { rerender } = render(<AdminDeploymentTargets />);
    await chooseScope(user);
    expect(await screen.findByText("STAGING_ORIGIN_CONFIGURATION_EXPIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable minimum Staging Queue profile" })).toBeDisabled();

    mocks.originConfiguration = {
      status: "STORED",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: true,
      descriptor: {},
    };
    rerender(<AdminDeploymentTargets />);
    expect(await screen.findByText("STAGING_PRIVATE_DATABASE_BINDING_REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable minimum Staging Queue profile" })).toBeDisabled();

    mocks.originConfigurationError = true;
    mocks.stagingPreflight = { ready: false, reason: "STAGING_PRIVATE_DATABASE_RECEIPT_INVALID", artifact: null, baseline: null };
    rerender(<AdminDeploymentTargets />);
    expect(screen.getAllByText("STAGING_PRIVATE_DATABASE_RECEIPT_INVALID").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Enable minimum Staging Queue profile" })).toBeDisabled();
    expect(mocks.activateStagingProfile).not.toHaveBeenCalled();
  });

  it("refreshes targets, the newly bound configuration reference, and preflight after activation", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "UNAVAILABLE", checkedAt: "2026-10-22T00:00:00.000Z", missing: [], reason: "STAGING_READINESS_PROBE_UNAVAILABLE" };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ACTIVATION_PROFILE_REQUIRED", artifact: null, baseline: null };
    mocks.originConfiguration = {
      status: "STORED",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: true,
      descriptor: { nativeResources: { privateDatabase: { provisionJobId: "private-db-receipt" } } },
    };
    mocks.activationSucceeds = true;
    render(<AdminDeploymentTargets />);
    await chooseScope(user);
    await user.click(screen.getByRole("button", { name: "Enable minimum Staging Queue profile" }));

    await waitFor(() => expect(mocks.fetchTargets).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging" }));
    expect(mocks.fetchOriginConfiguration).toHaveBeenCalledWith({
      tenantId, projectId, environment: "staging", provider: "cloudflare", configurationRef: "cf-origin:new-reference",
    });
    expect(mocks.refetchStagingPreflight).toHaveBeenCalled();
    expect(mocks.refetchStagingRuntimeReadiness).toHaveBeenCalled();
  });

  it("surfaces owner authorization denial without bypassing the server or queueing deployment", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "UNAVAILABLE", checkedAt: "2026-10-22T00:00:00.000Z", missing: [], reason: "STAGING_READINESS_PROBE_UNAVAILABLE" };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ACTIVATION_PROFILE_REQUIRED", artifact: null, baseline: null };
    mocks.originConfiguration = {
      status: "STORED",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: true,
      descriptor: { nativeResources: { privateDatabase: { provisionJobId: "private-db-receipt" } } },
    };
    mocks.activationError = "CLOUDFLARE_STAGING_ACTIVE_TENANT_OWNER_REQUIRED";
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    await user.click(screen.getByRole("button", { name: "Enable minimum Staging Queue profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("CLOUDFLARE_STAGING_ACTIVE_TENANT_OWNER_REQUIRED");
    expect(mocks.activateStagingProfile).toHaveBeenCalledTimes(1);
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();
  });

  it("records a new target only after an explicit owner-entered submission", async () => {
    const user = userEvent.setup();
    render(<AdminDeploymentTargets />);
    await chooseScope(user);
    await user.click(screen.getByText("Record an explicitly approved Cloudflare target"));
    await user.type(screen.getByLabelText("Deployment target identity"), "approved-worker");
    await user.type(screen.getByLabelText("Cloudflare account ID (this target only)"), "dedicated-cf-account-123");
    await user.type(screen.getByLabelText("Approval or change provenance"), "change-123 approved by owner");
    await user.click(screen.getByRole("button", { name: "Record approved target" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "staging",
      provider: "cloudflare",
      deploymentTargetId: "approved-worker",
      accountRef: "dedicated-cf-account-123",
      workerRef: null,
      containerApplicationRef: null,
      provenance: "change-123 approved by owner",
    }));
  });

  it("allows exact production target metadata without exposing deploy or traffic activation", async () => {
    const user = userEvent.setup();
    const productionAccountRef = "a".repeat(32);
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(screen.getByText(/Production target metadata only records the exact deployment destination/i)).toBeInTheDocument();
    expect(screen.getByText(/does not create a deployment grant or enable a Worker/i)).toBeInTheDocument();
    expect(await screen.findByText("NOT_READY")).toBeInTheDocument();
    expect(screen.getByText(/HYPERDRIVE, JOB_QUEUE/)).toBeInTheDocument();
    expect(screen.getByText(/JOB_WORKFLOW, JOB_CONTAINERS, WORKER_APP, MEDIA_BUCKET, VECTOR_INDEX/)).toBeInTheDocument();
    expect(screen.getByText(/does not prove the approved artifact, retained-database access/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deploy|activate|change traffic/i })).not.toBeInTheDocument();

    await user.click(screen.getByText("Record an explicitly approved Cloudflare target"));
    await user.type(screen.getByLabelText("Deployment target identity"), "smartspec-cloudflare-runtime");
    await user.type(screen.getByLabelText("Cloudflare account ID (this target only)"), productionAccountRef);
    await user.type(screen.getByLabelText("Approval or change provenance"), "owner-approved production target record");
    await user.click(screen.getByRole("button", { name: "Record approved target" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "production",
      provider: "cloudflare",
      deploymentTargetId: "smartspec-cloudflare-runtime",
      accountRef: productionAccountRef,
      workerRef: null,
      containerApplicationRef: null,
      provenance: "owner-approved production target record",
    }));
  });

  it("surfaces an enabled-target conflict and blocks creation", async () => {
    const user = userEvent.setup();
    mocks.targets = [existingTarget, { ...existingTarget, id: "target-row-2", deploymentTargetId: "second-worker" }];
    render(<AdminDeploymentTargets />);
    await chooseScope(user);
    expect(await screen.findByText(/TARGET_AUTHORITY_CONFLICT/)).toBeInTheDocument();
    await user.click(screen.getByText("Record an explicitly approved Cloudflare target"));
    expect(screen.getByRole("button", { name: "Record approved target" })).toBeDisabled();
  });

  it("keeps creation disabled when the authenticated registry cannot be read", async () => {
    const user = userEvent.setup();
    mocks.targetsError = true;
    render(<AdminDeploymentTargets />);
    await chooseScope(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/authority state is unknown/i);
    await user.click(screen.getByText("Record an explicitly approved Cloudflare target"));
    expect(screen.getByRole("button", { name: "Record approved target" })).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("shows non-Cloudflare rows without offering Cloudflare-only mutations", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, provider: "linux" }];
    render(<AdminDeploymentTargets />);
    await chooseScope(user);
    expect(await screen.findByText(/Provider identity: linux/)).toBeInTheDocument();
    expect(screen.getByText("Cloudflare-only controls unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disable target" })).not.toBeInTheDocument();
    expect(mocks.disable).not.toHaveBeenCalled();
  });
});
