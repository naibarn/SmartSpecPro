import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { fetchGeoSource, GeoSourceTransportError } from "./fetch";
import type { GeoSourceFetchPolicy } from "./fetchPolicy";

const policy: GeoSourceFetchPolicy = {
  allowedHosts: ["data.example.org", "mirror.example.org"],
  allowedPathPrefixes: ["/api/v1/"],
  maxRedirects: 2,
  allowedContentTypes: ["application/json", "application/geo+json"],
  maxCompressedBytes: 1024,
  maxDecompressedBytes: 4096,
  connectTimeoutMs: 100,
  readTimeoutMs: 100,
  totalTimeoutMs: 500,
};

const jsonResponse = (body = Buffer.from('{"ok":true}')) => ({
  status: 200,
  headers: { "content-type": "application/json; charset=utf-8", "content-encoding": "identity" },
  body,
});

describe("pinned geospatial source transport", () => {
  it("pins each request to policy-validated DNS addresses and returns a bounded decoded body", async () => {
    const requestOnce = vi.fn(async () => jsonResponse());
    const result = await fetchGeoSource("https://data.example.org/api/v1/stations", policy, {
      resolveAddresses: async () => ["8.8.8.8"],
      requestOnce,
    });
    expect(requestOnce).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "data.example.org", addresses: ["8.8.8.8"] }),
      expect.objectContaining({ connectTimeoutMs: 100, readTimeoutMs: 100, totalTimeoutMs: expect.any(Number), maxCompressedBytes: 1024 }),
      expect.any(AbortSignal),
    );
    expect(result).toMatchObject({ status: 200, mediaType: "application/json", finalUrl: "https://data.example.org/api/v1/stations" });
    expect(result.body.toString()).toBe('{"ok":true}');
  });

  it("re-resolves and pins every allowlisted redirect target", async () => {
    const resolveAddresses = vi.fn(async (host: string) => host === "data.example.org" ? ["8.8.8.8"] : ["1.1.1.1"]);
    const requestOnce = vi.fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: "https://mirror.example.org/api/v1/next" }, body: Buffer.alloc(0) })
      .mockResolvedValueOnce(jsonResponse());
    const result = await fetchGeoSource("https://data.example.org/api/v1/start", policy, { resolveAddresses, requestOnce });
    expect(resolveAddresses).toHaveBeenCalledTimes(2);
    expect(requestOnce.mock.calls.map(([target]) => target.addresses)).toEqual([["8.8.8.8"], ["1.1.1.1"]]);
    expect(result.finalUrl).toBe("https://mirror.example.org/api/v1/next");
  });

  it("revalidates redirects and fails closed for disallowed targets, loops, and redirect exhaustion", async () => {
    const resolver = async () => ["8.8.8.8"];
    await expect(fetchGeoSource("https://data.example.org/api/v1/start", policy, {
      resolveAddresses: resolver,
      requestOnce: async () => ({ status: 302, headers: { location: "https://evil.example.org/api/v1/steal" }, body: Buffer.alloc(0) }),
    })).rejects.toMatchObject({ code: "GEO_SOURCE_HOST_FORBIDDEN" });

    await expect(fetchGeoSource("https://data.example.org/api/v1/start", policy, {
      resolveAddresses: resolver,
      requestOnce: async () => ({ status: 302, headers: { location: "https://data.example.org/api/v1/start" }, body: Buffer.alloc(0) }),
    })).rejects.toMatchObject({ code: "GEO_SOURCE_REDIRECT_LOOP" });

    await expect(fetchGeoSource("https://data.example.org/api/v1/start", { ...policy, maxRedirects: 0 }, {
      resolveAddresses: resolver,
      requestOnce: async () => ({ status: 302, headers: { location: "https://data.example.org/api/v1/next" }, body: Buffer.alloc(0) }),
    })).rejects.toMatchObject({ code: "GEO_SOURCE_REDIRECT_LIMIT" });
  });

  it("accepts bounded gzip responses and enforces both compressed and expanded byte limits", async () => {
    const expanded = Buffer.from(`{"message":"${"x".repeat(1_500)}"}`);
    const compressed = gzipSync(Buffer.from('{"message":"fixture"}'));
    const gzipResponse = { status: 200, headers: { "content-type": "application/json", "content-encoding": "gzip" }, body: compressed };
    const result = await fetchGeoSource("https://data.example.org/api/v1/data", policy, {
      resolveAddresses: async () => ["8.8.8.8"], requestOnce: async () => gzipResponse,
    });
    expect(result.body.toString()).toBe('{"message":"fixture"}');

    await expect(fetchGeoSource("https://data.example.org/api/v1/data", { ...policy, maxCompressedBytes: compressed.length - 1 }, {
      resolveAddresses: async () => ["8.8.8.8"], requestOnce: async () => gzipResponse,
    })).rejects.toMatchObject({ code: "GEO_SOURCE_COMPRESSED_SIZE_EXCEEDED" });

    await expect(fetchGeoSource("https://data.example.org/api/v1/data", { ...policy, maxDecompressedBytes: 1_024 }, {
      resolveAddresses: async () => ["8.8.8.8"], requestOnce: async () => ({ ...gzipResponse, body: gzipSync(expanded) }),
    })).rejects.toMatchObject({ code: "GEO_SOURCE_DECOMPRESSED_SIZE_EXCEEDED" });
  });

  it("rejects bad status, content type, unsupported encoding, and malformed compressed data", async () => {
    const run = (response: Awaited<ReturnType<NonNullable<Parameters<typeof fetchGeoSource>[2]>["requestOnce"]>>) =>
      fetchGeoSource("https://data.example.org/api/v1/data", policy, {
        resolveAddresses: async () => ["8.8.8.8"], requestOnce: async () => response,
      });
    await expect(run({ status: 503, headers: { "content-type": "application/json" }, body: Buffer.alloc(0) })).rejects.toMatchObject({ code: "GEO_SOURCE_RESPONSE_STATUS" });
    await expect(run({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.alloc(0) })).rejects.toMatchObject({ code: "GEO_SOURCE_CONTENT_TYPE_FORBIDDEN" });
    await expect(run({ status: 200, headers: { "content-type": "application/json", "content-encoding": "compress" }, body: Buffer.alloc(0) })).rejects.toMatchObject({ code: "GEO_SOURCE_CONTENT_ENCODING_FORBIDDEN" });
    await expect(run({ status: 200, headers: { "content-type": "application/json", "content-encoding": "gzip" }, body: Buffer.from("broken") })).rejects.toMatchObject({ code: "GEO_SOURCE_DECOMPRESSION_FAILED" });
  });

  it("rejects DNS rebinding to private addresses and enforces total timeout", async () => {
    await expect(fetchGeoSource("https://data.example.org/api/v1/data", policy, {
      resolveAddresses: async () => ["127.0.0.1"], requestOnce: async () => jsonResponse(),
    })).rejects.toMatchObject({ code: "GEO_SOURCE_ADDRESS_FORBIDDEN" });
    await expect(fetchGeoSource("https://data.example.org/api/v1/data", { ...policy, connectTimeoutMs: 2, readTimeoutMs: 2, totalTimeoutMs: 5 }, {
      resolveAddresses: async () => ["8.8.8.8"], requestOnce: () => new Promise(() => undefined),
    })).rejects.toMatchObject({ code: "GEO_SOURCE_TIMEOUT" });
  });

  it("does not accept caller-supplied request headers that could forward cookies or credentials", async () => {
    const result = await fetchGeoSource("https://data.example.org/api/v1/data", policy, {
      resolveAddresses: async () => ["8.8.8.8"], requestOnce: async () => jsonResponse(),
    });
    expect(result).not.toHaveProperty("requestHeaders");
    expect(GeoSourceTransportError).toBeTypeOf("function");
  });
});
