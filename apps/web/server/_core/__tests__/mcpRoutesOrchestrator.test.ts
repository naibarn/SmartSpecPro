import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const describeSocketSuite =
  process.env.RUN_SOCKET_TESTS === "true" ? describe : describe.skip;

const mockPromoteMessageToWorkItem = vi.fn();

vi.mock("../../services/orchestratorRoomActionsService", () => ({
  promoteMessageToWorkItem: mockPromoteMessageToWorkItem,
}));

vi.mock("../authz", () => ({
  authorizeRequest: vi.fn(async () => ({
    ok: true,
    mode: "bearer",
    sub: "99",
    tenantId: "tenant-1",
    scopes: ["mcp:read", "mcp:write"],
  })),
}));

vi.mock("../limits", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

describeSocketSuite("mcpRoutes orchestrator tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPromoteMessageToWorkItem.mockResolvedValue({
      workItem: { id: "work-1", title: "Kickoff task" },
      routeResult: { targetStep: "research" },
    });
  });

  it("lists orchestrator tools on the legacy MCP route", async () => {
    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    const res = await request(app)
      .get("/api/mcp/tools")
      .set("Authorization", "Bearer internal-token");

    expect(res.status).toBe(200);
    const toolNames = res.body.tools.map((tool: any) => tool.name);
    expect(toolNames).toContain("smartspec.orchestrator.promote_message_to_work_item");
    expect(toolNames).toContain("smartspec.orchestrator.advance_work_item");
    expect(toolNames).toContain("smartspec.orchestrator.approve_work_item");
    expect(toolNames).toContain("smartspec.orchestrator.request_work_item_changes");
  });

  it("forwards orchestrator tool calls with header-based tenant/user context", async () => {
    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    const res = await request(app)
      .post("/api/mcp/call")
      .set("Authorization", "Bearer internal-token")
      .set("x-tenant-id", "tenant-1")
      .set("x-user-id", "99")
      .send({
        name: "smartspec.orchestrator.promote_message_to_work_item",
        arguments: {
          team_id: "team-1",
          room_id: "room-1",
          message_id: "msg-1",
          actor_assistant_id: "assistant-1",
          target_step: "research",
        },
      });

    expect(res.status).toBe(200);
    expect(mockPromoteMessageToWorkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorUserId: 99,
        teamId: "team-1",
        roomId: "room-1",
        messageId: "msg-1",
        actorAssistantId: "assistant-1",
        targetStep: "research",
      }),
    );
  });
});
