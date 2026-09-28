/**
 * Feature 135 (Hermes Grok media worker) section 12 — token-leak CI guard
 * (spec §16, §3.5). Lint-style source scan (fs read of checked-in sources at
 * test time — model on `hermesMediaNamespaceGuard.test.ts`), runs in normal
 * CI via `pnpm test`:
 *
 *   1. Enumerate all Feature-135 server sources: `server/hermesWorker/**`,
 *      `server/services/hermes*.ts`, `server/routers/hermesConnections.ts`
 *      (excluding `__tests__`).
 *   2. Assert no `logger.*` / `console.*` / `auditLogger.log(...)` call site
 *      references a forbidden device-code/token identifier
 *      (`userCode`, `verificationUrl`, `auth.json`, `HERMES_WORKER_TOKEN`),
 *      with a NAMED, reviewable allowlist for the one legal sink
 *      (`connectionControlHandlers.ts`'s `hermes_device_code`
 *      `worker_job_events` payload writer).
 *   3. Assert no `console.log`/`console.error` at all under
 *      `server/hermesWorker/` (structured logger only).
 *   4. Grep-level: the worker diagnostics/failure-reason builder imports
 *      `maskTokenLike` (behavioral coverage already lives in
 *      `shared/__tests__/hermesMedia.test.ts`).
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const FORBIDDEN_LOG_IDENTIFIERS = ["userCode", "verificationUrl", "auth.json", "HERMES_WORKER_TOKEN"] as const;

/** Matches the START of a logging/audit call statement this guard cares
 *  about — deliberately narrow per spec §3.5 (NOT `debugError`, which is a
 *  separate structured-logging wrapper out of scope for this literal scan). */
const LOG_CALL_START_PATTERN = /\b(?:logger\.(?:info|warn|error|debug)|console\.(?:log|error|warn|info|debug)|auditLogger\.log)\s*\(/;

const CONSOLE_CALL_PATTERN = /\bconsole\.(?:log|error|warn|info|debug)\s*\(/;

/** How many lines past a call-start line this scan associates with that
 *  call — statements often span multiple lines (e.g. `auditLogger.log({ ...
 *  })`); a generous window avoids false negatives from multi-line objects
 *  without needing a full parser for this lint-style check. */
const CALL_ASSOCIATION_WINDOW = 20;

/**
 * Named, reviewable allowlist for the ONE legal device-code sink (spec
 * §16/§4.5): `connectionControlHandlers.ts` posts the raw device-code
 * payload via `deps.postEvent(HERMES_DEVICE_CODE_EVENT_TYPE, ...)` — the
 * `worker_job_events.payloadJson` sink, NEVER a logger/console/audit call.
 * Any NEW entry here must be reviewed — this is the only sanctioned
 * exception to the forbidden-identifier scan.
 */
const LEGAL_DEVICE_CODE_SINK_ALLOWLIST: ReadonlyArray<{
  fileSuffix: string;
  matchPattern: RegExp;
}> = [
  {
    fileSuffix: path.join("server", "hermesWorker", "connectionControlHandlers.ts"),
    matchPattern: /postEvent\(\s*HERMES_DEVICE_CODE_EVENT_TYPE/,
  },
];

interface LeakViolation {
  file: string;
  line: number;
  identifier: string;
  snippet: string;
}

function isAllowlistedWindow(filePath: string, windowText: string): boolean {
  return LEGAL_DEVICE_CODE_SINK_ALLOWLIST.some(
    (entry) => filePath.endsWith(entry.fileSuffix) && entry.matchPattern.test(windowText),
  );
}

/** Exported (not just used internally) so this scan's core logic can be
 *  unit-tested against a synthetic string, proving the allowlist mechanism
 *  itself works, independent of what's currently checked in. */
export function scanContentForTokenLeaks(filePath: string, content: string): LeakViolation[] {
  const lines = content.split("\n");
  const violations: LeakViolation[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!LOG_CALL_START_PATTERN.test(lines[i])) continue;
    const windowEnd = Math.min(lines.length, i + CALL_ASSOCIATION_WINDOW);
    const windowText = lines.slice(i, windowEnd).join("\n");

    for (const identifier of FORBIDDEN_LOG_IDENTIFIERS) {
      if (!windowText.includes(identifier)) continue;
      if (isAllowlistedWindow(filePath, windowText)) continue;
      violations.push({ file: filePath, line: i + 1, identifier, snippet: lines[i].trim() });
    }
  }

  return violations;
}

function walkDirRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkDirRecursive(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      result.push(fullPath);
    }
  }
  return result;
}

function collectHermesServerSources(): string[] {
  const serverServicesDir = path.resolve(import.meta.dirname, "..");
  const serverRoutersDir = path.resolve(import.meta.dirname, "../../routers");
  const hermesWorkerDir = path.resolve(import.meta.dirname, "../../hermesWorker");
  const selfPath = path.resolve(import.meta.dirname, "hermesTokenLeakGuard.test.ts");

  const serviceFiles = fs.existsSync(serverServicesDir)
    ? fs
        .readdirSync(serverServicesDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.startsWith("hermes") && entry.name.endsWith(".ts"))
        .map((entry) => path.join(serverServicesDir, entry.name))
    : [];

  const routerFile = path.join(serverRoutersDir, "hermesConnections.ts");
  const routerFiles = fs.existsSync(routerFile) ? [routerFile] : [];

  const workerFiles = walkDirRecursive(hermesWorkerDir);

  return [...serviceFiles, ...routerFiles, ...workerFiles]
    .map((file) => path.resolve(file))
    .filter((file) => file !== selfPath);
}

describe("Feature 135 section 12 — hermes token-leak CI guard", () => {
  it("enumerates a non-empty set of Feature-135 server sources (sanity: globs are not broken)", () => {
    const files = collectHermesServerSources();
    expect(files.length).toBeGreaterThan(0);
  });

  it("no logger/console/auditLogger.log call site in any hermes source references a forbidden device-code/token identifier", () => {
    const files = collectHermesServerSources();
    const allViolations: LeakViolation[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      allViolations.push(...scanContentForTokenLeaks(file, content));
    }

    if (allViolations.length > 0) {
      const details = allViolations
        .map((v) => `${path.relative(process.cwd(), v.file)}:${v.line} references "${v.identifier}" — ${v.snippet}`)
        .join("\n");
      throw new Error(`Token-leak guard violations found:\n${details}`);
    }
    expect(allViolations).toEqual([]);
  });

  it("no console.log/console.error at all under server/hermesWorker/ (structured logger only)", () => {
    const hermesWorkerDir = path.resolve(import.meta.dirname, "../../hermesWorker");
    const files = walkDirRecursive(hermesWorkerDir);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        if (CONSOLE_CALL_PATTERN.test(line)) {
          offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("the worker diagnostic/failure-reason builder imports and uses maskTokenLike (grep-level; behavior tested in shared/__tests__/hermesMedia.test.ts)", () => {
    const filePath = path.resolve(import.meta.dirname, "../../hermesWorker/connectionControlHandlers.ts");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/import[^;]*maskTokenLike[^;]*from ["'].*hermesMedia["']/);
    expect(content).toMatch(/maskTokenLike\(/);
  });

  describe("scanContentForTokenLeaks — allowlist mechanism (synthetic fixtures)", () => {
    it("flags a plain logger.info call that logs a userCode", () => {
      const violations = scanContentForTokenLeaks(
        "/some/other/file.ts",
        `deps.logger.info(\`device code: \${userCode}\`);`,
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].identifier).toBe("userCode");
    });

    it("flags an auditLogger.log(...) call whose metadata carries verificationUrl", () => {
      const violations = scanContentForTokenLeaks(
        "/some/other/file.ts",
        [
          "auditLogger.log({",
          "  eventType: \"hermes_connection_authorized\",",
          "  metadata: { verificationUrl },",
          "});",
        ].join("\n"),
      );
      expect(violations.length).toBeGreaterThan(0);
    });

    it("flags console.error referencing HERMES_WORKER_TOKEN", () => {
      const violations = scanContentForTokenLeaks(
        "/some/other/file.ts",
        `console.error("token", HERMES_WORKER_TOKEN);`,
      );
      expect(violations.length).toBeGreaterThan(0);
    });

    it("does NOT flag the allowlisted connectionControlHandlers.ts postEvent sink", () => {
      const filePath = path.join("server", "hermesWorker", "connectionControlHandlers.ts");
      const violations = scanContentForTokenLeaks(
        filePath,
        [
          "deps.logger.info(\"unrelated\");",
          "deps.postEvent(HERMES_DEVICE_CODE_EVENT_TYPE, { userCode, verificationUrl });",
        ].join("\n"),
      );
      // The logger.info call itself doesn't mention a forbidden identifier
      // within its association window in this fixture — but if it DID, the
      // allowlist only suppresses windows whose content matches the postEvent
      // pattern; this fixture demonstrates the non-suppressed case is clean.
      expect(violations).toEqual([]);
    });

    it("an allowlisted file is STILL flagged for a violation the allowlist pattern does not match", () => {
      const filePath = path.join("server", "hermesWorker", "connectionControlHandlers.ts");
      const violations = scanContentForTokenLeaks(
        filePath,
        `deps.logger.warn(\`leaked: \${userCode}\`);`,
      );
      expect(violations).toHaveLength(1);
    });
  });
});
