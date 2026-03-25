Now I have comprehensive understanding of the codebase. Let me produce the section content.

# Section 13 -- Wave 1: Dashboard and Common Namespace Migration

## Section ID

`section-13-wave1-dashboard-common`

## Dependencies

- **section-06-backward-compat**: The backward-compat `useI18n()` wrapper must be in place so Dashboard's existing `LocaleToggle` import chain still works.
- **section-08-locale-files**: The `locales/en/dashboard.json`, `locales/en/common.json`, `locales/en/errors.json` skeleton files must exist before this section populates and consumes them. The `locales/th/` partial files for these namespaces must also exist.
- **section-02-i18n-core**: `i18next` initialization, `useTranslation` hook, and the `t()` function must be operational.
- **section-05-app-integration**: `<I18nextProvider>` must be wired in `App.tsx` so `useTranslation` resolves.

## Overview

This section extracts hardcoded English strings from the Dashboard page, common UI patterns, and error-related UI into three i18next namespaces: `dashboard`, `common`, and `errors`. Each hardcoded string is replaced with a `t()` call. Thai translations are added for all extracted keys.

This section is parallelizable with **section-12-wave1-nav-auth**.

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/client/src/pages/Dashboard.tsx` | Add `useTranslation(['dashboard', 'common'])`, replace ~80 hardcoded strings with `t()` calls |
| `apps/web/client/src/locales/en/dashboard.json` | Populate with ~60 keys extracted from Dashboard.tsx |
| `apps/web/client/src/locales/en/common.json` | Populate with ~100 shared UI keys (buttons, status labels, confirmations, pagination, empty states, toast patterns) |
| `apps/web/client/src/locales/en/errors.json` | Populate with ~50 error message keys (404, 500, validation, network) |
| `apps/web/client/src/locales/th/dashboard.json` | Thai translations for dashboard keys |
| `apps/web/client/src/locales/th/common.json` | Thai translations for common keys |
| `apps/web/client/src/locales/th/errors.json` | Thai translations for error keys |

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/i18n/__tests__/wave1-dashboard-common.test.ts` | Key-presence and integration tests for this section |

---

## TDD: Tests First

### Test file: `apps/web/client/src/i18n/__tests__/wave1-dashboard-common.test.ts`

Tests validate that the locale JSON files contain all required keys and that the Dashboard component renders translated text correctly.

**Key-presence tests (no mocking needed -- direct JSON import validation):**

```
# Test: en/dashboard.json has key "welcome" (interpolation: {{name}})
# Test: en/dashboard.json has key "subtitle"
# Test: en/dashboard.json has key "healthBadge.critical"
# Test: en/dashboard.json has key "healthBadge.warning"
# Test: en/dashboard.json has key "healthBadge.healthy"
# Test: en/dashboard.json has key "prioritySnapshot.eyebrow"
# Test: en/dashboard.json has key "prioritySnapshot.title"
# Test: en/dashboard.json has key "prioritySnapshot.description"
# Test: en/dashboard.json has key "nextBestActions.eyebrow"
# Test: en/dashboard.json has key "nextBestActions.title"
# Test: en/dashboard.json has key "nextBestActions.description"
# Test: en/dashboard.json has key "trendHealth.eyebrow"
# Test: en/dashboard.json has key "trendHealth.title"
# Test: en/dashboard.json has key "trendHealth.description"
# Test: en/dashboard.json has key "stats.creditsAvailable"
# Test: en/dashboard.json has key "stats.thirtyDayUsage"
# Test: en/dashboard.json has key "stats.requests"
# Test: en/dashboard.json has key "stats.recentMediaJobs"
# Test: en/dashboard.json has key "notices.pendingApprovals" (with _count interpolation)
# Test: en/dashboard.json has key "notices.failedGenerations"
# Test: en/dashboard.json has key "notices.workflowsRunning"
# Test: en/dashboard.json has key "notices.creditsLow"
# Test: en/dashboard.json has key "notices.reviewCoverage"
# Test: en/dashboard.json has key "notices.allHealthy"
# Test: en/dashboard.json has key "quickActions.mediaStudio"
# Test: en/dashboard.json has key "quickActions.chat"
# Test: en/dashboard.json has key "quickActions.documentManagement"
# Test: en/dashboard.json has key "quickActions.presentations"
# Test: en/dashboard.json has key "quickActions.agencies"
# Test: en/dashboard.json has key "quickActions.buyCredits"
# Test: en/dashboard.json has key "status.completed"
# Test: en/dashboard.json has key "status.processing"
# Test: en/dashboard.json has key "status.pending"
# Test: en/dashboard.json has key "status.failed"
# Test: en/dashboard.json has key "status.cancelled"
# Test: en/dashboard.json has key "websitePreview"
# Test: en/dashboard.json has key "signOut"
# Test: en/dashboard.json has key "momentum.noData"
# Test: en/dashboard.json has key "momentum.insufficientHistory"
# Test: en/dashboard.json has key "momentum.rising"
# Test: en/dashboard.json has key "momentum.easing"
# Test: en/dashboard.json has key "momentum.steady"
# Test: en/dashboard.json is valid JSON with no empty string values
# Test: every key in th/dashboard.json exists in en/dashboard.json
```

**Common namespace key-presence tests:**

```
# Test: en/common.json has key "save"
# Test: en/common.json has key "cancel"
# Test: en/common.json has key "delete"
# Test: en/common.json has key "edit"
# Test: en/common.json has key "create"
# Test: en/common.json has key "close"
# Test: en/common.json has key "back"
# Test: en/common.json has key "next"
# Test: en/common.json has key "submit"
# Test: en/common.json has key "confirm"
# Test: en/common.json has key "search"
# Test: en/common.json has key "filter"
# Test: en/common.json has key "sort"
# Test: en/common.json has key "required"
# Test: en/common.json has key "optional"
# Test: en/common.json has key "loading"
# Test: en/common.json has key "success"
# Test: en/common.json has key "error"
# Test: en/common.json has key "pending"
# Test: en/common.json has key "active"
# Test: en/common.json has key "inactive"
# Test: en/common.json has key "confirmDialog.title"
# Test: en/common.json has key "confirmDialog.irreversible"
# Test: en/common.json has key "pagination.showing"
# Test: en/common.json has key "pagination.page"
# Test: en/common.json has key "pagination.previous"
# Test: en/common.json has key "pagination.next"
# Test: en/common.json has key "emptyState.noItems"
# Test: en/common.json has key "emptyState.nothingYet"
# Test: en/common.json has key "fileActions.upload"
# Test: en/common.json has key "fileActions.download"
# Test: en/common.json has key "fileActions.export"
# Test: en/common.json has key "fileActions.import"
# Test: en/common.json has key "toast.saved"
# Test: en/common.json has key "toast.deleted"
# Test: en/common.json has key "toast.copied"
# Test: en/common.json has key "toast.failed"
# Test: en/common.json is valid JSON with no empty string values
# Test: every key in th/common.json exists in en/common.json
```

**Errors namespace key-presence tests:**

```
# Test: en/errors.json has key "notFound.title"
# Test: en/errors.json has key "notFound.description"
# Test: en/errors.json has key "forbidden.title"
# Test: en/errors.json has key "forbidden.description"
# Test: en/errors.json has key "serverError.title"
# Test: en/errors.json has key "serverError.description"
# Test: en/errors.json has key "network.connectionLost"
# Test: en/errors.json has key "network.requestFailed"
# Test: en/errors.json has key "generic.somethingWentWrong"
# Test: en/errors.json has key "generic.tryAgain"
# Test: en/errors.json has key "validation.required"
# Test: en/errors.json has key "validation.invalidEmail"
# Test: en/errors.json has key "validation.passwordTooShort"
# Test: en/errors.json has key "validation.passwordMismatch"
# Test: en/errors.json has key "session.expired"
# Test: en/errors.json has key "session.unauthorized"
# Test: en/errors.json is valid JSON with no empty string values
# Test: every key in th/errors.json exists in en/errors.json
```

**Integration test (component test, requires jsdom + I18nextProvider):**

```
# Test: Dashboard renders translated welcome message via t('dashboard:welcome', { name })
# Test: Dashboard renders translated stat labels (not hardcoded "Credits Available")
# Test: Dashboard renders translated section headers (not hardcoded "Priority Snapshot")
```

Test convention: Direct JSON imports for key-presence tests (no mocking). Component integration tests use a real i18next instance initialized with in-memory resources loaded from the JSON files.

---

## Implementation Notes (Actual)

**Files modified:**
- `apps/web/client/src/locales/en/dashboard.json` — populated with ~50 keys
- `apps/web/client/src/locales/th/dashboard.json` — full Thai translations
- `apps/web/client/src/locales/en/common.json` — added fileActions.*, toast.updated
- `apps/web/client/src/locales/th/common.json` — corresponding Thai additions
- `apps/web/client/src/locales/en/errors.json` — added description aliases, network.*, session.unauthorized, validation.passwordMismatch
- `apps/web/client/src/locales/th/errors.json` — corresponding Thai additions
- `apps/web/client/src/pages/Dashboard.tsx` — useTranslation(['dashboard','common']); t() calls for welcome, stats, healthBadge, subtitle, meta.*, trendHealth, prioritySnapshot, nextBestActions, quickActions, statusConfig, attentionNotices, usageMomentum, signOut, websitePreview

**Files created:**
- `apps/web/client/src/i18n/__tests__/wave1-dashboard-common.test.ts` (15 tests)

**Code review fixes:**
- HIGH: Renamed `{{_count}}` → `{{count}}` in notices JSON
- HIGH: Added t() calls for healthBadge, subtitle, meta, trendHealth, notices, quickActions, status, momentum
- MEDIUM: Added `toast.updated` to common.json
- Tests enhanced from 12 → 15 (added healthBadge, notices, quickActions assertions)

## Implementation Guidance

### 1. Dashboard Namespace (`locales/en/dashboard.json`)

Extract all hardcoded strings from `apps/web/client/src/pages/Dashboard.tsx` (currently ~1148 lines). The key categories to extract are:

**Welcome header** (line ~965):
- `"welcome": "Welcome back, {{name}}!"` -- uses i18next interpolation
- `"subtitle": "Here's the current state of your workspace, the items that need attention, and the next actions worth taking."`
- `"websitePreview": "Website Preview"`
- `"signOut": "Sign Out"`

**Health badge** (line ~977):
- `"healthBadge.critical": "Critical attention"`
- `"healthBadge.warning": "Watch list"`
- `"healthBadge.healthy": "Healthy"`

**Meta pills** (lines ~986-999):
- `"meta.updated": "Updated {{time}}"`
- `"meta.analyticsWindow": "{{days}}-day analytics window"`
- `"meta.latestChat": "Latest chat {{time}}"`
- `"meta.latestCredit": "Latest credit movement {{time}}"`

**Stat cards** (lines ~322-347):
- `"stats.creditsAvailable": "Credits Available"`
- `"stats.thirtyDayUsage": "30-Day Usage"`
- `"stats.requests": "Requests"`
- `"stats.recentMediaJobs": "Recent Media Jobs"`
- `"stats.paid": "${{amount}} paid"`
- `"stats.avgCost": "${{amount}} avg"`
- `"stats.recentShown": "{{count}} recent shown"`

**Priority Snapshot section** (lines ~1028-1031):
- `"prioritySnapshot.eyebrow": "Priority Snapshot"`
- `"prioritySnapshot.title": "What needs your attention right now"`
- `"prioritySnapshot.description": "The dashboard keeps the most urgent signals at the top so you can move faster without scanning every list."`
- `"prioritySnapshot.activeSignals": "{{count}} active signal"`
- `"prioritySnapshot.activeSignals_plural": "{{count}} active signals"`
- `"prioritySnapshot.noBlockers": "No blockers"`

**Attention notices** (lines ~450-511):
- `"notices.pendingApprovals": "{{count}} pending approval"`
- `"notices.pendingApprovals_plural": "{{count}} pending approvals"`
- `"notices.pendingApprovalsDetail": "These are blocked until you review them."`
- `"notices.failedGenerations": "{{count}} failed generation"`
- `"notices.failedGenerations_plural": "{{count}} failed generations"`
- `"notices.failedGenerationsDetail": "Open the latest media jobs and retry or inspect the failure reason."`
- `"notices.workflowsRunning": "{{count}} workflow running"`
- `"notices.workflowsRunning_plural": "{{count}} workflows running"`
- `"notices.workflowsRunningDetail": "Keep an eye on job progress so nothing stalls unnoticed."`
- `"notices.creditsLow": "Credits are getting low"`
- `"notices.creditsLowDetail": "Refill before the next round of generation work slows down."`
- `"notices.reviewCoverage": "{{percent}}% review coverage"`
- `"notices.reviewCoverageDetail": "Consider closing the gap so the tenant improvement loop stays current."`
- `"notices.allHealthy": "Everything looks healthy"`
- `"notices.allHealthyDetail": "No urgent blockers. You can focus on creation and review work."`

**Next Best Actions section** (lines ~1082-1084):
- `"nextBestActions.eyebrow": "Next Best Actions"`
- `"nextBestActions.title": "The fastest way to keep things moving"`
- `"nextBestActions.description": "These actions are ranked from the most urgent to the most likely to be useful next."`
- `"nextBestActions.ready": "{{count}} ready"`

**Action labels** (lines ~527-604):
- `"actions.reviewApprovals": "Review approvals"`
- `"actions.reviewApprovalsDesc": "Clear blocked decisions first."`
- `"actions.openWorkflows": "Open workflows"`
- `"actions.openWorkflowsDesc": "Check live jobs and step progress."`
- `"actions.inspectFailures": "Inspect failures"`
- `"actions.inspectFailuresDesc": "Review the latest media jobs that need attention."`
- `"actions.refillCredits": "Refill credits"`
- `"actions.refillCreditsDesc": "Prevent a billing-related slowdown."`
- `"actions.continueChat": "Continue chat"`
- `"actions.continueChatDesc": "Resume the latest conversation thread."`
- `"actions.inspectSpend": "Inspect spend"`
- `"actions.inspectSpendDesc": "Review credit history and usage patterns."`
- `"actions.openReviewCenter": "Open review center"`
- `"actions.openReviewCenterDesc": "Improve tenant-wide review coverage."`
- `"actions.startMediaStudio": "Start in Media Studio"`
- `"actions.startMediaStudioDesc": "Launch your next generation task."`
- `"actions.openMediaHistory": "Open media history"`
- `"actions.buyCredits": "Buy credits"`

**Trend & Health section** (lines ~1122-1124):
- `"trendHealth.eyebrow": "Trend & Health"`
- `"trendHealth.title": "Usage momentum and recent signal quality"`
- `"trendHealth.description": "A quick view of whether activity is accelerating, which provider is carrying the load, and how reliably recent work is landing."`
- `"trendHealth.liveView": "Live view"`

**Usage momentum labels** (lines ~412-432):
- `"momentum.noData": "No usage data yet"`
- `"momentum.insufficientHistory": "Insufficient history"`
- `"momentum.rising": "Usage is rising"`
- `"momentum.easing": "Usage is easing"`
- `"momentum.steady": "Usage is steady"`
- `"momentum.label": "Usage momentum"`

**Quick actions** (lines ~638-645):
- `"quickActions.mediaStudio": "Media Studio"`
- `"quickActions.chat": "Chat (LLM)"`
- `"quickActions.documentManagement": "Document Management"`
- `"quickActions.presentations": "Presentations"`
- `"quickActions.agencies": "Agencies"`
- `"quickActions.buyCredits": "Buy Credits"`

**Status labels** (lines ~648-654):
- `"status.completed": "Completed"`
- `"status.processing": "Processing"`
- `"status.pending": "Pending"`
- `"status.failed": "Failed"`
- `"status.cancelled": "Cancelled"`

**Transaction type labels** (lines ~657-664):
- `"txType.usage": "Usage"`
- `"txType.purchase": "Purchase"`
- `"txType.bonus": "Bonus"`
- `"txType.refund": "Refund"`
- `"txType.adjustment": "Adjustment"`
- `"txType.subscription": "Subscription"`

**Sidebar section labels** (lines ~303-306, ~801, ~822-823):
- `"sidebar.documents": "Documents"`
- `"sidebar.social": "Social"`
- `"sidebar.admin": "Admin"`
- `"sidebar.tenantManagement": "Tenant Management"`
- `"sidebar.domainAdmin": "Domain Admin"`

### 2. Dashboard.tsx Modifications

At the top of the `Dashboard` component function body, add:

```typescript
const { t } = useTranslation(['dashboard', 'common']);
```

Then replace each hardcoded string with the corresponding `t()` call. For the `dashboard` namespace keys, use the namespace prefix: `t('dashboard:welcome', { name: user.name.split(' ')[0] })`.

For pluralization of notices (e.g., "1 pending approval" vs "3 pending approvals"), use i18next's built-in plural support with `_plural` suffix keys and `count` interpolation parameter:

```typescript
// Before:
`${count} pending approval${count === 1 ? '' : 's'}`

// After:
t('dashboard:notices.pendingApprovals', { count })
```

This requires two keys in the JSON file:
```json
{
  "notices.pendingApprovals_one": "{{count}} pending approval",
  "notices.pendingApprovals_other": "{{count}} pending approvals"
}
```

For the `useMemo` blocks that build `attentionNotices`, `nextBestActions`, `quickActions`, `statusConfig`, and `txTypeConfig` -- these contain hardcoded string literals. **Do NOT add `t` to the useMemo dependency array.** The `t` function from `react-i18next` changes reference on language switch, which would force unnecessary recomputation of all memo blocks.

**Correct approach:** Keep `useMemo` deps as-is (data-only). Move translated strings out of `useMemo` and apply `t()` at the JSX call site:

```typescript
// WRONG: t() inside useMemo, t in deps → recomputes on language switch
const notices = useMemo(() => [
  { title: t('dashboard:notices.pendingApprovals', { count }), ... }
], [count, t]); // t changes on language switch!

// CORRECT: useMemo returns data keys, t() applied at render time
const notices = useMemo(() => [
  { titleKey: 'dashboard:notices.pendingApprovals', count, ... }
], [count]); // stable — only recomputes when data changes

// In JSX:
{notices.map(n => <div>{t(n.titleKey, { count: n.count })}</div>)}
```

This pattern ensures memo blocks only recompute when actual data changes, not on language switches.

### 3. Common Namespace (`locales/en/common.json`)

This file contains strings reused across multiple pages. Structure with dot-notation grouping:

```json
{
  "save": "Save",
  "cancel": "Cancel",
  "delete": "Delete",
  "edit": "Edit",
  "create": "Create",
  "close": "Close",
  "back": "Back",
  "next": "Next",
  "submit": "Submit",
  "confirm": "Confirm",
  "search": "Search",
  "filter": "Filter",
  "sort": "Sort",
  "required": "Required",
  "optional": "Optional",
  "loading": "Loading...",
  "success": "Success",
  "error": "Error",
  "pending": "Pending",
  "active": "Active",
  "inactive": "Inactive",
  "retry": "Retry",
  "refresh": "Refresh",
  "copy": "Copy",
  "copied": "Copied!",
  "selectAll": "Select All",
  "deselectAll": "Deselect All",
  "confirmDialog.title": "Are you sure?",
  "confirmDialog.irreversible": "This action cannot be undone.",
  "pagination.showing": "Showing {{from}} to {{to}} of {{total}}",
  "pagination.page": "Page",
  "pagination.previous": "Previous",
  "pagination.next": "Next",
  "pagination.loadMore": "Load more",
  "pagination.noMore": "No more items",
  "emptyState.noItems": "No items found",
  "emptyState.nothingYet": "Nothing here yet",
  "emptyState.noResults": "No results match your search",
  "fileActions.upload": "Upload",
  "fileActions.download": "Download",
  "fileActions.export": "Export",
  "fileActions.import": "Import",
  "toast.saved": "Saved successfully",
  "toast.deleted": "Deleted successfully",
  "toast.copied": "Copied to clipboard",
  "toast.failed": "Operation failed",
  "toast.created": "Created successfully",
  "toast.updated": "Updated successfully"
}
```

Approximately 50-100 keys total. Add the same key structure in `locales/th/common.json` with Thai translations.

### 4. Errors Namespace (`locales/en/errors.json`)

```json
{
  "notFound.title": "Page not found",
  "notFound.description": "The page you're looking for doesn't exist or has been moved.",
  "forbidden.title": "Access denied",
  "forbidden.description": "You don't have permission to access this page.",
  "serverError.title": "Server error",
  "serverError.description": "Something went wrong on our end. Please try again later.",
  "network.connectionLost": "Connection lost",
  "network.requestFailed": "Request failed",
  "network.timeout": "Request timed out",
  "generic.somethingWentWrong": "Something went wrong",
  "generic.tryAgain": "Please try again",
  "generic.unexpectedError": "An unexpected error occurred",
  "validation.required": "This field is required",
  "validation.invalidEmail": "Please enter a valid email address",
  "validation.passwordTooShort": "Password must be at least {{min}} characters",
  "validation.passwordMismatch": "Passwords do not match",
  "validation.invalidUrl": "Please enter a valid URL",
  "validation.maxLength": "Must be {{max}} characters or fewer",
  "validation.minLength": "Must be at least {{min}} characters",
  "session.expired": "Your session has expired. Please sign in again.",
  "session.unauthorized": "You must be signed in to access this page."
}
```

Approximately 30-50 keys. Add Thai translations in `locales/th/errors.json`.

### 5. Thai Translation Files

All three Thai files (`th/dashboard.json`, `th/common.json`, `th/errors.json`) must contain translations for every key present in the corresponding English file. Missing keys will silently fall back to English, but for Wave 1 completeness, full Thai coverage is expected for these namespaces.

Example Thai keys for `th/dashboard.json`:
- `"welcome": "ยินดีต้อนรับกลับ {{name}}!"`
- `"stats.creditsAvailable": "เครดิตที่ใช้ได้"`
- `"signOut": "ออกจากระบบ"`

Example Thai keys for `th/common.json`:
- `"save": "บันทึก"`
- `"cancel": "ยกเลิก"`
- `"delete": "ลบ"`
- `"loading": "กำลังโหลด..."`

Example Thai keys for `th/errors.json`:
- `"notFound.title": "ไม่พบหน้าที่ค้นหา"`
- `"generic.somethingWentWrong": "เกิดข้อผิดพลาด"`

### Security Reminders

- **S3**: Always render translated strings as React children (`<p>{t('key')}</p>`), never via `dangerouslySetInnerHTML`. The `escapeValue: false` config is safe only because React escapes text nodes automatically.
- **S4**: All values in locale JSON files MUST be plain text only — no HTML tags. Run `grep -rP '<[a-z]' locales/` in CI to detect violations.

### 6. Migration Pattern for Dashboard.tsx

The migration follows a systematic pattern. Do NOT change component structure, styling, or logic. Only replace string literals with `t()` calls.

**Step-by-step:**

1. Add `import { useTranslation } from 'react-i18next';` at the top of Dashboard.tsx.
2. Inside the component, add `const { t } = useTranslation(['dashboard', 'common']);` before any early returns but after all hooks.
3. Replace each hardcoded string with `t('dashboard:keyName')` or `t('common:keyName')` as appropriate.
4. For interpolated strings, use `t('dashboard:welcome', { name: user.name.split(' ')[0] })`.
5. For pluralized strings, use `t('dashboard:notices.pendingApprovals', { count: pendingApprovals?.requests.length ?? 0 })`.
6. For `useMemo` blocks: keep deps data-only (do NOT add `t`). Store translation keys in memo, apply `t()` at JSX call site.
7. Keep `LocaleToggle` and `HelpButton` unchanged -- they are handled by other sections.

**Scope boundary:** This section only modifies `Dashboard.tsx`. Other pages that use common strings (e.g., confirmation dialogs, toast messages) will adopt `common` and `errors` namespaces in their own wave sections. The locale JSON files created here serve as the shared resource for all future consumers.

### 7. Handling Dynamic Strings

Some Dashboard strings are constructed dynamically in `useMemo` blocks. These require careful migration:

- The `attentionNotices` array builds notice objects with `title` and `detail` string properties. Store translation keys (not translated strings) in the memo. Apply `t()` at the JSX call site where the notice is rendered. This prevents memo recomputation on language switches.
- The `nextBestActions` array similarly contains `label` and `description` strings to extract.
- The `statusConfig` and `txTypeConfig` record objects contain `label` strings to extract.

For the `statusConfig` and `txTypeConfig` objects, the keys remain English identifiers (e.g., `"completed"`, `"usage"`) while the `label` values become `t()` calls:

```typescript
// Before:
completed: { label: 'Completed', ... }
// After:
completed: { label: t('dashboard:status.completed'), ... }
```

---

## Verification Checklist

1. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run i18n/__tests__/wave1-dashboard-common` -- all key-presence tests pass.
2. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run pages/__tests__/Dashboard` -- existing Dashboard tests still pass (backward compat).
3. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` -- no TypeScript errors introduced.
4. Visually verify (via domain): Dashboard renders identically in English. Switching to Thai shows translated strings.
5. Confirm no hardcoded user-visible English strings remain in Dashboard.tsx (grep for quoted multi-word strings outside of className, key, id attributes).