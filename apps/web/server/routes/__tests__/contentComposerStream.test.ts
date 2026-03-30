import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockGetTenantFeatureFlag: vi.fn(),
  mockResolveEnabledLlmModelId: vi.fn(),
  mockGetSkillByIdAsync: vi.fn(),
  mockGetDb: vi.fn(),
  mockAgencyExecuteRun: vi.fn(),
}));

vi.mock("../../_core/sdk", () => ({
  sdk: {
    authenticateRequest: mocks.mockAuthenticateRequest,
  },
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mocks.mockGetTenantFeatureFlag,
}));

vi.mock("../../services/enabledLlmModels", () => ({
  resolveEnabledLlmModelId: mocks.mockResolveEnabledLlmModelId,
}));

vi.mock("../../services/skillRegistry", () => ({
  getSkillByIdAsync: mocks.mockGetSkillByIdAsync,
}));

vi.mock("../../db", () => ({
  getDb: mocks.mockGetDb,
}));

vi.mock("../../services/agencyBridge", () => ({
  agencyBridge: {
    executeRun: mocks.mockAgencyExecuteRun,
  },
}));

import contentComposerStreamRouter from "../contentComposerStream";

function makeStream(body: string) {
  const encoder = new TextEncoder();
  const chunks = body.split("");
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index++]));
    },
  });
}

function createChain(rows: any[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async (count?: number) => (typeof count === "number" ? rows.slice(0, count) : rows)),
    then: vi.fn((resolve: (value: any[]) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    ),
  };
  return chain;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { id: "tenant-1" };
    next();
  });
  app.use(contentComposerStreamRouter);
  return app;
}

describe("contentComposerStreamRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAuthenticateRequest.mockResolvedValue({
      id: 1,
      currentTenantId: "tenant-1",
      role: "admin",
    });
    mocks.mockGetTenantFeatureFlag.mockResolvedValue(true);
    mocks.mockResolveEnabledLlmModelId.mockResolvedValue("gpt-4.1-mini");
    mocks.mockGetSkillByIdAsync.mockResolvedValue({
      id: "skill-1",
      systemPrompt: "You are a content writer.",
    });
    mocks.mockGetDb.mockResolvedValue({
      select: vi.fn(() => createChain([])),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      makeStream(
        [
          "data: " + JSON.stringify({ choices: [{ delta: { content: "<article><h1>Launch plan</h1>" } }] }),
          "",
          "data: " + JSON.stringify({ choices: [{ delta: { content: "<p>Hello</p>" } }] }),
          "",
          "data: " + JSON.stringify({ choices: [{ delta: { content: "[[CAPTION]]" } }] }),
          "",
          "data: " + JSON.stringify({ choices: [{ delta: { content: "Go live today." } }] }),
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
      ),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an SSE stream with article and caption events", async () => {
    const res = await request(makeApp())
      .post("/api/content-composer/generate-stream")
      .send({
        topic: "Launch plan",
        executionSource: "skill",
        skillId: "skill-1",
        requiresWebSearch: true,
        requiresThinking: false,
        articleBody: "<p>Body</p>",
        socialPlatform: "youtube",
        attachmentCount: 2,
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text).toContain("event: article_chunk");
    expect(res.text).toContain("event: article");
    expect(res.text).toContain("event: caption");
    expect(res.text).toContain("Go live today.");
  });

  it("runs an agency and emits the composed article result", async () => {
    mocks.mockAgencyExecuteRun.mockResolvedValue({
      runId: "run-1",
      response: "<article><h1>Launch plan</h1><p>Agency output.</p></article>",
      creditsUsed: 3,
    });
    mocks.mockGetDb.mockResolvedValue({
      select: vi.fn(() => createChain([
        {
          id: "agency-1",
          name: "Launch Agency",
          description: "Agency for launches",
          systemPrompt: "Agency prompt",
          status: "published",
          visibility: "private",
          createdBy: 1,
          tenantId: "tenant-1",
          isPublished: true,
        },
      ])),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
    });

    const res = await request(makeApp())
      .post("/api/content-composer/generate-stream")
      .send({
        topic: "Launch plan",
        executionSource: "agency",
        agencyId: "agency-1",
        agencyName: "Launch Agency",
        requiresWebSearch: true,
        requiresThinking: false,
        articleBody: "<p>Body</p>",
        socialPlatform: "youtube",
        attachmentCount: 2,
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain("event: article");
    expect(res.text).toContain("Agency output.");
  });
});
