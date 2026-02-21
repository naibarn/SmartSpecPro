/**
 * Tests for the Cloud Tasks enqueue module (Node.js).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @google-cloud/tasks module
const mockCreateTask = vi.fn().mockResolvedValue([{ name: "projects/test/locations/us/queues/media-jobs/tasks/123" }]);

vi.mock("@google-cloud/tasks", () => ({
  CloudTasksClient: vi.fn().mockImplementation(() => ({
    queuePath: vi.fn().mockReturnValue("projects/test/locations/us/queues/media-jobs"),
    taskPath: vi.fn().mockReturnValue("projects/test/locations/us/queues/media-jobs/tasks/test-id"),
    createTask: mockCreateTask,
  })),
}));

describe("enqueueTask", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.GCP_PROJECT_ID = "test-project";
    process.env.GCP_REGION = "us-central1";
    process.env.CLOUD_RUN_PYTHON_URL = "https://python-service.run.app";
    process.env.CLOUD_RUN_SA_EMAIL = "cloud-run-api@test-project.iam.gserviceaccount.com";
  });

  it("creates a task with correct HTTP target URL", async () => {
    const { enqueueTask } = await import("../cloudTasks");

    await enqueueTask({
      queueName: "media-jobs",
      handlerPath: "/_internal/tasks/process-media",
      payload: { job_id: "test-123" },
    });

    expect(mockCreateTask).toHaveBeenCalledOnce();
    const [request] = mockCreateTask.mock.calls[0];
    expect(request.task.httpRequest.url).toBe(
      "https://python-service.run.app/_internal/tasks/process-media"
    );
  });

  it("passes payload as JSON body in the task", async () => {
    const { enqueueTask } = await import("../cloudTasks");

    const payload = { job_id: "test-123", user_id: "user-456" };
    await enqueueTask({
      queueName: "media-jobs",
      handlerPath: "/_internal/tasks/process-media",
      payload,
    });

    const [request] = mockCreateTask.mock.calls[0];
    const body = Buffer.from(request.task.httpRequest.body, "base64").toString();
    expect(JSON.parse(body)).toEqual(payload);
  });

  it("applies delay via scheduleTime when delaySeconds is provided", async () => {
    const { enqueueTask } = await import("../cloudTasks");

    await enqueueTask({
      queueName: "media-jobs",
      handlerPath: "/_internal/tasks/process-media",
      payload: { job_id: "test-123" },
      delaySeconds: 120,
    });

    const [request] = mockCreateTask.mock.calls[0];
    expect(request.task.scheduleTime).toBeDefined();
    expect(request.task.scheduleTime.seconds).toBeGreaterThan(0);
  });
});
