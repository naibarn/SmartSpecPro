import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before imports
vi.mock("../services/redis", () => ({
  getRedisClient: vi.fn(),
  isRedisAvailable: vi.fn(() => true),
}));

vi.mock("../db", () => ({
  db: {
    transaction: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../../drizzle/schema", () => ({
  users: { id: "id", credits: "credits", plan: "plan" },
  creditTransactions: {
    id: "id",
    userId: "userId",
    amount: "amount",
    type: "type",
    description: "description",
    metadata: "metadata",
    balanceAfter: "balanceAfter",
    idempotencyKey: "idempotencyKey",
    traceId: "traceId",
    conversationId: "conversationId",
    skillSlug: "skillSlug",
    sourceType: "sourceType",
    referenceId: "referenceId",
    createdAt: "createdAt",
  },
  creditPackages: {},
  modelProviderMap: {},
  systemSettings: {},
  conversations: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("../services/traceContext", () => ({
  getTraceId: vi.fn(() => null),
}));

import {
  commitCreditReservation,
  createCreditReservation,
  drawFromReservation,
  refundReservation,
  type CreditReservation,
} from "../services/creditService";
import { getRedisClient } from "../services/redis";

describe("Credit Reservation Pattern", () => {
  let mockRedis: Record<string, any>;
  let redisStore: Record<string, string>;

  beforeEach(() => {
    redisStore = {};
    mockRedis = {
      get: vi.fn((key: string) => redisStore[key] ?? null),
      set: vi.fn((key: string, val: string, _mode: string, _ttl: number) => {
        redisStore[key] = val;
        return "OK";
      }),
      del: vi.fn((key: string) => {
        delete redisStore[key];
        return 1;
      }),
      ttl: vi.fn(() => 500),
      eval: vi.fn((_script: string, _numKeys: number, key: string, amountStr: string, _ttlStr: string) => {
        const raw = redisStore[key];
        if (!raw) return { err: "not_found" };
        const r = JSON.parse(raw);
        const newDrawn = r.drawnAmount + Number(amountStr);
        if (newDrawn > r.reservedAmount) return { err: "budget_exceeded" };
        r.drawnAmount = newDrawn;
        redisStore[key] = JSON.stringify(r);
        return [r.reservedAmount - newDrawn];
      }),
    };
    (getRedisClient as any).mockReturnValue(mockRedis);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createCreditReservation", () => {
    it("should create reservation and store in Redis", async () => {
      // Mock deductCredits (which is called internally)
      const { db } = await import("../db");
      (db.transaction as any).mockImplementation(async (cb: any) => {
        await cb({
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => [{ newBalance: 900 }],
              }),
            }),
          }),
          insert: () => ({
            values: () => ({
              returning: () => [{ id: 1 }],
            }),
          }),
        });
      });

      const reservation = await createCreditReservation(
        1,
        100,
        "browser_automation",
        { taskId: "test-task" },
      );

      expect(reservation.reservationId).toBeTruthy();
      expect(reservation.userId).toBe(1);
      expect(reservation.reservedAmount).toBe(100);
      expect(reservation.drawnAmount).toBe(0);
      expect(mockRedis.set).toHaveBeenCalledWith(
        `credit:reservation:${reservation.reservationId}`,
        expect.any(String),
        "EX",
        600,
      );
    });
  });

  describe("drawFromReservation", () => {
    it("should draw from existing reservation", async () => {
      const reservation: CreditReservation = {
        reservationId: "test-res-id",
        userId: 1,
        reservedAmount: 100,
        drawnAmount: 0,
        transactionId: 1,
        sourceType: "browser_automation",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      redisStore["credit:reservation:test-res-id"] = JSON.stringify(reservation);

      const result = await drawFromReservation("test-res-id", 20, "browser tool draw");

      expect(result.drawn).toBe(20);
      expect(result.remaining).toBe(80);
    });

    it("should reject draw exceeding budget", async () => {
      const reservation: CreditReservation = {
        reservationId: "test-res-id",
        userId: 1,
        reservedAmount: 30,
        drawnAmount: 20,
        transactionId: 1,
        sourceType: "browser_automation",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      redisStore["credit:reservation:test-res-id"] = JSON.stringify(reservation);

      await expect(
        drawFromReservation("test-res-id", 20, "browser tool draw"),
      ).rejects.toThrow("Reservation budget exceeded");
    });

    it("should reject when reservation not found", async () => {
      await expect(
        drawFromReservation("nonexistent", 20, "test"),
      ).rejects.toThrow("not found or expired");
    });
  });

  describe("refundReservation", () => {
    it("should refund unused credits", async () => {
      const reservation: CreditReservation = {
        reservationId: "test-res-id",
        userId: 1,
        reservedAmount: 100,
        drawnAmount: 30,
        transactionId: 1,
        sourceType: "browser_automation",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      redisStore["credit:reservation:test-res-id"] = JSON.stringify(reservation);

      // Mock addCredits for refund
      const { db } = await import("../db");
      (db.transaction as any).mockImplementation(async (cb: any) => {
        await cb({
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => [{ newBalance: 970 }],
              }),
            }),
          }),
          insert: () => ({
            values: () => ({
              returning: () => [{ id: 2 }],
            }),
          }),
        });
      });

      const result = await refundReservation("test-res-id");
      expect(result.refundedAmount).toBe(70);
      expect(mockRedis.del).toHaveBeenCalledWith("credit:reservation:test-res-id");
    });

    it("should return 0 when reservation not found", async () => {
      const result = await refundReservation("nonexistent");
      expect(result.refundedAmount).toBe(0);
    });
  });

  describe("commitCreditReservation", () => {
    it("should commit the remaining reserved amount and remove the Redis key", async () => {
      const reservation: CreditReservation = {
        reservationId: "test-res-id",
        userId: 1,
        reservedAmount: 100,
        drawnAmount: 25,
        transactionId: 1,
        sourceType: "browser_automation",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      redisStore["credit:reservation:test-res-id"] = JSON.stringify(reservation);

      const result = await commitCreditReservation("test-res-id");

      expect(result.committedAmount).toBe(75);
      expect(mockRedis.del).toHaveBeenCalledWith("credit:reservation:test-res-id");
    });

    it("should return 0 when reservation is already gone", async () => {
      const result = await commitCreditReservation("nonexistent");
      expect(result.committedAmount).toBe(0);
    });
  });
});
