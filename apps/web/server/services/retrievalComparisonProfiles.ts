import type { AiSearchRetrievalType } from "./cloudflareAiSearchProvider";

export type AiSearchComparisonProfile =
  | "ai_search_bm25"
  | "ai_search_vector"
  | "hybrid_rrf"
  | "hybrid_reranker"
  | "conditional_rewrite"
  | "multi_query";

export interface AiSearchComparisonOptions {
  retrievalType: AiSearchRetrievalType;
  fusionMethod?: "rrf";
  reranking: boolean;
  queryRewrite: boolean;
  multiQuery: boolean;
}

const HYBRID_RRF = Object.freeze({
  retrievalType: "hybrid" as const,
  fusionMethod: "rrf" as const,
});

/** Parameters for §27 profiles C-H using the existing AI Search adapter. */
export function getAiSearchComparisonOptions(
  profile: AiSearchComparisonProfile
): AiSearchComparisonOptions {
  switch (profile) {
    case "ai_search_bm25":
      return { retrievalType: "keyword", reranking: false, queryRewrite: false, multiQuery: false };
    case "ai_search_vector":
      return { retrievalType: "vector", reranking: false, queryRewrite: false, multiQuery: false };
    case "hybrid_rrf":
      return { ...HYBRID_RRF, reranking: false, queryRewrite: false, multiQuery: false };
    case "hybrid_reranker":
      return { ...HYBRID_RRF, reranking: true, queryRewrite: false, multiQuery: false };
    case "conditional_rewrite":
      return { ...HYBRID_RRF, reranking: true, queryRewrite: true, multiQuery: false };
    case "multi_query":
      return { ...HYBRID_RRF, reranking: true, queryRewrite: true, multiQuery: true };
  }
}
