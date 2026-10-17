import { readFileSync } from "node:fs";
import {
  DEVELOPMENT_GOLD_CASES,
  DEVELOPMENT_OBSERVATIONS,
} from "../server/services/libraryRetrievalBenchmark.fixtures";
import {
  calculateRetrievalBenchmarkMetrics,
  SPEC_229_RELEASE_CRITERIA,
  retrievalBenchmarkObservationSchema,
} from "../server/services/libraryRetrievalBenchmark";

const observationsFileIndex = process.argv.indexOf("--observations-file");
const observationsFile = observationsFileIndex >= 0
  ? process.argv[observationsFileIndex + 1]
  : undefined;
const observations = observationsFile
  ? retrievalBenchmarkObservationSchema.array().parse(
      JSON.parse(readFileSync(observationsFile, "utf8")),
    )
  : DEVELOPMENT_OBSERVATIONS;
const metrics = calculateRetrievalBenchmarkMetrics(
  DEVELOPMENT_GOLD_CASES,
  observations,
);

process.stdout.write(`${JSON.stringify({
  status: "DEVELOPMENT_FIXTURES_NOT_CERTIFIED",
  source: observationsFile ? "provided-observations" : "synthetic-fixtures",
  reviewedGoldQueries: false,
  fixtureCount: DEVELOPMENT_GOLD_CASES.length,
  metrics,
  canonicalReleaseCriteria: SPEC_229_RELEASE_CRITERIA,
}, null, 2)}\n`);
