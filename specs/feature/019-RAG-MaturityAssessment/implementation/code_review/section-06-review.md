# Section 06: Guardrails and Citations — Code Review

## Findings Summary

| ID | Severity | Description |
|----|----------|-------------|
| G01 | HIGH | Permissive LOW/MEDIUM/HIGH explanations leak raw retrieval scores |
| G02 | MEDIUM | Dead code duplication in MEDIUM system prompt suffix |
| G03 | MEDIUM | Citation dedup silently drops chunk_id for subsequent chunks |
| G04 | MEDIUM | (None, None) dedup key collapses all untagged documents |
| G05 | MEDIUM | Query router "hi" regex false positive on "Hi, what is the refund policy?" |
| G06 | MEDIUM | Creative regex too rigid - misses "write me a short poem" |
| G07 | LOW | failure_mode accepts any string without validation |
| G08 | LOW | No test for negative or >1.0 scores |
| G09 | LOW | No test for mixed-case query router input |
| G10 | LOW | Missing test for same-parent same-section dedup |
| G11 | LOW | header_tokens=20 magic constant underestimates |
| G12 | LOW | _classify_with_llm is a stub - test patches dead code |
| G13 | INFO | to_dict() exposes citation metadata unconditionally |
