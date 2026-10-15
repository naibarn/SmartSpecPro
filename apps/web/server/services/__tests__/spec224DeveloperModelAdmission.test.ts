import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createSpec224DeveloperModelAdmissionTransport } from "../spec224DeveloperModelAdmission";

function setup() {
  const events: unknown[][] = [];
  const lease = { jobId: "job-1", attemptId: "attempt-1", leaseToken: "server-only-lease-secret", fencingVersion: 4, expiresAt: "2026-10-15T12:00:00.000Z" };
  const repository = {
    reserveCodexModelCall: vi.fn(async (input: any) => { events.push(["reserve", input]); return { kind: "reserved", operationKey: operationKey(lease.jobId, input.runId, input.modelCallId), reservedTokens: 120, tokenWindowStartedAt: new Date("2026-10-15T11:00:00.000Z"), replayed: false }; }),
    markCodexModelCallDispatching: vi.fn(async (input: any) => { events.push(["dispatch", input]); return { kind: "marked" }; }),
    recordCodexModelThreadIdentity: vi.fn(async (input: any) => { events.push(["thread", input]); return { kind: "recorded" }; }),
    recordCodexModelTurnIdentity: vi.fn(async (input: any) => { events.push(["turn", input]); return { kind: "recorded" }; }),
    settleCodexModelCall: vi.fn(async (input: any) => { events.push(["settle", input]); return { kind: "settled", operationKey: input.operationKey, chargedTokens: 12 }; }),
  };
  const reporter = { assertActive: vi.fn(async () => { events.push(["assertActive"]); }), waitForExternal: vi.fn(async (_lease, wait) => { events.push(["wait", wait]); }) };
  const transport = createSpec224DeveloperModelAdmissionTransport({ lease, runId: "run-1", reporter, repository: repository as any, now: () => new Date("2026-10-15T11:30:00.000Z") });
  return { events, lease, repository, reporter, transport };
}

function operationKey(jobId: string, runId: string, modelCallId: string) {
  return `spec224-codex-turn:${createHash("sha256").update(`${jobId}\0${runId}\0${modelCallId}`).digest("hex")}`;
}

const call = { runId: "run-1", modelCallId: "model-call-1", phase: "IMPLEMENT", role: "implementer", requestedModel: "gpt-6-luna", reasoningEffort: "medium", promptBytes: 20, selection: { profile: "GENERAL", requestedModel: "gpt-6-luna", reasoningEffort: "medium" } };

describe("SPEC-224 Developer model admission contract adapter", () => {
  it("keeps LeaseContext server-owned and checks authority before each operation", async () => {
    const { events, lease, repository, transport } = setup();
    const reserved = await transport.reserve(call);
    expect(reserved.kind).toBe("reserved");
    const op = operationKey(lease.jobId, call.runId, call.modelCallId);
    expect(repository.reserveCodexModelCall.mock.calls[0][0].lease).toBe(lease);
    expect(repository.reserveCodexModelCall.mock.calls[0][0].selection).toEqual(call.selection);
    await transport.dispatching(op);
    await transport.threadCreated(op, "thread-1");
    await transport.turnStarted(op, "thread-1", "turn-1");
    const usage = { inputTokens: 10, cachedInputTokens: 2, outputTokens: 2, threadId: "thread-1", turnId: "turn-1", effectiveModel: "gpt-6-luna", observedAt: "2026-10-15T11:30:00.000Z" };
    await transport.settle(op, usage);
    expect(events.map(event => event[0])).toEqual(["assertActive", "reserve", "assertActive", "dispatch", "assertActive", "thread", "assertActive", "turn", "assertActive", "settle"]);
    expect(JSON.stringify({ reserved, usage })).not.toContain(lease.leaseToken);
    expect(JSON.stringify(repository.reserveCodexModelCall.mock.calls[0][0])).toContain(lease.leaseToken);
  });

  it("persists typed budget waiting and releases the lease without dispatch", async () => {
    const { repository, reporter, transport } = setup();
    const op = operationKey("job-1", call.runId, call.modelCallId);
    repository.reserveCodexModelCall.mockResolvedValueOnce({ kind: "waiting_budget", operationKey: op, reason: "token_budget", nextEligibleAt: new Date("2026-10-15T12:00:00.000Z") } as any);
    const result = await transport.reserve(call);
    expect(result).toMatchObject({ kind: "waiting_budget", operationKey: op, nextEligibleAt: "2026-10-15T12:00:00.000Z" });
    await transport.wait(op, "budget", "2026-10-15T12:00:00.000Z");
    expect(reporter.waitForExternal).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1" }), expect.objectContaining({ reason: "budget", resumeAfter: "2026-10-15T12:00:00.000Z" }));
    expect(repository.markCodexModelCallDispatching).not.toHaveBeenCalled();
  });

  it("persists provider capacity waiting separately and keeps dispatched unknown usage charged", async () => {
    const { repository, reporter, transport } = setup();
    const admitted = await transport.reserve(call);
    const op = operationKey("job-1", call.runId, call.modelCallId);
    expect(admitted.kind).toBe("reserved");
    await transport.dispatching(op);
    const wait = await transport.providerCapacity(op, { statusCode: 429, retryAfterSeconds: 90 });
    expect(wait).toMatchObject({ kind: "waiting_capacity", evidence: { statusCode: 429, retryAfterSeconds: 90 } });
    repository.settleCodexModelCall.mockResolvedValueOnce({ kind: "unknown", operationKey: op, conservativelyChargedTokens: 120 } as any);
    expect(await transport.settle(op, null)).toMatchObject({ kind: "unknown", conservativelyChargedTokens: 120 });
    const nextEligibleAt = String(wait.nextEligibleAt);
    await transport.wait(op, "provider_capacity", nextEligibleAt);
    expect(reporter.waitForExternal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      reason: "provider_capacity", resumeAfter: nextEligibleAt,
      metadata: expect.objectContaining({ reservationState: "unknown_after_dispatch" }),
    }));
  });

  it("rejects a mismatched run binding before touching the budget repository", async () => {
    const { repository, transport } = setup();
    expect(await transport.reserve({ ...call, runId: "other-run" })).toEqual({ kind: "denied", reason: "run_binding" });
    expect(repository.reserveCodexModelCall).not.toHaveBeenCalled();
  });

  it("keeps overlapping model call identities independent within one transport", async () => {
    const { transport, repository } = setup();
    const secondCall = { ...call, modelCallId: "model-call-2" };
    const [first, second] = await Promise.all([transport.reserve(call), transport.reserve(secondCall)]);
    expect(first.kind).toBe("reserved");
    expect(second.kind).toBe("reserved");
    const firstKey = operationKey("job-1", call.runId, call.modelCallId);
    const secondKey = operationKey("job-1", secondCall.runId, secondCall.modelCallId);
    expect(await transport.dispatching(firstKey)).toEqual({ kind: "marked" });
    expect(await transport.dispatching(secondKey)).toEqual({ kind: "marked" });
    expect(repository.markCodexModelCallDispatching).toHaveBeenCalledTimes(2);
  });
});
