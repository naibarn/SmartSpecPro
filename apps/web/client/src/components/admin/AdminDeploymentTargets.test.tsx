// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDeploymentTargets from "./AdminDeploymentTargets";
import { cloudflareStagingActivationInputSchema } from "@shared/cloudflareOriginIdentity";
vi.mock("./CloudflareImagePublication", () => ({ CloudflareImagePublication: () => null }));
vi.mock("./CloudflareMigrationPreparation", () => ({ CloudflareMigrationPreparation: () => null }));

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  tenantListQuery: null as any,
  create: vi.fn(),
  update: vi.fn(),
  disable: vi.fn(),
  queueStagingDeploy: vi.fn(),
  queueStagingDatabaseRenewal: vi.fn(),
  stagingRenewalSubmissionFailure: null as Error | null,
  finalizeStagingDatabaseRenewal: vi.fn(),
  stagingDatabaseRenewal: null as any,
  stagingRenewalJobStatus: null as any,
  stagingRenewalFetching: false,
  prepareProductionQueue: vi.fn(),
  prepareProductionDatabase: vi.fn(),
  resumeProductionDatabase: vi.fn(),
  ingressPreflight: null as any,
  ingressJob: null as any,
  migrationMission: { migrationMode: "FIRST_MIGRATION", state: "M3_IN_PROGRESS", currentMilestone: "M3",
    nextOperation: "QUEUE_RECOVERY_ACCEPTANCE", campaignAuthority: "NOT_AUTHORIZED",
    milestones: { m1: "ACCEPTED", m2: "ACCEPTED", application: "ACCEPTED", workerDeployment: "VERIFIED",
      boundedRuntime: "ACCEPTED", creditBilling: "ACCEPTED", queueRecovery: "INCOMPLETE", m3: "INCOMPLETE",
      nativeActivation: "NOT_VERIFIED", finalProductionCutover: "NOT_VERIFIED" } } as any,
  queueProductionIngress: vi.fn(),
  queueProductionWorkerCanary: vi.fn(),
  migrationMandatePlan: { ready: false, reason: "MIGRATION_MANDATE_TEST_BLOCKED", plan: null } as any,
  migrationMandate: { mandate: null } as any,
  enrollMigrationMandate: vi.fn(),
  changeMigrationMandate: vi.fn(),
  productionWorkerCanaryPreflight: null as any,
  productionWorkerCanaryJob: null as any,
  productionWorkerCanaryJobError: false,
  verifyIngressBrowser:vi.fn(async()=>({passed:true})),
  databaseAdmissionUnknownOnce: false,
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
  refetchStagingDatabaseRenewal: vi.fn(),
  cancelStagingDatabaseRenewal: vi.fn(),
  refetchStagingOriginConfiguration: vi.fn(),
  refetchProductionRuntimeReadiness: vi.fn(),
  refetchProductionProviderInventory: vi.fn(),
  refetchLatestProductionQueueJob: vi.fn(),
  latestProductionQueueJob: null as Record<string, unknown> | null,
  latestProductionDatabaseJob: null as Record<string, unknown> | null,
  productionQueues: [] as Array<Record<string, unknown>>,
  productionHyperdrives: [] as Array<Record<string, unknown>>,
  productionTunnels: [{ id: "87654321-4321-4321-8321-cba987654321", name: "smartaihub-postgres", status: "healthy" }] as Array<Record<string, unknown>>,
  tunnelInventoryComplete: true,
  productionInventoryStatus: "CHECKED" as "CHECKED" | "PARTIAL",
  workerDeploymentsComplete: true,
  workerVersionChecks: [] as Array<{ httpStatus: number | null; complete: boolean }>,
  databaseHyperdriveReadable: true,
  databaseTunnelReadable: true,
  databaseVpcReadable: false,
  databaseVpcs: [] as Array<Record<string, unknown>>,
  saveCredential: vi.fn(),
  bindPlatformCredential: vi.fn(),
  revokeCredential: vi.fn(),
  probeCredential: vi.fn(),
  targets: [] as Array<Record<string, unknown>>,
  stagingTargets: [] as Array<Record<string, unknown>>,
  targetsError: false,
  deploymentCredentialState: { status: "CONFIGURED", savedAt: "2026-10-24T09:30:49.037Z" } as Record<string, unknown>,
}));

vi.mock("@/lib/cloudflareIngressAcceptance",()=>({verifyCloudflareIngressInBrowser:mocks.verifyIngressBrowser}));

vi.mock("wouter", () => ({ useLocation: () => ["/admin/settings", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ infrastructure: {
      listProviderDeploymentTargets: { invalidate: mocks.invalidate, fetch: mocks.fetchTargets },
      getDeploymentCredentialState: { invalidate: mocks.invalidate },
      getCloudflareStagingDeployPreflight: { invalidate: mocks.invalidate },
      getCloudflareStagingRuntimeReadiness: { invalidate: mocks.invalidate },
      getCloudflareOriginConfiguration: { invalidate: mocks.invalidate, fetch: mocks.fetchOriginConfiguration },
      getCloudflareStagingPrivateDatabaseRenewalPreflight: { invalidate: mocks.invalidate, cancel: mocks.cancelStagingDatabaseRenewal },
      getCloudflareStagingPrivateDatabaseRenewalJobStatus: { invalidate: mocks.invalidate },
      getCloudflareProductionRuntimeReadiness: { invalidate: mocks.invalidate },
      getCloudflareProductionProviderInventory: { invalidate: mocks.invalidate },
      getCloudflareProductionQueueJobStatus: { invalidate: mocks.invalidate },
      getLatestCloudflareProductionQueueJob: { invalidate: mocks.invalidate },
      getLatestCloudflareProductionDatabaseJob: { invalidate: mocks.invalidate },
      getCloudflareProductionWorkerCanaryPreflight: { invalidate: mocks.invalidate },
      getLatestCloudflareProductionWorkerCanaryJob: { invalidate: mocks.invalidate },
      getCloudflareHttpCandidatePreparation: { invalidate: mocks.invalidate },
      getCloudflareHttpRuntimeOperation: { invalidate: mocks.invalidate },
    } }),
    systemSettings: { listTenants: { useQuery: () => mocks.tenantListQuery } },
    infrastructure: {
      listDeploymentTargetProjects: { useQuery: () => ({ data: [{ projectId: "2fe8a309-8be6-4370-9813-8fb9cc4645a0", title: "Wiki", projectType: "workspace" }] }) },
      listProviderDeploymentTargets: { useQuery: (input: { environment: string }) => ({ data: input.environment === "production" ? mocks.targets : (mocks.stagingTargets.length ? mocks.stagingTargets : mocks.targets), isLoading: false, isError: mocks.targetsError, isFetching: false }) },
      getCloudflareStagingDeployPreflight: { useQuery: () => ({ data: mocks.stagingPreflight, isLoading: false, isError: false, refetch: mocks.refetchStagingPreflight }) },
      getCloudflareOriginConfiguration: { useQuery: () => ({ data: mocks.originConfiguration, isLoading: false, isError: mocks.originConfigurationError, refetch: mocks.refetchStagingOriginConfiguration }) },
      getCloudflareStagingPrivateDatabaseRenewalPreflight: { useQuery: () => ({ data: mocks.stagingDatabaseRenewal,
        isLoading: mocks.stagingRenewalFetching && !mocks.stagingDatabaseRenewal,
        isFetching: mocks.stagingRenewalFetching, isError: false, refetch: mocks.refetchStagingDatabaseRenewal }) },
      getCloudflareStagingPrivateDatabaseRenewalJobStatus: { useQuery: () => mocks.stagingRenewalJobStatus ?? ({ data: null,
        isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }) },
      getCloudflareStagingRuntimeReadiness: { useQuery: () => ({ data: mocks.stagingRuntime, isLoading: false, isFetching: false, isError: false, refetch: mocks.refetchStagingRuntimeReadiness }) },
      getCloudflareProductionRuntimeReadiness: { useQuery: () => ({ data: { status: "NOT_READY", checkedAt: "2026-10-22T00:00:00.000Z", environment: "production", activation: "disabled", transport: "queues", missing: ["HYPERDRIVE", "JOB_QUEUE"], unconfigured: ["HYPERDRIVE", "JOB_QUEUE", "JOB_WORKFLOW", "JOB_CONTAINERS", "WORKER_APP", "MEDIA_BUCKET", "VECTOR_INDEX"], applicationIngress: { enabled: false, ready: false, missing: ["CLOUDFLARE_APPLICATION_HTTP_TRAFFIC", "NODE_HTTP", "PYTHON_HTTP"] }, jobHandlerConfigured: false, reason: "CLOUDFLARE_PRODUCTION_WORKER_RUNTIME_NOT_READY" }, isLoading: false, isFetching: false, isError: false, refetch: mocks.refetchProductionRuntimeReadiness }) },
      getCloudflareProductionProviderInventory: { useQuery: () => ({ data: { status: mocks.productionInventoryStatus, checkedAt: "2026-10-24T00:00:00.000Z",
        accountRef: "f3fb0b6858e186fcc36be105bfa00243",
        accessChecks: { queues: { httpStatus: 200, complete: true }, hyperdrive: { httpStatus: mocks.databaseHyperdriveReadable ? 200 : 403, complete: mocks.databaseHyperdriveReadable }, zone: { httpStatus: 200, complete: true },
          routes: { httpStatus: 200, complete: true }, workerDeployments: { httpStatus: mocks.workerDeploymentsComplete ? 200 : null, complete: mocks.workerDeploymentsComplete }, workerVersions: mocks.workerVersionChecks,
          tunnels: { httpStatus: mocks.databaseTunnelReadable && mocks.tunnelInventoryComplete ? 200 : 403, complete: mocks.databaseTunnelReadable && mocks.tunnelInventoryComplete }, vpcServices: { httpStatus: mocks.databaseVpcReadable ? 200 : 403, complete: mocks.databaseVpcReadable } },
        originConfiguration: { status: "NOT_CONFIGURED", applicationHttpConfigured: false, applicationHttpReadyForRequests: false, queueProfileConfigured: false },
        productionDatabaseProvisioning: { checks: {
          hyperdrive: { httpStatus: mocks.databaseHyperdriveReadable ? 200 : 403, readable: mocks.databaseHyperdriveReadable }, tunnel: { httpStatus: mocks.databaseTunnelReadable ? 200 : 403, readable: mocks.databaseTunnelReadable },
          vpcServices: { httpStatus: mocks.databaseVpcReadable ? 200 : 403, readable: mocks.databaseVpcReadable },
          containers: { httpStatus: 200, readable: true },
        }, permissionPacket: [
          { scope: "Account", permission: "Hyperdrive Edit", operations: ["POST /accounts/{account_id}/hyperdrive/configs"] },
          { scope: "Account", permission: "Connectivity Directory Admin", operations: ["POST /accounts/{account_id}/connectivity/directory/services"] },
          { scope: "Zone", permission: "Workers Routes Edit", operations: ["POST /zones/{zone_id}/workers/routes"] },
        ],
        conditionalPermissions: [{ scope: "Account", permission: "Cloudflare Tunnel Edit", condition: "only if the selected existing Tunnel must be changed" }] },
        queueInventoryComplete: true, queues: [...mocks.productionQueues, { name: "smartspec-staging-project-jobs", environment: "staging" }],
        tunnelInventoryComplete: mocks.tunnelInventoryComplete,
        tunnels: mocks.productionTunnels,
        hyperdriveInventoryComplete: mocks.databaseHyperdriveReadable, hyperdrives: [...mocks.productionHyperdrives, { name: "smartspec-staging-project-db", environment: "staging" }],
        vpcServiceInventoryComplete: mocks.databaseVpcReadable, vpcServices: [...mocks.databaseVpcs, { id: "87654321-4321-4321-8321-cba987654321", name: "smartspec-staging-postgres", type: "tcp", appProtocol: "postgresql", tunnelId: "87654321-4321-4321-8321-cba987654321", environment: "staging" }],
        domainRoute: { inventoryComplete: true, attached: false, conflicting: false },
        worker: { deploymentInventoryComplete: true, deploymentCount: 1, activeVersionCount: 1,
          versions: [{ versionId: "11111111-1111-4111-8111-111111111111", percentage: 100, bindingNames: ["CLOUDFLARE_ACTIVATION"], containerNames: [], hasVerifiedReleaseIdentity: false, checked: true }] } },
        isLoading: false, isFetching: false, isError: false, refetch: mocks.refetchProductionProviderInventory }) },
      getCloudflareProductionQueueJobStatus: { useQuery: () => ({ data: null }) },
      getLatestCloudflareProductionQueueJob: { useQuery: () => ({ data: mocks.latestProductionQueueJob, refetch: mocks.refetchLatestProductionQueueJob }) },
      getLatestCloudflareProductionDatabaseJob: { useQuery: () => ({ data: mocks.latestProductionDatabaseJob, refetch: mocks.refetchProductionProviderInventory }) },
      getDeploymentCredentialState: { useQuery: () => ({ data: mocks.deploymentCredentialState, isLoading: false, isError: false }) },
      createProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.create, isPending: false, error: null }) },
      updateProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.update, isPending: false, error: null }) },
      disableProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.disable, isPending: false, error: null }) },
      queueCloudflareStagingDeploy: { useMutation: () => ({ mutate: mocks.queueStagingDeploy,
        mutateAsync: async (input: unknown) => { mocks.queueStagingDeploy(input); return { jobId: "88888888-8888-4888-8888-888888888888" }; }, isPending: false, error: null }) },
      queueCloudflareStagingPrivateDatabaseRenewal: { useMutation: (options: { onSuccess?: (result: { jobId: string }) => unknown }) => ({
        mutate: (input: unknown) => { mocks.queueStagingDatabaseRenewal(input); void options.onSuccess?.({ jobId: "77777777-7777-4777-8777-777777777777" }); },
        mutateAsync: async (input: unknown) => { mocks.queueStagingDatabaseRenewal(input); if (mocks.stagingRenewalSubmissionFailure) throw mocks.stagingRenewalSubmissionFailure; await options.onSuccess?.({ jobId: "77777777-7777-4777-8777-777777777777" }); return { jobId: "77777777-7777-4777-8777-777777777777" }; },
        isPending: false, error: null,
      }) },
      finalizeCloudflareStagingPrivateDatabaseRenewal: { useMutation: (options: { onSuccess?: (result: { configurationRef: string }) => unknown }) => ({
        mutate: (input: unknown) => { mocks.finalizeStagingDatabaseRenewal(input); void options.onSuccess?.({ configurationRef: "cf-origin:new-renewed-configuration" }); },
        mutateAsync: async (input: unknown) => { mocks.finalizeStagingDatabaseRenewal(input); await options.onSuccess?.({ configurationRef: "cf-origin:new-renewed-configuration" }); return { configurationRef: "cf-origin:new-renewed-configuration" }; },
        isPending: false, error: null,
      }) },
      prepareCloudflareProductionQueue: { useMutation: (options: { onSuccess?: (result: { jobId: string }) => unknown }) => ({
        mutate: (input: unknown) => { mocks.prepareProductionQueue(input); void options.onSuccess?.({ jobId: "33333333-3333-4333-8333-333333333333" }); },
        isPending: false, error: null,
      }) },
      prepareCloudflareProductionDatabase: { useMutation: (options: {
        onSuccess?: (result: { jobId: string }, variables: { submissionId: string; tunnelId: string }) => unknown;
        onError?: (error: { message: string; data: { code: string; traceId: string } }, variables: { submissionId: string; tunnelId: string }) => unknown;
      }) => ({
        mutate: (input: { submissionId: string; tunnelId: string }) => {
          mocks.prepareProductionDatabase(input);
          if (mocks.databaseAdmissionUnknownOnce) {
            mocks.databaseAdmissionUnknownOnce = false;
            void options.onError?.({ message: "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN",
              data: { code: "INTERNAL_SERVER_ERROR", traceId: "request-trace-1" } }, input);
            return;
          }
          void options.onSuccess?.({ jobId: "44444444-4444-4444-8444-444444444444" }, input);
        },
        isPending: false, error: null,
      }) },
      getCloudflareProductionIngressPreflight: {useQuery:()=>({data:mocks.ingressPreflight,isLoading:false,refetch:vi.fn()})},
      getCloudflareMigrationMission: {useQuery:()=>({data:mocks.migrationMission,refetch:vi.fn()})},
      getCloudflareMigrationMandatePlan: {useQuery:()=>({data:mocks.migrationMandatePlan,isLoading:false,isFetching:false,isError:false,refetch:vi.fn()})},
      getCloudflareMigrationMandate: {useQuery:()=>({data:mocks.migrationMandate,isLoading:false,isFetching:false,isError:false,refetch:vi.fn()})},
      getCloudflareMigrationMandateHistory: {useQuery:()=>({data:{authorizations:[],execution:[]},isLoading:false,isError:false})},
      enrollCloudflareMigrationMandate: {useMutation:(options:{onSuccess?:()=>unknown;onError?:()=>unknown})=>({
        mutate:(input:unknown)=>{mocks.enrollMigrationMandate(input);},isPending:false,error:null})},
      changeCloudflareMigrationMandate: {useMutation:()=>({mutate:mocks.changeMigrationMandate,isPending:false,error:null})},
      getLatestCloudflareProductionIngressJob: {useQuery:()=>({data:mocks.ingressJob,refetch:vi.fn()})},
      getCloudflareProductionWorkerCanaryPreflight: {useQuery:()=>({data:mocks.productionWorkerCanaryPreflight,isLoading:false,isFetching:false,isError:false,refetch:vi.fn()})},
      getLatestCloudflareProductionWorkerCanaryJob: {useQuery:()=>({data:mocks.productionWorkerCanaryJob,isLoading:false,isError:mocks.productionWorkerCanaryJobError,
        error:{message:"PRODUCTION_WORKER_CANARY_JOB_READ_UNAVAILABLE"},refetch:vi.fn()})},
      getCloudflareHttpCandidatePreparation: {useQuery:()=>({data:{preflight:{ready:false},job:null},isLoading:false,isError:false,refetch:vi.fn()})},
      getCloudflareHttpRuntimeOperation: {useQuery:()=>({data:{job:null},isLoading:false,isError:false,refetch:vi.fn()})},
      queueCloudflareProductionWorkerCanary: {useMutation:()=>({isPending:false,mutate:mocks.queueProductionWorkerCanary,error:null})},
      getCloudflareProductionIngressRollbackPreflight: {useQuery:()=>({data:null,refetch:vi.fn()})},
      queueCloudflareProductionIngress: {useMutation:()=>({isPending:false,mutate:mocks.queueProductionIngress,error:null})},
      resumeExpiredCloudflareProductionDatabaseJob: { useMutation: (options: { onSuccess?: (result: { jobId: string }) => unknown }) => ({
        mutate: (input: unknown) => { mocks.resumeProductionDatabase(input); void options.onSuccess?.({ jobId: "b9ca8316-1604-4764-a769-d92f46e4c823" }); },
        isPending: false, error: null,
      }) },
      activateCloudflareStagingQueueProfile: { useMutation: (options: { onSuccess?: (result: { configurationRef: string }) => unknown }) => ({
        mutate: (input: unknown) => {
          mocks.activateStagingProfile(input);
          if (!cloudflareStagingActivationInputSchema.safeParse(input).success) return;
          if (mocks.activationSucceeds) void options.onSuccess?.({ configurationRef: "cf-origin:new-reference" });
        },
        mutateAsync: async (input: unknown) => {
          mocks.activateStagingProfile(input);
          if (!cloudflareStagingActivationInputSchema.safeParse(input).success) throw new Error("INVALID_INPUT");
          if (mocks.activationError) throw new Error(mocks.activationError);
          if (mocks.activationSucceeds) await options.onSuccess?.({ configurationRef: "cf-origin:new-reference" });
          return { configurationRef: "cf-origin:new-reference" };
        },
        isPending: false,
        error: mocks.activationError ? { message: mocks.activationError } : null,
      }) },
      saveDeploymentCredential: { useMutation: () => ({ mutate: mocks.saveCredential, isPending: false, error: null }) },
      bindPlatformCloudflareCredentialProfile: { useMutation: (options: { onSuccess?: () => unknown }) => ({
        mutate: (input: unknown) => { mocks.bindPlatformCredential(input); void options.onSuccess?.(); }, isPending: false, error: null,
      }) },
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
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.tenantListQuery = { data: [
      { id: "tenant-system", name: "System", selectorKind: "system" },
      { id: "tenant-codex-uat", name: "Codex UAT Isolated Tenant", selectorKind: "test" },
      { id: "tenant-ZCSKEM9s", name: "Tenant One", selectorKind: "operational" },
      { id: "tenant-smartaihub", name: "Production tenant", domain: "smartaihub.app", selectorKind: "operational" },
      { id: "tenant-inactive", name: "Former tenant", selectorKind: "inactive" },
    ], isLoading: false, isSuccess: true, isError: false, isFetching: false, refetch: vi.fn() };
    mocks.targets = [];
    mocks.stagingTargets = [];
    mocks.stagingRenewalFetching = false;
    mocks.targetsError = false;
    mocks.deploymentCredentialState = { status: "CONFIGURED", savedAt: "2026-10-24T09:30:49.037Z" };
    mocks.latestProductionQueueJob = null;
    mocks.latestProductionDatabaseJob = null;
    mocks.ingressPreflight = null;
    mocks.ingressJob = null;
    mocks.productionWorkerCanaryPreflight = null;
    mocks.productionWorkerCanaryJob = null;
    mocks.productionWorkerCanaryJobError = false;
    mocks.migrationMission = { migrationMode: "FIRST_MIGRATION", state: "M3_IN_PROGRESS", currentMilestone: "M3",
      nextOperation: "QUEUE_RECOVERY_ACCEPTANCE", campaignAuthority: "NOT_AUTHORIZED",
      milestones: { m1: "ACCEPTED", m2: "ACCEPTED", application: "ACCEPTED", workerDeployment: "VERIFIED",
        boundedRuntime: "ACCEPTED", creditBilling: "ACCEPTED", queueRecovery: "INCOMPLETE", m3: "INCOMPLETE",
        nativeActivation: "NOT_VERIFIED", finalProductionCutover: "NOT_VERIFIED" } };
    mocks.migrationMandatePlan = { ready: false, reason: "MIGRATION_MANDATE_TEST_BLOCKED", plan: null };
    mocks.migrationMandate = { mandate: null };
    mocks.productionQueues = [];
    mocks.productionHyperdrives = [];
    mocks.productionTunnels = [{ id: "87654321-4321-4321-8321-cba987654321", name: "smartaihub-postgres", status: "healthy" }];
    mocks.tunnelInventoryComplete = true;
    mocks.productionInventoryStatus = "CHECKED";
    mocks.workerDeploymentsComplete = true;
    mocks.workerVersionChecks = [];
    mocks.databaseHyperdriveReadable = true;
    mocks.databaseTunnelReadable = true;
    mocks.databaseVpcReadable = false;
    mocks.databaseVpcs = [];
    mocks.databaseAdmissionUnknownOnce = false;
    mocks.activationError = null;
    mocks.activationSucceeds = false;
    mocks.stagingPreflight = { ready: false, reason: "VERIFIED_ROLLBACK_BASELINE_UNAVAILABLE", artifact: null, baseline: null };
    mocks.stagingRuntime = { status: "NOT_READY", checkedAt: "2026-10-22T00:00:00.000Z", activation: "disabled", transport: "all", missing: ["JOB_WORKFLOW", "WORKER_APP"], jobHandlerConfigured: true, controlPlaneConfigured: false, reason: "CLOUDFLARE_WORKER_RUNTIME_NOT_READY" };
  mocks.originConfiguration = null;
    mocks.stagingDatabaseRenewal = null;
    mocks.refetchStagingDatabaseRenewal.mockReset();
  mocks.queueStagingDatabaseRenewal.mockReset();
  mocks.stagingRenewalSubmissionFailure = null;
  mocks.finalizeStagingDatabaseRenewal.mockReset();
    mocks.originConfigurationError = false;
  });

  it("puts the current M3 milestone first and keeps detailed provider history under advanced diagnostics", async () => {
    const user = userEvent.setup();
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);
    expect(screen.getByRole("region", { name: "Cloudflare migration control center" })).toHaveTextContent("Current milestone: M3");
    expect(screen.getByRole("region", { name: "Cloudflare migration control center" })).toHaveTextContent("Next action: Run Queue/Recovery acceptance");
    expect(screen.getByRole("link", { name: "Continue the current M3 step" })).toHaveAttribute("href", "#cloudflare-m3-runtime-operation");
    expect(screen.getByText("Verified gates: 6 / 10")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Migration progress" })).toHaveTextContent("Queue and recovery: Not yet verified");
    expect(screen.getByRole("list", { name: "Migration progress" })).toHaveTextContent("Final production cutover: Not verified");
    expect(screen.getByText("History and advanced diagnostics").closest("details")).not.toHaveAttribute("open");
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

  it("shows loading instead of an empty tenant result while inventory is pending", () => {
    mocks.tenantListQuery = { data: undefined, isLoading: true, isSuccess: false, isError: false, isFetching: true, refetch: vi.fn() };
    render(<AdminDeploymentTargets />);
    expect(screen.getByText("Loading tenant list…")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Authenticated tenant" })).toBeDisabled();
  });

  it("shows tenant inventory query failures and offers an explicit retry", async () => {
    const refetch = vi.fn();
    mocks.tenantListQuery = { data: undefined, isLoading: false, isSuccess: false, isError: true, isFetching: false, refetch };
    const user = userEvent.setup();
    render(<AdminDeploymentTargets />);
    expect(screen.getByRole("alert")).toHaveTextContent("Saved tenant data was not changed");
    expect(screen.getByRole("combobox", { name: "Authenticated tenant" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry tenant list" }));
    expect(refetch).toHaveBeenCalledOnce();
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

  it("offers an explicit safe reference bind for the existing platform credential without asking for a second token", async () => {
    const user = userEvent.setup();
    mocks.stagingTargets = [stagingActivationTarget];
    mocks.deploymentCredentialState = { status: "NOT_CONFIGURED", savedAt: null, canBindPlatformCredential: true,
      source: "platform-credential-center" };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    expect(await screen.findByText(/can use the existing deployment profile/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use the saved platform deployment credential" }));
    expect(mocks.bindPlatformCredential).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging", provider: "cloudflare" });
    expect(screen.getByLabelText("Cloudflare API token")).not.toBeVisible();
  });

  it("shows when the Production target's encrypted token copy was last saved", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime" }];
    const { container } = render(<AdminDeploymentTargets />);

    await chooseProductionScope(user);
    expect(await screen.findByText("smartspec-cloudflare-runtime")).toBeInTheDocument();
    expect(screen.getByText(/Production token copy saved here:/)).toBeInTheDocument();
    expect(screen.getByText(/Cloudflare dashboard edits do not update this encrypted copy/)).toBeInTheDocument();
    expect(container.querySelector('time[datetime="2026-10-24T09:30:49.037Z"]')).toBeInTheDocument();
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

  it("distinguishes a deployed job runtime from disabled application HTTP ingress", async () => {
    const user = userEvent.setup();
    mocks.stagingRuntime = {
      status: "READY", checkedAt: "2026-10-30T00:00:00.000Z", activation: "enabled", transport: "queues",
      missing: [], applicationIngress: { enabled: false, ready: false, missing: ["NODE_HTTP", "PYTHON_HTTP"] },
    };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    expect(await screen.findByText("READY")).toBeInTheDocument();
    const ingress = screen.getByLabelText("Application HTTP ingress readiness");
    expect(ingress).toHaveTextContent("Application HTTP ingress: DISABLED");
    expect(ingress).toHaveTextContent("Missing application bindings: NODE_HTTP, PYTHON_HTTP");
  });

  it("explains why namespace-only Staging cannot produce a Full Application candidate", async () => {
    const user = userEvent.setup();
    mocks.originConfiguration = { status: "STORED", applicationPreparation: {
      phase: "NAMESPACE_ONLY", sourceConfigurationRef: `cf-origin:${"a".repeat(64)}`, candidateStatus: "BLOCKED",
      missingRuntimeFields: ["CLOUDFLARE_APPLICATION_HTTP_TRAFFIC", "encrypted Node/Python application secrets"],
      imageReceipts: "VERIFIED", encryptedApplicationSecrets: "MISSING", containerBindings: "NOT_GENERATED",
      databaseAuthority: { status: "MISSING", code: "STAGING_DB_AUTHORITY_MISSING", existingRoleAccess: "READ_ONLY_PROBE_ONLY",
        host: "db-staging.smartaihub.app", databaseName: "staging_app", readOnlyProbeRole: "sah_cf_staging_aaaaaaaaaaaa",
        requiredPermissions: ["CONNECT", "SELECT/INSERT/UPDATE/DELETE on reviewed application tables", "USAGE/SELECT on required sequences"],
        excludedPermissions: ["DDL", "OWNERSHIP", "ROLE ADMIN", "RLS BYPASS", "Production database access"] },
      deploymentAuthorized: false,
    } };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    expect(await screen.findByText(/NAMESPACE ONLY — not deployable as the application/i)).toBeInTheDocument();
    const databaseBlocker = screen.getByLabelText("Staging database acceptance status");
    expect(databaseBlocker).toHaveTextContent("STAGING_DB_AUTHORITY_MISSING");
    expect(databaseBlocker).toHaveTextContent("db-staging.smartaihub.app/staging_app");
    expect(databaseBlocker).toHaveTextContent("READ_ONLY_PROBE_ONLY");
    expect(screen.getByText(/Full HTTP requires the existing verified Node\/Python image receipts/i)).toBeInTheDocument();
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
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Authorize first Staging deployment");
    await user.dblClick(screen.getByRole("button", { name: "Authorize first Staging deploy" }));
    expect(mocks.queueStagingDeploy).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging" });
    expect(await screen.findByText(/Canonical Job accepted/)).toBeInTheDocument();
    expect(screen.getByText("88888888-8888-4888-8888-888888888888")).toBeInTheDocument();
  });

  it("explains a rejected renewal confirmation and confirms that no Job was admitted", async () => {
    const user = userEvent.setup();
    const configurationRef = `cf-origin:${"a".repeat(64)}`;
    const plan = { configurationRef, configurationDigest: "a".repeat(64), sourceProvisionJobId: "11111111-1111-4111-8111-111111111111",
      sourcePlan: { namespace: "smartspec-staging-aaaaaaaaaaaa", hostname: "db-staging.smartaihub.app", zoneId: "b".repeat(32),
        tunnelId: "22222222-2222-4222-8222-222222222222", databaseName: "smartaihub", caSha256: "c".repeat(64), connectionLimit: 5,
        configurationExpiresAt: "2026-10-01T00:00:00.000Z" }, sourcePlanDigest: "d".repeat(64),
      resources: { hyperdriveId: "e".repeat(32), caId: "f".repeat(32), accessApplicationId: "33333333-3333-4333-8333-333333333333",
        accessPolicyId: "44444444-4444-4444-8444-444444444444", serviceTokenId: "55555555-5555-4555-8555-555555555555", dnsRecordId: "6".repeat(32) },
      serviceTokenExpiresAt: "2026-10-30T00:00:00.000Z", refreshServiceTokenExpiry: true,
      leaseExpiresAt: new Date(Date.now() + 31 * 86_400_000).toISOString(), authorizationExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "READY", checkedAt: "2026-10-29T00:00:00.000Z", activation: "disabled", missing: [], reason: null };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_EXPIRED", artifact: null, baseline: null };
    mocks.originConfiguration = { status: "EXPIRED", configurationRef, descriptor: { nativeResources: { privateDatabase: { provisionJobId: plan.sourceProvisionJobId } } } };
    mocks.stagingDatabaseRenewal = { ready: true, reason: null, configurationRef, plan, planDigest: "7".repeat(64), existingJob: null };
    mocks.stagingRenewalSubmissionFailure = new Error("PRIVATE_DATABASE_RENEWAL_PLAN_CHANGED");
    render(<AdminDeploymentTargets />);
    await chooseScope(user);
    await user.click(await screen.findByRole("button", { name: "Authorize and renew the existing Staging database lease" }));
    await user.click(screen.getByRole("button", { name: "Authorize one renewal Job" }));

    expect(await screen.findByText(/No renewal Job was admitted/)).toBeInTheDocument();
    expect(screen.getByText("PRIVATE_DATABASE_RENEWAL_PLAN_CHANGED")).toBeInTheDocument();
    expect(screen.queryByText(/Canonical Job accepted/)).not.toBeInTheDocument();
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
    const activate = screen.getByRole("button", { name: "Prepare Staging control-plane profile with saved secrets" });
    expect(activate).toBeEnabled();
    await user.click(activate);
    expect(mocks.activateStagingProfile).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Prepare Staging control-plane profile");
    await user.click(screen.getByRole("button", { name: "Prepare Staging" }));
    expect(mocks.activateStagingProfile).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "staging",
      provider: "cloudflare",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      profile: "namespace-only",
    });
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();
  });

  it("prepares the selected Full Application HTTP profile through the existing Staging action", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "UNAVAILABLE", checkedAt: "2026-10-22T00:00:00.000Z", activation: null, transport: "queues", missing: [], reason: "STAGING_READINESS_PROBE_UNAVAILABLE" };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ACTIVATION_PROFILE_REQUIRED", artifact: null, baseline: null };
    mocks.originConfiguration = {
      status: "STORED", configurationRef: `cf-origin:${"a".repeat(64)}`,
      workflowRuntimeTokenConfigured: true, controlPlaneTokenConfigured: true,
      descriptor: { nativeResources: { privateDatabase: { provisionJobId: "private-db-receipt" } } },
      applicationPreparation: {
        phase: "NAMESPACE_ONLY", sourceConfigurationRef: `cf-origin:${"a".repeat(64)}`, candidateStatus: "READY",
        missingRuntimeFields: [], imageReceipts: "VERIFIED", encryptedApplicationSecrets: "STORED",
        containerBindings: "NOT_GENERATED",
        databaseAuthority: { status: "MISSING", code: "STAGING_DB_AUTHORITY_MISSING", existingRoleAccess: "READ_ONLY_PROBE_ONLY",
          host: null, databaseName: null, readOnlyProbeRole: null, requiredPermissions: [], excludedPermissions: [] },
      },
    };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);
    await user.click(screen.getByRole("combobox", { name: "Candidate profile" }));
    await user.click(screen.getByRole("option", { name: /FULL_APPLICATION_HTTP/ }));
    const prepare = screen.getByRole("button", { name: "Prepare Full Application HTTP candidate" });
    expect(prepare).toBeEnabled();
    await user.click(prepare);
    expect(mocks.activateStagingProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Prepare Full HTTP candidate" }));
    expect(mocks.activateStagingProfile).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging", provider: "cloudflare",
      configurationRef: `cf-origin:${"a".repeat(64)}`, profile: "full-application-http" });
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

    const activate = screen.getByRole("button", { name: "Generate secrets and prepare Staging control-plane profile" });
    expect(activate).toBeEnabled();
    expect(screen.getByText(/You do not need to find or copy any tokens/)).toBeInTheDocument();
    expect(screen.getByLabelText("Staging workflow runtime token")).not.toBeVisible();
    await user.click(activate);
    expect(mocks.activateStagingProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Prepare Staging" }));
    expect(mocks.activateStagingProfile).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging", provider: "cloudflare",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", profile: "namespace-only" });
    expect(cloudflareStagingActivationInputSchema.safeParse(mocks.activateStagingProfile.mock.lastCall?.[0]).success).toBe(true);
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();

    mocks.activateStagingProfile.mockClear();
    await user.click(screen.getByText("Advanced: use existing internal secrets"));
    await user.type(screen.getByLabelText("Staging workflow runtime token"), "w".repeat(32));
    expect(screen.getByRole("button", { name: "Use supplied secrets and prepare Staging control-plane profile" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/two different secrets/);
    await user.type(screen.getByLabelText("Staging control-plane token"), "w".repeat(32));
    expect(screen.getByRole("button", { name: "Use supplied secrets and prepare Staging control-plane profile" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Staging control-plane token"));
    await user.type(screen.getByLabelText("Staging control-plane token"), "c".repeat(32));
    const manual = screen.getByRole("button", { name: "Use supplied secrets and prepare Staging control-plane profile" });
    expect(manual).toBeEnabled();
    await user.click(manual);
    await user.click(screen.getByRole("button", { name: "Prepare Staging" }));
    expect(mocks.activateStagingProfile).toHaveBeenCalledWith(expect.objectContaining({
      provider: "cloudflare",
      workflowRuntimeToken: "w".repeat(32),
      controlPlaneToken: "c".repeat(32),
    }));
    await user.click(screen.getByRole("button", { name: "Use automatic setup instead" }));
    await user.click(screen.getByRole("button", { name: "Clear these fields" }));
    expect(screen.getByRole("button", { name: "Generate secrets and prepare Staging control-plane profile" })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "Prepare Staging control-plane profile with saved secrets" })).toBeDisabled();
    expect(screen.getByText(/this immutable configuration and its private-database lease have expired/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recheck Staging configuration (read-only)" }));
    expect(mocks.refetchStagingOriginConfiguration).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Recheck Staging configuration");
    await user.click(screen.getByRole("button", { name: "Recheck now" }));
    expect(mocks.refetchStagingOriginConfiguration).toHaveBeenCalled();
    expect(mocks.refetchStagingPreflight).toHaveBeenCalled();
    expect(mocks.refetchStagingRuntimeReadiness).toHaveBeenCalled();
    expect(mocks.refetchStagingDatabaseRenewal).toHaveBeenCalled();
    expect(mocks.activateStagingProfile).not.toHaveBeenCalled();
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();

    mocks.originConfiguration = {
      status: "STORED",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: true,
      descriptor: {},
    };
    rerender(<AdminDeploymentTargets />);
    expect(await screen.findByText("STAGING_PRIVATE_DATABASE_BINDING_REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare Staging control-plane profile with saved secrets" })).toBeDisabled();

    mocks.originConfigurationError = true;
    mocks.stagingPreflight = { ready: false, reason: "STAGING_PRIVATE_DATABASE_RECEIPT_INVALID", artifact: null, baseline: null };
    rerender(<AdminDeploymentTargets />);
    expect(screen.getAllByText("STAGING_PRIVATE_DATABASE_RECEIPT_INVALID").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Prepare Staging control-plane profile with saved secrets" })).toBeDisabled();
    expect(mocks.activateStagingProfile).not.toHaveBeenCalled();
  });

  it("shows the lease renewal action for an expired config even when the runtime probe says READY", async () => {
    const user = userEvent.setup();
    const configurationRef = `cf-origin:${"a".repeat(64)}`;
    const plan = {
      configurationRef, configurationDigest: "a".repeat(64),
      sourceProvisionJobId: "11111111-1111-4111-8111-111111111111",
      sourcePlan: { namespace: "smartspec-staging-aaaaaaaaaaaa", hostname: "db-staging.smartaihub.app", zoneId: "b".repeat(32),
        tunnelId: "22222222-2222-4222-8222-222222222222", databaseName: "smartaihub", caSha256: "c".repeat(64), connectionLimit: 5,
        configurationExpiresAt: "2026-10-01T00:00:00.000Z" },
      sourcePlanDigest: "d".repeat(64),
      resources: { hyperdriveId: "e".repeat(32), caId: "f".repeat(32), accessApplicationId: "33333333-3333-4333-8333-333333333333",
        accessPolicyId: "44444444-4444-4444-8444-444444444444", serviceTokenId: "55555555-5555-4555-8555-555555555555", dnsRecordId: "6".repeat(32) },
      serviceTokenExpiresAt: "2026-10-30T00:00:00.000Z", refreshServiceTokenExpiry: true,
      leaseExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      authorizationExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "READY", checkedAt: "2026-10-29T00:00:00.000Z", activation: "disabled", missing: [], reason: null };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_EXPIRED", artifact: null, baseline: null };
    mocks.originConfiguration = { status: "EXPIRED", configurationRef, workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: true, descriptor: { nativeResources: { privateDatabase: { provisionJobId: plan.sourceProvisionJobId } } } };
    mocks.stagingDatabaseRenewal = { ready: true, reason: null, checkedAt: "2026-10-29T00:00:00.000Z", configurationRef,
      configurationDigest: "a".repeat(64), accountRef: "b".repeat(32), plan, planDigest: "7".repeat(64),
      leaseExpiresAt: plan.leaseExpiresAt, existingJob: null };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    const renew = await screen.findByRole("button", { name: "Authorize and renew the existing Staging database lease" });
    expect(renew).toBeEnabled();
    await user.click(renew);
    expect(mocks.queueStagingDatabaseRenewal).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Authorize and renew the Staging database lease");
    expect(screen.getByRole("dialog")).toHaveTextContent("Access: Service Tokens Write");
    expect(screen.getByRole("dialog")).toHaveTextContent("secret and policy stay unchanged");
    await user.click(screen.getByRole("button", { name: "Authorize one renewal Job" }));
    expect(mocks.queueStagingDatabaseRenewal).toHaveBeenCalledWith({ tenantId, projectId, environment: "staging", configurationRef,
      planDigest: "7".repeat(64) });
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();
    expect(await screen.findByText(/Canonical Job accepted/)).toBeInTheDocument();
    expect(screen.getAllByText("77777777-7777-4777-8777-777777777777")).toHaveLength(2);
  });

  it("shows the existing lease renewal action before expiry when Full HTTP requires seven days of validity", async () => {
    const user = userEvent.setup();
    const configurationRef = `cf-origin:${"a".repeat(64)}`;
    const expiresSoon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const plan = {
      configurationRef, configurationDigest: "a".repeat(64),
      sourceProvisionJobId: "11111111-1111-4111-8111-111111111111",
      sourcePlan: { namespace: "smartspec-staging-aaaaaaaaaaaa", hostname: "db-staging.smartaihub.app", zoneId: "b".repeat(32),
        tunnelId: "22222222-2222-4222-8222-222222222222", databaseName: "smartspec", caSha256: "c".repeat(64), connectionLimit: 5,
        configurationExpiresAt: expiresSoon },
      sourcePlanDigest: "d".repeat(64),
      resources: { hyperdriveId: "e".repeat(32), caId: "f".repeat(32), accessApplicationId: "33333333-3333-4333-8333-333333333333",
        accessPolicyId: "44444444-4444-4444-8444-444444444444", serviceTokenId: "55555555-5555-4555-8555-555555555555", dnsRecordId: "6".repeat(32) },
      serviceTokenExpiresAt: new Date(Date.now() + 40 * 86_400_000).toISOString(), refreshServiceTokenExpiry: false,
      leaseExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      authorizationExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "NOT_READY", checkedAt: "2026-10-29T00:00:00.000Z", activation: "disabled", missing: [], reason: null };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ACTIVATION_PROFILE_REQUIRED", artifact: null, baseline: null };
    mocks.originConfiguration = { status: "STORED", configurationRef, descriptor: {
      expiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
      nativeResources: { privateDatabase: { plan: { configurationExpiresAt: expiresSoon }, provisionJobId: plan.sourceProvisionJobId } },
    }, applicationPreparation: { phase: "NAMESPACE_ONLY", sourceConfigurationRef: configurationRef, candidateStatus: "READY",
      missingRuntimeFields: [], imageReceipts: "VERIFIED", encryptedApplicationSecrets: "STORED", containerBindings: "NOT_GENERATED",
      databaseAuthority: { status: "MISSING", code: "STAGING_DB_AUTHORITY_MISSING", existingRoleAccess: "READ_ONLY_PROBE_ONLY",
        host: null, databaseName: null, readOnlyProbeRole: null, requiredPermissions: [], excludedPermissions: [] } } };
    mocks.stagingDatabaseRenewal = { ready: true, reason: null, checkedAt: new Date().toISOString(), configurationRef,
      configurationDigest: "a".repeat(64), accountRef: "b".repeat(32), plan, planDigest: "7".repeat(64),
      leaseExpiresAt: plan.leaseExpiresAt, existingJob: null };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);
    await user.click(screen.getByRole("combobox", { name: "Candidate profile" }));
    await user.click(screen.getByRole("option", { name: /FULL_APPLICATION_HTTP/ }));

    expect(await screen.findByText("STAGING_APPLICATION_DATABASE_ROLE_VALIDITY_TOO_SHORT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Authorize and renew the existing Staging database lease" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Prepare Full Application HTTP candidate" })).toBeDisabled();
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();
  });

  it("restores an explicit read-only retry after the staging renewal preflight stalls", async () => {
    const user = userEvent.setup();
    const configurationRef = `cf-origin:${"a".repeat(64)}`;
    mocks.targets = [stagingActivationTarget];
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_EXPIRED", artifact: null, baseline: null };
    mocks.originConfiguration = { status: "EXPIRED", configurationRef,
      descriptor: { nativeResources: { privateDatabase: { provisionJobId: "11111111-1111-4111-8111-111111111111" } } } };
    mocks.stagingDatabaseRenewal = null;
    mocks.refetchStagingOriginConfiguration.mockResolvedValue({ isError: false });
    mocks.refetchStagingPreflight.mockResolvedValue({ isError: false });
    mocks.refetchStagingRuntimeReadiness.mockResolvedValue({ isError: false });
    mocks.refetchStagingDatabaseRenewal.mockResolvedValue({ isError: false });

    const { rerender } = render(<AdminDeploymentTargets />);
    await chooseScope(user);
    mocks.stagingRenewalFetching = true;
    vi.useFakeTimers();
    rerender(<AdminDeploymentTargets />);
    expect(screen.getByText(/Checking the existing database lease/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recheck Staging configuration (read-only)" })).toBeDisabled();

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByText(/The read-only check has taken over 20 seconds/)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry Staging check (read-only)" });
    expect(retry).toBeEnabled();
    await act(async () => { retry.click(); });
    expect(screen.getByRole("dialog")).toHaveTextContent("Read-only");
    await act(async () => { screen.getByRole("button", { name: "Recheck now" }).click(); });
    expect(mocks.refetchStagingDatabaseRenewal).toHaveBeenCalled();
    expect(mocks.cancelStagingDatabaseRenewal).toHaveBeenCalledOnce();
    expect(mocks.queueStagingDatabaseRenewal).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("shows the sanitized failing stage when lease renewal preflight cannot complete", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "READY", checkedAt: "2026-10-29T00:00:00.000Z", activation: "disabled", missing: [], reason: null };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_EXPIRED", artifact: null, baseline: null };
    mocks.originConfiguration = { status: "EXPIRED", configurationRef: `cf-origin:${"a".repeat(64)}`,
      descriptor: { nativeResources: { privateDatabase: { provisionJobId: "11111111-1111-4111-8111-111111111111" } } } };
    mocks.stagingDatabaseRenewal = { ready: false, reason: "PRIVATE_DATABASE_RENEWAL_PREFLIGHT_FAILED",
      failureStage: "CLOUDFLARE_PROVIDER_READBACK", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    expect(await screen.findByText("CLOUDFLARE_PROVIDER_READBACK")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize and renew the existing Staging database lease" })).not.toBeInTheDocument();
    expect(mocks.queueStagingDatabaseRenewal).not.toHaveBeenCalled();
  });

  it("shows only sanitized plan field and validation rule when renewal plan binding fails", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "READY", checkedAt: "2026-10-29T00:00:00.000Z", activation: "disabled", missing: [], reason: null };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_EXPIRED", artifact: null, baseline: null };
    mocks.originConfiguration = { status: "EXPIRED", configurationRef: `cf-origin:${"a".repeat(64)}`, descriptor: {} };
    mocks.stagingDatabaseRenewal = { ready: false, reason: "PRIVATE_DATABASE_RENEWAL_PLAN_BINDING_INVALID", failureStage: "PLAN_BINDING",
      failureDetail: "resources.accessApplicationId (invalid_format)", plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);
    expect(await screen.findByText("PLAN_BINDING")).toBeInTheDocument();
    expect(screen.getByText("resources.accessApplicationId (invalid_format)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize and renew the existing Staging database lease" })).not.toBeInTheDocument();
  });

  it("does not offer a second lease renewal while the canonical renewal Job already exists", async () => {
    const user = userEvent.setup();
    const configurationRef = `cf-origin:${"a".repeat(64)}`;
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "READY", checkedAt: "2026-10-29T00:00:00.000Z", activation: "disabled", missing: [], reason: null };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_EXPIRED", artifact: null, baseline: null };
    mocks.originConfiguration = { status: "EXPIRED", configurationRef, descriptor: { nativeResources: { privateDatabase: { provisionJobId: "11111111-1111-4111-8111-111111111111" } } } };
    mocks.stagingDatabaseRenewal = { ready: false, reason: "PRIVATE_DATABASE_RENEWAL_JOB_EXISTS", configurationRef,
      plan: null, planDigest: null, leaseExpiresAt: null,
      existingJob: { jobId: "77777777-7777-4777-8777-777777777777", status: "running", heartbeatAt: "2026-10-29T00:00:00.000Z", errorCode: null } };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    expect(await screen.findByText(/Canonical renewal Job/)).toBeInTheDocument();
    expect(screen.getByText(/77777777-7777-4777-8777-777777777777/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize and renew the existing Staging database lease" })).not.toBeInTheDocument();
    expect(mocks.queueStagingDatabaseRenewal).not.toHaveBeenCalled();
  });

  it("shows authoritative queued Job state and a read-only status refresh without exposing another submission", async () => {
    const user = userEvent.setup();
    const configurationRef = `cf-origin:${"a".repeat(64)}`;
    const jobId = "77777777-7777-4777-8777-777777777777";
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "READY", checkedAt: "2026-10-29T00:00:00.000Z", activation: "disabled", missing: [], reason: null };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_EXPIRED", artifact: null, baseline: null };
    mocks.originConfiguration = { status: "EXPIRED", configurationRef, descriptor: { nativeResources: { privateDatabase: { provisionJobId: "11111111-1111-4111-8111-111111111111" } } } };
    mocks.stagingDatabaseRenewal = { ready: false, reason: "PRIVATE_DATABASE_RENEWAL_JOB_EXISTS", configurationRef,
      plan: null, planDigest: null, leaseExpiresAt: null,
      existingJob: { jobId, status: "queued", heartbeatAt: null, errorCode: null, retryable: false } };
    mocks.stagingRenewalJobStatus = { data: { jobId, status: "queued", errorCode: null, workerId: null, attempt: 1, maxAttempts: 2,
      progressStage: null, progressPercent: null, heartbeatAt: null, leaseExpiresAt: null, createdAt: "2026-10-29T00:00:00.000Z",
      startedAt: null, finishedAt: null }, isFetching: false, isError: false, refetch: vi.fn() };

    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    const renewalPanel = screen.getByRole("group", { name: "Staging database lease renewal" });
    expect(renewalPanel).toHaveTextContent("Queued — waiting for a worker");
    expect(renewalPanel).toHaveTextContent("Waiting for worker");
    expect(renewalPanel).toHaveTextContent("Wait while the canonical Job continues");
    expect(screen.getByRole("button", { name: "Refresh renewal Job status (read-only)" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Authorize and renew the existing Staging database lease" })).not.toBeInTheDocument();
    expect(mocks.queueStagingDatabaseRenewal).not.toHaveBeenCalled();
  });

  it("offers one fresh confirmation only when the prior renewal expired before claim with no execution record", async () => {
    const user = userEvent.setup();
    const configurationRef = `cf-origin:${"a".repeat(64)}`;
    const plan = { configurationRef, configurationDigest: "a".repeat(64), sourceProvisionJobId: "11111111-1111-4111-8111-111111111111",
      sourcePlan: { namespace: "smartspec-staging-aaaaaaaaaaaa", hostname: "db-staging.smartaihub.app", zoneId: "b".repeat(32),
        tunnelId: "22222222-2222-4222-8222-222222222222", databaseName: "smartaihub", caSha256: "c".repeat(64), connectionLimit: 5,
        configurationExpiresAt: "2026-10-01T00:00:00.000Z" }, sourcePlanDigest: "d".repeat(64),
      resources: { hyperdriveId: "e".repeat(32), caId: "f".repeat(32), accessApplicationId: "33333333-3333-4333-8333-333333333333",
        accessPolicyId: "44444444-4444-4444-8444-444444444444", serviceTokenId: "55555555-5555-4555-8555-555555555555", dnsRecordId: "6".repeat(32) },
      serviceTokenExpiresAt: "2026-10-30T00:00:00.000Z", refreshServiceTokenExpiry: true,
      leaseExpiresAt: new Date(Date.now() + 31 * 86_400_000).toISOString(), authorizationExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "READY", checkedAt: "2026-10-29T00:00:00.000Z", activation: "disabled", missing: [], reason: null };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_EXPIRED", artifact: null, baseline: null };
    mocks.originConfiguration = { status: "EXPIRED", configurationRef, descriptor: { nativeResources: { privateDatabase: { provisionJobId: plan.sourceProvisionJobId } } } };
    mocks.stagingDatabaseRenewal = { ready: true, reason: null, configurationRef, plan, planDigest: "7".repeat(64),
      existingJob: { jobId: "77777777-7777-4777-8777-777777777777", status: "expired", errorCode: "JOB_DEADLINE_EXPIRED",
        heartbeatAt: null, retryable: true } };
    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    expect(await screen.findByText(/expired before it was claimed/)).toBeInTheDocument();
    const renew = screen.getByRole("button", { name: "Authorize and renew the existing Staging database lease" });
    await user.click(renew);
    expect(await screen.findByRole("dialog")).toHaveTextContent("77777777-7777-4777-8777-777777777777");
    await user.click(screen.getByRole("button", { name: "Authorize one renewal Job" }));
    expect(mocks.queueStagingDatabaseRenewal).toHaveBeenCalledOnce();
  });

  it("explains an expired preflight blocker even when the configuration readback is still STORED", async () => {
    const user = userEvent.setup();
    mocks.targets = [stagingActivationTarget];
    mocks.stagingRuntime = { status: "NOT_DEPLOYED", checkedAt: "2026-10-22T00:00:00.000Z", missing: [], reason: "STAGING_READINESS_PROBE_UNAVAILABLE" };
    mocks.stagingPreflight = { ready: false, reason: "STAGING_ORIGIN_CONFIGURATION_EXPIRED", artifact: null, baseline: null };
    mocks.originConfiguration = {
      status: "STORED",
      configurationRef: "cf-origin:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: true,
      descriptor: { nativeResources: { privateDatabase: { provisionJobId: "private-db-receipt" } } },
    };

    render(<AdminDeploymentTargets />);
    await chooseScope(user);

    expect((await screen.findAllByText("STAGING_ORIGIN_CONFIGURATION_EXPIRED")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Prepare Staging control-plane profile with saved secrets" })).toBeDisabled();
    expect(mocks.activateStagingProfile).not.toHaveBeenCalled();
    expect(mocks.queueStagingDeploy).not.toHaveBeenCalled();
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
    await user.click(screen.getByRole("button", { name: "Prepare Staging control-plane profile with saved secrets" }));
    await user.click(screen.getByRole("button", { name: "Prepare Staging" }));

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

    await user.click(screen.getByRole("button", { name: "Prepare Staging control-plane profile with saved secrets" }));
    await user.click(screen.getByRole("button", { name: "Prepare Staging" }));

    expect(await screen.findAllByText("CLOUDFLARE_STAGING_ACTIVE_TENANT_OWNER_REQUIRED")).toHaveLength(2);
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
    expect(screen.getByText(/needs a trusted certificate matching db\.smartaihub\.app/i)).toBeInTheDocument();
    expect(screen.getByText(/This plan uses verify_full, which validates both the certificate chain and hostname/i)).toBeInTheDocument();
    const prepareDatabase = screen.getByRole("button", { name: "Prepare Production database connection" });
    expect(prepareDatabase).toBeEnabled();
    await user.click(prepareDatabase);
    await waitFor(() => expect(mocks.prepareProductionDatabase).toHaveBeenCalledWith({ tenantId, projectId, environment: "production", tunnelId: "87654321-4321-4321-8321-cba987654321", submissionId: expect.any(String) }));
    expect(prepareDatabase).toBeDisabled();
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

  it("preselects the independently verified production Tunnel and excludes the healthy dev Tunnel", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.productionTunnels = [
      { id: "cc9ce9c0-3036-4312-a4fc-5c8f75d59e32", name: "mastercafediary_com", status: "down" },
      { id: "191d047e-674a-48f4-b105-b37269c2dad6", name: "smartspec", status: "healthy" },
      { id: "288efe2d-034b-4532-811a-ee3e974d802b", name: "smartspec-dev", status: "healthy" },
    ];
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    const tunnel = screen.getByRole("combobox", { name: "Existing PostgreSQL Tunnel" });
    expect(tunnel).toHaveTextContent("smartspec");
    expect(screen.queryByRole("option", { name: /smartspec-dev/ })).not.toBeInTheDocument();
    expect(screen.getByText(/marked as non-production/)).toBeInTheDocument();
    const prepare = screen.getByRole("button", { name: "Prepare Production database connection" });
    expect(prepare).toBeEnabled();
    await user.click(prepare);
    await waitFor(() => expect(mocks.prepareProductionDatabase).toHaveBeenCalledWith({
      tenantId, projectId, environment: "production", tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", submissionId: expect.any(String),
    }));
  });

  it("reconciles an unknown admission with the same ID and only reports accepted after canonical success", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.databaseAdmissionUnknownOnce = true;
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    await user.click(screen.getByRole("button", { name: "Prepare Production database connection" }));
    expect(await screen.findByText("ADMISSION_UNKNOWN")).toBeInTheDocument();
    expect(screen.getByText("CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN")).toBeInTheDocument();
    expect(screen.getByText("request-trace-1")).toBeInTheDocument();
    const firstSubmission = mocks.prepareProductionDatabase.mock.calls[0][0] as { submissionId: string; tunnelId: string };

    await user.click(screen.getByRole("button", { name: "Reconcile the same submission" }));
    await waitFor(() => expect(mocks.prepareProductionDatabase).toHaveBeenCalledTimes(2));
    const retrySubmission = mocks.prepareProductionDatabase.mock.calls[1][0] as { submissionId: string; tunnelId: string };
    expect(retrySubmission).toEqual(firstSubmission);
    expect(await screen.findByText("JOB_ACCEPTED")).toBeInTheDocument();
    expect(screen.getByText("44444444-4444-4444-8444-444444444444")).toBeInTheDocument();
  });

  it.each([false, true, "provider"])("offers explicit same-job Owner recovery; exhausted failure: %s", async guardFailure => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.productionTunnels = [{ id: "191d047e-674a-48f4-b105-b37269c2dad6", name: "smartspec", status: "healthy" }];
    mocks.latestProductionDatabaseJob = {
      jobId: "b9ca8316-1604-4764-a769-d92f46e4c823", status: guardFailure ? "failed" : "expired",
      errorCode: guardFailure === "provider" ? "CLOUDFLARE_PRODUCTION_DATABASE_HTTP_400_CF_2015" : guardFailure ? "CLOUDFLARE_PRODUCTION_DATABASE_CREDENTIAL_UNAVAILABLE" : "JOB_DEADLINE_EXPIRED",
      attempt: guardFailure === "provider" ? 3 : guardFailure ? 2 : 1, maxAttempts: guardFailure === "provider" ? 3 : 2, operatorReviewRequired: !guardFailure,
      operatorReviewReason: "adapter_contract_unsupported", tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6",
    };
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    const recoveryLabel = guardFailure === "provider" ? "Authorize recovery of existing Hyperdrive job" : guardFailure ? "Authorize one corrected attempt on this same job" : "Renew authorization and resume this same job";
    expect(await screen.findByText(guardFailure === "provider" ? /Hyperdrive connection failed/ : guardFailure ? /two-attempt budget is exhausted/i : /expired before a worker claimed it/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: recoveryLabel })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Production database job already exists" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: recoveryLabel }));
    await waitFor(() => expect(mocks.resumeProductionDatabase).toHaveBeenCalledWith({
      tenantId, projectId, jobId: "b9ca8316-1604-4764-a769-d92f46e4c823",
      tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", environment: "production",
      ...(guardFailure ? { authorizeAdditionalAttempt: true } : {}),
    }));
    expect(mocks.prepareProductionDatabase).not.toHaveBeenCalled();
  });

  it("shows the same-job Hyperdrive recovery when unrelated Worker inventory is partial", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.productionInventoryStatus = "PARTIAL";
    mocks.workerDeploymentsComplete = false;
    mocks.workerVersionChecks = [{ httpStatus: null, complete: false }];
    mocks.productionTunnels = [{ id: "191d047e-674a-48f4-b105-b37269c2dad6", name: "smartspec", status: "healthy" }];
    mocks.databaseVpcReadable = true;
    mocks.databaseVpcs = [{ id: "01a175b0-3c44-7131-8805-2cd56db223ac", name: "smartspec-production-postgres-aaaaaaaaaaaa",
      type: "tcp", appProtocol: "postgresql", tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", environment: "production" }];
    mocks.productionHyperdrives = [{ id: "db6b46010af44ad381dd6e3e2674913a", name: "smartspec-production-database-aaaaaaaaaaaa",
      vpcServiceId: "01a175b0-3c44-7131-8805-2cd56db223ac", scheme: "postgres", cachingDisabled: true, environment: "production" }];
    mocks.latestProductionDatabaseJob = { jobId: "b9ca8316-1604-4764-a769-d92f46e4c823", status: "failed",
      errorCode: "CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH", attempt: 4, maxAttempts: 4,
      tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", planDigest: "a".repeat(64) };

    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(await screen.findByText(/Production inventory is incomplete \(PARTIAL\)/)).toBeInTheDocument();
    expect(screen.getByText("b9ca8316-1604-4764-a769-d92f46e4c823")).toBeInTheDocument();
    expect(screen.getByText(/Worker versions/)).toBeInTheDocument();
    expect(screen.getByText(/Readback recovery reuses the exact Hyperdrive and VPC/i)).toBeInTheDocument();
    expect(screen.queryByText(/HTTP undefined/)).not.toBeInTheDocument();
    const recover = screen.getByRole("button", { name: "Authorize recovery of existing Hyperdrive job" });
    expect(recover).toBeEnabled();
    await user.click(recover);
    expect(mocks.resumeProductionDatabase).toHaveBeenCalledWith({ tenantId, projectId,
      jobId: "b9ca8316-1604-4764-a769-d92f46e4c823", tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6",
      environment: "production", authorizeAdditionalAttempt: true });
  });

  it("shows canonical SQL evidence and stops offering another provisioning attempt after readback reconciliation", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime", workerRef: "smartspec-cloudflare-runtime" }];
    mocks.productionInventoryStatus = "PARTIAL";
    mocks.latestProductionDatabaseJob = { jobId: "b9ca8316-1604-4764-a769-d92f46e4c823", status: "failed",
      errorCode: "CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH", attempt: 4, maxAttempts: 4,
      reconciliation: { providerReadbackVerified: true, databaseConnectionVerified: true, tenantIsolationVerified: false } };
    render(<AdminDeploymentTargets />); await chooseProductionScope(user);
    expect(screen.getByRole("status", { name: "Production database verification" })).toHaveTextContent("Cloudflare SQL: PASS");
    expect(screen.getByText(/Remaining: verify tenant isolation/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize recovery of existing Hyperdrive job" })).not.toBeInTheDocument();
    expect(mocks.resumeProductionDatabase).not.toHaveBeenCalled(); expect(mocks.prepareProductionDatabase).not.toHaveBeenCalled();
  });

  it.each(["missing-vpc", "incomplete-hyperdrive", "invalid-tunnel", "nonrecoverable-job"])(
    "keeps same-job recovery unavailable when its database prerequisite is %s", async blocker => {
      const user = userEvent.setup();
      mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
        workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
      mocks.productionInventoryStatus = "PARTIAL";
      mocks.workerDeploymentsComplete = false;
      mocks.workerVersionChecks = [{ httpStatus: null, complete: false }];
      mocks.productionTunnels = [{ id: blocker === "invalid-tunnel" ? "bad-id" : "191d047e-674a-48f4-b105-b37269c2dad6",
        name: "smartspec", status: "healthy" }];
      mocks.databaseVpcReadable = blocker !== "missing-vpc";
      mocks.databaseVpcs = blocker === "missing-vpc" ? [] : [{ id: "01a175b0-3c44-7131-8805-2cd56db223ac",
        name: "smartspec-postgres-production", type: "tcp", appProtocol: "postgresql",
        tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", environment: "production" }];
      mocks.databaseHyperdriveReadable = blocker !== "incomplete-hyperdrive";
      mocks.latestProductionDatabaseJob = { jobId: "b9ca8316-1604-4764-a769-d92f46e4c823",
        status: blocker === "nonrecoverable-job" ? "failed" : "failed",
        errorCode: blocker === "nonrecoverable-job" ? "UNRELATED_FAILURE" : "CLOUDFLARE_PRODUCTION_DATABASE_HTTP_400_CF_2015",
        attempt: 3, maxAttempts: 3, tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", planDigest: "a".repeat(64) };
      render(<AdminDeploymentTargets />);
      await chooseProductionScope(user);
      expect(await screen.findByText(/Production inventory is incomplete \(PARTIAL\)/)).toBeInTheDocument();
      expect(screen.getByText("b9ca8316-1604-4764-a769-d92f46e4c823")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Authorize recovery of existing Hyperdrive job" })).not.toBeInTheDocument();
      expect(mocks.resumeProductionDatabase).not.toHaveBeenCalled();
    },
  );

  it("shows explicit full HTTP ingress scope and reuses the same Submission ID on retry", async () => {
    const user=userEvent.setup();
    mocks.targets=[{...existingTarget,environment:"production",deploymentTargetId:"smartspec-cloudflare-runtime",workerRef:"smartspec-cloudflare-runtime",runtimePolicy:null}];
    mocks.ingressPreflight={ready:true,origin:"https://origin-staging.smartaihub.app",artifact:{sourceSha:"a".repeat(40)},planDigest:"b".repeat(64)};
    render(<AdminDeploymentTargets/>);await chooseProductionScope(user);
    expect(screen.getByText(/routes all smartaihub.app HTTP traffic/i)).toBeInTheDocument();
    const button=screen.getByRole("button",{name:"Approve Cloudflare ingress canary and start migration"});
    await user.click(button);await user.click(button);
    expect(mocks.queueProductionIngress).toHaveBeenCalledTimes(2);
    const first=mocks.queueProductionIngress.mock.calls[0][0];
    expect(first).toMatchObject({tenantId,projectId,environment:"production",exposure:"100-percent-http-origin-bridge",planDigest:"b".repeat(64)});
    expect(mocks.queueProductionIngress.mock.calls[1][0]).toEqual(first);
  });

  it("shows exact immutable Worker canary scope and reuses one submission ID on repeated clicks", async () => {
    const user=userEvent.setup();
    mocks.targets=[{...existingTarget,environment:"production",deploymentTargetId:"smartspec-cloudflare-runtime",workerRef:"smartspec-cloudflare-runtime"}];
    mocks.productionWorkerCanaryPreflight={ready:true,artifact:{artifactRef:`sha256:${"a".repeat(64)}`,sourceSha:"b".repeat(40)},
      rollback:{deploymentId:"11111111-1111-4111-8111-111111111111",versionId:"22222222-2222-4222-8222-222222222222"},
      routePattern:"smartaihub.app/*",expectedRouteScript:"smartspec-cloudflare-runtime",planDigest:"c".repeat(64)};
    mocks.productionWorkerCanaryJob=null;
    render(<AdminDeploymentTargets/>);await chooseProductionScope(user);
    expect(screen.getByText(/candidate receives 1% traffic/i)).toBeInTheDocument();
    expect(screen.getByText(`sha256:${"a".repeat(64)}`)).toBeInTheDocument();
    const button=screen.getByRole("button",{name:"Approve 1% Worker version canary"});
    await user.click(button);await user.click(button);
    expect(mocks.queueProductionWorkerCanary).toHaveBeenCalledTimes(2);
    expect(mocks.queueProductionWorkerCanary.mock.calls[0][0]).toMatchObject({tenantId,projectId,environment:"production",planDigest:"c".repeat(64)});
    expect(mocks.queueProductionWorkerCanary.mock.calls[1][0]).toEqual(mocks.queueProductionWorkerCanary.mock.calls[0][0]);
  });

  it("prevents another Worker deployment while the canonical canary job is active", async () => {
    const user=userEvent.setup();
    mocks.targets=[{...existingTarget,environment:"production",deploymentTargetId:"smartspec-cloudflare-runtime",workerRef:"smartspec-cloudflare-runtime"}];
    mocks.productionWorkerCanaryPreflight={ready:true,artifact:{artifactRef:`sha256:${"a".repeat(64)}`,sourceSha:"b".repeat(40)},
      rollback:{deploymentId:"11111111-1111-4111-8111-111111111111",versionId:"22222222-2222-4222-8222-222222222222"},
      routePattern:"smartaihub.app/*",expectedRouteScript:"smartspec-cloudflare-runtime",planDigest:"c".repeat(64)};
    mocks.productionWorkerCanaryJob={jobId:"33333333-3333-4333-8333-333333333333",status:"running"};
    render(<AdminDeploymentTargets/>);await chooseProductionScope(user);
    expect(screen.queryByRole("button",{name:"Approve 1% Worker version canary"})).not.toBeInTheDocument();
    expect(screen.getByText(/A deployment job is active/i)).toBeInTheDocument();
    expect(mocks.queueProductionWorkerCanary).not.toHaveBeenCalled();
  });

  it("shows the exact deployment readback blocker and keeps job retrieval separate", async () => {
    const user=userEvent.setup();
    mocks.targets=[{...existingTarget,environment:"production",deploymentTargetId:"smartspec-cloudflare-runtime",workerRef:"smartspec-cloudflare-runtime"}];
    mocks.productionWorkerCanaryPreflight={ready:false,reason:"WORKER_DEPLOYMENT_PAGINATION_INCOMPLETE"};
    mocks.productionWorkerCanaryJob=null;
    render(<AdminDeploymentTargets/>);await chooseProductionScope(user);
    expect(screen.getByRole("heading",{name:"Cloudflare Worker Canary Deployment"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Recheck read-only preflight"})).toBeInTheDocument();
    expect(screen.getByText(/incomplete or inconsistent deployment page set/i)).toBeInTheDocument();
    expect(screen.getByText("WORKER_DEPLOYMENT_PAGINATION_INCOMPLETE")).toBeInTheDocument();
    expect(screen.getByText(/No canonical Worker canary job is recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Approve 1% Worker version canary"})).not.toBeInTheDocument();
  });

  it("shows the exact Production Queue ID blocker in the visible canary status", async () => {
    const user=userEvent.setup();
    mocks.targets=[{...existingTarget,environment:"production",deploymentTargetId:"smartspec-cloudflare-runtime",workerRef:"smartspec-cloudflare-runtime"}];
    mocks.productionWorkerCanaryPreflight={ready:false,reason:"PRODUCTION_QUEUE_ID_INVALID"};
    mocks.productionWorkerCanaryJob=null;
    render(<AdminDeploymentTargets/>);await chooseProductionScope(user);
    expect(screen.getByText(/queue_id is missing or invalid/i)).toBeInTheDocument();
    expect(screen.getByText("PRODUCTION_QUEUE_ID_INVALID")).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Approve 1% Worker version canary"})).not.toBeInTheDocument();
  });

  it("does not turn a failed canary job read into an empty-registry claim", async () => {
    const user=userEvent.setup();
    mocks.targets=[{...existingTarget,environment:"production",deploymentTargetId:"smartspec-cloudflare-runtime",workerRef:"smartspec-cloudflare-runtime"}];
    mocks.productionWorkerCanaryPreflight={ready:false,reason:"WORKER_DEPLOYMENT_NOT_FOUND"};
    mocks.productionWorkerCanaryJob=null;mocks.productionWorkerCanaryJobError=true;
    render(<AdminDeploymentTargets/>);await chooseProductionScope(user);
    expect(screen.getByText(/Unable to load canary job status/i)).toBeInTheDocument();
    expect(screen.queryByText(/No canonical Worker canary job is recorded/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Retry read-only job status"})).toBeInTheDocument();
  });

  it("does not offer another deployment after a successful 1% canary", async () => {
    const user=userEvent.setup();
    mocks.targets=[{...existingTarget,environment:"production",deploymentTargetId:"smartspec-cloudflare-runtime",workerRef:"smartspec-cloudflare-runtime"}];
    mocks.productionWorkerCanaryPreflight={ready:true,artifact:{artifactRef:`sha256:${"a".repeat(64)}`,sourceSha:"b".repeat(40)},
      rollback:{deploymentId:"11111111-1111-4111-8111-111111111111",versionId:"22222222-2222-4222-8222-222222222222"},
      routePattern:"smartaihub.app/*",expectedRouteScript:"smartspec-cloudflare-runtime",planDigest:"c".repeat(64)};
    mocks.productionWorkerCanaryJob={jobId:"33333333-3333-4333-8333-333333333333",status:"succeeded",
      output:{deploymentId:"44444444-4444-4444-8444-444444444444",candidateVersionId:"55555555-5555-4555-8555-555555555555",
        queueConsumer:{consumerId:"b".repeat(32)}}};
    render(<AdminDeploymentTargets/>);await chooseProductionScope(user);
    expect(screen.getByText(/The 1% canary is active/i)).toBeInTheDocument();
    expect(screen.getAllByText("b".repeat(32))).toHaveLength(2);
    expect(screen.queryByRole("button",{name:"Approve 1% Worker version canary"})).not.toBeInTheDocument();
    expect(mocks.queueProductionWorkerCanary).not.toHaveBeenCalled();
  });

  it.each(["failed", "expired", "cancelled"])("allows a fresh explicit Owner operation after %s while reconciling repeated clicks", async status => {
    const user = userEvent.setup();
    const previousJobId = "2d35afb4-3739-40b9-b67d-9dff04debfce";
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime", workerRef: "smartspec-cloudflare-runtime" }];
    mocks.ingressPreflight = { ready: true, origin: "https://origin-staging.smartaihub.app", artifact: { sourceSha: "c".repeat(40) }, planDigest: "d".repeat(64) };
    mocks.ingressJob = { jobId: previousJobId, status };
    sessionStorage.setItem(`smartaihub-production-ingress:${tenantId}:${projectId}:production`, JSON.stringify({ submissionId: previousJobId, planDigest: "b".repeat(64) }));
    render(<AdminDeploymentTargets />); await chooseProductionScope(user);
    const button = screen.getByRole("button", { name: "Approve corrected Cloudflare ingress migration" });
    expect(button).toBeEnabled(); expect(screen.getByText(/does not reuse the expired grant/)).toBeInTheDocument();
    await user.click(button); await user.click(button);
    const first = mocks.queueProductionIngress.mock.calls[0][0];
    expect(first.submissionId).not.toBe(previousJobId);
    expect(first.planDigest).toBe("d".repeat(64));
    expect(mocks.queueProductionIngress.mock.calls[1][0]).toEqual(first);
  });

  it.each(["queued", "running", "succeeded", "review_required"])("blocks a duplicate ingress operation while the canonical job is %s", async status => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime", workerRef: "smartspec-cloudflare-runtime" }];
    mocks.ingressPreflight = { ready: true, origin: "https://origin-staging.smartaihub.app", artifact: { sourceSha: "c".repeat(40) }, planDigest: "d".repeat(64) };
    mocks.ingressJob = { jobId: "2d35afb4-3739-40b9-b67d-9dff04debfce", status };
    render(<AdminDeploymentTargets />); await chooseProductionScope(user);
    expect(screen.getByRole("button", { name: "Approve Cloudflare ingress canary and start migration" })).toBeDisabled();
    expect(mocks.queueProductionIngress).not.toHaveBeenCalled();
  });

  it("shows the serving ingress receipt separately from the retained Linux runtime", async () => {
    const user=userEvent.setup();
    mocks.targets=[{...existingTarget,environment:"production",deploymentTargetId:"smartspec-cloudflare-runtime",workerRef:"smartspec-cloudflare-runtime",runtimePolicy:null}];
    mocks.ingressPreflight={ready:false,reason:"INGRESS_ROUTE_ALREADY_EXISTS"};
    mocks.ingressJob={jobId:"11111111-1111-4111-8111-111111111111",status:"succeeded",output:{productionTrafficShifted:true,routeId:"f".repeat(32)}};
    render(<AdminDeploymentTargets/>);await chooseProductionScope(user);
    expect(screen.getByText(/Application runtime: Linux/i)).toBeInTheDocument();
    expect(screen.getByText("f".repeat(32))).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Approve Cloudflare ingress canary and start migration"})).not.toBeInTheDocument();
  });

  it("allows keyboard selection among multiple verified production Tunnels and keeps the choice on inventory refresh", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.productionTunnels = [
      { id: "191d047e-674a-48f4-b105-b37269c2dad6", name: "smartspec-primary", status: "healthy" },
      { id: "288efe2d-034b-4532-811a-ee3e974d802b", name: "smartspec-secondary", status: "healthy" },
    ];
    const { rerender } = render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    const prepare = screen.getByRole("button", { name: "Prepare Production database connection" });
    const selector = screen.getByRole("combobox", { name: "Existing PostgreSQL Tunnel" });
    expect(prepare).toBeDisabled();
    await user.click(selector);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await waitFor(() => expect(prepare).toBeEnabled());
    expect(selector).toHaveTextContent("smartspec-secondary");

    rerender(<AdminDeploymentTargets />);
    expect(screen.getByRole("combobox", { name: "Existing PostgreSQL Tunnel" })).toHaveTextContent("smartspec-secondary");
    await user.click(prepare);
    await waitFor(() => expect(mocks.prepareProductionDatabase).toHaveBeenCalledWith({
      tenantId, projectId, environment: "production", tunnelId: "288efe2d-034b-4532-811a-ee3e974d802b", submissionId: expect.any(String),
    }));
  });

  it("explains and blocks empty, incomplete, unknown-status, and malformed Tunnel inventory", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.productionTunnels = [
      { id: "not-a-uuid", name: "smartspec-invalid", status: "healthy" },
      { id: "191d047e-674a-48f4-b105-b37269c2dad6", name: "smartspec-unknown" },
      { id: "288efe2d-034b-4532-811a-ee3e974d802b", name: "smartspec-connecting", status: "connecting" },
    ];
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);

    expect(screen.getByRole("alert", { name: "" })).toHaveTextContent(/No verified production-capable Tunnel is available/);
    expect(screen.getByText(/invalid tunnel ID/)).toBeInTheDocument();
    expect(screen.getByText(/health status not reported/)).toBeInTheDocument();
    expect(screen.getByText(/status connecting/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare Production database connection" })).toBeDisabled();
  });

  it("does not offer or submit a Tunnel when the inventory is empty or incomplete", async () => {
    const user = userEvent.setup();
    mocks.targets = [{ ...existingTarget, environment: "production", deploymentTargetId: "smartspec-cloudflare-runtime",
      workerRef: "smartspec-cloudflare-runtime", runtimePolicy: null }];
    mocks.productionTunnels = [];
    const { rerender } = render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);
    expect(screen.getByRole("alert", { name: "" })).toHaveTextContent(/No verified production-capable Tunnel is available/);
    expect(screen.getByRole("button", { name: "Prepare Production database connection" })).toBeDisabled();

    mocks.tunnelInventoryComplete = false;
    rerender(<AdminDeploymentTargets />);
    expect(screen.getByText(/Tunnel inventory is incomplete/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare Production database connection" })).toBeDisabled();
    expect(mocks.prepareProductionDatabase).not.toHaveBeenCalled();
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

  it("automatically verifies the existing browser session once while the same ingress job holds its lease",async()=>{
    const user=userEvent.setup();
    mocks.targets=[{...existingTarget,environment:"production",deploymentTargetId:"smartspec-cloudflare-runtime",workerRef:"smartspec-cloudflare-runtime"}];
    const receipt={routeId:"a".repeat(32),deploymentId:"22222222-2222-4222-8222-222222222222",versionId:"33333333-3333-4333-8333-333333333333"};
    mocks.ingressJob={jobId:"11111111-1111-4111-8111-111111111111",status:"running",requesterUserId:17,
      progress:{stage:"AWAITING_AUTHENTICATED_ACCEPTANCE",measured:receipt}};
    const {rerender}=render(<AdminDeploymentTargets/>);await chooseProductionScope(user);
    await waitFor(()=>expect(mocks.verifyIngressBrowser).toHaveBeenCalledTimes(1));
    expect(mocks.verifyIngressBrowser).toHaveBeenCalledWith({jobId:mocks.ingressJob.jobId,requesterUserId:17,tenantId,receipt});
    rerender(<AdminDeploymentTargets/>);
    expect(mocks.verifyIngressBrowser).toHaveBeenCalledTimes(1);
    expect(mocks.queueProductionIngress).not.toHaveBeenCalled();
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

  it("shows exactly one mandate authorization after server plan readiness and confirms the reviewed scope", async () => {
    const user = userEvent.setup();
    const plan = { schemaVersion: "cloudflare.first-migration-mandate.v1", missionId: `cf-migration:${"a".repeat(32)}`,
      tenantId, ownerUserId: 17, projectId, environment: "production", targetId: "smartspec-cloudflare-runtime",
      accountRef: "f".repeat(32), zoneId: "e".repeat(32), routePattern: "smartaihub.app/*",
      resourceIds: { queueId: "a".repeat(32), deadLetterQueueId: "b".repeat(32), vpcServiceId: "87654321-4321-4321-8321-cba987654321",
        hyperdriveId: "c".repeat(32), nodeApplicationId: "d".repeat(32), pythonApplicationId: "e".repeat(32) },
      actions: ["deploy_worker", "native_runtime_activation"],
      resourceBudget: { maxProviderWrites: 20, maxWorkerDeployments: 2, maxContainerStarts: 4,
        maxContainerReservedSeconds: 1800, maxQueueMessages: 100, maxSyntheticCredits: 60, syntheticFinancialMinorUnits: 0 },
      rollbackPolicy: { preserveM2Ingress: true, preserveLinuxFallback: true, containersOnDemand: true,
        rollbackOnFailedAcceptance: true, requireOwnerForOutOfScopeAction: true }, revokedAt: null };
    mocks.migrationMandatePlan = { ready: true, plan, planDigest: "f".repeat(64), resourceBudget: plan.resourceBudget };
    mocks.migrationMandate = { mandate: null };
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);
    const authorize = await screen.findByRole("button", { name: "Authorize Complete First Cloudflare Migration" });
    expect(screen.getAllByRole("button", { name: "Authorize Complete First Cloudflare Migration" })).toHaveLength(1);
    await user.click(authorize);
    expect(await screen.findByText(/does not immediately change production traffic/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm one-time mandate" }));
    await waitFor(() => expect(mocks.enrollMigrationMandate).toHaveBeenCalledTimes(1));
    expect(mocks.enrollMigrationMandate).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, projectId, environment: "production", expectedPlanDigest: "f".repeat(64), plan,
    }));
  });

  it("does not offer mandate enrollment when the reviewed plan is blocked", async () => {
    const user = userEvent.setup();
    mocks.migrationMandatePlan = { ready: false, reason: "MIGRATION_MANDATE_RESOURCE_INVENTORY_INCOMPLETE", plan: null };
    mocks.migrationMandate = { mandate: null };
    render(<AdminDeploymentTargets />);
    await chooseProductionScope(user);
    expect(await screen.findByText("MIGRATION_MANDATE_RESOURCE_INVENTORY_INCOMPLETE")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize Complete First Cloudflare Migration" })).not.toBeInTheDocument();
    expect(mocks.enrollMigrationMandate).not.toHaveBeenCalled();
  });
});
