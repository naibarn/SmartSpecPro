/** Private HTTP lifecycle, separate from canonical background job execution.
 * Deployment configuration remains the authority for images, secrets and scope.
 * This module neither provisions resources nor publishes public start routes. */
export type ApplicationHttpProfile = {
  configurationRef: string;
  sourceSha: string;
  targetId: "smartspec-cloudflare-staging";
  runtime: "node-http" | "python-http";
  accountRef: string;
  image: string;
  issuedAt: string;
  expiresAt: string;
  maxStarts: number;
  maxComputeSeconds: number;
  hardLifetimeSeconds: number;
  idleTimeoutSeconds: number;
  instance: "lite" | "standard-1";
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
type NativeContainer = Pick<Container, "running" | "images" | "inspect" | "start" | "destroy" | "getTcpPort" | "setInactivityTimeout">;
const KEY = "application-http-lifecycle-v1";
const DENIED = "APPLICATION_HTTP_PROFILE_DENIED";
export const applicationHttpInstanceName = (runtime: ApplicationHttpProfile["runtime"]) => `smartspec-cloudflare-staging:${runtime}`;

export function validateApplicationHttpProfile(value: ApplicationHttpProfile, now = Date.now()): void {
  const issuedAt = Date.parse(value.issuedAt), expiresAt = Date.parse(value.expiresAt);
  const integers = [value.maxStarts, value.maxComputeSeconds, value.hardLifetimeSeconds, value.idleTimeoutSeconds];
  if (value.targetId !== "smartspec-cloudflare-staging" || !["node-http", "python-http"].includes(value.runtime) ||
      !/^cf-origin:[a-f0-9]{64}$/.test(value.configurationRef) || !/^[a-f0-9]{40}$/.test(value.sourceSha) ||
      !/^[a-f0-9]{32}$/.test(value.accountRef) ||
      value.image !== `registry.cloudflare.com/${value.accountRef}/smartspec-${value.runtime}@sha256:${value.image.split("@sha256:")[1]}` ||
      !/@sha256:[a-f0-9]{64}$/.test(value.image) ||
      !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now || expiresAt <= now || expiresAt - issuedAt > 3_600_000 ||
      integers.some(number => !Number.isSafeInteger(number) || number <= 0) ||
      value.maxStarts > 2 || value.maxComputeSeconds > 1200 || value.hardLifetimeSeconds > 600 ||
      value.idleTimeoutSeconds > 30 || value.idleTimeoutSeconds > value.hardLifetimeSeconds ||
      value.maxComputeSeconds < value.hardLifetimeSeconds || !["lite", "standard-1"].includes(value.instance) ||
      value.networkAccess !== "application-outbound") throw new Error(DENIED);
}

function applicationEnvironment(profile: ApplicationHttpProfile, values: Record<string, string>, deadline: number) {
  const entries = Object.entries(values);
  if (entries.length > 128 || JSON.stringify(values).length > 65_536 || entries.some(([key, value]) =>
    !/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== "string" || value.includes("\0") ||
    /^(?:NODE_OPTIONS|NODE_PATH|TSX_TSCONFIG_PATH|PYTHONPATH|PYTHONHOME|LD_.*|PATH)$/.test(key)
  )) throw new Error(DENIED);
  return { ...values, NODE_ENV: "production", ENVIRONMENT: "production", DEBUG: "false",
    SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http", CLOUDFLARE_CONTAINER_POLICY: "on-demand",
    CLOUDFLARE_APPLICATION_EXPIRES_AT: new Date(deadline).toISOString(),
    HOST: "0.0.0.0", PORT: profile.runtime === "node-http" ? "3000" : "8000" };
}

export class ApplicationHttpContainerController {
  constructor(
    private readonly container: NativeContainer, private readonly storage: Storage,
    private readonly profile: ApplicationHttpProfile, private readonly environment: Record<string, string>,
    private readonly now: () => number = Date.now,
  ) {}

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
  async ensureRunning() {
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
      const observed = await this.container.inspect();
      if (!observed || observed.labels.scope !== scope || (observed.image && observed.image !== this.profile.image)) {
        await this.container.destroy("application process scope mismatch");
        throw new Error("APPLICATION_HTTP_ACTIVE_SCOPE_REQUIRED");
      }
      try {
        await this.storage.setAlarm(previous.activeUntil);
        await this.container.setInactivityTimeout(this.profile.idleTimeoutSeconds * 1000);
      } catch (error) {
        await this.container.destroy("application cleanup bounds unavailable");
        throw error;
      }
      return previous.activeUntil;
    }
    const deadline = Math.min(Date.parse(this.profile.expiresAt), this.now() + this.profile.hardLifetimeSeconds * 1000);
    const reservation = Math.ceil((deadline - this.now()) / 1000);
    const state: LifecycleState = previous ?? { scope, issuedAt: Date.parse(this.profile.issuedAt), starts: 0, reservedSeconds: 0, activeUntil: null };
    if (state.starts >= this.profile.maxStarts || reservation < 1 ||
        state.reservedSeconds + reservation > this.profile.maxComputeSeconds) throw new Error("APPLICATION_HTTP_COMPUTE_BUDGET_EXHAUSTED");
    const env = applicationEnvironment(this.profile, this.environment, deadline);
    await this.storage.put(KEY, { ...state, starts: state.starts + 1, reservedSeconds: state.reservedSeconds + reservation, activeUntil: deadline });
    await this.storage.setAlarm(deadline);
    this.container.start({ image: this.profile.image, instance: this.profile.instance, env,
      enableInternet: true, labels: { scope } });
    try { await this.container.setInactivityTimeout(this.profile.idleTimeoutSeconds * 1000); }
    catch (error) { await this.container.destroy("application idle bound unavailable"); throw error; }
    return deadline;
  }

  async forward(request: Request, deadline: number) {
    if (request.headers.has("upgrade")) throw new Error("APPLICATION_HTTP_REALTIME_OWNER_REQUIRED");
    const port = this.container.getTcpPort(this.profile.runtime === "node-http" ? 3000 : 8000);
    const readinessPath = this.profile.runtime === "node-http" ? "/healthz" : "/health/live";
    const readyUntil = Math.min(deadline, this.now() + 30_000);
    let ready = false;
    for (let attempt = 0; attempt < 100 && this.now() < readyUntil; attempt++) {
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
    if (!ready || this.now() >= deadline) throw new Error("APPLICATION_HTTP_READINESS_UNAVAILABLE");
    return port.fetch(request, { signal: AbortSignal.any([
      request.signal, AbortSignal.timeout(Math.max(1, Math.min(120_000, deadline - this.now()))),
    ]) });
  }

  /** Constructor recovery restores bounds for existing compute and never boots. */
  async restore() {
    if (this.container.running) await this.ensureRunning();
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
