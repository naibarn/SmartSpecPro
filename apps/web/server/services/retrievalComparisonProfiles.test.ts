import { describe, expect, it } from "vitest";

import { getAiSearchComparisonOptions } from "./retrievalComparisonProfiles";

describe("SPEC-229 AI Search comparison profiles", () => {
  it("keeps the C-H profile arms explicit and distinct", () => {
    expect(getAiSearchComparisonOptions("ai_search_bm25")).toMatchObject({ retrievalType: "keyword", reranking: false, queryRewrite: false });
    expect(getAiSearchComparisonOptions("ai_search_vector")).toMatchObject({ retrievalType: "vector", reranking: false, queryRewrite: false });
    expect(getAiSearchComparisonOptions("hybrid_rrf")).toMatchObject({ retrievalType: "hybrid", fusionMethod: "rrf", reranking: false, queryRewrite: false });
    expect(getAiSearchComparisonOptions("hybrid_reranker")).toMatchObject({ retrievalType: "hybrid", fusionMethod: "rrf", reranking: true, queryRewrite: false });
    expect(getAiSearchComparisonOptions("conditional_rewrite")).toMatchObject({ retrievalType: "hybrid", fusionMethod: "rrf", reranking: true, queryRewrite: true, multiQuery: false });
    expect(getAiSearchComparisonOptions("multi_query")).toMatchObject({ retrievalType: "hybrid", fusionMethod: "rrf", reranking: true, queryRewrite: true, multiQuery: true });
  });

});
