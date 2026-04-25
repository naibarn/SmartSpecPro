import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const {
  mockDeductCredits,
  mockGetDb,
  mockHasEnoughCredits,
  mockSpawn,
  mockSyncSingleSkillIfChanged,
  spawnedPayloads,
  pythonOutputQueue,
} = vi.hoisted(() => ({
  mockDeductCredits: vi.fn(),
  mockGetDb: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockSpawn: vi.fn(),
  mockSyncSingleSkillIfChanged: vi.fn(),
  spawnedPayloads: [] as any[],
  pythonOutputQueue: [] as Array<(payload: any) => string>,
}));

vi.mock("child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("../../db", () => ({
  db: {},
  getDb: mockGetDb,
}));

vi.mock("../../services/creditService", () => ({
  calculateCreditsForLLM: vi.fn(() => 1),
  deductCredits: mockDeductCredits,
  hasEnoughCredits: mockHasEnoughCredits,
}));

vi.mock("../../services/skillRegistry", () => ({
  autoSyncSkillsFromFolder: vi.fn(),
  getAvailableSkills: vi.fn(() => []),
  getAvailableSkillsAsync: vi.fn(async () => []),
  getSkillById: vi.fn(),
  getSkillByIdOrType: vi.fn(),
  refreshSkillCache: vi.fn(),
  syncSingleSkillIfChanged: mockSyncSingleSkillIfChanged,
}));

vi.mock("../../services/userSkillService", () => ({
  batchSetVisibility: vi.fn(),
  getAllSkillsForUser: vi.fn(),
  getUserVisibleSkills: vi.fn(async () => ({ skills: [], total: 0 })),
  setAutoTrigger: vi.fn(),
  setSkillVisibility: vi.fn(),
}));

import { skillsRouter } from "../skills";

function createProtectedContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "user-7",
      email: "user7@example.com",
      name: "User Seven",
      loginMethod: "email",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    userToken: "user-token",
    tenantId: "tenant-7",
    publicUrl: "https://app.example.com",
  };
}

function buildExecuteCustomSkillDb(skillRow: any) {
  const skillQuery = {
    from: vi.fn(() => skillQuery),
    where: vi.fn(() => skillQuery),
    limit: vi.fn().mockResolvedValue([skillRow]),
  };

  return {
    select: vi.fn(() => skillQuery),
  };
}

function createPythonSkillTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartspec-python-skill-"));
  fs.mkdirSync(path.join(dir, "python"), { recursive: true });
  fs.writeFileSync(path.join(dir, "python", "skill.py"), "# mocked by test\n", "utf-8");
  return dir;
}

function installSpawnMock() {
  mockSpawn.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();

    let stdin = "";
    child.stdin = {
      write: vi.fn((chunk: unknown) => {
        stdin += String(chunk);
      }),
      end: vi.fn(() => {
        const payload = JSON.parse(stdin);
        spawnedPayloads.push(payload);
        const outputFactory = pythonOutputQueue.shift() ?? (() => "plain python output");
        const output = outputFactory(payload);
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from(JSON.stringify({ success: true, output })));
          child.emit("close", 0);
        });
      }),
    };

    return child;
  });
}

describe("skills.executeCustomSkill Python prompt-bundle routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnedPayloads.length = 0;
    pythonOutputQueue.length = 0;
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined);
    mockSyncSingleSkillIfChanged.mockResolvedValue({ synced: false });
    installSpawnMock();
  });

  it("runs Media Studio prompt-bundle skills with internal json_bundle review and returns prompt text", async () => {
    mockGetDb.mockResolvedValue(buildExecuteCustomSkillDb({
      id: 1,
      slug: "gpt-image-prompt-engineer",
      name: "GPT Image Prompt Engineer",
      skillContent: null,
      systemPrompt: null,
      folderPath: "apps/web/skills/image-prompt-engineer-agents",
      category: "image_prompt_generation",
      defaultModel: null,
      executionMode: "python",
      executionPolicyJson: null,
    }));
    pythonOutputQueue.push(() => JSON.stringify({
      prompts: {
        detailed: "Detailed prompt from reviewed bundle",
      },
      final_review: {
        status: "needs_input",
        approved: false,
        requires_revision: true,
        missing_inputs: ["reference_sources"],
        clarifying_questions: ["Which package angle should be locked?"],
        checks: [
          { name: "quality_gate", passed: true },
          { name: "factual_reference_grounding", passed: false },
        ],
      },
      reference_research: {
        status: "visual_reference_only",
      },
      orchestration: {
        selected_subagents: ["reference_fidelity", "reference_researcher"],
      },
      prompt_quality: {
        score: 97,
      },
    }));

    const caller = skillsRouter.createCaller(createProtectedContext());
    const result = await caller.executeCustomSkill({
      skillId: "gpt-image-prompt-engineer",
      userInputs: {
        topic: "Lay seaweed chips product mockup",
        response_mode: "text_prompt",
        text_prompt_field: "detailed",
      },
      referenceImages: ["https://cdn.example.com/lay.png"],
      originSurface: "media_studio",
    });

    expect(result.content).toBe("Detailed prompt from reviewed bundle");
    expect(result.promptReview).toMatchObject({
      status: "needs_input",
      approved: false,
      missingInputs: ["reference_sources"],
      referenceResearchStatus: "visual_reference_only",
      selectedSubagents: ["reference_fidelity", "reference_researcher"],
      qualityScore: 97,
      failedChecks: ["factual_reference_grounding"],
    });
    expect(result.runtime).toMatchObject({
      mode: "python",
      source: "native_skill",
      structuredReview: true,
    });
    expect(spawnedPayloads[0].params).toMatchObject({
      response_mode: "json_bundle",
      text_prompt_field: "detailed",
      source_image_path: ["https://cdn.example.com/lay.png"],
    });
  });

  it("does not rewrite unrelated Python skills or inject source_image_path", async () => {
    const plainSkillDir = createPythonSkillTempDir();
    mockGetDb.mockResolvedValue(buildExecuteCustomSkillDb({
      id: 2,
      slug: "plain-python-tool",
      name: "Plain Python Tool",
      skillContent: null,
      systemPrompt: null,
      folderPath: plainSkillDir,
      category: "automation",
      defaultModel: null,
      executionMode: "python",
      executionPolicyJson: null,
    }));
    pythonOutputQueue.push(() => "plain python output");

    const caller = skillsRouter.createCaller(createProtectedContext());
    const result = await caller.executeCustomSkill({
      skillId: "plain-python-tool",
      userInputs: {
        topic: "plain task",
        response_mode: "text_prompt",
      },
      referenceImages: ["https://cdn.example.com/ref.png"],
      originSurface: "media_studio",
    });

    expect(result.content).toBe("plain python output");
    expect(result).not.toHaveProperty("promptReview");
    expect(result.runtime).toEqual({
      mode: "python",
      source: "native_skill",
    });
    expect(spawnedPayloads[0].params).toMatchObject({
      topic: "plain task",
      response_mode: "text_prompt",
    });
    expect(spawnedPayloads[0].params).not.toHaveProperty("source_image_path");
  });
});
