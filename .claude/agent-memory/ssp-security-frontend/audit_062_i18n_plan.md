---
name: audit_062_i18n_plan
description: 2026-03-24 frontend security audit of feature-062 i18n dual-language plan (sections 01-13): 5 stub sections never written, LLM prompt injection via unvalidated language code, translation.ts allowlist bypass, missing S4 comment in locale files, escapeValue:false not documented in all sections
type: project
---

Feature-062 i18n plan security audit (2026-03-24):

- Sections 01, 06, 07, 08, 11 are STUB FILES (only contain researcher notes, no actual implementation guidance). These are critical unimplemented sections.
- translation.ts:57 uses `prefs.translationLanguage || targetLang` (raw DB value) as `${langName}` inside an LLM system prompt without allowlist validation — HIGH prompt injection risk.
- translation.ts input schema uses `z.string().max(10)` for targetLanguage, not z.enum(SUPPORTED_LANGUAGES) — same bypass as users.ts.
- users.ts:756 still has `z.string().max(10)` (the exact unfixed field spec S2 targets).
- Section-02 documents `escapeValue: false` with S3 note in config.ts only; sections 12/13 add `useTranslation()` without mentioning the XSS safety assumption.
- Locale file examples in section-13 include only plain text — S4 compliant.

**Why:** These gaps were found in the implementation plan before code was written — fixing the plan prevents the vulnerabilities from ever being coded.
**How to apply:** Block merge of section-07 stub and translation.ts until SUPPORTED_LANGUAGES enum is enforced in both routers.
