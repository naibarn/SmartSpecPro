# Section 13 Review — Wave 1: Dashboard and Common Namespace Migration

**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-25
**Branch:** `codex/feature-044-multimodal-chat-memory`

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `Dashboard.tsx:981` | `healthBadge` strings hardcoded in JSX — `'Critical attention'`, `'Watch list'`, `'Healthy'` — even though these three keys exist in `dashboard.json` | Replace with `t('dashboard:healthBadge.critical')`, `t('dashboard:healthBadge.warning')`, `t('dashboard:healthBadge.healthy')` |
| HIGH | `Dashboard.tsx:986–1004` | `subtitle`, `meta.*` strings, `'Website Preview'`, and `'Updated …'` / `'-day analytics window'` / `'Latest chat …'` / `'Latest credit movement …'` are all hardcoded. Keys `subtitle`, `meta.updated`, `meta.analyticsWindow`, `meta.latestChat`, `meta.latestCredit`, `websitePreview` are present in `dashboard.json` but never called. | Apply `t('dashboard:subtitle')`, `t('dashboard:websitePreview')`, and the four `meta.*` interpolation calls at JSX call sites |
| HIGH | `Dashboard.tsx:450–516` | `attentionNotices` `useMemo` builds `title` and `detail` strings as hardcoded English template literals (e.g. `` `${n} pending approval${n === 1 ? '' : 's'}` ``). The spec-required key-data pattern is not followed — `t()` is never called for these strings. The translated keys (`notices.*`) in `dashboard.json` use `{{_count}}` rather than the i18next standard `{{count}}` — making them incompatible with i18next's built-in plural resolution regardless. | (1) Use the key-data memo pattern per spec §Implementation §2: store `titleKey`/`count` in memo, call `t(notice.titleKey, { count })` at JSX site. (2) Rename interpolation parameter in JSON values from `{{_count}}` to `{{count}}` to enable correct i18next plural resolution. |
| HIGH | `Dashboard.tsx:527–618` | `nextBestActions` `useMemo` builds `label` and `description` strings as hardcoded English literals (`'Review approvals'`, `'Clear blocked decisions first.'`, etc.). Seven action labels and their descriptions are never translated even though `actions.*` keys are listed in the spec. | Apply key-data memo pattern: store translation keys in memo, call `t()` at JSX render site. |
| HIGH | `Dashboard.tsx:642–668` | `quickActions` array, `statusConfig` record, and `txTypeConfig` record all use hardcoded English label strings. `t('dashboard:quickActions.*')`, `t('dashboard:status.*')` and `t('dashboard:txType.*')` are never called. | Apply `t()` at call site. For `statusConfig`/`txTypeConfig` these are not in useMemo so `t()` can be called directly inline. |
| HIGH | `Dashboard.tsx:1126–1128` | `DashboardSectionHeader` for the "Trend & Health" section passes hardcoded strings for `eyebrow`, `title`, and `description`, even though `trendHealth.eyebrow`, `trendHealth.title`, `trendHealth.description` exist in `dashboard.json`. The `prioritySnapshot.title` (`"What needs your attention right now"`) and `nextBestActions.title` (`"The fastest way to keep things moving"`) are also hardcoded at lines 1034 and 1087. | Replace all three `DashboardSectionHeader` instances' `title` and remaining hardcoded props with `t()` calls. |
| MEDIUM | `Dashboard.tsx:413–441` | `usageMomentum` `useMemo` builds `label` as hardcoded English strings (`'No usage data yet'`, `'Insufficient history'`, `'Usage is rising'`, `'Usage is easing'`, `'Usage is steady'`). These match `momentum.*` keys in `dashboard.json` but are never wired. Since `label` is rendered in JSX at line 1151, `t()` cannot be called there on the pre-built label string — the memo must be refactored to store a key and call `t()` at render. | Store `labelKey: 'dashboard:momentum.noData'` etc. in memo return; call `t(usageMomentum.labelKey)` in JSX at line 1151. |
| MEDIUM | `dashboard.json` (all `notices.*`) | Interpolation parameter is `{{_count}}` (underscore prefix). i18next uses `{{count}}` as the canonical plural variable. With `{{_count}}`, i18next plural selection is broken — `t('dashboard:notices.pendingApprovals', { count: 3 })` would not substitute `_count` and would not select the plural form. | Rename `{{_count}}` → `{{count}}` in both `en/dashboard.json` and `th/dashboard.json` for all six `notices.*` keys. Update any call sites to pass `{ count }`. |
| MEDIUM | `dashboard.json` | Spec defines `~60 keys` for this namespace. The file has 47 keys. Missing spec-defined keys: `actions.*` (17 action label/description pairs from §1 §Actions), `sidebar.*` (5 sidebar section labels), `momentum.label`, `txType.*` (6 transaction type labels), `prioritySnapshot.activeSignals`, `prioritySnapshot.noBlockers`, `nextBestActions.ready`, `trendHealth.liveView`, `stats.paid`, `stats.avgCost`, `stats.recentShown`. Roughly 35 spec-required keys are absent. | Populate the missing keys. The test `REQUIRED_DASHBOARD_KEYS` only checks 41 keys so tests pass today, but the implementation is incomplete. |
| MEDIUM | `wave1-dashboard-common.test.ts:134–148` | The three integration tests in the `"Dashboard.tsx — uses useTranslation"` describe block are source-scan tests (regex on `.tsx` source), not component render tests. The spec §TDD §Integration explicitly requires: "Dashboard renders translated welcome message via `t('dashboard:welcome', { name })`", "Dashboard renders translated stat labels (not hardcoded 'Credits Available')", "Dashboard renders translated section headers (not hardcoded 'Priority Snapshot')". Scanning source text for string containment cannot catch key-name typos, wrong namespace prefixes, or runtime i18next resolution failures. | Replace or supplement the source-scan tests with jsdom component render tests using a real i18next instance loaded from the JSON files, as described in spec §Test convention. |
| MEDIUM | `common.json` | Spec defines `toast.updated` as a required key (spec §3, `"toast.updated": "Updated successfully"`). The key is absent from both `en/common.json` and `th/common.json`. `REQUIRED_COMMON_KEYS` in the test also omits it, so the test does not catch this gap. | Add `"toast.updated": "Updated successfully"` to `en/common.json` and `"toast.updated": "อัปเดตสำเร็จ"` to `th/common.json`. Add to `REQUIRED_COMMON_KEYS`. |
| LOW | `errors.json:18` | `session.unauthorized` value is `"You are not authorized to perform this action."` The spec defines `"You must be signed in to access this page."` — a different semantic (authorization vs. authentication). The spec language is more accurate for the login-gating use case. | Align with spec: `"You must be signed in to access this page."` |
| LOW | `dashboard.json` | The spec value for `"momentum.noData"` is `"No usage data yet"` but the JSON contains `"No data"`. The spec value for `"momentum.rising"` is `"Usage is rising"` but JSON has `"Rising"`. Similarly `"momentum.easing"` → `"Usage is easing"` vs `"Easing"` and `"momentum.steady"` → `"Usage is steady"` vs `"Steady"`. Abbreviated values match the in-memo hardcoded strings used today but the spec values are more descriptive. | Align values with spec, or explicitly document the deviation as intentional and update the spec accordingly. |
| LOW | `wave1-dashboard-common.test.ts` | The test for `th/dashboard.json` keys existing in `en/dashboard.json` (line 71–77) is directionally correct but the inverse — verifying that every en key has a corresponding th translation — is not tested. Missing th coverage falls back to English silently. | Add a reverse assertion: `for (const key of Object.keys(en)) { expect(hasKey(th, key), ...).toBe(true); }` for each namespace pair. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `useTranslation(['dashboard','common'])` present in Dashboard | PASS | Line 176 |
| `useTranslation('nav')` present for sidebar re-render reactivity | PASS | Line 178 |
| `t('dashboard:welcome', { name })` call present | PASS | Line 969 |
| `t('dashboard:stats.*')` calls present | PASS | Lines 326–344 |
| `t('dashboard:prioritySnapshot.eyebrow/description')` present | PASS | Lines 1033–1035 |
| `t('dashboard:nextBestActions.eyebrow/description')` present | PASS | Lines 1086–1088 |
| `healthBadge.*` keys defined in JSON | PASS | All three present |
| `healthBadge.*` t() calls in Dashboard.tsx | FAIL | Line 981 still hardcoded English ternary |
| `subtitle` / `websitePreview` / `meta.*` t() calls in Dashboard.tsx | FAIL | Lines 986–1004 still hardcoded |
| `trendHealth.*` t() calls in Dashboard.tsx | FAIL | Lines 1126–1128 still hardcoded |
| `prioritySnapshot.title` / `nextBestActions.title` t() calls | FAIL | Lines 1034, 1087 still hardcoded |
| `notices.*` keys used via t() | FAIL | `attentionNotices` useMemo at lines 450–516 never calls t() |
| `actions.*` / `quickActions.*` / `status.*` / `txType.*` t() calls | FAIL | Lines 527–668 still hardcoded |
| `momentum.*` used via t() | FAIL | `usageMomentum` useMemo still builds English label strings |
| `{{_count}}` interpolation parameter is non-standard | FAIL | Must be `{{count}}` for i18next plural resolution |
| Spec-required JSON keys (~60 total) in `dashboard.json` | PARTIAL | 47 of ~60 present; ~13 groupings absent |
| `toast.updated` in `common.json` | FAIL | Key absent from both en and th |
| No HTML markup in JSON values | PASS | All values are plain text |
| React text node rendering (no dangerouslySetInnerHTML) | PASS | All translated strings are React children |
| Thai translations present for all en dashboard keys | PASS | th/dashboard.json has 1:1 key parity |
| Thai translations present for all en errors keys | PASS | th/errors.json has 1:1 key parity |
| Thai translations present for all en common keys (including new `fileActions.*`) | PASS | Added in this diff |
| Integration tests (component render) required by spec | FAIL | Only source-scan tests present; no jsdom render tests |

---

### Summary

The spec contract for `dashboard.json`, `common.json`, and `errors.json` JSON population is substantially complete — all three files are valid JSON, Thai translations are provided for all added keys, and the test scaffolding exists. However the Dashboard.tsx component migration is only partially done: `useTranslation` and approximately 8 `t()` call sites are wired, but the majority of hardcoded strings (health badge, subtitle, meta pills, all notice titles and details, all action labels, quickActions, statusConfig, txTypeConfig, trendHealth section, usageMomentum label) remain untranslated. Additionally the `{{_count}}` interpolation parameter used in six `notices.*` keys is incompatible with i18next's plural count parameter, which would cause runtime interpolation failures. The dashboard is not yet functionally bilingual despite the scaffolding being correct.

---

### Prioritised Fix Order

1. **(BLOCKING)** Rename `{{_count}}` → `{{count}}` in `notices.*` keys in both en and th `dashboard.json` before any call sites are added, to avoid shipping broken plural strings.
2. **(HIGH)** Wire the remaining `t()` call sites in `Dashboard.tsx` for the six HIGH findings above — health badge, subtitle/meta block, attentionNotices memo (key-data pattern), nextBestActions memo, quickActions/statusConfig/txTypeConfig, and trendHealth/title strings.
3. **(MEDIUM)** Refactor `usageMomentum` useMemo to return a `labelKey` and call `t()` at the JSX call site.
4. **(MEDIUM)** Populate missing `actions.*`, `sidebar.*`, `txType.*`, and remaining spec-defined keys in `dashboard.json`.
5. **(MEDIUM)** Add `toast.updated` to `en/common.json` and `th/common.json`.
6. **(MEDIUM)** Replace source-scan integration tests with jsdom render tests.
7. **(LOW)** Align `momentum.*` and `session.unauthorized` values with spec wording.
8. **(LOW)** Add reverse th-completeness assertion to test file.
