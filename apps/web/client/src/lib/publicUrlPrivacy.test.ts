import { describe, expect, it } from "vitest";
import { getSafePublicPageViewPath, redactShareTokenFromUrl } from "./publicUrlPrivacy";

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

  it("tracks only known public routes without forwarding query parameters", () => {
    expect(getSafePublicPageViewPath("https://smartaihub.app/features?tenantId=private"))
      .toBe("/features");
    expect(getSafePublicPageViewPath("https://smartaihub.app/blog/private-customer-slug"))
      .toBe("/blog/[slug]");
    expect(getSafePublicPageViewPath("https://smartaihub.app/marketplace/product-id-123"))
      .toBe("/marketplace/[listing]");
  });

  it.each([
    "https://smartaihub.app/login?returnUrl=%2Fprivate",
    "https://smartaihub.app/share/vd/token-secret",
    "https://smartaihub.app/drama-series/private-series-id",
    "https://smartaihub.app/tenant/private-tenant-id",
    "https://smartaihub.app/marketplace/auto-review",
    "https://smartaihub.app/marketplace/auto-review/private-case-id",
  ])("does not track private or tokenized page route %s", (href) => {
    expect(getSafePublicPageViewPath(href)).toBeNull();
  });
});
