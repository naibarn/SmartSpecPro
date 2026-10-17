import { z } from "zod";
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

export const goldDatasetCandidateSchema = z.object({
  caseId: z.string().min(1),
  query: z.string().min(1),
  expectedAnswer: z.string().min(1),
  language: z.enum(["thai", "english", "mixed"]),
  classes: z.array(z.string().min(1)).min(1),
  sourceGroupId: z.string().min(1),
  split: z.enum(["development", "calibration", "held_out"]),
  useApproval: z.enum(["development_only", "release_approved"]),
  useApprovalEvidence: z
    .object({
      approverId: z.string().min(1),
      approverType: z.literal("human"),
      approvedAt: z.string().datetime(),
      scope: z.string().min(1),
    })
    .optional(),
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
  }),
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
  if (sha256(canonical) !== candidate.source.sha256)
    throw new Error(`Gold source digest mismatch: ${candidate.caseId}`);
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
    if (item.useApproval === "release_approved" && !item.useApprovalEvidence) {
      throw new Error(
        `Release-approved source requires human use-approval evidence: ${item.caseId}`
      );
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
    Boolean(item.useApprovalEvidence) &&
    Boolean(item.benchmarkGold.expectedRevision)
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
    schemaVersion: "spec229-human-review-queue-v1" as const,
    instructions: {
      candidateReview:
        "Record a human review with accept_candidate, reject, or needs_adjudication; include reviewer identity, version, timestamp, and rationale.",
      adjudication:
        "When reviewers disagree or request adjudication, record an adjudication by a reviewer who is neither the query generator nor a prior reviewer.",
      sourceUseApproval:
        "Record owner source/use approval separately from answer review; never infer it from a candidate review.",
    },
    entries: candidates
      .map(item => ({
        caseId: item.caseId,
        query: item.query,
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
      pass: metrics.crossTenantLeakage === 0,
    },
    {
      id: "unauthorizedEvidenceLeakage",
      threshold: "= 0",
      value: metrics.unauthorizedEvidenceLeakage,
      pass: metrics.unauthorizedEvidenceLeakage === 0,
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
      pass: atLeast(
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
