import {
  validateEvidenceCandidate,
  validateResearchArtifact,
  validateResearchWatchChangeNotice,
  type ResearchWatchChangeNotice,
} from "./researchAdmission";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export type ResearchPromotionErrorCode =
  | "RESEARCH_PROMOTION_INVALID"
  | "RESEARCH_PROMOTION_AUTHORITY_UNAVAILABLE"
  | "RESEARCH_PROMOTION_SCAN_REQUIRED"
  | "RESEARCH_PROMOTION_RIGHTS_REQUIRED"
  | "RESEARCH_PROMOTION_PROVENANCE_REQUIRED"
  | "RESEARCH_PROMOTION_SCHEMA_REQUIRED"
  | "RESEARCH_PROMOTION_CANDIDATE_MISMATCH"
  | "RESEARCH_PROMOTION_PUBLIC_UNSUPPORTED"
  | "RESEARCH_NOTICE_INVALID"
  | "RESEARCH_NOTICE_UNAUTHORIZED"
  | "RESEARCH_NOTICE_EVIDENCE_UNAVAILABLE";

export class ResearchPromotionError extends Error {
  constructor(readonly code: ResearchPromotionErrorCode) {
    super(code);
    this.name = "ResearchPromotionError";
  }
}

export interface ResearchPromotionContext {
  readonly tenantId: string;
  readonly researchRequestId: string;
  readonly researchRunId: string;
  readonly evidenceCandidateId: string;
  readonly artifactId: string;
}

/**
 * Every result here is resolved from server-owned durable records. Candidate and
 * artifact request data are only identifiers; a model cannot promote itself by
 * echoing a passed flag, a rights reference, or a source identity.
 */
export interface ResearchPromotionAuthority {
  resolve(input: ResearchPromotionContext): Promise<{
    readonly tenantId: string;
    readonly researchRequestId: string;
    readonly researchRunId: string;
    readonly evidenceCandidateId: string;
    readonly artifactId: string;
    readonly sourceId: string;
    readonly datasetId: string;
    readonly evidenceRef: string;
    readonly scanReceipt: "passed" | "failed" | "pending" | "unavailable";
    readonly rightsReceipt: "granted" | "denied" | "expired" | "unavailable";
    readonly provenanceClosed: boolean;
    readonly schemaValid: boolean;
    /**
     * Server-resolved notice identity. The request payload must equal this
     * durable authority record before it can enter the evidence transaction.
     */
    readonly watchNotice: ResearchWatchChangeNotice;
  } | undefined>;
}

export interface ResearchPromotionWriter<Transaction> {
  transaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
  /** Must append canonical evidence before a watch notice can be recorded. */
  appendCanonicalEvidence(transaction: Transaction, input: {
    readonly tenantId: string;
    readonly sourceId: string;
    readonly datasetId: string;
    readonly evidenceRef: string;
    readonly researchRequestId: string;
    readonly researchRunId: string;
    readonly evidenceCandidateId: string;
    readonly artifactId: string;
  }): Promise<{ readonly evidenceRef: string }>;
  appendWatchNotice(transaction: Transaction, notice: ResearchWatchChangeNotice): Promise<void>;
}

function fail(code: ResearchPromotionErrorCode): never {
  throw new ResearchPromotionError(code);
}

function validContext(value: ResearchPromotionContext): boolean {
  return Boolean(value) && [value.tenantId, value.researchRequestId, value.researchRunId, value.evidenceCandidateId, value.artifactId]
    .every(item => typeof item === "string" && ID.test(item));
}

function sameWatchNotice(left: ResearchWatchChangeNotice, right: ResearchWatchChangeNotice): boolean {
  return left.contractVersion === right.contractVersion && left.changeId === right.changeId &&
    left.idempotencyKey === right.idempotencyKey && left.watchRef === right.watchRef &&
    left.watchRevision === right.watchRevision && left.consumerKind === right.consumerKind &&
    left.consumerRef === right.consumerRef && left.authorizationScope === right.authorizationScope &&
    left.tenantId === right.tenantId && left.researchRunRef === right.researchRunRef &&
    left.changedAt === right.changedAt &&
    left.changedRequirementRefs.length === right.changedRequirementRefs.length &&
    left.changedRequirementRefs.every((value, index) => value === right.changedRequirementRefs[index]) &&
    left.admittedEvidenceRefs.length === right.admittedEvidenceRefs.length &&
    left.admittedEvidenceRefs.every((value, index) => value === right.admittedEvidenceRefs[index]) &&
    left.candidateRefs.length === right.candidateRefs.length &&
    left.candidateRefs.every((value, index) => value === right.candidateRefs[index]);
}

/**
 * Promotes only identifiers that resolve to current server authority. The writer
 * is intentionally injected because the current schema has no candidate/notice
 * ledger; runtime composition remains blocked until it can bind this transaction
 * to the durable evidence writer and outbox.
 */
export async function promoteResearchEvidence<Transaction>(input: {
  readonly context: ResearchPromotionContext;
  readonly candidate: unknown;
  readonly artifact: unknown;
  readonly authority: ResearchPromotionAuthority;
  readonly writer: ResearchPromotionWriter<Transaction>;
  readonly notice: unknown;
}): Promise<{ readonly evidenceRef: string }> {
  if (!validContext(input.context)) fail("RESEARCH_PROMOTION_INVALID");
  const candidate = validateEvidenceCandidate(input.candidate);
  const artifact = validateResearchArtifact(input.artifact);
  const notice = validateResearchWatchChangeNotice(input.notice);
  if (!candidate.ok || !artifact.ok || !notice.ok) fail("RESEARCH_PROMOTION_INVALID");
  if (candidate.value.evidenceCandidateId !== input.context.evidenceCandidateId ||
    candidate.value.researchRunId !== input.context.researchRunId ||
    artifact.value.artifactId !== input.context.artifactId || artifact.value.researchRunId !== input.context.researchRunId ||
    notice.value.researchRunRef !== input.context.researchRunId || notice.value.authorizationScope !== "TENANT" ||
    notice.value.tenantId !== input.context.tenantId) fail("RESEARCH_PROMOTION_CANDIDATE_MISMATCH");

  const trusted = await input.authority.resolve(input.context);
  if (!trusted || trusted.tenantId !== input.context.tenantId || trusted.researchRequestId !== input.context.researchRequestId ||
    trusted.researchRunId !== input.context.researchRunId || trusted.evidenceCandidateId !== input.context.evidenceCandidateId ||
    trusted.artifactId !== input.context.artifactId || !ID.test(trusted.sourceId) || !ID.test(trusted.datasetId) || !ID.test(trusted.evidenceRef)) {
    fail("RESEARCH_PROMOTION_AUTHORITY_UNAVAILABLE");
  }
  const trustedNotice = validateResearchWatchChangeNotice(trusted.watchNotice);
  if (!trustedNotice.ok) fail("RESEARCH_PROMOTION_AUTHORITY_UNAVAILABLE");
  if (trusted.scanReceipt !== "passed") fail("RESEARCH_PROMOTION_SCAN_REQUIRED");
  if (trusted.rightsReceipt !== "granted") fail("RESEARCH_PROMOTION_RIGHTS_REQUIRED");
  if (!trusted.provenanceClosed) fail("RESEARCH_PROMOTION_PROVENANCE_REQUIRED");
  if (!trusted.schemaValid) fail("RESEARCH_PROMOTION_SCHEMA_REQUIRED");
  if (!sameWatchNotice(notice.value, trustedNotice.value) ||
    !trustedNotice.value.admittedEvidenceRefs.includes(trusted.evidenceRef) ||
    !trustedNotice.value.candidateRefs.includes(trusted.evidenceCandidateId)) fail("RESEARCH_PROMOTION_CANDIDATE_MISMATCH");

  return input.writer.transaction(async transaction => {
    const evidence = await input.writer.appendCanonicalEvidence(transaction, {
      tenantId: trusted.tenantId, sourceId: trusted.sourceId, datasetId: trusted.datasetId, evidenceRef: trusted.evidenceRef,
      researchRequestId: trusted.researchRequestId, researchRunId: trusted.researchRunId,
      evidenceCandidateId: trusted.evidenceCandidateId, artifactId: trusted.artifactId,
    });
    if (evidence.evidenceRef !== trusted.evidenceRef) fail("RESEARCH_PROMOTION_AUTHORITY_UNAVAILABLE");
    await input.writer.appendWatchNotice(transaction, trustedNotice.value);
    return evidence;
  });
}

export interface ResearchWatchConsumerAuthority {
  reauthorize(input: Pick<ResearchWatchChangeNotice, "authorizationScope" | "tenantId" | "consumerKind" | "consumerRef">): Promise<boolean>;
}

export interface ResearchWatchDeliveryClaim {
  readonly idempotencyKey: string;
  readonly leaseToken: string;
}

export interface ResearchWatchConsumer {
  /** Returns a durable lease, or undefined for an acknowledged notice or active lease. */
  claim(idempotencyKey: string): Promise<ResearchWatchDeliveryClaim | undefined>;
  /** Delivery must be idempotent for the notice idempotency key. */
  deliver(notice: ResearchWatchChangeNotice, claim: ResearchWatchDeliveryClaim): Promise<void>;
  /** Durably and idempotently marks terminal completion; subsequent claims must return undefined. */
  acknowledge(claim: ResearchWatchDeliveryClaim): Promise<void>;
  /** Releases only an unacknowledged lease; must be a no-op after terminal acknowledgement, including ambiguous retries. */
  release(claim: ResearchWatchDeliveryClaim): Promise<void>;
}

/**
 * Claims first, then reauthorizes immediately before delivery. A failed delivery
 * releases its lease; durable acknowledgement happens only after delivery.
 */
export async function consumeResearchWatchNotice(input: {
  readonly notice: unknown;
  readonly authority: ResearchWatchConsumerAuthority;
  readonly consumer: ResearchWatchConsumer;
}): Promise<{ readonly delivered: boolean }> {
  const notice = validateResearchWatchChangeNotice(input.notice);
  if (!notice.ok || notice.value.authorizationScope !== "TENANT" || !notice.value.tenantId) {
    fail(notice.ok && notice.value.authorizationScope === "PUBLIC" ? "RESEARCH_PROMOTION_PUBLIC_UNSUPPORTED" : "RESEARCH_NOTICE_INVALID");
  }
  const claim = await input.consumer.claim(notice.value.idempotencyKey);
  if (!claim) return { delivered: false };
  try {
    if (claim.idempotencyKey !== notice.value.idempotencyKey || !ID.test(claim.leaseToken)) {
      fail("RESEARCH_NOTICE_INVALID");
    }
    if (!(await input.authority.reauthorize(notice.value))) fail("RESEARCH_NOTICE_UNAUTHORIZED");
    await input.consumer.deliver(notice.value, claim);
    await input.consumer.acknowledge(claim);
    return { delivered: true };
  } catch (error) {
    await input.consumer.release(claim);
    throw error;
  }
}
