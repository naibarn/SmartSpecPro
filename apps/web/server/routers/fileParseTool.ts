import type { Express, Request, Response } from "express";
import Papa from "papaparse";

import { classifyHostSafety } from "../services/libraryUrlPolicy";
import { auditLogger } from "../services/auditLogger";
import type { AuditEventType } from "../services/auditLogger";
import { contentAutomationGate } from "../middleware/contentAutomationGate";
import { FileParseRequestSchema } from "@shared/contentAutomation/types";
import { compareCachedInternalToken, getCachedAppRuntimeConfig } from "../services/appRuntimeConfig";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_FETCH_REDIRECTS = 5;
const ALLOWED_FETCH_SCHEMES = new Set(["http:", "https:"]);
const BLOCKED_SCHEMES = new Set(["file:", "gopher:", "dict:", "ftp:"]);
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export function sanitizeCell(value: unknown): string {
  if (value == null) return "";
  let str = String(value).trimStart();
  // Strip formula injection prefixes (after trimming leading whitespace)
  str = str.replace(/^[=+\-@]+/, "");
  // Strip control characters (ASCII 0-31 except \n \r \t)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  // Truncate to 5000 chars
  if (str.length > 5000) str = str.slice(0, 5000);
  return str.trim();
}

function verifyInternalToken(req: Request): boolean {
  const token = req.headers["x-internal-token"] as string | undefined;
  return compareCachedInternalToken(token);
}

function emitAudit(eventType: string, metadata: Record<string, unknown>): void {
  auditLogger.log({ eventType: eventType as AuditEventType, userId: null, metadata });
}

function isAllowedUrl(parsed: URL): boolean {
  const runtimeConfig = getCachedAppRuntimeConfig();
  // Allow S3/R2 hosts from env
  const s3Endpoint = runtimeConfig.s3Endpoint;
  const r2Public = runtimeConfig.r2PublicUrl;
  if (s3Endpoint) {
    try {
      const s3Host = new URL(s3Endpoint).hostname;
      if (parsed.hostname === s3Host) return true;
    } catch { /* ignore */ }
  }
  if (r2Public) {
    try {
      const r2Host = new URL(r2Public).hostname;
      if (parsed.hostname === r2Host) return true;
    } catch { /* ignore */ }
  }

  // Allow public upload URLs and public hosts only after host safety checks.
  return classifyHostSafety(parsed.hostname) === "ok";
}

function validateFileUrl(parsed: URL): { code: string; message: string } | null {
  if (BLOCKED_SCHEMES.has(parsed.protocol) || !ALLOWED_FETCH_SCHEMES.has(parsed.protocol)) {
    return { code: "blocked_scheme", message: `Scheme '${parsed.protocol}' is not allowed` };
  }

  if (!isAllowedUrl(parsed)) {
    return { code: "blocked_host", message: "Private, local, or untrusted hosts are not allowed" };
  }

  return null;
}

async function fetchFileBuffer(initialUrl: URL): Promise<{ buffer: Buffer; error?: string }> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_FETCH_REDIRECTS; redirectCount++) {
    const response = await fetch(currentUrl.toString(), { redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { buffer: Buffer.alloc(0), error: "redirect_without_location" };
      if (redirectCount === MAX_FETCH_REDIRECTS) return { buffer: Buffer.alloc(0), error: "too_many_redirects" };

      const nextUrl = new URL(location, currentUrl);
      const redirectError = validateFileUrl(nextUrl);
      if (redirectError) return { buffer: Buffer.alloc(0), error: redirectError.code };
      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) {
      return { buffer: Buffer.alloc(0), error: "fetch_failed" };
    }

    // Check Content-Length first
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_BYTES) {
      return { buffer: Buffer.alloc(0), error: "file_too_large" };
    }

    // Stream with byte counter
    if (!response.body) {
      return { buffer: Buffer.alloc(0), error: "fetch_failed" };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > MAX_FILE_BYTES) {
          await reader.cancel();
          return { buffer: Buffer.alloc(0), error: "file_too_large" };
        }
        chunks.push(value);
      }
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { buffer };
  }

  return { buffer: Buffer.alloc(0), error: "too_many_redirects" };
}

function detectFileType(buffer: Buffer, explicitType?: string): "xlsx" | "csv" | "txt" | "unknown" {
  if (explicitType === "txt") return "txt";
  if (explicitType === "xlsx") return "xlsx";
  if (explicitType === "csv") return "csv";

  // Check ZIP magic bytes
  if (
    buffer.length >= 4 &&
    buffer[0] === ZIP_MAGIC[0] &&
    buffer[1] === ZIP_MAGIC[1] &&
    buffer[2] === ZIP_MAGIC[2] &&
    buffer[3] === ZIP_MAGIC[3]
  ) {
    return "xlsx";
  }

  // Check for valid UTF-8 text (no null bytes in first 512)
  const sample = buffer.slice(0, 512);
  if (!sample.includes(0x00)) return "csv";

  return "unknown";
}

function parseCsv(
  buffer: Buffer,
  topicColumn: string,
  paramsColumns: Record<string, string> | undefined,
  maxRows: number,
): {
  items: Array<{ topic: string; params?: Record<string, unknown> }>;
  totalRows: number;
  warnings: string[];
  error?: { code: string; message: string };
} {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const fields = result.meta.fields ?? [];
  if (!fields.includes(topicColumn)) {
    return {
      items: [],
      totalRows: 0,
      warnings: [],
      error: {
        code: "column_not_found",
        message: `Column '${topicColumn}' not found. Available: ${fields.join(", ")}`,
      },
    };
  }

  const warnings: string[] = [];
  const data = result.data;
  const totalRows = data.length;

  let rows = data;
  if (rows.length > maxRows) {
    rows = rows.slice(0, maxRows);
    warnings.push(`Truncated to ${maxRows} rows (file had ${totalRows})`);
  }

  const items = rows
    .map((row) => {
      const topic = sanitizeCell(row[topicColumn]);
      if (!topic) return null;
      const item: { topic: string; params?: Record<string, unknown> } = { topic };
      if (paramsColumns) {
        const params: Record<string, unknown> = {};
        for (const [paramKey, colName] of Object.entries(paramsColumns)) {
          if (row[colName] !== undefined) {
            params[paramKey] = sanitizeCell(row[colName]);
          }
        }
        if (Object.keys(params).length > 0) item.params = params;
      }
      return item;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return { items, totalRows, warnings };
}

function parseXlsx(
  _buffer: Buffer,
  _topicColumn: string,
  _paramsColumns: Record<string, string> | undefined,
  _maxRows: number,
): {
  items: Array<{ topic: string; params?: Record<string, unknown> }>;
  totalRows: number;
  warnings: string[];
  error?: { code: string; message: string };
} {
  return {
    items: [],
    totalRows: 0,
    warnings: [],
    error: {
      code: "unsupported_file_type",
      message: "XLSX parsing is disabled for security. Upload CSV or TXT instead.",
    },
  };
}

function parseTxt(
  buffer: Buffer,
  parseMode: "per_line" | "single",
  maxRows: number,
): {
  items: Array<{ topic: string }>;
  totalRows: number;
  warnings: string[];
} {
  const text = buffer.toString("utf-8");

  if (parseMode === "single") {
    const topic = sanitizeCell(text);
    return { items: topic ? [{ topic }] : [], totalRows: 1, warnings: [] };
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const warnings: string[] = [];
  const totalRows = lines.length;

  let rows = lines;
  if (rows.length > maxRows) {
    rows = rows.slice(0, maxRows);
    warnings.push(`Truncated to ${maxRows} rows (file had ${totalRows})`);
  }

  const items = rows.map((line) => ({ topic: sanitizeCell(line) })).filter((i) => i.topic);
  return { items, totalRows, warnings };
}

export async function fileParseHandler(req: Request, res: Response): Promise<void> {
  // 1. Authenticate
  if (!verifyInternalToken(req)) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // 2. Validate request body
  const parseResult = FileParseRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: "Invalid request body",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { file_url, file_type, topic_column, params_columns, parse_mode, max_rows } = parseResult.data;

  // 3. URL validation (SSRF prevention)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(file_url);
  } catch {
    res.status(400).json({ success: false, error: { code: "invalid_url", message: "Invalid URL" } });
    return;
  }

  const urlError = validateFileUrl(parsedUrl);
  if (urlError) {
    res.status(400).json({
      success: false,
      error: urlError,
    });
    return;
  }

  emitAudit("file_parse.started", { file_url: parsedUrl.origin + parsedUrl.pathname, file_type });

  // 4. Fetch file
  let buffer: Buffer;
  try {
    const result = await fetchFileBuffer(parsedUrl);
    if (result.error) {
      if (result.error === "file_too_large") {
        res.status(400).json({ success: false, error: { code: "file_too_large", message: "File exceeds 5MB limit" } });
      } else {
        res.status(400).json({ success: false, error: { code: result.error, message: "Failed to fetch file" } });
      }
      return;
    }
    buffer = result.buffer;
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : "Fetch error";
    res.status(400).json({ success: false, error: { code: "fetch_error", message: msg } });
    return;
  }

  // 5. Magic byte detection
  const detectedType = detectFileType(buffer, file_type);
  if (detectedType === "unknown") {
    res.status(400).json({
      success: false,
      error: { code: "unsupported_file_type", message: "File type not recognized. Expected CSV or TXT." },
    });
    return;
  }

  // 6. Parse
  const maxRowsValue = max_rows ?? 100;
  const topicCol = topic_column ?? "topic";

  let parseResultData: {
    items: Array<{ topic: string; params?: Record<string, unknown> }>;
    totalRows: number;
    warnings: string[];
    error?: { code: string; message: string };
  };

  if (detectedType === "xlsx") {
    parseResultData = parseXlsx(buffer, topicCol, params_columns, maxRowsValue);
  } else if (detectedType === "txt") {
    parseResultData = parseTxt(buffer, parse_mode ?? "per_line", maxRowsValue);
  } else {
    parseResultData = parseCsv(buffer, topicCol, params_columns, maxRowsValue);
  }

  if (parseResultData.error) {
    emitAudit("file_parse.failed", { error_code: parseResultData.error.code });
    res.status(400).json({ success: false, error: parseResultData.error });
    return;
  }

  emitAudit("file_parse.completed", {
    parsed_rows: parseResultData.items.length,
    total_rows: parseResultData.totalRows,
    warnings_count: parseResultData.warnings.length,
  });

  res.json({
    success: true,
    items: parseResultData.items,
    total_rows: parseResultData.totalRows,
    parsed_rows: parseResultData.items.length,
    warnings: parseResultData.warnings.length > 0 ? parseResultData.warnings : undefined,
  });
}

export function registerFileParseToolRoute(app: Express): void {
  app.post("/api/internal/tools/file-parse", contentAutomationGate, fileParseHandler);
}
