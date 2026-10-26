// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudflareNativeRuntimeOperation } from "./CloudflareNativeRuntimeOperation";
const state = vi.hoisted(() => ({ ready: true, job: null as any, pending: null as any, error: null as any, mutationError: null as any,
  loading: false, busy: false, mutate: vi.fn(), refetch: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { infrastructure: {
  getCloudflareHttpRuntimeOperation: { useQuery: () => ({ isLoading: state.loading, error: state.error, refetch: state.refetch,
    data: { job: state.job, pending: state.pending, preflight: state.job ? null : state.ready ? { ready: true, planDigest: "a".repeat(64),
      plan: { candidate: { workerName: "existing-candidate" }, role: "sah_cf_app_fixture", relations: { tables: ["users", "worker_jobs"], rlsPolicyCount: 17 },
        artifactRef: `sha256:${"b".repeat(64)}`, workerSourceSha: "c".repeat(40) } } : { ready: false, reason: "HTTP_RUNTIME_VPC_ARTIFACT_REQUIRED" } } }) },
  prepareCloudflareHttpRuntime: { useMutation: () => ({ mutateAsync: state.mutate, isPending: state.busy, error: state.mutationError }) },
} } }));
const props = { tenantId: "tenant-fixture", projectId: "project-fixture", candidateJobId: "22222222-2222-4222-8222-222222222222" };
beforeEach(() => { sessionStorage.clear(); state.ready = true; state.job = null; state.pending = null; state.error = null; state.mutationError = null;
  state.loading = false; state.busy = false; state.mutate.mockReset().mockResolvedValue({ jobId: "accepted-runtime" }); state.refetch.mockClear(); });
describe("bounded native runtime Owner operation", () => {
  it("reviews role, budgets, no traffic changes and incomplete full acceptance before one exact action", async () => {
    render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByText(/No new images/)).toHaveTextContent("No new images");
    expect(screen.getByText(/1,200 reserved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(state.mutate).toHaveBeenCalledOnce(); expect(state.mutate.mock.calls[0][0]).toEqual({ ...props, submissionId: expect.any(String),
      planDigest: "a".repeat(64), artifactRef: `sha256:${"b".repeat(64)}`, workerSourceSha: "c".repeat(40) });
    expect(screen.queryByText(/queued/)).not.toBeInTheDocument();
  });
  it("preserves the exact submission across lost response and reload", async () => {
    state.mutate.mockRejectedValueOnce(Error("response lost"));
    const view = render(<CloudflareNativeRuntimeOperation {...props} />);
    await userEvent.click(screen.getByRole("button")); await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce());
    const request = state.mutate.mock.calls[0][0]; view.unmount();
    render(<CloudflareNativeRuntimeOperation {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Reconcile the same runtime test" }));
    expect(state.mutate.mock.calls[1][0]).toEqual(request);
  });
  it("discovers an admitted intent without sessionStorage and reconciles its canonical ID", async () => {
    state.pending = { submissionId: "original-owner-intent", planDigest: "d".repeat(64), candidateJobId: props.candidateJobId,
      artifactRef: `sha256:${"e".repeat(64)}`, workerSourceSha: "f".repeat(40), revoked: false, expiresAt: new Date(Date.now()+60_000).toISOString() };
    render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("original-owner-intent");
    await userEvent.click(screen.getByRole("button"));
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ submissionId: "original-owner-intent", planDigest: "d".repeat(64), workerSourceSha: "f".repeat(40) });
  });
  it("disables technical failure, revoked authority and existing canonical jobs", () => {
    state.ready = false;
    const view = render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("VPC_ARTIFACT_REQUIRED"); expect(screen.getByRole("button")).toBeDisabled();
    state.ready = true; state.pending = { revoked: true, expiresAt: new Date(Date.now()+60_000).toISOString() };
    view.rerender(<CloudflareNativeRuntimeOperation {...props} />); expect(screen.getByRole("button")).toBeDisabled();
    state.pending = null; state.job = { jobId: "canonical-runtime-job", status: "running", attempt: 1, maxAttempts: 1,
      checkpoint: { stage: "NATIVE_RUNTIME_TESTING", deploymentId: "actual-deployment" } };
    view.rerender(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByRole("button")).toBeDisabled(); expect(screen.getByRole("status")).toHaveTextContent("canonical-runtime-job · running");
    expect(screen.getByText(/actual-deployment/)).toBeInTheDocument(); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("never describes a successful boot job as M3 acceptance", () => {
    state.job = { jobId: "canonical-runtime-job", status: "succeeded", attempt: 1, maxAttempts: 1, receipt: { runtimeBootVerified: true, m3Accepted: false } };
    render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByText(/M3_ACCEPTED: NO/)).toBeInTheDocument(); expect(screen.getByRole("button")).toBeDisabled();
  });
});
