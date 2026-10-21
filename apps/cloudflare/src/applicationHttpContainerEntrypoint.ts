import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { ApplicationHttpContainerController, applicationHttpInstanceName, validateApplicationHttpProfilePair, type ApplicationHttpProfile } from "./applicationHttpContainer";
import { applicationHttpHostname, forwardApplicationHttpBridge, type ApplicationHttpBindings } from "./applicationHttpBridge";

type ApplicationEnvironment = ApplicationHttpBindings & {
  CLOUDFLARE_NODE_HTTP_SECRETS?: string;
  CLOUDFLARE_PYTHON_HTTP_SECRETS?: string;
};

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
 * secrets, max_instances=1 per runtime, and the matching immutable images. */
class ApplicationHttpContainer extends DurableObject<ApplicationEnvironment> {
  private readonly controller: ApplicationHttpContainerController;

  constructor(ctx: DurableObjectState, env: ApplicationEnvironment, runtime: ApplicationHttpProfile["runtime"]) {
    super(ctx, env);
    try {
      if (!ctx.container || ctx.id.name !== applicationHttpInstanceName(runtime) || env.CLOUDFLARE_ENVIRONMENT !== "staging" ||
          env.CLOUDFLARE_CONTAINER_POLICY !== "on-demand") throw Error();
      const node: ApplicationHttpProfile = JSON.parse(env.CLOUDFLARE_NODE_HTTP_PROFILE ?? "null");
      const python: ApplicationHttpProfile = JSON.parse(env.CLOUDFLARE_PYTHON_HTTP_PROFILE ?? "null");
      if (!node || !python) throw Error();
      validateApplicationHttpProfilePair(node, python);
      const profile = runtime === "node-http" ? node : python;
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
        await this.controller.restore();
      } catch {
        if (ctx.container?.running) await ctx.container.destroy("application private bridge unavailable");
        throw new Error("APPLICATION_HTTP_BRIDGE_BINDING_REQUIRED");
      }
    });
  }

  async fetch(request: Request) {
    if (request.headers.has("upgrade")) return new Response(null, { status: 426 });
    if (request.signal.aborted) return new Response(null, { status: 499 });
    try {
      const deadline = await this.ctx.blockConcurrencyWhile(() => this.controller.ensureRunning());
      // HTTP I/O stays outside the 30-second concurrency gate. Cleanup alarms
      // and the image's independent supervisor remain able to enforce expiry.
      return await this.controller.forward(request, deadline);
    } catch {
      return Response.json({ error: "APPLICATION_HTTP_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }

  alarm() { return this.ctx.blockConcurrencyWhile(() => this.controller.expire()); }
}

export class StagingNodeHttpContainer extends ApplicationHttpContainer {
  constructor(ctx: DurableObjectState, env: ApplicationEnvironment) { super(ctx, env, "node-http"); }
}
export class StagingPythonHttpContainer extends ApplicationHttpContainer {
  constructor(ctx: DurableObjectState, env: ApplicationEnvironment) { super(ctx, env, "python-http"); }
}
