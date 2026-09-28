import { describe, expect, it, vi } from "vitest";
import {
  extractAffectedUserIds,
  formatAffectedUsersForText,
  resolveAffectedUsers,
} from "../feedbackAffectedUsers";

describe("feedback affected users", () => {
  it("extracts unique positive integer IDs and keeps the five-user bound", () => {
    expect(
      extractAffectedUserIds({
        affectedUserIds: [
          119,
          119,
          120,
          0,
          -1,
          "121",
          121,
          122,
          123,
          124,
          125,
          126,
        ],
      })
    ).toEqual([119, 120, 121, 122, 123]);
  });

  it("formats email and ID fallbacks for operator-facing text", () => {
    expect(
      formatAffectedUsersForText([
        { id: 119, email: "user119@example.com" },
        { id: 120, email: null },
      ])
    ).toBe("user119@example.com (user #119), user #120");
  });

  it("resolves the reporter by ID even when their current tenant differs", async () => {
    const where = vi.fn().mockResolvedValue([
      { id: 119, email: "user119@example.com" },
    ]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where })),
      })),
    } as any;

    await expect(resolveAffectedUsers(db, [119], "historical-ticket-tenant")).resolves.toEqual([
      { id: 119, email: "user119@example.com" },
    ]);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
