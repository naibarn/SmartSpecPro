# Section 08 -- Locale Files

## Overview

This section creates all 17 English namespace JSON files, migrates the existing `locales/en.ts` and `locales/th.ts` to JSON format, and creates initial Thai namespace files. It is the data foundation for all i18n rendering.

**Depends on**: section-05 (i18next init, loader wired up)
**Blocks**: section-12 (needs nav.json, auth.json), section-13 (needs dashboard.json, common.json, errors.json)

## Migration Process: `.ts` → `.json`

### Source Files
- `apps/web/client/src/lib/i18n/locales/en.ts` (~1,067 lines, flat `Record<string, string>`)
- `apps/web/client/src/lib/i18n/locales/th.ts` (~1,042 lines)

### Transformation Rules

1. **Strip TypeScript wrapper** — remove `import`, `const en: TranslationDictionary = {`, `};`, `export default en;`
2. **Convert to JSON** — remove trailing commas, wrap in `{}`
3. **Group by namespace prefix** — the first dot-separated segment determines the target namespace file:
   - `help.*` → `en/help.json` (strip `help.` prefix)
   - `chat.*` → `en/chat.json` (strip `chat.` prefix)
   - `common.*` → `en/common.json` (strip `common.` prefix)
   - `settings.*` → `en/settings.json` (strip `settings.` prefix)
   - `credits.*` → `en/billing.json` (strip `credits.` prefix — note namespace rename)
   - `workflows.*` → `en/workflow.json` (strip `workflows.` prefix — note namespace rename)
   - `mediaStudio.*` → `en/media.json` (strip `mediaStudio.` prefix — note namespace rename)
   - `notifications.*` → `en/common.json` (merge into common)
   - `invite.*` → `en/admin.json` (strip `invite.` prefix)
   - `editor.*` → `en/presentation.json` (strip `editor.` prefix)

4. **Prefix stripping example**:
   - Source: `"help.chatBasics.title": "Chat basics"` → Target `en/help.json`: `"chatBasics.title": "Chat basics"`
   - Source: `"credits.buyCredits.title": "Buy Credits"` → Target `en/billing.json`: `"buyCredits.title": "Buy Credits"`

5. **Preserve interpolation** — `{{count}}`, `{{name}}` etc. are valid i18next syntax, keep as-is
6. **Verify key count** — sum of all JSON keys must equal source `.ts` key count (no lost keys)

### Important: Do NOT Delete Source Files

The `.ts` files remain for the backward-compat wrapper (section-06) until Wave 3 removes it.

## Files to Create

### English Namespace Files (17 total under `apps/web/client/src/locales/en/`)

| File | Source | Est. Keys |
|------|--------|-----------|
| `common.json` | Extract `common.*` from en.ts + new shared UI strings | ~100 |
| `nav.json` | New — sidebar, header, breadcrumb labels | ~30 |
| `auth.json` | New — login, register, MFA, password reset | ~40 |
| `errors.json` | New — validation, HTTP, generic errors | ~50 |
| `dashboard.json` | Stub with ~5 keys (populated by section-13) | ~5 |
| `help.json` | Migrated from en.ts `help.*` keys | ~300+ |
| `chat.json` | Migrated from en.ts `chat.*` keys | ~50+ |
| `media.json` | Migrated from en.ts `mediaStudio.*` keys | ~100+ |
| `workflow.json` | Migrated from en.ts `workflows.*` keys | ~50+ |
| `settings.json` | Migrated from en.ts `settings.*` keys | ~150+ |
| `billing.json` | Migrated from en.ts `credits.*` keys | ~80+ |
| `admin.json` | Migrated from en.ts `invite.*` keys | ~30+ |
| `presentation.json` | Migrated from en.ts `editor.*` keys | ~30+ |
| `agency.json` | Empty placeholder `{}` | 0 |
| `marketplace.json` | Empty placeholder `{}` | 0 |
| `profile.json` | Empty placeholder `{}` | 0 |
| `social.json` | Empty placeholder `{}` | 0 |

### Thai Namespace Files (under `apps/web/client/src/locales/th/`)

Same migration from `th.ts`. At minimum, create:
- `th/common.json`, `th/nav.json`, `th/auth.json`, `th/errors.json` (startup namespaces)
- `th/help.json`, `th/chat.json`, `th/media.json`, `th/workflow.json`, `th/settings.json`, `th/billing.json` (migrated from th.ts)
- Empty placeholders for remaining namespaces

**The 25-key gap** (en.ts has 1,067 keys, th.ts has 1,042) is acceptable — missing Thai keys fall back to English.

## New Startup Namespace Content

### `en/common.json` (required keys)

Shared UI strings used across multiple pages:
```
save, cancel, delete, edit, create, close, back, next, submit, confirm,
loading, search, filter, sort, required, optional, success, error, pending,
active, inactive, retry, refresh, copy, copied, selectAll, deselectAll,
upload, download, export, import, showMore, showLess, yes, no, ok,
confirmDialog.title ("Are you sure?"), confirmDialog.irreversible,
pagination.showing, pagination.page, pagination.previous, pagination.next,
emptyState.noItems, emptyState.nothingYet, emptyState.noResults,
toast.saved, toast.deleted, toast.copied, toast.failed, toast.created
```

### `en/nav.json` (required keys)

Sidebar and header labels:
```
sidebar.dashboard, sidebar.chat, sidebar.mediaStudio, sidebar.workflows,
sidebar.agencies, sidebar.teams, sidebar.presentations, sidebar.library,
sidebar.settings, sidebar.credits,
header.search, header.notifications, header.signOut, header.profile,
navbar.home, navbar.features, navbar.pricing, navbar.signIn, navbar.getStarted
```

### `en/auth.json` (required keys)

Auth page strings:
```
signIn.title, signIn.emailLabel, signIn.passwordLabel, signIn.submitButton,
signIn.forgotPassword, signIn.noAccount, signIn.createAccount,
signUp.title, signUp.email, signUp.password, signUp.createAccount,
mfa.title, mfa.codeLabel, mfa.submitButton,
resetPassword.title, resetPassword.emailLabel, resetPassword.submitButton,
callback.processing, callback.error
```

### `en/errors.json` (required keys)

Error messages:
```
notFound.title, notFound.message, serverError.title, serverError.message,
forbidden.title, forbidden.message, networkError, requestFailed,
validation.required, validation.invalidEmail, validation.passwordTooShort,
generic.somethingWentWrong, generic.tryAgain, session.expired
```

## JSON File Format Rules

1. **Flat dot-notation keys** — `"chatBasics.title"` not `{ chatBasics: { title: } }`
2. **String values only** — no numbers, booleans, arrays, objects
3. **No HTML markup** — plain text only (Security S1)
4. **Preserve `{{...}}` interpolation** syntax
5. **Sorted keys** — alphabetically for easy diffing
6. **UTF-8 encoding, no BOM, no trailing commas**

## Tests

### Test file: `apps/web/client/src/i18n/__tests__/localeFiles.test.ts`

```
# Test: en/help.json is valid JSON with string values only
# Test: th/help.json is valid JSON with string values only
# Test: en/help.json contains all keys from original en.ts help.* prefix (stripped)
# Test: th/help.json contains all keys from original th.ts help.* prefix (stripped)
# Test: en/common.json is valid JSON with string values
# Test: en/nav.json is valid JSON with string values
# Test: en/auth.json is valid JSON with string values
# Test: en/errors.json is valid JSON with string values
# Test: every key in th/common.json exists in en/common.json
# Test: every key in th/nav.json exists in en/nav.json
# Test: every key in th/help.json exists in en/help.json
# Test: no empty string values in any en/*.json file
# Test: all 17 en/*.json files exist and parse as valid JSON
# Test: no en/*.json file contains keys with the namespace prefix
       (e.g., help.json must not have keys starting with "help.")
# Test: interpolation placeholders use {{...}} syntax
```

### Test file: `apps/web/client/src/i18n/__tests__/wave1-keys.test.ts`

```
# Test: en/nav.json has required keys (sidebar.dashboard, sidebar.chat, ...)
# Test: en/auth.json has required keys (signIn.title, signIn.emailLabel, ...)
# Test: en/dashboard.json exists and is valid JSON
# Test: en/common.json has required keys (save, cancel, delete, ...)
# Test: en/errors.json has required keys (notFound.title, serverError.title, ...)
# Test: all Wave 1 namespace files are valid JSON
# Test: no Wave 1 key has empty string value in en
```

## Verification Checklist

1. All 17 files exist under `locales/en/` and parse as valid JSON
2. At least 10 files exist under `locales/th/`
3. Empty placeholders contain `{}`
4. `pnpm test -- --grep localeFiles` passes
5. `pnpm test -- --grep wave1-keys` passes
6. Sum of all JSON keys equals source `.ts` key count (no dropped keys)
7. No key retains its namespace prefix in the JSON file
8. All `{{...}}` interpolation preserved

## Implementation Notes (Actual)

**Files created:**
- `apps/web/client/src/locales/en/` — 17 JSON namespace files (1360 total keys)
- `apps/web/client/src/locales/th/` — 17 JSON namespace files (1339 total keys)
- `apps/web/scripts/generate-locale-json.mjs` — migration script
- `apps/web/client/src/i18n/__tests__/localeFiles.test.ts` — 16 tests
- `apps/web/client/src/i18n/__tests__/wave1-keys.test.ts` — 11 tests

**Namespace mapping:**
- Unmapped namespaces (teams, orchestrator) → agency.json as planned
- bsHelp → help.json with `bs.*` sub-namespace prefix to avoid key collision with `help.*`

**Code review fixes:**
- HIGH: bsHelp collision — added SUBNAMESPACE_PREFIX; `bsHelp.title` → `bs.title` in help.json
- HIGH: Unknown prefix fallthrough — added `console.warn` and `misc` skip guard
- MEDIUM: `ensureCommonKeys` falsy check → explicit `=== undefined || === null`
- LOW: `try/catch` file existence → `existsSync()`

**Test additions:** bsHelp collision test, th/common.json Wave 1 keys test, extended namespace prefix test coverage
