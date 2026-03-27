# Section-07 Code Review Interview

## Auto-Fixed Items

### HIGH: `translation.ts` input `targetLanguage` not hardened
**Decision**: Auto-fix
**Action**: Changed `targetLanguage: z.string().max(10).optional()` → `z.enum(SUPPORTED_LANGUAGES).optional()` in translation.ts input schema. This closes the injection vector at the schema boundary, not just in the body.

### MEDIUM: `LANGUAGE_NAMES` map incomplete
**Decision**: Auto-fix
**Action**: Removed local `LANGUAGE_NAMES` map, replaced with `LANGUAGE_LABELS_EN` imported from `shared/i18n`. Also updated `targetLang.toUpperCase()` in credit description to use the human-readable label.

### LOW: `targetLang.toUpperCase()` cosmetic issue
**Decision**: Auto-fix (bundled with MEDIUM fix above)
**Action**: Now uses `LANGUAGE_LABELS_EN[targetLang] ?? targetLang` for the credit description.

## Let-Go Items

### MEDIUM: `media.ts` consumer `getUserTranslationLanguagePreference` unguarded
**Decision**: Let go (out of section-07 scope)
**Rationale**: `getUserTranslationLanguagePreference` feeds only `isThaiTranslationLanguage()` which does a simple string equality check. Injection risk is near-zero. This is a separate consumer path, not part of the section-07 spec scope. Track as future hardening.

### MEDIUM: `helpContentService` English fallback when locale dir missing
**Decision**: Let go (service implementation detail)
**Rationale**: The spec's language for this was "must also gracefully fall back" — already handled by returning empty arrays silently. The service is called from tRPC procedures that now validate locale at the router layer. Adding en-fallback in the service itself is a separate improvement outside section-07 scope.

### LOW: Test uses local schema copy
**Decision**: Let go
**Rationale**: Added inline comment to the test file warning about schema drift. The test structure matches the spec's exact requirement for direct schema validation.
