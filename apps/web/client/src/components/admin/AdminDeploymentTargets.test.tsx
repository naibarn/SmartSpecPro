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
  saveCredential: vi.fn(),
  revokeCredential: vi.fn(),
  targets: [] as Array<Record<string, unknown>>,
  targetsError: false,
}));

vi.mock("wouter", () => ({ useLocation: () => ["/admin/settings", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ infrastructure: {
      listProviderDeploymentTargets: { invalidate: mocks.invalidate },
      getDeploymentCredentialState: { invalidate: mocks.invalidate },
    } }),
    systemSettings: { listTenants: { useQuery: () => ({ data: [{ id: "tenant-ZCSKEM9s", name: "Tenant One" }] }) } },
    infrastructure: {
      listDeploymentTargetProjects: { useQuery: () => ({ data: [{ projectId: "2fe8a309-8be6-4370-9813-8fb9cc4645a0", title: "Wiki", projectType: "workspace" }] }) },
      listProviderDeploymentTargets: { useQuery: () => ({ data: mocks.targets, isLoading: false, isError: mocks.targetsError, isFetching: false }) },
      getDeploymentCredentialState: { useQuery: () => ({ data: { status: "CONFIGURED" }, isLoading: false, isError: false }) },
      createProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.create, isPending: false, error: null }) },
      updateProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.update, isPending: false, error: null }) },
      disableProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.disable, isPending: false, error: null }) },
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
};

async function chooseScope(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Authenticated tenant" }));
  await user.click(await screen.findByRole("option", { name: /Tenant One/ }));
  await user.click(screen.getByRole("combobox", { name: "Canonical project" }));
  await user.click(await screen.findByRole("option", { name: /Wiki/ }));
  await user.click(screen.getByRole("combobox", { name: "Environment" }));
  await user.click(await screen.findByRole("option", { name: "staging" }));
}

async function chooseProductionScope(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Authenticated tenant" }));
  await user.click(await screen.findByRole("option", { name: /Tenant One/ }));
  await user.click(screen.getByRole("combobox", { name: "Canonical project" }));
  await user.click(await screen.findByRole("option", { name: /Wiki/ }));
  await user.click(screen.getByRole("combobox", { name: "Environment" }));
  await user.click(await screen.findByRole("option", { name: "production" }));
}

describe("AdminDeploymentTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.targets = [];
    mocks.targetsError = false;
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
