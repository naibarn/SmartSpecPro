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
});
