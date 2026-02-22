# Section 06: Guardrails and Citations — Code Review Interview

## Triage

| ID | Severity | Action | Rationale |
|----|----------|--------|-----------|
| G01 | HIGH | **Auto-fix** | Remove raw scores from explanations shown to users. Use qualitative language instead. |
| G02 | MEDIUM | **Auto-fix** | Remove dead if/else branch for MEDIUM, keep single implementation |
| G03 | MEDIUM | **Let go** | chunk_id is a convenience field; consumer can look up all chunks by parent_doc_id+section if needed. Dedup is working as designed. |
| G04 | MEDIUM | **Auto-fix** | Use doc_id as fallback dedup key when parent_doc_id is None |
| G05 | MEDIUM | **Auto-fix** | Restrict conversational patterns to short queries (< 8 words) to avoid greeting+question misclassification |
| G06 | MEDIUM | **Let go** | Creative regex patterns match the plan spec. Adjective insertion is an optimization for later. |
| G07 | LOW | **Auto-fix** | Validate failure_mode in constructor, raise ValueError for invalid values |
| G08 | LOW | **Let go** | Edge case unlikely in practice; confidence_score clamp handles >1.0 |
| G09 | LOW | **Let go** | re.IGNORECASE handles this; adding tests is diminishing returns |
| G10 | LOW | **Let go** | Dedup is tested indirectly by other tests |
| G11 | LOW | **Let go** | Token estimation is approximate throughout; consistent with get_context() |
| G12 | LOW | **Let go** | Stub is intentional per plan; test validates contract for Section 07 |
| G13 | INFO | **Let go** | Section 07 executor will handle response filtering; not this module's concern |

## Auto-fixes Applied

### FIX-1: G01 — Remove raw scores from user-facing explanations
Replace numeric scores with qualitative descriptions.

### FIX-2: G02 — Remove dead MEDIUM branch duplication
Simplify build_system_prompt_suffix MEDIUM case.

### FIX-3: G04 — Fix (None, None) dedup key collapse
Use doc_id as fallback when parent_doc_id is None.

### FIX-4: G05 — Add word count guard for conversational patterns
Only classify as CONVERSATIONAL if query has fewer than 8 words.

### FIX-5: G07 — Validate failure_mode in constructor
Raise ValueError for invalid failure_mode values.
