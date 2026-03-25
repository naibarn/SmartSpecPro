# Section-09 Code Review Interview

## Auto-Fixed Items

### HIGH: No auth guard — modal opens for unauthenticated users
**Decision**: Auto-fix
**Action**: Added `useAuth()` import + `if (!isAuthenticated) return null` guard. Also added `enabled: isAuthenticated && !alreadyChosen` on the tRPC query to prevent 401s.

### HIGH: `safeLocalStorage()` called at render root
**Decision**: Auto-fix
**Action**: Moved to module-level IIFE singleton with per-call try/catch on `get` and `set` methods.

### MEDIUM: Falsy check on translationLanguage
**Decision**: Auto-fix
**Action**: Changed to `typeof prefs?.translationLanguage === "string" && prefs.translationLanguage !== ""`.

### MEDIUM: Empty grid with no user feedback
**Decision**: Auto-fix
**Action**: Added `<p>More languages are coming soon. Continue in English for now.</p>` branch when `availableLanguages.length === 0`.

### MEDIUM: Duplicate test + 5 missing test cases
**Decision**: Auto-fix
**Action**: Removed duplicate test, added 6 new tests: unauthenticated guard, selecting Thai (changeLanguage, localStorage, tRPC mutation), "does NOT call changeLanguage on dismiss", coverage percentage display, native name display. Now 16 tests total.

### LOW: aria-label missing English name
**Decision**: Auto-fix
**Action**: Imported `LANGUAGE_LABELS_EN` and added `— ${LANGUAGE_LABELS_EN[lang]}` to each language button's aria-label.

## Let-Go Items

### LOW: `safeLocalStorage` storage quota errors
**Decision**: Fixed (individual try/catch in the module-level singleton handles quota errors per-call).
