# Convergence Review — Specs 263 and 270

Scope: task-owned diff on branch `codex/spec263-270-public-completion-20261005`.
Review rounds: 10 requested passes. Three material findings were corrected before the clean convergence run; rounds 4–10 were clean. Final focused verification is 6 files / 47 tests.

## Round ledger

1. **Tenant host identity — finding fixed.** A null tenant result was treated as SmartAIHub and could show global copy on an unresolved custom host. Added `isSmartAIHubPublicSite`: exact tenant primary domain or verified SmartAIHub/local host only; unknown host fails closed. Added direct helper coverage.
2. **Retired public nav metadata — finding fixed.** `navbar.workflows` had no caller but remained in locale JSON and a required-key test. Removed the public nav key and stale assertion; did not change unrelated authenticated sidebar keys or add routes.
3. **Artifact replay isolation — finding fixed.** Added tenant/project checks before returning idempotent replay records on create/append/fork; actor is part of the fork idempotency key; request identity/version bounds are checked before repository access. Added cross-tenant fake-repository replay tests.
4. **Fresh regression convergence — clean.** Ran the changed client/service tests and nav translation contract after the repairs: 6 files / 47 tests passed. Public host helper, Navbar, Footer, tenant-home reduced-motion, i18n key contract, and design artifact service are covered.
5. **Footer tenant data boundary — clean.** Custom tenant footer uses only tenant logo/name/email; SmartAIHub global link columns, social accounts and email do not render. The SmartAIHub host retains its existing footer. Footer tests assert both branches.
6. **Navbar and keyboard behavior — clean.** Custom domains expose only tenant home navigation and no Pro/product copy; menu tests cover localized state, active route, Escape dismissal and focus restoration. No new route or unsupported claim.
7. **Reduced-motion behavior — clean.** Background video requires a confirmed non-reduced-motion result; reduced or not-yet-resolved preference uses the poster/fallback. Focused tests cover reduced, default, and unresolved preference states.
8. **Spec 270 authority boundary — clean.** New behavior remains injected and default-off. No route, migration, provider call, durable adapter, authoring UI, or worker lifecycle was introduced; G0/Spec 224/256/provider blockers remain explicitly open.
9. **Retired systems and content scope — clean.** Changed public nav data contains no `navbar.workflows` key; route truth/handoff remains the already verified `/drama-series` path. No `/workflows`, Agency, workpacks, OpenSandbox, Docker dispatch, or `sandbox_jobs` reference was added by this delta.
10. **Final fast-gate and handoff — clean for partial integration.** Diff is coherent, no unresolved conflicts, tests parse/execute changed TSX/service files, locale JSON parses, whitespace check passes. No full typecheck/build/browser/deploy claim. Safe partial integration is the next action; whole specs remain blocked by listed external authorities/evidence.

## Stop result

- Clean rounds after the last material repair: 7 consecutive (Rounds 4–10).
- Material findings remaining in safe code scope: none found in these passes.
- Blocked findings: public claim/asset rights, route/crawl/analytics/RUM and deployed-browser proof; durable artifact ownership/recovery/retention/reference closure; live Spec 224/256/catalog and provider certification; serialized repository-wide typecheck.
- Stale gates: none for the exact focused code diff. Final docs-only edits require `git diff --check` before commit.
- Stop reason: proceed with `CHECKPOINT_PROMOTED_PARTIAL` after integration; whole Specs 263/270 cannot be closed honestly until blocked external authorities and evidence are supplied.
