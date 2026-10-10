import WebSocket from "ws";

import {
  type MoliFeatureFlags,
  readMoliFeatureFlags,
} from "./computerUseCapabilityRouting";

export type AuthorizedMoliAttempt = {
  jobId: string;
  attemptId: string;
  tenantId: string;
  userId: string;
  projectRef: string;
  leaseId: string;
  fencingToken: string;
  deadline: string;
  sessionId: string;
  authorizationGrantRef: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
};

export type MoliRunnerPolicy = {
  getRuntimeVersion: () => Promise<string>;
  authorizeAttempt: (attempt: AuthorizedMoliAttempt) => Promise<boolean>;
  assertAttemptActive: (attempt: AuthorizedMoliAttempt) => Promise<boolean>;
  allowNavigation: (url: string, attempt: AuthorizedMoliAttempt) => Promise<boolean>;
  confirmNetworkIsolation: (attempt: AuthorizedMoliAttempt) => Promise<boolean>;
  cleanupRuntime: (attempt: AuthorizedMoliAttempt) => Promise<void>;
  recordAudit: (event: Record<string, unknown>) => Promise<void>;
};

type CdpMessage = {
  id?: number;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "127.0.0.1" || url.hostname === "[::1]")
      && !url.username && !url.password;
  } catch {
    return false;
  }
}

export class MoliCdpBrowserAdapter {
  private socket: WebSocket | null = null;
  private nextId = 0;
  private opened = false;
  private activeAttempt: AuthorizedMoliAttempt | null = null;
  private runtimeVersion: string | null = null;
  private readonly pending = new Map<number, {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }>();

  constructor(
    private readonly endpoint: string,
    private readonly policy: MoliRunnerPolicy,
    private readonly flags: MoliFeatureFlags = readMoliFeatureFlags(),
    private readonly environment = process.env.NODE_ENV,
  ) {}

  private async send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    allowCleanup = false,
  ): Promise<Record<string, unknown>> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("MOLI_CDP_NOT_CONNECTED");
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const remainingMs = this.activeAttempt ? Date.parse(this.activeAttempt.deadline) - Date.now() : 5_000;
      if (!allowCleanup && remainingMs <= 0) {
        reject(new Error("MOLI_JOB_DEADLINE_EXPIRED"));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("MOLI_CDP_TIMEOUT"));
      }, allowCleanup ? 5_000 : Math.min(5_000, remainingMs));
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  private async connect(): Promise<void> {
    if (!this.flags.moli_enabled || this.flags.moli_shadow_mode) {
      throw new Error("MOLI_EXPERIMENTAL_ADAPTER_DISABLED_OR_SHADOW_ONLY");
    }
    if (this.environment === "production") {
      throw new Error("MOLI_PRODUCTION_DISABLED");
    }
    const runtimeVersion = await this.policy.getRuntimeVersion();
    if (runtimeVersion !== "1.1.15") throw new Error("MOLI_RUNTIME_VERSION_MISMATCH");
    this.runtimeVersion = runtimeVersion;
    if (!isLoopbackUrl(this.endpoint)) throw new Error("MOLI_CDP_ENDPOINT_MUST_BE_LOOPBACK");

    const versionUrl = new URL("/json/version", this.endpoint);
    const response = await fetch(versionUrl, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) throw new Error("MOLI_CDP_VERSION_UNAVAILABLE");
    const version = await response.json() as { webSocketDebuggerUrl?: string };
    const wsUrl = version.webSocketDebuggerUrl;
    if (!wsUrl || !isLoopbackUrl(wsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:"))) {
      throw new Error("MOLI_CDP_WEBSOCKET_MUST_BE_LOOPBACK");
    }

    this.socket = new WebSocket(wsUrl);
    this.socket.on("message", (raw) => {
      let message: CdpMessage;
      try { message = JSON.parse(raw.toString()) as CdpMessage; }
      catch { return; }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "MOLI_CDP_COMMAND_FAILED"));
      else pending.resolve(message.result ?? {});
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MOLI_CDP_CONNECT_TIMEOUT")), 2_000);
      this.socket!.once("open", () => { clearTimeout(timer); resolve(); });
      this.socket!.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
  }

  async openSession(attempt: AuthorizedMoliAttempt): Promise<MoliCdpSession> {
    if (this.opened) throw new Error("MOLI_ADAPTER_ONE_SESSION_PER_INSTANCE");
    this.opened = true;
    this.activeAttempt = attempt;
    let browserContextId: string | undefined;
    try {
      for (const [key, value] of Object.entries(attempt)) {
        if (!value.trim()) throw new Error(`MOLI_ATTEMPT_${key.toUpperCase()}_REQUIRED`);
      }
      if (!Number.isFinite(Date.parse(attempt.deadline))) throw new Error("MOLI_ATTEMPT_DEADLINE_INVALID");
      if (!await this.policy.authorizeAttempt(attempt)) throw new Error("MOLI_ATTEMPT_UNAUTHORIZED");
      if (!await this.policy.assertAttemptActive(attempt)) throw new Error("MOLI_ATTEMPT_EXPIRED_OR_REVOKED");
      if (!await this.policy.confirmNetworkIsolation(attempt)) throw new Error("MOLI_NETWORK_ISOLATION_UNAVAILABLE");
      await this.connect();
      const context = await this.send("Target.createBrowserContext");
      browserContextId = String(context.browserContextId ?? "");
      if (!browserContextId) throw new Error("MOLI_BROWSER_CONTEXT_CREATE_FAILED");
      const target = await this.send("Target.createTarget", { url: "about:blank", browserContextId });
      const targetId = String(target.targetId ?? "");
      if (!targetId) throw new Error("MOLI_TARGET_CREATE_FAILED");
      const attached = await this.send("Target.attachToTarget", { targetId, flatten: true });
      const sessionId = String(attached.sessionId ?? "");
      if (!sessionId) throw new Error("MOLI_TARGET_ATTACH_FAILED");
      await this.send("Page.enable", {}, sessionId);
      await this.send("Runtime.enable", {}, sessionId);
      await this.policy.recordAudit({
        event: "moli.session.opened",
        jobId: attempt.jobId,
        attemptId: attempt.attemptId,
        tenantId: attempt.tenantId,
        userId: attempt.userId,
        projectRef: attempt.projectRef,
        leaseId: attempt.leaseId,
        fencingToken: attempt.fencingToken,
        sessionId: attempt.sessionId,
        provider: "moli",
        providerVersion: this.runtimeVersion,
        browserContextId,
      });
      return new MoliCdpSession(this, attempt, browserContextId, targetId, sessionId);
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      if (browserContextId) {
        try {
          await this.send("Target.disposeBrowserContext", { browserContextId }, undefined, true);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      try {
        await this.close();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        await this.policy.cleanupRuntime(attempt);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length) {
        try {
          await this.policy.recordAudit({
            event: "moli.runtime.cleanup_failed",
            jobId: attempt.jobId,
            attemptId: attempt.attemptId,
            tenantId: attempt.tenantId,
            userId: attempt.userId,
            projectRef: attempt.projectRef,
            leaseId: attempt.leaseId,
            fencingToken: attempt.fencingToken,
            reasonCode: "MOLI_RUNTIME_CLEANUP_FAILED",
          });
        } catch (auditError) {
          cleanupErrors.push(auditError);
        }
        throw new AggregateError([error, ...cleanupErrors], "MOLI_SESSION_OPEN_AND_CLEANUP_FAILED");
      }
      throw error;
    }
  }

  async command(method: string, params: Record<string, unknown>, sessionId: string, allowCleanup = false) {
    if (!allowCleanup && this.activeAttempt) await this.assertAttemptActive(this.activeAttempt);
    return this.send(method, params, sessionId, allowCleanup);
  }

  async assertAttemptActive(attempt: AuthorizedMoliAttempt): Promise<void> {
    if (!await this.policy.assertAttemptActive(attempt)) {
      throw new Error("MOLI_ATTEMPT_EXPIRED_OR_REVOKED");
    }
  }

  async navigationAllowed(url: string, attempt: AuthorizedMoliAttempt): Promise<boolean> {
    if (!await this.policy.assertAttemptActive(attempt)) throw new Error("MOLI_ATTEMPT_EXPIRED_OR_REVOKED");
    return this.policy.allowNavigation(url, attempt);
  }

  async recordAudit(event: Record<string, unknown>): Promise<void> {
    await this.policy.recordAudit(event);
  }

  async close(): Promise<void> {
    for (const pending of this.pending.values()) pending.reject(new Error("MOLI_CDP_CLOSED"));
    this.pending.clear();
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    await new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) return resolve();
      socket.once("close", () => resolve());
      socket.close();
      setTimeout(() => { socket.terminate(); resolve(); }, 1_000).unref();
    });
  }

  async releaseRuntime(attempt: AuthorizedMoliAttempt): Promise<void> {
    const errors: unknown[] = [];
    try {
      await this.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.policy.cleanupRuntime(attempt);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, "MOLI_RUNTIME_CLEANUP_FAILED");
  }
}

export class MoliCdpSession {
  private closed = false;

  constructor(
    private readonly adapter: MoliCdpBrowserAdapter,
    private readonly attempt: AuthorizedMoliAttempt,
    private readonly browserContextId: string,
    private readonly targetId: string,
    private readonly cdpSessionId: string,
  ) {}

  private assertOpen(): void {
    if (this.closed) throw new Error("MOLI_SESSION_INVALID");
  }

  async navigate(url: string): Promise<void> {
    this.assertOpen();
    await this.adapter.assertAttemptActive(this.attempt);
    if (!await this.adapter.navigationAllowed(url, this.attempt)) {
      throw new Error("MOLI_NAVIGATION_POLICY_DENIED");
    }
    await this.adapter.command("Page.navigate", { url }, this.cdpSessionId);
  }

  async evaluate(expression: string): Promise<unknown> {
    this.assertOpen();
    await this.adapter.assertAttemptActive(this.attempt);
    const result = await this.adapter.command("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, this.cdpSessionId);
    return (result.result as { value?: unknown } | undefined)?.value;
  }

  async fill(selector: string, value: string): Promise<void> {
    this.assertOpen();
    await this.adapter.assertAttemptActive(this.attempt);
    const document = await this.adapter.command("DOM.getDocument", {}, this.cdpSessionId);
    const root = document.root as { nodeId?: number } | undefined;
    const match = await this.adapter.command("DOM.querySelector", {
      nodeId: root?.nodeId,
      selector,
    }, this.cdpSessionId);
    const nodeId = match.nodeId;
    if (typeof nodeId !== "number" || nodeId < 1) throw new Error("MOLI_SELECTOR_NOT_FOUND");
    await this.adapter.command("DOM.focus", { nodeId }, this.cdpSessionId);
    await this.adapter.command("Input.insertText", { text: value }, this.cdpSessionId);
  }

  async close(reason: "completed" | "cancelled" = "completed"): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const cleanupErrors: unknown[] = [];
    for (const [method, params] of [
      ["Target.closeTarget", { targetId: this.targetId }],
      ["Target.disposeBrowserContext", { browserContextId: this.browserContextId }],
    ] as const) {
      try {
        await this.adapter.command(method, params, "", true);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await this.adapter.releaseRuntime(this.attempt);
    } catch (error) {
      cleanupErrors.push(error);
    }
    const binding = {
      jobId: this.attempt.jobId,
      attemptId: this.attempt.attemptId,
      tenantId: this.attempt.tenantId,
      userId: this.attempt.userId,
      projectRef: this.attempt.projectRef,
      leaseId: this.attempt.leaseId,
      fencingToken: this.attempt.fencingToken,
      sessionId: this.attempt.sessionId,
    };
    if (cleanupErrors.length) {
      await this.adapter.recordAudit({
        event: "moli.runtime.cleanup_failed",
        ...binding,
        reasonCode: "MOLI_SESSION_CLEANUP_FAILED",
      });
      throw new AggregateError(cleanupErrors, "MOLI_SESSION_CLEANUP_FAILED");
    }
    await this.adapter.recordAudit({ event: "moli.session.closed", ...binding, reason });
  }
}
