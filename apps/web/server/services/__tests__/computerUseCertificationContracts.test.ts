import { describe, expect, it } from "vitest";

import {
  assertComputerUseCertification,
  buildComputerUseCertificationEvidenceBundle,
  buildComputerUseQualification,
} from "../computerUseCertificationContracts";

const baseQualification = {
  qualificationId: "cu-cert-001",
  providerId: "provider-neutral",
  providerVersion: "1.0.0",
  engineRef: "computer-use:spec-208",
  supportedSemantics: ["click", "type", "submit"] as const,
  capabilitySnapshotRevision: "cap:abc123",
  capabilitySnapshotFresh: true,
  fallbackOrder: ["structured", "semantic", "localRunner", "visual"] as const,
  mandatoryCases: [
    { id: "structured-click", status: "passed" as const },
    { id: "semantic-type", status: "passed" as const },
    { id: "policy-denial", status: "passed" as const },
  ],
  providerNeutral: true,
  secondEngineIntroduced: false,
};

describe("P213 provider-neutral Computer Use certification", () => {
  it("accepts only the existing Spec 208 engine and canonical fallback order", () => {
    expect(buildComputerUseQualification(baseQualification)).toMatchObject({ engineRef: "computer-use:spec-208" });
    expect(() => buildComputerUseQualification({ ...baseQualification, engineRef: "computer-use:second-engine" })).toThrow("SECOND_ENGINE_FORBIDDEN");
    expect(() => buildComputerUseQualification({ ...baseQualification, fallbackOrder: ["visual", "structured", "semantic", "localRunner"] })).toThrow("FALLBACK_ORDER_INVALID");
  });

  it("rejects unsupported semantics and stale capability snapshots", () => {
    expect(() => buildComputerUseQualification({ ...baseQualification, supportedSemantics: ["click", "desktop-shell"] })).toThrow("SEMANTIC_UNSUPPORTED");
    expect(() => buildComputerUseQualification({ ...baseQualification, capabilitySnapshotFresh: false })).toThrow("CAPABILITY_SNAPSHOT_STALE");
  });

  it("requires provider-neutral mandatory cases and fail-closed policy/approval cases", () => {
    expect(assertComputerUseCertification(buildComputerUseQualification(baseQualification))).toBe(true);
    expect(() => assertComputerUseCertification(buildComputerUseQualification({ ...baseQualification, providerNeutral: false }))).toThrow("PROVIDER_LOCK_IN");
    expect(() => assertComputerUseCertification(buildComputerUseQualification({ ...baseQualification, mandatoryCases: [{ id: "unsafe-fallback", status: "failed" as const }] }))).toThrow("CERTIFICATION_CASE_FAILED");
  });

  it("derives a blocked immutable evidence result when live Runner proof is absent", () => {
    const bundle = buildComputerUseCertificationEvidenceBundle({
      sourceCommit: "abc123",
      specRevision: "208-r20",
      runnerVersion: "0.1.0",
      runnerSessionId: "runner-session-1",
      adapterVersion: "browser.v1",
      browserVersion: "145.0.7632.6",
      decisionProvider: "jev@1.0.0",
      calibrationRevision: "cal-1",
      capabilitySnapshotRevision: "snapshot-1",
      configurationRevision: "config-1",
      liveRunnerProof: false,
      caseResults: Array.from({ length: 20 }, (_, index) => ({
        id: `case-${index + 1}`,
        status: "passed" as const,
        evidenceRefs: [`evidence-${index + 1}`],
      })),
      timestamp: "2026-09-20T12:00:00.000Z",
    });
    expect(bundle.finalResult).toBe("BLOCKED");
    expect(bundle.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(() => ((bundle as { finalResult: string }).finalResult = "PASS")).toThrow();
  });

  it("does not allow a manually supplied PASS without live proof and independent verification", () => {
    expect(() =>
      buildComputerUseCertificationEvidenceBundle({
        sourceCommit: "abc123",
        specRevision: "208-r20",
        runnerVersion: "0.1.0",
        runnerSessionId: "runner-session-1",
        adapterVersion: "browser.v1",
        browserVersion: "145.0.7632.6",
        decisionProvider: "jev@1.0.0",
        calibrationRevision: "cal-1",
        capabilitySnapshotRevision: "snapshot-1",
        configurationRevision: "config-1",
        liveRunnerProof: true,
        independentlyVerified: false,
        requestedResult: "PASS",
        caseResults: [],
        timestamp: "2026-09-20T12:00:00.000Z",
      }),
    ).toThrow("CERTIFICATION_EVIDENCE_INCOMPLETE");
  });
});
