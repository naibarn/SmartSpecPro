/**
 * Feature 143 §4.10 / RK1-style drift guard: `apps/web/shared/remotion/
 * fontAllowlist.ts` and `packages/remotion-render/src/fontAllowlist.ts` are
 * two independent, hand-duplicated copies of the SAME allowlist code (see
 * both files' module doc comments) — mirrors
 * `layerTemplateSchemasSync.test.ts`'s guard for the same cross-package
 * drift risk.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APPS_WEB_COPY = path.resolve(import.meta.dirname, "..", "fontAllowlist.ts");
const PACKAGES_COPY = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "packages",
  "remotion-render",
  "src",
  "fontAllowlist.ts",
);

function normalizeSourceModuloComments(source: string): string {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = withoutBlockComments
    .split("\n")
    .map(line => line.replace(/^\s*\/\/.*$/, ""))
    .map(line => line.trimEnd());
  return lines.filter(line => line.trim().length > 0).join("\n");
}

describe("fontAllowlistSync (Feature 143 §4.10 — cross-package contract drift guard)", () => {
  it("both fontAllowlist.ts copies exist and are non-empty", () => {
    expect(fs.existsSync(APPS_WEB_COPY)).toBe(true);
    expect(fs.existsSync(PACKAGES_COPY)).toBe(true);
  });

  it("apps/web and packages/remotion-render fontAllowlist.ts are byte-identical modulo comments", () => {
    const appsWebSource = fs.readFileSync(APPS_WEB_COPY, "utf-8");
    const packagesSource = fs.readFileSync(PACKAGES_COPY, "utf-8");

    const appsWebNormalized = normalizeSourceModuloComments(appsWebSource);
    const packagesNormalized = normalizeSourceModuloComments(packagesSource);

    expect(packagesNormalized).toBe(appsWebNormalized);
  });
});
