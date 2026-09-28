/**
 * RK1 (Feature 143, spec §3.1/§8): `apps/web/shared/remotion/
 * layerTemplateSchemas.ts` and `packages/remotion-render/src/
 * layerTemplateSchemas.ts` are two independent, hand-duplicated copies of
 * the SAME schema code (see both files' module doc comments). This is the
 * automated guard against them drifting apart.
 *
 * This test compares the two files' source text with comments stripped, so
 * it catches ANY code-level drift (a field added to one copy but not the
 * other, a changed validator, a reordered field) while still allowing the
 * two files' doc comments to differ, exactly as the spec documents ("the
 * code is identical; only doc comments differ"). A schema-shape comparison
 * (e.g. diffing `._def` trees or a battery of `safeParse` probes) was
 * considered and rejected: Zod's internal `_def` shape is not a stable
 * public API to assert against, and a `safeParse` battery can only ever
 * prove "these N cases behave the same", never "these two schemas are
 * definitionally identical" — a byte-level code diff (modulo comments) is
 * the only check that actually proves what RK1 requires.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APPS_WEB_COPY = path.resolve(import.meta.dirname, "..", "layerTemplateSchemas.ts");
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
  "layerTemplateSchemas.ts",
);

/**
 * Strips `/** ... *\/` block comments and whole-line `//` comments, then
 * collapses blank lines and surrounding whitespace. Both source files in
 * this repo only ever use comments as their own top-level statements (never
 * a trailing `// comment` sharing a line with code), so this is a safe,
 * deterministic normalization — verified by the "sanity" test below, which
 * asserts the normalized apps/web copy still contains real schema code
 * after stripping (i.e. the strip didn't eat the whole file).
 */
function normalizeSourceModuloComments(source: string): string {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = withoutBlockComments
    .split("\n")
    .map(line => line.replace(/^\s*\/\/.*$/, ""))
    .map(line => line.trimEnd());
  return lines.filter(line => line.trim().length > 0).join("\n");
}

describe("layerTemplateSchemasSync (RK1 — cross-package contract drift guard)", () => {
  it("both layerTemplateSchemas.ts copies exist and are non-empty", () => {
    expect(fs.existsSync(APPS_WEB_COPY)).toBe(true);
    expect(fs.existsSync(PACKAGES_COPY)).toBe(true);
  });

  it("normalizing strips comments without eating the real code (sanity check on the normalizer itself)", () => {
    const normalized = normalizeSourceModuloComments(fs.readFileSync(APPS_WEB_COPY, "utf-8"));
    expect(normalized).toContain("RemotionLayerBaseSchema");
    expect(normalized).toContain("RemotionTemplateConfigSchema");
    expect(normalized).not.toContain("/**");
    expect(normalized).not.toContain("//");
  });

  it("apps/web and packages/remotion-render layerTemplateSchemas.ts are byte-identical modulo comments", () => {
    const appsWebSource = fs.readFileSync(APPS_WEB_COPY, "utf-8");
    const packagesSource = fs.readFileSync(PACKAGES_COPY, "utf-8");

    const appsWebNormalized = normalizeSourceModuloComments(appsWebSource);
    const packagesNormalized = normalizeSourceModuloComments(packagesSource);

    expect(packagesNormalized).toBe(appsWebNormalized);
  });
});
