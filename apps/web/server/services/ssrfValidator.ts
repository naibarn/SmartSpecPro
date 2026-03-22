/**
 * SSRF Validator — validates URLs to prevent Server-Side Request Forgery.
 * Mirrors the Python `_validate_tool_url` pattern in agency_tools.py.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "169.254.169.254",
  "metadata.google.internal",
]);

/** CIDR blocks to reject, expressed as [baseInt, maskBits] for IPv4 */
const BLOCKED_IPV4_RANGES: Array<[number, number]> = [
  [ipToInt("10.0.0.0"), 8],
  [ipToInt("172.16.0.0"), 12],
  [ipToInt("192.168.0.0"), 16],
  [ipToInt("127.0.0.0"), 8],
  [ipToInt("169.254.0.0"), 16],
];

/** Parse dotted IPv4 string to 32-bit integer */
function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Check if an IPv4 address integer falls within a CIDR block */
function isInRange(ipInt: number, baseInt: number, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** Check if a string is a valid IPv4 address */
function isIPv4(host: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/** Check if a string is an IPv6 address (simplified check) */
function isIPv6(host: string): boolean {
  return host.includes(":");
}

/**
 * Validates that a URL is safe from SSRF attacks.
 * Blocks private IPs, localhost, cloud metadata endpoints, non-HTTP schemes.
 * Allows the configured SMARTSPEC_INTERNAL_URL.
 * @throws Error if URL is blocked.
 */
export function validateSsrfUrl(url: string): void {
  if (!url || typeof url !== "string") {
    throw new Error("SSRF validation failed: empty or invalid URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SSRF validation failed: malformed URL");
  }

  // Allow the configured internal service URL (compare parsed origins to prevent bypass)
  const internalUrl = process.env.SMARTSPEC_INTERNAL_URL;
  if (internalUrl) {
    try {
      const internalParsed = new URL(internalUrl);
      if (parsed.origin === internalParsed.origin && parsed.pathname.startsWith(internalParsed.pathname)) {
        return;
      }
    } catch {
      // Invalid internal URL config — don't allow bypass
    }
  }

  // Only allow http and https schemes
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`SSRF validation failed: unsupported scheme '${parsed.protocol}'`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check blocked hosts
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new Error(`SSRF validation failed: blocked host '${hostname}'`);
  }

  // Check IPv4 private ranges
  if (isIPv4(hostname)) {
    const ipInt = ipToInt(hostname);
    for (const [baseInt, maskBits] of BLOCKED_IPV4_RANGES) {
      if (isInRange(ipInt, baseInt, maskBits)) {
        throw new Error(`SSRF validation failed: private IP '${hostname}'`);
      }
    }
  }

  // Check IPv6 blocked patterns
  if (isIPv6(hostname)) {
    // Block fc00::/7 (unique local) and fe80::/10 (link-local)
    const lower = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower === "::1"
    ) {
      throw new Error(`SSRF validation failed: blocked IPv6 address '${hostname}'`);
    }
  }
}
