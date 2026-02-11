export type LibraryUrlPolicyContext =
  | "library_source_url"
  | "library_thumbnail_url"
  | "office_preview_url"
  | "image_proxy_target_url";

export type LibraryUrlRejectReason =
  | "empty_url"
  | "invalid_relative_path"
  | "relative_not_allowed"
  | "malformed_url"
  | "blocked_scheme"
  | "unsupported_protocol"
  | "blocked_local_private_host";

export type HostSafetyResult = "ok" | "blocked_local_private_host";

export interface LibraryUrlValidationOk {
  ok: true;
  normalizedUrl: string;
  classification: "relative_local_path" | "external_https_url";
}

export interface LibraryUrlValidationError {
  ok: false;
  reason: LibraryUrlRejectReason;
  message: string;
}

export type LibraryUrlValidationResult = LibraryUrlValidationOk | LibraryUrlValidationError;

const BLOCKED_SCHEMES = new Set(["javascript:", "vbscript:", "file:", "data:"]);

const CONTEXT_POLICY: Record<
  LibraryUrlPolicyContext,
  {
    allowRelative: boolean;
    requirePublicHost: boolean;
  }
> = {
  library_source_url: {
    allowRelative: true,
    requirePublicHost: true,
  },
  library_thumbnail_url: {
    allowRelative: true,
    requirePublicHost: true,
  },
  office_preview_url: {
    allowRelative: false,
    requirePublicHost: true,
  },
  image_proxy_target_url: {
    allowRelative: false,
    requirePublicHost: true,
  },
};

function validationError(
  reason: LibraryUrlRejectReason,
  message: string,
): LibraryUrlValidationError {
  return {
    ok: false,
    reason,
    message,
  };
}

function isPrivateIpv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);

  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "::1") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("fe80")) return true;
  return false;
}

export function classifyHostSafety(hostname: string): HostSafetyResult {
  const host = hostname.trim().toLowerCase();
  if (!host) return "blocked_local_private_host";

  if (
    host === "localhost" ||
    host === "host.docker.internal" ||
    host.endsWith(".local")
  ) {
    return "blocked_local_private_host";
  }

  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    return "blocked_local_private_host";
  }

  return "ok";
}

export function validateLibraryUrl(
  rawUrl: string,
  context: LibraryUrlPolicyContext,
): LibraryUrlValidationResult {
  const policy = CONTEXT_POLICY[context];
  const candidate = rawUrl.trim();

  if (!candidate) {
    return validationError("empty_url", "URL is required");
  }

  if (candidate.startsWith("/")) {
    if (candidate.startsWith("//")) {
      return validationError("invalid_relative_path", "Relative URL must start with /");
    }
    if (!policy.allowRelative) {
      return validationError("relative_not_allowed", "Relative URL is not allowed in this context");
    }
    return {
      ok: true,
      normalizedUrl: candidate,
      classification: "relative_local_path",
    };
  }

  const schemeMatch = candidate.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;
  if (!scheme) {
    return validationError("invalid_relative_path", "Relative URL must start with /");
  }
  if (scheme && BLOCKED_SCHEMES.has(scheme)) {
    return validationError("blocked_scheme", `URL scheme ${scheme} is not allowed`);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return validationError("malformed_url", "URL is malformed");
  }

  if (parsed.protocol !== "https:") {
    if (BLOCKED_SCHEMES.has(parsed.protocol.toLowerCase())) {
      return validationError("blocked_scheme", `URL scheme ${parsed.protocol} is not allowed`);
    }
    return validationError("unsupported_protocol", "Only HTTPS URLs are allowed");
  }

  if (policy.requirePublicHost && classifyHostSafety(parsed.hostname) !== "ok") {
    return validationError("blocked_local_private_host", "Private or local hosts are not allowed");
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    classification: "external_https_url",
  };
}
