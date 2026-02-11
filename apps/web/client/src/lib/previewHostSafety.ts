export type OfficePreviewBlockReason =
  | "empty_url"
  | "malformed_url"
  | "unsupported_protocol"
  | "blocked_local_private_host";

export interface OfficePreviewDecision {
  canEmbed: boolean;
  normalizedSourceUrl: string | null;
  viewerUrl: string | null;
  reason: OfficePreviewBlockReason | null;
  message: string;
}

function normalizeHost(hostname: string): string {
  const host = hostname.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }
  return host;
}

function isPrivateIpv4(hostname: string): boolean {
  const m = normalizeHost(hostname).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;

  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some((part) => part < 0 || part > 255)) {
    return false;
  }

  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;

  if (host === "::1") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("fe80")) return true;

  return false;
}

export function isPublicPreviewHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;

  if (
    host === "localhost" ||
    host === "host.docker.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  ) {
    return false;
  }

  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    return false;
  }

  return true;
}

function toAbsoluteUrl(rawSourceUrl: string, origin?: string): string {
  const candidate = rawSourceUrl.trim();
  if (candidate.startsWith("/")) {
    if (!origin) return candidate;
    return new URL(candidate, origin).toString();
  }
  return candidate;
}

export function getOfficePreviewDecision(
  rawSourceUrl: string | null | undefined,
  options?: { origin?: string },
): OfficePreviewDecision {
  if (!rawSourceUrl || !rawSourceUrl.trim()) {
    return {
      canEmbed: false,
      normalizedSourceUrl: null,
      viewerUrl: null,
      reason: "empty_url",
      message: "Office preview is unavailable because file URL is missing.",
    };
  }

  let parsed: URL;
  try {
    const absoluteUrl = toAbsoluteUrl(rawSourceUrl, options?.origin);
    parsed = options?.origin
      ? new URL(absoluteUrl, options.origin)
      : new URL(absoluteUrl);
  } catch {
    return {
      canEmbed: false,
      normalizedSourceUrl: null,
      viewerUrl: null,
      reason: "malformed_url",
      message: "Office preview is unavailable because the file URL is malformed.",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      canEmbed: false,
      normalizedSourceUrl: parsed.toString(),
      viewerUrl: null,
      reason: "unsupported_protocol",
      message: "Office preview requires a public HTTPS URL. Use Open file instead.",
    };
  }

  if (!isPublicPreviewHost(parsed.hostname)) {
    return {
      canEmbed: false,
      normalizedSourceUrl: parsed.toString(),
      viewerUrl: null,
      reason: "blocked_local_private_host",
      message: "Office preview is blocked for private or local hosts. Use Open file instead.",
    };
  }

  const normalizedSourceUrl = parsed.toString();
  return {
    canEmbed: true,
    normalizedSourceUrl,
    viewerUrl: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(normalizedSourceUrl)}`,
    reason: null,
    message: "Office preview uses Microsoft online viewer.",
  };
}
