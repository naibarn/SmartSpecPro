import crypto from "crypto";
import bcrypt from "bcrypt";
import { signBearerToken, verifyBearerToken } from "../_core/tokens";

export type PrivateVaultPrefs = {
  enabled?: boolean;
  pinHash?: string;
  pinVersion?: number;
  pinUpdatedAt?: string;
};

export type UserPreferencesWithPrivateVault = Record<string, unknown> & {
  privateVault?: PrivateVaultPrefs;
};

const PRIVATE_VAULT_TOKEN_TTL = "12h";

export function normalizePrivateVaultPrefs(
  prefs: unknown,
): PrivateVaultPrefs | null {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
    return null;
  }

  const raw = prefs as Record<string, unknown>;
  const privateVault = raw.privateVault;
  if (!privateVault || typeof privateVault !== "object" || Array.isArray(privateVault)) {
    return null;
  }

  const vault = privateVault as Record<string, unknown>;
  return {
    enabled: vault.enabled === true,
    pinHash: typeof vault.pinHash === "string" ? vault.pinHash : undefined,
    pinVersion: Number.isFinite(Number(vault.pinVersion)) ? Number(vault.pinVersion) : undefined,
    pinUpdatedAt: typeof vault.pinUpdatedAt === "string" ? vault.pinUpdatedAt : undefined,
  };
}

export function sanitizeUserPreferences<T extends UserPreferencesWithPrivateVault>(
  prefs: T,
): T {
  const privateVault = normalizePrivateVaultPrefs(prefs);
  if (!privateVault) {
    return prefs;
  }

  const sanitized: UserPreferencesWithPrivateVault = {
    ...prefs,
    privateVault: {
      enabled: privateVault.enabled ?? false,
      pinVersion: privateVault.pinVersion,
      pinUpdatedAt: privateVault.pinUpdatedAt,
    },
  };

  return sanitized as T;
}

export function isPrivateVaultEnabled(prefs: unknown): boolean {
  const privateVault = normalizePrivateVaultPrefs(prefs);
  return Boolean(privateVault?.enabled && privateVault.pinHash);
}

export function getPrivateVaultPinVersion(prefs: unknown): number {
  const privateVault = normalizePrivateVaultPrefs(prefs);
  return Number.isFinite(privateVault?.pinVersion) && privateVault?.pinVersion ? Number(privateVault.pinVersion) : 1;
}

export async function hashPrivateVaultPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPrivateVaultPin(pin: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}

export function issuePrivateVaultAccessToken(params: {
  userId: number;
  tenantId: string;
  pinVersion: number;
}): string {
  return signBearerToken(
    {
      sub: String(params.userId),
      type: "private_vault",
      scopes: [`private_vault:${params.tenantId}:${params.pinVersion}`],
      jti: `private_vault_${Date.now()}_${crypto.randomBytes(10).toString("hex")}`,
    },
    PRIVATE_VAULT_TOKEN_TTL,
  );
}

export async function validatePrivateVaultAccessToken(params: {
  token: string;
  userId: number;
  tenantId: string;
  pinVersion: number;
}): Promise<boolean> {
  try {
    const claims = await verifyBearerToken(params.token);
    if (claims.sub !== String(params.userId)) return false;
    if (claims.type !== "private_vault") return false;

    const expectedScope = `private_vault:${params.tenantId}:${params.pinVersion}`;
    return Boolean(claims.scopes?.includes(expectedScope));
  } catch {
    return false;
  }
}
