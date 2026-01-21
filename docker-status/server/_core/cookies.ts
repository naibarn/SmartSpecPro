import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname;

  // Extract root domain for cookie sharing across subdomains
  // e.g., docker.smartspec.pro -> .smartspec.pro
  let domain: string | undefined;

  const shouldSetDomain =
    hostname &&
    !LOCAL_HOSTS.has(hostname) &&
    !isIpAddress(hostname) &&
    hostname !== "127.0.0.1" &&
    hostname !== "::1";

  if (shouldSetDomain) {
    // For production domains like smartspec.pro or docker.smartspec.pro
    // Set domain to .smartspec.pro to share cookies across subdomains
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      // Get the last two parts (e.g., smartspec.pro from docker.smartspec.pro)
      const rootDomain = parts.slice(-2).join('.');
      domain = `.${rootDomain}`;
    }
  } else {
    // For localhost development, don't set domain attribute
    // Cookies will be scoped to the exact hostname (localhost)
    // For subdomain sharing in dev, use .local domains with hosts file
    domain = undefined;
  }

  const isSecure = isSecureRequest(req);

  return {
    domain,
    httpOnly: true,
    path: "/",
    sameSite: isSecure ? "none" : "lax",
    secure: isSecure,
  };
}
