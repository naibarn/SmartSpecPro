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
  it("shows missing purpose credential and exact admission error", () => {
    state.ready = false; state.error = { message: "HTTP_IMAGE_APPROVAL_HTTP_403" };
    render(<CloudflareImagePublication {...props} />);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText("HTTP_IMAGE_CREDENTIAL_DENIED")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP_IMAGE_APPROVAL_HTTP_403");
  });
});
