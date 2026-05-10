import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  launchSkillStudioTaskMock,
  buildSkillContractSnapshotMock,
  compareSkillContractSnapshotsMock,
  refreshSkillCacheMock,
} = vi.hoisted(() => ({
  launchSkillStudioTaskMock: vi.fn(),
  buildSkillContractSnapshotMock: vi.fn(),
  compareSkillContractSnapshotsMock: vi.fn(),
  refreshSkillCacheMock: vi.fn(),
}));

vi.mock("../skillStudioService", () => ({
  launchSkillStudioTask: launchSkillStudioTaskMock,
}));

vi.mock("../skillCompatibilityGate", () => ({
  buildSkillContractSnapshot: buildSkillContractSnapshotMock,
  compareSkillContractSnapshots: compareSkillContractSnapshotsMock,
}));

vi.mock("../skillRegistry", () => ({
  refreshSkillCache: refreshSkillCacheMock,
}));

vi.mock("../enabledLlmModels", () => ({
  resolveEnabledLlmModelId: vi.fn().mockResolvedValue("test-default-llm"),
}));

vi.mock("../skillFiles", () => ({
  hasRelativeSkillManifest: vi.fn().mockReturnValue(false),
  resolveSkillDirCandidates: vi.fn().mockReturnValue([]),
  resolveSkillManifestPath: vi.fn().mockReturnValue(null),
  updateSkillManifestFiles: vi.fn(),
}));

import { applySkillUpgradeRecommendation } from "../skillUpgradeApplier";

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
        savedProposals: ["runs/proposals/deck-builder/round-2.diff"],
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
