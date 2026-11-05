import { describe, expect, it } from "vitest";
import { resolveSpec224AuthorityRepository } from "../spec224ExecutionLeaseAuthority";

describe("SPEC-224 workspace authority routing", () => {
  const legacyRepository = "/srv/smartaihub-legacy";
  const coreRepository = "/srv/smartaihub-platform";
  const runnerId = "runner-core";
  const workspaceId = "workspace-core";

  it("keeps unmapped runners on the legacy repository authority", () => {
    expect(resolveSpec224AuthorityRepository({
      runnerId: "runner-legacy",
      workspaceId: "workspace-legacy",
      defaultRepository: legacyRepository,
    })).toBe(legacyRepository);
  });

  it("routes an explicitly bound Runner and workspace to its own repository authority", () => {
    expect(resolveSpec224AuthorityRepository({
      runnerId,
      workspaceId,
      defaultRepository: legacyRepository,
      mappingJson: JSON.stringify({ [runnerId]: { [workspaceId]: coreRepository } }),
    })).toBe(coreRepository);
  });

  it("fails closed when a mapped Runner reports another workspace", () => {
    expect(() => resolveSpec224AuthorityRepository({
      runnerId,
      workspaceId: "unlisted-workspace",
      defaultRepository: legacyRepository,
      mappingJson: JSON.stringify({ [runnerId]: { [workspaceId]: coreRepository } }),
    })).toThrow("SPEC224_WORKSPACE_AUTHORITY_WORKSPACE_UNMAPPED");
  });

  it("rejects malformed mappings and relative authority paths", () => {
    expect(() => resolveSpec224AuthorityRepository({
      runnerId, workspaceId, defaultRepository: legacyRepository, mappingJson: "{" ,
    })).toThrow("SPEC224_WORKSPACE_AUTHORITY_MAPPING_INVALID");
    expect(() => resolveSpec224AuthorityRepository({
      runnerId, workspaceId, defaultRepository: legacyRepository,
      mappingJson: JSON.stringify({ [runnerId]: { [workspaceId]: "../repo" } }),
    })).toThrow("SPEC224_WORKSPACE_AUTHORITY_MAPPING_INVALID");
  });
});
