# Section-07 Review — Server-Side Language Allowlist

**Date:** 2026-03-25
**Branch:** codex/feature-044-multimodal-chat-memory
**Reviewer:** SSP Reviewer Agent (CMD-8)

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `apps/web/server/routers/translation.ts:43` | `targetLanguage` input on the `translate` procedure is **still `z.string().max(10).optional()`** — the section-07 diff only hardens the runtime fallback in the body (`rawLang → targetLang`), but a caller can still supply `targetLanguage: "en; DROP TABLE"` (9 chars, passes `max(10)`) and have it arrive in `rawLang`. The Zod guard on the **input** is the authoritative enforcement point; the body-level sanitisation is a second line of defence, not a replacement. | Change line 43 of `translation.ts` to `targetLanguage: z.enum(SUPPORTED_LANGUAGES).optional()` (same pattern as `users.ts`). |
| MEDIUM | `apps/web/server/routers/translation.ts:17-23` | `LANGUAGE_NAMES` map covers `zh`, `zh-TW`, `sv` but **not** the 19 `SUPPORTED_LANGUAGES` values. Notably absent: `en`, `zh-Hans`, `zh-Hant`, `pt-BR`, `ar`, `ru`, `hi`, `vi`, `id`, `it`, `nl`, `pl`, `tr`. When `targetLang` is one of these unlisted codes (e.g. `"ar"`) the fallback `LANGUAGE_NAMES[targetLang] \|\| targetLang` returns the raw BCP-47 code (e.g. `"ar"`) directly into the LLM system prompt. This is now safe from injection (the allowlist ensures it is a known code) but produces low-quality prompts: `"Translate to ar"` rather than `"Translate to Arabic"`. The map should be replaced by or derived from the `LANGUAGE_LABELS_EN` record already in `shared/i18n.ts`, which covers all 19 codes. | Replace the `LANGUAGE_NAMES` local map with `import { LANGUAGE_LABELS_EN } from "../../shared/i18n"` and use `LANGUAGE_LABELS_EN[targetLang as SupportedLanguage] ?? targetLang`. |
| MEDIUM | `apps/web/server/routers/media.ts:536-548` | `getUserTranslationLanguagePreference` reads `prefs.translationLanguage` from the DB and returns it as a raw `string` **without** validating against `SUPPORTED_LANGUAGES`. The spec §Security Context lists `media.ts` as a consumer of `translationLanguage`. The value is only used in `isThaiTranslationLanguage()` (which trims and lowercases) so the injection risk is low, but this is the unguarded read path the spec explicitly flagged. This function is not in the section-07 diff and remains unaddressed. | Add an allowlist guard inside `getUserTranslationLanguagePreference`: `return (SUPPORTED_LANGUAGES as readonly string[]).includes(rawLanguage) ? rawLanguage : "";` |
| MEDIUM | `apps/web/server/services/helpContentService.ts:116-118` | `getLocaleDir(locale)` constructs a filesystem path directly from the validated `locale` string: `path.join(getHelpBasePath(), locale)`. Even though `locale` is now validated by `z.enum(SUPPORTED_LANGUAGES)` at the router layer, the service accepts `locale: string` with no internal guard. A future caller (e.g. a server-side scheduled job, a new procedure using the service directly, or a test) could bypass the tRPC layer and supply an unvalidated value, producing a path-traversal vector (`locale = "../../../etc/passwd"`). The spec notes: "The `helpContentService` must also gracefully fall back to English when a requested locale's markdown directory doesn't exist" — this requirement is implemented (empty-array return when dir does not exist) but there is no English fallback: callers get an empty manifest/topic-list silently, not English content. | (a) Add an internal allowlist assert at the top of `loadTopicsFromLocale` and `getHelpTopic`. (b) Add an English-content fallback when the locale directory does not exist, as the spec requires. |
| LOW | `apps/web/server/routers/__tests__/users.i18n.test.ts:16-19` | The test file reconstructs the Zod schema locally rather than importing or exercising the actual `updatePreferences` router procedure. If the router schema diverges from the locally defined `updatePreferencesSchema` (e.g. someone adds a transform, changes the field name, or adds a `z.preprocess`) the tests will pass while the production validator has a different shape. | Import and test the schema directly from the procedure, or at minimum add a comment warning that the local schema must be kept in sync with `users.ts`. |
| LOW | `apps/web/server/routers/translation.ts:127` | `targetLang.toUpperCase()` in the credit deduction description uses `targetLang` (post-allowlist-validated), which for BCP-47 codes like `"zh-Hans"` or `"pt-BR"` produces `"ZH-HANS"` and `"PT-BR"` — cosmetically odd but harmless. No functional impact. | Use `LANGUAGE_LABELS_EN[targetLang] ?? targetLang` for the description label (dependency on the MEDIUM fix above). |

---

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| `users.ts updatePreferences` — `translationLanguage: z.enum(SUPPORTED_LANGUAGES)` | PASS | Implemented correctly at line 757. |
| `help.ts` — all 4 procedures widened to `z.enum(SUPPORTED_LANGUAGES)` | PASS | All 4 procedures updated. |
| `translation.ts` — `rawLang` → `targetLang` with allowlist fallback to `"en"` | PASS (body) | Body-level guard implemented, but the **input** validator is not upgraded — see HIGH finding. |
| `translation.ts` input `targetLanguage` validator hardened | **MISSING** | Still `z.string().max(10).optional()` — the single most important change per spec §Security Context. |
| `media.ts` consumer of `translationLanguage` hardened | **MISSING** | Not in the diff; `getUserTranslationLanguagePreference` returns unvalidated string. |
| `helpContentService` English fallback when locale dir missing | **MISSING** | Service silently returns empty; no English fallback as spec §help.ts note requires. |
| All 10 tests pass | PASS | Test assertions are correct for the schema under test. |
| Tests cover BCP-47 subtags (`zh-Hans`, `pt-BR`) | PASS | |
| Tests cover injection payloads (XSS, SQLi) | PASS | |
| `translationModel` field unchanged (`z.string().max(100)`) | PASS | |

---

### Summary

The core allowlist changes in `users.ts` and `help.ts` are implemented correctly and close the primary injection vector at the write path. The critical gap is that `translation.ts` hardens the *body* of the procedure but leaves the *input schema* (`targetLanguage: z.string().max(10).optional()`) untouched — meaning a caller can still supply a 9-character arbitrary string that passes Zod, reaches `rawLang`, and only gets sanitised by the runtime check rather than rejected at the schema boundary. Additionally, two downstream consumers identified in the spec's security context — `media.ts` and `helpContentService` — remain unguarded. The section is close to complete but needs the input validator fixed and the two unaddressed consumer paths resolved before the security guarantee is sound end-to-end.
