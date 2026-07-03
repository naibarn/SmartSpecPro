import bcrypt from "bcrypt";

export type SecurityPinPrefs = {
  enabled?: boolean;
  pinHash?: string;
  pinVersion?: number;
  pinUpdatedAt?: string;
  failedAttempts?: number;
  lockedUntil?: string;
};

export type UserPreferencesWithSecurityPin = Record<string, unknown> & {
  securityPin?: SecurityPinPrefs;
  privateVault?: SecurityPinPrefs;
};

export function normalizeSecurityPinPrefs(prefs: unknown): SecurityPinPrefs | null {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return null;
  const raw = prefs as UserPreferencesWithSecurityPin;
  const source = raw.securityPin ?? raw.privateVault;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  return {
    enabled: source.enabled === true,
    pinHash: typeof source.pinHash === "string" ? source.pinHash : undefined,
    pinVersion: Number.isFinite(Number(source.pinVersion)) ? Number(source.pinVersion) : 1,
    pinUpdatedAt: typeof source.pinUpdatedAt === "string" ? source.pinUpdatedAt : undefined,
    failedAttempts: Number.isFinite(Number(source.failedAttempts)) ? Number(source.failedAttempts) : 0,
    lockedUntil: typeof source.lockedUntil === "string" ? source.lockedUntil : undefined,
  };
}

export function isSecurityPinEnabled(prefs: unknown): boolean {
  const pin = normalizeSecurityPinPrefs(prefs);
  return Boolean(pin?.enabled && pin.pinHash);
}

export function getSecurityPinVersion(prefs: unknown): number {
  return normalizeSecurityPinPrefs(prefs)?.pinVersion ?? 1;
}

export async function hashSecurityPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifySecurityPin(pin: string, hash: string): Promise<boolean> {
  if (!pin || !hash) return false;
  return bcrypt.compare(pin, hash);
}

export function isSecurityPinLocked(prefs: unknown, now: Date): boolean {
  const pin = normalizeSecurityPinPrefs(prefs);
  if (!pin?.lockedUntil) return false;
  return new Date(pin.lockedUntil).getTime() > now.getTime();
}

export function recordSecurityPinFailure(
  prefs: unknown,
  now: Date,
  maxAttempts = 5,
  lockMs = 15 * 60 * 1000,
): UserPreferencesWithSecurityPin {
  const current = prefs && typeof prefs === "object" && !Array.isArray(prefs) ? prefs as Record<string, unknown> : {};
  const existing = normalizeSecurityPinPrefs(current) ?? {};
  const failedAttempts = (existing.failedAttempts ?? 0) + 1;
  return {
    ...current,
    securityPin: {
      ...existing,
      failedAttempts,
      lockedUntil: failedAttempts >= maxAttempts ? new Date(now.getTime() + lockMs).toISOString() : existing.lockedUntil,
    },
  };
}

export function recordSecurityPinSuccess(prefs: unknown): UserPreferencesWithSecurityPin {
  const current = prefs && typeof prefs === "object" && !Array.isArray(prefs) ? prefs as Record<string, unknown> : {};
  const existing = normalizeSecurityPinPrefs(current) ?? {};
  return {
    ...current,
    securityPin: {
      ...existing,
      failedAttempts: 0,
      lockedUntil: undefined,
    },
  };
}
