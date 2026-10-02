import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import {
  evaluateGeoSourceRedirect,
  evaluateGeoSourceResponse,
  resolveGeoSourceTarget,
  validateGeoSourceFetchPolicy,
  type GeoSourceAddressResolver,
  type GeoSourceFetchPolicy,
  type GeoSourceFetchErrorCode,
  type ResolvedGeoSourceTarget,
} from "./fetchPolicy";

export type GeoSourceTransportErrorCode =
  | GeoSourceFetchErrorCode
  | "GEO_SOURCE_RESPONSE_STATUS"
  | "GEO_SOURCE_CONTENT_TYPE_FORBIDDEN"
  | "GEO_SOURCE_COMPRESSED_SIZE_EXCEEDED"
  | "GEO_SOURCE_DECOMPRESSED_SIZE_EXCEEDED"
  | "GEO_SOURCE_REDIRECT_LOOP"
  | "GEO_SOURCE_CONTENT_ENCODING_FORBIDDEN"
  | "GEO_SOURCE_DECOMPRESSION_FAILED"
  | "GEO_SOURCE_TIMEOUT"
  | "GEO_SOURCE_TRANSPORT_FAILURE";

export class GeoSourceTransportError extends Error {
  constructor(readonly code: GeoSourceTransportErrorCode) {
    super(code);
    this.name = "GeoSourceTransportError";
  }
}

export interface GeoSourceRawResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** Compressed bytes as returned on the wire. */
  readonly body: Uint8Array;
}

export interface GeoSourceRequestTimeouts {
  readonly connectTimeoutMs: number;
  readonly readTimeoutMs: number;
  readonly totalTimeoutMs: number;
  readonly maxCompressedBytes: number;
}

export type GeoSourceRequestOnce = (
  target: ResolvedGeoSourceTarget,
  timeouts: GeoSourceRequestTimeouts,
  signal: AbortSignal,
) => Promise<GeoSourceRawResponse>;

export interface GeoSourceFetchDependencies {
  readonly resolveAddresses?: GeoSourceAddressResolver;
  /** Test seam for deterministic fixture transport. It receives only a pinned target, never request credentials or caller headers. */
  readonly requestOnce?: GeoSourceRequestOnce;
}

export interface GeoSourceFetchResult {
  readonly status: number;
  readonly finalUrl: string;
  readonly mediaType: string;
  readonly body: Buffer;
  readonly compressedBytes: number;
  readonly decompressedBytes: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SECRET_QUERY_KEY = /(?:api[_-]?key|authorization|auth|cookie|credential|password|secret|token|^key$)/i;

async function resolvePublicAddresses(hostname: string): Promise<readonly string[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map(record => record.address);
}

function headersFrom(response: GeoSourceRawResponse): { readonly contentType?: string; readonly contentEncoding: string; readonly location?: string; readonly contentLength?: number } {
  const get = (name: string): string | undefined => {
    const entry = Object.entries(response.headers).find(([key]) => key.toLowerCase() === name);
    const value = entry?.[1];
    return Array.isArray(value) ? value[0] : value;
  };
  const rawLength = get("content-length");
  const parsedLength = rawLength === undefined ? undefined : /^\d+$/.test(rawLength) ? Number(rawLength) : Number.NaN;
  return {
    ...(get("content-type") ? { contentType: get("content-type") } : {}),
    contentEncoding: get("content-encoding")?.trim().toLowerCase() || "identity",
    ...(get("location") ? { location: get("location") } : {}),
    ...(rawLength === undefined ? {} : { contentLength: parsedLength }),
  };
}

function assertNoUrlCredentialsOrSecretQuery(target: ResolvedGeoSourceTarget): void {
  const url = new URL(target.url);
  if (url.username || url.password || [...url.searchParams.keys()].some(key => SECRET_QUERY_KEY.test(key))) {
    throw new GeoSourceTransportError("GEO_SOURCE_CREDENTIALS_FORBIDDEN");
  }
}

function appendBounded(chunks: Buffer[], chunk: Buffer, current: number, maximum: number, code: GeoSourceTransportErrorCode): number {
  const next = current + chunk.byteLength;
  if (!Number.isSafeInteger(next) || next > maximum) throw new GeoSourceTransportError(code);
  chunks.push(chunk);
  return next;
}

function decodeBody(raw: Uint8Array, encoding: string, maximum: number): Buffer {
  const compressed = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (encoding === "identity") {
    if (compressed.byteLength > maximum) throw new GeoSourceTransportError("GEO_SOURCE_DECOMPRESSED_SIZE_EXCEEDED");
    return Buffer.from(compressed);
  }
  try {
    let output: Buffer;
    if (encoding === "gzip" || encoding === "x-gzip") output = gunzipSync(compressed, { maxOutputLength: maximum });
    else if (encoding === "deflate") output = inflateSync(compressed, { maxOutputLength: maximum });
    else if (encoding === "br") output = brotliDecompressSync(compressed, { maxOutputLength: maximum });
    else throw new GeoSourceTransportError("GEO_SOURCE_CONTENT_ENCODING_FORBIDDEN");
    if (output.byteLength > maximum) throw new GeoSourceTransportError("GEO_SOURCE_DECOMPRESSED_SIZE_EXCEEDED");
    return output;
  } catch (error) {
    if (error instanceof GeoSourceTransportError) throw error;
    if ((error as NodeJS.ErrnoException)?.code === "ERR_BUFFER_TOO_LARGE") {
      throw new GeoSourceTransportError("GEO_SOURCE_DECOMPRESSED_SIZE_EXCEEDED");
    }
    throw new GeoSourceTransportError("GEO_SOURCE_DECOMPRESSION_FAILED");
  }
}

function createPinnedRequestOnce(): GeoSourceRequestOnce {
  return async (target, timeouts, signal) => {
    const https = await import("node:https");
    const url = new URL(target.url);
    const acceptedTypes = "application/json, application/geo+json, text/csv";
    const timeoutError = () => new GeoSourceTransportError("GEO_SOURCE_TIMEOUT");

    return new Promise<GeoSourceRawResponse>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;
      let connectTimer: NodeJS.Timeout | undefined;
      let readTimer: NodeJS.Timeout | undefined;
      let responseHeaders: GeoSourceRawResponse["headers"] = {};
      let responseStatus = 0;

      const cleanup = () => {
        clearTimeout(connectTimer);
        clearTimeout(readTimer);
        signal.removeEventListener("abort", onAbort);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ status: responseStatus, headers: responseHeaders, body: Buffer.concat(chunks, totalBytes) });
      };
      const onAbort = () => fail(timeoutError());
      const resetReadTimer = () => {
        clearTimeout(readTimer);
        readTimer = setTimeout(() => fail(timeoutError()), timeouts.readTimeoutMs);
      };

      if (signal.aborted) return fail(timeoutError());
      signal.addEventListener("abort", onAbort, { once: true });
      connectTimer = setTimeout(() => fail(timeoutError()), timeouts.connectTimeoutMs);
      const pinnedLookup: NonNullable<import("node:https").RequestOptions["lookup"]> = (_hostname, options, callback) => {
        const addresses = target.addresses.map(address => ({ address, family: isIP(address) }));
        if (addresses.length === 0 || addresses.some(address => address.family === 0)) {
          callback(Object.assign(new Error("Pinned address is invalid"), { code: "EAI_FAIL" }), "", 0);
          return;
        }
        if (typeof options === "object" && options !== null && "all" in options && options.all) callback(null, addresses);
        else callback(null, addresses[0]!.address, addresses[0]!.family);
      };
      const request = https.request({
        protocol: "https:",
        hostname: target.hostname,
        port: target.port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        lookup: pinnedLookup,
        servername: target.hostname,
        rejectUnauthorized: true,
        headers: { accept: acceptedTypes, "accept-encoding": "gzip, deflate, br", connection: "close" },
      }, response => {
        responseStatus = response.statusCode ?? 0;
        responseHeaders = response.headers;
        const length = response.headers["content-length"];
        if (length !== undefined && (!/^\d+$/.test(String(length)) || Number(length) > timeouts.maxCompressedBytes)) {
          response.destroy(new GeoSourceTransportError("GEO_SOURCE_COMPRESSED_SIZE_EXCEEDED"));
          return fail(new GeoSourceTransportError("GEO_SOURCE_COMPRESSED_SIZE_EXCEEDED"));
        }
        resetReadTimer();
        response.on("data", chunk => {
          resetReadTimer();
          try {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            totalBytes = appendBounded(chunks, buffer, totalBytes, timeouts.maxCompressedBytes, "GEO_SOURCE_COMPRESSED_SIZE_EXCEEDED");
          } catch (error) {
            response.destroy(error as Error);
            fail(error as Error);
          }
        });
        response.on("end", succeed);
        response.on("error", error => fail(error));
      });
      request.on("socket", socket => {
        if ("secureConnecting" in socket && socket.secureConnecting) {
          socket.once("secureConnect", () => {
            clearTimeout(connectTimer);
            resetReadTimer();
          });
        } else {
          clearTimeout(connectTimer);
          resetReadTimer();
        }
      });
      request.on("error", error => fail(error));
      request.end();
    });
  };
}

function transportFailure(error: unknown): GeoSourceTransportError {
  if (error instanceof GeoSourceTransportError) return error;
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    const code = error.code as GeoSourceFetchErrorCode;
    if (code.startsWith("GEO_SOURCE_")) return new GeoSourceTransportError(code);
  }
  return new GeoSourceTransportError("GEO_SOURCE_TRANSPORT_FAILURE");
}

/**
 * Bounded GET transport for trusted provider adapters. It owns the request
 * headers, pins each HTTPS connection to the vetted DNS result, and manually
 * validates every redirect against the same source policy.
 */
export async function fetchGeoSource(
  initialUrl: string,
  policy: GeoSourceFetchPolicy,
  dependencies: GeoSourceFetchDependencies = {},
): Promise<GeoSourceFetchResult> {
  validateGeoSourceFetchPolicy(policy);
  const resolver = dependencies.resolveAddresses ?? resolvePublicAddresses;
  const requestOnce = dependencies.requestOnce ?? createPinnedRequestOnce();
  const startedAt = Date.now();
  const deadline = startedAt + policy.totalTimeoutMs;
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const overallTimeout = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new GeoSourceTransportError("GEO_SOURCE_TIMEOUT"));
    }, policy.totalTimeoutMs);
  });

  const run = async (): Promise<GeoSourceFetchResult> => {
    let target: ResolvedGeoSourceTarget;
    try {
      target = await resolveGeoSourceTarget(initialUrl, policy, resolver);
    } catch (error) {
      throw transportFailure(error);
    }
    const seen = new Set<string>();
    let redirectCount = 0;

    while (true) {
      assertNoUrlCredentialsOrSecretQuery(target);
      const canonicalUrl = new URL(target.url).toString();
      if (seen.has(canonicalUrl)) throw new GeoSourceTransportError("GEO_SOURCE_REDIRECT_LOOP");
      seen.add(canonicalUrl);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new GeoSourceTransportError("GEO_SOURCE_TIMEOUT");
      let response: GeoSourceRawResponse;
      try {
        response = await requestOnce(target, {
          connectTimeoutMs: Math.min(policy.connectTimeoutMs, remaining),
          readTimeoutMs: Math.min(policy.readTimeoutMs, remaining),
          totalTimeoutMs: remaining,
          maxCompressedBytes: policy.maxCompressedBytes,
        }, controller.signal);
      } catch (error) {
        throw transportFailure(error);
      }
      const headers = headersFrom(response);
      if (!(response.body instanceof Uint8Array)) throw new GeoSourceTransportError("GEO_SOURCE_TRANSPORT_FAILURE");
      if (response.body.byteLength > policy.maxCompressedBytes) throw new GeoSourceTransportError("GEO_SOURCE_COMPRESSED_SIZE_EXCEEDED");

      if (REDIRECT_STATUSES.has(response.status)) {
        if (!headers.location) throw new GeoSourceTransportError("GEO_SOURCE_URL_INVALID");
        let redirectUrl: string;
        try { redirectUrl = new URL(headers.location, target.url).toString(); }
        catch { throw new GeoSourceTransportError("GEO_SOURCE_URL_INVALID"); }
        let next: ResolvedGeoSourceTarget;
        try {
          next = await evaluateGeoSourceRedirect({ location: redirectUrl, redirectCount, policy, resolver });
        } catch (error) {
          throw transportFailure(error);
        }
        if (seen.has(new URL(next.url).toString())) throw new GeoSourceTransportError("GEO_SOURCE_REDIRECT_LOOP");
        target = next;
        redirectCount += 1;
        continue;
      }

      const mediaType = headers.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
      const compressedBytes = response.body.byteLength;
      const preflight = evaluateGeoSourceResponse({
        status: response.status,
        contentType: headers.contentType,
        compressedBytes,
        decompressedBytes: 0,
      }, policy);
      if (!preflight.ok && preflight.code !== "GEO_SOURCE_DECOMPRESSED_SIZE_EXCEEDED") {
        throw new GeoSourceTransportError(preflight.code);
      }
      if (headers.contentLength !== undefined && (!Number.isSafeInteger(headers.contentLength) || headers.contentLength < 0 || headers.contentLength !== compressedBytes)) {
        throw new GeoSourceTransportError("GEO_SOURCE_TRANSPORT_FAILURE");
      }
      const body = decodeBody(response.body, headers.contentEncoding, policy.maxDecompressedBytes);
      const validation = evaluateGeoSourceResponse({
        status: response.status,
        contentType: headers.contentType,
        compressedBytes,
        decompressedBytes: body.byteLength,
      }, policy);
      if (!validation.ok) throw new GeoSourceTransportError(validation.code);
      return { status: response.status, finalUrl: target.url, mediaType, body, compressedBytes, decompressedBytes: body.byteLength };
    }
  };

  try {
    return await Promise.race([run(), overallTimeout]);
  } catch (error) {
    throw transportFailure(error);
  } finally {
    clearTimeout(timeout);
  }
}
