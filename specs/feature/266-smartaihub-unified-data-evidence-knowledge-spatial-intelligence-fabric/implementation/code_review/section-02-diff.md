diff --git a/apps/web/server/services/intelligenceFabric/evidenceAdmission.test.ts b/apps/web/server/services/intelligenceFabric/evidenceAdmission.test.ts
new file mode 100644
index 000000000..3828bcf49
--- /dev/null
+++ b/apps/web/server/services/intelligenceFabric/evidenceAdmission.test.ts
@@ -0,0 +1,244 @@
+import { describe, expect, it } from "vitest";
+import {
+  appendEvidence,
+  type EvidenceCaptureReceiptResolver,
+  type EvidenceAdmissionStore,
+  type EvidenceRightsResolver,
+} from "./evidenceAdmission";
+import type { PersistedRegistryDataset, PersistedRegistryEvidence, PersistedRegistrySource } from "./registryPersistence";
+
+const now = new Date("2026-10-05T01:00:00.000Z");
+const source: PersistedRegistrySource = {
+  id: "source-a", tenantId: "tenant-a", visibility: "tenant", canonicalSourceId: "flood-feed", providerId: "provider-a",
+  independenceGroup: "provider-a", status: "active", sourceJson: { rightsPolicyRef: "rights-a" }, createdAt: now, updatedAt: now,
+};
+const dataset: PersistedRegistryDataset = {
+  id: "dataset-a", sourceId: source.id, tenantId: "tenant-a", datasetRef: "flood-events", version: "v1", status: "active",
+  datasetJson: {}, createdAt: now, updatedAt: now,
+};
+const evidence = {
+  contractVersion: "spec266-evidence-v1",
+  id: "evidence-a",
+  authorizationScope: "TENANT",
+  tenantId: "tenant-a",
+  sourceId: source.id,
+  datasetId: dataset.id,
+  evidenceClass: "derived",
+  temporal: { observedAt: "2026-10-05T00:00:00.000Z" },
+  verificationState: "correlated",
+  rightsPolicyRef: "rights-a",
+  methodologyRef: "method-a",
+  capturePolicyRef: "capture-policy-a",
+  lineageRefs: ["parent-a"],
+} as const;
+
+function parentRow(overrides: Partial<PersistedRegistryEvidence> = {}): PersistedRegistryEvidence {
+  return {
+    id: "row-parent", tenantId: "tenant-a", visibility: "tenant", sourceId: "source-a", datasetId: "dataset-a", evidenceRef: "parent-a", revision: 1,
+    contentHash: "a".repeat(64), observedAt: now,
+    evidenceJson: { contract: { ...evidence, id: "parent-a", evidenceClass: "observation", methodologyRef: undefined, lineageRefs: [] } }, createdAt: now,
+    ...overrides,
+  };
+}
+
+function harness(options: {
+  readonly source?: PersistedRegistrySource | undefined;
+  readonly dataset?: PersistedRegistryDataset | undefined;
+  readonly rights?: Partial<Awaited<ReturnType<EvidenceRightsResolver["resolve"]>>>;
+  readonly seed?: readonly PersistedRegistryEvidence[];
+  readonly collision?: boolean;
+} = {}) {
+  const rows = [...(options.seed ?? [parentRow()])];
+  let appendQueue = Promise.resolve();
+  const store: EvidenceAdmissionStore = {
+    findSource: async () => options.source === undefined ? source : options.source,
+    findDataset: async () => options.dataset === undefined ? dataset : options.dataset,
+    serializeEvidenceAppend: async (_input, operation) => {
+      const previous = appendQueue;
+      let release!: () => void;
+      appendQueue = new Promise<void>(resolve => { release = resolve; });
+      await previous;
+      try {
+        return await operation({
+          loadEvidenceClosure: async () => rows,
+          appendIfAbsent: async values => {
+            if (options.collision || rows.some(row => row.evidenceRef === values.evidenceRef && row.revision === values.revision)) return undefined;
+            const row: PersistedRegistryEvidence = { ...values, id: `row-${values.revision}`, createdAt: now };
+            rows.push(row);
+            return row;
+          },
+        });
+      } finally {
+        release();
+      }
+    },
+  };
+  const rights: EvidenceRightsResolver = {
+    resolve: async input => ({
+      status: "granted", tenantId: input.tenantId, sourceId: input.source.id, datasetId: input.dataset.id,
+      purpose: input.purpose, rightsPolicyRef: "rights-a", policyRevision: "rights-revision-a", termsRef: "terms-a",
+      issuedAt: "2026-10-04T00:00:00.000Z", reviewerRef: "reviewer-a", expiresAt: "2026-10-06T00:00:00.000Z", ...options.rights,
+    }),
+  };
+  const capture: EvidenceCaptureReceiptResolver = {
+    resolve: async input => ({ tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull", provenanceRef: "provenance-a", reproducibilityRef: "repro-a" }),
+  };
+  return { rows, store, rights, capture };
+}
+
+function request(state: ReturnType<typeof harness>, overrides: Partial<Parameters<typeof appendEvidence>[0]> = {}) {
+  return appendEvidence({
+    scope: { tenantId: "tenant-a" }, purpose: "emergency-response",
+    evidence, contentIdentity: { upstreamRevision: "2026-10-05T00:00:00Z", value: 42 }, store: state.store, rights: state.rights, capture: state.capture, now,
+    ...overrides,
+  });
+}
+
+describe("Spec 266 evidence admission", () => {
+  it("uses active tenant authority and a server-owned rights verdict to append only a bounded receipt", async () => {
+    const state = harness();
+    const result = await request(state);
+
+    expect(result).toMatchObject({ created: true, evidence: { tenantId: "tenant-a", sourceId: "source-a", datasetId: "dataset-a", revision: 1 } });
+    expect(result.evidence.contentHash).toMatch(/^[a-f0-9]{64}$/);
+    expect(result.evidence.evidenceJson).toEqual(expect.objectContaining({
+      contract: evidence,
+      capture: { tenantId: "tenant-a", sourceId: "source-a", datasetId: "dataset-a", captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull", provenanceRef: "provenance-a", reproducibilityRef: "repro-a" },
+      rights: expect.objectContaining({ policyRevision: "rights-revision-a", termsRef: "terms-a", reviewerRef: "reviewer-a", expiresAt: "2026-10-06T00:00:00.000Z" }),
+    }));
+    expect(JSON.stringify(result.evidence.evidenceJson)).not.toContain("upstreamRevision");
+  });
+
+  it("rejects tenant drift, unavailable authority, and mismatched dataset binding before appending", async () => {
+    const state = harness();
+    await expect(request(state, { evidence: { ...evidence, tenantId: "tenant-b" } })).rejects.toMatchObject({ code: "EVIDENCE_TENANT_MISMATCH" });
+    await expect(request(harness({ source: { ...source, status: "revoked" } }))).rejects.toMatchObject({ code: "EVIDENCE_SOURCE_UNAVAILABLE" });
+    await expect(request(harness({ dataset: { ...dataset, sourceId: "source-b" } }))).rejects.toMatchObject({ code: "EVIDENCE_DATASET_UNAVAILABLE" });
+    expect(state.rows).toEqual([parentRow()]);
+  });
+
+  it("fails closed for unknown, revoked, expired, or identity-mismatched rights", async () => {
+    for (const rights of [
+      { status: "unknown" as const }, { status: "revoked" as const }, { status: "expired" as const },
+      { rightsPolicyRef: "rights-b" }, { purpose: "different-purpose" },
+    ]) {
+      const state = harness({ rights });
+      await expect(request(state)).rejects.toMatchObject({ code: rights.status === "expired" ? "EVIDENCE_RIGHTS_EXPIRED" : rights.status ? "EVIDENCE_RIGHTS_DENIED" : "EVIDENCE_RIGHTS_UNAVAILABLE" });
+      expect(state.rows).toEqual([parentRow()]);
+    }
+    const timed = harness({ rights: { expiresAt: "2026-10-05T00:59:59.000Z" } });
+    await expect(request(timed)).rejects.toMatchObject({ code: "EVIDENCE_RIGHTS_EXPIRED" });
+    expect(timed.rows).toEqual([parentRow()]);
+    const malformedExpiry = harness({ rights: { expiresAt: "not-an-instant" } });
+    await expect(request(malformedExpiry)).rejects.toMatchObject({ code: "EVIDENCE_RIGHTS_UNAVAILABLE" });
+    expect(malformedExpiry.rows).toEqual([parentRow()]);
+  });
+
+  it("rejects resolver receipts that contain unapproved secret or raw payload fields", async () => {
+    const state = harness();
+    const capture: EvidenceCaptureReceiptResolver = { resolve: async input => ({ tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull", provenanceRef: "provenance-a", reproducibilityRef: "repro-a", secret: "should-not-persist" } as never) };
+    await expect(request(state, { capture })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
+    const rights: EvidenceRightsResolver = { resolve: async input => ({ status: "granted", tenantId: input.tenantId, sourceId: input.source.id, datasetId: input.dataset.id, purpose: input.purpose, rightsPolicyRef: "rights-a", policyRevision: "rights-revision-a", termsRef: "terms-a", issuedAt: "2026-10-04T00:00:00.000Z", reviewerRef: "reviewer-a", expiresAt: "2026-10-06T00:00:00.000Z", rawPayload: "should-not-persist" } as never) };
+    await expect(request(harness(), { rights })).rejects.toMatchObject({ code: "EVIDENCE_RIGHTS_UNAVAILABLE" });
+    expect(state.rows).toEqual([parentRow()]);
+  });
+
+  it("rejects non-enumerable and symbol receipt fields from trusted resolvers", async () => {
+    const capture: EvidenceCaptureReceiptResolver = { resolve: async input => {
+      const receipt = { tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull" as const, provenanceRef: "provenance-a", reproducibilityRef: "repro-a" };
+      Object.defineProperty(receipt, "rawPayload", { value: "hidden" });
+      Object.defineProperty(receipt, Symbol("secret"), { value: "hidden", enumerable: true });
+      return receipt;
+    } };
+    const state = harness();
+    await expect(request(state, { capture })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
+    expect(state.rows).toEqual([parentRow()]);
+  });
+
+  it("rejects a capture receipt bound to a different tenant, source, or dataset", async () => {
+    for (const identity of [{ tenantId: "tenant-b" }, { sourceId: "source-b" }, { datasetId: "dataset-b" }]) {
+      const state = harness();
+      const capture: EvidenceCaptureReceiptResolver = { resolve: async input => ({ tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-05T00:30:00.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull", provenanceRef: "provenance-a", reproducibilityRef: "repro-a", ...identity }) };
+      await expect(request(state, { capture })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
+      expect(state.rows).toEqual([parentRow()]);
+    }
+  });
+
+  it("rejects invalid temporal evidence and incomplete derived provenance without changing durable state", async () => {
+    const state = harness();
+    const lateCapture = { ...state, capture: { resolve: async input => ({ tenantId: input.tenantId, sourceId: input.sourceId, datasetId: input.datasetId, captureRef: "capture-a", capturedAt: "2026-10-04T23:59:59.000Z", actorRef: "user-a", capturePolicyRef: "capture-policy-a", acquisitionMode: "pull" as const, provenanceRef: "provenance-a", reproducibilityRef: "repro-a" }) } };
+    await expect(request(lateCapture))
+      .rejects.toMatchObject({ code: "EVIDENCE_TEMPORAL_INVALID" });
+    await expect(request(state, { evidence: { ...evidence, methodologyRef: undefined } })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
+    expect(state.rows).toEqual([parentRow()]);
+  });
+
+  it("rejects stale or expired evidence at admission and binds capture policy to the trusted receipt", async () => {
+    for (const temporal of [
+      { observedAt: "2026-10-05T00:00:00.000Z", staleAt: "2026-10-05T00:59:59.000Z" },
+      { observedAt: "2026-10-05T00:00:00.000Z", expiresAt: "2026-10-05T00:59:59.000Z" },
+    ]) {
+      const state = harness();
+      await expect(request(state, { evidence: { ...evidence, temporal } })).rejects.toMatchObject({ code: "EVIDENCE_TEMPORAL_INVALID" });
+      expect(state.rows).toEqual([parentRow()]);
+    }
+    await expect(request(harness(), { evidence: { ...evidence, capturePolicyRef: "capture-policy-b" } }))
+      .rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
+  });
+
+  it("requires every parent in the trusted transitive closure before append", async () => {
+    const state = harness({ seed: [] });
+    await expect(request(state)).rejects.toMatchObject({ code: "EVIDENCE_LINEAGE_INVALID" });
+    expect(state.rows).toEqual([]);
+  });
+
+  it("rejects a parent contract whose tenant/source/dataset identity differs from its durable row", async () => {
+    for (const binding of [{ tenantId: "tenant-b" }, { sourceId: "source-b" }, { datasetId: "dataset-b" }]) {
+      const misbound = parentRow({ evidenceJson: { contract: { ...evidence, id: "parent-a", ...binding, lineageRefs: [] } } });
+      const state = harness({ seed: [misbound] });
+      await expect(request(state)).rejects.toMatchObject({ code: "EVIDENCE_LINEAGE_INVALID" });
+      expect(state.rows).toEqual([misbound]);
+    }
+  });
+
+  it("rejects a lineage cycle before append", async () => {
+    const cyclic = parentRow({ evidenceJson: { contract: { ...evidence, id: "parent-a", lineageRefs: ["evidence-a"] } } });
+    const state = harness({ seed: [cyclic] });
+    await expect(request(state)).rejects.toMatchObject({ code: "EVIDENCE_LINEAGE_INVALID" });
+    expect(state.rows).toEqual([cyclic]);
+  });
+
+  it("is idempotent for an exact immutable replay and revisions changed receipts", async () => {
+    const state = harness();
+    const first = await request(state);
+    const replay = await request(state);
+    const revised = await request(state, { contentIdentity: { upstreamRevision: "2026-10-05T00:01:00Z", value: 43 } });
+    expect(replay).toEqual({ created: false, evidence: first.evidence });
+    expect(revised).toMatchObject({ created: true, evidence: { revision: 2 } });
+    expect(state.rows).toHaveLength(3);
+  });
+
+  it("does not report success when a concurrent immutable write cannot be resolved as an exact replay", async () => {
+    const state = harness({ collision: true });
+    await expect(request(state)).rejects.toMatchObject({ code: "EVIDENCE_CONCURRENT_WRITE" });
+    expect(state.rows).toEqual([parentRow()]);
+  });
+
+  it("serializes lineage updates across the source so concurrent revisions cannot form a cycle", async () => {
+    const rowA = parentRow({ evidenceRef: "evidence-a", evidenceJson: { contract: { ...evidence, id: "evidence-a", evidenceClass: "observation", methodologyRef: undefined, lineageRefs: [] } } });
+    const rowB = parentRow({ id: "row-b", evidenceRef: "evidence-b", evidenceJson: { contract: { ...evidence, id: "evidence-b", evidenceClass: "observation", methodologyRef: undefined, lineageRefs: [] } } });
+    const state = harness({ seed: [rowA, rowB] });
+    const first = request(state, { evidence: { ...evidence, id: "evidence-a", lineageRefs: ["evidence-b"] } });
+    const second = request(state, { evidence: { ...evidence, id: "evidence-b", lineageRefs: ["evidence-a"] } });
+    const outcomes = await Promise.allSettled([first, second]);
+    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
+    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
+    expect(state.rows).toHaveLength(3);
+  });
+
+  it("rejects sparse content identity before hashing it", async () => {
+    const sparse = new Array(2);
+    sparse[0] = "present";
+    await expect(request(harness(), { contentIdentity: sparse })).rejects.toMatchObject({ code: "EVIDENCE_ADMISSION_INVALID" });
+  });
+});
diff --git a/apps/web/server/services/intelligenceFabric/evidenceAdmission.ts b/apps/web/server/services/intelligenceFabric/evidenceAdmission.ts
new file mode 100644
index 000000000..39bf8f4ac
--- /dev/null
+++ b/apps/web/server/services/intelligenceFabric/evidenceAdmission.ts
@@ -0,0 +1,265 @@
+import { createHash } from "node:crypto";
+import { parseEvidenceItem, validateEvidenceLineageGraph, type EvidenceItem } from "./contracts";
+import type { PersistedRegistryDataset, PersistedRegistryEvidence, PersistedRegistrySource } from "./registryPersistence";
+
+const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
+const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
+const CONTENT_IDENTITY_MAX_BYTES = 131_072;
+
+export type EvidenceAdmissionErrorCode =
+  | "EVIDENCE_ADMISSION_INVALID"
+  | "EVIDENCE_TENANT_MISMATCH"
+  | "EVIDENCE_SOURCE_UNAVAILABLE"
+  | "EVIDENCE_DATASET_UNAVAILABLE"
+  | "EVIDENCE_RIGHTS_UNAVAILABLE"
+  | "EVIDENCE_RIGHTS_DENIED"
+  | "EVIDENCE_RIGHTS_EXPIRED"
+  | "EVIDENCE_TEMPORAL_INVALID"
+  | "EVIDENCE_LINEAGE_INVALID"
+  | "EVIDENCE_CONCURRENT_WRITE";
+
+export class EvidenceAdmissionError extends Error {
+  constructor(readonly code: EvidenceAdmissionErrorCode) {
+    super(code);
+    this.name = "EvidenceAdmissionError";
+  }
+}
+
+export interface EvidenceAdmissionScope {
+  readonly tenantId: string;
+}
+
+/** This port is server-owned: it resolves current rights, never a caller assertion. */
+export interface EvidenceRightsResolver {
+  resolve(input: {
+    readonly tenantId: string;
+    readonly source: PersistedRegistrySource;
+    readonly dataset: PersistedRegistryDataset;
+    readonly purpose: string;
+  }): Promise<EvidenceRightsReceipt>;
+}
+
+/** Immutable receipt from the authoritative rights-policy store. */
+export interface EvidenceRightsReceipt {
+  readonly status: "granted" | "unknown" | "revoked" | "expired";
+  readonly tenantId: string;
+  readonly sourceId: string;
+  readonly datasetId: string;
+  readonly purpose: string;
+  readonly rightsPolicyRef: string;
+  readonly policyRevision: string;
+  readonly termsRef: string;
+  readonly issuedAt: string;
+  readonly reviewerRef: string;
+  readonly expiresAt: string;
+}
+
+/**
+ * The durable writer is deliberately injected. The current registry schema has no
+ * authoritative rights-policy receipt or activation writer, so runtime composition
+ * must provide those before this admission seam is exposed to callers.
+ */
+export interface EvidenceAdmissionStore {
+  findSource(input: { readonly tenantId: string; readonly sourceId: string }): Promise<PersistedRegistrySource | undefined>;
+  findDataset(input: { readonly tenantId: string; readonly datasetId: string }): Promise<PersistedRegistryDataset | undefined>;
+  /** Serializes the entire lineage validation and immutable append for one source. */
+  serializeEvidenceAppend<T>(input: { readonly tenantId: string; readonly sourceId: string }, operation: (transaction: EvidenceAppendTransaction) => Promise<T>): Promise<T>;
+}
+
+export interface EvidenceAppendTransaction {
+  /** Returns the authorized transitive closure and all revisions for requested references. */
+  loadEvidenceClosure(input: { readonly tenantId: string; readonly sourceId: string; readonly evidenceRefs: readonly string[] }): Promise<readonly PersistedRegistryEvidence[]>;
+  /** Atomically inserts this immutable revision, or returns undefined on a uniqueness collision. */
+  appendIfAbsent(input: Omit<PersistedRegistryEvidence, "id" | "createdAt">): Promise<PersistedRegistryEvidence | undefined>;
+}
+
+export interface EvidenceCaptureReceipt {
+  readonly tenantId: string;
+  readonly sourceId: string;
+  readonly datasetId: string;
+  readonly captureRef: string;
+  readonly capturedAt: string;
+  /** A server-authenticated actor reference. This module never accepts a user display name. */
+  readonly actorRef: string;
+  readonly capturePolicyRef: string;
+  readonly acquisitionMode: "pull" | "push" | "manual" | "derived";
+  readonly provenanceRef: string;
+  readonly reproducibilityRef: string;
+}
+
+/** Creates capture receipts from server authentication/capture state, never request JSON. */
+export interface EvidenceCaptureReceiptResolver {
+  resolve(input: {
+    readonly tenantId: string;
+    readonly sourceId: string;
+    readonly datasetId: string;
+  }): Promise<EvidenceCaptureReceipt>;
+}
+
+function fail(code: EvidenceAdmissionErrorCode): never {
+  throw new EvidenceAdmissionError(code);
+}
+
+function isId(value: unknown): value is string {
+  return typeof value === "string" && ID_PATTERN.test(value);
+}
+
+function isInstant(value: unknown): value is string {
+  return typeof value === "string" && ISO_INSTANT.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
+}
+
+function isPlainRecord(value: unknown): value is Record<string, unknown> {
+  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
+}
+
+function canonicalJson(value: unknown, depth = 0): string {
+  if (depth > 8) fail("EVIDENCE_ADMISSION_INVALID");
+  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
+    if (typeof value === "number" && !Number.isFinite(value)) fail("EVIDENCE_ADMISSION_INVALID");
+    return JSON.stringify(value);
+  }
+  if (Array.isArray(value)) {
+    if (value.length > 256) fail("EVIDENCE_ADMISSION_INVALID");
+    for (let index = 0; index < value.length; index += 1) {
+      if (!Object.prototype.hasOwnProperty.call(value, index)) fail("EVIDENCE_ADMISSION_INVALID");
+    }
+    return `[${value.map(item => canonicalJson(item, depth + 1)).join(",")}]`;
+  }
+  if (!isPlainRecord(value) || Object.keys(value).length > 128) fail("EVIDENCE_ADMISSION_INVALID");
+  return `{${Object.keys(value).sort().map(key => {
+    if (key.length > 80) fail("EVIDENCE_ADMISSION_INVALID");
+    return `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`;
+  }).join(",")}}`;
+}
+
+function evidenceFromRow(row: PersistedRegistryEvidence): EvidenceItem {
+  if (!isPlainRecord(row.evidenceJson) || !Object.prototype.hasOwnProperty.call(row.evidenceJson, "contract")) fail("EVIDENCE_LINEAGE_INVALID");
+  const parsed = parseEvidenceItem(row.evidenceJson.contract);
+  if (!parsed.ok) fail("EVIDENCE_LINEAGE_INVALID");
+  return parsed.value;
+}
+
+function sameAdmission(row: PersistedRegistryEvidence, input: Omit<PersistedRegistryEvidence, "id" | "createdAt" | "revision">): boolean {
+  return row.tenantId === input.tenantId && row.visibility === input.visibility && row.sourceId === input.sourceId &&
+    row.datasetId === input.datasetId && row.evidenceRef === input.evidenceRef && row.contentHash === input.contentHash &&
+    row.observedAt?.toISOString() === input.observedAt?.toISOString() && canonicalJson(row.evidenceJson) === canonicalJson(input.evidenceJson);
+}
+
+function assertCapture(receipt: EvidenceCaptureReceipt): void {
+  const fields = new Set(["tenantId", "sourceId", "datasetId", "captureRef", "capturedAt", "actorRef", "capturePolicyRef", "acquisitionMode", "provenanceRef", "reproducibilityRef"]);
+  if (!isPlainRecord(receipt) || Reflect.ownKeys(receipt).some(key => typeof key !== "string" || !fields.has(key)) || !isId(receipt.tenantId) || !isId(receipt.sourceId) || !isId(receipt.datasetId) || !isId(receipt.captureRef) || !isId(receipt.actorRef) || !isId(receipt.capturePolicyRef) || !isId(receipt.provenanceRef) || !isId(receipt.reproducibilityRef) ||
+    !["pull", "push", "manual", "derived"].includes(receipt.acquisitionMode) || !isInstant(receipt.capturedAt)) fail("EVIDENCE_ADMISSION_INVALID");
+}
+
+function assertRightsReceipt(receipt: EvidenceRightsReceipt): void {
+  const fields = new Set(["status", "tenantId", "sourceId", "datasetId", "purpose", "rightsPolicyRef", "policyRevision", "termsRef", "issuedAt", "reviewerRef", "expiresAt"]);
+  if (!isPlainRecord(receipt) || Reflect.ownKeys(receipt).some(key => typeof key !== "string" || !fields.has(key)) || !["granted", "unknown", "revoked", "expired"].includes(receipt.status) ||
+    !isId(receipt.tenantId) || !isId(receipt.sourceId) || !isId(receipt.datasetId) || !isId(receipt.purpose) || !isId(receipt.rightsPolicyRef) || !isId(receipt.policyRevision) || !isId(receipt.termsRef) || !isId(receipt.reviewerRef) || !isInstant(receipt.issuedAt) || !isInstant(receipt.expiresAt) ||
+    Date.parse(receipt.issuedAt) > Date.parse(receipt.expiresAt)) fail("EVIDENCE_RIGHTS_UNAVAILABLE");
+}
+
+function assertTemporalAdmission(evidence: EvidenceItem, receipt: EvidenceCaptureReceipt, now: Date): void {
+  const observedAt = evidence.temporal.observedAt;
+  if (!observedAt || Date.parse(observedAt) > Date.parse(receipt.capturedAt)) fail("EVIDENCE_TEMPORAL_INVALID");
+  for (const field of ["staleAt", "expiresAt"] as const) {
+    const value = evidence.temporal[field];
+    if (value === undefined) continue;
+    if (Date.parse(value) < Date.parse(observedAt) || Date.parse(value) <= now.getTime()) fail("EVIDENCE_TEMPORAL_INVALID");
+  }
+}
+
+export async function appendEvidence(input: {
+  readonly scope: EvidenceAdmissionScope;
+  readonly purpose: string;
+  readonly evidence: unknown;
+  /** The identity is hashed and never persisted as payload. */
+  readonly contentIdentity: unknown;
+  readonly store: EvidenceAdmissionStore;
+  readonly rights: EvidenceRightsResolver;
+  readonly capture: EvidenceCaptureReceiptResolver;
+  readonly now?: Date;
+}): Promise<{ readonly created: boolean; readonly evidence: PersistedRegistryEvidence }> {
+  if (!isId(input.scope?.tenantId) || !isId(input.purpose)) fail("EVIDENCE_ADMISSION_INVALID");
+  const parsed = parseEvidenceItem(input.evidence);
+  if (!parsed.ok) fail("EVIDENCE_ADMISSION_INVALID");
+  const evidence = parsed.value;
+  if (evidence.authorizationScope !== "TENANT" || evidence.tenantId !== input.scope.tenantId || !evidence.sourceId || !evidence.datasetId) fail("EVIDENCE_TENANT_MISMATCH");
+
+  const source = await input.store.findSource({ tenantId: input.scope.tenantId, sourceId: evidence.sourceId });
+  if (!source || source.tenantId !== input.scope.tenantId || source.visibility !== "tenant" || source.status !== "active") fail("EVIDENCE_SOURCE_UNAVAILABLE");
+  const dataset = await input.store.findDataset({ tenantId: input.scope.tenantId, datasetId: evidence.datasetId });
+  if (!dataset || dataset.tenantId !== input.scope.tenantId || dataset.sourceId !== source.id || dataset.status !== "active") fail("EVIDENCE_DATASET_UNAVAILABLE");
+  const receipt = await input.capture.resolve({ tenantId: input.scope.tenantId, sourceId: source.id, datasetId: dataset.id });
+  assertCapture(receipt);
+  if (receipt.tenantId !== input.scope.tenantId || receipt.sourceId !== source.id || receipt.datasetId !== dataset.id) fail("EVIDENCE_ADMISSION_INVALID");
+  if (evidence.capturePolicyRef !== receipt.capturePolicyRef) fail("EVIDENCE_ADMISSION_INVALID");
+  assertTemporalAdmission(evidence, receipt, input.now ?? new Date());
+
+  const verdict = await input.rights.resolve({ tenantId: input.scope.tenantId, source, dataset, purpose: input.purpose });
+  assertRightsReceipt(verdict);
+  if (Date.parse(verdict.issuedAt) > (input.now ?? new Date()).getTime()) fail("EVIDENCE_RIGHTS_UNAVAILABLE");
+  if (verdict.status === "expired" || Date.parse(verdict.expiresAt) <= (input.now ?? new Date()).getTime()) fail("EVIDENCE_RIGHTS_EXPIRED");
+  if (verdict.status !== "granted") fail("EVIDENCE_RIGHTS_DENIED");
+  if (verdict.tenantId !== input.scope.tenantId || verdict.sourceId !== source.id || verdict.datasetId !== dataset.id || verdict.purpose !== input.purpose ||
+    verdict.rightsPolicyRef !== evidence.rightsPolicyRef) fail("EVIDENCE_RIGHTS_UNAVAILABLE");
+
+  const contentJson = canonicalJson(input.contentIdentity);
+  if (Buffer.byteLength(contentJson, "utf8") > CONTENT_IDENTITY_MAX_BYTES) fail("EVIDENCE_ADMISSION_INVALID");
+  const contentHash = createHash("sha256").update(contentJson).digest("hex");
+  return input.store.serializeEvidenceAppend({ tenantId: input.scope.tenantId, sourceId: source.id }, async transaction => {
+    const existing = (await transaction.loadEvidenceClosure({ tenantId: input.scope.tenantId, sourceId: source.id, evidenceRefs: [...evidence.lineageRefs, evidence.id] }))
+      .filter(row => row.tenantId === input.scope.tenantId && row.visibility === "tenant" && row.sourceId === source.id);
+    const candidates = existing.filter(row => row.evidenceRef === evidence.id);
+    const latestByRef = new Map<string, PersistedRegistryEvidence>();
+    for (const row of existing) {
+      const current = latestByRef.get(row.evidenceRef);
+      if (!current || row.revision > current.revision) latestByRef.set(row.evidenceRef, row);
+    }
+    const closureIds = new Set(latestByRef.keys());
+    const toResolve = [...evidence.lineageRefs];
+    const resolved = new Set<string>();
+    for (let index = 0; index < toResolve.length; index += 1) {
+      const parentRef = toResolve[index]!;
+      if (resolved.has(parentRef)) continue;
+      resolved.add(parentRef);
+      const parent = latestByRef.get(parentRef);
+      if (!parent) fail("EVIDENCE_LINEAGE_INVALID");
+      const parentContract = evidenceFromRow(parent);
+      if (parentContract.authorizationScope !== "TENANT" || parentContract.id !== parent.evidenceRef ||
+        parentContract.tenantId !== parent.tenantId || parentContract.sourceId !== parent.sourceId || parentContract.datasetId !== parent.datasetId) {
+        fail("EVIDENCE_LINEAGE_INVALID");
+      }
+      for (const ref of parentContract.lineageRefs) {
+        if (!closureIds.has(ref)) fail("EVIDENCE_LINEAGE_INVALID");
+        toResolve.push(ref);
+      }
+    }
+    latestByRef.set(evidence.id, {
+      id: "unpersisted", tenantId: input.scope.tenantId, visibility: "tenant", sourceId: source.id, datasetId: dataset.id,
+      evidenceRef: evidence.id, revision: 0, contentHash, observedAt: new Date(evidence.temporal.observedAt), evidenceJson: { contract: evidence }, createdAt: input.now ?? new Date(),
+    });
+    const graph = validateEvidenceLineageGraph([...latestByRef.values()].map(evidenceFromRow));
+    if (!graph.ok) fail("EVIDENCE_LINEAGE_INVALID");
+    const nextRevision = Math.max(0, ...candidates.map(row => row.revision)) + 1;
+    const values = {
+      tenantId: input.scope.tenantId,
+      visibility: "tenant",
+      sourceId: source.id,
+      datasetId: dataset.id,
+      evidenceRef: evidence.id,
+      revision: nextRevision,
+      contentHash,
+      observedAt: new Date(evidence.temporal.observedAt),
+      evidenceJson: Object.freeze({ contract: evidence, capture: Object.freeze({ ...receipt }), rights: Object.freeze({ ...verdict }) }),
+    } as const;
+    const replay = candidates.find(row => sameAdmission(row, values));
+    if (replay) return { created: false, evidence: replay };
+    const inserted = await transaction.appendIfAbsent(values);
+    if (inserted) return { created: true, evidence: inserted };
+    const afterCollision = (await transaction.loadEvidenceClosure({ tenantId: input.scope.tenantId, sourceId: source.id, evidenceRefs: [evidence.id] }))
+      .filter(row => row.tenantId === input.scope.tenantId && row.visibility === "tenant" && row.sourceId === source.id);
+    const resolvedReplay = afterCollision.find(row => row.evidenceRef === evidence.id && sameAdmission(row, values));
+    if (resolvedReplay) return { created: false, evidence: resolvedReplay };
+    fail("EVIDENCE_CONCURRENT_WRITE");
+  });
+}
diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-02-registry-rights-provenance.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-02-registry-rights-provenance.md
index 526ab8758..ad86cd1a6 100644
--- a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-02-registry-rights-provenance.md
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-02-registry-rights-provenance.md
@@ -10,21 +10,60 @@ Spec 266 §§5–9, 12–15, 33, 46.1–46.3, 46.8, 46.11.

 ## Implementation

-- Add only additive shared Fabric entities/services; source activation requires approved rights, attribution, purpose, geography and retention.
-- Keep secrets outside source records, logs, research prompts and artifact references.
-- Make evidence provenance append-only and keep observed, derived, forecast, model-estimated and user-asserted classes distinct.
-- Parse evidence into a detached, immutable snapshot; temporal and lineage structures cannot remain caller-owned mutable references after validation. Reject inverted effective-time bounds.
-- Derived, forecast and model-estimated evidence must include parent lineage, an applicable rights-policy reference, and a versioned methodology reference before admission.
-- Evaluate short-lived, server-resolved connectivity/schema/semantic/freshness/rights/placement/index health independently for an offer; quarantine only the offer bound to that source and dataset. Index health gates discovery only; it does not block deterministic queries. Durable health history and admin remediation remain persistence work.
-- Reject malformed or ambiguous in-memory registry snapshots before resolution: bounded dense catalog lists, unique record IDs, per-entity field allow-lists (including secret-field rejection), recognized provider/source/dataset enums and dense bounded semantic capabilities. Invalid rights receipts fail closed; expired rights, geography/residency restrictions, cache TTL and retention/attribution controls travel with a successful resolution.
-- An active source requires explicit geography/temporal coverage, refresh, execution-placement and commercial pricing references, plus reviewed rights, purpose and retention policy and attribution text when required. The pure resolver returns references; authoritative policy loading and coverage execution remain persistence/composition work.
-- Geography, purpose, audience and residency restriction lists are positive allow-lists of canonical IDs. A populated list requires an exact request match; an omitted list adds no restriction for that dimension.
+- Preserve `registry.ts` and `sourceHealth.ts` as bounded, fail-closed evaluators. Load rights and health receipts from server-owned persistence, not caller snapshots.
+- Complete review/activation/revocation/rights-policy persistence in `registryPersistence.ts` where existing schema supports it. Do not edit schema or migrations while `orchestra/.wave-active` exists.
+- Define append-only evidence admission that resolves source/dataset/tenant/rights from trusted state; enforces class-specific lineage/methodology and temporal bounds; binds capture/content identity, actor/time, and immutable revision; and rejects replay/cycle conflicts without partial writes.
+- Read APIs return bounded references and metadata only after fresh authorization. Secrets and restricted payloads never enter logs or prompts.
+- Activation requires reviewed rights, purpose, attribution/retention, geography, temporal coverage, refresh, placement, and pricing references. Positive allow-lists require exact request matches.
+- Health is source+dataset+offer scoped. Connectivity/schema/semantic/freshness/rights/placement/index failures stay separate; index health gates discovery only. Quarantine only the affected offer.

 ## Tests

-- Rights unknown/expired, revoked sources, cross-tenant access and provenance mutation fail closed.
-- Health dimensions remain independent; source drift quarantines only the affected offer.
+- Extend registry, persistence, evidence, and health tests for unknown/expired/revoked rights, tenant mismatch, invalid time, missing derived lineage/methodology, mutation, offer-specific drift, and unchanged canonical state after rejection.
+- If the active schema marker blocks durable persistence proof, keep it explicitly blocked and cover the pure policy boundary only.

 ## Acceptance

 Spec 266 §§46.1–46.3 and security items 43–47.
+## UI/UX Contract
+
+### Target User / JTBD
+- N/A: this section implements backend contracts/policies only; browser UI ownership is Section 07.
+
+### Existing Pattern Reference
+- N/A: no user-facing surface is added by this section.
+
+### Surface Inventory
+- N/A: no route/page/dialog/form/table is added.
+
+### Component Map
+- N/A: no client component is added.
+
+### State Matrix
+- N/A: no browser state is added.
+
+### Responsive Matrix
+- N/A: no browser layout is added.
+
+### Accessibility Acceptance
+- N/A: no user-facing control is added.
+
+### Copy Contract
+- N/A: no user-facing copy is added.
+
+### Browser Evidence Required
+- N/A: no browser-visible changes are planned in this section.
+
+## Implementation Evidence — 2026-10-05
+
+- Added a fail-closed, uncomposed evidence-admission seam in `apps/web/server/services/intelligenceFabric/evidenceAdmission.ts`. It requires an authoritative active source/dataset store, serialized validate-plus-append transaction, rights receipt resolver, and server-composed capture receipt resolver; no router or default persistence composition was added.
+- Admission requires the full authorized parent closure, rejects dangling parents and cycles before append, and treats immutable concurrent conflicts as failure unless an exact replay is observable inside the same serialized transaction.
+- Immutable evidence JSON snapshots the parsed contract, bounded capture policy/mode/provenance/reproducibility receipt, and authoritative rights policy revision/terms/purpose/issued/reviewer/expiry receipt. Raw content identity is SHA-256 hashed and never persisted.
+- `staleAt` and `expiresAt` must be after `observedAt` and after admission time; stale or expired evidence is rejected. Schema/migrations remain untouched because `orchestra/.wave-active` is present.
+- Scoped verification: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/evidenceAdmission.test.ts server/services/intelligenceFabric/contracts.test.ts server/services/intelligenceFabric/registryPersistence.test.ts` — 3 files, 30 tests passed; `git diff --check` passed.
+
+## Implementation evidence (2026-10-05)
+
+- Added a schema-free, dependency-injected append admission boundary. It resolves active source/dataset and current rights through server-owned ports, binds a server-composed capture receipt, validates tenant/time/lineage, hashes content identity without persisting the raw value, and rejects replay/collision without overwriting prior revisions.
+- Focused proof: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/evidenceAdmission.test.ts server/services/intelligenceFabric/contracts.test.ts server/services/intelligenceFabric/registryPersistence.test.ts` — current focused suite: 3 files, 34 tests passed after review fixes; `evidenceAdmission.test.ts` alone passes 15 tests. `git diff --check` passed.
+- The seam serializes lineage closure validation and append per tenant/source, verifies every transitive parent contract against its durable row, and rejects unknown resolver receipt keys. It is not composed into a router/default runtime. The current schema lacks a rights-policy receipt and activation writer; append store atomicity, rights lifecycle, revocation, source-health persistence, and production use remain blocked. No schema/migration changed.
