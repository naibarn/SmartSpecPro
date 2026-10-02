import { describe, expect, it } from "vitest";
import { getThailandProviderPack } from "../manifest";
import { evaluateThailandCapabilityHealth } from "../health";

const source = getThailandProviderPack().sources[0]!;
const capability = source.capabilities[0]!;

const verified = {
  endpointVerified: true,
  accessVerified: true,
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
  verifiedGeographies: ["TH-10", "TH-13"],
};

describe("Thailand capability health projection", () => {
  it("returns not-configured rather than available for an unqualified candidate", () => {
    expect(
      evaluateThailandCapabilityHealth({
        source,
        capability,
        evidence: {},
        geography: "TH-10",
        now: "2026-10-01T00:00:00.000Z",
      })
    ).toMatchObject({ status: "NOT_CONFIGURED", publishable: false });
  });

  it("isolates supported and unsupported geography at capability scope", () => {
    const input = {
      source,
      capability,
      evidence: verified,
      verifiedGeographies: ["TH-10", "TH-13"],
      lastSuccessAt: "2026-10-01T00:00:00.000Z",
      now: "2026-10-01T00:00:30.000Z",
    };
    expect(
      evaluateThailandCapabilityHealth({ ...input, geography: "TH-10" })
    ).toMatchObject({ status: "AVAILABLE", publishable: true });
    expect(
      evaluateThailandCapabilityHealth({ ...input, geography: "US-CA" })
    ).toMatchObject({ status: "UNSUPPORTED", publishable: false });
  });

  it("labels successful data stale after its declared freshness window", () => {
    expect(
      evaluateThailandCapabilityHealth({
        source,
        capability,
        evidence: verified,
        verifiedGeographies: ["TH-13"],
        geography: "TH-13",
        lastSuccessAt: "2026-09-30T23:00:00.000Z",
        now: "2026-10-01T00:00:00.000Z",
      })
    ).toMatchObject({
      status: "STALE",
      publishable: false,
      staleAgeSeconds: 3600,
    });
  });

  it("distinguishes a recent successful empty response from expected silence, outage and partial coverage", () => {
    const base = {
      source,
      capability,
      evidence: verified,
      verifiedGeographies: ["TH-10"],
      geography: "TH-10",
      lastSuccessAt: "2026-10-01T00:00:00.000Z",
      now: "2026-10-01T00:00:30.000Z",
    };
    expect(
      evaluateThailandCapabilityHealth({ ...base, lastResult: "EMPTY_HEALTHY" })
    ).toMatchObject({ status: "AVAILABLE", dataState: "EMPTY_HEALTHY" });
    expect(
      evaluateThailandCapabilityHealth({
        ...base,
        lastResult: "EXPECTED_SILENCE",
      })
    ).toMatchObject({ status: "AVAILABLE", dataState: "EXPECTED_SILENCE" });
    expect(
      evaluateThailandCapabilityHealth({
        ...base,
        lastResult: "INCOMPLETE_PAGINATION",
      })
    ).toMatchObject({ status: "PARTIAL", publishable: false });
    expect(
      evaluateThailandCapabilityHealth({ ...base, lastResult: "OUTAGE" })
    ).toMatchObject({ status: "TEMPORARILY_UNAVAILABLE", publishable: false });
  });

  it("does not let old captures become fresh when an outage is reported", () => {
    expect(
      evaluateThailandCapabilityHealth({
        source,
        capability,
        evidence: verified,
        verifiedGeographies: ["TH-10"],
        geography: "TH-10",
        lastSuccessAt: "2026-10-01T00:00:00.000Z",
        now: "2026-10-01T00:00:30.000Z",
        lastResult: "OUTAGE",
      })
    ).toMatchObject({
      status: "TEMPORARILY_UNAVAILABLE",
      publishable: false,
      lastSuccessAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("rejects malformed clocks and impossible capability bounds without throwing", () => {
    expect(
      evaluateThailandCapabilityHealth({
        source,
        capability,
        evidence: verified,
        verifiedGeographies: ["TH-10"],
        geography: "TH-10",
        now: "not-time",
      })
    ).toMatchObject({ status: "DEGRADED", publishable: false });
  });
});
