import { describe, expect, it } from "vitest";
import { evaluateGeoSourceRedirect, evaluateGeoSourceResponse, resolveGeoSourceTarget, redactGeoSourceDiagnostic, validateGeoSourceFetchPolicy } from "./fetchPolicy";

const policy = {
  allowedHosts: ["data.example.org"], allowedPathPrefixes: ["/v1/"], maxRedirects: 2,
  allowedContentTypes: ["application/json", "application/geo+json"], maxCompressedBytes: 1024,
  maxDecompressedBytes: 4096, connectTimeoutMs: 1_000, readTimeoutMs: 2_000, totalTimeoutMs: 3_000,
};

const resolver = async (hostname: string) => hostname === "data.example.org" ? ["203.0.114.20"] : ["127.0.0.1"];

describe("geo source fetch policy", () => {
  it("requires HTTPS, an allowlisted host/path, a safe port, and resolver-approved public addresses", async () => {
    await expect(resolveGeoSourceTarget("https://data.example.org/v1/stations", policy, resolver)).resolves.toMatchObject({ hostname: "data.example.org", addresses: ["203.0.114.20"] });
    await expect(resolveGeoSourceTarget("http://data.example.org/v1/stations", policy, resolver)).rejects.toThrow("GEO_SOURCE_HTTPS_REQUIRED");
    await expect(resolveGeoSourceTarget("https://user:secret@data.example.org/v1/stations", policy, resolver)).rejects.toThrow("GEO_SOURCE_CREDENTIALS_FORBIDDEN");
    await expect(resolveGeoSourceTarget("https://data.example.org/other", policy, resolver)).rejects.toThrow("GEO_SOURCE_PATH_FORBIDDEN");
    await expect(resolveGeoSourceTarget("https://data.example.org:8443/v1/stations", policy, resolver)).rejects.toThrow("GEO_SOURCE_PORT_FORBIDDEN");
    await expect(resolveGeoSourceTarget("https://other.example.org/v1/stations", policy, resolver)).rejects.toThrow("GEO_SOURCE_HOST_FORBIDDEN");
    await expect(resolveGeoSourceTarget("https://data.example.org/v1evil/stations", { ...policy, allowedPathPrefixes: ["/v1"] }, resolver)).rejects.toThrow("GEO_SOURCE_PATH_FORBIDDEN");
    await expect(resolveGeoSourceTarget("https://data.example.org/v1/%252e%252e/admin", policy, resolver)).rejects.toThrow("GEO_SOURCE_PATH_FORBIDDEN");
    await expect(resolveGeoSourceTarget("https://data.example.org/v1/stations", policy, async () => { throw new Error("resolver detail must not escape"); })).rejects.toThrow("GEO_SOURCE_DNS_FAILURE");
    const resolved = await resolveGeoSourceTarget("https://data.example.org/v1/stations", policy, resolver);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.addresses)).toBe(true);
  });

  it("rejects unbounded or contradictory timeout, byte, type, and redirect policy configuration", () => {
    expect(() => validateGeoSourceFetchPolicy({ ...policy, maxRedirects: 6 })).toThrow("GEO_SOURCE_POLICY_INVALID");
    expect(() => validateGeoSourceFetchPolicy({ ...policy, maxCompressedBytes: 0 })).toThrow("GEO_SOURCE_POLICY_INVALID");
    expect(() => validateGeoSourceFetchPolicy({ ...policy, totalTimeoutMs: 500 })).toThrow("GEO_SOURCE_POLICY_INVALID");
    expect(() => validateGeoSourceFetchPolicy({ ...policy, allowedContentTypes: ["*/*"] })).toThrow("GEO_SOURCE_POLICY_INVALID");
  });

  it("rejects loopback, private, link-local, multicast and documentation ranges after DNS resolution", async () => {
    for (const address of ["127.0.0.1", "0177.0.0.1", "10.1.2.3", "169.254.1.1", "224.0.0.1", "::1", "fe80::1", "fc00::1", "2001:db8::1", "::ffff:7f00:1", "::ffff:127.0.0.1", "3fff::1", "2002:0808:0808::1", "64:ff9b::0808:0808", "64:ff9b:1::0808:0808"]) {
      await expect(resolveGeoSourceTarget("https://data.example.org/v1/stations", policy, async () => [address])).rejects.toThrow("GEO_SOURCE_ADDRESS_FORBIDDEN");
    }
    await expect(resolveGeoSourceTarget("https://data.example.org/v1/stations", policy, async () => undefined as unknown as readonly string[])).rejects.toThrow("GEO_SOURCE_DNS_EMPTY");
    await expect(resolveGeoSourceTarget("https://data.example.org/v1/stations", policy, async () => ["not-an-ip"])).rejects.toThrow("GEO_SOURCE_ADDRESS_FORBIDDEN");
  });

  it("revalidates every redirect against the same resolver and redirect budget", async () => {
    await expect(evaluateGeoSourceRedirect({ location: "https://data.example.org/v1/next", redirectCount: 1, policy, resolver })).resolves.toMatchObject({ hostname: "data.example.org" });
    await expect(evaluateGeoSourceRedirect({ location: "https://data.example.org/v1/next", redirectCount: 2, policy, resolver })).rejects.toThrow("GEO_SOURCE_REDIRECT_LIMIT");
    await expect(evaluateGeoSourceRedirect({ location: "https://bad.example.org/v1/next", redirectCount: 0, policy, resolver })).rejects.toThrow("GEO_SOURCE_HOST_FORBIDDEN");
  });

  it("enforces response status, media type, and compressed/decompressed byte caps", () => {
    expect(evaluateGeoSourceResponse({ status: 200, contentType: "application/geo+json; charset=utf-8", compressedBytes: 100, decompressedBytes: 500 }, policy)).toEqual({ ok: true, mediaType: "application/geo+json" });
    expect(evaluateGeoSourceResponse({ status: 500, contentType: "application/json", compressedBytes: 100, decompressedBytes: 100 }, policy)).toMatchObject({ ok: false, code: "GEO_SOURCE_RESPONSE_STATUS" });
    expect(evaluateGeoSourceResponse({ status: 200, contentType: "text/html", compressedBytes: 100, decompressedBytes: 100 }, policy)).toMatchObject({ ok: false, code: "GEO_SOURCE_CONTENT_TYPE_FORBIDDEN" });
    expect(evaluateGeoSourceResponse({ status: 200, contentType: "application/json", compressedBytes: 1025, decompressedBytes: 100 }, policy)).toMatchObject({ ok: false, code: "GEO_SOURCE_COMPRESSED_SIZE_EXCEEDED" });
    expect(evaluateGeoSourceResponse({ status: 200, contentType: "application/json", compressedBytes: 100, decompressedBytes: 4097 }, policy)).toMatchObject({ ok: false, code: "GEO_SOURCE_DECOMPRESSED_SIZE_EXCEEDED" });
  });

  it("redacts query secrets, authorization credentials, and payload excerpts in diagnostics", () => {
    expect(redactGeoSourceDiagnostic("GET https://data.example.org/v1/a?api_key=secret Authorization: Bearer abcdef payload=private-data")).toBe("GET https://data.example.org/v1/a?[REDACTED] Authorization: [REDACTED] payload=[REDACTED]");
    expect(redactGeoSourceDiagnostic("GET https://user:secret@data.example.org/v1/a Authorization: Bearer abc")).toBe("GET https://[REDACTED]@data.example.org/v1/a Authorization: [REDACTED]");
  });
});
