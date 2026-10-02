import { afterEach, describe, expect, it, vi } from "vitest";
import { combineCloudflarePermissionCatalogs, fetchCloudflarePermissionGroups, fetchCloudflareUserPermissionGroups, probeCloudflareServiceCatalog, probeCloudflareZoneServiceCatalog } from "../cloudflareCredentialCenter";
import { CLOUDFLARE_PROBE_SERVICES, CLOUDFLARE_ZONE_PROBE_SERVICES } from "../../../shared/cloudflareCredentialCatalog";

describe("Cloudflare permission group catalog probe", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads and sanitizes the live account permission catalog with a read-only request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: [
        { id: "perm-1", name: "Workers Scripts Read", category: "developer_platform", scopes: ["com.cloudflare.api.account"], description: "Read workers", is_selectable: true },
        { id: "perm-2", name: "DNS Write", category: "dns_and_zones", scopes: ["com.cloudflare.api.account.zone"], token: "must-not-leak", is_selectable: false },
      ],
      result_info: { total_count: 2, page: 1, per_page: 100 },
    }), { status: 200 }));

    const result = await fetchCloudflarePermissionGroups("secret-token", "account-123", fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-123/tokens/permission_groups?page=1&per_page=100",
      expect.objectContaining({ method: "GET", headers: { Authorization: "Bearer secret-token" } }),
    );
    expect(result.status).toBe("granted");
    expect(result.groups).toEqual([
      { id: "perm-1", name: "Workers Scripts Read", category: "developer_platform", scopes: ["com.cloudflare.api.account"], description: "Read workers", selectable: true },
      { id: "perm-2", name: "DNS Write", category: "dns_and_zones", scopes: ["com.cloudflare.api.account.zone"], description: "", selectable: false },
    ]);
    expect(result.complete).toBe(true);
    expect(result.totalCount).toBe(2);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("loads the separate user-scope permission catalog from the documented endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: [{ id: "container-read", name: "Containers Read", scopes: ["com.cloudflare.api.user"] }] }), { status: 200 }));
    const result = await fetchCloudflareUserPermissionGroups("secret-token", fetchMock);
    expect(fetchMock).toHaveBeenCalledWith("https://api.cloudflare.com/client/v4/user/tokens/permission_groups?page=1&per_page=100", expect.objectContaining({ method: "GET" }));
    expect(result.groups[0]).toMatchObject({ id: "container-read", name: "Containers Read", scopes: ["com.cloudflare.api.user"] });
    expect(result.complete).toBe(true);
  });

  it("marks merged catalog partial when one permission scope is not readable", async () => {
    const account = await fetchCloudflarePermissionGroups("secret-token", "account-123", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: [{ id: "account-perm", name: "Queues Read" }] }), { status: 200 })));
    const user = await fetchCloudflareUserPermissionGroups("secret-token", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 403 })));
    const result = combineCloudflarePermissionCatalogs(account, user);
    expect(result.status).toBe("partial");
    expect(result.complete).toBe(false);
    expect(result.sources.map((source) => [source.scope, source.status])).toEqual([["account", "granted"], ["user", "missing_permission"]]);
    expect(result.groups.map((group) => group.name)).toEqual(["Queues Read"]);
  });

  it.each([
    [401, "invalid_token"],
    [403, "missing_permission"],
    [404, "resource_not_found"],
    [429, "rate_limited"],
    [503, "unavailable"],
  ] as const)("classifies HTTP %i as %s", async (status, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, result: [] }), { status }));
    const result = await fetchCloudflarePermissionGroups("secret-token", "account-123", fetchMock);
    expect(result.status).toBe(expected);
    expect(result.groups).toEqual([]);
  });

  it("does not treat an invalid request as proof of a missing permission", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ code: 1000, message: "bad request" }] }), { status: 400 }));
    const result = await fetchCloudflarePermissionGroups("secret-token", "account-123", fetchMock);
    expect(result.status).toBe("unsupported_or_invalid_request");
  });

  it("does not mark an unparseable or failed paginated response as a complete catalog", async () => {
    const malformed = vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }));
    const malformedResult = await fetchCloudflarePermissionGroups("secret-token", "account-123", malformed);
    expect(malformedResult.status).toBe("unavailable");
    expect(malformedResult.complete).toBe(false);

    const pageFailure = vi.fn().mockImplementation((url: string) => {
      const pageNumber = Number(new URL(url).searchParams.get("page"));
      if (pageNumber === 1) return Promise.resolve(new Response(JSON.stringify({ success: true, result: [{ id: "p1", name: "P1" }], result_info: { total_count: 2, per_page: 1 } }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 403 }));
    });
    const failedPageResult = await fetchCloudflarePermissionGroups("secret-token", "account-123", pageFailure);
    expect(failedPageResult.status).toBe("missing_permission");
    expect(failedPageResult.complete).toBe(false);
    expect(failedPageResult.groups).toHaveLength(1);
  });

  it("probes every declared SmartAIHub account integration through GET endpoints only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: [] }), { status: 200 }));
    const results = await probeCloudflareServiceCatalog("secret-token", "account-123", fetchMock);

    expect(results.map((result) => result.id).sort()).toEqual(CLOUDFLARE_PROBE_SERVICES.map((service) => service.id).sort());
    expect(fetchMock).toHaveBeenCalledTimes(CLOUDFLARE_PROBE_SERVICES.length);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/account-123\//);
      expect(options).toEqual(expect.objectContaining({ method: "GET" }));
    }
  });

  it("probes every declared managed-zone API endpoint through GET only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: [] }), { status: 200 }));
    const results = await probeCloudflareZoneServiceCatalog("secret-token", "zone-123", fetchMock);
    expect(results.map((result) => result.id).sort()).toEqual(CLOUDFLARE_ZONE_PROBE_SERVICES.map((service) => service.id).sort());
    expect(fetchMock).toHaveBeenCalledTimes(CLOUDFLARE_ZONE_PROBE_SERVICES.length);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.cloudflare\.com\/client\/v4\/zones\/zone-123\//);
      expect(options).toEqual(expect.objectContaining({ method: "GET" }));
    }
  });

  it("paginates the complete permission catalog and marks capped results incomplete", async () => {
    const page = (number: number, totalCount: number) => new Response(JSON.stringify({
      success: true,
      result: [{ id: `perm-${number}`, name: `Permission ${number}`, scopes: ["com.cloudflare.api.account"] }],
      result_info: { total_count: totalCount, page: number, per_page: 1 },
    }), { status: 200 });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const pageNumber = Number(new URL(url).searchParams.get("page"));
      return Promise.resolve(page(pageNumber, 2));
    });
    const complete = await fetchCloudflarePermissionGroups("secret-token", "account-123", fetchMock);
    expect(complete.groups.map((group) => group.id)).toEqual(["perm-1", "perm-2"]);
    expect(complete.complete).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const cappedFetch = vi.fn().mockImplementation((url: string) => {
      const pageNumber = Number(new URL(url).searchParams.get("page"));
      return Promise.resolve(page(pageNumber, 25));
    });
    const capped = await fetchCloudflarePermissionGroups("secret-token", "account-123", cappedFetch);
    expect(capped.groups).toHaveLength(20);
    expect(capped.complete).toBe(false);
    expect(capped.totalCount).toBe(25);
  });

  it("accepts a complete unpaginated Cloudflare result even when it exceeds the requested page size", async () => {
    const allGroups = Array.from({ length: 403 }, (_, index) => ({ id: `permission-${index}`, name: `Permission ${index}` }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: allGroups }), { status: 200 }));
    const result = await fetchCloudflarePermissionGroups("secret-token", "account-123", fetchMock);
    expect(result.status).toBe("granted");
    expect(result.groups).toHaveLength(403);
    expect(result.totalCount).toBe(403);
    expect(result.complete).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
