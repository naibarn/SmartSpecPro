import crypto from "node:crypto";

export interface SanitizedProviderError {
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
}

export function sanitizeProviderError(error: unknown, fallback = "ElevenLabs request failed"): SanitizedProviderError {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return {
      code: status >= 500 ? "provider_unavailable" : "provider_request_failed",
      message: fallback,
      retryable: status === 429 || status >= 500,
      status: Number.isFinite(status) ? status : undefined,
    };
  }

  return {
    code: "provider_request_failed",
    message: fallback,
    retryable: true,
  };
}

export function computeElevenLabsSignature(rawBody: Buffer | string, secret: string, timestamp: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")}`)
    .digest("hex");
}

export function parseElevenLabsSignatureHeader(header: string | undefined | null): {
  timestamp: string;
  signature: string;
} | null {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  if (!parts.t || !parts.v0) return null;
  return { timestamp: parts.t, signature: parts.v0 };
}

export function verifyElevenLabsSignature(params: {
  rawBody: Buffer | string;
  header: string | undefined | null;
  secret: string | undefined | null;
  toleranceSeconds?: number;
  nowMs?: number;
}): boolean {
  const { rawBody, header, secret, toleranceSeconds = 300, nowMs = Date.now() } = params;
  if (!secret) return false;

  const parsed = parseElevenLabsSignatureHeader(header);
  if (!parsed) return false;

  const timestampSeconds = Number(parsed.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(nowMs / 1000 - timestampSeconds) > toleranceSeconds) return false;

  const expected = computeElevenLabsSignature(rawBody, secret, parsed.timestamp);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(parsed.signature, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function stableIdempotencyKey(parts: Array<string | number | null | undefined>): string {
  return parts.filter((part) => part !== undefined && part !== null && `${part}`.length > 0).join(":");
}
