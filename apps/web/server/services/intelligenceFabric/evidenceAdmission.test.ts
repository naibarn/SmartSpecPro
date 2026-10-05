import { describe, expect, it } from "vitest";
import {
  appendEvidence,
  type EvidenceCaptureReceiptResolver,
  type EvidenceAdmissionStore,
  type EvidenceRightsResolver,
} from "./evidenceAdmission";
import type { PersistedRegistryDataset, PersistedRegistryEvidence, PersistedRegistrySource } from "./registryPersistence";

const now = new Date("2026-10-05T01:00:00.000Z");
const source: PersistedRegistrySource = {
  id: "source-a", tenantId: "tenant-a", visibility: "tenant", canonicalSourceId: "flood-feed", providerId: "provider-a",
  independenceGroup: "provider-a", status: "active", sourceJson: { rightsPolicyRef: "rights-a" }, createdAt: now, updatedAt: now,
};
const dataset: PersistedRegistryDataset = {
  id: "dataset-a", sourceId: source.id, tenantId: "tenant-a", datasetRef: "flood-events", version: "v1", status: "active",
  datasetJson: {}, createdAt: now, updatedAt: now,
};
const evidence = {
  contractVersion: "spec266-evidence-v1",
  id: "evidence-a",
  authorizationScope: "TENANT",
  tenantId: "tenant-a",
  sourceId: source.id,
  datasetId: dataset.id,
  evidenceClass: "derived",
  temporal: { observedAt: "2026-10-05T00:00:00.000Z" },
  verificationState: "correlated",
  rightsPolicyRef: "rights-a",
  methodologyRef: "method-a",
  capturePolicyRef: "capture-policy-a",
  lineageRefs: ["parent-a"],
} as const;

function parentRow(overrides: Partial<PersistedRegistryEvidence> = {}): PersistedRegistryEvidence {
  return {
    id: "row-parent", tenantId: "tenant-a", visibility: "tenant", sourceId: "source-a", datasetId: "dataset-a", evidenceRef: "parent-a", revision: 1,
    contentHash: "a".repeat(64), observedAt: now,
    evidenceJson: { contract: { ...evidence, id: "parent-a", evidenceClass: "observation", methodologyRef: undefined, lineageRefs: [] } }, createdAt: now,
    ...overrides,
  };
}

function harness(options: {
  readonly source?: PersistedRegistrySource | undefined;
  readonly dataset?: PersistedRegistryDataset | undefined;
  readonly rights?: Partial<Awaited<ReturnType<EvidenceRightsResolver["resolve"]>>>;
  readonly seed?: readonly PersistedRegistryEvidence[];
  readonly collision?: boolean;
} = {}) {
  const rows = [...(options.seed ?? [parentRow()])];
  let appendQueue = Promise.resolve();
  const store: EvidenceAdmissionStore = {
    findSource: async () => options.source === undefined ? source : options.source,
    findDataset: async () => options.dataset === undefined ? dataset : options.dataset,
    serializeEvidenceAppend: async (_input, operation) => {
      const previous = appendQueue;
      let release!: () => void;
      appendQueue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        return await operation({
          loadEvidenceClosure: async () => rows,
          appendIfAbsent: async values => {
            if (options.collision || rows.some(row => row.evidenceRef === values.evidenceRef && row.revision === values.revision)) return undefined;
            const row: PersistedRegistryEvidence = { ...values, id: `row-${values.revision}`, createdAt: now };
            rows.push(row);
            return row;
          },
        });
      } finally {
        release();
      }
    },
  };
  const rights: EvidenceRightsResolver = {
    resolve: async input => ({
      status: "granted", tenantId: input.tenantId, sourceId: input.source.id, datasetId: input.dataset.id,
      purpose: input.purpose, rightsPolicyRef: "rights-a", policyRevision: "rights-revision-a", termsRef: "terms-a",
      issuedAt: "2026-10-04T00:00:00.000Z", reviewerRef: "reviewer-a", expiresAt: "2026-10-06T00:00:00.000Z", ...options.rights,
    }),
  };
  const capture: EvidenceCaptureReceiptResolver = {
    resolve: async input => ({ tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull", provenanceRef: "provenance-a", reproducibilityRef: "repro-a" }),
  };
  return { rows, store, rights, capture };
}

function request(state: ReturnType<typeof harness>, overrides: Partial<Parameters<typeof appendEvidence>[0]> = {}) {
  return appendEvidence({
    scope: { tenantId: "tenant-a" }, purpose: "emergency-response",
    evidence, contentIdentity: { upstreamRevision: "2026-10-05T00:00:00Z", value: 42 }, store: state.store, rights: state.rights, capture: state.capture, now,
    ...overrides,
  });
}

describe("Spec 266 evidence admission", () => {
  it("uses active tenant authority and a server-owned rights verdict to append only a bounded receipt", async () => {
    const state = harness();
    const result = await request(state);

    expect(result).toMatchObject({ created: true, evidence: { tenantId: "tenant-a", sourceId: "source-a", datasetId: "dataset-a", revision: 1 } });
    expect(result.evidence.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evidence.evidenceJson).toEqual(expect.objectContaining({
      contract: evidence,
      capture: { tenantId: "tenant-a", sourceId: "source-a", datasetId: "dataset-a", captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull", provenanceRef: "provenance-a", reproducibilityRef: "repro-a" },
      rights: expect.objectContaining({ policyRevision: "rights-revision-a", termsRef: "terms-a", reviewerRef: "reviewer-a", expiresAt: "2026-10-06T00:00:00.000Z" }),
    }));
    expect(JSON.stringify(result.evidence.evidenceJson)).not.toContain("upstreamRevision");
  });

  it("rejects tenant drift, unavailable authority, and mismatched dataset binding before appending", async () => {
    const state = harness();
    await expect(request(state, { evidence: { ...evidence, tenantId: "tenant-b" } })).rejects.toMatchObject({ code: "EVIDENCE_TENANT_MISMATCH" });
    await expect(request(harness({ source: { ...source, status: "revoked" } }))).rejects.toMatchObject({ code: "EVIDENCE_SOURCE_UNAVAILABLE" });
    await expect(request(harness({ dataset: { ...dataset, sourceId: "source-b" } }))).rejects.toMatchObject({ code: "EVIDENCE_DATASET_UNAVAILABLE" });
    expect(state.rows).toEqual([parentRow()]);
  });

  it("fails closed for unknown, revoked, expired, or identity-mismatched rights", async () => {
    for (const rights of [
      { status: "unknown" as const }, { status: "revoked" as const }, { status: "expired" as const },
      { rightsPolicyRef: "rights-b" }, { purpose: "different-purpose" },
    ]) {
      const state = harness({ rights });
      await expect(request(state)).rejects.toMatchObject({ code: rights.status === "expired" ? "EVIDENCE_RIGHTS_EXPIRED" : rights.status ? "EVIDENCE_RIGHTS_DENIED" : "EVIDENCE_RIGHTS_UNAVAILABLE" });
      expect(state.rows).toEqual([parentRow()]);
    }
    const timed = harness({ rights: { expiresAt: "2026-10-05T00:59:59.000Z" } });
    await expect(request(timed)).rejects.toMatchObject({ code: "EVIDENCE_RIGHTS_EXPIRED" });
    expect(timed.rows).toEqual([parentRow()]);
    const malformedExpiry = harness({ rights: { expiresAt: "not-an-instant" } });
    await expect(request(malformedExpiry)).rejects.toMatchObject({ code: "EVIDENCE_RIGHTS_UNAVAILABLE" });
    expect(malformedExpiry.rows).toEqual([parentRow()]);
  });

  it("rejects resolver receipts that contain unapproved secret or raw payload fields", async () => {
    const state = harness();
    const capture: EvidenceCaptureReceiptResolver = { resolve: async input => ({ tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull", provenanceRef: "provenance-a", reproducibilityRef: "repro-a", secret: "should-not-persist" } as never) };
    await expect(request(state, { capture })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
    const rights: EvidenceRightsResolver = { resolve: async input => ({ status: "granted", tenantId: input.tenantId, sourceId: input.source.id, datasetId: input.dataset.id, purpose: input.purpose, rightsPolicyRef: "rights-a", policyRevision: "rights-revision-a", termsRef: "terms-a", issuedAt: "2026-10-04T00:00:00.000Z", reviewerRef: "reviewer-a", expiresAt: "2026-10-06T00:00:00.000Z", rawPayload: "should-not-persist" } as never) };
    await expect(request(harness(), { rights })).rejects.toMatchObject({ code: "EVIDENCE_RIGHTS_UNAVAILABLE" });
    expect(state.rows).toEqual([parentRow()]);
  });

  it("rejects non-enumerable and symbol receipt fields from trusted resolvers", async () => {
    const capture: EvidenceCaptureReceiptResolver = { resolve: async input => {
      const receipt = { tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull" as const, provenanceRef: "provenance-a", reproducibilityRef: "repro-a" };
      Object.defineProperty(receipt, "rawPayload", { value: "hidden" });
      Object.defineProperty(receipt, Symbol("secret"), { value: "hidden", enumerable: true });
      return receipt;
    } };
    const state = harness();
    await expect(request(state, { capture })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
    expect(state.rows).toEqual([parentRow()]);
  });

  it("rejects a capture receipt bound to a different tenant, source, or dataset", async () => {
    for (const identity of [{ tenantId: "tenant-b" }, { sourceId: "source-b" }, { datasetId: "dataset-b" }]) {
      const state = harness();
      const capture: EvidenceCaptureReceiptResolver = { resolve: async input => ({ tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull", provenanceRef: "provenance-a", reproducibilityRef: "repro-a", ...identity }) };
      await expect(request(state, { capture })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
      expect(state.rows).toEqual([parentRow()]);
    }
  });

  it("rejects invalid temporal evidence and incomplete derived provenance without changing durable state", async () => {
    const state = harness();
    const lateCapture = { ...state, capture: { resolve: async input => ({ tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-04T23:59:59.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull" as const, provenanceRef: "provenance-a", reproducibilityRef: "repro-a" }) } };
    await expect(request(lateCapture))
      .rejects.toMatchObject({ code: "EVIDENCE_TEMPORAL_INVALID" });
    await expect(request(state, { evidence: { ...evidence, methodologyRef: undefined } })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
    expect(state.rows).toEqual([parentRow()]);
  });

  it("rejects stale or expired evidence at admission and binds capture policy to the trusted receipt", async () => {
    for (const temporal of [
      { observedAt: "2026-10-05T00:00:00.000Z", staleAt: "2026-10-05T00:59:59.000Z" },
      { observedAt: "2026-10-05T00:00:00.000Z", expiresAt: "2026-10-05T00:59:59.000Z" },
    ]) {
      const state = harness();
      await expect(request(state, { evidence: { ...evidence, temporal } })).rejects.toMatchObject({ code: "EVIDENCE_TEMPORAL_INVALID" });
      expect(state.rows).toEqual([parentRow()]);
    }
    await expect(request(harness(), { evidence: { ...evidence, capturePolicyRef: "capture-policy-b" } }))
      .rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
  });

  it("requires every parent in the trusted transitive closure before append", async () => {
    const state = harness({ seed: [] });
    await expect(request(state)).rejects.toMatchObject({ code: "EVIDENCE_LINEAGE_INVALID" });
    expect(state.rows).toEqual([]);
  });

  it("rejects a parent contract whose tenant/source/dataset identity differs from its durable row", async () => {
    for (const binding of [{ tenantId: "tenant-b" }, { sourceId: "source-b" }, { datasetId: "dataset-b" }]) {
      const misbound = parentRow({ evidenceJson: { contract: { ...evidence, id: "parent-a", ...binding, lineageRefs: [] } } });
      const state = harness({ seed: [misbound] });
      await expect(request(state)).rejects.toMatchObject({ code: "EVIDENCE_LINEAGE_INVALID" });
      expect(state.rows).toEqual([misbound]);
    }
  });

  it("rejects a lineage cycle before append", async () => {
    const cyclic = parentRow({ evidenceJson: { contract: { ...evidence, id: "parent-a", lineageRefs: ["evidence-a"] } } });
    const state = harness({ seed: [cyclic] });
    await expect(request(state)).rejects.toMatchObject({ code: "EVIDENCE_LINEAGE_INVALID" });
    expect(state.rows).toEqual([cyclic]);
  });

  it("is idempotent for an exact immutable replay and revisions changed receipts", async () => {
    const state = harness();
    const first = await request(state);
    const replay = await request(state);
    const revised = await request(state, { contentIdentity: { upstreamRevision: "2026-10-05T00:01:00Z", value: 43 } });
    expect(replay).toEqual({ created: false, evidence: first.evidence });
    expect(revised).toMatchObject({ created: true, evidence: { revision: 2 } });
    expect(state.rows).toHaveLength(3);
  });

  it("does not report success when a concurrent immutable write cannot be resolved as an exact replay", async () => {
    const state = harness({ collision: true });
    await expect(request(state)).rejects.toMatchObject({ code: "EVIDENCE_CONCURRENT_WRITE" });
    expect(state.rows).toEqual([parentRow()]);
  });

  it("serializes lineage updates across the source so concurrent revisions cannot form a cycle", async () => {
    const rowA = parentRow({ evidenceRef: "evidence-a", evidenceJson: { contract: { ...evidence, id: "evidence-a", evidenceClass: "observation", methodologyRef: undefined, lineageRefs: [] } } });
    const rowB = parentRow({ id: "row-b", evidenceRef: "evidence-b", evidenceJson: { contract: { ...evidence, id: "evidence-b", evidenceClass: "observation", methodologyRef: undefined, lineageRefs: [] } } });
    const state = harness({ seed: [rowA, rowB] });
    const first = request(state, { evidence: { ...evidence, id: "evidence-a", lineageRefs: ["evidence-b"] } });
    const second = request(state, { evidence: { ...evidence, id: "evidence-b", lineageRefs: ["evidence-a"] } });
    const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    expect(state.rows).toHaveLength(3);
  });

  it("rejects sparse content identity before hashing it", async () => {
    const sparse = new Array(2);
    sparse[0] = "present";
    await expect(request(harness(), { contentIdentity: sparse })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
  });
});
