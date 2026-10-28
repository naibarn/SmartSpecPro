// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudflareM3ParityOperations } from "./CloudflareM3ParityOperations";

const mock = vi.hoisted(() => ({
  ready: false,
  reason: "M3_PARITY_EXECUTOR_NOT_REGISTERED",
  refetch: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    infrastructure: {
      getCloudflareM3ParityOperation: {
        useQuery: (_input: unknown) => ({
          data: {
            job: null,
            preflight: mock.ready
              ? { ready: true, planDigest: "a".repeat(64), plan: {} }
              : { ready: false, reason: mock.reason },
          },
          isError: false,
          refetch: mock.refetch,
        }),
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
  it("requires confirmation, uses one stable submission ID, and reconciles ambiguous response", async () => {
    mock.ready = true;
    const view = render(<CloudflareM3ParityOperations {...props} />);
    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Review and authorize this bounded test",
      })[0]
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Authorize and submit once" })
    );
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledOnce());
    const request = mock.mutate.mock.calls[0][0];
    expect(request).toMatchObject({
      ...props,
      operation: "credit_billing_acceptance",
      submissionId: expect.any(String),
      planDigest: "a".repeat(64),
    });
    view.unmount();
    render(<CloudflareM3ParityOperations {...props} />);
    expect(screen.getAllByText(new RegExp(request.submissionId))).toHaveLength(
      1
    );
  });
});
