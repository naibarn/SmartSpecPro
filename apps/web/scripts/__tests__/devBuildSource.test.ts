import { describe, expect, it } from "vitest";
import { isCompatibleDevelopmentBuildSource } from "../devBuildSource.mjs";

const artifactSha = "a".repeat(40);
const runtimeSha = "b".repeat(40);

describe("isCompatibleDevelopmentBuildSource", () => {
  it("accepts an exact source revision", () => {
    expect(isCompatibleDevelopmentBuildSource({
      artifactSourceSha: artifactSha,
      runtimeSourceSha: artifactSha,
      isAncestor: true,
      interveningPaths: [],
    })).toBe(true);
  });

  it("accepts newer runtime metadata only when commits change SPEC handoff files", () => {
    expect(isCompatibleDevelopmentBuildSource({
      artifactSourceSha: artifactSha,
      runtimeSourceSha: runtimeSha,
      isAncestor: true,
      interveningPaths: ["specs/feature/224-example/handoff/manifest.json", "specs/feature/224-example/handoff/STATUS.md"],
    })).toBe(true);
  });

  it("rejects runtime changes, empty ancestry evidence, and non-ancestor revisions", () => {
    const common = { artifactSourceSha: artifactSha, runtimeSourceSha: runtimeSha, isAncestor: true };
    expect(isCompatibleDevelopmentBuildSource({ ...common, interveningPaths: ["apps/web/server/index.ts"] })).toBe(false);
    expect(isCompatibleDevelopmentBuildSource({ ...common, interveningPaths: [] })).toBe(false);
    expect(isCompatibleDevelopmentBuildSource({ ...common, isAncestor: false, interveningPaths: ["specs/feature/224-example/handoff/manifest.json"] })).toBe(false);
  });
});
