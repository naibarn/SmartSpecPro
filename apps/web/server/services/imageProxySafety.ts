import { validateLibraryUrl } from "./libraryUrlPolicy";

export interface ImageProxySuccess {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
}

export type ImageProxySafetyErrorCode =
  | "missing_url"
  | "invalid_url"
  | "unsupported_url"
  | "blocked_url"
  | "redirect_limit_exceeded"
  | "redirect_missing_location"
  | "upstream_http_error"
  | "upstream_not_image"
  | "upstream_timeout"
  | "upstream_too_large"
  | "upstream_fetch_failed";

export class ImageProxySafetyError extends Error {
  public readonly code: ImageProxySafetyErrorCode;
  public readonly status: number;

  constructor(code: ImageProxySafetyErrorCode, message: string, status: number) {
    super(message);
    this.name = "ImageProxySafetyError";
    this.code = code;
    this.status = status;
  }
}

interface ImageProxyOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.IMAGE_PROXY_TIMEOUT_MS || 8_000);
const DEFAULT_MAX_BYTES = Number(process.env.IMAGE_PROXY_MAX_BYTES || 10 * 1024 * 1024);
const DEFAULT_MAX_REDIRECTS = Number(process.env.IMAGE_PROXY_MAX_REDIRECTS || 3);

function safetyError(
  code: ImageProxySafetyErrorCode,
  message: string,
  status: number,
): ImageProxySafetyError {
  return new ImageProxySafetyError(code, message, status);
}

function createAbortSignal(timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer),
  };
}

function toImageProxySafeUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) {
    throw safetyError("missing_url", "Missing url query parameter", 400);
  }

  const validated = validateLibraryUrl(value, "image_proxy_target_url");
  if (!validated.ok) {
    if (
      validated.reason === "unsupported_protocol" ||
      validated.reason === "blocked_scheme" ||
      validated.reason === "relative_not_allowed" ||
      validated.reason === "invalid_relative_path"
    ) {
      throw safetyError("unsupported_url", "Unsupported URL protocol", 400);
    }

    if (validated.reason === "blocked_local_private_host") {
      throw safetyError("blocked_url", "Blocked URL host", 400);
    }

    throw safetyError("invalid_url", "Invalid URL", 400);
  }

  return validated.normalizedUrl;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readImageBytesWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const body = response.body;
  if (!body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw safetyError("upstream_too_large", "Upstream image exceeds maximum allowed size", 413);
    }
    return bytes;
  }

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = Buffer.from(value);
    total += chunk.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancellation error and return stable error.
      }
      throw safetyError("upstream_too_large", "Upstream image exceeds maximum allowed size", 413);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks, total);
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  targetUrl: string,
  timeoutMs: number,
): Promise<Response> {
  const { signal, dispose } = createAbortSignal(timeoutMs);
  try {
    return await fetchImpl(targetUrl, {
      redirect: "manual",
      signal,
      headers: {
        accept: "image/*,*/*;q=0.8",
      },
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw safetyError("upstream_timeout", "Image proxy request timed out", 504);
    }
    throw safetyError("upstream_fetch_failed", "Failed to fetch source image", 502);
  } finally {
    dispose();
  }
}

export async function proxyImageFromUrl(
  rawUrl: string,
  options?: ImageProxyOptions,
): Promise<ImageProxySuccess> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = Math.max(500, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxBytes = Math.max(1, options?.maxBytes ?? DEFAULT_MAX_BYTES);
  const maxRedirects = Math.max(0, options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS);

  let currentUrl = toImageProxySafeUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetchWithTimeout(fetchImpl, currentUrl, timeoutMs);

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw safetyError("redirect_missing_location", "Redirect response missing location header", 502);
      }
      if (redirectCount >= maxRedirects) {
        throw safetyError("redirect_limit_exceeded", "Image redirect limit exceeded", 502);
      }

      let redirectedUrl: string;
      try {
        redirectedUrl = new URL(location, currentUrl).toString();
      } catch {
        throw safetyError("invalid_url", "Invalid URL", 400);
      }

      currentUrl = toImageProxySafeUrl(redirectedUrl);
      continue;
    }

    if (!response.ok) {
      throw safetyError("upstream_http_error", "Failed to fetch source image", 502);
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      throw safetyError("upstream_not_image", "Upstream content is not an image", 415);
    }

    const bytes = await readImageBytesWithLimit(response, maxBytes);
    return {
      bytes,
      contentType,
      finalUrl: currentUrl,
    };
  }

  throw safetyError("redirect_limit_exceeded", "Image redirect limit exceeded", 502);
}
