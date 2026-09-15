import { describe, expect, it } from "vitest";

import { evaluateCloudflareTargetReadiness } from "../verify-cloudflare-target-readiness";

const completeEvidence = {
  evidenceVersion: 1,
  accountIdentity: "target-account-redacted",
  releaseIdentity: "sha256:release",
  bindings: {
    HYPERDRIVE: true,
    JOB_QUEUE: true,
    JOB_WORKFLOW: true,
    JOB_CONTAINERS: true,
    WORKER_APP: true,
    MEDIA_BUCKET: true,
    VECTOR_INDEX: true,
  },
  hyperdrive: { reachable: true, cacheSafe: true, poolCapacityVerified: true },
  deployment: { rollbackVerified: true, restartVerified: true },
  recovery: { providerRecoveryVerified: true, pitrRestoreVerified: true },
  vectorize: {
    sourceOfTruth: "postgresql",
    embeddingModel: "@cf/baai/bge-base-en-v1.5",
    dimensions: 768,
    metric: "cosine",
    workersAiVectorizeCredentialSeparationVerified: true,
    tenantIsolationVerified: true,
    rebuildVerified: true,
    mutationRecoveryVerified: true,
    embeddingParityVerified: true,
    applicationVectorSourceInventoryVerified: true,
    readPathParityVerified: true,
    legacyVectorSourcesMigratedOrExplicitlyApproved: true,
    sourceInventory: [
      { name: "library_chunks", disposition: "migrated_to_vectorize", embeddingParityVerified: true, readPathParityVerified: true, privacyDeletionVerified: true, rebuildCheckpointVerified: true },
      { name: "web_documents", disposition: "migrated_to_vectorize", embeddingParityVerified: true, readPathParityVerified: true, privacyDeletionVerified: true, rebuildCheckpointVerified: true },
      { name: "web_images", disposition: "migrated_to_vectorize", embeddingParityVerified: true, readPathParityVerified: true, privacyDeletionVerified: true, rebuildCheckpointVerified: true },
      { name: "vertical_drama_media", disposition: "migrated_to_vectorize", embeddingParityVerified: true, readPathParityVerified: true, privacyDeletionVerified: true, rebuildCheckpointVerified: true },
      { name: "conversation_message_chunks", disposition: "legacy_explicitly_approved", approvalRef: "ticket:vectorize-conversation-approval" },
      { name: "scoped_memories", disposition: "legacy_explicitly_approved", approvalRef: "ticket:vectorize-scoped-memory-approval" },
      { name: "agency_agent_memories", disposition: "legacy_explicitly_approved", approvalRef: "ticket:vectorize-agency-agent-approval" },
      { name: "agency_memory_chunks", disposition: "legacy_explicitly_approved", approvalRef: "ticket:vectorize-agency-chunks-approval" },
      { name: "episodic_memory_collections", disposition: "legacy_explicitly_approved", approvalRef: "ticket:vectorize-episodic-approval" },
      { name: "social_conversation_archive", disposition: "legacy_explicitly_approved", approvalRef: "ticket:vectorize-social-archive-approval" },
      { name: "generic_vector_documents", disposition: "legacy_explicitly_approved", approvalRef: "ticket:vectorize-generic-store-approval" },
      { name: "multimodal_memory_vectors", disposition: "legacy_explicitly_approved", approvalRef: "ticket:vectorize-multimodal-approval" },
      { name: "kilo_memory_embeddings", disposition: "legacy_explicitly_approved", approvalRef: "ticket:vectorize-kilo-memory-approval" },
    ],
    indexes: ["library-index", "docs-index-prod", "images-index-prod", "drama-media-index-prod"].map((name) => ({
      name,
      dimensions: 768,
      metric: "cosine",
      metadataIndexes: ["tenantId", "type"],
      bindingVerified: true,
      writeQueryDeleteVerified: true,
      reindexCoverageVerified: true,
    })),
  },
  evidenceRefs: ["artifact://target-preflight/2026-09-14"],
};

describe("Cloudflare target readiness evidence", () => {
  it("keeps local mode green without pretending to have target proof", () => {
    expect(evaluateCloudflareTargetReadiness()).toMatchObject({ ok: true, targetAccountProof: false, productionProof: false });
  });

  it("blocks target mode without an evidence bundle", () => {
    expect(evaluateCloudflareTargetReadiness({ mode: "target" })).toMatchObject({ ok: false, targetAccountProof: false });
  });

  it("does not treat an in-memory evidence object as a target evidence bundle", () => {
    expect(evaluateCloudflareTargetReadiness({ mode: "target", evidence: completeEvidence, evidenceFilePresent: false })).toMatchObject({
      ok: false,
      targetAccountProof: false,
    });
  });

  it("accepts only a complete non-secret evidence shape", () => {
    expect(evaluateCloudflareTargetReadiness({ mode: "target", evidence: completeEvidence, evidenceFilePresent: true })).toMatchObject({ ok: true, targetAccountProof: true, productionProof: false });
    expect(evaluateCloudflareTargetReadiness({ mode: "target", evidence: { ...completeEvidence, recovery: { providerRecoveryVerified: false, pitrRestoreVerified: true } } }).blockedGates).toContain("provider_recovery_and_pitr_restore_rehearsal");
    expect(evaluateCloudflareTargetReadiness({ mode: "target", evidence: { ...completeEvidence, credential: "must-not-be-recorded" } }).blockedGates).toContain("evidence_contains_sensitive_field");
    expect(evaluateCloudflareTargetReadiness({ mode: "target", evidence: { ...completeEvidence, evidenceRefs: ["postgres://user:password@db.invalid/control-plane"] } }).blockedGates).toContain("evidence_contains_sensitive_value");
    expect(evaluateCloudflareTargetReadiness({ mode: "target", evidence: { ...completeEvidence, evidenceRefs: ["https://evidence.invalid/report?X-Amz-Signature=redacted"] } }).blockedGates).toContain("evidence_contains_sensitive_value");
    expect(evaluateCloudflareTargetReadiness({ mode: "target", evidence: { ...completeEvidence, unexpectedMarker: true } }).blockedGates).toContain("evidence_unknown_field");
    expect(evaluateCloudflareTargetReadiness({
      mode: "target",
      evidence: {
        ...completeEvidence,
        vectorize: {
          ...completeEvidence.vectorize,
          indexes: completeEvidence.vectorize.indexes.map((index, position) => position === 0 ? { ...index, name: "../unsafe" } : index),
        },
      },
    }).blockedGates).toContain("vectorize_index_schema_and_rebuild_evidence");
    expect(evaluateCloudflareTargetReadiness({
      mode: "target",
      evidence: {
        ...completeEvidence,
        vectorize: {
          ...completeEvidence.vectorize,
          sourceInventory: completeEvidence.vectorize.sourceInventory.map((source, position) => position === 4
            ? { ...source, approvalRef: "approval://placeholder" }
            : source),
        },
      },
      evidenceFilePresent: true,
    }).blockedGates).toContain("vectorize_index_schema_and_rebuild_evidence");
  });
});
