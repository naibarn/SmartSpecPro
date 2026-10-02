import { describe, expect, it } from "vitest";
import { canCreateEmergencyFederationShare, canDeliverEmergencyFederationShare, projectFederatedCase, projectFederatedSituation } from "./federation";

describe("Spec260 federation contract", () => {
  it("projects only versioned case facts and drops sensitive source fields", () => {
    const projection = projectFederatedCase({ publicRef: "CASE-1", status: "active", hazardCategory: "fire", severity: "high",
      phone: "secret", exactLocation: { lat: 1, lng: 2 } } as never, "2026-09-30T00:00:00.000Z");
    expect(projection).toEqual({ contractVersion: "spec260-federation-v1", resourceType: "case", publicRef: "CASE-1",
      status: "active", hazardCategory: "fire", severity: "high", sharedAt: "2026-09-30T00:00:00.000Z" });
  });

  it("bounds situation summaries and rejects unknown status or severity", () => {
    const projection = projectFederatedSituation({ publicRef: "SIT-1", status: "untrusted", severity: "extreme", summary: "x".repeat(900) }, "now");
    expect(projection.status).toBe("unknown");
    expect(projection.severity).toBe("unknown");
    expect((projection.projection as { summary: string }).summary).toHaveLength(500);
  });

  it("fails delivery on tenant, jurisdiction, trust, revocation, or expiry mismatch", () => {
    const base = { partnerActive: true, partnerVerified: true, sourceTenantId: "tenant-a", tenantId: "tenant-a",
      partnerJurisdictions: ["district-1"], jurisdictionRef: "district-1", expiresAt: new Date("2026-10-01T00:00:00Z"), revokedAt: null };
    const now = new Date("2026-09-30T00:00:00Z");
    expect(canDeliverEmergencyFederationShare(base, now)).toBe(true);
    expect(canDeliverEmergencyFederationShare({ ...base, tenantId: "tenant-b" }, now)).toBe(false);
    expect(canDeliverEmergencyFederationShare({ ...base, partnerVerified: false }, now)).toBe(false);
    expect(canDeliverEmergencyFederationShare({ ...base, jurisdictionRef: "district-2" }, now)).toBe(false);
    expect(canDeliverEmergencyFederationShare({ ...base, revokedAt: now }, now)).toBe(false);
    expect(canDeliverEmergencyFederationShare({ ...base, expiresAt: now }, now)).toBe(false);
  });

  it("permits only tenant-local cases with authoritative matching jurisdiction", () => {
    const base = { resourceType: "case" as const, sourceTenantId: "tenant-a", tenantId: "tenant-a",
      sourceJurisdiction: "district-1", requestedJurisdiction: "district-1", partnerJurisdictions: ["district-1"] };
    expect(canCreateEmergencyFederationShare(base)).toBe(true);
    expect(canCreateEmergencyFederationShare({ ...base, sourceTenantId: "tenant-b" })).toBe(false);
    expect(canCreateEmergencyFederationShare({ ...base, requestedJurisdiction: "district-2" })).toBe(false);
    expect(canCreateEmergencyFederationShare({ ...base, sourceJurisdiction: null })).toBe(false);
    expect(canCreateEmergencyFederationShare({ ...base, resourceType: "situation" })).toBe(false);
  });
});
