import { z } from "zod";
import { normalizeCanonicalMarkdown, sha256 } from "./libraryCitationAnchor";

export const retrievalBenchmarkGoldCaseSchema = z.object({
  caseId: z.string().min(1),
  query: z.string().min(1),
  tenantId: z.string().min(1),
  supportsAnswer: z.boolean(),
  requiredEvidenceIds: z.array(z.string()),
  requiredClaims: z.array(z.string()),
  minimumAuthorityRank: z.number().int().min(0),
  expectedRevision: z.string().optional(),
  shouldCite: z.boolean(),
  language: z.enum(["thai", "english", "mixed"]).optional(),
  exactIdentifier: z.boolean().default(false),
  gradedRelevantEvidence: z
    .array(z.object({ id: z.string(), relevance: z.number().min(0) }))
    .default([]),
});

export const RETRIEVAL_BENCHMARK_LATENCY_PROFILES = [
  "simple_exact_keyword",
  "hybrid_rerank",
  "rewrite_hybrid_rerank",
] as const;
export const RETRIEVAL_BENCHMARK_COMPARISON_PROFILES = [
  "legacy_baseline",
  "vectorize_dense",
  "ai_search_bm25",
  "ai_search_vector",
  "hybrid_rrf",
  "hybrid_reranker",
  "conditional_rewrite",
  "multi_query",
] as const;
export type RetrievalBenchmarkComparisonProfile =
  (typeof RETRIEVAL_BENCHMARK_COMPARISON_PROFILES)[number];
export type RetrievalBenchmarkLatencyProfile =
  (typeof RETRIEVAL_BENCHMARK_LATENCY_PROFILES)[number];

export const retrievalBenchmarkObservationSchema = z.object({
  caseId: z.string().min(1),
  // Optional for backward compatibility with existing observation fixtures.
  // Each benchmark run may identify one §27 comparison arm and one latency gate.
  comparisonProfile: z.enum(RETRIEVAL_BENCHMARK_COMPARISON_PROFILES).optional(),
  latencyProfile: z.enum(RETRIEVAL_BENCHMARK_LATENCY_PROFILES).optional(),
  answerSupported: z.boolean(),
  coveredClaims: z.array(z.string()),
  evidence: z.array(
    z.object({
      evidenceId: z.string(),
      tenantId: z.string(),
      revision: z.string(),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      authorityRank: z.number().int().min(0),
      authorized: z.boolean(),
      revoked: z.boolean().default(false),
      deleted: z.boolean().default(false),
    })
  ),
  citations: z.array(
    z.object({
      evidenceId: z.string(),
      revision: z.string(),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      lineStart: z.number().int().positive(),
      lineEnd: z.number().int().positive(),
      quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
      markdown: z.string(),
    })
  ),
  providerState: z.enum(["complete", "partial", "outage"]),
  latencyMs: z.number().nonnegative().optional(),
  costMicros: z.number().nonnegative().optional(),
});

export type RetrievalBenchmarkGoldCase = z.infer<
  typeof retrievalBenchmarkGoldCaseSchema
>;
export type RetrievalBenchmarkObservation = z.infer<
  typeof retrievalBenchmarkObservationSchema
>;

export interface RetrievalBenchmarkProfile {
  comparisonProfile: RetrievalBenchmarkObservation["comparisonProfile"] | null;
  latencyProfile: RetrievalBenchmarkObservation["latencyProfile"] | null;
}

export function getRetrievalBenchmarkProfile(
  observations: RetrievalBenchmarkObservation[]
): RetrievalBenchmarkProfile {
  const comparisonProfiles = new Set(
    observations.map(row => row.comparisonProfile ?? null)
  );
  const latencyProfiles = new Set(
    observations.map(row => row.latencyProfile ?? null)
  );
  if (comparisonProfiles.size > 1)
    throw new Error(
      "Benchmark observations must use one comparison profile per run"
    );
  if (latencyProfiles.size > 1)
    throw new Error(
      "Benchmark observations must use one latency profile per run"
    );
  return {
    comparisonProfile: observations[0]?.comparisonProfile ?? null,
    latencyProfile: observations[0]?.latencyProfile ?? null,
  };
}

export interface RetrievalBenchmarkMetrics {
  caseCount: number;
  evidenceRecall: number | null;
  recallAt5: number | null;
  recallAt10: number | null;
  recallAt20: number | null;
  recallAt50: number | null;
  hitAt5: number | null;
  hitAt10: number | null;
  hitAt20: number | null;
  hitAt50: number | null;
  mrrAt10: number | null;
  nDCGAt10: number | null;
  exactIdentifierHitAt5: number | null;
  thaiRecallAt20: number | null;
  englishRecallAt20: number | null;
  mixedRecallAt20: number | null;
  evidenceCoverage: number;
  citationPrecision: number | null;
  citationAvailability: number | null;
  freshnessCorrectness: number;
  authorityCorrectness: number;
  aclLeakage: number;
  crossTenantLeakage: number;
  unauthorizedEvidenceLeakage: number;
  unsafePartialOrOutageAnswers: number;
  staleOrRevokedEvidenceAccepted: number;
  noAnswerPrecision: number | null;
  noAnswerRecall: number | null;
  partialOrOutageResults: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  meanCostMicros: number | null;
}

export function isCitationValid(
  citation: RetrievalBenchmarkObservation["citations"][number],
  evidence: RetrievalBenchmarkObservation["evidence"][number] | undefined
): boolean {
  if (
    !evidence ||
    citation.revision !== evidence.revision ||
    citation.digest !== evidence.digest
  )
    return false;
  const markdown = normalizeCanonicalMarkdown(citation.markdown);
  if (sha256(markdown) !== citation.digest) return false;
  const lines = markdown.split("\n");
  if (citation.lineEnd < citation.lineStart || citation.lineEnd > lines.length)
    return false;
  const quote = lines
    .slice(citation.lineStart - 1, citation.lineEnd)
    .join("\n");
  return sha256(quote) === citation.quoteHash;
}

export function calculateRetrievalBenchmarkMetrics(
  cases: RetrievalBenchmarkGoldCase[],
  observations: RetrievalBenchmarkObservation[]
): RetrievalBenchmarkMetrics {
  if (cases.length !== observations.length)
    throw new Error("Benchmark case/observation count mismatch");
  const observationsByCaseId = new Map(
    observations.map(observation => [observation.caseId, observation])
  );
  if (
    observationsByCaseId.size !== observations.length ||
    cases.some(item => !observationsByCaseId.has(item.caseId))
  ) {
    throw new Error(
      "Benchmark observations must contain each gold caseId exactly once"
    );
  }
  let relevantTotal = 0;
  let relevantRecovered = 0;
  const perKRecall = new Map<number, number[]>();
  const perKHit = new Map<number, number[]>();
  for (const k of [5, 10, 20, 50]) {
    perKRecall.set(k, []);
    perKHit.set(k, []);
  }
  const reciprocalRanks: number[] = [];
  const ndcgs: number[] = [];
  const exactIdentifierHits: number[] = [];
  const languageRecall = new Map<string, number[]>();
  let requiredClaimTotal = 0;
  let coveredClaimTotal = 0;
  let citationsTotal = 0;
  let citationsValid = 0;
  let citationRequiredCases = 0;
  let citationAvailableCases = 0;
  let freshnessTotal = 0;
  let freshnessCorrect = 0;
  let authorityTotal = 0;
  let authorityCorrect = 0;
  let aclLeakage = 0;
  let crossTenantLeakage = 0;
  let unauthorizedEvidenceLeakage = 0;
  let unsafePartialOrOutageAnswers = 0;
  let staleAccepted = 0;
  let noAnswerTruePositive = 0;
  let noAnswerFalsePositive = 0;
  let noAnswerFalseNegative = 0;
  let noAnswerCases = 0;
  let partialOrOutageResults = 0;
  const latencies: number[] = [];
  const costs: number[] = [];

  for (let index = 0; index < cases.length; index += 1) {
    const gold = retrievalBenchmarkGoldCaseSchema.parse(cases[index]);
    const observed = retrievalBenchmarkObservationSchema.parse(
      observationsByCaseId.get(gold.caseId)
    );
    const evidenceById = new Map(
      observed.evidence.map(item => [item.evidenceId, item])
    );
    const relevantIds =
      gold.gradedRelevantEvidence.length > 0
        ? gold.gradedRelevantEvidence
            .filter(item => item.relevance > 0)
            .map(item => item.id)
        : gold.requiredEvidenceIds;
    const rankedIds = observed.evidence.map(item => item.evidenceId);
    relevantTotal += relevantIds.length;
    relevantRecovered += relevantIds.filter(id => evidenceById.has(id)).length;
    if (relevantIds.length > 0) {
      for (const k of [5, 10, 20, 50]) {
        const top = rankedIds.slice(0, k);
        const recovered = relevantIds.filter(id => top.includes(id)).length;
        perKRecall.get(k)!.push(recovered / relevantIds.length);
        perKHit.get(k)!.push(recovered > 0 ? 1 : 0);
      }
      const rank = rankedIds.findIndex(id => relevantIds.includes(id)) + 1;
      reciprocalRanks.push(rank > 0 && rank <= 10 ? 1 / rank : 0);
      const gains =
        gold.gradedRelevantEvidence.length > 0
          ? new Map(
              gold.gradedRelevantEvidence.map(item => [item.id, item.relevance])
            )
          : new Map(relevantIds.map(id => [id, 1]));
      const dcg = rankedIds
        .slice(0, 10)
        .reduce(
          (sum, id, index) =>
            sum + (2 ** (gains.get(id) ?? 0) - 1) / Math.log2(index + 2),
          0
        );
      const ideal = [...gains.values()]
        .sort((a, b) => b - a)
        .slice(0, 10)
        .reduce(
          (sum, relevance, index) =>
            sum + (2 ** relevance - 1) / Math.log2(index + 2),
          0
        );
      ndcgs.push(ideal === 0 ? 0 : dcg / ideal);
      if (gold.exactIdentifier)
        exactIdentifierHits.push(
          rankedIds.slice(0, 5).some(id => relevantIds.includes(id)) ? 1 : 0
        );
      if (gold.language) {
        const recallAt20 =
          relevantIds.filter(id => rankedIds.slice(0, 20).includes(id)).length /
          relevantIds.length;
        const bucket =
          gold.language === "thai"
            ? "thai"
            : gold.language === "english"
              ? "english"
              : "mixed";
        const values = languageRecall.get(bucket) ?? [];
        values.push(recallAt20);
        languageRecall.set(bucket, values);
      }
    }
    requiredClaimTotal += gold.requiredClaims.length;
    coveredClaimTotal += gold.requiredClaims.filter(claim =>
      observed.coveredClaims.includes(claim)
    ).length;
    citationsTotal += observed.citations.length;
    const validCitationCount = observed.citations.filter(citation => {
      const evidence = evidenceById.get(citation.evidenceId);
      return (
        isCitationValid(citation, evidence) &&
        evidence?.authorized === true &&
        evidence.tenantId === gold.tenantId &&
        !evidence.revoked &&
        !evidence.deleted &&
        (!gold.expectedRevision || evidence.revision === gold.expectedRevision)
      );
    }).length;
    citationsValid += validCitationCount;
    if (gold.shouldCite) {
      citationRequiredCases += 1;
      if (validCitationCount > 0) citationAvailableCases += 1;
    }

    for (const item of observed.evidence) {
      if (item.tenantId !== gold.tenantId) crossTenantLeakage += 1;
      if (!item.authorized) unauthorizedEvidenceLeakage += 1;
      if (item.tenantId !== gold.tenantId || !item.authorized) aclLeakage += 1;
      // expectedRevision belongs to the gold source identity. A retrieved
      // distractor is not stale merely because it has its own current revision.
      const isExpectedEvidence = relevantIds.includes(item.evidenceId);
      if (
        item.revoked ||
        item.deleted ||
        (isExpectedEvidence &&
          gold.expectedRevision &&
          item.revision !== gold.expectedRevision)
      ) {
        staleAccepted += 1;
      }
      freshnessTotal += 1;
      if (
        !item.revoked &&
        !item.deleted &&
        (!isExpectedEvidence ||
          !gold.expectedRevision ||
          item.revision === gold.expectedRevision)
      ) {
        freshnessCorrect += 1;
      }
      authorityTotal += 1;
      if (item.authorityRank >= gold.minimumAuthorityRank)
        authorityCorrect += 1;
    }

    if (!gold.supportsAnswer) {
      noAnswerCases += 1;
      if (!observed.answerSupported) noAnswerTruePositive += 1;
      else noAnswerFalseNegative += 1;
    } else if (!observed.answerSupported) {
      noAnswerFalsePositive += 1;
    }
    if (observed.providerState !== "complete") partialOrOutageResults += 1;
    if (observed.providerState !== "complete" && observed.answerSupported) {
      unsafePartialOrOutageAnswers += 1;
    }
    if (observed.latencyMs !== undefined) latencies.push(observed.latencyMs);
    if (observed.costMicros !== undefined) costs.push(observed.costMicros);
  }

  const safeRatio = (numerator: number, denominator: number): number | null =>
    denominator === 0 ? null : Number((numerator / denominator).toFixed(6));
  const mean = (values: number[]): number | null =>
    values.length === 0
      ? null
      : Number(
          (
            values.reduce((sum, value) => sum + value, 0) / values.length
          ).toFixed(6)
        );
  const percentile = (values: number[], p: number): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
  };
  return {
    caseCount: cases.length,
    evidenceRecall: safeRatio(relevantRecovered, relevantTotal),
    recallAt5: mean(perKRecall.get(5)!),
    recallAt10: mean(perKRecall.get(10)!),
    recallAt20: mean(perKRecall.get(20)!),
    recallAt50: mean(perKRecall.get(50)!),
    hitAt5: mean(perKHit.get(5)!),
    hitAt10: mean(perKHit.get(10)!),
    hitAt20: mean(perKHit.get(20)!),
    hitAt50: mean(perKHit.get(50)!),
    mrrAt10: mean(reciprocalRanks),
    nDCGAt10: mean(ndcgs),
    exactIdentifierHitAt5: mean(exactIdentifierHits),
    thaiRecallAt20: mean(languageRecall.get("thai") ?? []),
    englishRecallAt20: mean(languageRecall.get("english") ?? []),
    mixedRecallAt20: mean(languageRecall.get("mixed") ?? []),
    evidenceCoverage: safeRatio(coveredClaimTotal, requiredClaimTotal) ?? 0,
    citationPrecision: safeRatio(citationsValid, citationsTotal),
    citationAvailability: safeRatio(
      citationAvailableCases,
      citationRequiredCases
    ),
    freshnessCorrectness: safeRatio(freshnessCorrect, freshnessTotal) ?? 1,
    authorityCorrectness: safeRatio(authorityCorrect, authorityTotal) ?? 1,
    aclLeakage,
    crossTenantLeakage,
    unauthorizedEvidenceLeakage,
    unsafePartialOrOutageAnswers,
    staleOrRevokedEvidenceAccepted: staleAccepted,
    noAnswerPrecision: safeRatio(
      noAnswerTruePositive,
      noAnswerTruePositive + noAnswerFalsePositive
    ),
    noAnswerRecall:
      noAnswerCases === 0
        ? null
        : safeRatio(noAnswerTruePositive, noAnswerCases),
    partialOrOutageResults,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    meanCostMicros: mean(costs),
  };
}

export const SPEC_229_RELEASE_CRITERIA = Object.freeze({
  crossTenantLeakage: 0,
  unauthorizedEvidenceLeakage: 0,
  exactIdentifierHitAt5: 0.99,
  overallRecallAt20: 0.95,
  thaiRecallAt20: 0.92,
  englishRecallAt20: 0.95,
  nDCGAt10: 0.85,
  mrrAt10: 0.85,
  citationPrecision: 0.95,
  freshnessCorrectness: 0.98,
  noAnswerPrecision: 0.9,
  noAnswerRecall: 0.9,
  simpleExactKeywordP95Ms: 800,
  hybridRerankP95Ms: 1500,
  rewriteHybridRerankP95Ms: 2500,
});
