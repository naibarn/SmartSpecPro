/** Private HTTP lifecycle, separate from canonical background job execution.
 * Deployment configuration remains the authority for images, secrets and scope.
 * This module neither provisions resources nor publishes public start routes. */
export type ApplicationHttpProfile = {
  configurationRef: string;
  sourceSha: string;
  targetId: "smartspec-cloudflare-staging";
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
/** Give every immutable configuration its own DO identity. DO storage survives
 * Worker deployments, so a fixed runtime-only name would carry old budgets,
 * diagnostics and container bindings into a new image/configuration version. */
export const applicationHttpInstanceName = (runtime: ApplicationHttpProfile["runtime"], configurationRef: string) => {
  const match = /^cf-origin:([a-f0-9]{64})$/.exec(configurationRef);
  if (!match) throw new Error(DENIED);
  return `smartspec-cloudflare-staging:${runtime}:${match[1]}`;
};

export function validateApplicationHttpProfile(value: ApplicationHttpProfile, now = Date.now()): void {
  const issuedAt = Date.parse(value.issuedAt), expiresAt = Date.parse(value.expiresAt);
  const integers = [value.maxStarts, value.maxComputeSeconds, value.hardLifetimeSeconds, value.idleTimeoutSeconds];
  if (value.targetId !== "smartspec-cloudflare-staging" || !["node-http", "python-http"].includes(value.runtime) ||
      !/^cf-origin:[a-f0-9]{64}$/.test(value.configurationRef) || !/^[a-f0-9]{40}$/.test(value.sourceSha) ||
      !/^[a-f0-9]{32}$/.test(value.accountRef) ||
      !/^smartspec-staging-[a-f0-9]{12}$/.test(value.namespace) ||
      value.image !== `registry.cloudflare.com/${value.accountRef}/${value.namespace}-${value.runtime}@sha256:${value.image.split("@sha256:")[1]}` ||
      !/@sha256:[a-f0-9]{64}$/.test(value.image) ||
      !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now || expiresAt <= now || expiresAt - issuedAt > 3_600_000 ||
      integers.some(number => !Number.isSafeInteger(number) || number <= 0) ||
      value.maxStarts > 2 || value.maxComputeSeconds > 1200 || value.hardLifetimeSeconds > 600 ||
      value.idleTimeoutSeconds > 30 || value.idleTimeoutSeconds > value.hardLifetimeSeconds ||
      value.maxComputeSeconds < value.hardLifetimeSeconds || !["lite", "basic", "standard-1"].includes(value.instance) ||
      value.networkAccess !== "application-outbound") throw new Error(DENIED);
}

/** Both services must belong to the same exact deployment capability. A
 * separately valid Python profile must never become another tenant's bridge. */
export function validateApplicationHttpProfilePair(node: ApplicationHttpProfile, python: ApplicationHttpProfile, now = Date.now()) {
  validateApplicationHttpProfile(node, now);
  validateApplicationHttpProfile(python, now);
  const paired = ["configurationRef", "sourceSha", "accountRef", "namespace", "issuedAt", "expiresAt"] as const;
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
    const state = await this.storage.get<LifecycleState>(KEY);
    const failure = await this.storage.get<{ code: string; kind: string; phase: string; at: number; exitCode?: number }>(DIAGNOSTIC_KEY);
    return { runtime: this.profile.runtime, running: this.container.running,
      starts: state?.starts ?? 0, reservedSeconds: state?.reservedSeconds ?? 0,
      activeUntil: state?.activeUntil ?? null,
      maxStarts: this.profile.maxStarts, maxComputeSeconds: this.profile.maxComputeSeconds,
      containerState: await this.readContainerState(),
      configurationMatches: !state || state.scope === scope, failure: failure ?? null };
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
    if (previous && (!/^[a-f0-9]{64}$/.test(previous.scope) || !Number.isFinite(previous.issuedAt) ||
        !Number.isSafeInteger(previous.starts) || previous.starts < 0 || previous.starts > 2 ||
        !Number.isSafeInteger(previous.reservedSeconds) || previous.reservedSeconds < 0 || previous.reservedSeconds > 1200 ||
        (previous.activeUntil !== null && !Number.isFinite(previous.activeUntil)))) {
      if (this.container.running) await this.container.destroy("invalid application lifecycle state");
      throw new Error("APPLICATION_HTTP_STATE_INVALID");
    }
    if (previous && previous.scope !== scope) {
      if (this.container.running) await this.container.destroy("application configuration changed");
      // Only a newer exact deployment capability can open a fresh budget.
      // Secrets changes or replayed old configurations cannot reset it.
      if (previous.issuedAt >= Date.parse(this.profile.issuedAt)) throw new Error("APPLICATION_HTTP_CONFIGURATION_CHANGED");
      previous = undefined;
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
    const state: LifecycleState = previous ?? { scope, issuedAt: Date.parse(this.profile.issuedAt), starts: 0, reservedSeconds: 0, activeUntil: null };
    if (state.starts >= this.profile.maxStarts || reservation < 1 ||
        state.reservedSeconds + reservation > this.profile.maxComputeSeconds) throw new Error("APPLICATION_HTTP_COMPUTE_BUDGET_EXHAUSTED");
    const env = applicationEnvironment(this.profile, this.environment, deadline);
    await this.storage.put(KEY, { ...state, starts: state.starts + 1, reservedSeconds: state.reservedSeconds + reservation, activeUntil: deadline });
    await this.storage.setAlarm(deadline);
    this.inactivityTimeoutPromise = null;
    this.phase = "start";
    this.container.start({ image: this.profile.image, instance: this.profile.instance, env,
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
    const readinessPath = this.profile.runtime === "node-http" ? "/healthz" : "/health/live";
    // Registry placement plus the request-only API startup can exceed 30s.
    // Count attempts from the bounded wait rather than cutting off after 100
    // immediate connection refusals (only about 20s at the retry interval).
    const readyUntil = Math.min(deadline, this.now() + 90_000);
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
