import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createSpec260EvidenceRetentionScheduleHandler } from "./spec260EvidenceRetentionSchedule";

const now = new Date("2026-10-20T12:08:00Z");
function fixture() {
  const createJob = vi.fn().mockResolvedValue({ jobId: "existing-job", created: true });
  const dependencies = { authenticate: (token: string | undefined) => token === "schedule-only-token",
    systemTenant: () => "system-tenant" as string | undefined, createJob, now: () => now };
  const headers: Record<string,string> = { "x-internal-token":"schedule-only-token", "x-spec260-schedule":"evidence-retention-v1",
    "x-spec260-schedule-tenant":"system-tenant", "x-spec260-schedule-expires-at":"2026-10-20T12:10:00Z" };
  const req = { method:"POST",body:{ scheduledTime:now.getTime(),occurrenceKey:"2026-10-20T12:05Z:emergency-evidence-retention" },
    header:(name: string) => headers[name] } as unknown as Request;
  const res = { status:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis() } as unknown as Response;
  return { createJob,dependencies,headers,req,res,run:() => createSpec260EvidenceRetentionScheduleHandler(dependencies)(req,res) };
}
describe("existing retention system schedule admission", () => {
  it("uses server tenant, canonical job/outbox admission and existing coalesced occurrence identity", async () => {
    const f=fixture();await f.run();
    expect(f.res.status).toHaveBeenCalledWith(202);
    expect(f.createJob).toHaveBeenCalledWith(expect.objectContaining({
      context:expect.objectContaining({tenantId:"system-tenant",actorType:"system",authorizationScope:"system:schedule:spec260-emergency-evidence-retention"}),
      definition:expect.objectContaining({jobType:"emergency.evidence.retention",input:{maxRows:100,requestedOccurrenceKey:f.req.body.occurrenceKey},
        schedule:expect.objectContaining({occurrenceKey:f.req.body.occurrenceKey,missedOccurrencePolicy:"coalesce"})}),
      createOptions:{runtimeType:"node_job_worker"},
    }));
    const original=f.createJob.mock.calls[0][0];
    f.req.body={scheduledTime:now.getTime()-600_000,occurrenceKey:"2026-10-20T11:55Z:emergency-evidence-retention"};await f.run();
    expect(f.createJob.mock.calls[1][0].definition.schedule).toEqual(original.definition.schedule);
    expect(f.createJob.mock.calls[1][0].definition.idempotencyKey).toBe(original.definition.idempotencyKey);
    expect(f.createJob.mock.calls[1][0].definition.input).toEqual(original.definition.input);
  });
  it.each(["auth","method","schedule","tenant","expired","partial","payload-tenant","occurrence","old","future","server-tenant"])("denies %s before canonical admission",async mode=>{
    const f=fixture();
    if(mode==="auth")f.headers["x-internal-token"]="bad";
    if(mode==="method")f.req.method="GET";
    if(mode==="schedule")f.headers["x-spec260-schedule"]="other";
    if(mode==="tenant")f.headers["x-spec260-schedule-tenant"]="foreign";
    if(mode==="expired")f.headers["x-spec260-schedule-expires-at"]=now.toISOString();
    if(mode==="partial")delete f.headers["x-spec260-schedule-expires-at"];
    if(mode==="payload-tenant")f.req.body.tenantId="foreign";
    if(mode==="occurrence")f.req.body.occurrenceKey="wrong";
    if(mode==="old")f.req.body.scheduledTime=now.getTime()-8*86400_000;
    if(mode==="future")f.req.body.scheduledTime=now.getTime()+600_000;
    if(mode==="server-tenant")f.dependencies.systemTenant=()=>undefined;
    await f.run();expect(f.createJob).not.toHaveBeenCalled();expect(f.res.status).not.toHaveBeenCalledWith(202);
  });
  it("preserves existing dedicated-token legacy scheduler admission",async()=>{
    const f=fixture();delete f.headers["x-spec260-schedule-tenant"];delete f.headers["x-spec260-schedule-expires-at"];
    await f.run();expect(f.res.status).toHaveBeenCalledWith(202);
  });
  it("returns retryable failure without exposing database errors or credentials",async()=>{
    const f=fixture();f.createJob.mockRejectedValue(new Error("private-database-diagnostic"));
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {await f.run();expect(f.res.status).toHaveBeenCalledWith(503);
      expect(JSON.stringify(vi.mocked(f.res.json).mock.calls)).not.toContain("private-database-diagnostic");} finally {log.mockRestore();}
  });
});
