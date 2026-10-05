diff --git a/apps/web/server/services/intelligenceFabric/researchPromotion.test.ts b/apps/web/server/services/intelligenceFabric/researchPromotion.test.ts
new file mode 100644
index 000000000..287ad6c21
--- /dev/null
+++ b/apps/web/server/services/intelligenceFabric/researchPromotion.test.ts
@@ -0,0 +1,120 @@
+import { describe, expect, it } from "vitest";
+import {
+  consumeResearchWatchNotice,
+  promoteResearchEvidence,
+  ResearchPromotionError,
+  type ResearchPromotionAuthority,
+} from "./researchPromotion";
+
+const context = { tenantId: "tenant-1", researchRequestId: "request-1", researchRunId: "run-1", evidenceCandidateId: "candidate-1", artifactId: "artifact-1" } as const;
+const candidate = { evidenceCandidateId: "candidate-1", researchRunId: "run-1", originalSourceRef: "source-ref-1", fetchedAt: "2026-10-05T00:00:00.000Z", evidenceClass: "official_record", verificationState: "authority_verified", lineageRefs: [], admissionState: "CORROBORATED" } as const;
+const artifact = { artifactId: "artifact-1", researchRunId: "run-1", mediaType: "application/pdf", storageRef: "storage-1", contentHash: `sha256:${"a".repeat(64)}`, capturedAt: "2026-10-05T00:00:00.000Z", sourceRefs: ["source-ref-1"], agentGenerated: false, securityScanState: "passed" } as const;
+const notice = { contractVersion: "spec266-research-watch-v1", changeId: "change-1", idempotencyKey: "notice-key-1", watchRef: "watch-1", watchRevision: 1, consumerKind: "DECISION_ANALYSIS", consumerRef: "consumer-1", authorizationScope: "TENANT", tenantId: "tenant-1", researchRunRef: "run-1", changedRequirementRefs: ["requirement-1"], admittedEvidenceRefs: ["evidence-1"], candidateRefs: ["candidate-1"], changedAt: "2026-10-05T00:00:00.000Z" } as const;
+
+function authority(overrides: Partial<Awaited<ReturnType<ResearchPromotionAuthority["resolve"]>>> = {}): ResearchPromotionAuthority {
+  return { resolve: async () => ({ ...context, sourceId: "source-1", datasetId: "dataset-1", evidenceRef: "evidence-1", scanReceipt: "passed" as const, rightsReceipt: "granted" as const, provenanceClosed: true, schemaValid: true, watchNotice: notice, ...overrides }) };
+}
+
+describe("Spec 266 research promotion policy", () => {
+  it("uses only trusted promotion receipts and commits evidence before its watch notice", async () => {
+    const order: string[] = [];
+    const result = await promoteResearchEvidence({ context, candidate, artifact, authority: authority(), notice, writer: {
+      transaction: callback => callback({}),
+      appendCanonicalEvidence: async (_tx, value) => { order.push(`evidence:${value.evidenceRef}`); return { evidenceRef: value.evidenceRef }; },
+      appendWatchNotice: async () => { order.push("notice"); },
+    } });
+    expect(result).toEqual({ evidenceRef: "evidence-1" });
+    expect(order).toEqual(["evidence:evidence-1", "notice"]);
+  });
+
+  it("rejects caller echoed scans, rights, incomplete provenance, and identity drift before durable writes", async () => {
+    for (const override of [{ scanReceipt: "pending" as const }, { rightsReceipt: "denied" as const }, { provenanceClosed: false }, { evidenceCandidateId: "candidate-other" }]) {
+      let writes = 0;
+      await expect(promoteResearchEvidence({ context, candidate, artifact: { ...artifact, securityScanState: "passed" }, authority: authority(override), notice, writer: {
+        transaction: callback => callback({}), appendCanonicalEvidence: async () => { writes += 1; return { evidenceRef: "evidence-1" }; }, appendWatchNotice: async () => { writes += 1; },
+      } })).rejects.toBeInstanceOf(ResearchPromotionError);
+      expect(writes).toBe(0);
+    }
+  });
+
+  it("does not write a notice whose evidence or candidate references differ from the trusted promotion", async () => {
+    let writes = 0;
+    const writer = {
+      transaction: <T>(callback: (transaction: {}) => Promise<T>) => callback({}),
+      appendCanonicalEvidence: async () => { writes += 1; return { evidenceRef: "evidence-1" }; },
+      appendWatchNotice: async () => { writes += 1; },
+    };
+    await expect(promoteResearchEvidence({ context, candidate, artifact, authority: authority(), writer, notice: { ...notice, admittedEvidenceRefs: ["evidence-other"] } }))
+      .rejects.toMatchObject({ code: "RESEARCH_PROMOTION_CANDIDATE_MISMATCH" });
+    expect(writes).toBe(0);
+  });
+
+  it("binds the whole notice identity to server-resolved authority before durable writes", async () => {
+    for (const forged of [
+      { ...notice, changeId: "change-forged" }, { ...notice, watchRef: "watch-forged" },
+      { ...notice, consumerRef: "consumer-forged" }, { ...notice, changedRequirementRefs: ["requirement-forged"] },
+    ]) {
+      let writes = 0;
+      await expect(promoteResearchEvidence({ context, candidate, artifact, authority: authority(), notice: forged, writer: {
+        transaction: callback => callback({}), appendCanonicalEvidence: async () => { writes += 1; return { evidenceRef: "evidence-1" }; }, appendWatchNotice: async () => { writes += 1; },
+      } })).rejects.toMatchObject({ code: "RESEARCH_PROMOTION_CANDIDATE_MISMATCH" });
+      expect(writes).toBe(0);
+    }
+  });
+
+  it("reauthorizes after acquiring a lease, retries failed delivery, and keeps public delivery fail-closed", async () => {
+    const delivered: string[] = [];
+    const leases = new Set<string>();
+    const acknowledged = new Set<string>();
+    const consumer = {
+      claim: async (key: string) => acknowledged.has(key) || leases.has(key) ? undefined : (leases.add(key), { idempotencyKey: key, leaseToken: "lease-1" }),
+      deliver: async (value: typeof notice) => { delivered.push(value.changeId); },
+      acknowledge: async (claim: { idempotencyKey: string }) => { acknowledged.add(claim.idempotencyKey); leases.delete(claim.idempotencyKey); },
+      release: async (claim: { idempotencyKey: string }) => { if (!acknowledged.has(claim.idempotencyKey)) leases.delete(claim.idempotencyKey); },
+    };
+    const authorize = { reauthorize: async () => true };
+    expect(await consumeResearchWatchNotice({ notice, authority: authorize, consumer })).toEqual({ delivered: true });
+    expect(await consumeResearchWatchNotice({ notice, authority: authorize, consumer })).toEqual({ delivered: false });
+    await expect(consumeResearchWatchNotice({ notice: { ...notice, authorizationScope: "PUBLIC", tenantId: undefined }, authority: { reauthorize: async () => true }, consumer })).rejects.toMatchObject({ code: "RESEARCH_PROMOTION_PUBLIC_UNSUPPORTED" });
+    expect(delivered).toEqual(["change-1"]);
+  });
+
+  it("releases a failed delivery lease so the same notice can retry", async () => {
+    let attempts = 0;
+    let leased = false;
+    const consumer = {
+      claim: async (key: string) => leased ? undefined : (leased = true, { idempotencyKey: key, leaseToken: "lease-1" }),
+      deliver: async () => { attempts += 1; if (attempts === 1) throw new Error("temporary failure"); },
+      acknowledge: async () => { leased = false; },
+      release: async () => { leased = false; },
+    };
+    await expect(consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => true }, consumer })).rejects.toThrow("temporary failure");
+    expect(await consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => true }, consumer })).toEqual({ delivered: true });
+    expect(attempts).toBe(2);
+  });
+
+
+  it("does not reopen or redeliver a terminal acknowledgement after an ambiguous ack error", async () => {
+    let acknowledged = false;
+    let leased = false;
+    let deliveries = 0;
+    const consumer = {
+      claim: async (key: string) => acknowledged || leased ? undefined : (leased = true, { idempotencyKey: key, leaseToken: "lease-1" }),
+      deliver: async () => { deliveries += 1; },
+      acknowledge: async () => { acknowledged = true; leased = false; throw new Error("ack response lost"); },
+      release: async () => { if (!acknowledged) leased = false; },
+    };
+    await expect(consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => true }, consumer })).rejects.toThrow("ack response lost");
+    expect(await consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => true }, consumer })).toEqual({ delivered: false });
+    expect(deliveries).toBe(1);
+  });
+
+  it("releases a post-claim lease when fresh authorization denies delivery", async () => {
+    const calls: string[] = [];
+    await expect(consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => { calls.push("authorize"); return false; } }, consumer: {
+      claim: async key => { calls.push("claim"); return { idempotencyKey: key, leaseToken: "lease-1" }; },
+      deliver: async () => { calls.push("deliver"); }, acknowledge: async () => { calls.push("acknowledge"); }, release: async () => { calls.push("release"); },
+    } })).rejects.toMatchObject({ code: "RESEARCH_NOTICE_UNAUTHORIZED" });
+    expect(calls).toEqual(["claim", "authorize", "release"]);
+  });
+});
diff --git a/apps/web/server/services/intelligenceFabric/researchPromotion.ts b/apps/web/server/services/intelligenceFabric/researchPromotion.ts
new file mode 100644
index 000000000..f4191c8b9
--- /dev/null
+++ b/apps/web/server/services/intelligenceFabric/researchPromotion.ts
@@ -0,0 +1,205 @@
+import {
+  validateEvidenceCandidate,
+  validateResearchArtifact,
+  validateResearchWatchChangeNotice,
+  type ResearchWatchChangeNotice,
+} from "./researchAdmission";
+
+const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
+
+export type ResearchPromotionErrorCode =
+  | "RESEARCH_PROMOTION_INVALID"
+  | "RESEARCH_PROMOTION_AUTHORITY_UNAVAILABLE"
+  | "RESEARCH_PROMOTION_SCAN_REQUIRED"
+  | "RESEARCH_PROMOTION_RIGHTS_REQUIRED"
+  | "RESEARCH_PROMOTION_PROVENANCE_REQUIRED"
+  | "RESEARCH_PROMOTION_SCHEMA_REQUIRED"
+  | "RESEARCH_PROMOTION_CANDIDATE_MISMATCH"
+  | "RESEARCH_PROMOTION_PUBLIC_UNSUPPORTED"
+  | "RESEARCH_NOTICE_INVALID"
+  | "RESEARCH_NOTICE_UNAUTHORIZED"
+  | "RESEARCH_NOTICE_EVIDENCE_UNAVAILABLE";
+
+export class ResearchPromotionError extends Error {
+  constructor(readonly code: ResearchPromotionErrorCode) {
+    super(code);
+    this.name = "ResearchPromotionError";
+  }
+}
+
+export interface ResearchPromotionContext {
+  readonly tenantId: string;
+  readonly researchRequestId: string;
+  readonly researchRunId: string;
+  readonly evidenceCandidateId: string;
+  readonly artifactId: string;
+}
+
+/**
+ * Every result here is resolved from server-owned durable records. Candidate and
+ * artifact request data are only identifiers; a model cannot promote itself by
+ * echoing a passed flag, a rights reference, or a source identity.
+ */
+export interface ResearchPromotionAuthority {
+  resolve(input: ResearchPromotionContext): Promise<{
+    readonly tenantId: string;
+    readonly researchRequestId: string;
+    readonly researchRunId: string;
+    readonly evidenceCandidateId: string;
+    readonly artifactId: string;
+    readonly sourceId: string;
+    readonly datasetId: string;
+    readonly evidenceRef: string;
+    readonly scanReceipt: "passed" | "failed" | "pending" | "unavailable";
+    readonly rightsReceipt: "granted" | "denied" | "expired" | "unavailable";
+    readonly provenanceClosed: boolean;
+    readonly schemaValid: boolean;
+    /**
+     * Server-resolved notice identity. The request payload must equal this
+     * durable authority record before it can enter the evidence transaction.
+     */
+    readonly watchNotice: ResearchWatchChangeNotice;
+  } | undefined>;
+}
+
+export interface ResearchPromotionWriter<Transaction> {
+  transaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
+  /** Must append canonical evidence before a watch notice can be recorded. */
+  appendCanonicalEvidence(transaction: Transaction, input: {
+    readonly tenantId: string;
+    readonly sourceId: string;
+    readonly datasetId: string;
+    readonly evidenceRef: string;
+    readonly researchRequestId: string;
+    readonly researchRunId: string;
+    readonly evidenceCandidateId: string;
+    readonly artifactId: string;
+  }): Promise<{ readonly evidenceRef: string }>;
+  appendWatchNotice(transaction: Transaction, notice: ResearchWatchChangeNotice): Promise<void>;
+}
+
+function fail(code: ResearchPromotionErrorCode): never {
+  throw new ResearchPromotionError(code);
+}
+
+function validContext(value: ResearchPromotionContext): boolean {
+  return Boolean(value) && [value.tenantId, value.researchRequestId, value.researchRunId, value.evidenceCandidateId, value.artifactId]
+    .every(item => typeof item === "string" && ID.test(item));
+}
+
+function sameWatchNotice(left: ResearchWatchChangeNotice, right: ResearchWatchChangeNotice): boolean {
+  return left.contractVersion === right.contractVersion && left.changeId === right.changeId &&
+    left.idempotencyKey === right.idempotencyKey && left.watchRef === right.watchRef &&
+    left.watchRevision === right.watchRevision && left.consumerKind === right.consumerKind &&
+    left.consumerRef === right.consumerRef && left.authorizationScope === right.authorizationScope &&
+    left.tenantId === right.tenantId && left.researchRunRef === right.researchRunRef &&
+    left.changedAt === right.changedAt &&
+    left.changedRequirementRefs.length === right.changedRequirementRefs.length &&
+    left.changedRequirementRefs.every((value, index) => value === right.changedRequirementRefs[index]) &&
+    left.admittedEvidenceRefs.length === right.admittedEvidenceRefs.length &&
+    left.admittedEvidenceRefs.every((value, index) => value === right.admittedEvidenceRefs[index]) &&
+    left.candidateRefs.length === right.candidateRefs.length &&
+    left.candidateRefs.every((value, index) => value === right.candidateRefs[index]);
+}
+
+/**
+ * Promotes only identifiers that resolve to current server authority. The writer
+ * is intentionally injected because the current schema has no candidate/notice
+ * ledger; runtime composition remains blocked until it can bind this transaction
+ * to the durable evidence writer and outbox.
+ */
+export async function promoteResearchEvidence<Transaction>(input: {
+  readonly context: ResearchPromotionContext;
+  readonly candidate: unknown;
+  readonly artifact: unknown;
+  readonly authority: ResearchPromotionAuthority;
+  readonly writer: ResearchPromotionWriter<Transaction>;
+  readonly notice: unknown;
+}): Promise<{ readonly evidenceRef: string }> {
+  if (!validContext(input.context)) fail("RESEARCH_PROMOTION_INVALID");
+  const candidate = validateEvidenceCandidate(input.candidate);
+  const artifact = validateResearchArtifact(input.artifact);
+  const notice = validateResearchWatchChangeNotice(input.notice);
+  if (!candidate.ok || !artifact.ok || !notice.ok) fail("RESEARCH_PROMOTION_INVALID");
+  if (candidate.value.evidenceCandidateId !== input.context.evidenceCandidateId ||
+    candidate.value.researchRunId !== input.context.researchRunId ||
+    artifact.value.artifactId !== input.context.artifactId || artifact.value.researchRunId !== input.context.researchRunId ||
+    notice.value.researchRunRef !== input.context.researchRunId || notice.value.authorizationScope !== "TENANT" ||
+    notice.value.tenantId !== input.context.tenantId) fail("RESEARCH_PROMOTION_CANDIDATE_MISMATCH");
+
+  const trusted = await input.authority.resolve(input.context);
+  if (!trusted || trusted.tenantId !== input.context.tenantId || trusted.researchRequestId !== input.context.researchRequestId ||
+    trusted.researchRunId !== input.context.researchRunId || trusted.evidenceCandidateId !== input.context.evidenceCandidateId ||
+    trusted.artifactId !== input.context.artifactId || !ID.test(trusted.sourceId) || !ID.test(trusted.datasetId) || !ID.test(trusted.evidenceRef)) {
+    fail("RESEARCH_PROMOTION_AUTHORITY_UNAVAILABLE");
+  }
+  const trustedNotice = validateResearchWatchChangeNotice(trusted.watchNotice);
+  if (!trustedNotice.ok) fail("RESEARCH_PROMOTION_AUTHORITY_UNAVAILABLE");
+  if (trusted.scanReceipt !== "passed") fail("RESEARCH_PROMOTION_SCAN_REQUIRED");
+  if (trusted.rightsReceipt !== "granted") fail("RESEARCH_PROMOTION_RIGHTS_REQUIRED");
+  if (!trusted.provenanceClosed) fail("RESEARCH_PROMOTION_PROVENANCE_REQUIRED");
+  if (!trusted.schemaValid) fail("RESEARCH_PROMOTION_SCHEMA_REQUIRED");
+  if (!sameWatchNotice(notice.value, trustedNotice.value) ||
+    !trustedNotice.value.admittedEvidenceRefs.includes(trusted.evidenceRef) ||
+    !trustedNotice.value.candidateRefs.includes(trusted.evidenceCandidateId)) fail("RESEARCH_PROMOTION_CANDIDATE_MISMATCH");
+
+  return input.writer.transaction(async transaction => {
+    const evidence = await input.writer.appendCanonicalEvidence(transaction, {
+      tenantId: trusted.tenantId, sourceId: trusted.sourceId, datasetId: trusted.datasetId, evidenceRef: trusted.evidenceRef,
+      researchRequestId: trusted.researchRequestId, researchRunId: trusted.researchRunId,
+      evidenceCandidateId: trusted.evidenceCandidateId, artifactId: trusted.artifactId,
+    });
+    if (evidence.evidenceRef !== trusted.evidenceRef) fail("RESEARCH_PROMOTION_AUTHORITY_UNAVAILABLE");
+    await input.writer.appendWatchNotice(transaction, trustedNotice.value);
+    return evidence;
+  });
+}
+
+export interface ResearchWatchConsumerAuthority {
+  reauthorize(input: Pick<ResearchWatchChangeNotice, "authorizationScope" | "tenantId" | "consumerKind" | "consumerRef">): Promise<boolean>;
+}
+
+export interface ResearchWatchDeliveryClaim {
+  readonly idempotencyKey: string;
+  readonly leaseToken: string;
+}
+
+export interface ResearchWatchConsumer {
+  /** Returns a durable lease, or undefined for an acknowledged notice or active lease. */
+  claim(idempotencyKey: string): Promise<ResearchWatchDeliveryClaim | undefined>;
+  /** Delivery must be idempotent for the notice idempotency key. */
+  deliver(notice: ResearchWatchChangeNotice, claim: ResearchWatchDeliveryClaim): Promise<void>;
+  /** Durably and idempotently marks terminal completion; subsequent claims must return undefined. */
+  acknowledge(claim: ResearchWatchDeliveryClaim): Promise<void>;
+  /** Releases only an unacknowledged lease; must be a no-op after terminal acknowledgement, including ambiguous retries. */
+  release(claim: ResearchWatchDeliveryClaim): Promise<void>;
+}
+
+/**
+ * Claims first, then reauthorizes immediately before delivery. A failed delivery
+ * releases its lease; durable acknowledgement happens only after delivery.
+ */
+export async function consumeResearchWatchNotice(input: {
+  readonly notice: unknown;
+  readonly authority: ResearchWatchConsumerAuthority;
+  readonly consumer: ResearchWatchConsumer;
+}): Promise<{ readonly delivered: boolean }> {
+  const notice = validateResearchWatchChangeNotice(input.notice);
+  if (!notice.ok || notice.value.authorizationScope !== "TENANT" || !notice.value.tenantId) {
+    fail(notice.ok && notice.value.authorizationScope === "PUBLIC" ? "RESEARCH_PROMOTION_PUBLIC_UNSUPPORTED" : "RESEARCH_NOTICE_INVALID");
+  }
+  const claim = await input.consumer.claim(notice.value.idempotencyKey);
+  if (!claim) return { delivered: false };
+  try {
+    if (claim.idempotencyKey !== notice.value.idempotencyKey || !ID.test(claim.leaseToken)) {
+      fail("RESEARCH_NOTICE_INVALID");
+    }
+    if (!(await input.authority.reauthorize(notice.value))) fail("RESEARCH_NOTICE_UNAUTHORIZED");
+    await input.consumer.deliver(notice.value, claim);
+    await input.consumer.acknowledge(claim);
+    return { delivered: true };
+  } catch (error) {
+    await input.consumer.release(claim);
+    throw error;
+  }
+}
diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-05-research-plane.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-05-research-plane.md
index fecd4a6fd..d5f08fa6a 100644
--- a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-05-research-plane.md
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-05-research-plane.md
@@ -10,19 +10,59 @@ Spec 266 §§10–11, 46.10, 46.12 and 47 items 15–20, 21–22.

 ## Implementation

-- Added schema-free bounded immutable candidate parsers, conservative source-match recommendations (canonical HTTP(S) endpoint, provider/dataset or provider/API/schema identity), and bounded dependency/corroboration evaluation. Repost/summary chains collapse to roots; derived claims cannot be submitted as observations. This is not persistence or merge authority.
-- Added a bounded immutable `ResearchArtifact` reference validator and a metadata-only scan-state predicate. A `passed` value is not trusted scan authority; downstream admission must load a server-owned scan receipt. This does not perform malware scanning or grant payload access.
-- Added a strict immutable `ResearchWatchChangeNotice` parser with idempotency/reference bounds and PUBLIC/TENANT scope checks. Notice emission, durable commit ordering and consumer reauthorization remain persistence/composition work.
-- Atomically persist request admission and canonical worker_jobs/outbox intent; use reference-only dispatch envelopes.
-- Make idempotent retries reuse one admitted identity; intentional revalidation creates an immutable new ResearchRun.
-- Research outputs remain candidates until normal rights/schema/security admission succeeds.
-- Runtime/secret/placement is selected server-side; no local scheduler or fallback.
-- Emit research watch change notices only after durable evidence state, then reauthorize and dedupe consumers.
+- Preserve bounded candidate/artifact/notice parsers in `researchAdmission.ts` and contracts in `researchContracts.ts`; treat all provider/model output as untrusted.
+- Preserve atomic request + canonical `worker_jobs`/outbox admission in `researchPersistence.ts`. Bind a production executor only through approved runtime plus server-owned capability/secret/placement/budget/cancellation/lease policy. Dispatch envelopes contain identifiers only.
+- Keep `researchRunPersistence.ts` append-only and exact-bound to tenant/request/job. Intentional revalidation creates a new immutable run; retries reuse stable identity.
+- Store artifact references as opaque metadata. Promotion requires a server-owned scan receipt, current rights and authorization, source identity, schema validation, lineage closure, methodology, and full evidence admission. A caller-supplied `passed` flag never qualifies.
+- Complete canonical promotion and watch notice sequencing without adding a queue/scheduler: commit canonical evidence first, write notice/outbox intent transactionally, then consumer reauthorizes and deduplicates.
+- PUBLIC dispatch stays fail-closed until an explicit canonical public-principal design exists. No local runtime fallback.

 ## Tests

-- Contract, authorization, job idempotency, outbox correlation, promotion, echo resistance, budget bounds and notice reauthorization.
+- Extend research contract/admission/persistence/run tests for server authority, idempotency, reference-only envelopes, exact job binding, candidate echo resistance, rights/scan-receipt promotion, budget/fan-out, cancellation, notice order, reauthorization, deduplication, and public fail-closed behavior.

 ## Acceptance

 Spec 266 §46.10 items 58–75 and §46.12 items 80–87.
+
+## Runtime and Promotion Gates
+
+- `researchPromotion.ts` supplies a schema-free, fail-closed policy seam: it accepts candidate/artifact data only for structural validation, then resolves scan, rights, source/dataset, request/run, provenance, and schema receipts from server-owned authority before writing anything.
+- It orders canonical evidence append before the watch notice inside one injected transaction and reauthorizes the consumer before deduplicated notice delivery.
+- This is not an enabled runtime path yet. The active schema wave owns the candidate/notice ledger and the concrete transaction/outbox composition. Until those durable writers, current rights authority, and the approved research executor are bound, promotion and watch dispatch must remain unavailable.
+- PUBLIC promotion and watch delivery remain explicitly fail-closed because no canonical public-principal design exists.
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
+## Implementation evidence (2026-10-05)
+
+- Added a fail-closed promotion boundary: server-resolved request/run/candidate/artifact/source/dataset identity, scan and rights receipts, provenance closure, and schema validation are required; caller `passed` fields do not grant authority.
+- Canonical evidence append precedes the watch notice within one injected transaction. Notice identity is fully matched to server-owned watch/consumer/change/reference state. Consumption is tenant-only and uses a durable lease, post-claim reauthorization, successful-delivery acknowledgement, and retryable lease release.
+- Focused proof: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/researchPromotion.test.ts server/services/intelligenceFabric/researchAdmission.test.ts server/services/intelligenceFabric/researchPersistence.test.ts server/services/intelligenceFabric/researchRunPersistence.test.ts` — 4 files, 24 tests passed; the promotion/notice suite now passes 8 tests after review fixes. `git diff --check` passed.
+- External gate: the injected authority/writer/consumer are not composed with a production candidate ledger, canonical evidence store, outbox, scanner, or rights authority. No executor invocation or production ResearchRun is claimed; public async remains unsupported.
