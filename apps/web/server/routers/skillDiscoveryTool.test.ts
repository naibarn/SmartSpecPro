import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { SkillDefinition } from "@smartspec/skills";

// ── Mocks (hoisted before imports) ──────────────────────────────────────────

vi.mock("../services/skillRegistry", () => ({
  getAvailableSkillsAsync: vi.fn(),
}));

vi.mock("../middleware/contentAutomationGate", () => ({
  contentAutomationGate: vi.fn((_req: any, _res: any, next: any) => next()),
}));

// ── Static imports (after mocks) ─────────────────────────────────────────────

import { skillDiscoveryHandler } from "./skillDiscoveryTool";
import { getAvailableSkillsAsync } from "../services/skillRegistry";

// ── Helpers ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = "test-gateway-token";

const mockGetAvailableSkills = vi.mocked(getAvailableSkillsAsync);

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "general-article-writer",
    name: "General Article Writer",
    description: "Writes general articles for any topic",
    icon: "pen",
    type: "prompt-enhancement",
    triggers: [],
    requiresExplicit: false,
    creditMultiplier: 1.0,
    enabledByDefault: true,
    priority: 50,
    ...overrides,
  } as SkillDefinition;
}

function buildMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: { "x-internal-token": VALID_TOKEN },
    body: {},
    ...overrides,
  } as unknown as Request;
}

function buildMockResponse(): { res: Response; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnThis();
  const res = {
    json,
    status,
  } as unknown as Response;
  (res.status as any).mockImplementation(() => ({ json }));
  return { res, json, status };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("skillDiscoveryHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = VALID_TOKEN;
    process.env.ENABLE_CONTENT_AUTOMATION = "true";
  });

  it("returns 401 when X-Internal-Token is missing", async () => {
    const req = buildMockRequest({ headers: {} } as any);
    const { res, status, json } = buildMockResponse();
    await skillDiscoveryHandler(req, res);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "UNAUTHORIZED" });
  });

  it("returns 401 when X-Internal-Token is wrong", async () => {
    const req = buildMockRequest({ headers: { "x-internal-token": "wrong" } } as any);
    const { res, status, json } = buildMockResponse();
    await skillDiscoveryHandler(req, res);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "UNAUTHORIZED" });
  });

  it("returns matching skills for category filter", async () => {
    const skills = [
      makeSkill({ id: "img-skill", name: "Image Skill", type: "image-generation" }),
      makeSkill({ id: "txt-skill", name: "Text Skill", type: "prompt-enhancement" }),
    ];
    mockGetAvailableSkills.mockResolvedValue(skills);
    const req = buildMockRequest({ body: { category: "image-generation" } } as any);
    const { res, json } = buildMockResponse();
    await skillDiscoveryHandler(req, res);
    const call = json.mock.calls[0][0];
    expect(call.skills).toHaveLength(1);
    expect(call.skills[0].id).toBe("img-skill");
  });

  it("returns skills ranked by keyword overlap with description", async () => {
    const skills = [
      makeSkill({ id: "article", name: "Article Writer", description: "Writes articles and blog posts" }),
      makeSkill({ id: "image", name: "Image Creator", description: "Creates visual images" }),
    ];
    mockGetAvailableSkills.mockResolvedValue(skills);
    const req = buildMockRequest({ body: { description: "write articles for blog" } } as any);
    const { res, json } = buildMockResponse();
    await skillDiscoveryHandler(req, res);
    const call = json.mock.calls[0][0];
    expect(call.skills[0].id).toBe("article");
  });

  it("returns max 5 results", async () => {
    const skills = Array.from({ length: 10 }, (_, i) =>
      makeSkill({ id: `skill-${i}`, name: `Skill ${i}` })
    );
    mockGetAvailableSkills.mockResolvedValue(skills);
    const req = buildMockRequest({ body: {} } as any);
    const { res, json } = buildMockResponse();
    await skillDiscoveryHandler(req, res);
    const call = json.mock.calls[0][0];
    expect(call.skills.length).toBeLessThanOrEqual(5);
  });

  it("returns confidence scores for each match", async () => {
    mockGetAvailableSkills.mockResolvedValue([makeSkill()]);
    const req = buildMockRequest({ body: { description: "write article" } } as any);
    const { res, json } = buildMockResponse();
    await skillDiscoveryHandler(req, res);
    const call = json.mock.calls[0][0];
    expect(call.skills[0]).toHaveProperty("confidence");
    expect(typeof call.skills[0].confidence).toBe("number");
    expect(call.skills[0].confidence).toBeGreaterThanOrEqual(0);
    expect(call.skills[0].confidence).toBeLessThanOrEqual(1);
  });

  it("handles empty query gracefully (no description, no category)", async () => {
    mockGetAvailableSkills.mockResolvedValue([makeSkill()]);
    const req = buildMockRequest({ body: {} } as any);
    const { res, json } = buildMockResponse();
    await skillDiscoveryHandler(req, res);
    const call = json.mock.calls[0][0];
    expect(Array.isArray(call.skills)).toBe(true);
    // Empty description → all skills get 0.5 confidence base
    expect(call.skills[0].confidence).toBe(0.5);
  });

  it("handles no matching skills gracefully (empty array, not 404)", async () => {
    mockGetAvailableSkills.mockResolvedValue([]);
    const req = buildMockRequest({ body: { category: "nonexistent-category" } } as any);
    const { res, json } = buildMockResponse();
    await skillDiscoveryHandler(req, res);
    const call = json.mock.calls[0][0];
    expect(call.skills).toEqual([]);
    expect(call.total).toBe(0);
  });

  it("API shape matches expected Spec 034 contract", async () => {
    mockGetAvailableSkills.mockResolvedValue([
      makeSkill({ id: "writer", name: "Writer", description: "Article writer", type: "prompt-enhancement" }),
    ]);
    const req = buildMockRequest({ body: { category: "prompt-enhancement", description: "writer" } } as any);
    const { res, json } = buildMockResponse();
    await skillDiscoveryHandler(req, res);
    const call = json.mock.calls[0][0];
    const skill = call.skills[0];
    expect(skill).toHaveProperty("id");
    expect(skill).toHaveProperty("name");
    expect(skill).toHaveProperty("type");
    expect(skill).toHaveProperty("description");
    expect(skill).toHaveProperty("tags");
    expect(skill).toHaveProperty("confidence");
    expect(Array.isArray(skill.tags)).toBe(true);
    expect(call).toHaveProperty("total");
    expect(call).toHaveProperty("query_echo");
    expect(call.query_echo).toHaveProperty("category");
    expect(call.query_echo).toHaveProperty("description");
  });
});
