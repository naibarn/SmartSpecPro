import type {
  CapabilityInvocationEnvelope,
  ProductPrincipalContext,
} from "./tenantCapabilityGatewayContracts";

export type TenantCapabilityPolicyInput = {
  context: ProductPrincipalContext;
  envelope: CapabilityInvocationEnvelope;
  requiredRoleRefs?: string[];
  requiredEntitlementRefs?: string[];
  requiredCapabilityGrantRefs?: string[];
  quota: { allowed: boolean; reason?: string };
  egress: { allowed: boolean; reason?: string };
  runtime: { active: boolean; reason?: string };
};

export type TenantCapabilityPolicyDecision = {
  allowed: boolean;
  code: string;
  reason?: string;
  audit: {
    tenantId: string;
    productId?: string;
    principalId: string;
    environment: string;
    capabilityId: string;
    capabilityVersion: string;
    correlationId: string;
    idempotencyKey?: string;
  };
};

function missing(required: string[] | undefined, actual: string[]): boolean {
  return (required ?? []).some(ref => !actual.includes(ref));
}

export function evaluateTenantCapabilityPolicy(
  input: TenantCapabilityPolicyInput
): TenantCapabilityPolicyDecision {
  const audit = {
    tenantId: input.context.tenantId,
    ...(input.context.productId ? { productId: input.context.productId } : {}),
    principalId: input.context.principalId,
    environment: input.context.environment,
    capabilityId: input.envelope.capabilityId,
    capabilityVersion: input.envelope.capabilityVersion,
    correlationId: input.envelope.correlationId,
    ...(input.envelope.idempotencyKey ? { idempotencyKey: input.envelope.idempotencyKey } : {}),
  };
  if (input.envelope.tenantId !== input.context.tenantId || input.envelope.target.tenantId !== input.context.tenantId)
    return { allowed: false, code: "GATEWAY_SCOPE_INVALID", audit };
  if (input.envelope.target.productId !== input.context.productId || input.envelope.target.environment !== input.context.environment)
    return { allowed: false, code: "GATEWAY_SCOPE_INVALID", audit };
  if (!input.runtime.active) return { allowed: false, code: "GATEWAY_RUNTIME_DENIED", reason: input.runtime.reason, audit };
  if (missing(input.requiredRoleRefs, input.context.roleRefs)) return { allowed: false, code: "GATEWAY_ROLE_DENIED", audit };
  if (missing(input.requiredEntitlementRefs, input.context.entitlementRefs)) return { allowed: false, code: "GATEWAY_ENTITLEMENT_DENIED", audit };
  if (missing(input.requiredCapabilityGrantRefs, input.context.capabilityGrantRefs)) return { allowed: false, code: "GATEWAY_CAPABILITY_DENIED", audit };
  if (!input.quota.allowed) return { allowed: false, code: "GATEWAY_QUOTA_DENIED", reason: input.quota.reason, audit };
  if (!input.egress.allowed) return { allowed: false, code: "GATEWAY_EGRESS_DENIED", reason: input.egress.reason, audit };
  return { allowed: true, code: "ALLOW", audit };
}
