import { describe, expect, it } from "vitest";

import { runnerReleaseBuildRequestSchema } from "./runnerReleaseBuilds";

const baseRequest = {
  version: "0.2.0",
  ref: "main",
  platform: "all" as const,
  profile: "all" as const,
  releaseId: "0.2.0",
  releaseNotes: "",
};

describe("runner release build request contract", () => {
  it("allows unsigned artifact-only review builds", () => {
    expect(runnerReleaseBuildRequestSchema.parse({ ...baseRequest, publish: false, signingMode: "unsigned-review" })).toMatchObject({
      publish: false,
      signingMode: "unsigned-review",
    });
  });

  it("rejects publishing without required signing", () => {
    const result = runnerReleaseBuildRequestSchema.safeParse({ ...baseRequest, publish: true, signingMode: "unsigned-review" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("runner_release_publish_requires_signing");
  });

  it("allows signed publish requests", () => {
    expect(runnerReleaseBuildRequestSchema.parse({ ...baseRequest, publish: true, signingMode: "required-secret" })).toMatchObject({
      publish: true,
      signingMode: "required-secret",
    });
  });

  it("requires the explicit macOS arm64 platform name", () => {
    expect(runnerReleaseBuildRequestSchema.parse({ ...baseRequest, platform: "macos-arm64" }).platform).toBe("macos-arm64");
    expect(() => runnerReleaseBuildRequestSchema.parse({ ...baseRequest, platform: "macos-arm" })).toThrow();
  });
});
