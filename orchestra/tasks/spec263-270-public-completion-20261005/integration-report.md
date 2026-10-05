# Integration Report

## Latest canonical UI and live-browser checkpoint — 2026-10-05
- Deployed implementation source SHA `a484c8717637f7f643a6eb699e1d1cdc80dab421` was equal to refreshed `origin/main` at build/publish time; the prior homepage code commits `2e322b35159e6cbf87039c217d0d3c075c1a585c` and `a484c871...` were promoted through normal non-force push. The durable evidence/handoff commit is `1f83678639be33863645aa2eb95a75d8fe4fd103`, now the current `origin/main` tip; it contains no frontend source changes and does not require a rebuild.
- **Corrected RCA:** stale checkout deployment was a real earlier incident, but later live responses matched the canonical bundle. The remaining visible defects came from the fixed Navbar overlapping the page, a legacy CMS Home override possibility, and Astryx neutral theme tokens overriding the expected tenant brand. The two latest code checkpoints addressed these source/runtime issues; this corrects the earlier overstatement that stale assets alone explained the user's later screenshot.
- Exact `a484c871...` canonical build and static publish succeeded to `/home/dev/projects/SmartSpecPro/apps/web/dist/public`; backup `/home/dev/.cache/codex/deploy-backups/smartspec-web-main-20261005T151953.479738Z`; 1,556 published assets; deployed index SHA-256 `1ee7689be7ebde6bf790031115c2e0f10e6034f39538ef01b07d8410f891785e`. Static-only publish did not require restart. Primary dirty checkout was preserved.
- Deployed-domain Chromium matrix passed basic render/load checks at 360×800, 390×844, 768×1024, 1024×768 and 1440×900: one H1, no horizontal overflow, both illustrations loaded, no page errors/HTTP 4xx, valid existing signed-out Film handoff link, reduced-motion preference recognized, and keyboard focus outline present. Evidence: `evidence/browser-matrix-a484c871.json` plus five viewport PNGs.
- This is a live-render checkpoint, **not** a Spec 263 acceptance pass. No browser assertions were made for licensed/approved media, signed-in access, failure fallback, consent/event payload, color contrast, target sizing, production crawl/canonical agreement, or CWV/RUM. No `design/public/` artifact/catalog digest, approved claims, Film proof, or image-rights record exists. Section 03/04 therefore remain partial by their own prerequisites.
- No tests or typecheck were run in this continuation. The prior `apps/web` package typecheck remains failed on older SHAs with broad baseline diagnostics, and the full monorepo check is still queued by Spec 224; neither result is a pass for `a484c871...`.

## Public homepage RCA repair — deployed closeout (2026-10-05)
- Latest code repair integrated: `1b813bf0cf7460e1ba0e1007271580d2ca90e04f` on `origin/main` (baseline `6c548c19b8963f5725db74210b94e43e60d874c6`).
- Root cause: production served the shared service checkout's old homepage bundle (branch `codex/spec261-spaas-phase-a-20261005`, source `d6ef8f3...`); its Home asset hash matched the public response. The CDN was dynamic/no-store. A second latent issue accepted a global `tenantId=null` DB page for canonical SmartAIHub and overrode the new home after deployment.
- Repair removes global-page acceptance at the client boundary; only exact tenant-owned, published pages may override their tenant site. Exact tenant lookup/API behavior is unchanged. Focused hook and Home suites passed 2 files / 16 tests on candidate.
- Focused hook/Home suites passed 2 files / 16 tests; `git diff --check` passed. Canonical build passed on exact repair SHA `1b813bf0...` at result file `/home/dev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/1b813bf0cf7460e1ba0e1007271580d2ca90e04f-a33c39ca-28cf-45bb-b915-4b7d52a9d9d7.json`.
- Static artifact was deployed to `/home/dev/projects/SmartSpecPro/apps/web/dist/public`, copying assets first and atomically replacing `index.html`; rollback snapshot is `/home/dev/.cache/codex/deploy-backups/smartaihub-public-20261005T1948+0700`. The dirty service source checkout was preserved. Static assets serve fresh per request; service remained active and did not require restart.
- Post-deploy public checks: `/features` returned HTTP 200; public `index-fvie897b.js` matched deployed SHA-256 `1e750e0ca1a322aff396fca4f4711b2bdaf853bf7b8e318a3c25acb5940bdeb2`; `Home-BnGBe32f.js` matched `8e021b364bd43da4fb27177bbe1e10f2ffb7c5d21dbcab60e502a38709ab0954`; `/api/tenant/current` identified `tenant-ZCSKEM9s` / `smartaihub.app`; the platform-scoped DB home is rejected by the exact-tenant client rule. Browser visual proof remains unverified because Chromium is unavailable.
- No DB migration or write occurred. Main code + static runtime mismatch is repaired, but Specs 263/270 remain partial for external authority/provider/asset and browser/accessibility/crawl evidence. Whole-spec completion is not claimed.

## Recovery after local stale-checkout build — 2026-10-05
- The screenshot command ran `build:deploy` from the dirty shared checkout at `d6ef8f3...` (3 ahead / 108 behind current main). `build-atomic.sh` builds that checkout; trailing `atomic swap` arguments do not select a revision. The successful swap briefly restored stale entry `index-l_1vZL4D.js` and Home chunk `Home-UALzsGcS.js`.
- Saved that output with symlinks preserved at `/home/dev/.cache/codex/deploy-backups/smartaihub-public-local-build-20261005T2005+0700`. Re-promoted the verified canonical static artifact built from integrated code SHA `1b813bf0...`; public root now references `index-fvie897b.js`, remote entry and Home chunk hashes again match the canonical artifacts, `/features` returns 200, and the service remains active.
- Operational next step: invoke the canonical source builder for integrated main with `--required-integrated-revision 1b813bf0cf7460e1ba0e1007271580d2ca90e04f`; do not use the dirty shared checkout's `build:deploy` when the target is latest main.

## One-command canonical build/publish — 2026-10-05
- Added root command `pnpm run deploy:web:main`; the direct app command is `npm run build:deploy`. Both resolve to the new canonical build-and-publish workflow. The command works from a stale checkout because it fetches `origin/main` and loads the policy/controller from that fetched SHA before preparing an isolated source lease.
- It only promotes static public assets to active `smartspec-web.service` `dist/public`; it keeps a rollback snapshot, preserves the shared media symlink, validates asset hashes and swaps `index.html` last. Backend code/migrations are outside this command. `npm run build` remains local; use `build:deploy:local` only intentionally.
- Integrated code SHA `0422a2a386489276baa8789a69ced5ea1c2fb182`; canonical build and publication both passed. Rollback copy: `/home/dev/.cache/codex/deploy-backups/smartspec-web-main-20261005T132658.391344Z`. Public `/` and `/features` returned 200 and entry/Home asset hashes matched the build. Visual browser verification remains open.

- Outcome: `CHECKPOINT_PROMOTED_PARTIAL`.
- Reconciled `origin/main` before promotion: `58cafcfd60`.
- Implementation checkpoint: `f10c323eb9760bcb2577f9b93fc6bc6e16193bad` (`fix: align SmartAIHub homepage and design provider contracts`).
- Promotion: normal non-force `git push origin HEAD:main`; remote `main` matched the candidate and the commit was reachable from `origin/main`.
- FAST gate: focused suite passed (15 files / 110 tests); `git diff --check` passed; conflict-free rebase; no accidental secret detected in the scoped change.
- Canonical checkout `/home/dev/projects/SmartSpecPro` was left untouched because it contains unrelated work.
- Not run: app build, repository-wide typecheck, browser/UAT, production crawl, provider certification, production DB writes, or deployment. No production effect is claimed.
- Open gates: Spec 263 rights/content authority and browser/crawl/analytics/RUM evidence; Spec 270 durable artifact ownership/retention/recovery, approved catalog, callable Spec 224/256 authority, and provider certification/credential binding. See `progress.md` for details.
- Website impact: source integration alone does not change `smartaihub.app`; a separate authorized build/deploy lifecycle is required.

## Direct-route and crawler isolation checkpoint — 2026-10-05

- Reconciled against remote main `f0ffed9514dbe788adb5c0c64f15da25c27b0f5d`; task branch had no unrelated dirty changes.
- Promoted implementation commit `8f9f635fd2cc65239c4178cc6a79886e7b2d5229` (`fix: isolate tenant public routes and crawler output`) by normal non-force `git push origin HEAD:main`.
- The push succeeded (`f0ffed951..8f9f635fd HEAD -> main`); a subsequent fetch showed main advanced concurrently to `ff8cd676035daf697c7bca5e94028ed965358632`. `8f9f635...` is an ancestor of that current `origin/main` SHA.
- FAST gate and focused post-rebase verification: 8 files / 58 tests passed; changed TSX/server syntax parsing, bilingual locale JSON parsing, `git diff --check`, and scoped secret-pattern scan passed.
- Current outcome: `CHECKPOINT_PROMOTED_PARTIAL`; current remote main `ff8cd676035daf697c7bca5e94028ed965358632` is not a release/deployment claim.
- Not run: build (per user direction), full repository typecheck, browser/UAT, production crawl, provider certification, DB writes, or deployment. Spec 224 §36.4.3 requires the full typecheck to be enqueued through canonical `worker_jobs` + outbox and forbids local command-runner execution; no enqueue tool is available in this session. Typecheck is `QUEUE_REQUIRED` against current main SHA `ff8cd676035daf697c7bca5e94028ed965358632`; external/browser/deployed-domain evidence remains assigned to its authority owners.
- Open authority and evidence gates remain as enumerated in `progress.md` and `lifecycle.md`; no whole-spec completion is claimed.

## Continuation checkpoint — 2026-10-05

- Reconciled latest remote main `63570c20bb785a1612b7359a62c7f7c259e5128c`; rebased task commit without conflicts.
- Promoted task-owned follow-up commit `ec3e469ffff68ec7ee1a8299b8984e45063eddaa` (`fix: isolate public tenant branding and close design service gaps`) through normal non-force `git push origin HEAD:main`.
- Remote verification: `git ls-remote origin refs/heads/main` returned `ec3e469ffff68ec7ee1a8299b8984e45063eddaa`; `git merge-base --is-ancestor ec3e469... origin/main` returned success.
- Post-rebase focused verification on the exact candidate SHA: 6 files / 47 tests passed. `git diff --check`, locale JSON parse, stale public navbar workflow-key search, and scoped secret-pattern scan passed.
- No app build, full typecheck, browser/UAT, production crawl, provider call/certification, production DB write, or deployment was run.
- Outcome remains `CHECKPOINT_PROMOTED_PARTIAL`, not whole-spec completion. External/authority gates and next actions are listed in `progress.md` and `lifecycle.md`.

## Public SEO/auth/analytics continuation — 2026-10-05

- Candidate started at `0cbb0ae9b21c7c9cdf31d954432ca62139d9cf49`, which matched refreshed `origin/main` immediately before integration.
- Fixed null tenant/API SEO crash, narrowed auth return intents, added fail-closed PostHog consent/revoke and route-template minimization, excluded marketplace auto-review identifiers, and fixed unsupported Vitest 4.1 worker flags. Added targeted regression tests and updated Spec 263 proof records.
- FAST gate: 12 focused suites / 65 tests passed; staged diff check passed; no conflict markers or scoped secret pattern found.
- Commit `d91e090a73821558a9dc52b87750b081bdf22c53` (`fix: close public SEO and analytics gaps`) pushed by normal non-force `git push origin HEAD:main`. A fresh fetch returned the same `origin/main`; `git merge-base --is-ancestor d91e090... origin/main` passed.
- Corrected dependency-isolated package typecheck on exact `origin/main` SHA `2c2e094b55ef95fe96fdfa1d30e2273a8984052e` completed `CODE_FAILED` with 942 diagnostics across 250 files (available memory 21,554 MiB). No task-owned source diagnostic. Earlier 927-error result resolved workspace aliases through the dirty canonical checkout and is superseded. Full repository check remains `QUEUE_REQUIRED` until canonical worker admission.
- Not run: app build (per user), full monorepo typecheck, browser/UAT, production crawl, consent/vendor payload, provider certification, DB writes, or deployment. Source integration does not establish smartaihub.app runtime.
- Outcome: `CHECKPOINT_PROMOTED_PARTIAL`. Next: repair broad typecheck findings through owning modules and complete external consent/content/rights/durable-provider/catalog plus browser/deployed-site evidence; build/deploy remains a separate lifecycle.
- Post-integration verification: on exact integrated source SHA `d91e090a73821558a9dc52b87750b081bdf22c53`, repeated the same 12 focused suites; 12 files / 65 tests passed. This is scoped regression proof only, not package typecheck/build/browser/deployment evidence.

## Latest handoff — 2026-10-05

- Canonical destination: GitHub `main`, currently `a48c39788868b12d3a9d282f9654fa6993947666`; this handoff commit includes the current task status and is verified as the remote branch tip. Task code checkpoint `7d16fc68ea494cd9afb3ed2ec270fb9571209163` is an ancestor of it.
- Implemented and integrated: repository-owned Spec 263/270 changes, including tenant-safe public routing/crawlers, public SEO/auth/analytics hardening, homepage platform-scope fallback, and gated Spec 270 service boundary. No unintegrated task code remains.
- Focused current proof: homepage API/hook regression suites passed 2 files / 11 tests on `7d16fc68...`. Earlier task checkpoints have their own test evidence above. No build, browser/UAT, production crawl, provider certification, production DB write, or deployment was run.
- Current known verification failures: `apps/web` package typecheck was `CODE_FAILED` with 1,888 diagnostics on source `9524ec759...`; none referenced the four homepage-fix files. This result is stale for later SHAs and requires rerun by owning module teams on current `main`. Full repository typecheck is `QUEUE_REQUIRED` under Spec 224 §36.4.3; no canonical enqueue tool was available here.
- Remaining external gates and next actions:
  - Spec 263 content/rights: **owner unassigned** — Spec 258/content/legal authority to approve public Film claims, licensed assets, provenance, and withdrawal process; then supply route canonical/indexability decisions.
  - Consent and live website evidence: **owner unassigned** — privacy/product owner to approve consent UX; web/release owner to run browser viewport/accessibility/crawl/performance checks and verify deployed-domain output after an authorized deployment.
  - Spec 270 durable artifacts/catalog: **owner unassigned** — storage/data owner to define repository, retention, deletion, backup/recovery, reference GC, uniqueness/atomicity; Spec 224/256 owners to expose callable lifecycle contracts; catalog owner to approve publication and digest authority.
  - Spec 270 provider: **owner unassigned** — provider/legal/security owner to establish terms/certification, credential binding, quota, retention, and egress evidence before enabling provider execution or native authoring UI.
  - Typecheck: **owner unassigned** — web module owners to triage broad package diagnostics; verification platform owner to enqueue serialized full check through canonical `worker_jobs` + outbox.
- Handoff status: **durably recorded but not fully assigned**. All open items have a durable location and next action; accountable recipient names/teams and due dates have not been supplied, so Specs 263/270 remain open. Resume from `orchestra/tasks/spec263-270-public-completion-20261005/progress.md` and this section. Do not claim live-site, whole-spec, or typecheck completion.

## Accessibility candidate — pre-integration

- Candidate base: `8dfd6a43911ad3285c306d2f13a1fdb1f08c1d0c` (`origin/main` at start); task worktree `/home/dev/.codex/worktrees/fix-canonical-web-build-20261005`, branch `codex/spec263-public-full-20261005`.
- Candidate source repairs: SmartAIHub-only readable accent/CTA colors, explicit Features heading contrast, and restored browser zoom. Tenant-owned branding and CTA classes remain unchanged.
- Focused verification: 2 files / 26 tests passed, including platform and custom-tenant CTA assertions on desktop and mobile DOM states; esbuild syntax parse passed for all six changed TS/TSX files; `git diff --check` passed. Full/package typecheck, build, deployment and post-patch browser/axe are pending against the eventual integrated SHA.
- Independent review: rounds 37–38 caught and closed the CTA contrast and mobile test coverage gap; final result clean.
- Status: `FAST GATE PASS — PENDING INTEGRATION`; no deployed-source claim for this candidate yet. Primary dirty checkout and running service were not modified.


## Accessibility candidate and production boundary — 2026-10-06
- `a7108aeb9fc05a7baa2d6b14e7bfa40f675a0514` is reachable at `origin/main` and was canonically built/published. Rollback: `/home/dev/.cache/codex/deploy-backups/smartspec-web-main-20261005T192431.648371Z`; deployed index SHA-256 `7733e53838d30f669188487db6a498d7648c342a89675d52dc64b4b968e81508`. Nine public routes passed HTTP/render checks in `evidence/browser-a11y-a7108aeb/routes-only-a7108aeb.json`.
- Follow-up axe scan identified a serious emergency CTA contrast defect (2.68:1). The candidate repair in `EmergencyPublicEntry.tsx` is reviewed and passed 3 focused suites / 28 tests, but has not yet passed FAST gate/integration/deploy/browser acceptance at a final SHA.
- Raw/no-JS crawler checks against the live routes showed duplicate prerender/client SEO metadata and stale Home prerender fields on `/features`. `smartspec-web.service` executes from dirty `/home/dev/projects/SmartSpecPro/apps/web`, and static deploy does not update the server-side prerender code. No clean exact-SHA backend deployment path or rollback has been established; no restart/source overlay was attempted. Owner: deployment/runtime authority; next action: provision/approve a clean exact-SHA backend release lane with compatibility preflight, then deploy and rerun raw crawler checks.
- Outcome stays `CHECKPOINT_PROMOTED_PARTIAL`; deployment and route availability do not satisfy Spec 263 production acceptance.

- Independent Spec 270 reconciliation confirmed no native canonical design artifact/version, catalog owner/digest publication, resolver record, durable artifact store, or callable Spec 224/256 authority. The public package manifest was repaired: all 24 local file hashes validate and digest is `cfb27353181ed1100c26f6de570dcc293c22c9792b2cf8e09fb43226e437e3e7`; classification remains candidate-only.


## Production acceptance at `4b630344` — 2026-10-06
- Canonical build and static publication passed for exact `origin/main` SHA `4b6303443762f4465472eff024a14fb7169a841f`. Rollback snapshot `/home/dev/.cache/codex/deploy-backups/smartspec-web-main-20261005T194604.160228Z`; 1,554 assets; published index SHA-256 `7b438ceb47735d4c3f806edcfa1ab37e7a9452c57ce09b3e4ce4c0a5952a7ff6`. Primary dirty checkout remained unchanged.
- Production browser report `evidence/browser-production-4b630344/production-acceptance.json`: 9/9 routes HTTP 200, one H1 each, one active client metadata set after hydration, no same-origin 4xx/page errors/broken images/overflow; mobile menu keyboard open/Escape/focus restore passed. Axe passed 22/24; two serious variants were the same FeedbackButton contrast failure at 2048px in EN and TH. Emergency report CTA passed all cases. Candidate repair adds stable light/dark opaque colors and has independent review.
- Raw Googlebot route snapshots in `evidence/browser-production-4b630344/raw-googlebot-html.json` still FAIL: duplicate canonical and descriptions on `/` and `/features`; Features prerender metadata disagrees with client route values. Live server uses dirty shared checkout branch `codex/spec261-spaas-phase-a-20261005` at `168641dc...` with 166 dirty paths. We did not alter or restart it. Safe next action/owner: establish a clean exact-SHA backend release lane with compatibility preflight and rollback, then activate the already integrated prerender repair.
- Current candidate source repair is not yet integrated/deployed. Whole Spec 263 remains `PARTIAL_INTEGRATED — PRODUCTION CHECKPOINT DEPLOYED — ACCEPTANCE OPEN`.

- Candidate repair is `FeedbackButton.tsx` + focused test: a persistent opaque white/dark foreground fixes the single serious overlap contrast node from deployed SHA `4b630344...`; dark-specific override fixes the variant cascade. Independent review is clean; focused 4-file suite is 44/44. This repair has not yet been integrated or deployed.
