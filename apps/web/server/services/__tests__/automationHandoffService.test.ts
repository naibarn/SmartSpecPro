import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import {
  createHandoff,
  completeHandoff,
  completeHandoffFromCallback,
  recordDispatchAttempt,
} from "../automationHandoffService";

function makeHandoff(overrides: Record<string, unknown> = {}) {
  return {
    id: "handoff-1",
    tenantId: "tenant-1",
    teamId: "team-1",
    roomId: "room-1",
    runId: "run-1",
    assistantId: "assistant-1",
    destinationType: "workflow",
    destinationId: null,
    idempotencyKey: "idem-1",
    dispatchTokenHash: null,
    callbackNonce: null,
    callbackDeadlineAt: null,
    attemptCount: 0,
    lastAttemptAt: null,
    status: "pending",
    approvalState: "pending",
    requestPayloadJson: null,
    resultPayloadJson: null,
    approvedByUserId: null,
    errorDetail: null,
    createdAt: new Date("2026-03-19T00:00:00Z"),
    updatedAt: new Date("2026-03-19T00:00:00Z"),
    ...overrides,
  };
}

function makeDb(selectRows: unknown[] = [], returningRows: unknown[] = []) {
  const limit = vi.fn().mockResolvedValue(selectRows);
  const whereSelect = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where: whereSelect });
  const select = vi.fn().mockReturnValue({ from });

  const returning = vi.fn().mockResolvedValue(returningRows);
  const whereMutation = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where: whereMutation });
  const update = vi.fn().mockReturnValue({ set });
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  return {
    select,
    from,
    whereSelect,
    limit,
    update,
    set,
    whereMutation,
    insert,
    values,
    returning,
  };
}

describe("automationHandoffService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createHandoff creates callback-secured handoff when idempotency key is new", async () => {
    const inserted = makeHandoff({
      idempotencyKey: "idem-new",
      dispatchTokenHash: "hash",
      callbackNonce: "nonce",
      callbackDeadlineAt: new Date(Date.now() + 60_000),
      approvalState: "not_required",
    });
    const db = makeDb([], [inserted]);
    mockGetDb.mockResolvedValue(db);

    const result = await createHandoff({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      assistantId: "assistant-1",
      destinationType: "workflow",
      requiresApproval: false,
      idempotencyKey: "idem-new",
      callbackToken: "callback-token",
    });

    expect(result.created).toBe(true);
    expect(result.callbackToken).toBe("callback-token");
    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "idem-new",
        dispatchTokenHash: expect.any(String),
        callbackNonce: expect.any(String),
        callbackDeadlineAt: expect.any(Date),
        approvalState: "not_required",
      }),
    );
  });

  it("createHandoff returns existing handoff when idempotency key already exists", async () => {
    const existing = makeHandoff({ idempotencyKey: "idem-existing" });
    const db = makeDb([existing], []);
    mockGetDb.mockResolvedValue(db);

    const result = await createHandoff({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      assistantId: "assistant-1",
      destinationType: "workflow",
      idempotencyKey: "idem-existing",
    });

    expect(result.created).toBe(false);
    expect(result.callbackToken).toBeNull();
    expect(result.handoff).toEqual(existing);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("recordDispatchAttempt increments attempt count", async () => {
    const existing = makeHandoff({ attemptCount: 2 });
    const updated = makeHandoff({ attemptCount: 3, lastAttemptAt: new Date() });
    const db = makeDb([existing], [updated]);
    mockGetDb.mockResolvedValue(db);

    const result = await recordDispatchAttempt("handoff-1");

    expect(result.attemptCount).toBe(3);
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptCount: 3,
        lastAttemptAt: expect.any(Date),
      }),
    );
  });

  it("completeHandoff clears callback security material on manual completion", async () => {
    const existing = makeHandoff({ status: "executing" });
    const updated = makeHandoff({
      status: "completed",
      dispatchTokenHash: null,
      callbackNonce: null,
      callbackDeadlineAt: null,
    });
    const db = makeDb([existing], [updated]);
    mockGetDb.mockResolvedValue(db);

    const result = await completeHandoff("handoff-1", { ok: true });

    expect(result.status).toBe("completed");
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        dispatchTokenHash: null,
        callbackNonce: null,
        callbackDeadlineAt: null,
      }),
    );
  });

  it("completeHandoffFromCallback completes handoff when token, nonce, and binding match", async () => {
    const token = "callback-token";
    const hash = await (async () => {
      const crypto = await import("crypto");
      return crypto.createHash("sha256").update(token, "utf8").digest("hex");
    })();
    const existing = makeHandoff({
      teamId: "team-1",
      runId: "run-1",
      approvalState: "approved",
      status: "executing",
      dispatchTokenHash: hash,
      callbackNonce: "nonce-1",
      callbackDeadlineAt: new Date(Date.now() + 60_000),
    });
    const updated = makeHandoff({
      status: "completed",
      dispatchTokenHash: null,
      callbackNonce: null,
      callbackDeadlineAt: null,
      resultPayloadJson: { ok: true },
    });
    const db = makeDb([existing], [updated]);
    mockGetDb.mockResolvedValue(db);

    const result = await completeHandoffFromCallback({
      handoffId: "handoff-1",
      teamId: "team-1",
      runId: "run-1",
      callbackToken: token,
      callbackNonce: "nonce-1",
      resultPayloadJson: { ok: true },
    });

    expect(result.status).toBe("completed");
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        dispatchTokenHash: null,
        callbackNonce: null,
        callbackDeadlineAt: null,
      }),
    );
  });

  it("completeHandoffFromCallback rejects mismatched binding", async () => {
    const existing = makeHandoff({
      teamId: "team-1",
      runId: "run-1",
      approvalState: "approved",
      status: "executing",
      dispatchTokenHash: "abc",
      callbackNonce: "nonce-1",
      callbackDeadlineAt: new Date(Date.now() + 60_000),
    });
    const db = makeDb([existing], []);
    mockGetDb.mockResolvedValue(db);

    await expect(
      completeHandoffFromCallback({
        handoffId: "handoff-1",
        teamId: "team-2",
        runId: "run-1",
        callbackToken: "callback-token",
        callbackNonce: "nonce-1",
      }),
    ).rejects.toThrow("Callback binding mismatch");
  });

  it("completeHandoffFromCallback rejects expired callback token", async () => {
    const token = "callback-token";
    const hash = await (async () => {
      const crypto = await import("crypto");
      return crypto.createHash("sha256").update(token, "utf8").digest("hex");
    })();
    const existing = makeHandoff({
      teamId: "team-1",
      runId: "run-1",
      approvalState: "approved",
      status: "executing",
      dispatchTokenHash: hash,
      callbackNonce: "nonce-1",
      callbackDeadlineAt: new Date(Date.now() - 1_000),
    });
    const db = makeDb([existing], []);
    mockGetDb.mockResolvedValue(db);

    await expect(
      completeHandoffFromCallback({
        handoffId: "handoff-1",
        teamId: "team-1",
        runId: "run-1",
        callbackToken: token,
        callbackNonce: "nonce-1",
      }),
    ).rejects.toThrow("Callback token expired");
  });
});
