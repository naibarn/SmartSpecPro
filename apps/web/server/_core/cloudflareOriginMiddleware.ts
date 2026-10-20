import type { Request, RequestHandler } from "express";
import { resolveCloudflareOriginIngress, applyCloudflareOriginForwarding, cloudflareOriginEnvironment,
  type CloudflareOriginConfig } from "./cloudflareOriginIngress";
export type { CloudflareOriginConfig } from "./cloudflareOriginIngress";

const verifiedPublicOrigin = Symbol("verifiedCloudflarePublicOrigin");
type OriginRequest = Request & { [verifiedPublicOrigin]?: string };

/** Request-local provenance only: this is not an application authorization grant. */
export function getVerifiedCloudflarePublicOrigin(req: Request): string | undefined {
  return (req as OriginRequest)[verifiedPublicOrigin];
}

/** Validate protected ingress before Express consumes any forwarded hostname.
 * The custom public-origin header survives intermediate proxy header rewriting;
 * only a credentialed Worker may supply it, and its value must be allowlisted.
 * This grants no application identity, tenant membership or trusted App route.
 */
export function createCloudflareOriginMiddleware(
  resolveConfig: () => CloudflareOriginConfig = cloudflareOriginEnvironment,
): RequestHandler {
  return (req, res, next) => {
    const decision = resolveCloudflareOriginIngress(req.headers, resolveConfig());
    if (decision.status !== 200) {
      return res.status(decision.status).set("cache-control", "private, no-store").json({ error: decision.error });
    }
    applyCloudflareOriginForwarding(req.headers, decision);
    if (decision.publicOrigin) (req as OriginRequest)[verifiedPublicOrigin] = decision.publicOrigin;
    return next();
  };
}
