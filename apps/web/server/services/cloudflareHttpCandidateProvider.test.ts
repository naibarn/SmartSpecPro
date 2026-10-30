import { describe, expect, it, vi } from "vitest";
import { probeHttpCandidateProvider } from "./cloudflareHttpCandidateProvider";

function fixture() {
  const values: Record<string, unknown> = { [`/accounts/${"a".repeat(32)}`]: { id: "a".repeat(32) }, "/containers/applications": [], "/workers/subdomain": { subdomain: "fixture" },
    "/workers/routes": [{ id: "verified-m2-route", pattern: "smartaihub.app/*", script: "smartspec-cloudflare-runtime" }] };
  const fetchImpl = vi.fn(async (url: any, init: any) => {
    const path = new URL(String(url)).pathname;
    expect(init.method).toBe("GET"); expect(init.redirect).toBe("error");
    if (path.endsWith("/deployments")) return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 });
    const key = Object.keys(values).find(key => path.endsWith(key));
    if (!key) throw Error("UNEXPECTED_ENDPOINT");
    return Response.json({ success: true, result: values[key] });
  });
  return { values, fetchImpl, input: { accountRef: "a".repeat(32), workerName: "isolated-candidate", applications: [
    { name: "native-node", class_name: "ProductionNodeHttpContainer", images: { node: { image: "node@sha256:test" } } },
    { name: "native-python", class_name: "ProductionPythonHttpContainer", images: { python: { image: "python@sha256:test" } } },
  ], token: "fixture-secret", fetchImpl } };
}
describe("isolated candidate provider readiness", () => {
  it("is ready without DNS, optional inventories or changes to M2; read access never proves writes", async () => {
    const f = fixture(); expect(await probeHttpCandidateProvider(f.input)).toMatchObject({ readAccessVerified: true, writeAccessVerified: false, m2RouteId: "verified-m2-route" });
    expect(f.fetchImpl).toHaveBeenCalledTimes(5);
    expect(f.fetchImpl.mock.calls.every(([url]) => !String(url).includes("dns_records"))).toBe(true);
  });
  it("rejects denied Containers inventory rather than treating it as empty", async () => {
    const f = fixture(); f.fetchImpl.mockImplementationOnce(async () => Response.json({ success: false }, { status: 403 }));
    await expect(probeHttpCandidateProvider(f.input)).rejects.toThrow("PROVIDER_HTTP_403");
  });
  it("reads every page and adopts an existing worker only as an explicit rollback baseline", async () => {
    const f = fixture();
    f.fetchImpl.mockImplementation(async (url: any) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/deployments")) {
        const page = Number(parsed.searchParams.get("page"));
        return Response.json({ success: true, result: { deployments: page === 1 ? [] : [{ id: "existing", versions: [{ version_id: "version-1", percentage: 100 }] }] },
          result_info: { page, total_pages: 2 } });
      }
      const key = Object.keys(f.values).find(item => parsed.pathname.endsWith(item));
      return Response.json({ success: true, result: key ? f.values[key] : null });
    });
    await expect(probeHttpCandidateProvider(f.input)).resolves.toMatchObject({ workerBaseline: { deploymentId: "existing", versionId: "version-1" } });
    const historyRequests = f.fetchImpl.mock.calls.map(([url]) => new URL(String(url)))
      .filter(url => url.pathname.endsWith("/deployments"));
    expect(historyRequests.map(url => url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(historyRequests.every(url => url.searchParams.get("per_page") === "100")).toBe(true);
  });
  it("reads every Container application inventory page before classifying name collisions", async () => {
    const f = fixture();
    f.fetchImpl.mockImplementation(async (url: any) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/deployments")) return Response.json({ success: false }, { status: 404 });
      if (parsed.pathname.endsWith("/applications")) {
        const page = Number(parsed.searchParams.get("page"));
        return Response.json({ success: true, result: page === 1 ? [] : [{ name: "native-python" }],
          result_info: { page, total_pages: 2 } });
      }
      const key = Object.keys(f.values).find(item => parsed.pathname.endsWith(item));
      return Response.json({ success: true, result: key ? f.values[key] : null });
    });
    await expect(probeHttpCandidateProvider(f.input)).rejects.toThrow("HTTP_CANDIDATE_APPLICATION_COLLISION_OR_UNKNOWN");
    const requests = f.fetchImpl.mock.calls.map(([url]) => new URL(String(url)))
      .filter(url => url.pathname.endsWith("/applications"));
    expect(requests.map(url => url.searchParams.get("page"))).toEqual(["1", "2"]);
  });
  it("rejects a baseline that changed after candidate review", async () => {
    const f = fixture();
    f.fetchImpl.mockImplementation(async (url: any) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/deployments")) return Response.json({ success: true,
        result: { deployments: [{ id: "current", versions: [{ version_id: "current-version", percentage: 100 }] }] },
        result_info: { page: 1, total_pages: 1 } });
      const key = Object.keys(f.values).find(item => parsed.pathname.endsWith(item));
      return Response.json({ success: true, result: key ? f.values[key] : null });
    });
    await expect(probeHttpCandidateProvider({ ...f.input, expectedWorkerBaseline: { deploymentId: "old", versionId: "old-version" } }))
      .rejects.toThrow("HTTP_CANDIDATE_WORKER_BASELINE_CHANGED");
  });
  it("reconciles an existing worker and its containers only when bindings, image digests and namespace IDs match", async () => {
    const f = fixture();
    f.values["/containers/applications"] = [
      { name: "native-node", scheduling_policy: "durable_object", durable_objects: { namespace_id: "1".repeat(32) } },
      { name: "native-python", scheduling_policy: "durable_object", durable_objects: { namespace_id: "2".repeat(32) } },
    ];
    f.fetchImpl.mockImplementation(async (url: any) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/deployments")) return Response.json({ success: true, result: { deployments: [
        { id: "active-deployment", versions: [{ version_id: "active-version", percentage: 100 }] },
      ] }, result_info: { page: 1, total_pages: 1 } });
      if (parsed.pathname.endsWith("/versions/active-version")) return Response.json({ success: true, result: { resources: {
        bindings: ["ProductionNodeHttpContainer", "ProductionPythonHttpContainer"].map((class_name, index) => ({
          type: "durable_object_namespace", name: index === 0 ? "NODE_HTTP" : "PYTHON_HTTP", class_name,
          namespace_id: String(index + 1).repeat(32),
        })),
        script_runtime: { containers: f.input.applications.map(item => ({ class_name: item.class_name,
          images: Object.fromEntries(Object.entries(item.images).map(([name, value]) => [name, value.image])) })) },
      } } });
      const key = Object.keys(f.values).find(item => parsed.pathname.endsWith(item));
      return Response.json({ success: true, result: key ? f.values[key] : null });
    });
    await expect(probeHttpCandidateProvider(f.input)).resolves.toMatchObject({
      workerBaseline: { deploymentId: "active-deployment", versionId: "active-version" },
    });
    f.values["/containers/applications"] = [{ ...f.values["/containers/applications"][0] as object,
      durable_objects: { namespace_id: "wrong-namespace" } }, f.values["/containers/applications"][1]];
    await expect(probeHttpCandidateProvider(f.input)).rejects.toThrow("HTTP_CANDIDATE_APPLICATION_BASELINE_MISMATCH");
  });
  it("rejects deployment history that exceeds the bounded inventory read", async () => {
    const f = fixture();
    f.fetchImpl.mockImplementation(async (url: any) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/deployments")) return Response.json({ success: true,
        result: { deployments: [] }, result_info: { page: Number(parsed.searchParams.get("page")), total_pages: 21 } });
      const key = Object.keys(f.values).find(item => parsed.pathname.endsWith(item));
      return Response.json({ success: true, result: key ? f.values[key] : null });
    });
    await expect(probeHttpCandidateProvider(f.input)).rejects.toThrow("INVENTORY_INCOMPLETE");
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
