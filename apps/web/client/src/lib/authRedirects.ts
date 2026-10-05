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

function getApprovedAuthIntent(url: URL): string | null {
  if (url.hash) return null;

  if ((url.pathname === "/dashboard" || url.pathname === "/drama-series") && !url.search) {
    return url.pathname;
  }

  const entries = Array.from(url.searchParams.entries());
  if (url.pathname === "/auth/device" && entries.length === 1 && entries[0]?.[0] === "user_code") {
    const userCode = entries[0][1].toUpperCase().replace(/-/g, "");
    if (!/^[A-Z0-9]{8}$/.test(userCode)) return null;
    return `/auth/device?user_code=${userCode}`;
  }

  if (url.pathname === "/oauth/authorize" && entries.length === 1 && entries[0]?.[0] === "tx") {
    const transactionId = entries[0][1];
    if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(transactionId)) {
      return null;
    }
    return `/oauth/authorize?tx=${transactionId}`;
  }

  return null;
}

export function resolveSafeAuthReturnUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (!rawUrl || typeof window === "undefined") {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("//")) {
    return null;
  }

  try {
    const isRelative = trimmed.startsWith("/");
    const url = new URL(trimmed, window.location.origin);
    if (url.username || url.password) return null;

    const isLocalDevHost = url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname.endsWith(".local");
    if (url.protocol !== "https:" && !isLocalDevHost) return null;

    const allowedHosts = getAllowedHosts(window.location.hostname);
    const isAllowedHost = allowedHosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
    if (!isRelative && !isAllowedHost) return null;

    const intent = getApprovedAuthIntent(url);
    if (!intent) return null;
    return isRelative ? intent : `${url.origin}${intent}`;
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
