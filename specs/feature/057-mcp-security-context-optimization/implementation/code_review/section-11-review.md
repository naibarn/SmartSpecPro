# Section 11 Code Review — Few-Shot Relevance Filtering + RAG Deduplication

**Spec:** `section-11-fewshot-rag-optimization.md`
**Diff:** `section-11-diff.md`
**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-23

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `test_few_shot_relevance.py:11` | **Wrong patch target for deferred local import** — `EMBED_SVC = "app.orchestrator.vector_store.embedding_service.EmbeddingService"` patches the class in the source module, but the production code imports `EmbeddingService` via a deferred `from ... import` _inside_ the function body on each call. Python resolves the name at import time in the local scope, not from the source module namespace. The correct patch target is `"app.services.agency_few_shot.EmbeddingService"` — however since the import is inside the `try` block (not at module level), the name never exists as a module attribute at all. The tests may appear to pass only if they are running against a version where the import was module-level. This is the same pattern flagged as HIGH-1 in the Section-09 review. | Move the `from app.orchestrator.vector_store.embedding_service import EmbeddingService` import to module level in `agency_few_shot.py`, then patch `"app.services.agency_few_shot.EmbeddingService"`. |
| HIGH | `agency_few_shot.py:92,94` | **`hash()` as cache key is non-deterministic across Python processes** — Python randomizes `hash()` for strings by default (`PYTHONHASHSEED`). The `_example_embedding_cache` uses `hash(ex_text)` as a key. Within a single process lifetime this is consistent, but two different processes (e.g., multiple Celery workers) will use different keys for the same text, defeating the cross-worker intent. More critically, a hash collision between two different strings causes a cache poisoning: example B gets example A's embedding silently, with no detection. The collision probability with a 64-bit signed integer is low but non-zero at scale. | Use `hashlib.md5(ex_text.encode()).hexdigest()` as the cache key (same approach used in `deduplicate_chunks`), which is deterministic and collision-resistant enough for this purpose. |
| MEDIUM | `agency_few_shot.py:96-97` | **FIFO eviction fires after insert, not before** — the new entry is added to the cache at line 94 (`_example_embedding_cache[cache_key] = ...`), and then the eviction check runs at lines 96-97. This means the cache can momentarily hold `_CACHE_MAX_SIZE + 1` entries before the oldest is removed. For a max size of 200 this is inconsequential in practice, but the check should be `>= _CACHE_MAX_SIZE` (evict before insert) or the comment should be corrected to say "evict after insert". | Check `if len(_example_embedding_cache) >= _CACHE_MAX_SIZE` before inserting, and evict first, then insert. |
| MEDIUM | `agency_few_shot.py:83-108` | **`select_relevant_examples` is not called anywhere in the production codebase** — a grep of all callers in `app/` shows `select_relevant_examples` is only defined but never called. The existing `agency_orchestrator.py` (line 1542) and `agency_swarm_adapter.py` still use `prepend_examples` directly without first calling the new relevance filter. The feature is dead code until the call site is wired. | Wire `select_relevant_examples` into the path in `agency_orchestrator.py` (around line 1540) where `node.get("examples")` is consumed, and in any other call site that passes examples to `prepend_examples`. |
| MEDIUM | `test_few_shot_relevance.py:335-358` | **Cache test undercounts task embeddings** — the comment says "5 examples + 1 task = 6 embed calls" and asserts `first_count == 6`. This is correct. For the second call, the test asserts `second_count == 1` (only the new task). However the assertion is brittle: if a different `task_text` string were used on the first call, and the cache is not seeded for that task, the actual task embed for "task one" is not cached between calls (tasks are never cached, only examples). The test is currently correct _only_ because examples are the only cached items. The assertion and comment should explicitly state that task embeddings are intentionally never cached, so this is expected behavior — not an accidental gap. | Add a comment or assertion confirming `"task one"` is not in `_example_embedding_cache` after the first call, to document that task embeddings are never cached. |
| MEDIUM | `test_rag_dedup.py:203-217` | **`test_dedup_preserves_ranking_order` relies on caller pre-sorting but does not test the guard** — the spec states "Chunks must be pre-sorted by score descending so that the first occurrence of each content hash is the highest-scored duplicate." The test provides pre-sorted input and verifies the output is sorted. It does not test what happens when the caller passes an unsorted list — in which case `deduplicate_chunks` will silently keep the _first_ (not highest-scored) duplicate. There is no guard or assertion in `deduplicate_chunks` that the input is sorted, and the integration call site (`reranked_docs` after reranker) may not always guarantee ordering. | Either add a pre-sort step inside `deduplicate_chunks` itself (`chunks = sorted(chunks, key=lambda c: c.final_score, reverse=True)` before the loop), or add a test covering unsorted input to document the silent failure mode. |
| LOW | `agency_few_shot.py:91` | **Empty `ex_text` is embedded unnecessarily** — if an example dict has neither `"user_message"` nor `"input"` keys (or both are empty strings), `ex_text` resolves to `""`. An empty string is embedded, cached under `hash("")`, and compared via cosine similarity against the task. This does not break anything but wastes an embedding call. | Add `if not ex_text: continue` (and append a default low-similarity score of 0.0 instead) to skip embedding empty example texts. |
| LOW | `test_few_shot_relevance.py:295-331` | **`test_more_than_three_filtered_to_top_three` does not assert exclusions** — the spec says "Assert top 3 includes coding example, excludes cooking/sales." The test asserts that the coding example is _in_ the result but does not assert that cooking (`"Recipe for chocolate cake"`) and sales (`"Create a sales pitch for insurance"`) are _not_ in the result. A broken implementation that returns all examples or the wrong 3 could pass this test. | Add negative assertions: `assert "Recipe for chocolate cake" not in result_texts` and `assert "Create a sales pitch for insurance" not in result_texts`. |
| LOW | `hybrid_rag.py:557-559` | **`deduplicate_chunks` applied to `combined_docs` before rerank candidate slicing is not consistent** — in the `else` branch (no reranking), dedup runs on all `combined_docs` before the `[:top_k]` slice, which is correct. In the rerank branch, dedup runs only on `reranked_docs` which is already sliced to `rerank_top_k` (default 5) candidates. If `top_k > rerank_top_k`, the rerank path silently returns fewer results than the non-rerank path, and dedup on a 5-item list is unlikely to do any useful work. This is a pre-existing architectural concern but the dedup insertion makes the asymmetry more visible. | Document the known asymmetry, or apply dedup to `combined_docs` before `rerank_candidates = combined_docs[:top_k * 2]` in the rerank path so duplicates are removed before reranking as well. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| Spec TDD: `<=3 examples pass through unchanged` | PASS | `test_few_examples_pass_through_unchanged` and `test_exactly_three_examples_pass_through` both present |
| Spec TDD: `>3 examples filtered to top 3 by relevance` | PARTIAL | Test present but missing exclusion assertions (LOW finding) |
| Spec TDD: `embedding cache prevents redundant embed calls` | PASS | `test_embedding_cache_prevents_redundant_calls` covers the pattern |
| Spec TDD: `handles embedding service failure gracefully` | PASS | `test_embedding_failure_falls_back_to_first_three` present |
| Spec TDD: `duplicate chunks removed, highest score kept` | PASS | `test_duplicate_chunks_removed_highest_score_kept` present |
| Spec TDD: `near-duplicate detection via content hash` | PASS | `test_near_duplicate_via_content_hash` present |
| Spec TDD: `different content chunks preserved` | PASS | `test_different_content_chunks_preserved` present |
| Spec TDD: `deduplication preserves ranking order` | PARTIAL | Test present but relies on pre-sorted input; no guard inside function (MEDIUM finding) |
| `EmbeddingService.embed()` method name | PASS | Implementation correctly uses `service.embed(text)`, matching the real method signature (not `embed_text`) |
| `Document` dataclass fields used (`content`, `final_score`, `doc_id`) | PASS | All fields exist on `Document` dataclass in `hybrid_rag.py` |
| Spec security note: MD5 not for crypto | PASS | Docstring explicitly documents this |
| Spec security note: cache max size 200, FIFO eviction | PASS | Implemented with `OrderedDict` and `popitem(last=False)` |
| `select_relevant_examples` wired at call site | FAIL | Function is dead code — no caller in production code (MEDIUM finding) |
| Patch target correctness in tests | FAIL | `EMBED_SVC` patches the wrong module path for a deferred import (HIGH finding) |

---

### Summary

The core algorithmic implementations are correct and well-structured: `deduplicate_chunks` uses MD5 on normalized content as specified, and `select_relevant_examples` uses cosine similarity with a properly typed `OrderedDict` cache with FIFO eviction. The most significant risk is a pair of HIGH findings: the test mock patch target is almost certainly wrong because the `EmbeddingService` import is deferred inside the function body (the same class-of-bug flagged in section-09), and the `hash()` cache key is non-deterministic across processes. Additionally, the new `select_relevant_examples` function is never called from production code — the existing orchestrator paths still inject examples via `prepend_examples` directly, making the relevance filtering a no-op until wired in.
