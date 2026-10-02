import { isIP } from "node:net";

/**
 * URL and response policy only. The transport must consume the returned
 * addresses through an address-pinning connector; ordinary `fetch()` can
 * resolve DNS again, so this module deliberately does not claim to prevent DNS
 * rebinding on its own.
 */

export interface GeoSourceFetchPolicy {
  readonly allowedHosts: readonly string[];
  readonly allowedPathPrefixes: readonly string[];
  readonly maxRedirects: number;
  readonly allowedContentTypes: readonly string[];
  readonly maxCompressedBytes: number;
  readonly maxDecompressedBytes: number;
  readonly connectTimeoutMs: number;
  readonly readTimeoutMs: number;
  readonly totalTimeoutMs: number;
  readonly allowedPorts?: readonly number[];
}

export type GeoSourceAddressResolver = (hostname: string) => Promise<readonly string[]>;

/** A future transport must pin its connection to one of `ResolvedGeoSourceTarget.addresses`. */
export interface GeoSourceAddressPinnedConnector {
  connect(target: ResolvedGeoSourceTarget, options: { readonly connectTimeoutMs: number; readonly readTimeoutMs: number; readonly totalTimeoutMs: number }): Promise<unknown>;
}

export interface ResolvedGeoSourceTarget {
  readonly url: string;
  readonly hostname: string;
  readonly port: number;
  readonly addresses: readonly string[];
}

export type GeoSourceFetchErrorCode =
  | "GEO_SOURCE_URL_INVALID"
  | "GEO_SOURCE_HTTPS_REQUIRED"
  | "GEO_SOURCE_CREDENTIALS_FORBIDDEN"
  | "GEO_SOURCE_HOST_FORBIDDEN"
  | "GEO_SOURCE_PATH_FORBIDDEN"
  | "GEO_SOURCE_PORT_FORBIDDEN"
  | "GEO_SOURCE_ADDRESS_FORBIDDEN"
  | "GEO_SOURCE_DNS_EMPTY"
  | "GEO_SOURCE_DNS_FAILURE"
  | "GEO_SOURCE_REDIRECT_LIMIT"
  | "GEO_SOURCE_POLICY_INVALID";

export class GeoSourceFetchPolicyError extends Error {
  constructor(readonly code: GeoSourceFetchErrorCode) {
    super(code);
    this.name = "GeoSourceFetchPolicyError";
  }
}

function fail(code: GeoSourceFetchErrorCode): never {
  throw new GeoSourceFetchPolicyError(code);
}

function isStrictHost(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(value);
}

function ipv4ToNumber(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some(part => part !== "0" && !/^[1-9]\d{0,2}$/.test(part))) return undefined;
  const octets = parts.map(Number);
  if (octets.some(part => part > 255)) return undefined;
  return (((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!) >>> 0;
}

function ipv6ToWords(address: string): number[] | undefined {
  let value = address.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv4 = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (ipv4) {
    const v4 = ipv4ToNumber(ipv4[1]!);
    if (v4 === undefined) return undefined;
    value = `${value.slice(0, -ipv4[1]!.length)}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some(word => !/^[a-f0-9]{1,4}$/.test(word))) return undefined;
  const zeros = 8 - left.length - right.length;
  if ((halves.length === 1 && zeros !== 0) || (halves.length === 2 && zeros < 1)) return undefined;
  return [...left.map(word => parseInt(word, 16)), ...Array(zeros).fill(0), ...right.map(word => parseInt(word, 16))];
}

function inIpv4Range(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

/** Blocks non-public ranges, including examples/documentation ranges. */
export function isForbiddenGeoSourceAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const v4 = ipv4ToNumber(normalized);
  if (v4 !== undefined) {
    return [
      [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
      [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24], [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15],
      [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xffffffff, 32],
    ].some(([base, prefix]) => inIpv4Range(v4, base, prefix));
  }
  if (isIP(normalized) !== 6) return true;
  const words = ipv6ToWords(normalized);
  if (!words || words.length !== 8) return true;
  const isMappedV4 = words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff;
  if (isMappedV4) return isForbiddenGeoSourceAddress(`${words[6]! >>> 8}.${words[6]! & 255}.${words[7]! >>> 8}.${words[7]! & 255}`);
  // Only global-unicast 2000::/3 is eligible; exclude special-purpose and documentation allocations.
  if ((words[0]! & 0xe000) !== 0x2000) return true;
  // Translation/tunneling prefixes can route an apparently global IPv6 peer to a private IPv4 target.
  if ((words[0] === 0x0064 && words[1] === 0xff9b) || (words[0] === 0x2002)) return true;
  if (words[0] === 0x2001 && (words[1]! <= 0x01ff || words[1] === 0x0db8)) return true;
  if (words[0] === 0x3fff && (words[1]! & 0xf000) === 0) return true;
  return false;
}

/** Reject permissive transport settings before an adapter can use them. */
export function validateGeoSourceFetchPolicy(policy: GeoSourceFetchPolicy): GeoSourceFetchPolicy {
  const boundedInteger = (value: unknown, minimum: number, maximum: number) => Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
  if (!Array.isArray(policy.allowedHosts) || policy.allowedHosts.length === 0 || policy.allowedHosts.length > 32 ||
    policy.allowedHosts.some(host => !isStrictHost(host)) || !Array.isArray(policy.allowedPathPrefixes) || policy.allowedPathPrefixes.length === 0 ||
    policy.allowedPathPrefixes.length > 32 || policy.allowedPathPrefixes.some(path => typeof path !== "string" || path.length > 256 || !path.startsWith("/") || path.includes("//") || path.includes("..") || /%(?:25)*(?:2e|2f|5c)/i.test(path) || path.includes("\\")) ||
    !boundedInteger(policy.maxRedirects, 0, 5) || !Array.isArray(policy.allowedContentTypes) || policy.allowedContentTypes.length === 0 ||
    policy.allowedContentTypes.length > 8 || policy.allowedContentTypes.some(type => !/^(application\/(json|geo\+json)|text\/csv)$/i.test(type)) ||
    !boundedInteger(policy.maxCompressedBytes, 1, 10 * 1024 * 1024) || !boundedInteger(policy.maxDecompressedBytes, policy.maxCompressedBytes, 20 * 1024 * 1024) ||
    !boundedInteger(policy.connectTimeoutMs, 1, 60_000) || !boundedInteger(policy.readTimeoutMs, 1, 60_000) ||
    !boundedInteger(policy.totalTimeoutMs, Math.max(policy.connectTimeoutMs, policy.readTimeoutMs), 120_000) ||
    (policy.allowedPorts !== undefined && (!Array.isArray(policy.allowedPorts) || policy.allowedPorts.length === 0 || policy.allowedPorts.length > 4 || policy.allowedPorts.some(port => !boundedInteger(port, 1, 65_535))))) fail("GEO_SOURCE_POLICY_INVALID");
  return policy;
}

function validatedUrl(raw: string, policy: GeoSourceFetchPolicy): URL {
  let url: URL;
  try { url = new URL(raw); } catch { return fail("GEO_SOURCE_URL_INVALID"); }
  if (url.protocol !== "https:") return fail("GEO_SOURCE_HTTPS_REQUIRED");
  if (url.username || url.password) return fail("GEO_SOURCE_CREDENTIALS_FORBIDDEN");
  const hostname = url.hostname.toLowerCase();
  if (!isStrictHost(hostname) || !policy.allowedHosts.some(host => host.toLowerCase() === hostname)) return fail("GEO_SOURCE_HOST_FORBIDDEN");
  if (!policy.allowedPathPrefixes.some(prefix => url.pathname === prefix || (prefix.endsWith("/") ? url.pathname.startsWith(prefix) : url.pathname.startsWith(`${prefix}/`)))) return fail("GEO_SOURCE_PATH_FORBIDDEN");
  if (/%(?:25)*(?:2e|2f|5c)/i.test(url.pathname) || url.pathname.includes("\\")) return fail("GEO_SOURCE_PATH_FORBIDDEN");
  const port = url.port === "" ? 443 : Number(url.port);
  const allowedPorts = policy.allowedPorts ?? [443];
  if (!Number.isInteger(port) || !allowedPorts.includes(port)) return fail("GEO_SOURCE_PORT_FORBIDDEN");
  return url;
}

/** Resolve on every request/redirect. Callers must use an address-pinning connector for the actual connection. */
export async function resolveGeoSourceTarget(raw: string, policy: GeoSourceFetchPolicy, resolver: GeoSourceAddressResolver): Promise<ResolvedGeoSourceTarget> {
  validateGeoSourceFetchPolicy(policy);
  const url = validatedUrl(raw, policy);
  let addresses: readonly string[];
  try { addresses = await resolver(url.hostname); } catch { return fail("GEO_SOURCE_DNS_FAILURE"); }
  if (!Array.isArray(addresses) || addresses.length === 0) fail("GEO_SOURCE_DNS_EMPTY");
  if (addresses.length > 16 || addresses.some(address => typeof address !== "string" || (isIP(address) !== 4 && isIP(address) !== 6) || isForbiddenGeoSourceAddress(address))) fail("GEO_SOURCE_ADDRESS_FORBIDDEN");
  return Object.freeze({ url: url.toString(), hostname: url.hostname.toLowerCase(), port: url.port === "" ? 443 : Number(url.port), addresses: Object.freeze([...new Set(addresses)]) });
}

export async function evaluateGeoSourceRedirect(input: { readonly location: string; readonly redirectCount: number; readonly policy: GeoSourceFetchPolicy; readonly resolver: GeoSourceAddressResolver }): Promise<ResolvedGeoSourceTarget> {
  if (!Number.isInteger(input.redirectCount) || input.redirectCount < 0 || input.redirectCount >= input.policy.maxRedirects) fail("GEO_SOURCE_REDIRECT_LIMIT");
  return resolveGeoSourceTarget(input.location, input.policy, input.resolver);
}

export type GeoSourceResponseEvaluation =
  | { readonly ok: true; readonly mediaType: string }
  | { readonly ok: false; readonly code: "GEO_SOURCE_RESPONSE_STATUS" | "GEO_SOURCE_CONTENT_TYPE_FORBIDDEN" | "GEO_SOURCE_COMPRESSED_SIZE_EXCEEDED" | "GEO_SOURCE_DECOMPRESSED_SIZE_EXCEEDED" };

export function evaluateGeoSourceResponse(response: { readonly status: number; readonly contentType: string | null | undefined; readonly compressedBytes: number; readonly decompressedBytes: number }, policy: GeoSourceFetchPolicy): GeoSourceResponseEvaluation {
  if (!Number.isInteger(response.status) || response.status < 200 || response.status > 299) return { ok: false, code: "GEO_SOURCE_RESPONSE_STATUS" };
  const mediaType = response.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!policy.allowedContentTypes.some(type => type.toLowerCase() === mediaType)) return { ok: false, code: "GEO_SOURCE_CONTENT_TYPE_FORBIDDEN" };
  if (!Number.isSafeInteger(response.compressedBytes) || response.compressedBytes < 0 || response.compressedBytes > policy.maxCompressedBytes) return { ok: false, code: "GEO_SOURCE_COMPRESSED_SIZE_EXCEEDED" };
  if (!Number.isSafeInteger(response.decompressedBytes) || response.decompressedBytes < 0 || response.decompressedBytes > policy.maxDecompressedBytes) return { ok: false, code: "GEO_SOURCE_DECOMPRESSED_SIZE_EXCEEDED" };
  return { ok: true, mediaType };
}

/** Safe for operator diagnostics: never preserve query strings, credentials, authorization, or payload excerpts. */
export function redactGeoSourceDiagnostic(value: string): string {
  return value
    .replace(/(https:\/\/)[^\s/?#]*@/gi, "$1[REDACTED]@")
    .replace(/https:\/\/[^\s?#]+\?[^\s]*/gi, match => `${match.slice(0, match.indexOf("?"))}?[REDACTED]`)
    .replace(/\b(authorization)\s*:\s*[^\r\n]*?(?=\s+(?:payload|body|excerpt)=|$)/gi, "$1: [REDACTED]")
    .replace(/\b(payload|body|excerpt)\s*=\s*[^\s]*/gi, "$1=[REDACTED]");
}
