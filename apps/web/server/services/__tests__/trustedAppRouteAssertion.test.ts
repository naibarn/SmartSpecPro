import { describe, expect, it, vi } from "vitest";

import {
  resolveTrustedAppRouteAssertion,
  type TrustedAppRouteAssertionVerifier,
  type VerifiedAppRouteAssertion,
} from "../trustedAppRouteAssertion";

const nowMs = Date.parse("2026-10-10T00:00:00.000Z");
const claims: VerifiedAppRouteAssertion = {
  issuer: "edge-router",
  audience: "smartspec-web",
  assertionId: "route-assertion-1",
  tenantId: "tenant-notes",
  appId: "app-notes",
  publicAppId: "public-notes",
  routeHostname: "notes.example.com",
  issuedAtMs: nowMs - 1_000,
  expiresAtMs: nowMs + 10_000,
};

function setup(
  options: {
    verified?: VerifiedAppRouteAssertion | null;
    authenticatedTenantId?: string | null;
    route?: { appId: string; publicAppId: string; tenantId: string } | null;
  } = {}
) {
  const verifier: TrustedAppRouteAssertionVerifier = {
    verifyAndConsume: vi.fn(async () =>
      Object.hasOwn(options, "verified") ? options.verified! : claims
    ),
  };
  const resolveRoute = vi.fn(async () =>
    Object.hasOwn(options, "route")
      ? options.route!
      : {
          appId: "app-notes",
          publicAppId: "public-notes",
          tenantId: "tenant-notes",
        }
  );
  return { verifier, resolveRoute };
}

describe("SPEC-304 trusted App route assertion consumer", () => {
  it("resolves a canonical App only from verifier-authenticated ingress claims", async () => {
    const { verifier, resolveRoute } = setup();
    const result = await resolveTrustedAppRouteAssertion({
      assertion: "opaque-signed-assertion",
      authenticatedTenantId: "tenant-notes",
      verifier,
      resolveRoute,
      expectedIssuer: "edge-router",
      expectedAudience: "smartspec-web",
      nowMs,
    });

    expect(resolveRoute).toHaveBeenCalledWith({
      tenantId: "tenant-notes",
      kind: "custom-domain",
      value: "notes.example.com",
    });
    expect(result).toEqual({
      version: "spec304-trusted-host-app-context.v1",
      tenantId: "tenant-notes",
      hostAppId: "app-notes",
      publicAppId: "public-notes",
      routeProvenance: "verified_custom_domain_alias",
      permissionCeiling: {
        projectMemoryRead: "authorized_bound_project_only",
        durableProjectMemoryWrite: false,
      },
      policyVersion: "spec269-app-project-memory.phase1.v1",
    });
    expect(verifier.verifyAndConsume).toHaveBeenCalledWith(
      "opaque-signed-assertion"
    );
  });

  it.each([
    ["missing assertion", { verified: null }],
    ["wrong issuer", { verified: { ...claims, issuer: "other-edge" } }],
    ["wrong audience", { verified: { ...claims, audience: "other-service" } }],
    [
      "cross-tenant assertion",
      { verified: { ...claims, tenantId: "tenant-other" } },
    ],
    ["expired assertion", { verified: { ...claims, expiresAtMs: nowMs } }],
    [
      "future assertion",
      { verified: { ...claims, issuedAtMs: nowMs + 60_000 } },
    ],
    [
      "overlong assertion",
      { verified: { ...claims, expiresAtMs: nowMs + 120_000 } },
    ],
    [
      "invalid replay ID",
      { verified: { ...claims, assertionId: " replay-id" } },
    ],
    [
      "noncanonical route hostname",
      { verified: { ...claims, routeHostname: "Notes.example.com" } },
    ],
  ] as const)("fails closed for %s", async (_name, options) => {
    const { verifier, resolveRoute } = setup(options);
    const result = await resolveTrustedAppRouteAssertion({
      assertion: "opaque-signed-assertion",
      authenticatedTenantId: "tenant-notes",
      verifier,
      resolveRoute,
      expectedIssuer: "edge-router",
      expectedAudience: "smartspec-web",
      nowMs,
    });
    expect(result).toBeNull();
    expect(resolveRoute).not.toHaveBeenCalled();
  });

  it.each([
    [
      "wrong App",
      {
        appId: "app-other",
        publicAppId: "public-other",
        tenantId: "tenant-notes",
      },
    ],
    [
      "cross-tenant route",
      {
        appId: "app-notes",
        publicAppId: "public-notes",
        tenantId: "tenant-other",
      },
    ],
    ["revoked alias", null],
  ] as const)("fails closed for %s", async (_name, route) => {
    const { verifier, resolveRoute } = setup({ route });
    const result = await resolveTrustedAppRouteAssertion({
      assertion: "opaque-signed-assertion",
      authenticatedTenantId: "tenant-notes",
      verifier,
      resolveRoute,
      expectedIssuer: "edge-router",
      expectedAudience: "smartspec-web",
      nowMs,
    });
    expect(result).toBeNull();
  });

  it("fails closed if authenticated tenant authority is absent", async () => {
    const { verifier, resolveRoute } = setup();
    const result = await resolveTrustedAppRouteAssertion({
      assertion: "opaque-signed-assertion",
      authenticatedTenantId: null,
      verifier,
      resolveRoute,
      expectedIssuer: "edge-router",
      expectedAudience: "smartspec-web",
      nowMs,
    });
    expect(result).toBeNull();
    expect(verifier.verifyAndConsume).not.toHaveBeenCalled();
    expect(resolveRoute).not.toHaveBeenCalled();
  });

  it("fails closed when expected issuer or audience configuration is empty", async () => {
    const { verifier, resolveRoute } = setup();
    const result = await resolveTrustedAppRouteAssertion({
      assertion: "opaque-signed-assertion",
      authenticatedTenantId: "tenant-notes",
      verifier,
      resolveRoute,
      expectedIssuer: " ",
      expectedAudience: "smartspec-web",
      nowMs,
    });
    expect(result).toBeNull();
    expect(verifier.verifyAndConsume).not.toHaveBeenCalled();
    expect(resolveRoute).not.toHaveBeenCalled();
  });

  it("rejects claims with extra or accessor fields even when returned by a verifier", async () => {
    const extraClaim = { ...claims, projectId: "project-attacker" };
    const { verifier, resolveRoute } = setup({
      verified: extraClaim as VerifiedAppRouteAssertion,
    });
    const result = await resolveTrustedAppRouteAssertion({
      assertion: "opaque-signed-assertion",
      authenticatedTenantId: "tenant-notes",
      verifier,
      resolveRoute,
      expectedIssuer: "edge-router",
      expectedAudience: "smartspec-web",
      nowMs,
    });
    expect(result).toBeNull();
    expect(resolveRoute).not.toHaveBeenCalled();

    const hiddenClaim = { ...claims } as VerifiedAppRouteAssertion &
      Record<string, unknown>;
    Object.defineProperty(hiddenClaim, "projectId", {
      value: "project-attacker",
      enumerable: false,
    });
    const hiddenSetup = setup({ verified: hiddenClaim });
    const hiddenResult = await resolveTrustedAppRouteAssertion({
      assertion: "opaque-signed-assertion",
      authenticatedTenantId: "tenant-notes",
      verifier: hiddenSetup.verifier,
      resolveRoute: hiddenSetup.resolveRoute,
      expectedIssuer: "edge-router",
      expectedAudience: "smartspec-web",
      nowMs,
    });
    expect(hiddenResult).toBeNull();
    expect(hiddenSetup.resolveRoute).not.toHaveBeenCalled();
  });

  it("ignores client host, App, and Project fields outside the verified assertion", async () => {
    const { verifier, resolveRoute } = setup();
    const input = {
      assertion: "opaque-signed-assertion",
      authenticatedTenantId: "tenant-notes",
      verifier,
      resolveRoute,
      expectedIssuer: "edge-router",
      expectedAudience: "smartspec-web",
      nowMs,
      host: "attacker.example.net",
      hostAppId: "app-attacker",
      projectId: "project-attacker",
    };
    const result = await resolveTrustedAppRouteAssertion(input);
    expect(result?.hostAppId).toBe("app-notes");
    expect(verifier.verifyAndConsume).toHaveBeenCalledWith(
      "opaque-signed-assertion"
    );
    expect(resolveRoute).toHaveBeenCalledWith({
      tenantId: "tenant-notes",
      kind: "custom-domain",
      value: "notes.example.com",
    });
  });

  it("fails closed when assertion verification or route resolution errors", async () => {
    const verifier: TrustedAppRouteAssertionVerifier = {
      verifyAndConsume: vi.fn(async () => {
        throw new Error("invalid signature");
      }),
    };
    const result = await resolveTrustedAppRouteAssertion({
      assertion: "forged",
      authenticatedTenantId: "tenant-notes",
      verifier,
      resolveRoute: vi.fn(async () => null),
      expectedIssuer: "edge-router",
      expectedAudience: "smartspec-web",
      nowMs,
    });
    expect(result).toBeNull();

    const { verifier: validVerifier } = setup();
    const routeFailure = await resolveTrustedAppRouteAssertion({
      assertion: "valid",
      authenticatedTenantId: "tenant-notes",
      verifier: validVerifier,
      resolveRoute: vi.fn(async () => {
        throw new Error("route store unavailable");
      }),
      expectedIssuer: "edge-router",
      expectedAudience: "smartspec-web",
      nowMs,
    });
    expect(routeFailure).toBeNull();
  });
});
