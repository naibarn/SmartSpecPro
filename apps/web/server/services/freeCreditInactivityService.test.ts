import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockAuditLog } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mockGetDb }));
vi.mock("./auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

import {
  calculateFreeCreditStatus,
  DEFAULT_FREE_CREDIT_INACTIVITY_DAYS,
  enforceFreeCreditPolicyForUser,
} from "./freeCreditInactivityService";

const now = new Date("2026-08-18T00:00:00.000Z");

function makeDb(user: Record<string, unknown>, settingValue = "15") {
  let noticeClaimed = false;
  const txUpdate = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((values: Record<string, unknown>) => ({
      where: vi.fn().mockReturnValue({
        returning: async () => {
          if (values.freeCreditNoticeSentAt) {
            if (noticeClaimed) return [];
            noticeClaimed = true;
            return [{ id: user.id }];
          }
          return [{ id: user.id }];
        },
      }),
    })),
  }));
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          for: vi.fn().mockReturnValue({ limit: async () => [user] }),
        }),
      }),
    }),
    update: txUpdate,
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: async () => [{ value: settingValue }],
        }),
      }),
    }),
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  };
}

function makeUser(overrides: Partial<Parameters<typeof calculateFreeCreditStatus>[0]> = {}) {
  return {
    role: "user",
    isDisabled: false,
    freeCreditGrantedAt: new Date("2026-08-10T00:00:00.000Z"),
    freeCreditPolicyCancelledAt: null,
    freeCreditNoticeSentAt: null,
    lastCreditUsedAt: null,
    ...overrides,
  };
}

describe("free-credit inactivity policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts the window at the first free-credit grant", () => {
    const status = calculateFreeCreditStatus(makeUser(), now);

    expect(status.eligible).toBe(true);
    expect(status.daysRemaining).toBe(7);
    expect(status.deadlineAt).toBe("2026-08-25T00:00:00.000Z");
    expect(status.policyCancelled).toBe(false);
  });

  it("resets the window after later credit usage", () => {
    const status = calculateFreeCreditStatus(
      makeUser({ lastCreditUsedAt: new Date("2026-08-17T00:00:00.000Z") }),
      now,
    );

    expect(status.activityAt).toBe("2026-08-17T00:00:00.000Z");
    expect(status.daysRemaining).toBe(14);
  });

  it("is no longer eligible after a purchase", () => {
    const status = calculateFreeCreditStatus(
      makeUser({ freeCreditPolicyCancelledAt: new Date("2026-08-12T00:00:00.000Z") }),
      now,
    );

    expect(status.eligible).toBe(false);
    expect(status.policyCancelled).toBe(true);
    expect(status.deadlineAt).toBeNull();
  });

  it("excludes administrators and users without a tracked grant", () => {
    expect(
      calculateFreeCreditStatus(makeUser({ role: "admin" }), now).eligible,
    ).toBe(false);
    expect(
      calculateFreeCreditStatus(makeUser({ freeCreditGrantedAt: null }), now).eligible,
    ).toBe(false);
  });

  it("reaches zero days at the exact 15-day deadline", () => {
    const grant = new Date("2026-08-03T00:00:00.000Z");
    const status = calculateFreeCreditStatus(
      makeUser({ freeCreditGrantedAt: grant }),
      now,
      DEFAULT_FREE_CREDIT_INACTIVITY_DAYS,
    );

    expect(status.daysRemaining).toBe(0);
    expect(new Date(status.deadlineAt!).getTime()).toBe(now.getTime());
  });

  it("claims the daily warning only once", async () => {
    const user = {
      id: 42,
      role: "user",
      credits: 100,
      isDisabled: false,
      freeCreditGrantedAt: new Date("2026-08-10T00:00:00.000Z"),
      freeCreditPolicyCancelledAt: null,
      freeCreditNoticeSentAt: null,
      lastCreditUsedAt: null,
    };
    const db = makeDb(user);
    mockGetDb.mockResolvedValue(db);

    const first = await enforceFreeCreditPolicyForUser({
      userId: user.id,
      now,
      claimNotice: true,
    });
    const second = await enforceFreeCreditPolicyForUser({
      userId: user.id,
      now,
      claimNotice: true,
    });

    expect(first.status?.noticeDue).toBe(true);
    expect(second.status?.noticeDue).toBe(false);
  });

  it("resets remaining credits and audits an expired user", async () => {
    const user = {
      id: 43,
      role: "user",
      credits: 125,
      isDisabled: false,
      freeCreditGrantedAt: new Date("2026-08-03T00:00:00.000Z"),
      freeCreditPolicyCancelledAt: null,
      freeCreditNoticeSentAt: null,
      lastCreditUsedAt: null,
    };
    const db = makeDb(user);
    mockGetDb.mockResolvedValue(db);

    const result = await enforceFreeCreditPolicyForUser({
      userId: user.id,
      now,
    });

    expect(result.disabled).toBe(true);
    expect(result.status?.daysRemaining).toBe(0);
    expect(db.transaction).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "user_disabled_inactive",
      userId: user.id,
    }));
  });
});
