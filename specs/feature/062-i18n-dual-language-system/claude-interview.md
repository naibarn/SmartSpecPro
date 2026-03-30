# Interview Transcript — Feature 062: i18n Dual-Language System

## Auto-Decisions (technical — decided from codebase research)

- **Library**: `i18next` + `react-i18next` + `i18next-resources-to-backend` (spec requirement + research confirms best fit for Vite SPA)
- **Format**: i18next native pluralization, not ICU (zero bundle overhead, sufficient for en/th, preserves all i18next features)
- **Loader**: `import.meta.glob` with `i18next-resources-to-backend` (Vite-native chunking confirmed to create separate chunks)
- **Vendor chunk**: Add `vendor-i18n` to vite.config.ts manualChunks (parallel loading)
- **Backward compat**: `useI18n()` wrapper delegates to `useTranslation(['help', 'common'])` — existing 13 consumer files continue working
- **Testing**: Vitest with existing mock pattern (`vi.mock("@/lib/i18n", ...)`) — adapt to mock i18next instead
- **Key format**: Flat dot-notation (`"auth.signIn.title"`) matching existing en.ts/th.ts pattern
- **DB sync**: Use existing `users.userPreferences.translationLanguage` field — no schema migration needed
- **Init failure**: 3-second timeout, mount app in English-only mode, never white-screen
- **Route preloading**: `useNamespacePreloader` hook using `useLocation()` from wouter — parallel with React.lazy chunk loading

---

## Q1: Wave 1 Migration Priority

**Q**: What is the priority order for Wave 1 migration? The spec lists nav, auth, dashboard, and common UI. Should we prioritize pages with the most Thai users first, or follow the spec order strictly?

**A**: Follow spec order (Nav → Auth → Dashboard → Common buttons/toasts/errors). Logical dependency order.

---

## Q2: Language Settings UX

**Q**: For the language preference settings page (where users pick their non-English paired language), should this be a dedicated settings section or just a simple dropdown in the existing user profile/settings page?

**A**: Dropdown in existing settings. Add a "Display Language" dropdown to the existing profile/settings page. Minimal new UI.

---

## Q3: First Visit Behavior

**Q**: How should the app behave for brand-new users who haven't set a language preference?

**A**: Show welcome language picker. One-time modal on first login: "Choose your language" with all supported options.

**Follow-up — Q5**: Should the picker show ALL 19 supported languages or only languages with translations available?

**A**: Only translated languages. Show only languages with ≥50% translation coverage. Avoids confusing users with mostly-English UI.

---

## Q4: AI-Assisted Translation

**Q**: Should we plan for AI-assisted translation of locale files in Phase 2+?

**A**: Yes, plan for LLM-assisted translation. Design the workflow to support LLM-generated drafts with human review. Add tooling in Wave 4.

**Follow-up — Q6**: Which model should generate initial translations?

**A**: Use project's existing LLM gateway (OpenRouter/Anthropic/OpenAI). Reuse existing infrastructure. Route through SmartSpecPro's own LLM proxy.

---

## Summary of Key Decisions

| Decision | Answer | Impact |
|----------|--------|--------|
| Wave 1 order | Spec order (nav→auth→dashboard→common) | Implementation sequence follows dependency chain |
| Language settings | Dropdown in existing settings page | No new route/page needed |
| First visit | Welcome language picker modal | New `WelcomeLanguagePicker` component needed |
| Picker languages | Only ≥50% translated languages | Need coverage metadata per language |
| AI translation | Yes, via existing LLM gateway | Plan tooling in Wave 4, affects translation maintenance workflow |
| Translation model | Existing LLM proxy | No new API integrations needed |
