import { describe, expect, it } from "vitest";
import {
  getThailandProviderPack,
  isThailandCapabilityQualified,
} from "../manifest";

describe("Thailand intelligence provider pack", () => {
  it("declares a stable versioned pack and unique source and capability identifiers", () => {
    const pack = getThailandProviderPack();
    expect(pack.packId).toBe("TH_INTELLIGENCE_PACK");
    expect(pack.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(new Set(pack.sources.map(source => source.sourceId)).size).toBe(
      pack.sources.length
    );
    const capabilityIds = pack.sources.flatMap(source =>
      source.capabilities.map(capability => capability.capabilityId)
    );
    expect(new Set(capabilityIds).size).toBe(capabilityIds.length);
  });

  it("keeps candidate sources capability and geography scoped with explicit qualification metadata", () => {
    const pack = getThailandProviderPack();
    expect(pack.sources.length).toBeGreaterThanOrEqual(10);
    for (const source of pack.sources) {
      expect(source.contractVersion).toBeTruthy();
      expect(
        source.capabilities.every(
          capability => capability.geographyScopes.length > 0
        )
      ).toBe(true);
      expect(source.expectedCadenceSeconds).toBeNull();
      expect(source.cadenceEvidence).toBe("UNVERIFIED");
      expect(source.rightsStatus).toBe("UNVERIFIED");
      expect(source.licenseRef).toBeNull();
      expect(source.attribution).toBeNull();
      expect(source.permittedPurposes).toEqual(["emergency-response"]);
      expect(source.retentionClass).toBeNull();
      expect(source.failurePolicy).toMatchObject({
        isolateCapability: true,
        retainLastSafeOutput: true,
        blockFreshnessGatedActions: true,
      });
      expect(source.capabilities.length).toBeGreaterThan(0);
      for (const capability of source.capabilities) {
        expect(capability.geographyScopes.length).toBeGreaterThan(0);
        expect(capability.supportedQualityClasses.length).toBeGreaterThan(0);
      }
    }
  });

  it("includes a traceable primary research reference for every candidate", () => {
    const pack = getThailandProviderPack();
    expect(pack.sources).toHaveLength(13);
    for (const source of pack.sources) {
      expect(new URL(source.researchUrl).protocol).toBe("https:");
      expect([
        "API_DOCUMENTATION",
        "OFFICIAL_DATA_PAGE",
        "OFFICIAL_PORTAL",
        "RESEARCH_LEAD",
      ]).toContain(source.researchEvidence);
      expect(source.endpointReference).toBeNull();
      expect(source.qualificationBlockers).toContain("ENDPOINT_UNVERIFIED");
      expect(source.qualificationBlockers).toContain("AUTHENTICATION_UNVERIFIED");
      expect(source.qualificationBlockers).toContain("ADAPTER_NOT_IMPLEMENTED");
      expect(source.rightsStatus).toBe("UNVERIFIED");
    }
  });

  it("does not qualify candidate sources before endpoint, terms, cadence, attribution and coverage evidence exist", () => {
    const pack = getThailandProviderPack();
    for (const source of pack.sources) {
      for (const capability of source.capabilities) {
        expect(
          isThailandCapabilityQualified(source, capability, {
            endpointVerified: true,
            accessVerified: true,
            authenticationVerified: true,
            contractFixtureVerified: true,
            schemaVerified: true,
            cadenceVerified: true,
            rightsGranted: true,
            attributionVerified: true,
            coverageVerified: true,
          })
        ).toBe(false);
      }
    }
  });

  it("requires every independent gate and matching geography before qualification", () => {
    const pack = getThailandProviderPack();
    const source = pack.sources[0]!;
    const capability = source.capabilities[0]!;
    const evidence = {
      endpointVerified: true,
      accessVerified: true,
      authenticationVerified: true,
      contractFixtureVerified: true,
      schemaVerified: true,
      cadenceVerified: true,
      rightsGranted: true,
      attributionVerified: true,
      coverageVerified: true,
      licenseRef: "https://licenses.example.org/approved",
      attribution: "Agency attribution",
      expectedCadenceSeconds: 300,
      staleAfterSeconds: 900,
      retentionClass: "operational-30d",
      verifiedGeographies: ["TH-10"],
    };
    expect(
      isThailandCapabilityQualified(source, capability, evidence, "TH-10")
    ).toBe(true);
    expect(
      isThailandCapabilityQualified(source, capability, {
        ...evidence,
        rightsGranted: false,
      })
    ).toBe(false);
    expect(
      isThailandCapabilityQualified(source, capability, {
        ...evidence,
        coverageVerified: false,
      })
    ).toBe(false);
    expect(
      isThailandCapabilityQualified(source, capability, evidence, "TH-50")
    ).toBe(false);
    expect(
      isThailandCapabilityQualified(
        source,
        capability,
        { ...evidence, licenseRef: "javascript:alert(1)" },
        "TH-10"
      )
    ).toBe(false);
    expect(
      isThailandCapabilityQualified(
        source,
        capability,
        {
          ...evidence,
          expectedCadenceSeconds: 10 ** 12,
          staleAfterSeconds: 10 ** 12,
        },
        "TH-10"
      )
    ).toBe(false);
  });
});
