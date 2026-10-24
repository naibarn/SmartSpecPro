import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("../db", () => ({ getDb: mocks.getDb }));

import { ensureUserOpenId } from "./userIdentity";

describe("ensureUserOpenId", () => {
  beforeEach(() => mocks.getDb.mockReset());

  it("returns an existing stable identity without touching the database", async () => {
    await expect(ensureUserOpenId({ id: 42, openId: "oauth-user" })).resolves.toBe("oauth-user");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("persists and returns an identity for a legacy nullable user", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    let persistedOpenId = "";
    const limit = vi.fn().mockImplementation(async () => [{ openId: persistedOpenId }]);
    const db = {
      update: () => ({ set: (values: { openId: string }) => {
        persistedOpenId = values.openId;
        return { where };
      } }),
      select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
    };
    mocks.getDb.mockReturnValue(db);

    const result = await ensureUserOpenId({ id: 7, openId: null });

    expect(result).toMatch(/^local_[0-9a-f-]{36}$/);
    expect(where).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledOnce();
  });

  it("fails if a stable identity could not be persisted", async () => {
    const db = {
      update: () => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) }),
      select: () => ({ from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue([]) }) }) }),
    };
    mocks.getDb.mockReturnValue(db);

    await expect(ensureUserOpenId({ id: 7, openId: null })).rejects.toThrow("USER_IDENTITY_OPEN_ID_PERSIST_FAILED");
  });
});
