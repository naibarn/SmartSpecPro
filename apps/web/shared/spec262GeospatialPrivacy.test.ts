import { describe, expect, it } from "vitest";
import {
  authorizeGeospatialFederationShare,
  decideGeospatialRetention,
  projectPublicSpatialAggregate,
  projectSpec262SpatialLocation,
} from "../../../packages/shared/src/emergency/geospatialPrivacy";

describe("Spec 262 geospatial privacy core", () => {
  describe("spatial disclosure", () => {
    const base = {
      policyVersion: "spec262-spatial-v1",
      audience: "public" as const,
      entityClass: "protected-household" as const,
      geometry: { type: "Point" as const, coordinates: [100.501762, 13.756331] as [number, number] },
      crs: "EPSG:4326",
    };

    it("generalizes a sensitive point deterministically before public projection", () => {
      const first = projectSpec262SpatialLocation(base);
      const repeated = projectSpec262SpatialLocation({ ...base, requestedMapMode: "EXACT" });
      expect(first).toEqual(repeated);
      expect(first).toMatchObject({ mode: "GENERALIZED", crs: "EPSG:4326" });
      expect(first).not.toHaveProperty("canonicalRef");
      expect(first).not.toHaveProperty("requestedMapMode");
      expect(first.geometry?.coordinates).not.toEqual(base.geometry.coordinates);
    });

    it("labels the server-selected audience and never mutates source evidence", () => {
      const original = structuredClone(base.geometry);
      const tenant = projectSpec262SpatialLocation({ ...base, audience: "tenant" });
      const command = projectSpec262SpatialLocation({ ...base, audience: "command", authorizedExactAccess: true, purpose: "active-incident-response" });
      expect(tenant.audience).toBe("tenant");
      expect(command.audience).toBe("command");
      expect(command.mode).toBe("EXACT");
      expect(base.geometry).toEqual(original);
    });

    it("suppresses highly sensitive public locations but permits scoped exact responder access", () => {
      const facility = projectSpec262SpatialLocation({ ...base, entityClass: "critical-infrastructure" });
      expect(facility).toMatchObject({ mode: "SUPPRESSED", geometry: null });

      const responder = projectSpec262SpatialLocation({
        ...base,
        audience: "responder",
        authorizedExactAccess: true,
        purpose: "active-incident-response",
        geometry: { ...base.geometry, coordinates: [...base.geometry.coordinates] as [number, number] },
      });
      expect(responder.mode).toBe("EXACT");
      expect(responder.geometry?.coordinates).toEqual(base.geometry.coordinates);
    });

    it("fails closed for unsupported CRS, malformed, or out-of-range geometry", () => {
      expect(projectSpec262SpatialLocation({ ...base, crs: "EPSG:3857" }).mode).toBe("SUPPRESSED");
      expect(projectSpec262SpatialLocation({ ...base, geometry: { type: "Point", coordinates: [Infinity, 91] as [number, number] } }).mode).toBe("SUPPRESSED");
      const edgePoint = projectSpec262SpatialLocation({ ...base, geometry: { type: "Point", coordinates: [180, 90] } });
      expect(edgePoint.geometry?.coordinates[0]).toBeLessThanOrEqual(180);
      expect(edgePoint.geometry?.coordinates[1]).toBeLessThanOrEqual(90);
    });

    it("suppresses small cohorts and overlapping repeat queries to block differencing", () => {
      expect(projectPublicSpatialAggregate({ count: 4, minimumCohort: 5, overlappingQueryCount: 0 })).toMatchObject({ mode: "SUPPRESSED" });
      expect(projectPublicSpatialAggregate({ count: 18, minimumCohort: 5, overlappingQueryCount: 2 })).toMatchObject({ mode: "SUPPRESSED" });
      const publicCount = projectPublicSpatialAggregate({ count: 18, minimumCohort: 5, overlappingQueryCount: 0 });
      expect(publicCount).toMatchObject({ mode: "RANGE", countRange: { minimum: 15, maximum: 19 } });
      expect(publicCount).not.toHaveProperty("exactCount");
    });
  });

  describe("federation gate", () => {
    const request = {
      contractVersion: "spec262-geospatial-share-v1",
      partnerActive: true,
      partnerVerified: true,
      sourceTenantId: "tenant-a",
      tenantId: "tenant-a",
      partnerJurisdictions: ["district-1"],
      jurisdictionRef: "district-1",
      resourceType: "impact-summary" as const,
      resourceRef: "impact-7",
      fields: ["hazardClass", "severity"] as const,
      purpose: "mutual-aid-coordination",
      expiresAt: "2026-10-01T01:00:00.000Z",
      revokedAt: null,
      now: new Date("2026-10-01T00:00:00.000Z"),
    };

    it("allows only an active, verified, tenant- and jurisdiction-scoped versioned share", () => {
      expect(authorizeGeospatialFederationShare(request).allowed).toBe(true);
      expect(authorizeGeospatialFederationShare({ ...request, tenantId: "tenant-b" }).allowed).toBe(false);
      expect(authorizeGeospatialFederationShare({ ...request, partnerVerified: false }).allowed).toBe(false);
      expect(authorizeGeospatialFederationShare({ ...request, jurisdictionRef: "district-2" }).allowed).toBe(false);
      expect(authorizeGeospatialFederationShare({ ...request, revokedAt: request.now.toISOString() }).allowed).toBe(false);
      expect(authorizeGeospatialFederationShare({ ...request, expiresAt: request.now.toISOString() }).allowed).toBe(false);
    });

    it("rejects unsupported resource classes, fields, missing purpose and malformed version", () => {
      expect(authorizeGeospatialFederationShare({ ...request, resourceType: "raw-observation" as never }).allowed).toBe(false);
      expect(authorizeGeospatialFederationShare({ ...request, fields: ["exactGeometry"] as never }).allowed).toBe(false);
      expect(authorizeGeospatialFederationShare({ ...request, purpose: " " }).allowed).toBe(false);
      expect(authorizeGeospatialFederationShare({ ...request, contractVersion: "v0" }).allowed).toBe(false);
    });
  });

  describe("retention and deletion", () => {
    const base = {
      policyVersion: "spec262-retention-v1",
      requestType: "DELETE" as const,
      dataRef: "location-22",
      dataClass: "exact-personal-geometry" as const,
      now: new Date("2026-10-01T00:00:00.000Z"),
    };

    it("deletes personal geometry when no valid hold applies", () => {
      expect(decideGeospatialRetention(base)).toMatchObject({ result: "DELETE", retainedFields: [] });
    });

    it("preserves only minimum necessary fields under an active scoped, reviewed hold", () => {
      const decision = decideGeospatialRetention({
        ...base,
        legalHold: {
          holdRef: "hold-1", scopeRefs: ["location-22"], reason: "SAFETY_INVESTIGATION",
          reviewedBy: "reviewer-3", minimumFields: ["eventTime", "jurisdictionRef", "sourceRef", "latitude"],
          expiresAt: "2026-10-02T00:00:00.000Z",
        },
      });
      expect(decision).toMatchObject({ result: "RETAIN_MINIMUM_NECESSARY", retainedFields: ["eventTime", "jurisdictionRef", "sourceRef"] });
      expect(decision.retainedFields).not.toContain("latitude");
    });

    it("requires review when hold scope or review/expiry evidence is invalid", () => {
      expect(decideGeospatialRetention({ ...base, legalHold: {
        holdRef: "hold-1", scopeRefs: [], reason: "LEGAL_HOLD", reviewedBy: "reviewer-3",
        minimumFields: ["sourceRef"], expiresAt: "2026-10-02T00:00:00.000Z",
      } }).result).toBe("REQUIRES_REVIEW");
      expect(decideGeospatialRetention({ ...base, legalHold: {
        holdRef: "hold-1", scopeRefs: ["location-22"], reason: "LEGAL_HOLD", reviewedBy: " ",
        minimumFields: ["sourceRef"], expiresAt: "2026-10-02T00:00:00.000Z",
      } }).result).toBe("REQUIRES_REVIEW");
    });

    it("deidentifies provenance separately from deletion", () => {
      expect(decideGeospatialRetention({ ...base, dataClass: "canonical-provenance", preserveCanonicalProvenance: true }))
        .toMatchObject({ result: "DEIDENTIFY", retainedFields: ["eventTime", "jurisdictionRef", "sourceClass"] });
      expect(decideGeospatialRetention({ ...base, requestType: "EXPORT" })).toMatchObject({ result: "REQUIRES_REVIEW" });
    });
  });
});
