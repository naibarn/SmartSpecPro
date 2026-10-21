import { describe, expect, it, vi } from "vitest";
import { prepareHttpApplicationImages, ensureHttpApplications, createHttpApplicationProvisionPorts, httpApplicationCredentialRef, assertHttpApplicationVersionMetadata } from "./cloudflareHttpApplicationProvision";
import { encrypt } from "./crypto";
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
    request: vi.fn(async (path: string, body?: any, method?: "PATCH"): Promise<any> => {
      if (path === "/image-preparations") return { status: "ready" };
      if (path === "/applications" && !body) return applications;
      if (path === "/applications" && body) {
        const runtime = body.name.endsWith("node-http") ? "node" : "python";
        expect(states.get(runtime).pending).toBe(true);
        const app = { ...body, id: `${applications.length + 1}`.repeat(32) }; applications.push(app); return app;
      }
      const app = applications.find(app => path.endsWith(app.id));
      if (method === "PATCH") Object.assign(app, body);
      return app;
    }) };
  return { settings, scope, version, ports, states, applications };
}
describe("private HTTP application metadata preparation", () => {
  it("changes logging only on verified owned applications, reads it back, and disables it for the next ordinary API profile", async () => {
    const f = fixture();
    await ensureHttpApplications(f.settings, f.scope, f.version, "e".repeat(64), f.ports);
    f.settings.startupDiagnostics = "container-logs";
    await ensureHttpApplications(f.settings, f.scope, f.version, "e".repeat(64), f.ports);
    expect(f.applications).toHaveLength(2);
    expect(f.applications.every(app => app.observability.logs.enabled === true)).toBe(true);
    expect(f.ports.request.mock.calls.filter(([, , method]) => method === "PATCH")).toHaveLength(2);
    const calls = f.ports.request.mock.calls.length;
    await ensureHttpApplications(f.settings, f.scope, f.version, "e".repeat(64), f.ports);
    expect(f.ports.request.mock.calls.slice(calls).every(([, , method]) => method !== "PATCH")).toBe(true);
    delete f.settings.startupDiagnostics;
    await ensureHttpApplications(f.settings, f.scope, f.version, "e".repeat(64), f.ports);
    expect(f.applications.every(app => app.observability.logs.enabled === false)).toBe(true);
  });
  it("rejects ignored logging writes without claiming successful diagnostic setup", async () => {
    const f = fixture();
    await ensureHttpApplications(f.settings, f.scope, f.version, "e".repeat(64), f.ports);
    f.settings.startupDiagnostics = "container-logs";
    const request = f.ports.request.getMockImplementation()!;
    f.ports.request.mockImplementation(async (path, body, method) => method === "PATCH" ? {} : request(path, body, method));
    await expect(ensureHttpApplications(f.settings, f.scope, f.version, "e".repeat(64), f.ports)).rejects.toThrow("DIAGNOSTICS_READBACK_MISMATCH");
  });
  it("retains namespace recovery after API expiry without granting any API execution", async () => {
    const f = fixture();
    f.settings.issuedAt = new Date(Date.now() - 120000).toISOString();
    f.settings.expiresAt = new Date(Date.now() - 60000).toISOString();
    await expect(prepareHttpApplicationImages(f.settings, f.scope, f.ports)).rejects.toThrow("SCOPE_DENIED");
    expect(f.ports.request).not.toHaveBeenCalled();
    const namespaceExpiry = new Date(Date.now() + 60000).toISOString();
    await prepareHttpApplicationImages(f.settings, f.scope, f.ports, namespaceExpiry);
    expect(f.ports.request).toHaveBeenCalledTimes(2);
    await expect(prepareHttpApplicationImages(f.settings, f.scope, f.ports, f.settings.expiresAt)).rejects.toThrow("PREPARATION_DENIED");
    expect(f.ports.request).toHaveBeenCalledTimes(2);
  });
  it("requires exact image metadata and no VM-access binding during namespace preparation", () => {
    const f = fixture();
    expect(() => assertHttpApplicationVersionMetadata(f.settings, f.scope, f.version, true)).toThrow("NAMESPACE_PREPARATION_BINDING_DENIED");
    f.version.resources.bindings = [];
    expect(() => assertHttpApplicationVersionMetadata(f.settings, f.scope, f.version, true)).not.toThrow();
    f.version.resources.script_runtime.containers[1].images.python = f.settings.node.image;
    expect(() => assertHttpApplicationVersionMetadata(f.settings, f.scope, f.version, true)).toThrow("VERSION_METADATA_DENIED");
  });
  it("keeps polling durable image preparation beyond the previous two-minute attempt budget", async () => {
    const f = fixture(); let attempts = 0;
    f.ports.request.mockImplementation(async path => {
      if (path !== "/image-preparations") throw Error("unexpected request");
      attempts++;
      return { status: attempts < 25 ? "pending" : "ready" };
    });
    await prepareHttpApplicationImages(f.settings, f.scope, f.ports);
    expect(attempts).toBe(26);
    expect(f.ports.wait).toHaveBeenCalledTimes(24);
  });
  it("preserves a safe preparation diagnostic through the canonical executor boundary", async () => {
    const f = fixture();
    f.ports.request.mockResolvedValue({ status: "error", error: "untrusted provider detail" });
    await expect(prepareHttpApplicationImages(f.settings, f.scope, f.ports)).rejects.toMatchObject({
      message: "CLOUDFLARE_HTTP_APPLICATION_IMAGE_PREPARATION_DENIED",
      diagnosticCode: "CLOUDFLARE_HTTP_APPLICATION_IMAGE_PREPARATION_DENIED",
    });
    expect(f.ports.request).toHaveBeenCalledOnce();
  });
  it("uses the documented provider image-preparations URI with an encrypted purpose credential", async () => {
    const f = fixture(), oldKey = process.env.LLM_ENCRYPTION_KEY;
    process.env.LLM_ENCRYPTION_KEY = "disposable-http-application-test-key";
    try {
      const row = { isSensitive: true, updatedBy: f.scope.actorUserId, value: encrypt(JSON.stringify({ ...f.scope,
        credentialRef: httpApplicationCredentialRef(f.scope), token: "fixture-api-token", revokedAt: null })) };
      const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) };
      const fetchImpl = vi.fn(async (url: any, init: any) => {
        const patch = init.method === "PATCH";
        expect(String(url)).toBe(`https://api.cloudflare.com/client/v4/accounts/${f.scope.accountRef}/containers${patch ? `/applications/${"1".repeat(32)}` : "/image-preparations"}`);
        expect(init.method).toBe(patch ? "PATCH" : "POST"); expect(init.redirect).toBe("error");
        expect(init.headers.Authorization).toBe("Bearer fixture-api-token");
        expect(JSON.parse(init.body)).toEqual(patch ? { observability: { logs: { enabled: true } } } : { image: f.settings.node.image });
        return Response.json({ success: true, result: { image: f.settings.node.image, status: "ready" } });
      });
      const ports = createHttpApplicationProvisionPorts(db as never, f.scope, f.ports.assertAuthorized, fetchImpl as never);
      await expect(ports.request("/image-preparations", { image: f.settings.node.image })).resolves.toMatchObject({ status: "ready" });
      await expect(ports.request("/images/prepare", { image: f.settings.node.image })).rejects.toThrow("ENDPOINT_DENIED");
      const path = `/applications/${"1".repeat(32)}`;
      await expect(ports.request(path, { observability: { logs: { enabled: true } } }, "PATCH")).resolves.toMatchObject({ status: "ready" });
      expect(fetchImpl.mock.calls.at(-1)?.[1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ observability: { logs: { enabled: true } } }) });
      await expect(ports.request(path, { observability: { logs: { enabled: true } }, instances: 5 }, "PATCH")).rejects.toThrow("ENDPOINT_DENIED");
      await expect(ports.request("/applications", { observability: { logs: { enabled: true } } }, "PATCH")).rejects.toThrow("ENDPOINT_DENIED");
      f.ports.assertAuthorized.mockRejectedValueOnce(Error("revoked"));
      await expect(ports.request(path, { observability: { logs: { enabled: false } } }, "PATCH")).rejects.toThrow("revoked");
      expect(fetchImpl).toHaveBeenCalledTimes(2); expect(row.value).not.toContain("fixture-api-token");
    } finally { if (oldKey === undefined) delete process.env.LLM_ENCRYPTION_KEY; else process.env.LLM_ENCRYPTION_KEY = oldKey; }
  });
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
