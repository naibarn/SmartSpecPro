/**
 * Feature 135 — guards `hermesWorkerSettingsKeys.ts` (client-safe copy)
 * against drifting from `server/services/hermesWorkerSettings.ts`'s
 * `HERMES_WORKER_SETTINGS_KEYS` (the source of truth for `system_settings`
 * key strings).
 *
 * The server file is NOT client-safe (imports `getDb`/drizzle schema), so
 * this is a content-scan comparison (same technique as
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`) rather than
 * a runtime import — it extracts the `key: "string_value"` pairs from both
 * files' source text and asserts they are identical.
 *
 * Plain `.test.ts` (not `.test.tsx`) so it runs under vitest's default
 * "node" environment per `vitest.config.ts`'s `environmentMatchGlobs` — no
 * jsdom needed for a text-content comparison.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { HERMES_WORKER_SETTINGS_KEYS_CLIENT } from "../hermesWorkerSettingsKeys";

function extractKeyValuePairs(source: string, objectDeclarationMarker: string): Record<string, string> {
  const startIndex = source.indexOf(objectDeclarationMarker);
  expect(startIndex, `could not find "${objectDeclarationMarker}" in source`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf("} as const", startIndex);
  expect(endIndex, `could not find closing "} as const" after "${objectDeclarationMarker}"`).toBeGreaterThan(startIndex);
  const objectBody = source.slice(startIndex, endIndex);

  const pairs: Record<string, string> = {};
  const pairPattern = /(\w+):\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pairPattern.exec(objectBody)) !== null) {
    pairs[match[1]] = match[2];
  }
  return pairs;
}

describe("HERMES_WORKER_SETTINGS_KEYS_CLIENT stays in sync with the server's HERMES_WORKER_SETTINGS_KEYS", () => {
  it("has identical key names and setting-key string values on both sides", () => {
    const serverFilePath = path.resolve(
      import.meta.dirname,
      "../../../../../server/services/hermesWorkerSettings.ts",
    );
    const serverSource = fs.readFileSync(serverFilePath, "utf-8");
    const serverPairs = extractKeyValuePairs(serverSource, "export const HERMES_WORKER_SETTINGS_KEYS");

    const clientPairs: Record<string, string> = { ...HERMES_WORKER_SETTINGS_KEYS_CLIENT };

    expect(Object.keys(clientPairs).sort()).toEqual(Object.keys(serverPairs).sort());
    for (const key of Object.keys(serverPairs)) {
      expect(clientPairs[key], `client key "${key}" value must match server`).toBe(serverPairs[key]);
    }
  });

  it("sanity: the extractor actually found a non-trivial number of keys (catches a broken marker silently matching 0)", () => {
    const serverFilePath = path.resolve(
      import.meta.dirname,
      "../../../../../server/services/hermesWorkerSettings.ts",
    );
    const serverSource = fs.readFileSync(serverFilePath, "utf-8");
    const serverPairs = extractKeyValuePairs(serverSource, "export const HERMES_WORKER_SETTINGS_KEYS");
    expect(Object.keys(serverPairs).length).toBe(15);
  });
});
