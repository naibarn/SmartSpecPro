import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPublicSkillsRouter } from "../publicSkillsApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/skillRegistry", () => ({
  getAvailableSkillsAsync: vi.fn(),
  getSkillByIdAsync: vi.fn(),
}));

vi.mock("../../services/skillExecutor", () => ({
  executeSkill: vi.fn(),
}));

vi.mock("../../services/skillDetector", () => ({
  detectSkill: vi.fn(),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  getCreditBalance: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

import { getAvailableSkillsAsync, getSkillByIdAsync } from "../../services/skillRegistry";
import { executeSkill } from "../../services/skillExecutor";
import { detectSkill } from "../../services/skillDetector";
import { hasEnoughCredits, getCreditBalance } from "../../services/creditService";
import { readFile } from "fs/promises";

const mockGetAvailableSkillsAsync = vi.mocked(getAvailableSkillsAsync);
const mockGetSkillByIdAsync = vi.mocked(getSkillByIdAsync);
const mockExecuteSkill = vi.mocked(executeSkill);
const mockDetectSkill = vi.mocked(detectSkill);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockGetCreditBalance = vi.mocked(getCreditBalance);
const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(scopes: string[] = ["skills:list", "skills:execute"]) {
  const app = express();
  app.use(express.json());
  // Inject mock auth
  app.use((req: any, _res: any, next: any) => {
    req.auth = {
      ok: true,
      mode: "api_key",
      sub: "1",
      userId: 1,
      tenantId: "tenant-1",
      apiKeyId: "key-1",
      scopes,
    };
    next();
  });
  app.use("/v1/skills", createPublicSkillsRouter());
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const skillA = {
  id: "image_prompt_engineer",
  name: "Image Prompt Engineer",
  category: "prompt_enhancement",
  description: "Enhances image prompts",
  tags: ["image", "prompt"],
  icon: "image",
  creditMultiplier: 1.0,
  executionMode: "llm-only",
  defaultModel: "gpt-4o-mini",
  skillFilePath: "/skills/image_prompt_engineer/skill.md",
  priority: 50,
  enabled: true,
  type: "prompt_enhancement" as any,
  slug: "image_prompt_engineer",
};

const skillB = {
  id: "video_creator",
  name: "Video Creator",
  category: "video_generation",
  description: "Creates videos",
  tags: ["video"],
  icon: "video",
  creditMultiplier: 5.0,
  executionMode: "media-generate",
  defaultModel: "wan21-t2v",
  skillFilePath: "/skills/video_creator/skill.md",
  priority: 40,
  enabled: true,
  type: "video_generation" as any,
  slug: "video_creator",
};

// ---------------------------------------------------------------------------
// GET /v1/skills
// ---------------------------------------------------------------------------

describe("GET /v1/skills", () => {
  beforeEach(() => {
    mockGetAvailableSkillsAsync.mockResolvedValue([skillA, skillB] as any);
    mockReadFile.mockRejectedValue(new Error("not found"));
  });

  it("returns skills list with pagination", async () => {
    const res = await request(makeApp()).get("/v1/skills");
    expect(res.status).toBe(200);
    expect(res.body.skills).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 2 });
  });

  it("requires skills:list scope", async () => {
    const res = await request(makeApp(["skills:execute"])).get("/v1/skills");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("filters by category query param", async () => {
    const res = await request(makeApp()).get("/v1/skills?category=prompt_enhancement");
    expect(res.status).toBe(200);
    expect(res.body.skills).toHaveLength(1);
    expect(res.body.skills[0].id).toBe("image_prompt_engineer");
  });

  it("filters by search query param", async () => {
    const res = await request(makeApp()).get("/v1/skills?search=video");
    expect(res.status).toBe(200);
    expect(res.body.skills).toHaveLength(1);
    expect(res.body.skills[0].id).toBe("video_creator");
  });

  it("respects tenant isolation via registry call", async () => {
    await request(makeApp()).get("/v1/skills");
    expect(mockGetAvailableSkillsAsync).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/skills/:skillId
// ---------------------------------------------------------------------------

describe("GET /v1/skills/:skillId", () => {
  beforeEach(() => {
    mockGetSkillByIdAsync.mockResolvedValue(skillA as any);
    mockReadFile.mockRejectedValue(new Error("not found"));
  });

  it("returns skill detail with inputSchema", async () => {
    const res = await request(makeApp()).get("/v1/skills/image_prompt_engineer");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("image_prompt_engineer");
    expect(res.body).toHaveProperty("inputSchema");
  });

  it("returns 404 for non-existent skill ID", async () => {
    mockGetSkillByIdAsync.mockResolvedValue(undefined);
    const res = await request(makeApp()).get("/v1/skills/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("requires skills:list scope", async () => {
    const res = await request(makeApp(["skills:execute"])).get("/v1/skills/image_prompt_engineer");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });
});

// ---------------------------------------------------------------------------
// POST /v1/skills/:skillId/execute
// ---------------------------------------------------------------------------

describe("POST /v1/skills/:skillId/execute", () => {
  beforeEach(() => {
    mockGetSkillByIdAsync.mockResolvedValue(skillA as any);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecuteSkill.mockResolvedValue({
      success: true,
      skillId: "image_prompt_engineer",
      type: "text",
      message: "Enhanced prompt: beautiful sunset",
      creditsUsed: 2,
    } as any);
    mockGetCreditBalance.mockResolvedValue({ credits: 998 } as any);
    mockReadFile.mockRejectedValue(new Error("not found"));
  });

  it("requires skills:execute scope", async () => {
    const res = await request(makeApp(["skills:list"]))
      .post("/v1/skills/image_prompt_engineer/execute")
      .send({ inputs: { prompt: "sunset" } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("returns 404 for non-existent skill ID", async () => {
    mockGetSkillByIdAsync.mockResolvedValue(undefined);
    const res = await request(makeApp())
      .post("/v1/skills/nonexistent/execute")
      .send({ inputs: { prompt: "sunset" } });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("returns error for insufficient credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);
    const res = await request(makeApp())
      .post("/v1/skills/image_prompt_engineer/execute")
      .send({ inputs: { prompt: "sunset" } });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("insufficient_credits");
  });

  it("routes billing through executeSkill with a stable run id", async () => {
    await request(makeApp())
      .post("/v1/skills/image_prompt_engineer/execute")
      .send({ inputs: { prompt: "sunset" } });
    expect(mockExecuteSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "image_prompt_engineer" }),
      expect.objectContaining({ runId: expect.any(String) }),
      1,
      expect.any(String),
      "tenant-1",
    );
  });

  it("returns X-Credits-Used header", async () => {
    const res = await request(makeApp())
      .post("/v1/skills/image_prompt_engineer/execute")
      .send({ inputs: { prompt: "sunset" } });
    expect(res.headers["x-credits-used"]).toBeDefined();
  });

  it("returns X-Credits-Remaining header", async () => {
    const res = await request(makeApp())
      .post("/v1/skills/image_prompt_engineer/execute")
      .send({ inputs: { prompt: "sunset" } });
    expect(res.headers["x-credits-remaining"]).toBeDefined();
  });

  it("returns 200 with result on successful execution", async () => {
    const res = await request(makeApp())
      .post("/v1/skills/image_prompt_engineer/execute")
      .send({ inputs: { prompt: "sunset" } });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("result");
    expect(res.body).toHaveProperty("credits_used");
  });

  it("with stream=true returns SSE content-type", async () => {
    const res = await request(makeApp())
      .post("/v1/skills/image_prompt_engineer/execute")
      .send({ inputs: { prompt: "sunset" }, stream: true });
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/skills/detect
// ---------------------------------------------------------------------------

describe("POST /v1/skills/detect", () => {
  beforeEach(() => {
    mockDetectSkill.mockResolvedValue({
      detected: true,
      skill: skillA as any,
      confidence: 0.9,
      matchedTrigger: "create an image",
      suggestedPrompt: "beautiful sunset",
      patternChainTo: undefined,
    });
  });

  it("returns matched skill with confidence", async () => {
    const res = await request(makeApp())
      .post("/v1/skills/detect")
      .send({ prompt: "create an image of a sunset" });
    expect(res.status).toBe(200);
    expect(res.body.skill).not.toBeNull();
    expect(res.body.skill.confidence).toBe(0.9);
    expect(res.body.suggested_inputs).not.toBeNull();
  });

  it("requires skills:execute scope", async () => {
    const res = await request(makeApp(["skills:list"]))
      .post("/v1/skills/detect")
      .send({ prompt: "create an image" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("returns null skill when no match", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: false,
      skill: null,
      confidence: 0,
      matchedTrigger: undefined,
      suggestedPrompt: undefined,
      patternChainTo: undefined,
    });
    const res = await request(makeApp())
      .post("/v1/skills/detect")
      .send({ prompt: "just a regular message" });
    expect(res.status).toBe(200);
    expect(res.body.skill).toBeNull();
    expect(res.body.suggested_inputs).toBeNull();
  });
});
