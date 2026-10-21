import { describe, expect, it, vi } from "vitest";
import { prepareHttpApplicationImages, ensureHttpApplications } from "./cloudflareHttpApplicationProvision";
import { httpApplicationWorkerMetadata, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
function fixture() {
  const scope = { tenantId: "t", projectId: "p", accountRef: "a".repeat(32), actorUserId: 1 };
  const namespace = nativeProvisionNamespace("t", "p");
  const settings: HttpApplicationSettings = { mode: "private-canary", namespace, sourceSha: "a".repeat(40),
    node: { provisionJobId: "11111111-1111-4111-8111-111111111111", planDigest: "b".repeat(64), image: `registry.cloudflare.com/${scope.accountRef}/${namespace}-node-http@sha256:${"c".repeat(64)}` },
    python: { provisionJobId: "22222222-2222-4222-8222-222222222222", planDigest: "d".repeat(64), image: `registry.cloudflare.com/${scope.accountRef}/${namespace}-python-http@sha256:${"e".repeat(64)}` },
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(),
    maxStarts: 1, maxComputeSeconds: 120, hardLifetimeSeconds: 120, idleTimeoutSeconds: 10, instance: "basic" };
  const meta = httpApplicationWorkerMetadata(settings, scope);
  const version = { resources: { bindings: meta.bindings.map((b, i) => ({ ...b, namespace_id: String(i + 1).repeat(32) })), script_runtime: { containers: meta.containers } } };
  const states = new Map<string, any>(), applications: any[] = [];
  const ports = { assertAuthorized: vi.fn(async () => undefined), wait: vi.fn(async () => undefined),
    load: vi.fn(async runtime => states.get(runtime) ?? null),
    save: vi.fn(async (state, previous) => { expect(states.get(state.runtime) ?? null).toEqual(previous); states.set(state.runtime, structuredClone(state)); }),
    request: vi.fn(async (path: string, body?: any): Promise<any> => {
      if (path === "/image-preparations") return { status: "ready" };
      if (path === "/applications" && !body) return applications;
      if (path === "/applications" && body) {
        const runtime = body.name.endsWith("node-http") ? "node" : "python";
        expect(states.get(runtime).pending).toBe(true);
        const app = { ...body, id: `${applications.length + 1}`.repeat(32) }; applications.push(app); return app;
      }
      return applications.find(app => path.endsWith(app.id));
    }) };
  return { settings, scope, version, ports, states, applications };
}
describe("private HTTP application metadata preparation", () => {
  it("prepares only the two exact registry images and creates two DO-managed applications without VM starts", async () => {
    const f = fixture(); await prepareHttpApplicationImages(f.settings, f.scope, f.ports);
    expect(f.ports.request.mock.calls.filter(([p]) => p === "/image-preparations").map(([, body]) => body.image)).toEqual([f.settings.node.image, f.settings.python.image]);
    const output = await ensureHttpApplications(f.settings, f.scope, f.version, "f".repeat(64), f.ports);
    expect(output).toMatchObject({ containerStarts: 0, publicIngressEnabled: false }); expect(output.applications).toHaveLength(2);
    for (const app of f.applications) {
      expect(app).toMatchObject({ scheduling_policy: "durable_object" });
      expect(app).not.toHaveProperty("instances"); expect(app).not.toHaveProperty("configuration");
    }
    const writes = f.ports.request.mock.calls.filter(([, body]) => body && body.name).length;
    await ensureHttpApplications(f.settings, f.scope, f.version, "e".repeat(64), f.ports);
    expect(f.ports.request.mock.calls.filter(([, body]) => body && body.name)).toHaveLength(writes);
  });
  it("refuses a matching unowned provider application instead of adopting it", async () => {
    const f = fixture(); f.applications.push({ name: `${f.settings.namespace}-node-http` });
    await expect(ensureHttpApplications(f.settings, f.scope, f.version, "f".repeat(64), f.ports)).rejects.toThrow("UNOWNED_APPLICATION_COLLISION");
    expect(f.ports.save).not.toHaveBeenCalled();
  });
  it.each(["foreign-namespace", "foreign-script", "duplicate", "wrong-image"])("rejects uploaded version %s before provisioning", async mode => {
    const f = fixture();
    if (mode === "foreign-namespace") f.version.resources.bindings[0].namespace_id = "foreign";
    if (mode === "foreign-script") Object.assign(f.version.resources.bindings[0], { script_name: "foreign" });
    if (mode === "duplicate") f.version.resources.bindings.push(f.version.resources.bindings[0]);
    if (mode === "wrong-image") f.version.resources.script_runtime.containers[0].images.node = f.settings.python.image;
    await expect(ensureHttpApplications(f.settings, f.scope, f.version, "f".repeat(64), f.ports)).rejects.toThrow();
    expect(f.ports.request).not.toHaveBeenCalled();
  });
  it("never repeats a create with an uncertain provider response", async () => {
    const f = fixture(); f.ports.request.mockImplementation(async (path, body) => {
      if (!body && path === "/applications") return [];
      throw Error("response lost");
    });
    await expect(ensureHttpApplications(f.settings, f.scope, f.version, "f".repeat(64), f.ports)).rejects.toThrow("response lost");
    const calls = f.ports.request.mock.calls.length;
    await expect(ensureHttpApplications(f.settings, f.scope, f.version, "f".repeat(64), f.ports)).rejects.toThrow("UNCERTAIN_CREATE");
    expect(f.ports.request).toHaveBeenCalledTimes(calls);
  });
  it("checks revoked authority between image preparations and before app creation", async () => {
    const f = fixture(); f.ports.request.mockImplementation(async () => { f.ports.assertAuthorized.mockRejectedValue(Error("revoked")); return { status: "ready" }; });
    await expect(prepareHttpApplicationImages(f.settings, f.scope, f.ports)).rejects.toThrow("revoked");
    expect(f.ports.request).toHaveBeenCalledTimes(1);
  });
});
