import { describe, expect, it } from "vitest";
import { redactShareTokenFromUrl } from "./publicUrlPrivacy";

describe("public page-view URL privacy", () => {
  it("drops query strings and fragments", () => {
    expect(redactShareTokenFromUrl("https://example.test/login?returnUrl=%2Fprivate#secret"))
      .toBe("/login");
  });

  it("redacts bearer tokens before dropping query and fragment data", () => {
    expect(redactShareTokenFromUrl("https://example.test/share/vd/token-secret?x=private#secret"))
      .toBe("/share/vd/[redacted]");
    expect(redactShareTokenFromUrl("https://example.test/share/token-secret?x=private"))
      .toBe("/share/[redacted]");
  });
});
