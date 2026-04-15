const TRACE_PREFIX = "finance-ocr";

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
      if (/base64|filebase64|contentbase64/i.test(key) && typeof entry === "string") {
        output[key] = `[redacted:${entry.length}]`;
        continue;
      }
      output[key] = sanitizeValue(entry, depth + 1);
    }
    return output;
  }

  return String(value);
}

export function createFinanceOcrDebugTraceId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${TRACE_PREFIX}-${random}`;
}

export function logFinanceOcrClientStep(
  step: string,
  data: Record<string, unknown> = {},
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    step,
    data: sanitizeValue(data),
  };

  try {
    console.info("[finance_ocr_debug]", entry);
  } catch {
    // Best-effort tracing only.
  }
}
