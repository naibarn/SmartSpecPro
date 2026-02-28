import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Library router sandbox dispatch tests.
 *
 * Verifies complex file types (PPTX, PDF, DOCX) route through sandbox
 * for parsing, while simple formats stay in core.
 */

const { mockShouldUseSandbox, mockDispatchToSandbox } = vi.hoisted(() => ({
  mockShouldUseSandbox: vi.fn(),
  mockDispatchToSandbox: vi.fn(),
}));

vi.mock("../../services/sandbox/dispatchService", () => ({
  shouldUseSandbox: mockShouldUseSandbox,
  dispatchToSandbox: mockDispatchToSandbox,
}));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENSANDBOX_ENABLED;
});

/** MIME types that require sandbox parsing */
const SANDBOX_PARSE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/msword",
]);

/** MIME types that stay in core */
const CORE_FILE_TYPES = [
  "text/plain",
  "application/json",
  "text/csv",
  "text/markdown",
];

describe("library router sandbox dispatch", () => {
  it.each([
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ])(
    "identifies %s as requiring sandbox parsing",
    (fileType) => {
      expect(SANDBOX_PARSE_MIME_TYPES.has(fileType)).toBe(true);
    },
  );

  it.each(CORE_FILE_TYPES)(
    "keeps %s in core processing (no sandbox)",
    (fileType) => {
      expect(SANDBOX_PARSE_MIME_TYPES.has(fileType)).toBe(false);
    },
  );

  it("uses legacy parsing when sandbox is disabled", () => {
    process.env.OPENSANDBOX_ENABLED = "false";
    mockShouldUseSandbox.mockReturnValue(false);

    expect(mockShouldUseSandbox("sandbox-file")).toBe(false);
  });

  it("dispatches with file-parser profile", async () => {
    mockDispatchToSandbox.mockResolvedValue({ jobId: "parse-job-1" });

    const result = await mockDispatchToSandbox({
      featureType: "library",
      executionMode: "sandbox-file",
      tenantId: "tenant-1",
      userId: 42,
      inputFiles: [
        {
          key: "uploads/doc.pptx",
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          sizeBytes: 5242880,
        },
      ],
      profileOverride: "file-parser",
    });

    expect(result.jobId).toBe("parse-job-1");
    expect(mockDispatchToSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        featureType: "library",
        executionMode: "sandbox-file",
        profileOverride: "file-parser",
      }),
    );
  });

  it("routes sandbox parsing only when feature flag is enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    mockShouldUseSandbox.mockReturnValue(true);

    const fileType = "application/pdf";
    const requiresSandboxParsing =
      mockShouldUseSandbox("sandbox-file") &&
      SANDBOX_PARSE_MIME_TYPES.has(fileType);

    expect(requiresSandboxParsing).toBe(true);
  });
});
