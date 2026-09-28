import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTasksRouter } from "./tasks";

describe("retired legacy task router", () => {
  it("rejects the former Google runtime endpoint without executing work", async () => {
    const app = express();
    app.use("/_internal/tasks", createTasksRouter());

    const response = await request(app)
      .post("/_internal/tasks/process-media")
      .send({ job_id: "legacy-task-1" });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: "LEGACY_RUNTIME_RETIRED",
      target: "cloudflare",
    });
  });
});
