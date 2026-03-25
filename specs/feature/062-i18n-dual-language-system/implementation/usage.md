# Feature 062 — i18n Dual-Language System: Usage Guide

## What Was Built

A complete dual-language (EN + TH) i18n system using i18next/react-i18next, with 13 sections implemented across the full stack.

---

## Architecture

```
apps/web/shared/i18n.ts          — SUPPORTED_LANGUAGES, LANGUAGE_LABELS, LANGUAGE_COVERAGE
apps/web/client/src/i18n/        — i18next core, loader, detector, namespace preloader
apps/web/client/src/locales/     — 17 EN + 17 TH namespace JSON files
apps/web/server/routers/         — tRPC allowlist validation via z.enum(SUPPORTED_LANGUAGES)
```

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/shared/i18n.ts` | 19-language SUPPORTED_LANGUAGES, LANGUAGE_LABELS, LANGUAGE_COVERAGE |
| `apps/web/client/src/i18n/config.ts` | i18next configuration |
| `apps/web/client/src/i18n/index.ts` | i18next singleton initialization |
| `apps/web/client/src/i18n/localeLoader.ts` | Namespace JSON loader |
| `apps/web/client/src/i18n/languageDetector.ts` | Browser/localStorage language detection |
| `apps/web/client/src/i18n/useNamespacePreloader.ts` | Route-based namespace preloading |
| `apps/web/client/src/i18n/shim.ts` | Backward-compat `useI18n()` wrapper |
| `apps/web/client/src/locales/en/` | 17 EN namespace JSON files |
| `apps/web/client/src/locales/th/` | 17 TH namespace JSON files |

## Locale Namespaces

| File | Contents |
|------|---------|
| `nav.json` | Sidebar, navbar, header, layout strings (~52 keys) |
| `auth.json` | Login, signup, forgot password, callback, verify (~82 keys) |
| `dashboard.json` | Dashboard stats, sections, notices, quick actions (~50 keys) |
| `common.json` | Shared UI: save/cancel/delete, toasts, pagination, empty states (~100+ keys) |
| `errors.json` | Error messages: 404, 500, forbidden, network, validation (~22 keys) |
| `help.json` | Help system content (~308 EN keys) |
| `chat.json` | Chat UI strings (~49 keys) |
| `settings.json` | Settings page (~187 keys) |
| `media.json` | Media Studio (~122 keys) |
| `billing.json` | Credits/billing (~77 keys) |
| `workflow.json` | Workflow editor (~47 keys) |
| `admin.json` | Admin/invite strings (~73 keys) |
| `presentation.json` | Presentation editor (~61 keys) |
| `agency.json` | Agency features (~369 keys from teams/orchestrator) |
| `dashboard.json` (empty stubs) | marketplace, profile, social |

---

## How to Use

### In React Components

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('nav'); // or 'auth', 'dashboard', 'common', etc.
  return <button>{t('navbar.signIn')}</button>;
}
```

### Multiple Namespaces

```tsx
const { t } = useTranslation(['dashboard', 'common']);
// Use namespace prefix for non-default:
t('dashboard:welcome', { name: 'Alice' })
t('common:save')  // default namespace (first in array)
```

### Interpolation

```tsx
t('dashboard:welcome', { name: user.name })      // → "Welcome back, Alice!"
t('dashboard:notices.pendingApprovals', { count: 3 })  // → "3 pending approval(s)"
t('dashboard:meta.analyticsWindow', { days: 30 })      // → "30-day analytics window"
```

### Language Switching

```tsx
import i18next from 'i18next';
// Change language (updates all useTranslation consumers automatically)
await i18next.changeLanguage('th');
// Also persist:
localStorage.setItem('smartspec_locale', 'th');
```

---

## Security

- All `translationLanguage` tRPC inputs validated with `z.enum(SUPPORTED_LANGUAGES)` (section-07)
- help.ts, translation.ts use SUPPORTED_LANGUAGES enum validators
- All JSON values are plain text — no HTML markup (Security S1)
- `LANGUAGE_LABELS_EN` used for LLM prompts (never raw user input)

---

## Adding a New Language

1. Add the BCP-47 code to `SUPPORTED_LANGUAGES` in `apps/web/shared/i18n.ts`
2. Set `LANGUAGE_COVERAGE[newLang]` to the initial coverage percentage
3. Create `apps/web/client/src/locales/{newLang}/` directory
4. Run `node apps/web/scripts/generate-locale-json.mjs` to scaffold JSON files
5. Translate the JSON values
6. The `WelcomeLanguagePicker` will automatically show the language when coverage ≥ 50%

---

## Commits (Sections 07–13)

| Commit | Section | Description |
|--------|---------|-------------|
| `5bb3f7db` | 07 | Server allowlist: tRPC z.enum(SUPPORTED_LANGUAGES) |
| `510e65ec` | 08 | Namespaced locale JSON files (34 files, 2700+ keys) |
| `f98b794f` | 09 | WelcomeLanguagePicker one-time modal |
| `83042b49` | 10 | LocaleToggle migrated to react-i18next |
| `e3ec4670` | 11 | Settings Display Language dropdown |
| `9a9af6da` | 12 | Wave 1: Nav + Auth page migration |
| `67e2de45` | 13 | Wave 1: Dashboard + common namespace migration |
