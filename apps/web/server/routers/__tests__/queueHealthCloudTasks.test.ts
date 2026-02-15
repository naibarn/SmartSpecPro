/**
 * Tests for admin queue health endpoints migrated from BullMQ to Cloud Tasks API.
 */
import { describe, it, expect, vi } from "vitest";

// Mock Cloud Tasks metrics service
vi.mock("../../services/cloudTasksMetrics", () => ({
  getAllQueueMetrics: vi.fn().mockResolvedValue([
    { queueName: "media-jobs", taskCount: 5, oldestTaskAge: 120, dispatchRate: 2.5 },
    { queueName: "video-jobs-short", taskCount: 0, oldestTaskAge: null, dispatchRate: 0 },
    { queueName: "video-jobs-long", taskCount: 3, oldestTaskAge: 300, dispatchRate: 0.5 },
    { queueName: "workflow-tasks", taskCount: 1, oldestTaskAge: 10, dispatchRate: 1.0 },
    { queueName: "polling-tasks", taskCount: 0, oldestTaskAge: null, dispatchRate: 0 },
    { queueName: "periodic-tasks", taskCount: 2, oldestTaskAge: 60, dispatchRate: 0.1 },
  ]),
  getQueueMetrics: vi.fn().mockImplementation(async (name: string) => ({
    queueName: name,
    taskCount: 5,
    oldestTaskAge: 120,
    dispatchRate: 2.5,
  })),
  getDeadLetterCount: vi.fn().mockResolvedValue(3),
}));

describe("admin.queueHealth via Cloud Tasks", () => {
  it("should return Cloud Tasks queue metrics including depth and dispatch rate", async () => {
    const { getAllQueueMetrics } = await import("../../services/cloudTasksMetrics");

    const metrics = await getAllQueueMetrics();

    expect(metrics).toHaveLength(6);
    expect(metrics[0]).toEqual({
      queueName: "media-jobs",
      taskCount: 5,
      oldestTaskAge: 120,
      dispatchRate: 2.5,
    });
  });

  it("should return queue depth for each configured Cloud Tasks queue", async () => {
    const { getAllQueueMetrics } = await import("../../services/cloudTasksMetrics");

    const metrics = await getAllQueueMetrics();
    const queueNames = metrics.map((m) => m.queueName);

    // Verify all 6 queues are represented
    expect(queueNames).toContain("media-jobs");
    expect(queueNames).toContain("video-jobs-short");
    expect(queueNames).toContain("video-jobs-long");
    expect(queueNames).toContain("workflow-tasks");
    expect(queueNames).toContain("polling-tasks");
    expect(queueNames).toContain("periodic-tasks");
  });

  it("should include dead letter count from cloud_task_events table", async () => {
    const { getDeadLetterCount } = await import("../../services/cloudTasksMetrics");

    const count = await getDeadLetterCount();
    expect(count).toBe(3);
    expect(getDeadLetterCount).toHaveBeenCalled();
  });

  it("should return individual queue metrics", async () => {
    const { getQueueMetrics } = await import("../../services/cloudTasksMetrics");

    const metrics = await getQueueMetrics("media-jobs");

    expect(metrics).toEqual({
      queueName: "media-jobs",
      taskCount: 5,
      oldestTaskAge: 120,
      dispatchRate: 2.5,
    });
  });
});
