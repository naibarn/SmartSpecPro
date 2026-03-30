# Section 07 -- Server-Side Language Allowlist

## Overview

This section hardens the `updatePreferences` tRPC mutation in `apps/web/server/routers/users.ts` by replacing the permissive `z.string().max(10)` validator on `translationLanguage` with a strict `z.enum(SUPPORTED_LANGUAGES)` check. This prevents arbitrary strings from being stored in the database and subsequently reaching LLM prompts via the translation service.

**Depends on**: section-01-shared-config (provides `SUPPORTED_LANGUAGES` in `apps/web/shared/i18n.ts`)
**Blocks**: section-09, section-11
**Parallelizable**: Yes -- can be implemented alongside sections 02-06.

## Security Context

The `translationLanguage` field stored in `users.userPreferences` JSON column is consumed by:
- `apps/web/server/routers/media.ts` -- voice language for media generation
- `apps/web/server/routers/translation.ts` -- LLM target language in prompt construction

Without allowlist validation, arbitrary strings (including prompt injection payloads) can reach LLM calls. This is a **security-blocking prerequisite**.

## Files to Modify

### `apps/web/server/routers/users.ts`

**Current code** (approximately line 756 in the `updatePreferences` input schema):
```typescript
translationLanguage: z.string().max(10).optional(),
```

**Changes:**

1. Add import at top:
   ```typescript
   import { SUPPORTED_LANGUAGES } from "../../shared/i18n";
   ```

2. Replace the validator:
   ```typescript
   translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
   ```

3. No other logic changes -- the mutation body continues unchanged since the parsed type is still `string | undefined`.

**Note**: The `@shared/` Vite alias is for client code. Server-side code uses relative paths (`../../shared/i18n`). Verify `tsconfig.json` resolves this path correctly.

### `apps/web/server/routers/help.ts`

**Also widen the locale enum** in all 4 help procedures (`getManifest`, `getTopic`, `getSearchIndex`, `getContextualTopics`):

**Current** (hardcoded):
```typescript
locale: z.enum(["en", "th"]).default("en")
```

**Change to**:
```typescript
import { SUPPORTED_LANGUAGES } from "../../shared/i18n";
// ...
locale: z.enum(SUPPORTED_LANGUAGES).default("en")
```

This ensures help system accepts Phase 2 languages without code changes. The `helpContentService` must also gracefully fall back to English when a requested locale's markdown directory doesn't exist.

### `apps/web/server/routers/translation.ts`

**Fix the LLM prompt injection path** at line ~57:

**Current**: `LANGUAGE_NAMES[targetLang] || targetLang` — if key not in map, raw user string reaches LLM prompt.

**Change**: Validate `targetLang` against `SUPPORTED_LANGUAGES` before use. If not in the set, default to `"en"`.

## Tests

### Test file: `apps/web/server/routers/__tests__/users.i18n.test.ts`

Validate the Zod schema directly by extracting the input schema and calling `.safeParse()`. No full tRPC context needed.

```
# Test: accepts translationLanguage='en' → success: true
# Test: accepts translationLanguage='th' → success: true
# Test: accepts translationLanguage='ja' → success: true
# Test: accepts translationLanguage='zh-Hans' → success: true (BCP-47 subtag)
# Test: accepts translationLanguage='pt-BR' → success: true (BCP-47 region)
# Test: rejects translationLanguage='invalid' → success: false
# Test: rejects translationLanguage='<script>' → success: false (XSS attempt)
# Test: rejects translationLanguage='en; DROP TABLE users' → success: false (SQL injection)
# Test: accepts translationLanguage=undefined (optional field) → success: true
# Test: accepts empty object {} → success: true (all fields optional)
```

**Test approach**: Reconstruct the schema or extract from tRPC procedure definition:
```typescript
import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "@shared/i18n";

const schema = z.object({
  translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  translationModel: z.string().max(100).optional(),
});
```

## Verification Checklist

1. `pnpm check` passes (no type errors from import or enum usage)
2. All 10 tests pass
3. Existing tests unbroken (`pnpm test`)
4. The `translationModel` field remains unchanged (`z.string().max(100).optional()`)

## Implementation Notes (Actual)

**Files modified:**
- `apps/web/server/routers/users.ts` — added `SUPPORTED_LANGUAGES` import, changed `translationLanguage` validator
- `apps/web/server/routers/help.ts` — added `SUPPORTED_LANGUAGES` import, widened all 4 locale enums
- `apps/web/server/routers/translation.ts` — hardened both input schema AND body-level validation; replaced local `LANGUAGE_NAMES` map with `LANGUAGE_LABELS_EN` from shared/i18n; also hardened `targetLanguage` input (HIGH finding from code review)

**Test file created:** `apps/web/server/routers/__tests__/users.i18n.test.ts` (10 tests)

**Code review fixes applied:**
- HIGH: `translation.ts` input `targetLanguage` changed to `z.enum(SUPPORTED_LANGUAGES).optional()`
- MEDIUM: `LANGUAGE_NAMES` replaced with `LANGUAGE_LABELS_EN` from shared/i18n (covers all 19 BCP-47 codes)

**Deferred:** `media.ts` consumer `getUserTranslationLanguagePreference` guard (low risk, out of scope); `helpContentService` English fallback (out of scope)
