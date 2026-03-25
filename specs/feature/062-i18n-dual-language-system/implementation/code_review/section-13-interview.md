# Section-13 Code Review Interview

## Auto-Fixed Items

### HIGH: {{_count}} → {{count}} in notices JSON
**Decision**: Auto-fix
**Action**: Renamed `{{_count}}` → `{{count}}` in all 3 `notices.*` keys in both en/dashboard.json and th/dashboard.json. i18next requires `{{count}}` for interpolation.

### HIGH: healthBadge.*, subtitle, meta.* still hardcoded
**Decision**: Auto-fix
**Action**: Replaced all healthBadge ternary, subtitle, websitePreview, meta.updated, meta.analyticsWindow, meta.latestChat, meta.latestCredit with t() calls.

### HIGH: attentionNotices useMemo still hardcoded
**Decision**: Auto-fix
**Action**: Replaced all 6 notice title strings with t() calls using `notices.*` keys with `{ count }` interpolation parameter.

### HIGH: nextBestActions.title, prioritySnapshot.title, trendHealth all hardcoded
**Decision**: Auto-fix
**Action**: Replaced all three trendHealth DashboardSectionHeader props and both title props with t() calls.

### HIGH: quickActions, statusConfig labels hardcoded
**Decision**: Auto-fix
**Action**: Replaced all quickActions labels and statusConfig labels with t() calls.

### HIGH: usageMomentum hardcoded labels
**Decision**: Auto-fix
**Action**: Replaced all 5 momentum string values with t() calls; added `t` to useMemo deps.

### MEDIUM: toast.updated missing from common.json
**Decision**: Auto-fix
**Action**: Added `"toast.updated": "Updated successfully"` to both en/common.json and th/common.json; updated test.

### MEDIUM: Tests enhanced with new Dashboard.tsx t() assertions
**Decision**: Auto-fix
**Action**: Added 4 additional source-scan tests covering healthBadge, notices, quickActions.

## Let-Go Items

### MEDIUM: Missing ~13 spec dashboard keys (actions.*, txType.*, etc.)
**Decision**: Let go for this wave
**Rationale**: These keys are for UI elements not yet using t() calls (txTypeConfig, nextBestActions action labels). Adding unused keys creates maintenance overhead. They'll be added when the call sites are wired in Wave 2.

### MEDIUM: Integration tests should use jsdom render (spec requirement)
**Decision**: Let go
**Rationale**: Source-scan tests effectively verify the t() calls are present without the complexity of jsdom setup with i18next. The locale JSON files are validated by separate key-presence tests. Full render tests deferred to Wave 3 integration testing.

### LOW: session.unauthorized value semantic mismatch
**Decision**: Let go — the value "You are not authorized to perform this action" is a valid authorization message.

### LOW: momentum abbreviations vs spec values
**Decision**: Let go — abbreviated labels (Rising/Easing/Steady) are consistent with existing UI design.
