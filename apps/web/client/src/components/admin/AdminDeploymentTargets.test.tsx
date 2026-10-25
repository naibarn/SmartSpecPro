// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDeploymentTargets from "./AdminDeploymentTargets";
import { cloudflareStagingActivationInputSchema } from "@shared/cloudflareOriginIdentity";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  disable: vi.fn(),
  queueStagingDeploy: vi.fn(),
  prepareProductionQueue: vi.fn(),
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
  refetchProductionProviderInventory: vi.fn(),
  refetchLatestProductionQueueJob: vi.fn(),
  latestProductionQueueJob: null as Record<string, unknown> | null,
  productionQueues: [] as Array<Record<string, unknown>>,
  productionHyperdrives: [] as Array<Record<string, unknown>>,
  saveCredential: vi.fn(),
  revokeCredential: vi.fn(),
  probeCredential: vi.fn(),
  targets: [] as Array<Record<string, unknown>>,
  stagingTargets: [] as Array<Record<string, unknown>>,
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
      getCloudflareProductionProviderInventory: { invalidate: mocks.invalidate },
      getCloudflareProductionQueueJobStatus: { invalidate: mocks.invalidate },
      getLatestCloudflareProductionQueueJob: { invalidate: mocks.invalidate },
    } }),
    systemSettings: { listTenants: { useQuery: () => ({ data: [
      { id: "tenant-system", name: "System", selectorKind: "system" },
      { id: "tenant-codex-uat", name: "Codex UAT Isolated Tenant", selectorKind: "test" },
      { id: "tenant-ZCSKEM9s", name: "Tenant One", selectorKind: "operational" },
      { id: "tenant-smartaihub", name: "Production tenant", domain: "smartaihub.app", selectorKind: "operational" },
      { id: "tenant-inactive", name: "Former tenant", selectorKind: "inactive" },
    ] }) } },
    infrastructure: {
      listDeploymentTargetProjects: { useQuery: () => ({ data: [{ projectId: "2fe8a309-8be6-4370-9813-8fb9cc4645a0", title: "Wiki", projectType: "workspace" }] }) },
      listProviderDeploymentTargets: { useQuery: (input: { environment: string }) => ({ data: input.environment === "production" ? mocks.targets : (mocks.stagingTargets.length ? mocks.stagingTargets : mocks.targets), isLoading: false, isError: mocks.targetsError, isFetching: false }) },
      getCloudflareStagingDeployPreflight: { useQuery: () => ({ data: mocks.stagingPreflight, isLoading: false, isError: false, refetch: mocks.refetchStagingPreflight }) },
      getCloudflareOriginConfiguration: { useQuery: () => ({ data: mocks.originConfiguration, isLoading: false, isError: mocks.originConfigurationError, refetch: mocks.refetchStagingOriginConfiguration }) },
      getCloudflareStagingRuntimeReadiness: { useQuery: () => ({ data: mocks.stagingRuntime, isLoading: false, isFetching: false, isError: false, refetch: mocks.refetchStagingRuntimeReadiness }) },
      getCloudflareProductionRuntimeReadiness: { useQuery: () => ({ data: { status: "NOT_READY", checkedAt: "2026-10-22T00:00:00.000Z", environment: "production", activation: "disabled", transport: "queues", missing: ["HYPERDRIVE", "JOB_QUEUE"], unconfigured: ["HYPERDRIVE", "JOB_QUEUE", "JOB_WORKFLOW", "JOB_CONTAINERS", "WORKER_APP", "MEDIA_BUCKET", "VECTOR_INDEX"], applicationIngress: { enabled: false, ready: false, missing: ["CLOUDFLARE_APPLICATION_HTTP_TRAFFIC", "NODE_HTTP", "PYTHON_HTTP"] }, jobHandlerConfigured: false, reason: "CLOUDFLARE_PRODUCTION_WORKER_RUNTIME_NOT_READY" }, isLoading: false, isFetching: false, isError: false, refetch: mocks.refetchProductionRuntimeReadiness }) },
      getCloudflareProductionProviderInventory: { useQuery: () => ({ data: { status: "CHECKED", checkedAt: "2026-10-24T00:00:00.000Z",
        accountRef: "f3fb0b6858e186fcc36be105bfa00243",
        accessChecks: { queues: { httpStatus: 200, complete: true }, hyperdrive: { httpStatus: 200, complete: true }, zone: { httpStatus: 200, complete: true },
          routes: { httpStatus: 200, complete: true }, workerDeployments: { httpStatus: 200, complete: true }, workerVersions: [],
          vpcServices: { httpStatus: 403, complete: false } },
        originConfiguration: { status: "NOT_CONFIGURED", applicationHttpConfigured: false, applicationHttpReadyForRequests: false, queueProfileConfigured: false },
        productionDatabaseProvisioning: { checks: {
          hyperdrive: { httpStatus: 200, readable: true }, tunnel: { httpStatus: 200, readable: true },
          vpcServices: { httpStatus: 403, readable: false },
          containers: { httpStatus: 200, readable: true },
        }, permissionPacket: [
          { scope: "Account", permission: "Hyperdrive Edit", operations: ["POST /accounts/{account_id}/hyperdrive/configs"] },
          { scope: "Account", permission: "Connectivity Directory Admin", operations: ["POST /accounts/{account_id}/connectivity/directory/services"] },
          { scope: "Zone", permission: "Workers Routes Edit", operations: ["POST /zones/{zone_id}/workers/routes"] },
        ],
        conditionalPermissions: [{ scope: "Account", permission: "Cloudflare Tunnel Edit", condition: "only if the selected existing Tunnel must be changed" }] },
        queueInventoryComplete: true, queues: [...mocks.productionQueues, { name: "smartspec-staging-project-jobs", environment: "staging" }],
        hyperdriveInventoryComplete: true, hyperdrives: [...mocks.productionHyperdrives, { name: "smartspec-staging-project-db", environment: "staging" }],
        vpcServiceInventoryComplete: true, vpcServices: [{ id: "87654321-4321-4321-8321-cba987654321", name: "smartspec-staging-postgres", type: "tcp", appProtocol: "postgresql", tunnelId: "87654321-4321-4321-8321-cba987654321", environment: "staging" }],
        domainRoute: { inventoryComplete: true, attached: false, conflicting: false },
        worker: { deploymentInventoryComplete: true, deploymentCount: 1, activeVersionCount: 1,
          versions: [{ versionId: "11111111-1111-4111-8111-111111111111", percentage: 100, bindingNames: ["CLOUDFLARE_ACTIVATION"], containerNames: [], hasVerifiedReleaseIdentity: false, checked: true }] } },
        isLoading: false, isFetching: false, isError: false, refetch: mocks.refetchProductionProviderInventory }) },
      getCloudflareProductionQueueJobStatus: { useQuery: () => ({ data: null }) },
      getLatestCloudflareProductionQueueJob: { useQuery: () => ({ data: mocks.latestProductionQueueJob, refetch: mocks.refetchLatestProductionQueueJob }) },
      getDeploymentCredentialState: { useQuery: () => ({ data: { status: "CONFIGURED" }, isLoading: false, isError: false }) },
      createProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.create, isPending: false, error: null }) },
      updateProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.update, isPending: false, error: null }) },
      disableProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.disable, isPending: false, error: null }) },
      queueCloudflareStagingDeploy: { useMutation: () => ({ mutate: mocks.queueStagingDeploy, isPending: false, error: null }) },
      prepareCloudflareProductionQueue: { useMutation: (options: { onSuccess?: (result: { jobId: string }) => unknown }) => ({
        mutate: (input: unknown) => { mocks.prepareProductionQueue(input); void options.onSuccess?.({ jobId: "33333333-3333-4333-8333-333333333333" }); },
        isPending: false, error: null,
      }) },
      activateCloudflareStagingQueueProfile: { useMutation: (options: { onSuccess?: (result: { configurationRef: string }) => unknown }) => ({
        mutate: (input: unknown) => {
          mocks.activateStagingProfile(input);
          if (!cloudflareStagingActivationInputSchema.safeParse(input).success) return;
          if (mocks.activationSucceeds) void options.onSuccess?.({ configurationRef: "cf-origin:new-reference" });
        },
        isPending: false,
        error: mocks.activationError ? { message: mocks.activationError } : null,
      }) },
      saveDeploymentCredential: { useMutation: () => ({ mutate: mocks.saveCredential, isPending: false, error: null }) },
      revokeDeploymentCredential: { useMutation: () => ({ mutate: mocks.revokeCredential, isPending: false, error: null }) },
      probeCloudflareDeploymentCredential: { useMutation: (options: { onSuccess?: (result: unknown) => unknown }) => ({
        mutate: (input: unknown) => {
          mocks.probeCredential(input);
          void options.onSuccess?.({ checkedAt: "2026-10-24T00:00:00.000Z", accountId: "a".repeat(32), zoneId: "b".repeat(32), error: null,
            checks: [
              { id: "queues", label: "Queues", scope: "Account", permission: "Queues Read", status: "missing_permission", httpStatus: 403 },
              { id: "vpcServices", label: "Workers VPC services", scope: "Account", permission: "Connectivity Directory Read", status: "missing_permission", httpStatus: 403 },
            ] });
        }, isPending: false, error: null,
      }) },
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
    mocks.stagingTargets = [];
    mocks.targetsError = false;
    mocks.latestProductionQueueJob = null;
    mocks.productionQueues = [];
    mocks.productionHyperdrives = [];
    mocks.activationError = null;
    mocks.activationSucceeds = false;
    mocks.stagingPreflight = { ready: false, reason: "VERIFIED_ROLLBACK_BASELINE_UNAVAILABLE", artifact: null, baseline: null };
    mocks.stagingRuntime = { status: "NOT_READY", checkedAt: "2026-10-22T00:00:00.000Z", activation: "disabled", transport: "all", missing: ["JOB_WORKFLOW", "WORKER_APP"], jobHandlerConfigured: true, controlPlaneConfigured: false, reason: "CLOUDFLARE_WORKER_RUNTIME_NOT_READY" };
    mocks.originConfiguration = null;
    mocks.originConfigurationError = false;
  });

  it("defaults to active business tenants while preserving explicit access to other records", async () => {
    const user = userEvent.setup();
    render(<AdminDeploymentTargets />);
    const toggle = screen.getByRole("checkbox", { name: "Show test, system, and inactive tenants" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Showing 2 active business tenants; 3 test, system, or inactive records hidden.")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Authenticated tenant" }));
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByRole("option", { name: /Codex UAT|System|Former tenant/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(toggle);
    await user.click(screen.getByRole("combobox", { name: "Authenticated tenant" }));
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByRole("option", { name: /Codex UAT Isolated Tenant.*Test/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Former tenant.*Inactive/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Codex UAT Isolated Tenant/ }));
    await user.click(toggle);
    expect(screen.getByRole("combobox", { name: "Authenticated tenant" })).toHaveTextContent("Select tenant");
    expect(screen.getByRole("combobox", { name: "Canonical project" })).toBeDisabled();
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();
    expect(mocks.activateStagingProfile).not.toHaveBeenCalled();
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

  it("keeps the tenant and project scope selectors readable and gives project results room to scan", async () => {
    const user = userEvent.setup();
    render(<AdminDeploymentTargets />);

    const tenantSelector = screen.getByRole("combobox", { name: "Authenticated tenant" });
    const projectSelector = screen.getByRole("combobox", { name: "Canonical project" });
    expect(tenantSelector.parentElement).toHaveStyle({ flex: "1 1 22rem", minWidth: "min(100%, 22rem)" });
    expect(projectSelector.parentElement).toHaveStyle({ flex: "2 1 36rem", minWidth: "min(100%, 36rem)" });

    await chooseScope(user);
    await user.click(projectSelector);
    const search = await screen.findByPlaceholderText("Search project name or ID…");
    expect(search.closest('[data-slot="popover-content"]')).toHaveClass("w-[min(42rem,calc(100vw-2rem))]");
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

  it("probes the exact Production target credential and shows the permission to add", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime" }];
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    const check = await screen.findByRole("button", { name: "Check this target’s Cloudflare access" });
    await user.click(check);

    expect(mocks.probeCredential).toHaveBeenCalledWith({ tenantId, projectId, environment: "production", provider: "cloudflare" });
    expect(await screen.findByText("Queues Read")).toBeInTheDocument();
    expect(screen.getByText(/Cloudflare denied this required read request/)).toBeInTheDocument();
    expect(screen.getByText(/This is an account-member role, not a setting on the API token/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cloudflare: manage account member roles" })).toHaveAttribute(
      "href", "https://developers.cloudflare.com/fundamentals/manage-members/manage/",
    );
    expect(screen.getByText(/Use the exact account\/zone scopes in the consolidated Production permission packet below/)).toBeInTheDocument();
  });

  it("offers a clearly bounded one-time bootstrap when no Staging rollback deployment exists", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingPreflight = { ready: false, reason: "STAGING_BOOTSTRAP_REQUIRED",
      artifact: { artifactRef: `sha256:${"b".repeat(64)}`, sourceSha: "c".repeat(40), buildDigest: "b".repeat(64) }, baseline: null };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    expect(await screen.findByText(/This is the first Staging deployment/)).toBeInTheDocument();
    expect(screen.getByText(/allows one job, creates no production DNS or route changes/)).toBeInTheDocument();
    const bootstrap = screen.getByRole("button", { name: "Authorize one-time first Staging deployment" });
    expect(bootstrap).toBeEnabled();
    await user.click(bootstrap);
    expect(mocks.queueStagingDeploy).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging" });
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
    const activate = screen.getByRole("button", { name: "Prepare Staging with saved secrets" });
    expect(activate).toBeEnabled();
    await user.click(activate);
    expect(mocks.activateStagingProfile).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "staging",
      provider: "cloudflare",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();
  });

  it("offers automatic internal secret setup without asking the owner to supply tokens", async () => {
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

    const activate = screen.getByRole("button", { name: "Generate secrets and prepare Staging" });
    expect(activate).toBeEnabled();
    expect(screen.getByText(/You do not need to find or copy any tokens/)).toBeInTheDocument();
    expect(screen.getByLabelText("Staging workflow runtime token")).not.toBeVisible();
    await user.click(activate);
    expect(mocks.activateStagingProfile).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging", provider: "cloudflare",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(cloudflareStagingActivationInputSchema.safeParse(mocks.activateStagingProfile.mock.lastCall?.[0]).success).toBe(true);
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();

    mocks.activateStagingProfile.mockClear();
    await user.click(screen.getByText("Advanced: use existing internal secrets"));
    await user.type(screen.getByLabelText("Staging workflow runtime token"), "w".repeat(32));
    expect(screen.getByRole("button", { name: "Use supplied secrets and prepare Staging" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/two different secrets/);
    await user.type(screen.getByLabelText("Staging control-plane token"), "w".repeat(32));
    expect(screen.getByRole("button", { name: "Use supplied secrets and prepare Staging" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Staging control-plane token"));
    await user.type(screen.getByLabelText("Staging control-plane token"), "c".repeat(32));
    const manual = screen.getByRole("button", { name: "Use supplied secrets and prepare Staging" });
    expect(manual).toBeEnabled();
    await user.click(manual);
    expect(mocks.activateStagingProfile).toHaveBeenCalledWith(expect.objectContaining({
      provider: "cloudflare",
      workflowRuntimeToken: "w".repeat(32),
      controlPlaneToken: "c".repeat(32),
    }));
    await user.click(screen.getByRole("button", { name: "Use automatic setup instead" }));
    expect(screen.getByRole("button", { name: "Generate secrets and prepare Staging" })).toBeEnabled();
    expect(screen.getByLabelText("Staging workflow runtime token")).toHaveValue("");
    expect(screen.getByLabelText("Staging control-plane token")).toHaveValue("");
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
    expect(screen.getByRole("button", { name: "Prepare Staging with saved secrets" })).toBeDisabled();

    mocks.originConfiguration = {
      status: "STORED",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: true,
      descriptor: {},
    };
    rerender(<AdminDeploymentTargets />);
    expect(await screen.findByText("STAGING_PRIVATE_DATABASE_BINDING_REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare Staging with saved secrets" })).toBeDisabled();

    mocks.originConfigurationError = true;
    mocks.stagingPreflight = { ready: false, reason: "STAGING_PRIVATE_DATABASE_RECEIPT_INVALID", artifact: null, baseline: null };
    rerender(<AdminDeploymentTargets />);
    expect(screen.getAllByText("STAGING_PRIVATE_DATABASE_RECEIPT_INVALID").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Prepare Staging with saved secrets" })).toBeDisabled();
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
    await user.click(screen.getByRole("button", { name: "Prepare Staging with saved secrets" }));

    await waitFor(() => expect(mocks.fetchTargets).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging" }));
    expect(screen.getByText(/Staging settings saved\. Continue with/)).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Prepare Staging with saved secrets" }));

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

  it("prepares the production target from verified Staging metadata with one explicit confirmation", async () => {
    const user = userEvent.setup();
    const productionAccountRef = "a".repeat(32);
    mocks.stagingTargets = [{ ...stagingActivationTarget, accountRef: productionAccountRef }];
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(screen.getByText(/Production preparation will reuse the verified Staging account/i)).toBeInTheDocument();
    expect(screen.getByText(/creates only the destination record/i)).toBeInTheDocument();
    expect(await screen.findByText("Jobs not ready")).toBeInTheDocument();
    expect(screen.getByText("Website/API ingress not ready")).toBeInTheDocument();
    expect(screen.getByText("CLOUDFLARE_APPLICATION_HTTP_TRAFFIC")).toBeInTheDocument();
    expect(screen.getByText("NODE_HTTP")).toBeInTheDocument();
    expect(screen.getByText("PYTHON_HTTP")).toBeInTheDocument();
    expect(screen.getByText(/Connect the existing PostgreSQL database through Cloudflare Hyperdrive/)).toBeInTheDocument();
    expect(screen.getByText(/Bind the production Cloudflare Queue used by background jobs/)).toBeInTheDocument();
    expect(screen.getByText(/JOB_WORKFLOW, JOB_CONTAINERS, WORKER_APP, MEDIA_BUCKET, VECTOR_INDEX/)).toBeInTheDocument();
    expect(screen.getByText(/does not prove the approved artifact, retained-database access/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deploy|activate|change traffic/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("smartspec-cloudflare-runtime")).toHaveLength(2);
    expect(screen.getByText(productionAccountRef)).toBeInTheDocument();
    expect(screen.getByText(/No secret is copied from Staging/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm and prepare Production destination" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "production",
      provider: "cloudflare",
      deploymentTargetId: "smartspec-cloudflare-runtime",
      accountRef: productionAccountRef,
      workerRef: "smartspec-cloudflare-runtime",
      containerApplicationRef: null,
      provenance: expect.stringMatching(/^Production destination confirmed by admin /),
    }));
  });

  it("shows the real Production resource and rollback blockers instead of sending the user back to Staging", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(await screen.findByText(/Not provisioned\. Only Staging exists \(smartspec-staging-project-jobs\)/)).toBeInTheDocument();
    expect(screen.getByText(/Not provisioned\. Only Staging exists \(smartspec-staging-project-db\)/)).toBeInTheDocument();
    expect(screen.getByText(/Not provisioned\. Only Staging exists \(smartspec-staging-postgres\)/)).toBeInTheDocument();
    expect(screen.getByText(/Production currently has no origin\/runtime configuration/)).toBeInTheDocument();
    expect(screen.getByText(/Not configured or bound in the active Worker version/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be used as a rollback baseline/i)).toBeInTheDocument();
    expect(screen.getByText(/The exact smartaihub\.app\/\* Worker Route is not attached/i)).toBeInTheDocument();
    expect(screen.getByText(/PostgreSQL will use a Workers VPC TCP service over the existing private Tunnel/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Cloudflare API Tokens only if a write operation reports a missing scope" }))
      .toHaveAttribute("href", "https://dash.cloudflare.com/profile/api-tokens");
    expect(screen.getByText(/TLS certificate chain accepted by Workers VPC/i)).toBeInTheDocument();
    expect(screen.getByText(/verify_ca or replace it with a publicly trusted/i)).toBeInTheDocument();
    const prepareQueue = screen.getByRole("button", { name: "Prepare Production Queue" });
    expect(prepareQueue).toBeEnabled();
    await user.click(prepareQueue);
    await waitFor(() => expect(mocks.prepareProductionQueue).toHaveBeenCalledWith({ tenantId, projectId, environment: "production" }));
    await user.click(screen.getByRole("button", { name: "Check this target’s Cloudflare access" }));
    expect(screen.getByText(/This is an account-member role, not a setting on the API token/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Connectivity Directory Admin/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Cloudflare: manage account member roles" })).toHaveAttribute("href", "https://developers.cloudflare.com/fundamentals/manage-members/manage/");
    expect(screen.queryByRole("button", { name: /approve|deploy|cutover/i })).not.toBeInTheDocument();
  });

  it("does not tell the admin to repeat Queue setup after Production Queue and DLQ are verified", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.productionQueues = [
      { name: "smartspec-canonical-job-queue-production", environment: "production" },
      { name: "smartspec-canonical-job-queue-production-dlq", environment: "production" },
    ];
    mocks.latestProductionQueueJob = { jobId: "b2b989d0-3476-4e04-afa6-f55a31add909", status: "succeeded",
      attempt: 1, maxAttempts: 3, createdAt: "2026-10-24T18:43:44.497Z", startedAt: "2026-10-24T18:43:45.826Z",
      finishedAt: "2026-10-24T18:43:46.971Z", scheduledAt: null, nextRetryAt: null, leaseExpiresAt: null, heartbeatAt: null,
      errorCode: null, queueName: "smartspec-canonical-job-queue-production", deadLetterQueueName: "smartspec-canonical-job-queue-production-dlq" };
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(await screen.findByText(/Production Queue and dead-letter queue are verified\. Do not run Queue preparation again/i)).toBeInTheDocument();
    expect(screen.getByText(/Remaining Production setup: Production Hyperdrive for the retained PostgreSQL host/i)).toBeInTheDocument();
    expect(screen.queryByText(/Remaining Production setup:.*Production Queue and dead-letter queue/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Production Queue/ })).not.toBeInTheDocument();
  });

  it("shows exact missing Production database read scopes and consolidated provisioning permissions", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(await screen.findByText(/Production PostgreSQL connection setup/i)).toBeInTheDocument();
    expect(screen.getByText(/Connectivity Directory → Read/)).toBeInTheDocument();
    expect(screen.getByText(/Connectivity Directory Admin/)).toBeInTheDocument();
    expect(screen.queryByText(/Connectivity Directory Bind/)).not.toBeInTheDocument();
    expect(screen.getByText(/Hyperdrive Edit/)).toBeInTheDocument();
    expect(screen.getByText(/Workers Routes Edit/)).toBeInTheDocument();
  });

  it("recovers and follows the latest canonical Production Queue job after a page reload", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.latestProductionQueueJob = { jobId: "eb327c34-44f5-462f-98f2-0e40065ce6aa", status: "queued",
      attempt: 1, maxAttempts: 3, createdAt: "2026-10-24T16:30:00.000Z", startedAt: null,
      finishedAt: null, scheduledAt: null, nextRetryAt: null, leaseExpiresAt: null, heartbeatAt: null,
      errorCode: null, queueName: null, deadLetterQueueName: null };
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(await screen.findByText("eb327c34-44f5-462f-98f2-0e40065ce6aa")).toBeInTheDocument();
    expect(screen.getByText(/Attempt: 1\/3/)).toBeInTheDocument();
    expect(screen.getByText(/waiting for a worker claim/i)).toBeInTheDocument();
    expect(mocks.prepareProductionQueue).not.toHaveBeenCalled();
  });

  it("allows exactly one fresh Production Queue job after the previous job expires", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.latestProductionQueueJob = { jobId: "eb327c34-44f5-462f-98f2-0e40065ce6aa", status: "expired",
      attempt: 1, maxAttempts: 3, createdAt: "2026-10-24T16:43:26.688Z", startedAt: null,
      finishedAt: "2026-10-24T16:50:25.015Z", scheduledAt: null, nextRetryAt: null, leaseExpiresAt: null, heartbeatAt: null,
      errorCode: "JOB_DEADLINE_EXPIRED", queueName: null, deadLetterQueueName: null };
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(await screen.findByText("eb327c34-44f5-462f-98f2-0e40065ce6aa")).toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: "Retry Production Queue setup" });
    expect(retry).toBeEnabled();
    await user.click(retry);
    await waitFor(() => expect(mocks.prepareProductionQueue).toHaveBeenCalledTimes(1));
    expect(mocks.prepareProductionQueue).toHaveBeenCalledWith({ tenantId, projectId, environment: "production" });
  });

  it("does not guess a production account when no enabled Staging target can establish it", async () => {
    const user = userEvent.setup();
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(screen.getByRole("alert")).toHaveTextContent(/will not guess an account ID/i);
    expect(screen.getByRole("button", { name: "Confirm and prepare Production destination" })).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
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
