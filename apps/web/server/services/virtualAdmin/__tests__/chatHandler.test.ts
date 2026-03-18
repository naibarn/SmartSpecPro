import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  return { getDb: vi.fn().mockResolvedValue(mockDb) };
});

vi.mock("../sensorRegistry", () => ({
  getSensors: vi.fn().mockReturnValue([]),
  collectSafe: vi.fn().mockResolvedValue({
    sensorId: "test",
    timestamp: new Date(),
    status: "healthy",
    metrics: {},
    message: "OK",
  }),
}));

vi.mock("../actuatorRegistry", () => ({
  executeAction: vi.fn().mockResolvedValue({ success: true, message: "Done" }),
  decideApproval: vi.fn().mockResolvedValue({ success: true, message: "Approved" }),
}));

import { handleGuardianMessage } from "../chatHandler";
import { getDb } from "../../../db";

describe("GuardianChatHandler", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const db = await getDb() as any;
    // Default: no existing conversation
    db.limit.mockResolvedValue([]);
    db.returning.mockResolvedValue([{ id: 1 }]);
  });

  it("responds to 'status' with sensor summary", async () => {
    const { getSensors } = await import("../sensorRegistry");
    (getSensors as any).mockReturnValue([]);

    const result = await handleGuardianMessage(1, "status", "t1");
    expect(result.response).toContain("No sensors registered");
    expect(result.conversationId).toBe(1);
  });

  it("responds to 'incidents' with message", async () => {
    const result = await handleGuardianMessage(1, "incidents", "t1");
    expect(result.response).toContain("No open incidents");
  });

  it("responds to 'retry 42' by executing retry actuator", async () => {
    const { executeAction } = await import("../actuatorRegistry");

    const result = await handleGuardianMessage(1, "retry 42", "t1");
    expect(executeAction).toHaveBeenCalledWith(
      "retry_failed_job",
      { taskId: "42" },
      expect.any(Object),
      "t1",
    );
    expect(result.response).toContain("retried successfully");
  });

  it("responds to 'approve 7' by processing approval", async () => {
    const { decideApproval } = await import("../actuatorRegistry");

    const result = await handleGuardianMessage(1, "approve 7", "t1");
    expect(decideApproval).toHaveBeenCalledWith(7, "approved", 1, "Approved via chat");
    expect(result.response).toContain("approved");
  });

  it("responds to unknown command with help menu", async () => {
    const result = await handleGuardianMessage(1, "hello world", "t1");
    expect(result.response).toContain("System Guardian Commands");
    expect(result.response).toContain("status");
    expect(result.response).toContain("incidents");
  });

  it("creates conversation on first use", async () => {
    const db = await getDb() as any;
    await handleGuardianMessage(1, "help", "t1");
    expect(db.insert).toHaveBeenCalled();
  });

  it("reuses existing guardian conversation", async () => {
    const db = await getDb() as any;
    db.limit.mockResolvedValueOnce([{ id: 99, userId: 1, systemPrompt: "[system_guardian]" }]);

    const result = await handleGuardianMessage(1, "help", "t1");
    expect(result.conversationId).toBe(99);
  });

  it("stores all messages in conversations table", async () => {
    const db = await getDb() as any;
    await handleGuardianMessage(1, "help", "t1");

    // Should have been called at least twice: once for user message, once for assistant response
    // Plus the conversation insert
    expect(db.insert.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
