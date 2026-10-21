import { DurableObject } from "cloudflare:workers";
import { ApplicationHttpContainerController, applicationHttpInstanceName, type ApplicationHttpProfile } from "./applicationHttpContainer";

type ApplicationEnvironment = {
  CLOUDFLARE_NODE_HTTP_PROFILE?: string;
  CLOUDFLARE_NODE_HTTP_SECRETS?: string;
  CLOUDFLARE_PYTHON_HTTP_PROFILE?: string;
  CLOUDFLARE_PYTHON_HTTP_SECRETS?: string;
};

/** Private namespaces only. No binding or provider app is created by exporting
 * these classes. Existing canonical deployment authority must supply profiles,
 * secrets, max_instances=1 per runtime, and the matching immutable images. */
class ApplicationHttpContainer extends DurableObject<ApplicationEnvironment> {
  private readonly controller: ApplicationHttpContainerController;

  constructor(ctx: DurableObjectState, env: ApplicationEnvironment, runtime: ApplicationHttpProfile["runtime"]) {
    super(ctx, env);
    try {
      if (!ctx.container || ctx.id.name !== applicationHttpInstanceName(runtime)) throw Error();
      const profile: ApplicationHttpProfile = JSON.parse((runtime === "node-http" ? env.CLOUDFLARE_NODE_HTTP_PROFILE : env.CLOUDFLARE_PYTHON_HTTP_PROFILE) ?? "");
      const secrets: Record<string, string> = JSON.parse((runtime === "node-http" ? env.CLOUDFLARE_NODE_HTTP_SECRETS : env.CLOUDFLARE_PYTHON_HTTP_SECRETS) ?? "");
      if (profile.runtime !== runtime || !secrets || Array.isArray(secrets)) throw Error();
      this.controller = new ApplicationHttpContainerController(ctx.container, ctx.storage, profile, secrets);
    } catch {
      if (ctx.container?.running) void ctx.blockConcurrencyWhile(() => ctx.container!.destroy("invalid application binding"));
      throw new Error("APPLICATION_HTTP_BINDING_REQUIRED");
    }
    void ctx.blockConcurrencyWhile(() => this.controller.restore());
  }

  async fetch(request: Request) {
    if (request.headers.has("upgrade")) return new Response(null, { status: 426 });
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
