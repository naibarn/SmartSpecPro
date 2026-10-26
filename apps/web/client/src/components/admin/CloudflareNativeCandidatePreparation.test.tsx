// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudflareNativeCandidatePreparation } from "./CloudflareNativeCandidatePreparation";
const state = vi.hoisted(() => ({ ready: true, job: null as any, error: null as any, loading: false,
  pairDiagnostics: [] as any[], pending: false, mutationError: null as any, mutate: vi.fn(), refetch: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { infrastructure: {
  getCloudflareHttpCandidatePreparation: { useQuery: () => ({ isLoading: state.loading, error: state.error, refetch: state.refetch,
    data: { job: state.job, preflight: state.ready ? { ready: true, planDigest: "a".repeat(64), publishedPair: { submissionId: "canonical-pair", jobs: [{ jobId: "node-job", runtime: "node-http" }, { jobId: "python-job", runtime: "python-http" }] },
      plan: { workerName: "isolated-candidate", imageSourceSha: "b".repeat(40), artifactRef: `sha256:${"c".repeat(64)}`,
        workerSourceSha: "d".repeat(40), images: ["node@sha256:fixture", "python@sha256:fixture"] } }
      : { ready: false, reason: "HTTP_CANDIDATE_CANONICAL_MODULE_REQUIRED", pairDiagnostics: state.pairDiagnostics } } }) },
  prepareCloudflareHttpCandidate: { useMutation: () => ({ mutateAsync: state.mutate, isPending: state.pending, error: state.mutationError }) },
} } }));
const props = { tenantId: "tenant-fixture", projectId: "project-fixture" };
beforeEach(() => { sessionStorage.clear(); state.ready = true; state.job = null; state.error = null; state.loading = false;
  state.pairDiagnostics = []; state.pending = false; state.mutationError = null; state.mutate.mockReset().mockResolvedValue({ jobId: "accepted" }); });
describe("native metadata Owner action", () => {
  it("shows exact independent scope without claiming runtime or DNS readiness", async () => {
    render(<CloudflareNativeCandidatePreparation {...props} />);
    expect(screen.getByText(/no Container starts/)).toBeInTheDocument();
    expect(screen.getByText(/DNS inventory permission is not required/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(state.mutate.mock.calls[0][0]).toEqual({ ...props, submissionId: expect.any(String), planDigest: "a".repeat(64),
      artifactRef: `sha256:${"c".repeat(64)}`, workerSourceSha: "d".repeat(40) });
    expect(screen.queryByText(/queued/)).not.toBeInTheDocument();
  });
  it("retains exactly the same submission after response loss and page reload", async () => {
    state.mutate.mockRejectedValueOnce(Error("response lost"));
    const first = render(<CloudflareNativeCandidatePreparation {...props} />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    const submitted = state.mutate.mock.calls[0][0]; first.unmount();
    render(<CloudflareNativeCandidatePreparation {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Reconcile the same preparation" }));
    expect(state.mutate.mock.calls[1][0]).toEqual(submitted);
  });
  it("disables duplicates after canonical admission and shows real status", () => {
    state.job = { jobId: "canonical-job", status: "running", attempt: 1, maxAttempts: 1 };
    render(<CloudflareNativeCandidatePreparation {...props} />);
    expect(screen.getByRole("button")).toBeDisabled(); expect(screen.getByRole("status")).toHaveTextContent("canonical-job · running");
  });
  it("keeps missing artifact and authorization errors explicit", () => {
    state.ready = false; state.mutationError = { message: "HTTP_CANDIDATE_AUTHORIZATION_EXPIRED" };
    render(<CloudflareNativeCandidatePreparation {...props} />);
    expect(screen.getByRole("button")).toBeDisabled(); expect(screen.getByRole("status")).toHaveTextContent("CANONICAL_MODULE_REQUIRED");
    expect(screen.getByRole("alert")).toHaveTextContent("AUTHORIZATION_EXPIRED");
  });
  it("shows canonical pair and both verified jobs, and exact rejection diagnostics when unavailable", () => {
    const view = render(<CloudflareNativeCandidatePreparation {...props} />);
    expect(screen.getByText(/Published Pair: VERIFIED/)).toHaveTextContent("canonical-pair");
    expect(screen.getByText(/node-http: VERIFIED/)).toHaveTextContent("node-job");
    expect(screen.getByText(/python-http: VERIFIED/)).toHaveTextContent("python-job");
    state.ready = false;
    state.pairDiagnostics = [{ submissionId: "bad-pair", runtime: "python-http", jobId: "bad-job", code: "HTTP_IMAGE_REGISTRY_RECEIPT_DENIED" }];
    view.rerender(<CloudflareNativeCandidatePreparation {...props} />);
    expect(screen.getByText(/HTTP_IMAGE_REGISTRY_RECEIPT_DENIED/)).toHaveTextContent("bad-pair · python-http · bad-job");
    expect(screen.getByRole("button")).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
  });

});
