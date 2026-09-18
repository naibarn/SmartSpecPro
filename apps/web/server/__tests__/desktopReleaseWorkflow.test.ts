import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("desktop release workflow build contract", () => {
  it("uses the cross-platform web build in GitHub Actions", () => {
    const workflow = readFileSync(
      fileURLToPath(new URL("../../../../.github/workflows/desktop-release.yml", import.meta.url)),
      "utf8",
    );

    expect(workflow).toContain("npm --workspace apps/web run build:unsafe");
    expect(workflow).not.toContain("npm --workspace apps/web run build\n");
  });

  it("builds the remotion workspace package before bundling web assets", () => {
    const workflow = readFileSync(
      fileURLToPath(new URL("../../../../.github/workflows/desktop-release.yml", import.meta.url)),
      "utf8",
    );
    const packageBuild = "npm --workspace @smartspec/remotion-render run build";
    const webBuild = "npm --workspace apps/web run build:unsafe";

    expect(workflow).toContain(packageBuild);
    expect(workflow.indexOf(packageBuild)).toBeLessThan(workflow.indexOf(webBuild));
  });

  it("keeps the remotion package build command portable on Windows", () => {
    const buildScript = readFileSync(
      fileURLToPath(new URL("../../../../packages/remotion-render/build.mjs", import.meta.url)),
      "utf8",
    );

    expect(buildScript).toContain('process.platform === "win32" ? "npx.cmd" : "npx"');
  });
});
