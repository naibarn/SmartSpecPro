/**
 * Simple file logger for debugging
 */
import fs from "fs";
import path from "path";

const LOG_FILE = path.resolve(process.cwd(), "server-debug.log");

// Clear log file on startup
try {
  fs.writeFileSync(LOG_FILE, `=== Server started at ${new Date().toISOString()} ===\n`);
} catch (e) {
  // Ignore if can't write
}

export function debugLog(category: string, message: string, data?: any) {
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
  const errorInfo = error ? (error.stack || error.message || String(error)) : "";
  const line = `[${timestamp}] [${category}] ERROR: ${message}\n${errorInfo}\n`;

  // Also log to console
  console.error(`[${category}] ERROR: ${message}`, error || "");

  // Append to file
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    // Ignore file write errors
  }
}
