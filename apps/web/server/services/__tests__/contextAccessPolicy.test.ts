import { describe, expect, it, vi } from "vitest";

import {
  assertContextScopeOwnership,
  assertRoomContextAccess,
  canMutateOwnedContextScope,
} from "../contextAccessPolicy";

describe("contextAccessPolicy", () => {
  it("permits explicit room access through the provided checker and denies otherwise", async () => {
    await expect(
      assertRoomContextAccess({
        subject: { userId: 1, role: "member", tenantId: "tenant-1" },
        roomId: "room-1",
        canAccessRoom: vi.fn().mockResolvedValue(true),
      }),
    ).resolves.toBeUndefined();

    await expect(
      assertRoomContextAccess({
        subject: { userId: 1, role: "member", tenantId: "tenant-1" },
        roomId: "room-1",
        canAccessRoom: vi.fn().mockResolvedValue(false),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("only allows mutating owned user context or elevated tenant admins", () => {
    expect(
      canMutateOwnedContextScope(
        { userId: 42, role: "member", tenantId: "tenant-1" },
        { type: "user", id: "42", tenantId: "tenant-1" },
      ),
    ).toBe(true);
    expect(
      canMutateOwnedContextScope(
        { userId: 42, role: "member", tenantId: "tenant-1" },
        { type: "team", id: "team-1", tenantId: "tenant-1" },
      ),
    ).toBe(true);
    expect(() =>
      assertContextScopeOwnership(
        { userId: 42, role: "member", tenantId: "tenant-1" },
        { type: "user", id: "7", tenantId: "tenant-1" },
      ),
    ).toThrowError(/permission/);
  });
});

