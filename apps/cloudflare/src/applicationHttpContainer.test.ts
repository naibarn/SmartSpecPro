import { describe, expect, it, vi } from "vitest";
import { ApplicationHttpContainerController, validateApplicationHttpProfile, type ApplicationHttpProfile } from "./applicationHttpContainer";

function fixture() {
  let now = Date.now();
  const profile: ApplicationHttpProfile = {
    configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40), targetId: "smartspec-cloudflare-staging",
    runtime: "node-http", accountRef: "a".repeat(32), namespace: "smartspec-staging-abcdef012345",
    image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:${"b".repeat(64)}`,
    issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 600_000).toISOString(),
    maxStarts: 2, maxComputeSeconds: 120, hardLifetimeSeconds: 60, idleTimeoutSeconds: 10,
    instance: "lite", networkAccess: "application-outbound",
  };
  const records = new Map<string, unknown>();
  const storage = {
    get: async <T>(key: string) => records.get(key) as T | undefined,
    put: vi.fn(async (key, value) => { records.set(key, value); }), setAlarm: vi.fn(async () => {}),
  };
  const fetch = vi.fn(async () => new Response("ok"));
  const container = {
    running: false, images: { node: profile.image }, inspect: vi.fn(),
    start: vi.fn(() => { container.running = true; }),
    monitor: vi.fn(() => new Promise<void>(() => {})),
    getState: vi.fn(async () => ({ status: container.running ? "healthy" : "stopped" })),
    destroy: vi.fn(async () => { container.running = false; }),
    setInactivityTimeout: vi.fn(async () => {}), getTcpPort: vi.fn(() => ({ fetch })),
  };
  const environment = { DATABASE_URL: "fixture-private-dsn", JWT_SECRET: "fixture-private-app-key" };
  const controller = new ApplicationHttpContainerController(container as never, storage, profile, environment, () => now);
  const markObserved = () => container.inspect.mockResolvedValue({ image: profile.image, labels: { scope: [...records.values()][0] && ([...records.values()][0] as { scope: string }).scope } });
  return { profile, storage, container, records, environment, controller, fetch, markObserved, advance: (ms: number) => { now += ms; } };
}

describe("bounded private application HTTP compute", () => {
  it("waits for a cold API beyond 100 immediate refusals without replaying the request or booting again", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(), deadline = await f.controller.ensureRunning(); let probes = 0;
      f.fetch.mockImplementation(async input => {
        if (input instanceof Request) return new Response("actual API response");
        probes++; f.advance(200);
        if (probes < 200) throw new Error("port not ready");
        return new Response(null, { status: 200 });
      });
      const response = f.controller.forward(new Request("http://application.internal/healthz"), deadline);
      await vi.runAllTimersAsync();
      expect(await (await response).text()).toBe("actual API response");
      expect(probes).toBe(200); expect(f.container.start).toHaveBeenCalledOnce();
      expect(f.fetch.mock.calls.filter(([input]) => input instanceof Request)).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });
  it("never probes or forwards past the absolute application deadline", async () => {
    const f = fixture(), deadline = await f.controller.ensureRunning(); f.advance(61000);
    await expect(f.controller.forward(new Request("http://application.internal/healthz"), deadline)).rejects.toThrow("READINESS_UNAVAILABLE");
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.container.start).toHaveBeenCalledOnce();
  });
  it("records a bounded container exit code when the VM stops before readiness", async () => {
    const f = fixture();
    const exit = Object.assign(new Error("provider detail must not be persisted"), { exitCode: 137 });
    f.container.monitor.mockImplementation(() => Promise.reject(exit));
    const deadline = await f.controller.ensureRunning();
    await Promise.resolve();
    await expect(f.controller.forward(new Request("http://application.internal/healthz"), deadline))
      .rejects.toThrow("APPLICATION_HTTP_CONTAINER_EXITED_BEFORE_READY");
    await f.controller.recordFailure(Object.assign(new Error("APPLICATION_HTTP_CONTAINER_EXITED_BEFORE_READY"), { exitCode: 137 }));
    expect(await f.controller.diagnostics()).toMatchObject({ failure: {
      code: "APPLICATION_HTTP_CONTAINER_EXITED_BEFORE_READY", phase: "readiness", exitCode: 137,
    } });
    expect(JSON.stringify(await f.controller.diagnostics())).not.toContain("provider detail");
  });
  it("reads only the provider container state and exit code in diagnostics", async () => {
    const f = fixture();
    f.container.getState.mockResolvedValue({ status: "stopped_with_code", exitCode: 137, providerDetail: "fixture-secret" } as never);
    const diagnostic = await f.controller.diagnostics();
    expect(diagnostic).toMatchObject({ containerState: { status: "stopped_with_code", exitCode: 137 } });
    expect(JSON.stringify(diagnostic)).not.toContain("fixture-secret");
    f.container.getState.mockResolvedValue({ status: "unsafe-provider-detail" } as never);
    expect(await f.controller.diagnostics()).toMatchObject({ containerState: null });
  });
  it("reports spent budget and safe failures without booting, inspecting processes or returning secrets", async () => {
    const f = fixture();
    expect(await f.controller.diagnostics()).toMatchObject({ running: false, starts: 0, failure: null });
    expect(f.container.start).not.toHaveBeenCalled();
    f.container.start.mockImplementationOnce(() => { throw new TypeError("provider detail contains fixture-private-dsn"); });
    try { await f.controller.ensureRunning(); } catch (error) { await f.controller.recordFailure(error); }
    const diagnostic = await f.controller.diagnostics();
    expect(diagnostic).toMatchObject({ starts: 1, reservedSeconds: 60, configurationMatches: true,
      failure: { kind: "TypeError", phase: "start", code: "APPLICATION_HTTP_RUNTIME_FAILURE" } });
    expect(JSON.stringify(diagnostic)).not.toMatch(/fixture-private|DATABASE_URL|JWT_SECRET|provider detail/);
    expect(f.container.start).toHaveBeenCalledOnce(); expect(f.container.getTcpPort).not.toHaveBeenCalled();
  });
  it("does not prewarm; persists budget and alarm before the first boot without persisting secrets", async () => {
    const f = fixture();
    await f.controller.restore();
    expect(f.container.start).not.toHaveBeenCalled();
    await f.controller.ensureRunning();
    expect(f.storage.put.mock.invocationCallOrder[0]).toBeLessThan(f.container.start.mock.invocationCallOrder[0]);
    expect(f.storage.setAlarm.mock.invocationCallOrder[0]).toBeLessThan(f.container.start.mock.invocationCallOrder[0]);
    expect(JSON.stringify([...f.records.values()])).not.toContain(f.environment.JWT_SECRET);
    expect(f.container.start).toHaveBeenCalledWith(expect.objectContaining({ image: f.profile.image, instance: "lite", enableInternet: true }));
    expect(f.container.setInactivityTimeout).toHaveBeenCalledWith(10_000);
    expect(f.container.start.mock.calls[0][0].env).toMatchObject({
      CLOUDFLARE_APPLICATION_BRIDGE: "private-http-v1", PYTHON_BACKEND_URL: "http://python.application.internal",
      NODE_SERVER_URL: "http://127.0.0.1:3000",
    });
  });

  it("restores idle and absolute bounds across DO restarts without extending or booting twice", async () => {
    const f = fixture();
    const deadline = await f.controller.ensureRunning();
    f.markObserved(); f.advance(20_000);
    await f.controller.restore();
    expect(await f.controller.ensureRunning()).toBe(deadline);
    expect(f.container.start).toHaveBeenCalledOnce();
    f.advance(41_000); await f.controller.expire();
    expect(f.container.destroy).toHaveBeenCalledOnce();
    expect(f.container.running).toBe(false);
  });

  it("does not erase spent reservations after idle shutdown or a failed start", async () => {
    const f = fixture();
    await f.controller.ensureRunning();
    f.container.running = false;
    f.container.start.mockImplementationOnce(() => { throw new Error("provider response uncertain"); });
    await expect(f.controller.ensureRunning()).rejects.toThrow("uncertain");
    await expect(f.controller.ensureRunning()).rejects.toThrow("COMPUTE_BUDGET_EXHAUSTED");
    expect(f.container.start).toHaveBeenCalledTimes(2);
  });

  it("never boots when cleanup-alarm persistence fails", async () => {
    const f = fixture(); f.storage.setAlarm.mockRejectedValueOnce(new Error("alarm storage unavailable"));
    await expect(f.controller.ensureRunning()).rejects.toThrow("alarm storage unavailable");
    expect(f.container.start).not.toHaveBeenCalled();
  });

  it("destroys running compute when the provider cannot enforce idle shutdown", async () => {
    const f = fixture(); f.container.setInactivityTimeout.mockRejectedValueOnce(new Error("idle unavailable"));
    await expect(f.controller.ensureRunning()).rejects.toThrow("idle unavailable");
    expect(f.container.destroy).toHaveBeenCalledOnce();
  });

  it("stops an already running instance when restored alarm or idle bounds fail", async () => {
    const f = fixture(); await f.controller.ensureRunning(); f.markObserved();
    f.storage.setAlarm.mockRejectedValueOnce(new Error("restored alarm unavailable"));
    await expect(f.controller.restore()).rejects.toThrow("restored alarm unavailable");
    expect(f.container.destroy).toHaveBeenCalledOnce();
  });

  it("enforces the compute-seconds budget independently of the start count", async () => {
    const f = fixture(); f.profile.maxComputeSeconds = 60;
    await f.controller.ensureRunning(); f.container.running = false;
    await expect(f.controller.ensureRunning()).rejects.toThrow("COMPUTE_BUDGET_EXHAUSTED");
    expect(f.container.start).toHaveBeenCalledOnce();
  });

  it("cannot adopt an unowned instance, reset budget by changing secrets, or run an unbound image", async () => {
    const f = fixture(); f.container.running = true;
    await expect(f.controller.ensureRunning()).rejects.toThrow("ACTIVE_SCOPE_REQUIRED");
    expect(f.container.destroy).toHaveBeenCalledOnce();
    await f.controller.ensureRunning(); f.markObserved();
    f.environment.JWT_SECRET = "changed-secret-without-a-new-deployment";
    await expect(f.controller.ensureRunning()).rejects.toThrow("CONFIGURATION_CHANGED");
    f.container.images.node = "foreign-image";
    await expect(f.controller.ensureRunning()).rejects.toThrow("IMAGE_BINDING_MISMATCH");
  });

  it.each(["expired", "unbounded", "tagged", "foreign account", "excess starts", "excess compute", "unbounded idle"])("denies %s configuration before any provider mutation", async scenario => {
    const f = fixture();
    if (scenario === "expired") f.profile.expiresAt = f.profile.issuedAt;
    if (scenario === "unbounded") f.profile.hardLifetimeSeconds = 601;
    if (scenario === "tagged") f.profile.image = "registry.cloudflare.com/account/smartspec-staging-abcdef012345-node-http:latest";
    if (scenario === "foreign account") f.profile.accountRef = "f".repeat(32);
    if (scenario === "excess starts") f.profile.maxStarts = 3;
    if (scenario === "excess compute") f.profile.maxComputeSeconds = 1201;
    if (scenario === "unbounded idle") f.profile.idleTimeoutSeconds = 31;
    expect(() => validateApplicationHttpProfile(f.profile)).toThrow();
    await expect(f.controller.ensureRunning()).rejects.toThrow();
    expect(f.container.start).not.toHaveBeenCalled();
  });

  it("forwards a mutation once, preserves its request body and never retries an uncertain response", async () => {
    const f = fixture(); const deadline = await f.controller.ensureRunning();
    const request = new Request("https://origin-staging.smartaihub.app/api/change", { method: "POST", body: "fixture-input" });
    f.fetch.mockImplementation(async input => {
      if (input instanceof Request) {
        expect(await input.text()).toBe("fixture-input");
        throw new Error("uncertain application response");
      }
      return new Response(null, { status: 200 });
    });
    await expect(f.controller.forward(request, deadline)).rejects.toThrow("uncertain application response");
    expect(f.fetch.mock.calls.filter(([input]) => input instanceof Request)).toHaveLength(1);
  });
});
