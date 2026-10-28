// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CloudflareM3ParityOperations } from "./CloudflareM3ParityOperations";

const mock = vi.hoisted(() => ({
  ready: false,
  reason: "M3_PARITY_EXECUTOR_NOT_REGISTERED",
  refetch: vi.fn(),
  mutate: vi.fn(),
  queryInputs: [] as unknown[],
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    infrastructure: {
      getCloudflareM3ParityOperation: {
        useQuery: (input: unknown) => {
          mock.queryInputs.push(input);
          return ({
          data: {
            job: null,
            preflight: mock.ready
              ? { ready: true, planDigest: "a".repeat(64), plan: {} }
              : { ready: false, reason: mock.reason },
          },
          isError: false,
          refetch: mock.refetch,
          });
        },
      },
      prepareCloudflareM3ParityOperation: {
        useMutation: () => ({ mutateAsync: mock.mutate, isPending: false }),
      },
    },
  },
}));

const props = {
  tenantId: "tenant-1",
  projectId: "project-1",
  candidateJobId: "11111111-1111-4111-8111-111111111111",
  mandateActive: false,
  directOwnerActionAllowed: true,
};

describe("Cloudflare M3 parity operations", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() {
        this.open = false;
      },
    });
    mock.ready = false;
    mock.reason = "M3_PARITY_EXECUTOR_NOT_REGISTERED";
    mock.refetch.mockReset();
    mock.queryInputs = [];
    mock.mutate
      .mockReset()
      .mockResolvedValue({ jobId: "job-1", status: "queued" });
    sessionStorage.clear();
  });
  it("shows the exact blocker and does not submit while readiness is blocked", () => {
    render(<CloudflareM3ParityOperations {...props} />);
    expect(
      screen.getAllByText(/M3_PARITY_EXECUTOR_NOT_REGISTERED/)
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", {
        name: "Review and authorize this bounded test",
      })
    ).not.toBeInTheDocument();
  });
  it("starts once under the active mandate and reconciles the same submission", async () => {
    mock.ready = true;
    const view = render(<CloudflareM3ParityOperations {...props} mandateActive />);
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledTimes(2));
    const request = mock.mutate.mock.calls[0][0];
    expect(mock.mutate.mock.calls.map(([value]) => value.operation).sort()).toEqual([
      "credit_billing_acceptance", "queue_recovery_acceptance",
    ]);
    expect(request).toMatchObject({ tenantId: props.tenantId, projectId: props.projectId,
      candidateJobId: props.candidateJobId, operation: "credit_billing_acceptance",
      submissionId: expect.any(String), planDigest: "a".repeat(64) });
    view.unmount();
    render(<CloudflareM3ParityOperations {...props} />);
    expect(mock.queryInputs).toContainEqual(expect.objectContaining({
      operation: "credit_billing_acceptance", submissionId: request.submissionId,
    }));
  });

  it("keeps the explicit per-operation confirmation until a complete mandate is active", async () => {
    mock.ready = true;
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    render(<CloudflareM3ParityOperations {...props} />);
    expect(mock.mutate).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole("button", { name: "Authorize and start this bounded test" });
    buttons[0]!.click();
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mock.mutate.mock.calls[0][0].operation).toBe("credit_billing_acceptance");
    vi.unstubAllGlobals();
  });
});
