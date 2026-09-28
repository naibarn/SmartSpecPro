import { beforeEach, describe, expect, it, vi } from "vitest";

const creditOwner = vi.hoisted(() => ({
  reservation: null as unknown,
  read: vi.fn(),
  draw: vi.fn(),
}));

vi.mock("../../creditService", () => ({
  getCreditReservationSnapshot: (...args: unknown[]) => creditOwner.read(...args),
  drawFromReservation: (...args: unknown[]) => creditOwner.draw(...args),
}));

import {
  createCreditReservationSettlement,
  inferenceCostMicrosToCreditUnits,
} from "../creditReservationAuthority";
import type { CreditReservation } from "../../creditService";

const reservation: CreditReservation = {
  reservationId: "reservation-1",
  userId: 7,
  reservedAmount: 10,
  drawnAmount: 0,
  transactionId: 42,
  sourceType: "chat",
  tenantId: "tenant-1",
  createdAt: "2026-09-27T10:00:00.000Z",
  expiresAt: "2026-09-27T10:10:00.000Z",
};

describe("Spec 231 credit owner settlement adapter", () => {
  beforeEach(() => {
    const activeReservation = {
      ...reservation,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
    creditOwner.reservation = activeReservation;
    creditOwner.read.mockReset().mockResolvedValue(activeReservation);
    creditOwner.draw.mockReset().mockResolvedValue({ drawn: 1, remaining: 9 });
  });

  it("settles measured USD micros through the existing owner with attempt idempotency", async () => {
    const settle = createCreditReservationSettlement({
      expectedUserId: 7,
      expectedTenantId: "tenant-1",
      trustedPrincipalRef: "user:7",
    });

    await expect(settle({
      reservationId: "reservation-1",
      settlementKey: "attempt-1",
      chargedCostMicros: 1_001,
    })).resolves.toBe(true);
    expect(creditOwner.read).toHaveBeenCalledWith("reservation-1");
    expect(creditOwner.draw).toHaveBeenCalledWith(
      "reservation-1",
      2,
      "Spec 231 inference attempt settlement",
      "attempt-1",
    );
  });

  it("preserves the existing one-credit minimum for zero-cost user LLM calls", async () => {
    expect(inferenceCostMicrosToCreditUnits(0)).toBe(1);
    expect(inferenceCostMicrosToCreditUnits(1_000)).toBe(1);
    expect(inferenceCostMicrosToCreditUnits(1_001)).toBe(2);

    const settle = createCreditReservationSettlement({
      expectedUserId: 7,
      expectedTenantId: "tenant-1",
      trustedPrincipalRef: "user:7",
    });
    await expect(settle({
      reservationId: "reservation-1",
      settlementKey: "free-provider-attempt",
      chargedCostMicros: 0,
    })).resolves.toBe(true);
    expect(creditOwner.draw).toHaveBeenCalledWith(
      "reservation-1",
      1,
      "Spec 231 inference attempt settlement",
      "free-provider-attempt",
    );
  });

  it("fails closed on cross-tenant reservations without drawing credits", async () => {
    creditOwner.read.mockResolvedValue({ ...reservation, tenantId: "tenant-2" });
    const settle = createCreditReservationSettlement({
      expectedUserId: 7,
      expectedTenantId: "tenant-1",
      trustedPrincipalRef: "user:7",
    });

    await expect(settle({
      reservationId: "reservation-1",
      settlementKey: "attempt-1",
      chargedCostMicros: 1_000,
    })).resolves.toBe(false);
    expect(creditOwner.draw).not.toHaveBeenCalled();
  });

  it("fails closed when the owner read or idempotent draw fails", async () => {
    const settle = createCreditReservationSettlement({
      expectedUserId: 7,
      expectedTenantId: "tenant-1",
      trustedPrincipalRef: "user:7",
    });
    creditOwner.read.mockRejectedValueOnce(new Error("owner unavailable"));
    await expect(settle({
      reservationId: "reservation-1",
      settlementKey: "attempt-1",
      chargedCostMicros: 100,
    })).resolves.toBe(false);

    creditOwner.draw.mockRejectedValueOnce(new Error("budget exceeded"));
    await expect(settle({
      reservationId: "reservation-1",
      settlementKey: "attempt-2",
      chargedCostMicros: 100,
    })).resolves.toBe(false);
  });
});
