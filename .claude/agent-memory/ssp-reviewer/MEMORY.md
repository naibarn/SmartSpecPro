# SSP Reviewer Agent Memory

## Spec 062 — i18n Dual-Language System — Section-13 (Wave 1 Dashboard + Common) — Verdict: APPROVE_WITH_FIXES (2026-03-25)

6 HIGH, 5 MEDIUM, 3 LOW findings.
- **HIGH-1 — `healthBadge.*` hardcoded at line 981**: Keys exist in JSON but `t()` never called — ternary still returns English strings.
- **HIGH-2 — `subtitle`, `websitePreview`, `meta.*` hardcoded at lines 986–1004**: Six keys defined in JSON, never wired.
- **HIGH-3 — `attentionNotices` useMemo still builds English strings**: `notices.*` keys in JSON use non-standard `{{_count}}` (incompatible with i18next plural `{{count}}`); `t()` never called in memo.
- **HIGH-4 — `nextBestActions` useMemo action labels/descriptions hardcoded**: `actions.*` keys not even present in `dashboard.json`; t() not called.
- **HIGH-5 — `quickActions`, `statusConfig`, `txTypeConfig` hardcoded**: Keys in JSON but t() never called at lines 642–668.
- **HIGH-6 — `trendHealth.*` section header and `prioritySnapshot.title` / `nextBestActions.title` hardcoded**: Lines 1126–1128, 1034, 1087.
- **MEDIUM-1 — `usageMomentum` useMemo builds English label strings**: Must store key, call t() at JSX site.
- **MEDIUM-2 — `{{_count}}` interpolation is wrong parameter name**: All six `notices.*` values use `{{_count}}`; i18next plural requires `{{count}}`.
- **MEDIUM-3 — ~35 spec-required dashboard keys absent**: `actions.*`, `sidebar.*`, `txType.*`, `momentum.label`, `trendHealth.liveView`, etc.
- **MEDIUM-4 — `toast.updated` absent from common.json**: Spec requires it; test also omits it.
- **MEDIUM-5 — Integration tests are source-scan only**: Spec requires jsdom render tests; only `toContain(string)` source scans present.
- **LOW-1 — `session.unauthorized` value semantics wrong**: Has "not authorized to perform this action" but spec requires "must be signed in to access this page".
- **LOW-2 — `momentum.*` values abbreviated vs spec wording**: `"Rising"` vs `"Usage is rising"` etc.
- **LOW-3 — No reverse th-completeness assertion**: Tests check th keys exist in en, not that en keys all have th translations.
Review file: `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-13-review.md`

## Spec 062 — i18n Dual-Language System — Section-12 (Wave 1 Nav + Auth) — Verdict: APPROVE_WITH_FIXES (2026-03-25)

3 HIGH, 3 MEDIUM, 3 LOW findings.
- **HIGH-1 — Mobile Navbar buttons hardcoded**: Desktop buttons translated; mobile menu "Sign In" and "Get Started Free" remain hardcoded English at `Navbar.tsx:265–275`.
- **HIGH-2 — `getResolvedMenuItems` not reactive to language change**: Plain function (not hook) reads `i18next.t()` once at call time. No React subscription — sidebar labels stale after language toggle. Fix: wrap with a hook that calls `useTranslation('nav')`, or add `useTranslation('nav')` in `Dashboard.tsx` to trigger re-render.
- **HIGH-3 — `AuthCallback.tsx` standard OAuth path still hardcoded**: Meta OAuth path was translated; the standard success (`'Authentication successful! Redirecting...'`) and error fallback (`'Authentication failed'`) strings remain hardcoded English.
- **MEDIUM-1 — `signUp.*` vs `signup.*` casing diverges from spec**: JSON files and tests use `signUp.*` (camelCase); spec defines `signup.*`. Latent defect — surfaces when Signup.tsx strings are replaced.
- **MEDIUM-2 — `layout.signIn` absent from test key assertions**: Used by DashboardLayout but not in `REQUIRED_LAYOUT_KEYS`.
- **MEDIUM-3 — `REQUIRED_NAVBAR_KEYS` covers only 5 of 13 navbar keys**: 8 keys (`navbar.workflows`, `navbar.gallery`, `navbar.docs`, etc.) not asserted.
- **LOW-1 — `layout.authRequired` value silently reworded** during migration (added "Please sign in to continue.").
- **LOW-2 — Partial Login.tsx migration is intentional** (hook added, 3 strings replaced); remaining hardcoded strings are known wave-1 state.
- **LOW-3 — Three spec-required auth-page i18n test files absent** (`Login.i18n.test.tsx`, `Signup.i18n.test.tsx`, `ForgotPassword.i18n.test.tsx`).
Review file: `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-12-review.md`

## Spec 062 — i18n Dual-Language System — Section-11 (Settings Display Language) — Verdict: APPROVE_WITH_FIXES (2026-03-25)

2 HIGH, 3 MEDIUM, 3 LOW findings.
- **HIGH-1 — Sub-component state never hydrated from saved prefs**: Parent `Settings()` holds a separate `displayLanguage` state and syncs it from `prefsData` in a `useEffect`, but `DisplayLanguageDropdown` is a module-level sub-component with its own isolated state. The parent's `setDisplayLanguage` is orphaned — the dropdown always initialises from `i18next.language`, not the user's saved preference.
- **HIGH-2 — Dual mutation instances can overwrite each other**: `DisplayLanguageDropdown` holds its own `trpc.users.updatePreferences.useMutation()` instance; the parent `Settings()` holds another. When the user changes the display language and then clicks the parent's Save button, the parent fires with its stale `translationLanguage` state, overwriting the value that `DisplayLanguageDropdown` just persisted.
- **MEDIUM-1 — `i18next.language` initialisation not normalised**: If i18next resolves to a region-tagged code (`"en-US"`), the controlled `<select>` value will not appear in the filtered `displayLanguages` list — the select renders with no matching option. The on-change allowlist guard is correct but the initial value is not guarded.
- **MEDIUM-2 — Sub-component mutation has no error handler**: Silently swallows network/validation errors. Parent's mutation has `onError` toast; sub-component does not.
- **MEDIUM-3 — Only 7 of 8 spec-required tests present**: Missing "dropdown reflects current i18next.language on initial render".
- **LOW-1 — No pending guard on mutation**: Multiple concurrent mutations can fire on rapid selection changes.
- **LOW-2 — `<label>` not associated to `<select>` via `htmlFor`/`id`**: Accessibility gap; screen readers cannot associate label with combobox.
- **LOW-3 — Section heading and description are hardcoded English strings**: Not wrapped in `t()` — will not translate when language is changed.
Review file: `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-11-review.md`

## Spec 062 — i18n Dual-Language System — Section-10 (Locale Toggle) — Verdict: APPROVE_WITH_FIXES (2026-03-25)

0 HIGH, 3 MEDIUM, 3 LOW findings.
- **MEDIUM-1 — `i18n.language` not guarded against non-`SUPPORTED_LANGUAGES` values**: If i18next resolves `"en-US"` (browser locale), `currentLang === "en"` is false, rendering `["en", "en-US"]` with raw code as button text. Fix: normalise `currentLang` against `SUPPORTED_LANGUAGES` before use.
- **MEDIUM-2 — English-button finder uses wrong Thai string**: Test line 50 excludes `"ภาษาไทย"` but production renders `"ไทย"` (`LANGUAGE_LABELS["th"]`). The `find` is always undefined; `|| buttons[0]` silently rescues it — dead find logic.
- **MEDIUM-3 — No BCP-47 region-tag test**: No test for `mockLanguage = "zh-Hans"` to verify the hyphenated code resolves to the correct label and not the raw fallback string.
- **LOW-1 — `as keyof typeof LANGUAGE_LABELS` cast suppresses type safety**: The cast masks the fact that `visibleLocales` entries are unvalidated `string` values. Pre-validating against `SUPPORTED_LANGUAGES` makes the cast unnecessary.
- **LOW-2 — `aria-pressed` tests are structurally weak**: Two separate tests each assert that any button has the given state, not that the *correct* button has it. Could both pass even with inverted state.
- **LOW-3 — Styling-classes test missing**: Spec §Test cases requires asserting `"bg-primary"` on active and `"text-muted-foreground"` on inactive buttons — not implemented.
Review file: `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-10-review.md`

## Spec 062 — i18n Dual-Language System — Section-08 (Locale JSON Files) — Verdict: APPROVE_WITH_FIXES (2026-03-25)

2 HIGH, 3 MEDIUM, 3 LOW findings.
- **HIGH-1 — `bsHelp.*` key collision overwrites `help.*` in help.json**: Both `bsHelp` and `help` map to the `"help"` namespace. After prefix stripping, `bsHelp.title` overwrites `help.title` ("Complete User Guide" → "Browser Session Help"). Any shared key suffix between the two source prefixes is silently clobbered. No test catches this.
- **HIGH-2 — Unknown source prefixes silently fall to `misc.json`**: `keyToNamespace()` returns `"misc"` for unmapped prefixes. `misc.json` is never registered with i18next — any keys landing there are silently dropped from the runtime. No guard, no test, no error thrown.
- **MEDIUM-1 — `ensureCommonKeys` uses falsy check `!data[k]`**: Would overwrite `"0"` or `""` values. Also has a latent divergence: script seeds `"copied": "Copied!"` while migration produces `"Copied to clipboard"` (migration wins today, but no test enforces alignment).
- **MEDIUM-2 — `filePrefixMap` in prefix-stripping test is incomplete**: Doesn't cover `bsHelp.` for help.json, or `notifications.`/`common.` for common.json.
- **MEDIUM-3 — No key-count completeness test for 8 migrated namespaces**: Only `help` has the completeness assertion; `chat`, `settings`, `billing`, `workflow`, `media`, `admin`, `presentation` are unverified.
Review file: `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-08-review.md`

## Spec 062 — i18n Dual-Language System — Section-07 (Server Allowlist) — Verdict: APPROVE_WITH_FIXES (2026-03-25)

1 HIGH, 3 MEDIUM, 2 LOW findings.
- **HIGH — `targetLanguage` input not hardened in `translation.ts`**: The procedure body applies the `rawLang → targetLang` allowlist fallback, but the Zod *input* schema is still `z.string().max(10).optional()`. A 9-char payload passes input validation and only gets sanitised at runtime — the schema boundary is the authoritative enforcement point.
- **MEDIUM-1 — `LANGUAGE_NAMES` map does not cover all `SUPPORTED_LANGUAGES`**: Missing `en`, `ar`, `ru`, `hi`, `vi`, `id`, `it`, `nl`, `pl`, `tr`, `zh-Hans`, `zh-Hant`, `pt-BR`. Raw BCP-47 codes fall through to LLM prompt. Fix: use `LANGUAGE_LABELS_EN` from `shared/i18n.ts`.
- **MEDIUM-2 — `media.ts` consumer unguarded**: `getUserTranslationLanguagePreference` returns raw `prefs.translationLanguage` string without `SUPPORTED_LANGUAGES` check. Spec §Security Context lists this path explicitly.
- **MEDIUM-3 — `helpContentService` missing English fallback**: Spec requires fallback to English when locale dir does not exist; service silently returns empty array. Also `getLocaleDir(locale)` uses the string directly with no internal guard.
- **LOW-1 — Test schema reconstructed locally**: `users.i18n.test.ts` re-declares the schema instead of importing from the router; can drift silently.
Review file: `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-07-review.md`

## Spec 062 — i18n Dual-Language System — Section-06 (Backward Compatibility) — Verdict: CONDITIONAL PASS (2026-03-25)

1 HIGH, 2 MEDIUM, 2 LOW findings.
- **HIGH-1 — `setLocale` not memoized**: New implementation returns a fresh arrow function on every render; old API used `useCallback`. Consumers passing `setLocale` as a prop or in a `useEffect` dep array will re-fire on every render — behavioral regression from old API.
- **MEDIUM-1 — `locale` type cast unsafe**: `(i18n.resolvedLanguage ?? i18n.language) as Locale` lies to TypeScript if i18next is ever initialized with a language outside `"en" | "th"` (e.g. "en-US"). Silent type lie, not a runtime error.
- **MEDIUM-2 — Namespace list hardcoded with no audit**: Three namespaces `["help","common","admin"]` assumed to cover all 13 consumers. No audit of actual key prefixes used. Any key in an unlisted namespace falls back to key-as-string silently.
- **LOW-1 — `dict: {}` is a permanent lie**: Interface still declares `TranslationDictionary`; no consumer reads it today, but no runtime warning exists to catch future misuse before Wave 3 cleanup.
- **LOW-2 — Shared module cache + mutable singleton in tests**: Dynamic `await import(../context)` inside each `it()` shares the same module instance; language-change tests mutate a shared `testI18n` singleton — potentially flaky under parallel test execution.
Review file: `.claude/agent-memory/ssp-reviewer/project_062_i18n_section06_review.md`

## Spec 062 — i18n Dual-Language System — Section-01 (Shared Config) — Verdict: APPROVE_WITH_FIXES (2026-03-24)

1 HIGH, 3 MEDIUM, 2 LOW findings. All spec requirements implemented correctly; issues are integration/safety concerns.
- **HIGH — react-i18next v16 / i18next v25 peer-dep unverified**: No `pnpm-lock.yaml` diff present. `react-i18next@^16.6.5` peer constraint requires `i18next >=24 <26`; v25 is a major with `TypeOptions` breaking changes. Must verify with `pnpm ls` in CI before downstream sections build on this.
- **MEDIUM — Dual i18n system co-existence unaddressed**: Existing `client/src/lib/i18n/` (bespoke, `Locale = "en" | "th"`) still active. No migration plan in section-01. Sections using `@shared/i18n` + sections using `useI18n()` will have dual sources of truth for active language until section-06 (backward compat) lands.
- **MEDIUM — No HTML-markup test for label values**: Security comment requires plain text only, but no test asserts `/<[^>]+>/` is absent from `LANGUAGE_LABELS`/`LANGUAGE_LABELS_EN`.
- **MEDIUM — Server `@shared/` alias unverified**: Vite alias resolves `@shared/` client-side only. Server must use relative import. Risk of downstream sections using wrong path.
Review file: `specs/feature/062-i18n-dual-language-system/implementation/code_review/section-01-review.md`

## Spec 062 — i18n Dual-Language System — Plan Completeness Review — Verdict: APPROVE_WITH_FIXES (2026-03-24)

5 of 13 section files were never generated — only `.prompts/` stubs exist. Wave 0 + Wave 1 are NOT implementable until these are written.
- **BLOCKING: section-06-backward-compat.md missing** — 13 existing `useI18n()` consumers will break without this.
- **BLOCKING: section-07-server-allowlist.md missing** — security requirement S2 unimplemented.
- **BLOCKING: section-08-locale-files.md missing** — all 17 namespace JSON files + en.ts/th.ts migration. Sections 12 and 13 depend on it.
- **section-11-settings-language.md missing** — settings page Display Language dropdown unimplemented.
- Additional gaps: `main.tsx` i18nReady gating only in section-05 prose, `helpRouter` locale widening has no section, section-04 preloader calls `i18next.loadNamespaces()` not `loadNamespace()` from loader.ts (inconsistency with spec).
Review file: `.claude/agent-memory/ssp-reviewer/project_062_i18n_plan_review.md`

## Spec 061 — Upload-Post Universal Gateway — Round-2 Review — Verdict: APPROVE_WITH_FIXES (2026-03-24)

All 3 CRITICALs from Round 1 FIXED. 3 new HIGH, 5 MEDIUM, 2 LOW remain.
- **NEW-HIGH-1 — Large video upload path undefined**: §4.1 says "signed URL pattern" for >100MB video but never defines it. 30s UploadPostClient timeout will abort large uploads silently.
- **NEW-HIGH-2 — XSS in JWT callback**: `window.opener.postMessage('upload-post-linked','*')` wildcard origin — must be `'https://smartaihub.app'`.
- **NEW-HIGH-3 — Feature flag fail-OPEN risk**: `getTenantFeatureFlag()` existing helper defaults to `true` on Redis failure. Spec defines `isUploadPostEnabled()` (fail-closed) but does NOT mandate it replaces the generic helper in the tRPC middleware. If implementer uses the wrong helper, flag is fail-open.
- **NEW-MED-1 — Unified timeline pagination unspecified**: Two independent ISO timestamp cursors for native + Upload-Post cannot be merged without a shared cursor strategy. Page boundaries will drop or duplicate items.
- **NEW-MED-4 — Agency background context gap**: §4.6 says "executor resolves user's connection" but gives no mechanism for injecting userId into headless agency runs.
Review files: `.claude/agent-memory/ssp-reviewer/project_061_upload_post_gateway_review.md` (R1), `project_061_upload_post_gateway_review_r2.md` (R2)

## Spec 061 — Upload-Post Universal Social Gateway — Plan Completeness Review — Round 1 — Verdict: APPROVE_WITH_FIXES (2026-03-24)

3 CRITICAL, 5 HIGH, 6 MEDIUM, 4 LOW findings (all addressed in updated spec). Key (now fixed):
- CRITICAL-1: social_posts.pageId NOT NULL deadlock — FIXED by standalone upload_post_jobs
- CRITICAL-2: Circular FK — FIXED (removed)
- CRITICAL-3: No migration DDL — FIXED (Section 3.7)
Review file: `.claude/agent-memory/ssp-reviewer/project_061_upload_post_gateway_review.md`

## Spec 058 — Agency Creator Intelligence Upgrade — Section-08 (Frontend Suggestions UI) — Verdict: CONDITIONAL PASS (2026-03-24)

2 HIGH, 3 MEDIUM, 4 LOW findings. Key:
- **HIGH-1 — `Apply` button and `handleApplySuggestion` absent**: Only a `Skip`/Noted flow exists. The `applySuggestion` tRPC procedure is not defined. The `appliedSuggestions` Set tracks dismissals, not applications — a semantic mislabel. Spec §4 (Security: F03) requires a whitelist-only apply path.
- **HIGH-2 — `change` field not stripped from client response**: Python backend stores `change` in every suggestion dict. The tRPC `autoCreateStatus` return type omits it but uses an `as` cast (no Zod parse), so the runtime object still contains `change`. Spec §4 explicitly forbids forwarding the raw change payload to the browser.
- **MEDIUM-1 — `onCreated` callback deferred without caller audit**: Original code auto-called `onCreated(agencyId)` on completion; new code requires a button click. Callers in `AgencyBuilder.tsx` may rely on the auto-call.
- **MEDIUM-2 — tRPC mutation accessed via `?? { mutateAsync: null }` defensive pattern** bypasses type safety for `saveAsTemplate`.
- **MEDIUM-3 — Suggestion text rendered without Zod parse**: Conditional on HIGH-2 fix; currently safe with React text nodes but no structural validation.
Review file: `specs/feature/058-agency-creator-intelligence-upgrade/implementation/code_review/section-08-review.md`

## Spec 059 — KNPLabs AI Multi-Provider Expansion — Plan Completeness Review — Verdict: APPROVE_WITH_FIXES (2026-03-24)

2 CRITICAL, 5 HIGH, 7 MEDIUM, 4 LOW findings. Key:
- **CRITICAL-1 — generation_service.py integration path absent**: No section describes how `media_generation.py` routes `provider=knplabai` to the new Celery task. Section 05 defines the task but nothing wires it in.
- **CRITICAL-2 — `_upload_and_return_url` helper undefined**: Used in Sections 04/06/07 (Gemini base64 and TTS binary→S3) but not defined anywhere in the spec or existing provider code.
- **HIGH-1 — `KNPLABAI_API_KEY` missing from `config.py`**: No section adds the env var to pydantic BaseSettings — provider instantiation will raise AttributeError.
- **HIGH-2 — Factory.py integration uses wrong pattern**: `factory.py` handles LLM providers only; KNPLabAIProvider is a media provider and must be wired in the media dispatch layer, not the LLM ProviderFactory.
- **HIGH-3 — VEO multipart/form-data submission undetailed**: httpx requires `files=` kwarg; spec only sketches polling, not form-data submission.
- **HIGH-4 — Credit cost column mismatch**: Spec shows both "0.156 cr/req" and integer "5" for the same model — rounding rule and DB column type are ambiguous.
- **HIGH-5 — Section 08 embeddings dimension mismatch risk**: KNPLabs fallback may use 3,072-dim vectors while existing data uses 1,536-dim — corrupts vector comparisons silently.
Review file: `.claude/agent-memory/ssp-reviewer/project_059_knplabai_plan_review.md`

## Project Conventions (confirmed)

- tRPC routers: `apps/web/server/routers/library.ts` — library feature router
- Library service: `apps/web/server/services/libraryService.ts`
- Zod schemas inline in router `.input()` — no separate schema file for library
- `fileBase64` is used for file uploads/replace — **no server-side size cap on `replaceFile`** (only `saveMarkdown` has a 5MB cap); `uploadFile` cap is 68MB base64 (`MAX_FILE_BASE64_LENGTH = 68_000_000`)
- `fileBase64` must be a **raw base64 string** (no `data:` prefix). `FileReader.readAsDataURL()` returns a prefixed data URL — callers must strip the prefix with `.split(",")[1]` before sending. Sending the full data URL corrupts stored files silently.
- Auth pattern: `protectedProcedure` enforces JWT; tenant isolation via `resolveLibraryTenantId`

## Spec 057 — MCP Security Context Optimization, Section-17 (Multi-Transport Client) — Verdict: APPROVE_WITH_FIXES (2026-03-24)

3 HIGH, 5 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — Shell injection in `_call_rpc_stdio`**: `f"echo '{payload}' | cat"` embeds unsanitized JSON in a shell string. Single-quote in any param value causes RCE inside the container.
- **HIGH-2 — No HTTP connection pooling**: New `httpx.AsyncClient` created per `call_rpc` call. Contradicts module docstring; TLS reconnect on every request.
- **HIGH-3 — Response size limit bypassable via chunked encoding**: `resp.content` buffers full body before byte count check; chunked responses bypass the pre-download `Content-Length` guard.
- **MEDIUM-1 — Post-connect IP verification absent**: `validated_ip` stored but never re-checked after TCP connect — spec §Security §1 (NEW-06) requires this step explicitly.
- **MEDIUM-2 — SSE fallback logged but not executed**: `mcp_streamable_fallback` is logged then `McpConnectionError` raised immediately; no GET fallback attempt.
- **MEDIUM-3 — `test_health_check_returns_status` makes a live network call** with no mock — passes vacuously via `except Exception` fallback.
- **LOW-1 — `test_auto_reconnect_max_3_retries` is a constant assertion**: No reconnect loop exists in production code.
Review file: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-17-review.md`

## Spec 058 — Agency Creator Intelligence Upgrade — Section-06 (Template Save) — Verdict: APPROVE_WITH_FIXES (2026-03-24)

2 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — `mcpServerTokensEncrypted` / `mcpServers` stripped by omission only**: Agent definition builder never reads these columns, but no explicit exclusion guard or comment exists. A future refactor using spread would silently embed encrypted tokens or server URLs in publicly readable template JSON.
- **HIGH-2 — Agent/flow selects lack tenant re-verification**: Lines 4875/4879 filter only by `agencyId`; a defence-in-depth `tenantId` re-check is absent. Race condition between agency lookup and agent query could leak cross-tenant data.
- **MEDIUM-1 — Migration bundles social DDL with `agency_templates` ALTER**: `0117_modern_patriot.sql` contains 11 social-channel table creations before the blocking `agency_templates` column additions. A failure in any social DDL rolls back the section-06 schema fix.
- **MEDIUM-2 — Admin test missing insert assertion**: Admin test verifies `templateId` returned but does not assert `agentDefinitions` is empty — allows shared mock state to produce false positives.
- **MEDIUM-3 — 2 spec-required tests missing**: "strips UUIDs" assertion on `id` absence and "preserves nodeConfig/modelRequirements" not implemented.
Review file: `specs/feature/058-agency-creator-intelligence-upgrade/implementation/code_review/section-06-review.md`

## Spec 058 — Agency Creator Intelligence Upgrade — Section-05 (Post-Creation Suggestions) — Verdict: REQUEST_CHANGES (2026-03-24)

3 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — `_llm_suggest_improvements` uses `_llm_call` directly (not `_budget_llm_call`)**: One untracked LLM call per design run bypasses the MAX_LLM_CALLS=18 budget guard. Recurring pattern from Section-04.
- **HIGH-2 — Race condition in `check_rate_limit`**: GET + INCR + EXPIRE is non-atomic; concurrent requests from the same user can both pass the check before either increments. Fix: use `INCR` return value directly (atomic), set `EXPIRE` only when count==1 for a fixed window.
- **HIGH-3 — `change` field forwarded raw to frontend**: Spec F09 requires `autoCreateStatus` to strip `change` from suggestions via Zod before returning. `safeData` is returned with a bare `as` cast — no stripping, no validation.
- **MEDIUM-1 — No retrieval path for suggestions**: Only `hasSuggestions: bool` surfaces in completed status; no `getCreatorSuggestions` tRPC procedure exists; frontend cannot fetch the suggestion array.
- **MEDIUM-2 — `get_suggestions` has no error handling**: Redis failure raises unhandled exception; `store_suggestions` is protected but its read counterpart is not.
- **MEDIUM-3 — Rate limit window slides**: `r.expire()` called on every creation resets the TTL, creating a sliding window instead of the fixed 1-hour window the spec requires.
Review file: `specs/feature/058-agency-creator-intelligence-upgrade/implementation/code_review/section-05-review.md`

## Spec 058 — Agency Creator Intelligence Upgrade — Section-04 (Review Enhancement) — Verdict: APPROVE_WITH_FIXES (2026-03-24)

2 HIGH, 2 MEDIUM, 2 LOW findings. Key:
- **HIGH-1 — Budget guard bypassed**: `_llm_review_plan` and `_llm_review_design` call `_llm_call` directly, not `_budget_llm_call`. Up to 6 review iterations per design run can occur against a MAX_LLM_CALLS=12 budget without counting.
- **HIGH-2 — Fix-instruction test only covers design reviewer**: `test_review_design_includes_fix_instruction` is titled "Both review prompts" but never calls `_llm_review_plan`. Missing `test_review_plan_includes_fix_instruction`.
- **MEDIUM-1 — `_llm_review_design` loses complexity/memory hints**: Plan reviewer injects `complexity_level` and `memory_recommendation` from `discover_analysis`; design reviewer omits them — asymmetry unintentional.
- **MEDIUM-2 — Two spec-required behavioral tests absent**: `test_review_design_checks_capabilities` and `test_review_design_checks_memory` from spec §Tests not implemented.
Review file: `specs/feature/058-agency-creator-intelligence-upgrade/implementation/code_review/section-04-review.md`

## Spec 058 — Agency Creator Intelligence Upgrade — Section-03 (Memory-Informed Planning) — Verdict: APPROVE_WITH_FIXES (2026-03-24)

2 HIGH, 2 MEDIUM, 2 LOW findings. Key:
- **HIGH-1 — Memory type mismatch vs spec**: Implementation queries `('constraint', 'preference', 'fact', 'skill')` but spec requires `('strategy_success', 'strategy_failure', 'process', 'insight')`. The DB only has the former types. Divergence needs formal reconciliation — either the spec is stale or those types were never added to the schema.
- **HIGH-2 — `agency_improvement_history` secondary query absent**: Spec §Changes.1 explicitly requires a second query to this table (last 30 days, limit 5, with try/except fallback). Entirely missing from implementation.
- **MEDIUM-1 — F02 security test too weak**: `test_scoped_by_tenant_and_user` only asserts `execute.called`, not that WHERE clause includes both tenant_id and user_id. A regression removing the user_id filter passes silently.
- **MEDIUM-2 — Broken positional-arg fallback in `TestPlanIncludesMemories`**: `call_args[1]` accesses the kwargs dict, not the second positional arg. Assertion may not fire correctly.
Review file: `specs/feature/058-agency-creator-intelligence-upgrade/implementation/code_review/section-03-review.md`

## Spec 058 — Agency Creator Intelligence Upgrade — Section-02 (Interview Replacement) — Verdict: NEEDS_FIX (2026-03-24)

1 HIGH, 2 MEDIUM, 2 LOW findings. Key:
- **HIGH-1 — `discover_analysis` never forwarded to `_llm_plan()` or `_llm_design()`**: Extracted from payload at line 259 of `_design_async` but not passed as argument to either downstream function. The design LLM never sees capability recommendations — the primary purpose of the section is undelivered.
- **MEDIUM-1 — `"react"` keyword too broad**: Bare substring match suppresses legitimate goal questions like "How will users react?" — should use word-boundary regex or a more specific pattern.
- **MEDIUM-2 — No API-level test for answer-submission path**: `/answer` endpoint's `_discover_analysis` round-trip through Redis → design payload is untested at the FastAPI layer.
Review file: `specs/feature/058-agency-creator-intelligence-upgrade/implementation/code_review/section-02-review.md`

## Spec 058 — Agency Creator Intelligence Upgrade — Section-01 (Discover Enhancement) — Verdict: NEEDS_FIX (2026-03-24)

3 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — `computer_use` guardrail ignores tenant feature flag**: `_validate_spec` unconditionally strips `supportsComputerUse`; spec §5 requires `check_agentic_flag("agencyComputerUseEnabled", tenant_id)` so trusted tenants can opt in. No opt-in path exists.
- **HIGH-2 — `agencyCreateSchema` still strips `objective` and `sharedInstructions`**: Confirmed unresolved from prior plan-review CRITICAL finding. Python sends both in `body_json` but Node.js schema and INSERT omit them.
- **HIGH-3 — `MAX_DISCOVER_CALLS` defined but not enforced**: No retry loop in `_llm_discover`; the budget cap is dead code. Test is a constant-value assertion, not a behavioural test.
- **MEDIUM-1 — `_self_review_spec` adds up to 2 untracked LLM calls in design phase**: Outside any budget constant.
- **MEDIUM-2 — Sanity check `abs(old_nodes - new_nodes) <= 3` allows 0-node result and doubling from small specs**.
Review file: `specs/feature/058-agency-creator-intelligence-upgrade/implementation/code_review/section-01-review.md`

## Spec 058 — Agency Creator Intelligence Upgrade — Plan Completeness Review — Verdict: APPROVE_WITH_FIXES (2026-03-23)

1 CRITICAL, 4 HIGH, 6 MEDIUM, 3 LOW findings. Key:
- **CRITICAL — `objective` + `sharedInstructions` silently stripped by internal API**: `_implement_agency` sends both fields in `body_json` but `agencyCreateSchema` (index.ts line 954-978) doesn't include them — Zod strips them. The agencies INSERT also never reads them. Section 07 identifies the fix but must be complete.
- **HIGH-1 — `AsyncSessionLocal` import path missing from Section 03**: Section 03 references the import without specifying `from app.core.database import AsyncSessionLocal` — causes ImportError in Celery worker.
- **HIGH-2 — Section 06 no tenant isolation on agency read for saveAsTemplate**.
- **HIGH-3 — Section 08 `handleApplySuggestion` is a stub**: Apply button marks suggestion as applied but never calls `saveBuilder`. No section defines the `change` payload → `saveBuilder` mapping.
- **HIGH-4 — Budget guard absent in discover task**: MAX_LLM_CALLS budget is tracked only in `_design_async`; discover task calls `_llm_call` directly with no budget limit.
Review file: `.claude/agent-memory/ssp-reviewer/project_058_agency_creator_plan_review.md`

## Spec 058 — Meta Channels Plan Completeness Review — Verdict: APPROVE_WITH_FIXES (2026-03-23)

1 CRITICAL, 4 HIGH, 5 MEDIUM, 2 LOW findings. Key:
- **CRITICAL — `socialPages` Drizzle block missing `aiActionMode` + `autoSendConfidenceThreshold`**: Columns present in spec detail table but absent from the TypeScript code block (plan lines ~201-218). Sections 08 and 14 will have schema mismatch.
- **HIGH-1 — Skills integration absent**: `meta-messenger` + `meta-page-manager` skills from spec.md §1.1 are not in the plan or section manifest.
- **HIGH-2 — `social_cleanup_task.py` unplanned**: Listed in spec.md §4.6 but no section, no task body, no TDD test, no Celery beat schedule.
- **HIGH-3 — `workflowTriggerStatus` column missing from Drizzle code block**: Referenced in workflow trigger narrative (plan §9) but not in the `socialMessages` TypeScript schema block — runtime error when batch trigger task queries it.
- **HIGH-4 — API version mismatch**: spec.md env example uses `v21.0`; claude-spec and plan use `v25.0`.
- **MEDIUM-1 — Redis unread counters unplanned**: Interview Q2 specified Redis-cached inbox counters; plan uses DB column only.
- **MEDIUM-2 — Real-time trigger rate limiter unimplemented**: Described in narrative but no section defines the Redis counter or tests it.
- **MEDIUM-3 — Blocked-category enforcement path unspecified in sections**: Section-14 mentions it but no implementation detail for the `generateDraft`/auto-send path.
Review file: `.claude/agent-memory/ssp-reviewer/project_058_meta_channels_plan_review.md`

## Spec 057 — MCP Security Context Optimization, Section-11 (Few-Shot Relevance + RAG Dedup) — Verdict: APPROVE_WITH_FIXES (2026-03-23)

2 HIGH, 4 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — Wrong patch target for deferred local import**: `EMBED_SVC = "app.orchestrator.vector_store.embedding_service.EmbeddingService"` patches the class in the source module, but production code imports it inside the `try` block body on each call. The name never exists as a module attribute in `agency_few_shot`. Correct fix: move import to module level and patch `"app.services.agency_few_shot.EmbeddingService"`. (Same pattern as Section-09 HIGH-1.)
- **HIGH-2 — `hash()` cache key is non-deterministic across processes**: `_example_embedding_cache` uses `hash(ex_text)` as a key; Python randomizes `hash()` for strings by default (`PYTHONHASHSEED`). Collision between two different strings silently poisons the cache. Use `hashlib.md5(ex_text.encode()).hexdigest()` instead.
- **MEDIUM-1 — `select_relevant_examples` never called from production code**: Function defined but never wired — `agency_orchestrator.py` still calls `prepend_examples` directly. Relevance filtering is dead code.
- **MEDIUM-2 — FIFO eviction fires after insert**: Cache reaches `_CACHE_MAX_SIZE + 1` before eviction. Check `>= _CACHE_MAX_SIZE` before inserting.
- **MEDIUM-3 — `deduplicate_chunks` has no pre-sort guard**: Spec requires caller to pre-sort by score, but function silently keeps the first (not highest-scored) duplicate if input is unsorted. Add internal sort or document.
- **MEDIUM-4 — Cache test does not document that task embeddings are intentionally never cached**.
Review file: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-11-review.md`

## Spec 057 — MCP Security Context Optimization, Section-10 (Chat Token Counting) — Verdict: APPROVE_WITH_FIXES (2026-03-23)

2 HIGH, 3 MEDIUM, 2 LOW findings. Key:
- **HIGH-1 — "At least 6 turns" guard allows oversized messages past budget**: `chatMessages.length >= 6` check is the only brake — when `chatMessages.length < 6`, every message is added unconditionally regardless of token size. A large pasted document as a single message can blow the model's context window.
- **HIGH-2 — Dynamic `import("../../drizzle/schema")` for `llmModels`**: Module is already statically imported at the top of the file; the dynamic import is unnecessary, confuses static analysis, and should be a static import.
- **MEDIUM-1 — `OUTPUT_RESERVE = 8192` hardcoded**: Not derived from model's actual `maxOutputTokens`. Should use model row data when available.
- **MEDIUM-2 — `if (modelRow?.contextLength)` falsy for `contextLength = 0`**: Schema column is nullable integer with no `> 0` constraint. Use `!= null && > 0` guard.
- **MEDIUM-3 — Negative `remainingBudget` not clamped**: If system context exceeds `inputBudget`, `remainingBudget` is negative; the minimum-6-turn guarantee then forces messages in past the context window limit.
- **MEDIUM-4 — Four divergent local `estimateTokens` implementations not consolidated**: `messageChunkerService.ts`, `memoryMerger.ts`, `memoryService.ts` each have their own simpler `ceil(len/4)` variant. Migration should be deliberate (formulas differ; chunk sizing was calibrated against the simpler formula).
Review file: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-10-review.md`

## Spec 057 — MCP Security Context Optimization, Section-09 (Vector Memory Tests) — Verdict: APPROVE_WITH_FIXES (2026-03-23)

2 HIGH, 3 MEDIUM, 2 LOW findings. Key:
- **HIGH-1 — Autouse fixture patches wrong module path**: `mock_embedding_service` patches `app.services.embedding_service.get_embedding_service`, but `long_term_memory.py` imports it via a local import inside `_generate_embedding`. Correct target is `app.services.long_term_memory.get_embedding_service` (or add a module-level import in production code to make the name patchable as a stable attribute).
- **HIGH-2 — SQL fallback test has no negative assertion**: `test_semantic_memory_retrieval_falls_back_without_embedding` uses `embedding_service=object()` and asserts `execute.await_count == 2` but never asserts the first execute call was NOT the vector query. The test would pass even if the vector path was taken.
- **MEDIUM-1 — `test_lazy_backfill` commit count uses loose `>= 2`**: Merging commits would break the test without breaking the feature. Tighten to `== 2` or document why the range is needed.
- **MEDIUM-2 — `test_memory_injection_escapes_malicious_content` has potentially contradictory dual assertion**: Asserts both the HTML-encoded form and `[FILTERED]` appear for the same input string; only one can result from the sanitize-then-escape pipeline for a single content item.
- **MEDIUM-3 — `extract_and_store_memories` uncovered** (pre-existing gap): The type-normalisation of `strategy_success`/`strategy_failure` → `"fact"` is untested.
Review file: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-09-review.md`

## Spec 057 — MCP Security Context Optimization, Section-08 (Deferred Tool Registry) — Verdict: REQUEST_CHANGES (2026-03-23)

3 HIGH, 2 MEDIUM, 2 LOW findings. Key:
- **HIGH-1 — NEW-03 scope restriction not enforced**: `_tools` dict is instance-level and accumulates across `prepare_tools` calls. A prompt injection in Agent B's MCP response could use `tool_search("select:...")` to discover tools from Agent A sharing the registry. `search()` must filter against the calling agent's `execution_tools` only.
- **HIGH-2 — `agency_tools.py` integration absent**: Spec requires wiring `DeferredToolRegistry` inside `resolve_mcp_tools_for_agent()`. File is unmodified; no production code imports `DeferredToolRegistry` — the entire feature is dead code.
- **HIGH-3 — Tool description injection sanitization absent**: External MCP tool descriptions written into `available_names` (injected into system prompt) without applying `fewShotSanitizer`; prompt injection vector per spec Security §1.
- **MEDIUM-1 — `_tools` never cleared between `prepare_tools` calls**: Stale tools from a prior call remain searchable if the same registry instance is reused.
- **MEDIUM-2 — No integration test for `agency_tools.py` wiring**.
Review file: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-08-review.md`

## Spec 057 — MCP Security Context Optimization, Section-07 (Context Summarizer) — Verdict: NEEDS_FIX (2026-03-23)

2 HIGH, 3 MEDIUM, 2 LOW findings. Key:
- **HIGH-1 — `"gpt-4o-mini"` hardcoded as model fallback**: Spec explicitly forbids hardcoding; non-OpenAI deployments will fail. Must route through gateway priority system.
- **HIGH-2 — Off-by-one in `_adjust_split_for_atomic_pairs`**: After the while-loop backs past all `tool` messages, the subsequent block decrements `split_idx` again — moving the owning assistant-with-tool-calls into the "old" segment while its tool responses stay in "recent". This is the opposite of the intended behavior.
- **MEDIUM-1 — Out-of-scope `_evaluate_quality` in `react_executor.py`**: Not in section-07 spec; adds an extra LLM call per completed run. Should be tracked under spec-053.
- **MEDIUM-2 — Planner hardcoded budget `100000`**: Should read from run config like `ReActExecutor` does.
- **MEDIUM-3 — `tool_calls` assistant content silently dropped**: Messages with `tool_calls` have `content=None`; tool-call function names are lost from the summary prompt.
Review file: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-07-review.md`

## Spec 057 — MCP Security Context Optimization, Section-05 (Spec Compliance) — Verdict: APPROVE_WITH_FIXES (2026-03-23)

2 HIGH, 3 MEDIUM, 2 LOW findings. Key:
- **HIGH-1 — `_mcpSessionExpired` 404 not propagated in batch mode**: Batch handler never checks the flag; expired-session items return 200 with JSON-RPC error inside the array instead of HTTP 404.
- **HIGH-2 — `mcpDeleteHandler` no UUID validation**: Unvalidated `Mcp-Session-Id` header value passed directly to `redis.del`; arbitrary strings reach the Redis keyspace.
- **MEDIUM-1 — `isNotification` variable declared but never used**: Dead code at line 977.
- **MEDIUM-2 — No guard against duplicate `initialize` in a batch**: Last writer to `_mcpNewSessionId` wins silently; earlier session ID is dropped.
- **MEDIUM-3 — No batch test covering notification filtering**: No test verifies that a notification item in a mixed batch is excluded from the response array.
Review file: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-05-review.md`

## Agency Continuous Improvement Loop — Completeness Review — Verdict: APPROVE_WITH_FIXES (2026-03-23)

2 HIGH, 3 MEDIUM, 2 LOW findings. Key:
- **HIGH-1 — `agency_feedback` router not registered in `main.py`**: `POST /api/v1/agency/analyze-feedback` is defined but never wired — advisor never runs, `advisorAnalysis` always null.
- **HIGH-2 — `onRunFinished` does not receive `runId`**: Callback gets a message chunk ID, not the run UUID. Feedback row is stored under a wrong/invalid runId.
- **MEDIUM-1 — `applyImprovement` marks entire feedback row applied on first single decision**: Remaining suggestions disappear after first Apply/Dismiss action.
- **MEDIUM-2 — `_auto_enrich` dedup check uses wrong 50-char prefix anchor**: May skip valid enrichment or miss real duplicates.
- **MEDIUM-3 — `getRunFeedback` lacks tenant isolation**: Filters only on `runId + userId`, not `tenantId`.
Review file: `.claude/agent-memory/ssp-reviewer/project_agency_improvement_loop_review.md`

## Spec 057 — MCP Security Context Optimization, Section-02 (Python Injection Fixes) — Verdict: APPROVE_WITH_FIXES (2026-03-23)

3 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — F23 empty-domains guard raises on mixed-validity input**: When one valid and one SSRF domain are passed, all domains are filtered and `ToolError` is raised rather than proceeding with the safe domain. Breaking change for existing callers.
- **HIGH-2 — F17 cell-range test is vacuous**: `read_excel_data` called without `_get_access_token` patched or `credit_charge_fn` supplied; raises `TypeError` before reaching URL-encoding code, making the assertion trivially pass for the wrong reason.
- **HIGH-3 — F27/F28 deferred with no tests**: Spec-required TDD tests for cross-tenant 403 (F27) and DB-error 503 (F28) are entirely absent. The deferral is undocumented in the test file.
- **MEDIUM-1 — F25 incomplete**: `logger.info` logs only `base_command` but full command string still dispatched to `SandboxDispatcher` input dict; no test coverage.
- **MEDIUM-2 — F14/F21 idempotency tests absent**: Double-charge tests for Drive search and OneDrive list required by spec TDD are missing from both test files.
- **MEDIUM-3 — F27/F28 test stubs absent**: Test file covers only F26 and F29; the two deferred findings have no failing assertion to track them.
- **LOW — `_SAFE_FILE_INFO_FIELDS` defined inside function body** in `onedrive_mcp.py` (allocates new set per call); should be module-level constant like Google Drive's `_SAFE_FILE_FIELDS`.
Review file: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-02-review.md`

## Spec 057 — MCP Security Context Optimization, Section-01 (Python SSRF + Auth TDD) — Verdict: APPROVE_WITH_FIXES (2026-03-23)

3 HIGH, 2 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — `test_executor_uses_clamped_timeout` missing guard**: `mock_factory.call_args.kwargs["timeout"]` is checked without first asserting `mock_factory.called` — if execution short-circuits (ownership error, SSRF), `call_args` is `None` and the assertion raises `TypeError` instead of a test failure.
- **HIGH-2 — `httpx.HTTPError(string)` breaks on httpx 0.23+**: `HTTPError` requires a `request=` argument; bare string constructor raises `TypeError`. Use `httpx.ConnectError` or `httpx.HTTPStatusError` per spec guidance.
- **HIGH-3 — `TestStructlog` has redundant `.replace("/", ".")`**: `MODULE_PATH` is already dot-separated; the transform is a silent no-op that would corrupt a future path change.
- **MEDIUM-1 — Cross-tenant cache contamination test does not catch regressions**: Two independent mock contexts both succeed regardless of cache key correctness; a broken implementation would also pass.
- **MEDIUM-2 — `workflow_id` not-leaked assertion missing**: Spec line 110 explicitly requires asserting the workflow ID is absent from the error string; `test_blocks_unauthorized_user` does not include this check.
Review file: `specs/feature/057-mcp-security-context-optimization/implementation/code_review/section-01-review.md`

## Spec 052 — Agency Swarm Full Capability, Deep Data Flow & Tenant Isolation Audit Round 2 — Verdict: REQUEST_CHANGES (2026-03-23)

4 HIGH, 5 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — `getById` leaks `mcpServerTokensEncrypted`**: `.select()` wildcard on `agencyAgents` returns encrypted token blob to all callers. Strip with column projection; return boolean `hasMcpTokens` flag.
- **HIGH-2 — `submitApproval` no tenant isolation**: `agencyConversations` lookup at line 4041 uses only `runId` — no `tenantId` filter. User in tenant B can approve tenant A's run by guessing UUID.
- **HIGH-3 — `restoreVersion` inserts snapshot `nodeConfig` without Zod re-validation**: Bypasses current `saveBuilder` `.superRefine()` guards. Malicious `nodeConfig` (e.g., crafted `outputKey` in `approval:` namespace, injection payloads) is written verbatim to DB.
- **HIGH-4 — `_call_skill` omits `tenant_id` from skill execute body**: POST to `/api/v1/skills/execute` carries JWT but no explicit `tenant_id` — skill endpoint must derive tenant from JWT alone.
- **MEDIUM — `data_transform` `outputKey` not validated**: Free-form string can collide with `"approval:"` namespace used by `_await_approval`, enabling pre-seeding of fake approval entries.
- **MEDIUM — `ctx.results` unbounded**: No cap on entry count or size; long graphs accumulate megabytes passed to every subsequent LLM prompt.
- **MEDIUM — 8+ write procedures lack rate limiting**: `update`, `saveBuilder`, `delete`, `createConversation`, `shareAgencyWithGroups`, `unshareAgencyGroup`, `restoreVersion`, `routeResult`.
- **MEDIUM — `parallel_fan_out` first_complete billing**: Branch cancellation does not cancel in-flight LLM calls; credits charged for discarded branches.
- **MEDIUM — `_shared_tools_cache` no tenant stamp**: Safe today but has no assertion that `agency_id` belongs to `ctx.tenant_id`.
Review file: `specs/feature/052-agency-swarm-full-capability/implementation/code_review/deep-dataflow-audit-r2.md`

## Spec 053 — Agency Agentic Intelligence, Section-03 (Frontend Level 1 Intelligence UI) — Verdict: APPROVE_WITH_FIXES (2026-03-23)

2 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — `agencyAgenticModeEnabled` feature flag gate absent**: Intelligence section renders unconditionally. Section-04 spec confirms the flag defaults to `true` and must gate this UI — same pattern required by all prior specs (049, 051, 052). Must wrap the Intelligence `<div>` + its `<Separator />` in `{agencyAgenticModeEnabled && (...)}`.
- **HIGH-2 — Zero write-path test assertions**: All 5 tests verify display/read behavior only. A regression in any `onValueChange` handler passes all 5 tests silently.
- **MEDIUM-1 — Backend `maxReflectionCycles` stores original type, not normalized**: Validation accepts `"3"` (string) as valid integer via `Number("3")` but stores the original string. Add `typeof maxCycles !== "number"` guard.
- **MEDIUM-2 — `openIntelligence()` uses `getByText` on span, not `getByRole("button")`**: Fragile if span gains child elements.
- **MEDIUM-3 — `<button>` missing `aria-expanded`**: Screen readers cannot announce collapsed/expanded state.
Review file: `specs/feature/053-agency-agentic-intelligence/implementation/code_review/section-03-review.md`

## Spec 053 — Agency Agentic Intelligence Layer — Verdict: APPROVE_WITH_FIXES (2026-03-22)

4 MUST FIX, 6 SHOULD FIX, 3 NICE TO HAVE. Key: `agency_agent_memories` tenant_id type mismatch (INTEGER vs varchar(36)), missing TenantFeatureFlags entries for all 4 feature flags, `_is_complete()` parsing logic unspecified, no tRPC procedure contracts for memory CRUD, no test strategy, `autonomous_agent` node type not added to Drizzle enum/check constraint, ReAct LLM call mechanism unresolved.
Review file: `.claude/agent-memory/ssp-reviewer/project_spec053_review.md`

## Spec 052 — Agency Swarm Full Capability, Section-05 (Guardrails Backend) — Verdict: APPROVE_WITH_FIXES (2026-03-22)

4 HIGH, 5 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — Checkpoint 3 (handoff guardrails) entirely absent**: Orchestrator diff has CP1 (input) and CP2 (output) but no `is_handoff=True` execution path for inter-agent routing.
- **HIGH-2 — Input guardrail guidance/redaction applied in wrong order**: If a PII-redact guardrail fires after a guidance-mode failure, the guidance prefix is silently discarded.
- **HIGH-3 — Vitest test file contains zero procedure-level tests**: All 12 spec-required tRPC tests (cross-tenant FORBIDDEN, tenantId-from-session, CONFLICT handling, testGuardrail HTTP call) are absent; file only re-tests Zod enum schemas inline.
- **HIGH-4 — Output guardrail retry: strict-mode final failure does not short-circuit outer guardrail loop**: `break` exits inner `for attempt` loop but outer guardrail loop continues to G2 with the failed response.
- **MEDIUM-1 — ReDoS protection absent for `regex_match`**: No timeout or length enforcement at execution time despite explicit spec requirement.
- **MEDIUM-2 — `internal_guardrails.py` test endpoint accepts unknown strategy string**: No validation against STRATEGY_MAP keys; silently returns `passed: True`.
- **MEDIUM-3 — `_load_guardrails_for_agents` uses positional row indexing (`row[0]`…`row[9]`)**: Fragile; column order changes break silently.
- **MEDIUM-4 — CP1 runs before KB context augmentation completes**: Input guardrails execute on `ctx.get_context_text()` before KB-injected content is appended.
- **LOW-1 — `listGuardrails` missing rate-limit middleware**: All other 6 procedures have it.
- **LOW-2 — `llm_classify` uses substring match on LLM response**: `"no harm"` matches `blockIf="harm"` — should use exact or word-boundary match.
- **LOW-3 — `updateGuardrail`/`deleteGuardrail`/`testGuardrail`/`removeGuardrailFromAgent` use two-step SELECT-then-check**: Leaks cross-tenant ID existence; should use AND-filter in WHERE.
Review file: `specs/feature/052-agency-swarm-full-capability/implementation/code_review/section-05-review.md`

## Spec 052 — Agency Swarm Full Capability, Section-04 (OpenAPI Import) — Verdict: APPROVE_WITH_FIXES (2026-03-22)

4 HIGH, 5 MEDIUM, 3 LOW findings. Key:
- **HIGH-1 — `buildInputSchema` param schema `$ref` resolution bug**: Condition checks `param["$ref"]` after `param` is already resolved; parameter schemas that are themselves `$ref`s pass through unresolved and silently fall back to `type: "string"`.
- **HIGH-2 — `resolveRef` visited-set cloning defeats circular ref detection**: `new Set(visited)` per recursive call means sibling-branch A→B→A cycles hit `max_depth_exceeded` instead of `circular_ref` — error-code contract violation.
- **HIGH-3 — Duplicate path key in test object silently drops an operation**: JS object with `"/pets"` twice keeps only the last; assertion `toBeGreaterThanOrEqual(1)` is vacuous.
- **HIGH-4 — Rate-limit test entirely absent**: Spec §4.2 requires a 6-call test for `TOO_MANY_REQUESTS`. Not implemented.
- **MEDIUM-1 — `buildInputSchema` strips all schema keywords except `type`**: Loses `format`, `enum`, `minimum`, `maximum`, `pattern` etc.
- **MEDIUM-2 — 50-tool cap counts only `isEnabled=true` rows**: Tenants can transiently exceed 50 total tools; cap should cover all rows.
- **MEDIUM-3 — `apiKey` accepted in `importOpenAPITools` Zod input but silently discarded**: Never read by the procedure body.
- **MEDIUM-4 — `(trpc as any)` casts in `OpenAPIImportModal.tsx`**: Defeats end-to-end TypeScript safety.
- **MEDIUM-5 — "shows error toast on parse failure" frontend test missing**: 6 of 7 spec-required tests present.
- **LOW — `httpMethod` not enum-constrained in `confirmOpenAPIImport`**: Accepts arbitrary strings into the database.
Review file: `specs/feature/052-agency-swarm-full-capability/implementation/code_review/section-04-review.md`

## Spec 052 — Agency Swarm Full Capability, Section-01 (Database Migration) — Verdict: APPROVE_WITH_FIXES (2026-03-22)

2 CRITICAL, 4 HIGH, 4 MEDIUM, 3 LOW findings. Key:
- **CRITICAL-1 — modelSettings data migration SQL absent from `.sql` file**: The `UPDATE agency_agents SET "modelSettings" = jsonb_strip_nulls(...)` to rename `top_p`→`topP` and `max_tokens`→`maxTokens` is missing. Existing rows will silently lose settings at runtime.
- **CRITICAL-2 — `defaultTargetNodeId` omitted from conditional_branch nodeConfig block**: Spec §4 explicitly requires it listed in the conditional_branch section as a reuse marker for section-17 authors.
- **HIGH — Pervasive `.notNull()` omissions**: 13 columns with DB defaults are missing `.notNull()`, inflating TypeScript types with spurious `| null`. Affects: `agencies.topology`, `agencies.cacheConversationStarters`, `agencyAgents.parallelToolCalls`, `agencyAgents.maxTurns`, all default-bearing columns on `agencyGuardrails` and `agencyTools`.
- **MEDIUM — Tests missing default-value assertions and index-shape verification**: The TDD spec required both; neither is present.
- **LOW — Out-of-scope change**: `users.userPreferences.privateVault` type extension bundled from Feature 044.
Review file: `specs/feature/052-agency-swarm-full-capability/implementation/code_review/section-01-review.md`

## Unified Skill Execution Pipeline — Re-audit after fixes (commit 4c20e1e7) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

All 5 HIGH and 3 MEDIUM findings resolved. 1 LOW (skill_factory silent fallback) still open. 2 new findings: `unified_error` missing from `AuditEventType` union (MEDIUM), `parseNextSpeakerHint` still duplicated between `textSkillExecutor.ts` and `teamRunSkillExecutor.ts` (LOW).
Review file: `.claude/agent-memory/ssp-reviewer/project_unified_skill_execution_reaudit.md`

## Unified Skill Execution Pipeline — Full System Completeness Audit — Verdict: APPROVE_WITH_FIXES (2026-03-21)

5 HIGH, 6 MEDIUM, 5 LOW findings. Key:
- **HIGH-1 — `capabilitiesAllowed` never enforced**: Declared in `UnifiedExecutionRequest` but `executeUnified` never reads it.
- **HIGH-2 — `retrieveForPrompt` receives `personaId` where `assistantId` expected**: Wrong scoped-memory scope for chat persona path.
- **HIGH-3 — `teamRunSkillExecutor` catch block resets `handledByUnified = false`**: Allows double-execution (unified side-effects + legacy retry) on error.
- **HIGH-4 — `as any` cast on `executionPolicy` in textSkillExecutor**: Type mismatch with `SkillExecutionPolicyResult` suppressed.
- **HIGH-5 — `temperature` field never populated**: Present in `ExecutorInput` and forwarded by executor but never set in `executeUnified` build step.
- **MEDIUM-1 — `orchestrator_error` detection misses `skill_resolution_failed`/`executor_not_found`**: Silent empty content returned.
- **MEDIUM-2 — No system-prompt cap**: Legacy path caps at 12,000 chars; unified path passes uncapped.
- **MEDIUM-3 — `capabilitiesAllowed` field not enforced** (see HIGH-1 for primary).
- **LOW-1 — `extractUserPrompt` duplicated in all 3 media executor files**.
- **LOW-3 — Swarm/skill_factory capability families have no executor**: Silent fallback to text executor.
Review file: `.claude/agent-memory/ssp-reviewer/project_unified_skill_execution_completeness.md`

## Unified Skill Execution Pipeline, Section-10 (Cross-Channel Parity Tests) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

4 HIGH, 4 MEDIUM, 3 LOW findings. Key:
- **HIGH — manual `vi.clearAllMocks()` + full mock re-setup inside one test body**: Duplicates `beforeEach`, will silently diverge if `beforeEach` changes. Remove the inline block entirely.
- **HIGH — "web search enabled" policy test checks call count only**: Does not assert that `injectWebSearchIfNeeded` received `requires_web_search: true` in both calls. Passes even if the flag is ignored.
- **HIGH — "requires_thinking" test does not verify `enableThinking` on executor input**: `mockBuildDynamicModelReqs` returns `supportsThinking: true` but the test never confirms `executorInput.enableThinking === true` for both channels.
- **HIGH — "executor not found" failure test uses only cross-channel equality**: Both `route.reason` and `telemetry.executorId` assertions compare chat vs team_room rather than against concrete expected values (`"executor_not_found"` / `"unknown"`). Vacuous if both channels misbehave identically.
- **MEDIUM — `canHandle` on module-level executor fixtures not re-applied after `vi.clearAllMocks()`**: Only `execute` is reset in `beforeEach`; `canHandle` will return `undefined` if any prior test overrides it.
- **MEDIUM — persistence hook parity entirely absent**: `registerPersistenceHook` / `clearPersistenceHooks` are exported for testing; no test verifies a hook for channel A does not fire for channel B.
- **LOW — dead `vi.mock("../executors/textSkillExecutor")`**: Orchestrator accesses executor via registry, not direct import; mock is unused.
Review file: `planning/unified-skill-execution/implementation/code_review/section-10-review.md`

## Unified Skill Execution Pipeline, Section-07 (Wire Chat Router) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

4 HIGH, 4 MEDIUM, 3 LOW findings. Key:
- **HIGH — inline `type _UER = import(...)` alias**: Declared inside an `if` block instead of a top-level static import. The underscore prefix misleads linters; type enforcement is fragile across edits. Fix: `import type { UnifiedExecutionRequest }` at top of `chat.ts`.
- **HIGH — duplicate `getConversationById` query on fallback path**: Unified path fetches conversation at line 1510; legacy path fetches same row at line 1691. When orchestrator errors and falls back, two DB round-trips occur for the same data. Plan §7 explicitly required loading once and reusing.
- **HIGH — 2 of 6 tests are vacuous (flag path tests)**: `flag=false` test imports the router but never calls a procedure; assertions pass trivially. `flag=true` throws test calls `mockAuditLog` itself rather than routing through production code. No end-to-end wiring invariant is actually verified.
- **HIGH — 2 additional tests call mocks directly**: `conversationContext` and `reference images` tests construct data locally without invoking the router. They verify nothing about `chat.ts`.
- **MEDIUM — `"unified_fallback"` absent from `AuditEventType` union**: `as any` cast required to log the event. Add to `auditLogger.ts` union.
- **LOW — unplanned modification to legacy `executionPolicy` mode mapping**: The `modelSource` → `mode` conversion in `runPlanner` call is a behavioural change to existing code. Plan stated "Do NOT Modify Existing Code". Confirm this was intentional carry-over from section-05 fix.
Review file: `planning/unified-skill-execution/implementation/code_review/section-07-review.md`

## Unified Skill Execution Pipeline, Section-05 (TextSkillExecutor) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

2 HIGH, 2 MEDIUM, 3 LOW. Key:
- **HIGH — `as any` cast on `executionPolicy`**: `ExecutorInput.executionPolicy` typed as `Record<string, unknown>` but `executeSkillLlmWithFallback` requires `SkillExecutionPolicyResult`. Cast suppresses future type errors. Fix: narrow `ExecutorInput.executionPolicy` type in `types.ts`.
- **HIGH — `maxTokens`/`temperature` not forwarded**: Both are valid `SkillLlmRequest` fields but absent from `ExecutorInput` and dropped silently at the executor boundary.
- **MEDIUM — `parseNextSpeakerHint` duplicated**: Identical private function already in `teamRunSkillExecutor.ts:48`. Extract to shared utility to prevent regex divergence.
- **MEDIUM — mid-content tag leaves double-space**: `trimEnd()` only trims trailing whitespace; tag in the middle of content produces `"intro  body"`. Use `.trim()` or collapse adjacent spaces.
Review file: `planning/unified-skill-execution/implementation/code_review/section-05-review.md`

## Spec 049 — Enterprise Notification System, Section-13 (Feature Flags, i18n, Health Checks) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

2 HIGH, 3 MEDIUM, 4 LOW findings. Key:
- **HIGH — `checkNotificationHealth()` never registered**: The combined health probe exists but has no caller — not wired to `/healthz` or any monitoring router. Dead code. Fix: import and call in `server/_core/index.ts` `/healthz` handler.
- **HIGH — `recordBroadcastRequest()` never called**: The broadcast error-rate counter is never incremented from the admin-broadcast handler. The probe permanently returns `healthy: true, errorRate: 0`. Fix: import and call from the admin-broadcast tRPC procedure.
- **MEDIUM — `notificationMenu.test.ts` wrong location**: File placed at `apps/web/shared/__tests__/` but spec requires `packages/shared/src/constants/__tests__/`.
- **MEDIUM — `main.tsx` routes absent from diff**: Spec says section-13 owns route registrations; diff has no `main.tsx` changes. Must confirm routes pre-exist from prior sections.
- Core correct: all 6 flags in `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS` (all `false`). F23–F28 renumbering from prior sections correct. All 44 i18n keys in EN and TH. Both menu entries with correct `requiresFeature` camelCase keys that now resolve properly. `notificationStream.ts` mounted in Express, `getActiveSSEConnectionCount()` exported. Redis pub/sub health probe logic is sound.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-13-review.md`

## Spec 049 — Enterprise Notification System, Section-10 (Phase 7 Email Delivery) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

3 HIGH, 5 MEDIUM, 4 LOW findings. Key:
- **HIGH — `NOTIFICATION_EMAIL_DELIVERY` feature flag absent**: Flag missing from `featureFlags.ts`; `notificationService.ts` hook has no flag check — email delivery fires for all tenants immediately on deploy. Fix: add `notificationEmailDelivery: boolean` as F24 to `TenantFeatureFlags` and add tenant flag gate around the email block.
- **HIGH — BullMQ connection extracts `redis.options?.host/port`**: `redisClients.ts` builds IORedis from a URL string; `options.host/port` are unreliable/absent. Digest queue will silently route to `localhost:6379` in production. Fix: pass the IORedis instance directly (`connection: getRealtimeClient()`), matching the pattern in `deliveryQueue.ts`.
- **HIGH — Locale hardcoded to `"en"`**: `users` table has no `locale` column (confirmed schema). Thai users always receive English emails. Must be documented as a known gap and a schema migration planned.
- **MEDIUM — `emailDigestFrequency IS NOT NULL` not in SQL**: DB fetches all `email=true` rows; null-frequency filtering is in-app. Import `isNotNull` and add to `.where()`.
- **MEDIUM — Deduplication discards per-category frequency**: First preference row wins for each userId; other email-enabled categories' frequency/hour settings are lost.
- **MEDIUM — `SELECT *` on `userNotifications`**: Fetches all columns when only 6 are needed.
- **MEDIUM — `userId: "redacted"` in success log**: Misleading; either add `userId` param to `sendNotificationEmail` or remove the key.
- Core correct: HTML escaping thorough (`&`, `<`, `>`, `"`, `'`), priority/digest routing, template stub contract, BullMQ repeat interval, Redis 7-day TTL, per-user error isolation, unsubscribe link in all emails, all 20 plan-required tests present.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-10-review.md`

## Spec 049 — Enterprise Notification System, Section-09 (Phase 6 Admin Dashboard) — Verdict: REQUEST_CHANGES (2026-03-21)

4 HIGH, 5 MEDIUM, 3 LOW findings. Key:
- **HIGH — `NOTIFICATION_UNIFIED_CENTER` not in `TenantFeatureFlags`**: `useTenantFeatureFlag("NOTIFICATION_UNIFIED_CENTER" as any)` escapes the type system. The flag is absent from `featureFlags.ts` — the hook returns `undefined` (falsy), so the "Feature Not Enabled" card renders for all tenants. Fix: add `notificationUnifiedCenter: boolean` as F23 to `TenantFeatureFlags`.
- **HIGH — Menu entry `requiresFeature: 'NOTIFICATION_UNIFIED_CENTER'` never matches**: `menu.ts` filter does `enabledFeatures[item.requiresFeature] === true`, where key is not in the `TenantFeatureFlags` interface. Menu item never appears. Same root cause as above.
- **HIGH — `UnifiedNotification.priority` vs server's `severity` field**: Local interface uses `priority` but the server mapper outputs `severity`. All severity badge renders (`item.priority`) are `undefined` at runtime — badges show blank. Same mismatch in detail panel and `SEVERITY_COLORS` lookup.
- **HIGH — Severity filter enum mismatch**: Dropdown sends `"info" | "warning" | "error"` but server Zod schema validates `z.enum(["low","normal","high","critical"])`. Selecting info/warning/error triggers a 400 bad request.
- **MEDIUM — `domain_admin` excluded by frontend guard**: `user.role !== "admin"` redirects `domain_admin` to dashboard, but `adminProcedure` on the backend allows `domain_admin`. Frontend is more restrictive than the backend contract.
- **MEDIUM — `bySeverity: []` stub from section-08 produces blank chart**: Empty card body with no placeholder text.
- **MEDIUM — Filter interaction tests missing**: Tests check element existence for source/severity dropdowns, not that changing the filter updates query params.
- **SECURITY — `actionUrl` not sanitized**: Detail panel renders raw `<a href={actionUrl}>` — a `javascript:` URI stored in the DB would be clickable.
- **SCOPE CREEP**: `menu.ts` also changes `requiresFeature` for `teams` (`ORCHESTRATOR_ENABLED` → `orchestratorEnabled`) and `admin-personas` (`AI_PERSONA_ENABLED` → `personaSystem`) — these belong to section-13.
- Core correct: layout matches spec, loading/error states, pagination, keyboard navigation, accessibility markup, route registration, lazy import, stat cards, CSS bar charts, detail panel close behavior.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-09-review.md`

## Spec 049 — Enterprise Notification System, Section-08 (Phase 6 Unified Query) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

3 HIGH, 3 MEDIUM findings. Key:
- **HIGH — `notificationUnifiedCenter` feature flag gate absent**: Both `getUnifiedNotifications` and `getUnifiedStats` in `monitoring.ts` are live on deploy regardless of flag state. Spec §7 requires `throw FORBIDDEN` when flag is false.
- **HIGH — Tenant isolation subquery type safety risk**: `userNotifications` scoped via `userId IN (SELECT id FROM users WHERE currentTenantId = (SELECT id FROM tenants WHERE id = $tenantId LIMIT 1))`. Double-subquery is unindexed on `users.currentTenantId`; if the type mismatch between `varchar(36)` tenantId and integer FK causes the inner join to return zero rows, legitimate admins silently get empty results.
- **HIGH — Guardian source filter performs full table scan + in-memory discard**: `filters.source === "guardian"` skips orch query but does not add a SQL predicate to the user query. Full tenant user scan runs, then non-guardian rows are discarded in memory — 200ms budget risk at 500+ notifications.
- **MEDIUM — N+1 hasMore detection broken for merged queries**: Each source fetches `limit+1` independently; merged array can be `2*(limit+1)` items. `filtered.length > limit` is trivially true even when total items ≤ limit, producing false `hasMore=true`.
- **MEDIUM — `bySeverity: []` hardcoded stub**: Section-09 admin dashboard will receive an empty severity distribution array, breaking its chart. Not documented as intentional deferral.
- **MEDIUM — Integration tests entirely absent**: Test file covers only pure mapper functions. Missing: cross-source sort, pagination hasMore, source/date filter, Redis cache hit/miss/TTL, Redis unavailability, S8 tenant isolation assertion.
- **SCOPE CREEP**: Spec 049 section-07 fixes and Spec 051 section-05 fixes bundled into this diff.
- Core correct: mapper functions, severity mapping, Redis caching with graceful degradation, `feedbackProcessor` Guardian enrichment, `adminProcedure` role guard, `orchestratorNotifications` direct tenantId filter all pass.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-08-review.md`

## Spec 051 — Team Room Reuse Chat Pipeline, Section-05 (Migration Cleanup) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

3 HIGH, 4 MEDIUM, 3 LOW findings. Key:
- **HIGH — `queued` run status omitted from SQL migration and startup guard**: `teamRunStatusEnum` includes `"queued"` but `0105_stop_legacy_team_runs.sql` only targets `'running'` and `'paused'`. Queued legacy runs are orphaned. Same gap in `recoverActiveRunsOnStartup()` `inArray` call.
- **HIGH — SQL migration missing `stopReason IS NULL` guard**: The startup guard in `runEngine.ts` adds `stopReason IS NULL` to avoid re-stopping already-explicitly-stopped runs. The SQL migration has no equivalent, allowing a double-run to overwrite legitimate `stopReason` values.
- **HIGH — `recoverActiveRunsOnStartup()` never tested**: `runEngine.migration.test.ts` only text-parses the SQL file — it never imports or calls the Node.js function. The six plan-required behavioral test cases are absent.
- **MEDIUM — Migration numbered `0105` but plan specifies `0103`**: Correct number given actual journal state, but discrepancy is a maintenance hazard.
- **MEDIUM — Journal test does not assert `idx: 105`**: Only checks tag name and version string.
- **MEDIUM/SCOPE — Spec 049 frontend fixes bundled into this diff**: `NotificationPreferencesPanel.tsx` feature-flag gate, `AlertRuleFormDialog` conditional-render fix, and `form.watch` → `form.getValues` fix all belong to Spec 049 section-07 follow-up.
- Core cleanup correct: `TEAM_DISCUSSION_SKILL_ID` fully removed, `formatPromptMessagesForAgent` deleted, bridge import gone, `roomIntentRouter.ts` uses `FALLBACK_CONTENT_SKILL_ID = "general-article-writer"`, `roomIntentRouter.test.ts` updated to positive assertion.
Review file: `specs/feature/051-team-room-reuse-chat-pipeline/implementation/code_review/section-05-review.md`

## Spec 049 — Enterprise Notification System, Section-07 (Phase 5 Frontend Settings) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

3 HIGH, 4 MEDIUM, 4 LOW findings. Key:
- **HIGH — Feature flag gate absent**: `NotificationPreferencesPanel` renders unconditionally; `NOTIFICATION_PREFERENCES_ENABLED` check from spec section 2.1 is not implemented.
- **HIGH — `AlertRuleFormDialog` does not reset form state on reopen**: `useForm` defaults fixed at mount; opening Create after Edit shows stale field values from the previous edit.
- **HIGH — Escalation policies test block is vacuous**: 3 of 5 tests never render the component; one calls `mockDeletePolicy` directly without rendering; one checks mock data not DOM.
- **MEDIUM — Several plan-required tests missing**: No `onError` toast test, no `isPending` disable test, no edit-dialog pre-fill test, no create-form submission test, no blank-form validation test. Operator allowlist test only checks element existence, not option count.
- Core security S7 correct: `OPERATORS` const tuple → `z.enum(OPERATORS)` → Radix Select, no free-text path. All aria-labels present on toggles. Optimistic update with rollback on error is correctly implemented. Route guarded by `RequireAdmin`. `Bell` icon already imported in Settings.tsx.
- Out-of-scope scope creep: `runEngine.ts` token-field rename and `runEngine.bridgeRemoval.test.ts` bundled into this diff.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-07-review.md`

## Spec 049 — Enterprise Notification System, Section-06 (Phase 5 Escalation Job) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

2 HIGH (tenant isolation), 3 MEDIUM, 3 LOW findings. Key:
- **HIGH — Notification query has no `tenantId` scope**: `executeEscalationCheck` queries `userNotifications` for ALL tenants' notifications matching each policy. A policy in tenant A can escalate notifications belonging to users in tenant B.
- **HIGH — Role-based target resolution (`escalateToRole`) queries ALL users globally**: No `currentTenantId = policy.tenantId` filter. Admins in every tenant receive escalations from any tenant's policy. Also: `policy.tenantId` is `varchar(36)` but `users.currentTenantId` is `integer` — requires a cast or lookup.
- **MEDIUM — `metadata` update runs even when `targetUserIds` is empty**: Marks original notification `escalatedAt` with no actual targets, making it permanently immune from future escalation and hiding the policy misconfiguration.
- **MEDIUM — "skips already-escalated" tests are vacuous**: Both tests use `notifications: []` mock — they would pass even if the SQL filters were removed.
- Core logic correct: `isEscalated` metadata bypass through `createNotification` works correctly (section-05 reads field before sanitization strips it), SQL double-guard (`IS DISTINCT FROM 'true'` + `IS NULL`), per-target try/catch, BullMQ config, idempotent init all pass.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-06-review.md`

## Spec 049 — Enterprise Notification System, Section-05 (Phase 5 Preference Delivery Gate) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

3 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH — `snoozeCategory` never invalidates Redis cache**: `upsertPreference` calls `redis.del` at line 77, but `snoozeCategory` does not. Snooze operations silently fail to take effect for up to 60s if a prior cache hit has `mutedUntil: null`.
- **HIGH — `NOTIFICATION_PREFERENCES_ENABLED` flag bypasses `featureFlags.ts`**: `isPreferenceEnabled()` reads `process.env` directly; the flag is absent from `TenantFeatureFlags`. Cannot be toggled per-tenant, no audit trail. Section 13 was supposed to add it as F23 but never did.
- **HIGH — `sanitizeMetadata` does not strip `isEscalated`**: All metadata fields including `isEscalated: true` pass through unmodified. Any caller forwarding user-controlled metadata could trigger escalation bypass. Fix: either strip it in `sanitizeMetadata` or move `isEscalated` to a separate first-class parameter on `CreateNotificationParams`.
- **MEDIUM — `"delivered"` log fires for both explicit-pref and no-pref-row paths**: The `console.log(...result: "delivered")` at line 334 is outside the `if (pref)` block. Misleading in observability.
- **MEDIUM — `sanitizeMetadata` called after preference gate reads `metadata`**: `isEscalated` is evaluated from unsanitized input at line 293; sanitization happens at line 379. If sanitizer is later updated to strip the field, the gate silently breaks.
- Core logic correct: all 10 `mapToCategory` mappings match spec, Redis TTL=60s, cache-before-DB flow, Telegram gate, escalation bypass logic, and all 4 escalation test scenarios all pass review.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-05-review.md`

## Spec 051 — Team Room Reuse Chat Pipeline, Section-02 (Prompt Composer) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

2 CRITICAL, 4 IMPORTANT, 3 SUGGESTION, 2 NITPICK findings. Key:
- **CRITICAL — `buildPersonaPromptSegments` emits `"null"` literally**: When `persona.systemPromptPrefix` is null in the DB, `personaService` assembles `[PERSONA START]\nnull\n[PERSONA END]`. The old code guarded this via `.filter(Boolean)`. Add a null-guard before calling `buildPersonaPromptSegments` or inside `personaService`.
- **CRITICAL — Double "Restrictions:" prefix**: `buildPersonaPromptSegments` already prepends `"Restrictions:\n"` to `restrictionsBulletPoints`; the composer then wraps it again as `` `Restrictions:\n${segments.restrictionsBulletPoints}` ``. Remove the outer wrapper in the composer.
- **IMPORTANT — `getEntityMemories` over-injects when `profile` is undefined**: `profile?.personaId ?? undefined` passes `undefined` as the `personaId` arg, which causes `getEntityMemories` to skip persona scoping and return memories across all personas.
- **IMPORTANT — Mixed-role message ordering**: `[user:objective]` is inserted between system messages (before memories at steps 4/4b). Move objective push to after all system messages, immediately before history.
- `users` import added to schema imports but never used — remove unused import.
Review file: `specs/feature/051-team-room-reuse-chat-pipeline/implementation/code_review/section-02-review.md`

## Spec 051 — Team Room Reuse Chat Pipeline, Section-01 (Skill Detection) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

2 CRITICAL, 4 IMPORTANT, 2 SUGGESTION, 2 NITPICK findings. Key:
- **CRITICAL — `general-article-writer` fails `isTeamRunEligibleSkill` gate**: The skill has no `teamRunEligible: true` flag, is not `internalOnly`, and is not `type: "chat-assistant"`. `teamRunSkillExecutor.resolveTeamRunSkill` will reject it and fall back to `TEAM_DISCUSSION_SKILL_ID` at execution time, making the router change a no-op in production.
- **CRITICAL — `conversationId` dropped on assistant path**: `detectSkill(normalized, undefined, undefined, input.userId)` — the human path passes `input.conversationId`. Agent role context is stripped, reducing skill detection quality for the exact turns this change targets.
- **IMPORTANT — `FALLBACK_CONTENT_SKILL_ID` is an unguarded string literal**: If the skill is renamed or deleted, the fallback silently routes to a non-existent ID and `resolveTeamRunSkill` falls back to `TEAM_DISCUSSION_SKILL_ID` anyway with no visible error.
- **IMPORTANT — Agent greeting messages route to `general-article-writer`**: `CHAT_SIGNAL_RE` and the chat fallback are only reachable by `human_user` path. Assistants saying "สวัสดี" get billed as article-generation turns.
- **IMPORTANT — Fallback tests don't assert the actual fallback skill ID**: Tests check `selectedSkillId !== "team-discussion-assistant"` but not `selectedSkillId === "general-article-writer"`.
Review file: `specs/feature/051-team-room-reuse-chat-pipeline/implementation/code_review/section-01-review.md`

## Spec 049 — Enterprise Notification System, Section-04 (Phase 5 Schema) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

3 HIGH, 3 MEDIUM, 2 LOW findings. Key:
- **HIGH — `checkAdmin` test asserts `domain_admin` is rejected**: The inline test helper excludes `domain_admin` but the real `adminProcedure` in `_core/trpc.ts:84` explicitly allows it. Test validates wrong policy.
- **HIGH — `snoozeCategory` past-timestamp test missing**: Runtime guard exists (`notificationPreferences.ts:60615`) but the plan-required test case "rejects mutedUntil timestamps in the past" is absent from the test file.
- **HIGH — All router tests are structural assertions, not caller-based**: No test calls through the actual `adminProcedure` or `protectedProcedure`. Auth gates and tenant isolation clauses are never exercised. Tests for tenant isolation (`updateRule` / `deleteRule` cross-tenant rejection) are missing entirely.
- **MEDIUM — `updateRule`/`deleteRule` cross-tenant rejection tests missing**: Plan requires these; not implemented.
- **MEDIUM — No-op migration `0104_mean_power_man.sql`**: Left from a type correction iteration. Should be removed if not yet applied to any environment.
- Schema tables, column types, FK constraints, indexes all correct. `tenants.id` is `varchar(36)` — implementation correctly uses `varchar(36)` (plan erroneously said `integer`). Operator allowlist (S7), tenant scoping, user scoping, Redis cache invalidation, and router registration all correct.
- **Out-of-scope scope creep**: `roomIntentRouter.ts`, `roomIntentRouter.test.ts`, and `roomIntentRouter.enhanced.test.ts` belong to Spec 051, not Section 04.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-04-review.md`

## Tiptap Editor — Section-13 (Hardening Tests) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

3 HIGH, 3 MEDIUM, 2 LOW findings. See `project_046_tiptap_section13.md` for details. Key:
- **HIGH — Accessibility tests entirely absent**: 4 plan-required tests (role="textbox", toolbar labels, mode switcher keyboard nav, slash command aria-selected) not written.
- **HIGH — Thai IME composition guard test missing**: No test for "/" typed during IME composition; guard itself not confirmed added to slash command handler.
- **HIGH — Error boundary component not implemented**: Only a vacuous mock test; no component mount, no error boundary added to UnifiedDocumentSurface.
- **MEDIUM — `aria-label` and serialization warning use hardcoded English strings** instead of `t("editor.ariaLabel")` / `t("editor.serializationWarning")`.
- **SCOPE CREEP**: `notificationPreferenceDelivery.test.ts` (Spec 049) and `promptComposer.enhanced.test.ts` bundled into this diff.
Review file: `planning/tiptap-markdown-editor/implementation/code_review/section-13-review.md`

## Tiptap Editor — Section-12 (Conflict Resolution Dialog) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

2 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH — `triggerConflict` is dead code**: The callback is defined in `UnifiedDocumentSurface` but never added to `UnifiedDocumentSurfaceProps`, never forwarded via ref, and never called by the parent save handler. The dialog is unreachable from a real conflict.
- **HIGH — `DocumentManagement.tsx` still uses forbidden string-match conflict detection**: Line 770 uses `error.message.toLowerCase().includes("version conflict")` — the plan explicitly requires `error.data?.httpStatus === 409` or an error-code check. The parent also still silently retries instead of surfacing the dialog.
- **HIGH — `handleConflictOverwrite` clears conflict flag before confirming save success**: `setConflictDetected(false)` at line 184 fires before `doSave` at line 185. If the overwrite mutation fails, conflict state is lost with no recovery path.
- **MEDIUM — `open` prop / conditional render are redundant and confusing**: Surface renders `{conflictDetected && <ConflictResolutionDialog open={true}>}` — the `open` prop is always `true` at this call site. Either pass `open={conflictDetected}` unconditionally or remove the `open` prop from the interface.
- **MEDIUM — Escape-prevention test is vacuous**: `fireEvent.keyDown` targets the title text node, not `AlertDialogContent`. Radix's synthetic Escape event is not triggered; the test passes trivially. Needs `onOpenChange` spy or integration test.
- **MEDIUM — `editor.save.conflict` i18n key added but unused**: Status label in `UnifiedDocumentSurface.tsx:235` is hardcoded "Conflict detected" in English, not `t("editor.save.conflict")`.
- Component itself is well-built: `onEscapeKeyDown` + `onPointerDownOutside` guards correct; `documentTitle` rendered as React text node (no XSS); all 6 i18n keys present in en.ts and th.ts.
- Scope creep: `useSSEReconnect.ts`, `Notifications.tsx`, `GlobalAlerts.tsx` changes belong to Spec 049, not Section 12.
Review file: `planning/tiptap-markdown-editor/implementation/code_review/section-12-review.md`

## Tiptap Editor — Section-11 (SafeMarkdown Fixes) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

2 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH — `extractAttr` interpolates `name` into RegExp without escaping**: Hyphenated attribute names like `data-asset-id` work in practice because `-` is a literal in most positions, but any future caller with special-char names would silently malform the regex. Fix: escape `name` with `name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`.
- **HIGH — `\b` word-boundary in `extractAttr` can match inside longer attribute names**: `\bdata-poster` also matches inside `xdata-poster="evil"`. Replace `\b` with `(?:^|\s)` to anchor on whitespace.
- **MEDIUM — `isUrlSafe` duplicates URL policy that already exists in `sanitizeMediaSrc`** (`mediaSerializationRules.ts`). They are functionally equivalent today but will diverge if `BLOCKED_PROTOCOLS` is updated in the shared file. Replace `isUrlSafe` with an import of `sanitizeMediaSrc`.
- **MEDIUM — `key={undefined}` on inner `videoEl`/`audioEl`** when caption is present (line 313/340). The outer `<figure>` has the key, inner element has `key={undefined}` — benign for static lists but causes unexpected remounting during reconciliation when caption is toggled. Remove `key` from the inner element entirely.
- **MEDIUM — `data-alignment` missing from ADD_ATTR**: `MEDIA_DATA_ATTRS` in `mediaSerializationRules.ts` lists 4 attrs; only 3 are added to `ADD_ATTR`. `data-alignment` is omitted, so image alignment is stripped by DOMPurify on the fallback path.
- **MEDIUM — mixed-content test missing text assertions**: Test 9 does not assert "Some text before" / "Some text after" — the plan explicitly required those checks.
- All 4 plan changes implemented correctly. `javascript:` in `data-poster` is blocked. `data-caption` rendered as JSX text (no XSS). `<figure>` wrapper with caption `<p>` correct.
Review file: `planning/tiptap-markdown-editor/implementation/code_review/section-11-review.md`

## Spec 049 — Enterprise Notification System, Section-03 (Phase 4 Frontend SSE) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

2 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH — inline `actionUrl` in bell expanded view bypasses `safeNavigate`**: `setLocation((n as any).actionUrl)` is called directly in the `GlobalNotificationBell` inline expanded section. `NotificationDetailPanel` uses `safeNavigate` correctly but this path does not. Fix: wrap with `safeNavigate(...)`.
- **HIGH — `getGroupOccurrences` test never asserts `notificationId` arg**: The expansion test verifies sub-items render but never checks `mockGetGroupOccurrences` was called with `{ notificationId: 10, limit: 10 }`. Plan explicitly required this assertion.
- **HIGH — detail panel test missing `firstOccurredAt`/`lastOccurredAt` assertions**: Test only checks "7 occurrences"; plan requires timestamp fields to be asserted.
- **MEDIUM — "no double-schedule" test does not exercise the guard**: Test advances timer fully after each error, testing sequential reconnection. Should trigger second error BEFORE timer fires to test the `reconnectTimerRef.current !== null` guard.
- **MEDIUM — `errorMessage` not truncated in `Notifications.tsx` detail panel**: GlobalAlerts bell truncates at 500 chars; Notifications page does not.
- **MEDIUM — `safeNavigate` duplicated across files with divergent behavior**: `GlobalAlerts.tsx` includes `console.warn`, `Notifications.tsx` silently drops it. Extract to `@/lib/navigation.ts`.
- SSE hook design is correct: `onMessageRef` latest-value pattern prevents stale closures; refs used for all internal state; cleanup clears both timer and EventSource; `enabled=false` guard works correctly.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-03-review.md`

## Spec 051 — Team Room Reuse Chat Pipeline — Round 3 Verdict: CONDITIONAL PASS (2026-03-21)

All 6 section files are fully substantive (round-1 empty stubs resolved). All 17 prior security issues addressed. 1 MEDIUM residual finding:
- **MEDIUM — Section-06 `roomIntentRouter.enhanced.test.ts` line 46 comment still references `TEAM_DISCUSSION_SKILL_ID`**: Says "NOT TEAM_DISCUSSION_SKILL_ID" — the constant will be deleted by section-05, causing a NameError if that test imports it. Test must use a string literal `"team-discussion-assistant"` or avoid the import entirely.
- **MEDIUM — `estimateCreditCost` function does not exist in `creditService.ts`**: Section-03 specifies `const { estimateCreditCost } = await import("./creditService")`. `creditService.ts` has no such export. Implementer must inspect `SkillLlmFallbackResult` for an existing `costCredits` field or derive from `inputTokens + outputTokens * modelRate`.
- Migration number `0103` is safe — latest existing files are `0100` (SQL) and `0102` (two conflicting files from prior work). Implementer must verify current max before writing.
- `general-article-writer` skill exists at `apps/web/skills/general-article-writer/` — fallback constant is valid.
- `advance` tRPC procedure in `teamRun.ts` exists without rate limit — section-03 rate limit addition is correctly targeted.
See `project_051_team_room_chat_pipeline.md` for round-1/2 details.

## Spec 049 — Enterprise Notification System, Section-02 (Phase 4 Dedup Service) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

3 HIGH, 4 MEDIUM, 2 LOW. Key:
- **HIGH — feature flag gate absent**: `notificationDedupEnabled` check is not implemented. Dedup activates for every call with a groupKey. Cannot be rolled back by flag toggle after deploy.
- **HIGH — truncation test is vacuous**: `if (callArgs?.groupKey)` guard makes the assertion silently skip when `values.mock.calls[0]` is undefined (dedup path uses `onConflictDoUpdate`, not plain `values`). Always passes regardless of implementation.
- **HIGH — SSE publishes unsanitized `actionUrl`**: Redis SSE event uses raw `actionUrl` from params, not the sanitized value. `javascript:` URIs pass through to the frontend if the DB sanitization output is not captured back into a local variable.
- **MEDIUM — `groupKey` not Zod-validated** in admin-broadcast endpoint. Plan §6 requires `z.string().max(200).optional()`. Only a runtime `typeof` guard present.
- **MEDIUM — 6 of 12 planned tests missing**: `adminBroadcastGroupKey.test.ts` absent entirely; `test_alerts_groupkey.py` absent; Test 3 (post-dismiss dedup bypass) and Test 5 (flag=false bypass) missing from `notificationDedup.test.ts`.
- **MEDIUM — `workflow.ts` groupKey not wired**: Plan requires `groupKey: \`workflow_publish:\${templateId}\`` for workflow publish notifications. Diff omits this.
- Core INSERT ON CONFLICT mechanics, occurrence snapshot, ownership check on `getGroupOccurrences`, and Python `python_alert:{rule.name}` groupKey pattern are all correct.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-02-review.md`

## Spec 049 — Enterprise Notification System, Section-01 (Phase 4 Schema Migration) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

1 HIGH (blocking), 2 MEDIUM, 3 LOW. Key:
- **HIGH (blocking) — migration file sequence collision**: Both the hand-written enum extension and the drizzle-kit generated migration carry prefix `0102`. Plan requires enum at `0102`, generated schema at `0103`. The generated file `0102_slim_red_wolf.sql` must be renamed to `0103_*` before merge or drizzle-kit will mis-sequence the migrations.
- **MEDIUM — partial index WHERE predicate untested**: Test checks `idx_notif_dedup_active` exists and is unique but does not assert the WHERE clause content. The dedup security guarantee (S6) depends on `isDismissed = false AND groupKey IS NOT NULL`. Fix: `expect(dedupIndex!.config.where).toContain("isDismissed")`.
- **MEDIUM — journal seeding not confirmed in diff**: The `drizzle.__drizzle_migrations` manual seed for `0102_notification_type_enum_extension.sql` is not visible in the diff. Must be confirmed before merge to prevent drizzle-kit from trying to run the enum migration inside a transaction.
- **LOW — `= false` vs `IS FALSE`**: Both `0102_slim_red_wolf.sql` and `schema.ts` `.where(sql\`...\`)` use `"isDismissed" = false`; prefer `IS FALSE`. Both must stay identical so drizzle-kit recognizes them as the same index.
- All new columns are additive (nullable or have defaults) — zero data-loss risk confirmed.
- FK CASCADE on `notificationOccurrences.notificationId` correct in both schema.ts and SQL.
Review file: `specs/feature/049-enterprise-notification-system/implementation/code_review/section-01-review.md`

## Tiptap Editor — Section-10 (Page Integration) — Verdict: APPROVE_WITH_FIXES (2026-03-21)

2 HIGH, 3 MEDIUM, 5 LOW findings. Key:
- **HIGH — `undefined` propagation on `selectedItem`**: `uploadStatusById.get(selectedItemBase.id)?.item` is passed to `toProvisionalDocumentItem()` — optional-chain can return `undefined`, causing silent corruption of `selectedItem` displayed in the editor. Guard: only call `toProvisionalDocumentItem` when the item field is defined.
- **HIGH — sentinel ID `[1]` in `uploadStatusQuery`**: When `uploadStatusIds` is empty, the query falls back to `ids: [1]` — hardcoded real item ID. The `enabled` guard prevents it firing today, but the sentinel should be `[-1]` to prevent accidental cross-tenant leakage if the guard is ever dropped.
- **MEDIUM — 3 missing i18n keys** in both `en.ts` and `th.ts`: `editor.toolbar.strikethrough`, `editor.toolbar.divider`, `editor.toolbar.table` not added. Also `editor.save.conflict` value is `"Conflict detected"` in the file vs. `"Document modified elsewhere"` in the plan.
- **MEDIUM — mobile-tab test is a no-op placeholder**: `expect(true).toBe(true)` provides no regression protection for the removal of the "preview" tab.
- **MEDIUM — large out-of-scope scope creep**: OCR mode toggle, upload pipeline UI, semantic search routing, and reindex progress counters are bundled into the Section 10 diff but are not in the plan.
- Core migration correct: `MarkdownFileEditor` replaced by `UnifiedDocumentSurface`, rollback comment present, `MarkdownFileEditor.tsx` not deleted, all 3 preview-panel state vars removed, mobile tab type narrowed, `beginHorizontalResize` signature simplified, `SafeMarkdown` import cleaned up.
Review file: `planning/tiptap-markdown-editor/implementation/code_review/section-10-review.md`

## Tiptap Editor — Section-08 (Media Insert Menu) — Verdict: APPROVE_WITH_FIXES (2026-03-20)

2 HIGH, 3 MEDIUM, 3 LOW findings. Key:
- **HIGH (data URL prefix)**: `readFileAsBase64` uses `FileReader.readAsDataURL()` which returns a `data:<mime>;base64,...` string. `trpc.library.uploadFile.fileBase64` expects raw base64 only — every upload stores a corrupt payload. Prior review stub claimed this was verified against `DocumentManagement.tsx` but that was wrong: that caller strips the prefix. Fix: `resolve(result.split(",")[1] ?? result)`.
- **HIGH (useMemo dep)**: `items` memo depends on `[debouncedQuery.length, listData, searchData]` — stale results persist when query changes within the same character count. Fix: use `debouncedQuery` as dep.
- **MEDIUM (3 missing tests)**: Debounce-to-search transition, full upload flow, and state-reset-on-close are all uncovered despite being in the plan stubs.
- **MEDIUM**: `scope: "all"` sent to `trpc.library.search` — server-side `searchLibraryItems` may not honour the scope filter; needs integration verification.
- Both `trpc.library.listDocuments` and `trpc.library.search` input shapes are correctly formed.
- `MediaInsertAttrs` union matches plan spec exactly; no arbitrary URL input path exists.
Review file: `planning/tiptap-markdown-editor/implementation/code_review/section-08-review.md`

## Tiptap Editor — Section-06 (Media Extensions) — Verdict: APPROVE_WITH_FIXES (2026-03-20)

2 HIGH, 4 MEDIUM, 4 LOW findings. Key:
- **HIGH (x2)**: `javascript:` rejection tests in `imageExtension` and `audioExtension` use `if (node)` guard — assertions are vacuous if node is absent, providing no real XSS guarantee.
- **MEDIUM**: `MEDIA_DATA_ATTRS` is missing `"data-alignment"` — Section 11 builds DOMPurify allowlist from this constant; will strip `data-alignment` and corrupt image alignment in read-only rendering.
- **MEDIUM**: `width`/`height` attrs are silently dropped from video markdown serialization — round-trip data loss.
- **MEDIUM**: No tests for non-`javascript:` blocked schemes (`data:text/html`, `blob:`, `file:`, etc.).
- **LOW**: `Commands` namespace uses `imageExtension` key instead of `image` — may conflict with base extension's command type augmentation.
- Core security fixes from prior audit ARE correctly implemented: full protocol blocklist, `escapeAttr` throughout serializers, `setVideo`/`setAudio` sanitize at command time.
Review file: `planning/tiptap-markdown-editor/implementation/code_review/section-06-review.md`

## Feature 046 — Security Audit (2026-03-19)

Verdict: **CONDITIONAL**. See `project_046_security_audit.md` for full findings. 4 HIGH, 5 MEDIUM, 4 LOW.
Key blocking issues: (1) `sanitizeMediaSrc` blocks only `javascript:`, not `data:text/html`/`data:image/svg+xml`; (2) markdown serializer uses unescaped string interpolation for user-controlled caption/alt → stored XSS; (3) paste sanitizer missing URL protocol filtering for pasted `<img src>`; (4) `setVideo` command bypasses `parseHTML` sanitization path.
Also: Radix AlertDialog spec in S12 is wrong — Escape closes the dialog unless `onEscapeKeyDown={e => e.preventDefault()}` is explicitly added.

## Feature 046 — Ultimate Final Audit (2026-03-19)

Verdict: **APPROVE_WITH_FIXES**. 7 new findings. See `project_046_tiptap_final_audit.md`.
Key: (1) S11 ADD_ATTR fix has wrong rationale — DOMPurify never sees media tags in the mediaParts path; (2) S12 conflict detection via string-match is fragile — should instanceof-check the error class; (3) S09 async upload callback has no unmount guard; (4) S08/S09 handoff gap — `uploadMedia.ts` not explicitly created by S08; (5) S05 audio table row has extra column; (6) `initialContent` prop re-parse needs a reset-key guard; (7) F23 flag is added but never read.

## Feature 046 — Tiptap Editor Section Cross-Consistency Review (2026-03-19)

See `project_046_tiptap_editor.md` for full findings. Key: 4/13 sections are empty stubs; 2 HIGH naming conflicts; 1 MEDIUM i18n gap; mixed test directory convention.

## Feature 046 — Final Deep-Plan Quality Audit (2026-03-19)

Verdict: **NEEDS_FIXES**. All 13 sections read; all plan items mapped. Key unresolved issues:

- **HIGH**: `SaveStatus` type defined twice with different members (S03: `"idle"` vs S04: `"clean"/"dirty"`). Must consolidate into `types.ts`.
- **HIGH**: `TiptapEditorProps` missing `onMediaInsert` prop that Section 05 depends on.
- **HIGH**: `UnifiedDocumentSurfaceProps` missing `updatedAt` prop that Section 10 adds but Section 03 never declares.
- **HIGH**: `editor.status.*` (S04) vs `editor.save.*` (S10) — two competing i18n namespaces for save status.
- **HIGH**: Directory name `node-views/` (S01) vs `nodeviews/` (S07) — all S07 file paths will be wrong.
- **HIGH**: `MediaInsertMenu.tsx` at `editor/` root (S01) vs `editor/toolbar/` (S08).
- **MEDIUM**: `editor.toolbar.horizontalRule` (S04) vs `editor.toolbar.divider` (S10) — different keys for same concept.
- **MEDIUM**: `editor.media.*` keys defined in S07 but Section 10 i18n block omits them.
- **MEDIUM**: `featureFlags.ts` modification (listed in plan Phase 3) has no section coverage.
- **MEDIUM**: `tiptap-markdown` v0.8 serialization API for custom nodes left as "consult docs" — unresolved.
- **MEDIUM**: `uploadMedia.ts` extraction expected by S09 but not extracted by S08.
- **MEDIUM**: `TiptapEditorProps.content: any` — should be `JSONContent`.
- **MEDIUM**: 5 different test file placement conventions across 13 sections.
- `getDefaultExtensions()` (S02) vs inline extension list in `TiptapEditor.tsx` (S03) — drift risk.

See full review output for interface contract table and all 16 findings.

## Spec 048 — Auth Token Storage Hardening

### Section-04 (DB Schema & Migration) — Verdict: APPROVE_WITH_FIXES (2026-03-19)
- **Both blocking issues confirmed fixed** in current `schema.ts`: `.notNull()` added to timestamps (lines 6638–6639), `export type UserLlmApiKey` / `InsertUserLlmApiKey` added (lines 6645–6646).
- **`tenantId` without FK** — still unresolved (camelCase DB column name, no FK, nullable). Tracked as LOW, does not block section-06.
- Review file: `specs/feature/048-auth-token-storage-hardening/implementation/code_review/section-04-review.md`

### Section-05 (API Key Service Layer) — Verdict: PASS_WITH_NOTES (2026-03-19)
- **Implementation correct and secure.** All 4 functions match plan signatures. `decryptUserApiKey` correctly marked INTERNAL ONLY and not imported by any router.
- Both MEDIUM blockers (short-key guard, DB-not-initialized tests for 3 functions) are **confirmed fixed** in current `userApiKeyService.ts` before section-06 was built.
- Review file: `specs/feature/048-auth-token-storage-hardening/implementation/code_review/section-05-review.md`

### Section-07 (Frontend API Key Panel) — Verdict: APPROVE_WITH_FIXES (2026-03-19)
- **Component correct and secure.** Input is `type="password"`, raw key never rendered (only `keyHint`), all 3 tRPC procedures called with correct shapes, sessionStorage functions fully removed from `authService.ts`, zero remaining imports of removed functions.
- **HIGH — Test file entirely absent.** `__tests__/UserLlmKeysPanel.test.tsx` was never created. Plan required 8 test stubs including the security DOM-exposure test. Blocking fix.
- **MEDIUM — `listQuery.refetch()` instead of `utils.userApiKeys.listKeys.invalidate()`.** Bypasses TanStack Query cache graph; other components displaying the same data won't update. Fix: `const utils = trpc.useUtils()` then `utils.userApiKeys.listKeys.invalidate()`.
- **LOW — No visual separator** between `UserAPIKeysPanel` and `UserLlmKeysPanel` in Settings (plan specified a divider).
- **LOW — No loading/error state** for `listKeys` query; error silently shows all providers as "Not configured."
- Review file: `specs/feature/048-auth-token-storage-hardening/implementation/code_review/section-07-review.md`

### Section-08 (Phase 2 Tests: UserLlmKeysPanel) — Verdict: APPROVE_WITH_FIXES (2026-03-19)
- **Test file now exists** — resolves the HIGH blocking issue from section-07. 8 test cases present.
- **HIGH — Delete button test uses broken `Set.has()` filter.** `knownTexts` contains button DOM elements from `getAllByText`, then `Set.has(btn)` checks against role-query elements — different object references, filter always false. Test works only because `textContent === ""` happens to match the icon-only delete button. Fix: use `data-testid` or accessible name query.
- **MEDIUM — DOM-exposure security test is structurally weak.** Asserts `"sk-full-key"` not in DOM, but that string was never injected into the mock data — test passes trivially even if the component renders the full key. Fix: inject a real secret value (e.g., `"sk-proj-SECRETVALUE1234"`) into `mockUseQuery` data and assert it does NOT appear in the DOM.
- **MEDIUM — No `onError` path tests.** Mutation mock fires `onSuccess` unconditionally; `toast.error` path is never exercised.
- **FAIL — `mockInvalidate` never asserted.** `utils.userApiKeys.listKeys.invalidate()` is the correct post-mutation pattern (component does call it), but no test asserts `mockInvalidate` was called.
- Review file: `specs/feature/048-auth-token-storage-hardening/implementation/code_review/section-08-review.md`

### Section-06 (API Key tRPC Router) — Verdict: NEEDS_CHANGES (2026-03-19)
- **Router implementation correct and secure.** All 3 procedures present, `protectedProcedure` used throughout, rate limit (10/hour, namespace `user-api-key-set`) correctly composed via `createRateLimitMiddleware`, `providerEnum` allowlist matches plan exactly, `decryptUserApiKey` not imported.
- **MEDIUM — Tests bypass tRPC stack.** The test suite calls mocked service functions directly instead of using `appRouter.createCaller(ctx)`. The `protectedProcedure` auth guard is never exercised by any test. A change from `protectedProcedure` to `publicProcedure` would not be caught.
- **MEDIUM — Zero unauthenticated-context tests.** The plan requires 3 auth-gating tests (setKey/listKeys/deleteKey → UNAUTHORIZED for null user). None exist.
- **LOW — Inline Zod schema duplication** in validation tests — schemas re-declared in tests rather than testing through the caller, meaning provider enum drift would not be caught.
- **LOW — `decryptUserApiKey` import test** checks module export namespace (trivially passes) rather than tRPC procedure surface. Replace with `expect(Object.keys(userApiKeysRouter)).not.toContain("decryptKey")`.
- Registration in `routers.ts` correct. Section-05 blocking issues resolved before this section.
- Review file: `specs/feature/048-auth-token-storage-hardening/implementation/code_review/section-06-review.md`

## Recurring Patterns to Flag

- **No file size cap in `replaceFile` input schema** — `fileBase64: z.string().min(1)` with no `.max()`. Flag as HIGH in every review that touches file upload mutations.
- **AlertDialogAction onClick with `e.preventDefault()`** — Radix `AlertDialog` closes on action click by default; `e.preventDefault()` is the correct pattern to keep it open on error, but it also means the cancel/close path must clean state manually.
- **`getVersionSnapshotUrl` enabled guard** — query is gated on `!!selectedVersionId && isFileSnapshot`. If `selectedVersion` hasn't loaded yet, `isFileSnapshot` is false and the query won't fire even if needed. This causes a window where the Download button is hidden but no loading indicator is shown for it.
- **`MarkdownVersionHistory` is a 2-line re-export** — the real component is `DocumentVersionHistory`. No other files import `MarkdownVersionHistory`; re-export exists only for backward compat.
- **`fileToBase64` uses FileReader data URL** — result includes the `data:<mime>;base64,` prefix. Confirm server strips the prefix before decoding.

## Key File Paths

- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentVersionHistory.tsx`
- `apps/web/client/src/components/library/MarkdownVersionHistory.tsx` (re-export only)
- `apps/web/server/routers/library.ts`
- `apps/web/server/services/libraryService.ts`

## Spec 035 — Auto Draft & Content Automation (Round 12, 2026-03-11)

### Patterns confirmed in this spec
- **Raw JSON dict vs Python attribute access**: When spec models store structured data in a `JSON` column (`spec_data`), all inner objects deserialized from that column are plain Python dicts — never Pydantic objects. Code that uses attribute syntax (`.output_type`, `.topic_source`) on those dicts will raise `AttributeError` at runtime. The correct pattern is `.get("output_type")`.
- **Column placement of `count`**: When a YAML list item has a field like `count`, its Python dict representation is `schedule_item["count"]` — NOT `schedule_item["topic_source"]["count"]`. Flag any code reading `source.count` when the YAML field is at the parent level.
- **`assert` vs `raise` in security-critical paths**: All tenant isolation guards in Python Celery tasks MUST use `raise ValueError(...)`, never `assert` (which is stripped by `python -O`). Cross-check every security comment section that advises `raise` — a contradicting `assert` elsewhere in the same spec is a HIGH bug.
- **Example spec vs validator contradiction**: If a spec contains an illustrative YAML/JSON example that uses a field the validator explicitly rejects (`payload_template`), that's a MEDIUM consistency bug that will confuse implementors.
- **`try/finally` for run_record status**: Celery batch tasks that create a run_record and then do multi-phase processing MUST mandate `try/finally` to set `run_record.status = "failed"` on any unhandled exception — an advisory "NOTE" is not sufficient for a spec that will be implemented directly.
- **try/except double-write on consecutive_failures**: When Phase 6 of a batch task updates `consecutive_failures` BEFORE calling `notify_completion()`, and `notify_completion()` raises, the `except` block will double-increment `consecutive_failures`. Fix: move `consecutive_failures` update to after `notify_completion()`, or set a flag to skip the except-block increment if Phase 6 already ran it.
- **Credit budget not rolled back on non-CreditInsufficientError mid-loop**: If `auto_draft_pipeline()` raises a non-credit error partway through the topic loop, the reserved budget for the remaining UNPROCESSED items is never rolled back. Only `CreditInsufficientError` triggers `atomic_budget_rollback(remaining_items)` — other exceptions exit the loop into the outer except, skipping the rollback.
- **`items_completed`/`items_failed` counts are Phase-2-only**: The except block uses `len(results)` (Phase 2 output) for `items_completed`. If Phase 3 export fails after all drafts succeed, `items_completed = N, items_failed = 0` is reported even though 0 exports completed. Spec should clarify that these counts track draft completion, not export completion.
- **`atomic_budget_reserve` `rowcount` vs `RETURNING`**: SQL uses `RETURNING id` but code checks `result.rowcount > 0`. With SQLAlchemy async, `rowcount` may be 0 even when a row is returned via RETURNING. Should check `result.fetchone() is not None`.
- **`CreditInsufficientError` rollback off-by-one**: `remaining_items = len(topics) - len(results) - 1` — the `-1` skips rollback for the current failing item. But the spec budget reservation was done PER BATCH upfront. The current item never deducted (CreditInsufficientError means pre-deduction check failed). The current item's reservation in `credits_used_today/month` is not rolled back.
- **`export_failed` condition too broad**: `phase2_completed and not download_urls` is True for Phase 4 (caption) failures too, not just Phase 5 (upload). A caption generation failure is incorrectly treated as an infra failure, suppressing `consecutive_failures` increment.
- **`update_run_record` partial vs full update ambiguity**: Called at line 1260 with `output_artifacts` only, then at line 1340 without it. If full-replace semantics, second call wipes `output_artifacts`. Must be documented as partial (PATCH) update.
- **`content_automation_reexport_task` never defined**: Referenced in `reExport` tRPC procedure but no pseudocode, signature, or Celery registration is provided in the spec.
- **`getSpecStats` division-by-zero**: `success_rate = completed / (completed + failed)` — no guard for both == 0.
- **`auto_draft_pipeline()` Python contract undefined**: Batch task calls this Python function directly but it's never defined — unclear if it calls the Node.js tool endpoint internally or is a separate Python implementation.

## Spec 043 — Implementation Review (thirteenth pass / FINAL, 2026-03-15)

### Verdict: REQUEST_CHANGES

### Confirmed PASS items (all passes through 13)
- All 8 `/v1/*` route groups + MCP registered in `_core/index.ts:440–455`.
- Middleware chain: CORS → headers → apiKeyAuth → featureGuard → rateLimiter → quotaMiddleware → idempotencyMiddleware → auditMiddleware (confirmed index.ts:429–439).
- `/v1/mcp` at line 455 correctly inherits the `/v1` middleware chain — Express path-prefix `app.use("/v1", ...)` at line 429 applies to all subsequent routes matching `/v1/*` in registration order.
- `agencyBridge.ts` `RunResult` interface HAS `startedAt?` + `completedAt?` fields. `publicAgencyApi.ts:431–432` maps them correctly. PREVIOUS FINDING WAS WRONG.
- `mcp:read` and `mcp:write` ARE present in `ALLOWED_API_SCOPES` (confirmed in `shared/publicApiTypes.ts`). PREVIOUS FINDING WAS WRONG.
- `featureFlags.ts` — `publicApi` confirmed in interface (line 26), ALLOWED_FEATURE_FLAGS Set (line 54), and FEATURE_FLAG_DEFAULTS map (line 81).
- `createInternalTokenFromAuth(auth: { userId: number }, scopes?)` — takes minimal `{ userId }` object, not full AuthContext.
- `cancelJob()` uses `drizzle.transaction()` — but swallows transaction failure via `.catch()`, returning fake success. HIGH bug.

### Open issues after thirteenth pass (FINAL) — requires fix before merge
- **HIGH** — `jobAutomationService.ts:490–494` — `cancelJob()` `.catch()` swallows DB transaction failure and returns `{ ...job, status: "cancelled" }` regardless. Caller receives HTTP 200 success even when status update + credit refund both failed.
- **HIGH (fragile)** — `mcpPublicServer.ts:769` — `/v1/mcp` registered via bare `app.post()` after the `app.use("/v1", middleware...)` block. Correct now due to registration order, but no integration test guards this. If file is reordered, auth is silently bypassed (requireScopes passes when req.auth is undefined).
- **MEDIUM** — `schema.ts:5486` — `publicApiAuditLog.apiKeyId` is nullable; spec says NOT NULL.
- **MEDIUM** — `quotaMiddleware.ts:41` — `"quota_exceeded"` absent from spec section 04 canonical error code table.
- **MEDIUM** — `apiKeyRateLimiter.ts:163` — `"daily_credit_limit_exceeded"` in impl vs. `"daily_credit_limit"` in spec canonical table.
- **MEDIUM** — `apiKeyService.ts:127` — `{ _suspended: true } as unknown as AuthContext` type-unsafe sentinel.
- **MEDIUM** — `publicSkillsApi.ts:253–262` — credits deducted before execution, no refund on failure (intentional but undocumented deviation from expected contract).
- **LOW** — `publicApiAuditLog` table name vs. spec's `api_audit_events` — add comment in schema.ts.
- **LOW** — MCP sessions no absolute expiry cap; sliding TTL allows indefinitely active sessions.
- **LOW** — Agency credit overrun gap: if `creditsUsed > reservedCredits`, no additional deduction occurs.
- **LOW** — `webhookDeliveryService.ts` — `"quota.warning"` event type undocumented in spec's event catalog.

## Spec 043 — Public API & External Agent Gateway (v1.1.0 post-review, 2026-03-14)

### Key codebase facts confirmed during review
- **`AuthResult` union is closed** — only `"bearer"` and `"session"` modes exist. v1.1.0 correctly widens to include `"api_key"` and adds `sub: String(apiKey.userId)` numeric fix.
- **`creditSourceTypeEnum` is a PostgreSQL enum** — v1.1.0 adds explicit raw SQL migration file `drizzle/0071_api_credit_source_types.sql` and notes it must run outside a transaction block via psql, not drizzle-kit.
- **`featureFlags.ts` has 18 flags; `publicApi` not yet present** — v1.1.0 explicitly lists all 3 required locations (interface, ALLOWED_FEATURE_FLAGS Set, FEATURE_FLAG_DEFAULTS map).
- **`llmProviders` table uses `serial()` PK (integer)** — sentinel "API Gateway" row seed in spec uses `gen_random_uuid()` for id, but the actual `llmProviders.id` is a serial INTEGER, not uuid. The seed SQL in v1.1.0 is wrong.
- **`agencyBridge.ts` `RunParams` requires `userToken`** — v1.1.0 addresses this with `AuthContext` refactor but does not show updated `RunParams` interface signature or list all callers of `executeRun()`.
- **`CreditSourceType` union in `creditService.ts` must stay in sync with enum** — v1.1.0 addresses in Section 11 (L-06 fix).
- **BullMQ workers are registered in `_core/index.ts` startup** — existing pattern: `initDeliveryQueue()`, `initWebhookDispatchQueue()`. The new `automation-jobs` worker must follow this same pattern; v1.1.0 spec does not specify where/how the worker is registered at startup.
- **Bottleneck rate limiter** (`llmRateLimiter.ts`) is provider-scoped (per LLM provider slug). It is SEPARATE from the new `apiKeyRateLimiter.ts` (per API key Redis sliding window). No interaction or coordination between the two is needed — they serve different dimensions. v1.1.0 correctly introduces a new file without modifying Bottleneck.
- **MCP session state `mcpSessions` Map is in-process memory** — will be lost on server restart and not shared between Node.js workers. No Redis-backed session storage specified.
- **Sentinel provider slug `api-gateway` not defined in seed.ts** — must be added there or in a migration; not currently present.

### Remaining gaps found in v1.1.0 (post-review)
- **`llmProviders.id` is serial integer, not uuid** — sentinel INSERT uses `gen_random_uuid()` which is wrong type.
- **`agencyBridge.ts` caller list incomplete** — C-07 fix lists 4 callers but misses any direct `agencyBridge.executeRun()` calls in tRPC routers.
- **`automation-jobs` BullMQ worker startup registration not specified** — spec says worker is in `jobAutomationService.ts` but doesn't say where `initJobAutomationWorker()` is called at startup.
- **`mcpSessions` Map is in-process** — multi-instance deployments will break MCP session continuity. No Redis-backed alternative offered.
- **SSE `publicApi` flag disable mid-session** — spec does not define what happens to active SSE connections when tenant admin disables `publicApi` flag (open connections should be drained, not broken).
- **Credit source type count mismatch** — Section 10 matrix has 9 rows using source types `api_chat`, `api_responses`, `api_skill`, `api_agency`, `api_job_skill`, `api_job_media`, `api_job_browser`, `api_job_pipeline`, `api_mcp` — but Section 10 "New enum values (6)" only defines 6 values (`api_chat`, `api_skill`, `api_agency`, `api_job`, `api_mcp`, `api_media`). The matrix uses `api_responses`, `api_job_skill`, `api_job_media`, `api_job_browser`, `api_job_pipeline` which are NOT in the enum list. Inconsistency.
- **`conversations.source` new value `"api"` not in enum** — `getOrCreateApiConversation()` sets `source: "api"` but whether `conversations.source` is an enum column needs verification against schema.

## ClawFeature (feat/029-claw-feature) — Final Completeness Pass (2026-03-02)

### RESOLVED since previous reviews
- **S10-H6**: Widget WebSocket TWO-WAY is now implemented — `channelGateway.processMessageServerSide()` called and response sent back via `widgetConnections` map.
- **S10-H1**: Widget CRUD router (`routers/widget.ts`) uses `domainAdminProcedure` correctly.
- **S11-H6**: Credits ARE now deducted in `webhookTrigger.ts` (line 240-246) after dispatch.
- **S11-H3**: Dedup key now uses `serverTimestamp` for `token` auth type (only uses caller timestamp for validated HMAC). Fixed.
- **S12-H4**: `testRule` no longer calls `invalidateCache()` — uses `evaluateRules()` directly (cache re-populates naturally). Acceptable.
- **S12-H2**: `totalMatches` now uses SQL atomic increment `sql\`"totalMatches" + 1\`` — fixed.
- **S14-H1**: `requireFeatureFlag.ts` now uses `middleware` from `_core/trpc` — no second tRPC instance.
- **S14-H2**: `/api/tenant/current` now returns `featureFlags` field (confirmed in `tenant.ts:39`).
- **S06-H1**: Voice feature flag IS checked at `/api/voice/session` (voiceGateway.ts:105).
- **S06-H2**: Voice credits ARE now deducted via `deductCredits()` in `dispatchSTT()` (voiceGateway.ts:383).
- **S15-H1/H2/H3**: `redisSemaphore.ts` uses atomic Lua INCR+EXPIRE script — INCR race fixed. Remaining: `EXISTS+DECR` in release() is still non-atomic (S15-H2 partially remains).

### REMAINING Open Issues (final pass confirmed)
- **S15-H2 (partial)**: `release()` checks `EXISTS` then `DECR` in two round-trips — still a TOCTOU race if key expires between EXISTS and DECR (creates key at -1). Not critical in practice since TTL is 300s and decr on missing key just creates -1.
- **S11-STUB**: `webhookTrigger.ts:229-237` — actual target dispatch is still a stub (logs `webhook_dispatch_stub`). Credits deducted, log recorded, but no actual chat/agency/workflow routing happens.
- **Nginx S15**: No Nginx location for `/api/webhooks/trigger/` — handled by fallback `/api/` block which routes to Python backend, but webhooks/trigger is a Node.js route. However, CSRF exemption is in place and the route IS mounted in index.ts. Need to verify routing works correctly through Nginx.

## Spec 034 — ResearchStoryboardBuilder Preview/Commit Loop (2026-03-14)

### Key confirmed facts
- **All 4 preview types wired**: research, storyboard, deck, comparison all dispatch correctly in `AgencyPreviewCard.tsx` and `buildAgencyPreview()`.
- **`onPreviewReady` fetches via `utils.agency.getRunPreview.fetch()`** (not the sendMessage return value) — correctly stores full `AgencyPreviewProps & { runId }`.
- **No `comparisonPreview` or `ComparisonPreviewCard` remnants** — comparison is inlined as `ComparisonContent` inside `AgencyPreviewCard.tsx`.
- **Feature flags checked in `commitPreview` only, not in `getRunPreview`** — previews are readable even when commit is disabled (correct design). Flags: `AGENCY_DECK_COMMIT_ENABLED` and `AGENCY_LIBRARY_COMMIT_ENABLED` are NOT in `TenantFeatureFlags` interface or `featureFlags.ts` — they are purely server-side strings passed to `getTenantFeatureFlag()`.
- **`agencyRunArtifacts` schema has all required columns**: `commitToken`, `commitStatus`, `targetType`, `targetId`, `committedAt`, `state`.
- **Deck redirect parses JSON targetId** — `PreviewCommitButton.tsx:62` does `JSON.parse(result.targetId)` to get `deckId`, then navigates to `/presentations/${deckId}`. This is correct given `serializeDeckTargetId` serializes `{ deckId, libraryItemId }`.
- **`AGENCY_LIBRARY_COMMIT_ENABLED` / `AGENCY_DECK_COMMIT_ENABLED` / `AGENCY_TEMPLATE_EXPERIENCES_ENABLED` are NOT in `featureFlags.ts`** — they are backend-only flags managed via `getTenantFeatureFlag`/`setTenantFeatureFlag`, not the client-visible `TenantFeatureFlags` interface.

### Open gaps found
1. **No dismiss/close button on `AgencyPreviewCard`** — preview persists until next run; users cannot manually close it. LOW severity for usability.
2. **No loading state while `getRunPreview.fetch()` is in flight** — `onPreviewReady` fires, fetch begins, but card shows nothing until fetch resolves. No spinner or skeleton is shown.
3. **No error display if `getRunPreview.fetch()` fails** — only `console.error`, no user-visible feedback.
4. **No Library UI route for committed items** — after committing research/storyboard/comparison to Library, there is no "View in Library" link rendered in the committed state button. Only deck type gets a redirect.
5. **`AgencyPreviewCard` not passed `onCommitted` from `AgencyChat.tsx`** — the `onCommitted` prop exists on the interface but `AgencyChat.tsx:698-702` does not pass it. After commit, preview card state is not updated in the parent.
6. **Test gap: `commitPreview` deck path** — `agency.test.ts` tests research commit and deck commit-flag-block, but no test exercises a successful deck commit through `commitPresentationPreview`.

## Feature 045 — Celery JWT Refactor (2026-03-16)

See `project_045_celery_jwt_refactor.md`. Two review passes recorded.

**Post-implementation verdict: APPROVE_WITH_FIXES**. All plan blockers fixed. Remaining:
- HIGH: In-flight old Celery messages (user_jwt arg) will TypeError on new worker — needs drain procedure before deploy
- MEDIUM: Fragile string-slice assertions in `test_agency_creator_security.py` lines 63-68, 81-83 (ValueError if function order changes)
- MEDIUM: `_implement_agency()` silently marks agency_id=None and proceeds if both tokens are empty string
- LOW: No Node.js tRPC layer test verifying user_jwt absent from POST body to Python

## Spec Virtual AI Office Orchestrator — Final Verification Review (2026-03-18, Round 4)

### Verdict: READY FOR IMPLEMENTATION (with 3 residual findings)

### Check results (20/20 evaluated)
- PASS (17): checks 1-partial, 2, 3, 4, 5, 7-partial, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
- CONDITIONAL PASS (1): check 6 — roomLanguage in team_rooms is in section-17 (additive), not inline in section-02 schema table
- FAIL (1): check 1 partial — notifyOrchestrator still has `db: DrizzleDB` param and `tenantId: number` (should be string). recordEvent correctly has no db param.
- FAIL (1): check 7 partial — assistant_profiles.preferredLanguage is in spec.md §3821 but NOT in section-01 implementation table. Section-17 only adds roomLanguage to team_rooms; no corresponding column on assistant_profiles.

### New issues found in final pass
- HIGH: notifyOrchestrator interface in S07 has `tenantId: number` but all other tenant isolation uses `string` (varchar UUID). Type mismatch will cause TypeScript error at call site.
- HIGH: `computeRunSummaries` and `detectStuckAgent` in S07 still take `db: DrizzleDB` parameter even though `recordEvent` and `captureSnapshot` use module-level db. Inconsistent — implementer must pick one pattern.
- MEDIUM: `assistant_profiles.preferredLanguage` mentioned in spec §22.3 and claude-plan.md §10 but not in section-01 implementation table. Field will be missing from the schema unless implementer reads the spec separately.
- LOW: `notifyOrchestrator` test stub in S07 calls it as `notifyOrchestrator(userId, { ... })` (2 args) but the interface shows a single params object. Stub is inconsistent with implementation spec.

## Spec Virtual AI Office Orchestrator — Schema & API Completeness Review (2026-03-18)

### Coverage summary
- **20/20 tables** from spec §16.4.2 present across sections 01, 02, 03, 09, 16
- **67/72 tRPC procedures** from spec §17 present in section-10; 5 missing (`approval.list/get/approve/reject/requestChanges` from §17.12)
- **3/3 SSE endpoints** present in section-11
- **All 3 internal REST endpoints** (`/api/internal/orchestrator/*`) present in section-09
- **4/5 external REST endpoints** present in section-16 (2 are comment-stub-only, not fully described)

### Key gaps
- **`approval.*` (5 tRPC procedures)** — spec §17.12 Human Review APIs have no owning section
- **`handoff_completed` event** — in spec §18.3 core types but missing from section-16's event table
- **9 core event types** have no section explicitly claiming ownership (room_created, participant_joined, run_queued, tool_call_started/completed, artifact_created/updated, memory_written, summary_updated)
- **`monitoring.getActivityTimeline` missing `assistantId?` + `eventCategory?` filters** — spec §17.8 shows these but section-10 Zod schema omits them
- **`teamRun.start` missing `autonomyLevel` + `summaryMode`** — top-level inputs in spec §17.5 not in section-10 schema
- **Extra fields in `assistant_teams`** not in spec: `defaultModelId`, `modelBudgetPolicy`
- **Section-16 `POST /v1/rooms/:roomId/tasks` and `POST /v1/external-tasks/:sourceId`** are comment stubs without full handler description

## Feedback Attachment Upload Security Review (2026-03-18)

See `project_feedback_upload_review.md`. Verdict: REQUEST_CHANGES.
- CRITICAL: Auth runs after multer writes temp files — unauthenticated requests write files to disk with no cleanup.
- CRITICAL: `tenantReq.tenant?.role` is always `undefined` — `Tenant` schema has no `role` field. All isAdmin checks in the Express upload route evaluate to false; no admin can upload to another user's ticket.
- HIGH: MIME+ext fileFilter uses OR logic — `.js` file with `Content-Type: image/jpeg` is accepted.
- HIGH: Multer `LIMIT_FILE_SIZE`/`LIMIT_FILE_COUNT` errors bypass the route handler try/catch — they propagate as unhandled Express errors.
- HIGH: No tenant isolation on the upload route — cross-tenant upload possible if ticketId is known.
- MEDIUM: COUNT(*) + INSERT not atomic — concurrent uploads can exceed the 5-attachment cap.
- MEDIUM: `storagePut` success followed by DB insert failure leaves orphaned storage objects.
- MEDIUM: `parseInt(auth.sub)` is NaN for static-token bearer (`auth.sub = "static"`) — ownership check is silently bypassed.

## Spec 046 — Tiptap Single-Panel Markdown Editor (2026-03-18)

See `project_046_tiptap_editor.md`. Round 7 Verdict: APPROVE_WITH_FIXES.
- 3 HIGH findings: `TIPTAP_EDITOR_ENABLED` absent from `featureFlags.ts` (all 3 locations); `SafeMarkdown.tsx` ADD_ATTR still `["target"]` only (data-poster/caption/asset-id not added); `MediaPart` + `splitByMedia()` do not carry data-* attrs.
- 2 MEDIUM: `onEnterEditMode` prop contract undefined; `parseMarkdownToTiptap`/`countNodes` still undocumented exports.
- 3 LOW: `DocumentPreviewPanel` is 627 lines (spec says 628); `transformPastedHTML` config location ambiguous; flag name screaming-snake vs camelCase inconsistency.

## Feature 044 — Generate Layout with AI (2026-03-15)

See `project_044_layout_from_note.md`. Key confirmed bugs:
- **CRITICAL**: Redis key mismatch — service writes `ai_draft:progress:{taskId}`, getDraftProgress reads `ai_draft_progress:{taskId}`. Deck-note progress invisible.
- **HIGH**: Lock key mismatch — service uses `ai_draft:lock:deck:{deckId}`, getDraftProgress checks `ai_draft_lock:{userId}`. Stall detection broken for deck-note tasks.
- **HIGH**: No credit pre-check before LLM call in single-slide path.
- **HIGH**: Poll interval not cleared on component unmount — memory/network leak.
- **MEDIUM**: Router input schema duplicates `GenerateLayoutFromNoteInputSchema` from aiTypes.ts — drift risk.
- **LOW**: `aiDesign.source` hardcoded to `"draft-with-ai"` in new functions — makes log queries ambiguous.

### Registration Status (all confirmed)
- `channelRouterRouter` — registered at `routers.ts:1369`
- `webhookTriggersRouter` — registered at `routers.ts:1366`
- `AdminChannelRouter` page — registered in `App.tsx:164` at `/admin/channel-router`
- menu entry `admin-channel-router` — in `menu.ts:66` with `requiresFeature: 'channelRouter'`
- Voice WS upgrade — wired in `_core/index.ts:983`
- Widget WS upgrade — wired in `_core/index.ts:985`
- Voice session router — mounted at `/api/voice`
- Widget init router — mounted at `/api/widget`
