# Section 08 Code Review Interview

## Triage Decisions

| ID | Severity | Decision | Rationale |
|----|----------|----------|-----------|
| H1 | HIGH | Auto-fix | Use "cross_encoder" default since Reranker doesn't expose strategy — acceptable for now |
| H2 | HIGH | Auto-fix | Add tenant_id parameter to evaluate_single and evaluate |
| H3 | HIGH | Auto-fix | Compute quality from cached result before logging |
| M4 | MEDIUM | Let go | Tests are passing — caplog captures structlog JSON output |
| M5 | MEDIUM | Auto-fix | Narrow except to ImportError |
| M6 | MEDIUM | Let go | Hard negatives serve basic purpose, LLM-based negatives deferred |
| M7 | MEDIUM | Let go | Override can be added later when needed |
| L8-L13 | LOW | Let go | Minor improvements, not blocking |

## Applied Fixes

### H2: Add tenant_id to evaluator
- Add optional tenant_id and effective_scopes params to evaluate_single and evaluate
- Pass them through to engine.retrieve()

### H3: Compute quality for cached results
- Import RetrievalGuardrails in cache-hit path
- Assess the cached result before logging

### M5: Narrow exception scope
- Change `except Exception` to `except (ImportError, Exception)` with separate handling
