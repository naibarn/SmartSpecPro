import { describe, expect, it, vi } from "vitest";
import {
  createDesignHandoffService,
  type CanonicalArtifact,
  type CanonicalEvidence,
  type DesignHandoffRequest,
} from "../designHandoffService";

const artifact: CanonicalArtifact = {
  artifactId: "artifact-1",
  version: 2,
  digest: `sha256:${"a".repeat(64)}`,
  tenantId: "tenant-1",
  projectId: "project-1",
  status: "approved",
  rightsCleared: true,
  provenance: { source: "native", requestId: "request-1" },
  componentResolutionSnapshotId: "resolution-1",
};
const evidence: CanonicalEvidence = {
  reference: "evidence-1",
  digest: `sha256:${"b".repeat(64)}`,
  tenantId: "tenant-1",
  projectId: "project-1",
  artifactId: artifact.artifactId,
  artifactVersion: artifact.version,
  artifactDigest: artifact.digest,
  status: "active",
  validUntil: "2030-01-01T00:00:00.000Z",
};
const request: DesignHandoffRequest = {
  artifactId: artifact.artifactId,
  artifactVersion: artifact.version,
  artifactDigest: artifact.digest,
  evidenceRef: evidence.reference,
  evidenceDigest: evidence.digest,
  capabilityId: "design-implement",
};
const actor = { userId: "user-1", tenantId: "tenant-1", projectId: "project-1" };

function service(overrides: Partial<Parameters<typeof createDesignHandoffService>[0]> = {}) {
  return createDesignHandoffService({
    readCanonicalArtifact: async () => artifact,
    readCanonicalEvidence: async () => evidence,
    resolveCapability: async () => ({ status: "satisfied", evidenceRef: "capability-evidence-1" }),
    authorizeHandoff: async () => true,
    handoff: async (payload) => ({ status: "accepted", receipt: `${payload.artifact.digest}:${payload.artifact.version}` }),
    now: () => new Date("2029-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

describe("design handoff boundary", () => {
  it("binds canonical artifact, provenance, resolution snapshot and fresh evidence", async () => {
    const handoff = vi.fn(async (payload: { artifact: CanonicalArtifact }) => ({ status: "accepted" as const, receipt: `${payload.artifact.digest}:${payload.artifact.version}` }));
    const result = await service({ handoff }).submit(request, actor);
    expect(result).toEqual({ status: "accepted", receipt: `${artifact.digest}:2` });
    expect(handoff).toHaveBeenCalledWith(expect.objectContaining({
      artifact: expect.objectContaining({ digest: artifact.digest, version: 2, provenance: artifact.provenance, componentResolutionSnapshotId: "resolution-1" }),
    }));
  });

  it("fails closed when required authority ports are missing", async () => {
    const blocked = service({ readCanonicalArtifact: undefined, readCanonicalEvidence: undefined, resolveCapability: undefined, handoff: undefined });
    await expect(blocked.submit(request, actor)).rejects.toMatchObject({ code: "AUTHORITY_UNAVAILABLE" });
  });

  it("rejects forged or stale artifact snapshots before dispatch", async () => {
    const handoff = vi.fn();
    const blocked = service({ handoff });
    await expect(blocked.submit({ ...request, artifactDigest: `sha256:${"c".repeat(64)}` }, actor)).rejects.toMatchObject({ code: "DECISION_CONFLICT" });
    await expect(service({ readCanonicalArtifact: async () => null, handoff }).submit(request, actor)).rejects.toMatchObject({ code: "DECISION_CONFLICT" });
    expect(handoff).not.toHaveBeenCalled();
  });

  it("rejects unbound, revoked, expired evidence and tenant mismatch before dispatch", async () => {
    const handoff = vi.fn();
    await expect(service({ readCanonicalEvidence: async () => ({ ...evidence, artifactDigest: `sha256:${"c".repeat(64)}` }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "DECISION_CONFLICT" });
    await expect(service({ readCanonicalEvidence: async () => ({ ...evidence, status: "revoked" }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "DECISION_CONFLICT" });
    await expect(service({ readCanonicalEvidence: async () => ({ ...evidence, validUntil: "2028-01-01T00:00:00.000Z" }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "EVIDENCE_STALE" });
    await expect(service({ readCanonicalEvidence: async () => ({ ...evidence, validUntil: "not-a-date" }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "EVIDENCE_STALE" });
    await expect(service({ readCanonicalArtifact: async () => ({ ...artifact, tenantId: "tenant-2" }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(service({ readCanonicalEvidence: async () => ({ ...evidence, tenantId: "tenant-2" }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "DECISION_CONFLICT" });
    await expect(service({ readCanonicalEvidence: async () => ({ ...evidence, projectId: "project-2" }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "DECISION_CONFLICT" });
    expect(handoff).not.toHaveBeenCalled();
  });

  it("maps authority exceptions, denies capability and rejects unapproved artifacts", async () => {
    const handoff = vi.fn();
    await expect(service({ resolveCapability: async () => { throw new Error("internal details"); }, handoff }).submit(request, actor)).rejects.toMatchObject({ code: "AUTHORITY_UNAVAILABLE" });
    await expect(service({ resolveCapability: async () => ({ status: "denied" }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "CAPABILITY_DENIED" });
    await expect(service({ resolveCapability: async () => ({ status: "satisfied", evidenceRef: "<unsafe-ref>" }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "AUTHORITY_UNAVAILABLE" });
    await expect(service({ readCanonicalArtifact: async () => ({ ...artifact, status: "draft" }), handoff }).submit(request, actor)).rejects.toMatchObject({ code: "ARTIFACT_NOT_ACCEPTED" });
    expect(handoff).not.toHaveBeenCalled();
  });
});
