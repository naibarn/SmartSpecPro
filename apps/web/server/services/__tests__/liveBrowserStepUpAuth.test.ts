import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const selectedRows: Array<Record<string, unknown>> = [];
const updatePayloads: Array<Record<string, unknown>> = [];

const mockWhere = vi.fn(async () => selectedRows);
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockUpdateWhere = vi.fn(async () => undefined);
const mockSet = vi.fn((payload: Record<string, unknown>) => {
  updatePayloads.push(payload);
  return { where: mockUpdateWhere };
});
const mockUpdate = vi.fn(() => ({ set: mockSet }));
const mockGetDb = vi.fn(async () => ({
  select: mockSelect,
  update: mockUpdate,
}));
const mockEq = vi.fn(() => Symbol("eq"));
const mockDecryptSecret = vi.fn(() => "totp-secret");
const mockVerifyTotp = vi.fn(() => false);
const mockBcryptCompare = vi.fn(async () => false);

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../../drizzle/schema", () => ({
  users: {
    id: "id",
    twoFactorEnabled: "twoFactorEnabled",
    twoFactorSecret: "twoFactorSecret",
    recoveryCodes: "recoveryCodes",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: mockEq,
}));

vi.mock("../totpService", () => ({
  decryptSecret: mockDecryptSecret,
  verifyTotp: mockVerifyTotp,
}));

vi.mock("bcrypt", () => ({
  compare: mockBcryptCompare,
}));

import { verifyLiveBrowserTakeoverMfa } from "../liveBrowserStepUpAuth";

describe("verifyLiveBrowserTakeoverMfa", () => {
  beforeEach(() => {
    selectedRows.length = 0;
    updatePayloads.length = 0;
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({
      select: mockSelect,
      update: mockUpdate,
    });
  });

  const ctx = {
    user: { id: 7 },
  } as any;

  it("accepts a valid TOTP code for an MFA-enabled user", async () => {
    selectedRows.push({
      id: 7,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted-secret",
      recoveryCodes: [],
    });
    mockVerifyTotp.mockReturnValue(true);

    const verifiedAt = await verifyLiveBrowserTakeoverMfa(ctx, "123456");

    expect(typeof verifiedAt).toBe("string");
    expect(mockDecryptSecret).toHaveBeenCalledWith("encrypted-secret");
    expect(mockVerifyTotp).toHaveBeenCalledWith("totp-secret", "123456");
    expect(updatePayloads).toHaveLength(0);
  });

  it("accepts a recovery code and consumes it", async () => {
    selectedRows.push({
      id: 7,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted-secret",
      recoveryCodes: ["hash-1", "hash-2"],
    });
    mockVerifyTotp.mockReturnValue(false);
    mockBcryptCompare
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await verifyLiveBrowserTakeoverMfa(ctx, "reco-1234");

    expect(mockBcryptCompare).toHaveBeenCalledTimes(2);
    expect(updatePayloads).toEqual([{ recoveryCodes: ["hash-1"] }]);
  });

  it("rejects invalid MFA codes", async () => {
    selectedRows.push({
      id: 7,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted-secret",
      recoveryCodes: ["hash-1"],
    });
    mockVerifyTotp.mockReturnValue(false);
    mockBcryptCompare.mockResolvedValue(false);

    await expect(verifyLiveBrowserTakeoverMfa(ctx, "bad-code")).rejects.toMatchObject<Partial<TRPCError>>({
      message: "Invalid MFA or recovery code for Live Browser takeover.",
    });
  });
});
