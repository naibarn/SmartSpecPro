/**
 * Simple file logger for debugging
 */
import fs from "fs";
import path from "path";

const LOG_FILE = path.resolve(process.cwd(), "server-debug.log");
const DEBUG_LOG_ENABLED =
  process.env.SMARTSPEC_DEBUG_LOGS === "1" ||
  process.env.SMARTSPEC_DEBUG_LOGS === "true" ||
  process.env.NODE_ENV !== "production";

function errorDetails(error: any) {
  const details: Record<string, unknown> = {};
  const visited = new Set<unknown>();
  let current = error;
  for (
    let depth = 0;
    depth < 6 && current && !visited.has(current);
    depth += 1
  ) {
    visited.add(current);
    if (typeof current !== "object") break;
    for (const key of [
      "code",
      "constraint",
      "detail",
      "table",
      "column",
      "schema",
      "severity",
    ]) {
      const value = current[key];
      const isPostgresCode =
        key === "code" &&
        typeof value === "string" &&
        /^[0-9A-Z]{5}$/.test(value);
      if (
        (details[key] == null ||
          (key === "code" &&
            (details[key] === "INTERNAL_SERVER_ERROR" ||
              details[key] === "CREDIT_LEDGER_WRITE_FAILED") &&
            isPostgresCode)) &&
        (typeof value === "string" || typeof value === "number")
      ) {
        details[key] = value;
      }
    }
    const database = current.database;
    if (database && typeof database === "object") {
      for (const key of [
        "code",
        "constraint",
        "detail",
        "table",
        "column",
        "schema",
      ]) {
        const value = database[key];
        const outputKey = `database${key[0].toUpperCase()}${key.slice(1)}`;
        if (
          details[outputKey] == null &&
          (typeof value === "string" || typeof value === "number")
        ) {
          details[outputKey] = value;
        }
      }
    }
    current = current.cause;
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

// Append a startup marker so debug history survives restarts.
if (DEBUG_LOG_ENABLED) {
  try {
    fs.appendFileSync(
      LOG_FILE,
      `=== Server started at ${new Date().toISOString()} ===\n`
    );
  } catch (e) {
    // Ignore if can't write
  }
}

export function debugLog(category: string, message: string, data?: any) {
  if (!DEBUG_LOG_ENABLED) return;
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${category}] ${message}${data ? " " + JSON.stringify(data) : ""}\n`;

  // Also log to console
  console.log(`[${category}] ${message}`, data || "");

  // Append to file
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    // Ignore file write errors
  }
}

export function debugError(category: string, message: string, error?: any) {
  const timestamp = new Date().toISOString();
  const errorInfo = error ? error.stack || error.message || String(error) : "";
  const details = errorDetails(error);
  const detailLine = details
    ? `\nERROR_DETAILS:${JSON.stringify(details)}`
    : "";
  const line = `[${timestamp}] [${category}] ERROR: ${message}\n${errorInfo}${detailLine}\n`;

  // Also log to console (wrapped to prevent EPIPE crash loops)
  try {
    console.error(`[${category}] ERROR: ${message}`, error || "");
  } catch (_) {
    // Ignore — broken pipe on stderr
  }

  // Append to file
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    // Ignore file write errors
  }
}
