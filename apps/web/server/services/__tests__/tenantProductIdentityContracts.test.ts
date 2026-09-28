import { describe, expect, it } from "vitest";

import {
  activateDomainBinding,
  assertProductReleaseSnapshotImmutable,
  buildBrandVersion,
  buildDomainBinding,
  buildProductDefinition,
  buildProductModule,
  buildProductReleaseSnapshot,
  buildTenantIdentity,
  evaluateProductEntitlement,
} from "../tenantProductIdentityContracts";

const tenant = buildTenantIdentity({ tenantId: "tenant-a", slug: "interiorpro", name: "Interior Pro" });

describe("Spec 217 Tenant/Product identity contracts", () => {
  it("keeps opaque tenant identity stable when mutable slug and brand change", () => {
    expect(tenant).toMatchObject({ tenantId: "tenant-a", slug: "interiorpro" });
    expect(buildTenantIdentity({ tenantId: tenant.tenantId, slug: "new-brand", name: "New Brand" }).tenantId)
      .toBe(tenant.tenantId);
    expect(() => buildTenantIdentity({ tenantId: "interiorpro", slug: "new-brand", name: "New Brand" }))
      .toThrowError(expect.objectContaining({ code: "PRODUCT_IDENTITY_INVALID" }));
  });

  it("requires Product and Brand references to stay inside the tenant", () => {
    const brand = buildBrandVersion({ brandId: "brand-a", tenantId: tenant.tenantId, version: "v1", tokens: { primary: "#123456" } });
    const product = buildProductDefinition({ productId: "product-a", tenantId: tenant.tenantId, slug: "interior", brandRef: brand.brandId, brandTenantId: tenant.tenantId });
    expect(product).toMatchObject({ tenantId: "tenant-a", brandRef: "brand-a" });
    expect(() => buildProductDefinition({ productId: "product-b", tenantId: "tenant-b", slug: "other", brandRef: brand.brandId, brandTenantId: tenant.tenantId }))
      .toThrowError(expect.objectContaining({ code: "PRODUCT_TENANT_MISMATCH" }));
  });

  it("keeps modules entitlement-aware without embedding provider or storage credentials", () => {
    const module = buildProductModule({
      moduleId: "module-a",
      tenantId: tenant.tenantId,
      productId: "product-a",
      kind: "native-mini-app",
      ref: "workflow:published-1",
      productTenantId: tenant.tenantId,
      requiredEntitlementRefs: ["plan:pro"],
    });
    expect(module).toMatchObject({ requiredEntitlementRefs: ["plan:pro"] });
    expect(() => buildProductModule({
      moduleId: "module-b",
      tenantId: tenant.tenantId,
      productId: "product-a",
      kind: "custom-mini-app",
      ref: "https://app.example.com",
      productTenantId: tenant.tenantId,
      config: { apiKey: "raw-secret" },
    } as never)).toThrowError(expect.objectContaining({ code: "PRODUCT_SECRET_FORBIDDEN" }));
  });

  it("does not activate a custom domain before verification", () => {
    const pending = buildDomainBinding({
      domainId: "domain-a",
      tenantId: tenant.tenantId,
      productId: "product-a",
      productTenantId: tenant.tenantId,
      hostname: "app.example.com",
    });
    expect(pending.status).toBe("DNS_VERIFICATION_PENDING");
    expect(() => activateDomainBinding(pending)).toThrowError(expect.objectContaining({ code: "DOMAIN_NOT_VERIFIED" }));
    expect(activateDomainBinding({ ...pending, status: "CERTIFICATE_PENDING" })).toMatchObject({ status: "ACTIVE" });
  });

  it("creates an immutable release snapshot and rejects post-creation drift", () => {
    const snapshot = buildProductReleaseSnapshot({
      releaseId: "release-a",
      tenantId: tenant.tenantId,
      productId: "product-a",
      productDefinitionVersion: "product-v3",
      brandVersion: "brand-v2",
      moduleRefs: ["module-a"],
      entitlementPolicyVersion: "entitlements-v1",
    });
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(assertProductReleaseSnapshotImmutable(snapshot, snapshot)).toBe(true);
    expect(() => assertProductReleaseSnapshotImmutable(snapshot, { ...snapshot, brandVersion: "brand-v3" }))
      .toThrowError(expect.objectContaining({ code: "RELEASE_SNAPSHOT_IMMUTABLE" }));
  });

  it("denies entitlement checks by default and allows only matching tenant/product grants", () => {
    expect(evaluateProductEntitlement({
      tenantId: tenant.tenantId,
      productId: "product-a",
      principalId: "user:42",
      requiredRefs: ["plan:pro"],
      grantedRefs: ["plan:pro"],
    })).toMatchObject({ allowed: true, code: "ALLOW" });
    expect(evaluateProductEntitlement({
      tenantId: "tenant-b",
      productId: "product-a",
      principalId: "user:42",
      requiredRefs: ["plan:pro"],
      grantedRefs: ["plan:pro"],
      authorizedTenantId: tenant.tenantId,
    })).toMatchObject({ allowed: false, code: "PRODUCT_TENANT_MISMATCH" });
  });
});
