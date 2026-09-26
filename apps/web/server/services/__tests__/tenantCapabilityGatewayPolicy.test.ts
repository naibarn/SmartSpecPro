import { describe, expect, it } from "vitest";

import {
  evaluateTenantCapabilityPolicy,
  type TenantCapabilityPolicyInput,
} from "../tenantCapabilityGatewayPolicy";
import { buildCapabilityInvocationEnvelope, buildProductPrincipalContext } from "../tenantCapabilityGatewayContracts";

const context = buildProductPrincipalContext({
  server: {
    principalId: "user:42",
    tenantId: "tenant-a",
    productId: "product-a",
    environment: "staging",
    roleRefs: ["developer"],
    entitlementRefs: ["capability:search"],
    capabilityGrantRefs: ["capability:search"],
    authMethod: "session",
  },
});

function policy(overrides: Partial<TenantCapabilityPolicyInput> = {}): TenantCapabilityPolicyInput {
  const envelope = buildCapabilityInvocationEnvelope({
    context,
    capabilityId: "search.documents",
    capabilityVersion: "1.0.0",
    target: { tenantId: "tenant-a", productId: "product-a", environment: "staging" },
    input: { query: "safe" },
    sideEffect: false,
  });
  return {
    context,
    envelope,
    requiredRoleRefs: ["developer"],
    requiredEntitlementRefs: ["capability:search"],
    requiredCapabilityGrantRefs: ["capability:search"],
    quota: { allowed: true },
    egress: { allowed: true },
    runtime: { active: true },
    ...overrides,
  };
}

describe("Spec 220 deny-first gateway policy", () => {
  it("allows a fully scoped request and emits safe audit attribution", () => {
    const decision = evaluateTenantCapabilityPolicy(policy());
    expect(decision).toMatchObject({ allowed: true, code: "ALLOW" });
    expect(decision.audit).toMatchObject({
      tenantId: "tenant-a",
      productId: "product-a",
      principalId: "user:42",
      capabilityId: "search.documents",
    });
  });

  it.each([
    ["missing role", { requiredRoleRefs: ["admin"] }, "GATEWAY_ROLE_DENIED"],
    ["missing entitlement", { requiredEntitlementRefs: ["capability:write"] }, "GATEWAY_ENTITLEMENT_DENIED"],
    ["missing grant", { requiredCapabilityGrantRefs: ["capability:write"] }, "GATEWAY_CAPABILITY_DENIED"],
    ["quota", { quota: { allowed: false, reason: "quota_exceeded" } }, "GATEWAY_QUOTA_DENIED"],
    ["egress", { egress: { allowed: false, reason: "egress_denied" } }, "GATEWAY_EGRESS_DENIED"],
    ["runtime", { runtime: { active: false, reason: "release_revoked" } }, "GATEWAY_RUNTIME_DENIED"],
  ])("denies %s before execution", (_label, override, code) => {
    const decision = evaluateTenantCapabilityPolicy(policy(override));
    expect(decision).toMatchObject({ allowed: false, code });
  });
});
