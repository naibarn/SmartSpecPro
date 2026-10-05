import { describe, expect, it } from "vitest";
import {
  consumeResearchWatchNotice,
  promoteResearchEvidence,
  ResearchPromotionError,
  type ResearchPromotionAuthority,
} from "./researchPromotion";

const context = { tenantId: "tenant-1", researchRequestId: "request-1", researchRunId: "run-1", evidenceCandidateId: "candidate-1", artifactId: "artifact-1" } as const;
const candidate = { evidenceCandidateId: "candidate-1", researchRunId: "run-1", originalSourceRef: "source-ref-1", fetchedAt: "2026-10-05T00:00:00.000Z", evidenceClass: "official_record", verificationState: "authority_verified", lineageRefs: [], admissionState: "CORROBORATED" } as const;
const artifact = { artifactId: "artifact-1", researchRunId: "run-1", mediaType: "application/pdf", storageRef: "storage-1", contentHash: `sha256:${"a".repeat(64)}`, capturedAt: "2026-10-05T00:00:00.000Z", sourceRefs: ["source-ref-1"], agentGenerated: false, securityScanState: "passed" } as const;
const notice = { contractVersion: "spec266-research-watch-v1", changeId: "change-1", idempotencyKey: "notice-key-1", watchRef: "watch-1", watchRevision: 1, consumerKind: "DECISION_ANALYSIS", consumerRef: "consumer-1", authorizationScope: "TENANT", tenantId: "tenant-1", researchRunRef: "run-1", changedRequirementRefs: ["requirement-1"], admittedEvidenceRefs: ["evidence-1"], candidateRefs: ["candidate-1"], changedAt: "2026-10-05T00:00:00.000Z" } as const;

function authority(overrides: Partial<Awaited<ReturnType<ResearchPromotionAuthority["resolve"]>>> = {}): ResearchPromotionAuthority {
  return { resolve: async () => ({ ...context, sourceId: "source-1", datasetId: "dataset-1", evidenceRef: "evidence-1", scanReceipt: "passed" as const, rightsReceipt: "granted" as const, provenanceClosed: true, schemaValid: true, watchNotice: notice, ...overrides }) };
}

describe("Spec 266 research promotion policy", () => {
  it("uses only trusted promotion receipts and commits evidence before its watch notice", async () => {
    const order: string[] = [];
    const result = await promoteResearchEvidence({ context, candidate, artifact, authority: authority(), notice, writer: {
      transaction: callback => callback({}),
      appendCanonicalEvidence: async (_tx, value) => { order.push(`evidence:${value.evidenceRef}`); return { evidenceRef: value.evidenceRef }; },
      appendWatchNotice: async () => { order.push("notice"); },
    } });
    expect(result).toEqual({ evidenceRef: "evidence-1" });
    expect(order).toEqual(["evidence:evidence-1", "notice"]);
  });

  it("rejects caller echoed scans, rights, incomplete provenance, and identity drift before durable writes", async () => {
    for (const override of [{ scanReceipt: "pending" as const }, { rightsReceipt: "denied" as const }, { provenanceClosed: false }, { evidenceCandidateId: "candidate-other" }]) {
      let writes = 0;
      await expect(promoteResearchEvidence({ context, candidate, artifact: { ...artifact, securityScanState: "passed" }, authority: authority(override), notice, writer: {
        transaction: callback => callback({}), appendCanonicalEvidence: async () => { writes += 1; return { evidenceRef: "evidence-1" }; }, appendWatchNotice: async () => { writes += 1; },
      } })).rejects.toBeInstanceOf(ResearchPromotionError);
      expect(writes).toBe(0);
    }
  });

  it("does not write a notice whose evidence or candidate references differ from the trusted promotion", async () => {
    let writes = 0;
    const writer = {
      transaction: <T>(callback: (transaction: {}) => Promise<T>) => callback({}),
      appendCanonicalEvidence: async () => { writes += 1; return { evidenceRef: "evidence-1" }; },
      appendWatchNotice: async () => { writes += 1; },
    };
    await expect(promoteResearchEvidence({ context, candidate, artifact, authority: authority(), writer, notice: { ...notice, admittedEvidenceRefs: ["evidence-other"] } }))
      .rejects.toMatchObject({ code: "RESEARCH_PROMOTION_CANDIDATE_MISMATCH" });
    expect(writes).toBe(0);
  });

  it("binds the whole notice identity to server-resolved authority before durable writes", async () => {
    for (const forged of [
      { ...notice, changeId: "change-forged" }, { ...notice, watchRef: "watch-forged" },
      { ...notice, consumerRef: "consumer-forged" }, { ...notice, changedRequirementRefs: ["requirement-forged"] },
    ]) {
      let writes = 0;
      await expect(promoteResearchEvidence({ context, candidate, artifact, authority: authority(), notice: forged, writer: {
        transaction: callback => callback({}), appendCanonicalEvidence: async () => { writes += 1; return { evidenceRef: "evidence-1" }; }, appendWatchNotice: async () => { writes += 1; },
      } })).rejects.toMatchObject({ code: "RESEARCH_PROMOTION_CANDIDATE_MISMATCH" });
      expect(writes).toBe(0);
    }
  });

  it("reauthorizes after acquiring a lease, retries failed delivery, and keeps public delivery fail-closed", async () => {
    const delivered: string[] = [];
    const leases = new Set<string>();
    const acknowledged = new Set<string>();
    const consumer = {
      claim: async (key: string) => acknowledged.has(key) || leases.has(key) ? undefined : (leases.add(key), { idempotencyKey: key, leaseToken: "lease-1" }),
      deliver: async (value: typeof notice) => { delivered.push(value.changeId); },
      acknowledge: async (claim: { idempotencyKey: string }) => { acknowledged.add(claim.idempotencyKey); leases.delete(claim.idempotencyKey); },
      release: async (claim: { idempotencyKey: string }) => { if (!acknowledged.has(claim.idempotencyKey)) leases.delete(claim.idempotencyKey); },
    };
    const authorize = { reauthorize: async () => true };
    expect(await consumeResearchWatchNotice({ notice, authority: authorize, consumer })).toEqual({ delivered: true });
    expect(await consumeResearchWatchNotice({ notice, authority: authorize, consumer })).toEqual({ delivered: false });
    await expect(consumeResearchWatchNotice({ notice: { ...notice, authorizationScope: "PUBLIC", tenantId: undefined }, authority: { reauthorize: async () => true }, consumer })).rejects.toMatchObject({ code: "RESEARCH_PROMOTION_PUBLIC_UNSUPPORTED" });
    expect(delivered).toEqual(["change-1"]);
  });

  it("releases a failed delivery lease so the same notice can retry", async () => {
    let attempts = 0;
    let leased = false;
    const consumer = {
      claim: async (key: string) => leased ? undefined : (leased = true, { idempotencyKey: key, leaseToken: "lease-1" }),
      deliver: async () => { attempts += 1; if (attempts === 1) throw new Error("temporary failure"); },
      acknowledge: async () => { leased = false; },
      release: async () => { leased = false; },
    };
    await expect(consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => true }, consumer })).rejects.toThrow("temporary failure");
    expect(await consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => true }, consumer })).toEqual({ delivered: true });
    expect(attempts).toBe(2);
  });


  it("does not reopen or redeliver a terminal acknowledgement after an ambiguous ack error", async () => {
    let acknowledged = false;
    let leased = false;
    let deliveries = 0;
    const consumer = {
      claim: async (key: string) => acknowledged || leased ? undefined : (leased = true, { idempotencyKey: key, leaseToken: "lease-1" }),
      deliver: async () => { deliveries += 1; },
      acknowledge: async () => { acknowledged = true; leased = false; throw new Error("ack response lost"); },
      release: async () => { if (!acknowledged) leased = false; },
    };
    await expect(consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => true }, consumer })).rejects.toThrow("ack response lost");
    expect(await consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => true }, consumer })).toEqual({ delivered: false });
    expect(deliveries).toBe(1);
  });

  it("releases a post-claim lease when fresh authorization denies delivery", async () => {
    const calls: string[] = [];
    await expect(consumeResearchWatchNotice({ notice, authority: { reauthorize: async () => { calls.push("authorize"); return false; } }, consumer: {
      claim: async key => { calls.push("claim"); return { idempotencyKey: key, leaseToken: "lease-1" }; },
      deliver: async () => { calls.push("deliver"); }, acknowledge: async () => { calls.push("acknowledge"); }, release: async () => { calls.push("release"); },
    } })).rejects.toMatchObject({ code: "RESEARCH_NOTICE_UNAUTHORIZED" });
    expect(calls).toEqual(["claim", "authorize", "release"]);
  });
});
