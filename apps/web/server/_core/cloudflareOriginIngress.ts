import { CLOUDFLARE_PUBLIC_ORIGIN_HEADER, isCanonicalWidgetBrowserOrigin, parseCloudflarePublicOrigin, parseCloudflarePublicOrigins } from "../services/cloudflareOriginContracts";
import { isValidCloudflareOriginAttestation } from "./cloudflareOriginAttestation";

export type CloudflareOriginConfig = {
  AUTH_ORIGIN_TOKEN?: string;
  AUTH_ORIGIN_PRIVATE_HOST?: string;
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS?: string;
};
export const cloudflareOriginEnvironment = (): CloudflareOriginConfig => ({
  AUTH_ORIGIN_TOKEN: process.env.AUTH_ORIGIN_TOKEN,
  AUTH_ORIGIN_PRIVATE_HOST: process.env.AUTH_ORIGIN_PRIVATE_HOST,
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: process.env.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS,
});
type Headers = Record<string, string | string[] | undefined>;
type Decision = { status: 403 | 503; error: string } | { status: 200; publicOrigin?: string; stripUnsignedForwarding?: true };

/** Shared HTTP and raw-upgrade boundary; never confers application identity. */
export function resolveCloudflareOriginIngress(headers: Headers, config: CloudflareOriginConfig): Decision {
  const provided = typeof headers["x-cloudflare-origin-token"] === "string" ? headers["x-cloudflare-origin-token"] : undefined;
  const denied = { status: 403 as const, error: "INVALID_EDGE_ORIGIN_ATTESTATION" };
  if (headers["x-cloudflare-origin-token"] !== undefined && !provided) return denied;
  const protectedMode = config.AUTH_ORIGIN_PRIVATE_HOST !== undefined || config.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS !== undefined;
  if (!protectedMode) return provided && !isValidCloudflareOriginAttestation(provided, config.AUTH_ORIGIN_TOKEN) ? denied : { status: 200 };
  const pinned = config.AUTH_ORIGIN_PRIVATE_HOST ? parseCloudflarePublicOrigin(`https://${config.AUTH_ORIGIN_PRIVATE_HOST}`) : null;
  const protectedIngress = Boolean(pinned && typeof headers.host === "string" && headers.host.toLowerCase() === pinned.host);
  if (!provided) {
    if (protectedIngress || headers[CLOUDFLARE_PUBLIC_ORIGIN_HEADER] !== undefined) return denied;
    return { status: 200, stripUnsignedForwarding: true };
  }
  if (!isValidCloudflareOriginAttestation(provided, config.AUTH_ORIGIN_TOKEN)) return denied;
  const allowed = parseCloudflarePublicOrigins(config.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS);
  if (!pinned || !allowed) return { status: 503, error: "EDGE_ORIGIN_CONFIG_UNAVAILABLE" };
  const publicOrigin = parseCloudflarePublicOrigin(headers[CLOUDFLARE_PUBLIC_ORIGIN_HEADER]);
  if (!publicOrigin || !allowed.includes(publicOrigin.origin) || publicOrigin.host === pinned.host) return denied;
  return { status: 200, publicOrigin: publicOrigin.origin };
}

export function applyCloudflareOriginForwarding(headers: Headers, decision: Extract<Decision, { status: 200 }>) {
  if (!decision.stripUnsignedForwarding && !decision.publicOrigin) return;
  delete headers.forwarded;
  delete headers["x-forwarded-host"];
  delete headers["x-forwarded-port"];
  if (decision.publicOrigin) {
    const url = new URL(decision.publicOrigin);
    headers["x-forwarded-host"] = url.host;
    headers["x-forwarded-proto"] = "https";
    if (url.port) headers["x-forwarded-port"] = url.port;
  }
}

/** Raw HTTP upgrades bypass Express. Enforce the same attestation first. */
export function authorizeCloudflareOriginUpgrade(
  req: { headers: Headers; url?: string }, socket: { write: (value: string) => unknown; destroy: () => unknown },
  config: CloudflareOriginConfig = cloudflareOriginEnvironment(),
): boolean {
  const decision = resolveCloudflareOriginIngress(req.headers, config);
  const widget = req.url?.split("?")[0] === "/widget/v1/ws";
  const browserOriginDenied = decision.status === 200 && decision.publicOrigin &&
    (widget ? !isCanonicalWidgetBrowserOrigin(req.headers.origin)
      : req.headers.origin !== undefined && req.headers.origin !== decision.publicOrigin);
  if (decision.status !== 200 || browserOriginDenied) {
    const status = decision.status === 503 ? 503 : 403;
    socket.write(`HTTP/1.1 ${status} ${status === 503 ? "Service Unavailable" : "Forbidden"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
    return false;
  }
  applyCloudflareOriginForwarding(req.headers, decision);
  return true;
}
