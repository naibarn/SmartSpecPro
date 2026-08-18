import { describe, expect, it, vi } from "vitest";

const { mockGetDb, mockAuditLog } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mockGetDb }));
vi.mock("./auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));
vi.mock("./creditService", () => ({
  addCredits: vi.fn(),
}));

import { processInviteCodeUsage } from "./inviteCodeService";

type FakeInviteCode = {
  id: number;
  code: string;
  ownerId: number;
  isActive: boolean;
  currentUses: number;
  maxUses: number | null;
  bonusCreditsForNewUser: number;
  bonusCreditsForOwner: number;
};

function makeCode(overrides: Partial<FakeInviteCode> = {}): FakeInviteCode {
  return {
    id: 5,
    code: "ARWHSU96",
    ownerId: 900,
    isActive: true,
    currentUses: 0,
    maxUses: 10,
    bonusCreditsForNewUser: 500,
    bonusCreditsForOwner: 0,
    ...overrides,
  };
}

function makeTransaction(code: ReturnType<typeof makeCode>, existingUsage: unknown[] = []) {
  const insertValues = vi.fn();
  const updateSets: unknown[] = [];
  const tx = {
    select: vi
      .fn()
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            for: () => ({ limit: async () => [code] }),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({ limit: async () => existingUsage }),
        }),
      })),
    update: vi.fn().mockImplementation(() => ({
      set: (values: unknown) => {
        updateSets.push(values);
        return {
          where: () => ({
            returning: async () => [{ ...code, currentUses: code.currentUses + 1 }],
          }),
        };
      },
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: (values: unknown) => {
        insertValues(values);
        return Promise.resolve();
      },
    })),
  };

  return { tx, insertValues, updateSets };
}

describe("invite code usage accounting", () => {
  it("increments the quota and records a pending usage row once", async () => {
    const code = makeCode();
    const { tx, insertValues } = makeTransaction(code);
    mockGetDb.mockResolvedValue({
      transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    });

    const result = await processInviteCodeUsage(5, 123);

    expect(result).toEqual({ success: true });
    expect(tx.update).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith({
      inviteCodeId: 5,
      registeredUserId: 123,
      creditsGivenToUser: 0,
      creditsGivenToOwner: 0,
    });
  });

  it("does not consume another quota slot on a retried callback", async () => {
    const code = makeCode({ currentUses: 1 });
    const { tx, insertValues } = makeTransaction(code, [{ id: 77 }]);
    mockGetDb.mockResolvedValue({
      transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    });

    const result = await processInviteCodeUsage(5, 123);

    expect(result).toEqual({ success: true });
    expect(tx.update).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });
});
