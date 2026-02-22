# Section 05: reranking — Code Review

## Findings Summary

| ID | Severity | Description |
|----|----------|-------------|
| F-01 | HIGH | ProcessPoolExecutor created but never used for inference |
| F-02 | MEDIUM | cohere>=5.0.0 not added to requirements.txt |
| F-03 | MEDIUM | test_reranker_performance.py missing |
| F-04 | MEDIUM | Token truncation uses naive char estimation instead of tiktoken |
| F-05 | MEDIUM | Cohere uses synchronous client in async context |
| F-06 | LOW | Scope verification bypass when documents <= top_k (scores not set) |
| F-07 | MEDIUM | 4 test cases from plan not implemented |
| F-08 | LOW | In-process model loaded redundantly with ProcessPoolExecutor |
| F-09 | LOW | Cohere API key stored in plaintext on instance |
| F-10 | LOW | use_llm=False backward compat doesn't restrict fallback chain |
| F-11 | LOW | Documents list mutated in place |
