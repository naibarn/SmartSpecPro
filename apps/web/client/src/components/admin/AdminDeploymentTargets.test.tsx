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
  targets: [] as Array<Record<string, unknown>>,
  targetsError: false,
}));

vi.mock("wouter", () => ({ useLocation: () => ["/admin/settings", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ infrastructure: { listProviderDeploymentTargets: { invalidate: mocks.invalidate } } }),
    systemSettings: { listTenants: { useQuery: () => ({ data: [{ id: "8de1a509-6177-49b7-b57d-5d3b5228d75f", name: "Tenant One" }] }) } },
    infrastructure: {
      listDeploymentTargetProjects: { useQuery: () => ({ data: [{ projectId: "2fe8a309-8be6-4370-9813-8fb9cc4645a0", title: "Wiki", projectType: "workspace" }] }) },
      listProviderDeploymentTargets: { useQuery: () => ({ data: mocks.targets, isLoading: false, isError: mocks.targetsError, isFetching: false }) },
      getDeploymentCredentialState: { useQuery: () => ({ data: { status: "CONFIGURED" }, isLoading: false, isError: false }) },
      createProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.create, isPending: false, error: null }) },
      updateProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.update, isPending: false, error: null }) },
      disableProviderDeploymentTarget: { useMutation: () => ({ mutate: mocks.disable, isPending: false, error: null }) },
    },
  },
}));

const tenantId = "8de1a509-6177-49b7-b57d-5d3b5228d75f";
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
    await user.type(screen.getByLabelText("Approval or change provenance"), "change-123 approved by owner");
    await user.click(screen.getByRole("button", { name: "Record approved target" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      tenantId,
      projectId,
      environment: "staging",
      provider: "cloudflare",
      deploymentTargetId: "approved-worker",
      accountRef: null,
      workerRef: null,
      containerApplicationRef: null,
      provenance: "change-123 approved by owner",
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
