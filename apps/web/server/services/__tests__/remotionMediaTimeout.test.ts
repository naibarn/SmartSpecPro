import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");

describe("Remotion media delay-render policy", () => {
  it("keeps the web composition and portable composition aligned", () => {
    const sourcePaths = [
      "apps/web/server/remotion/GenericTemplateComposition.tsx",
      "packages/remotion-render/src/GenericTemplateComposition.tsx",
    ];

    for (const relativePath of sourcePaths) {
      const source = readFileSync(join(REPO_ROOT, relativePath), "utf8");
      expect(source).toContain(
        "delayRenderTimeoutInMilliseconds={REMOTION_MEDIA_DELAY_RENDER_TIMEOUT_MS}"
      );
      expect(source).toContain(
        "delayRenderRetries={REMOTION_MEDIA_DELAY_RENDER_RETRIES}"
      );
    }
  });

  it("keeps the portable package source on the same media policy", () => {
    const source = readFileSync(
      join(
        REPO_ROOT,
        "packages/remotion-render/src/GenericTemplateComposition.tsx"
      ),
      "utf8"
    );
    expect(source).toContain("REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS");
    expect(source).toContain("const REMOTION_MEDIA_DELAY_RENDER_RETRIES = 0;");
  });
});
