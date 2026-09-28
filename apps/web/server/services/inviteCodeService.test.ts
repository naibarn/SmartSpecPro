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

import {
  checkRegistrationAllowed,
  getRegistrationMode,
  processInviteCodeUsage,
} from "./inviteCodeService";

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

function makeSettingsDb(value?: string, inviteRows: unknown[] = []) {
  let selectCount = 0;
  return {
    select: vi.fn(() => {
      selectCount += 1;
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(
              selectCount === 1
                ? value === undefined
                  ? []
                  : [{ value }]
                : inviteRows,
            ),
          })),
        })),
      };
    }),
  };
}

describe("registration mode admission", () => {
  it("defaults to Open Registration when the setting is absent", async () => {
    mockGetDb.mockResolvedValue(makeSettingsDb());

    await expect(getRegistrationMode()).resolves.toBe("open");
  });

  it("fails closed for an invalid registration mode value", async () => {
    mockGetDb.mockResolvedValue(makeSettingsDb("unexpected"));

    await expect(getRegistrationMode()).resolves.toBe("invite_only");
  });

  it("allows registration without a code in Open Registration", async () => {
    mockGetDb.mockResolvedValue(makeSettingsDb("open"));

    await expect(checkRegistrationAllowed()).resolves.toMatchObject({ allowed: true });
  });

  it("does not block Open Registration when an optional code is invalid", async () => {
    mockGetDb.mockResolvedValue(makeSettingsDb("open"));

    await expect(checkRegistrationAllowed("NOT-A-REAL-CODE")).resolves.toEqual({
      allowed: true,
    });
  });

  it("requires a code in Invite Only mode", async () => {
    mockGetDb.mockResolvedValue(makeSettingsDb("invite_only"));

    await expect(checkRegistrationAllowed()).resolves.toEqual({
      allowed: false,
      error: "Registration requires an invite code",
    });
  });

  it("accepts Invite Only only with a valid invite code", async () => {
    mockGetDb.mockResolvedValue(makeSettingsDb("invite_only", [makeCode()]));

    await expect(checkRegistrationAllowed("ARWHSU96")).resolves.toMatchObject({
      allowed: true,
      codeId: 5,
    });
  });

  it("fails closed when the registration setting cannot be read", async () => {
    mockGetDb.mockResolvedValue(null);

    await expect(getRegistrationMode()).resolves.toBe("invite_only");
    await expect(checkRegistrationAllowed()).resolves.toEqual({
      allowed: false,
      error: "Registration requires an invite code",
    });
  });
});
