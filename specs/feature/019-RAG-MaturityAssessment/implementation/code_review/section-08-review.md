# Section 08 Code Review: Evaluation and Observability

## HIGH
- **H1**: `Reranker.last_strategy_used` does not exist — always falls back to "cross_encoder"
- **H2**: `evaluate_single()` omits tenant_id — engine returns empty results
- **H3**: Cache-hit path logs quality="unknown" instead of computing from cached result

## MEDIUM
- **M4**: Observability tests use caplog JSON parsing — works with structlog config
- **M5**: Bare `except Exception: pass` too broad for guardrails assessment
- **M6**: Hard negatives use trivial patterns
- **M7**: Quality gate thresholds hardcoded with no override

## LOW
- L8-L13: Missing shuffle, Precision@K semantics, per-item persistence, subprocess paths, diff noise, schema validation
