/**
 * Web-aware validation for MediaJobSpec.
 *
 * Enforces SSRF prevention, path traversal rejection, codec allowlisting,
 * and resource limits. Context-aware: stricter on web_backend, permissive
 * on desktop_sidecar.
 *
 * NOTE: isInternalUri checks hostname/IP only. It does NOT perform DNS
 * resolution, so a hostname like evil.com resolving to 127.0.0.1 would
 * pass. Full SSRF protection requires DNS rebinding prevention at the
 * infrastructure level.
 */

import type { MediaJobSpec } from "./mediaJob";
import { validateJobSpec } from "./mediaJob";

export type EngineContext = "web_backend" | "desktop_sidecar" | "web_wasm";

// ========================================
// Constants
// ========================================

const SHELL_METACHAR_RE = /[;|&`$(){}><]/;

const MAX_VIDEO_BITRATE_KBPS = 50_000;
const MAX_AUDIO_BITRATE_KBPS = 320;
const MAX_PIXEL_COUNT = 3840 * 2160;
const MAX_DIMENSION = 7680;

const ALLOWED_CODECS = new Set([
  "libx264",
  "libx265",
  "h264",
  "hevc",
  "h264_videotoolbox",
  "h264_mf",
  "h264_qsv",
  "h264_nvenc",
  "h264_amf",
  "hevc_videotoolbox",
  "hevc_mf",
  "hevc_qsv",
  "hevc_nvenc",
  "aac",
  "mp3",
  "libmp3lame",
  "libfdk_aac",
  "libvorbis",
  "libopus",
  "flac",
  "pcm_s16le",
  "copy",
]);

// ========================================
// isInternalUri
// ========================================

/**
 * Checks whether a URI points to a localhost, private IP, or cloud
 * metadata endpoint.
 */
export function isInternalUri(uri: string): boolean {
  let hostname: string;
  try {
    const parsed = new URL(uri);
    hostname = parsed.hostname;
  } catch {
    return false;
  }

  // Localhost hostnames
  if (hostname === "localhost" || hostname === "0.0.0.0") {
    return true;
  }

  // Strip IPv6 brackets
  const clean = hostname.replace(/^\[|\]$/g, "");

  // IPv6 loopback
  if (clean === "::1") {
    return true;
  }

  // Check if it's an IP address
  const ipv4Parts = clean.split(".");
  if (ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d+$/.test(p))) {
    const octets = ipv4Parts.map(Number);
    const [a, b] = octets;

    // 127.x.x.x — loopback
    if (a === 127) return true;
    // 10.x.x.x — Class A private
    if (a === 10) return true;
    // 172.16.x.x - 172.31.x.x — Class B private
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.x.x — Class C private
    if (a === 192 && b === 168) return true;
    // 169.254.x.x — link-local / cloud metadata
    if (a === 169 && b === 254) return true;
    // 0.x.x.x
    if (a === 0) return true;
  }

  return false;
}

// ========================================
// sanitizeUri
// ========================================

/**
 * Validates a URI against SSRF and injection rules.
 * Returns the sanitized URI or throws with a descriptive error.
 */
export function sanitizeUri(uri: string, context: EngineContext): string {
  // Allow relative paths (e.g. /uploads/...) — same-origin, no SSRF risk.
  // These are served by Express/nginx and never passed to a shell,
  // so filenames with parentheses, spaces, etc. are safe.
  // Only block path traversal.
  if (uri.startsWith("/")) {
    const decoded = decodeURIComponent(uri);
    if (decoded.includes("..")) {
      throw new Error(`Path traversal detected in relative URI: "${uri}"`);
    }
    return uri;
  }

  // Reject shell metacharacters in external URIs (passed to FFmpeg CLI)
  if (SHELL_METACHAR_RE.test(uri)) {
    throw new Error(
      `URI contains shell metacharacter: "${uri}"`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`Invalid URI: "${uri}"`);
  }

  const scheme = parsed.protocol.replace(":", "");

  if (context === "web_backend" || context === "web_wasm") {
    // Block file:// on web
    if (scheme === "file") {
      throw new Error(
        `file:// URIs are not allowed on ${context}: "${uri}"`,
      );
    }

    // Block internal URIs
    if (isInternalUri(uri)) {
      throw new Error(
        `URI targets internal/private network address: "${uri}"`,
      );
    }

    // Require https (or http in development)
    if (scheme !== "https" && scheme !== "http") {
      throw new Error(`Unsupported URI scheme "${scheme}" on ${context}`);
    }
  } else if (context === "desktop_sidecar") {
    // Desktop: allow file://, asset://, http(s)://
    // Still reject shell metacharacters (already done above)
    if (!["file", "http", "https", "asset"].includes(scheme)) {
      throw new Error(`Unsupported URI scheme "${scheme}" on desktop`);
    }
  }

  return uri;
}

// ========================================
// validateCodecAllowlist
// ========================================

/**
 * Validates codec name against an allowlist.
 * Prevents arbitrary codec injection into FFmpeg commands.
 */
export function validateCodecAllowlist(codec: string): boolean {
  return ALLOWED_CODECS.has(codec);
}

// ========================================
// validateBitrateLimits
// ========================================

/**
 * Validates video/audio bitrate against upper bounds.
 */
export function validateBitrateLimits(opts: {
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (opts.videoBitrateKbps !== undefined) {
    if (
      opts.videoBitrateKbps <= 0 ||
      opts.videoBitrateKbps > MAX_VIDEO_BITRATE_KBPS
    ) {
      errors.push(
        `Video bitrate ${opts.videoBitrateKbps}kbps exceeds maximum ${MAX_VIDEO_BITRATE_KBPS}kbps`,
      );
    }
  }

  if (opts.audioBitrateKbps !== undefined) {
    if (
      opts.audioBitrateKbps <= 0 ||
      opts.audioBitrateKbps > MAX_AUDIO_BITRATE_KBPS
    ) {
      errors.push(
        `Audio bitrate ${opts.audioBitrateKbps}kbps exceeds maximum ${MAX_AUDIO_BITRATE_KBPS}kbps`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ========================================
// validateResolutionLimits
// ========================================

/**
 * Validates output resolution does not exceed 4K (3840x2160).
 */
export function validateResolutionLimits(
  width: number,
  height: number,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (width <= 0 || height <= 0) {
    errors.push("Resolution dimensions must be positive");
  } else {
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      errors.push(
        `Resolution ${width}x${height} exceeds maximum dimension ${MAX_DIMENSION}`,
      );
    }
    if (width * height > MAX_PIXEL_COUNT) {
      errors.push(
        `Resolution ${width}x${height} (${width * height} pixels) exceeds maximum ${MAX_PIXEL_COUNT} pixels`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ========================================
// validateWebJobSpec (orchestrator)
// ========================================

/**
 * Orchestrator function that runs all web-specific validations
 * on a MediaJobSpec. Calls validateJobSpec from section-01 first,
 * then applies additional security checks.
 */
export function validateWebJobSpec(
  spec: MediaJobSpec,
  engineContext: EngineContext,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Basic structural validation from section-01
  const base = validateJobSpec(spec);
  errors.push(...base.errors);

  // 2. Validate all asset URIs
  if (spec.inputs?.assets) {
    for (const asset of spec.inputs.assets) {
      try {
        sanitizeUri(asset.uri, engineContext);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Asset "${asset.assetId}": ${msg}`);
      }
    }
  }

  // 3. Validate output.target for path traversal
  if (spec.output?.target) {
    const target = spec.output.target;
    // Double-decode to catch URL-encoded traversal (%2e%2e)
    const decoded = decodeURIComponent(decodeURIComponent(target));
    if (decoded.includes("..")) {
      errors.push(
        `Path traversal detected in output target: "${target}"`,
      );
    }
  }

  // 4. Validate codec if specified in params
  if (spec.params) {
    const codec = spec.params.codec as string | undefined;
    if (codec && !validateCodecAllowlist(codec)) {
      errors.push(`Unknown codec "${codec}" — not in allowlist`);
    }
    const audioCodec = spec.params.audioCodec as string | undefined;
    if (audioCodec && !validateCodecAllowlist(audioCodec)) {
      errors.push(`Unknown audio codec "${audioCodec}" — not in allowlist`);
    }
  }

  // 5. Validate resolution and bitrate from project timeline
  if (spec.inputs?.project) {
    const { width, height } = spec.inputs.project;
    if (width && height) {
      const resResult = validateResolutionLimits(width, height);
      errors.push(...resResult.errors);
    }
  }

  if (spec.params) {
    const vbr = spec.params.videoBitrateKbps as number | undefined;
    const abr = spec.params.audioBitrateKbps as number | undefined;
    if (vbr !== undefined || abr !== undefined) {
      const brResult = validateBitrateLimits({
        videoBitrateKbps: vbr,
        audioBitrateKbps: abr,
      });
      errors.push(...brResult.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}
