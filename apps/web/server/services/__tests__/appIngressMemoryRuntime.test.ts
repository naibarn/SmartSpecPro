import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import { request as httpRequest, type Server } from "node:http";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getPersonaById: vi.fn(),
  buildPersonaPromptSegments: vi.fn(),
  retrieveForPrompt: vi.fn(),
  getEntityMemoriesForContext: vi.fn(),
  issueProjectReceipt: vi.fn(),
  validateProjectReceipt: vi.fn(),
}));

vi.mock("../../_core/sdk", () => ({
  sdk: { authenticateRequest: mocks.authenticateRequest },
}));
vi.mock("../../_core/logger", () => ({ debugLog: vi.fn() }));
vi.mock("../personaService", () => ({
  getPersonaById: mocks.getPersonaById,
  buildPersonaPromptSegments: mocks.buildPersonaPromptSegments,
}));
vi.mock("../scopedMemoryService", () => ({
  retrieveForPrompt: mocks.retrieveForPrompt,
}));
vi.mock("../memoryService", () => ({
  getEntityMemoriesForContext: mocks.getEntityMemoriesForContext,
}));
vi.mock("../smartAiHubRuntimeContext", () => ({
  issueProjectResolutionReceipt: mocks.issueProjectReceipt,
  validateProjectResolutionReceipt: mocks.validateProjectReceipt,
}));
vi.mock("../promptComposer", () => ({ composePrompt: vi.fn() }));
vi.mock("../teamProjectProviderAuthorization", () => ({
  captureTeamProjectProviderContextBinding: vi.fn(),
  TeamProjectProviderAuthorizationError: class TeamProjectProviderAuthorizationError extends Error {},
}));
vi.mock("../webSearchToolInjector", () => ({
  buildWebSearchParams: vi.fn(),
  detectProviderFamily: vi.fn(),
}));
vi.mock("../llmRouter", () => ({ getProviderForModel: vi.fn() }));
vi.mock("../promptEnhancementService", () => ({
  buildSystemPrompt: vi.fn(),
  buildUserPrompt: vi.fn(),
}));
vi.mock("../mediaGenerationService", () => ({
  resolveExternalMediaReferenceUrls: vi.fn(async (urls: string[]) => urls),
}));

import { createContext } from "../../_core/context";
import {
  CHAT_SCOPED_MEMORY_BUDGET,
  buildChatContext,
} from "../executors/contextBuilder";

const serverApp = express();
serverApp.set("trust proxy", 1);
serverApp.get("/runtime-context", async (req, res) => {
  const context = await createContext({ req, res } as any);
  const messages = await buildChatContext(
    {
      channel: "chat",
      userId: context.user!.id,
      tenantId: context.tenantId!,
      userMessage: "show my memory",
      conversationContext: {
        conversationId: 22,
        activePersonaId: "p1",
        trustedAppContext: context.trustedAppContext,
      },
    },
    "assistant",
    null
  );

  res.status(200).json({
    tenantId: context.tenantId,
    trustedAppContext: context.trustedAppContext,
    messages,
  });
});

let server: Server;
let port: number;

function getRuntimeContext(headers: Record<string, string>): Promise<{
  status: number;
  body: {
    tenantId: string | null;
    trustedAppContext: unknown;
    messages: Array<{ content: unknown }>;
  };
}> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/runtime-context",
        method: "GET",
        headers,
      },
      response => {
        const chunks: Buffer[] = [];
        response.on("data", chunk => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("error", reject);
    request.end();
  });
}

beforeAll(async () => {
  await new Promise<void>(resolve => {
    server = serverApp.listen(0, "127.0.0.1", () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue({
    id: 7,
    currentTenantId: "tenant-42",
  });
  mocks.getPersonaById.mockResolvedValue({ id: "p1" });
  mocks.buildPersonaPromptSegments.mockReturnValue({
    prefix: "Persona prefix",
    styleInstructions: "",
    restrictionsBulletPoints: "",
  });
  mocks.retrieveForPrompt.mockResolvedValue([]);
  mocks.getEntityMemoriesForContext.mockResolvedValue([
    {
      id: 1,
      userId: 7,
      personaId: "p1",
      entityType: "preference",
      entityName: "global preference",
      facts: ["Remember global marker"],
      projectId: null,
    },
  ]);
});

describe("HTTP request to chat memory context boundary", () => {
  it.each([
    ["spoofed Host", { host: "notes.example.com" }],
    [
      "spoofed X-Forwarded-Host",
      { host: "smartaihub.app", "x-forwarded-host": "notes.example.com" },
    ],
    [
      "conflicting forwarded hosts",
      {
        host: "smartaihub.app",
        "x-forwarded-host": "notes.example.com, tasks.example.com",
      },
    ],
  ])(
    "keeps Project memory closed for %s while preserving global entity memory",
    async (_case, headers) => {
      const response = await getRuntimeContext(headers);

      expect(response.status).toBe(200);
      expect(response.body.tenantId).toBe("tenant-42");
      expect(response.body.trustedAppContext).toBeNull();
      expect(mocks.issueProjectReceipt).not.toHaveBeenCalled();
      expect(mocks.validateProjectReceipt).not.toHaveBeenCalled();
      expect(mocks.retrieveForPrompt).toHaveBeenCalledWith(
        "tenant-42",
        "p1",
        null,
        null,
        null,
        "show my memory",
        CHAT_SCOPED_MEMORY_BUDGET,
        undefined,
        { initiatedByUserId: 7, projectId: null }
      );
      expect(mocks.getEntityMemoriesForContext).toHaveBeenCalledWith(
        7,
        undefined,
        null,
        "p1"
      );
      expect(
        response.body.messages.some(
          message =>
            typeof message.content === "string" &&
            message.content.includes("Remember global marker")
        )
      ).toBe(true);
    }
  );
});
