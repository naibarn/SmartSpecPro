import { describe, expect, it } from "vitest";
import {
  createInferenceRevocationInputSchema,
  inferencePolicyRevisionScopeSchema,
  normalizeInferencePolicy,
  parseFutureRevocationExpiry,
  publishInferencePolicyInputSchema,
} from "../policyAdministration";
import { DEFAULT_INFERENCE_ROUTER_POLICY } from "../routerPolicy";

describe("Spec 231 policy administration contracts", () => {
  it("normalizes provider, region and credential scopes deterministically", () => {
    expect(
      normalizeInferencePolicy({
        ready: true,
        allowedProviderIds: ["provider-b", "provider-a"],
        allowedRegions: ["TH", "SG"],
        allowedCredentialOwnerRefs: ["tenant:key", "platform:key"],
        requireZeroDataRetention: true,
      })
    ).toEqual({
      ok: true,
      policy: {
        ready: true,
        allowedProviderIds: ["provider-a", "provider-b"],
        allowedRegions: ["SG", "TH"],
        allowedCredentialOwnerRefs: ["platform:key", "tenant:key"],
        requireZeroDataRetention: true,
      },
    });
  });

  it("normalizes platform route-score weights as immutable policy data", () => {
    const normalized = normalizeInferencePolicy({
      ready: true,
      allowedProviderIds: ["provider-a"],
      allowedRegions: ["TH"],
      allowedCredentialOwnerRefs: ["platform:key"],
      requireZeroDataRetention: false,
      routingPolicy: DEFAULT_INFERENCE_ROUTER_POLICY,
    });
    expect(normalized).toMatchObject({
      ok: true,
      policy: { routingPolicy: DEFAULT_INFERENCE_ROUTER_POLICY },
    });
  });

  it("rejects duplicate or malformed permission entries", () => {
    expect(
      normalizeInferencePolicy({
        ready: true,
        allowedProviderIds: ["provider-a", "provider-a"],
        allowedRegions: ["TH"],
        allowedCredentialOwnerRefs: ["platform:key"],
        requireZeroDataRetention: false,
      })
    ).toEqual({ ok: false });
  });

  it("requires exact scope fields for platform, tenant and principal policies", () => {
    const policy = {
      ready: true,
      allowedProviderIds: ["provider-a"],
      allowedRegions: ["TH"],
      allowedCredentialOwnerRefs: ["platform:key"],
      requireZeroDataRetention: false,
      routingPolicy: DEFAULT_INFERENCE_ROUTER_POLICY,
    };
    expect(
      publishInferencePolicyInputSchema.safeParse({
        scopeType: "platform",
        policy,
      }).success
    ).toBe(true);
    expect(
      publishInferencePolicyInputSchema.safeParse({
        scopeType: "principal",
        tenantId: "tenant-a",
        principalRef: "user-1",
        policy: {
          ready: true,
          allowedProviderIds: ["provider-a"],
          allowedRegions: ["TH"],
          allowedCredentialOwnerRefs: ["platform:key"],
          requireZeroDataRetention: false,
        },
      }).success
    ).toBe(true);
    expect(
      publishInferencePolicyInputSchema.safeParse({
        scopeType: "principal",
        tenantId: "tenant-a",
        policy,
      }).success
    ).toBe(false);
  });

  it("requires router weights only on platform scope and validates a million-ppm total", () => {
    const basePolicy = {
      ready: true,
      allowedProviderIds: ["provider-a"],
      allowedRegions: ["TH"],
      allowedCredentialOwnerRefs: ["platform:key"],
      requireZeroDataRetention: false,
    };
    expect(publishInferencePolicyInputSchema.safeParse({
      scopeType: "platform",
      policy: basePolicy,
    }).success).toBe(false);
    expect(publishInferencePolicyInputSchema.safeParse({
      scopeType: "platform",
      policy: { ...basePolicy, routingPolicy: DEFAULT_INFERENCE_ROUTER_POLICY },
    }).success).toBe(true);
    expect(publishInferencePolicyInputSchema.safeParse({
      scopeType: "tenant",
      tenantId: "tenant-a",
      policy: { ...basePolicy, routingPolicy: DEFAULT_INFERENCE_ROUTER_POLICY },
    }).success).toBe(false);
    expect(normalizeInferencePolicy({
      ...basePolicy,
      routingPolicy: {
        ...DEFAULT_INFERENCE_ROUTER_POLICY,
        weights: { ...DEFAULT_INFERENCE_ROUTER_POLICY.weights, costPpm: 49_999 },
      },
    })).toEqual({ ok: false });
  });

  it("validates exact scope keys for revision history and rollback", () => {
    expect(inferencePolicyRevisionScopeSchema.safeParse({
      scopeType: "platform",
      scopeKey: "platform",
    }).success).toBe(true);
    expect(inferencePolicyRevisionScopeSchema.safeParse({
      scopeType: "platform",
      scopeKey: "tenant-a",
    }).success).toBe(false);
    expect(inferencePolicyRevisionScopeSchema.safeParse({
      scopeType: "principal",
      scopeKey: "tenant-a:user-1",
    }).success).toBe(true);
  });

  it("accepts reversible tenant and principal emergency revocations", () => {
    const common = {
      targetType: "deployment",
      targetId: "deployment:provider-map:123",
      reasonCode: "security_incident",
      expiresAt: "2026-09-28T12:00:00.000Z",
    };
    expect(createInferenceRevocationInputSchema.safeParse({
      ...common,
      scopeType: "tenant",
      tenantId: "tenant-a",
    }).success).toBe(true);
    expect(createInferenceRevocationInputSchema.safeParse({
      ...common,
      scopeType: "principal",
      tenantId: "tenant-a",
      principalRef: "user-1",
    }).success).toBe(true);
  });

  it("rejects ambiguous scope, unbounded permanence and arbitrary reason codes", () => {
    const base = {
      scopeType: "tenant",
      tenantId: "tenant-a",
      targetType: "model",
      targetId: "model:provider:model-a",
      reasonCode: "security_incident",
      expiresAt: "2026-09-28T12:00:00.000Z",
    };
    expect(createInferenceRevocationInputSchema.safeParse({ ...base, principalRef: "user-1" }).success).toBe(false);
    expect(createInferenceRevocationInputSchema.safeParse({ ...base, expiresAt: undefined }).success).toBe(false);
    expect(createInferenceRevocationInputSchema.safeParse({ ...base, reasonCode: "because" }).success).toBe(false);
  });

  it("rejects an expired or invalid emergency fence expiry", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    expect(parseFutureRevocationExpiry("2026-09-28T00:00:00.000Z", now)).toEqual(
      new Date("2026-09-28T00:00:00.000Z")
    );
    expect(parseFutureRevocationExpiry("2026-09-26T00:00:00.000Z", now)).toBeNull();
    expect(parseFutureRevocationExpiry("invalid", now)).toBeNull();
  });
});
