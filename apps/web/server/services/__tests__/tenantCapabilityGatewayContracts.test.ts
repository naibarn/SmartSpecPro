import { describe, expect, it } from "vitest";

import {
  buildCapabilityInvocationEnvelope,
  buildLogicalGatewayScope,
  buildProductPrincipalContext,
  buildSafeGatewayQuery,
  buildSecretReference,
  redactGatewayAuditDetails,
  scopedGatewayIdempotencyKey,
} from "../tenantCapabilityGatewayContracts";

const serverContext = {
  principalId: "user:42",
  tenantId: "tenant-a",
  productId: "product-a",
  environment: "development" as const,
  roleRefs: ["developer"],
  entitlementRefs: ["workflow:use"],
  capabilityGrantRefs: ["capability:search"],
  authMethod: "session",
};

describe("Spec 220 gateway contracts", () => {
  it("builds principal context from server authority and rejects forged identity", () => {
    expect(buildProductPrincipalContext({ server: serverContext })).toEqual(serverContext);
    expect(() => buildProductPrincipalContext({
      server: serverContext,
      requested: { tenantId: "tenant-b" },
    })).toThrowError(expect.objectContaining({ code: "GATEWAY_IDENTITY_FORBIDDEN" }));
    expect(() => buildProductPrincipalContext({
      server: serverContext,
      requested: { roleRefs: ["platform-admin"] },
    })).toThrowError(expect.objectContaining({ code: "GATEWAY_IDENTITY_FORBIDDEN" }));
  });

  it("creates a versioned invocation envelope with immutable scope and idempotency", () => {
    const context = buildProductPrincipalContext({ server: serverContext });
    const envelope = buildCapabilityInvocationEnvelope({
      context,
      capabilityId: "search.documents",
      capabilityVersion: "1.2.0",
      target: { tenantId: "tenant-a", productId: "product-a", environment: "development" },
      input: { query: "floor plan" },
      idempotencyKey: "search-1",
      sideEffect: false,
    });

    expect(envelope).toMatchObject({
      contractVersion: "spec-220-v1",
      capabilityId: "search.documents",
      capabilityVersion: "1.2.0",
      principalId: "user:42",
      tenantId: "tenant-a",
      idempotencyKey: "search-1",
    });
    expect(() => buildCapabilityInvocationEnvelope({
      context,
      capabilityId: "search.documents",
      capabilityVersion: "1.2.0",
      target: { tenantId: "tenant-b", productId: "product-a", environment: "development" },
      input: {},
      sideEffect: false,
    })).toThrowError(expect.objectContaining({ code: "GATEWAY_SCOPE_INVALID" }));
  });

  it("rejects raw SQL, raw secret values, and unsafe secret references", () => {
    const context = buildProductPrincipalContext({ server: serverContext });
    expect(() => buildSafeGatewayQuery({ sql: "select * from users" } as never))
      .toThrowError(expect.objectContaining({ code: "GATEWAY_QUERY_UNSAFE" }));
    expect(() => buildSecretReference({
      context,
      secretId: "provider-key",
      purpose: "model-call",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      value: "raw-secret",
    } as never)).toThrowError(expect.objectContaining({ code: "GATEWAY_SECRET_VALUE_FORBIDDEN" }));
  });

  it("keeps logical scope immutable and bounds safe queries", () => {
    const context = buildProductPrincipalContext({ server: serverContext });
    expect(buildLogicalGatewayScope({ context, collectionName: "projects" })).toEqual({
      tenantId: "tenant-a",
      productId: "product-a",
      environment: "development",
      collectionName: "projects",
    });
    expect(buildSafeGatewayQuery({
      fields: ["id", "name"],
      filters: [{ field: "status", operator: "eq", value: "active" }],
      limit: 25,
      cursor: "cursor-1",
    })).toMatchObject({ limit: 25 });
    expect(() => buildSafeGatewayQuery({ fields: ["password"] }))
      .toThrowError(expect.objectContaining({ code: "GATEWAY_QUERY_UNSAFE" }));
    expect(() => buildSafeGatewayQuery({
      filters: [{ field: "authorization", operator: "raw_sql" }],
    })).toThrowError(expect.objectContaining({ code: "GATEWAY_QUERY_UNSAFE" }));
  });

  it("redacts sensitive audit values and scopes idempotency by principal", () => {
    const context = buildProductPrincipalContext({ server: serverContext });
    const redacted = redactGatewayAuditDetails({
      prompt: "private text",
      authorization: "Bearer secret",
      nested: [{ apiKey: "key" }],
      visible: "ok",
    });
    expect(redacted).toEqual({
      prompt: "[REDACTED]",
      authorization: "[REDACTED]",
      nested: [{ apiKey: "[REDACTED]" }],
      visible: "ok",
    });
    expect(scopedGatewayIdempotencyKey({ context, capabilityId: "search.documents", key: "same" }))
      .not.toBe(scopedGatewayIdempotencyKey({
        context: { ...context, principalId: "user:43" },
        capabilityId: "search.documents",
        key: "same",
      }));
  });
});
