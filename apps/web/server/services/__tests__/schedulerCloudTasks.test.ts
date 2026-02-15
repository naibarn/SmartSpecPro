/**
 * Tests for scheduled message delivery via Cloud Tasks.
 * Replaces BullMQ chat-alerts queue with Cloud Tasks delayed dispatch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock enqueueTask before importing modules that use it
vi.mock("../../services/cloudTasks", () => ({
  enqueueTask: vi.fn().mockResolvedValue("projects/p/locations/l/queues/q/tasks/t-123"),
  deleteTask: vi.fn().mockResolvedValue(undefined),
}));

// Mock the database
const createMockDb = () => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
});

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(createMockDb()),
}));

describe("Scheduled Messages via Cloud Tasks", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    // Re-set mock implementations after resetAllMocks clears them
    const { getDb } = await import("../../db");
    vi.mocked(getDb).mockResolvedValue(createMockDb() as any);
    const { enqueueTask, deleteTask } = await import("../../services/cloudTasks");
    vi.mocked(enqueueTask).mockResolvedValue("projects/p/locations/l/queues/q/tasks/t-123");
    vi.mocked(deleteTask).mockResolvedValue(undefined);

    process.env.USE_CLOUD_TASKS = "true";
    process.env.GCP_PROJECT_ID = "test-project";
    process.env.GCP_REGION = "asia-southeast1";
    process.env.CLOUD_RUN_NODE_URL = "https://node-service.run.app";
  });

  afterEach(() => {
    delete process.env.USE_CLOUD_TASKS;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_REGION;
    delete process.env.CLOUD_RUN_NODE_URL;
  });

  it("should enqueue Cloud Tasks task with correct delay for one-time scheduled message", async () => {
    const { createScheduledJob } = await import("../../services/scheduler");
    const { enqueueTask } = await import("../../services/cloudTasks");

    const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    const taskName = await createScheduledJob(42, null, futureDate);

    expect(enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: "periodic-tasks",
        handlerPath: "/tasks/deliver-scheduled-message",
        payload: { scheduleId: 42 },
        delaySeconds: expect.any(Number),
      })
    );

    // Verify delay is approximately 1800 seconds
    const call = vi.mocked(enqueueTask).mock.calls[0][0];
    expect(call.delaySeconds).toBeGreaterThan(1700);
    expect(call.delaySeconds).toBeLessThanOrEqual(1800);

    expect(taskName).toBe("projects/p/locations/l/queues/q/tasks/t-123");
  });

  it("should deliver message and mark as complete via deliverScheduledMessage", async () => {
    const { deliverScheduledMessage } = await import("../../services/scheduler");
    const { getDb } = await import("../../db");

    const mockDb = await getDb();
    // Mock: return an active schedule
    vi.mocked(mockDb!.limit).mockResolvedValueOnce([
      {
        id: 1,
        userId: 100,
        targetUserId: null,
        prompt: "Test prompt",
        isSimpleReminder: true,
        isRecurring: false,
        status: "active",
        description: "Test reminder",
        priority: "normal",
        emailNotify: false,
        modelId: null,
        cronExpression: null,
        conversationId: null,
      },
    ]);

    // Mock notification import
    vi.doMock("../../services/notificationService", () => ({
      createNotification: vi.fn().mockResolvedValue(undefined),
    }));

    await deliverScheduledMessage(1);

    // Verify DB update was called (mark as completed for non-recurring)
    expect(mockDb!.update).toHaveBeenCalled();
  });

  it("should skip delivery for already-delivered (non-active) scheduled message", async () => {
    const { deliverScheduledMessage } = await import("../../services/scheduler");
    const { getDb } = await import("../../db");

    const mockDb = await getDb();
    // Mock: return a completed schedule
    vi.mocked(mockDb!.limit).mockResolvedValueOnce([
      {
        id: 2,
        status: "completed",
      },
    ]);

    // Should not throw, should return gracefully (idempotent)
    await deliverScheduledMessage(2);

    // Should NOT call update (no delivery happened)
    expect(mockDb!.update).not.toHaveBeenCalled();
  });

  it("should handle recurring scheduled messages by not marking as completed", async () => {
    const { deliverScheduledMessage } = await import("../../services/scheduler");
    const { getDb } = await import("../../db");

    const mockDb = await getDb();
    // Mock: return an active recurring schedule
    vi.mocked(mockDb!.limit).mockResolvedValueOnce([
      {
        id: 3,
        userId: 100,
        targetUserId: null,
        prompt: "Recurring prompt",
        isSimpleReminder: true,
        isRecurring: true,
        status: "active",
        description: "Daily check",
        priority: "normal",
        emailNotify: false,
        modelId: null,
      },
    ]);

    vi.doMock("../../services/notificationService", () => ({
      createNotification: vi.fn().mockResolvedValue(undefined),
    }));

    await deliverScheduledMessage(3);

    // Verify that update was called but status was NOT set to 'completed'
    expect(mockDb!.update).toHaveBeenCalled();
    const setCall = vi.mocked(mockDb!.set).mock.calls[0]?.[0] as any;
    expect(setCall?.status).toBeUndefined(); // Recurring: status not changed
  });

  it("should cancel scheduled job by deleting Cloud Tasks task", async () => {
    const { cancelScheduledJob } = await import("../../services/scheduler");
    const { deleteTask } = await import("../../services/cloudTasks");

    await cancelScheduledJob(42, "projects/p/locations/l/queues/q/tasks/schedule-42");

    expect(deleteTask).toHaveBeenCalledWith("projects/p/locations/l/queues/q/tasks/schedule-42");
  });

  it("should fall back to in-process execution when USE_CLOUD_TASKS is false", async () => {
    process.env.USE_CLOUD_TASKS = "false";

    // Re-import to pick up env change
    vi.resetModules();
    const { createScheduledJob } = await import("../../services/scheduler");
    const { enqueueTask } = await import("../../services/cloudTasks");

    const futureDate = new Date(Date.now() + 30 * 60 * 1000);
    const taskName = await createScheduledJob(42, null, futureDate);

    // Should NOT call Cloud Tasks when feature flag is off
    expect(enqueueTask).not.toHaveBeenCalled();
    expect(taskName).toContain("local-");
  });
});
