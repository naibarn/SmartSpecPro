# Review Findings — Feature 201 convergence

## Migration follow-up — closed locally (2026-09-18)

- Applied the four ordered migration files `0332` through `0335` in one
  transaction against the local `smartspec` database loaded from
  `apps/web/.env`.
- Verified the Feature 201 tables, Feature 203 snapshot/revision tables,
  public identifier defaults/constraints/indexes, and four corresponding
  `drizzle.__drizzle_migrations` rows.
- The root `.env` host `postgres` was unreachable from this shell; no remote or
  production target was changed. Other repository migrations remain pending by
  design and were not bulk-applied.

## Fresh 28-round re-audit — closed in this run (2026-09-18)

- Added migration `0335_feature_201_public_identifiers.sql` and schema/journal
  coverage for opaque public asset/case identifiers; `safeAssetView` and case
  projections no longer expose internal asset/case UUIDs.
- Added canonical `getCase` resolution and `/content-protection/cases/:caseId`
  detail navigation using tenant/owner-scoped public case identifiers.
- Prevented a missing protected playback URL from being promoted from a raw
  storage key; ON remains gated until a valid protected playback reference is
  available.
- Completed Content Protection workspace localization and route namespace
  preloading for EN/TH, including verify, cases, rights, certificate, settings,
  status notices, status badges, and accessibility labels.
- Confirmed Dashboard top-level/quick links and status counters, including the
  Settings destination `/settings?section=contentProtection`.
- A transient client syntax regression during the repair loop was corrected
  before the final build; the final production client/widget build passed.

Fresh evidence: section checks 10/10, UI contract checks 10/10 with 7 UI
sections, Feature-201 matrix 10 files/99 tests, locale parity 17 tests,
targeted server esbuild, production client/widget build, and `git diff --check`
all passed. Full typecheck, deployed migration, authenticated browser,
production provider/render, and legal/platform gates remain explicitly
external release evidence.

## Closed in this run

- Generic Media Studio did not carry a user-selected ON/OFF protection intent. Fixed at payload, router, and durable-task boundaries.
- Final render status could be protected while consumers still used the original raw render URL. Fixed with causal render output patching and protected-storage URL resolution.
- History reprojection could restore the raw artifact URL. Fixed by preserving protection projection fields and invoking protection during generic history durability.
- Vertical Drama omitted intent when no per-operation input existed. Fixed by resolving the user's persisted default.
- Public evidence-review route/page and scoped ZIP download were incomplete. Added case-scoped page, token validation, and sealed package stream.
- Verification could not accept a managed suspected upload or missing source checksum. Added tenant-scoped upload resolution and bounded checksum hydration.
- Verification overclaimed only exact hash behavior. Added image dHash similarity and honest technical-signal labels; OFF assets are excluded.
- Evidence package was only a DB manifest. Added immutable ZIP object with manifest, procedure, and reviewer instructions.
- ON/OFF shared intent invariant allowed an invalid disabled-by-user ON combination. Added schema refinement and regression test.
- Media Studio audio generation could have bypassed the protection gate through its synchronous path. ON now routes through async gated generation; internal storyboard audio remains an intermediate input and is protected again at the final video compound boundary.
- Web Video Editor export did not carry the protection intent into the worker handoff. Added per-export/default resolution for video, still-image, and audio export and blocked ON direct local export without a worker handoff.
- Verify was request-synchronous and was not admitted to the canonical control plane. Added the `content_protection.verify` contract, PostgreSQL-pull allow-list, executor, ordered forensic-stage reporting, bounded source hashing, and idempotent run projection.
- Moving Verify into the executor initially lost the non-admin owner predicate. Added server-derived `candidateScope` and re-applied the owner filter inside the executor.
- `createCertificate` referenced an undefined signer-key variable, and evidence ZIPs only included certificate DB rows. Fixed the persisted signer key reference and project bounded signed certificate documents/signature/public-key material into the package.
- A terminal failed Verify run trapped subsequent requests for the same hash. Failed runs now remain historical and a new queued run is created for an explicit retry.

## Open release gates

- Configure and validate a real protection provider/worker.
- Run authenticated browser, deployed migration, production compound/render, and legal/platform UAT checks.
- Add external video/audio transformed-copy detectors, C2PA trust verification, and RFC 3161 TSA validation if those claims are required for launch.
- Align the application-wide authorization model with the spec's separately assignable `content_protection.*` roles; current feature enforcement is tenant/owner/admin based because no compatible user permission registry exists.
- Implement the spec's optional/future `fingerprint`, `reprotect`, and `evidence_prepare` logical jobs only when their real contracts/executors are designed; the audit intentionally did not register fake handlers.

## Evidence

- `check-sections.py`: complete, 10/10.
- `check-ui-contracts.py`: complete, 7 UI-affecting sections.
- Focused Feature 201 suites: passed.
- Worker registry and polling suites: passed in the focused Feature-201 rerun; the final Feature-201 matrix passed 67 tests.
- Production Vite client and widget build: passed with existing large-chunk warnings only; final rerun is the release evidence for this audit.
- `git diff --check`: clean.

# Review Findings — Specs 202/203 follow-up

## Closed in this run

- Corrected stale Web/Worker project identity and revision binding in both the
  Phase 3 render path and the legacy rollback editor.
- Implemented rough-cut `cut` apply/ripple semantics with protected-clip checks
  and reversible snapshot inverse metadata.
- Added tenant-aware canonical project predicates and cross-tenant revision
  rejection while preserving unrevisioned legacy migration reads.
- Made duplicate editor admission truthful by returning snapshot summary and
  `snapshotReady` instead of implying snapshot linkage for historical jobs.
- Updated Spec 202/203 completion/review records and added fresh 16-round audit
  records for both specs.

## Evidence

- Spec 202 section/UI checks: 6/6 and 6/6.
- Spec 203 section/UI checks: 9/9 and 9/9.
- Integrated editor/runtime suite: 19 files / 63 tests passed.
- Editor router/service runtime imports passed.
- Target `git diff --check` passed.

## Open release gates

- Authenticated browser conflict/change-set/QC and responsive/a11y evidence.
- Real Windows Worker capability/executor and installer/runtime proof.
- Deployment migration rehearsal, production artifact/Library/rollback proof.
- Pre-existing `drizzle-kit check` collision between metadata 0146/0147; not
  changed because repairing unrelated migration history would be destructive.

# Review Findings — Specs 202/203 fresh 15-round re-audit

## Closed in this run

- Active generic composition-scan submit no longer labels the Node-owned job as
  Desktop Worker.
- Node lane disabled now returns a visible capability-blocked precondition before
  credit reservation or canonical job creation.
- Routing contract and router use the same tested helper; existing Desktop media
  operations remain on the Desktop Worker lane.
- Spec 202/203 status prose, completion records, and audit evidence now match the
  current active Web route and its remaining external release gates.

## Evidence

- Spec 202 section/UI checks: 6/6 and 6/6.
- Spec 203 section/UI checks: 9/9 and 9/9.
- Fresh integrated editor/runtime suite: 21 files / 52 tests passed.
- Editor router/service runtime imports and target static checks passed.
- `git diff --check` passed.

## Residual release gates

- Authenticated browser conflict/change-set/QC and responsive/a11y evidence.
- Real Windows Worker capability/executor and installer/runtime proof.
- Deployment migration rehearsal and production artifact/Library/rollback proof.
- Unrelated Drizzle metadata parent-snapshot collision 0146/0147 remains
  documented and untouched.

# Review Findings — Specs 195–205 fresh convergence (2026-09-18)

## Round summary

- Runner implementation audit: 10/10 rounds passed.
- Cross-spec ownership/contract audit: 10/10 rounds passed after correcting
  the probe predicates to match the actual symbol names.
- Focused Web contract/UI suite: 16 files, 128 passed and 2 intentional skips.
- Worker/content-protection regression suite: 5 files, 103 passed.
- Browser Control Plane smoke: 4/4 passed across mobile, tablet, desktop and
  the global Feedback entry.
- Native Runner: 32 Rust tests, format check and release build passed.
- Cloudflare runtime: 23 tests and package check passed.

## Finding closed

- Browser server startup failed because `CONTENT_PROTECTION_FAILURE_CODES`
  and `CONTENT_PROTECTION_PROGRESS_STAGES` were imported from
  `shared/workerRuntime.ts` although they are owned by
  `shared/contentProtectionWorker.ts`. Moved both imports to the owning module
  and reran Worker regression plus browser smoke.

## Gap closure

- No safe in-scope MUST_FIX or MUST_DO_NOW gap remains.
- Provider session acceptance, native signing/install, deployed Cloudflare
  target lifecycle and deployed authenticated browser evidence remain explicit
  external release gates, not inferred from local contract tests.
- Whole-repository TypeScript type-check was intentionally skipped because of
  the repository RAM constraint.

# Review Findings — Feature 201 UI/UX integration audit (2026-09-18)

## Ten-round result

- Dashboard quick links and status card are feature-gated, typed, and now expose
  loading/error states plus a direct workspace CTA.
- Settings deep links now expose the actual user-owned ON/OFF default and fall
  back to Preferences when the feature is disabled.
- Media Studio, Video Studio, Web Video Editor, Worker Editor, and Vertical
  Drama all expose the final-artifact choice and a direct Content Protection
  evidence/settings route.
- Vertical Drama now hydrates the user default without overwriting an explicit
  episode-level choice.
- Workspace overview/assets/cases/rights/certificate/settings surfaces now
  distinguish loading, empty, error, and success states; active/pressed
  navigation semantics were added.

## Evidence

- Settings + Dashboard UI: 16/16.
- Vertical Drama final-render + ExportDialog: 27/27.
- Locale parity + Content Protection router: 21/21.
- Production client/widget build: passed; existing oversized-chunk warning
  remains a performance follow-up only.
- `git diff --check`: passed.

## Gap closure

- must_do_now: none.
- should_offer_next: authenticated Playwright route/viewport evidence at
  390x844, 768x1024, and 1440x900.
- safely_deferred: pre-existing chunk-size warning and external provider,
  deployment, production, legal, and browser-authentication gates.
- no_action_needed: feature gating, opaque public identifiers, image-provider
  gating, and technical-evidence disclaimer already covered by existing code.
## Desktop build stuck review (2026-09-18)

### Round 1 — root-cause and contract review
- Finding: `desktop-release.yml` invoked the Linux-only atomic wrapper on all matrix OSes; fixed by switching the CI artifact build to the portable Vite/widget command.
- Finding: queued/running UI state had no upper bound; fixed with the existing 30-minute stale phase and focused regression coverage.
- Verification: GitHub run `35360618065`/job `105650721669`, local portable build, workflow contract test, DesktopReleasePanel tests.
- Status: clean after repair; the separate authenticated runner API 502 is not the Desktop Release status path.

### Round 2 — second-order impact review
- Checked Windows, macOS, and Linux workflow matrix compatibility: the selected web build no longer requires `flock`, `df`, or Linux atomic symlink swapping.
- Checked DesktopReleasePanel status transitions, stale copy, English/Thai locale JSON, and test timestamps: no new in-scope material finding.
- Verification rerun: 2 focused test files, 10 tests passed; portable frontend/widget build passed; `git diff --check` passed.
- Status: clean convergence round 2/2. Production authenticated runner API 502 remains an external migration/log gate, not inferred as fixed locally.
