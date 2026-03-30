import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("../_core/env", () => ({
  ENV: { webGatewayToken: "test-gateway-token" },
}));

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../services/crypto", () => ({
  encrypt: vi.fn().mockReturnValue("encrypted-secret"),
}));

vi.mock("../middleware/contentAutomationGate", () => ({
  contentAutomationGate: vi.fn((_req, _res, next) => next()),
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

import { scheduleDraftHandler, validateCronStrict, computeNextRun } from "./scheduleDraftTool";
import { getDb } from "../db";

function buildRequest(overrides?: Record<string, unknown>): Request {
  return {
    headers: { "x-internal-token": "test-gateway-token" },
    body: {
      topic_template: "Weekly report on {{date}}",
      schedule_type: "recurring",
      cron_expression: "0 9 * * 1",
      userId: 42,
      tenantId: "tenant-1",
      ...overrides,
    },
  } as unknown as Request;
}

function buildResponse(): { res: Response; statusMock: ReturnType<typeof vi.fn>; jsonMock: ReturnType<typeof vi.fn> } {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
  const res = { status: statusMock, json: jsonMock } as unknown as Response;
  return { res, statusMock, jsonMock };
}

// Default DB mock: active schedule count = 0, insert returns new record
const buildMockDb = (activeCount = 0) => ({
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(
      activeCount > 0 ? new Array(activeCount).fill({ id: 1 }) : [],
    ),
  }),
  insert: vi.fn().mockReturnValue({
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{
        id: 99,
        nextRun: new Date("2026-03-17T09:00:00Z"),
        status: "active",
      }]),
    }),
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDb).mockResolvedValue(buildMockDb() as never);
});

describe("scheduleDraftHandler", () => {
  describe("authentication", () => {
    it("returns 401 when X-Internal-Token is missing", async () => {
      const req = buildRequest();
      (req.headers as Record<string, string>)["x-internal-token"] = "";
      const { res, statusMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe("cron expression validation", () => {
    it("rejects every-minute pattern (* * * * *)", async () => {
      const req = buildRequest({ cron_expression: "* * * * *" });
      const { res, statusMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects sub-hourly pattern (*/30 * * * *)", async () => {
      const req = buildRequest({ cron_expression: "*/30 * * * *" });
      const { res, statusMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("accepts hourly pattern (0 * * * *)", async () => {
      const req = buildRequest({ cron_expression: "0 * * * *" });
      const { res, jsonMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("accepts daily pattern (0 9 * * 1)", async () => {
      const req = buildRequest({ cron_expression: "0 9 * * 1" });
      const { res, jsonMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe("topic template validation", () => {
    it("accepts {{date}} placeholder", async () => {
      const req = buildRequest({ topic_template: "Report for {{date}}" });
      const { res, jsonMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("accepts {{day_of_week}} placeholder", async () => {
      const req = buildRequest({ topic_template: "{{day_of_week}} digest" });
      const { res, jsonMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("rejects unsupported placeholder {{unknown}}", async () => {
      const req = buildRequest({ topic_template: "Report for {{unknown_var}}" });
      const { res, statusMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe("webhook URL SSRF validation", () => {
    it("rejects webhook URL with private IP", async () => {
      const req = buildRequest({ notify_webhook_url: "https://192.168.1.1/webhook" });
      const { res, statusMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("rejects webhook URL with localhost", async () => {
      const req = buildRequest({ notify_webhook_url: "https://localhost/webhook" });
      const { res, statusMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe("per-user schedule limit", () => {
    it("blocks creation when user already has 10 active schedules", async () => {
      vi.mocked(getDb).mockResolvedValue(buildMockDb(10) as never);
      const req = buildRequest();
      const { res, statusMock, jsonMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe("schedule creation", () => {
    it("creates schedule record and returns ScheduleDraftResponse", async () => {
      const req = buildRequest();
      const { res, jsonMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        schedule_id: 99,
        status: "active",
      }));
    });

    it("generates webhookSecretEncrypted when webhook URL provided", async () => {
      const { encrypt } = await import("../services/crypto");
      const req = buildRequest({ notify_webhook_url: "https://webhooks.example.com/hook" });
      const { res, jsonMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(encrypt).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("sets next_run for one_time schedule from run_at", async () => {
      const req = buildRequest({
        schedule_type: "one_time",
        run_at: "2026-04-01T09:00:00Z",
        cron_expression: undefined,
      });
      const { res, jsonMock } = buildResponse();
      await scheduleDraftHandler(req, res);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});

describe("validateCronStrict", () => {
  it("rejects * * * * * (every minute)", () => {
    expect(validateCronStrict("* * * * *").valid).toBe(false);
  });

  it("rejects */30 * * * * (every 30 minutes)", () => {
    expect(validateCronStrict("*/30 * * * *").valid).toBe(false);
  });

  it("rejects */59 * * * * (every 59 minutes)", () => {
    expect(validateCronStrict("*/59 * * * *").valid).toBe(false);
  });

  it("accepts 0 * * * * (every hour)", () => {
    expect(validateCronStrict("0 * * * *").valid).toBe(true);
  });

  it("accepts 0 9 * * 1 (Monday 9am)", () => {
    expect(validateCronStrict("0 9 * * 1").valid).toBe(true);
  });

  it("accepts 0 */2 * * * (every 2 hours)", () => {
    expect(validateCronStrict("0 */2 * * *").valid).toBe(true);
  });
});

describe("computeNextRun", () => {
  it("returns run_at for one_time schedule", () => {
    const runAt = new Date("2026-04-01T09:00:00Z");
    const result = computeNextRun("one_time", undefined, runAt);
    expect(result).toEqual(runAt);
  });

  it("returns a future date for recurring schedule", () => {
    const now = new Date();
    const result = computeNextRun("recurring", "0 * * * *", undefined);
    expect(result).toBeTruthy();
    expect(result!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("respects timezone when computing recurring schedules", () => {
    const result = computeNextRun(
      "recurring",
      "0 9 * * *",
      undefined,
      { timezone: "Asia/Bangkok", now: new Date("2026-04-01T00:30:00Z") },
    );

    expect(result?.toISOString()).toBe("2026-04-01T02:00:00.000Z");
  });

  it("returns null for invalid timezone", () => {
    const result = computeNextRun(
      "recurring",
      "0 9 * * *",
      undefined,
      "Mars/Olympus",
    );

    expect(result).toBeNull();
  });
});
