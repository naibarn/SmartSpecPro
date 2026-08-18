import { describe, expect, it } from "vitest";
import {
  extractAffectedUserIds,
  formatAffectedUsersForText,
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
});
