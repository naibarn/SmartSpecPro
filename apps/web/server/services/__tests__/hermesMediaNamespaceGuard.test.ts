/**
 * Feature 135 — Hermes Grok media worker namespace guard.
 *
 * Grep-style test (fs walk + content scan, same style as
 * `server/__tests__/migrationOrdering.test.ts`) enforcing the critical
 * namespace rule from section-01: nothing under the `hermesMedia` /
 * `hermes_media` namespace may reference the unrelated pre-existing
 * agent-gateway Hermes lane (`queueHermesWorkerJob`,
 * `hermesAgentRuntime` — both in `server/services/workerSchedulerService.ts`
 * / `shared/featureFlags.ts`).
 *
 * This test intentionally grows in coverage automatically as later sections
 * (02-12) add more `hermes*` files matching the globs below.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const FORBIDDEN_TERMS = ["queueHermesWorkerJob", "hermesAgentRuntime"];

function walkDirRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkDirRecursive(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

/** Top-level entries of `baseDir` whose name starts with one of `prefixes`.
 *  Matching directories are walked recursively (mirrors shell glob
 *  semantics for `server/services/hermes*` / `shared/hermesMedia*`). */
function collectMatchingFiles(baseDir: string, prefixes: string[]): string[] {
  if (!fs.existsSync(baseDir)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!prefixes.some((prefix) => entry.name.startsWith(prefix))) continue;
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkDirRecursive(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

describe("Feature 135 Hermes media namespace guard", () => {
  it("no hermes-media file references the unrelated agent-gateway Hermes lane", () => {
    const selfPath = path.resolve(
      import.meta.dirname,
      "hermesMediaNamespaceGuard.test.ts",
    );
    const serverServicesDir = path.resolve(import.meta.dirname, "..");
    // Section-03 adds `server/routers/hermesConnections.ts` (spec §3.3
    // explicitly requires extending this guard's globs to cover it).
    const serverRoutersDir = path.resolve(import.meta.dirname, "../../routers");
    const sharedDir = path.resolve(import.meta.dirname, "../../../shared");
    // Section-07's shared worker process directory — does not exist yet as of
    // this section; skipped when absent (walkDirRecursive/collectMatchingFiles
    // both return [] for a missing directory).
    const hermesWorkerDir = path.resolve(import.meta.dirname, "../../hermesWorker");

    const candidateFiles = [
      ...collectMatchingFiles(serverServicesDir, ["hermes"]),
      ...collectMatchingFiles(serverRoutersDir, ["hermes"]),
      ...collectMatchingFiles(sharedDir, ["hermesMedia"]),
      ...walkDirRecursive(hermesWorkerDir),
    ]
      .map((file) => path.resolve(file))
      .filter((file) => file !== selfPath);

    // Sanity: this section ships at least `server/services/hermesWorkerSettings.ts`
    // and `shared/hermesMedia.ts` — if this is ever 0, the globs are broken.
    expect(candidateFiles.length).toBeGreaterThan(0);

    for (const file of candidateFiles) {
      const content = fs.readFileSync(file, "utf-8");
      for (const term of FORBIDDEN_TERMS) {
        expect(
          content.includes(term),
          `${path.relative(process.cwd(), file)} must not reference "${term}" (unrelated agent-gateway Hermes lane)`,
        ).toBe(false);
      }
    }
  });
});
