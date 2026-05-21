import { MARKETPLACE_CAPTURE_LIMITS } from "@shared/marketplaceCapture";

function parseCsv(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDurationMs(value: string, fallbackMs: number): number {
  const match = value.trim().match(/^(\d+)\s*([smhd])$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;
  const unit = match[2].toLowerCase();
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

export function getMarketplaceCaptureConfig() {
  const maxUploadMb = Number.parseInt(process.env.MARKETPLACE_CAPTURE_MAX_UPLOAD_MB || "10", 10);
  const tokenTtl = process.env.MARKETPLACE_EXTENSION_TOKEN_TTL || "7d";
  return {
    enabled: process.env.MARKETPLACE_CAPTURE_ENABLED !== "false",
    allowedOrigins: parseCsv(process.env.MARKETPLACE_EXTENSION_ALLOWED_ORIGINS),
    tokenTtl,
    tokenTtlMs: parseDurationMs(tokenTtl, 7 * 24 * 60 * 60 * 1000),
    maxUploadBytes: Number.isFinite(maxUploadMb)
      ? maxUploadMb * 1024 * 1024
      : MARKETPLACE_CAPTURE_LIMITS.maxUploadBytes,
    allowedAssetMimeTypes: new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/json",
      "text/html",
      "text/plain",
    ]),
  };
}

export function isAllowedMarketplaceOrigin(origin: string | undefined): boolean {
  const normalized = String(origin ?? "").trim();
  if (!normalized) return false;
  const config = getMarketplaceCaptureConfig();
  if (isValidChromeExtensionOrigin(normalized)) return true;
  if (config.allowedOrigins.length === 0) {
    return process.env.NODE_ENV !== "production" && normalized.startsWith("chrome-extension://");
  }
  return config.allowedOrigins.includes(normalized);
}

export function isValidChromeExtensionOrigin(origin: string | undefined): boolean {
  const normalized = String(origin ?? "").trim();
  return /^chrome-extension:\/\/[a-p]{32}$/.test(normalized);
}

export function marketplaceCaptureError(code: string, message: string, status = 400, retryable = false) {
  const error = new Error(message) as Error & { status: number; code: string; retryable: boolean };
  error.status = status;
  error.code = code;
  error.retryable = retryable;
  return error;
}
