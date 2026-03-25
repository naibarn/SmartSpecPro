# Section-10 Code Review Interview

## Auto-Fixed Items

### MEDIUM: i18n.language not normalized against SUPPORTED_LANGUAGES
**Decision**: Auto-fix
**Action**: Added normalization: `const lang = SUPPORTED_LANGUAGES.includes(i18n.language) ? i18n.language : DEFAULT_LANGUAGE`. Guards against browser-resolved codes like "en-US". Also removes the `as keyof typeof LANGUAGE_LABELS` type cast (type now sound). Added tests for zh-Hans (renders correct label) and en-US (normalizes to single button).

### MEDIUM: Test finder used wrong Thai string "ภาษาไทย" vs actual "ไทย"
**Decision**: Auto-fix
**Action**: Changed English and Thai button finders to use `getByTitle("English")` / `getByTitle("ไทย")`. Combined the two separate aria-pressed tests into one that asserts both buttons' states explicitly.

### LOW: Missing styling-classes tests
**Decision**: Auto-fix
**Action**: Added tests for `bg-primary` on active button and `text-muted-foreground` on inactive button.

## Let-Go Items

### LOW: aria-pressed tests could be more specific
**Decision**: Fixed (combined into one specific test above).

### LOW: `as keyof typeof LANGUAGE_LABELS` type cast
**Decision**: Fixed via normalization — type is now `SupportedLanguage` throughout, cast removed.
