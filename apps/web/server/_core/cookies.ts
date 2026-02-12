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

  // IMPORTANT: For subdomain cookie sharing to work across different subdomains,
  // SameSite must be set appropriately:
  // - HTTPS: Use SameSite=none with secure=true (production standard)
  // - HTTP Development: Use SameSite=none with secure=false
  //
  // WARNING: Modern browsers reject SameSite=none with secure=false for
  // non-localhost domains. However, for development purposes with HTTP,
  // we use SameSite=none anyway. Users should use HTTPS in production.
  //
  // RECOMMENDED SETUP:
  // - Development: Use .local domains (docker.smartspec.local) with hosts file
  // - Production: Use HTTPS with real domains (docker.smartspec.pro)

  return {
    domain,
    httpOnly: true,
    path: "/",
    // SameSite handling for subdomain cookie sharing:
    // - HTTPS: Use SameSite=none with secure=true (cross-subdomain sharing works)
    // - HTTP (localhost): Use SameSite=lax (required for modern browsers to accept cookie)
    // Modern browsers REQUIRE secure=true when sameSite=none
    // For smartaihub.app and docker.smartaihub.app to share cookies, use "none" with HTTPS
    sameSite: isSecure ? "none" : "lax",
    secure: isSecure,
  };
}
