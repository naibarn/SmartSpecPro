import { z } from "zod";
import {
  RETRIEVAL_BENCHMARK_COMPARISON_PROFILES,
  RETRIEVAL_BENCHMARK_LATENCY_PROFILES,
  retrievalBenchmarkObservationSchema,
} from "./libraryRetrievalBenchmark";

const observations = z.array(retrievalBenchmarkObservationSchema);

const comparisonRunsSchema = z
  .object({
    legacy_baseline: observations.optional(),
    vectorize_dense: observations.optional(),
    ai_search_bm25: observations.optional(),
    ai_search_vector: observations.optional(),
    hybrid_rrf: observations.optional(),
    hybrid_reranker: observations.optional(),
    conditional_rewrite: observations.optional(),
    multi_query: observations.optional(),
  })
  .strict();

const latencyRunsSchema = z
  .object({
    simple_exact_keyword: observations.optional(),
    hybrid_rerank: observations.optional(),
    rewrite_hybrid_rerank: observations.optional(),
  })
  .strict();

export const retrievalBenchmarkRunBundleSchema = z
  .object({
    schemaVersion: z.literal("spec229-observation-bundle-v1"),
    releaseComparisonProfile: z.enum(RETRIEVAL_BENCHMARK_COMPARISON_PROFILES),
    comparisonRuns: comparisonRunsSchema,
    latencyRuns: latencyRunsSchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    if (!bundle.comparisonRuns[bundle.releaseComparisonProfile]) {
      context.addIssue({
        code: "custom",
        path: ["comparisonRuns", bundle.releaseComparisonProfile],
        message:
          "releaseComparisonProfile must have a corresponding comparison run",
      });
    }
    for (const profile of RETRIEVAL_BENCHMARK_COMPARISON_PROFILES) {
      const run = bundle.comparisonRuns[profile];
      if (!run) continue;
      for (const [index, row] of run.entries()) {
        if (row.comparisonProfile !== profile) {
          context.addIssue({
            code: "custom",
            path: ["comparisonRuns", profile, index, "comparisonProfile"],
            message: `observation must identify comparison profile ${profile}`,
          });
        }
      }
    }
    for (const profile of RETRIEVAL_BENCHMARK_LATENCY_PROFILES) {
      const run = bundle.latencyRuns[profile];
      if (!run) continue;
      for (const [index, row] of run.entries()) {
        if (row.latencyProfile !== profile) {
          context.addIssue({
            code: "custom",
            path: ["latencyRuns", profile, index, "latencyProfile"],
            message: `observation must identify latency profile ${profile}`,
          });
        }
      }
    }
  });

export type RetrievalBenchmarkRunBundle = z.infer<
  typeof retrievalBenchmarkRunBundleSchema
>;
