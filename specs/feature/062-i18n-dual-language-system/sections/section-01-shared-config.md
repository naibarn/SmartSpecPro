# Section 01 -- Shared Config + Package Installation + Vite Chunk

## Overview

This section creates the foundational shared configuration that all subsequent i18n sections depend on. It establishes a **single source of truth** for supported languages, language metadata, and namespace definitions in a file importable by both client and server code. It also installs the required npm packages and adds the `vendor-i18n` manual chunk to the Vite build config.

**Blocks**: section-02, section-03, section-07

## Dependencies

None -- this is the first section with no prerequisites.

## Files to Create

### `apps/web/shared/i18n.ts`

Shared i18n constants importable from `@shared/i18n` (client via Vite alias) and `../../shared/i18n` (server).

**Security comment** at the top:
```typescript
// Security: Translation values MUST be plain text only. No HTML markup.
// Language codes are validated against SUPPORTED_LANGUAGES on both client and server.
// See spec 062 Security Requirements S1.
```

**Exports:**

1. **`SUPPORTED_LANGUAGES`** -- readonly tuple of exactly 19 BCP-47 language codes:
   ```typescript
   export const SUPPORTED_LANGUAGES = [
     "en", "th", "ja", "ar", "zh-Hans", "zh-Hant", "ko", "vi", "id", "hi",
     "es", "pt-BR", "fr", "de", "ru", "it", "tr", "nl", "pl",
   ] as const;
   ```
   - `en` MUST be the first entry (canonical fallback).
   - Type: `export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];`

2. **`RTL_LANGUAGES`** -- readonly tuple:
   ```typescript
   export const RTL_LANGUAGES = ["ar"] as const;
   export type RtlLanguage = (typeof RTL_LANGUAGES)[number];
   ```

3. **`LANGUAGE_LABELS`** -- `Record<SupportedLanguage, string>` with **native** display names:
   ```
   en: "English", th: "ไทย", ja: "日本語", ar: "العربية",
   "zh-Hans": "简体中文", "zh-Hant": "繁體中文", ko: "한국어",
   vi: "Tiếng Việt", id: "Bahasa Indonesia", hi: "हिन्दी",
   es: "Español", "pt-BR": "Português (Brasil)", fr: "Français",
   de: "Deutsch", ru: "Русский", it: "Italiano", tr: "Türkçe",
   nl: "Nederlands", pl: "Polski"
   ```

4. **`LANGUAGE_LABELS_EN`** -- `Record<SupportedLanguage, string>` with **English** display names:
   ```
   en: "English", th: "Thai", ja: "Japanese", ar: "Arabic",
   "zh-Hans": "Chinese (Simplified)", "zh-Hant": "Chinese (Traditional)",
   ko: "Korean", vi: "Vietnamese", id: "Indonesian", hi: "Hindi",
   es: "Spanish", "pt-BR": "Portuguese (Brazil)", fr: "French",
   de: "German", ru: "Russian", it: "Italian", tr: "Turkish",
   nl: "Dutch", pl: "Polish"
   ```

5. **`LANGUAGE_COVERAGE`** -- `Record<SupportedLanguage, number>` (0-100 percentage):
   - `en: 100`, `th: 15` (startup + help only), all others: `0`
   - Updated incrementally as translations are added.

6. **`DEFAULT_LANGUAGE`** -- `"en" as const`

**Design constraints:**
- No runtime dependencies -- pure TypeScript constants and types only.
- No imports from `i18next` or any other package.
- All maps must have entries for every `SUPPORTED_LANGUAGES` member (enforced by `Record<SupportedLanguage, ...>`).

### `apps/web/shared/__tests__/i18n.test.ts`

```
# Test: SUPPORTED_LANGUAGES.length equals 19
# Test: SUPPORTED_LANGUAGES[0] === "en" (first entry is English)
# Test: SUPPORTED_LANGUAGES includes "th"
# Test: DEFAULT_LANGUAGE === "en"
# Test: RTL_LANGUAGES includes "ar"
# Test: RTL_LANGUAGES does not include "en"
# Test: LANGUAGE_LABELS has non-empty string entry for every SUPPORTED_LANGUAGES member
# Test: LANGUAGE_LABELS_EN has non-empty string entry for every SUPPORTED_LANGUAGES member
# Test: LANGUAGE_COVERAGE has numeric 0-100 entry for every SUPPORTED_LANGUAGES member
# Test: LANGUAGE_COVERAGE["en"] === 100
# Test: All codes match BCP-47 pattern /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/
# Test: No duplicate entries in SUPPORTED_LANGUAGES
# Test: Every RTL_LANGUAGES member is in SUPPORTED_LANGUAGES
```

## Files to Modify

### `apps/web/package.json`

Install: `cd apps/web && pnpm add i18next react-i18next i18next-resources-to-backend`

### `apps/web/vite.config.ts`

Add to the existing `manualChunks(id)` function, after the `vendor-xlsx` block:

```typescript
if (
  id.includes("node_modules/i18next/") ||
  id.includes("node_modules/react-i18next/") ||
  id.includes("node_modules/i18next-resources-to-backend/")
) {
  return "vendor-i18n";
}
```

## Interface Contract

- **Client**: `import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, LANGUAGE_COVERAGE } from "@shared/i18n";`
- **Server**: `import { SUPPORTED_LANGUAGES } from "../../shared/i18n";`
- **Types**: `import type { SupportedLanguage } from "@shared/i18n";`

## Key File Paths

- `apps/web/shared/i18n.ts` (create)
- `apps/web/shared/__tests__/i18n.test.ts` (create)
- `apps/web/vite.config.ts` (modify)
- `apps/web/package.json` (modify)
