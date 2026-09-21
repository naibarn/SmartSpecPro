import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { debugError } from "../_core/logger";
import type { VerticalDramaStorySafetyDiagnostic } from "./verticalDramaStorySafety";

export type VerticalDramaSafetyDebugEvent = {
  event: "vertical_drama_safety";
  seriesId?: number;
  episodeId?: number;
  stage: string;
  sourceSafety: VerticalDramaStorySafetyDiagnostic | null;
  outputSafety: VerticalDramaStorySafetyDiagnostic | null;
  rewriteChanged: boolean;
  timestamp?: string;
  [key: string]: unknown;
};

const DEFAULT_DEBUG_LOG_PATH = path.join(
  process.cwd(),
  "logs",
  "vertical-drama-safety-debug.jsonl",
);
const MAX_DIAGNOSTIC_STRING_LENGTH = 240;
const SENSITIVE_KEY_PATTERN =
  /(?:prompt|response|token|secret|password|authorization|api[-_]?key|credential|content)/i;
const SECRET_PATTERN = /(?:sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+)/gi;

function redactDebugValue(value: unknown, key = "", depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";
  if (typeof value === "string") {
    return value
      .replace(SECRET_PATTERN, "[redacted]")
      .slice(0, MAX_DIAGNOSTIC_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    return value.map(item => redactDebugValue(item, key, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        redactDebugValue(child, childKey, depth + 1),
      ]),
    );
  }
  return value;
}

function resolveDebugLogPath(): string {
  const configured = process.env.VERTICAL_DRAMA_SAFETY_DEBUG_LOG_PATH?.trim();
  return configured || DEFAULT_DEBUG_LOG_PATH;
}

/**
 * Best-effort forensic logging for policy detector results. This function
 * deliberately resolves after filesystem failures so observability cannot
 * turn a usable episode artifact into a failed generation.
 */
export async function writeVerticalDramaSafetyDebugEvent(
  event: VerticalDramaSafetyDebugEvent,
): Promise<void> {
  try {
    const logPath = resolveDebugLogPath();
    await mkdir(path.dirname(logPath), { recursive: true });
    const safeEvent = redactDebugValue({
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    });
    await appendFile(logPath, `${JSON.stringify(safeEvent)}\n`, "utf8");
  } catch (error) {
    debugError(
      "verticalDramaSafetyDebugLog",
      `Unable to write Vertical Drama safety diagnostic: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
  }
}
