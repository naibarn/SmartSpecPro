import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateJob, mockStartSchedule, mockStopSchedule } = vi.hoisted(() => ({ mockCreateJob: vi.fn(), mockStartSchedule: vi.fn(), mockStopSchedule: vi.fn() }));
vi.mock("../services/jobControlPlaneGateway", () => ({ createControlPlaneJob: mockCreateJob }));
vi.mock("./feature186SystemScheduler", () => ({ startFeature186SystemSchedule: mockStartSchedule, stopFeature186SystemSchedule: mockStopSchedule, utcMinuteOccurrence: (date: Date) => date.toISOString() }));
import { enqueueWorkspaceAuthorityAuditEvent, initializeWorkspaceAuthorityAuditJob, shutdownWorkspaceAuthorityAuditJob } from "./workspaceAuthorityAuditJob";

describe("workspace authority audit triggers", () => {
  beforeEach(() => { mockCreateJob.mockReset(); mockStartSchedule.mockReset(); mockStopSchedule.mockReset(); });
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
});
