import { describe, expect, it } from "vitest";
import {
  analyzeCorroboration,
  recommendSourceCandidateMatch,
  isResearchArtifactScanPassed,
  validateDerivedKnowledgeClaim,
  validateEvidenceCandidate,
  validateResearchArtifact,
  validateResearchWatchChangeNotice,
  validateSourceCandidate,
} from "./researchAdmission";

const source = (id: string, url: string, runId: string) => ({
  sourceCandidateId: id,
  proposedSourceName: "Flood bulletin",
  canonicalUrlOrEndpoint: url,
  likelyCapabilities: ["flood.warning"],
  rightsStatus: "unchecked",
  discoveredByResearchRunIds: [runId],
  status: "DISCOVERED",
});

describe("research candidate admission", () => {
  it("returns a match recommendation for the same canonical endpoint and preserves discovery provenance", () => {
    const result = recommendSourceCandidateMatch(
      source("candidate-a", "HTTPS://Example.org:443/bulletin/?edition=1#top", "run-a"),
      source("candidate-b", "https://example.org/bulletin/?edition=1", "run-b"),
    );
    expect(result).toEqual({
      matchRecommended: true,
      reasons: ["CANONICAL_ENDPOINT_MATCH"],
      discoveryRunIds: ["run-a", "run-b"],
      candidateIds: ["candidate-a", "candidate-b"],
    });
  });

  it("does not collapse distinct endpoint query identities", () => {
    const result = recommendSourceCandidateMatch(
      source("candidate-a", "https://example.org/api?dataset=one", "run-a"),
      source("candidate-b", "https://example.org/api?dataset=two", "run-b"),
    );
    expect(result.matchRecommended).toBe(false);
  });

  it("uses explicit provider, dataset, or API schema identity only as a recommendation", () => {
    const left = { ...source("candidate-a", "https://example.org/api?dataset=one", "run-a"), providerIdentityRef: "provider:agency", datasetIdentifier: "flood:v1" };
    const right = { ...source("candidate-b", "https://other.example/api?dataset=one", "run-b"), providerIdentityRef: "provider:agency", datasetIdentifier: "flood:v1" };
    expect(recommendSourceCandidateMatch(left, right)).toMatchObject({ matchRecommended: true, reasons: ["PROVIDER_AND_DATASET_IDENTITY_MATCH"], discoveryRunIds: ["run-a", "run-b"] });
  });

  it("rejects untrusted unknown, secret-bearing, sparse and oversized candidate data", () => {
    expect(validateSourceCandidate({ ...source("candidate-a", "https://example.org", "run-a"), apiKey: "secret" }).ok).toBe(false);
    expect(validateSourceCandidate({ ...source("candidate-a", "javascript:alert(1)", "run-a") }).ok).toBe(false);
    expect(validateSourceCandidate({ ...source("candidate-a", "https://user:pass@example.org/data", "run-a") }).ok).toBe(false);
    expect(validateSourceCandidate({ ...source("candidate-a", "https://example.org/data?api_key=secret", "run-a") }).ok).toBe(false);
    expect(validateEvidenceCandidate({ evidenceCandidateId: "e1", researchRunId: "r1", fetchedAt: "2026-10-02T00:00:00Z", evidenceClass: "observation", verificationState: "unverified", lineageRefs: Array(129).fill("x"), admissionState: "DISCOVERED" }).ok).toBe(false);
    expect(validateEvidenceCandidate({ evidenceCandidateId: "e1", researchRunId: "r1", fetchedAt: "2026-10-02T00:00:00.000Z", evidenceClass: "observation", verificationState: "unverified", lineageRefs: [], admissionState: "DISCOVERED", geometry: { type: "Point", coordinates: [181, 0] } }).ok).toBe(false);
  });

  it("counts a republication chain as one independent root and exposes why", () => {
    const result = analyzeCorroboration({
      evidence: [
      { evidenceCandidateId: "government", researchRunId: "r1", originalSourceRef: "source:gov", fetchedAt: "2026-10-02T00:00:00.000Z", evidenceClass: "official_record", verificationState: "authority_verified", lineageRefs: [], admissionState: "TRACEABLE" },
        { evidenceCandidateId: "news-a", researchRunId: "r2", originalSourceRef: "source:news-a", fetchedAt: "2026-10-02T00:00:00.000Z", evidenceClass: "reference", verificationState: "unverified", lineageRefs: [], admissionState: "TRACEABLE" },
        { evidenceCandidateId: "summary", researchRunId: "r3", originalSourceRef: "source:summary", fetchedAt: "2026-10-02T00:00:00.000Z", evidenceClass: "derived", verificationState: "unverified", lineageRefs: ["news-a"], admissionState: "TRACEABLE" },
      ],
      edges: [
        { fromEvidenceOrSourceId: "news-a", toEvidenceOrSourceId: "government", relation: "REPUBLISHES" },
        { fromEvidenceOrSourceId: "summary", toEvidenceOrSourceId: "news-a", relation: "SUMMARIZES" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.independentRootCount).toBe(1);
      expect(result.roots).toEqual(["source:gov"]);
      expect(result.reasons).toContain("DEPENDENT_REPUBLICATION_OR_DERIVATION_COLLAPSED");
    }
  });

  it("counts distinct unlinked source identities as independent and rejects cycles", () => {
    const evidence = [
      { evidenceCandidateId: "e1", researchRunId: "r1", originalSourceRef: "agency:a", fetchedAt: "2026-10-02T00:00:00.000Z", evidenceClass: "observation", verificationState: "unverified", lineageRefs: [], admissionState: "TRACEABLE" },
      { evidenceCandidateId: "e2", researchRunId: "r2", originalSourceRef: "agency:b", fetchedAt: "2026-10-02T00:00:00.000Z", evidenceClass: "observation", verificationState: "unverified", lineageRefs: [], admissionState: "TRACEABLE" },
    ];
    const independent = analyzeCorroboration({ evidence, edges: [] });
    expect(independent.ok && independent.independentRootCount).toBe(2);
    expect(analyzeCorroboration({ evidence, edges: [
      { fromEvidenceOrSourceId: "e1", toEvidenceOrSourceId: "e2", relation: "CITES" },
      { fromEvidenceOrSourceId: "e2", toEvidenceOrSourceId: "e1", relation: "CITES" },
    ] })).toMatchObject({ ok: false, code: "RESEARCH_DEPENDENCY_CYCLE" });
  });

  it("keeps a knowledge synthesis a derived claim even if its admission state is cataloged", () => {
    const result = validateDerivedKnowledgeClaim({
      knowledgeClaimId: "claim-1", researchRunId: "run-1", statement: "Flooding is likely",
      parentEvidenceRefs: ["e1"], methodRef: "method-v1", createdAt: "2026-10-02T00:00:00.000Z",
      limitations: ["No field confirmation"], admissionState: "CATALOGED", evidenceClass: "observation",
    });
    expect(result.ok).toBe(false);
  });

  it("treats unknown dependency as dependent and returns immutable parsed candidates", () => {
    const candidate = source("candidate-a", "https://example.org", "run-a");
    const parsed = validateSourceCandidate(candidate);
    expect(parsed.ok && Object.isFrozen(parsed.value.discoveredByResearchRunIds)).toBe(true);
    const evidence = [
      { evidenceCandidateId: "e1", researchRunId: "r1", originalSourceRef: "agency:a", fetchedAt: "2026-10-02T00:00:00.000Z", evidenceClass: "observation", verificationState: "unverified", lineageRefs: [], admissionState: "TRACEABLE" },
      { evidenceCandidateId: "e2", researchRunId: "r2", originalSourceRef: "agency:b", fetchedAt: "2026-10-02T00:00:00.000Z", evidenceClass: "observation", verificationState: "unverified", lineageRefs: [], admissionState: "TRACEABLE" },
    ];
    expect(analyzeCorroboration({ evidence, edges: [{ fromEvidenceOrSourceId: "e2", toEvidenceOrSourceId: "e1", relation: "UNKNOWN" }] })).toMatchObject({
      ok: true, independentRootCount: 1, reasons: expect.arrayContaining(["UNKNOWN_DEPENDENCY_TREATED_AS_NOT_INDEPENDENT"]),
    });
  });

  it("validates immutable artifact references and keeps pending or failed scans unusable", () => {
    const artifact = {
      artifactId: "artifact-1", researchRunId: "run-1", mediaType: "application/pdf", storageRef: "r2:tenant/file-1",
      contentHash: `sha256:${"a".repeat(64)}`, capturedAt: "2026-10-02T00:00:00.000Z", sourceRefs: ["source-1"],
      agentGenerated: false, securityScanState: "pending",
    };
    const parsed = validateResearchArtifact(artifact);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && isResearchArtifactScanPassed(parsed.value)).toBe(false);
    expect(parsed.ok && Object.isFrozen(parsed.value.sourceRefs)).toBe(true);
    expect(validateResearchArtifact({ ...artifact, contentHash: "not-a-hash", securityScanState: "passed" }).ok).toBe(false);
    expect(isResearchArtifactScanPassed({ ...artifact, securityScanState: "passed" })).toBe(true);
    expect(isResearchArtifactScanPassed({ ...artifact, contentHash: "invalid", securityScanState: "passed" })).toBe(false);
    const failed = validateResearchArtifact({ ...artifact, securityScanState: "failed" });
    expect(failed.ok && isResearchArtifactScanPassed(failed.value)).toBe(false);
    expect(validateResearchArtifact({ ...artifact, cookie: "secret" }).ok).toBe(false);
  });

  it("validates reference-only watch notices with tenant scope and bounded idempotent references", () => {
    const notice = {
      contractVersion: "spec266-research-watch-v1", changeId: "change-1", idempotencyKey: "idem-1", watchRef: "watch-1", watchRevision: 2,
      consumerKind: "DECISION_ANALYSIS", consumerRef: "project-1", authorizationScope: "TENANT", tenantId: "tenant-1",
      researchRunRef: "run-1", changedRequirementRefs: ["req-1"], admittedEvidenceRefs: ["evidence-1"], candidateRefs: ["candidate-1"],
      changedAt: "2026-10-02T00:00:00.000Z",
    };
    const parsed = validateResearchWatchChangeNotice(notice);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && Object.isFrozen(parsed.value.admittedEvidenceRefs)).toBe(true);
    expect(validateResearchWatchChangeNotice({ ...notice, tenantId: undefined })).toMatchObject({ ok: false });
    expect(validateResearchWatchChangeNotice({ ...notice, rawPayload: "private" })).toMatchObject({ ok: false, code: "RESEARCH_UNKNOWN_FIELD" });
    expect(validateResearchWatchChangeNotice({ ...notice, idempotencyKey: "bad key" })).toMatchObject({ ok: false });
  });
});
