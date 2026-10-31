import { describe, expect, it, vi } from "vitest";
import { ApplicationHttpContainerController, validateApplicationHttpProfile, type ApplicationHttpProfile } from "./applicationHttpContainer";
import { NODE_VPC_DATABASE_ENTRYPOINT, PYTHON_VPC_DATABASE_ENTRYPOINT } from "./applicationDatabaseEntrypoints";

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
  it("verifies the actual running image after a corrected boot and clears only the obsolete failure", async () => {
    const f = fixture();
    await f.controller.recordFailure(new Error("APPLICATION_HTTP_CONTAINER_EXITED_BEFORE_READY"));
    const deadline = await f.controller.ensureRunning(); f.markObserved();
    await f.controller.forward(new Request("http://application.internal/healthz"), deadline);
    expect(await f.controller.diagnostics()).toMatchObject({ image: f.profile.image, running: true, starts: 1, reservedSeconds: 60, failure: null });
    f.container.inspect.mockResolvedValueOnce({ image: "different-image", labels: {} });
    expect((await f.controller.diagnostics()).image).toBeNull();
    expect(f.container.start).toHaveBeenCalledOnce();
  });
  it("uses the fixed private VPC startup program with the same immutable image and exact application role", async () => {
    const f = fixture();
    Object.assign(f.profile, { targetId: "smartspec-cloudflare-runtime", namespace: "smartspec-production-abcdef012345", instance: "basic" });
    Object.assign(f.environment, { DATABASE_URL: "postgresql://sah_cf_app_abcdef012345:fixture-secret@db.smartaihub.app:5433/fixture",
      CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT: "private-vpc-websocket-v1" });
    await f.controller.ensureRunning();
    expect(f.container.start).toHaveBeenCalledWith(expect.objectContaining({ image: f.profile.image,
      entrypoint: ["node", "--import=tsx", "--input-type=module", "-e", expect.stringContaining("ws://database.application.internal/")] }));
  });
  it("allows the exact tenant-scoped application role through the Staging VPC bridge", async () => {
    const f = fixture();
    Object.assign(f.environment, { DATABASE_URL: "postgresql://sah_cf_app_abcdef012345:fixture-secret@db-staging.smartaihub.app:5432/smartspec",
      CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT: "private-vpc-websocket-v1" });
    await f.controller.ensureRunning();
    expect(f.container.start).toHaveBeenCalledWith(expect.objectContaining({ image: f.profile.image,
      entrypoint: ["node", "--import=tsx", "--input-type=module", "-e", expect.stringContaining("sah_cf_app_[a-f0-9]{12}")] }));
  });
  it("rejects a Staging VPC application role scoped to another namespace", async () => {
    const f = fixture();
    Object.assign(f.environment, { DATABASE_URL: "postgresql://sah_cf_app_ffffffffffff:fixture-secret@db-staging.smartaihub.app:5432/smartspec",
      CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT: "private-vpc-websocket-v1" });
    await expect(f.controller.ensureRunning()).rejects.toThrow("DATABASE_SCOPE_DENIED");
    expect(f.container.start).not.toHaveBeenCalled(); expect(f.storage.put).not.toHaveBeenCalled();
  });
  it("starts the Python Staging runtime with the same exact application-role contract", async () => {
    const f = fixture();
    f.profile.runtime = "python-http";
    f.profile.image = f.profile.image.replace("-node-http@", "-python-http@");
    f.container.images.python = f.profile.image;
    Object.assign(f.environment, { DATABASE_URL: "postgresql+asyncpg://sah_cf_app_abcdef012345:fixture-secret@db-staging.smartaihub.app:5432/smartspec",
      CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT: "private-vpc-websocket-v1" });
    await f.controller.ensureRunning();
    expect(f.container.start).toHaveBeenCalledWith(expect.objectContaining({ image: f.profile.image,
      entrypoint: ["python", "-c", expect.stringContaining("role_pattern=r'sah_cf_app_[a-f0-9]{12}'")] }));
  });
  it("uses the selected staging DB hostname for Python TLS/SNI and emits only safe startup phase diagnostics", () => {
    expect(PYTHON_VPC_DATABASE_ENTRYPOINT).toContain("DatabaseConnectorEventLoop(host)");
    expect(PYTHON_VPC_DATABASE_ENTRYPOINT).not.toContain("DatabaseConnectorEventLoop('db.smartaihub.app')");
    expect(NODE_VPC_DATABASE_ENTRYPOINT).toContain("APPLICATION_VPC_DATABASE_START_FAILED:'+failureStage");
    expect(NODE_VPC_DATABASE_ENTRYPOINT).toContain("safeDatabaseFailureCode(error)");
    expect(NODE_VPC_DATABASE_ENTRYPOINT).toContain("ERR_TLS_CERT_ALTNAME_INVALID");
    expect(NODE_VPC_DATABASE_ENTRYPOINT).toContain("timedOut?'DB_CONNECT_TIMEOUT'");
    expect(NODE_VPC_DATABASE_ENTRYPOINT).not.toContain("error.message");
    expect(PYTHON_VPC_DATABASE_ENTRYPOINT).toContain("APPLICATION_VPC_DATABASE_START_FAILED:'+failure_stage");
  });
  it("rejects a foreign database role before reserving or starting a paid VM", async () => {
    const f = fixture();
    Object.assign(f.profile, { targetId: "smartspec-cloudflare-runtime", namespace: "smartspec-production-abcdef012345", instance: "basic" });
    Object.assign(f.environment, { DATABASE_URL: "postgresql://sah_cf_app_ffffffffffff:fixture-secret@db.smartaihub.app:5433/fixture",
      CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT: "private-vpc-websocket-v1" });
    await expect(f.controller.ensureRunning()).rejects.toThrow("DATABASE_SCOPE_DENIED");
    expect(f.container.start).not.toHaveBeenCalled(); expect(f.storage.put).not.toHaveBeenCalled();
  });
  it("accepts a monthly bounded production profile and rejects longer or larger compute authority", () => {
    const f = fixture();
    Object.assign(f.profile, { targetId: "smartspec-cloudflare-runtime", namespace: "smartspec-production-abcdef012345",
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), maxStarts: 600,
      maxComputeSeconds: 360_000, hardLifetimeSeconds: 600, idleTimeoutSeconds: 30, instance: "basic" });
    expect(() => validateApplicationHttpProfile(f.profile)).not.toThrow();
    expect(() => validateApplicationHttpProfile({ ...f.profile, maxStarts: 601 })).toThrow("APPLICATION_HTTP_PROFILE_DENIED");
    expect(() => validateApplicationHttpProfile({ ...f.profile, maxComputeSeconds: 360_001 })).toThrow("APPLICATION_HTTP_PROFILE_DENIED");
    expect(() => validateApplicationHttpProfile({ ...f.profile, instance: "standard-1" })).toThrow("APPLICATION_HTTP_PROFILE_DENIED");
    expect(() => validateApplicationHttpProfile({ ...f.profile, expiresAt: new Date(Date.now() + 32 * 86_400_000).toISOString() })).toThrow("APPLICATION_HTTP_PROFILE_DENIED");
  });
  it("accepts the bounded six-hour Staging deployment window and rejects longer profiles", () => {
    const f = fixture();
    const issuedAt = Date.now();
    f.profile.issuedAt = new Date(issuedAt).toISOString();
    f.profile.expiresAt = new Date(issuedAt + 6 * 60 * 60_000).toISOString();
    expect(() => validateApplicationHttpProfile(f.profile)).not.toThrow();
    expect(() => validateApplicationHttpProfile({ ...f.profile,
      expiresAt: new Date(issuedAt + 6 * 60 * 60_000 + 1).toISOString() })).toThrow("APPLICATION_HTTP_PROFILE_DENIED");
  });
  it.each([
    ["node-http", "/readyz"],
    ["python-http", "/health"],
  ] as const)("waits for database readiness before forwarding %s traffic", async (runtime, expectedPath) => {
    const f = fixture();
    if (runtime === "python-http") {
      f.profile.runtime = runtime;
      f.profile.image = f.profile.image.replace("-node-http@", "-python-http@");
      f.container.images.python = f.profile.image;
    }
    const deadline = await f.controller.ensureRunning();
    await f.controller.forward(new Request("http://application.internal/trpc/auth.me"), deadline);
    const probe = f.fetch.mock.calls.find(([input]) => typeof input === "string")?.[0] as string;
    expect(probe).toBe(`http://application.internal${expectedPath}`);
  });

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
  it("keeps the admitted request alive for a real cold start observed after 108 seconds", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      f.profile.hardLifetimeSeconds = 180;
      f.profile.maxComputeSeconds = 360;
      const deadline = await f.controller.ensureRunning(); let probes = 0;
      f.fetch.mockImplementation(async input => {
        if (input instanceof Request) return new Response("actual API response");
        probes++; f.advance(200);
        if (probes < 541) throw new Error("port not ready");
        return new Response(null, { status: 200 });
      });
      const response = f.controller.forward(new Request("http://application.internal/trpc/auth.me"), deadline);
      await vi.runAllTimersAsync();
      expect(await (await response).text()).toBe("actual API response");
      expect(probes).toBe(541);
      expect(f.container.start).toHaveBeenCalledOnce();
      expect(f.fetch.mock.calls.filter(([input]) => input instanceof Request)).toHaveLength(1);
      expect(f.records.get("application-http-lifecycle-v1")).toMatchObject({ starts: 1, reservedSeconds: 180 });
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
  it("bounds a stalled provider getState call without blocking lifecycle diagnostics", async () => {
    const f = fixture();
    f.container.getState.mockReturnValue(new Promise(() => {}) as never);
    await expect(f.controller.diagnostics()).resolves.toMatchObject({ running: false, starts: 0, containerState: null, failure: null });
    expect(f.container.start).not.toHaveBeenCalled();
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

  it("keeps Container control-plane idle-bound calls outside the DO critical-section path", async () => {
    const f = fixture();
    let finishIdleBound!: () => void;
    f.container.setInactivityTimeout.mockReturnValue(new Promise<void>(resolve => { finishIdleBound = resolve; }));
    const deadline = await f.controller.ensureRunning({ deferInactivityTimeout: true });
    expect(f.container.start).toHaveBeenCalledOnce();
    expect(f.container.setInactivityTimeout).not.toHaveBeenCalled();
    const setting = f.controller.applyInactivityTimeout();
    await Promise.resolve();
    expect(f.container.setInactivityTimeout).toHaveBeenCalledWith(10_000);
    let completed = false;
    void setting.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    finishIdleBound();
    await setting;
    expect(await f.controller.forward(new Request("http://application.internal/healthz"), deadline)).toBeInstanceOf(Response);
  });

  it("destroys the instance when the deferred idle bound cannot be installed", async () => {
    const f = fixture();
    await f.controller.ensureRunning({ deferInactivityTimeout: true });
    f.container.setInactivityTimeout.mockRejectedValueOnce(new Error("idle unavailable"));
    await expect(f.controller.applyInactivityTimeout()).rejects.toThrow("idle unavailable");
    expect(f.container.destroy).toHaveBeenCalledOnce();
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

  it("resets the Staging budget for the same configuration after its one-hour window", async () => {
    const f = fixture();
    const issuedAt = Date.now() - 1000;
    f.profile.issuedAt = new Date(issuedAt).toISOString();
    f.profile.expiresAt = new Date(issuedAt + 6 * 60 * 60_000).toISOString();
    await f.controller.ensureRunning();
    f.container.running = false;
    f.advance(1000);
    await f.controller.ensureRunning();
    f.container.running = false;
    await expect(f.controller.ensureRunning()).rejects.toThrow("COMPUTE_BUDGET_EXHAUSTED");

    f.advance(60 * 60_000);
    await f.controller.ensureRunning();
    expect(f.records.get("application-http-lifecycle-v1")).toMatchObject({
      starts: 1,
      reservedSeconds: 60,
    });
    expect(f.container.start).toHaveBeenCalledTimes(3);
  });

  it("preserves the production usage budget across config revisions and resets only after 31 days", async () => {
    const f = fixture();
    let now = Date.now();
    Object.assign(f.profile, { targetId: "smartspec-cloudflare-runtime", namespace: "smartspec-production-abcdef012345",
      expiresAt: new Date(now + 30 * 86_400_000).toISOString(), maxStarts: 600, maxComputeSeconds: 360_000,
      hardLifetimeSeconds: 600, idleTimeoutSeconds: 30, instance: "basic" });
    const controllerForCurrentProfile = () => new ApplicationHttpContainerController(
      f.container as never, f.storage, f.profile, f.environment, () => now);
    await controllerForCurrentProfile().ensureRunning();
    f.container.running = false;

    f.profile.configurationRef = `cf-origin:${"e".repeat(64)}`;
    f.profile.issuedAt = new Date(now + 1).toISOString();
    f.profile.expiresAt = new Date(now + 30 * 86_400_000).toISOString();
    now += 2;
    await controllerForCurrentProfile().ensureRunning();
    const carried = f.records.get("application-http-lifecycle-v1");
    expect(carried).toMatchObject({ starts: 2, reservedSeconds: 1200 });

    f.container.running = false;
    now += 31 * 86_400_000;
    f.profile.configurationRef = `cf-origin:${"f".repeat(64)}`;
    f.profile.issuedAt = new Date(now - 1).toISOString();
    f.profile.expiresAt = new Date(now + 30 * 86_400_000).toISOString();
    await controllerForCurrentProfile().ensureRunning();
    const renewed = f.records.get("application-http-lifecycle-v1");
    expect(renewed).toMatchObject({ starts: 1, reservedSeconds: 600 });
  });

  it("allows a newly authorized bounded operation without resetting cumulative usage or allowing the same operation to refill", async () => {
    const f = fixture(); let now = Date.now();
    Object.assign(f.profile, { targetId: "smartspec-cloudflare-runtime", namespace: "smartspec-production-abcdef012345",
      instance: "basic", maxStarts: 2, maxComputeSeconds: 120, hardLifetimeSeconds: 60 });
    const controller = () => new ApplicationHttpContainerController(f.container as never, f.storage, f.profile, f.environment, () => now);
    await controller().ensureRunning(); f.container.running = false;
    await controller().ensureRunning(); f.container.running = false;
    await expect(controller().ensureRunning()).rejects.toThrow("COMPUTE_BUDGET_EXHAUSTED");
    now += 2000; f.profile.configurationRef = `cf-origin:${"e".repeat(64)}`; f.profile.issuedAt = new Date(now - 1).toISOString();
    await controller().ensureRunning(); f.container.running = false;
    expect(f.records.get("application-http-lifecycle-v1")).toMatchObject({ starts: 3, reservedSeconds: 180,
      operationRef: f.profile.configurationRef, operationStarts: 1, operationReservedSeconds: 60 });
    expect(await controller().diagnostics()).toMatchObject({ starts: 1, reservedSeconds: 60 });
    now += 2000; f.profile.issuedAt = new Date(now - 1).toISOString();
    await expect(controller().ensureRunning()).rejects.toThrow("CONFIGURATION_CHANGED");
    expect(f.container.start).toHaveBeenCalledTimes(3);
  });

  it("continues the observed legacy ledger of two starts and 911 seconds with a fresh bounded capability", async () => {
    const f = fixture();
    Object.assign(f.profile, { targetId: "smartspec-cloudflare-runtime", namespace: "smartspec-production-abcdef012345",
      instance: "basic", maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600 });
    f.records.set("application-http-lifecycle-v1", { scope: "a".repeat(64), issuedAt: Date.parse(f.profile.issuedAt) - 1000,
      budgetWindowStartedAt: Date.parse(f.profile.issuedAt) - 1000, starts: 2, reservedSeconds: 911, activeUntil: null });
    await f.controller.ensureRunning();
    const state = f.records.get("application-http-lifecycle-v1");
    expect(state).toMatchObject({ starts: 3, operationRef: f.profile.configurationRef, operationStarts: 1 });
    expect((state as any).reservedSeconds).toBeGreaterThan(911);
    expect((state as any).operationReservedSeconds).toBeLessThanOrEqual(600);
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

  it("returns a WebSocket upgrade directly without the bounded HTTP response timeout", async () => {
    const f = fixture(), deadline = await f.controller.ensureRunning();
    const request = new Request("https://origin-staging.smartaihub.app/api/voice/stream", { headers: {
      upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", origin: "https://origin-staging.smartaihub.app",
    } });
    const socketResponse = { status: 101, headers: new Headers({ upgrade: "websocket" }), webSocket: { close: vi.fn() }, body: null } as unknown as Response;
    f.fetch.mockImplementation(async input => input instanceof Request ? socketResponse : new Response(null, { status: 200 }));
    expect(await f.controller.forward(request, deadline)).toBe(socketResponse);
    const options = f.fetch.mock.calls.find(([input]) => input instanceof Request)?.[1] as RequestInit;
    expect(options.signal).toBe(request.signal);
  });
});
