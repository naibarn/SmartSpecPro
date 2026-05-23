import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const schedulerMocks = vi.hoisted(() => ({
  deliverScheduledMessage: vi.fn(),
  sweepUndeliveredMessages: vi.fn(),
}));

const knowledgeRefreshWorkerMocks = vi.hoisted(() => ({
  runLibraryKnowledgeRefreshWorker: vi.fn(),
}));

const productionReconcilerMocks = vi.hoisted(() => ({
  runProductionExecutionReconciliationJob: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("../services/scheduler", () => ({
  deliverScheduledMessage: schedulerMocks.deliverScheduledMessage,
  sweepUndeliveredMessages: schedulerMocks.sweepUndeliveredMessages,
}));

vi.mock("../services/libraryKnowledgeRefreshWorker", () => ({
  runLibraryKnowledgeRefreshWorker: knowledgeRefreshWorkerMocks.runLibraryKnowledgeRefreshWorker,
}));

vi.mock("../jobs/productionExecutionReconciliationJob", () => ({
  runProductionExecutionReconciliationJob: productionReconcilerMocks.runProductionExecutionReconciliationJob,
}));

vi.mock("../db", () => ({
  getDb: dbMocks.getDb,
}));

import { createTasksRouter } from "./tasks";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/_internal/tasks", createTasksRouter());
  return app;
}

describe("createTasksRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USE_CLOUD_TASKS = "false";
    process.env.CLOUD_TASKS_SECRET = "test-secret";
    dbMocks.getDb.mockResolvedValue(null);
    productionReconcilerMocks.runProductionExecutionReconciliationJob.mockResolvedValue({
      tenantsScanned: 0,
      scannedSpaces: 0,
      pendingAttempts: 0,
      reconciledAttempts: 0,
      skippedAttempts: 0,
      alerts: [],
      tenantErrors: [],
    });
  });

  it("runs the library knowledge refresh worker for authenticated task requests", async () => {
    knowledgeRefreshWorkerMocks.runLibraryKnowledgeRefreshWorker.mockResolvedValue({
      processed: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
      jobIds: [11],
    });

    const response = await request(makeApp())
      .post("/_internal/tasks/library-knowledge-refresh")
      .set("x-cloud-tasks-secret", "test-secret")
      .send({
        limit: 5,
        jobId: 11,
        libraryItemId: 42,
        tenantId: "tenant-1",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      processed: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
      jobIds: [11],
    });
    expect(knowledgeRefreshWorkerMocks.runLibraryKnowledgeRefreshWorker).toHaveBeenCalledWith({
      limit: 5,
      jobIds: [11],
      libraryItemId: 42,
      tenantId: "tenant-1",
    });
  });

  it("rejects invalid numeric inputs before executing the worker", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(makeApp())
      .post("/_internal/tasks/library-knowledge-refresh")
      .set("x-cloud-tasks-secret", "test-secret")
      .send({
        jobId: "bad-id",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "limit, jobId, and libraryItemId must be positive integers when provided",
    });
    expect(knowledgeRefreshWorkerMocks.runLibraryKnowledgeRefreshWorker).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("runs the production execution reconciler for authenticated scheduled task requests", async () => {
    productionReconcilerMocks.runProductionExecutionReconciliationJob.mockResolvedValue({
      tenantsScanned: 2,
      scannedSpaces: 3,
      pendingAttempts: 2,
      reconciledAttempts: 2,
      skippedAttempts: 0,
      alerts: [],
      tenantErrors: [],
    });

    const response = await request(makeApp())
      .post("/_internal/tasks/production-execution-reconcile")
      .set("x-cloud-tasks-secret", "test-secret")
      .send({
        tenantLimit: 10,
        spaceLimit: 7,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      tenantsScanned: 2,
      scannedSpaces: 3,
      pendingAttempts: 2,
      reconciledAttempts: 2,
      skippedAttempts: 0,
      alerts: [],
      tenantErrors: [],
    });
    expect(productionReconcilerMocks.runProductionExecutionReconciliationJob).toHaveBeenCalledWith({
      tenantLimit: 10,
      spaceLimit: 7,
    });
  });

  it("rejects invalid production reconciler limits before running the job", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(makeApp())
      .post("/_internal/tasks/production-execution-reconcile")
      .set("x-cloud-tasks-secret", "test-secret")
      .send({
        tenantLimit: "bad-limit",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "tenantLimit and spaceLimit must be positive integers when provided",
    });
    expect(productionReconcilerMocks.runProductionExecutionReconciliationJob).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
