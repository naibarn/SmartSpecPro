// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudflareNativeRuntimeOperation } from "./CloudflareNativeRuntimeOperation";
vi.mock("./CloudflareImagePublication", () => ({ CloudflareImagePublication: ({ replacementForSourceSha }: any) => <p>corrected-images:{replacementForSourceSha}</p> }));
const state = vi.hoisted(() => ({ continuation: false, ready: true, job: null as any, pending: null as any, error: null as any, mutationError: null as any,
  appReady: false, appReason: "application acceptance not prepared", appJob: null as any, appPending: null as any, appPreviousAcceptance: null as any,
  loading: false, busy: false, mutate: vi.fn(), refetch: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { infrastructure: {
  getCloudflareHttpRuntimeOperation: { useQuery: (input: any) => ({ isLoading: state.loading, error: state.error, refetch: state.refetch,
      data: input.operation === "application" ? { job: state.appJob, pending: state.appPending,
      preflight: state.appReady ? { ready: true, planDigest: "9".repeat(64), plan: { applicationFixture: { foreignTestTenantId: "tenant-codex-test" },
        previousApplicationAcceptance: state.appPreviousAcceptance,
        artifactRef: `sha256:${"b".repeat(64)}`, workerSourceSha: "c".repeat(40) } } : { ready: false, reason: state.appReason } }
      : { job: state.job, pending: state.pending, preflight: state.job && !state.continuation ? null : state.ready ? { ready: true, planDigest: "a".repeat(64),
      plan: { previousRuntime: state.continuation ? { jobId: state.job?.jobId } : null, candidate: { workerName: "existing-candidate" }, role: "sah_cf_app_fixture", relations: { tables: ["users", "worker_jobs"], rlsPolicyCount: 17 },
        artifactRef: `sha256:${"b".repeat(64)}`, workerSourceSha: "c".repeat(40) } } : { ready: false, reason: "HTTP_RUNTIME_VPC_ARTIFACT_REQUIRED" } } }) },
  prepareCloudflareHttpRuntime: { useMutation: () => ({ mutateAsync: state.mutate, isPending: state.busy, error: state.mutationError }) },
} } }));
const props = { tenantId: "tenant-fixture", projectId: "project-fixture", candidateJobId: "22222222-2222-4222-8222-222222222222" };
beforeEach(() => { sessionStorage.clear(); state.ready = true; state.continuation = false; state.appReady = false; state.appReason = "application acceptance not prepared"; state.appJob = null; state.appPending = null;
  state.appPreviousAcceptance = null; state.job = null; state.pending = null; state.error = null; state.mutationError = null;
  state.loading = false; state.busy = false; state.mutate.mockReset().mockResolvedValue({ jobId: "accepted-runtime" }); state.refetch.mockClear(); });
describe("bounded native runtime Owner operation", () => {
  it("reviews role, budgets, no traffic changes and incomplete full acceptance before one exact action", async () => {
    render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByText(/No new images/)).toHaveTextContent("No new images");
    expect(screen.getByText(/1,200 reserved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Authorize and test Node/Python on Cloudflare" }));
    expect(state.mutate).toHaveBeenCalledOnce(); expect(state.mutate.mock.calls[0][0]).toEqual({ ...props, submissionId: expect.any(String),
      planDigest: "a".repeat(64), artifactRef: `sha256:${"b".repeat(64)}`, workerSourceSha: "c".repeat(40) });
    expect(screen.queryByText(/queued/)).not.toBeInTheDocument();
  });
  it("preserves the exact submission across lost response and reload", async () => {
    state.mutate.mockRejectedValueOnce(Error("response lost"));
    const view = render(<CloudflareNativeRuntimeOperation {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Authorize and test Node/Python on Cloudflare" })); await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce());
    const request = state.mutate.mock.calls[0][0]; view.unmount();
    render(<CloudflareNativeRuntimeOperation {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Reconcile the same runtime test" }));
    expect(state.mutate.mock.calls[1][0]).toEqual(request);
  });
  it("discovers an admitted intent without sessionStorage and reconciles its canonical ID", async () => {
    state.pending = { submissionId: "original-owner-intent", planDigest: "d".repeat(64), candidateJobId: props.candidateJobId,
      artifactRef: `sha256:${"e".repeat(64)}`, workerSourceSha: "f".repeat(40), revoked: false, expiresAt: new Date(Date.now()+60_000).toISOString() };
    render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByText(/original-owner-intent/)).toHaveAttribute("role", "status");
    await userEvent.click(screen.getByRole("button", { name: "Reconcile the same runtime test" }));
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ submissionId: "original-owner-intent", planDigest: "d".repeat(64), workerSourceSha: "f".repeat(40) });
  });
  it("disables technical failure, revoked authority and existing canonical jobs", () => {
    state.ready = false;
    const view = render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByText(/VPC_ARTIFACT_REQUIRED/)).toHaveAttribute("role", "status"); expect(screen.getByRole("button", { name: "Authorize and test Node/Python on Cloudflare" })).toBeDisabled();
    state.ready = true; state.pending = { revoked: true, expiresAt: new Date(Date.now()+60_000).toISOString() };
    view.rerender(<CloudflareNativeRuntimeOperation {...props} />); expect(screen.getByRole("button", { name: "Authorize and test Node/Python on Cloudflare" })).toBeDisabled();
    state.pending = null; state.job = { jobId: "canonical-runtime-job", status: "running", attempt: 1, maxAttempts: 1,
      checkpoint: { stage: "NATIVE_RUNTIME_TESTING", deploymentId: "actual-deployment" } };
    view.rerender(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByRole("button", { name: "Tracking the existing runtime test" })).toBeDisabled(); expect(screen.getByText(/canonical-runtime-job · running/)).toHaveAttribute("role", "status");
    expect(screen.getByText(/actual-deployment/)).toBeInTheDocument(); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("reviews a fresh corrected plan without reusing the expired job ID and reconciles a lost response", async () => {
    state.continuation = true; state.job = { jobId: "old-exhausted-runtime", status: "failed", attempt: 2, maxAttempts: 2 };
    sessionStorage.setItem(`smartspec:native-runtime:${props.tenantId}:${props.projectId}:${props.candidateJobId}`, JSON.stringify({ submissionId: state.job.jobId, planDigest: "old" }));
    state.mutate.mockRejectedValueOnce(Error("response lost"));
    const view = render(<CloudflareNativeRuntimeOperation {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Authorize corrected images and bounded runtime test" }));
    const input = state.mutate.mock.calls[0][0]; expect(input.submissionId).not.toBe(state.job.jobId);
    view.unmount(); render(<CloudflareNativeRuntimeOperation {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Reconcile the same runtime test" }));
    expect(state.mutate.mock.calls[1][0]).toEqual(input);
  });
  it("allows a fresh corrected-image runtime operation when the compensated prior intent expired", async () => {
    state.continuation = true;
    state.job = { jobId: "old-exhausted-runtime", status: "failed", attempt: 2, maxAttempts: 2 };
    state.pending = { submissionId: state.job.jobId, planDigest: "old", candidateJobId: props.candidateJobId,
      artifactRef: `sha256:${"e".repeat(64)}`, workerSourceSha: "f".repeat(40), revoked: false,
      expiresAt: new Date(Date.now() - 60_000).toISOString() };
    sessionStorage.setItem(`smartspec:native-runtime:${props.tenantId}:${props.projectId}:${props.candidateJobId}`,
      JSON.stringify({ submissionId: state.job.jobId, planDigest: "old" }));
    render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByRole("button", { name: "Authorize corrected images and bounded runtime test" })).toBeEnabled();
    expect(screen.getByText(/expired after its attempts were exhausted/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Authorize corrected images and bounded runtime test" }));
    const input = state.mutate.mock.calls[0][0];
    expect(input.submissionId).not.toBe(state.job.jobId);
    expect(input.planDigest).toBe("a".repeat(64));
  });
  it("never describes a successful boot job as M3 acceptance", () => {
    state.job = { jobId: "canonical-runtime-job", status: "succeeded", attempt: 1, maxAttempts: 1, receipt: { runtimeBootVerified: true, m3Accepted: false } };
    render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByText(/M3_ACCEPTED: NO/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Tracking the existing runtime test" })).toBeDisabled();
  });
  it("submits one separate synthetic-only application acceptance under its own stable ID", async () => {
    state.appReady = true;
    const view = render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByText(/one temporary synthetic login/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Authorize synthetic application acceptance" }));
    expect(state.mutate).toHaveBeenCalledOnce();
    const request = state.mutate.mock.calls[0][0];
    expect(request).toMatchObject({ ...props, operation: "application", submissionId: expect.any(String), planDigest: "9".repeat(64) });
    expect(request.submissionId).not.toBe(state.job?.jobId);
    view.unmount(); render(<CloudflareNativeRuntimeOperation {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Reconcile the same application acceptance" }));
    expect(state.mutate.mock.calls[1][0]).toEqual(request);
  });
  it("shows the exact admission failure instead of silently swallowing the Owner action result", () => {
    state.appReady = true; state.mutationError = new Error("HTTP_RUNTIME_ADMISSION_UNKNOWN");
    render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP_RUNTIME_ADMISSION_UNKNOWN");
  });
  it("shows the exact blocked preflight stage and only offers a read-only recheck", async () => {
    state.appReady = false; state.appReason = "HTTP_RUNTIME_PREFLIGHT_DATABASE_ROLE_UNAVAILABLE";
    const view = render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByText("Blocked at DATABASE_ROLE")).toBeInTheDocument();
    expect(screen.getByText("HTTP_RUNTIME_PREFLIGHT_DATABASE_ROLE_UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recheck application preflight" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Authorize synthetic application acceptance" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Recheck application preflight" }));
    expect(state.refetch).toHaveBeenCalled();
    view.unmount();
  });
  it("offers a fresh application action only when the previous job is proven fully compensated", async () => {
    state.appReady = true;
    state.appJob = { jobId: "failed-application-job", status: "failed", attempt: 1, maxAttempts: 1, errorCode: "APPLICATION_AUTH_ACCEPTANCE_FAILED" };
    state.appPreviousAcceptance = { jobId: state.appJob.jobId };
    state.appPending = { submissionId: state.appJob.jobId, planDigest: "old-plan", candidateJobId: props.candidateJobId,
      artifactRef: `sha256:${"e".repeat(64)}`, workerSourceSha: "f".repeat(40), revoked: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString() };
    render(<CloudflareNativeRuntimeOperation {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Authorize a fresh compensated application acceptance" }));
    const request = state.mutate.mock.calls[0][0];
    expect(request.operation).toBe("application"); expect(request.submissionId).not.toBe(state.appJob.jobId);
    expect(request.planDigest).toBe("9".repeat(64));
  });
  it("shows the precise Node incompatibility and corrected publication action without repeating the failed runtime job", () => {
    state.job = { jobId: "canonical-runtime-job", status: "failed", attempt: 2, maxAttempts: 2, imageRepair: {
      code: "HTTP_IMAGE_NODE_RUNTIME_UNSUPPORTED", observedVersion: "22.22.3", requiredVersion: ">=22.23.4 <23", sourceSha: "d".repeat(40) } };
    render(<CloudflareNativeRuntimeOperation {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent("22.22.3"); expect(screen.getByText(/corrected-images:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tracking the existing runtime test" })).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
  });

});
