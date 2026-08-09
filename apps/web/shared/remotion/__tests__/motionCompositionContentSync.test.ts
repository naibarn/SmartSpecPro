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
  "MotionCompositionContent.tsx",
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
  "MotionCompositionContent.tsx",
);

function normalize(source: string): string {
  return source
    .replace(/from "\.\.\/\.\.\/shared\/remotion\/layerTemplateSchemas"/g, 'from "IMPORT_LAYER_SCHEMAS"')
    .replace(/from "\.\/layerTemplateSchemas"/g, 'from "IMPORT_LAYER_SCHEMAS"')
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map(line => line.replace(/^\s*\/\/.*$/, "").trimEnd())
    .filter(line => line.trim().length > 0)
    .join("\n")
    .replace(/\s+/g, "");
}

describe("motion composition renderer parity", () => {
  it("keeps live preview and worker renderer source aligned", () => {
    expect(fs.existsSync(APPS_WEB_COPY)).toBe(true);
    expect(fs.existsSync(PACKAGES_COPY)).toBe(true);
    expect(normalize(fs.readFileSync(APPS_WEB_COPY, "utf8"))).toBe(
      normalize(fs.readFileSync(PACKAGES_COPY, "utf8")),
    );
  });
});
