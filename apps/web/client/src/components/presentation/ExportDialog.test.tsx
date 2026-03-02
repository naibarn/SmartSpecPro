/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ExportDialog } from "./ExportDialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Mock tRPC hooks
// ---------------------------------------------------------------------------

vi.mock("@/lib/trpc", () => ({
  trpc: {
    presentation: {
      triggerExport: { useMutation: vi.fn() },
      getExportStatus: { useQuery: vi.fn() },
      cancelExport: { useMutation: vi.fn() },
      listExports: { useQuery: vi.fn() },
    },
  },
}));

// Mock sonner toast to avoid DOM side effects
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMutationMock(overrides?: {
  mutate?: ReturnType<typeof vi.fn>;
  isPending?: boolean;
  options?: Record<string, unknown>;
}) {
  const mutate = overrides?.mutate ?? vi.fn();
  return {
    mutate,
    isPending: overrides?.isPending ?? false,
    isError: false,
    isSuccess: false,
    reset: vi.fn(),
  };
}

type MockStatusData = {
  status?: string;
  progressPct?: number;
  stage?: string | null;
  downloadUrl?: string | null;
  errorMessage?: string | null;
  outputBytes?: number | null;
};

function makeQueryMock(data?: MockStatusData) {
  return {
    data: data
      ? {
          schemaVersion: 1 as const,
          exportId: 99,
          status: data.status ?? "processing",
          format: "mp4" as const,
          progressPct: data.progressPct ?? 0,
          stage: data.stage ?? null,
          downloadUrl: data.downloadUrl ?? null,
          errorMessage: data.errorMessage ?? null,
          outputBytes: data.outputBytes ?? null,
          updatedAt: new Date(),
          warnings: [],
        }
      : undefined,
    isLoading: false,
    isError: false,
  };
}

function makeListExportsQueryMock(items: Array<Record<string, unknown>> = []) {
  return {
    data: items,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

const TRIGGER_SUCCESS_DATA = {
  schemaVersion: 1 as const,
  exportId: 99,
  deckId: 42,
  format: "mp4" as const,
  deduped: false,
  status: "queued" as const,
  renderSpec: {},
  warnings: [],
  message: undefined,
};

const DEFAULT_PROPS = {
  deckId: 42,
  open: true,
  onClose: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExportDialog", () => {
  beforeEach(() => {
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockReturnValue(
      makeMutationMock() as any,
    );
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
      makeQueryMock() as any,
    );
    vi.mocked(trpc.presentation.cancelExport.useMutation).mockReturnValue(
      makeMutationMock() as any,
    );
    vi.mocked(trpc.presentation.listExports.useQuery).mockReturnValue(
      makeListExportsQueryMock() as any,
    );
  });

  // 1. Format picker renders all four options
  it("renders all four format options", () => {
    render(<ExportDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText("MP4")).toBeDefined();
    expect(screen.getByText("PNG")).toBeDefined();
    expect(screen.getByText("JPG")).toBeDefined();
    expect(screen.getByText("PDF")).toBeDefined();
  });

  // 2. Quality picker conditional on format — shown for MP4 (default)
  it("shows quality picker when MP4 is selected (default)", () => {
    render(<ExportDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText("Draft")).toBeDefined();
    expect(screen.getByText("Standard")).toBeDefined();
    expect(screen.getByText("High")).toBeDefined();
  });

  // 3. Quality picker hidden for PNG
  it("hides quality picker when PNG is selected", () => {
    render(<ExportDialog {...DEFAULT_PROPS} />);
    // Click the PNG radio button
    const pngOption = screen.getByTestId("format-option-png");
    fireEvent.click(pngOption);
    expect(screen.queryByText("Draft")).toBeNull();
    expect(screen.queryByText("Standard")).toBeNull();
    expect(screen.queryByText("High")).toBeNull();
  });

  // 4. Quality picker hidden for PDF
  it("hides quality picker when PDF is selected", () => {
    render(<ExportDialog {...DEFAULT_PROPS} />);
    const pdfOption = screen.getByTestId("format-option-pdf");
    fireEvent.click(pdfOption);
    expect(screen.queryByText("Draft")).toBeNull();
    expect(screen.queryByText("Standard")).toBeNull();
    expect(screen.queryByText("High")).toBeNull();
  });

  // 5. Export button calls triggerExport mutation
  it("calls triggerExport mutation with selected format and quality when Export is clicked", () => {
    const mockMutate = vi.fn();
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockReturnValue(
      makeMutationMock({ mutate: mockMutate }) as any,
    );
    render(<ExportDialog {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("export-button"));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ format: "mp4", quality: "standard" }),
    );
  });

  // 6. triggerExport receives non-empty idempotencyKey
  it("triggerExport mutation is called with a non-empty idempotencyKey", () => {
    const mockMutate = vi.fn();
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockReturnValue(
      makeMutationMock({ mutate: mockMutate }) as any,
    );
    render(<ExportDialog {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId("export-button"));
    const callArg = mockMutate.mock.calls[0][0];
    expect(typeof callArg.idempotencyKey).toBe("string");
    expect(callArg.idempotencyKey.length).toBeGreaterThan(0);
  });

  it("does not start export when onBeforeExport returns false", async () => {
    const mockMutate = vi.fn();
    const onBeforeExport = vi.fn(async () => false);
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockReturnValue(
      makeMutationMock({ mutate: mockMutate }) as any,
    );

    render(<ExportDialog {...DEFAULT_PROPS} onBeforeExport={onBeforeExport} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("export-button"));
    });

    expect(onBeforeExport).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // 7. Dialog transitions to in-progress after triggerExport resolves
  it("shows progress bar after triggerExport onSuccess fires with exportId", () => {
    let capturedOnSuccess: ((data: any) => void) | undefined;
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
      (opts?: any) => {
        capturedOnSuccess = opts?.onSuccess;
        return makeMutationMock() as any;
      },
    );
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
      makeQueryMock({ status: "processing", progressPct: 0 }) as any,
    );

    render(<ExportDialog {...DEFAULT_PROPS} />);
    act(() => {
      capturedOnSuccess?.(TRIGGER_SUCCESS_DATA);
    });

    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  // 8. Progress bar shows progressPct
  it("progress bar reflects progressPct from getExportStatus", () => {
    let capturedOnSuccess: ((data: any) => void) | undefined;
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
      (opts?: any) => {
        capturedOnSuccess = opts?.onSuccess;
        return makeMutationMock() as any;
      },
    );
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
      makeQueryMock({ status: "processing", progressPct: 42 }) as any,
    );

    render(<ExportDialog {...DEFAULT_PROPS} />);
    act(() => {
      capturedOnSuccess?.(TRIGGER_SUCCESS_DATA);
    });

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("42");
  });

  // 9. Stage label renders raw stage value
  it("renders stage label 'rendering' when stage is 'rendering'", () => {
    let capturedOnSuccess: ((data: any) => void) | undefined;
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
      (opts?: any) => {
        capturedOnSuccess = opts?.onSuccess;
        return makeMutationMock() as any;
      },
    );
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
      makeQueryMock({ status: "processing", stage: "rendering" }) as any,
    );
    render(<ExportDialog {...DEFAULT_PROPS} />);
    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });
    expect(screen.getByText("rendering")).toBeDefined();
  });

  // 10. Stage label renders raw stage value
  it("renders stage label 'encoding' when stage is 'encoding'", () => {
    let capturedOnSuccess: ((data: any) => void) | undefined;
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
      (opts?: any) => {
        capturedOnSuccess = opts?.onSuccess;
        return makeMutationMock() as any;
      },
    );
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
      makeQueryMock({ status: "processing", stage: "encoding" }) as any,
    );
    render(<ExportDialog {...DEFAULT_PROPS} />);
    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });
    expect(screen.getByText("encoding")).toBeDefined();
  });

  // 11. Stage label renders raw stage value
  it("renders stage label 'uploading' when stage is 'uploading'", () => {
    let capturedOnSuccess: ((data: any) => void) | undefined;
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
      (opts?: any) => {
        capturedOnSuccess = opts?.onSuccess;
        return makeMutationMock() as any;
      },
    );
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
      makeQueryMock({ status: "processing", stage: "uploading" }) as any,
    );
    render(<ExportDialog {...DEFAULT_PROPS} />);
    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });
    expect(screen.getByText("uploading")).toBeDefined();
  });

  // 12. Polling stops when status is "done"
  it("refetchInterval returns false (polling stops) when status is done", () => {
    let capturedQueryOptions: any;
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockImplementation(
      (_input: any, opts?: any) => {
        capturedQueryOptions = opts;
        return makeQueryMock({ status: "done" }) as any;
      },
    );

    render(<ExportDialog {...DEFAULT_PROPS} />);

    const refetchResult = capturedQueryOptions?.refetchInterval?.({
      state: { data: { status: "done" } },
    });
    expect(refetchResult).toBe(false);
  });

  // 13. Polling stops when status is "error"
  it("refetchInterval returns false (polling stops) when status is error", () => {
    let capturedQueryOptions: any;
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockImplementation(
      (_input: any, opts?: any) => {
        capturedQueryOptions = opts;
        return makeQueryMock({ status: "error" }) as any;
      },
    );

    render(<ExportDialog {...DEFAULT_PROPS} />);

    const refetchResult = capturedQueryOptions?.refetchInterval?.({
      state: { data: { status: "error" } },
    });
    expect(refetchResult).toBe(false);
  });

  // 14. Download button calls window.open with downloadUrl when clicked
  it("shows a download button that calls window.open with the downloadUrl when status is done", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    let capturedOnSuccess: ((data: any) => void) | undefined;
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
      (opts?: any) => {
        capturedOnSuccess = opts?.onSuccess;
        return makeMutationMock() as any;
      },
    );
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
      makeQueryMock({
        status: "done",
        progressPct: 100,
        downloadUrl: "https://r2.example.com/export.mp4?token=abc",
      }) as any,
    );

    render(<ExportDialog {...DEFAULT_PROPS} />);
    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });

    const downloadBtn = screen.getByTestId("download-link");
    expect(downloadBtn).toBeDefined();
    fireEvent.click(downloadBtn);
    expect(openSpy).toHaveBeenCalledWith(
      "https://r2.example.com/export.mp4?token=abc",
      "_blank",
      "noopener",
    );
    openSpy.mockRestore();
  });

  // 15. Error message renders when status is "error"
  it("renders errorMessage text when status is error", () => {
    let capturedOnSuccess: ((data: any) => void) | undefined;
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
      (opts?: any) => {
        capturedOnSuccess = opts?.onSuccess;
        return makeMutationMock() as any;
      },
    );
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
      makeQueryMock({
        status: "error",
        errorMessage: "Render worker out of memory",
      }) as any,
    );

    render(<ExportDialog {...DEFAULT_PROPS} />);
    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });

    expect(screen.getByText("Render worker out of memory")).toBeDefined();
  });

  // 17. onError toast fires when triggerExport mutation fails (M2)
  it("shows an error toast when triggerExport mutation fails", () => {
    let capturedOnError: ((err: any) => void) | undefined;
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
      (opts?: any) => {
        capturedOnError = opts?.onError;
        return makeMutationMock() as any;
      },
    );

    render(<ExportDialog {...DEFAULT_PROPS} />);
    act(() => {
      capturedOnError?.({ message: "Quota exceeded" });
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Export failed to start: Quota exceeded",
    );
  });

  // 16. "Try Again" button resets dialog to format selection
  it("clicking Try Again resets to format selection phase", () => {
    let capturedOnSuccess: ((data: any) => void) | undefined;
    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
      (opts?: any) => {
        capturedOnSuccess = opts?.onSuccess;
        return makeMutationMock() as any;
      },
    );
    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
      makeQueryMock({ status: "error", errorMessage: "Failed" }) as any,
    );

    render(<ExportDialog {...DEFAULT_PROPS} />);
    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });

    // Click Try Again
    const tryAgainBtn = screen.getByTestId("try-again-button");
    fireEvent.click(tryAgainBtn);

    // Should be back at format selection — format picker visible again
    expect(screen.getByText("MP4")).toBeDefined();
    expect(screen.getByTestId("export-button")).toBeDefined();
  });

  it("renders recent export timestamp with time (not date only)", () => {
    vi.mocked(trpc.presentation.listExports.useQuery).mockReturnValue(
      makeListExportsQueryMock([
        {
          exportId: 501,
          format: "png",
          status: "done",
          downloadUrl: "https://example.com/export.zip",
          createdAt: "2026-03-01T22:17:00.000Z",
          progressPct: 100,
          errorMessage: null,
        },
      ]) as any,
    );

    render(<ExportDialog {...DEFAULT_PROPS} />);

    const createdAtText = screen.getByTestId("recent-export-created-at-501");
    expect(createdAtText.textContent ?? "").toMatch(/:\d{2}/);
  });
});
