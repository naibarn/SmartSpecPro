---
name: Spec 062 i18n Section-06 Backward Compatibility Review
description: Review of context.tsx backward-compat shim and accompanying tests for Spec 062 Section-06
type: project
---

Verdict: CONDITIONAL PASS (2026-03-25)

1 HIGH, 2 MEDIUM, 2 LOW findings.

**HIGH-1 — `setLocale` is a new arrow function on every render, not memoized**: The old implementation used `useCallback`. The new `setLocale` is created inline inside `useI18n()` on every call. Consumers that pass `setLocale` as a prop or put it in a dependency array (e.g., `useEffect`) will re-fire on every render — a behavioral regression from the old API.

**MEDIUM-1 — `locale` type cast is unsafe for unknown languages**: `(i18n.resolvedLanguage ?? i18n.language) as Locale` will produce a type lie if i18next is initialised with a language not in `Locale = "en" | "th"` (e.g., "fr", "en-US"). Callers that do `locale === "th"` may get unexpected silent fallthrough behaviour rather than a TypeScript error.

**MEDIUM-2 — Namespace set hardcoded to ["help","common","admin"] with no escape hatch**: All 13 consumers are silently limited to these three namespaces. Any consumer that later calls `t("settings.foo")` or `t("workflow.bar")` will get key-as-string fallback without any indication of misconfiguration. The namespace list needs a comment linking to the migration tracking issue, and an audit of actual key prefixes used by all 13 consumers is needed to confirm no key is missing a namespace.

**LOW-1 — `dict: {}` contract gap**: The `dict` field returns `{}` permanently. No consumer currently reads `.dict` directly (confirmed by grep), but the interface still declares it as `TranslationDictionary`. If a consumer is added before Wave 3 cleanup, it gets an empty object silently. Consider `never` type or a runtime warning in dev.

**LOW-2 — Test module caching across language-change tests**: Tests import `../context` with dynamic `await import(...)` inside each `it()`. Because Vitest caches modules between tests in a suite, the same `useI18n` function is shared, but the tests rely on `testI18n.changeLanguage()` mutating shared singleton state. An out-of-order test run (e.g. parallel) could produce flaky locale assertions. The `beforeAll` init is correct but there is no `afterAll` cleanup.

Review file: `.claude/agent-memory/ssp-reviewer/project_062_i18n_section06_review.md`

**Why:** Section-06 backward compat correctness is critical — 13 active consumers depend on it working identically to the old implementation.
**How to apply:** Track these findings against the Wave 3 migration; HIGH-1 is a pre-merge blocker.
