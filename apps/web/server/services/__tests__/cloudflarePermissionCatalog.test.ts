import { afterEach, describe, expect, it, vi } from "vitest";
import { combineCloudflarePermissionCatalogs, fetchCloudflarePermissionGroups, fetchCloudflareUserPermissionGroups, probeCloudflareCredential, probeCloudflarePermissionCatalog, probeCloudflareServiceCatalog, probeCloudflareZoneServiceCatalog, verifyCloudflareToken } from "../cloudflareCredentialCenter";
import { CLOUDFLARE_PROBE_SERVICES, CLOUDFLARE_ZONE_PROBE_SERVICES } from "../../../shared/cloudflareCredentialCatalog";

describe("Cloudflare permission group catalog probe", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it.each([
    [{ not_before: "2027-01-30T17:00:00Z", expires_on: "2027-01-31T16:59:59Z" }, "invalid_token", "not_yet_valid"],
    [{ expires_on: "2026-10-19T10:00:00Z" }, "invalid_token", "expired"],
    [{ not_before: "invalid-date" }, "unavailable", "invalid_window"],
    [{ expires_on: 123 }, "unavailable", "invalid_window"],
    [{ not_before: "2026-10-20T00:00:00Z", expires_on: "2026-10-19T00:00:00Z" }, "unavailable", "invalid_window"],
  ] as const)("rejects active tokens outside a valid TTL: %j", async (window, status, validityIssue) => {
    vi.useFakeTimers().setSystemTime(new Date("2026-10-19T10:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, result: { status: "active", ...window, id: "private-token-id" },
    }), { status: 200 }));
    const result = await verifyCloudflareToken("secret-token", fetchMock);
    expect(result).toEqual({ status, httpStatus: 200, validityIssue });
    expect(JSON.stringify(result)).not.toMatch(/private-token-id|secret-token/);
  });

  it("accepts an active token at its start boundary before expiry", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-10-19T10:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true,
      result: { status: "active", not_before: "2026-10-19T10:00:00Z", expires_on: "2027-01-31T16:59:59Z" },
    }), { status: 200 }));
    await expect(verifyCloudflareToken("secret-token", fetchMock)).resolves.toEqual({ status: "granted", httpStatus: 200 });
  });

  it("verifies a Cloudflare token without returning token identifiers or secrets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: { id: "token-id-must-not-leak", status: "active" },
    }), { status: 200 }));

    const result = await verifyCloudflareToken("secret-token", fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      expect.objectContaining({ method: "GET", headers: expect.objectContaining({ Authorization: "Bearer secret-token" }) }),
    );
    expect(result).toEqual({ status: "granted", httpStatus: 200 });
    expect(JSON.stringify(result)).not.toContain("token-id-must-not-leak");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("verifies an account-owned token using its exact account after the user endpoint rejects it", async () => {
    const accountId = "0123456789abcdef0123456789abcdef";
    const fetchMock = vi.fn().mockImplementation(async (url: string) => url.endsWith("/user/tokens/verify")
      ? new Response(JSON.stringify({ success: false }), { status: 401 })
      : new Response(JSON.stringify({ success: true, result: { id: "must-not-leak", status: "active" } }), { status: 200 }));
    const result = await verifyCloudflareToken("fixture-account-token", fetchMock, accountId);
    expect(result).toEqual({ status: "granted", httpStatus: 200, verificationEndpoint: "account" });
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`,
    ]);
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|fixture-account-token/);
  });

  it("applies the same TTL checks to account tokens", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => url.endsWith("/user/tokens/verify")
      ? new Response(JSON.stringify({ success: false }), { status: 401 })
      : new Response(JSON.stringify({ success: true, result: { status: "active", expires_on: "2020-01-01T00:00:00Z" } }), { status: 200 }));
    await expect(verifyCloudflareToken("fixture-token", fetchMock, "0".repeat(32))).resolves.toMatchObject({
      status: "invalid_token", validityIssue: "expired", verificationEndpoint: "account",
    });
  });

  it.each([
    [200, { status: "disabled" }],
    [200, { status: "active", expires_on: "2020-01-01T00:00:00Z" }],
    [503, null],
  ])("does not bypass explicit user-token state or outages by probing another authority: %s", async (status, result) => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: status === 200, result }), { status }));
    expect((await verifyCloudflareToken("fixture-token", fetchMock, "0".repeat(32))).status).not.toBe("granted");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never interpolates an unvalidated account into verification requests", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: false }), { status: 401 }));
    await verifyCloudflareToken("fixture-token", fetchMock, "../foreign/target");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("continues actual catalog probing after successful account-token verification", async () => {
    const accountId = "0123456789abcdef0123456789abcdef";
    const rows = [
      { value: JSON.stringify({ audit: { token: "fixture-account-token" } }), isSensitive: false },
      { value: accountId, isSensitive: false },
    ];
    const db = { select: () => { const query = { from: () => query, where: () => query, limit: async () => rows.splice(0, 1) }; return query; } } as never;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/user/tokens/verify")) return new Response(JSON.stringify({ success: false }), { status: 401 });
      const result = url.endsWith(`/accounts/${accountId}/tokens/verify`) ? { status: "active" } : [];
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    });
    const report = await probeCloudflareCredential(db, "audit", fetchMock);
    expect(report.checks.find(check => check.id === "tokenVerification")).toMatchObject({ status: "granted", scope: "Account API token" });
    expect(report.checks.find(check => check.id === "tunnels")).toMatchObject({ status: "granted", verificationScope: "catalog" });
    expect(JSON.stringify(report)).not.toContain("fixture-account-token");
  });

  it.each([
    ["disabled", "invalid_token"],
    ["expired", "invalid_token"],
    [undefined, "unavailable"],
  ] as const)("fails closed when Cloudflare reports token state %s", async (tokenStatus, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: tokenStatus ? { status: tokenStatus } : {},
    }), { status: 200 }));
    await expect(verifyCloudflareToken("secret-token", fetchMock))
      .resolves.toEqual({ status: expected, httpStatus: 200 });
  });

  it("resolves Account and Zone IDs from the saved profile via read-only API calls", async () => {
    const rows = [
      { value: JSON.stringify({ audit: { label: "audit", token: "secret-token", updatedAt: "2026-10-17T00:00:00.000Z" } }), isSensitive: false },
      { value: "account-123", isSensitive: false },
    ];
    const db = { select: () => {
      const query: any = {
        from: () => query,
        where: () => query,
        limit: async () => rows.splice(0, 1),
      };
      return query;
    } } as never;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const result = url.endsWith("/user/tokens/verify")
        ? { status: "active" }
        : url.includes("/zones?name=smartaihub.app")
          ? [{ id: "zone-123", name: "smartaihub.app" }]
          : [];
      return Promise.resolve(new Response(JSON.stringify({ success: true, result }), { status: 200 }));
    });

    const report = await probeCloudflareCredential(db, "audit", fetchMock);

    expect(report).toMatchObject({ accountId: "account-123", zoneId: "zone-123", error: null });
    expect(report.checks.find((check) => check.id === "tokenVerification"))
      .toMatchObject({ status: "granted", httpStatus: 200 });
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("secret-token");
  });

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

  it("does not require a user catalog for a verified account-owned token", async () => {
    const account = await fetchCloudflarePermissionGroups("fixture", "0".repeat(32), vi.fn(async () => new Response(JSON.stringify({ success: true, result: [{ id: "p", name: "Cloudflare Tunnel Read" }] }), { status: 200 })));
    const result = combineCloudflarePermissionCatalogs(account, null);
    expect(result).toMatchObject({ status: "granted", complete: true, userCatalogApplicable: false });
    expect(result.sources.map(source => source.scope)).toEqual(["account"]);
  });

  it("does not turn a failed account catalog into success when the user catalog is inapplicable", async () => {
    const account = await fetchCloudflarePermissionGroups("fixture", "0".repeat(32), vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 403 })));
    expect(combineCloudflarePermissionCatalogs(account, null)).toMatchObject({ status: "missing_permission", complete: false, userCatalogApplicable: false });
  });

  it("does not misclassify account-token verification failure as resource permission denial", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ code: 1001 }] }), { status: 401 }));
    await expect(verifyCloudflareToken("fixture", fetchMock, "0".repeat(32))).resolves.toMatchObject({ status: "invalid_token", verificationEndpoint: "account" });
  });

  it("runs the account-only catalog path and caches only nonsecret applicable results", async () => {
    const accountId = "0".repeat(32);
    const rows = [
      { value: JSON.stringify({ audit: { token: "fixture-account-token" } }), isSensitive: false },
      { value: accountId, isSensitive: false },
    ];
    const inserted = vi.fn();
    const db = { select: () => { const q = { from: () => q, where: () => q, limit: async () => rows.splice(0, 1) }; return q; },
      insert: () => ({ values: async (value: unknown) => inserted(value) }) } as never;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/user/tokens/verify")) return new Response(JSON.stringify({ success: false }), { status: 401 });
      if (url.endsWith("/tokens/verify")) return new Response(JSON.stringify({ success: true, result: { status: "active" } }), { status: 200 });
      expect(url).not.toContain("/user/tokens/permission_groups");
      return new Response(JSON.stringify({ success: true, result: [{ id: "p", name: "Cloudflare Tunnel Read" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await probeCloudflarePermissionCatalog(db, "audit");
    expect(result).toMatchObject({ status: "granted", complete: true, userCatalogApplicable: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(inserted).toHaveBeenCalledOnce();
    expect(JSON.stringify(inserted.mock.calls)).not.toContain("fixture-account-token");
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

  it("distinguishes explicit product-plan denials from token and permission failures without leaking provider text", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/workers/dispatch/namespaces")) return new Response(JSON.stringify({ success: false, errors: [{ code: 10121, message: "Purchase dispatch namespaces; must-not-leak-provider-text" }] }), { status: 403 });
      if (url.endsWith("/containers/applications")) return new Response(JSON.stringify({ success: false, errors: [{ code: 1000, message: JSON.stringify({ error: "Unauthorized: You do not have access to Cloudflare Containers. Deploying containers requires the Workers Paid plan. must-not-leak-provider-text" }) }] }), { status: 401 });
      return new Response(JSON.stringify({ success: false, errors: [{ code: 10000 }] }), { status: 403 });
    });
    const report = await probeCloudflareServiceCatalog("secret-token", "account-123", fetchMock);
    expect(report.find(check => check.id === "dispatchNamespaces")).toMatchObject({ status: "product_unavailable", productRequirement: "workers_for_platforms", httpStatus: 403 });
    expect(report.find(check => check.id === "containers")).toMatchObject({ status: "product_unavailable", productRequirement: "workers_paid", httpStatus: 401 });
    expect(report.find(check => check.id === "vpcServices")).toMatchObject({ status: "missing_permission", httpStatus: 403 });
    expect(JSON.stringify(report)).not.toContain("must-not-leak");
    expect(JSON.stringify(report)).not.toContain("secret-token");
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("does not misclassify ordinary Containers authentication errors or another endpoint as a billing requirement", async () => {
    const denied = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ code: 1000, message: "Invalid API token" }] }), { status: 401 }));
    const results = await probeCloudflareServiceCatalog("secret-token", "account-123", denied);
    expect(results.every(check => check.status === "invalid_token" && !check.productRequirement)).toBe(true);
    const unrelated = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10121 }] }), { status: 403 }));
    const other = await probeCloudflareZoneServiceCatalog("secret-token", "zone-123", unrelated);
    expect(other.every(check => check.status === "missing_permission" && !check.productRequirement)).toBe(true);
  });

  it("probes every declared SmartAIHub account integration through GET endpoints only", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: true, result: [] }), { status: 200 }));
    const results = await probeCloudflareServiceCatalog("secret-token", "account-123", fetchMock);

    expect(results.map((result) => result.id).sort()).toEqual(CLOUDFLARE_PROBE_SERVICES.map((service) => service.id).sort());
    expect(fetchMock).toHaveBeenCalledTimes(CLOUDFLARE_PROBE_SERVICES.length);
    expect(results.find(result => result.id === "tunnels")).toMatchObject({
      status: "granted", verificationScope: "catalog", visibleResourceCount: 0, resourceAccessVerified: false,
    });
    for (const [url, options] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/account-123\//);
      expect(options).toEqual(expect.objectContaining({ method: "GET" }));
    }
  });

  it("distinguishes Tunnel authorization denial from an invalid token", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      success: false, errors: [{ code: 1001, message: "Not authorized" }],
    }), { status: 401 }));
    const results = await probeCloudflareServiceCatalog("secret-token", "account-123", fetchMock);
    expect(results.find(result => result.id === "tunnels")).toMatchObject({ status: "missing_permission", httpStatus: 401 });
    expect(JSON.stringify(results)).not.toContain("secret-token");
  });

  it("probes every declared managed-zone API endpoint through GET only", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: true, result: [] }), { status: 200 }));
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
