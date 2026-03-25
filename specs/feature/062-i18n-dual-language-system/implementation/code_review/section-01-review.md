# Section 01 Code Review — Shared Config + Package Installation + Vite Chunk

**Spec**: `specs/feature/062-i18n-dual-language-system/sections/section-01-shared-config.md`
**Diff**: `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-01-diff.md`
**Reviewer**: SSP Reviewer Agent (CMD-8)
**Date**: 2026-03-24

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `apps/web/package.json:126,151` | `react-i18next@^16.6.5` declares a peer dependency on `i18next >=24.0.0 <26`. `i18next@^25.10.8` satisfies this but `^25` allows pnpm to resolve a patch above 25.x that could drift. More critically: `i18next` v25 is a major — its own changelog confirms breaking changes to the `TypeOptions` interface used by `react-i18next`. No `pnpm install` lockfile entry is in this diff, so the peer-dep contract is unverified. If the installed `react-i18next` v16 was built against `i18next` v23/v24 internals, `useTranslation` type inference will break at compile time. | Pin `react-i18next` to `"^15.5.0"` (which has confirmed compat with i18next v23–v25) **or** add an `engines` comment block in `package.json` and verify `pnpm install --frozen-lockfile` succeeds in CI before merging. At minimum, add a `pnpm ls i18next react-i18next` check step to the PR checklist. |
| MEDIUM | `apps/web/client/src/lib/i18n/types.ts:13` | A parallel, bespoke i18n system already exists at `apps/web/client/src/lib/i18n/` (`Locale = "en" \| "th"`, `useI18n`, `I18nProvider`, `AVAILABLE_LOCALES`, `LOCALE_LABELS`). The new `apps/web/shared/i18n.ts` introduces an overlapping set of constants (`SUPPORTED_LANGUAGES`, `LANGUAGE_LABELS`, `DEFAULT_LANGUAGE`) with partially conflicting semantics: the old system uses `Locale` for a 2-entry union; the new one uses `SupportedLanguage` for a 19-entry tuple. No section of the spec documents migration from the old system or how they co-exist during the transition. Downstream sections that import `@shared/i18n` while callers of `useI18n` still use the old `Locale` type will produce dual sources of truth for the active language. | Section 01 should minimally add a comment in `shared/i18n.ts` cross-referencing the existing bespoke system, and the spec plan must include a migration path. The `Locale` type in `client/src/lib/i18n/types.ts` should eventually be replaced with `SupportedLanguage` (or narrowed to `Extract<SupportedLanguage, "en" \| "th">`). Raise this as a BLOCKING prerequisite in the plan before section-06 is implemented. |
| MEDIUM | `apps/web/shared/__tests__/i18n.test.ts:63–74` | The `LANGUAGE_LABELS` and `LANGUAGE_LABELS_EN` exhaustiveness tests use `toBeTruthy()` on `LANGUAGE_LABELS[lang]`. Because `LANGUAGE_LABELS` is typed as `Record<SupportedLanguage, string>`, TypeScript already enforces all keys are present at compile time. The runtime test therefore adds no safety beyond what the type system guarantees. However, there is no test that verifies **none of the label values contain HTML markup** — the security requirement stated in the comment at line 1 of `shared/i18n.ts` ("Translation values MUST be plain text only. No HTML markup.") is unverified by any test in this section. | Add a test that asserts no value in `LANGUAGE_LABELS` or `LANGUAGE_LABELS_EN` matches `/<[^>]+>/`. Example: `expect(value).not.toMatch(/<[^>]+>/)`. |
| MEDIUM | `apps/web/shared/i18n.ts` (entire file) | The spec's **Interface Contract** section specifies the server import path as `import { SUPPORTED_LANGUAGES } from "../../shared/i18n"`. No server file in this diff imports from `shared/i18n.ts`, and the server-side tsconfig path resolution is unverified. The `@shared/` alias is defined only in `vite.config.ts` (client-side Vite build) and is absent from the server-side `tsconfig.json`. Server files must use the relative path. If any downstream server section mistakenly uses `@shared/i18n` it will fail at Node.js runtime with `Cannot find module`. | Verify (or add to the spec for section-07) that `apps/web/tsconfig.json` or `apps/web/server/tsconfig.json` does NOT resolve `@shared/` — or add a note in `shared/i18n.ts` clarifying the correct server import pattern. |
| LOW | `apps/web/shared/__tests__/i18n.test.ts:91` | The BCP-47 regex `/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/` is correct for the current 19 codes but is structurally ambiguous: it allows a region tag (`-[A-Z]{2}`) without a script tag, and a script tag (`-[A-Z][a-z]{3}`) without a region. This is intentional and correct for the current list. However, if a future language is added with only a region subtag (e.g., `"en-US"`), the regex passes but the existing `LANGUAGE_LABELS` exhaustiveness would silently break the type union. The test description "all codes match BCP-47 pattern" slightly overstates — it only validates a subset of BCP-47 structure. | Add a comment in the test clarifying the regex covers the subset of BCP-47 used by this project (2–3 char primary, optional 4-char script, optional 2-char region). No code change required, documentation only. |
| LOW | `apps/web/package.json` (diff context) | The diff adds `i18next-resources-to-backend@^1.2.1` but this package is not used in any file in this section's diff. It is only used by the client-side i18next init (section-02/03). Installing it at this stage is correct per the spec, but no test or import in section 01 exercises it — meaning a broken install of that package would not be caught by section-01 tests. | No change required for section 01. Document in the section-02 spec that `i18next-resources-to-backend` is expected to already be installed by section-01, so the section-02 test suite validates it implicitly. |

---

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| Security comment at top of `shared/i18n.ts` (spec §Files to Create) | PASS | Lines 1–3 match spec verbatim |
| `SUPPORTED_LANGUAGES` is a 19-entry readonly const tuple with `en` first | PASS | Line 5–8 of `shared/i18n.ts` |
| `SupportedLanguage` type exported | PASS | Line 10 |
| `RTL_LANGUAGES` readonly tuple with `["ar"]` | PASS | Line 12 |
| `RtlLanguage` type exported | PASS | Line 13 |
| `DEFAULT_LANGUAGE` typed as `SupportedLanguage`, value `"en"` | PASS | Line 15 |
| `LANGUAGE_LABELS` — all 19 native-script labels correct | PASS | Lines 17–37 match spec table exactly |
| `LANGUAGE_LABELS_EN` — all 19 English labels correct | PASS | Lines 39–59 match spec table exactly |
| `LANGUAGE_COVERAGE` — `en: 100`, `th: 15`, all others `0` | PASS | Lines 61–81 |
| No imports from `i18next` or any package in `shared/i18n.ts` | PASS | File has zero import statements |
| All maps are `Record<SupportedLanguage, ...>` (exhaustive at compile time) | PASS | TypeScript union exhaustiveness enforced |
| Vite `vendor-i18n` chunk added after `vendor-xlsx` block | PASS | `vite.config.ts` diff lines 204–211, correct placement and all 3 packages included |
| `apps/web/package.json` adds `i18next`, `react-i18next`, `i18next-resources-to-backend` | PASS | Diff lines 9–11 and 18 |
| Test file at `shared/__tests__/i18n.test.ts` with all 13 spec-required test cases | PASS | All 13 tests present and correctly authored |
| No runtime dependencies in `shared/i18n.ts` | PASS | Pure constants and types |
| `i18next-browser-languagedetector` NOT installed (not in spec) | PASS | Absent from diff |

---

### Summary

The implementation is a clean, accurate delivery of the spec. All 6 required exports are present with correct types and values, the Vite chunk is placed correctly, and all 13 specified test cases are implemented. Three issues warrant attention before downstream sections build on this foundation: (1) the `react-i18next` v16 / `i18next` v25 peer-dependency compatibility should be verified with a lockfile check in CI, as no `pnpm-lock.yaml` diff is present; (2) the existing bespoke `client/src/lib/i18n/` system creates a dual-source-of-truth risk that must be formally addressed in the migration plan before sections that wire i18next to the UI land; and (3) the security-comment requirement for HTML-free translation values has no corresponding test. The Vite chunk and package additions are correct and low-risk.
