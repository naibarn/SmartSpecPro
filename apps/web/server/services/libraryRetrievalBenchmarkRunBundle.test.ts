import { describe, expect, it } from "vitest";
import { retrievalBenchmarkRunBundleSchema } from "./libraryRetrievalBenchmarkRunBundle";

describe("SPEC-229 A–H benchmark run bundle", () => {
  it("accepts an explicitly selected comparison run while other profiles remain pending", () => {
    const bundle = retrievalBenchmarkRunBundleSchema.parse({
      schemaVersion: "spec229-observation-bundle-v1",
      releaseComparisonProfile: "multi_query",
      comparisonRuns: { multi_query: [] },
      latencyRuns: {},
    });
    expect(bundle.releaseComparisonProfile).toBe("multi_query");
  });

  it("rejects observations filed under the wrong comparison or latency profile", () => {
    const observation = {
      caseId: "case-1",
      answerSupported: false,
      coveredClaims: [],
      evidence: [],
      citations: [],
      providerState: "complete",
      latencyMs: 10,
      costMicros: 2,
    };
    expect(() =>
      retrievalBenchmarkRunBundleSchema.parse({
        schemaVersion: "spec229-observation-bundle-v1",
        releaseComparisonProfile: "multi_query",
        comparisonRuns: {
          multi_query: [{ ...observation, comparisonProfile: "hybrid_rrf" }],
        },
        latencyRuns: {},
      })
    ).toThrow("observation must identify comparison profile multi_query");
    expect(() =>
      retrievalBenchmarkRunBundleSchema.parse({
        schemaVersion: "spec229-observation-bundle-v1",
        releaseComparisonProfile: "multi_query",
        comparisonRuns: {
          multi_query: [{ ...observation, comparisonProfile: "multi_query" }],
        },
        latencyRuns: {
          hybrid_rerank: [
            { ...observation, latencyProfile: "simple_exact_keyword" },
          ],
        },
      })
    ).toThrow("observation must identify latency profile hybrid_rerank");
  });
});
