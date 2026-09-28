/**
 * RenderPanel coverage (this task). Proves:
 *  - "เรนเดอร์ไฟล์จริง" (final render) goes through an estimate/confirm gate
 *    (`AlertDialog`, `data-testid="render-final-confirm"`) instead of
 *    calling `queueRender` directly — matching decision D4 for every other
 *    paid stage.
 *  - Preview render stays one-click (no confirm dialog).
 *  - `VI_*` errors map to specific Thai/English copy via `describeViError`,
 *    an unknown/non-`VI_` code falls back to the generic message, and
 *    `VI_DOCUMENT_INVALID`'s raw Zod dump is never echoed (FE03).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@remotion/player", () => ({
  Player: () => <div data-testid="mock-remotion-player" />,
}));

const compileProjectQueryMock = vi.fn();
const costEstimateQueryMock = vi.fn();
const queueRenderMutateMock = vi.fn();

let queueRenderState: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: { message: string } | null;
} = { isPending: false, isError: false, isSuccess: false, error: null };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    videoProjects: {
      compileProject: { useQuery: (...args: unknown[]) => compileProjectQueryMock(...args) },
      getRenderCostEstimate: { useQuery: (...args: unknown[]) => costEstimateQueryMock(...args) },
      queueRender: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => {
            queueRenderMutateMock(input, opts);
            if (queueRenderState.isSuccess) {
              (opts.onSuccess as (r: unknown) => void)?.({ created: true });
            }
          },
          isPending: queueRenderState.isPending,
          isError: queueRenderState.isError,
          isSuccess: queueRenderState.isSuccess,
          error: queueRenderState.error,
        }),
      },
    },
  },
}));

import { RenderPanel } from "../RenderPanel";

const COMPILED = {
  kind: "single" as const,
  config: {
    id: "compiled",
    name: "compiled",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 240,
    layers: [],
  },
  cost: { estimatedCredits: 10, estimatedUsd: 0.5 },
};

function renderPanel() {
  return render(
    <RenderPanel lang="th" projectId={42} hasUnsavedChanges={false} onGoToQa={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queueRenderState = { isPending: false, isError: false, isSuccess: false, error: null };
  compileProjectQueryMock.mockReturnValue({ data: COMPILED, isLoading: false, isError: false });
  costEstimateQueryMock.mockReturnValue({
    data: { cost: { score: 5, cls: "medium", recommendPreRender: false } },
  });
});

describe("RenderPanel — final render confirm gate", () => {
  it("does not call queueRender when the final render button is clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText("เรนเดอร์ไฟล์จริง"));
    expect(queueRenderMutateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("render-final-confirm")).toBeInTheDocument();
  });

  it("calls queueRender with profile 'final' only after confirming", () => {
    renderPanel();
    fireEvent.click(screen.getByText("เรนเดอร์ไฟล์จริง"));
    fireEvent.click(screen.getByText("ยืนยันเรนเดอร์ไฟล์จริง"));
    expect(queueRenderMutateMock).toHaveBeenCalledWith(
      { projectId: 42, profile: "final" },
      expect.anything(),
    );
  });

  it("calls queueRender with profile 'preview' directly — no confirm dialog", () => {
    renderPanel();
    fireEvent.click(screen.getByText("เรนเดอร์ตัวอย่าง"));
    expect(queueRenderMutateMock).toHaveBeenCalledWith(
      { projectId: 42, profile: "preview" },
      expect.anything(),
    );
  });

  it("shows a one-line cost/quality distinction under each render button", () => {
    renderPanel();
    expect(screen.getByText(/เร็วและถูก/)).toBeInTheDocument();
    expect(screen.getByText(/คุณภาพเต็ม/)).toBeInTheDocument();
  });
});

describe("RenderPanel — VI_* error mapping", () => {
  it("maps VI_CLAIM_VIOLATION to its specific Thai message and shows the go-to-QA action", () => {
    queueRenderState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: { message: "VI_CLAIM_VIOLATION: 2 prohibited claim(s), 0 unmapped statement(s)" },
    };
    renderPanel();
    expect(screen.getByTestId("video-studio-render-error")).toHaveTextContent(
      /ข้อความอ้างสิทธิ์ที่ต้องห้าม/,
    );
    expect(screen.getByText("ไปที่ขั้นตอนตรวจสอบคุณภาพ")).toBeInTheDocument();
  });

  it("maps VI_DOCUMENT_INVALID to the friendly message and NEVER echoes the raw Zod dump", () => {
    const rawZodDump =
      "VI_DOCUMENT_INVALID: Invalid VideoProjectDocument: [{\"code\":\"invalid_type\",\"path\":[\"scenes\"]}]";
    queueRenderState = { isPending: false, isError: true, isSuccess: false, error: { message: rawZodDump } };
    renderPanel();
    const banner = screen.getByTestId("video-studio-render-error");
    expect(banner).toHaveTextContent(/ไม่ถูกต้องตามรูปแบบที่กำหนด/);
    expect(banner).not.toHaveTextContent(/invalid_type/);
    expect(screen.queryByText(/invalid_type/)).not.toBeInTheDocument();
  });

  it("maps an unmapped-but-known-shape VI_ code (VI_QUEUE_UNAVAILABLE) to its specific copy", () => {
    queueRenderState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: { message: "VI_QUEUE_UNAVAILABLE: redis down" },
    };
    renderPanel();
    expect(screen.getByTestId("video-studio-render-error")).toHaveTextContent(
      /ระบบคิวงานไม่พร้อมใช้งานชั่วคราว/,
    );
  });

  it("falls back to the generic message for an unrecognized VI_ code", () => {
    queueRenderState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: { message: "VI_SOME_FUTURE_CODE_NOT_YET_MAPPED: detail" },
    };
    renderPanel();
    expect(screen.getByTestId("video-studio-render-error")).toHaveTextContent(
      /งานล้มเหลว กรุณาลองใหม่อีกครั้งหรือติดต่อผู้ดูแลระบบ/,
    );
  });

  it("falls back to the generic message and never echoes a non-VI_ error verbatim", () => {
    queueRenderState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: { message: "TypeError: something exploded deep in the stack" },
    };
    renderPanel();
    const banner = screen.getByTestId("video-studio-render-error");
    expect(banner).not.toHaveTextContent(/something exploded deep in the stack/);
    expect(banner).toHaveTextContent(/งานล้มเหลว/);
  });

  it("routes the compile-error banner through the same VI_* mapping (never raw)", () => {
    compileProjectQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "VI_DOCUMENT_INVALID: Invalid VideoProjectDocument: [huge zod dump here]" },
    });
    renderPanel();
    const banner = screen.getByTestId("video-studio-compile-error");
    expect(banner).toHaveTextContent(/ไม่ถูกต้องตามรูปแบบที่กำหนด/);
    expect(banner).not.toHaveTextContent(/huge zod dump here/);
  });
});
