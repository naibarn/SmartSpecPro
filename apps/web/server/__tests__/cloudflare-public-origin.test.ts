import { describe, expect, it } from "vitest";
import { parseCloudflarePublicOrigin, parseCloudflarePublicOrigins } from "../../../../packages/shared/src/cloudflareOrigin";

describe("shared attested public-origin contract", () => {
  it.each(["https://smartaihub.app", "https://staging.account.workers.dev", "https://tenant.example:8443"])("accepts exact HTTPS origin %s", value => {
    expect(parseCloudflarePublicOrigin(value)?.origin).toBe(value);
  });
  it.each([
    "http://smartaihub.app", "https://smartaihub.app/", "https://smartaihub.app/path",
    "https://smartaihub.app?query=1", "https://smartaihub.app#hash", "https://user:password@smartaihub.app",
    "https://SMARTAIHUB.app", "https://smartaihub.app:443", "https://*.smartaihub.app",
    "https://localhost", "https://host.docker.internal", "https://127.0.0.1", "https://[::1]",
    "https://smartaihub.app,https://evil.invalid", " https://smartaihub.app", "not-a-url",
  ])("rejects ambiguous, wildcard, local or non-origin value %s", value => {
    expect(parseCloudflarePublicOrigin(value)).toBeNull();
  });
  it("requires a bounded explicit JSON allowlist", () => {
    for (const raw of [undefined, "", "[]", "{}", '"https://smartaihub.app"', '["https://*.smartaihub.app"]', JSON.stringify(Array(33).fill("https://smartaihub.app"))]) {
      expect(parseCloudflarePublicOrigins(raw)).toBeNull();
    }
    expect(parseCloudflarePublicOrigins('["https://smartaihub.app","https://smartaihub.app"]')).toEqual(["https://smartaihub.app"]);
  });
});
