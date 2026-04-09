const AUTH_RETURN_URL_STORAGE_KEY = "auth:return-url";
const OAUTH_PENDING_TWO_FACTOR_STORAGE_KEY = "auth:oauth-pending-2fa";

export type PendingOAuthTwoFactorState = {
  email: string;
  hasBackupEmail: boolean;
  hasPhone: boolean;
};

function getAllowedHosts(currentHost: string) {
  return [currentHost, "smartspec.pro", "smartaihub.app", "smartspec.local"];
}

export function resolveSafeAuthReturnUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (!rawUrl || typeof window === "undefined") {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const allowedHosts = getAllowedHosts(window.location.hostname);
    const isAllowed = allowedHosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );

    if (!isAllowed) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function getRequestedAuthReturnUrl(
  search = typeof window !== "undefined" ? window.location.search : "",
): string | null {
  const params = new URLSearchParams(search);
  const requested =
    params.get("returnUrl") ??
    params.get("redirect") ??
    params.get("return_url");

  return resolveSafeAuthReturnUrl(requested);
}

export function rememberAuthReturnUrl(url: string | null | undefined) {
  const safeUrl = resolveSafeAuthReturnUrl(url);
  if (!safeUrl || typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(AUTH_RETURN_URL_STORAGE_KEY, safeUrl);
}

export function getStoredAuthReturnUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return resolveSafeAuthReturnUrl(
    window.sessionStorage.getItem(AUTH_RETURN_URL_STORAGE_KEY),
  );
}

export function consumeAuthReturnUrl(fallback = "/dashboard") {
  const stored = getStoredAuthReturnUrl();
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(AUTH_RETURN_URL_STORAGE_KEY);
  }
  return stored ?? fallback;
}

export function setPendingOAuthTwoFactor(state: PendingOAuthTwoFactorState) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    OAUTH_PENDING_TWO_FACTOR_STORAGE_KEY,
    JSON.stringify(state),
  );
}

export function getPendingOAuthTwoFactor(): PendingOAuthTwoFactorState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(
    OAUTH_PENDING_TWO_FACTOR_STORAGE_KEY,
  );
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingOAuthTwoFactorState>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.hasBackupEmail !== "boolean" ||
      typeof parsed.hasPhone !== "boolean"
    ) {
      return null;
    }

    return {
      email: parsed.email,
      hasBackupEmail: parsed.hasBackupEmail,
      hasPhone: parsed.hasPhone,
    };
  } catch {
    return null;
  }
}

export function clearPendingOAuthTwoFactor() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(OAUTH_PENDING_TWO_FACTOR_STORAGE_KEY);
}
