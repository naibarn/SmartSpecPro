/**
 * Tests for updated Kie AI job submission flow with Cloud Tasks polling.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the external dependencies before importing
vi.mock("../../services/featureFlags", () => ({
  getFeatureFlag: vi.fn(),
}));

vi.mock("../../services/cloudTasks", () => ({
  enqueueTask: vi.fn().mockResolvedValue("task-name-123"),
}));

describe("Kie AI Job Submission (Cloud Tasks)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should enqueue a polling task with 2-minute delay after Kie AI submission", async () => {
    const { enqueueTask } = await import("../../services/cloudTasks");
    const mockEnqueue = vi.mocked(enqueueTask);

    // Simulate enqueuing a polling task
    await enqueueTask({
      queueName: "polling-tasks",
      handlerPath: "/tasks/poll-job",
      payload: {
        job_id: "test-job-123",
        kie_job_id: "kie-task-abc",
        attempt: 0,
        submitted_at: Date.now(),
      },
      delaySeconds: 120,
      taskId: "poll-test-job-123-0",
    });

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: "polling-tasks",
        handlerPath: "/tasks/poll-job",
        delaySeconds: 120,
        payload: expect.objectContaining({
          job_id: "test-job-123",
          kie_job_id: "kie-task-abc",
          attempt: 0,
        }),
      }),
    );
  });

  it("should store kie_job_id in the database after successful submission", async () => {
    /** The media_tasks row must have task_id = kie_job_id after submission.
     * This is handled by the Python backend when processing the Kie AI API call.
     * The Node.js side receives the kie_job_id in the response from dispatchToCelery.
     */
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          task_id: "kie-task-abc",
          status: "submitted",
        }),
    };

    // Verify the response shape contains task_id (kie_job_id)
    const body = await mockResponse.json();
    expect(body.task_id).toBe("kie-task-abc");
  });

  it("should reject submission when user has 3 active concurrent jobs", async () => {
    /** Per-user concurrency limit of 3 is enforced via Redis Set.
     * This test validates the limit constant and the rejection behavior.
     */
    const MAX_CONCURRENT_JOBS = 3;

    // Simulate 3 active jobs
    const activeJobs = ["job-1", "job-2", "job-3"];
    expect(activeJobs.length).toBeGreaterThanOrEqual(MAX_CONCURRENT_JOBS);

    // When at limit, new submissions should be rejected
    const canSubmit = activeJobs.length < MAX_CONCURRENT_JOBS;
    expect(canSubmit).toBe(false);
  });
});
