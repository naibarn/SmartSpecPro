import { describe, expect, it, vi } from "vitest";
import { probeHttpCandidateProvider } from "./cloudflareHttpCandidateProvider";

function fixture() {
  const values: Record<string, unknown> = { "/containers/applications": [], "/workers/subdomain": { subdomain: "fixture" },
    "/workers/routes": [{ id: "verified-m2-route", pattern: "smartaihub.app/*", script: "smartspec-cloudflare-runtime" }] };
  const fetchImpl = vi.fn(async (url: any, init: any) => {
    const path = new URL(String(url)).pathname;
    expect(init.method).toBe("GET"); expect(init.redirect).toBe("error");
    if (path.endsWith("/deployments")) return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 });
    const key = Object.keys(values).find(key => path.endsWith(key));
    if (!key) throw Error("UNEXPECTED_ENDPOINT");
    return Response.json({ success: true, result: values[key] });
  });
  return { values, fetchImpl, input: { accountRef: "a".repeat(32), workerName: "isolated-candidate", applicationNames: ["native-node", "native-python"], token: "fixture-secret", fetchImpl } };
}
describe("isolated candidate provider readiness", () => {
  it("is ready without DNS, optional inventories or changes to M2; read access never proves writes", async () => {
    const f = fixture(); expect(await probeHttpCandidateProvider(f.input)).toMatchObject({ readAccessVerified: true, writeAccessVerified: false, m2RouteId: "verified-m2-route" });
    expect(f.fetchImpl).toHaveBeenCalledTimes(4);
    expect(f.fetchImpl.mock.calls.every(([url]) => !String(url).includes("dns_records"))).toBe(true);
  });
  it("rejects denied Containers inventory rather than treating it as empty", async () => {
    const f = fixture(); f.fetchImpl.mockImplementationOnce(async () => Response.json({ success: false }, { status: 403 }));
    await expect(probeHttpCandidateProvider(f.input)).rejects.toThrow("PROVIDER_HTTP_403");
  });
  it.each(["native-node", "native-python"])("does not adopt an unowned %s application", async name => {
    const f = fixture(); f.values["/containers/applications"] = [{ name }];
    await expect(probeHttpCandidateProvider(f.input)).rejects.toThrow("COLLISION");
  });
  it("rejects a missing or conflicting accepted route baseline", async () => {
    const f = fixture(); f.values["/workers/routes"] = [];
    await expect(probeHttpCandidateProvider(f.input)).rejects.toThrow("M2_BASELINE_DENIED");
  });
});
