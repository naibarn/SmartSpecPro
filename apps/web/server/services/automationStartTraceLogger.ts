import fs from "node:fs";
import path from "node:path";

type TracePayload = Record<string, unknown>;

const TRACE_LOG_FILE = path.resolve(
  process.cwd(),
  "automation-start-trace.log"
);

function writeLine(line: string): void {
  try {
    fs.appendFileSync(TRACE_LOG_FILE, `${line}\n`, "utf8");
  } catch {
    // Best-effort debug tracing only.
  }
}

export function logAutomationStartTrace(
  step: string,
  payload: TracePayload = {}
): void {
  writeLine(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      category: "automation_start",
      step,
      ...payload,
    })
  );
}

export function logAutomationStartError(
  step: string,
  error: unknown,
  payload: TracePayload = {}
): void {
  writeLine(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      category: "automation_start",
      step,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack ?? null,
            }
          : { message: String(error) },
      ...payload,
    })
  );
}
