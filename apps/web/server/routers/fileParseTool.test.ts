import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import * as XLSX from "xlsx";

vi.mock("../_core/env", () => ({
  ENV: {
    webGatewayToken: "test-gateway-token",
    forgeApiUrl: "",
  },
}));

vi.mock("../services/libraryUrlPolicy", () => ({
  classifyHostSafety: vi.fn().mockReturnValue("ok"),
}));

vi.mock("../middleware/contentAutomationGate", () => ({
  contentAutomationGate: vi.fn((_req, _res, next) => next()),
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

import { fileParseHandler, sanitizeCell } from "./fileParseTool";
import { classifyHostSafety } from "../services/libraryUrlPolicy";

function buildRequest(overrides?: Record<string, unknown>): Request {
  return {
    headers: { "x-internal-token": "test-gateway-token" },
    body: {
      file_url: "https://uploads.example.com/data.csv",
      file_type: "csv",
      topic_column: "topic",
      ...overrides,
    },
  } as unknown as Request;
}

function buildResponse(): { res: Response; statusMock: ReturnType<typeof vi.fn>; jsonMock: ReturnType<typeof vi.fn> } {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
  const res = { status: statusMock, json: jsonMock } as unknown as Response;
  return { res, statusMock, jsonMock };
}

function makeCsvBuffer(rows: string[][]): Buffer {
  const csv = rows.map((r) => r.join(",")).join("\n");
  return Buffer.from(csv, "utf-8");
}

function makeXlsxBuffer(rows: string[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function mockFetch(bodyBuffer: Buffer, contentLength?: number): void {
  const headers = new Map<string, string>();
  if (contentLength !== undefined) {
    headers.set("content-length", String(contentLength));
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    body: {
      getReader: () => {
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: new Uint8Array(bodyBuffer) };
          },
          cancel: vi.fn(),
        };
      },
    },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(classifyHostSafety).mockReturnValue("ok");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fileParseHandler", () => {
  describe("authentication", () => {
    it("returns 401 when X-Internal-Token is missing", async () => {
      const req = buildRequest();
      (req.headers as Record<string, string>)["x-internal-token"] = "";
      const { res, statusMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("returns 401 when X-Internal-Token does not match", async () => {
      const req = buildRequest();
      (req.headers as Record<string, string>)["x-internal-token"] = "wrong";
      const { res, statusMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe("URL validation (SSRF prevention)", () => {
    it("rejects file:// scheme", async () => {
      const req = buildRequest({ file_url: "file:///etc/passwd" });
      const { res, statusMock, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it("rejects gopher:// scheme", async () => {
      const req = buildRequest({ file_url: "gopher://example.com/file" });
      const { res, statusMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects file URL pointing to private IP", async () => {
      vi.mocked(classifyHostSafety).mockReturnValue("blocked_local_private_host");
      const req = buildRequest({ file_url: "https://192.168.1.1/file.csv" });
      const { res, statusMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects file URL pointing to localhost", async () => {
      vi.mocked(classifyHostSafety).mockReturnValue("blocked_local_private_host");
      const req = buildRequest({ file_url: "https://localhost/file.csv" });
      const { res, statusMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("allows file URL with /uploads/ path", async () => {
      const csv = makeCsvBuffer([["topic"], ["React tutorial"]]);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://myapp.example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe("file size limits", () => {
    it("rejects file larger than 5MB via Content-Length header", async () => {
      const bigSize = 6 * 1024 * 1024;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (h: string) => h === "content-length" ? String(bigSize) : null },
        body: null,
      }));
      const req = buildRequest({ file_url: "https://example.com/uploads/big.csv" });
      const { res, statusMock, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe("CSV parsing", () => {
    it("parses CSV with topic_column and returns InputItem[]", async () => {
      const csv = makeCsvBuffer([["topic", "extra"], ["React hooks", "val1"], ["Vue 3", "val2"]]);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].topic).toBe("React hooks");
    });

    it("rejects CSV when topic_column does not match any header", async () => {
      const csv = makeCsvBuffer([["name", "age"], ["Alice", "30"]]);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv", topic_column: "topic" });
      const { res, statusMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("limits CSV to max_rows (default 100)", async () => {
      const rows: string[][] = [["topic"]];
      for (let i = 0; i < 150; i++) rows.push([`Topic ${i}`]);
      const csv = makeCsvBuffer(rows);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.items.length).toBeLessThanOrEqual(100);
      expect(result.total_rows).toBe(150);
    });

    it("strips formula prefix '=' from cell values", async () => {
      const csv = makeCsvBuffer([["topic"], ["=MALICIOUS()"]]);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.items[0].topic).not.toMatch(/^=/);
    });

    it("strips formula prefix '+' from cell values", async () => {
      const csv = makeCsvBuffer([["topic"], ["+1234567890"]]);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(jsonMock.mock.calls[0][0].items[0].topic).not.toMatch(/^\+/);
    });

    it("strips formula prefix '-' from cell values", async () => {
      const csv = makeCsvBuffer([["topic"], ["-1+2+3+cmd|' /C calc'!A0"]]);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(jsonMock.mock.calls[0][0].items[0].topic).not.toMatch(/^-/);
    });

    it("strips formula prefix '@' from cell values", async () => {
      const csv = makeCsvBuffer([["topic"], ["@SUM(1,2)"]]);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      expect(jsonMock.mock.calls[0][0].items[0].topic).not.toMatch(/^@/);
    });

    it("skips empty rows", async () => {
      const csv = Buffer.from("topic\nReact\n\nVue\n\n", "utf-8");
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.items.length).toBe(2);
    });
  });

  describe("XLSX parsing", () => {
    it("parses XLSX first sheet with topic_column", async () => {
      const xlsxBuf = makeXlsxBuffer([["topic", "extra"], ["React", "val"]]);
      mockFetch(xlsxBuf);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.xlsx", file_type: "xlsx" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.success).toBe(true);
      expect(result.items[0].topic).toBe("React");
    });
  });

  describe("TXT parsing", () => {
    it("per_line mode splits file by newline, each line becomes an InputItem", async () => {
      const txt = Buffer.from("First topic\nSecond topic\nThird topic", "utf-8");
      mockFetch(txt);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.txt", file_type: "txt", parse_mode: "per_line" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(3);
      expect(result.items[0].topic).toBe("First topic");
    });

    it("single mode uses entire file as one InputItem topic", async () => {
      const txt = Buffer.from("This is the entire article text.", "utf-8");
      mockFetch(txt);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.txt", file_type: "txt", parse_mode: "single" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.items).toHaveLength(1);
      expect(result.items[0].topic).toBe("This is the entire article text.");
    });

    it("strips empty lines in per_line mode", async () => {
      const txt = Buffer.from("Line one\n\nLine two\n\n", "utf-8");
      mockFetch(txt);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.txt", file_type: "txt", parse_mode: "per_line" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.items).toHaveLength(2);
    });
  });

  describe("response shape", () => {
    it("returns FileParseResponse with correct total_rows and parsed_rows", async () => {
      const csv = makeCsvBuffer([["topic"], ["Topic 1"], ["Topic 2"]]);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.total_rows).toBe(2);
      expect(result.parsed_rows).toBe(2);
    });

    it("includes warnings when rows are truncated", async () => {
      const rows: string[][] = [["topic"]];
      for (let i = 0; i < 150; i++) rows.push([`Topic ${i}`]);
      const csv = makeCsvBuffer(rows);
      mockFetch(csv);
      const req = buildRequest({ file_url: "https://example.com/uploads/data.csv" });
      const { res, jsonMock } = buildResponse();
      await fileParseHandler(req, res);
      const result = jsonMock.mock.calls[0][0];
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

describe("sanitizeCell", () => {
  it("strips leading = formula prefix", () => {
    expect(sanitizeCell("=SUM(1,2)")).not.toMatch(/^=/);
  });

  it("strips leading + prefix", () => {
    expect(sanitizeCell("+1234")).not.toMatch(/^\+/);
  });

  it("strips leading - prefix", () => {
    expect(sanitizeCell("-cmd")).not.toMatch(/^-/);
  });

  it("strips leading @ prefix", () => {
    expect(sanitizeCell("@MACRO")).not.toMatch(/^@/);
  });

  it("truncates to 5000 chars", () => {
    const long = "a".repeat(6000);
    expect(sanitizeCell(long).length).toBeLessThanOrEqual(5000);
  });

  it("returns empty string for null/undefined", () => {
    expect(sanitizeCell(null)).toBe("");
    expect(sanitizeCell(undefined)).toBe("");
  });
});
