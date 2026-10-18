import { z } from "zod";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { normalizeCanonicalMarkdown, sha256 } from "./libraryCitationAnchor";
import {
  calculateRetrievalBenchmarkMetrics,
  getRetrievalBenchmarkProfile,
  retrievalBenchmarkObservationSchema,
  SPEC_229_RELEASE_CRITERIA,
  type RetrievalBenchmarkLatencyProfile,
  type RetrievalBenchmarkMetrics,
} from "./libraryRetrievalBenchmark";

const SPEC229_REPOSITORY_LICENSE_SHA256 =
  "e3884b252b3bfc045e55be43a34d1e80da070bc6f804ac95bf4660e97d62ebc6";

export const goldDatasetReviewSchema = z.object({
  reviewerId: z.string().min(1),
  reviewerVersion: z.string().min(1),
  reviewerType: z.enum(["agent", "human"]),
  // Optional because deterministic seed fixtures record reviewer identity and
  // version, but do not claim an exact event timestamp without a review log.
  recordedAt: z.string().datetime().optional(),
  decision: z.enum(["accept_candidate", "reject", "needs_adjudication"]),
  rationale: z.string().min(1),
});

export const goldDatasetControlExpectationSchema = z.object({
  controlId: z.string().min(1),
  kind: z.enum(["acl", "freshness", "lifecycle"]),
  targetEvidenceId: z.string().min(1),
  targetTenantId: z.string().min(1),
  callerTenantId: z.string().min(1),
  expectedVisibility: z.enum(["visible", "blocked"]),
  expectedLifecycle: z.enum(["active", "stale", "revoked", "deleted", "tombstoned"]),
  currentRevision: z.string().min(1).optional(),
  targetRevision: z.string().min(1).optional(),
  currentDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  targetDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  maxAgeSeconds: z.number().int().positive().optional(),
});

const releaseUseApprovalEvidenceSchema = z.discriminatedUnion("approverType", [
  z.object({
    approverType: z.literal("human"),
    approverId: z.string().min(1),
    approvedAt: z.string().datetime(),
    scope: z.string().min(1),
  }),
  z.object({
    approverType: z.literal("owner_delegated_policy"),
    policyId: z.literal("SPEC229_NONPRODUCTION_REPO_SOURCE"),
    policyVersion: z.literal(1),
    authorizationRef: z.literal("owner-directive:SPEC229_NONPRODUCTION_EVAL"),
    approvedAt: z.string().datetime(),
    sourcePath: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    repositoryLicenseSha256: z.literal(SPEC229_REPOSITORY_LICENSE_SHA256),
    scope: z.literal("non-production retrieval evaluation"),
  }),
]);

export const goldDatasetCandidateSchema = z.object({
  caseId: z.string().min(1),
  query: z.string().min(1),
  conversationContext: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(10_000),
  })).max(19).optional(),
  multiQueryVariants: z.array(z.string().min(1).max(1_000)).min(1).max(7).optional(),
  expectedAnswer: z.string().min(1),
  language: z.enum(["thai", "english", "mixed"]),
  classes: z.array(z.string().min(1)).min(1),
  sourceGroupId: z.string().min(1),
  split: z.enum(["development", "calibration", "held_out"]),
  useApproval: z.enum(["development_only", "release_approved"]),
  useApprovalEvidence: releaseUseApprovalEvidenceSchema.optional(),
  source: z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    quoteSha256: z.string().regex(/^[a-f0-9]{64}$/),
    license: z.string().min(1),
    allowedUseEvidence: z.string().min(1),
  }),
  generator: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    recordedAt: z.string().datetime().optional(),
  }),
  reviews: z.array(goldDatasetReviewSchema),
  disagreement: z
    .object({ present: z.boolean(), rationale: z.string().optional() })
    .default({ present: false }),
  adjudication: goldDatasetReviewSchema.optional(),
  benchmarkGold: z.object({
    tenantId: z.string().min(1),
    supportsAnswer: z.boolean(),
    requiredEvidenceIds: z.array(z.string()),
    requiredClaims: z.array(z.string()),
    minimumAuthorityRank: z.number().int().min(0),
    expectedRevision: z.string().optional(),
    shouldCite: z.boolean(),
    exactIdentifier: z.boolean().default(false),
    controlExpectations: z.array(goldDatasetControlExpectationSchema).optional(),
  }),
}).superRefine((candidate, context) => {
  const controls = candidate.benchmarkGold.controlExpectations ?? [];
  const controlIds = new Set<string>();
  for (const [index, control] of controls.entries()) {
    if (controlIds.has(control.controlId)) {
      context.addIssue({ code: "custom", path: ["benchmarkGold", "controlExpectations", index, "controlId"], message: "Control IDs must be unique within a candidate" });
    }
    controlIds.add(control.controlId);
    if (control.kind === "acl" && control.targetTenantId !== control.callerTenantId && control.expectedVisibility !== "blocked") {
      context.addIssue({ code: "custom", path: ["benchmarkGold", "controlExpectations", index, "expectedVisibility"], message: "Cross-tenant ACL controls must expect blocked visibility" });
    }
    if (["revoked", "deleted", "tombstoned", "stale"].includes(control.expectedLifecycle) && control.expectedVisibility !== "blocked") {
      context.addIssue({ code: "custom", path: ["benchmarkGold", "controlExpectations", index, "expectedVisibility"], message: "Stale and inactive lifecycle controls must expect blocked visibility" });
    }
    if (control.expectedLifecycle === "stale" && (!control.currentRevision || !control.targetRevision || control.currentRevision === control.targetRevision)) {
      context.addIssue({ code: "custom", path: ["benchmarkGold", "controlExpectations", index], message: "Stale controls require distinct current and target revisions" });
    }
    if (control.currentDigest && control.targetDigest && control.currentDigest === control.targetDigest && control.expectedLifecycle === "stale") {
      context.addIssue({ code: "custom", path: ["benchmarkGold", "controlExpectations", index], message: "Stale revision digests must differ when both are supplied" });
    }
  }
});

export type GoldDatasetCandidate = z.infer<typeof goldDatasetCandidateSchema>;

export const SPEC_229_REQUIRED_QUERY_CLASSES = Object.freeze([
  "thai",
  "english",
  "mixed",
  "semantic_paraphrase",
  "exact_id",
  "uuid",
  "error_code",
  "api_path",
  "filename",
  "spec_id",
  "follow_up",
  "ambiguous",
  "typo",
  "multi_hop",
  "stale_conflict",
  "no_answer",
  "acl_attack",
  "deleted_revoked",
  "ocr",
  "long_document",
  "code_config_log",
]);
export const SPEC_229_MIN_RELEASE_GOLD_QUERIES = 500;
export const SPEC_229_DEVELOPMENT_HELD_OUT_SPLIT_VERSION =
  "spec229-heldout-v1";
const SPEC_229_DEVELOPMENT_HELD_OUT_BUCKETS = 91;

/**
 * Builds a development-only, source-grouped held-out cohort under the
 * owner-delegated repository source-use policy. Existing review records are
 * preserved exactly; pending/rejected candidates do not count as gold.
 */
export function buildNonProductionReleaseCohort(
  candidates: GoldDatasetCandidate[],
  approvedAt: string,
): GoldDatasetCandidate[] {
  const approvalTime = new Date(approvedAt);
  if (!Number.isFinite(approvalTime.getTime())) {
    throw new Error("Owner source-use approval timestamp must be valid ISO time");
  }

  const cohort: GoldDatasetCandidate[] = candidates.map(candidate => {
    if (
      !candidate.source.license.startsWith("MIT (repository LICENSE") ||
      !/owner[\s-]+authorized/i.test(candidate.source.allowedUseEvidence) ||
      !/no tenant production/i.test(candidate.source.allowedUseEvidence)
    ) {
      throw new Error(
        `Source is outside the owner-delegated non-production policy: ${candidate.caseId}`
      );
    }
    const bucket = Number.parseInt(
      createHash("sha256")
        .update(`${candidate.sourceGroupId}|${SPEC_229_DEVELOPMENT_HELD_OUT_SPLIT_VERSION}`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) % 100;
    return {
      ...candidate,
      // Retrieval runners identify indexed repository documents by canonical
      // source path. Normalize singleton aliases only in the release cohort;
      // synthetic fixture IDs and the source candidate pool keep their own IDs.
      benchmarkGold: candidate.benchmarkGold.requiredEvidenceIds.length === 1
        ? {
            ...candidate.benchmarkGold,
            requiredEvidenceIds: [candidate.source.path],
          }
        : candidate.benchmarkGold,
      split: bucket < SPEC_229_DEVELOPMENT_HELD_OUT_BUCKETS
        ? "held_out" as const
        : "development" as const,
      useApproval: "release_approved" as const,
      useApprovalEvidence: {
        approverType: "owner_delegated_policy" as const,
        policyId: "SPEC229_NONPRODUCTION_REPO_SOURCE" as const,
        policyVersion: 1 as const,
        authorizationRef: "owner-directive:SPEC229_NONPRODUCTION_EVAL" as const,
        approvedAt: approvalTime.toISOString(),
        sourcePath: candidate.source.path,
        sourceSha256: candidate.source.sha256,
        repositoryLicenseSha256: SPEC229_REPOSITORY_LICENSE_SHA256,
        scope: "non-production retrieval evaluation" as const,
      },
    };
  });

  const eligibleHeldOut = cohort.filter(isHeldOutReleaseEvaluationEligible);
  if (eligibleHeldOut.length < SPEC_229_MIN_RELEASE_GOLD_QUERIES) {
    throw new Error(
      `Deterministic held-out split has ${eligibleHeldOut.length} eligible queries; ${SPEC_229_MIN_RELEASE_GOLD_QUERIES} required`
    );
  }
  const coveredClasses = new Set(
    eligibleHeldOut.flatMap(candidate => [candidate.language, ...candidate.classes]),
  );
  const missingClasses = SPEC_229_REQUIRED_QUERY_CLASSES.filter(
    queryClass => !coveredClasses.has(queryClass),
  );
  if (missingClasses.length > 0) {
    throw new Error(
      `Deterministic held-out split is missing required classes: ${missingClasses.join(", ")}`
    );
  }
  return cohort;
}

export function missingRequiredQueryClasses(
  candidates: GoldDatasetCandidate[]
): string[] {
  return SPEC_229_REQUIRED_QUERY_CLASSES.filter(
    category =>
      !candidates.some(candidate =>
        category === "thai" || category === "english" || category === "mixed"
          ? candidate.language === category
          : candidate.classes.includes(category)
      )
  );
}

export interface GoldDatasetCounts {
  candidateQueries: number;
  unreviewed: number;
  independentlyReviewed: number;
  machineReviewed: number;
  humanReviewed: number;
  humanAccepted: number;
  reviewAccepted: number;
  reviewDisagreements: number;
  adjudicated: number;
  acceptedForGold: number;
  pendingAdjudication: number;
  releaseApproved: number;
  humanSourceUseApproved: number;
  ownerDelegatedPolicySourceUseApproved: number;
  heldOutReleaseApproved: number;
  developmentOnly: number;
}

export function validateGoldDatasetSource(
  candidate: GoldDatasetCandidate,
  repositoryRoot: string
): string {
  const path = candidate.source.path;
  const root = realpathSync(repositoryRoot);
  const sourcePath = resolve(root, path);
  const lexicalRelative = relative(root, sourcePath);
  if (
    isAbsolute(lexicalRelative) ||
    lexicalRelative === ".." ||
    lexicalRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error(`Unsafe gold source path: ${path}`);
  }
  const realSourcePath = realpathSync(sourcePath);
  const withinRoot = relative(root, realSourcePath);
  if (
    isAbsolute(withinRoot) ||
    withinRoot === ".." ||
    withinRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error(`Unsafe gold source path: ${path}`);
  }
  const source = readFileSync(realSourcePath, "utf8");
  const canonical = normalizeCanonicalMarkdown(source);
  const sourceDigest = sha256(canonical);
  if (sourceDigest !== candidate.source.sha256)
    throw new Error(`Gold source digest mismatch: ${candidate.caseId}`);
  if (candidate.benchmarkGold.expectedRevision !== `sha256:${sourceDigest}`)
    throw new Error(`Gold source revision mismatch: ${candidate.caseId}`);
  const lines = canonical.split("\n");
  if (
    candidate.source.lineEnd < candidate.source.lineStart ||
    candidate.source.lineEnd > lines.length
  ) {
    throw new Error(`Gold source line range invalid: ${candidate.caseId}`);
  }
  const quote = lines
    .slice(candidate.source.lineStart - 1, candidate.source.lineEnd)
    .join("\n");
  if (sha256(quote) !== candidate.source.quoteSha256)
    throw new Error(`Gold source quote digest mismatch: ${candidate.caseId}`);
  return realSourcePath;
}

export function validateGoldDataset(
  candidates: GoldDatasetCandidate[],
  repositoryRoot?: string
): void {
  const parsed = candidates.map(item => goldDatasetCandidateSchema.parse(item));
  if (new Set(parsed.map(item => item.caseId)).size !== parsed.length)
    throw new Error("Gold dataset caseId values must be unique");
  const groups = new Map<string, Set<string>>();
  const canonicalSourceGroups = new Map<
    string,
    { groupId: string; split: string }
  >();
  const normalizedQueries = new Set<string>();
  const claimSplits = new Map<string, string>();
  for (const item of parsed) {
    if (
      item.useApproval === "release_approved" &&
      !isSourceUseApprovalValid(item)
    ) {
      throw new Error(
        `Release-approved source requires auditable source-use approval evidence: ${item.caseId}`
      );
    }
    if (item.useApprovalEvidence?.approverType === "owner_delegated_policy") {
      if (!repositoryRoot) {
        throw new Error(
          `Owner-delegated source-use approval requires repository source verification: ${item.caseId}`
        );
      }
      const licensePath = resolve(realpathSync(repositoryRoot), "LICENSE");
      const licenseContent = readFileSync(licensePath, "utf8");
      if (
        !licenseContent.startsWith("MIT License") ||
        sha256(licenseContent) !==
          item.useApprovalEvidence.repositoryLicenseSha256
      ) {
        throw new Error(
          `Owner-delegated source-use approval requires the pinned repository MIT license: ${item.caseId}`
        );
      }
    }
    if (item.sourceGroupId !== item.source.path) {
      throw new Error(
        `sourceGroupId must bind to canonical source identity/path: ${item.caseId}`
      );
    }
    const splits = groups.get(item.sourceGroupId) ?? new Set<string>();
    splits.add(item.split);
    groups.set(item.sourceGroupId, splits);
    const normalizedQuery = item.query
      .normalize("NFC")
      .trim()
      .toLocaleLowerCase();
    if (normalizedQueries.has(normalizedQuery))
      throw new Error(
        `Duplicate normalized query inflates dataset: ${item.caseId}`
      );
    normalizedQueries.add(normalizedQuery);
    for (const claim of item.benchmarkGold.requiredClaims) {
      const previousClaimSplit = claimSplits.get(claim);
      if (previousClaimSplit && previousClaimSplit !== item.split)
        throw new Error(`Gold claim crosses dataset splits: ${claim}`);
      claimSplits.set(claim, item.split);
    }
    if (repositoryRoot) {
      const canonicalIdentity = validateGoldDatasetSource(item, repositoryRoot);
      const previous = canonicalSourceGroups.get(canonicalIdentity);
      if (
        previous &&
        (previous.groupId !== item.sourceGroupId ||
          previous.split !== item.split)
      ) {
        throw new Error(
          `Canonical source crosses groups or dataset splits: ${item.caseId}`
        );
      }
      canonicalSourceGroups.set(canonicalIdentity, {
        groupId: item.sourceGroupId,
        split: item.split,
      });
    }
    for (const review of item.reviews) {
      if (review.reviewerId === item.generator.id)
        throw new Error(
          `Generator cannot independently review its candidate: ${item.caseId}`
        );
    }
    if (
      item.adjudication &&
      [
        item.generator.id,
        ...item.reviews.map(review => review.reviewerId),
      ].includes(item.adjudication.reviewerId)
    ) {
      throw new Error(
        `Adjudication must be performed by an independent reviewer: ${item.caseId}`
      );
    }
    const decisions = item.reviews.map(review => review.decision);
    const disagreement =
      decisions.includes("reject") && decisions.includes("accept_candidate");
    if (disagreement && !item.disagreement.present)
      throw new Error(`Reviewer disagreement must be recorded: ${item.caseId}`);
    if (
      (disagreement || decisions.includes("needs_adjudication")) &&
      !item.adjudication
    ) {
      // Lack of adjudication remains an explicit pending state, not an invalid record.
      continue;
    }
  }
  // A source group is kept in one split to prevent query leakage across evaluation partitions.
  for (const [sourceGroupId, splits] of groups) {
    if (splits.size > 1)
      throw new Error(`Source group crosses dataset splits: ${sourceGroupId}`);
  }
}

function reviewState(
  item: GoldDatasetCandidate
): "unreviewed" | "pending" | "accepted" | "rejected" {
  if (!item.reviews.length) return "unreviewed";
  if (item.adjudication) {
    if (item.adjudication.decision === "needs_adjudication") return "pending";
    return item.adjudication.decision === "accept_candidate"
      ? "accepted"
      : "rejected";
  }
  const latestByReviewer = new Map<string, (typeof item.reviews)[number]>();
  for (const review of item.reviews) {
    const previous = latestByReviewer.get(review.reviewerId);
    if (
      !previous ||
      !previous.recordedAt ||
      (review.recordedAt ?? "") > previous.recordedAt
    )
      latestByReviewer.set(review.reviewerId, review);
  }
  const decisions = [...latestByReviewer.values()].map(
    review => review.decision
  );
  const disagreement =
    decisions.includes("reject") && decisions.includes("accept_candidate");
  if (decisions.includes("needs_adjudication") || disagreement)
    return "pending";
  return decisions.every(decision => decision === "accept_candidate")
    ? "accepted"
    : "rejected";
}

export function isReviewAccepted(item: GoldDatasetCandidate): boolean {
  return reviewState(item) === "accepted";
}

export function isReleaseEvaluationEligible(
  item: GoldDatasetCandidate
): boolean {
  return (
    reviewState(item) === "accepted" &&
    item.useApproval === "release_approved" &&
    isSourceUseApprovalValid(item) &&
    Boolean(item.benchmarkGold.expectedRevision)
  );
}

function isSourceUseApprovalValid(item: GoldDatasetCandidate): boolean {
  const approval = item.useApprovalEvidence;
  if (!approval) return false;
  if (approval.approverType === "human") return true;
  return (
    approval.policyId === "SPEC229_NONPRODUCTION_REPO_SOURCE" &&
    approval.policyVersion === 1 &&
    approval.authorizationRef ===
      "owner-directive:SPEC229_NONPRODUCTION_EVAL" &&
    approval.scope === "non-production retrieval evaluation" &&
    approval.sourcePath === item.source.path &&
    approval.sourceSha256 === item.source.sha256 &&
    approval.repositoryLicenseSha256 ===
      SPEC229_REPOSITORY_LICENSE_SHA256 &&
    item.source.license.startsWith("MIT (repository LICENSE") &&
    /owner[\s-]+authorized/i.test(item.source.allowedUseEvidence) &&
    /no tenant production/i.test(item.source.allowedUseEvidence)
  );
}

export function isHeldOutReleaseEvaluationEligible(
  item: GoldDatasetCandidate
): boolean {
  return item.split === "held_out" && isReleaseEvaluationEligible(item);
}

export function buildGoldDatasetReviewQueue(
  candidates: GoldDatasetCandidate[]
) {
  return {
    schemaVersion: "spec229-independent-review-queue-v2" as const,
    instructions: {
      candidateReview:
        "Record an independent human or agent review with the actual reviewerType, identity, version, timestamp, and rationale; the reviewer must differ from the generator. Machine review is never human review.",
      adjudication:
        "When reviewers disagree or request adjudication, record an independent human or agent adjudication with actual reviewerType; the adjudicator must differ from the query generator and prior reviewers.",
      sourceUseApproval:
        "Record source/use approval separately from answer review. Use the versioned owner-delegated policy only for eligible repository MIT sources in non-production evaluation; never infer source-use approval from a candidate review.",
    },
    entries: candidates
      .map(item => ({
        caseId: item.caseId,
        query: item.query,
        conversationContext: item.conversationContext ?? null,
        multiQueryVariants: item.multiQueryVariants ?? [],
        expectedAnswer: item.expectedAnswer,
        language: item.language,
        classes: [...item.classes].sort(),
        split: item.split,
        sourceGroupId: item.sourceGroupId,
        source: item.source,
        expectedEvidence: item.benchmarkGold,
        machineReviews: item.reviews.filter(
          review => review.reviewerType === "agent"
        ),
        humanReviews: item.reviews.filter(
          review => review.reviewerType === "human"
        ),
        disagreement: item.disagreement,
        adjudication: item.adjudication ?? null,
        humanReviewStatus:
          reviewState(item) === "accepted" && hasFinalHumanAcceptance(item)
            ? "HUMAN_ACCEPTED"
            : reviewState(item) === "rejected" &&
                item.reviews.some(
                  review =>
                    review.reviewerType === "human" &&
                    review.decision === "reject"
                )
              ? "HUMAN_REJECTED"
              : "PENDING_HUMAN_REVIEW",
        sourceUseApprovalStatus:
          item.useApproval === "release_approved" && item.useApprovalEvidence
            ? "OWNER_APPROVED"
            : "PENDING_OWNER_SOURCE_USE_APPROVAL",
        sourceUseApprovalEvidence: item.useApprovalEvidence ?? null,
      }))
      .sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
}

export function isReleaseCohortReady(counts: GoldDatasetCounts): boolean {
  return (
    counts.acceptedForGold >= SPEC_229_MIN_RELEASE_GOLD_QUERIES &&
    counts.releaseApproved >= SPEC_229_MIN_RELEASE_GOLD_QUERIES &&
    counts.heldOutReleaseApproved >= SPEC_229_MIN_RELEASE_GOLD_QUERIES
  );
}

function hasFinalHumanAcceptance(item: GoldDatasetCandidate): boolean {
  if (item.adjudication?.reviewerType === "human")
    return item.adjudication.decision === "accept_candidate";
  const latestHumanReviews = new Map<string, (typeof item.reviews)[number]>();
  for (const review of item.reviews.filter(
    entry => entry.reviewerType === "human"
  )) {
    const previous = latestHumanReviews.get(review.reviewerId);
    if (
      !previous ||
      !previous.recordedAt ||
      (review.recordedAt ?? "") > previous.recordedAt
    )
      latestHumanReviews.set(review.reviewerId, review);
  }
  return [...latestHumanReviews.values()].some(
    review => review.decision === "accept_candidate"
  );
}

export function countGoldDataset(
  candidates: GoldDatasetCandidate[]
): GoldDatasetCounts {
  const accepted = candidates.filter(item => reviewState(item) === "accepted");
  const goldEligible = accepted.filter(isReleaseEvaluationEligible);
  return {
    candidateQueries: candidates.length,
    unreviewed: candidates.filter(item => item.reviews.length === 0).length,
    independentlyReviewed: candidates.filter(item =>
      item.reviews.some(review => review.reviewerId !== item.generator.id)
    ).length,
    machineReviewed: candidates.filter(item =>
      item.reviews.some(review => review.reviewerType === "agent")
    ).length,
    humanReviewed: candidates.filter(item =>
      item.reviews.some(review => review.reviewerType === "human")
    ).length,
    humanAccepted: candidates.filter(
      item => reviewState(item) === "accepted" && hasFinalHumanAcceptance(item)
    ).length,
    reviewAccepted: accepted.length,
    reviewDisagreements: candidates.filter(item => item.disagreement.present)
      .length,
    adjudicated: candidates.filter(item => Boolean(item.adjudication)).length,
    acceptedForGold: goldEligible.length,
    pendingAdjudication: candidates.filter(
      item => reviewState(item) === "pending"
    ).length,
    releaseApproved: goldEligible.length,
    humanSourceUseApproved: candidates.filter(
      item =>
        item.useApprovalEvidence?.approverType === "human" &&
        isSourceUseApprovalValid(item)
    ).length,
    ownerDelegatedPolicySourceUseApproved: candidates.filter(
      item =>
        item.useApprovalEvidence?.approverType === "owner_delegated_policy" &&
        isSourceUseApprovalValid(item)
    ).length,
    heldOutReleaseApproved: goldEligible.filter(
      item => item.split === "held_out"
    ).length,
    developmentOnly: candidates.filter(
      item => item.useApproval === "development_only"
    ).length,
  };
}

export function assignDeterministicSplits<T extends { sourceGroupId: string }>(
  candidates: T[],
  ratios: { development: number; calibration: number; held_out: number } = {
    development: 70,
    calibration: 15,
    held_out: 15,
  }
): Array<T & { split: "development" | "calibration" | "held_out" }> {
  const total = ratios.development + ratios.calibration + ratios.held_out;
  if (Object.values(ratios).some(value => value < 0) || total <= 0)
    throw new Error(
      "Split ratios must be non-negative and have a positive total"
    );
  const groupSplit = new Map<
    string,
    "development" | "calibration" | "held_out"
  >();
  for (const group of [
    ...new Set(candidates.map(candidate => candidate.sourceGroupId)),
  ].sort()) {
    const bucket =
      (Number.parseInt(sha256(`spec229-split-v1:${group}`).slice(0, 8), 16) /
        0xffffffff) *
      total;
    const split =
      bucket < ratios.development
        ? "development"
        : bucket < ratios.development + ratios.calibration
          ? "calibration"
          : "held_out";
    groupSplit.set(group, split);
  }
  return candidates.map(candidate => ({
    ...candidate,
    split: groupSplit.get(candidate.sourceGroupId)!,
  }));
}

export function deterministicStratifiedSample<
  T extends { caseId: string; classes: string[] },
>(candidates: T[], perClassLimit: number): T[] {
  if (!Number.isInteger(perClassLimit) || perClassLimit < 1)
    throw new Error("perClassLimit must be a positive integer");
  const selected = new Map<string, T>();
  const classes = [
    ...new Set(candidates.flatMap(candidate => candidate.classes)),
  ].sort();
  for (const category of classes) {
    const ranked = candidates
      .filter(candidate => candidate.classes.includes(category))
      .sort((left, right) =>
        sha256(`${category}:${left.caseId}`).localeCompare(
          sha256(`${category}:${right.caseId}`)
        )
      );
    ranked
      .slice(0, perClassLimit)
      .forEach(candidate => selected.set(candidate.caseId, candidate));
  }
  return [...selected.values()].sort((left, right) =>
    left.caseId.localeCompare(right.caseId)
  );
}

export function wilson95(
  successes: number,
  count: number
): { lower: number; upper: number } | null {
  if (count < 1 || successes < 0 || successes > count) return null;
  const z = 1.959963984540054;
  const p = successes / count;
  const denominator = 1 + (z * z) / count;
  const center = (p + (z * z) / (2 * count)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * count)) / count)) /
    denominator;
  return {
    lower: Number(Math.max(0, center - margin).toFixed(6)),
    upper: Number(Math.min(1, center + margin).toFixed(6)),
  };
}

export function bootstrapMean95(
  values: number[],
  seed: string,
  replicates = 1000
): { lower: number; upper: number } | null {
  if (values.length < 30 || !Number.isInteger(replicates) || replicates < 100)
    return null;
  let state = Number.parseInt(sha256(seed).slice(0, 8), 16) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  const means = Array.from({ length: replicates }, () => {
    let total = 0;
    for (let index = 0; index < values.length; index += 1)
      total += values[Math.floor(random() * values.length)];
    return total / values.length;
  }).sort((left, right) => left - right);
  return {
    lower: Number(means[Math.floor(replicates * 0.025)].toFixed(6)),
    upper: Number(
      means[Math.min(replicates - 1, Math.floor(replicates * 0.975))].toFixed(6)
    ),
  };
}

export function evaluateGoldDataset(
  candidates: GoldDatasetCandidate[],
  observations: unknown[] | undefined,
  latencyRuns?: Partial<Record<RetrievalBenchmarkLatencyProfile, unknown[]>>
): {
  counts: GoldDatasetCounts;
  metrics: RetrievalBenchmarkMetrics | null;
  releaseStatus: "PASS" | "FAIL" | "NOT_EVALUABLE";
  releaseCriteria: Array<{
    id: string;
    threshold: string;
    value: number | null;
    status: "PASS" | "FAIL" | "NOT_EVALUABLE";
  }>;
} {
  const counts = countGoldDataset(candidates);
  if (!observations) {
    return {
      counts,
      metrics: null,
      releaseStatus: "NOT_EVALUABLE",
      releaseCriteria: notEvaluableReleaseCriteria(),
    };
  }
  const heldOutGold = candidates.filter(isHeldOutReleaseEvaluationEligible);
  const releaseCohortReady = isReleaseCohortReady(counts);
  const reviewedCases = releaseCohortReady
    ? heldOutGold
    : candidates.filter(item => reviewState(item) === "accepted");
  if (reviewedCases.length === 0) {
    return {
      counts,
      metrics: null,
      releaseStatus: "NOT_EVALUABLE",
      releaseCriteria: notEvaluableReleaseCriteria(),
    };
  }
  const rows = retrievalBenchmarkObservationSchema.array().parse(observations);
  const profile = getRetrievalBenchmarkProfile(rows);
  const cases = reviewedCases.map(item => ({
    caseId: item.caseId,
    query: item.query,
    ...item.benchmarkGold,
    language: item.language,
    gradedRelevantEvidence: [],
  }));
  const metrics = calculateRetrievalBenchmarkMetrics(cases, rows);
  const latencyP95ForProfile = (
    expectedProfile: RetrievalBenchmarkLatencyProfile
  ): number | null => {
    if (latencyRuns !== undefined) {
      const suppliedRun = latencyRuns[expectedProfile];
      if (!suppliedRun) return null;
      const profileRows = retrievalBenchmarkObservationSchema
        .array()
        .parse(suppliedRun);
      const latencyRunProfile = getRetrievalBenchmarkProfile(profileRows);
      const expectedCaseIds = new Set(cases.map(item => item.caseId));
      const observedCaseIds = new Set(profileRows.map(row => row.caseId));
      if (
        latencyRunProfile.latencyProfile !== expectedProfile ||
        profileRows.length !== cases.length ||
        observedCaseIds.size !== expectedCaseIds.size ||
        [...expectedCaseIds].some(caseId => !observedCaseIds.has(caseId)) ||
        profileRows.some(row => row.latencyMs === undefined)
      ) {
        return null;
      }
      const profileMetrics = calculateRetrievalBenchmarkMetrics(
        cases,
        profileRows
      );
      return profileMetrics.p95LatencyMs;
    }
    if (
      profile.latencyProfile !== expectedProfile ||
      rows.some(row => row.latencyMs === undefined)
    ) {
      return null;
    }
    return metrics.p95LatencyMs;
  };
  const simpleExactKeywordP95 = latencyP95ForProfile("simple_exact_keyword");
  const hybridRerankP95 = latencyP95ForProfile("hybrid_rerank");
  const rewriteHybridRerankP95 = latencyP95ForProfile("rewrite_hybrid_rerank");
  if (!releaseCohortReady) {
    return {
      counts,
      metrics,
      releaseStatus: "NOT_EVALUABLE",
      releaseCriteria: [
        ...notEvaluableReleaseCriteria(),
        {
          id: "heldOutGoldQueryCount",
          threshold: `>= ${SPEC_229_MIN_RELEASE_GOLD_QUERIES}`,
          value: heldOutGold.length,
          status: "NOT_EVALUABLE",
        },
      ],
    };
  }
  const missingClasses = missingRequiredQueryClasses(heldOutGold);
  if (missingClasses.length > 0) {
    return {
      counts,
      metrics: null,
      releaseStatus: "NOT_EVALUABLE",
      releaseCriteria: [
        ...notEvaluableReleaseCriteria(),
        {
          id: "requiredQueryClasses",
          threshold: "SPEC §27.1 classes represented",
          value: missingClasses.length,
          status: "NOT_EVALUABLE",
        },
      ],
    };
  }
  const gold = heldOutGold;
  const values: Array<{
    id: string;
    threshold: string;
    value: number | null;
    pass: boolean | null;
  }> = [
    {
      id: "crossTenantLeakage",
      threshold: "= 0",
      value: metrics.crossTenantLeakage,
      pass: metrics.aclControlCoverage === null || !metrics.securityControlsComplete
        ? null
        : metrics.crossTenantLeakage === 0 && metrics.aclControlCoverage === 1,
    },
    {
      id: "unauthorizedEvidenceLeakage",
      threshold: "= 0",
      value: metrics.unauthorizedEvidenceLeakage,
      pass: metrics.aclControlCoverage === null || !metrics.securityControlsComplete
        ? null
        : metrics.unauthorizedEvidenceLeakage === 0 && metrics.aclControlCoverage === 1,
    },
    {
      id: "exactIdentifierHitAt5",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.exactIdentifierHitAt5}`,
      value: metrics.exactIdentifierHitAt5,
      pass: atLeast(
        metrics.exactIdentifierHitAt5,
        SPEC_229_RELEASE_CRITERIA.exactIdentifierHitAt5
      ),
    },
    {
      id: "overallRecallAt20",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.overallRecallAt20}`,
      value: metrics.recallAt20,
      pass: atLeast(
        metrics.recallAt20,
        SPEC_229_RELEASE_CRITERIA.overallRecallAt20
      ),
    },
    {
      id: "thaiRecallAt20",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.thaiRecallAt20}`,
      value: metrics.thaiRecallAt20,
      pass: atLeast(
        metrics.thaiRecallAt20,
        SPEC_229_RELEASE_CRITERIA.thaiRecallAt20
      ),
    },
    {
      id: "englishRecallAt20",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.englishRecallAt20}`,
      value: metrics.englishRecallAt20,
      pass: atLeast(
        metrics.englishRecallAt20,
        SPEC_229_RELEASE_CRITERIA.englishRecallAt20
      ),
    },
    {
      id: "nDCGAt10",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.nDCGAt10}`,
      value: metrics.nDCGAt10,
      pass: atLeast(metrics.nDCGAt10, SPEC_229_RELEASE_CRITERIA.nDCGAt10),
    },
    {
      id: "mrrAt10",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.mrrAt10}`,
      value: metrics.mrrAt10,
      pass: atLeast(metrics.mrrAt10, SPEC_229_RELEASE_CRITERIA.mrrAt10),
    },
    {
      id: "citationPrecision",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.citationPrecision}`,
      value: metrics.citationPrecision,
      pass: atLeast(
        metrics.citationPrecision,
        SPEC_229_RELEASE_CRITERIA.citationPrecision
      ),
    },
    {
      id: "freshnessCorrectness",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.freshnessCorrectness}`,
      value: metrics.freshnessCorrectness,
      pass: metrics.freshnessControlCoverage === null || !metrics.securityControlsComplete
        ? null
        : metrics.freshnessControlCoverage === 1 && atLeast(
            metrics.freshnessCorrectness,
            SPEC_229_RELEASE_CRITERIA.freshnessCorrectness
          ),
    },
    {
      id: "noAnswerPrecision",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.noAnswerPrecision}`,
      value: metrics.noAnswerPrecision,
      pass: atLeast(
        metrics.noAnswerPrecision,
        SPEC_229_RELEASE_CRITERIA.noAnswerPrecision
      ),
    },
    {
      id: "noAnswerRecall",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.noAnswerRecall}`,
      value: metrics.noAnswerRecall,
      pass: atLeast(
        metrics.noAnswerRecall,
        SPEC_229_RELEASE_CRITERIA.noAnswerRecall
      ),
    },
    {
      id: "simpleExactKeywordP95Ms",
      threshold: `<= ${SPEC_229_RELEASE_CRITERIA.simpleExactKeywordP95Ms}ms`,
      value: simpleExactKeywordP95,
      pass:
        simpleExactKeywordP95 === null
          ? null
          : simpleExactKeywordP95 <=
            SPEC_229_RELEASE_CRITERIA.simpleExactKeywordP95Ms,
    },
    {
      id: "hybridRerankP95Ms",
      threshold: `<= ${SPEC_229_RELEASE_CRITERIA.hybridRerankP95Ms}ms`,
      value: hybridRerankP95,
      pass:
        hybridRerankP95 === null
          ? null
          : hybridRerankP95 <= SPEC_229_RELEASE_CRITERIA.hybridRerankP95Ms,
    },
    {
      id: "rewriteHybridRerankP95Ms",
      threshold: `<= ${SPEC_229_RELEASE_CRITERIA.rewriteHybridRerankP95Ms}ms`,
      value: rewriteHybridRerankP95,
      pass:
        rewriteHybridRerankP95 === null
          ? null
          : rewriteHybridRerankP95 <=
            SPEC_229_RELEASE_CRITERIA.rewriteHybridRerankP95Ms,
    },
  ];
  const releaseCriteria = values.map(value => ({
    id: value.id,
    threshold: value.threshold,
    value: value.value,
    status:
      value.pass === null
        ? ("NOT_EVALUABLE" as const)
        : value.pass
          ? ("PASS" as const)
          : ("FAIL" as const),
  }));
  const releaseStatus = values.some(value => value.pass === null)
    ? "NOT_EVALUABLE"
    : values.some(value => value.pass === false)
      ? "FAIL"
      : "PASS";
  return { counts, metrics, releaseStatus, releaseCriteria };
}

function notEvaluableReleaseCriteria(): Array<{
  id: string;
  threshold: string;
  value: number | null;
  status: "NOT_EVALUABLE";
}> {
  return [
    {
      id: "crossTenantLeakage",
      threshold: "= 0",
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "unauthorizedEvidenceLeakage",
      threshold: "= 0",
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "exactIdentifierHitAt5",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.exactIdentifierHitAt5}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "overallRecallAt20",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.overallRecallAt20}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "thaiRecallAt20",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.thaiRecallAt20}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "englishRecallAt20",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.englishRecallAt20}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "nDCGAt10",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.nDCGAt10}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "mrrAt10",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.mrrAt10}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "citationPrecision",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.citationPrecision}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "freshnessCorrectness",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.freshnessCorrectness}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "noAnswerPrecision",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.noAnswerPrecision}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "noAnswerRecall",
      threshold: `>= ${SPEC_229_RELEASE_CRITERIA.noAnswerRecall}`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "simpleExactKeywordP95Ms",
      threshold: `<= ${SPEC_229_RELEASE_CRITERIA.simpleExactKeywordP95Ms}ms`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "hybridRerankP95Ms",
      threshold: `<= ${SPEC_229_RELEASE_CRITERIA.hybridRerankP95Ms}ms`,
      value: null,
      status: "NOT_EVALUABLE",
    },
    {
      id: "rewriteHybridRerankP95Ms",
      threshold: `<= ${SPEC_229_RELEASE_CRITERIA.rewriteHybridRerankP95Ms}ms`,
      value: null,
      status: "NOT_EVALUABLE",
    },
  ];
}

function atLeast(value: number | null, threshold: number): boolean | null {
  return value === null ? null : value >= threshold;
}
