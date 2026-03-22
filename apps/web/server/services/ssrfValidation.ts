import dns from "dns";
import { isIPv4, isIPv6 } from "net";
import { URL } from "url";

// ---------------------------------------------------------------------------
// SSRF validation utilities for user-supplied URLs
// ---------------------------------------------------------------------------

class ApiValidationError extends Error {
  readonly code = "invalid_request";
  constructor(message: string) {
    super(message);
    this.name = "ApiValidationError";
  }
}

// ---------------------------------------------------------------------------
// IPv4 private range check
// ---------------------------------------------------------------------------

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true; // reject malformed
  const [a, b] = parts;
  return (
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a === 127 || // 127.0.0.0/8
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local / AWS metadata)
    a === 0 // 0.0.0.0/8
  );
}

// ---------------------------------------------------------------------------
// IPv6 private range check
// ---------------------------------------------------------------------------

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80:")) return true; // link-local (fe80::/10)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)

  // IPv4-mapped IPv6 (::ffff:x.x.x.x) — extract and re-check IPv4 portion
  const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(lower);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);

  return false;
}

// ---------------------------------------------------------------------------
// sanitizeUri — strip credentials, enforce HTTPS
// ---------------------------------------------------------------------------

export function sanitizeUri(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiValidationError(`Invalid URL: ${rawUrl}`);
  }

  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && process.env.ALLOW_HTTP_URLS === "true")
  ) {
    throw new ApiValidationError("Only HTTPS URLs are allowed");
  }

  parsed.username = "";
  parsed.password = "";

  return parsed.toString();
}

// ---------------------------------------------------------------------------
// assertPublicIp — resolve DNS and reject private/reserved IPs
// ---------------------------------------------------------------------------

export async function assertPublicIp(hostname: string): Promise<void> {
  // If hostname is already an IP literal, check directly
  if (isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new ApiValidationError("URL resolves to a private IP address");
    }
    return;
  }
  if (isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) {
      throw new ApiValidationError("URL resolves to a private IP address");
    }
    return;
  }

  // Resolve DNS — check ALL A and AAAA records
  const allAddresses: string[] = [];
  const v4 = await dns.promises.resolve4(hostname).catch(() => [] as string[]);
  const v6 = await dns.promises.resolve6(hostname).catch(() => [] as string[]);
  allAddresses.push(...v4, ...v6);

  if (allAddresses.length === 0) {
    throw new ApiValidationError(`DNS resolution returned no records for: ${hostname}`);
  }

  for (const addr of allAddresses) {
    if (isIPv4(addr) && isPrivateIPv4(addr)) {
      throw new ApiValidationError("URL resolves to a private IP address");
    }
    if (isIPv6(addr) && isPrivateIPv6(addr)) {
      throw new ApiValidationError("URL resolves to a private IP address");
    }
  }
}

// ---------------------------------------------------------------------------
// validateReferenceUrls — combined validation for reference image URL arrays
// ---------------------------------------------------------------------------

export async function validateReferenceUrls(urls: string[]): Promise<void> {
  if (urls.length > 5) {
    throw new ApiValidationError("Maximum 5 reference image URLs allowed");
  }
  for (const rawUrl of urls) {
    const sanitized = sanitizeUri(rawUrl);
    const parsed = new URL(sanitized);
    await assertPublicIp(parsed.hostname);
  }
}

// ---------------------------------------------------------------------------
// validateExtraParamsNoSsrf — synchronous check for extraParams URL values
// ---------------------------------------------------------------------------

/**
 * Validates that no top-level string value in extraParams is a URL targeting
 * internal/private hosts. Returns an array of error messages (empty = safe).
 * Runs synchronously (no DNS resolution) for use in Zod .superRefine().
 */
export function validateExtraParamsNoSsrf(
  extraParams: Record<string, unknown> | undefined,
): string[] {
  if (!extraParams) return [];
  const errors: string[] = [];
  for (const [key, value] of Object.entries(extraParams)) {
    if (typeof value !== "string") continue;
    if (!/^https?:\/\//i.test(value)) continue;
    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname;

      // Exact-match blocklist
      const lower = hostname.toLowerCase();
      if (
        lower === "localhost" ||
        lower === "host.docker.internal" ||
        lower === "0.0.0.0" ||
        lower === "[::1]" ||
        lower === "::1"
      ) {
        errors.push(`extraParams.${key} targets internal host`);
        continue;
      }

      // IPv4 range check (re-uses isPrivateIPv4 from above)
      if (isIPv4(hostname) && isPrivateIPv4(hostname)) {
        errors.push(`extraParams.${key} targets internal host`);
      }
    } catch {
      // Not a valid URL — not an SSRF risk
    }
  }
  return errors;
}

export { ApiValidationError };
