import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  refreshSkillCacheMock,
  resolveSkillDirCandidatesMock,
  resolveSkillManifestPathMock,
  syncSingleSkillIfChangedMock,
} = vi.hoisted(() => ({
  refreshSkillCacheMock: vi.fn(),
  resolveSkillDirCandidatesMock: vi.fn(),
  resolveSkillManifestPathMock: vi.fn(),
  syncSingleSkillIfChangedMock: vi.fn(),
}));

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../_core/tokens", () => ({ signBearerToken: vi.fn(() => "token") }));
vi.mock("../userSkillService", () => ({
  getAllSkillsForUser: vi.fn(),
  setSkillVisibility: vi.fn(),
}));
vi.mock("../skillFiles", () => ({
  hasRelativeSkillManifest: vi.fn(() => true),
  resolveSkillDirCandidates: resolveSkillDirCandidatesMock,
  resolveSkillManifestPath: resolveSkillManifestPathMock,
}));
vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(),
  refreshSkillCache: refreshSkillCacheMock,
  syncSingleSkillIfChanged: syncSingleSkillIfChangedMock,
}));
vi.mock("../enabledLlmModels", () => ({
  resolveEnabledLlmModelId: vi.fn(),
}));

import { applyIscProposal, extractSavedProposalFiles } from "../skillStudioService";

describe("skillStudioService proposal handling", () => {
  let skillDir: string;
  const skillName = "json-proposal-test";
  const proposalDir = path.resolve(process.cwd(), "skills", "intelligence-skill-creator", "runs", "proposals", skillName);

  beforeEach(() => {
    vi.clearAllMocks();
    skillDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-skill-proposal-"));
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: json-proposal-test\n---\n", "utf8");
    fs.rmSync(proposalDir, { recursive: true, force: true });
    fs.mkdirSync(proposalDir, { recursive: true });
    resolveSkillDirCandidatesMock.mockReturnValue([skillDir]);
    resolveSkillManifestPathMock.mockReturnValue(path.join(skillDir, "SKILL.md"));
  });

  afterEach(() => {
    fs.rmSync(skillDir, { recursive: true, force: true });
    fs.rmSync(proposalDir, { recursive: true, force: true });
  });

  it("extracts JSON proposal payload files and ignores metadata files", () => {
    const files = extractSavedProposalFiles({
      success: true,
      skillId: "intelligence-skill-creator",
      type: "text",
      message: "`runs/proposals/demo/20260423.json` `runs/proposals/demo/20260423.meta.json` `legacy.diff`",
      metadata: {},
    } as any);

    expect(files).toEqual(["runs/proposals/demo/20260423.json", "legacy.diff"]);
  });

  it("applies JSON proposal payloads with safe relative paths", async () => {
    fs.writeFileSync(
      path.join(proposalDir, "round-1.json"),
      JSON.stringify({
        "python/skill.py": "def respond(input, context=None):\n    return '{}'\n",
        "tests/tests.json": "[]\n",
      }),
      "utf8",
    );

    const result = await applyIscProposal(skillName, "round-1.json");

    expect(result.output).toContain("python/skill.py");
    expect(fs.readFileSync(path.join(skillDir, "python", "skill.py"), "utf8")).toContain("def respond");
    expect(syncSingleSkillIfChangedMock).toHaveBeenCalledWith(skillName);
    expect(refreshSkillCacheMock).toHaveBeenCalled();
  });

  it("rejects JSON proposal payloads with path traversal", async () => {
    fs.writeFileSync(
      path.join(proposalDir, "bad.json"),
      JSON.stringify({
        "../escaped.txt": "bad",
      }),
      "utf8",
    );

    await expect(applyIscProposal(skillName, "bad.json")).rejects.toThrow("Invalid relative path");
  });
});
