import { describe, expect, it } from "vitest";

import {
  activateAppRouteAlias,
  activateDomainBinding,
  assertProductReleaseSnapshotImmutable,
  buildAppIdentity,
  buildAppRouteAlias,
  buildBrandVersion,
  buildDomainBinding,
  buildProductDefinition,
  buildProductModule,
  buildProductReleaseSnapshot,
  buildTenantIdentity,
  evaluateProductEntitlement,
  resolveAppRouteAlias,
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

describe("Spec 304 App identity and route aliases", () => {
  const app = buildAppIdentity({
    appId: "app_internal_1",
    publicAppId: "app_public_1",
    tenantId: tenant.tenantId,
    publisherId: "user_42",
    canonicalProductId: "product_notes",
    policyRefs: ["policy_default"],
    createdAt: "2026-10-07T12:00:00.000Z",
    lifecycle: "active",
  });

  it("keeps stable App identity separate from a mutable route alias", () => {
    const first = activateAppRouteAlias(buildAppRouteAlias({
      aliasId: "alias_notes",
      tenantId: tenant.tenantId,
      appId: app.appId,
      appTenantId: app.tenantId,
      kind: "slug",
      value: "research-notes",
    }));
    expect(resolveAppRouteAlias({ alias: first, app, tenantId: tenant.tenantId })).toEqual({
      appId: "app_internal_1",
      publicAppId: "app_public_1",
      tenantId: "tenant-a",
    });

    const renamed = activateAppRouteAlias(buildAppRouteAlias({
      aliasId: "alias_notes_v2",
      tenantId: tenant.tenantId,
      appId: app.appId,
      appTenantId: app.tenantId,
      kind: "slug",
      value: "field-notes",
    }));
    expect(resolveAppRouteAlias({ alias: renamed, app, tenantId: tenant.tenantId })?.publicAppId)
      .toBe("app_public_1");
  });

  it("fails closed for unverified, cross-tenant, or inactive aliases", () => {
    const pending = buildAppRouteAlias({
      aliasId: "alias_custom",
      tenantId: tenant.tenantId,
      appId: app.appId,
      appTenantId: app.tenantId,
      kind: "custom-domain",
      value: "notes.example.com",
    });
    expect(() => activateAppRouteAlias(pending)).toThrowError(
      expect.objectContaining({ code: "APP_ROUTE_ALIAS_NOT_VERIFIED" }),
    );
    expect(resolveAppRouteAlias({ alias: { ...pending, status: "ACTIVE" }, app, tenantId: "tenant-other" }))
      .toBeNull();
    expect(resolveAppRouteAlias({
      alias: { ...pending, status: "ACTIVE" },
      app: { ...app, lifecycle: "suspended" },
      tenantId: tenant.tenantId,
    })).toBeNull();
  });

  it("rejects identity data with tenant or timestamp ambiguity", () => {
    expect(() => buildAppIdentity({
      appId: "app_bad",
      publicAppId: "app_public_bad",
      tenantId: "tenant-a",
      publisherId: "user_42",
      canonicalProductId: "product_notes",
      createdAt: "not-a-date",
    })).toThrowError(expect.objectContaining({ code: "APP_IDENTITY_INVALID" }));
    expect(() => buildAppIdentity({
      appId: "app_clone",
      publicAppId: "app_public_clone",
      tenantId: tenant.tenantId,
      publisherId: "user_42",
      canonicalProductId: "product_notes",
      parentAppId: "app_clone",
      createdAt: "2026-10-07T12:00:00.000Z",
    })).toThrowError(expect.objectContaining({ code: "APP_IDENTITY_INVALID" }));
    expect(() => buildAppRouteAlias({
      aliasId: "alias_cross_tenant",
      tenantId: "tenant-b",
      appId: app.appId,
      appTenantId: app.tenantId,
      kind: "slug",
      value: "research-notes",
    })).toThrowError(expect.objectContaining({ code: "PRODUCT_TENANT_MISMATCH" }));
    expect(() => buildAppRouteAlias({
      aliasId: "alias_invalid_kind",
      tenantId: tenant.tenantId,
      appId: app.appId,
      appTenantId: app.tenantId,
      kind: "unknown",
      value: "research-notes",
    } as never)).toThrowError(expect.objectContaining({ code: "APP_ROUTE_ALIAS_INVALID" }));
  });
});
