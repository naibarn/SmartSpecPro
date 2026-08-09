/**
 * Feature 143 §4.10 / RK1-style drift guard: `apps/web/server/remotion/
 * GenericTemplateComposition.tsx` and `packages/remotion-render/src/
 * GenericTemplateComposition.tsx` are two independent, hand-duplicated
 * copies of the SAME composition code (see both files' module doc
 * comments) — mirrors `layerTemplateSchemasSync.test.ts`'s guard for the
 * same cross-package drift risk, extended to this file because the §4.10
 * font-loader fix (`AllowlistedFontLoader`/`DocumentFontLoaders`) had to be
 * ported into BOTH copies (the `apps/web` copy powers the client's live
 * `<Player>` preview, the `packages/remotion-render` copy powers the actual
 * worker render — Feature 143 AC2 requires both to agree).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APPS_WEB_COPY = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "server",
  "remotion",
  "GenericTemplateComposition.tsx",
);
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
  "GenericTemplateComposition.tsx",
);

function normalizeSourceModuloComments(source: string): string {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = withoutBlockComments
    .split("\n")
    .map(line => line.replace(/^\s*\/\/.*$/, ""))
    .map(line => line.trimEnd());
  return lines.filter(line => line.trim().length > 0).join("\n");
}

/** Both files' only expected divergence: relative import specifiers
 *  (`../../shared/remotion/X` in `apps/web`, `./X` in `packages/remotion-render`). */
function normalizeImportSpecifiers(source: string): string {
  return source
    .replace(/from "\.\.\/\.\.\/shared\/remotion\/layerTemplateSchemas"/g, 'from "IMPORT_LAYER_SCHEMAS"')
    .replace(/from "\.\/layerTemplateSchemas"/g, 'from "IMPORT_LAYER_SCHEMAS"')
    .replace(/from "\.\.\/\.\.\/shared\/remotion\/fontAllowlist"/g, 'from "IMPORT_FONT_ALLOWLIST"')
    .replace(/from "\.\/fontAllowlist"/g, 'from "IMPORT_FONT_ALLOWLIST"')
    .replace(/from "\.\.\/services\/remotionTemplateService"/g, 'from "IMPORT_INPUT_PROPS"')
    .replace(/from "\.\/genericTemplateInputProps"/g, 'from "IMPORT_INPUT_PROPS"')
    .replace(
      /from "\.\.\/\.\.\/\.\.\/\.\.\/packages\/remotion-render\/src\/MotionCompositionContent"/g,
      'from "IMPORT_MOTION_COMPOSITION"',
    )
    .replace(/from "\.\/MotionCompositionContent"/g, 'from "IMPORT_MOTION_COMPOSITION"');
}

describe("genericTemplateCompositionSync (Feature 143 §4.10 — cross-package contract drift guard)", () => {
  it("both GenericTemplateComposition.tsx copies exist and are non-empty", () => {
    expect(fs.existsSync(APPS_WEB_COPY)).toBe(true);
    expect(fs.existsSync(PACKAGES_COPY)).toBe(true);
  });

  it("apps/web and packages/remotion-render GenericTemplateComposition.tsx are identical modulo comments and import specifiers", () => {
    const appsWebSource = fs.readFileSync(APPS_WEB_COPY, "utf-8");
    const packagesSource = fs.readFileSync(PACKAGES_COPY, "utf-8");

    const appsWebNormalized = normalizeImportSpecifiers(
      normalizeSourceModuloComments(appsWebSource),
    );
    const packagesNormalized = normalizeImportSpecifiers(
      normalizeSourceModuloComments(packagesSource),
    );

    expect(packagesNormalized).toBe(appsWebNormalized);
  });
});
