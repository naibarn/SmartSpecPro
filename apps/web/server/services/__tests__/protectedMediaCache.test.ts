import { describe, expect, it } from "vitest";
import {
  getProtectedMediaEtag,
  matchesIfNoneMatch,
  PROTECTED_MEDIA_CACHE_CONTROL,
} from "../protectedMediaCache";

describe("protected media cache validators", () => {
  it("uses storage metadata for a stable fallback ETag", () => {
    expect(
      getProtectedMediaEtag({
        contentLength: 42,
        lastModified: new Date("2026-08-17T00:00:00.000Z"),
      })
    ).toBe(`W/"42-${new Date("2026-08-17T00:00:00.000Z").getTime()}"`);
  });

  it("preserves a provider ETag and matches weak/strong forms", () => {
    expect(getProtectedMediaEtag({ etag: `"r2-version-1"` })).toBe(
      `"r2-version-1"`
    );
    expect(matchesIfNoneMatch(`W/"r2-version-1"`, `"r2-version-1"`)).toBe(true);
    expect(matchesIfNoneMatch(`"other"`, `"r2-version-1"`)).toBe(false);
  });

  it("allows wildcard revalidation without making the response public", () => {
    expect(matchesIfNoneMatch("*", `W/"version"`)).toBe(true);
    expect(PROTECTED_MEDIA_CACHE_CONTROL).toBe(
      "private, max-age=60, must-revalidate"
    );
  });
});
