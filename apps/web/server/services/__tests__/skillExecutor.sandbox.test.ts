import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { EventEmitter } from "events";

// Mock the sandbox module before importing skillExecutor
vi.mock("../sandbox", () => ({
  isSandboxEnabled: vi.fn(() => false),
  shouldUseSandboxForFeature: vi.fn(() => false),
  getDispatchMode: vi.fn(() => "optional"),
  dispatchToSandbox: vi.fn(),
}));
vi.mock("child_process", () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })),
}));
vi.mock("../db", () => ({ getDb: vi.fn(async () => null) }));

// Mock heavy dependencies to isolate skill executor logic
vi.mock("../redis", () => ({ getRedisClient: vi.fn(() => ({ setex: vi.fn() })) }));
vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: { generateImage: vi.fn(), generateVideoAsync: vi.fn(), generateAudio: vi.fn() },
}));
vi.mock("../creditService", () => ({ hasEnoughCredits: vi.fn(() => true) }));
vi.mock("../modelRegistry", () => ({
  getModelById: vi.fn(),
  getDefaultModel: vi.fn(),
  mapToApiModelId: vi.fn((id: string) => id),
  getModelsByTypeAsync: vi.fn(),
}));
vi.mock("../pricingCalculator", () => ({ calculateCreditCost: vi.fn(() => 1) }));

import { executeSkill } from "../skillExecutor";
import type { SkillExecutionParams } from "../skillExecutor";
import type { SkillDefinition } from "@smartspec/skills";
import { mediaGenerationService } from "../mediaGenerationService";
import { getDefaultModel, getModelById } from "../modelRegistry";
import { spawn } from "child_process";
import {
  isSandboxEnabled,
  shouldUseSandboxForFeature,
  getDispatchMode,
  dispatchToSandbox,
} from "../sandbox";

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    icon: "sparkles",
    type: "chat-assistant",
    triggers: [],
    requiresExplicit: false,
    creditMultiplier: 1,
    enabledByDefault: true,
    priority: 50,
    executionMode: "llm-only",
    ...overrides,
  };
}

const defaultParams: SkillExecutionParams = {
  prompt: "test prompt",
};

function mockCommandSkillFilesystem(
  skillRoot: string,
  options?: {
    manifestEntry?: string;
    includePackageJson?: boolean;
    nestedBundleDirName?: string;
  },
) {
  const manifestEntry = options?.manifestEntry ?? "src/index.mjs";
  const includePackageJson = options?.includePackageJson ?? true;
  const nestedBundleDirName = options?.nestedBundleDirName?.trim() || "";
  const bundleRoot = nestedBundleDirName ? `${skillRoot}/${nestedBundleDirName}` : skillRoot;
  const manifestPath = `${bundleRoot}/skill.manifest.json`;
  const entryPath = `${bundleRoot}/${manifestEntry}`;
  const packageJsonPath = `${bundleRoot}/package.json`;
  const skillFilePath = `${bundleRoot}/SKILL.md`;

  const existingPaths = [manifestPath, entryPath, skillFilePath];
  if (includePackageJson) {
    existingPaths.push(packageJsonPath);
  }

  const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((targetPath) => {
    const normalized = String(targetPath).replace(/\\/g, "/");
    return existingPaths.includes(normalized);
  });

  const readdirSpy = vi.spyOn(fs, "readdirSync").mockImplementation((targetPath: any) => {
    const normalized = String(targetPath).replace(/\\/g, "/");
    if (normalized === skillRoot) {
      if (nestedBundleDirName) {
        return [
          { name: nestedBundleDirName, isDirectory: () => true, isFile: () => false },
        ] as any;
      }
      return [
        { name: "skill.manifest.json", isDirectory: () => false, isFile: () => true },
        { name: "SKILL.md", isDirectory: () => false, isFile: () => true },
        ...(includePackageJson
          ? [{ name: "package.json", isDirectory: () => false, isFile: () => true }]
          : []),
        { name: "src", isDirectory: () => true, isFile: () => false },
      ] as any;
    }
    if (nestedBundleDirName && normalized === bundleRoot) {
      return [
        { name: "skill.manifest.json", isDirectory: () => false, isFile: () => true },
        { name: "SKILL.md", isDirectory: () => false, isFile: () => true },
        ...(includePackageJson
          ? [{ name: "package.json", isDirectory: () => false, isFile: () => true }]
          : []),
        { name: "src", isDirectory: () => true, isFile: () => false },
      ] as any;
    }
    if (normalized === `${bundleRoot}/src`) {
      return [{ name: "index.mjs", isDirectory: () => false, isFile: () => true }] as any;
    }
    return [] as any;
  });

  const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation((targetPath: any) => {
    const normalized = String(targetPath).replace(/\\/g, "/");
    if (normalized === manifestPath) {
      return Buffer.from(JSON.stringify({ entry: manifestEntry }), "utf-8") as any;
    }
    if (includePackageJson && normalized === packageJsonPath) {
      return Buffer.from(JSON.stringify({ name: "modern-editorial-slide", dependencies: { pptxgenjs: "^3.12.0" } }), "utf-8") as any;
    }
    if (normalized === skillFilePath) {
      return Buffer.from("# Modern Editorial Slide Skill\n", "utf-8") as any;
    }
    if (normalized === entryPath) {
      return Buffer.from("console.log('ok')\n", "utf-8") as any;
    }
    throw new Error(`Unexpected readFileSync path: ${normalized}`);
  });

  return {
    skillFilePath,
    restore() {
      existsSpy.mockRestore();
      readdirSpy.mockRestore();
      readSpy.mockRestore();
    },
  };
}

describe("skillExecutor sandbox dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSandboxEnabled).mockReturnValue(false);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(false);
    vi.mocked(getDispatchMode).mockReturnValue("optional");
  });

  afterEach(() => {
    delete process.env.OPENSANDBOX_ENABLED;
  });

  it("routes core-text to LLM text path", async () => {
    const skill = makeSkill({ executionMode: "core-text" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.type).toBe("text");
    expect(result.success).toBe(true);
    expect(dispatchToSandbox).not.toHaveBeenCalled();
  });

  it("routes llm-only to LLM text path (backward compat)", async () => {
    const skill = makeSkill({ executionMode: "llm-only" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.type).toBe("text");
    expect(result.success).toBe(true);
    expect(dispatchToSandbox).not.toHaveBeenCalled();
  });

  it("routes enhance-prompt to LLM text path", async () => {
    const skill = makeSkill({ executionMode: "enhance-prompt" as any });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.type).toBe("text");
    expect(result.success).toBe(true);
  });

  it("dispatches sandbox-code to sandbox when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-123" });

    const skill = makeSkill({ executionMode: "sandbox-code" });
    const result = await executeSkill(skill, defaultParams, 1, "token", "tenant-001");

    expect(result.type).toBe("sandbox-job");
    expect(result.jobId).toBe("job-123");
    expect(result.success).toBe(true);
    expect(result.isAsync).toBe(true);
    expect(dispatchToSandbox).toHaveBeenCalledWith(expect.objectContaining({
      profileOverride: "code-default",
      tenantId: "tenant-001",
    }));
  });

  it("dispatches sandbox-command to sandbox when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-456" });

    const mockedFs = mockCommandSkillFilesystem("/virtual/test-command-skill", {
      includePackageJson: false,
    });

    try {
      const skill = makeSkill({
        id: "test-command-skill",
        executionMode: "sandbox-command",
        skillFilePath: mockedFs.skillFilePath,
      });
      const result = await executeSkill(skill, defaultParams, 1, "token", "tenant-001");

      expect(result.type).toBe("sandbox-job");
      expect(result.jobId).toBe("job-456");
    } finally {
      mockedFs.restore();
    }
  });

  it("dispatches nested shared-bundle sandbox-command skills when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-nested" });

    const mockedFs = mockCommandSkillFilesystem("/virtual/modern-editorial-slide", {
      includePackageJson: true,
      nestedBundleDirName: "modern_editorial_slide_skill",
    });

    try {
      const skill = makeSkill({
        id: "modern-editorial-slide",
        executionMode: "sandbox-command",
        skillFilePath: mockedFs.skillFilePath,
      });
      const result = await executeSkill(skill, defaultParams, 1, "token", "tenant-001");

      expect(result.type).toBe("sandbox-job");
      expect(result.jobId).toBe("job-nested");
    } finally {
      mockedFs.restore();
    }
  });

  it("dispatches sandbox-browser to sandbox when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-789" });

    const skill = makeSkill({ executionMode: "sandbox-browser" });
    const result = await executeSkill(skill, defaultParams, 1, "token", "tenant-001");
    expect(result.type).toBe("sandbox-job");
  });

  it("dispatches sandbox-media to sandbox when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-media" });

    const skill = makeSkill({ executionMode: "sandbox-media" });
    const result = await executeSkill(skill, defaultParams, 1, "token", "tenant-001");
    expect(result.type).toBe("sandbox-job");
  });

  it("returns error when sandbox dispatch lacks tenant context", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);

    const skill = makeSkill({ executionMode: "sandbox-code" });
    const result = await executeSkill(skill, defaultParams, 1, "token");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Tenant context required");
    expect(dispatchToSandbox).not.toHaveBeenCalled();
  });

  it("falls back to legacy when sandbox disabled for sandbox-code", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(false);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(false);

    // sandbox-code falls through to the default case since sandbox is disabled
    const skill = makeSkill({ executionMode: "sandbox-code", type: "chat-assistant" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    // Should not be a sandbox-job since sandbox is disabled
    expect(result.type).not.toBe("sandbox-job");
  });

  it("returns error when dispatch required but disabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(false);
    vi.mocked(shouldUseSandboxForFeature).mockImplementation(() => {
      throw new Error("Sandbox required but disabled");
    });
    vi.mocked(getDispatchMode).mockReturnValue("required");

    const skill = makeSkill({ executionMode: "sandbox-code" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.success).toBe(false);
    expect(result.error).toContain("required but unavailable");
  });

  it("result shape matches SkillExecutionResult for sandbox-job", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-shape-test" });

    const skill = makeSkill({ executionMode: "sandbox-code" });
    const result = await executeSkill(skill, defaultParams, 1, "token", "tenant-001");

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("skillId");
    expect(result).toHaveProperty("type");
    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("isAsync");
    expect(result).toHaveProperty("message");
  });

  it("media-generate image skills use legacy image executor even when sandbox is enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(getDefaultModel).mockReturnValue({ id: "test-image-model" } as any);
    vi.mocked(getModelById).mockReturnValue({
      id: "test-image-model",
      name: "Test Image Model",
      type: "image",
      configJson: {},
    } as any);
    vi.mocked(mediaGenerationService.generateImage as any).mockResolvedValue({
      data: [{ url: "https://example.com/generated.png" }],
      creditsUsed: 3,
    });

    const skill = makeSkill({ executionMode: "media-generate", type: "image-generation" });
    const result = await executeSkill(skill, defaultParams, 1, "token", "tenant-001");
    expect(result.type).toBe("image");
    expect(result.success).toBe(true);
    expect(result.resultUrl).toBe("https://example.com/generated.png");
    expect(dispatchToSandbox).not.toHaveBeenCalled();
  });

  it("routes audio-generation to audio executor in legacy path", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(false);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(false);
    vi.mocked(getDefaultModel).mockReturnValue({ id: "uvoice/tts-standard" } as any);
    vi.mocked(getModelById).mockReturnValue({
      id: "uvoice/tts-standard",
      name: "UVoice TTS Standard",
      type: "audio",
      creditCost: 1,
      configJson: { pricingTiers: { default: 1 } },
    } as any);
    vi.mocked(mediaGenerationService.generateAudio as any).mockResolvedValue({
      data: [{ url: "https://example.com/audio.mp3" }],
      creditsUsed: 1,
    });

    const skill = makeSkill({ executionMode: "media-generate", type: "audio-generation" as any });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.success).toBe(true);
    expect(result.type).toBe("audio");
    expect(mediaGenerationService.generateAudio).toHaveBeenCalled();
  });

  it("routes executionMode=python to sandbox-python when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-python-1" });

    const skillRoot = "/virtual/python-skill";
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((targetPath) => {
      const normalized = String(targetPath).replace(/\\/g, "/");
      return normalized === `${skillRoot}/python/skill.py`;
    });
    const readdirSpy = vi.spyOn(fs, "readdirSync").mockImplementation((targetPath: any) => {
      const normalized = String(targetPath).replace(/\\/g, "/");
      if (normalized === skillRoot) {
        return [{
          name: "python",
          isDirectory: () => true,
          isFile: () => false,
        }] as any;
      }
      if (normalized === `${skillRoot}/python`) {
        return [{
          name: "skill.py",
          isDirectory: () => false,
          isFile: () => true,
        }] as any;
      }
      return [] as any;
    });
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation((targetPath: any) => {
      const normalized = String(targetPath).replace(/\\/g, "/");
      if (normalized === `${skillRoot}/python/skill.py`) {
        return Buffer.from("print('ok')\n", "utf-8") as any;
      }
      throw new Error(`Unexpected readFileSync path: ${normalized}`);
    });

    try {
      const skill = makeSkill({
        executionMode: "python" as any,
        skillFilePath: `${skillRoot}/skill.md`,
      });
      const result = await executeSkill(skill, defaultParams, 1, "token-abc", "tenant-001");

      expect(result.type).toBe("sandbox-job");
      expect(result.jobId).toBe("job-python-1");
      expect(dispatchToSandbox).toHaveBeenCalledWith(expect.objectContaining({
        executionMode: "sandbox-python",
        profileOverride: "code-default",
      }));
    } finally {
      existsSpy.mockRestore();
      readdirSpy.mockRestore();
      readSpy.mockRestore();
    }
  });

  it("prepares sandbox-command payload for manifest-based slide skills", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-slide-1" });

    const skillRoot = "/virtual/modern-editorial-slide";
    const mockedFs = mockCommandSkillFilesystem(skillRoot);

    try {
      const skill = makeSkill({
        id: "modern-editorial-slide",
        name: "Modern Editorial Slide",
        category: "slide_generation",
        executionMode: "sandbox-command" as any,
        maxRuntimeSeconds: 120,
        skillFilePath: mockedFs.skillFilePath,
      });

      const result = await executeSkill(
        skill,
        {
          ...defaultParams,
          extraParams: {
            request: {
              projectTitle: "Deck",
              outputFormats: ["json", "pptx"],
              renderOptions: {
                jsonFileName: "custom-layout.json",
                pptxFileName: "custom-slides.pptx",
              },
              content: { rawText: "hello" },
            },
          },
        },
        1,
        "token-slide",
        "tenant-001",
      );

      expect(result.type).toBe("sandbox-job");
      expect(result.jobId).toBe("job-slide-1");
      expect(dispatchToSandbox).toHaveBeenCalledWith(expect.objectContaining({
        executionMode: "sandbox-command",
        profileOverride: "browser-default",
        metadata: expect.objectContaining({
          runtimeOverrides: {
            timeoutSeconds: 120,
          },
          commands: expect.arrayContaining([
            "mkdir -p '/tmp/smartspec-sandbox/skill-output'",
            "npm --prefix '/tmp/smartspec-sandbox/skill' install --omit=dev --no-package-lock --ignore-scripts --no-audit --no-fund",
            "node '/tmp/smartspec-sandbox/skill/src/index.mjs' '/tmp/smartspec-sandbox/skill-input.json' '/tmp/smartspec-sandbox/skill-output'",
          ]),
          output_paths: expect.arrayContaining([
            "/tmp/smartspec-sandbox/skill-output/manifest.json",
            "/tmp/smartspec-sandbox/skill-output/debug-report.json",
            "/tmp/smartspec-sandbox/skill-output/custom-layout.json",
            "/tmp/smartspec-sandbox/skill-output/custom-slides.pptx",
          ]),
          inlineFiles: expect.arrayContaining([
            expect.objectContaining({ path: "/tmp/smartspec-sandbox/skill/skill.manifest.json" }),
            expect.objectContaining({ path: "/tmp/smartspec-sandbox/skill/package.json" }),
            expect.objectContaining({ path: "/tmp/smartspec-sandbox/skill/src/index.mjs" }),
            expect.objectContaining({ path: "/tmp/smartspec-sandbox/skill-input.json" }),
          ]),
        }),
      }));
    } finally {
      mockedFs.restore();
    }
  });

  it("rejects sandbox-command output file names that try to escape the sandbox output directory", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);

    const mockedFs = mockCommandSkillFilesystem("/virtual/modern-editorial-slide", {
      includePackageJson: false,
    });

    try {
      const result = await executeSkill(
        makeSkill({
          id: "modern-editorial-slide",
          category: "slide_generation",
          executionMode: "sandbox-command" as any,
          skillFilePath: mockedFs.skillFilePath,
        }),
        {
          ...defaultParams,
          extraParams: {
            request: {
              outputFormats: ["json"],
              renderOptions: {
                jsonFileName: "../escaped.json",
              },
            },
          },
        },
        1,
        "token-slide",
        "tenant-001",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid sandbox output file name");
      expect(dispatchToSandbox).not.toHaveBeenCalled();
    } finally {
      mockedFs.restore();
    }
  });

  it("rejects sandbox skills when the selected profile blocks required network access", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    const mockedFs = mockCommandSkillFilesystem("/virtual/networked-command-skill", {
      includePackageJson: false,
    });

    try {
      const result = await executeSkill(
        makeSkill({
          id: "networked-command-skill",
          executionMode: "sandbox-command" as any,
          sandboxProfileSlug: "file-parser",
          requiresNetwork: true,
          skillFilePath: mockedFs.skillFilePath,
        }),
        defaultParams,
        1,
        "token",
        "tenant-001",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not allow network access");
      expect(dispatchToSandbox).not.toHaveBeenCalled();
    } finally {
      mockedFs.restore();
    }
  });

  it("keeps lineage metadata from python skill output", async () => {
    const pythonSkillPath = "/virtual/python-skill/python/skill.py";
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((targetPath) => {
      const normalized = String(targetPath).replace(/\\/g, "/");
      return normalized === pythonSkillPath;
    });

    const child = new EventEmitter() as EventEmitter & {
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdin = { write: vi.fn(), end: vi.fn() };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();

    vi.mocked(spawn).mockReturnValue(child as any);

    try {
      const skill = makeSkill({
        id: "python-lineage-skill",
        executionMode: "python",
        skillFilePath: "/virtual/python-skill/SKILL.md",
      });

      const resultPromise = executeSkill(skill, defaultParams, 1, "token", "tenant-001");

      child.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            success: true,
            output: "done",
            lineage: {
              role: "handoff",
              checkpointVersion: 3,
              parentRunId: "run-parent",
              childRunIds: ["run-child-1"],
              verificationState: "passed",
              artifactRefs: ["out/result.json"],
              resumeCursor: "cursor-7",
            },
          }),
        ),
      );
      child.stderr.emit("data", Buffer.from(""));
      child.emit("close", 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.metadata).toMatchObject({
        lineage: {
          role: "handoff",
          checkpointVersion: 3,
          parentRunId: "run-parent",
          childRunIds: ["run-child-1"],
          verificationState: "passed",
          artifactRefs: ["out/result.json"],
          resumeCursor: "cursor-7",
        },
      });
    } finally {
      existsSpy.mockRestore();
    }
  });

  it("skips copied workspace python skill paths and launches ISC from a canonical skill root", async () => {
    const staleWorkspaceScript = "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/intelligence-skill-creator/20260423_083541/skills/intelligence-skill-creator/python/skill.py";
    const canonicalScriptSuffix = "/skills/intelligence-skill-creator/python/skill.py";
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((targetPath) => {
      const normalized = String(targetPath).replace(/\\/g, "/");
      return normalized === staleWorkspaceScript || normalized.endsWith(canonicalScriptSuffix);
    });

    const child = new EventEmitter() as EventEmitter & {
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdin = { write: vi.fn(), end: vi.fn() };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();

    vi.mocked(spawn).mockReturnValue(child as any);

    try {
      const resultPromise = executeSkill(
        makeSkill({
          id: "intelligence-skill-creator",
          executionMode: "python",
          skillFilePath: staleWorkspaceScript.replace("/python/skill.py", "/SKILL.md"),
        }),
        defaultParams,
        1,
        "token",
        "tenant-001",
      );

      child.stdout.emit("data", Buffer.from(JSON.stringify({ success: true, output: "done" })));
      child.stderr.emit("data", Buffer.from(""));
      child.emit("close", 0);

      const result = await resultPromise;
      const launchedScript = String(vi.mocked(spawn).mock.calls[0]?.[1]?.[0] ?? "").replace(/\\/g, "/");

      expect(result.success).toBe(true);
      expect(launchedScript).toContain("intelligence-skill-creator/python/skill.py");
      expect(launchedScript).not.toContain("/runs/workspaces/");
    } finally {
      existsSpy.mockRestore();
    }
  });
});
