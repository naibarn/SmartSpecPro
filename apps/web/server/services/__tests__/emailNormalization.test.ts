import { describe, expect, it } from "vitest";

import { authEmailSchema, normalizeAuthEmail } from "../emailNormalization";

describe("auth email normalization", () => {
  it("trims and lowercases email values without changing provider-specific aliases", () => {
    expect(normalizeAuthEmail("  User.Name+tag@Gmail.COM  ")).toBe(
      "user.name+tag@gmail.com"
    );
  });

  it("accepts surrounding whitespace after canonicalization", () => {
    expect(authEmailSchema.parse("  User@Example.COM ")).toBe(
      "user@example.com"
    );
  });

  it("rejects values that are not valid email addresses", () => {
    expect(() => authEmailSchema.parse("not-an-email")).toThrow();
  });
});
