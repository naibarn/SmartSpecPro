/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportPresentationDialog } from "./ImportPresentationDialog";

// ---------------------------------------------------------------------------
// Hoisted helpers (must be declared before vi.mock calls)
// ---------------------------------------------------------------------------

const locationSetterMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Mock tRPC
// ---------------------------------------------------------------------------

vi.mock("@/lib/trpc", () => ({
  trpc: {
    presentationImport: {
      startImport: { useMutation: vi.fn() },
      getImportStatus: { useQuery: vi.fn() },
      cancelImport: { useMutation: vi.fn() },
    },
    googleDrive: {
      getConnectionStatus: { useQuery: vi.fn() },
    },
    library: {
      uploadFile: { useMutation: vi.fn() },
    },
  },
}));

// Mock the XHR upload helper
vi.mock("./uploadPptxFile", () => ({
  uploadPptxFile: vi.fn(),
}));

// Mock wouter navigation
vi.mock("wouter", () => ({
  useLocation: () => ["/", locationSetterMock],
}));

// ---------------------------------------------------------------------------
// Import mocked modules (after vi.mock calls)
// ---------------------------------------------------------------------------

import { trpc } from "@/lib/trpc";
import { uploadPptxFile } from "./uploadPptxFile";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMutationMock(overrides?: {
  mutate?: ReturnType<typeof vi.fn>;
  mutateAsync?: ReturnType<typeof vi.fn>;
  isPending?: boolean;
}) {
  const mutate = overrides?.mutate ?? vi.fn();
  const mutateAsync = overrides?.mutateAsync ?? vi.fn().mockResolvedValue(undefined);
  return {
    mutate,
    mutateAsync,
    isPending: overrides?.isPending ?? false,
    isError: false,
    isSuccess: false,
    reset: vi.fn(),
  };
}

function makeQueryMock(data?: Record<string, unknown> | null, opts?: { isLoading?: boolean }) {
  return {
    data: data ?? undefined,
    isLoading: opts?.isLoading ?? false,
    isError: false,
  };
}

function makeFile(name = "test.pptx", size = 1_000_000): File {
  const file = new File(["x".repeat(Math.min(size, 100))], name, {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const DEFAULT_PROPS = {
  onClose: vi.fn(),
};

// ---------------------------------------------------------------------------
// Default mock setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
    makeMutationMock() as any,
  );
  vi.mocked(trpc.presentationImport.cancelImport.useMutation).mockReturnValue(
    makeMutationMock() as any,
  );
  vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
    makeQueryMock() as any,
  );
  vi.mocked(trpc.googleDrive.getConnectionStatus.useQuery).mockReturnValue(
    makeQueryMock({ status: "not_connected" }) as any,
  );
  vi.mocked(trpc.library.uploadFile.useMutation).mockReturnValue(
    makeMutationMock() as any,
  );
});

// Helper: select a file via the hidden file input
function selectFile(file: File) {
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(fileInput).toBeTruthy();
  fireEvent.change(fileInput, { target: { files: [file] } });
}

// Helper: switch to Google Slides tab using userEvent (Radix uses pointerdown)
async function switchToGSlidesTab() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const tab = screen.getByRole("tab", { name: /google slides/i });
  await user.click(tab);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ImportPresentationDialog", () => {
  // -------------------------------------------------------------------------
  // File validation (before upload)
  // -------------------------------------------------------------------------

  it("shows inline error and stays on select step when file exceeds 50 MB", () => {
    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);

    const oversized = makeFile("big.pptx", 52_428_801);
    selectFile(oversized);

    // Error message specifically about file size
    expect(screen.getByText(/too large/i)).toBeTruthy();

    // "Import" button is still visible (select step)
    expect(screen.getByRole("button", { name: /^import$/i })).toBeTruthy();
  });

  it("does not show error and stays on select step when file is within 50 MB limit", () => {
    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);

    const validFile = makeFile("valid.pptx", 1_000_000);
    selectFile(validFile);

    // No error message about file size (distinct from "Max 50 MB" badge)
    expect(screen.queryByText(/too large/i)).toBeNull();

    // Import button is enabled
    const importBtn = screen.getByRole("button", { name: /^import$/i });
    expect(importBtn).toBeTruthy();
    expect((importBtn as HTMLButtonElement).disabled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // PPTX upload flow
  // -------------------------------------------------------------------------

  it("advances step to 'uploading' when Import is clicked with a valid file", async () => {
    vi.mocked(uploadPptxFile).mockReturnValue(new Promise(() => {})); // never resolves

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    expect(screen.getByText(/uploading/i)).toBeTruthy();
  });

  it("updates progress bar value as upload progresses", async () => {
    vi.mocked(uploadPptxFile).mockImplementation(async (_file, onProgress) => {
      onProgress(50);
      return { libraryItemId: 99 };
    });

    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({
        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
      }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    // Progress bar should be in the DOM (either during upload or processing)
    await waitFor(() => {
      const progressBar = document.querySelector('[role="progressbar"]');
      expect(progressBar).toBeTruthy();
    });
  });

  it("calls startImport with sourceType 'pptx' and sourceLibraryItemId after upload success", async () => {
    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });

    const mockMutateAsync = vi.fn().mockResolvedValue({ conversionId: 7 });
    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({ mutateAsync: mockMutateAsync }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    const file = makeFile("slides.pptx");
    selectFile(file);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: "pptx",
          sourceLibraryItemId: 99,
          title: expect.any(String),
        }),
      );
    });
  });

  it("advances step to 'processing' and sets conversionId after upload + startImport success", async () => {
    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });

    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({
        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
      }) as any,
    );

    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
      makeQueryMock({
        status: "processing",
        progress: 10,
        fidelityWarnings: [],
        deckLibraryItemId: null,
        error: null,
      }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/processing/i)).toBeTruthy();
    });
  });

  it("advances step to 'error' and shows error message when upload fails", async () => {
    vi.mocked(uploadPptxFile).mockRejectedValue(new Error("Network error"));

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeTruthy();
    });
  });

  it("calls AbortController.abort() and resets step to 'select' when Cancel is clicked during upload", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    vi.mocked(uploadPptxFile).mockReturnValue(new Promise(() => {})); // never resolves

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    // Should be in uploading step
    expect(screen.getByText(/uploading/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    });

    expect(abortSpy).toHaveBeenCalled();

    // Should be back on select step
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^import$/i })).toBeTruthy();
    });

    abortSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Google Slides flow
  // -------------------------------------------------------------------------

  it("shows 'Connect Google Drive' button when OAuth is not connected", async () => {
    vi.mocked(trpc.googleDrive.getConnectionStatus.useQuery).mockReturnValue(
      makeQueryMock({ status: "not_connected" }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    await switchToGSlidesTab();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect google drive/i })).toBeTruthy();
    });
    expect(screen.queryByPlaceholderText(/docs\.google\.com/i)).toBeNull();
  });

  it("shows validation error for a non-Google Slides URL", async () => {
    vi.mocked(trpc.googleDrive.getConnectionStatus.useQuery).mockReturnValue(
      makeQueryMock({ status: "connected" }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    await switchToGSlidesTab();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/docs\.google\.com/i)).toBeTruthy();
    });

    const input = screen.getByPlaceholderText(/docs\.google\.com/i);
    fireEvent.change(input, { target: { value: "https://example.com/not-slides" } });

    const mockMutateAsync = vi.fn();
    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({ mutateAsync: mockMutateAsync }) as any,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    expect(screen.getByText(/valid google slides url/i)).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("calls startImport with sourceType 'google_slides' and slidesUrl for a valid URL", async () => {
    vi.mocked(trpc.googleDrive.getConnectionStatus.useQuery).mockReturnValue(
      makeQueryMock({ status: "connected" }) as any,
    );

    const mockMutateAsync = vi.fn().mockResolvedValue({ conversionId: 3 });
    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({ mutateAsync: mockMutateAsync }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    await switchToGSlidesTab();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/docs\.google\.com/i)).toBeTruthy();
    });

    const validUrl = "https://docs.google.com/presentation/d/abc123/edit";
    const input = screen.getByPlaceholderText(/docs\.google\.com/i);
    fireEvent.change(input, { target: { value: validUrl } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: "google_slides",
          slidesUrl: validUrl,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Processing step (polling)
  // -------------------------------------------------------------------------

  it("advances step to 'result' when polling returns status 'done'", async () => {
    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({
        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
      }) as any,
    );
    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
      makeQueryMock({
        status: "done",
        progress: 100,
        fidelityWarnings: [],
        deckLibraryItemId: 5,
        error: null,
      }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    // After upload + startImport resolve, step becomes "processing"
    // Then the useEffect sees status "done" and transitions to "result"
    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeTruthy();
    });
  });

  it("advances step to 'error' and shows error message when polling returns status 'failed'", async () => {
    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({
        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
      }) as any,
    );
    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
      makeQueryMock({
        status: "failed",
        progress: 0,
        fidelityWarnings: [],
        deckLibraryItemId: null,
        error: "PPTX corrupt",
      }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/PPTX corrupt/i)).toBeTruthy();
    });
  });

  it("calls cancelImport and resets to 'select' when Cancel is clicked during processing", async () => {
    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({
        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 42 }),
      }) as any,
    );
    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
      makeQueryMock({
        status: "processing",
        progress: 30,
        fidelityWarnings: [],
        deckLibraryItemId: null,
        error: null,
      }) as any,
    );

    const mockCancelMutate = vi.fn();
    vi.mocked(trpc.presentationImport.cancelImport.useMutation).mockReturnValue(
      makeMutationMock({ mutate: mockCancelMutate }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/processing/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    });

    expect(mockCancelMutate).toHaveBeenCalledWith({ conversionId: 42 });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^import$/i })).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Result step
  // -------------------------------------------------------------------------

  it("renders fidelityWarnings as list items in the result step", async () => {
    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({
        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
      }) as any,
    );
    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
      makeQueryMock({
        status: "done",
        progress: 100,
        fidelityWarnings: ["Oval approximated", "Table dropped"],
        deckLibraryItemId: 5,
        error: null,
      }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText("Oval approximated")).toBeTruthy();
      expect(screen.getByText("Table dropped")).toBeTruthy();
    });
  });

  it("navigates to the correct PresentationEditor route when 'Open Deck' is clicked", async () => {
    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
      makeMutationMock({
        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
      }) as any,
    );
    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
      makeQueryMock({
        status: "done",
        progress: 100,
        fidelityWarnings: [],
        deckLibraryItemId: 17,
        error: null,
      }) as any,
    );

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open deck/i })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /open deck/i }));
    });

    expect(locationSetterMock).toHaveBeenCalledWith("/presentation/17");
  });

  // -------------------------------------------------------------------------
  // Error step
  // -------------------------------------------------------------------------

  it("resets step to 'select' and clears error when 'Try Again' is clicked", async () => {
    vi.mocked(uploadPptxFile).mockRejectedValue(new Error("Upload failed"));

    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
    selectFile(makeFile());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });

    // Back to select step — error message gone, Import button visible
    expect(screen.queryByText(/upload failed/i)).toBeNull();
    expect(screen.getByRole("button", { name: /^import$/i })).toBeTruthy();
  });
});
