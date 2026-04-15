import fs from "node:fs";
import path from "node:path";

import { getTraceId } from "./traceContext";

const DEFAULT_DEBUG_LOG_PATH = path.resolve(process.cwd(), "finance-ocr-debug.jsonl");
const DEBUG_LOG_PATH = (process.env.FINANCE_OCR_DEBUG_LOG_PATH || "").trim() || DEFAULT_DEBUG_LOG_PATH;
const DEBUG_ENABLED = (() => {
  const raw = (process.env.FINANCE_OCR_DEBUG_ENABLED || "").trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return ["1", "true", "yes", "on"].includes(raw);
})();

function truncateString(value: string, maxLength = 240): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (depth >= 3) {
      return `[array:${value.length}]`;
    }
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    if (depth >= 3) {
      return "[object]";
    }

    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) {
        continue;
      }
      if (/base64|filebase64|contentbase64|ocrtext|extractedtext/i.test(key) && typeof entry === "string") {
        output[key] = `[redacted:${entry.length}]`;
        continue;
      }
      output[key] = sanitizeValue(entry, depth + 1);
    }
    return output;
  }

  return String(value);
}

export function getFinanceOcrDebugTraceId(explicitTraceId?: string | null): string | null {
  const candidate = String(explicitTraceId ?? getTraceId() ?? "").trim();
  return candidate.length > 0 ? candidate : null;
}

export function recordFinanceOcrDebugStep(
  step: string,
  data: Record<string, unknown> = {},
): void {
  if (!DEBUG_ENABLED) {
    return;
  }

  const traceId = getFinanceOcrDebugTraceId(
    typeof data.traceId === "string" ? data.traceId : null,
  );
  const entry = {
    timestamp: new Date().toISOString(),
    traceId,
    step,
    data: sanitizeValue(data),
  };

  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Best-effort debug tracing only.
  }
}
