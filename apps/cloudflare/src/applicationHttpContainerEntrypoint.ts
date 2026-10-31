import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { ApplicationHttpContainerController, applicationHttpInstanceName, validateApplicationHttpProfilePair, type ApplicationHttpProfile } from "./applicationHttpContainer";
import { applicationHttpHostname, forwardApplicationHttpBridge, validateApplicationHttpWebSocket, type ApplicationHttpBindings } from "./applicationHttpBridge";
import { APPLICATION_DATABASE_HOST, APPLICATION_DATABASE_TRANSPORT, acceptApplicationDatabaseWebSocket, pipeApplicationDatabase, validateApplicationDatabasePolicy } from "./applicationDatabaseBridge";

type ApplicationEnvironment = ApplicationHttpBindings & {
  CLOUDFLARE_NODE_HTTP_SECRETS?: string;
  CLOUDFLARE_PYTHON_HTTP_SECRETS?: string;
  CLOUDFLARE_APPLICATION_DATABASE_POLICY?: string;
  DATABASE_NETWORK?: { connect(address: { hostname: string; port: number }): Promise<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close(): Promise<void> }> };
};

/** Container egress only; fetch() never routes to this class. PostgreSQL TLS
 * and authentication stay end-to-end between the native driver and Linux. */
export class ApplicationDatabaseBridge extends WorkerEntrypoint<ApplicationEnvironment, { runtime: ApplicationHttpProfile["runtime"]; configurationRef: string }> {
  async fetch(request: Request) {
    let socket;
    try {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.protocol !== "http:" || url.hostname !== APPLICATION_DATABASE_HOST || url.port || url.pathname !== "/" || url.search ||
          request.headers.get("upgrade")?.toLowerCase() !== "websocket" || !["node-http", "python-http"].includes(this.ctx.props.runtime)) throw Error();
      const node = JSON.parse(this.env.CLOUDFLARE_NODE_HTTP_PROFILE ?? "null"), python = JSON.parse(this.env.CLOUDFLARE_PYTHON_HTTP_PROFILE ?? "null");
      const policy = validateApplicationDatabasePolicy(JSON.parse(this.env.CLOUDFLARE_APPLICATION_DATABASE_POLICY ?? "null"), node, python);
      if (this.ctx.props.configurationRef !== policy.configurationRef || !this.env.DATABASE_NETWORK) throw Error();
      socket = await this.env.DATABASE_NETWORK.connect({ hostname: policy.hostname, port: policy.port });
      const pair = new WebSocketPair(), client = pair[0], server = pair[1]; acceptApplicationDatabaseWebSocket(server);
      this.ctx.waitUntil(pipeApplicationDatabase(socket, server, Date.parse(policy.expiresAt)));
      return new Response(null, { status: 101, webSocket: client });
    } catch {
      await socket?.close().catch(() => undefined);
      return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    }
  }
}

/** Container egress loopback binding only; the public Worker has no route to
 * this entrypoint. Destination and instance names are fixed, with normal app
 * authentication retained in the receiving API. */
export class ApplicationHttpBridge extends WorkerEntrypoint<ApplicationEnvironment, { runtime: ApplicationHttpProfile["runtime"] }> {
  async fetch(request: Request) {
    try {
      return await forwardApplicationHttpBridge(request, this.ctx.props.runtime, this.env);
    } catch {
      return Response.json({ error: "APPLICATION_HTTP_BRIDGE_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
}

/** Private namespaces only. No binding or provider app is created by exporting
 * these classes. Existing canonical deployment authority must supply profiles,
 * secrets and matching immutable images. DO-managed apps use one fixed DO
 * name per runtime; scheduler max_instances does not apply to this policy. */
class ApplicationHttpContainer extends DurableObject<ApplicationEnvironment> {
  private readonly controller: ApplicationHttpContainerController;

  constructor(ctx: DurableObjectState, env: ApplicationEnvironment, runtime: ApplicationHttpProfile["runtime"]) {
    super(ctx, env);
    try {
      const expectedTarget = env.CLOUDFLARE_ENVIRONMENT === "staging" ? "smartspec-cloudflare-staging" :
        env.CLOUDFLARE_ENVIRONMENT === "production" ? "smartspec-cloudflare-runtime" : null;
      if (!ctx.container || !expectedTarget ||
          env.CLOUDFLARE_CONTAINER_POLICY !== "on-demand") throw Error();
      const node: ApplicationHttpProfile = JSON.parse(env.CLOUDFLARE_NODE_HTTP_PROFILE ?? "null");
      const python: ApplicationHttpProfile = JSON.parse(env.CLOUDFLARE_PYTHON_HTTP_PROFILE ?? "null");
      if (!node || !python) throw Error();
      validateApplicationHttpProfilePair(node, python);
      const profile = runtime === "node-http" ? node : python;
      if (profile.targetId !== expectedTarget || ctx.id.name !== applicationHttpInstanceName(runtime, profile.namespace, profile.targetId)) throw Error();
      const secrets: Record<string, string> = JSON.parse((runtime === "node-http" ? env.CLOUDFLARE_NODE_HTTP_SECRETS : env.CLOUDFLARE_PYTHON_HTTP_SECRETS) ?? "");
      if (profile.runtime !== runtime || !secrets || Array.isArray(secrets)) throw Error();
      this.controller = new ApplicationHttpContainerController(ctx.container, ctx.storage, profile, secrets);
    } catch {
      if (ctx.container?.running) void ctx.blockConcurrencyWhile(() => ctx.container!.destroy("invalid application binding"));
      throw new Error("APPLICATION_HTTP_BINDING_REQUIRED");
    }
    void ctx.blockConcurrencyWhile(async () => {
      try {
        const factory = Reflect.get(ctx.exports, "ApplicationHttpBridge");
        if (typeof factory !== "function") throw Error();
        for (const target of ["node-http", "python-http"] as const) {
          const bridge = factory({ props: { runtime: target } }) as Fetcher;
          if (!bridge || typeof bridge.fetch !== "function") throw Error();
          await ctx.container!.interceptOutboundHttp(applicationHttpHostname(target), bridge);
        }
        if (secretsUseVpc(env, runtime)) {
          const node = JSON.parse(env.CLOUDFLARE_NODE_HTTP_PROFILE ?? "null"), python = JSON.parse(env.CLOUDFLARE_PYTHON_HTTP_PROFILE ?? "null");
          const policy = validateApplicationDatabasePolicy(JSON.parse(env.CLOUDFLARE_APPLICATION_DATABASE_POLICY ?? "null"), node, python);
          const databaseFactory = Reflect.get(ctx.exports, "ApplicationDatabaseBridge");
          if (typeof databaseFactory !== "function" || !env.DATABASE_NETWORK) throw Error();
          const database = databaseFactory({ props: { runtime, configurationRef: policy.configurationRef } }) as Fetcher;
          await ctx.container!.interceptOutboundHttp(APPLICATION_DATABASE_HOST, database);
        }
        await this.controller.restore({ deferInactivityTimeout: true });
      } catch (error) {
        await this.controller.recordFailure(error).catch(() => undefined);
        if (ctx.container?.running) await ctx.container.destroy("application private bridge unavailable");
        throw new Error("APPLICATION_HTTP_BRIDGE_BINDING_REQUIRED");
      }
    }).then(async () => {
      if (!ctx.container?.running) return;
      try { await this.controller.applyInactivityTimeout(); }
      catch (error) { await this.controller.recordFailure(error).catch(() => undefined); }
    });
  }

  async fetch(request: Request) {
    if (request.headers.has("upgrade") && request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response(null, { status: 400 });
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const invalid = validateApplicationHttpWebSocket(request,
        request.headers.get("x-smartaihub-public-origin") ?? undefined);
      if (invalid) return new Response(null, { status: invalid, headers: { "cache-control": "private, no-store" } });
    }
    if (request.signal.aborted) return new Response(null, { status: 499 });
    try {
      const deadline = await this.ctx.blockConcurrencyWhile(() => this.controller.ensureRunning({ deferInactivityTimeout: true }));
      // HTTP I/O stays outside the 30-second concurrency gate. Cleanup alarms
      // and the image's independent supervisor remain able to enforce expiry.
      await this.controller.applyInactivityTimeout();
      return await this.controller.forward(request, deadline);
    } catch (error) {
      await this.controller.recordFailure(error).catch(() => undefined);
      const failure = error instanceof Error && error.message === "APPLICATION_HTTP_CONTAINER_EXITED_BEFORE_READY"
        ? error.message : "APPLICATION_HTTP_UNAVAILABLE";
      return Response.json({ error: failure }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }

  alarm() { return this.ctx.blockConcurrencyWhile(() => this.controller.expire()); }
  diagnostics() { return this.ctx.blockConcurrencyWhile(() => this.controller.diagnostics()); }
  stop() { return this.ctx.blockConcurrencyWhile(() => this.controller.stop()); }
}

function secretsUseVpc(env: ApplicationEnvironment, runtime: ApplicationHttpProfile["runtime"]) {
  const secrets = JSON.parse((runtime === "node-http" ? env.CLOUDFLARE_NODE_HTTP_SECRETS : env.CLOUDFLARE_PYTHON_HTTP_SECRETS) ?? "null");
  return secrets?.CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT === APPLICATION_DATABASE_TRANSPORT;
}

export class StagingNodeHttpContainer extends ApplicationHttpContainer {
  constructor(ctx: DurableObjectState, env: ApplicationEnvironment) { super(ctx, env, "node-http"); }
}
export class StagingPythonHttpContainer extends ApplicationHttpContainer {
  constructor(ctx: DurableObjectState, env: ApplicationEnvironment) { super(ctx, env, "python-http"); }
}
export class ProductionNodeHttpContainer extends ApplicationHttpContainer {
  constructor(ctx: DurableObjectState, env: ApplicationEnvironment) { super(ctx, env, "node-http"); }
}
export class ProductionPythonHttpContainer extends ApplicationHttpContainer {
  constructor(ctx: DurableObjectState, env: ApplicationEnvironment) { super(ctx, env, "python-http"); }
}
