import { beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const { mockCreateJob, mockStartSchedule, mockStopSchedule, mockGetDb, mockSelect, mockFrom, mockWhere } = vi.hoisted(() => ({
  mockCreateJob: vi.fn(), mockStartSchedule: vi.fn(), mockStopSchedule: vi.fn(), mockGetDb: vi.fn(),
  mockSelect: vi.fn(), mockFrom: vi.fn(), mockWhere: vi.fn(),
}));
vi.mock("../services/jobControlPlaneGateway", () => ({ createControlPlaneJob: mockCreateJob }));
vi.mock("./feature186SystemScheduler", () => ({ startFeature186SystemSchedule: mockStartSchedule, stopFeature186SystemSchedule: mockStopSchedule, utcMinuteOccurrence: (date: Date) => date.toISOString() }));
vi.mock("../db", () => ({ getDb: mockGetDb }));
import { collectLocalWorkspaceAudit, enqueueWorkspaceAuthorityAuditEvent, initializeWorkspaceAuthorityAuditJob, shutdownWorkspaceAuthorityAuditJob } from "./workspaceAuthorityAuditJob";

describe("workspace authority audit triggers", () => {
  beforeEach(() => {
    mockCreateJob.mockReset(); mockStartSchedule.mockReset(); mockStopSchedule.mockReset();
    mockWhere.mockReset().mockResolvedValue([]);
    mockFrom.mockReset().mockReturnValue({ where: mockWhere });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockGetDb.mockReset().mockReturnValue({ select: mockSelect });
  });
  it("creates the default periodic AUDIT_ONLY schedule", async () => {
    await initializeWorkspaceAuthorityAuditJob();
    expect(mockStartSchedule).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: "workspace-authority-audit", jobType: "workspace.authority.audit", input: { mode: "AUDIT_ONLY", trigger: "PERIODIC" } }));
    await shutdownWorkspaceAuthorityAuditJob();
    expect(mockStopSchedule).toHaveBeenCalledWith("workspace-authority-audit");
  });
  it("uses stable idempotency for lifecycle events and rejects missing event identity", async () => {
    mockCreateJob.mockResolvedValue({ jobId: "job-1" });
    await enqueueWorkspaceAuthorityAuditEvent({ tenantId: "tenant-a", eventType: "HANDOFF_COMPLETE", eventId: "handoff-1" });
    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ idempotencyKey: "workspace-authority:HANDOFF_COMPLETE:handoff-1" }), definition: expect.objectContaining({ input: { tenantId: "tenant-a", mode: "AUDIT_ONLY", trigger: "HANDOFF_COMPLETE" } }) }));
    await expect(enqueueWorkspaceAuthorityAuditEvent({ tenantId: "tenant-a", eventType: "SESSION_FINISH", eventId: " " })).rejects.toThrow("WORKSPACE_AUDIT_EVENT_INVALID");
  });
  it.each(["CANONICAL_CONVERGENCE_SUCCESS", "RECOVERY_ARCHIVE_COMPLETE"] as const)("accepts the %s lifecycle event with a stable idempotency key", async eventType => {
    mockCreateJob.mockResolvedValue({ jobId: "job-2" });
    await enqueueWorkspaceAuthorityAuditEvent({ tenantId: "tenant-a", eventType, eventId: "receipt-1" });
    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ idempotencyKey: `workspace-authority:${eventType}:receipt-1` }),
      definition: expect.objectContaining({ input: { tenantId: "tenant-a", mode: "AUDIT_ONLY", trigger: eventType } }),
    }));
  });

  it("does not guess a local registry path when the audit host is not configured", async () => {
    await expect(collectLocalWorkspaceAudit({})).resolves.toEqual({ status: "NOT_CONFIGURED", reason: "repository_not_configured" });
  });

  it("runs the configured local collector in AUDIT_ONLY mode and parses its receipt", async () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), "workspace-audit-exec-"));
    const executable = path.join(temp, "python-fixture");
    try {
      writeFileSync(executable, "#!/bin/sh\nprintf '%s\\n' '{\"status\":\"WORKTREE_AUDIT_COMPLETE\",\"mode\":\"AUDIT_ONLY\",\"workspaces\":[]}'\n");
      chmodSync(executable, 0o700);
      const result = await collectLocalWorkspaceAudit({
        SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY: process.cwd(),
        SMARTSPEC_PYTHON_EXECUTABLE: executable,
      });
      expect(result).toEqual({ status: "OBSERVED", result: { status: "WORKTREE_AUDIT_COMPLETE", mode: "AUDIT_ONLY", workspaces: [] } });
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("includes persisted local registry audit evidence in the scheduled audit result", async () => {
    const { executeWorkspaceAuthorityAudit } = await import("./workspaceAuthorityAuditJob");
    const result = await executeWorkspaceAuthorityAudit({
      tenantId: "tenant-a",
      now: new Date("2026-10-07T12:00:00.000Z"),
      collectLocal: async () => ({ status: "OBSERVED", result: { status: "WORKTREE_AUDIT_COMPLETE", mode: "AUDIT_ONLY", workspaces: [{ classification: "UNKNOWN_OWNER" }] } }),
    });
    expect(result).toMatchObject({ mode: "AUDIT_ONLY", runnerCount: 0, localWorkspaceAudit: { status: "OBSERVED", result: { mode: "AUDIT_ONLY" } } });
  });
});
