import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HyperframesOperatorDiagnosticsPanel } from "../HyperframesOperatorDiagnosticsPanel";

const mocks = vi.hoisted(() => ({
  inspectQueryState: {
    data: null as unknown,
    error: null as Error | null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  useInspectQuery: vi.fn(),
  cancelMutate: vi.fn(),
  replayMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceCapture: {
      inspectHyperframesRenderDiagnostics: {
        useQuery: mocks.useInspectQuery,
      },
      cancelHyperframesRenderJobAsOperator: {
        useMutation: vi.fn(() => ({
          mutate: mocks.cancelMutate,
          isPending: false,
        })),
      },
      replayHyperframesDeadLetter: {
        useMutation: vi.fn(() => ({
          mutate: mocks.replayMutate,
          isPending: false,
        })),
      },
    },
  },
}));

describe("HyperframesOperatorDiagnosticsPanel", () => {
  beforeEach(() => {
    mocks.inspectQueryState = {
      data: null,
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    mocks.useInspectQuery.mockReturnValue(mocks.inspectQueryState);
    mocks.cancelMutate.mockReset();
    mocks.replayMutate.mockReset();
  });

  it("renders the Thai operator surface without requiring a render job upfront", () => {
    render(<HyperframesOperatorDiagnosticsPanel locale="th" />);

    expect(
      screen.getByLabelText("เครื่องมือวินิจฉัย HyperFrames สำหรับ operator")
    ).toBeTruthy();
    expect(screen.getByText("ใส่ Render job ID เพื่อโหลด diagnostics")).toBeTruthy();
    expect(screen.getByLabelText("Render job ID")).toBeTruthy();
  });

  it("replays with the backend diagnostics hash and operator replay token", () => {
    mocks.inspectQueryState.data = {
      redacted: true,
      operatorReplayToken: "hf_replay_12345678",
      diagnostics: ["sanitized retry reason"],
      render: {
        renderJobId: "hf_render_1",
        productId: "product_1",
        runId: "mar_1",
        status: "dead_lettered",
        compositionInputHash: "hf_input_current",
      },
    };

    render(
      <HyperframesOperatorDiagnosticsPanel
        renderJobId="hf_render_1"
        productId="product_1"
        runId="mar_1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /replay/i }));

    expect(mocks.replayMutate).toHaveBeenCalledWith({
      renderJobId: "hf_render_1",
      productId: "product_1",
      runId: "mar_1",
      currentCompositionInputHash: "hf_input_current",
      replayToken: "hf_replay_12345678",
      reason: "operator replay from sanitized diagnostics for hf_render_1",
    });
  });

  it("sends operator cancel requests only for active render states", () => {
    mocks.inspectQueryState.data = {
      redacted: true,
      operatorReplayToken: null,
      diagnostics: [],
      render: {
        renderJobId: "hf_render_1",
        productId: "product_1",
        runId: "mar_1",
        status: "rendering",
      },
    };

    render(
      <HyperframesOperatorDiagnosticsPanel
        renderJobId="hf_render_1"
        productId="product_1"
        runId="mar_1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mocks.cancelMutate).toHaveBeenCalledWith({
      renderJobId: "hf_render_1",
      productId: "product_1",
      runId: "mar_1",
      reason: "operator cancellation for hf_render_1",
    });
  });
});
