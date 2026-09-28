import { describe, expect, it } from "vitest";

import {
  WORKER_SERIES_CONTROL_PLANE_CONTRACT_VERSION,
  buildWorkerSeriesFilterHash,
  createWorkerSeriesError,
  deriveWorkerSeriesScopes,
  hashWorkerSeriesRequest,
  workerSeriesCursorPayloadSchema,
  workerSeriesQuickActionRequestSchema,
  workerSeriesPrincipalSchema,
} from "../workerSeriesControlPlane";

describe("worker Series control-plane contracts", () => {
  it("fails closed for incomplete principals", () => {
    expect(() => workerSeriesPrincipalSchema.parse({ workerId: "w1", tenantId: "t1" })).toThrow();
    expect(
      workerSeriesPrincipalSchema.parse({
        workerId: "w1",
        tenantId: "t1",
        userId: 7,
        groupIds: [],
        accessMode: "read",
        accessSource: "owner",
        authorityRevision: "auth-1",
        policyRevision: "policy-1",
      }).userId
    ).toBe(7);
  });

  it("intersects requested and granted scopes without broadening read access", () => {
    expect(deriveWorkerSeriesScopes({
      requested: ["series:read", "series:bind", "series:media:process"],
      granted: ["series:read", "series:bind", "series:media:process"],
      accessMode: "read",
    })).toEqual(["series:read"]);
    expect(deriveWorkerSeriesScopes({
      requested: ["series:read", "series:bind", "series:media:process"],
      granted: ["series:read", "series:bind", "series:media:process"],
      accessMode: "operate",
    })).toEqual(["series:read", "series:bind", "series:media:process"]);
  });

  it("rejects raw paths, commands, and unknown authority fields in actions", () => {
    expect(() => workerSeriesQuickActionRequestSchema.parse({
      requestId: "req-1",
      idempotencyKey: "idempotency-1",
      action: { action: "scan", seriesId: "s1", bindingId: "b1", path: "/tmp/x" },
    })).toThrow();
    expect(() => workerSeriesQuickActionRequestSchema.parse({
      requestId: "req-1",
      idempotencyKey: "idempotency-1",
      action: { action: "select", seriesId: "s1", tenantId: "attacker" },
    })).toThrow();
  });

  it("keeps queue cancellation and retry actions bounded to explicit job ids", () => {
    expect(workerSeriesQuickActionRequestSchema.parse({
      requestId: "req-cancel-1",
      idempotencyKey: "idempotency-cancel-1",
      action: { action: "cancel", seriesId: "s1", jobIds: ["job-1"], reason: "user_requested" },
    }).action.action).toBe("cancel");
    expect(workerSeriesQuickActionRequestSchema.parse({
      requestId: "req-retry-1",
      idempotencyKey: "idempotency-retry-1",
      action: { action: "retry", seriesId: "s1", jobIds: ["job-1"] },
    }).action.action).toBe("retry");
    expect(() => workerSeriesQuickActionRequestSchema.parse({
      requestId: "req-cancel-2",
      idempotencyKey: "idempotency-cancel-2",
      action: { action: "cancel", seriesId: "s1", jobIds: [], reason: "user_requested" },
    })).toThrow();
    expect(workerSeriesQuickActionRequestSchema.parse({
      requestId: "req-pause-1",
      idempotencyKey: "idempotency-pause-1",
      action: { action: "pause", seriesId: "s1", jobIds: ["job-1"], reason: "user_requested" },
    }).action.action).toBe("pause");
    expect(workerSeriesQuickActionRequestSchema.parse({
      requestId: "req-resume-1",
      idempotencyKey: "idempotency-resume-1",
      action: { action: "resume", seriesId: "s1", jobIds: ["job-1"] },
    }).action.action).toBe("resume");
  });

  it("binds cursor semantics to the principal and filter", () => {
    const filterHash = buildWorkerSeriesFilterHash({ q: "demo", archived: false });
    expect(workerSeriesCursorPayloadSchema.parse({
      version: 1,
      tenantId: "t1",
      userId: 7,
      filterHash,
      offset: 25,
      authorityRevision: "auth-1",
    }).filterHash).toBe(filterHash);
    expect(hashWorkerSeriesRequest({ b: 1, a: 2 })).not.toBe(hashWorkerSeriesRequest({ a: 1, b: 2 }));
  });

  it("serializes stable safe errors", () => {
    const error = createWorkerSeriesError("SERIES_NOT_FOUND", "req-1");
    expect(error.contractVersion).toBe(WORKER_SERIES_CONTROL_PLANE_CONTRACT_VERSION);
    expect(error.messageKey).toBe("workerSeries.SERIES_NOT_FOUND");
  });

  it("projects explicit action capabilities without exposing local paths", async () => {
    const { projectWorkerSeries } = await import("../../server/services/verticalDramaSeriesAccessService");
    const projection = projectWorkerSeries({
      series: { id: 1, tenantId: "t1", userId: 7, title: "Series", status: "draft", updatedAt: new Date("2026-08-25T00:00:00.000Z") },
      principal: workerSeriesPrincipalSchema.parse({
        workerId: "w1", tenantId: "t1", userId: 7, groupIds: [], accessMode: "operate", accessSource: "owner", authorityRevision: "a1", policyRevision: "p1",
      }),
      capabilities: { canBind: true, canProcess: false, canPublish: false },
    });
    expect(projection).toMatchObject({ canBind: true, canProcess: false, canPublish: false });
    expect(JSON.stringify(projection)).not.toContain("/home/");
  });
});
