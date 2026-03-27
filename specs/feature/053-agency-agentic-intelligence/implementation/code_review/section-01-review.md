# Code Review — Section 01: Foundation (Shared Infrastructure)
**Feature:** 053 Agency Agentic Intelligence
**Reviewer:** SmartSpecPro Reviewer Agent (CMD-8)
**Date:** 2026-03-23

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| MEDIUM | `agentic_limits.py:18` | `_env_int` raises `ValueError` on a non-integer env var (e.g. `SSP_MAX_REFLECTION_CYCLES=abc`). At module import time this becomes an unhandled crash that kills the entire FastAPI process with no useful diagnostic message. | Wrap `int(...)` in a try/except and fall back to the default with a logged warning: `try: return int(raw) except ValueError: logger.warning(...)` |
| MEDIUM | `agentic_sanitizer.py:40` | `if not text:` evaluates `None` as falsy and returns `""`. The function signature declares `text: str` but calling code (future sections) may pass `None` from optional DB fields. Silently coercing `None → ""` can mask missing-data bugs; `sanitize_llm_input(None)` should either raise `TypeError` or the signature should be `text: str \| None`. The doc string describes "empty input" only, not `None`. | Change signature to `text: str \| None` and document the `None → ""` behavior explicitly, or add `if text is None: raise TypeError(...)` to match the declared `str` type. |
| MEDIUM | `test_agentic_limits.py` | `test_limits_read_from_env` calls `importlib.reload(mod)` after `monkeypatch.setenv`. However, `monkeypatch` only restores state after the test; any other test that imports `agentic_limits` in the same process session after this test may see the reloaded (env-influenced) module object stored in `sys.modules`. The reload is necessary but the test should use a fresh import rather than relying on the existing module reference, otherwise constant ordering across the test suite can affect results. | Use `importlib.reload(importlib.import_module("app.services.agentic_limits"))` and assert on the freshly-reloaded module object. Also add a teardown `importlib.reload(mod)` call (or a second `monkeypatch` reset) to leave module state clean. |
| MEDIUM | `test_agentic_limits.py`, `test_agentic_sanitizer.py`, `test_agentic_strategies.py` | None of the three test files use `@pytest.mark.unit`. All existing unit tests in `python-backend/tests/unit/services/` use this marker (e.g., `test_agency_guardrails.py`). Without the marker these tests cannot be run selectively via `pytest -m unit` and they skip the coverage enforcement gate for the `unit` category. | Add `@pytest.mark.unit` to every test function in all three files. |
| LOW | `agentic_sanitizer.py:22` | The `"You are now\s"` pattern replacement produces `"[FILTERED] "` (trailing space) while every other replacement produces `"[FILTERED]"` (no trailing space). The trailing space is intentional (to replace the captured whitespace), but `\s` does not capture the space into the replacement — the `\s` in the pattern is consumed, yet the replacement appends a literal space. This creates inconsistently spaced output and the behavior is not documented. | Either use `"[FILTERED]"` (dropping the extra space) for consistency, or document why the trailing space is preserved. Alternatively, use a capturing group: `r"(You are now)\s"` with replacement `r"\1 [FILTERED] "`. |
| LOW | `agentic_sanitizer.py:28` | `_NON_PRINTABLE_RE` allows the full `\u0080-\uFFFF` range, which includes the Unicode private-use area (`\uE000-\uF8FF`) and certain control-adjacent blocks. Private-use characters are sometimes used as injection anchors in adversarial inputs targeting models with custom tokenizers. | Consider adding a secondary pass to strip or warn on private-use area characters (`\uE000-\uF8FF`, `\uFFF0-\uFFFF`). At minimum, document the current decision to allow extended Unicode. |
| LOW | `test_agentic_strategies.py:394-405` | `test_all_templates_contain_completion_instruction` uses `"complete" in result.lower()` as a fallback, which would pass even if the word "complete" appeared in a sentence like "complete your analysis" without the required JSON structure. The assertion is too loose to catch a malformed completion signal. | Assert the exact required JSON literal: `'{"complete": true' in result` or check for the double-brace escaped form `'{{"complete": true' in the raw template string. |
| LOW | `agentic_strategies.py` (all templates) | The completion signal instruction uses Python `str.format()`-escaped double braces `{{"complete": true, ...}}`. This is correct for template rendering, but any future maintainer adding a new `{placeholder}` to the template body could accidentally introduce a `KeyError` at call time if they forget to escape literal braces. | Add a module-level comment: `# NOTE: literal braces in template strings must be doubled ({{ }}) because get_planning_prompt uses str.format().` |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| All 9 constants present in `agentic_limits.py` | PASS | Exact names match spec table; defaults match. |
| `clamp_to_limit(user_value, limit) -> int` exported | PASS | Signature and behavior (`max(0, min(...))`) match spec. |
| Env var names all use `SSP_*` prefix | PASS | All 9 constants use the correct prefix. |
| `sanitize_llm_input(text, max_length=10000) -> str` exported | PASS | Signature matches; default matches spec. |
| All 10 injection patterns from spec implemented | PASS | `[SYSTEM]`, `[/SYSTEM]`, `[INST]`, `[/INST]`, `<|im_start|>`, `<|im_end|>`, `<|endoftext|>`, `Ignore previous instructions`, `You are now\s`, `Disregard all prior`, `IMPORTANT:\s*Override` — all 11 patterns present (spec listed 10; one extra was `[/INST]` which is an appropriate addition). |
| Non-printable strip regex matches spec | PASS | `[^\x20-\x7E\n\t\r\u0080-\uFFFF]` matches the spec prescription exactly. |
| Processing pipeline order (strip → inject-filter → truncate) | PASS | Order matches spec §Module 2. |
| `get_planning_prompt(strategy, max_cycles) -> str` exported | PASS | Signature matches. |
| All 3 strategy templates present (`basic`, `cot`, `react`) | PASS | All three implemented. |
| All templates include `{max_cycles}` injection point | PASS | Correct use of `str.format()`. |
| All templates include required completion JSON block | PASS | Both `true`/`false` completion blocks present in every template. |
| `ValueError` raised for unknown strategy | PASS | Error message includes the strategy name and lists valid options. |
| No modifications to existing files (spec scope constraint) | PASS | Diff is entirely new files. |
| `@pytest.mark.unit` marker on all test functions | FAIL | No marker decorators present on any of the 13 test functions. |
| `test_limits_read_from_env` module isolation | PARTIAL | Reload is present but teardown is missing, leaving module state dirty for subsequent tests. |

---

### Summary

The implementation is a clean, complete delivery of the spec's three foundation modules. All public API names, default values, env var prefixes, processing pipeline ordering, and template content match the specification exactly. The code is well-structured, purely synchronous as required, has no external dependencies, and is correct for the primary execution paths.

Three issues warrant fixes before merging: the absence of `@pytest.mark.unit` markers breaks selective test runs and coverage gating (project-wide convention); `_env_int` will crash the FastAPI process at startup on a malformed env var value; and the reload test leaves dirty module state that can affect other tests in the same session. The `None`-vs-`str` type ambiguity in the sanitizer signature is worth resolving before downstream sections start passing optional DB fields to it.
