# Section-11 Code Review Interview

## Auto-Fixed Items

### HIGH: Dead displayLanguage state in parent / sub-component not hydrated from prefs
**Decision**: Auto-fix
**Action**: Removed orphaned `displayLanguage` state and its `useEffect` sync from parent `Settings()`. Added `defaultValue?: string` and `onLanguageChange?: (lang: string) => void` props to `DisplayLanguageDropdown`. Parent now passes `defaultValue={prefsData?.translationLanguage || i18next.language}` and `onLanguageChange={(lng) => setTranslationLanguage(lng)}`.

### HIGH: Conflicting mutation instances (parent Save vs sub-component)
**Decision**: Auto-fix
**Action**: Sub-component fires its own mutation for immediate persistence (fire-and-forget on change). Parent's `translationLanguage` state is now kept in sync via `onLanguageChange` callback, so the Save button will use the up-to-date value. The two mutations now work atomically rather than conflicting.

### MEDIUM: Initial value not normalized for region codes
**Decision**: Auto-fix
**Action**: Changed initial value to `SUPPORTED_LANGUAGES.find(l => initial.startsWith(l)) ?? 'en'` — handles `"en-US"` → `"en"`.

### MEDIUM: Missing mutation error handling
**Decision**: Auto-fix
**Action**: Added `onError: (err) => toast.error(err.message)` to `useMutation` options.

### MEDIUM: Missing 8th test
**Decision**: Auto-fix
**Action**: Added `"dropdown reflects current i18next language on initial render"` test using `defaultValue="en"` prop.

### LOW: Missing aria association (htmlFor / id)
**Decision**: Auto-fix
**Action**: Added `id="display-language-select"` to `<select>` and `htmlFor="display-language-select"` to `<label>`.

### LOW: `isPending` guard missing
**Decision**: Auto-fix
**Action**: Added `isPending` check in `handleDisplayLangChange` and `disabled={isPending}` on `<select>`.

## Let-Go Items

### LOW: Hardcoded heading/description strings
**Decision**: Let go for this section
**Rationale**: Settings.tsx uses `useI18n()` legacy wrapper throughout (not yet migrated to `useTranslation`). Adding `t()` for these two strings would require adding translation keys to settings.json which is outside section-11 scope. Tracked for Wave 2 cleanup.
