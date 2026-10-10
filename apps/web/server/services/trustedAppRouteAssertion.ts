import type { TrustedAppRuntimeContext } from "./smartAiHubRuntimeContext";

const MAX_ASSERTION_TTL_MS = 60_000;
const CLOCK_SKEW_MS = 5_000;
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const ASSERTION_KEYS = [
  "issuer",
  "audience",
  "assertionId",
  "tenantId",
  "appId",
  "publicAppId",
  "routeHostname",
  "issuedAtMs",
  "expiresAtMs",
] as const;

/** Claims are trusted only after the server verifier authenticates and consumes the nonce. */
export type VerifiedAppRouteAssertion = Readonly<{
  issuer: string;
  audience: string;
  assertionId: string;
  tenantId: string;
  appId: string;
  publicAppId: string;
  routeHostname: string;
  issuedAtMs: number;
  expiresAtMs: number;
}>;

function isVerifiedAssertionShape(
  value: unknown
): value is VerifiedAppRouteAssertion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    if (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      return false;
    }
    const keys = Reflect.ownKeys(value);
    const sortedKeys = (keys as string[]).sort();
    const expectedKeys = [...ASSERTION_KEYS].sort();
    if (
      keys.length !== ASSERTION_KEYS.length ||
      keys.some(key => typeof key !== "string") ||
      sortedKeys.some((key, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return (
          key !== expectedKeys[index] ||
          !descriptor?.enumerable ||
          !("value" in descriptor)
        );
      })
    ) {
      return false;
    }
    const claims = value as Record<string, unknown>;
    return (
      typeof claims.issuer === "string" &&
      typeof claims.audience === "string" &&
      typeof claims.assertionId === "string" &&
      typeof claims.tenantId === "string" &&
      typeof claims.appId === "string" &&
      typeof claims.publicAppId === "string" &&
      typeof claims.routeHostname === "string" &&
      typeof claims.issuedAtMs === "number" &&
      typeof claims.expiresAtMs === "number"
    );
  } catch {
    return false;
  }
}

/** Implementations must verify the signature/issuer and atomically reject replayed assertion IDs. */
export interface TrustedAppRouteAssertionVerifier {
  verifyAndConsume(
    assertion: unknown
  ): Promise<VerifiedAppRouteAssertion | null>;
}

export type TrustedAppRouteResolver = (input: {
  tenantId: string;
  kind: "custom-domain";
  value: string;
}) => Promise<{ appId: string; publicAppId: string; tenantId: string } | null>;

/**
 * Consume authenticated ingress evidence into the existing App context contract.
 * This function does not inspect Host/X-Forwarded-Host and cannot establish trust
 * without a server verifier. HTTP request contexts remain null until wired to an
 * approved ingress implementation.
 */
export async function resolveTrustedAppRouteAssertion(input: {
  assertion: unknown;
  authenticatedTenantId: string | null;
  verifier: TrustedAppRouteAssertionVerifier;
  resolveRoute: TrustedAppRouteResolver;
  expectedIssuer: string;
  expectedAudience: string;
  nowMs?: number;
}): Promise<TrustedAppRuntimeContext | null> {
  if (!input.authenticatedTenantId) return null;
  if (
    typeof input.expectedIssuer !== "string" ||
    !input.expectedIssuer.trim() ||
    typeof input.expectedAudience !== "string" ||
    !input.expectedAudience.trim()
  )
    return null;

  let untrustedClaims: VerifiedAppRouteAssertion | null;
  try {
    untrustedClaims = await input.verifier.verifyAndConsume(input.assertion);
  } catch {
    return null;
  }
  if (!isVerifiedAssertionShape(untrustedClaims)) return null;
  const claims = untrustedClaims;

  const nowMs = input.nowMs ?? Date.now();
  const routeHostname = claims.routeHostname;
  if (
    !Number.isSafeInteger(nowMs) ||
    claims.issuer !== input.expectedIssuer ||
    claims.audience !== input.expectedAudience ||
    typeof claims.assertionId !== "string" ||
    !claims.assertionId ||
    claims.assertionId !== claims.assertionId.trim() ||
    claims.assertionId.length > 256 ||
    !claims.tenantId ||
    !claims.appId ||
    !claims.publicAppId ||
    claims.tenantId !== input.authenticatedTenantId ||
    typeof claims.issuedAtMs !== "number" ||
    typeof claims.expiresAtMs !== "number" ||
    !Number.isSafeInteger(claims.issuedAtMs) ||
    !Number.isSafeInteger(claims.expiresAtMs) ||
    claims.issuedAtMs > nowMs + CLOCK_SKEW_MS ||
    claims.expiresAtMs <= nowMs ||
    claims.expiresAtMs <= claims.issuedAtMs ||
    claims.expiresAtMs - claims.issuedAtMs > MAX_ASSERTION_TTL_MS ||
    typeof routeHostname !== "string" ||
    routeHostname !== routeHostname.trim().toLowerCase() ||
    !HOSTNAME.test(routeHostname)
  ) {
    return null;
  }

  let route: Awaited<ReturnType<TrustedAppRouteResolver>>;
  try {
    route = await input.resolveRoute({
      tenantId: claims.tenantId,
      kind: "custom-domain",
      value: routeHostname,
    });
  } catch {
    return null;
  }
  if (
    !route ||
    route.tenantId !== claims.tenantId ||
    route.appId !== claims.appId ||
    route.publicAppId !== claims.publicAppId
  ) {
    return null;
  }

  return {
    version: "spec304-trusted-host-app-context.v1",
    tenantId: route.tenantId,
    hostAppId: route.appId,
    publicAppId: route.publicAppId,
    routeProvenance: "verified_custom_domain_alias",
    permissionCeiling: {
      projectMemoryRead: "authorized_bound_project_only",
      durableProjectMemoryWrite: false,
    },
    policyVersion: "spec269-app-project-memory.phase1.v1",
  };
}
