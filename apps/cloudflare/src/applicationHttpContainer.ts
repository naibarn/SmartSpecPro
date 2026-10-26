import { applicationVpcDatabaseEntrypoint } from "./applicationDatabaseEntrypoints";
/** Private HTTP lifecycle, separate from canonical background job execution.
 * Deployment configuration remains the authority for images, secrets and scope.
 * This module neither provisions resources nor publishes public start routes. */
export type ApplicationHttpProfile = {
  configurationRef: string;
  sourceSha: string;
  targetId: "smartspec-cloudflare-staging" | "smartspec-cloudflare-runtime";
  runtime: "node-http" | "python-http";
  accountRef: string;
  namespace: string;
  image: string;
  issuedAt: string;
  expiresAt: string;
  maxStarts: number;
  maxComputeSeconds: number;
  hardLifetimeSeconds: number;
  idleTimeoutSeconds: number;
  instance: "lite" | "basic" | "standard-1";
  networkAccess: "application-outbound";
};
type LifecycleState = {
  scope: string;
  issuedAt: number;
  budgetWindowStartedAt: number;
  starts: number;
  reservedSeconds: number;
  activeUntil: number | null;
};
type Storage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(time: number): Promise<void>;
};
type NativeContainer = Pick<Container, "running" | "images" | "inspect" | "start" | "destroy" | "getTcpPort" | "setInactivityTimeout" | "monitor"> & {
  /** Added to the platform API after the pinned Workers type snapshot. */
  getState?: () => Promise<unknown>;
};
type ContainerExit = { state: "exited" | "failed"; exitCode?: number };
type ContainerRuntimeState = { status: string; lastChange?: number; exitCode?: number };
const KEY = "application-http-lifecycle-v1";
const DIAGNOSTIC_KEY = "application-http-diagnostic-v1";
const DENIED = "APPLICATION_HTTP_PROFILE_DENIED";
const APPLICATION_HTTP_READINESS_WINDOW_MS = 150_000;
/** Keep one durable budget ledger per environment, runtime and tenant/project.
 * Configuration revisions must not create a fresh paid-usage allowance. */
export const applicationHttpInstanceName = (runtime: ApplicationHttpProfile["runtime"], namespace: string,
  targetId: ApplicationHttpProfile["targetId"] = "smartspec-cloudflare-staging") => {
  const expectedPrefix = targetId === "smartspec-cloudflare-staging" ? "smartspec-staging-" : "smartspec-production-";
  if (!new RegExp(`^${expectedPrefix}[a-f0-9]{12}$`).test(namespace)) throw new Error(DENIED);
  return `${targetId}:${runtime}:${namespace}`;
};

export function validateApplicationHttpProfile(value: ApplicationHttpProfile, now = Date.now()): void {
  const issuedAt = Date.parse(value.issuedAt), expiresAt = Date.parse(value.expiresAt);
  const integers = [value.maxStarts, value.maxComputeSeconds, value.hardLifetimeSeconds, value.idleTimeoutSeconds];
  const expectedNamespacePrefix = value.targetId === "smartspec-cloudflare-staging" ? "smartspec-staging-" :
    value.targetId === "smartspec-cloudflare-runtime" ? "smartspec-production-" : null;
  const production = value.targetId === "smartspec-cloudflare-runtime";
  const maxLifetimeMs = production ? 31 * 86_400_000 : 3_600_000;
  const namespaceSuffix = /-([a-f0-9]{12})$/.exec(value.namespace)?.[1];
  if (!expectedNamespacePrefix || !["node-http", "python-http"].includes(value.runtime) ||
      !/^cf-origin:[a-f0-9]{64}$/.test(value.configurationRef) || !/^[a-f0-9]{40}$/.test(value.sourceSha) ||
      !/^[a-f0-9]{32}$/.test(value.accountRef) ||
      !new RegExp(`^${expectedNamespacePrefix}[a-f0-9]{12}$`).test(value.namespace) ||
      value.image !== `registry.cloudflare.com/${value.accountRef}/smartspec-staging-${namespaceSuffix}-${value.runtime}@sha256:${value.image.split("@sha256:")[1]}` ||
      !/@sha256:[a-f0-9]{64}$/.test(value.image) ||
      !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now || expiresAt <= now || expiresAt - issuedAt > maxLifetimeMs ||
      integers.some(number => !Number.isSafeInteger(number) || number <= 0) ||
      (production ? value.maxStarts > 600 || value.maxComputeSeconds > 360_000 || value.instance !== "basic" : value.maxStarts > 2 || value.maxComputeSeconds > 1200) ||
      value.hardLifetimeSeconds > 600 ||
      value.idleTimeoutSeconds > 30 || value.idleTimeoutSeconds > value.hardLifetimeSeconds ||
      value.maxComputeSeconds < value.hardLifetimeSeconds || !["lite", "basic", "standard-1"].includes(value.instance) ||
      value.networkAccess !== "application-outbound") throw new Error(DENIED);
}

/** Both services must belong to the same exact deployment capability. A
 * separately valid Python profile must never become another tenant's bridge. */
export function validateApplicationHttpProfilePair(node: ApplicationHttpProfile, python: ApplicationHttpProfile, now = Date.now()) {
  validateApplicationHttpProfile(node, now);
  validateApplicationHttpProfile(python, now);
  const paired = ["configurationRef", "sourceSha", "targetId", "accountRef", "namespace", "issuedAt", "expiresAt"] as const;
  if (node.runtime !== "node-http" || python.runtime !== "python-http" || paired.some(key => node[key] !== python[key]))
    throw new Error("APPLICATION_HTTP_PROFILE_PAIR_DENIED");
}

function applicationEnvironment(profile: ApplicationHttpProfile, values: Record<string, string>, deadline: number) {
  const entries = Object.entries(values);
  if (entries.length > 128 || JSON.stringify(values).length > 65_536 || entries.some(([key, value]) =>
    !/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== "string" || value.includes("\0") ||
    /^(?:NODE_OPTIONS|NODE_PATH|TSX_TSCONFIG_PATH|PYTHONPATH|PYTHONHOME|LD_.*|PATH)$/.test(key)
  )) throw new Error(DENIED);
  const nodeOrigin = profile.runtime === "node-http" ? "http://127.0.0.1:3000" : "http://node.application.internal";
  const pythonOrigin = profile.runtime === "python-http" ? "http://127.0.0.1:8000" : "http://python.application.internal";
  return { ...values, NODE_ENV: "production", ENVIRONMENT: "production", DEBUG: "false",
    SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http", CLOUDFLARE_CONTAINER_POLICY: "on-demand",
    CLOUDFLARE_APPLICATION_BRIDGE: "private-http-v1", PYTHON_BACKEND_URL: pythonOrigin, BACKEND_URL: pythonOrigin,
    NODE_SERVER_INTERNAL_URL: nodeOrigin, NODEJS_INTERNAL_URL: nodeOrigin, NODE_SERVER_URL: nodeOrigin,
    SMARTSPEC_INTERNAL_URL: nodeOrigin, SMARTSPEC_WEB_GATEWAY_URL: nodeOrigin,
    SMARTSPEC_MCP_BASE_URL: !values.SMARTSPEC_MCP_BASE_URL || values.SMARTSPEC_MCP_BASE_URL === values.SMARTSPEC_WEB_GATEWAY_URL
      ? nodeOrigin : values.SMARTSPEC_MCP_BASE_URL,
    CLOUDFLARE_APPLICATION_EXPIRES_AT: new Date(deadline).toISOString(),
    HOST: "0.0.0.0", PORT: profile.runtime === "node-http" ? "3000" : "8000" };
}

export class ApplicationHttpContainerController {
  private phase = "initializing";
  private containerExitOutcome: ContainerExit | null = null;
  private containerMonitorStarted = false;
  private inactivityTimeoutPromise: Promise<void> | null = null;
  constructor(
    private readonly container: NativeContainer, private readonly storage: Storage,
    private readonly profile: ApplicationHttpProfile, private readonly environment: Record<string, string>,
    private readonly now: () => number = Date.now,
  ) {}

  async recordFailure(error: unknown) {
    const message = error instanceof Error ? error.message : "";
    const code = /^APPLICATION_HTTP_[A-Z0-9_]{1,100}$/.test(message) ? message : "APPLICATION_HTTP_RUNTIME_FAILURE";
    const kind = error instanceof Error && ["Error", "TypeError", "RangeError", "TimeoutError", "AbortError"].includes(error.name) ? error.name : "Error";
    const exitCode = error && typeof error === "object" && "exitCode" in error &&
      Number.isSafeInteger(error.exitCode) ? error.exitCode : undefined;
    await this.storage.put(DIAGNOSTIC_KEY, { code, kind, phase: this.phase, at: this.now(), ...(exitCode === undefined ? {} : { exitCode }) });
  }

  private async readContainerState(): Promise<ContainerRuntimeState | null> {
    if (typeof this.container.getState !== "function") return null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        this.container.getState(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error("APPLICATION_HTTP_CONTAINER_STATE_TIMEOUT")), 1_000);
        }),
      ]);
      const statuses = new Set(["provisioning", "running", "healthy", "stopping", "stopped", "stopped_with_code", "failed", "unhealthy", "inactive", "unknown"]);
      if (!raw || typeof raw !== "object") return null;
      const value = raw as Record<string, unknown>;
      if (typeof value.status !== "string" || !statuses.has(value.status) ||
          (value.lastChange !== undefined && !Number.isFinite(value.lastChange)) ||
          (value.exitCode !== undefined && !Number.isSafeInteger(value.exitCode))) return null;
      return {
        status: value.status,
        ...(typeof value.lastChange === "number" ? { lastChange: value.lastChange } : {}),
        ...(typeof value.exitCode === "number" ? { exitCode: value.exitCode } : {}),
      };
    } catch {
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private watchContainerExit() {
    // `start()` only accepts the request; the separate monitor reports an
    // asynchronous VM startup failure or a process exit without exposing raw
    // provider/container output in the durable diagnostic record.
    if (this.containerMonitorStarted) return;
    this.containerMonitorStarted = true;
    this.containerExitOutcome = null;
    let monitor: Promise<void>;
    try { monitor = this.container.monitor(); }
    catch {
      this.containerExitOutcome = { state: "failed" };
      return;
    }
    void monitor.then(
      () => ({ state: "exited" as const, exitCode: 0 }),
      error => {
        const exitCode = error && typeof error === "object" && "exitCode" in error &&
          Number.isSafeInteger(error.exitCode) ? error.exitCode : undefined;
        return { state: "failed" as const, ...(exitCode === undefined ? {} : { exitCode }) };
      },
    ).then(outcome => { this.containerExitOutcome = outcome; return outcome; });
  }

  /** No start, forwarding, secret, command or environment inspection. */
  async diagnostics() {
    const scope = await this.scope();
    // Inspect an already running instance only. Named image metadata alone
    // does not prove that an existing DO-managed VM uses the updated image.
    let observed: Awaited<ReturnType<NativeContainer["inspect"]>> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (this.container.running) observed = await Promise.race([this.container.inspect(),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1_000); })]);
    } catch { /* Missing image readback remains unverified, never a start. */ }
    finally { if (timer) clearTimeout(timer); }
    const state = await this.storage.get<LifecycleState>(KEY);
    const failure = await this.storage.get<{ code: string; kind: string; phase: string; at: number; exitCode?: number }>(DIAGNOSTIC_KEY);
    return { runtime: this.profile.runtime, running: this.container.running,
      image: observed?.image === this.profile.image ? this.profile.image : null,
      starts: state?.starts ?? 0, reservedSeconds: state?.reservedSeconds ?? 0,
      activeUntil: state?.activeUntil ?? null,
      maxStarts: this.profile.maxStarts, maxComputeSeconds: this.profile.maxComputeSeconds,
      containerState: await this.readContainerState(),
      configurationMatches: !state || state.scope === scope, failure: failure ?? null };
  }

  /** Canonical bounded test compensation; never resets the paid-usage ledger. */
  async stop() {
    if (this.container.running) await this.container.destroy("application test compensation");
    const state = await this.storage.get<LifecycleState>(KEY);
    if (state) await this.storage.put(KEY, { ...state, activeUntil: null });
    return { stopped: !this.container.running, runtime: this.profile.runtime };
  }

  private async scope() {
    validateApplicationHttpProfile(this.profile, this.now());
    applicationEnvironment(this.profile, this.environment, this.now() + 1000);
    const alias = this.profile.runtime === "node-http" ? "node" : "python";
    if (this.container.images[alias] !== this.profile.image) throw new Error("APPLICATION_HTTP_IMAGE_BINDING_MISMATCH");
    const canonical = JSON.stringify({ profile: Object.fromEntries(Object.entries(this.profile).sort(([a], [b]) => a.localeCompare(b))),
      environment: Object.fromEntries(Object.entries(this.environment).sort(([a], [b]) => a.localeCompare(b))) });
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  /** Call under the DO concurrency gate. Reserve worst-case compute and persist
   * the cleanup alarm BEFORE boot, including a boot with an uncertain response. */
  async ensureRunning(options: { deferInactivityTimeout?: boolean } = {}) {
    this.phase = "scope";
    let scope: string;
    try { scope = await this.scope(); }
    catch (error) { if (this.container.running) await this.container.destroy("invalid application configuration"); throw error; }
    let previous = await this.storage.get<LifecycleState>(KEY);
    const production = this.profile.targetId === "smartspec-cloudflare-runtime";
    const maxLifetimeStarts = production ? 600 : 2;
    const maxLifetimeCompute = production ? 360_000 : 1200;
    if (previous && (!/^[a-f0-9]{64}$/.test(previous.scope) || !Number.isFinite(previous.issuedAt) ||
        !Number.isSafeInteger(previous.starts) || previous.starts < 0 || previous.starts > maxLifetimeStarts ||
        !Number.isSafeInteger(previous.reservedSeconds) || previous.reservedSeconds < 0 || previous.reservedSeconds > maxLifetimeCompute ||
        (previous.budgetWindowStartedAt !== undefined && !Number.isFinite(previous.budgetWindowStartedAt)) ||
        (previous.activeUntil !== null && !Number.isFinite(previous.activeUntil)))) {
      if (this.container.running) await this.container.destroy("invalid application lifecycle state");
      throw new Error("APPLICATION_HTTP_STATE_INVALID");
    }
    if (previous && previous.scope !== scope) {
      if (this.container.running) await this.container.destroy("application configuration changed");
      // Only a newer exact deployment capability can replace configuration.
      // Preserve paid-usage counters through revisions within the same window.
      if (previous.issuedAt >= Date.parse(this.profile.issuedAt)) throw new Error("APPLICATION_HTTP_CONFIGURATION_CHANGED");
      const budgetWindowStartedAt = previous.budgetWindowStartedAt ?? previous.issuedAt;
      const windowMs = production ? 31 * 86_400_000 : 3_600_000;
      previous = this.now() - budgetWindowStartedAt >= windowMs
        ? { scope, issuedAt: Date.parse(this.profile.issuedAt), budgetWindowStartedAt: this.now(), starts: 0, reservedSeconds: 0, activeUntil: null }
        : { ...previous, scope, issuedAt: Date.parse(this.profile.issuedAt), budgetWindowStartedAt, activeUntil: null };
    }
    if (this.container.running) {
      if (!previous?.activeUntil || previous.activeUntil <= this.now()) {
        await this.container.destroy("unowned or expired application process");
        throw new Error("APPLICATION_HTTP_ACTIVE_SCOPE_REQUIRED");
      }
      this.phase = "inspect";
      const observed = await this.container.inspect();
      if (!observed || observed.labels.scope !== scope || (observed.image && observed.image !== this.profile.image)) {
        await this.container.destroy("application process scope mismatch");
        throw new Error("APPLICATION_HTTP_ACTIVE_SCOPE_REQUIRED");
      }
      try {
        this.phase = "restore-bounds";
        await this.storage.setAlarm(previous.activeUntil);
        if (!options.deferInactivityTimeout) await this.container.setInactivityTimeout(this.profile.idleTimeoutSeconds * 1000);
        this.watchContainerExit();
      } catch (error) {
        await this.container.destroy("application cleanup bounds unavailable");
        throw error;
      }
      return previous.activeUntil;
    }
    this.phase = "budget";
    const deadline = Math.min(Date.parse(this.profile.expiresAt), this.now() + this.profile.hardLifetimeSeconds * 1000);
    const reservation = Math.ceil((deadline - this.now()) / 1000);
    const state: LifecycleState = previous ?? { scope, issuedAt: Date.parse(this.profile.issuedAt), budgetWindowStartedAt: this.now(), starts: 0, reservedSeconds: 0, activeUntil: null };
    if (state.starts >= this.profile.maxStarts || reservation < 1 ||
        state.reservedSeconds + reservation > this.profile.maxComputeSeconds) throw new Error("APPLICATION_HTTP_COMPUTE_BUDGET_EXHAUSTED");
    const env = applicationEnvironment(this.profile, this.environment, deadline);
    const privateDatabase = this.environment.CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT === "private-vpc-websocket-v1";
    if (privateDatabase && (this.profile.targetId !== "smartspec-cloudflare-runtime" ||
        new URL(this.environment.DATABASE_URL).username !== `sah_cf_app_${this.profile.namespace.slice(-12)}`))
      throw Error("APPLICATION_HTTP_DATABASE_SCOPE_DENIED");
    await this.storage.put(KEY, { ...state, starts: state.starts + 1, reservedSeconds: state.reservedSeconds + reservation, activeUntil: deadline });
    await this.storage.setAlarm(deadline);
    this.inactivityTimeoutPromise = null;
    this.phase = "start";
    this.container.start({ image: this.profile.image, instance: this.profile.instance, env,
      ...(privateDatabase ? { entrypoint: applicationVpcDatabaseEntrypoint(this.profile.runtime) } : {}),
      enableInternet: true, labels: { scope } });
    this.watchContainerExit();
    this.phase = "idle-bound";
    if (!options.deferInactivityTimeout) await this.applyInactivityTimeout();
    return deadline;
  }

  /** Provider calls that can wait on Container control plane must stay outside
   * DurableObjectState.blockConcurrencyWhile's 30-second critical section. */
  async applyInactivityTimeout() {
    if (!this.inactivityTimeoutPromise) {
      this.inactivityTimeoutPromise = Promise.resolve().then(() => this.container.setInactivityTimeout(this.profile.idleTimeoutSeconds * 1000))
        .then(() => undefined)
        .catch(async error => {
          await this.container.destroy("application idle bound unavailable");
          this.inactivityTimeoutPromise = null;
          throw error;
        });
    }
    await this.inactivityTimeoutPromise;
  }

  async forward(request: Request, deadline: number) {
    this.phase = "readiness";
    const websocket = request.headers.get("upgrade")?.toLowerCase() === "websocket";
    const port = this.container.getTcpPort(this.profile.runtime === "node-http" ? 3000 : 8000);
    // Liveness only proves that the process responds; the application route
    // must not go live until its retained PostgreSQL control plane is ready.
    const readinessPath = this.profile.runtime === "node-http" ? "/readyz" : "/health";
    // A live staging boot reached HTTP-ready at about 108 seconds. Keep enough
    // of the existing hard lifetime for that cold start while still bounding
    // readiness and reserving no compute beyond the already-approved profile.
    const readyUntil = Math.min(deadline, this.now() + APPLICATION_HTTP_READINESS_WINDOW_MS);
    const maxAttempts = Math.max(0, Math.ceil((readyUntil - this.now()) / 200));
    let ready = false;
    for (let attempt = 0; attempt < maxAttempts && this.now() < readyUntil; attempt++) {
      if (request.signal.aborted) throw new Error("APPLICATION_HTTP_CALLER_CANCELLED");
      if (this.containerExitOutcome) {
        const error = new Error("APPLICATION_HTTP_CONTAINER_EXITED_BEFORE_READY");
        if (this.containerExitOutcome.exitCode !== undefined) Object.assign(error, { exitCode: this.containerExitOutcome.exitCode });
        throw error;
      }
      try {
        const response = await port.fetch(`http://application.internal${readinessPath}`, {
          signal: AbortSignal.timeout(Math.max(1, Math.min(1000, readyUntil - this.now()))),
        });
        ready = response.status === 200;
        await response.body?.cancel();
      } catch { /* Readiness GETs only; never replay the user's operation. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready || this.now() >= deadline) {
      const state = await this.readContainerState();
      if (state && ["failed", "stopped", "stopped_with_code", "unhealthy"].includes(state.status)) {
        const error = new Error("APPLICATION_HTTP_CONTAINER_EXITED_BEFORE_READY");
        if (state.exitCode !== undefined) Object.assign(error, { exitCode: state.exitCode });
        throw error;
      }
      throw new Error("APPLICATION_HTTP_READINESS_UNAVAILABLE");
    }
    // A compensated failure from an older image must not make a healthy
    // corrected boot fail its receipt. Never clear the lifecycle usage ledger.
    await this.storage.put(DIAGNOSTIC_KEY, null);
    this.phase = "forward";
    // A successfully upgraded socket is bounded by the existing hard Container
    // deadline/alarm. A normal HTTP response-header timeout would incorrectly
    // disconnect a legitimate long-lived realtime session after two minutes.
    return port.fetch(request, { signal: websocket ? request.signal : AbortSignal.any([
      request.signal, AbortSignal.timeout(Math.max(1, Math.min(120_000, deadline - this.now()))),
    ]) });
  }

  /** Constructor recovery restores bounds for existing compute and never boots. */
  async restore(options: { deferInactivityTimeout?: boolean } = {}) {
    if (this.container.running) await this.ensureRunning(options);
  }

  async expire() {
    const state = await this.storage.get<LifecycleState>(KEY);
    if (state?.activeUntil && state.activeUntil > this.now() && state.activeUntil <= Date.parse(this.profile.expiresAt)) {
      await this.storage.setAlarm(state.activeUntil);
      return;
    }
    if (this.container.running) await this.container.destroy("application hard deadline");
    if (state) await this.storage.put(KEY, { ...state, activeUntil: null });
  }
}
