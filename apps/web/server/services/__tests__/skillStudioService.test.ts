import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadEnabledLlmModelRowsMock,
  resolveEnabledLlmModelIdMock,
  refreshSkillCacheMock,
  resolveSkillDirCandidatesMock,
  resolveSkillManifestPathMock,
  syncSingleSkillIfChangedMock,
} = vi.hoisted(() => ({
  loadEnabledLlmModelRowsMock: vi.fn(),
  resolveEnabledLlmModelIdMock: vi.fn(),
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
  filterAutoSelectableLlmModelRows: (rows: unknown[]) => rows,
  loadEnabledLlmModelRows: loadEnabledLlmModelRowsMock,
  resolveEnabledLlmModelId: resolveEnabledLlmModelIdMock,
}));

import { applyIscProposal, extractSavedProposalFiles, resolveSkillStudioSystemModel } from "../skillStudioService";

function enabledModelRow(overrides: Record<string, unknown>) {
  return {
    providerId: 1,
    providerName: "openrouter",
    modelId: "deep-1m",
    providerModelId: "deep-1m",
    legacyModelAliases: [],
    defaultModel: null,
    apiStyle: "chat-completions",
    supportsThinking: true,
    supportsVision: false,
    supportsFunctionTools: false,
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    supportsStrictToolSchema: false,
    supportsWebSearch: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsBackground: false,
    supportsResponses: false,
    contextLength: 1_048_576,
    priority: 5,
    priorityLocked: false,
    isFree: false,
    catalogEligibility: "public-chat",
    ...overrides,
  };
}

describe("skillStudioService proposal handling", () => {
  let skillDir: string;
  const skillName = "json-proposal-test";
  const proposalDir = path.resolve(process.cwd(), "skills", "intelligence-skill-creator", "runs", "proposals", skillName);

  beforeEach(() => {
    vi.clearAllMocks();
    loadEnabledLlmModelRowsMock.mockReset();
    resolveEnabledLlmModelIdMock.mockReset();
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
      message: "`runs/proposals/demo/20260423T120000_r1.json` `runs/proposals/demo/20260423T120000_r1.meta.json` `skill.lock.json` `legacy.diff`",
      metadata: {
        savedProposals: [
          "runs/proposals/demo/skill.lock.json",
          "runs/proposals/demo/20260423T120000_r1.json",
        ],
      },
    } as any);

    expect(files).toEqual(["runs/proposals/demo/20260423T120000_r1.json"]);
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

  it("selects a thinking-capable 1M-context model for Skill Studio improve mode", async () => {
    loadEnabledLlmModelRowsMock.mockResolvedValue([
      {
        providerId: 1,
        providerName: "openrouter",
        modelId: "fast-small",
        providerModelId: "fast-small",
        legacyModelAliases: [],
        defaultModel: null,
        apiStyle: "chat-completions",
        supportsThinking: true,
        supportsVision: false,
        supportsFunctionTools: false,
        supportsStructuredOutputs: false,
        supportsJsonMode: false,
        supportsStrictToolSchema: false,
        supportsWebSearch: false,
        supportsCodeExecution: false,
        supportsComputerUse: false,
        supportsBackground: false,
        supportsResponses: false,
        contextLength: 128_000,
        priority: 1,
        priorityLocked: false,
        isFree: false,
        catalogEligibility: "public-chat",
      },
      {
        providerId: 1,
        providerName: "openrouter",
        modelId: "deep-1m",
        providerModelId: "deep-1m",
        legacyModelAliases: [],
        defaultModel: null,
        apiStyle: "chat-completions",
        supportsThinking: true,
        supportsVision: false,
        supportsFunctionTools: false,
        supportsStructuredOutputs: false,
        supportsJsonMode: false,
        supportsStrictToolSchema: false,
        supportsWebSearch: false,
        supportsCodeExecution: false,
        supportsComputerUse: false,
        supportsBackground: false,
        supportsResponses: false,
        contextLength: 1_048_576,
        priority: 5,
        priorityLocked: false,
        isFree: false,
        catalogEligibility: "public-chat",
      },
    ]);

    const selection = await resolveSkillStudioSystemModel({
      mode: "improve",
      llmGatewayMode: "system",
    });

    expect(selection).toEqual(expect.objectContaining({
      modelId: "deep-1m",
      contextLength: 1_048_576,
      requirements: { supportsThinking: true, contextLength: 1_000_000 },
    }));
  });

  it("matches requested model IDs through the shared provider/model lookup candidates", async () => {
    loadEnabledLlmModelRowsMock.mockResolvedValue([
      enabledModelRow({
        providerName: "openrouter",
        modelId: "deep-1m",
        providerModelId: "deep-1m",
      }),
    ]);

    const selection = await resolveSkillStudioSystemModel({
      mode: "improve",
      llmGatewayMode: "system",
      llmModelSearch: "openrouter/deep-1m",
    });

    expect(selection).toEqual(expect.objectContaining({
      modelId: "deep-1m",
      providerName: "openrouter",
      thinkingParamStyle: "reasoning",
    }));
  });

  it("selects provider-aware thinking parameter styles for Skill Studio improve mode", async () => {
    loadEnabledLlmModelRowsMock.mockResolvedValueOnce([
      enabledModelRow({
        providerName: "anthropic",
        modelId: "claude-opus-1m",
        providerModelId: "claude-opus-1m",
        apiStyle: "messages",
      }),
    ]);

    await expect(resolveSkillStudioSystemModel({
      mode: "improve",
      llmGatewayMode: "system",
    })).resolves.toEqual(expect.objectContaining({
      thinkingParamStyle: "thinkingFlag",
      apiStyle: "messages",
    }));

    loadEnabledLlmModelRowsMock.mockResolvedValueOnce([
      enabledModelRow({
        providerName: "google",
        modelId: "gemini-2.5-pro",
        providerModelId: "gemini-2.5-pro",
        apiStyle: "gemini",
      }),
    ]);

    await expect(resolveSkillStudioSystemModel({
      mode: "improve",
      llmGatewayMode: "system",
    })).resolves.toEqual(expect.objectContaining({
      thinkingParamStyle: "reasoning_effort",
      apiStyle: "gemini",
    }));
  });

  it("fails Skill Studio improve mode when no enabled model has thinking and 1M context", async () => {
    loadEnabledLlmModelRowsMock.mockResolvedValue([
      {
        providerId: 1,
        providerName: "openrouter",
        modelId: "small",
        providerModelId: "small",
        legacyModelAliases: [],
        defaultModel: null,
        apiStyle: "chat-completions",
        supportsThinking: false,
        supportsVision: false,
        supportsFunctionTools: false,
        supportsStructuredOutputs: false,
        supportsJsonMode: false,
        supportsStrictToolSchema: false,
        supportsWebSearch: false,
        supportsCodeExecution: false,
        supportsComputerUse: false,
        supportsBackground: false,
        supportsResponses: false,
        contextLength: 128_000,
        priority: 1,
        priorityLocked: false,
        isFree: false,
        catalogEligibility: "public-chat",
      },
    ]);

    await expect(resolveSkillStudioSystemModel({
      mode: "improve",
      llmGatewayMode: "system",
    })).rejects.toThrow("Thinking Mode and context >= 1000000");
  });
});
