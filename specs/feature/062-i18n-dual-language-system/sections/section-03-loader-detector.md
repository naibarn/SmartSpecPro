The predecessor sections have not been written yet. I have all the information I need to produce the section content.

# Section 03: Locale Loader and Language Detector

## Section ID
`section-03-loader-detector`

## Dependencies
- **section-01-shared-config**: Provides `SUPPORTED_LANGUAGES` tuple from `apps/web/shared/i18n.ts`
- **section-02-i18n-core**: Provides `i18n/config.ts` (re-exports `SUPPORTED_LANGUAGES`), `i18n/index.ts` (i18next instance), and `i18n/types.ts`

## Blocks
- **section-05-app-integration**: The loader and detector are wired into the i18next instance during initialization

## Overview

This section creates two modules:

1. **`apps/web/client/src/i18n/loader.ts`** -- A locale namespace loader that uses Vite `import.meta.glob` to lazily load JSON translation files with in-flight request deduplication.
2. **`apps/web/client/src/i18n/languageDetector.ts`** -- A custom i18next `LanguageDetectorModule` that resolves the user's preferred language from localStorage, then browser navigator, with strict allowlist validation.

Both modules are consumed by `i18n/index.ts` (section-02) during i18next initialization.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/i18n/loader.ts` | Vite glob-based namespace loader with dedup |
| `apps/web/client/src/i18n/languageDetector.ts` | Custom i18next language detector plugin |
| `apps/web/client/src/i18n/__tests__/loader.test.ts` | Tests for loader |
| `apps/web/client/src/i18n/__tests__/languageDetector.test.ts` | Tests for detector |

---

## Tests First

### Test File: `apps/web/client/src/i18n/__tests__/loader.test.ts`

```
Test: loadNamespace returns resolved promise for existing en/common
Test: loadNamespace returns resolved promise (no-op) for non-existent locale file
Test: loadNamespace calls i18next.addResourceBundle with correct args
Test: loadNamespace skips fetch if i18next.hasResourceBundle returns true
Test: concurrent calls to loadNamespace for same lng/ns only trigger one fetch
Test: concurrent calls to loadNamespace for different lng/ns trigger parallel fetches
Test: inFlight map is cleaned up after promise resolves
Test: inFlight map is cleaned up after promise rejects
Test: loadNamespace with invalid lng (not in glob) returns without error
```

**Testing approach:**

- Mock `i18next` with `vi.mock('i18next')` -- provide `hasResourceBundle` and `addResourceBundle` stubs.
- Mock `import.meta.glob` by providing a fake glob manifest object. The module references `import.meta.glob('../locales/*/*.json')` at the top level -- in tests, mock this via `vi.hoisted()` to return a controlled map of loader functions.
- The fake glob manifest maps string keys like `../locales/en/common.json` to `() => Promise.resolve({ default: { key: "value" } })`.
- For deduplication tests: use deferred promises (manual resolve) to verify that a second call for the same `lng/ns` reuses the same in-flight promise rather than creating a new one.
- For cleanup tests: resolve/reject the deferred promise and then verify a subsequent call creates a new fetch (not reusing the old entry).

### Test File: `apps/web/client/src/i18n/__tests__/languageDetector.test.ts`

```
Test: detects 'th' from localStorage when smartspec_locale='th'
Test: detects 'en' from localStorage when smartspec_locale='en'
Test: ignores invalid localStorage values (returns undefined, triggers next detector)
Test: ignores path traversal attempts in localStorage ('../../etc/passwd')
Test: ignores script injection attempts in localStorage ('<script>')
Test: maps navigator.language 'th-TH' to 'th'
Test: maps navigator.language 'zh' to 'zh-Hans'
Test: maps navigator.language 'pt-BR' to 'pt-BR'
Test: falls back to 'en' when navigator.language is unsupported
Test: cacheUserLanguage writes to localStorage
Test: cacheUserLanguage only writes valid language codes
```

**Testing approach:**

- Use `vi.stubGlobal` or direct assignment to mock `localStorage` (getItem/setItem) and `navigator.language`.
- The detector exports an object conforming to i18next `LanguageDetectorModule` interface with `type: 'languageDetector'`, `detect()`, and `cacheUserLanguage(lng)` methods.
- For validation tests, set localStorage to malicious values and assert the detector returns `undefined` (not the malicious value), which causes i18next to proceed to the next detection step.
- For browser language mapping: mock `navigator.language` to various BCP-47 tags and verify the detector maps them to the closest `SUPPORTED_LANGUAGES` entry.

---

## Implementation Guidance

### `apps/web/client/src/i18n/loader.ts`

**Purpose:** Provide the callback function used by `i18next-resources-to-backend` to lazily load translation JSON files via Vite code splitting.

**Key design elements:**

1. **Glob manifest** -- Use `import.meta.glob('../locales/*/*.json')` at module scope. This creates a build-time manifest mapping relative paths to dynamic `() => import(...)` functions. Each JSON file becomes a separate Vite chunk with a content-hashed filename.

2. **`loadNamespace(lng: string, ns: string): Promise<void>`** -- The primary exported function:
   - Build the manifest key: `../locales/${lng}/${ns}.json`
   - If `i18next.hasResourceBundle(lng, ns)` is true, return immediately (already loaded).
   - Check the `inFlight` Map for an existing promise for this `lng:ns` key. If found, return it (deduplication).
   - Look up the loader function from the glob manifest. If not found (no file exists for this language/namespace), resolve immediately -- i18next's fallback to English handles missing translations.
   - Execute the loader, extract the default export (the JSON object), call `i18next.addResourceBundle(lng, ns, data, true, true)` (the two `true` args mean deep merge + overwrite).
   - Store the promise in the `inFlight` Map. In `.finally()`, delete the entry from the map.

3. **`createBackendLoader()`** -- Exported factory function that returns the callback signature expected by `i18next-resources-to-backend`:
   ```
   (lng: string, ns: string) => Promise<Record<string, string>>
   ```
   This function looks up the glob manifest, calls the loader, and returns the JSON module's default export. If no file exists, it rejects (i18next handles this gracefully by falling back to `en`).

4. **The `inFlight` Map** -- A `Map<string, Promise<void>>` keyed by `${lng}:${ns}`. Prevents duplicate network requests when multiple React components simultaneously request the same namespace (e.g., two components both calling `useTranslation('common')` before the namespace is loaded).

**Security considerations:**
- The glob pattern is build-time only. Runtime callers cannot request arbitrary file paths. The manifest is a fixed set of keys determined at build time.
- No user input flows into file path construction beyond the language code, which is validated by the detector's allowlist.

### `apps/web/client/src/i18n/languageDetector.ts`

**Purpose:** Implement a custom i18next `LanguageDetectorModule` that determines the user's preferred language at app startup.

**Key design elements:**

1. **Interface compliance** -- Export an object matching the i18next `LanguageDetectorModule` interface:
   ```typescript
   {
     type: 'languageDetector' as const,
     detect(): string | undefined,
     cacheUserLanguage(lng: string): void,
   }
   ```

2. **`detect()` method** -- Detection chain:
   - **Step 1: localStorage** -- Read `localStorage.getItem('smartspec_locale')`. Validate the value against a `Set` constructed from `SUPPORTED_LANGUAGES` (imported from `@shared/i18n` via `i18n/config.ts`). If valid, return it. If invalid or missing, proceed.
   - **Step 2: navigator.language** -- Read `navigator.language` (BCP-47 tag like `th-TH`, `en-US`, `zh`). Apply mapping logic:
     - Try exact match first (e.g., `pt-BR` is in SUPPORTED_LANGUAGES).
     - Try base language (strip region: `th-TH` -> `th`).
     - Apply special mappings: `zh` -> `zh-Hans` (Simplified Chinese default).
     - Validate the mapped result against `SUPPORTED_LANGUAGES` Set.
     - If valid, return it.
   - **Step 3: Default** -- Return `'en'`.

3. **`cacheUserLanguage(lng: string)` method** -- Called by i18next when the language changes:
   - Validate `lng` against `SUPPORTED_LANGUAGES` Set.
   - If valid, write to `localStorage.setItem('smartspec_locale', lng)`.
   - If invalid, do nothing (silent rejection -- defense against corrupted state).
   - Wrap in try/catch for SSR or private browsing mode.

4. **`BROWSER_LANGUAGE_MAP`** -- A constant mapping for special cases where the BCP-47 base tag does not directly match a `SUPPORTED_LANGUAGES` entry:
   ```
   'zh' -> 'zh-Hans'
   ```
   This map is intentionally small. Most languages map directly via base tag extraction.

5. **`STORAGE_KEY`** -- Constant `'smartspec_locale'` matching the existing key used by the current i18n system in `lib/i18n/context.tsx`. **Export this constant** so sections 05, 06, and 09 import it instead of defining their own copy (prevents key drift). This ensures seamless migration -- users who already have a localStorage preference will be detected correctly.

**Security considerations:**
- All values read from localStorage are validated against the strict `SUPPORTED_LANGUAGES` allowlist before use. Invalid values (including path traversal attempts, script injection, or any non-matching string) are silently discarded.
- The `cacheUserLanguage` method also validates before writing to prevent poisoning localStorage.
- Note: The DB preference (`users.userPreferences.translationLanguage`) is NOT read in this detector. DB sync happens after auth in App.tsx (section-05). The detector only handles pre-auth bootstrapping.

---

## Integration Points

### How `loader.ts` is consumed

In `i18n/index.ts` (section-02), the loader is wired into i18next via:

```typescript
import resourcesToBackend from 'i18next-resources-to-backend';
import { createBackendLoader } from './loader';

i18next
  .use(resourcesToBackend(createBackendLoader()))
  .use(initReactI18next)
  // ...
```

The `createBackendLoader()` factory returns the function `i18next-resources-to-backend` needs. It is separate from `loadNamespace()` because the backend plugin manages its own calling semantics, while `loadNamespace()` is available for manual preloading in `useNamespacePreloader` (section-04).

### How `languageDetector.ts` is consumed

In `i18n/index.ts` (section-02):

```typescript
import { languageDetector } from './languageDetector';

i18next
  .use(languageDetector)
  // ...
```

The detector is passed directly as an i18next plugin. i18next calls `detect()` during `init()` and `cacheUserLanguage()` whenever `changeLanguage()` is invoked.

### Shared constants

Both modules import from `i18n/config.ts` (section-02), which re-exports `SUPPORTED_LANGUAGES` from `apps/web/shared/i18n.ts` (section-01). This ensures a single source of truth for the language allowlist.

---

## Key Constraints

- **No HTML in translations** -- Translation values loaded by the loader are plain text only. This is enforced by convention (security comment in config) and validated in locale file tests (section-08).
- **No eager loading** -- The `import.meta.glob` call must NOT use `{ eager: true }`. Each JSON file must be a separate lazy chunk.
- **Graceful degradation** -- If a locale file is missing or fails to load, the loader must not throw. i18next's fallback to English handles the gap.
- **localStorage key compatibility** -- The detector must use `'smartspec_locale'` as the storage key, matching the existing system to preserve user preferences during migration.
- **No `i18next-browser-languagedetector` dependency** -- The custom detector replaces this package (saving ~3 kB gzipped) since we only need localStorage + navigator detection.