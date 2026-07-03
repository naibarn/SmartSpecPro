import crypto from "crypto";
import { signBearerToken, verifyBearerToken } from "../_core/tokens";
import { normalizeTenantId } from "../../shared/ageSafetyPolicy";

export const PROTECTED_SURFACE_TOKEN_HEADER = "x-protected-surface-token";
export const PROTECTED_SURFACE_TOKEN_TYPE = "protected_surface";

export type ProtectedSurfaceScope =
  | "profile:birthdate:update"
  | "profile:country:update"
  | "private-chat:access"
  | "age-policy:temporary-adult"
  | "generated-asset:restricted-view";

export type ProtectedSurfaceTokenContext = {
  userId: number;
  tenantId: string | number;
  pinVersion: number;
  profileVersion: number;
  policyVersion: string;
  jurisdictionPresetId: string;
  dayKey: string;
};

export function getPolicyDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function issueProtectedSurfaceToken(params: ProtectedSurfaceTokenContext & {
  scopes: ProtectedSurfaceScope[];
  expiresIn?: string;
}): string {
  const tenantId = normalizeTenantId(params.tenantId);
  if (!tenantId) throw new Error("invalid_tenant");
  return signBearerToken(
    {
      sub: String(params.userId),
      type: PROTECTED_SURFACE_TOKEN_TYPE,
      tenantId,
      scopes: params.scopes,
      pinVersion: params.pinVersion,
      profileVersion: params.profileVersion,
      policyVersion: params.policyVersion,
      jurisdictionPresetId: params.jurisdictionPresetId,
      dayKey: params.dayKey,
      jti: `protected_surface_${Date.now()}_${crypto.randomBytes(10).toString("hex")}`,
    } as any,
    (params.expiresIn ?? "12h") as any,
  );
}

export async function validateProtectedSurfaceToken(params: ProtectedSurfaceTokenContext & {
  token: string | null | undefined;
  requiredScope: ProtectedSurfaceScope;
}): Promise<boolean> {
  if (!params.token) return false;
  const tenantId = normalizeTenantId(params.tenantId);
  if (!tenantId) return false;
  try {
    const claims = await verifyBearerToken(params.token);
    if (claims.sub !== String(params.userId)) return false;
    if (claims.type !== PROTECTED_SURFACE_TOKEN_TYPE) return false;
    if (normalizeTenantId(claims.tenantId) !== tenantId) return false;
    if (!claims.scopes?.includes(params.requiredScope)) return false;
    if ((claims as any).pinVersion !== params.pinVersion) return false;
    if ((claims as any).profileVersion !== params.profileVersion) return false;
    if ((claims as any).policyVersion !== params.policyVersion) return false;
    if ((claims as any).jurisdictionPresetId !== params.jurisdictionPresetId) return false;
    if ((claims as any).dayKey !== params.dayKey) return false;
    return true;
  } catch {
    return false;
  }
}

export async function getProtectedSurfaceScopes(params: ProtectedSurfaceTokenContext & {
  token: string | null | undefined;
}): Promise<ProtectedSurfaceScope[]> {
  const scopes: ProtectedSurfaceScope[] = [
    "profile:birthdate:update",
    "profile:country:update",
    "private-chat:access",
    "age-policy:temporary-adult",
    "generated-asset:restricted-view",
  ];
  const valid: ProtectedSurfaceScope[] = [];
  for (const scope of scopes) {
    if (await validateProtectedSurfaceToken({ ...params, requiredScope: scope })) {
      valid.push(scope);
    }
  }
  return valid;
}
