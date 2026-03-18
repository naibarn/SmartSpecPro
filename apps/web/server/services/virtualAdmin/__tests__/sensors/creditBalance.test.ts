import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../db", () => ({
  getDb: vi.fn(),
}));

import creditBalanceSensor from "../../sensors/creditBalance";
import { getDb } from "../../../../db";

describe("CreditBalanceSensor", () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    };
    (getDb as any).mockResolvedValue(mockDb);
  });

  it("returns healthy when all users above soft limit", async () => {
    mockDb.where.mockResolvedValue([
      { minCredits: 500, avgCredits: 1000, totalUsers: 5, lowCreditUsers: 0 },
    ]);

    const reading = await creditBalanceSensor.collect();
    expect(reading.status).toBe("healthy");
    expect(reading.sensorId).toBe("credit_balance");
  });

  it("returns degraded when some users below soft limit", async () => {
    mockDb.where.mockResolvedValue([
      { minCredits: 50, avgCredits: 300, totalUsers: 5, lowCreditUsers: 2 },
    ]);

    const reading = await creditBalanceSensor.collect();
    expect(reading.status).toBe("degraded");
  });

  it("returns critical when any user at or below hard limit", async () => {
    mockDb.where.mockResolvedValue([
      { minCredits: -100, avgCredits: 200, totalUsers: 5, lowCreditUsers: 1 },
    ]);

    const reading = await creditBalanceSensor.collect();
    expect(reading.status).toBe("critical");
  });

  it("includes credit metrics in reading", async () => {
    mockDb.where.mockResolvedValue([
      { minCredits: 200, avgCredits: 500, totalUsers: 3, lowCreditUsers: 0 },
    ]);

    const reading = await creditBalanceSensor.collect();
    expect(reading.metrics).toHaveProperty("minCredits");
    expect(reading.metrics).toHaveProperty("avgCredits");
    expect(reading.metrics).toHaveProperty("totalUsers");
    expect(reading.metrics).toHaveProperty("softLimit");
    expect(reading.metrics).toHaveProperty("hardLimit");
  });
});
