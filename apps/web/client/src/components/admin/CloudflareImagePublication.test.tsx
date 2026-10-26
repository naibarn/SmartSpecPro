// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudflareImagePublication } from "./CloudflareImagePublication";
const state = vi.hoisted(() => ({ mutate: vi.fn(), refetch: vi.fn(), ready: true, status: null as any, pending: false, error: null as any }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { infrastructure: {
  getCloudflareHttpImagePairPreflight: { useQuery: () => ({ data: state.ready ? { ready: true, sourceSha: "a".repeat(40), accountRef: "b".repeat(32), planDigest: "c".repeat(64) }
    : { ready: false, reason: "HTTP_IMAGE_CREDENTIAL_DENIED" }, isLoading: false }) },
  getCloudflareHttpImagePairSubmission: { useQuery: () => ({ data: state.status, refetch: state.refetch }) },
  queueCloudflareHttpImagePair: { useMutation: () => ({ mutateAsync: state.mutate, isPending: state.pending, error: state.error }) },
} } }));
const props = { tenantId: "tenant-test", projectId: "project-test" };
beforeEach(() => { sessionStorage.clear(); state.mutate.mockReset().mockResolvedValue(null); state.status = null; state.ready = true; state.pending = false; state.error = null; });
describe("image publication Owner action", () => {
  it("shows exact source and scopes one click to the two images without traffic activation", async () => {
    render(<CloudflareImagePublication {...props} />);
    expect(screen.getByText("a".repeat(40))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Authorize and publish Node/Python images" }));
    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(state.mutate.mock.calls[0][0]).toEqual({ ...props, submissionId: expect.any(String), planDigest: "c".repeat(64) });
    expect(screen.getByText(/Production traffic continues/)).toBeInTheDocument();
  });
  it("retains the same submission across a lost response and reload", async () => {
    state.mutate.mockRejectedValueOnce(Error("response lost"));
    const first = render(<CloudflareImagePublication {...props} />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    const input = state.mutate.mock.calls[0][0]; first.unmount();
    render(<CloudflareImagePublication {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Reconcile and continue the same publication" }));
    expect(state.mutate.mock.calls[1][0]).toEqual(input);
  });
  it("disables duplicate admission and shows real per-job registry receipts", () => {
    state.status = { published: true, diagnostics: [], jobs: ["node-http", "python-http"].map(runtime => ({ runtime, jobId: runtime,
      status: "succeeded", registryVerified: true, image: `registry.cloudflare.com/fixture/${runtime}@sha256:${"a".repeat(64)}` })) };
    render(<CloudflareImagePublication {...props} />);
    expect(screen.getByRole("button", { name: "Publication jobs accepted" })).toBeDisabled();
    expect(screen.getByText(/Both registry receipts verified/)).toBeInTheDocument();
    expect(screen.getAllByText(/registry.cloudflare.com\/fixture/)).toHaveLength(2);
  });
  it("discovers a published canonical pair without browser storage and shows its approved source", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    state.status = { submissionId: id, planDigest: "e".repeat(64), sourceSha: "d".repeat(40), published: true, diagnostics: [],
      jobs: ["node-http", "python-http"].map(runtime => ({ runtime, jobId: runtime, status: "succeeded", registryVerified: true, image: "registry-receipt" })) };
    render(<CloudflareImagePublication {...props} />);
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(`smartspec:cloudflare-image-pair:${props.tenantId}:${props.projectId}`)!)).toEqual({ id, digest: "e".repeat(64) }));
    expect(screen.getByText("d".repeat(40))).toBeInTheDocument();
    expect(screen.queryByText("a".repeat(40))).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("shows missing purpose credential and exact admission error", () => {
    state.ready = false; state.error = { message: "HTTP_IMAGE_APPROVAL_HTTP_403" };
    render(<CloudflareImagePublication {...props} />);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText("HTTP_IMAGE_CREDENTIAL_DENIED")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP_IMAGE_APPROVAL_HTTP_403");
  });
  it("replaces a stale browser hint with the verified canonical pair without republishing", async () => {
    const key = `smartspec:cloudflare-image-pair:${props.tenantId}:${props.projectId}`;
    sessionStorage.setItem(key, JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", digest: "c".repeat(64) }));
    const id = "11111111-1111-4111-8111-111111111111";
    state.status = { submissionId: id, planDigest: "e".repeat(64), published: true, diagnostics: [], pairResolution: [
      { submissionId: "22222222-2222-4222-8222-222222222222", runtime: "node-http", code: "HTTP_IMAGE_JOB_NOT_SUCCEEDED" }],
      jobs: ["node-http", "python-http"].map(runtime => ({ runtime, jobId: runtime, status: "succeeded", registryVerified: true, image: "registry-receipt" })) };
    render(<CloudflareImagePublication {...props} />);
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ id, digest: "e".repeat(64) }));
    expect(screen.getByRole("button")).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/HTTP_IMAGE_JOB_NOT_SUCCEEDED/)).toBeInTheDocument();
  });

  it("publishes a reviewed corrected source without resubmitting the incompatible published pair", async () => {
    const oldId = "11111111-1111-4111-8111-111111111111", sourceSha = "d".repeat(40);
    sessionStorage.setItem(`smartspec:cloudflare-image-pair:${props.tenantId}:${props.projectId}`, JSON.stringify({ id: oldId, digest: "e".repeat(64) }));
    state.status = { submissionId: oldId, sourceSha, planDigest: "e".repeat(64), published: true, diagnostics: [],
      jobs: ["node-http", "python-http"].map(runtime => ({ runtime, jobId: runtime, status: "succeeded", registryVerified: true })) };
    const view = render(<CloudflareImagePublication {...props} replacementForSourceSha={sourceSha} />);
    await userEvent.click(screen.getByRole("button", { name: "Authorize corrected Node/Python image publication" }));
    expect(state.mutate).toHaveBeenCalledOnce();
    const request = state.mutate.mock.calls[0][0]; expect(request.submissionId).not.toBe(oldId); expect(request.planDigest).toBe("c".repeat(64));
    view.unmount(); render(<CloudflareImagePublication {...props} replacementForSourceSha={sourceSha} />);
    await userEvent.click(screen.getByRole("button")); expect(state.mutate.mock.calls[1][0]).toEqual(request);
  });
  it("keeps a requested corrected publication visible while the older verified pair remains authoritative", () => {
    state.status = { sourceSha: "d".repeat(40), published: true, jobs: [], diagnostics: [], requestedPublication: {
      submissionId: "11111111-1111-4111-8111-111111111111", planDigest: "c".repeat(64), sourceSha: "a".repeat(40), published: false, diagnostics: [],
      jobs: [{ runtime: "node-http", jobId: "node-new", status: "running" }, { runtime: "python-http", jobId: "python-new", status: "queued" }] } };
    render(<CloudflareImagePublication {...props} replacementForSourceSha={"d".repeat(40)} />);
    expect(screen.getByText(/node-new/)).toBeInTheDocument(); expect(screen.getByText(/python-new/)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("does not republish the same incompatible source as a purported repair", () => {
    render(<CloudflareImagePublication {...props} replacementForSourceSha={"a".repeat(40)} />);
    expect(screen.getByRole("button")).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
  });

});
