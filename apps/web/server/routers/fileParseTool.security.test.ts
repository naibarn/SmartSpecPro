import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("../_core/env", () => ({
  ENV: { webGatewayToken: "file-parse-token" },
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../middleware/contentAutomationGate", () => ({
  contentAutomationGate: vi.fn((_req: Request, _res: Response, next: () => void) => next()),
}));

// Mock global fetch for SSRF / file size tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { sanitizeCell, fileParseHandler } from "./fileParseTool";

const VALID_TOKEN = "file-parse-token";

function buildMockRequest(body: Record<string, unknown>): Request {
  return {
    headers: { "x-internal-token": VALID_TOKEN },
    body,
  } as unknown as Request;
}

function buildMockResponse(): { res: Response; statusMock: ReturnType<typeof vi.fn>; jsonMock: ReturnType<typeof vi.fn> } {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
  const res = { status: statusMock, json: jsonMock } as unknown as Response;
  return { res, statusMock, jsonMock };
}

/** Build a fake fetch response with the given CSV text */
function mockFetchCsvResponse(csvText: string, contentLength?: number): void {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(csvText);
  const chunks: Uint8Array[] = [encoded];
  let chunkIndex = 0;

  const mockReader = {
    read: vi.fn().mockImplementation(() => {
      if (chunkIndex < chunks.length) {
        return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
      }
      return Promise.resolve({ done: true, value: undefined });
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
  };

  const headers = new Map<string, string>();
  if (contentLength !== undefined) {
    headers.set("content-length", String(contentLength));
  }

  mockFetch.mockResolvedValue({
    ok: true,
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    body: { getReader: () => mockReader },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENABLE_CONTENT_AUTOMATION = "true";
});

// ────────────────────────────────────────────
// sanitizeCell unit tests (formula injection)
// ────────────────────────────────────────────

describe("fileParseTool security", () => {
  describe("formula injection vectors (sanitizeCell)", () => {
    it("strips = prefix from cell values", () => {
      expect(sanitizeCell("=CMD('echo hacked')")).toBe("CMD('echo hacked')");
    });

    it("strips + prefix from cell values", () => {
      expect(sanitizeCell("+cmd|' /C calc'!A0")).toBe("cmd|' /C calc'!A0");
    });

    it("strips - prefix from cell values", () => {
      expect(sanitizeCell("-2+3+cmd|' /C calc'!A0")).toBe("2+3+cmd|' /C calc'!A0");
    });

    it("strips @ prefix from cell values", () => {
      expect(sanitizeCell("@SUM(1+1)*cmd|' /C calc'!A0")).toBe("SUM(1+1)*cmd|' /C calc'!A0");
    });

    it("strips leading whitespace before formula prefix check", () => {
      // Leading whitespace is trimmed first, then formula prefix is stripped
      // "  =DANGEROUS()" → trimStart → "=DANGEROUS()" → strip prefix → "DANGEROUS()"
      const result = sanitizeCell("  =DANGEROUS()");
      expect(result).toBe("DANGEROUS()");
      expect(result).not.toContain("=DANGEROUS");
    });

    it("does not strip = in the middle of a value", () => {
      expect(sanitizeCell("price=100")).toBe("price=100");
    });

    it("strips multiple consecutive formula prefix characters", () => {
      // "+=@FORMULA" — all stripped
      expect(sanitizeCell("+=@FORMULA")).toBe("FORMULA");
    });

    it("returns empty string for null/undefined cell", () => {
      expect(sanitizeCell(null)).toBe("");
      expect(sanitizeCell(undefined)).toBe("");
    });
  });

  // ────────────────────────────────────────────
  // SSRF vectors (fileParseHandler)
  // ────────────────────────────────────────────

  describe("SSRF vectors", () => {
    it("rejects file URL with private IP 192.168.1.1", async () => {
      const req = buildMockRequest({ file_url: "https://192.168.1.1/data.csv", file_type: "csv" });
      const { res, statusMock, jsonMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(JSON.stringify(jsonMock.mock.calls)).toContain("blocked_host");
    });

    it("rejects file URL with private IP 10.0.0.1", async () => {
      const req = buildMockRequest({ file_url: "https://10.0.0.1/data.csv", file_type: "csv" });
      const { res, statusMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects file URL with private IP 172.16.0.1", async () => {
      const req = buildMockRequest({ file_url: "https://172.16.0.1/data.csv", file_type: "csv" });
      const { res, statusMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects file URL pointing to localhost (127.0.0.1)", async () => {
      const req = buildMockRequest({ file_url: "https://127.0.0.1/data.csv", file_type: "csv" });
      const { res, statusMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects file URL pointing to localhost hostname", async () => {
      const req = buildMockRequest({ file_url: "http://localhost/data.csv", file_type: "csv" });
      const { res, statusMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects file:// scheme", async () => {
      const req = buildMockRequest({ file_url: "file:///etc/passwd", file_type: "txt" });
      const { res, statusMock, jsonMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(JSON.stringify(jsonMock.mock.calls)).toContain("blocked_scheme");
    });

    it("rejects gopher:// scheme", async () => {
      const req = buildMockRequest({ file_url: "gopher://internal.host/data", file_type: "txt" });
      const { res, statusMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects dict:// scheme", async () => {
      const req = buildMockRequest({ file_url: "dict://internal.host/data", file_type: "txt" });
      const { res, statusMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects ftp:// scheme", async () => {
      const req = buildMockRequest({ file_url: "ftp://internal.host/data.csv", file_type: "csv" });
      const { res, statusMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects metadata IP 169.254.169.254 (cloud metadata)", async () => {
      const req = buildMockRequest({ file_url: "http://169.254.169.254/latest/meta-data/", file_type: "txt" });
      const { res, statusMock } = buildMockResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  // ────────────────────────────────────────────
  // File size limits
  // ────────────────────────────────────────────

  describe("file size limits", () => {
    it("rejects file with Content-Length header > 5MB", async () => {
      const OVER_LIMIT = 5 * 1024 * 1024 + 1;
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: (key: string) => key === "content-length" ? String(OVER_LIMIT) : null },
        body: { getReader: () => ({ read: vi.fn(), cancel: vi.fn() }) },
      });

      const req = buildMockRequest({ file_url: "https://cdn.example.com/large.csv", file_type: "csv" });
      const { res, statusMock, jsonMock } = buildMockResponse();

      await fileParseHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(JSON.stringify(jsonMock.mock.calls)).toContain("file_too_large");
    });

    it("accepts file with Content-Length exactly at 5MB boundary", async () => {
      const AT_LIMIT = 5 * 1024 * 1024;
      // Build a small CSV for the handler to actually parse
      const csvText = "topic\nTest topic 1\nTest topic 2\n";
      mockFetchCsvResponse(csvText, AT_LIMIT);

      // content-length is at limit, but body stream is small (mock won't hit streaming limit)
      // We need to mock it correctly: ok=true, content-length=5MB (passes), body returns small data
      const encoder = new TextEncoder();
      const encoded = encoder.encode(csvText);
      let done = false;
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: (key: string) => key === "content-length" ? String(AT_LIMIT) : null },
        body: {
          getReader: () => ({
            read: vi.fn().mockImplementation(() => {
              if (!done) { done = true; return Promise.resolve({ done: false, value: encoded }); }
              return Promise.resolve({ done: true, value: undefined });
            }),
            cancel: vi.fn(),
          }),
        },
      });

      const req = buildMockRequest({ file_url: "https://cdn.example.com/ok.csv", file_type: "csv" });
      const { res, statusMock } = buildMockResponse();

      await fileParseHandler(req, res);

      // Should NOT return 400 for file_too_large
      const statusCalls = statusMock.mock.calls.map((c: unknown[]) => c[0]);
      expect(statusCalls).not.toContain(400);
    });
  });

  // ────────────────────────────────────────────
  // Row limits
  // ────────────────────────────────────────────

  describe("row limits", () => {
    it("CSV: trims to max_rows data rows even if file has more rows", async () => {
      // Build CSV with 150 data rows
      const rows = Array.from({ length: 150 }, (_, i) => `Topic ${i + 1}`).join("\n");
      const csvText = `topic\n${rows}\n`;
      mockFetchCsvResponse(csvText);

      const req = buildMockRequest({
        file_url: "https://cdn.example.com/topics.csv",
        file_type: "csv",
        max_rows: 100,
      });
      const { res, jsonMock } = buildMockResponse();

      await fileParseHandler(req, res);

      const response = jsonMock.mock.calls[0]?.[0] as { items?: unknown[]; total_rows?: number };
      expect(response.items?.length).toBeLessThanOrEqual(100);
      // total_rows reflects the actual number in the file
      expect(response.total_rows).toBe(150);
    });
  });
});
