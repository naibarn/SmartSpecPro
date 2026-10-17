import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { P2298_CANDIDATE_SEEDS } from "../server/services/libraryRetrievalGoldCandidateSeeds";
import {
  countGoldDataset,
  bootstrapMean95,
  deterministicStratifiedSample,
  evaluateGoldDataset,
  goldDatasetCandidateSchema,
  isHeldOutReleaseEvaluationEligible,
  isReviewAccepted,
  isReleaseCohortReady,
  missingRequiredQueryClasses,
  validateGoldDataset,
  wilson95,
} from "../server/services/libraryRetrievalGoldDataset";
import {
  calculateRetrievalBenchmarkMetrics,
  getRetrievalBenchmarkProfile,
  isCitationValid,
  retrievalBenchmarkObservationSchema,
} from "../server/services/libraryRetrievalBenchmark";

// Run development report: pnpm --filter @smartspec/web exec tsx scripts/run-retrieval-gold-dataset.ts
// Add --dataset-file <json> --observations-file <json> --system-sha <40-or-64-char-sha> for a recorded run.
// A comparable --baseline-file must include the same dataset digest and benchmark version, a valid
// system SHA, serialized observations, and observationsSha256; unbound metric-only baselines are rejected.

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const repoRoot = resolve(process.cwd(), "../..");
const inputFile = argValue("--dataset-file");
const observationFile = argValue("--observations-file");
const baselineFile = argValue("--baseline-file");
const currentSystemSha = argValue("--system-sha") ?? null;
const candidates = (
  inputFile
    ? JSON.parse(readFileSync(inputFile, "utf8"))
    : P2298_CANDIDATE_SEEDS
).map((item: unknown) => goldDatasetCandidateSchema.parse(item));
validateGoldDataset(candidates, repoRoot);

const observations = observationFile
  ? retrievalBenchmarkObservationSchema
      .array()
      .parse(JSON.parse(readFileSync(observationFile, "utf8")))
  : undefined;
const currentProfile = observations
  ? getRetrievalBenchmarkProfile(observations)
  : null;
const evaluated = evaluateGoldDataset(candidates, observations);
const releaseScope = isReleaseCohortReady(evaluated.counts);
const evaluationCohort = releaseScope
  ? candidates.filter(isHeldOutReleaseEvaluationEligible)
  : candidates.filter(isReviewAccepted);
const classCounts: Record<string, number> = {};
for (const candidate of candidates)
  for (const category of candidate.classes)
    classCounts[category] = (classCounts[category] ?? 0) + 1;
const languageCounts = Object.fromEntries(
  ["thai", "english", "mixed"].map(language => [
    language,
    candidates.filter(candidate => candidate.language === language).length,
  ])
);
const sourceGroupCount = new Set(
  candidates.map(candidate => candidate.sourceGroupId)
).size;

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const datasetDigest = hash(JSON.stringify(candidates));
const observationsDigest = observations
  ? hash(JSON.stringify(observations))
  : null;
const stratifiedSample = deterministicStratifiedSample(candidates, 25).map(
  item => item.caseId
);
const leakageRateIntervals = observations
  ? (() => {
      const byId = new Map(observations.map(row => [row.caseId, row]));
      const reviewed = evaluationCohort;
      const leaked = reviewed.filter(item =>
        (byId.get(item.caseId)?.evidence ?? []).some(
          evidence => evidence.tenantId !== item.benchmarkGold.tenantId
        )
      );
      const unauthorized = reviewed.filter(item =>
        (byId.get(item.caseId)?.evidence ?? []).some(
          evidence => !evidence.authorized
        )
      );
      const recallValues: number[] = [];
      const citationValues: number[] = [];
      const freshnessValues: number[] = [];
      const noAnswerCases = reviewed.filter(
        item => !item.benchmarkGold.supportsAnswer
      );
      let noAnswerTruePositive = 0;
      let noAnswerPredicted = 0;
      let noAnswerPredictedTruePositive = 0;
      for (const item of reviewed) {
        const row = byId.get(item.caseId);
        if (!row) continue;
        const relevant = item.benchmarkGold.requiredEvidenceIds;
        if (relevant.length) {
          const top20 = row.evidence
            .slice(0, 20)
            .map(evidence => evidence.evidenceId);
          recallValues.push(
            relevant.filter(id => top20.includes(id)).length / relevant.length
          );
        }
        if (row.citations.length) {
          const evidenceById = new Map(
            row.evidence.map(evidence => [evidence.evidenceId, evidence])
          );
          citationValues.push(
            row.citations.filter(citation => {
              const evidence = evidenceById.get(citation.evidenceId);
              return (
                isCitationValid(citation, evidence) &&
                evidence?.authorized === true &&
                evidence.tenantId === item.benchmarkGold.tenantId &&
                evidence.revoked === false &&
                evidence.deleted === false &&
                (!item.benchmarkGold.expectedRevision ||
                  evidence.revision === item.benchmarkGold.expectedRevision)
              );
            }).length / row.citations.length
          );
        }
        if (row.evidence.length && item.benchmarkGold.expectedRevision) {
          freshnessValues.push(
            row.evidence.filter(
              evidence =>
                !evidence.revoked &&
                !evidence.deleted &&
                evidence.revision === item.benchmarkGold.expectedRevision
            ).length / row.evidence.length
          );
        }
        if (!row.answerSupported) {
          noAnswerPredicted += 1;
          if (!item.benchmarkGold.supportsAnswer)
            noAnswerPredictedTruePositive += 1;
        }
        if (!item.benchmarkGold.supportsAnswer) {
          if (!row.answerSupported) noAnswerTruePositive += 1;
        }
      }
      const minForInterval = 30;
      return {
        scope: releaseScope
          ? "held_out_release_approved"
          : "all_reviewed_exploratory",
        crossTenantLeakagePerCase95Ci: wilson95(leaked.length, reviewed.length),
        unauthorizedLeakagePerCase95Ci: wilson95(
          unauthorized.length,
          reviewed.length
        ),
        recallAt20Bootstrap95Ci: bootstrapMean95(
          recallValues,
          `${datasetDigest}:recallAt20`
        ),
        citationPrecisionBootstrap95Ci: bootstrapMean95(
          citationValues,
          `${datasetDigest}:citationPrecision`
        ),
        freshnessCorrectnessBootstrap95Ci: bootstrapMean95(
          freshnessValues,
          `${datasetDigest}:freshness`
        ),
        noAnswerPrecisionWilson95Ci: wilson95(
          noAnswerPredictedTruePositive,
          noAnswerPredicted
        ),
        noAnswerRecallWilson95Ci: wilson95(
          noAnswerTruePositive,
          noAnswerCases.length
        ),
        sampleCounts: {
          reviewed: reviewed.length,
          recall: recallValues.length,
          citations: citationValues.length,
          freshness: freshnessValues.length,
          noAnswer: noAnswerCases.length,
        },
        minimumGroupSizeForBootstrap: minForInterval,
      };
    })()
  : null;

const perClassEvaluation = observations
  ? Object.fromEntries(
      [...new Set(candidates.flatMap(candidate => candidate.classes))]
        .sort()
        .map(category => {
          const subset = candidates.filter(
            candidate =>
              candidate.classes.includes(category) &&
              (releaseScope
                ? isHeldOutReleaseEvaluationEligible(candidate)
                : isReviewAccepted(candidate))
          );
          const subsetObservations = observations.filter(row =>
            subset.some(candidate => candidate.caseId === row.caseId)
          );
          const leaks = new Map(
            subsetObservations.map(row => [
              row.caseId,
              row.evidence.some(
                evidence =>
                  evidence.tenantId !==
                  subset.find(item => item.caseId === row.caseId)!.benchmarkGold
                    .tenantId
              ),
            ])
          );
          const leakageCount = [...leaks.values()].filter(Boolean).length;
          const rowsById = new Map(
            subsetObservations.map(row => [row.caseId, row])
          );
          const recallValues = subset.flatMap(item => {
            const row = rowsById.get(item.caseId);
            const relevant = item.benchmarkGold.requiredEvidenceIds;
            if (!row || !relevant.length) return [];
            const top20 = row.evidence
              .slice(0, 20)
              .map(evidence => evidence.evidenceId);
            return [
              relevant.filter(id => top20.includes(id)).length /
                relevant.length,
            ];
          });
          const citationValues = subset.flatMap(item => {
            const row = rowsById.get(item.caseId);
            if (!row?.citations.length) return [];
            const evidenceById = new Map(
              row.evidence.map(evidence => [evidence.evidenceId, evidence])
            );
            const correct = row.citations.filter(citation => {
              const evidence = evidenceById.get(citation.evidenceId);
              return (
                isCitationValid(citation, evidence) &&
                evidence?.authorized === true &&
                evidence.tenantId === item.benchmarkGold.tenantId &&
                !evidence.revoked &&
                !evidence.deleted &&
                evidence.revision === item.benchmarkGold.expectedRevision
              );
            }).length;
            return [correct / row.citations.length];
          });
          const freshnessValues = subset.flatMap(item => {
            const row = rowsById.get(item.caseId);
            if (!row?.evidence.length) return [];
            return [
              row.evidence.filter(
                evidence =>
                  !evidence.revoked &&
                  !evidence.deleted &&
                  evidence.revision === item.benchmarkGold.expectedRevision
              ).length / row.evidence.length,
            ];
          });
          const metrics =
            subset.length >= 30
              ? calculateRetrievalBenchmarkMetrics(
                  subset.map(item => ({
                    caseId: item.caseId,
                    query: item.query,
                    ...item.benchmarkGold,
                    language: item.language,
                  })),
                  subsetObservations
                )
              : null;
          return [
            category,
            {
              sampleSize: subset.length,
              confidenceIntervalStatus:
                subset.length >= 30
                  ? "AVAILABLE"
                  : "NOT_EVALUABLE_INSUFFICIENT_N",
              crossTenantLeakagePerCase95Ci:
                subset.length >= 30
                  ? wilson95(leakageCount, subset.length)
                  : null,
              crossTenantLeakageCases: leakageCount,
              recallAt20Bootstrap95Ci: bootstrapMean95(
                recallValues,
                `${datasetDigest}:${category}:recallAt20`
              ),
              citationPrecisionBootstrap95Ci: bootstrapMean95(
                citationValues,
                `${datasetDigest}:${category}:citationPrecision`
              ),
              freshnessCorrectnessBootstrap95Ci: bootstrapMean95(
                freshnessValues,
                `${datasetDigest}:${category}:freshness`
              ),
              metrics,
            },
          ];
        })
    )
  : null;

let baselineComparison: unknown = null;
if (baselineFile) {
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as {
    datasetSha256?: string;
    benchmarkVersion?: string;
    systemSha?: string;
    observationsSha256?: string;
    observations?: unknown[];
  };
  const compatible =
    baseline.datasetSha256 === datasetDigest &&
    baseline.benchmarkVersion === "spec229-benchmark-v1" &&
    /^[a-f0-9]{40}([a-f0-9]{24})?$/.test(baseline.systemSha ?? "") &&
    /^[a-f0-9]{40}([a-f0-9]{24})?$/.test(currentSystemSha ?? "") &&
    Array.isArray(baseline.observations) &&
    baseline.observationsSha256 === hash(JSON.stringify(baseline.observations));
  const baselineObservations = compatible && baseline.observations
    ? retrievalBenchmarkObservationSchema.array().parse(baseline.observations)
    : undefined;
  const baselineProfile = baselineObservations
    ? getRetrievalBenchmarkProfile(baselineObservations)
    : null;
  const baselineEvaluated =
    compatible && baselineObservations && observations
      ? evaluateGoldDataset(candidates, baselineObservations)
      : undefined;
  const baselineMetrics = baselineEvaluated?.metrics;
  const comparison =
    compatible && evaluated.metrics && baselineMetrics
      ? Object.fromEntries(
          Object.entries(evaluated.metrics).flatMap(([key, value]) => {
            const previous = baselineMetrics[key];
            return typeof value === "number" && typeof previous === "number"
              ? [
                  [
                    key,
                    {
                      baseline: previous,
                      current: value,
                      delta: Number((value - previous).toFixed(6)),
                    },
                  ],
                ]
              : [];
          })
        )
      : null;
  baselineComparison = {
    file: baselineFile,
    sha256: hash(readFileSync(baselineFile, "utf8")),
    status: compatible && comparison ? "COMPARABLE" : "NOT_COMPARABLE",
    reason: compatible
      ? comparison
        ? undefined
        : "No comparable baseline/current observations or current metrics available."
      : "Dataset digest, benchmark version, valid system SHA, or observation digest does not match/was not supplied.",
    baselineSystemSha: baseline.systemSha ?? null,
    currentSystemSha,
    baselineObservationsSha256: baseline.observationsSha256 ?? null,
    baselineProfile,
    currentProfile,
    comparison,
  };
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: "DEVELOPMENT_CANDIDATES_NOT_CERTIFIED",
      canonicalReleaseCriteriaStatus: evaluated.releaseStatus,
      certification:
        "NOT_CERTIFIED: requires >=500 accepted, release-approved reviewed queries, complete observations and all §27 gates.",
      datasetSha256: datasetDigest,
      benchmarkVersion: "spec229-benchmark-v1",
      systemSha: currentSystemSha,
      observationsSha256: observationsDigest,
      comparisonProfile: currentProfile?.comparisonProfile ?? null,
      latencyProfile: currentProfile?.latencyProfile ?? null,
      counts: countGoldDataset(candidates),
      classCounts,
      candidateRequiredClassesMissing: missingRequiredQueryClasses(candidates),
      heldOutReleaseRequiredClassesMissing: missingRequiredQueryClasses(
        candidates.filter(isHeldOutReleaseEvaluationEligible)
      ),
      languageCounts,
      sourceGroupCount,
      deterministicDevelopmentSample: stratifiedSample,
      metrics: evaluated.metrics,
      releaseCriteria: evaluated.releaseCriteria.length
        ? evaluated.releaseCriteria
        : [
            {
              status: "NOT_EVALUABLE",
              reason:
                "Requires at least 500 accepted, release-approved reviewed queries plus observations.",
            },
          ],
      confidenceIntervals: leakageRateIntervals,
      perClassEvaluation,
      baselineComparison,
      caveats: [
        "Machine review is reported separately and never counted as human review.",
        "Repository-backed candidates are development-only unless separately source-approved for release evaluation; their review state does not imply human review or quality certification.",
        "Per-class confidence intervals require at least 30 cases; this is a reporting floor, not a release threshold.",
        "Each observation file must identify one consistent comparisonProfile; latency criteria are evaluated only when one matching latencyProfile and latency for every cohort row are present.",
        "This harness does not run retrieval, generate answers, or use an LLM as an answer judge.",
      ],
    },
    null,
    2
  )}\n`
);
