# Integration Report

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
