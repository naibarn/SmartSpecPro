---
name: Spec 062 — i18n Dual-Language System — Plan Completeness Review
description: Plan completeness review findings for feature 062 i18n system — 5 sections not generated, 8 gaps identified
type: project
---

Verdict: APPROVE_WITH_FIXES — wave 0 + wave 1 NOT implementable until 5 missing sections are written.

**Critical: 5 section files were never generated — only their .prompts files exist:**
- `section-01-shared-config.md` (BLOCKING — foundation for everything)
- `section-06-backward-compat.md` (BLOCKING — 13 consumer files depend on this)
- `section-07-server-allowlist.md` (BLOCKING — security requirement S2)
- `section-08-locale-files.md` (BLOCKING — all Wave 1 migration sections depend on this)
- `section-11-settings-language.md` (missing Wave 1 piece)

**Other gaps:**
- `main.tsx` i18nReady gating is specified in section-05 only — not in the index or any standalone section
- `shared/i18n.ts` path inconsistency: plan says `apps/web/shared/i18n.ts`, spec says `apps/web/client/src/i18n/config.ts`
- 17 namespace files: wave 3 namespaces (media, marketplace, workflow, profile, settings, billing, admin, social) are deferred — section-08 would need to create stubs
- Help system two-layer integration is specified only in plan section 7 / spec section R9; no standalone section covers `helpRouter` locale enum widening
- DB preference sync (useLanguageSync hook) is in section-05 but the index dependency graph does not list it explicitly
- TDD plan §3.8 test "i18next uses custom language detector" lives in init.test.ts but section-02 cannot test this properly without section-03 being complete
- `i18next-resources-to-backend` package: plan §3.1 mentions it but package installation is owned by section-01 (missing)
- Section-04 dependency graph says it uses i18next.loadNamespaces() directly, but spec review pattern shows loadNamespace() from loader.ts — minor but implementers need clarity

**Why:** Review date 2026-03-24
**How to apply:** Before implementation begins, the 5 missing sections must be generated. The blocking dependency chain is: 01 → 02 → 03,04 → 05 → 06,07,08,09,10,11 → 12,13. Nothing in Wave 0 or Wave 1 can ship without section-01.
