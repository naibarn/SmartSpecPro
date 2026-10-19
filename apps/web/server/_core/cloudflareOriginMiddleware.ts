import type { Request, RequestHandler } from "express";
import { CLOUDFLARE_PUBLIC_ORIGIN_HEADER, parseCloudflarePublicOrigin, parseCloudflarePublicOrigins } from "@smartspec/shared/src/cloudflareOrigin";
import { isValidCloudflareOriginAttestation } from "./cloudflareOriginAttestation";

export type CloudflareOriginConfig = {
  AUTH_ORIGIN_TOKEN?: string;
  AUTH_ORIGIN_PRIVATE_HOST?: string;
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS?: string;
};

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
  resolveConfig: () => CloudflareOriginConfig = () => ({
    AUTH_ORIGIN_TOKEN: process.env.AUTH_ORIGIN_TOKEN,
    AUTH_ORIGIN_PRIVATE_HOST: process.env.AUTH_ORIGIN_PRIVATE_HOST,
    AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: process.env.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS,
  }),
): RequestHandler {
  return (req, res, next) => {
    const config = resolveConfig();
    const provided = req.get("x-cloudflare-origin-token");
    const protectedMode = config.AUTH_ORIGIN_PRIVATE_HOST !== undefined || config.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS !== undefined;
    const deny = () => res.status(403).set("cache-control", "private, no-store").json({ error: "INVALID_EDGE_ORIGIN_ATTESTATION" });

    if (!protectedMode) {
      // Preserve existing public ingress when origin connectivity is unconfigured.
      if (provided && !isValidCloudflareOriginAttestation(provided, config.AUTH_ORIGIN_TOKEN)) return deny();
      return next();
    }

    const privateHost = config.AUTH_ORIGIN_PRIVATE_HOST;
    const pinned = privateHost ? parseCloudflarePublicOrigin(`https://${privateHost}`) : null;
    // Use the raw Host, never req.hostname (which Express derives from XFH).
    const protectedIngress = Boolean(pinned && req.get("host")?.toLowerCase() === pinned.host);
    if (!provided) {
      if (protectedIngress || req.get(CLOUDFLARE_PUBLIC_ORIGIN_HEADER)) return deny();
      // Legacy public traffic keeps its actual Host; unsigned XFH cannot select
      // another tenant once this protected ingress is configured.
      delete req.headers["x-forwarded-host"];
      delete req.headers["x-forwarded-port"];
      delete req.headers.forwarded;
      return next();
    }
    if (!isValidCloudflareOriginAttestation(provided, config.AUTH_ORIGIN_TOKEN)) return deny();
    const allowed = parseCloudflarePublicOrigins(config.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS);
    if (!pinned || !allowed) {
      return res.status(503).set("cache-control", "private, no-store").json({ error: "EDGE_ORIGIN_CONFIG_UNAVAILABLE" });
    }
    const publicOrigin = parseCloudflarePublicOrigin(req.get(CLOUDFLARE_PUBLIC_ORIGIN_HEADER));
    if (!publicOrigin || !allowed.includes(publicOrigin.origin) || publicOrigin.host === pinned.host) return deny();

    delete req.headers.forwarded;
    req.headers["x-forwarded-host"] = publicOrigin.host;
    req.headers["x-forwarded-proto"] = "https";
    if (publicOrigin.port) req.headers["x-forwarded-port"] = publicOrigin.port;
    else delete req.headers["x-forwarded-port"];
    (req as OriginRequest)[verifiedPublicOrigin] = publicOrigin.origin;
    return next();
  };
}
