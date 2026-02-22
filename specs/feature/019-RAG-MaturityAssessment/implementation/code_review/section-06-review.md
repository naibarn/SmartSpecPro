# Section 06 Code Review: Guardrails and Citations

## Findings

| ID | Severity | Description |
|----|----------|-------------|
| H-01 | HIGH | failure_mode validation missing — typo silently degrades to permissive behavior |
| H-02 | HIGH | assess() typed as Any instead of RAGResult — loss of type safety |
| H-03 | HIGH | _classify_with_llm creates new AsyncOpenAI() on every call — resource leak |
| H-04 | HIGH | Conversational pattern word-count guard missing — false positives on mixed queries |
| M-01 | MEDIUM | _build_explanation accepts avg_score but never uses it |
| M-02 | MEDIUM | Unused import: List in guardrails.py |
| M-03 | MEDIUM | MEDIUM quality prompt has unnecessary strict/permissive duplication |
| M-04 | MEDIUM | QueryRouteDecision not exported from __init__.py |
| M-05 | MEDIUM | test_max_tokens_respected has weak assertion |
| L-01 | LOW | No test for RAGResult.to_dict() including citations field |
| L-02 | LOW | Hardcoded confidence values in QueryRouter |
| L-03 | LOW | Typing import inconsistency (imports List but uses list) |
