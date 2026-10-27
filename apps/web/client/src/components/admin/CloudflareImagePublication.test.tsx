// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudflareImagePublication } from "./CloudflareImagePublication";

const state = vi.hoisted(() => ({ mutate: vi.fn(), refetch: vi.fn(), ready: true, status: null as any,
  baselineStatus: undefined as any, requestedStatus: undefined as any, planDigest: "c".repeat(64), pending: false, error: null as any }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { infrastructure: {
  getCloudflareHttpImagePairPreflight: { useQuery: () => ({ data: state.ready ? { ready: true, sourceSha: "a".repeat(40), accountRef: "b".repeat(32), planDigest: state.planDigest }
    : { ready: false, reason: "HTTP_IMAGE_CREDENTIAL_DENIED" }, isLoading: false }) },
  getCloudflareHttpImagePairSubmission: { useQuery: (input: any) => ({ data: input.submissionId
    ? state.requestedStatus ?? state.status : state.baselineStatus ?? state.status, refetch: state.refetch }) },
  queueCloudflareHttpImagePair: { useMutation: () => ({ mutateAsync: state.mutate, isPending: state.pending, error: state.error }) },
} } }));

const props = { tenantId: "tenant-test", projectId: "project-test" };
const pubJobs = (prefix: string) => ["node-http", "python-http"].map(runtime => ({ runtime, jobId: `${prefix}-${runtime}`, status: "succeeded", registryVerified: true }));
beforeEach(() => { sessionStorage.clear(); state.mutate.mockReset().mockResolvedValue(null); state.status = null; state.baselineStatus = undefined;
  state.requestedStatus = undefined; state.planDigest = "c".repeat(64); state.ready = true; state.pending = false; state.error = null; });

describe("image publication Owner action", () => {
  it("shows the reviewed source and submits one scoped pair without traffic activation", async () => {
    render(<CloudflareImagePublication {...props} />);
    expect(screen.getByText("a".repeat(40))).toBeInTheDocument();
    expect(screen.getByText("c".repeat(64))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Authorize and publish Node/Python images" }));
    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(state.mutate.mock.calls[0][0]).toEqual({ ...props, submissionId: expect.any(String), planDigest: "c".repeat(64) });
    expect(screen.getByText(/Production traffic continues/)).toBeInTheDocument();
  });

  it("reuses the same stable ID after an ambiguous response and reload", async () => {
    state.mutate.mockRejectedValueOnce(Error("response lost"));
    const first = render(<CloudflareImagePublication {...props} />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    const request = state.mutate.mock.calls[0][0]; first.unmount();
    render(<CloudflareImagePublication {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Reconcile and continue the same publication" }));
    expect(state.mutate.mock.calls[1][0]).toEqual(request);
  });

  it("automatically continues the same authorized pair after canonical partial admission", async () => {
    const submissionId = "77777777-7777-4777-8777-777777777777";
    const digest = "c".repeat(64), key = `smartspec:cloudflare-image-pair:${props.tenantId}:${props.projectId}`;
    sessionStorage.setItem(key, JSON.stringify({ id: submissionId, digest }));
    state.requestedStatus = { submissionId, sourceSha: "a".repeat(40), planDigest: digest, published: false, diagnostics: [],
      jobs: [{ runtime: "node-http", jobId: "node-job", status: "succeeded" },
        { runtime: "python-http", jobId: "python-job", status: "NOT_ADMITTED" }] };
    render(<CloudflareImagePublication {...props} />);
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    expect(state.mutate.mock.calls[0][0]).toEqual({ ...props, submissionId, planDigest: digest });
    expect(screen.getByText(/Continuing the already authorized image pair/)).toBeInTheDocument();
  });

  it("does not automatically retry a runtime rejected by the canonical policy", async () => {
    const submissionId = "88888888-8888-4888-8888-888888888888";
    const digest = "c".repeat(64), key = `smartspec:cloudflare-image-pair:${props.tenantId}:${props.projectId}`;
    sessionStorage.setItem(key, JSON.stringify({ id: submissionId, digest }));
    state.requestedStatus = { submissionId, sourceSha: "a".repeat(40), planDigest: digest, published: false,
      diagnostics: [{ runtime: "python-http", stage: "POLICY_CREATE", code: "HTTP_IMAGE_APPROVAL_HTTP_403" }],
      jobs: [{ runtime: "node-http", jobId: "node-job", status: "succeeded" },
        { runtime: "python-http", jobId: "python-job", status: "NOT_ADMITTED" }] };
    render(<CloudflareImagePublication {...props} />);
    await waitFor(() => expect(screen.getByText(/python-http: POLICY_CREATE/)).toBeInTheDocument());
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("shows a verified pair matching the plan and prevents duplicate admission", () => {
    state.status = { published: true, planDigest: "c".repeat(64), diagnostics: [], jobs: pubJobs("published").map(job => ({ ...job,
      image: `registry.cloudflare.com/fixture/${job.runtime}@sha256:${"a".repeat(64)}` })) };
    render(<CloudflareImagePublication {...props} />);
    expect(screen.getByRole("button", { name: "Publication jobs accepted" })).toBeDisabled();
    expect(screen.getByText(/Both registry receipts verified/)).toBeInTheDocument();
    expect(screen.getAllByText(/registry.cloudflare.com\/fixture/)).toHaveLength(2);
  });

  it("discovers a published canonical pair without treating it as a pending Owner request", () => {
    state.planDigest = "e".repeat(64);
    state.status = { submissionId: "11111111-1111-4111-8111-111111111111", planDigest: "e".repeat(64), sourceSha: "d".repeat(40),
      published: true, diagnostics: [], jobs: pubJobs("old") };
    render(<CloudflareImagePublication {...props} />);
    expect(screen.getByText("d".repeat(40))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publication jobs accepted" })).toBeDisabled();
    expect(sessionStorage.getItem(`smartspec:cloudflare-image-pair:${props.tenantId}:${props.projectId}`)).toBeNull();
  });

  it("uses a new ID when the saved ID still resolves to an old published plan", async () => {
    const oldId = "22222222-2222-4222-8222-222222222222", key = `smartspec:cloudflare-image-pair:${props.tenantId}:${props.projectId}`;
    const oldPair = { submissionId: oldId, sourceSha: "d".repeat(40), planDigest: "e".repeat(64), published: true, diagnostics: [], jobs: pubJobs("old") };
    sessionStorage.setItem(key, JSON.stringify({ id: oldId, digest: oldPair.planDigest })); state.status = oldPair;
    const view = render(<CloudflareImagePublication {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Authorize the current image plan" }));
    const request = state.mutate.mock.calls[0][0];
    expect(request.submissionId).not.toBe(oldId); expect(request.planDigest).toBe("c".repeat(64));
    expect(screen.getByText(/Last verified published source/)).toBeInTheDocument(); expect(screen.getByText(/old-node-http/)).toBeInTheDocument();
    state.requestedStatus = { submissionId: request.submissionId, sourceSha: "a".repeat(40), planDigest: request.planDigest,
      published: false, diagnostics: [], jobs: ["node-http", "python-http"].map(runtime => ({ runtime, jobId: `new-${runtime}`, status: "queued" })) };
    view.rerender(<CloudflareImagePublication {...props} />);
    expect(screen.getByText(new RegExp(request.submissionId))).toBeInTheDocument(); expect(screen.getByText(/new-node-http/)).toBeInTheDocument();
    view.unmount(); render(<CloudflareImagePublication {...props} />);
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ id: request.submissionId, digest: "c".repeat(64) });
    expect(screen.getByText(/new-python-http/)).toBeInTheDocument(); expect(state.mutate).toHaveBeenCalledOnce();
  });

  it("does not let the old canonical response overwrite a new digest in local storage", async () => {
    const staleId = "22222222-2222-4222-8222-222222222222", key = `smartspec:cloudflare-image-pair:${props.tenantId}:${props.projectId}`;
    sessionStorage.setItem(key, JSON.stringify({ id: staleId, digest: "c".repeat(64) }));
    state.status = { submissionId: staleId, planDigest: "e".repeat(64), published: true, diagnostics: [], jobs: pubJobs("old") };
    render(<CloudflareImagePublication {...props} />);
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ id: staleId, digest: "c".repeat(64) });
    await userEvent.click(screen.getByRole("button", { name: "Authorize the current image plan" }));
    expect(state.mutate.mock.calls[0][0].submissionId).not.toBe(staleId);
  });

  it("retains an explicitly requested corrected pair while the previous published pair remains baseline", () => {
    const activeId = "11111111-1111-4111-8111-111111111111", oldSource = "d".repeat(40);
    sessionStorage.setItem(`smartspec:cloudflare-image-repair:${props.tenantId}:${props.projectId}:${oldSource}`,
      JSON.stringify({ id: activeId, digest: "c".repeat(64) }));
    state.status = { submissionId: "older-published", planDigest: "e".repeat(64), sourceSha: oldSource, published: true, jobs: [], diagnostics: [],
      requestedPublication: { submissionId: activeId, planDigest: "c".repeat(64), sourceSha: "a".repeat(40), published: false, diagnostics: [],
        jobs: [{ runtime: "node-http", jobId: "node-new", status: "running" }, { runtime: "python-http", jobId: "python-new", status: "queued" }] } };
    render(<CloudflareImagePublication {...props} replacementForSourceSha={oldSource} />);
    expect(screen.getByText(/node-new/)).toBeInTheDocument(); expect(screen.getByText(/python-new/)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
  });

  it("keeps mutation and preflight errors visible", () => {
    state.ready = false; state.error = { message: "HTTP_IMAGE_APPROVAL_HTTP_403" };
    render(<CloudflareImagePublication {...props} />);
    expect(screen.getByRole("button")).toBeDisabled(); expect(screen.getByText("HTTP_IMAGE_CREDENTIAL_DENIED")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP_IMAGE_APPROVAL_HTTP_403");
  });

  it("does not authorize repair when the requested source is still incompatible", () => {
    render(<CloudflareImagePublication {...props} replacementForSourceSha={"a".repeat(40)} />);
    expect(screen.getByRole("button")).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
  });
});
