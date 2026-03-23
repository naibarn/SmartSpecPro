# Section 02 Review: Interview Replacement

**Feature**: 058 — Agency Creator Intelligence Upgrade
**Section**: 02 — Interview Replacement
**Reviewer**: SmartSpecPro Reviewer Agent (CMD-8)
**Date**: 2026-03-24

---

## Summary

The implementation correctly delivers the core interview-replacement contract: technical questions are filtered client-side before display, goal-question count is capped at 3, and `discover_analysis` flows through both the skip-interview and awaiting-answers paths via Celery payload (not only Redis). Three clean test classes cover the new surface area. One HIGH finding blocks merge: `discover_analysis` is extracted into `_design_async` at line 259 but is never forwarded to `_llm_plan()` or `_llm_design()` — the spec's explicit requirement ("Pass to `_llm_plan()` and `_llm_design()` as additional context") is unimplemented. Two MEDIUM findings relate to filter robustness and a missing API-level passthrough test.

---

## Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agency_creator_task.py:288,313` | `discover_analysis` read from payload at line 259 but never passed to `_llm_plan()` or `_llm_design()`. The spec §Change 3 explicitly requires passing it as additional context to both functions. The LLM that designs the agency spec therefore never sees the capability recommendations derived from discover, which is the primary purpose of this section. | Add `discover_analysis` parameter to `_llm_plan()` and `_llm_design()` signatures. Inject the capability flags and complexity level into their system/user prompts so the design LLM knows which tools to assign. |
| MEDIUM | `agency_creator_task.py:35-37` | `TECHNICAL_KEYWORDS` includes `"react"` as a bare substring. This will incorrectly suppress a legitimate goal question such as "How should users react to generated content?" or "What's the user reaction we want?". The keyword matching is case-folded but not word-boundary anchored. | Use word-boundary matching: `re.search(r'\breact\b', q.lower())` for the `"react"` entry, or replace it with the more specific `"react executor"` / `"reactexecutor"` patterns that are actually technical. |
| MEDIUM | `tests/test_agency_creator_v2.py` (no test) | No test covers the `/answer` endpoint path in `agency_creator.py`. The `_discover_analysis` round-trip through Redis → answer submission → design payload is verified only at the Celery task level. A regression in `submit_agency_creator_answers` (e.g., `discover_analysis` key renamed) would not be caught. | Add an `httpx.AsyncClient` / FastAPI `TestClient` test for `POST /api/v1/agency-creator/answer` asserting `_discover_analysis` is present in the dispatched design payload. |
| LOW | `agency_creator_task.py:41-47` | `_filter_goal_questions` applies the keyword filter then slices to `MAX_GOAL_QUESTIONS`. If the LLM returns 10 questions where questions 1-3 are goal questions and 4-10 are technical, the result is correct. But if questions 1-3 are technical and 4-6 are goal questions, the caller sees 3 goal questions — also correct. The current behaviour is fine, but there is no doc comment explaining the ordering invariant (or lack thereof). | Add a one-line docstring note: "Order is preserved from LLM output; first MAX_GOAL_QUESTIONS non-technical questions are returned." |
| LOW | `tests/test_agency_creator_v2.py:148-152` | `test_filters_all_technical_keywords` iterates TECHNICAL_KEYWORDS and asserts each produces an empty result. This will fail for `"react"` if the question text is "Should we use react?" because `"react"` is inside `"react"` — actually passes. However the test uses `f"Should we use {kw}?"` for the multi-word keyword `"execution mode"`, producing `"Should we use execution mode?"` — contains `"execution mode"` so it passes. The test is structurally sound but does not catch the false-positive case (non-technical questions suppressed by `"react"`). | Add a negative test: assert a question containing "react" in a goal context (e.g., "How will users react?") is NOT filtered. |

---

## Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| Filter technical questions before `awaiting_answers` | PASS | `_filter_goal_questions` applied at line 188 |
| Only goal-clarification questions shown to user | PARTIAL | Filter logic works but `"react"` keyword is too broad (MEDIUM finding) |
| Cap at 3 goal questions | PASS | `filtered[:MAX_GOAL_QUESTIONS]` with `MAX_GOAL_QUESTIONS = 3` |
| Pass `discover_analysis` via Celery payload on skip-interview | PASS | Lines 183, 194 |
| Pass `discover_analysis` via Celery payload after interview answers | PASS | `agency_creator.py` lines 136-139 |
| Store `_discover_analysis` in Redis for answer-submission path | PASS | Line 207 |
| `_design_async` reads `discover_analysis` from payload | PASS | Line 259 |
| Pass `discover_analysis` to `_llm_plan()` and `_llm_design()` | FAIL | Neither function receives nor uses the value (HIGH finding) |
| TDD: `test_technical_questions_filtered` | PASS | `TestFilterGoalQuestions.test_technical_questions_filtered` |
| TDD: `test_discover_analysis_passed_to_design` | PASS | `TestDiscoverAnalysisPassthrough.test_discover_analysis_passed_to_design_on_skip_interview` |
| TDD: `test_skip_interview_uses_discover_analysis` | PASS | `test_discover_analysis_passed_when_is_clear` |

---

## Verdict: NEEDS_FIX

The implementation is well-structured and the Redis passthrough plumbing is correct. However the declared goal of the section — ensuring capability recommendations from the discover phase influence how the design LLM assigns tools and complexity — is not realised. `discover_analysis` is threaded through every handoff point but is silently ignored once `_design_async` unpacks it. Until `_llm_plan` and `_llm_design` accept and use this data in their prompts, the feature delivers no capability-aware design improvement. The `"react"` false-positive filter risk is secondary but should be addressed in the same pass.
