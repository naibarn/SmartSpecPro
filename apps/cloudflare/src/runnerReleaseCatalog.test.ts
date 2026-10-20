import { describe, expect, it, vi } from "vitest";
import { handleRunnerReleaseCatalog, readPublicRunnerReleaseCatalog } from "./runnerReleaseCatalog";
import { runnerReleaseCatalogResponseSchema } from "../../../packages/shared/src/runnerReleases";
import type { HyperdriveSqlClient } from "./hyperdrive";

function releaseRow(changes: Record<string, unknown> = {}) {
  return { id: 1, version: "1.9.0", platform: "linux", architecture: "x64", profile: "local_device", channel: "stable",
    assetKind: "package", fileName: "runner.zip", contentType: "application/zip", fileSizeBytes: "100", fileSha256: "a".repeat(64),
    signature: null, contractVersion: "sah-runner-v1", manifestJson: null, validationStatus: "valid", validationChecksJson: [],
    provenanceJson: { sourceCommit: "b".repeat(40), workflowRunId: null, releaseTag: null, signatureAlgorithm: null },
    releaseNotes: null, isPublished: true, publishedAt: new Date("2026-10-20T00:00:00Z"), withdrawnAt: null,
    uploadedAt: new Date("2026-10-19T00:00:00Z"), updatedAt: new Date("2026-10-20T00:00:00Z"), storageKey: "private/internal/key", uploadedBy: 999, ...changes };
}
const env = () => ({ CLOUDFLARE_RUNNER_RELEASE_CATALOG: "hyperdrive", CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT: new Date(Date.now()+60_000).toISOString(), HYPERDRIVE: { connectionString: "postgres://fixture" } });
const request = (path = "") => new Request("https://smartaihub.app/api/runner-releases" + path);

describe("native public Runner release catalog", () => {
  it("preserves public schema, per-target semantic version choice and separate package/update selection", async () => {
    const sql = { unsafe: vi.fn(async () => [releaseRow(), releaseRow({ id: 2, version: "1.10.0" }), releaseRow({ id: 3, version: "1.11.0", assetKind: "update_binary" })]) };
    const result = await readPublicRunnerReleaseCatalog(sql as unknown as HyperdriveSqlClient, { channel: "stable" });
    expect(runnerReleaseCatalogResponseSchema.parse(result)).toEqual(result);
    expect(result.latestByTarget[0]).toMatchObject({ version: "1.11.0", package: { id: 2 }, updateBinary: { id: 3 } });
    expect(JSON.stringify(result)).not.toContain("private/internal/key"); expect(JSON.stringify(result)).not.toContain("uploadedBy");
  });
  it("reads in a bounded read-only transaction with parameterized filters and no Hyperdrive result cache", async () => {
    const calls: [string, readonly unknown[] | undefined][] = [];
    const sql = { unsafe: vi.fn(async (query, parameters) => { calls.push([query, parameters]); return query.startsWith("SELECT") ? [releaseRow()] : []; }) };
    sql.begin = vi.fn(async callback => callback(sql));
    const result = await handleRunnerReleaseCatalog(request("?platform=linux&architecture=x64&profile=local_device"), env(), { withDatabase: async (_, work) => work(sql as never) });
    expect(result.status).toBe(200); expect(sql.begin).toHaveBeenCalledOnce();
    expect(calls.some(([query]) => query.includes("SET TRANSACTION READ ONLY"))).toBe(true);
    expect(calls.some(([query]) => query.includes("statement_timeout"))).toBe(true);
    const [query, values] = calls.find(([query]) => query.startsWith("SELECT"))!;
    expect(query).toContain('"isPublished" = true'); expect(query).toContain('"withdrawnAt" IS NULL');
    expect(query).toContain('"validationStatus" = \'valid\''); expect(values).toEqual(["stable", "linux", "x64", "local_device"]);
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it("uses the latest contract and default stable channel; HEAD has no response body", async () => {
    const withDatabase = vi.fn(async (_, work) => work({ begin: async callback => callback({ unsafe: async query => query.startsWith("SELECT") ? [releaseRow()] : [] }) }));
    const response = await handleRunnerReleaseCatalog(request("/latest?platform=linux&architecture=x64&profile=local_device"), env(), { withDatabase });
    expect(await response.json()).toMatchObject({ package: { id: 1 }, updateBinary: null });
    const head = await handleRunnerReleaseCatalog(new Request(request().url, { method: "HEAD" }), env(), { withDatabase });
    expect(head.status).toBe(200); expect(await head.text()).toBe("");
  });
  it.each(["?platform=bogus", "?platform=linux&platform=windows", "/latest", "?channel=stable&channel=beta", "?profile=shared_container%27%3Bselect"])("rejects malformed/ambiguous query before opening sockets: %s", async suffix => {
    const withDatabase = vi.fn(); const response = await handleRunnerReleaseCatalog(request(suffix), env(), { withDatabase });
    expect(response.status).toBe(400); expect(withDatabase).not.toHaveBeenCalled();
  });
  it.each([{}, { CLOUDFLARE_RUNNER_RELEASE_CATALOG: "other" }, { ...env(), CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT: "invalid" }, { ...env(), CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT: "2020-01-01T00:00:00Z" }, { ...env(), HYPERDRIVE: undefined }])("fails closed for missing or expired capability", async configuration => {
    const withDatabase = vi.fn(); const response = await handleRunnerReleaseCatalog(request(), configuration, { withDatabase });
    expect(response.status).toBe(503); expect(withDatabase).not.toHaveBeenCalled();
  });
  it("denies an expired read window even when the database query succeeded", async () => {
    const start = Date.now(), configuration = env();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(start);
    try {
      const response = await handleRunnerReleaseCatalog(request(), configuration, { withDatabase: async () => {
        vi.setSystemTime(start+120_000); return { generatedAt: new Date().toISOString(), releases: [], latestByTarget: [] };
      } });
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "runner_release_catalog_unavailable" });
    } finally { vi.useRealTimers(); }
  });
  it("redacts database errors and does not fall back to the origin", async () => {
    const response = await handleRunnerReleaseCatalog(request(), env(), { withDatabase: async () => { throw new Error("postgres://secret@private"); } });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
  });
  it("rejects a malformed/private row even if an adapter incorrectly returns it", async () => {
    const sql = { unsafe: async () => [releaseRow({ isPublished: false })] };
    await expect(readPublicRunnerReleaseCatalog(sql as never, { channel: "stable" })).rejects.toThrow();
  });
});

describe("native catalog routing isolation", () => {
  it("preserves the origin route by default and executes native only under explicit capability", async () => {
    const { dispatchManifestRoute } = await import("./nativeApi"), originProxy = vi.fn(async () => new Response("origin"));
    const nativeFetch = vi.fn(async () => new Response("native"));
    for (const suffix of ["", "/latest"]) {
      expect(await (await dispatchManifestRoute(request(suffix), {}, { originProxy, nativeFetch }))!.text()).toBe("origin");
      expect(await (await dispatchManifestRoute(request(suffix), env(), { originProxy, nativeFetch }))!.text()).toBe("native");
    }
    expect(originProxy).toHaveBeenCalledTimes(2); expect(nativeFetch).toHaveBeenCalledTimes(2);
  });
  it("rejects an injected invalid native flag without any origin fallback", async () => {
    const { dispatchManifestRoute } = await import("./nativeApi"), originProxy = vi.fn();
    const response = await dispatchManifestRoute(request(), { CLOUDFLARE_RUNNER_RELEASE_CATALOG: "other" }, { originProxy });
    expect(response!.status).toBe(503); expect(originProxy).not.toHaveBeenCalled();
  });
  it("keeps download, admin, desktop-review and POST at the original authority", async () => {
    const { dispatchManifestRoute } = await import("./nativeApi"), originProxy = vi.fn(async () => new Response("origin")), nativeFetch = vi.fn();
    for (const suffix of ["/1/download", "/admin/assets", "/desktop-review", "/latest/extra"]) {
      const response = await dispatchManifestRoute(request(suffix), env(), { originProxy, nativeFetch });
      expect(await response!.text()).toBe("origin");
    }
    await dispatchManifestRoute(new Request(request().url, { method: "POST" }), env(), { originProxy, nativeFetch });
    expect(originProxy).toHaveBeenCalledTimes(5); expect(nativeFetch).not.toHaveBeenCalled();
  });
});
