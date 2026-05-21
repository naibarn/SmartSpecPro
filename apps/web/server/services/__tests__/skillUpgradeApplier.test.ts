import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  launchSkillStudioTaskMock,
  resolveSkillStudioSystemModelMock,
  buildSkillContractSnapshotMock,
  compareSkillContractSnapshotsMock,
  refreshSkillCacheMock,
  hasRelativeSkillManifestMock,
  resolveSkillDirCandidatesMock,
  resolveSkillManifestPathMock,
  updateSkillManifestFilesMock,
} = vi.hoisted(() => ({
  launchSkillStudioTaskMock: vi.fn(),
  resolveSkillStudioSystemModelMock: vi.fn(),
  buildSkillContractSnapshotMock: vi.fn(),
  compareSkillContractSnapshotsMock: vi.fn(),
  refreshSkillCacheMock: vi.fn(),
  hasRelativeSkillManifestMock: vi.fn(),
  resolveSkillDirCandidatesMock: vi.fn(),
  resolveSkillManifestPathMock: vi.fn(),
  updateSkillManifestFilesMock: vi.fn(),
}));

vi.mock("../skillStudioService", () => ({
  launchSkillStudioTask: launchSkillStudioTaskMock,
  resolveSkillStudioSystemModel: resolveSkillStudioSystemModelMock,
}));

vi.mock("../skillRegistry", () => ({
  refreshSkillCache: refreshSkillCacheMock,
}));

vi.mock("../skillCompatibilityGate", () => ({
  buildSkillContractSnapshot: buildSkillContractSnapshotMock,
  compareSkillContractSnapshots: compareSkillContractSnapshotsMock,
}));

vi.mock("../skillFiles", () => ({
  hasRelativeSkillManifest: hasRelativeSkillManifestMock,
  resolveSkillDirCandidates: resolveSkillDirCandidatesMock,
  resolveSkillManifestPath: resolveSkillManifestPathMock,
  updateSkillManifestFiles: updateSkillManifestFilesMock,
}));

import { applySkillUpgradeRecommendation } from "../skillUpgradeApplier";

const tempDirs: string[] = [];

function makeTempSkillDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "skill-upgrade-applier-"));
  tempDirs.push(dir);
  return dir;
}

function createMockDb(options: {
  selectResults: any[][];
  insertReturningResults?: any[][];
  updateReturningResults?: any[][];
}) {
  const selectQueue = [...options.selectResults];
  const insertQueue = [...(options.insertReturningResults ?? [])];
  const updateQueue = [...(options.updateReturningResults ?? [])];
  const updateSetCalls: any[] = [];

  return {
    updateSetCalls,
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockImplementation(async () => selectQueue.shift() ?? []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockImplementation(async () => insertQueue.shift() ?? []),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload) => {
        updateSetCalls.push(payload);
        return {
          where: vi.fn(() => ({
            returning: vi.fn().mockImplementation(async () => updateQueue.shift() ?? []),
          })),
        };
      }),
    })),
  };
}

describe("skillUpgradeApplier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    launchSkillStudioTaskMock.mockReset();
    buildSkillContractSnapshotMock.mockReset();
    compareSkillContractSnapshotsMock.mockReset();
    refreshSkillCacheMock.mockReset();
    hasRelativeSkillManifestMock.mockReset();
    resolveSkillDirCandidatesMock.mockReset();
    resolveSkillManifestPathMock.mockReset();
    updateSkillManifestFilesMock.mockReset();
    hasRelativeSkillManifestMock.mockReturnValue(false);
    resolveSkillDirCandidatesMock.mockReturnValue([]);
    resolveSkillManifestPathMock.mockReturnValue(null);
    resolveSkillStudioSystemModelMock.mockResolvedValue({
      modelId: "test-thinking-1m-model",
      requirements: { supportsThinking: true, contextLength: 1_000_000 },
      matchedCapabilities: ["supportsThinking", "contextLength"],
      missingCapabilities: [],
      contextLength: 1_048_576,
    });
  });

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("queues auto-safe generator-backed upgrades and finalizes compatibility after studio completion", async () => {
    const recommendation = {
      id: 101,
      skillId: 7,
      scheduleId: null,
      recommendationType: "fixtures-missing",
      title: "Add fixture coverage",
      summary: "Add fixture coverage for safe contract verification.",
      rationale: "Better regression checks",
      currentRuntime: "javascript-classic",
      proposedRuntime: null,
      proposedAction: "add-fixtures",
      recommendationJson: {
        affectedFiles: ["tests/fixtures"],
        details: { fixtureCount: 2 },
      },
      contractDeltaJson: {
        inputRequiredFields: ["topic"],
        outputRequiredFields: ["files"],
      },
      status: "pending_review",
      isAutoApplySafe: true,
    };

    const skill = {
      id: 7,
      tenantId: "tenant-1",
      slug: "slide-bundle",
      name: "Slide Bundle",
      description: "PowerPoint bundle",
      folderPath: "/skills/slide-bundle",
      executionMode: "sandbox-command",
      configJson: {},
      sandboxProfileSlug: "browser-default",
      requiresNetwork: true,
      requiresBrowser: false,
      visibility: "private",
    };

    const run = { id: 501, skillId: 7, recommendationId: 101, status: "running" };
    const approvedRecommendation = { ...recommendation, status: "approved" };
    const queuedRun = { ...run, status: "running" };
    const appliedRecommendation = { ...recommendation, status: "applied", compatibilityStatus: "compatible" };
    const completedRun = { ...run, status: "completed" };

    const db = createMockDb({
      selectResults: [
        [recommendation],
        [skill],
        [],
        [skill],
      ],
      insertReturningResults: [
        [run],
      ],
      updateReturningResults: [
        [approvedRecommendation],
        [queuedRun],
        [appliedRecommendation],
        [completedRun],
      ],
    });

    const baselineSnapshot = {
      executionMode: "sandbox-command",
      runtimeProfile: "javascript-classic",
      manifestPath: "/skills/slide-bundle/SKILL.md",
      lockPath: null,
      nativeBundleReady: false,
      nativeBundleFiles: [],
      manifestHash: "baseline-manifest",
      inputSchemaHash: "baseline-input",
      outputSchemaHash: "baseline-output",
      fixtureHash: "baseline-fixture",
      testsHash: "baseline-tests",
      contractHash: "baseline-contract",
      schemaSummary: {
        input: { present: true, requiredFields: ["topic"], propertyTypes: { topic: "string" }, propertyCount: 1 },
        output: { present: true, requiredFields: ["files"], propertyTypes: { files: "array" }, propertyCount: 1 },
        uiPresent: true,
      },
      fileInventory: ["SKILL.md"],
    };

    const candidateSnapshot = {
      ...baselineSnapshot,
      runtimeProfile: "genjs",
      manifestPath: "/skills/slide-bundle/skill.manifest.json",
      manifestHash: "candidate-manifest",
      contractHash: "candidate-contract",
      fileInventory: ["skill.manifest.json", "src/index.mjs"],
    };

    buildSkillContractSnapshotMock
      .mockReturnValueOnce(baselineSnapshot)
      .mockReturnValueOnce(candidateSnapshot);
    compareSkillContractSnapshotsMock.mockReturnValue({
      status: "compatible",
      issues: [],
    });

    let completionHook: ((result: any) => Promise<void>) | null = null;
    launchSkillStudioTaskMock.mockImplementation(async (_ctx, _input, hooks) => {
      completionHook = hooks?.onCompleted ?? null;
      return {
        taskId: "studio-task-1",
        mode: "improve",
        summary: "queued",
      };
    });

    const result = await applySkillUpgradeRecommendation({
      db,
      recommendationId: 101,
      requestedBy: 11,
      userRole: "admin",
      userToken: "user-token",
      publicUrl: "https://tenant.example.com",
    });

    expect(result.mode).toBe("queued");
    expect(result.applyStrategy).toBe("auto-apply");
    expect(result.taskId).toBe("studio-task-1");
    expect(launchSkillStudioTaskMock).toHaveBeenCalledTimes(1);
    expect(launchSkillStudioTaskMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      autoApplyProposal: true,
    }));
    expect(completionHook).toBeTruthy();

    await completionHook?.({
      success: true,
      message: "Applied",
      metadata: {
        appliedProposal: "round-1.diff",
      },
    });

    expect(buildSkillContractSnapshotMock).toHaveBeenCalledTimes(2);
    expect(compareSkillContractSnapshotsMock).toHaveBeenCalledWith(baselineSnapshot, candidateSnapshot);
  });

  it("forces proposal-first flow when the maintenance change is breaking even if auto-apply is marked safe", async () => {
    const recommendation = {
      id: 103,
      skillId: 9,
      scheduleId: null,
      recommendationType: "migrate-to-genjs",
      title: "Upgrade to GenJS bundle",
      summary: "Migrate this skill to GenJS.",
      rationale: "Better modularity",
      currentRuntime: "javascript-classic",
      proposedRuntime: "genjs",
      proposedAction: "migrate-to-genjs",
      recommendationJson: {
        affectedFiles: ["skill.manifest.json", "src/index.mjs"],
        details: { candidateScore: 11 },
      },
      contractDeltaJson: {
        inputRequiredFields: ["topic"],
        outputRequiredFields: ["files"],
      },
      status: "pending_review",
      isAutoApplySafe: true,
    };

    const skill = {
      id: 9,
      tenantId: "tenant-1",
      slug: "migrate-me",
      name: "Migrate Me",
      description: "Runtime migration",
      folderPath: "/skills/migrate-me",
      executionMode: "sandbox-command",
      configJson: {},
      sandboxProfileSlug: "browser-default",
      requiresNetwork: true,
      requiresBrowser: false,
      visibility: "private",
    };

    const run = { id: 503, skillId: 9, recommendationId: 103, status: "running" };
    const approvedRecommendation = { ...recommendation, status: "approved" };
    const queuedRun = { ...run, status: "running" };

    const db = createMockDb({
      selectResults: [
        [recommendation],
        [skill],
        [],
        [skill],
      ],
      insertReturningResults: [
        [run],
      ],
      updateReturningResults: [
        [approvedRecommendation],
        [queuedRun],
      ],
    });

    const baselineSnapshot = {
      executionMode: "sandbox-command",
      runtimeProfile: "javascript-classic",
      manifestPath: "/skills/migrate-me/SKILL.md",
      lockPath: null,
      nativeBundleReady: false,
      nativeBundleFiles: [],
      manifestHash: "baseline-manifest",
      inputSchemaHash: "baseline-input",
      outputSchemaHash: "baseline-output",
      fixtureHash: "baseline-fixture",
      testsHash: "baseline-tests",
      contractHash: "baseline-contract",
      schemaSummary: {
        input: { present: true, requiredFields: ["topic"], propertyTypes: { topic: "string" }, propertyCount: 1 },
        output: { present: true, requiredFields: ["files"], propertyTypes: { files: "array" }, propertyCount: 1 },
        uiPresent: true,
      },
      fileInventory: ["SKILL.md"],
    };

    buildSkillContractSnapshotMock
      .mockReturnValueOnce(baselineSnapshot)
      .mockReturnValueOnce({ ...baselineSnapshot, runtimeProfile: "genjs" });
    compareSkillContractSnapshotsMock.mockReturnValue({
      status: "compatible",
      issues: [],
    });

    launchSkillStudioTaskMock.mockResolvedValue({
      taskId: "studio-task-2",
      mode: "improve",
      summary: "queued",
    });

    const result = await applySkillUpgradeRecommendation({
      db,
      recommendationId: 103,
      requestedBy: 11,
      userRole: "admin",
      userToken: "user-token",
      publicUrl: "https://tenant.example.com",
    });

    expect(result.mode).toBe("queued");
    expect(result.applyStrategy).toBe("proposal");
    expect(launchSkillStudioTaskMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      autoApplyProposal: false,
    }));
  });

  it("auto-applies Media Studio instruction-only recommendations and includes all QA details in the brief", async () => {
    const recommendation = {
      id: 105,
      skillId: 11,
      scheduleId: null,
      recommendationType: "media-studio-auto-learning",
      title: "Media Studio improvement proposal: Furniture Storyboard",
      summary: "Prompt still lacks material lock; storyboard grid is weak",
      rationale: "Generated from Media Studio prompt qa review.",
      currentRuntime: "llm-only",
      proposedRuntime: "llm-only",
      proposedAction: "review-and-patch-skill-instructions",
      recommendationJson: {
        source: "media_studio_auto_learning",
        trigger: "prompt_qa",
        score: 72,
        affectedFiles: ["skill.md"],
        issues: [
          {
            id: "material_lock",
            severity: "high",
            title: "Prompt still lacks furniture material lock",
            recommendation: "Add stronger material and geometry fidelity rules.",
          },
          {
            id: "storyboard_grid",
            severity: "medium",
            title: "Storyboard grid rule is unclear",
            recommendation: "Require equal panels and controlled storyboard layout.",
          },
        ],
        proposedChanges: [
          {
            title: "Add furniture geometry/material lock",
            reason: "Prevent source product drift.",
            targetFile: "skill.md",
            targetSection: "Product fidelity rules",
            risk: "medium",
          },
          {
            title: "Add storyboard grid consistency rule",
            reason: "Prevent collage output.",
            targetFile: "skill.md",
            targetSection: "Storyboard format rules",
            risk: "low",
          },
        ],
        userAdditionalInstruction: "Do not output JSON; return plain text prompt only.",
        evidence: {
          activeTab: "image",
          promptPreview: "{\"prompt\":\"bad\"}",
        },
      },
      contractDeltaJson: {
        expectedFiles: ["skill.md"],
        contractImpact: "instruction-only proposal",
      },
      status: "pending_review",
      isAutoApplySafe: false,
    };

    const skill = {
      id: 11,
      tenantId: "tenant-1",
      slug: "furniture-reference-storyboard",
      name: "Furniture Storyboard",
      description: "Furniture prompt skill",
      folderPath: "/skills/furniture-reference-storyboard",
      executionMode: "llm-only",
      configJson: {},
      sandboxProfileSlug: null,
      requiresNetwork: false,
      requiresBrowser: false,
      visibility: "public",
    };

    const run = { id: 505, skillId: 11, recommendationId: 105, status: "running" };
    const approvedRecommendation = { ...recommendation, status: "approved" };
    const queuedRun = { ...run, status: "running" };
    const appliedRecommendation = { ...recommendation, status: "applied", compatibilityStatus: "compatible" };
    const completedRun = { ...run, status: "completed" };

    const db = createMockDb({
      selectResults: [
        [recommendation],
        [skill],
        [],
        [skill],
      ],
      insertReturningResults: [
        [run],
      ],
      updateReturningResults: [
        [approvedRecommendation],
        [queuedRun],
        [appliedRecommendation],
        [completedRun],
      ],
    });

    const baselineSnapshot = {
      executionMode: "llm-only",
      runtimeProfile: "markdown",
      manifestPath: "/skills/furniture-reference-storyboard/skill.md",
      lockPath: null,
      nativeBundleReady: false,
      nativeBundleFiles: [],
      manifestHash: "baseline-manifest",
      inputSchemaHash: "baseline-input",
      outputSchemaHash: "baseline-output",
      fixtureHash: "baseline-fixture",
      testsHash: "baseline-tests",
      contractHash: "baseline-contract",
      schemaSummary: {
        input: { present: true, requiredFields: [], propertyTypes: {}, propertyCount: 0 },
        output: { present: false, requiredFields: [], propertyTypes: {}, propertyCount: 0 },
        uiPresent: true,
      },
      fileInventory: ["skill.md"],
    };

    buildSkillContractSnapshotMock
      .mockReturnValueOnce(baselineSnapshot)
      .mockReturnValueOnce({ ...baselineSnapshot, manifestHash: "candidate-manifest" });
    compareSkillContractSnapshotsMock.mockReturnValue({
      status: "compatible",
      issues: [],
    });

    let completionHook: ((result: any) => Promise<void>) | null = null;
    launchSkillStudioTaskMock.mockImplementation(async (_ctx, _input, hooks) => {
      completionHook = hooks?.onCompleted ?? null;
      return {
        taskId: "studio-task-3",
        mode: "improve",
        summary: "queued",
      };
    });

    const result = await applySkillUpgradeRecommendation({
      db,
      recommendationId: 105,
      requestedBy: 11,
      userRole: "admin",
      userToken: "user-token",
      publicUrl: "https://tenant.example.com",
    });

    const launchInput = launchSkillStudioTaskMock.mock.calls[0]?.[1];
    expect(result.applyStrategy).toBe("auto-apply");
    expect(launchInput).toEqual(expect.objectContaining({
      autoApplyProposal: true,
    }));
    expect(launchInput.brief).toContain("Detected issues that must be addressed");
    expect(launchInput.brief).toContain("Prompt still lacks furniture material lock");
    expect(launchInput.brief).toContain("Add storyboard grid consistency rule");
    expect(launchInput.brief).toContain("Do not output JSON; return plain text prompt only.");

    await completionHook?.({
      success: true,
      message: "Applied",
      metadata: {
        appliedProposal: "round-3.diff",
      },
    });

    expect(compareSkillContractSnapshotsMock).toHaveBeenCalledWith(
      baselineSnapshot,
      expect.objectContaining({ manifestHash: "candidate-manifest" }),
    );
  });

  it("blocks and restores generator-backed apply when existing skill markdown content is removed", async () => {
    const skillDir = makeTempSkillDir();
    const baselineSkillMarkdown = [
      "---",
      "name: furniture-reference-storyboard",
      "icon: sofa",
      "tags:",
      "  - furniture",
      "execution_mode: llm-only",
      "---",
      "# Prompt Logic",
      "",
      "## Media Studio Output Contract",
      "Return plain prompt text only.",
      "",
      "## Multi-Frame Storyboard Visual Rule",
      "Preserve the requested storyboard grid.",
      "",
      "## Furniture Product Fidelity Rule",
      "Preserve geometry and material.",
    ].join("\n");
    writeFileSync(path.join(skillDir, "SKILL.md"), baselineSkillMarkdown, "utf8");
    writeFileSync(path.join(skillDir, "skill.md"), baselineSkillMarkdown, "utf8");
    resolveSkillDirCandidatesMock.mockReturnValue([skillDir]);

    const recommendation = {
      id: 205,
      skillId: 21,
      scheduleId: null,
      recommendationType: "media-studio-auto-learning",
      title: "Media Studio improvement proposal: Furniture Storyboard",
      summary: "Prompt needs stronger storyboard rules",
      rationale: "Generated from Media Studio prompt qa review.",
      currentRuntime: "llm-only",
      proposedRuntime: "llm-only",
      proposedAction: "review-and-patch-skill-instructions",
      recommendationJson: {
        source: "media_studio_auto_learning",
        trigger: "prompt_qa",
        affectedFiles: ["skill.md"],
        issues: [{ id: "grid", severity: "medium", title: "Grid weak", recommendation: "Keep grid rules." }],
        proposedChanges: [{ title: "Improve grid", reason: "Prevent drift.", targetFile: "skill.md", risk: "low" }],
      },
      contractDeltaJson: {
        expectedFiles: ["skill.md"],
        contractImpact: "instruction-only proposal",
      },
      status: "pending_review",
      isAutoApplySafe: false,
    };

    const skill = {
      id: 21,
      tenantId: "tenant-1",
      slug: "furniture-reference-storyboard",
      name: "Furniture Storyboard",
      description: "Furniture prompt skill",
      folderPath: skillDir,
      executionMode: "llm-only",
      configJson: {},
      sandboxProfileSlug: null,
      requiresNetwork: false,
      requiresBrowser: false,
      visibility: "public",
    };

    const run = { id: 705, skillId: 21, recommendationId: 205, status: "running" };
    const approvedRecommendation = { ...recommendation, status: "approved" };
    const queuedRun = { ...run, status: "running" };

    const db = createMockDb({
      selectResults: [
        [recommendation],
        [skill],
        [],
      ],
      insertReturningResults: [
        [run],
      ],
      updateReturningResults: [
        [approvedRecommendation],
        [queuedRun],
      ],
    });

    const baselineSnapshot = {
      executionMode: "llm-only",
      runtimeProfile: "markdown",
      manifestPath: path.join(skillDir, "skill.md"),
      lockPath: null,
      nativeBundleReady: false,
      nativeBundleFiles: [],
      manifestHash: "baseline-manifest",
      inputSchemaHash: "baseline-input",
      outputSchemaHash: "baseline-output",
      fixtureHash: "baseline-fixture",
      testsHash: "baseline-tests",
      contractHash: "baseline-contract",
      schemaSummary: {
        input: { present: true, requiredFields: [], propertyTypes: {}, propertyCount: 0 },
        output: { present: false, requiredFields: [], propertyTypes: {}, propertyCount: 0 },
        uiPresent: true,
      },
      fileInventory: ["skill.md"],
    };

    buildSkillContractSnapshotMock.mockReturnValueOnce(baselineSnapshot);
    compareSkillContractSnapshotsMock.mockReturnValue({
      status: "compatible",
      issues: [],
    });

    let completionHook: ((result: any) => Promise<void>) | null = null;
    launchSkillStudioTaskMock.mockImplementation(async (_ctx, _input, hooks) => {
      completionHook = hooks?.onCompleted ?? null;
      return {
        taskId: "studio-task-content-loss",
        mode: "improve",
        summary: "queued",
      };
    });

    await applySkillUpgradeRecommendation({
      db,
      recommendationId: 205,
      requestedBy: 11,
      userRole: "admin",
      userToken: "user-token",
      publicUrl: "https://tenant.example.com",
    });

    const damagedMarkdown = [
      "---",
      "name: furniture-reference-storyboard",
      "---",
      "# Prompt Logic",
      "A tiny replacement.",
    ].join("\n");
    writeFileSync(path.join(skillDir, "SKILL.md"), damagedMarkdown, "utf8");
    writeFileSync(path.join(skillDir, "skill.md"), damagedMarkdown, "utf8");

    await completionHook?.({
      success: true,
      message: "Applied",
      metadata: {
        appliedProposal: "bad.diff",
      },
    });

    expect(readFileSync(path.join(skillDir, "SKILL.md"), "utf8")).toBe(baselineSkillMarkdown);
    expect(readFileSync(path.join(skillDir, "skill.md"), "utf8")).toBe(baselineSkillMarkdown);
    expect(compareSkillContractSnapshotsMock).not.toHaveBeenCalled();
    expect(db.updateSetCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "blocked", compatibilityStatus: "blocked" }),
      expect.objectContaining({
        status: "failed",
        summary: "Generator-backed upgrade blocked because it removed existing skill content",
      }),
    ]));
    expect(refreshSkillCacheMock).toHaveBeenCalled();
  });

  it("blocks and restores Media Studio apply when requested improvements are not semantically covered", async () => {
    const skillDir = makeTempSkillDir();
    const baselineSkillMarkdown = [
      "---",
      "name: furniture-reference-storyboard",
      "category: image_prompt_generation",
      "execution_mode: llm-only",
      "---",
      "# Prompt Logic",
      "",
      "## Media Studio Output Contract",
      "Return clean prompt text.",
      "",
      "## Product Fidelity",
      "Preserve the current product instructions.",
      "",
      "## Storyboard Format",
      "Keep the current storyboard instructions.",
    ].join("\n");
    writeFileSync(path.join(skillDir, "SKILL.md"), baselineSkillMarkdown, "utf8");
    writeFileSync(path.join(skillDir, "skill.md"), baselineSkillMarkdown, "utf8");
    resolveSkillDirCandidatesMock.mockReturnValue([skillDir]);

    const recommendation = {
      id: 206,
      skillId: 22,
      scheduleId: null,
      recommendationType: "media-studio-auto-learning",
      title: "Media Studio improvement proposal: Furniture Storyboard",
      summary: "Prompt needs stronger furniture fidelity and grid rules",
      rationale: "Generated from Media Studio prompt qa review.",
      currentRuntime: "llm-only",
      proposedRuntime: "llm-only",
      proposedAction: "review-and-patch-skill-instructions",
      recommendationJson: {
        source: "media_studio_auto_learning",
        trigger: "prompt_qa",
        affectedFiles: ["skill.md"],
        issues: [
          {
            id: "geometry_material",
            severity: "high",
            title: "Prompt still lacks geometry/material lock",
            recommendation: "Add explicit furniture geometry and material lock.",
          },
        ],
        proposedChanges: [
          {
            title: "Add furniture geometry/material lock",
            reason: "Prevent product drift.",
            targetFile: "skill.md",
            targetSection: "Product fidelity rules",
            risk: "medium",
          },
        ],
      },
      contractDeltaJson: {
        expectedFiles: ["skill.md"],
        contractImpact: "instruction-only proposal",
      },
      status: "pending_review",
      isAutoApplySafe: false,
    };

    const skill = {
      id: 22,
      tenantId: "tenant-1",
      slug: "furniture-reference-storyboard",
      name: "Furniture Storyboard",
      description: "Furniture prompt skill",
      folderPath: skillDir,
      executionMode: "llm-only",
      configJson: {},
      sandboxProfileSlug: null,
      requiresNetwork: false,
      requiresBrowser: false,
      visibility: "public",
    };

    const run = { id: 706, skillId: 22, recommendationId: 206, status: "running" };
    const db = createMockDb({
      selectResults: [
        [recommendation],
        [skill],
        [],
      ],
      insertReturningResults: [
        [run],
      ],
      updateReturningResults: [
        [{ ...recommendation, status: "approved" }],
        [{ ...run, status: "running" }],
      ],
    });

    buildSkillContractSnapshotMock.mockReturnValueOnce({
      executionMode: "llm-only",
      runtimeProfile: "markdown",
      manifestPath: path.join(skillDir, "skill.md"),
      lockPath: null,
      nativeBundleReady: false,
      nativeBundleFiles: [],
      manifestHash: "baseline-manifest",
      inputSchemaHash: "baseline-input",
      outputSchemaHash: "baseline-output",
      fixtureHash: "baseline-fixture",
      testsHash: "baseline-tests",
      contractHash: "baseline-contract",
      schemaSummary: {
        input: { present: true, requiredFields: [], propertyTypes: {}, propertyCount: 0 },
        output: { present: false, requiredFields: [], propertyTypes: {}, propertyCount: 0 },
        uiPresent: true,
      },
      fileInventory: ["skill.md"],
    });

    let completionHook: ((result: any) => Promise<void>) | null = null;
    launchSkillStudioTaskMock.mockImplementation(async (_ctx, _input, hooks) => {
      completionHook = hooks?.onCompleted ?? null;
      return {
        taskId: "studio-task-semantic-gap",
        mode: "improve",
        summary: "queued",
      };
    });

    await applySkillUpgradeRecommendation({
      db,
      recommendationId: 206,
      requestedBy: 11,
      userRole: "admin",
      userToken: "user-token",
      publicUrl: "https://tenant.example.com",
    });

    const unrelatedMarkdown = [
      baselineSkillMarkdown,
      "",
      "## Editorial Tone",
      "Keep copy concise and polished for admin review.",
      "Prefer readable English wording for generated prompt drafts.",
    ].join("\n");
    writeFileSync(path.join(skillDir, "SKILL.md"), unrelatedMarkdown, "utf8");
    writeFileSync(path.join(skillDir, "skill.md"), unrelatedMarkdown, "utf8");

    await completionHook?.({
      success: true,
      message: "Applied",
      metadata: {
        appliedProposal: "weak.diff",
      },
    });

    expect(readFileSync(path.join(skillDir, "SKILL.md"), "utf8")).toBe(baselineSkillMarkdown);
    expect(compareSkillContractSnapshotsMock).not.toHaveBeenCalled();
    expect(db.updateSetCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "blocked", compatibilityStatus: "blocked" }),
      expect.objectContaining({
        status: "failed",
        summary: "Generator-backed upgrade blocked because requested Media Studio improvements were not verified",
      }),
    ]));
  });

  it("uses proposal-first flow for non-safe recommendations", async () => {
    const recommendation = {
      id: 102,
      skillId: 8,
      scheduleId: null,
      recommendationType: "migrate-to-genjs",
      title: "Upgrade to GenJS bundle",
      summary: "Migrate this skill to GenJS.",
      rationale: "Better modularity",
      currentRuntime: "javascript-classic",
      proposedRuntime: "genjs",
      proposedAction: "migrate-to-genjs",
      recommendationJson: {
        affectedFiles: ["skill.manifest.json", "src/index.mjs"],
        details: { candidateScore: 11 },
      },
      contractDeltaJson: {
        inputRequiredFields: ["topic"],
        outputRequiredFields: ["files"],
      },
      status: "pending_review",
      isAutoApplySafe: false,
    };

    const skill = {
      id: 8,
      tenantId: "tenant-1",
      slug: "deck-builder",
      name: "Deck Builder",
      description: "Deck builder",
      folderPath: "/skills/deck-builder",
      executionMode: "sandbox-command",
      configJson: {},
      sandboxProfileSlug: "browser-default",
      requiresNetwork: true,
      requiresBrowser: false,
      visibility: "private",
    };

    const run = { id: 502, skillId: 8, recommendationId: 102, status: "running" };
    const approvedRecommendation = { ...recommendation, status: "approved" };
    const queuedRun = { ...run, status: "running" };

    const db = createMockDb({
      selectResults: [
        [recommendation],
        [skill],
        [],
      ],
      insertReturningResults: [
        [run],
      ],
      updateReturningResults: [
        [approvedRecommendation],
        [queuedRun],
        [],
        [],
      ],
    });

    buildSkillContractSnapshotMock.mockReturnValue({
      executionMode: "sandbox-command",
      runtimeProfile: "javascript-classic",
      manifestPath: "/skills/deck-builder/SKILL.md",
      lockPath: null,
      nativeBundleReady: false,
      nativeBundleFiles: [],
      manifestHash: "baseline-manifest",
      inputSchemaHash: "baseline-input",
      outputSchemaHash: "baseline-output",
      fixtureHash: "baseline-fixture",
      testsHash: "baseline-tests",
      contractHash: "baseline-contract",
      schemaSummary: {
        input: { present: true, requiredFields: ["topic"], propertyTypes: { topic: "string" }, propertyCount: 1 },
        output: { present: true, requiredFields: ["files"], propertyTypes: { files: "array" }, propertyCount: 1 },
        uiPresent: true,
      },
      fileInventory: ["SKILL.md"],
    });

    let completionHook: ((result: any) => Promise<void>) | null = null;
    launchSkillStudioTaskMock.mockImplementation(async (_ctx, _input, hooks) => {
      completionHook = hooks?.onCompleted ?? null;
      return {
        taskId: "studio-task-2",
        mode: "improve",
        summary: "queued",
      };
    });

    const result = await applySkillUpgradeRecommendation({
      db,
      recommendationId: 102,
      requestedBy: 11,
      userRole: "admin",
      userToken: "user-token",
      publicUrl: "https://tenant.example.com",
    });

    expect(result.mode).toBe("queued");
    expect(result.applyStrategy).toBe("proposal");
    expect(launchSkillStudioTaskMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      autoApplyProposal: false,
    }));

    await completionHook?.({
      success: true,
      message: "Proposal ready",
      metadata: {
        savedProposals: ["runs/proposals/deck-builder/20260520T143000_r2.diff"],
      },
    });

    expect(compareSkillContractSnapshotsMock).not.toHaveBeenCalled();
  });

  it("treats proposal-first runs with no saved diffs as completed no-change successes", async () => {
    const recommendation = {
      id: 104,
      skillId: 10,
      scheduleId: null,
      recommendationType: "migrate-to-genjs",
      title: "Upgrade to GenJS bundle",
      summary: "Migrate this skill to GenJS.",
      rationale: "Better modularity",
      currentRuntime: "javascript-classic",
      proposedRuntime: "genjs",
      proposedAction: "migrate-to-genjs",
      recommendationJson: {
        affectedFiles: ["skill.manifest.json", "src/index.mjs"],
        details: { candidateScore: 11 },
      },
      contractDeltaJson: {
        inputRequiredFields: ["topic"],
        outputRequiredFields: ["files"],
      },
      status: "pending_review",
      isAutoApplySafe: false,
    };

    const skill = {
      id: 10,
      tenantId: "tenant-1",
      slug: "no-diff-skill",
      name: "No Diff Skill",
      description: "Runtime migration",
      folderPath: "/skills/no-diff-skill",
      executionMode: "sandbox-command",
      configJson: {},
      sandboxProfileSlug: "browser-default",
      requiresNetwork: true,
      requiresBrowser: false,
      visibility: "private",
    };

    const run = { id: 504, skillId: 10, recommendationId: 104, status: "running" };
    const approvedRecommendation = { ...recommendation, status: "approved" };
    const queuedRun = { ...run, status: "running" };
    const completedRecommendation = { ...recommendation, status: "approved" };
    const completedRun = { ...run, status: "completed" };

    const db = createMockDb({
      selectResults: [
        [recommendation],
        [skill],
        [],
      ],
      insertReturningResults: [
        [run],
      ],
      updateReturningResults: [
        [approvedRecommendation],
        [queuedRun],
        [completedRecommendation],
        [completedRun],
      ],
    });

    buildSkillContractSnapshotMock.mockReturnValue({
      executionMode: "sandbox-command",
      runtimeProfile: "javascript-classic",
      manifestPath: "/skills/no-diff-skill/SKILL.md",
      lockPath: null,
      nativeBundleReady: false,
      nativeBundleFiles: [],
      manifestHash: "baseline-manifest",
      inputSchemaHash: "baseline-input",
      outputSchemaHash: "baseline-output",
      fixtureHash: "baseline-fixture",
      testsHash: "baseline-tests",
      contractHash: "baseline-contract",
      schemaSummary: {
        input: { present: true, requiredFields: ["topic"], propertyTypes: { topic: "string" }, propertyCount: 1 },
        output: { present: true, requiredFields: ["files"], propertyTypes: { files: "array" }, propertyCount: 1 },
        uiPresent: true,
      },
      fileInventory: ["SKILL.md"],
    });

    let completionHook: ((result: any) => Promise<void>) | null = null;
    launchSkillStudioTaskMock.mockImplementation(async (_ctx, _input, hooks) => {
      completionHook = hooks?.onCompleted ?? null;
      return {
        taskId: "studio-task-3",
        mode: "improve",
        summary: "queued",
      };
    });

    const result = await applySkillUpgradeRecommendation({
      db,
      recommendationId: 104,
      requestedBy: 11,
      userRole: "admin",
      userToken: "user-token",
      publicUrl: "https://tenant.example.com",
    });

    expect(result.applyStrategy).toBe("proposal");
    expect(result.mode).toBe("queued");

    await completionHook?.({
      success: true,
      message: "✅ ISC improve complete — skill: `no-diff-skill`\n- No patches generated (all tests passing or heuristic mode)",
      metadata: {
        savedProposals: [],
      },
    });

    expect(compareSkillContractSnapshotsMock).not.toHaveBeenCalled();
  });

  it("keeps workspace-root pollution failures retryable with a specific failure code", async () => {
    const recommendation = {
      id: 105,
      skillId: 11,
      scheduleId: null,
      recommendationType: "migrate-to-genjs",
      title: "Upgrade ISC",
      summary: "Upgrade ISC safely.",
      rationale: "Fix runtime layout",
      currentRuntime: "python",
      proposedRuntime: "native-bundle",
      proposedAction: "migrate-to-genjs",
      recommendationJson: {},
      contractDeltaJson: {},
      status: "pending_review",
      isAutoApplySafe: false,
    };
    const skill = {
      id: 11,
      tenantId: "tenant-1",
      slug: "intelligence-skill-creator",
      name: "ISC",
      description: "Skill creator",
      folderPath: "skills/intelligence-skill-creator",
      executionMode: "python",
      configJson: {},
      sandboxProfileSlug: null,
      requiresNetwork: true,
      requiresBrowser: false,
      visibility: "private",
    };
    const run = { id: 505, skillId: 11, recommendationId: 105, status: "running" };
    const db = createMockDb({
      selectResults: [
        [recommendation],
        [skill],
        [],
      ],
      insertReturningResults: [
        [run],
      ],
      updateReturningResults: [
        [{ ...recommendation, status: "approved" }],
        [{ ...run, status: "running" }],
        [{ ...recommendation, status: "failed" }],
        [{ ...run, status: "failed" }],
      ],
    });

    buildSkillContractSnapshotMock.mockReturnValue({
      executionMode: "python",
      runtimeProfile: "python",
      manifestPath: "skills/intelligence-skill-creator/SKILL.md",
      lockPath: null,
      nativeBundleReady: false,
      nativeBundleFiles: [],
      manifestHash: "baseline-manifest",
      inputSchemaHash: "baseline-input",
      outputSchemaHash: "baseline-output",
      fixtureHash: "baseline-fixture",
      testsHash: "baseline-tests",
      contractHash: "baseline-contract",
      schemaSummary: {
        input: { present: true, requiredFields: [], propertyTypes: {}, propertyCount: 0 },
        output: { present: true, requiredFields: [], propertyTypes: {}, propertyCount: 0 },
        uiPresent: true,
      },
      fileInventory: ["SKILL.md"],
    });

    let completionHook: ((result: any) => Promise<void>) | null = null;
    launchSkillStudioTaskMock.mockImplementation(async (_ctx, _input, hooks) => {
      completionHook = hooks?.onCompleted ?? null;
      return {
        taskId: "studio-task-workspace",
        mode: "improve",
        summary: "queued",
      };
    });

    await applySkillUpgradeRecommendation({
      db,
      recommendationId: 105,
      requestedBy: 11,
      userRole: "admin",
    });

    await completionHook?.({
      success: false,
      message: "Improvement failed: /repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123/skills/intelligence-skill-creator",
      metadata: {
        workspaceRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123",
      },
    });

    expect(db.updateSetCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "failed",
        logsJson: expect.objectContaining({
          failureCode: "isc_workspace_root_pollution",
          workspaceRootPolluted: true,
          taskId: "studio-task-workspace",
        }),
      }),
    ]));
  });
});
