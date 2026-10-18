import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { P2298_CANDIDATE_SEEDS } from "../server/services/libraryRetrievalGoldCandidateSeeds";
import {
  countGoldDataset,
  bootstrapMean95,
  buildGoldDatasetReviewQueue,
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
  RETRIEVAL_BENCHMARK_COMPARISON_PROFILES,
  RETRIEVAL_BENCHMARK_LATENCY_PROFILES,
  getRetrievalBenchmarkProfile,
  isCitationValid,
  retrievalBenchmarkObservationSchema,
} from "../server/services/libraryRetrievalBenchmark";
import { retrievalBenchmarkRunBundleSchema } from "../server/services/libraryRetrievalBenchmarkRunBundle";

// Run development report: pnpm --filter @smartspec/web exec tsx scripts/run-retrieval-gold-dataset.ts
// Add --dataset-file <json> --observations-file <json> --system-sha <40-or-64-char-sha> for a recorded run.
// A comparable --baseline-file must include the same dataset digest and benchmark version, a valid
// system SHA, serialized observations, and observationsSha256; unbound metric-only baselines are rejected.

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const repoRoot = resolve(argValue("--repo-root") ?? resolve(process.cwd(), "../.."));
const inputFile = argValue("--dataset-file");
const observationFile = argValue("--observations-file");
const baselineFile = argValue("--baseline-file");
const reviewQueueFile = argValue("--review-queue-file");
const candidates = (
  inputFile
    ? JSON.parse(readFileSync(inputFile, "utf8"))
    : P2298_CANDIDATE_SEEDS
).map((item: unknown) => goldDatasetCandidateSchema.parse(item));
validateGoldDataset(candidates, repoRoot);

const reviewQueue = reviewQueueFile
  ? buildGoldDatasetReviewQueue(candidates)
  : null;
const reviewQueuePath = reviewQueueFile
  ? resolve(process.cwd(), reviewQueueFile)
  : null;
const serializedReviewQueue = reviewQueue
  ? `${JSON.stringify(reviewQueue, null, 2)}\n`
  : null;
if (reviewQueuePath && serializedReviewQueue) {
  writeFileSync(reviewQueuePath, serializedReviewQueue, { flag: "wx" });
}

const observationDocument = observationFile
  ? (JSON.parse(readFileSync(observationFile, "utf8")) as unknown)
  : undefined;
const isRecord = (
  value: unknown
): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const recordedRun =
  isRecord(observationDocument) &&
  observationDocument.schemaVersion === "spec229-local-observation-run-v1"
    ? observationDocument
    : null;
const currentSystemSha =
  argValue("--system-sha") ??
  (typeof recordedRun?.systemSha === "string" ? recordedRun.systemSha : null);
if (
  recordedRun &&
  argValue("--system-sha") &&
  recordedRun.systemSha !== argValue("--system-sha")
) {
  throw new Error("--system-sha must match the recorded observation run systemSha");
}
const rawObservations = recordedRun
  ? recordedRun.observationBundle
  : observationDocument;
const observationBundle =
  rawObservations && !Array.isArray(rawObservations)
    ? retrievalBenchmarkRunBundleSchema.parse(rawObservations)
    : undefined;
const observations = observationBundle
  ? observationBundle.comparisonRuns[observationBundle.releaseComparisonProfile]
  : rawObservations === undefined
    ? undefined
    : retrievalBenchmarkObservationSchema.array().parse(rawObservations);
const latencyRuns = observationBundle?.latencyRuns;
const currentProfile = observations
  ? getRetrievalBenchmarkProfile(observations)
  : null;
const candidateCounts = countGoldDataset(candidates);
const releaseScope = isReleaseCohortReady(candidateCounts);
const evaluationCohort = releaseScope
  ? candidates.filter(isHeldOutReleaseEvaluationEligible)
  : candidates.filter(isReviewAccepted);
const evaluationIds = new Set(
  evaluationCohort.map(candidate => candidate.caseId)
);
const hasCompleteRun = (run: typeof observations): boolean => {
  if (!run || run.length !== evaluationIds.size) return false;
  const ids = new Set(run.map(row => row.caseId));
  return (
    ids.size === evaluationIds.size &&
    [...evaluationIds].every(id => ids.has(id))
  );
};
if (observationBundle) {
  for (const profile of RETRIEVAL_BENCHMARK_COMPARISON_PROFILES) {
    const run = observationBundle.comparisonRuns[profile];
    if (run) getRetrievalBenchmarkProfile(run);
  }
  for (const profile of RETRIEVAL_BENCHMARK_LATENCY_PROFILES) {
    const run = observationBundle.latencyRuns[profile];
    if (run) getRetrievalBenchmarkProfile(run);
  }
}
const selectedRunComplete = hasCompleteRun(observations);
const evaluated =
  observationBundle && !selectedRunComplete
    ? evaluateGoldDataset(candidates, undefined)
    : evaluateGoldDataset(candidates, observations, latencyRuns);
const profileRunStatus = (
  run: typeof observations,
  requireLatencyAndCost = false
) => {
  if (!run) return "NOT_PROVIDED";
  if (!hasCompleteRun(run)) return "INCOMPLETE_CASE_COVERAGE";
  if (
    requireLatencyAndCost &&
    run.some(row => row.latencyMs === undefined || row.costMicros === undefined)
  ) {
    return "INCOMPLETE_LATENCY_OR_COST";
  }
  return "COMPLETE";
};
const comparisonRunCoverage = observationBundle
  ? Object.fromEntries(
      RETRIEVAL_BENCHMARK_COMPARISON_PROFILES.map(profile => [
        profile,
        profileRunStatus(observationBundle.comparisonRuns[profile]),
      ])
    )
  : Object.fromEntries(
      RETRIEVAL_BENCHMARK_COMPARISON_PROFILES.map(profile => [
        profile,
        currentProfile?.comparisonProfile === profile
          ? profileRunStatus(observations)
          : "NOT_PROVIDED",
      ])
    );
const latencyRunCoverage = observationBundle
  ? Object.fromEntries(
      RETRIEVAL_BENCHMARK_LATENCY_PROFILES.map(profile => [
        profile,
        profileRunStatus(observationBundle.latencyRuns[profile]),
      ])
    )
  : Object.fromEntries(
      RETRIEVAL_BENCHMARK_LATENCY_PROFILES.map(profile => [
        profile,
        currentProfile?.latencyProfile === profile
          ? profileRunStatus(observations, true)
          : "NOT_PROVIDED",
      ])
    );
const allProfilesComplete = Boolean(
  observationBundle &&
  RETRIEVAL_BENCHMARK_COMPARISON_PROFILES.every(
    profile =>
      profileRunStatus(observationBundle.comparisonRuns[profile], true) ===
      "COMPLETE"
  ) &&
  RETRIEVAL_BENCHMARK_LATENCY_PROFILES.every(
    profile =>
      profileRunStatus(observationBundle.latencyRuns[profile], true) ===
      "COMPLETE"
  )
);
const certificationReleaseStatus =
  releaseScope && allProfilesComplete
    ? evaluated.releaseStatus
    : "NOT_EVALUABLE";
const evaluationCases = evaluationCohort.map(item => ({
  caseId: item.caseId,
  query: item.query,
  ...item.benchmarkGold,
  language: item.language,
}));
const comparisonProfileResults = observationBundle
  ? Object.fromEntries(
      RETRIEVAL_BENCHMARK_COMPARISON_PROFILES.map(profile => {
        const run = observationBundle.comparisonRuns[profile];
        const complete = hasCompleteRun(run);
        return [
          profile,
          {
            status: profileRunStatus(run, true),
            metrics: complete
              ? calculateRetrievalBenchmarkMetrics(evaluationCases, run!)
              : null,
          },
        ];
      })
    )
  : null;
const latencyProfileResults = observationBundle
  ? Object.fromEntries(
      RETRIEVAL_BENCHMARK_LATENCY_PROFILES.map(profile => {
        const run = observationBundle.latencyRuns[profile];
        const complete = hasCompleteRun(run);
        const metrics = complete
          ? calculateRetrievalBenchmarkMetrics(evaluationCases, run!)
          : null;
        return [
          profile,
          {
            status: profileRunStatus(run, true),
            latencySamples:
              run?.filter(row => row.latencyMs !== undefined).length ?? 0,
            costSamples:
              run?.filter(row => row.costMicros !== undefined).length ?? 0,
            p50LatencyMs: metrics?.p50LatencyMs ?? null,
            p95LatencyMs: metrics?.p95LatencyMs ?? null,
            p99LatencyMs: metrics?.p99LatencyMs ?? null,
            meanCostMicros: metrics?.meanCostMicros ?? null,
          },
        ];
      })
    )
  : null;
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
const observationsDigest =
  rawObservations !== undefined ? hash(JSON.stringify(rawObservations)) : null;
const stratifiedSample = deterministicStratifiedSample(candidates, 25).map(
  item => item.caseId
);
const leakageRateIntervals = observations
  ? (() => {
      const byId = new Map(observations.map(row => [row.caseId, row]));
      const reviewed = evaluationCohort;
      const observedReviewed = reviewed.filter(item => byId.has(item.caseId));
      const observedNoAnswer = observedReviewed.filter(
        item => !item.benchmarkGold.supportsAnswer
      );
      const leaked = observedReviewed.filter(item =>
        (byId.get(item.caseId)?.evidence ?? []).some(
          evidence => evidence.tenantId !== item.benchmarkGold.tenantId
        )
      );
      const unauthorized = observedReviewed.filter(item =>
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
        crossTenantLeakagePerCase95Ci: wilson95(
          leaked.length,
          observedReviewed.length
        ),
        unauthorizedLeakagePerCase95Ci: wilson95(
          unauthorized.length,
          observedReviewed.length
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
        noAnswerRecallWilson95Ci:
          observedNoAnswer.length > 0
            ? wilson95(noAnswerTruePositive, observedNoAnswer.length)
            : null,
        sampleCounts: {
          reviewed: reviewed.length,
          observed: observedReviewed.length,
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
          const observedIds = new Set(
            subsetObservations.map(row => row.caseId)
          );
          const completeObservations =
            observedIds.size === subset.length &&
            subset.every(candidate => observedIds.has(candidate.caseId));
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
            completeObservations && subset.length >= 30
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
              observedCases: observedIds.size,
              confidenceIntervalStatus:
                completeObservations && subset.length >= 30
                  ? "AVAILABLE"
                  : subset.length < 30
                    ? "NOT_EVALUABLE_INSUFFICIENT_N"
                    : "NOT_EVALUABLE_INCOMPLETE_OBSERVATIONS",
              crossTenantLeakagePerCase95Ci:
                completeObservations && subset.length >= 30
                  ? wilson95(leakageCount, subset.length)
                  : null,
              crossTenantLeakageCases: leakageCount,
              recallAt20Bootstrap95Ci: completeObservations
                ? bootstrapMean95(
                    recallValues,
                    `${datasetDigest}:${category}:recallAt20`
                  )
                : null,
              citationPrecisionBootstrap95Ci: completeObservations
                ? bootstrapMean95(
                    citationValues,
                    `${datasetDigest}:${category}:citationPrecision`
                  )
                : null,
              freshnessCorrectnessBootstrap95Ci: completeObservations
                ? bootstrapMean95(
                    freshnessValues,
                    `${datasetDigest}:${category}:freshness`
                  )
                : null,
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
  const baselineObservations =
    compatible && baseline.observations
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
      status:
        certificationReleaseStatus === "PASS"
          ? "RELEASE_CRITERIA_PASS_NOT_PRODUCTION_VERIFIED"
          : certificationReleaseStatus === "FAIL"
            ? "RELEASE_CRITERIA_FAIL"
            : "DEVELOPMENT_CANDIDATES_NOT_CERTIFIED",
      canonicalReleaseCriteriaStatus: certificationReleaseStatus,
      selectedComparisonProfileStatus: evaluated.releaseStatus,
      certification:
        certificationReleaseStatus === "PASS"
          ? "§27 release criteria pass for the named release profile and complete A–H/latency observations; this is not production verification."
          : "NOT_CERTIFIED: requires >=500 accepted, release-approved held-out queries, complete observations for A–H and all latency profiles, and all §27 gates.",
      datasetSha256: datasetDigest,
      benchmarkVersion: "spec229-benchmark-v1",
      systemSha: currentSystemSha,
      observationsSha256: observationsDigest,
      recordedRunProvenance: recordedRun
        ? {
            runId: recordedRun.runId ?? null,
            systemSha: recordedRun.systemSha ?? null,
            collectorPatchSha256: recordedRun.collectorPatchSha256 ?? null,
            profile: recordedRun.profile ?? null,
            runtime: recordedRun.runtime ?? null,
            providerConfiguration: recordedRun.providerConfiguration ?? null,
            corpus: recordedRun.corpus ?? null,
            usage: recordedRun.usage ?? null,
            cleanup: recordedRun.cleanup ?? null,
          }
        : null,
      comparisonProfile: currentProfile?.comparisonProfile ?? null,
      latencyProfile: currentProfile?.latencyProfile ?? null,
      releaseComparisonProfile:
        observationBundle?.releaseComparisonProfile ?? null,
      observationCoverage: {
        schemaVersion: observationBundle?.schemaVersion ?? "legacy-single-run",
        comparisonProfiles: comparisonRunCoverage,
        latencyProfiles: latencyRunCoverage,
        allProfilesComplete,
        evaluatedCaseCount: evaluationCohort.length,
      },
      comparisonProfileMetrics: comparisonProfileResults,
      latencyProfileMetrics: latencyProfileResults,
      counts: countGoldDataset(candidates),
      classCounts,
      candidateRequiredClassesMissing: missingRequiredQueryClasses(candidates),
      heldOutReleaseRequiredClassesMissing: missingRequiredQueryClasses(
        candidates.filter(isHeldOutReleaseEvaluationEligible)
      ),
      humanReviewQueue:
        reviewQueuePath && serializedReviewQueue
          ? {
              path: reviewQueuePath,
              sha256: hash(serializedReviewQueue),
              entries: reviewQueue?.entries.length ?? 0,
              pendingHumanReview:
                reviewQueue?.entries.filter(
                  entry => entry.humanReviewStatus === "PENDING_HUMAN_REVIEW"
                ).length ?? 0,
              pendingSourceUseApproval:
                reviewQueue?.entries.filter(
                  entry =>
                    entry.sourceUseApprovalStatus ===
                    "PENDING_OWNER_SOURCE_USE_APPROVAL"
                ).length ?? 0,
            }
          : null,
      languageCounts,
      sourceGroupCount,
      deterministicDevelopmentSample: stratifiedSample,
      metrics: evaluated.metrics,
      releaseCriteria: evaluated.releaseCriteria.length
        ? certificationReleaseStatus === "NOT_EVALUABLE"
          ? evaluated.releaseCriteria.map(criterion => ({
              ...criterion,
              status: "NOT_EVALUABLE" as const,
            }))
          : evaluated.releaseCriteria
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
        "Legacy observation arrays remain supported for development reports. Release calibration requires a v1 bundle with complete A–H comparison runs and one complete, latency-tagged run for each of the three §27 latency targets.",
        "This harness does not run retrieval, generate answers, or use an LLM as an answer judge.",
      ],
    },
    null,
    2
  )}\n`
);
