# Review Findings

This file records the ten required production-readiness review rounds for the current local Beta audit.

## Audit target

- Feature: Vertical Drama Enhanced video-prompt authoring (Feature 173)
- Runtime target: local Debian Linux Beta; cloud/Docker packaging is future work
- Preservation rule: existing Legacy prompt generation, projection, render selection,
  callbacks, and credit behavior remain unchanged
- Discovery note: SocratiCode was not exposed in this session; bounded `rg`, file
  reads, focused tests, and local runtime commands were used as the fallback

## Ten review rounds

| Round | Boundary reviewed | Result | Evidence / disposition |
|---:|---|---|---|
| 1 | Spec coverage and Legacy isolation | PASS | Spec confirms separate image/authoring/video model roles, no silent fallback, and Legacy preservation. Enhanced changes remain additive and flag-gated. |
| 2 | Debian local runtime and installation | PASS | Debian 13, Node 22.22.3, npm 10.9.8, Python 3.13.5, uv 0.9.28; isolated `uv sync --frozen --no-dev` is present and usable. No Enhanced setting is read from `.env`. |
| 3 | Skill manifest, schema, bridge, and output integrity | CLOSED + PASS | Fixed the bridge stage-input ordering bug that read `result` before assignment. Bridge now validates bounded output, SDK/adapter/skill versions, and terminal prompt hash. Health and v11 regression checks pass. |
| 4 | Backend API, auth, and tenant scope | PASS | Enhanced procedures require tenant context, load owner-scoped episode data, resolve provider credentials server-side, and keep Agent input plan-only. No browser-controlled tenant/provider/credit authority is accepted. |
| 5 | Model capability and provider routing | PASS | Image model, authoring model, and exact video target model remain separate. Enhanced pins the server-resolved target capability/provider profile and disallows cross-provider fallback. |
| 6 | Persistence, CAS, stale state, and Legacy compatibility | CLOSED + PASS | Added expected-revision CAS for Enhanced edit/finalize/apply paths and passed current model/media fingerprints to apply validation. Legacy projection remains the existing clip prompt when Enhanced UI is disabled. |
| 7 | Jobs, idempotency, concurrency, and retry behavior | CLOSED + PASS | Fixed the active-job key so Legacy and Enhanced cannot overlap for the same shot; retained compatibility with pre-fix variant-scoped keys. Job retry/recovery tests pass. |
| 8 | Frontend flags, UI states, and accessibility | CLOSED + PASS | Enhanced controls/polling are disabled when the UI flag is off; an already-active Enhanced projection remains readable with a non-interactive provenance status. Existing storyboard/reference-frame tests pass under jsdom. |
| 9 | Security, secrets, subprocess, and tool boundary | CLOSED + PASS | Fixed Agents SDK tool allow-list propagation; Enhanced defaults to no research/cost tool and only admits authorized asset/provider evidence. Child process receives provider secret through runtime env, not prompt/JSON output. |
| 10 | Observability, release gate, and final convergence | PASS WITH RELEASE GATES | Package validator, bridge health, Python compile/runtime checks, 54 focused web tests, and `git diff --check` pass. Live provider, authenticated browser, Redis/DB settlement, deployment, and full-worktree typecheck remain unverified external/baseline gates. |

## Gap disposition

### Closed in this audit

- Bridge runtime no longer fails on the pre-result `audioDirection` reference.
- Agent SDK tool flags are enforced by the actual tool list.
- Enhanced output is fail-closed when provenance/hash/version fields are invalid.
- Cross-variant shot job overlap is rejected.
- Enhanced UI kill-switch no longer hides the active prompt or accidentally exposes
  editing/apply controls.
- Enhanced mutation paths use revision and current model/media CAS checks.

### Required before paid Production certification

- Run a real authenticated browser matrix with all combinations of platform runtime,
  tenant UI/jobs/apply flags, Legacy/Enhanced active variants, and stale conflict UI.
- Run a controlled live provider call with a test tenant and verify token settlement,
  refund/retry behavior, Redis availability, and durable DB persistence.
- Replace the current check-then-deduct Enhanced billing path with the existing
  reservation/settlement ledger pattern, including queued-timeout and worker-failure
  refunds. This is deliberately not patched blindly because it crosses shared credit
  accounting and requires integration proof.
- Resolve the existing full-worktree typecheck failures and run the production build
  in a clean branch/worktree; the current workspace contains unrelated dirty changes.

### Safely deferred

- Docker/Cloud deployment packaging and cloud runtime proof; they are not the current
  Local Debian Beta gate.
- Optional bounded research mode until an admitted research implementation and source
  provenance contract are enabled.
- A database uniqueness migration for concurrent system-setting writes, unless the
  admin settings table is promoted to multi-admin production use.

## Final verdict

Local Debian Beta readiness is materially improved and the Enhanced path is safe to
exercise only when its UI, tenant, job, and runtime gates are explicitly enabled. The
Legacy path is preserved. The feature is not certified as paid cloud/Production-ready
until the required live browser/provider/billing/clean-build gates above are completed.

## Follow-up five-round audit (2026-09-02)

| Round | Boundary reviewed | Result | Evidence / disposition |
|---:|---|---|---|
| 1 | Feature spec, capability schema, static catalog, seed, migration | PASS | Grok profile is consistent: `reference-to-video`, unified `image_urls`, Start Frame consumes one slot, max seven images. |
| 2 | Local Debian runtime, DB row, service health | PASS | Local DB row matches the profile and `smartspec-web.service` is active with `/healthz` OK. |
| 3 | Enhanced/Legacy UX and readiness diagnostics | CLOSED + PASS | Replaced the generic visible `Enhanced unavailable` status with actionable localized blocker labels. Legacy callback/render path was not changed. |
| 4 | Focused application regression | PASS | 8 files / 69 tests passed with jsdom, including capability, transport ordering, Enhanced readiness, Legacy/Enhanced UI, reference and stop-frame tests. |
| 5 | Skill, formatting, startup, and workspace gates | PASS WITH BASELINE GATES | v11 (10), Grok (22), Python syntax, new-test formatting, diff check, restart and healthz passed. `audit-skills.sh` reports pre-existing runtime artifacts; full typecheck reports existing unrelated workspace errors. |

### Additional startup gap closed

The post-fix restart exposed a real local startup failure: `verticalDramaObjectReferences.ts`
imported `buildObjectReferencePrompt` from `drizzle/schema`, although the function is
exported by the shared object-reference contract. The import was corrected. A subsequent
restart completed successfully and the health endpoint passed. This was required to keep
the local Beta service usable; no Legacy prompt behavior was modified.

### Post-fix convergence

Two consecutive clean verification rounds completed after the repairs. The remaining
journal lines from the failed pre-fix restart are historical; the current service is
active and no new startup failure is present after the corrected restart.

## Episode 256 readiness diagnosis (2026-09-02)

- Confirmed blocker: persisted storyboard uses `shot_number`; Enhanced readiness
  previously searched only `shotNumber`, making every shot appear to have missing
  required storyboard data.
- Not the blocker: Episode 256 has an approved Start Frame plan and ready image
  assets, Legacy motion prompts exist, all three tenant Enhanced flags are true,
  and infrastructure settings contain enabled runtime, selected authoring model,
  approved SDK, adapter, and manifest values.
- Closed: `normalizeEnhancedStoryboardShot` now accepts both persisted shapes and
  maps the provider-shaped fields needed by Enhanced canonical context.
- Verification: 3 files / 20 tests passed, `git diff --check` passed, local Node
  service restarted successfully, and healthz passed.
